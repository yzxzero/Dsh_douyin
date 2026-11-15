import { mountLuanti } from './luanti-view.js?v=atlantis-1';
/* 大肥鱼 · 写故事直播间 前端 */
import { createPetLipSync } from './pet-lip-sync.js?v=keyboard-reading-2';
import { mount2048 } from './game-2048.js';

const SERVER = location.origin;
const bubble = document.getElementById('bubble');
const feed = document.getElementById('feed');
const pet = document.getElementById('pet');
const fallback = document.getElementById('softFallback');
const toast = document.getElementById('toast');

const el = {
  scene: document.getElementById('scene'),
  bglayer: document.getElementById('bglayer'),
  spent: document.getElementById('spentVal'),
  tokenToday: document.getElementById('tokenToday'),
  tokenLife: document.getElementById('tokenLife'),
  peakTag: document.getElementById('peakTag'),
  balVal: document.getElementById('balVal'),
  income: document.getElementById('incomeVal'),
  giftCount: document.getElementById('giftCount'),
  giftList: document.getElementById('giftList'),
  giftFoot: document.getElementById('giftFoot'),
  queueN: document.getElementById('queueN'),
  now: document.getElementById('nowPlaying'),
  nowText: document.getElementById('nowText'),
  srcTag: document.getElementById('srcTag'),
  playBtn: document.getElementById('playBtn'),
  player: document.getElementById('player'),
  voicePlayer: document.getElementById('voicePlayer'),
  storyAudio: document.getElementById('storyAudio'),
  voiceHint: document.getElementById('voiceHint'),
  musicBar: document.getElementById('musicBar'),
  queueList: document.getElementById('queueList'),
  title: document.getElementById('storyTitle'),
  chapter: document.getElementById('storyChapter'),
  beat: document.getElementById('storyBeat'),
  storyStart: document.getElementById('storyStart'),
  storyStartSep: document.getElementById('storyStartSep'),
  bar: document.getElementById('storyBar'),
  liveText: document.getElementById('liveText'),
  danmakuN: document.getElementById('danmakuN'),
  phaseChip: document.getElementById('phaseChip'),
  clock: document.getElementById('clock'),
  summaryText: document.getElementById('summaryText'),
  summaryChapter: document.getElementById('summaryChapter'),
  summaryCard: document.getElementById('summaryCard'),
  clueGrid: document.getElementById('clueGrid'),
  cluePeople: document.getElementById('cluePeople'),
  clueClues: document.getElementById('clueClues'),
  cluePuzzles: document.getElementById('cluePuzzles'),
  giftThanks: document.getElementById('giftThanks'),
  thanksText: document.getElementById('thanksText'),
  toc: document.getElementById('toc'),
  tocN: document.getElementById('tocN'),
  tocWrap: document.getElementById('tocWrap'),
  tocTopics: document.getElementById('tocTopics'),
  topicList: document.getElementById('topicList'),
  feed: document.getElementById('feed'),
  broadcastMode: document.getElementById('broadcastMode'),
  broadcastModeTitle: document.getElementById('broadcastModeTitle'),
  broadcastModeText: document.getElementById('broadcastModeText'),
  fitnessMode: document.getElementById('fitnessMode'),
};

const state = {
  closed: false,
  story: null,
  stats: null,
  song: null,
  musicVolume: 0.2,
  voiceVolume: 0.8,
  voiceEnabled: true,
  voiceDuck: 1,
  voicePlaying: null,
  audioUnlocked: false,
  events: [],
  typing: null,
  lastStorySeq: -1,
  lastStoryContentKey: '',
  storyDisplayMode: 'story',
  storyProgressRatio: 0,
  clockBase: null,
  broadcast: null,
};

const watchVoice = createPetLipSync(pet, { cover: true, keyboard: true });
watchVoice(el.voicePlayer);
watchVoice(el.storyAudio);
const showLuanti = mountLuanti(document.getElementById('luantiStage'));
const showGame = mount2048(document.getElementById('gameStage'));
const storyStage = document.getElementById('storyStage');

/* ---------- 画面自适应：铺满浏览器，不做等比缩放 ---------- */
function fit() {
  el.scene.style.removeProperty('--scale');
  el.scene.style.left = '0px';
  el.scene.style.top = '0px';
}
window.addEventListener('resize', fit);
fit();

if (new URLSearchParams(location.search).get('bare') === '1') {
  document.body.classList.add('bare');
}

/* ---------- 数字 ---------- */
const money = (n) => Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('zh-CN');

/* ---------- 宠物 ---------- */
const MOODS = {
  idle: 'assets/pet/idle.webm',
  talk: 'assets/pet/type.webm',
  keyboard: 'assets/pet/keyboard.webm',
  greet: 'assets/pet/wave.webm',
  rice: 'assets/pet/rice.webm',
  fun: 'assets/pet/bubble.webm',
  code: 'assets/pet/code.webm',
  happy: 'assets/pet/happy.webm',
  shy: 'assets/pet/shy.webm',
  angry: 'assets/pet/angry.webm',
  laugh: 'assets/pet/laugh.webm',
  think: 'assets/pet/think.webm',
  busy: 'assets/pet/busy.webm',
  cheer: 'assets/pet/cheer.webm',
  pace: 'assets/pet/pace.webm',
  sigh: 'assets/pet/sigh.webm',
  stretch: 'assets/pet/stretch.webm',
  doze: 'assets/pet/doze.webm',
  surprise: 'assets/pet/surprise.webm',
  dance: 'assets/pet/dance.webm',
  sing: 'assets/pet/sing.webm',
  tail: 'assets/pet/tail.webm',
  spin: 'assets/pet/spin.webm',
  unwrap: 'assets/pet/unwrap.webm',
  cat: 'assets/pet/cat.webm',
  tea: 'assets/pet/tea.webm',
};

/* 各阶段各自的「常态动作」 */
const PHASE_MOOD = {
  idle: 'idle',
  preparing: 'busy',
  reading: 'keyboard',
  break: 'sing',
  afterword: 'think',
  done: 'idle',
};

const IDLE_POOL = ['sing', 'stretch', 'cat', 'tea', 'spin', 'tail', 'pace', 'laugh', 'dance', 'shy', 'doze', 'surprise'];
const GIFT_POOL = ['happy', 'cheer', 'unwrap', 'dance', 'spin'];
const GIFT_ACTIONS = [
  { gifts: ['小心心', '棒棒糖'], mood: 'happy', label: '开心跳' },
  { gifts: ['玫瑰', '鲜花'], mood: 'shy', label: '害羞' },
  { gifts: ['大啤酒', '独角兽'], mood: 'dance', label: '跳舞' },
  { gifts: ['比心'], mood: 'cheer', label: '雀跃' },
  { gifts: ['跑车', '火箭'], mood: 'spin', label: '转圈' },
  { gifts: ['嘉年华', '抖音1号'], mood: 'unwrap', label: '拆礼物' },
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const giftActions = document.getElementById('giftActions');

function renderGiftActions(catalog = []) {
  const icons = new Map(catalog.map(({ name, emoji }) => [name, emoji]));
  const rows = GIFT_ACTIONS.map(({ gifts, label }) => {
    const row = document.createElement('li');
    const names = document.createElement('span');
    for (const [index, name] of gifts.entries()) {
      if (index) names.append(' / ');
      const emoji = icons.get(name);
      if (emoji) {
        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = emoji;
        names.append(icon, '\u00a0');
      }
      names.append(name);
    }
    const action = document.createElement('strong');
    action.textContent = label;
    row.append(names, ' ', action);
    return row;
  });
  giftActions.replaceChildren(...rows);
}

renderGiftActions();

let moodTimer = null;
let currentMood = 'idle';
let giftMoodUntil = 0;

function phaseMood(phase) {
  return PHASE_MOOD[phase] || 'idle';
}

function setMood(name, holdMs = 0, { gift = false } = {}) {
  // 朗读期间只有礼物动作可以临时打断敲键盘，弹幕/文本打字结束不改变它。
  if (!gift && state.story?.phase === 'reading') name = 'keyboard';
  const src = MOODS[name];
  if (!src || (!gift && Date.now() < giftMoodUntil)) return;
  clearTimeout(moodTimer);
  giftMoodUntil = gift ? Date.now() + holdMs : 0;
  pet.dataset.giftAction = gift ? '1' : '0';
  if (name !== currentMood) {
    currentMood = name;
    // 同一动作不重置视频进度，朗读可以连续敲键盘。
    if (pet.getAttribute('src') !== src) {
      pet.src = src;
      const p = pet.play();
      if (p && p.catch) p.catch(() => {});
    }
  }
  if (holdMs) {
    /* 小动作演完，回到当前阶段的常态动作（不是一律回 idle） */
    moodTimer = setTimeout(() => {
      giftMoodUntil = 0;
      setMood(phaseMood(state.story?.phase || 'idle'));
    }, holdMs);
  }
}

/* 哪个动作文件坏了就退回待机动画；待机也放不出来，才收起来换成 🐋 */
pet.addEventListener('error', () => {
  const idleSrc = MOODS.idle;
  if (pet.dataset.fellBack !== '1' && pet.getAttribute('src') !== idleSrc) {
    pet.dataset.fellBack = '1';
    currentMood = 'idle';
    pet.src = idleSrc;
    pet.play?.()?.catch?.(() => {});
    return;
  }
  pet.style.display = 'none';
  fallback.hidden = false;
});

/* 人物是 webm 视频：窗口被遮住 / 切到后台时，Chrome 会停掉视频解码，
 * OBS、直播伴侣那边就只剩一张空画面——表现为「怎么都不入画，切一下场景才出来」。
 * 这里做个自愈：页面重新可见就立刻续播，平时每 3 秒兜一次底。 */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pet.play?.()?.catch?.(() => {});
});
setInterval(() => {
  if (document.visibilityState === 'hidden') return;
  if (pet.style.display === 'none' || !pet.currentSrc) return;
  if (pet.paused || pet.readyState < 2) pet.play?.()?.catch?.(() => {});
}, 3000);

/* 恢复原来的空闲小动作，朗读期间持续敲键盘。 */
setInterval(() => {
  if (state.story?.phase === 'reading' || state.typing || !state.audioUnlocked) return;
  const quiet = phaseMood(state.story?.phase || 'idle');
  if (currentMood !== quiet && currentMood !== 'idle') return;
  if (Math.random() < 0.7) setMood(pick(IDLE_POOL), 4200 + Math.random() * 2400);
}, 18000);
for (const audio of [el.voicePlayer, el.storyAudio]) {
  audio.addEventListener('playing', () => setMood(phaseMood(state.story?.phase || 'idle')));
}

/* ---------- 礼物提示 ---------- */
let toastTimer = null;
function showToast(gift, username) {
  toast.innerHTML = '';
  const emoji = document.createElement('span');
  emoji.className = 'emoji';
  emoji.textContent = gift.emoji || '🎁';
  const text = document.createElement('span');
  text.textContent = username
    ? `谢谢 ${username} 的 ${gift.name} ×${gift.count}`
    : `谢谢 ${gift.name} ×${gift.count}`;
  toast.append(emoji, text);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

/* ---------- 弹幕 ---------- */
const replyAudioQueue = [];
const GIFT_ACTION_MS = 10_100; // 礼物动作视频各约 10 秒，播完一轮再接下一句。
let replyAudioBusy = false;

function reportGameSummaryEnded(item, played) {
  fetch('/api/luanti/summary-ended', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: item.id, played }),
  }).catch(() => {});
}

function finishGiftAction(item) {
  if (!item.giftAction) return Promise.resolve();
  const action = GIFT_ACTIONS.find(({ gifts }) => gifts.includes(item.giftAction));
  setMood(action?.mood ?? pick(GIFT_POOL), GIFT_ACTION_MS, { gift: true });
  return new Promise((resolve) => setTimeout(resolve, GIFT_ACTION_MS));
}

/* 所有回复共用一个 FIFO：新句只排队，绝不 pause 正在播的上一句。 */
function playReplyAudio(item) {
  if (state.closed) return;
  replyAudioQueue.push(item);
  pumpReplyAudio();
}

function pumpReplyAudio() {
  if (replyAudioBusy || !replyAudioQueue.length || state.closed) return;
  replyAudioBusy = true;
  const item = replyAudioQueue.shift();
  playReplyAudioNow(item)
    .catch((err) => console.warn('[voice] 回复播放失败：', err.message))
    .finally(() => {
      replyAudioBusy = false;
      pumpReplyAudio();
    });
}

async function playReplyAudioNow(item) {
  const isGiftReply = item.source === 'gift-thanks';
  const isGameSummary = item.source === 'luanti-summary';
  if (isGameSummary && !state.voiceEnabled) {
    reportGameSummaryEnded(item, false);
    return;
  }
  const text = String(item.text || '').trim();
  if (!isGiftReply && (!text || !state.voiceEnabled || (storyPausedForReply && !item.voice))) return;
  if (isGiftReply && (!item.voice || !state.voiceEnabled)) {
    await finishGiftAction(item);
    return;
  }
  if (el.voiceHint) {
    el.voiceHint.hidden = false;
    const mark = item.interruptStory ? '🎤 插播' : '🔊';
    el.voiceHint.textContent = `${mark} ${text.length > 34 ? `${text.slice(0, 34)}…` : text}`;
    clearTimeout(playReplyAudio.timer);
    playReplyAudio.timer = setTimeout(() => {
      el.voiceHint.hidden = true;
    }, Math.max(5000, text.length * 260));
  }
  if (isGameSummary && !item.voice) {
    reportGameSummaryEnded(item, false);
    return;
  }
  if (item.voice) {
    const url = new URL(item.voice, location.origin).href;
    if ((item.interruptStory || isGiftReply) && state.story?.phase === 'reading' && !el.storyAudio.paused && !el.storyAudio.ended) {
      storyPausedForReply = true;
      storyPausedAt = Date.now();
      el.storyAudio.pause();
      reportStoryPaused(true);
    }
    speakToken += 1; /* 让已经失效的前端分段任务退出，不打断当前完整语音 */
    el.voicePlayer.src = url;
    el.voicePlayer.volume = Number(state.voiceVolume ?? 0.8);
    clearTimeout(replyAudioTimer);
    const played = await new Promise((resolve) => {
      let settled = false;
      const restore = (event) => {
        if (settled) return;
        settled = true;
        clearTimeout(replyAudioTimer);
        el.voicePlayer.onended = null;
        el.voicePlayer.onerror = null;
        resolve(event?.type === 'ended');
      };
      el.voicePlayer.onended = restore;
      el.voicePlayer.onerror = restore;
      if (item.voice) {
        replyAudioTimer = setTimeout(() => {
          el.voicePlayer.pause();
          restore();
        }, Math.max(30_000, text.length * 450));
      }
      el.voicePlayer.play().catch(restore);
    });
    if (isGiftReply) await finishGiftAction(item);
    restoreStoryDisplay();
    if (storyPausedForReply) {
      storyPausedForReply = false;
      storyPausedAt = 0;
      reportStoryPaused(false);
      if (state.story) syncStoryAudio(state.story, { resume: true });
    }
    if (isGameSummary) reportGameSummaryEnded(item, played);
    setMood(phaseMood(state.story?.phase || 'idle'));
    return;
  }
  await speak(text);
  if (isGiftReply) await finishGiftAction(item);
  setMood(phaseMood(state.story?.phase || 'idle'));
}

function addMessage(item, { animate = true } = {}) {
  /* 休息 / 作品讨论时的回复只出声音，不占弹幕框 */
  if (item.voiceOnly) {
    /* 刷新页面回放历史时不要重播旧语音，只播「刚发生的」 */
    if (animate) playReplyAudio(item);
    return;
  }
  const node = document.createElement('div');
  const empty = document.getElementById('danmakuEmpty');
  if (empty) empty.remove();
  node.className = `msg ${item.kind || 'chat'}`;
  if (!animate) node.style.animation = 'none';

  if (item.kind === 'gift' && item.gift) {
    const nick = document.createElement('span');
    nick.className = 'nick';
    nick.textContent = item.username;
    node.append(
      nick,
      document.createTextNode(`送出 ${item.gift.emoji || '🎁'} ${item.gift.name} ×${item.gift.count} `),
      Object.assign(document.createElement('span'), {
        className: 'amount',
        textContent: `¥${money(item.gift.price * item.gift.count)}`,
      }),
    );
  } else if (item.kind === 'enter') {
    node.textContent = `${item.username} 来了`;
  } else if (item.kind === 'follow') {
    node.textContent = `${item.username} 关注了主播`;
  } else if (item.kind === 'like') {
    node.textContent = `${item.username} 为主播点赞了`;
  } else if (item.kind === 'system') {
    node.textContent = item.text;
  } else {
    const nick = document.createElement('span');
    nick.className = `nick${item.kind === 'ai' ? ' ai' : ''}`;
    nick.textContent = item.kind === 'ai' ? '大肥鱼' : item.username;
    node.append(nick, document.createTextNode(item.text || ''));
    if (item.kind === 'ai') node.classList.add('ai');
  }

  feed.appendChild(node);
  while (feed.children.length > 50) feed.removeChild(feed.firstElementChild);
  scrollFeed();

  if (item.kind === 'gift' && item.gift) {
    renderThanks();
    if (animate) {
      showToast(item.gift, item.username);
      if (!item.giftReplyPending) playReplyAudio({ source: 'gift-thanks', giftAction: item.gift.name });
    }
  } else if (item.kind === 'enter' || item.kind === 'follow') {
    setMood('greet', 3400);
  } else if (animate && (item.interruptStory || item.voice || item.source === 'gift-thanks')) {
    /* 只要带语音就播：进房欢迎、功能提示、暖场这些不是「插播」，
     * 不会暂停正文（interruptStory 为假时 playReplyAudio 里不会按暂停）。 */
    playReplyAudio(item);
  } else if (item.kind === 'ai') {
    setMood(Math.random() < 0.5 ? 'laugh' : 'shy', 3600);
  } else if (item.kind === 'chat') {
    setMood('talk', 2600);
  }
  return node;
}

function scrollFeed() {
  feed.scrollTop = feed.scrollHeight;
  requestAnimationFrame(() => {
    feed.scrollTop = feed.scrollHeight;
  });
}

/* ---------- 故事打字机 ---------- */
/* 模型偶尔会把换行写成字面量 \n，显示和朗读都要先还原，否则屏幕上、语音里都是「反斜杠 n」 */
function cleanEscapes(raw) {
  return String(raw ?? '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\(?=[^\n])/g, '');
}

function typeStory(text, speed = 34, onDone) {
  text = cleanEscapes(text);
  if (state.typing) clearInterval(state.typing);
  bubble.classList.add('typing');
  bubble.textContent = '';
  if (!text) {
    bubble.classList.remove('typing');
    if (onDone) onDone();
    return;
  }
  setMood('talk');
  let i = 0;
  state.typing = setInterval(() => {
    i += 1;
    bubble.textContent = text.slice(0, i);
    bubble.scrollTop = bubble.scrollHeight;
    if (i >= text.length) {
      clearInterval(state.typing);
      state.typing = null;
      bubble.classList.remove('typing');
      setTimeout(() => {
        if (currentMood === 'talk') setMood(phaseMood(state.story?.phase || 'idle'));
      }, 1600);
      if (onDone) onDone();
    }
  }, speed);
}

/* ---------- 大肥鱼的声音 ---------- */
/* 一段 5 分钟的台词太长，整段合成要等很久；切成小段、边播边合成下一段，
   第一句 2 秒左右就能出声，后面靠预取把等待藏起来。 */
function splitSpeech(text, max = 78) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const parts = raw.match(/[^。！？!?…\n]+[。！？!?…]?/g) || [raw];
  const out = [];
  let buf = '';
  for (const p of parts) {
    if (buf && (buf + p).length > max) {
      out.push(buf.trim());
      buf = p;
    } else {
      buf += p;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

let speakToken = 0;

function synthChunk(text) {
  return fetch(`${SERVER}/api/voice/say`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
    .then((r) => r.json())
    .then((d) => (d.ok && d.url ? new URL(d.url, location.origin).href : null))
    .catch(() => null);
}

function playVoiceOnce(url, token) {
  return new Promise((resolve) => {
    if (token !== speakToken) return resolve();
    el.voicePlayer.pause();
    el.voicePlayer.src = url;
    el.voicePlayer.volume = Number(state.voiceVolume ?? 0.8);
    /* 音乐和讲述各走各的音轨，同时出声；想临时压低 BGM 就把 voice.duck 调到 0.3 */
    const duck = Number(state.voiceDuck ?? 1);
    if (duck < 1) el.player.volume = Number(state.musicVolume ?? 0.2) * duck;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      el.voicePlayer.onended = null;
      el.voicePlayer.onerror = null;
      resolve();
    };
    el.voicePlayer.onended = done;
    el.voicePlayer.onerror = done;
    el.voicePlayer.play().catch(() => done());
  });
}

async function speak(text) {
  if (state.closed || !state.voiceEnabled || !text) return;
  const chunks = splitSpeech(text);
  if (!chunks.length) return;
  const token = ++speakToken;
  state.voicePlaying = text;
  let next = synthChunk(chunks[0]);
  for (let i = 0; i < chunks.length; i++) {
    if (token !== speakToken) return;
    const url = await next;
    next = i + 1 < chunks.length ? synthChunk(chunks[i + 1]) : null;
    if (token !== speakToken) return;
    if (url) await playVoiceOnce(url, token);
  }
  if (token === speakToken) {
    state.voicePlaying = null;
    el.player.volume = Number(state.musicVolume ?? 0.2);
  }
}

/* ---------- 念小说 ---------- */
/* 一章就是一段音频：播完告诉服务端「这章念完了」，服务端开始 5 分钟休息。 */
let storyAudioSrc = '';
let storyAudioDone = '';
let storyPausedForReply = false;
let storyPausedAt = 0; /* 这次「为回复暂停」是从什么时候开始的（防卡死用） */
let replyAudioTimer;
const STORY_SCROLL_DELAY_SEC = 30;
const STORY_POS_KEY = 'dafeiyu.storyPos';

/* 记一下念到哪一毫秒：页面刷新 / 窗口重开（换音色、改启动参数）之后能接着念，
 * 不然每次刷新都会从这一章的开头重念。 */
function rememberStoryPos(a) {
  const story = state.story;
  if (!story || story.phase !== 'reading' || !storyAudioSrc) return;
  if (!Number.isFinite(a.currentTime) || a.currentTime < 3) return;
  try {
    localStorage.setItem(
      STORY_POS_KEY,
      JSON.stringify({ url: storyAudioSrc, seq: story.seq || 0, pos: a.currentTime, at: Date.now() }),
    );
  } catch {
    /* 存不下就算了 */
  }
}

function restoreStoryPos(a) {
  const story = state.story;
  if (!story) return;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORY_POS_KEY) || 'null');
  } catch {
    return;
  }
  if (!saved || saved.url !== storyAudioSrc) return;
  /* 换了场（从头再来 / 换了一本）就别跳回去 */
  if (Number(saved.seq || 0) !== Number(story.seq || 0)) return;
  if (Date.now() - Number(saved.at || 0) > 6 * 3600_000) return;
  const pos = Number(saved.pos) || 0;
  if (pos < 5) return;
  if (Number.isFinite(a.duration) && a.duration > 0 && pos > a.duration - 10) return;
  try {
    a.currentTime = pos;
  } catch {
    /* 有的格式不让 seek，那就从头放 */
  }
}

function storyInfoText(story, mode) {
  if (mode === 'characters') {
    return String(story.meta?.角色 || story.meta?.人物 || '暂时没有单独的角色资料。').trim();
  }
  const parts = [story.settings, story.meta?.设定, story.meta?.作品信息].filter((v) => String(v || '').trim());
  return parts.length ? parts.join('\n\n') : '暂时没有单独的设定资料。';
}

/* 角色/设定原文是 markdown：把 # 标题、**加粗** 变成看得下去的排版 */
function infoNode(text) {
  const box = document.createDocumentFragment();
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      const gap = document.createElement('div');
      gap.className = 'info-gap';
      box.appendChild(gap);
      continue;
    }
    const head = line.match(/^(#{1,6})\s*(.+)$/);
    if (head) {
      const h = document.createElement('div');
      h.className = `info-h lv${head[1].length}`;
      h.textContent = head[2].replace(/\*\*/g, '');
      box.appendChild(h);
      continue;
    }
    const p = document.createElement('div');
    p.className = 'info-p';
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**')) {
        const b = document.createElement('b');
        b.textContent = part.slice(2, -2);
        p.appendChild(b);
      } else {
        p.appendChild(document.createTextNode(part));
      }
    }
    box.appendChild(p);
  }
  return box;
}

/* 原文本是「全角缩进 + 每 30 来字硬换行」的排印稿，直接铺到页面上会一行没几个字、
   右边留一大片空白。这里把段内的硬换行和全角缩进压掉，只按空行分段。 */
function flowText(raw) {
  const paras = [];
  let buf = '';
  for (const line of String(raw ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const t = line.replace(/[\u3000\s]+/g, '');
    if (!t) {
      if (buf) paras.push(buf);
      buf = '';
      continue;
    }
    buf += t;
  }
  if (buf) paras.push(buf);
  return paras.join('\n\n');
}

function renderStoryContent(story) {
  if (!story || !bubble) return;
  const mode = state.storyDisplayMode || 'story';
  const idleNow = ['idle', 'done'].includes(story.phase);
  const chapterKey = `${story.file || ''}:${story.chapterIndex ?? 0}`;
  const key = idleNow ? `idle:${story.startAt || ''}` : mode === 'story' ? `story:${chapterKey}` : `${mode}:${chapterKey}`;
  if (state.lastStoryContentKey === key) return;
  state.lastStoryContentKey = key;
  if (!idleNow && mode !== 'story') {
    bubble.classList.add('story-info');
    bubble.replaceChildren(infoNode(storyInfoText(story, mode)));
    bubble.scrollTop = 0;
    return;
  }
  bubble.classList.remove('story-info');
  if (idleNow) {
    /* 还没开讲：纸面别空着，给观众一句能接话的 */
    const at = /^\d{1,2}:\d{2}$/.test(String(story.startAt || ''))
      ? `${story.startAt} 开讲`
      : '等我开口';
    bubble.textContent = `灯还亮着，书还没翻。${at}——这会儿先陪你们聊聊天，点歌、说话都行，我都听着呢。`;
    bubble.scrollTop = 0;
    return;
  }
  bubble.textContent = flowText(cleanEscapes(story.text || ''));
  const ratio = Math.max(0, Math.min(1, Number(state.storyProgressRatio) || 0));
  requestAnimationFrame(() => {
    const max = bubble.scrollHeight - bubble.clientHeight;
    if (max > 0) bubble.scrollTop = max * ratio;
  });
}

function setStoryDisplayMode(mode, { sync = true } = {}) {
  const next = ['story', 'characters', 'settings'].includes(mode) ? mode : 'story';
  state.storyDisplayMode = next;
  renderStoryContent(state.story);
  if (sync) {
    fetch(`${SERVER}/api/novel/display`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: next }),
    }).catch(() => {});
  }
}

function restoreStoryDisplay() {
  if (state.storyDisplayMode === 'story') return;
  setStoryDisplayMode('story');
}

/* 插播弹幕回复时正文会停一会儿，把这段暂停报给服务端：
 * 看门狗是按「这一章该念多久」判章节结束的，不报就会被几条插播骗过去，直接跳章。 */
function reportStoryPaused(paused) {
  if (paused && (!state.story || state.story.phase !== 'reading')) return;
  fetch(`${SERVER}/api/novel/pause`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paused }),
  }).catch(() => {});
}

/* 页面关掉时正文正停着，替服务端把暂停结掉，别让它一直等 */
window.addEventListener('pagehide', () => {
  if (!storyPausedForReply) return;
  try {
    navigator.sendBeacon(
      '/api/novel/pause',
      new Blob([JSON.stringify({ paused: false })], { type: 'application/json' }),
    );
  } catch {
    /* 老浏览器没有 sendBeacon 就算了，服务端 5 分钟后自己放开 */
  }
});

function storyAdvance() {
  const key = storyAudioSrc;
  if (!key || storyAudioDone === key) return;
  restoreStoryDisplay();
  storyAudioDone = key;
  try {
    localStorage.removeItem(STORY_POS_KEY); /* 这一章念完了，下次别再跳回来 */
  } catch {
    /* 无所谓 */
  }
  fetch(`${SERVER}/api/novel/advance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ at: Date.now() }),
  }).catch(() => {
    storyAudioDone = ''; /* 失败就放开，让看门狗兜底 */
  });
}

if (el.storyAudio) {
  el.storyAudio.addEventListener('ended', storyAdvance);
/* 页面读到真实时长后回填，服务端看门狗按真实时长兜底 */
el.storyAudio.addEventListener('loadedmetadata', () => {
  /* 刷新/重开窗口后接着上次念到的位置（同一章、同一场才跳） */
  restoreStoryPos(el.storyAudio);
  const d = Number(el.storyAudio.duration);
  if (!Number.isFinite(d) || d <= 0) return;
  if (el.storyAudio.currentSrc && el.storyAudio.currentSrc.includes('api/voice/')) {
    fetch('/api/novel/audio', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration: Math.round(d * 1000) }),
    }).catch(() => {});
  }
});
  el.storyAudio.addEventListener('error', () => {
    if (el.storyAudio.src) console.warn('[novel] 章节音频加载失败', el.storyAudio.error?.code);
  });
  /* 念到哪儿，纸面就滚到哪儿；开头先留 30 秒，让观众读完开场。 */
  el.storyAudio.addEventListener('timeupdate', () => {
    const story = state.story;
    if (!story || story.phase !== 'reading') return;
    const a = el.storyAudio;
    /* 每 5 秒记一次进度，刷新后能接着念 */
    if (!a.paused && Date.now() - (rememberStoryPos.at || 0) > 5000) {
      rememberStoryPos.at = Date.now();
      rememberStoryPos(a);
    }
    if (!a.duration || !bubble) return;
    state.storyProgressRatio = Math.max(0, Math.min(1, a.currentTime / a.duration));
    if (state.storyDisplayMode !== 'story' || a.currentTime < STORY_SCROLL_DELAY_SEC) return;
    const max = bubble.scrollHeight - bubble.clientHeight;
    if (max <= 0) return;
    const denominator = Math.max(1, a.duration - STORY_SCROLL_DELAY_SEC);
    const ratio = Math.max(0, Math.min(1, (a.currentTime - STORY_SCROLL_DELAY_SEC) / denominator));
    bubble.scrollTop = ratio * max;
  });
}

function syncStoryAudio(story, { resume = false } = {}) {
  if(state.closed)return;
  if (!el.storyAudio) return;
  const url = story.phase === 'reading' && story.audioUrl ? new URL(story.audioUrl, location.origin).href : '';
  if (!url) {
    if (!el.storyAudio.paused) el.storyAudio.pause();
    return;
  }
  /* 暂停等回复时，如果是同一段音频就别动它；但换章了必须换源，
   * 否则这一章的音频永远加载不上来，页面就一直哑着。 */
  if (storyPausedForReply && url === storyAudioSrc) return;
  if (url === storyAudioSrc) {
    /* 同一章：刷新、停下再开始、换音色之后，音频元素经常停在中间没在放。
     * 以前只有 currentTime===0 或显式 resume 才续播，于是正文就那么一直哑着
     * （听起来像「语音合成不出来」，其实文件早就在了）。只要服务端说在朗读、
     * 又不是「暂停等回复」，就把它续上。 */
    if (el.storyAudio.paused && !el.storyAudio.ended && !storyPausedForReply) {
      el.storyAudio.play().catch(() => {
        if (el.voiceHint) {
          el.voiceHint.hidden = false;
          el.voiceHint.textContent = '🔊 点一下，开始念这一章';
          el.voiceHint.onclick = () => {
            el.storyAudio.play().catch(() => {});
            el.voiceHint.hidden = true;
          };
        }
      });
    }
    return;
  }
  storyAudioSrc = url;
  storyAudioDone = '';
  el.storyAudio.src = url;
  el.storyAudio.volume = Number(state.voiceVolume ?? 0.8);
  if (storyPausedForReply) return; /* 先把音频备好，等回复播完再开声 */
  el.storyAudio.play().catch(() => {
    if (el.voiceHint) {
      el.voiceHint.hidden = false;
      el.voiceHint.textContent = '🔊 点一下，开始念这一章';
      el.voiceHint.onclick = () => {
        el.storyAudio.play().catch(() => {});
        el.voiceHint.hidden = true;
      };
    }
  });
}

/* 兜底：标记说「暂停等回复」，但回复早就不响了，说明这个状态卡住了
 * （比如回复音频被后面一句顶掉，ended 回调没轮上执行）——自己纠正回来，
 * 不然正文会一直哑着，看起来就像「没有语音」。 */
setInterval(() => {
  if (!storyPausedForReply) return;
  if (Date.now() - storyPausedAt < 8000) return; /* 刚暂停，给回复留点启动时间 */
  if (replyAudioBusy) return; // 回复有超时兜底；礼物动作尚未结束时也保持正文暂停。
  if (el.voicePlayer && !el.voicePlayer.paused && !el.voicePlayer.ended) return;
  storyPausedForReply = false;
  storyPausedAt = 0;
  reportStoryPaused(false);
  if (state.story) syncStoryAudio(state.story, { resume: true });
}, 4000);

function archiveNode(a) {
  const box = document.createElement('div');
  box.className = 'archive';
  const add = (title, lines) => {
    if (!lines || !lines.length) return;
    const h = document.createElement('div');
    h.className = 'archive-h';
    h.textContent = title;
    box.append(h);
    for (const t of lines) {
      const p = document.createElement('p');
      p.className = 'archive-p';
      p.textContent = t;
      box.append(p);
    }
  };
  if (a.world) add('世界观', [a.world]);
  if (a.characters?.length) {
    add(
      '人物',
      a.characters.map((c) => `${c.name}${c.role ? `（${c.role}）` : ''}${c.note ? `：${c.note}` : ''}`),
    );
  }
  add('主题', a.themes);
  add('写得好的地方', a.highlights);
  add('可以更好的地方', a.flaws);
  add('想问问你们', a.questions);
  return box;
}

function renderStory(story, { silent = false, mood = null } = {}) {
  if (!story || (state.broadcast && state.broadcast.mode !== 'story')) return;
  state.story = story;
  state.storyDisplayMode = ['story', 'characters', 'settings'].includes(story.displayMode) ? story.displayMode : 'story';
  el.title.textContent = story.title || '今晚念什么';
  const idleNow = ['idle', 'done'].includes(story.phase);
  const startAt = /^\d{1,2}:\d{2}$/.test(String(story.startAt || '')) ? story.startAt : '';
  el.phaseChip.textContent = idleNow
    ? startAt
      ? `${startAt} 开讲`
      : '还没开讲 · 自由聊天'
    : story.phaseLabel || '待开播';
  if (el.storyStart) {
    el.storyStart.textContent = startAt ? `每晚 ${startAt} 开讲` : '不定时开讲';
    el.storyStart.hidden = false;
    if (el.storyStartSep) el.storyStartSep.hidden = false;
  }
  el.chapter.textContent = idleNow
    ? '还没开讲，先聊会儿'
    : story.chapter || (story.phase === 'reading' ? '正在念' : story.phase === 'afterword' ? '整本读完了' : '');
  el.beat.textContent = idleNow ? '' : story.chapterCount ? `第 ${(story.chapterIndex || 0) + 1} / ${story.chapterCount} 章` : '';
  el.bar.style.width = `${Math.round(story.progress || 0)}%`;
  el.liveText.textContent =
    { reading: '朗读中', preparing: '准备中', break: '休息 · 聊天', afterword: '作品讨论', idle: '待开播', done: '读完了' }[
      story.phase
    ] || '待开播';
  el.danmakuN.textContent = state.events.length ? `${state.events.length} 条` : '';

  state.clockBase =
    story.phase === 'break' && story.countdown ? { remaining: story.countdown, at: Date.now() } : null;
  clockTick();
  syncStoryAudio(story);
  renderToc(story);

  /* 阶段变化立即更新常态；礼物期间由动作结束回调恢复最新阶段。 */
  const ph = story.phase || 'idle';
  if (state.lastPhase !== ph) {
    state.lastPhase = ph;
    setMood(phaseMood(ph), 0);
  }

  /* 本章线索卡只在「休息」时露脸：朗读中看正文、作品讨论看档案 */
  if (story.summary && story.phase === 'break') {
    el.summaryCard.hidden = false;
    el.summaryText.textContent = story.summary;
    el.summaryChapter.textContent = story.chapterTitle || story.chapter || '';
    const card = story.card;
    const hasGrid = Boolean(card && (card.people || card.clues || card.puzzles));
    if (el.clueGrid) el.clueGrid.hidden = !hasGrid;
    if (hasGrid) {
      el.cluePeople.textContent = card.people || '本章没有';
      el.clueClues.textContent = card.clues || '本章没有';
      el.cluePuzzles.textContent = card.puzzles || '本章没有';
    }
  } else {
    el.summaryCard.hidden = true;
  }

  if (story.phase === 'afterword' && story.archive) {
    bubble.classList.remove('typing');
    if (state.typing) clearInterval(state.typing);
    state.typing = null;
    bubble.textContent = '';
    bubble.append(archiveNode(story.archive));
    state.lastStorySeq = story.seq;
    if (mood && MOODS[mood]) setMood(mood, 6500);
    return;
  }

  if (state.storyDisplayMode === 'story' && story.phase !== 'reading' && story.phase !== 'preparing') {
    state.storyProgressRatio = 0;
  }
  renderStoryContent(story);
  state.lastStorySeq = story.seq;
  if (mood && MOODS[mood]) setMood(mood, 6500);
}

/** 新的一段开口之前，先把上一段的声音收掉 */
function stopSpeaking() {
  if (!el.voicePlayer) return;
  speakToken += 1; /* 让上一段台词的所有分段排队作废 */
  if (!el.voicePlayer.paused) el.voicePlayer.pause();
  el.voicePlayer.currentTime = 0;
  state.voicePlaying = null;
  if (el.player) el.player.volume = Number(state.musicVolume ?? 0.2);
}

function clockTick() {
  /* 角色/设定 看过一阵子自动回到故事（服务端也会过期，这里兜一层客户端） */
  if (state.story && state.story.viewUntil && Date.now() > state.story.viewUntil && state.storyDisplayMode !== 'story') {
    state.story.viewUntil = 0;
    restoreStoryDisplay();
  }
  /* 还没开讲：显示「距离开讲还有多久」 */
  if (!state.clockBase && state.story && state.story.nextStartAt && ['idle', 'done'].includes(state.story.phase)) {
    const left = Math.round((state.story.nextStartAt - Date.now()) / 1000);
    if (left > 0) {
      const h = Math.floor(left / 3600);
      const m = Math.floor((left % 3600) / 60);
      const s = left % 60;
      el.clock.textContent = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
      return;
    }
  }
  if (!state.clockBase) {
    el.clock.textContent = '--:--';
    return;
  }
  const left = Math.max(0, Math.round(state.clockBase.remaining - (Date.now() - state.clockBase.at) / 1000));
  el.clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}
setInterval(clockTick, 1000);

/* 右上：礼物感谢（只用真收到的礼物） */
function renderThanks() {
  const ev = [...state.events].reverse().find((e) => e.kind === 'gift' && e.gift);
  if (!ev) {
    el.giftThanks.hidden = true;
    return;
  }
  el.giftThanks.hidden = false;
  el.thanksText.textContent = `谢谢 ${ev.username} 的 ${ev.gift.name} ×${ev.gift.count || 1}，我收下了。`;
}

/* ---------- 统计 / 礼物 / 点歌 ---------- */
function renderStats(s) {
  if (!s) return;
  state.stats = s;
  const donors = document.getElementById('giftDonors');
  if (donors) {
    const rows = (s.giftDonors || []).map((v, i) => {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'donor-name'; name.textContent = String(i + 1) + '. ' + v.username;
      name.title = v.username;
      const detail = document.createElement('span');
      detail.className = 'donor-detail'; detail.textContent = '今日 ' + v.count + ' 件 · 最近' + v.lastGift;
      row.append(name, detail); return row;
    });
    if (!rows.length) { const row = document.createElement('li'); row.className = 'empty'; row.textContent = '等第一位送礼的朋友'; rows.push(row); }
    donors.replaceChildren(...rows);
  }
  const giftMap = s.gifts && typeof s.gifts === 'object' ? s.gifts : {};
  const giftN = Object.values(giftMap).reduce((a, b) => a + Number(b || 0), 0);
  el.spent.textContent = money(s.spent);
  el.tokenToday.textContent = num(s.tokensToday);
  el.tokenLife.textContent = num(s.tokensLifetime);
  el.peakTag.hidden = !s.peak;
  el.income.textContent = money(s.income);
  el.giftCount.textContent = giftN
    ? `今天收到 ${giftN} 件礼物 · 图鉴 ${s.unlocked}/${s.giftTotal}`
    : '还没有礼物 · 送个小心心试试';
  el.giftFoot.textContent = `图鉴 ${s.unlocked}/${s.giftTotal} · 白饭 ${money(s.rice)} 碗`;
  if (el.danmakuN && state.events.length) el.danmakuN.textContent = `${state.events.length} 条`;
}

/* 故事间：把「点歌队列」卡从右上角整块挪到底栏右栏（原来放消息列表的位置）。
 * 卡片本身没有任何 <audio>（播放器都在 .audio-dock 里），所以整块挪动不会打断正在放的歌；
 * 其它模式和普通直播仍然留在右上角。 */
const queueCard = document.querySelector('.stage > .queue-card');
const storyMusicSlot = document.getElementById('storyMusicSlot');
function placeQueueCard(isStory) {
  if (!queueCard || !storyMusicSlot) return;
  const host = isStory ? storyMusicSlot : document.querySelector('.stage');
  if (host && queueCard.parentElement !== host) host.appendChild(queueCard);
}

function renderBroadcast(view) {
  if (!view) return;
  state.broadcast = view;
  const { mode } = view;
  const isStory = mode === 'story';
  showGame(mode === 'game');
  showLuanti(mode === 'luanti');
  document.body.classList.toggle('broadcast-luanti', mode === 'luanti');
  storyStage.hidden = !isStory;
  el.clock.hidden = !isStory;
  document.body.classList.toggle('broadcast-chat', mode === 'chat' || mode === 'luanti');
  document.body.classList.toggle('broadcast-story', isStory);
  document.body.classList.toggle('broadcast-fitness', mode === 'fitness');
  placeQueueCard(isStory);
  if (!isStory) {
    state.story = null;
    clearInterval(state.typing);
    state.typing = null;
    state.clockBase = null;
    el.storyAudio.pause();
    el.phaseChip.textContent = view.title;
  }
  if (el.broadcastMode) el.broadcastMode.hidden = mode !== 'fitness' && !(isStory && view.enabled);
  if (el.broadcastModeTitle) el.broadcastModeTitle.textContent = view.title;
  if (el.broadcastModeText) {
    el.broadcastModeText.textContent = mode === 'fitness'
      ? '动作演示和排课在 /fitness 页面'
      : 'DeepSeek 负责互动话术，故事由本地定时器按进度播放';
  }
  if (el.fitnessMode) el.fitnessMode.hidden = mode !== 'fitness';
}

function renderBalance(b) {
  if (b && !b.error && b.total != null) {
    el.balVal.textContent = `¥${money(b.total)}`;
    el.balVal.classList.remove('dim');
  } else {
    el.balVal.textContent = '未绑定';
    el.balVal.classList.add('dim');
  }
}

function renderGifts(gifts) {
  const list = (gifts || []).slice(0, 3);
  el.giftList.innerHTML = '';
  // 没收到礼物时不再画占位胶囊：那个「圆角框 + 右侧横杠」在直播画面里会被看成下拉框。
  // 空状态由上方 giftCount 的「还没有收到礼物」文案承担。
  if (!list.length) return;
  for (const g of list) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="gift-emoji">${g.emoji || '🎁'}</span><span class="gift-name">${escapeHtml(g.name)}</span><span class="gift-amount">×${g.count || 1}</span>`;
    el.giftList.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderSong(song) {
  if(state.closed)return;
  const cur = song?.currentSong;
  const text = el.nowText;
  text.textContent = cur ? `${cur.title}${cur.by ? ' · ' + cur.by : ''}` : '还没有点歌 · 发「点歌 歌名」';
  el.srcTag.hidden = !cur;
  if (cur) {
    const tag = cur.kind === 'local' ? '本地' : cur.provider === 'netease' ? '网易云' : cur.provider === 'custom' ? '自建源' : '无源';
    el.srcTag.textContent = tag;
    el.srcTag.classList.toggle('err', !cur.url);
    if (cur.provider === 'netease' && cur.resolvedBy) el.srcTag.title = `实际播放：${cur.resolvedTitle || ''} · ${cur.resolvedBy}`;
  }
  el.playBtn.classList.toggle('playing', !el.player.paused && Boolean(cur?.url));
  el.playBtn.textContent = !el.player.paused && cur?.url ? '❚❚' : '▶';

  if (cur?.url) {
    const src = new URL(cur.url, location.origin).href;
    if (el.player.src !== src) {
      el.player.src = src;
      el.player.dataset.retry = '0'; /* 换了地址，重解析次数重新算 */
      /* 别把「静音开播」的临时状态带过来：换歌一律先解除静音、音量回到设置值 */
      el.player.muted = false;
      el.player.volume = Number(state.musicVolume ?? 0.2);
      state.userPaused = false;
      el.player.play().catch(() => {
        /* 浏览器不让自动播放：先把「点一下开启声音」亮出来 */
        el.playBtn.textContent = '▶';
        el.playBtn.classList.remove('playing');
        const b = document.getElementById('soundUnlock');
        if (b) b.hidden = false;
      });
    }
  } else if (!cur) {
    el.player.pause();
    el.player.removeAttribute('src');
    el.player.load();
    el.musicBar.style.width = '0%';
  }

  const list = song?.playlist || [];
  const queueMax = Number(song?.queueMax ?? state.queueMax ?? 3);
  state.queueMax = queueMax;
  el.queueN.textContent = list.length
    ? `排队 ${list.length}/${queueMax} 首`
    : song?.currentSong
      ? `队列空着 · 还能排 ${queueMax} 首`
      : '还没有人点';
  el.queueList.innerHTML = '';
  list.slice(0, 5).forEach((item, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="idx">${i + 1}</span><span class="title">${escapeHtml(item.title)}</span><span class="by">${escapeHtml(item.by || '')}</span>`;
    el.queueList.appendChild(li);
  });
}

/* 左栏目录：只露「正在读的那一章」起 5 章，靠近结尾时向前补齐 */
const TOC_SPAN = 5;
function renderToc(story) {
  if (!el.toc) return;
  const chapters = (story && story.chapters) || [];
  if (el.tocWrap) el.tocWrap.hidden = !chapters.length;
  const total = chapters.length;
  const cur = chapters.findIndex((c) => c.current);
  const from = !total ? 0 : cur < 0 ? 0 : Math.min(cur, Math.max(0, total - TOC_SPAN));
  const visible = total ? chapters.slice(from, from + TOC_SPAN) : [];
  el.tocN.textContent = total ? (cur >= 0 ? `在读 ${cur + 1} / ${total} 章` : `${total} 章`) : '';
  el.toc.innerHTML = '';
  visible.forEach((c, i) => {
    const n = from + i;
    const li = document.createElement('li');
    li.className = c.current ? 'current' : c.done ? 'done' : '';
    const idx = document.createElement('span');
    idx.className = 'toc-idx';
    idx.textContent = String(n + 1).padStart(2, '0');
    const title = document.createElement('span');
    title.className = 'toc-title';
    title.textContent = c.title || `第 ${n + 1} 章`;
    li.append(idx, title);
    el.toc.appendChild(li);
  });

  /* 观众给明天投的题：有就露出来，没有就整块收起来 */
  const topics = (story && story.topics) || [];
  if (el.tocTopics) el.tocTopics.hidden = !topics.length;
  if (el.topicList) {
    el.topicList.innerHTML = '';
    topics.slice(0, 2).forEach((t) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = `${t.count} 票`;
      const span = document.createElement('span');
      span.textContent = t.text;
      li.append(b, span);
      el.topicList.appendChild(li);
    });
  }
}

/* 清场之后把空态提示补回来 */
function ensureFeedHint() {
  if (!el.feed || el.feed.querySelector('.msg')) return;
  if (document.getElementById('danmakuEmpty')) return;
  const node = document.createElement('div');
  node.className = 'danmaku-empty';
  node.id = 'danmakuEmpty';
  node.innerHTML = '<b>弹幕会从这儿滚过去</b><span>发「点歌 歌名」点歌</span>';
  el.feed.appendChild(node);
}

/* ---------- 播放器 ---------- */
function initPlayer() {
  el.playBtn.addEventListener('click', () => {
    const cur = state.song?.currentSong;
    if (!cur?.url) {
      // 没有源就重新解析一次
      fetch(`${SERVER}/api/music/resolve`, { method: 'POST' }).catch(() => {});
      return;
    }
    if (el.player.paused) {
      state.userPaused = false;
      el.player.play().catch(() => {});
    } else {
      state.userPaused = true;
      el.player.pause();
    }
  });
  el.player.addEventListener('play', () => {
    state.userPaused = false;
    el.player.muted = false;
    el.playBtn.classList.add('playing');
    el.playBtn.textContent = '❚❚';
  });
  el.player.addEventListener('pause', () => {
    el.playBtn.classList.remove('playing');
    el.playBtn.textContent = '▶';
  });
  el.player.addEventListener('timeupdate', () => {
    const d = el.player.duration;
    if (Number.isFinite(d) && d > 0) el.musicBar.style.width = `${Math.min(100, (el.player.currentTime / d) * 100)}%`;
  });
  el.player.addEventListener('ended', () => {
    fetch(`${SERVER}/api/music/ended`, { method: 'POST' }).catch(() => {});
  });
  el.player.addEventListener('error', () => {
    if (!el.player.getAttribute('src')) return;
    el.srcTag.textContent = '播放失败';
    el.srcTag.classList.add('err');
    /* 网易云直链带有效期（几小时就过期），播久了、或者队列里躺久了会 403。
     * 以前这里只显示「播放失败」就不管了，表现就是「说进队列了但不放歌」。
     * 同一条 src 最多自动重解析两次，避免死循环。 */
    const tries = Number(el.player.dataset.retry || 0);
    if (tries >= 2) return;
    el.player.dataset.retry = String(tries + 1);
    console.warn(`[music] 播放失败，重新解析地址（第 ${tries + 1} 次）`);
    setTimeout(() => {
      fetch(`${SERVER}/api/music/resolve`, { method: 'POST' }).catch(() => {});
    }, 1200 * (tries + 1));
  });
}

function applyPetScale(config) {
  const storyValue = Number(config?.scene?.storyPetScale ?? 1);
  document.getElementById('petZone').style.setProperty('--story-pet-scale', String(Number.isFinite(storyValue) ? Math.max(.5, Math.min(1.5, storyValue)) : 1));
  const value = Number(config?.scene?.petScale ?? 1);
  const scale = Number.isFinite(value) ? Math.max(.5, Math.min(1.5, value)) : 1;
  document.getElementById('petZone').style.setProperty('--pet-user-scale', String(scale));
}

/* ---------- 初始化 ---------- */
function applyInit(payload, { replay = true } = {}) {
  applyPetScale(payload.config);
  renderBroadcast(payload.broadcast);
  renderStats(payload.stats);
  renderBalance(payload.balance);
  renderGiftActions(payload.gifts ?? payload.config?.gifts);
  if (payload.config?.music?.volume != null) state.musicVolume = Number(payload.config.music.volume);
  if (payload.config?.voice) {
    state.voiceVolume = Number(payload.config.voice.volume ?? 0.8);
    state.voiceEnabled = payload.config.voice.enabled !== false;
    state.voiceDuck = Number(payload.config.voice.duck ?? 1);
  }
  state.song = payload.song || state.song;
  renderSong(payload.song);

  const gifts = (payload.events || [])
    .filter((e) => e.kind === 'gift' && e.gift)
    .reduce((acc, e) => {
      const hit = acc.find((x) => x.name === e.gift.name);
      if (hit) hit.count += e.gift.count;
      else acc.push({ ...e.gift, count: e.gift.count });
      return acc;
    }, [])
    .sort((a, b) => b.count - a.count);
  renderGifts(gifts);
  renderThanks();

  feed.innerHTML = '';
  state.events = [];
  if (replay) {
    for (const item of (payload.events || []).slice(-50)) {
      state.events.push(item);
      addMessage(item, { animate: false });
    }
  }
  ensureFeedHint();
  if (payload.story) {
    renderStory(payload.story, { silent: Boolean(payload.story.text) });
  }
  scrollFeed();
}

/* ---------- SSE ---------- */
function connect() {
  if(state.closed)return;
  const es = new EventSource(`${SERVER}/api/events`);
  es.onmessage = (evt) => {
    let payload;
    try {
      payload = JSON.parse(evt.data);
    } catch {
      return;
    }
    switch (payload.type) {
      case 'shutdown':
        state.closed=true;state.voiceEnabled=false;state.userPaused=true;state.song=null;state.story=null;
        es.close();
        clearTimeout(replyAudioTimer);clearTimeout(playReplyAudio.timer);clearInterval(state.typing);
        replyAudioQueue.length=0;
        speakToken++;window.speechSynthesis?.cancel();
        showLuanti(false);showGame(false);
        document.querySelectorAll('audio,video').forEach(media=>{
          media.onended=null;media.onerror=null;media.muted=true;media.pause();
          media.removeAttribute('src');media.load();
          media.addEventListener('play',()=>{media.muted=true;media.pause();});
        });
        const closed=document.createElement('div');
        closed.textContent='直播间已关闭';closed.setAttribute('role','status');
        closed.style.cssText='position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:#14100ded;color:#eee;font-size:32px;';
        document.body.append(closed);
        break;
      case 'init':
        applyInit(payload);
        break;
      case 'event':
        state.events.push(payload.item);
        if (state.events.length > 50) state.events.splice(0, state.events.length - 50);
        addMessage(payload.item);
        break;
      case 'gift-action':
        playReplyAudio({ source: 'gift-thanks', giftAction: payload.name });
        break;
      case 'boot':
        state.events = [];
        feed.innerHTML = '';
        state.song = payload.song || state.song;
        renderSong(payload.song);
        if (payload.stats) renderStats(payload.stats);
        ensureFeedHint();
        break;
      case 'stats':
        renderStats(payload.stats);
        break;
      case 'song':
        state.song = payload;
        renderSong(payload);
        break;
      case 'story':
        renderStory(payload.story, { mood: payload.mood });
        break;
      case 'broadcast':
        renderBroadcast(payload.broadcast);
        break;
      case 'balance':
        renderBalance(payload.balance);
        break;
      case 'config':
        if (payload.config) {
          applyPetScale(payload.config);
          if (payload.config.gifts) renderGiftActions(payload.config.gifts);
          if (payload.config.music?.volume != null) {
            state.musicVolume = Number(payload.config.music.volume);
            if (el.voicePlayer.paused) el.player.volume = state.musicVolume;
          }
          if (payload.config.voice) {
            state.voiceVolume = Number(payload.config.voice.volume ?? 0.8);
            state.voiceEnabled = payload.config.voice.enabled !== false;
            state.voiceDuck = Number(payload.config.voice.duck ?? 1);
            el.voicePlayer.volume = state.voiceVolume;
          }
        }
        break;
      default:
        break;
    }
  };
  es.onerror = () => {
    es.close();
    if(!state.closed)setTimeout(connect, 2500);
  };
}

/* 从弹幕里认出「点歌」提示一下（真正入队由服务端做） */
initPlayer();

/* 每次打开直播窗先清场：音乐队列、消息队列、弹幕都归零（?keep=1 可跳过，调试用） */
const KEEP_STATE = new URLSearchParams(location.search).has('keep');
async function bootSession() {
  if (KEEP_STATE) return;
  try {
    const r = await fetch(`${SERVER}/api/session/boot`, { method: 'POST' });
    if (r.ok) {
      const d = await r.json();
      const c = d.cleared || {};
      console.log(`[boot] 清场：音乐 ${c.song || 0} 首、消息 ${c.events || 0} 条`);
    }
  } catch {
    /* 服务没起来也要能连 SSE */
  }
}
bootSession().finally(connect);

/* ---------- 声音：默认「打开就有声」，不带 ?auto=1 时留一个兜底按钮 ---------- */
const unlockBtn = document.getElementById('soundUnlock');
const AUTO_BOOT = new URLSearchParams(location.search).has('auto');
const soundReady = () =>
  (!el.player.paused && !el.player.ended) || (!el.voicePlayer.paused && !el.voicePlayer.ended);

/* 先试不静音直接播；被拦就静音开播，开起来立刻把静音和音量还回去（不留静音窗口） */
async function bootAudio() {
  if(state.closed)return false;
  const start = async () => {
    if (el.player.src && el.player.paused) await el.player.play().catch(() => {});
  };
  const restore = () => {
    el.player.muted = false;
    el.player.volume = Number(state.musicVolume ?? 0.2);
  };
  el.player.muted = false;
  await start();
  if (!state.song?.currentSong?.url) initPlayer();
  if (soundReady()) {
    restore();
    return true;
  }
  /* 兜底：静音起播，_同一拍_里就解除静音 —— 绝不让元素停在 muted=true 上 */
  el.player.muted = true;
  await start();
  restore();
  if (el.player.paused) return false;
  /* 有的机型静音起播后立刻解除会被重新静音，隔一拍再确认一次 */
  setTimeout(restore, 300);
  setTimeout(restore, 1500);
  return true;
}

/* 自愈：静音态/被暂停时，只要队列里还有歌就继续响（用户手动按过暂停就不动） */
function ensureMusicPlaying() {
  if(state.closed)return;
  const cur = state.song?.currentSong;
  if (!cur?.url) return;
  if (el.player.muted) {
    el.player.muted = false;
    el.player.volume = Number(state.musicVolume ?? 0.2);
  }
  if (state.userPaused) return;
  if (el.player.paused && el.player.currentSrc && !el.player.ended) el.player.play().catch(() => {});
}
setInterval(ensureMusicPlaying, 4000);

if (unlockBtn) {
  unlockBtn.hidden = true;
  if (AUTO_BOOT) {
    /* 用 start-live.cmd 打开（Chrome 带了 autoplay 放行参数）：不需要任何点击 */
    unlockBtn.remove();
    setTimeout(bootAudio, 900);
    setTimeout(() => {
      if (!soundReady()) bootAudio();
    }, 4000);
  } else {
    const nudge = () => {
      if (!soundReady()) unlockBtn.hidden = false;
    };
    setTimeout(nudge, 2600);
    unlockBtn.onclick = async () => {
      unlockBtn.hidden = true;
      await bootAudio();
    };
    el.player.addEventListener('playing', () => {
      unlockBtn.hidden = true;
    });
    el.voicePlayer.addEventListener('playing', () => {
      unlockBtn.hidden = true;
    });
    el.player.addEventListener('ended', nudge);
    /* 观众动一下鼠标/键盘就解锁声音；解锁过一次，之后点歌、切歌都自动往下播 */
    const unlock = () => {
      unlockBtn.hidden = true;
      state.audioUnlocked = true;
      bootAudio();
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
  }
}

fetch(`${SERVER}/api/state`)
  .then((r) => r.json())
  .then((s) => {
    if (s.ok && !state.stats) applyInit(s, { replay: true });
  })
  .catch(() => {});

/* 调试用：控制台里能看 state、手动喊一句（不影响直播） */
window.__dfy = { state, el, speak, renderStory, typeStory };

