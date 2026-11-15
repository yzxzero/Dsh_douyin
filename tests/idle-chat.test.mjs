import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { idleTopic, timeContext, parseIdleReply, recentTopicNotes, canSuggestMusic, enqueueIdleTrack } from '../lib/idle-chat.mjs';

test('北京时间时段边界，与宿主时区无关', () => {
  for (const [hour, period, daylight] of [[0,'凌晨',false],[5,'凌晨',false],[6,'上午',true],[12,'下午',true],[18,'晚上',false],[22,'深夜',false]]) {
    const date = new Date(`2026-11-11T${String(hour).padStart(2,'0')}:00:00+08:00`);
    assert.equal(timeContext(date).period, period);
    assert.equal(timeContext(date).daylight, daylight);
  }
  assert.equal(timeContext(new Date('2026-11-10T16:00:00Z')).dateKey, '2026-11-11');
});

test('六类轮换，异常输出不播报 JSON，也不执行搜歌', () => {
  assert.equal(new Set(Array.from({length:6}, (_, i) => idleTopic(i).name)).size, 6);
  assert.equal(idleTopic(6).name, idleTopic(0).name);
  for (const raw of ['{broken', 'null', '{"text":42,"songQuery":"test"}']) {
    assert.deepEqual(parseIdleReply(raw, '兜底'), {text:'兜底',songQuery:''});
  }
  assert.deepEqual(parseIdleReply('```json\n{"text":"聊聊配乐","songQuery":"歌名 歌手"}\n```','兜底'), {text:'聊聊配乐',songQuery:'歌名 歌手'});
});

test('近期素材拒绝过期、未来和缺失日期', () => {
  const now = Date.parse('2026-11-11T12:00:00+08:00');
  const notes = {topicNotes:'作品与来源', topicNotesAt:new Date(now).toISOString()};
  assert.equal(recentTopicNotes(notes,now),'作品与来源');
  assert.equal(recentTopicNotes(notes,now+8*86400000),'');
  assert.equal(recentTopicNotes(notes,now-1),'');
  assert.equal(recentTopicNotes({topicNotes:'旧素材'},now),'');
});

test('搜歌开关、冷却、观众队列与重复推荐保护', () => {
  const state={currentSong:null,playlist:[]};
  assert.equal(canSuggestMusic({},state,0,1000000),true);
  assert.equal(canSuggestMusic({idleMusic:false},state,0,1000000),false);
  assert.equal(canSuggestMusic({idleEverySec:0},state,0,1000000),false);
  assert.equal(canSuggestMusic({},state,999999,1000000),false);
  state.playlist.push({title:'观众歌曲'});
  assert.equal(canSuggestMusic({},state,0,1000000),false);
  assert.equal(enqueueIdleTrack(state,{title:'推荐',url:'https://example.com/a.mp3'}),null);
});

test('不打断当前曲、只接收可播放歌曲，重复不入队', () => {
  const current={title:'当前曲'};
  const state={currentSong:current,playlist:[]};
  assert.equal(enqueueIdleTrack(state,{title:'无源'}),null);
  assert.equal(enqueueIdleTrack(state,{title:'当前曲',url:'x'}),null);
  const hit={title:'配乐',by:'歌手',url:'https://example.com/a.mp3',id:'123',provider:'netease'};
  enqueueIdleTrack(state,hit);
  assert.equal(state.currentSong,current);
  assert.equal(state.playlist[0].providerId,'123');
  assert.equal(enqueueIdleTrack(state,hit),null);
});

test('观众点歌优先，队列满时可让出推荐位置；切歌保留网易云解析信息', async () => {
  // 独立目录运行真实 store，避免改动直播数据。
  const root = await mkdtemp(new URL('./idle-store-', import.meta.url));
  try {
    await mkdir(join(root,'data'));
    await writeFile(join(root,'config.mjs'), `export const ROOT = ${JSON.stringify(root)};`);
    await copyFile(new URL('../lib/pricing.mjs',import.meta.url),join(root,'pricing.mjs'));
    await copyFile(new URL('../lib/viewer-memory.mjs',import.meta.url),join(root,'viewer-memory.mjs'));
    await writeFile(join(root,'store.mjs'),await readFile(new URL('../lib/store.mjs',import.meta.url)));
    const store=await import(pathToFileURL(join(root,'store.mjs')));
    const state=await store.initStore();
    store.setCurrentSong({title:'当前曲'});
    enqueueIdleTrack(state,{title:'推荐',by:'歌手',id:'123',url:'https://example.com/a.mp3'});
    store.pushPlaylist('观众曲','观众',3);
    assert.deepEqual(state.playlist.map(s=>s.title),['观众曲','推荐']);
    store.nextSong();
    const next=store.nextSong();
    assert.equal(next.providerId,'123');
    assert.equal(next.url,'https://example.com/a.mp3');
    state.playlist=[{title:'推荐',idleSuggestion:true}];
    store.pushPlaylist('观众曲2','观众',1);
    assert.deepEqual(state.playlist.map(s=>s.title),['观众曲2']);
    await new Promise(resolve=>setTimeout(resolve,1400));
  } finally { await rm(root,{recursive:true,force:true}); }
});
