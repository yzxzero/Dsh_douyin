import test from 'node:test';
import assert from 'node:assert/strict';
import { WesnothDirector, parseGameSuggestion, gameProgress, gameIdleSeconds, roundSummary } from '../lib/wesnoth-director.mjs';

function fixture(saved) {
  const w={now:1000000,forced:null,audience:true,blocked:false,activity:600000,cfg:{},commands:[],messages:[],writes:[],launches:0,
    state:{online:true,playing:false,gameOver:false,roundId:'',wave:1,auto:true,ts:1000000}};
  const hooks={config:()=>w.cfg,mode:()=>w.forced || 'chat',forced:()=>w.forced,hasAudience:()=>w.audience,blocked:()=>w.blocked,
    activityAt:()=>w.activity,now:()=>w.now,state:async()=>structuredClone(w.state),sleep:async()=>{},
    launch:async()=>{w.launches++;w.state.online=true;},command:async c=>{
      w.commands.push(c);
      if(c.action==='start')Object.assign(w.state,{playing:true,gameOver:false,roundId:'r1'});
      if(c.action==='exit')w.state.online=false;
    },setMode:async forced=>{w.forced=forced;},
    announce:async(text,source)=>{w.messages.push({text,source});return{id:w.messages.length,voice:'summary.wav'};},
    persist:async data=>w.writes.push(data),onClosed:()=>{w.activity=w.now;}};
  return {w,hooks,d:new WesnothDirector(hooks,saved)};
}

test('游戏总开关拦截自动、手动开局及观众操作，重新开启保留自动设置',async()=>{
  const {w,d}=fixture();w.cfg={enabled:false,autoStart:true};w.state.online=false;
  assert.equal(d.view().enabled,false);assert.equal(d.view().autoStatus.code,'not-allowed');
  await assert.rejects(d.start(),/已关闭/);await d.tick();
  assert.equal(w.launches,0);assert.equal(await d.suggest('先挖铜','七月'),null);
  w.cfg.enabled=true;await d.start();assert.equal(d.phase,'active');assert.equal(w.launches,1);
  w.cfg.enabled=false;await d.tick();
  assert.equal(d.phase,'idle');assert.equal(w.forced,null);assert.equal(w.state.online,false);
  assert.equal(w.commands.filter(c=>c.action==='exit').length,1);
  assert.equal(w.messages.length,0);
  await d.tick();assert.equal(w.launches,1);assert.equal(w.cfg.autoStart,true);
});

test('游戏启动中关闭总开关会取消开局并退出，不发布游戏场景',async()=>{
  const {w,hooks,d}=fixture();let release,entered;
  const ready=new Promise(resolve=>{entered=resolve;});
  hooks.launch=()=>new Promise(resolve=>{release=resolve;entered();});
  const starting=d.start();const rejected=assert.rejects(starting,/取消/);await ready;
  w.cfg.enabled=false;const stopping=d.stop();release();
  await rejected;await stopping;
  assert.equal(w.forced,null);assert.equal(d.phase,'idle');
  assert.equal(w.commands.some(c=>c.action==='start'),false);assert.equal(w.state.online,false);
});

test('关闭期间不发布等待中的总结，也不恢复游戏场景',async()=>{
  const {w,hooks,d}=fixture();await d.start();let release,entered;
  const ready=new Promise(resolve=>{entered=resolve;});
  hooks.announce=()=>new Promise(resolve=>{release=resolve;entered();});
  const finishing=d.finish(w.state,'manual');await ready;
  w.cfg.enabled=false;await d.stop();release({id:1,voice:'summary.wav'});await finishing;
  assert.equal(d.phase,'idle');assert.equal(w.forced,null);assert.equal(d.data.history.length,0);
});

test('只在聊天空闲且有直播页时自动开局，保留原先的自动场景设置',async()=>{
  const {w,d}=fixture();
  w.audience=false;await d.tick();assert.equal(w.launches,0);
  w.audience=true;w.blocked=true;await d.tick();assert.equal(w.launches,0);
  w.blocked=false;w.activity=w.now-299000;await d.tick();assert.equal(w.launches,0);
  w.activity=w.now-301000;await Promise.all([d.tick(),d.tick()]);
  assert.equal(w.launches,1);assert.equal(w.forced,'wesnoth');assert.equal(d.phase,'active');
  assert.equal(d.data.session.previousForced,null);
  assert.equal(w.messages.filter(m=>m.source==='wesnoth-start').length,1);
});

test('游戏暖场独立为60秒，非游戏沿用原间隔；无真实进展时不编造',()=>{
  assert.equal(gameIdleSeconds({guide:{idleEverySec:30}},'chat'),30);
  assert.equal(gameIdleSeconds({guide:{idleEverySec:0}},'chat'),0);
  assert.equal(gameIdleSeconds({guide:{idleEverySec:30}},'wesnoth'),60);
  assert.equal(gameIdleSeconds({wesnoth:{idleTalkSec:90}},'wesnoth'),90);
  assert.match(gameProgress({online:true,playing:true,auto:true,ready:true,activity:'按默认策略作战',turn:4,units:3,enemies:2,gold:82}),/第4回合.*3名单位.*2名.*82金币/);
  assert.equal(gameProgress({online:false}), '');
  assert.equal(gameProgress({online:true,playing:true,gameOver:true}), '');
});

test('观众建议只转成限定策略，处理否定、限频、实际失败和游戏结束',async()=>{
  const {w,d}=fixture();await d.start();
  assert.equal(parseGameSuggestion('不要多建炮塔'),null);
  assert.equal(parseGameSuggestion('为什么不建炮塔？'),null);
  assert.equal(parseGameSuggestion('删除所有存档'),null);
  assert.equal(parseGameSuggestion('暂停战斗').strategy,'pause');
  assert.equal(parseGameSuggestion('先别建造了'),null);
  assert.equal((await d.suggest('暂停战斗','七月')).applied,true);
  assert.deepEqual(w.commands.at(-1),{action:'strategy',strategy:'pause'});
  assert.equal((await d.suggest('继续战斗','另一位')).applied,false);
  w.now+=11000;w.state.gameOver=true;
  assert.equal(await d.suggest('继续战斗','七月'),null);
  assert.equal(d.data.session.acceptedIdeas,1);
});

test('结束只总结一次，等待语音确认后退出，再恢复背景并进入冷却',async()=>{
  const {w,d}=fixture();await d.start();
  Object.assign(w.state,{gameOver:true,outcome:'loss',ready:true,turn:7,units:12,enemies:8,gold:28});
  await Promise.all([d.tick(),d.tick()]);
  assert.equal(d.phase,'waiting');assert.equal(w.forced,'wesnoth');
  assert.equal(w.commands.filter(c=>c.action==='exit').length,0);
  assert.match(w.messages.at(-1).text,/第7回合.*12名单位.*8名.*28/);
  await d.tick();assert.equal(w.messages.length,1);
  assert.equal(d.summaryEnded(999,true),false);
  assert.equal(d.summaryEnded(1,false),true);
  assert.ok(d.data.session.closeAt>=w.now+5000);
  w.now+=4000;assert.equal(d.summaryEnded(1,true),true);await d.tick();
  assert.equal(d.phase,'idle');assert.equal(w.forced,null);
  assert.equal(w.commands.filter(c=>c.action==='exit').length,1);
  w.activity=w.now-400000;await d.tick();assert.equal(w.launches,1);
  w.now+=1801000;await d.tick();assert.equal(w.launches,2);
});

test('无语音时文字停留后退出，服务重启不重复播总结',async()=>{
  const {w,hooks,d}=fixture();hooks.announce=async(text,source)=>{w.messages.push({text,source});return{id:3,voice:''};};
  await d.start();w.state.gameOver=true;await d.tick();
  assert.equal(d.phase,'waiting');w.now+=4000;await d.tick();assert.equal(d.phase,'waiting');
  const resumed=new WesnothDirector(hooks,structuredClone(d.data));
  w.now+=2000;await resumed.tick();assert.equal(resumed.phase,'idle');assert.equal(w.messages.length,1);
});

test('退出失败会重试且不会先隐藏游戏，人工切换场景时不覆盖人工选择',async()=>{
  const {w,hooks,d}=fixture();await d.start();await d.finish(w.state,'manual');w.now+=100000;
  const real=hooks.command;hooks.command=async()=>{throw new Error('temporary');};
  await assert.rejects(d.tick(),/temporary/);assert.equal(d.phase,'closing');assert.equal(w.forced,'wesnoth');
  hooks.command=real;w.forced='story';await d.tick();assert.equal(w.forced,'story');assert.equal(d.phase,'idle');
});

test('断线总结明确为最后记录，胜负取真实标记',()=>{
  assert.match(roundSummary({wave:2},'disconnected'),/最后收到的数据/);
  assert.match(roundSummary({ready:true,turn:3,units:3,enemies:2,gold:100}),/3名单位/);
  assert.match(roundSummary({}),/没有收到完整战况/);
});

test('保存为游戏场景但原生进程已关闭时，可自动恢复启动',async()=>{
  const {w,d,hooks}=fixture();w.forced='wesnoth';w.state.online=false;
  let starts=0;hooks.onStarted=()=>starts++;
  await d.tick();assert.equal(w.launches,1);assert.equal(d.phase,'active');assert.equal(starts,1);
  assert.equal(d.data.session.previousForced,'chat');
});

test('等待玩家生成后才接受建议，失败的操作不记成已采纳',async()=>{
  const {w,d,hooks}=fixture();let reads=0;
  hooks.state=async()=>({...structuredClone(w.state),ready:++reads>=3});
  await d.start();assert.ok(reads>=3);assert.equal(d.phase,'active');
  hooks.command=async()=>{throw new Error('not confirmed');};
  await assert.rejects(d.suggest('暂停战斗','七月'),/not confirmed/);
  assert.equal(d.data.session.acceptedIdeas,0);
  hooks.state=async()=>({...w.state,ready:false});
  assert.equal((await d.suggest('暂停战斗','七月')).applied,false);
});

test('新直播不继承上一场的冷却，但本场结束后保留十分钟间隔',async()=>{
  const {w,d}=fixture({lastFinishedAt:900000,lastAttemptAt:850000});
  assert.equal(d.automaticStatus().code,'ready');
  await d.tick();assert.equal(w.launches,1);
  await d.finish(w.state,'manual');w.now+=100000;await d.tick();
  w.activity=w.now-400000;
  assert.equal(d.automaticStatus().code,'cooldown');
  assert.equal(d.automaticStatus().remainingSec,600);
});

test('评论持续刷新空闲时间也不能让聊天超过十分钟不开局',async()=>{
  const {w,d}=fixture();
  for(let i=0;i<19;i++){w.activity=w.now;await d.tick();assert.equal(w.launches,0);w.now+=30000;}
  w.activity=w.now;await d.tick();assert.equal(w.launches,0);
  w.now+=30000;w.activity=w.now;await d.tick();assert.equal(w.launches,1);
});

test('等待原因包含剩余秒数，断开五分钟后再连接视为新直播',async()=>{
  const {w,d}=fixture();w.activity=w.now;
  assert.equal(d.automaticStatus().remainingSec,300);
  w.audience=false;await d.tick();assert.equal(d.automaticStatus().code,'no-audience');
  w.now+=301000;w.audience=true;d.data.lastFinishedAt=w.now-1000;
  await d.tick();assert.equal(w.launches,1);
});

