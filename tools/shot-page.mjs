/**
 * 临时调试：1920×1080 无头渲染 + 截图 + 布局探针
 *   node output/shot.mjs <name> "<js 表达式>"
 * 产物：output/<name>.png
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const name = process.argv[2] || 'shot';
const expr = process.argv[3] || 'document.title';
const url = process.env.SHOT_URL || 'http://127.0.0.1:8787/?auto=1';

const profile = mkdtempSync(path.join(tmpdir(), 'shot-'));
const chrome = spawn(
  CHROME,
  ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--window-size=1920,1080', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl = null;
chrome.stderr.on('data', (b) => {
  const m = String(b).match(/DevTools listening on (ws:\/\/\S+)/);
  if (m) wsUrl = m[1];
});
for (let i = 0; i < 120 && !wsUrl; i += 1) await sleep(100);
if (!wsUrl) { console.error('没有拿到 DevTools 地址'); process.exit(1); }
const port = new URL(wsUrl).port;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => {
  seq += 1;
  ws.send(JSON.stringify({ id: seq, method, params }));
  return new Promise((r) => pending.set(seq, r));
};
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(Number(process.env.SHOT_WAIT || 5000));
const out = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(out.result?.result?.value ?? out, null, 2));
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  ...(process.env.CLIP
    ? (() => {
        const [x, y, width, height, scale] = process.env.CLIP.split(',').map(Number);
        return { clip: { x, y, width, height, scale: scale || 1 }, captureBeyondViewport: true };
      })()
    : {}),
});
if (shot.result?.data) {
  writeFileSync(path.join('output', `${name}.png`), Buffer.from(shot.result.data, 'base64'));
  console.log(`saved output/${name}.png`);
}
ws.close();
chrome.kill();
