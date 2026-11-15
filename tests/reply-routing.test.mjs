import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createEventDeduplicator, isLikeAckEcho, isReplyEcho, isSelfChat } from '../lib/reply-echo.mjs';
import { buildMessages, identityReply } from '../lib/persona.mjs';
import { LiveAgent, finishSpeech } from '../lib/live-agent.mjs';

test('only recent outgoing chat from the sending account is an echo', () => {
  const outbox = [{text:'你好',createdAt:1000,status:'pending'}];
  assert.equal(isReplyEcho({username:'主播',text:'你好'},outbox,'主播',2000),true);
  assert.equal(isReplyEcho({username:'观众',text:'你好'},outbox,'主播',2000),false);
  assert.equal(isReplyEcho({username:'主播',text:'手动新消息'},outbox,'主播',2000),false);
  assert.equal(isReplyEcho({username:'主播',text:'你好'},outbox,'主播',122000),false);
  assert.equal(isReplyEcho({username:'主播',text:'你好'},outbox,'',2000),false);
  assert.equal(isReplyEcho({kind:'gift',username:'主播',text:'你好'},outbox,'主播',2000),false);
});

test('self chat never re-enters the audience pipeline, even without an outbox match', () => {
  assert.equal(isSelfChat({username:'深海女仆',text:'手动新消息'},'深海女仆'),true);
  assert.equal(isSelfChat({username:'观众',text:'手动新消息'},'深海女仆'),false);
  assert.equal(isSelfChat({kind:'gift',username:'深海女仆'},'深海女仆'),false);
});

test('old extension like-thanks echoes are blocked without dropping real platform likes', () => {
  assert.equal(isLikeAckEcho({kind:'like',source:'extension',username:'收到 lanyuyu 的'}),true);
  assert.equal(isLikeAckEcho({kind:'like',source:'extension',username:'谢谢 七月 的'}),true);
  assert.equal(isLikeAckEcho({kind:'like',source:'extension',username:'lanyuyu'}),false);
  assert.equal(isLikeAckEcho({kind:'like',source:'cortico',username:'收到 点赞'}),false);
});

test('cortico and extension copies of one chat are deduplicated together', () => {
  let now = 10000;
  const duplicate = createEventDeduplicator(() => now);
  const chat = {kind:'chat',username:'七月',text:'走了，加油'};
  assert.equal(duplicate({...chat,userId:'123',messageId:'msg-1'}),false);
  assert.equal(duplicate({...chat,source:'extension'}),true);
  now += 4001;
  assert.equal(duplicate(chat),false);
  assert.equal(duplicate({...chat,text:'另一条',messageId:'msg-1'}),true);
  assert.equal(duplicate({kind:'gift',username:'七月',text:'小心心'}),false);
  assert.equal(duplicate({kind:'gift',username:'七月',text:'小心心'}),false);
});

test('identity questions have one exact answer without asking the model', () => {
  for (const text of ['你是谁？','你叫什么名字','你到底是谁呀','做个自我介绍吧']) {
    assert.equal(identityReply(text),'我是深海女仆大肥鱼呀');
  }
  assert.equal(identityReply('我是谁'),'');
  assert.equal(identityReply('今天读什么'),'');
});

test('the current chat is not duplicated in model context', () => {
  const current = {kind:'chat',username:'七月',text:'你好'};
  const messages = buildMessages({ai:{}},{playlist:[],gifts:{},entries:0}, {
    username:'七月',text:'你好',recent:[{kind:'ai',text:'上一条回复'},current],
  });
  const users = messages.filter(m => m.role === 'user');
  assert.equal(users.length,1);
  assert.equal(users[0].content,'[七月] 你好');
});

test('voice-only command replies still enter the public chat outbox', async () => {
  const server = await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source = server.slice(server.indexOf('async function doReply(job)'),server.indexOf('// ---------- 指令解析'));
  const sent = [], events = [];
  const context = vm.createContext({
    liveAgent:new LiveAgent(),finishSpeech,speechUntil:0,shuttingDown:false,
    getConfig:()=>({voice:{enabled:true},novel:{},ai:{}}),getState:()=>({}),
    replyPhase:()=> 'voice',activeNovel:()=>null,speakReply:async()=>'/voice/test.mp3',
    addAiEvent:e=>e,pushEvent:e=>events.push(e),enqueueReply:t=>sent.push(t),lastReplyText:'',
  });
  vm.runInContext(source,context);
  await context.doReply({kind:'command',text:'收到加油啦'});
  assert.deepEqual(sent,['收到加油啦token来']);
  assert.equal(events[0].voiceOnly,true);
  assert.equal(events[0].voice,'/voice/test.mp3');
});

test('doReply answers identity directly and never calls the model', async () => {
  const server = await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source = server.slice(server.indexOf('async function doReply(job)'),server.indexOf('// ---------- 指令解析'));
  const events = [], sent = [];
  let aiCalled = false;
  const context = vm.createContext({
    liveAgent:new LiveAgent(),finishSpeech,speechUntil:0,shuttingDown:false,
    getConfig:()=>({voice:{enabled:true},novel:{},ai:{apiKey:'configured'}}),getState:()=>({events:[]}),
    replyPhase:()=> 'voice',activeNovel:()=>null,speakReply:async()=>'/voice/identity.mp3',
    addAiEvent:e=>e,pushEvent:e=>events.push(e),enqueueReply:t=>sent.push(t),lastReplyText:'',
    identityReply,aiComplete:async()=>{aiCalled=true;return {text:'不该走到这里'};},
  });
  vm.runInContext(source,context);
  await context.doReply({kind:'chat',username:'观众',text:'你是谁？'});
  assert.equal(aiCalled,false);
  assert.deepEqual(sent,['我是深海女仆大肥鱼呀token来']);
  assert.equal(events[0].text,'我是深海女仆大肥鱼呀token来');
  assert.equal(events[0].source,'identity');
});

test('normal voice replies wait for ended instead of interrupting the current sentence', async () => {
  const app = await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const source = app.slice(app.indexOf('const replyAudioQueue = [];'),app.indexOf('function addMessage('));
  const played = [];
  let pauses = 0;
  const voicePlayer = {
    src:'',volume:0,onended:null,onerror:null,
    pause(){pauses++;},
    play(){played.push(this.src);return Promise.resolve();},
  };
  const context = vm.createContext({
    state:{closed:false,voiceEnabled:true,voiceVolume:.8,story:null},
    el:{voicePlayer,voiceHint:null,storyAudio:{paused:true,ended:false}},
    GIFT_ACTIONS:[],GIFT_POOL:[],pick:()=> 'happy',setMood:()=>{},phaseMood:()=> 'idle',
    fetch:()=>Promise.resolve({}),URL,location:{origin:'http://127.0.0.1:8787'},
    speakToken:0,storyPausedForReply:false,storyPausedAt:0,replyAudioTimer:null,
    reportStoryPaused:()=>{},restoreStoryDisplay:()=>{},syncStoryAudio:()=>{},
    speak:async()=>{},console,setTimeout,clearTimeout,
  });
  vm.runInContext(source,context);
  context.playReplyAudio({text:'第一句',voice:'/voice/first.mp3'});
  context.playReplyAudio({text:'第二句',voice:'/voice/second.mp3'});
  assert.deepEqual(played,['http://127.0.0.1:8787/voice/first.mp3']);
  assert.equal(pauses,0);
  voicePlayer.onended({type:'ended'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(played,[
    'http://127.0.0.1:8787/voice/first.mp3',
    'http://127.0.0.1:8787/voice/second.mp3',
  ]);
  assert.equal(pauses,0);
  voicePlayer.onended({type:'ended'});
  await new Promise(resolve=>setImmediate(resolve));
});

test('preparing chapters keep audience voice replies enabled; reading respects interruption setting', async () => {
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  const phaseSource = server.slice(server.indexOf('function replyPhase()'), server.indexOf('async function speakReply'));
  const replySource = server.slice(server.indexOf('async function doReply(job)'), server.indexOf('// ---------- 指令解析'));
  for (const phase of ['preparing', 'reading', 'break']) {
    for (const interruptOnChat of [false, true]) {
      const events = [];
      const context = vm.createContext({
        liveAgent: new LiveAgent(), finishSpeech, speechUntil: 0, shuttingDown: false,
        getConfig: () => ({voice:{enabled:true}, novel:{interruptOnChat}, ai:{apiKey:'configured'}}),
        getState: () => ({events:[]}), activeNovel: () => ({phase}),
        speakReply: async () => '/voice/reply.mp3', identityReply,
        addAiEvent:e=>e, pushEvent:e=>events.push(e), enqueueReply:()=>{}, lastReplyText:'',
      });
      vm.runInContext(phaseSource + replySource, context);
      await context.doReply({kind:'chat',username:'观众',text:'你是谁？'});
      assert.equal(Boolean(events[0].voice), phase !== 'reading' || interruptOnChat, `${phase}/${interruptOnChat}`);
    }
  }
});

test('gift thanks synthesize in every story phase regardless of chat interruption toggle', async () => {
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  const phaseSource = server.slice(server.indexOf('function replyPhase()'), server.indexOf('async function speakReply'));
  const replySource = server.slice(server.indexOf('async function doReply(job)'), server.indexOf('// ---------- 指令解析'));
  for (const phase of ['preparing', 'reading', 'break', 'idle']) {
    for (const enabled of [true, false]) {
      const events = [], synthesized = [];
      const context = vm.createContext({
        liveAgent:new LiveAgent(), finishSpeech, speechUntil:0, shuttingDown:false,
        getConfig:()=>({voice:{enabled}, novel:{interruptOnChat:false}, ai:{}}),
        getState:()=>({events:[]}), activeNovel:()=>({phase}),
        speakReply:async text=>{synthesized.push(text);return '/voice/gift.mp3';},
        GIFT_BLESSINGS:['谢谢支持。'],giftBlessingIndex:0,speakableName:n=>n,
        addAiEvent:e=>e,pushEvent:e=>events.push(e),enqueueReply:()=>{},lastReplyText:'',
      });
      vm.runInContext(phaseSource + replySource, context);
      await context.doReply({kind:'gift',username:'观众',gift:{name:'小心心',count:2}});
      assert.equal(synthesized.length, enabled ? 1 : 0);
      assert.equal(events[0].source,'gift-thanks');
      assert.equal(events[0].giftAction,'小心心');
      assert.equal(Boolean(events[0].voice),enabled);
      assert.equal(events[0].interruptStory,enabled);
    }
  }
});

test('gift playback pauses story through speech and action then resumes on ended, error or timeout', async () => {
  const app = await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const source = app.slice(app.indexOf('const replyAudioQueue = [];'),app.indexOf('function addMessage('));
  for (const ending of ['ended','error','timeout']) {
    const calls = [], timers = new Map(); let timerId=0;
    const voicePlayer = {src:'',volume:0,paused:true,ended:false,
      pause(){this.paused=true;},play(){this.paused=false;calls.push('voice');return Promise.resolve();}};
    const context = vm.createContext({
      state:{closed:false,voiceEnabled:true,story:{phase:'reading'}},
      el:{voicePlayer,voiceHint:null,storyAudio:{paused:false,ended:false,currentTime:42,pause(){this.paused=true;calls.push('pause');}}},
      GIFT_ACTIONS:[],GIFT_POOL:[],pick:()=> 'happy',setMood:(m,ms,opts)=>{if(opts?.gift)calls.push('action');},phaseMood:()=> 'idle',
      URL,location:{origin:'http://localhost:8787'},speakToken:0,storyPausedForReply:false,storyPausedAt:0,replyAudioTimer:null,
      reportStoryPaused:p=>calls.push(p?'report-pause':'report-resume'),restoreStoryDisplay:()=>{},syncStoryAudio:()=>calls.push('resume'),
      console,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    });
    vm.runInContext(source,context);
    const done = context.playReplyAudioNow({source:'gift-thanks',text:'谢谢礼物',voice:'/gift.wav',giftAction:'小心心'});
    assert.deepEqual(calls,['pause','report-pause','voice']);
    if(ending==='timeout') [...timers.values()].find(t=>t.ms>=30000).fn();
    else voicePlayer[ending==='ended'?'onended':'onerror']({type:ending});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.at(-1),'action');
    assert.equal(calls.includes('resume'),false);
    [...timers.values()].find(t=>t.ms===10100).fn();
    await done;
    assert.deepEqual(calls,['pause','report-pause','voice','action','report-resume','resume']);
    assert.equal(context.el.storyAudio.currentTime,42);
  }
});

test('gift thanks are not dropped when normal chat reaches its minute limit', async () => {
  const server = await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=server.slice(server.indexOf('async function pump()'),server.indexOf('let lastReplyAt = 0;'));
  const replied=[],skipped=[];
  const context=vm.createContext({pumping:false,replyQueue:[{gift:{name:'小心心'}},{text:'普通弹幕'}],replyTimes:[Date.now()],lastReplyAt:0,
    getConfig:()=>({ai:{maxRepliesPerMinute:1,minReplyGapMs:0}}),doReply:async job=>replied.push(job),playSkippedGiftAction:job=>skipped.push(job),console});
  vm.runInContext(source,context);await context.pump();
  assert.equal(replied.length,1);assert.equal(replied[0].gift.name,'小心心');assert.equal(skipped.length,1);
});
