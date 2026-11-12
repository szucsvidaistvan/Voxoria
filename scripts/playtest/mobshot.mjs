import { mkdirSync } from 'node:fs'; mkdirSync('.playtest-shots', { recursive: true });
import { launch } from './lib.mjs';
// Egy mob képe egy égi platformon. Használat: node scripts/playtest/mobshot.mjs <kind> <out.png> [camera: side|front|top|back] [wall]
const kind=process.argv[2]??'horse', out=process.argv[3]??'.playtest-shots/mob.png', cam=process.argv[4]??'side';
const t=await launch({w:900,h:600});
await t.newGame(20260,'creative'); await t.settle(2500);
const p=await t.pos(); const X=Math.floor(p.x), Z=Math.floor(p.z), Y=58;
await t.teleport(X+0.5,Y+3,Z+0.5); await t.settle(1500);
for(let dx=-6;dx<=6;dx++)for(let dz=-6;dz<=6;dz++)await t.setBlock(X+dx,Y,Z+dz,'stone');
await t.page.evaluate(([k,x,y,z])=>{const v=window.__voxoria; const m=v.mobs.spawn(k,x,y,z); window.__m=m; m.noAI=true;},[kind,X+0.5,Y+1,Z+0.5]);
const pos={side:[X+5.5,Y+1.6,Z+0.5,1.5708],front:[X+0.5,Y+1.6,Z-5.5,3.1416],back:[X+0.5,Y+1.6,Z+6.5,0],top:[X+0.5,Y+7,Z+2.5,0]}[cam];
await t.teleport(pos[0],pos[1],pos[2]); await t.look(pos[3],cam==="top"?-1.2:-0.1); await t.settle(6000);
await t.shot(out); await t.close();
