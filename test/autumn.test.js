import test from 'node:test';
import assert from 'node:assert/strict';
import { StartCountdown } from '../src/countdown.js';
import { SeesawGame,toCSV } from '../src/game.js';
import { giftData,resultText } from '../src/gift.js';
import { leafSVG,leafKinds } from '../src/leaves.js';
test('countdown emits 3, 2, 1 then start at exactly three seconds and prevents double start',()=>{
 const c=new StartCountdown();assert.equal(c.start(100),true);assert.equal(c.start(900),false);assert.equal(c.update(99).label,'3');assert.equal(c.active,true);
 for(const [now,label] of [[100,'3'],[1099,'3'],[1100,'2'],[2099,'2'],[2100,'1'],[3099,'1']])assert.equal(c.update(now).label,label);
 assert.deepEqual(c.update(3100),{active:false,started:true,label:'スタート！'});assert.deepEqual(c.update(4000),{active:false});
});
for(const reason of ['接続切断','センサー停止','検出ロスト','中央無効','タブ非表示'])test(`countdown aborts on ${reason} and requires a fresh explicit start`,()=>{
 const c=new StartCountdown();c.start(0);assert.equal(c.update(1200).label,'2');assert.equal(c.update(1300,reason).aborted,true);assert.deepEqual(c.update(7000),{active:false});assert.equal(c.start(8000),true);assert.equal(c.update(8000).label,'3');c.cancel();assert.equal(c.active,false);
});
test('countdown is independent of physics and scores for all three modes',()=>{
 for(const gameMode of ['KEEP','STAR','SURVIVAL']){const g=new SeesawGame('hard',{gameMode,duration:5}),c=new StartCountdown();const state=JSON.stringify(g);c.start(0);for(let n=0;n<3000;n+=10)c.update(n);assert.equal(JSON.stringify(g),state);assert.equal(c.update(3000).started,true);g.step(1/120,{rawAngle:30,relativeAngle:30});assert.equal(g.drops,0);assert.ok(g.elapsed<.01);}
});
test('leaves retain STAR score, streak reset, respawn, legacy CSV and gift wording',()=>{
 const g=new SeesawGame('easy',{gameMode:'STAR',duration:5});const step=(seconds,angle=0)=>{for(let n=0;n<seconds*120;n++)g.step(1/120,{rawAngle:angle,relativeAngle:angle});};
 step(1);g.position=.8;step(1/120);assert.equal(g.streak,0);g.position=0;g.velocity=0;step(2);assert.equal(g.stars,1);g.position=1.1;g.velocity=0;step(1/120,30);assert.equal(g.drops,1);assert.equal(g.stars,1);step(1.5);assert.equal(g.respawn,0);assert.equal(g.stars,1);
 assert.equal(g.summary().leafCount,g.summary().starCount);const csv=toCSV(g.samples);assert.ok(csv.includes('leafCount'));assert.ok(csv.includes('starCount'));assert.ok(resultText(giftData(g)).includes('落ち葉を1枚'));assert.ok(!resultText(giftData(g)).includes('星'));
 for(const kind of leafKinds){const svg=leafSVG(kind);assert.ok(svg.includes('<svg'));assert.ok(!svg.includes('http://')||svg.includes('xmlns="http://www.w3.org/2000/svg"'));assert.ok(!svg.includes('<image'));}
});
