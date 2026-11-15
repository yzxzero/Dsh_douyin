// Match both the sending account and recent outgoing text; viewers quoting the
// same words must still be able to chat with the host.
export function isReplyEcho(event, outbox, selfUsername, now = Date.now()) {
  if ((event.kind || event.type || 'chat') !== 'chat' || !selfUsername) return false;
  if (String(event.username || event.nickname || '').trim() !== selfUsername.trim()) return false;
  const text = String(event.text ?? event.content ?? '').trim();
  return Boolean(text) && outbox.some(item =>
    ['pending', 'sent'].includes(item.status) && now - item.createdAt >= 0 &&
    now - item.createdAt < 120000 && item.text.trim() === text);
}

// The sending account must never enter the audience reply pipeline. Text/outbox
// matching is only a hint: failed sends, expired entries and page reloads all
// used to let the host's own public-chat messages come back as new questions.
export function isSelfChat(event, selfUsername) {
  if ((event.kind || event.type || 'chat') !== 'chat' || !selfUsername) return false;
  return String(event.username || event.nickname || '').trim() === selfUsername.trim();
}

// Last-resort guard for older extension builds that parsed our own like thanks
// as an event. Real platform events from cortico are not affected.
export function isLikeAckEcho(event) {
  if ((event.kind || event.type) !== 'like' || event.source !== 'extension') return false;
  const username = String(event.username || event.nickname || '').trim();
  return /^(?:收到|谢谢|感谢)(?:\s|$)/.test(username) || /点赞|心意|老朋友/.test(username);
}

// A platform message ID cannot dedupe against the extension, which only knows
// nickname + text. Keep both keys so cortico and extension sightings of one
// chat message collapse into one reply, while repeated gifts remain untouched.
export function createEventDeduplicator(now = () => Date.now()) {
  const seen = new Map();
  return (item) => {
    const ts = now();
    const kind = item.kind || item.type || 'chat';
    const messageId = String(item.messageId || '').trim();
    const keys = [];
    if (!['gift', 'like'].includes(kind)) {
      const username = String(item.username || item.nickname || '').trim();
      const text = String(item.text ?? item.content ?? '').trim();
      keys.push({ key: `${kind}|${username}|${text}`, ttl: 4000 });
    }
    if (messageId) keys.push({ key: `msg:${messageId}`, ttl: 300000 });
    if (keys.some(({ key, ttl }) => {
      if (!seen.has(key)) return false;
      const age = ts - seen.get(key);
      return age >= 0 && age < ttl;
    })) return true;
    for (const { key } of keys) seen.set(key, ts);
    if (seen.size > 500) {
      for (const [key, at] of seen) if (ts - at > 300000) seen.delete(key);
    }
    return false;
  };
}
