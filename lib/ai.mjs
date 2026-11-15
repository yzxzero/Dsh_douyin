const RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 503「服务太忙」这类错误重试一下通常就过去了，别一失败就把整段故事降级成兜底稿 */
function isRetryable(status, message = '') {
  if (RETRY_STATUS.has(status)) return true;
  return /too busy|overload|temporarily|rate limit|timeout|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(message);
}

function retryAfterMs(headers) {
  const raw = headers?.get?.('retry-after');
  if (!raw) return 0;
  const sec = Number(raw);
  if (Number.isFinite(sec) && sec > 0) return Math.min(15000, sec * 1000);
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.min(15000, Math.max(0, at - Date.now()));
  return 0;
}

async function once({ baseUrl, apiKey, model, messages, temperature, maxTokens, timeoutMs, thinking }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
        /* deepseek-flash 是推理模型（DeepSeek-V4.1-Flash，默认 effort=high）：
         * 它会先把思维链写进 reasoning_content，而且思维链也吃 max_tokens。
         * 直播这种一两句话的短调用把预算给到 80~260，思维链一吃满 content 就是空的。
         * 所以默认关掉思考，只留最终回答。 */
        ...(thinking === 'disabled' ? { thinking: { type: 'disabled' } } : {}),
      }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {}
    if (!res.ok) {
      const msg = data?.error?.message || raw.slice(0, 300) || `HTTP ${res.status}`;
      const err = new Error(`DeepSeek ${res.status}: ${msg}`);
      err.status = res.status;
      err.retryAfter = retryAfterMs(res.headers);
      throw err;
    }
    const ch = data?.choices?.[0];
    const text = (ch?.message?.content || '').trim();
    if (!text) {
      const reasoning = Number(data?.usage?.completion_tokens_details?.reasoning_tokens || 0);
      const finish = ch?.finish_reason || '';
      const why = finish === 'length'
        ? `思维链把 max_tokens=${maxTokens} 吃光了（思考用了 ${reasoning} tokens，finish_reason=length）`
        : ch
          ? `finish_reason=${finish || '空'}`
          : '响应里没有 choices';
      const err = new Error(`DeepSeek 返回了空内容：${why}`);
      err.status = 0;
      err.empty = true;
      err.finishReason = finish;
      err.reasoningTokens = reasoning;
      throw err;
    }
    return { text, usage: data.usage || null, model: data.model || model };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 一次对话。遇到 429/5xx / 超时 会退避重试（默认 3 次机动），
 * 仍然失败才抛出——调用方可以再换备用模型或备用接口。
 *
 * thinking: 'disabled'（默认，关掉思维链，短回复够用且不烧预算）| 'auto'（让模型自己想）
 */
export async function chatCompletion({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 1.1,
  maxTokens = 220,
  timeoutMs = 30000,
  retries = 3,
  retryBaseMs = 1200,
  thinking = 'disabled',
}) {
  if (!apiKey) throw new Error('还没填 DeepSeek API Key（config.json → ai.apiKey，或在 /admin 里保存）');
  let lastErr = null;
  /* 空内容不是「服务忙」，退避重试没意义：先关思考，再把预算翻倍，都不行才认输 */
  let noThink = thinking === 'disabled';
  let budget = maxTokens;
  let triedMoreBudget = false;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await once({
        baseUrl,
        apiKey,
        model,
        messages,
        temperature,
        maxTokens: budget,
        timeoutMs,
        thinking: noThink ? 'disabled' : undefined,
      });
    } catch (err) {
      lastErr = err;
      if (err.empty) {
        if (!noThink) {
          noThink = true;
          console.warn(`[ai] ${model} 返回空内容（思维链吃满预算），关掉思考再试一次`);
          continue;
        }
        if (!triedMoreBudget && err.finishReason === 'length') {
          triedMoreBudget = true;
          budget = Math.min(2048, Math.max(budget * 2, 300));
          console.warn(`[ai] ${model} 空内容（finish_reason=length），max_tokens 提到 ${budget} 再试一次`);
          continue;
        }
        break;
      }
      const retryable =
        err.name === 'AbortError' ? true : isRetryable(err.status || 0, `${err.name} ${err.message}`);
      if (attempt >= retries || !retryable) break;
      const wait = Math.min(
        12000,
        err.retryAfter || retryBaseMs * 2 ** attempt + Math.floor(Math.random() * 400),
      );
      console.warn(
        `[ai] ${model} ${err.status || ''} ${String(err.message).slice(0, 80)} —— ${wait}ms 后重试（${attempt + 1}/${retries}）`,
      );
      await sleep(wait);
    }
  }
  if (lastErr && retries > 0 && isRetryable(lastErr.status || 0, String(lastErr.message))) {
    lastErr.message = `${lastErr.message}（已重试 ${retries} 次）`;
  }
  throw lastErr || new Error('DeepSeek 调用失败');
}

export async function fetchBalance({ baseUrl, apiKey, timeoutMs = 15000 }) {
  if (!apiKey) throw new Error('没有 API Key，查不了余额');
  const url = `${baseUrl.replace(/\/+$/, '')}/user/balance`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {}
    if (!res.ok) throw new Error(`余额接口 ${res.status}: ${data?.error?.message || raw.slice(0, 200)}`);
    const cny = (data?.balance_infos || []).find((b) => b.currency === 'CNY') || data?.balance_infos?.[0] || null;
    return {
      available: Boolean(data?.is_available),
      currency: cny?.currency || 'CNY',
      total: Number(cny?.total_balance ?? 0),
      granted: Number(cny?.granted_balance ?? 0),
      toppedUp: Number(cny?.topped_up_balance ?? 0),
      at: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}
