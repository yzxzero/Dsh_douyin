/**
 * 话题账本：记住「我说过什么」。
 *
 * 直播最怕的不是冷场，是复读：同一个梗、同一句安慰、同一个问题，隔几分钟又冒出来一遍。
 * 这里用纯本地的字符二元组相似度做判重（不烧 token、不等人），
 * 再按「话题类别」统计冷却时间，让智能体自己知道「这一类刚说过，换一个」。
 */

const PUNCT = /[\s\u3000，。！？、,.!?~～:：;；"'“”‘’`()（）[\]【】{}…—\-_|/\\*#@]+/g;

export function normalize(text) {
  return String(text ?? '').replace(PUNCT, '').toLowerCase();
}

function bigrams(text) {
  const s = normalize(text);
  if (!s) return [];
  if (s.length === 1) return [s];
  const out = new Set();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return [...out];
}

/** Dice 系数：0 = 完全不同，1 = 一模一样。短句判重比编辑距离稳。 */
export function similarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const A = bigrams(left);
  const B = bigrams(right);
  if (!A.length || !B.length) return 0;
  const set = new Set(B);
  let hit = 0;
  for (const g of A) if (set.has(g)) hit += 1;
  return (2 * hit) / (A.length + B.length);
}

/* 顺序即优先级：先认「在干什么」，再认「聊什么」 */
const GENRE_RULES = [
  ['greet', /欢迎|来啦|进来|坐下|新人|第一次来|好久不见/],
  ['gift', /礼物|送来|小心意|打赏|谢谢.*(?:灯牌|花|心)/],
  ['comfort', /别急|没关系|下次|慢慢来|可惜|输了|没搭好|不怪|安慰|已经很棒/],
  ['praise', /厉害|好棒|漂亮|精彩|绝了|牛啊|真强|帅/],
  ['game', /搭|建造|方块|城建|开局|战术|村子|精灵|兽人|公交|线路|经营|这局|操作|关卡|进度/],
  ['music', /歌|旋律|前奏|伴奏|单曲|点歌|听一首|耳机/],
  ['food', /吃|饭|宵夜|奶茶|火锅|甜|厨|面|汤|零食|水果/],
  ['anime', /动漫|番|漫画|角色|剧情|电影|剧|小说|片头|结局|主角/],
  ['question', /[?？]|吗|呢|大家|你们|想不想|要不要|哪个|猜/],
];

export const GENRE_LABEL = {
  greet: '打招呼',
  gift: '道谢',
  comfort: '安慰',
  praise: '夸夸',
  game: '游戏',
  music: '音乐',
  food: '吃的',
  anime: '影视番剧',
  question: '互动提问',
  recap: '回顾归纳',
  daily: '日常',
};

export function classify(text) {
  const s = String(text ?? '');
  if (!s) return 'daily';
  for (const [genre, re] of GENRE_RULES) if (re.test(s)) return genre;
  return 'daily';
}

const MAX_ENTRIES = 240;

export class TopicLedger {
  constructor(saved = {}) {
    const entries = Array.isArray(saved?.entries) ? saved.entries : [];
    this.entries = entries
      .filter((e) => e && typeof e.text === 'string' && Number.isFinite(Number(e.at)))
      .slice(-MAX_ENTRIES)
      .map((e) => ({
        at: Number(e.at),
        kind: e.kind === 'ai' ? 'ai' : 'viewer',
        genre: GENRE_LABEL[e.genre] ? e.genre : classify(e.text),
        text: String(e.text).slice(0, 160),
      }));
  }

  get size() {
    return this.entries.length;
  }

  add({ text, at = Date.now(), kind = 'ai', genre }) {
    const body = String(text ?? '').trim();
    if (!body) return null;
    const entry = {
      at: Number(at) || Date.now(),
      kind: kind === 'ai' ? 'ai' : 'viewer',
      genre: GENRE_LABEL[genre] ? genre : classify(body),
      text: body.slice(0, 160),
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    return entry;
  }

  spoken(now = Date.now(), windowMs = 45 * 60_000) {
    return this.entries.filter((e) => e.kind === 'ai' && e.at <= now && now - e.at <= windowMs);
  }

  /** 命中就返回那句旧的（用来判断「这话说过了」） */
  isRepeat(text, { now = Date.now(), windowMs = 45 * 60_000, threshold = 0.72 } = {}) {
    const body = String(text ?? '').trim();
    if (!body) return null;
    for (const e of this.spoken(now, windowMs)) {
      if (e.text === body) return e;
      if (similarity(e.text, body) >= threshold) return e;
    }
    return null;
  }

  /** 某个话题类别最近一次说的时间；0 = 没说过 */
  lastAt(genre, now = Date.now()) {
    let at = 0;
    for (const e of this.entries) {
      if (e.kind === 'ai' && e.genre === genre && e.at <= now && e.at > at) at = e.at;
    }
    return at;
  }

  /** 归纳：近 N 分钟说过哪几类、各几次、多久以前 —— 塞进提示词，让模型自己避开 */
  digest(now = Date.now(), windowMs = 30 * 60_000) {
    const recent = this.spoken(now, windowMs);
    if (!recent.length) return { text: '', genres: [], lines: [], talked: [] };
    const map = new Map();
    for (const e of recent) {
      const cur = map.get(e.genre) || { genre: e.genre, n: 0, last: 0 };
      cur.n += 1;
      cur.last = Math.max(cur.last, e.at);
      map.set(e.genre, cur);
    }
    const genres = [...map.values()].sort((a, b) => b.last - a.last);
    const label = (g) => GENRE_LABEL[g] || g;
    const mins = (ms) => Math.max(0, Math.round((now - ms) / 60000));
    const text = `近 ${Math.round(windowMs / 60000)} 分钟你已经说过：` +
      genres.map((g) => `${label(g.genre)}×${g.n}（最近 ${mins(g.last)} 分钟前）`).join('、');
    return {
      text,
      genres,
      talked: genres.map((g) => g.genre),
      lines: recent.slice(-6).map((e) => e.text.slice(0, 40)),
    };
  }

  toJSON() {
    return { entries: this.entries.slice(-MAX_ENTRIES) };
  }
}

/** 观众问过的问题：同一件事再问，就别再背一遍答案了。 */
export class QuestionMemo {
  constructor(saved = {}, limit = 80) {
    this.limit = limit;
    const items = Array.isArray(saved?.items) ? saved.items : [];
    this.items = items
      .filter((it) => it && typeof it.key === 'string' && Number.isFinite(Number(it.at)))
      .slice(-limit);
  }

  seen(text, { now = Date.now(), windowMs = 20 * 60_000, threshold = 0.8 } = {}) {
    const key = normalize(text);
    if (!key) return null;
    for (const it of this.items) {
      if (it.at > now || now - it.at > windowMs) continue;
      if (it.key === key || similarity(it.key, key) >= threshold) return it;
    }
    return null;
  }

  remember(text, answer, who = '', now = Date.now()) {
    const key = normalize(text);
    if (!key) return null;
    const item = {
      key,
      text: String(text).slice(0, 120),
      answer: String(answer ?? '').slice(0, 140),
      who: String(who ?? '').slice(0, 24),
      at: Number(now) || Date.now(),
    };
    this.items = this.items.filter((it) => it.key !== key);
    this.items.push(item);
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit);
    return item;
  }

  toJSON() {
    return { items: this.items.slice(-this.limit) };
  }
}
