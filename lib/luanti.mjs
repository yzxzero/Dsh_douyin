import {spawn} from 'node:child_process';
import {readFile,writeFile,rename,open} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {ROOT} from './config.mjs';
export const LUANTI_HOME=path.resolve(process.env.LUANTI_HOME||path.resolve(ROOT,'../Luanti/luanti-5.18.0-win64'));
const world=path.resolve(process.env.LUANTI_WORLD||path.join(LUANTI_HOME,'worlds/whale_atlantis'));
const stateFile=path.join(world,'whale-state.json'),commandFile=path.join(world,'whale-command.json');
const exe=path.join(LUANTI_HOME,'bin/luanti.exe');
const python='C:/Users/yingzhu.xia/.workbuddy/binaries/python/versions/3.13.12/python.exe';
let game,capture,starting,closing,last=null,roundId='',counter=0,chain=Promise.resolve();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const alive=p=>p&&p.exitCode===null&&!p.killed;
async function refresh(){try{last=JSON.parse(await readFile(stateFile,'utf8'));}catch{}}
export async function luantiState(){
 await refresh();const online=!!alive(game);
 return {...last,online,playing:online,ready:online&&last?.ready===true,roundId,auto:!last?.paused,gameOver:false,
  activity:last?.activity||'准备海底世界'};
}
export function launchLuanti(){
 if(starting)return starting;
 starting=(async()=>{
  if(alive(game))return;
  if(!existsSync(exe))throw new Error('Luanti 便携版尚未安装完整');
  if(alive(capture))capture.kill();last=null;roundId=String(Date.now());
  await writeFile(stateFile,JSON.stringify({ready:false}));await writeFile(commandFile,JSON.stringify({id:'0',action:'save'}));
  const log=await open(path.join(LUANTI_HOME,'whale-console.log'),'a');
  game=spawn(exe,['--config',path.join(LUANTI_HOME,'atlantis.conf'),'--world',world,'--gameid','minetest',
   '--name','Dafeiyu','--go','--logfile',path.join(LUANTI_HOME,'whale-game.log')],
   {cwd:LUANTI_HOME,windowsHide:false,stdio:['ignore',log.fd,log.fd]});
  const launched=game;game.on('error',()=>{});game.on('exit',()=>{if(game===launched&&alive(capture))capture.kill();});await log.close();
  for(let i=0;i<180;i++){
   await wait(500);await refresh();
   if(last?.ready&&last.players>0){
    capture=spawn(python,[path.join(ROOT,'tools/luanti-window-capture.py'),String(game.pid)],{cwd:ROOT,windowsHide:true,stdio:'ignore'});capture.on('error',()=>{});
    await wait(700);return;
   }
   if(!alive(game))break;
  }
  throw new Error('海底世界启动未就绪，请查看 Luanti/whale-game.log');
 })().catch(async e=>{for(const p of [capture,game])if(alive(p))p.kill();throw e;}).finally(()=>{starting=null;});
 return starting;
}
export async function luantiFrame(){
 if(!alive(game))throw new Error('海底世界尚未启动');
 const res=await fetch('http://127.0.0.1:8869/',{signal:AbortSignal.timeout(2500)});
 if(!res.ok)throw new Error('请保持 Luanti 窗口展开');return Buffer.from(await res.arrayBuffer());
}
function command(body){const next=chain.catch(()=>{}).then(()=>send(body));chain=next;return next;}
async function send(body){
 if(!alive(game))throw new Error('海底世界未运行');
 const id=String(Date.now())+'-'+String(++counter);
 await writeFile(commandFile+'.tmp',JSON.stringify({...body,id}));await rename(commandFile+'.tmp',commandFile);
 for(let i=0;i<75;i++){
  await wait(100);await refresh();
  if(last?.ack===id){if(last.error)throw new Error(last.error);return {ok:true,applied:true};}
  if(!alive(game))break;
 }
 throw new Error('游戏尚未确认操作，请稍后重试');
}
export async function luantiCommand(body){
 if(body.action==='exit'){
  if(closing)return closing;
  closing=(async()=>{
   if(alive(game)){
    await command({action:'exit'});
    for(let i=0;i<100&&alive(game);i++)await wait(100);
    if(alive(game))throw new Error('世界仍在保存，请稍后重试');
   }
   if(alive(capture))capture.kill();
  })().finally(()=>{closing=null;});await closing;return {ok:true};
 }
 if(body.action==='start'){if(!(await luantiState()).ready)throw new Error('世界未就绪');return command({action:'resume'});}
 if(body.action==='save')return command({action:'save'});
 if(body.action==='pause')return command({action:body.paused===false?'resume':'pause'});
 if(body.action==='auto')return command({action:body.enabled===false?'pause':'resume'});
 if(body.action==='strategy'){
  if(body.strategy==='accelerate'){
   if(!body.voter)throw new Error('加速需要观众指令');
   return command({action:'accelerate'});
  }
  if(['palace','pond','garden'].includes(body.strategy)){
   if(!body.voter)throw new Error('投票需要观众标识');
   return command({action:'vote',plan:body.strategy,voter:createHash('sha256').update(String(body.voter).slice(0,200)).digest('hex')});
  }
  if(body.strategy==='pause')return command({action:'pause'});
  if(body.strategy==='auto')return command({action:'resume'});
 }
 throw new Error('未知建造操作');
}
export async function luantiContext(){return '当前是 Minetest/Luanti 亚特兰蒂斯海底都市，从空白海床逐块建城。参考海底都市图片的深青色装饰艺术高楼、暖金窗户与尖塔，是方块风格改编。创造模式，共16个工段：先广场、中央大道、连接街道，再11栋建筑，最后全城道路地砖、入户步道和主路横街路灯。默认以原速的四分之一施工，每约3.2秒真实放置一块；只有观众明确说“加速搭”才将当前速度乘1.05，速度保存后续用，不自动加速，黄色框表示施工位置；整个城市施工、投票和暂停均使用同一个固定机位，不环绕也不播放录像。基础设施完成后，观众发“投票 高楼”“投票 尖塔”“投票 街区”选择下一栋的蓝图类别，每轮30秒，每个显示名一票可修改；无票按规划顺序。没有资源消耗和生存采集，不是语言模型自由设计。工段包含道路，不得称为建筑数量。城市进度持续保存；全部完成后展示，不会自动清空或循环重播。直播间背景不变。仅根据以下真实游戏状态播报，每分钟自检播报只简短说正在搭哪栋建筑的哪部分，不报数字、方块数、票数、倒计时、镜头状态或其它统计：'+JSON.stringify(await luantiState());}
