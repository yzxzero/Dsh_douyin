// Cross-origin requests belong in the extension worker, not the Douyin page.
const ROUTES = {
  health: ['/api/health', 'GET'],
  event: ['/api/event', 'POST'],
  outbox: ['/api/outbox', 'GET'],
  ack: ['/api/outbox/ack', 'POST'],
};

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'dafeiyu-request') return;
  (async () => {
    if (sender.id !== chrome.runtime.id) throw new Error('未知扩展来源');
    const route = ROUTES[message.action];
    if (!route) throw new Error('不支持的请求');
    const config = await chrome.storage.local.get({ server: 'http://127.0.0.1:8787', enabled: true });
    if (!config.enabled && message.action !== 'health') throw new Error('弹幕桥已停用');
    const base = new URL(config.server);
    if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.username || base.password) {
      throw new Error('服务地址请填写 http://127.0.0.1:8787');
    }
    const response = await fetch(new URL(route[0], base.origin), {
      method: route[1],
      ...(route[1] === 'POST' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(message.body || {}) } : {}),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(`本地服务返回 HTTP ${response.status}`);
    const data = await response.json();
    if (data.ok === false) throw new Error(data.error || '本地服务处理失败');
    if (message.action === 'health' && data.app !== 'dafeiyu-live') throw new Error('该地址不是大肥鱼服务');
    return data;
  })().then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message }));
  return true;
});
