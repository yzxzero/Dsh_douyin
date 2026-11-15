import { spawn, execFile } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { ROOT } from '../lib/config.mjs';
import path from 'node:path';

const base='http://127.0.0.1:8787';
async function ready() {try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(800)})).ok;}catch{return false;}}
if(!await ready()) {
  await mkdir(path.join(ROOT,'data'),{recursive:true});
  const log=await open(path.join(ROOT,'data/wesnoth-server.log'),'a');
  const child=spawn(process.execPath,[path.join(ROOT,'server.mjs')],{cwd:ROOT,env:{...process.env,PORT:'8787'},detached:true,
    windowsHide:true,stdio:['ignore',log.fd,log.fd]});
  child.unref();await log.close();
  for(let i=0;i<75&&!await ready();i++)await new Promise(r=>setTimeout(r,200));
}
if(!await ready())throw new Error('直播服务启动失败，请查看 data/wesnoth-server.log');
const response=await fetch(base+'/api/wesnoth/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
const result=await response.json();
if(!response.ok||!result.ok)throw new Error(result.error||'游戏启动失败');
console.log('Wesnoth 已启动，直播画面已切换。');
execFile(process.execPath,[path.join(ROOT,'tools/restart-pages.mjs')],{cwd:ROOT,windowsHide:true});
