// Isolated browser check: real video and audio, no live-room API calls.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const out = resolve('output/keyboard-check');
await mkdir(out, { recursive: true });
const wav = Buffer.alloc(44 + 48000 * 2 * 3);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < 48000 * 3; i++) wav.writeInt16LE(Math.round(10000 * Math.sin(i * 2 * Math.PI * 220 / 48000)), 44 + i * 2);
const server = createServer(async (req, res) => {
  if (req.url === '/tone.wav') { res.setHeader('Content-Type', 'audio/wav'); return res.end(wav); }
  if (req.url === '/') return res.end(`<!doctype html><style>body{margin:0;background:#8e9d9b}.stage{position:relative;width:1280px;height:720px}.pet{width:100%;height:100%;object-fit:cover;object-position:center bottom}</style><div class="stage"><video id="pet" class="pet" src="/assets/pet/keyboard.webm" autoplay loop muted playsinline></video></div><audio id="voice" src="/tone.wav" loop></audio><script type="module">import {createPetLipSync} from '/pet-lip-sync.js'; window.watch=createPetLipSync(pet,{cover:true,keyboard:true});watch(voice);window.ready=true;</script>`);
  try {
    const file = resolve('public', '.' + req.url);
    if (!file.startsWith(resolve('public') + '\\')) throw new Error('path');
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.webm': 'video/webm', '.png': 'image/png' }[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--remote-debugging-port=9342', `--user-data-dir=${out}/profile`, '--window-size=1280,720', 'about:blank'], { stdio:'ignore', windowsHide:true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
  let pages;
  for(let i=0;i<40;i++) { try { pages=await fetch('http://127.0.0.1:9342/json/list').then(r=>r.json()); break; } catch { await sleep(250); } }
  ws = new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.once('open',r));
  let id=0; const pending=new Map();
  ws.on('message', raw=>{const m=JSON.parse(raw);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}});
  const send=(method,params={})=>new Promise((r,j)=>{const n=++id;pending.set(n,m=>m.error?j(m.error):r(m.result));ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await sleep(1200);
  assert.equal(await evaluate('window.ready && pet.readyState >= 2'),true);
  const before=await evaluate('pet.currentTime');
  await evaluate('voice.play()'); await sleep(350);
  assert.equal(await evaluate(`pet.style.visibility !== 'hidden' && document.querySelector('.pet-speaking').style.display !== 'none' && document.querySelector('[data-mouth]').getAttribute('opacity') === '1'`),true);
  assert.notEqual(await evaluate('pet.currentTime'),before);
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(out,'speaking.png'),Buffer.from(shot.data,'base64'));
  await evaluate('voice.pause()'); await sleep(100);
  assert.equal(await evaluate(`document.querySelector('.pet-speaking').style.display`),'none');
  await evaluate('voice.muted=true;voice.play()'); await sleep(150);
  assert.equal(await evaluate(`document.querySelector('.pet-speaking').style.display`),'none');
  await evaluate(`voice.muted=false;pet.dataset.giftAction='1';pet.src='/assets/pet/happy.webm';pet.play()`); await sleep(400);
  assert.equal(await evaluate(`document.querySelector('.pet-speaking').style.display`),'none');
  await evaluate(`pet.dataset.giftAction='0';pet.src='/assets/pet/idle.webm';pet.play()`); await sleep(400);
  assert.equal(await evaluate(`pet.style.visibility === 'hidden' && document.querySelector('.pet-speaking image').style.display !== 'none'`),true);
  await evaluate('voice.pause()'); await sleep(100);
  assert.equal(await evaluate(`pet.style.visibility`),'');
  console.log('PASS: typing keeps playing during voice; mouth opens with audio; pause/mute hide mouth; gift stays visible; idle speech restores original portrait.');
  await send('Browser.close');
} finally { ws?.close(); chrome.kill(); server.close(); }
