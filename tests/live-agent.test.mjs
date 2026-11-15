import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {LiveAgent,parseDecision,finishSpeech,similar} from '../lib/live-agent.mjs';

test('输出验证：拒绝损坏JSON、未知动作、超长回复；结尾恰好一次，最多一个表情',()=>{
  assert.equal(parseDecision('随便说一句'),null);
  assert.equal(parseDecision('{"action":"execute"}'),null);
  assert.equal(parseDecision(JSON.stringify({action:'speak',text:'鱼'.repeat(181)})),null);
  assert.equal(parseDecision('{"action":"silence","text":"不应该播出"}').text,'');
  assert.equal(finishSpeech('好耶🐟🐠token来token来'),'好耶🐟token来');
});
test('相似弹幕合并计数，模型归纳写入本场摘要；近似重复回答被抑制',()=>{
  const a=new LiveAgent(()=>10000);
  const c=a.context([{kind:'chat',text:'今天吃什么？',username:'甲'},{kind:'chat',text:'今天吃什么!',username:'乙'}]);
  assert.equal(c.recent.length,1);assert.equal(c.recent[0].count,2);
  a.remember('海底城市正在搭建中央大道啦token来');
  assert.equal(similar('海底城市正在搭建中央大道啦','海底城市正在搭建中央大道呀'),true);
  assert.equal(a.accept({action:'speak',text:'海底城市正在搭建中央大道呀',summary:'两位观众问吃什么'}),false);
  assert.equal(a.summary,'两位观众问吃什么');
});
test('无人回应不连续提问，同话题冷却，逐步退让，聊天恢复后可接话',()=>{
  let now=10000;const a=new LiveAgent(()=>now);
  a.remember('你喜欢蓝色还是金色？','颜色',true);
  now+=60000;
  assert.equal(a.accept({action:'speak',text:'今天吃面还是吃饭？',topic:'美食',question:true},true),false);
  assert.equal(a.accept({action:'speak',text:'金色窗户真暖和',topic:'颜色'},true),false);
  assert.equal(a.quietTurns,2);
  now+=1000;a.noteAudience('chat');
  assert.equal(a.quietTurns,0);
  assert.equal(a.accept({action:'speak',text:'我也喜欢面条，你爱哪种汤底？',topic:'美食',question:true}),true);
  a.reset();assert.equal(a.summary,'');assert.equal(a.spoken.length,0);
});

async function replyHarness(decide) {
  const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const events=[],sent=[];
  const ctx=vm.createContext({
    liveAgent:new LiveAgent(),finishSpeech,speechUntil:0,shuttingDown:false,
    getConfig:()=>({agent:{enabled:true},ai:{enabled:true,apiKey:'mock'},voice:{enabled:true},novel:{}}),
    getState:()=>({events:[]}),replyPhase:()=> 'voice',activeNovel:()=>null,
    memoryPrompt:()=>'',broadcastView:()=>({mode:'chat'}),agentDecision:decide,
    speakReply:async()=>'/mock.mp3',addAiEvent:e=>e,pushEvent:e=>events.push(e),enqueueReply:t=>sent.push(t),lastReplyText:'',
  });
  vm.runInContext(source.slice(source.indexOf('async function doReply(job)'),source.indexOf('// ---------- 指令解析')),ctx);
  return {ctx,events,sent};
}
test('真实回复路由：模型沉默不合成不发送，回复正常进入语音和公屏队列',async()=>{
  const h=await replyHarness(async()=>({action:'silence',text:'',summary:'问题已回答'}));
  await h.ctx.doReply({kind:'chat',username:'甲',text:'重复问题'});
  assert.equal(h.events.length,0);assert.equal(h.sent.length,0);
  h.ctx.agentDecision=async()=>({action:'speak',text:'这一局输了也没关系，下局慢慢来',summary:'观众说输了游戏'});
  await h.ctx.doReply({kind:'chat',username:'甲',text:'输了'});
  assert.equal(h.events[0].voice,'/mock.mp3');assert.match(h.sent[0],/token来$/);
});
test('合成期间清场，旧回复不能进入新场直播',async()=>{
  const h=await replyHarness(async()=>({action:'speak',text:'旧场的回复'}));
  h.ctx.speakReply=async()=>{h.ctx.liveAgent.reset();return '/old.mp3';};
  await h.ctx.doReply({kind:'chat',username:'甲',text:'上一场的问题'});
  assert.equal(h.sent.length,0);
});
