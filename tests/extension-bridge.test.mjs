import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
function worker(config = {}, fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true, app: 'dafeiyu-live' }) })) {
  let listener;
  const calls = [];
  vm.runInNewContext(source, {
    URL, AbortSignal,
    chrome: {
      runtime: { id: 'test-extension', onMessage: { addListener(fn) { listener = fn; } } },
      storage: { local: { get: async defaults => ({ ...defaults, ...config }) } },
    },
    fetch: async (...args) => { calls.push(args); return fetchImpl(...args); },
  });
  return {
    calls,
    send: (action, body, id = 'test-extension') => new Promise(resolve => {
      assert.equal(listener({ type: 'dafeiyu-request', action, body }, { id }, resolve), true);
    }),
  };
}
test('worker relays health and events to configured loopback service', async () => {
  const w = worker({ server: 'http://localhost:9876' });
  assert.equal((await w.send('health')).ok, true);
  assert.equal(String(w.calls[0][0]), 'http://localhost:9876/api/health');
  await w.send('event', { kind: 'chat', text: 'offline test' });
  assert.equal(w.calls[1][1].method, 'POST');
  assert.equal(JSON.parse(w.calls[1][1].body).text, 'offline test');
});
test('worker rejects arbitrary hosts, routes and foreign senders without fetching', async () => {
  const remote = worker({ server: 'https://example.com' });
  assert.equal((await remote.send('health')).ok, false);
  assert.equal(remote.calls.length, 0);
  const w = worker();
  assert.equal((await w.send('/api/shutdown')).ok, false);
  assert.equal((await w.send('health', null, 'foreign')).ok, false);
  assert.equal(w.calls.length, 0);
});
test('disabled bridge permits diagnostics but rejects collection and sending', async () => {
  const w = worker({ enabled: false });
  assert.equal((await w.send('event', {})).ok, false);
  assert.equal((await w.send('outbox')).ok, false);
  assert.equal((await w.send('health')).ok, true);
  assert.equal(w.calls.length, 1);
});
test('worker reports failures and refuses a different local app', async () => {
  const offline = worker({}, async () => { throw new Error('Failed to fetch'); });
  assert.match((await offline.send('health')).error, /Failed to fetch/);
  const bad = worker({}, async () => ({ ok: false, status: 503 }));
  assert.match((await bad.send('health')).error, /503/);
  const wrong = worker({}, async () => ({ ok: true, json: async () => ({ ok: true }) }));
  assert.equal((await wrong.send('health')).ok, false);
});

test('like parser accepts real likes but never parses our thanks as another like', () => {
  const parserSource = contentSource.slice(
    contentSource.indexOf('const GIFT_RE'),
    contentSource.indexOf('// ---------- 上报'),
  ) + '\nthis.parseLine = parseLine;';
  const context = vm.createContext({});
  vm.runInContext(parserSource,context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.parseLine('lanyuyu 为主播点赞了'))),{kind:'like',username:'lanyuyu'});
  assert.deepEqual(JSON.parse(JSON.stringify(context.parseLine('七月：点了赞'))),{kind:'like',username:'七月'});
  assert.equal(context.parseLine('收到 lanyuyu 的点赞，我记住这份心意啦。'),null);
  assert.equal(context.parseLine('收到 收到 lanyuyu 的 的点赞，我记住这份心意啦。'),null);
  assert.equal(context.parseLine('谢谢 七月 的点赞，心意我收下啦。'),null);
});
