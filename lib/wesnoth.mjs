import {spawn} from 'node:child_process';
import {readFile,mkdir,open,writeFile,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from './config.mjs';
export const WESNOTH_HOME=path.resolve(process.env.WESNOTH_HOME || path.resolve(ROOT,'../Wesnoth/game'));
const userdata=path.resolve(WESNOTH_HOME,'../userdata');
const exe=path.join(WESNOTH_HOME,'wesnoth.exe');
const python='C:/Users/yingzhu.xia/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const logfile=path.resolve(WESNOTH_HOME,'../live.log');
const commandFile=path.join(userdata,'data/add-ons/WhaleLive/command.txt');
let game,capture,starting,closing,last=null,roundId='',counter=0,commandChain=Promise.resolve();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const alive=p=>p&&p.exitCode===null&&!p.killed;
async function refresh(){
 try{
  const log=await readFile(logfile,'utf8');
  const lines=log.match(/WHALE_STATE (\{[^\r\n]*\})/g);
  if(lines?.length)last=JSON.parse(lines.at(-1).slice(12));
 }catch{}
}
export async function wesnothState(){
 await refresh();
 const online=!!alive(game),paused=last?.paused===true;
 const labels={auto:'按默认策略作战',attack:'提高进攻倾向',defend:'保守防守',villages:'优先争夺村庄'};
 return {...last,online,playing:online&&!last?.gameOver,ready:last!==null,roundId,paused,auto:!paused,
  gameOver:last?.gameOver===true,activity:paused?'暂停战斗':labels[last?.strategy]||'准备战场'};
}
export function launchWesnoth(){
 if(starting)return starting;
 starting=(async()=>{
  if(alive(game)&&!last?.gameOver)return;
  if(alive(game)||alive(capture))await wesnothCommand({action:'exit'});
  if(!existsSync(exe)||!existsSync(commandFile))throw new Error('韦诺之战或直播扩展未安装完整');
  last=null;roundId=String(Date.now());
  await mkdir(userdata,{recursive:true});await writeFile(commandFile,'0 auto\n');
  const log=await open(logfile,'w');
  game=spawn(exe,['--userdata-dir',userdata,'--userconfig-dir',userdata,'--windowed','--resolution','1280x720',
   '--language','zh_CN','--no-log-to-file','--wnoconsole','--nosound','--multiplayer','--scenario','Whale_Live',
   '--controller','1:ai','--controller','2:ai','--side','1:Rebels','--side','2:Northerners','--turns','30','--exit-at-end'],
   {cwd:WESNOTH_HOME,windowsHide:false,stdio:['ignore',log.fd,log.fd]});
  const launched=game;
  game.on('exit',()=>{if(game===launched&&alive(capture))capture.kill();});
  game.on('error',()=>{});await log.close();
  for(let i=0;i<180;i++){
   await wait(500);await refresh();
   if(last){
    capture=spawn(python,[path.join(ROOT,'tools/wesnoth-capture.py'),String(game.pid)],{cwd:ROOT,windowsHide:true,stdio:'ignore'});
    capture.on('error',()=>{});await wait(700);return;
   }
   if(!alive(game))break;
  }
  throw new Error('韦诺之战启动未就绪，请查看 Wesnoth/live.log');
 })().catch(async e=>{for(const p of [capture,game])if(alive(p))p.kill();throw e;}).finally(()=>{starting=null;});
 return starting;
}
export async function wesnothFrame(){
 if(!alive(game))throw new Error('游戏已结束');
 const res=await fetch('http://127.0.0.1:8868/',{signal:AbortSignal.timeout(2500)});
 if(!res.ok)throw new Error('请保持韦诺之战窗口展开');return Buffer.from(await res.arrayBuffer());
}
function command(value){
 const next=commandChain.catch(()=>{}).then(()=>sendCommand(value));commandChain=next;return next;
}
async function sendCommand(value){
 if(!alive(game))throw new Error('游戏未运行');
 const id=String(Date.now())+String(++counter);
 await writeFile(commandFile+'.tmp',id+' '+value+'\n');await rename(commandFile+'.tmp',commandFile);
 for(let i=0;i<150;i++){
  await wait(200);await refresh();
  if(last?.ack===id)return {ok:true,applied:true};
  if(!alive(game))break;
 }
 throw new Error('游戏尚未确认该指令，请稍后重试');
}
export async function wesnothCommand(body){
 if(body.action==='exit'){
  if(closing)return closing;
  closing=(async()=>{
   if(alive(game))await command('exit').catch(()=>{});
   for(const p of [capture,game])if(alive(p))p.kill();
  })().finally(()=>{closing=null;});await closing;return {ok:true};
 }
 if(body.action==='start'){if(!alive(game))throw new Error('游戏未启动');return {ok:true};}
 if(body.action==='save')throw new Error('请在原生游戏菜单中保存；本入口每次开始新的遭遇战');
 if(body.action==='pause')return command(body.paused===false?'resume':'pause');
 if(body.action==='auto')return command(body.enabled===false?'pause':'resume');
 if(body.action==='strategy'){
  if(!['auto','pause','attack','defend','villages'].includes(body.strategy))throw new Error('不支持该策略');
  if(body.strategy==='pause')return command('pause');
  if(body.strategy==='auto')return command('resume');
  return command(body.strategy);
 }
 throw new Error('未知战斗操作');
}
export async function wesnothContext(){return '当前游戏是韦诺之战，本地遭遇战中内置 AI 控制精灵军对战兽人；观众可调整进攻、防守、占村倾向及暂停继续。没有接入逐单位坐标走位或剧情分支，不能假称模型亲自做出全部战术。以下为真实战况，仅依据它播报：'+JSON.stringify(await wesnothState());}

