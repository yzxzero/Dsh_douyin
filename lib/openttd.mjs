import {spawn} from 'node:child_process';
import {readFile,appendFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {ROOT} from './config.mjs';
export const OPENTTD_HOME=path.resolve(ROOT,'../OpenTTD/openttd-15.3-windows-win64');
const exe=path.join(OPENTTD_HOME,'openttd.exe');
const python='C:/Users/yingzhu.xia/.workbuddy/binaries/python/versions/3.13.12/python.exe';
let server,client,capture,admin,starting,closing,paused=false,clientJoined=false,last=null,roundId='',logBuffer='';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const alive=p=>p&&p.exitCode===null&&!p.killed;
function packet(type,payload){const b=Buffer.alloc(3+payload.length);b.writeUInt16LE(b.length);b[2]=type;payload.copy(b,3);admin.write(b);}
const send=cmd=>{if(!admin||admin.destroyed)throw new Error('OpenTTD 控制连接未运行');packet(5,Buffer.from(cmd+'\0'));};
async function connectAdmin(password){
 await new Promise((resolve,reject)=>{
  admin=net.createConnection({host:'127.0.0.1',port:3980});let data=Buffer.alloc(0);
  const timer=setTimeout(()=>reject(new Error('OpenTTD 控制连接超时')),5000);
  admin.on('error',reject);
  admin.on('connect',()=>packet(0,Buffer.from([password,'Dafeiyu','1.0',''].join('\0'))));
  admin.on('data',chunk=>{data=Buffer.concat([data,chunk]);while(data.length>=3&&data.length>=data.readUInt16LE()){
   const len=data.readUInt16LE(),type=data[2],p=data.subarray(3,len);data=data.subarray(len);
   if(type===102){clearTimeout(timer);reject(new Error('OpenTTD 认证错误 '+p[0]));}
   if(type===104){const freq=Buffer.alloc(4);freq.writeUInt16LE(6);freq.writeUInt16LE(64,2);packet(2,freq);clearTimeout(timer);resolve();}
   if(type===121)output(Buffer.from(p.toString().replaceAll('\0',' ')+'\n'));
   if(type===120)output(Buffer.from(p.subarray(2).toString().replaceAll('\0',' ')+'\n'));
  }});
 });
}
export async function openttdState(){
 const online=!!alive(server)&&!!alive(client);
 return {online,playing:online&&clientJoined,gameOver:false,ready:online&&clientJoined&&last!==null,roundId,paused,auto:!paused,
   ...last,activity:paused?'暂停经营':last?.activity==='operating'?'经营城市公交':last?.activity==='no-route'?'寻找可经营线路':'规划车站与公交线路'};
}
function output(chunk){
 const s=chunk.toString();appendFile(path.join(OPENTTD_HOME,'live.log'),s).catch(()=>{});
 if(s.includes('joined as DafeiyuViewer'))clientJoined=true;
 logBuffer+=s;
 for(const line of logBuffer.split(/\r?\n/).slice(0,-1)){
  const match=line.match(/WHALE_STATE (\{.*\})/);
  if(match){try{last=JSON.parse(match[1]);}catch{}}
 }
 logBuffer=logBuffer.split(/\r?\n/).at(-1).slice(-20000);
}
export function launchOpenTTD(){
 if(starting)return starting;
 starting=(async()=>{
  if((await openttdState()).online)return;
  if(alive(server)||alive(client))await openttdCommand({action:'exit'});
  last=null;paused=false;clientJoined=false;roundId=String(Date.now());logBuffer='';
  await mkdir(path.join(OPENTTD_HOME,'save'),{recursive:true});
  const save=path.join(OPENTTD_HOME,'save/dafeiyu-live.sav');
  const password=randomBytes(20).toString('hex');
  const cfg=(await readFile(path.join(OPENTTD_HOME,'openttd.cfg'),'utf8')).replace('[network]','[network]\nadmin_password = '+password+'\nserver_admin_port = 3980\nallow_insecure_admin_login = true');
  await writeFile(path.join(OPENTTD_HOME,'server-live.cfg'),cfg);
  server=spawn(exe,['-D','127.0.0.1:3979','-c',path.join(OPENTTD_HOME,'server-live.cfg'),'-d','script=4',...(existsSync(save)?['-g',save]:[])],{cwd:OPENTTD_HOME,windowsHide:true,stdio:'ignore'});
  server.on('error',e=>output(Buffer.from(e.message)));
  await wait(3500);
  if(!alive(server))throw new Error('OpenTTD 启动失败，请查看 OpenTTD/live.log');
  await connectAdmin(password);
  if(!existsSync(save))send('start_ai WhaleTransit');
  send('unpause');
  for(let i=0;i<100&&!last?.focus;i++)await wait(200);
  if(last?.focus)await writeFile(path.join(OPENTTD_HOME,'scripts/on_client.scr'),'scrollto '+last.focus+'\n');
  client=spawn(exe,['-c',path.join(OPENTTD_HOME,'client.cfg'),'-n','127.0.0.1:3979#255','-r','1280x720'],{cwd:OPENTTD_HOME,windowsHide:false,stdio:'ignore'});
  client.on('error',()=>{});
  await wait(3500);
  capture=spawn(python,[path.join(ROOT,'tools/openttd-capture.py'),String(client.pid)],{cwd:ROOT,windowsHide:true,stdio:'ignore'});capture.on('error',()=>{});
  for(let i=0;i<100;i++){if(last&&clientJoined)return; if(!alive(server))break;await wait(250);}
  throw new Error('公交控制器尚未就绪，请查看 OpenTTD/live.log');
 })().catch(async e=>{await openttdCommand({action:'exit'}).catch(()=>{});throw e;}).finally(()=>{starting=null;});
 return starting;
}
export async function openttdFrame(){
 if(!(await openttdState()).online)throw new Error('游戏未启动');
 const res=await fetch('http://127.0.0.1:8867/',{signal:AbortSignal.timeout(2500)});
 if(!res.ok)throw new Error('请保持 OpenTTD 窗口展开');return Buffer.from(await res.arrayBuffer());
}
export async function openttdCommand(body){
 if(body.action==='exit'){
  if(closing)return closing;
  closing=(async()=>{
   if(alive(server)){send('save dafeiyu-live');await wait(1500);send('quit');await wait(800);}
   admin?.destroy();for(const p of [capture,client,server])if(alive(p))p.kill();
   last=null;
  })().finally(()=>{closing=null;});await closing;return {ok:true};
 }
 if(body.action==='start'){send('unpause');paused=false;return {ok:true};}
 if(body.action==='save'){send('save dafeiyu-live');return {ok:true};}
 if(body.action==='pause'||body.action==='auto'||body.action==='strategy'){
  if(body.action==='strategy'&&!['pause','auto'].includes(body.strategy))throw new Error('当前支持暂停经营、继续经营');
  paused=body.action==='pause'?body.paused!==false:body.action==='auto'?body.enabled===false:body.strategy==='pause';
  send(paused?'pause':'unpause');return {ok:true,paused};
 }
 throw new Error('未知运输操作');
}
export async function openttdContext(){return '当前玩 OpenTTD，固定策略自动经营城市公交。观众可发暂停经营或继续经营，其他线路想法供讨论。只依据以下真实数据描述，不声称建了铁路、飞机或执行未发生的动作：'+JSON.stringify(await openttdState());}

