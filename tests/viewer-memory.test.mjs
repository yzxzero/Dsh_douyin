import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewerMemory, familiarLine, memoryPrompt, positiveCount } from '../lib/viewer-memory.mjs';
import { mapChat, mapGift, mapLike, mapMember, mapSocial } from '../lib/cortico.mjs';
import { mkdtemp, cp, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('平台 ID 保留精度，改名沿用记忆，同名不同 ID 分开，未知观众不合并', () => {
  const memory = new ViewerMemory();
  const raw = {user:{id:{toString:()=> '999999999999999999'},nickName:'七月'},common:{msgId:'event-1'},content:'你好'};
  for (const ev of [mapChat(raw),mapGift({...raw,gift:{name:'玫瑰'}}),mapLike(raw),mapMember(raw),mapSocial({...raw,action:1})]) {
    assert.equal(ev.userId,'999999999999999999');
    assert.equal(ev.messageId,'event-1');
  }
  assert.equal(mapSocial({...raw,action:3}),null);
  assert.equal(mapGift({...raw,totalCount:0,repeatCount:3,gift:{name:'玫瑰'}}).count,3);
  const first = memory.remember(mapChat(raw));
  assert.equal(first.known,false);
  const renamed = memory.remember({kind:'enter',userId:raw.user.id.toString(),username:'新昵称'});
  assert.equal(renamed.known,true);
  assert.equal(renamed.history.counts.chat,1);
  assert.equal(memory.remember({kind:'enter',userId:'other',username:'新昵称'}).known,false);
  assert.equal(memory.remember({kind:'like',username:'神秘观众'}),null);
});

test('累计互动，当前事件不伪装为历史，日期切换保留记忆', () => {
  const memory = new ViewerMemory();
  const base={userId:'a',username:'七月',ts:Date.parse('2026-11-11T12:00:00+08:00')};
  const first = memory.remember({...base,kind:'gift',gift:{name:'小心心',count:3,price:.1}});
  assert.equal(familiarLine(first,'七月'),'');
  memory.remember({...base,kind:'like',count:27});
  memory.remember({...base,kind:'follow'});
  for(let i=0;i<5;i++)memory.remember({...base,kind:'chat',text:'评论'+i});
  const back = memory.remember({...base,kind:'enter',ts:base.ts+86400000});
  assert.match(familiarLine(back,'七月'),/小心心/);
  assert.match(memoryPrompt(back),/评论4/);
  assert.equal(back.history.counts.like,27);
  assert.equal(back.history.comments.length,3);
  assert.equal(memory.donors('2026-11-12').length,0);
  const restored = new ViewerMemory(JSON.parse(JSON.stringify(memory)));
  assert.equal(restored.remember({...base,kind:'enter'}).history.counts.gift,3);
  assert.equal(restored.mayAcknowledge('a',1000),true);
  assert.equal(restored.mayAcknowledge('a',1001),false);
  assert.equal(restored.mayAcknowledge('a',62000),true);
  assert.equal(positiveCount(Infinity),1);
});

test('真实服务器离线流程：送礼榜、点赞计数、重启记忆和熟客欢迎', {timeout:20000}, async () => {
  const root=await mkdtemp(new URL('./memory-server-',import.meta.url));
  let child, logs='';
  const port=18879;
  const base=`http://127.0.0.1:${port}`;
  const api=async (path,body)=> (await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})).json();
  async function start() {
    child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),DEEPSEEK_API_KEY:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
    child.stdout.on('data',b=>logs+=b); child.stderr.on('data',b=>logs+=b);
    for(let i=0;i<80;i++) { try {if((await api('/api/health')).ok)return;}catch{} await new Promise(r=>setTimeout(r,50)); }
    throw new Error('测试服务启动失败：'+logs);
  }
  async function stop() {const ended=once(child,'exit'); child.kill(); await ended; child=null;}
  try {
    await cp(new URL('../lib',import.meta.url),join(root,'lib'),{recursive:true});
    await cp(new URL('../vendor',import.meta.url),join(root,'vendor'),{recursive:true});
    await copyFile(new URL('../server.mjs',import.meta.url),join(root,'server.mjs'));
    await writeFile(join(root,'config.json'),JSON.stringify({demo:false,danmaku:{mode:'off'},ai:{enabled:true,apiKey:'',minReplyGapMs:1,maxRepliesPerMinute:100},reply:{auto:true},
      voice:{enabled:false},novel:{enabled:false,auto:false},story:{enabled:false},broadcast:{enabled:false},music:{autoPlaylist:false},
      guide:{greet:true,greetVoice:false,greetGapSec:0,tipEverySec:0,idleEverySec:0}}));
    await start();
    const resized = await api('/api/config', {scene:{petScale:1.5}});
    assert.equal(resized.config.scene.petScale,1.5);
    const rejected = await api('/api/config', {scene:{petScale:0}});
    assert.equal(rejected.ok,false);
    assert.equal((await api('/api/state')).config.scene.petScale,1.5);
    const user={userId:'stable-1',username:'七月'};
    await api('/api/event',{...user,kind:'chat',text:'喜欢听动漫配乐',messageId:'chat-1'});
    await api('/api/event',{...user,kind:'gift',giftName:'小心心',count:3,messageId:'gift-1'});
    const duplicate=await api('/api/event',{...user,kind:'gift',giftName:'小心心',count:3,messageId:'gift-1'});
    assert.equal(duplicate.duplicate,true);
    await api('/api/event',{...user,kind:'like',count:27,messageId:'like-1'});
    await api('/api/event',{...user,kind:'like',count:5,messageId:'like-2'});
    await api('/api/event',{userId:'stable-2',username:'新观众',kind:'like',count:3,messageId:'like-3'});
    await new Promise(r=>setTimeout(r,200));
    const state=await api('/api/state');
    assert.equal(typeof state.luantiSession?.autoStatus?.message,'string');
    assert.equal(state.stats.likes,35);
    assert.equal(state.events.filter(e=>e.kind==='ai'&&e.source==='command'&&/点赞|心意/.test(e.text)).length,1);
    assert.equal(state.stats.giftDonors[0].count,3);
    assert.equal(state.stats.giftDonors[0].username,'七月');
    assert.equal(JSON.stringify(state).includes('stable-1'),false);
    // 等待保存计时器，模拟服务被系统终止后重新启动。
    await new Promise(r=>setTimeout(r,1500));
    const saved=JSON.parse(await readFile(join(root,'data/viewers.json'),'utf8'));
    assert.equal(saved['douyin:stable-1'].counts.chat,1);
    await stop(); await start();
    assert.equal((await api('/api/state')).config.scene.petScale,1.5);
    assert.equal((await api('/api/config',{scene:{petScale:1}})).config.scene.petScale,1);
    await api('/api/event',{...user,username:'七月新昵称',kind:'enter',messageId:'enter-2'});
    await new Promise(r=>setTimeout(r,250));
    const back=await api('/api/state');
    assert.ok(back.events.some(e=>e.kind==='ai' && /七月新昵称/.test(e.text) && /小心心/.test(e.text)),JSON.stringify(back.events));
  } finally { if(child)await stop(); await rm(root,{recursive:true,force:true}); }
});
