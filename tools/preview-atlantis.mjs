// Independent QA world. Never installs the instant-build mod into the live world.
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.LUANTI_WORLD=path.resolve('../Luanti/luanti-5.18.0-win64/worlds/whale_atlantis_qa');
const {launchLuanti,luantiFrame,luantiCommand}=await import('../lib/luanti.mjs');
try{
 await launchLuanti();
 let ready=false;
 for(let i=0;i<100;i++){
  try{ready=JSON.parse(await readFile(path.join(process.env.LUANTI_WORLD,'preview-ready.json'),'utf8')).ready;}catch{}
  if(ready)break;await new Promise(r=>setTimeout(r,200));
 }
 assert.ok(ready,'QA skyline must finish before capture');
 await new Promise(r=>setTimeout(r,5000));
 await writeFile('output/atlantis/skyline-qa.jpg',await luantiFrame());
 console.log('QA skyline captured; live construction progress preserved.');
}finally{await luantiCommand({action:'exit'});}
