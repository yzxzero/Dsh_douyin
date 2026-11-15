import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { projectProcessKind, windowsArguments, samePath } from '../lib/live-processes.mjs';

test('仅匹配本项目专用浏览器、游戏及已校验启动时间的服务',()=>{
  const root='D:\\直播项目\\Dsh_douyin',runtime='D:\\直播项目\\Luanti-runtime',jar='D:\\直播项目\\Luanti\\Luanti.jar';
  const control={app:'dafeiyu-live',root,pid:100,processStartedAt:100000};
  const check=proc=>projectProcessKind(proc,{root,runtime,jar,control});
  assert.equal(check({name:'chrome.exe',commandLine:null}),null);
  assert.deepEqual(windowsArguments('chrome.exe --user-data-dir="D:\\has space\\data"'),['chrome.exe','--user-data-dir=D:\\has space\\data']);
  assert.equal(check({name:'chrome.exe',commandLine:`chrome.exe --user-data-dir="${root}\\data\\chrome-live"`}), 'window');
  assert.equal(check({name:'chrome.exe',commandLine:`chrome.exe "--user-data-dir=${root}\\data\\chrome-admin"`}), 'window');
  assert.equal(check({name:'chrome.exe',commandLine:'chrome.exe --profile-directory=Default'}),null);
  assert.equal(check({name:'chrome.exe',commandLine:`chrome.exe --user-data-dir="${root}\\data\\chrome-live-other"`}),null);
  assert.equal(check({name:'node.exe',pid:100,startedAt:new Date(100000).toISOString(),commandLine:'node.exe server.mjs'}),'server');
  assert.equal(check({name:'node.exe',pid:100,startedAt:new Date(200000).toISOString(),commandLine:'node.exe server.mjs'}),null);
  assert.equal(check({name:'node.exe',pid:101,startedAt:new Date(100000).toISOString(),commandLine:'node.exe server.mjs'}),null);
  assert.equal(check({name:'luanti.exe',commandLine:`"${runtime}\\bin\\luanti.exe" -D`}), 'game');
  assert.equal(check({name:'luanti.exe',commandLine:`"${runtime}\\other\\bin\\luanti.exe" -D`}), null);
  // 关闭脚本曾因大小写差异拒绝关闭：控制记录写 d:\... 而 ROOT 是 D:\...。
  assert.equal(samePath('d:\\dafeiyu\\Dsh_douyin','D:\\dafeiyu\\Dsh_douyin'),true);
  assert.equal(samePath('D:\\dafeiyu\\Dsh_douyin\\','D:\\dafeiyu\\Dsh_douyin'),true);
  assert.equal(samePath('d:\\dafeiyu\\other','D:\\dafeiyu\\Dsh_douyin'),false);
  assert.equal(samePath(undefined,'D:\\dafeiyu\\Dsh_douyin'),false);
});

test('真实服务：总开关持久化、禁止游戏入口；凭据保护的一键关闭保存互动并退出', {timeout:25000},async()=>{
  const root=await mkdtemp(new URL('./control-server-',import.meta.url));
  let child,logs='';const port=18880,base=`http://127.0.0.1:${port}`;
  const request=(p,body,headers={})=>fetch(base+p,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  try{
    await cp(new URL('../lib',import.meta.url),join(root,'lib'),{recursive:true});
    await cp(new URL('../vendor',import.meta.url),join(root,'vendor'),{recursive:true});
    await copyFile(new URL('../server.mjs',import.meta.url),join(root,'server.mjs'));
    await cp(new URL('../tools',import.meta.url),join(root,'tools'),{recursive:true});
    await writeFile(join(root,'config.json'),JSON.stringify({demo:false,gameplay:{enabled:false},danmaku:{mode:'off'},ai:{enabled:false},voice:{enabled:false},
      novel:{enabled:false,auto:false},broadcast:{enabled:false,forced:'luanti'},music:{autoPlaylist:false},guide:{greet:false,tipEverySec:0,idleEverySec:0}}));
    child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),DEEPSEEK_API_KEY:'',LUANTI_HOME:join(root,'no-native-game')},windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
    for(let i=0;i<100;i++){try{if((await request('/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
    const state=await (await request('/api/state')).json();
    assert.equal(state.broadcast.mode,'chat');assert.equal(state.luantiSession.enabled,false);
    for(const [p,body] of [['/api/luanti/start',{}],['/api/luanti/command',{action:'start'}],['/api/luanti/command',{action:'auto',enabled:true}],['/api/broadcast',{mode:'luanti'}],['/api/broadcast',{mode:'game'}]])
      assert.equal((await request(p,body)).status,403,p);
    assert.equal((await (await request('/api/config',{gameplay:{enabled:'no'}})).json()).ok,false);
    assert.equal((await (await request('/api/config',{gameplay:{enabled:true}})).json()).config.gameplay.enabled,true);
    assert.equal((await (await request('/api/config',{gameplay:{enabled:false}})).json()).config.gameplay.enabled,false);
    assert.equal(JSON.parse(await readFile(join(root,'config.json'),'utf8')).gameplay.enabled,false);
    assert.equal((await request('/api/shutdown',{})).status,403);
    assert.equal((await request('/api/shutdown',{}, {'X-Dafeiyu-Control':'wrong'})).status,403);
    assert.equal((await request('/api/health')).ok,true);
    await request('/api/event',{userId:'shutdown-user',username:'收播测试',kind:'like',count:6});
    const stream=await request('/api/events');const reader=stream.body.getReader();await reader.read();
    const control=JSON.parse(await readFile(join(root,'data/server-control.json'),'utf8'));
    assert.equal(control.pid,child.pid);assert.equal(control.root,root);
    async function runStop(args){
      const cli=spawn(process.execPath,['tools/stop-live.mjs',...args],{cwd:root,env:{...process.env,LUANTI_HOME:join(root,'no-native-game')},windowsHide:true,stdio:['ignore','pipe','pipe']});
      let output='';cli.stdout.on('data',b=>output+=b);cli.stderr.on('data',b=>output+=b);
      const [code]=await once(cli,'exit');assert.equal(code,0,output);return output;
    }
    assert.match(await runStop(['--dry-run']),/不会关闭或修改/);
    assert.equal((await request('/api/health')).ok,true);
    const exited=once(child,'exit');
    assert.match(await runStop([]),/直播间已关闭/);
    let events='';for(;;){const {done,value}=await reader.read();if(done)break;events+=new TextDecoder().decode(value);}
    assert.match(events,/"type":"shutdown"/);
    const [code]=await exited;assert.equal(code,0,logs);child=null;
    const viewers=JSON.parse(await readFile(join(root,'data/viewers.json'),'utf8'));
    assert.equal(viewers['douyin:shutdown-user'].counts.like,6);
    assert.equal(JSON.parse(await readFile(join(root,'data/state.json'),'utf8')).likes,6);
    await assert.rejects(readFile(join(root,'data/server-control.json')),/ENOENT/);
    await assert.rejects(request('/api/health'));
  }finally{if(child){const exited=once(child,'exit');child.kill();await exited;}await rm(root,{recursive:true,force:true});}
});
