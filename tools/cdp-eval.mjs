/**
 * 通过 CDP 在某个页面里执行一段 JS，用来远程看页面真实状态（不弹窗、不打断播放）。
 *
 *   node tools/cdp-eval.mjs 9225 "document.title"
 *   node tools/cdp-eval.mjs 9225 --file probe.js
 *
 * 页面要是用 --remote-debugging-port=<端口> 起的（打开直播间.cmd 没带，
 * 调试窗口可以用：chrome --app=... --remote-debugging-port=9225 --mute-audio）。
 */
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

const [portArg, exprArg, ...rest] = process.argv.slice(2);
const port = Number(portArg) || 9222;
let expr = exprArg || '';
if (expr === '--file') expr = readFileSync(rest[0], 'utf8');
if (!expr) {
  console.error('用法：node tools/cdp-eval.mjs <端口> "<js 表达式>" | --file <文件>');
  process.exit(1);
}

const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => null);
if (!list) {
  console.error(`CDP ${port} 连不上（窗口没带 --remote-debugging-port？）`);
  process.exit(1);
}
const page = list.find((t) => t.type === 'page');
if (!page) {
  console.error('没有页面 target');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, fail) => {
  ws.addEventListener('open', ok, { once: true });
  ws.addEventListener('error', fail, { once: true });
});

const id = 1;
const reply = await new Promise((resolve) => {
  ws.addEventListener('message', (e) => {
    const d = JSON.parse(e.data);
    if (d.id === id) resolve(d);
  });
  ws.send(
    JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true, awaitPromise: true },
    }),
  );
});
ws.close();

const r = reply.result;
if (r?.exceptionDetails) {
  console.error('页面里报错：', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  process.exit(2);
}
const v = r?.result?.value;
console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
