import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeSettings,edgeConfigOptions } from '../lib/edge-options.mjs';
import { assertPatch } from '../lib/config.mjs';

test('Edge 的语速不再取决于是否指定 pitch，音效和运行路径独立传递',()=>{
  const preset={voice:'zh-CN-XiaoyiNeural',pitch:'+0Hz',rate:'+0%'};
  assert.deepEqual(edgeSettings({rate:.8,effect:'electro'},preset),{voice:preset.voice,pitch:'+0Hz',rate:'-20%',effect:'electro'});
  assert.equal(edgeSettings({rate:1.15,edgeVoice:'zh-CN-YunxiaNeural'},preset).rate,'+15%');
  assert.equal(edgeSettings({edgeRate:'-5%'},preset).rate,'-5%');
  assert.equal(edgeConfigOptions({effect:'normal',edgePythonPath:'custom-python'}).edgePythonPath,'custom-python');
});
test('拒绝未知音效、非法音色 ID 和无效语速；允许关掉电音',()=>{
  for(const voice of [{effect:'shell'},{edgeVoice:'bad;command'},{rate:Infinity},{rate:3}])assert.throws(()=>assertPatch({voice}));
  assert.equal(assertPatch({voice:{effect:'normal',rate:1,edgeVoice:''}}),true);
});
