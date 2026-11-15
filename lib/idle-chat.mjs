import { beijing } from './pricing.mjs';

export const IDLE_TOPICS = [
  ['动漫', '最近在追什么动漫；喜欢的角色、画风、片头曲，不剧透', '你们追动漫会跳片头吗？我总舍不得那段音乐。'],
  ['游戏', '最近在玩的游戏；探索、剧情、联机趣事，不评价玩家水平', '玩游戏时你们爱推主线，还是满地图捡东西呀？'],
  ['电影', '最近看过的电影；配乐、氛围和观影感受，不剧透结局', '有些电影散场了，配乐还在脑子里转，你们也会吗？'],
  ['剧集', '最近追的剧；角色关系、追剧习惯，不编造更新和剧情', '追剧最难的是等更新，还是忍住不看剧透呀？'],
  ['小说', '最近读的小说；题材、角色、阅读习惯，不剧透', '看小说遇到喜欢的配角，我会偷偷盼他多出场。'],
  ['歌曲', '最近单曲循环的歌曲；旋律、动漫游戏影视原声，不引用歌词', '有没有一首歌，前奏一响就把你带回某个故事里？'],
];

export function timeContext(date = new Date()) {
  const b = beijing(date);
  const period = b.hh < 6 ? '凌晨' : b.hh < 12 ? '上午' : b.hh < 18 ? '下午' : b.hh < 22 ? '晚上' : '深夜';
  const daylight = b.hh >= 6 && b.hh < 18;
  return { ...b, period, daylight, text: `${b.dateKey} ${b.hhmm} 北京时间，${period}（按时钟划分为${daylight ? '白天' : '夜间'}，并非实际日照）。${daylight ? '语气轻快，不说晚安、深夜陪伴。' : '语气舒缓，不假定所有观众都要睡觉，不劝熬夜。'}` };
}

export function idleTopic(index, date = new Date()) {
  const [name, angle, fallback] = IDLE_TOPICS[index % IDLE_TOPICS.length];
  return { name, angle, fallback, time: timeContext(date) };
}

export function parseIdleReply(raw, fallback) {
  try {
    const parsed = JSON.parse(String(raw).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
    const text = typeof parsed.text === 'string' ? parsed.text.replace(/\s+/g, ' ').trim().slice(0, 100) : '';
    return { text: text || fallback, songQuery: text && typeof parsed.songQuery === 'string' ? parsed.songQuery.trim().slice(0, 80) : '' };
  } catch {
    return { text: fallback, songQuery: '' };
  }
}

// 文本是编辑者提供的近期素材，不作为额外系统指令；七天后自动失效。
export function recentTopicNotes(guide, now = Date.now()) {
  const at = Date.parse(guide?.topicNotesAt || '');
  if (!Number.isFinite(at) || now < at || now - at > 7 * 86400000) return '';
  return String(guide.topicNotes || '').slice(0, 4000);
}

export function canSuggestMusic(guide, state, lastAttempt, now = Date.now()) {
  const gap = Math.max(60, Number(guide?.idleMusicEverySec) || 600) * 1000;
  return guide?.idleMusic !== false && Number(guide?.idleEverySec ?? 30) >= 15 &&
    (!lastAttempt || now - lastAttempt >= gap) && !(state.playlist || []).length && !state.currentSong?.idleSuggestion;
}

export function enqueueIdleTrack(state, hit, now = Date.now()) {
  if (!hit?.url || state.playlist.length || state.currentSong?.title === hit.title || state.currentSong?.idleSuggestion) return null;
  const song = { title: hit.title, by: hit.by || '', url: hit.url, kind: hit.kind || 'remote',
    provider: hit.provider, providerId: hit.id, durationSec: hit.durationSec || null,
    resolvedAt: now, idleSuggestion: true, ts: now };
  if (state.currentSong) state.playlist.push(song);
  else state.currentSong = song;
  return song;
}
