import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.LUANTI_WORLD=path.resolve('../Luanti/luanti-5.18.0-win64/worlds/whale_pacing_qa');
const {launchLuanti,luantiState,luantiCommand}=await import('../lib/luanti.mjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await launchLuanti();let a=await luantiState();assert.equal(a.speedMultiplier,.25);assert.equal(a.blockIntervalSec,3.2);
 await luantiCommand({action:'start'});a=await luantiState();await wait(7000);const b=await luantiState();
 assert.ok(b.placed-a.placed>=1&&b.placed-a.placed<=3,'quarter-speed real block pacing');
 await luantiCommand({action:'pause',paused:true});const paused=await luantiState();
 for(let i=0;i<2;i++)await luantiCommand({action:'strategy',strategy:'accelerate',voter:'QA only'});
 const accelerated=await luantiState();assert.ok(Math.abs(accelerated.speedMultiplier-.25*1.05**2)<1e-9);
 await wait(1000);assert.equal((await luantiState()).cityPlaced,paused.cityPlaced);
 await luantiCommand({action:'exit'});await launchLuanti();const restored=await luantiState();
 assert.equal(restored.speedMultiplier,accelerated.speedMultiplier);assert.equal(restored.cityPlaced,paused.cityPlaced);
 const manifest=JSON.parse(await readFile(path.join(process.env.LUANTI_WORLD,'atlantis-plan.json'),'utf8'));
 assert.deepEqual(manifest.tasks.slice(-2).map(t=>t.id),['road_tiles','lights']);
 assert.ok(manifest.tasks.at(-2).blocks>860);assert.equal(manifest.tasks.at(-1).blocks,96);
 await writeFile('output/atlantis/pacing-check.json',JSON.stringify({before:a,after:b,accelerated,restored,manifest},null,2));
 console.log('PASS: quarter pacing, two 5% steps, pause, saved speed, road tiles before 24 streetlights.');
}finally{await luantiCommand({action:'exit'});}
