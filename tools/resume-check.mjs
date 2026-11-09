// 验证「刷新后接着念」：刷新前后的 storyAudio.currentTime 应该是接着走，而不是回到 0
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9431;
const profile = mkdtempSync(join(tmpdir(), 'resume-'));
spawn(
  CHROME,
  [
    '--headless=new',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--window-size=1600,900',
    'http://127.0.0.1:8787/?auto=1&keep=1',
  ],
  { stdio: 'ignore', detached: false },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const p = list.find((t) => t.type === 'page' && t.url.includes('8787'));
      if (p) return p.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  throw new Error('CDP 连不上');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((r) => pending.set(mid, r));
};

const read = async (label) => {
  const res = await send('Runtime.evaluate', {
    expression: `JSON.stringify((()=>{const a=document.getElementById('storyAudio');return {t:+Number(a.currentTime||0).toFixed(1), paused:a.paused, rs:a.readyState, src:(a.currentSrc||'').slice(-22)}})())`,
    returnByValue: true,
  });
  console.log(label, res.result?.result?.value);
  return JSON.parse(res.result?.result?.value || '{}');
};

await sleep(16000);
const before = await read('刷新前 ');
await send('Page.reload', { ignoreCache: false });
await sleep(14000);
const after = await read('刷新后 ');

console.log(`结论：${after.t >= before.t - 2 ? '接着念了（位置没倒退）' : '回到开头了（位置倒退）'}`);
process.exit(0);
