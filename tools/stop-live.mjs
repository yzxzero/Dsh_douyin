import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT, loadConfig } from '../lib/config.mjs';
import { LUANTI_HOME, luantiState, luantiCommand } from '../lib/luanti.mjs';
import { projectProcessKind, samePath } from '../lib/live-processes.mjs';

const exec=promisify(execFile);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const dryRun=process.argv.includes('--dry-run');
const cfg=await loadConfig();
let control=null;
try{control=JSON.parse(await readFile(path.join(ROOT,'data/server-control.json'),'utf8'));}catch{}
// Windows 路径不区分大小写：服务可能以 d:\... 记录，而 ROOT 是 D:\...。
const validControl=control?.app==='dafeiyu-live' && samePath(control.root,ROOT);
const base=`http://127.0.0.1:${validControl?control.port:cfg.port||8787}`;
async function health(){try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1800)});return r.ok?await r.json():null;}catch{return null;}}
async function processes(){
  const script="@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','chrome.exe','luanti.exe','python.exe') } | ForEach-Object { @{pid=$_.ProcessId;name=$_.Name;commandLine=$_.CommandLine;startedAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) | ConvertTo-Json -Compress";
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,maxBuffer:4*1024*1024});
  const parsed=JSON.parse(stdout.trim()||'[]');
  return (Array.isArray(parsed)?parsed:[parsed]).map(proc=>({...proc,kind:projectProcessKind(proc,{root:ROOT,runtime:LUANTI_HOME,
    control:validControl?control:null})})).filter(proc=>proc.kind);
}
async function terminate(proc){
  // Recheck identity immediately before closing; never target another browser profile or a reused PID.
  if(!(await processes()).some(p=>p.pid===proc.pid&&p.kind===proc.kind&&p.startedAt===proc.startedAt))return;
  const {stdout}=await exec('taskkill.exe',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true}).catch(async err=>{
    if(!(await processes()).some(p=>p.pid===proc.pid))return {stdout:''};throw err;
  });
  if(stdout)console.log(`已关闭本项目${proc.kind==='window'?'窗口':proc.kind==='game'?'游戏':'服务'}（PID ${proc.pid}）。`);
}
try{
  const before=await health();
  if(dryRun){
    console.log('检查模式：不会关闭或修改任何内容。');
    console.log(`直播服务：${before?.app==='dafeiyu-live'?'运行中':'未连接'}；关闭地址：${base}`);
    for(const proc of await processes())console.log(`将关闭：${proc.kind}，PID ${proc.pid}`);
    process.exit(0);
  }
  if(before){
    if(!validControl || before.app!=='dafeiyu-live'||before.pid!==control.pid||!samePath(before.root,ROOT))
      throw new Error('端口上的服务与本项目控制记录不匹配，未关闭任何进程。请先用新版服务启动一次。');
    console.log('正在保存观众记忆、互动记录并退出游戏…');
    const res=await fetch(base+'/api/shutdown',{method:'POST',headers:{'X-Dafeiyu-Control':control.token},signal:AbortSignal.timeout(60000)});
    const result=await res.json();
    if(!res.ok||!result.ok)throw new Error(result.error||'保存失败，服务保留运行，请重试。');
    for(let i=0;i<50;i++){await sleep(200);if(!await health())break;}
    if(await health())throw new Error('服务尚未退出，请稍后重试。');
  }else if((await luantiState()).online){
    console.log('直播服务未运行，正在保存并退出本项目游戏…');
    await luantiCommand({action:'exit'});
    for(let i=0;i<50;i++){await sleep(200);if(!(await luantiState()).online)break;}
    if((await luantiState()).online)throw new Error('游戏仍在保存，未强制关闭，请稍后重试。');
  }
  let remaining=await processes();
  for(let i=0;i<8 && remaining.some(proc=>proc.kind==='game');i++){
    await sleep(300);remaining=await processes();
  }
  if(!before && remaining.some(proc=>proc.kind==='server'))throw new Error('直播服务存在但未响应，未强制终止以保留记录。请检查服务窗口后重试。');
  if(remaining.some(proc=>proc.kind==='game'))throw new Error('游戏进程仍在退出，未强制关闭，请稍后重试。');
  for(const proc of remaining.filter(p=>p.kind==='window'))await terminate(proc);
  console.log('直播间已关闭。普通浏览器中的直播标签页会停止播放，独立直播窗和操作台会退出。');
}catch(err){console.error('关闭未完成：'+err.message);process.exitCode=1;}
