// Isolated integration check: never connects to a live room or sends public messages.
import {mkdtemp,cp,copyFile,writeFile,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
const root=await mkdtemp(new URL('../tests/edge-integration-',import.meta.url));
const original=JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8'));
let child,logs='';
try{
 for(const dir of ['lib','vendor'])await cp(new URL('../'+dir,import.meta.url),join(root,dir),{recursive:true});
 await mkdir(join(root,'tools'));await mkdir(join(root,'public'));
 await copyFile(new URL('./edge-say.py',import.meta.url),join(root,'tools/edge-say.py'));
 await copyFile(new URL('../server.mjs',import.meta.url),join(root,'server.mjs'));
 for(const file of ['admin.html','admin.js','admin.css'])await copyFile(new URL('../public/'+file,import.meta.url),join(root,'public',file));
 await writeFile(join(root,'config.json'),JSON.stringify({demo:false,gameplay:{enabled:false},danmaku:{mode:'off'},reply:{auto:false},ai:{enabled:false},
  voice:{...original.voice},novel:{enabled:false,auto:false},story:{enabled:false},broadcast:{enabled:false},music:{autoPlaylist:false},guide:{greet:false,tipEverySec:0,idleEverySec:0}}));
 child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'18882',DEEPSEEK_API_KEY:'',MINIMAX_API_KEY:'',MINDUSTRY_HOME:join(root,'no-game')},windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const request=(path,body)=>fetch('http://127.0.0.1:18882'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 for(let n=0;n<100;n++){try{if((await request('/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 let response=await (await request('/api/voice')).json();assert.equal(response.voice.effect,'electro');assert.equal(response.voice.engine,'edge');
 assert.match(await (await request('/admin')).text(),/voEffect/);
 const one=await (await request('/api/voice/say',{text:'你好呀，欢迎来到直播间。'})).json();assert.equal(one.ok,true,JSON.stringify(one));assert.match(one.url,/\.wav$/);assert.equal(one.effect,'electro');
 assert.equal((await request(one.url)).headers.get('content-type'),'audio/wav');
 const cached=await (await request('/api/voice/say',{text:'你好呀，欢迎来到直播间。'})).json();assert.equal(cached.cached,true);assert.equal(cached.url,one.url);
 await request('/api/config',{voice:{effect:'normal'}});
 assert.equal(JSON.parse(await readFile(join(root,'config.json'),'utf8')).voice.effect,'normal');
 const dry=await (await request('/api/voice/say',{text:'你好呀，欢迎来到直播间。'})).json();assert.equal(dry.ok,true,JSON.stringify(dry));assert.match(dry.url,/\.mp3$/);assert.notEqual(dry.url,one.url);
 assert.equal((await request('/api/config',{voice:{effect:'invalid'}})).status,500);
 const voices=await (await request('/api/voice/edge/voices')).json();assert.equal(voices.ok,true,JSON.stringify(voices));assert(voices.voices.some(v=>v.name==='zh-CN-XiaoyiNeural'));
 const report={ok:true,processed:one,raw:dry,onlineVoices:voices.voices.length,fixture:root};
 await writeFile(new URL('../data/edge-integration-check.json',import.meta.url),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}catch(e){console.error(logs.slice(-5000));throw e;}
finally{if(child){const ended=once(child,'exit');child.kill();await ended;}}
