import test from 'node:test';
import assert from 'node:assert/strict';
import { SeesawGame, EggGame, toCSV } from '../src/game.js';
import { config, objects, physicsSettings } from '../src/config.js';
import { BodyInput, bodyAxis } from '../src/body.js';
import { VBFInput } from '../src/input.js';
import { inputFresh, pauseReason } from '../src/safety.js';
import { validateImage, cropGeometry } from '../src/images.js';
import { giftData, resultText } from '../src/gift.js';
const advance = (game,seconds,angle=0) => { for(let i=0;i<Math.round(seconds/config.step);i++) game.step(config.step,{rawAngle:angle,relativeAngle:angle}); };
const pose = (dx = 0, confidence = .95) => {
 const p = Array.from({length:33},()=>({x:.5,y:.5,visibility:confidence,presence:confidence}));
 for(const [i,x,y] of [[11,.4+dx,.2],[12,.6+dx,.2],[23,.4,.6],[24,.6,.6]]) p[i] = {x,y,visibility:confidence,presence:confidence};
 return p;
};
for(const mode of ['KEEP','STAR','SURVIVAL']) test(`${mode} has its own end condition and score`,()=>{
 const game = new SeesawGame('easy',{gameMode:mode}); advance(game,mode==='SURVIVAL'?65:35);
 assert.equal(game.done,true); assert.ok(Math.abs(game.elapsed-(mode==='SURVIVAL'?60:30))<1e-8);
 assert.equal(game.stars,mode==='STAR'?15:0); assert.equal(game.drops,0);
});
for(const mode of ['KEEP','STAR']) test(`${mode} respawns after 1.4 seconds without ending`,()=>{
 const game=new SeesawGame('hard',{gameMode:mode}); game.position=1; game.velocity=1;
 advance(game,config.step,30); assert.equal(game.drops,1); assert.equal(game.done,false);
 advance(game,1.4); assert.ok(game.respawn<1e-8); advance(game,config.step); assert.equal(game.respawn,0); assert.equal(game.position,0);
});
test('SURVIVAL ends on first fall and never advances afterwards',()=>{
 const game=new SeesawGame('hard',{gameMode:'SURVIVAL'});game.position=1;game.velocity=1;
 advance(game,config.step,30);assert.equal(game.done,true);assert.equal(game.drops,1);
 const t=game.elapsed;advance(game,10);assert.equal(game.elapsed,t);
});
test('pause freezes physics, statistics, respawn and timer for every mode',()=>{
 for(const gameMode of ['KEEP','STAR','SURVIVAL']) {
 const game=new SeesawGame('easy',{gameMode});advance(game,1,10);const before=JSON.stringify(game);
 game.paused=true;const paused=JSON.stringify(game);advance(game,10,30);assert.equal(JSON.stringify(game),paused);
 game.paused=false;assert.equal(JSON.stringify(game),before);advance(game,1);assert.ok(game.elapsed>1);
 }
});
test('object coefficients are independent of difficulty and custom image bytes',()=>{
 const positions={};for(const objectType of Object.keys(objects)){
 const game=new SeesawGame('normal',{objectType});advance(game,1,20);positions[objectType]=game.position;
 for(const level of ['easy','normal','hard'])assert.ok(physicsSettings(level,objectType).maxSpeed<=1.2);
 }
 assert.ok(positions.BALL>positions.EGG);assert.ok(positions.EGG>positions.APPLE);assert.ok(positions.APPLE>positions.CHICK);
 for(const type of ['MY_FACE','MY_DRAWING','MY_PHOTO'])assert.equal(positions[type],positions.EGG);
 assert.deepEqual(new EggGame().settings,physicsSettings('easy','EGG'));
});
test('body axis uses aspect ratio, required joints only, and a signed angle',()=>{
 assert.ok(Math.abs(bodyAxis(pose(.1),640,480).angle-Math.atan2(64,192)*180/Math.PI)<1e-8);
 assert.ok(bodyAxis(pose(-.1)).angle<0);assert.equal(bodyAxis(pose(0,.3)),null);assert.equal(bodyAxis([]),null);
 const p=pose();p[0].visibility=0;assert.ok(bodyAxis(p));p[11].x=NaN;assert.equal(bodyAxis(p),null);
});
test('body calibration, sensitivity and inversion keep physical research angle distinct',()=>{
 const input=new BodyInput();input.accept(pose(),640,480,0);assert.equal(input.calibrate(),true);
 input.sensitivity=2;for(let i=0;i<100;i++)input.accept(pose(.1),640,480,i);
 const value=input.read();assert.equal(value.bodyAxisAngle,value.relativeAngle);assert.equal(value.gameAngle,30);assert.equal(value.trackingConfidence,.95);
 input.invert=true;input.reset();input.accept(pose(.1),640,480,100);assert.ok(input.rawAngle<0);
 input.accept([],640,480,101);assert.equal(input.ready,false);
});
test('input switch requires calibration and stale sensors / lost cameras pause',()=>{
 const input=new VBFInput();input.push(10,100);input.calibrate();assert.equal(inputFresh(input,'sensor',2599),true);
 assert.ok(pauseReason(input,'sensor',2601,.01));assert.ok(pauseReason(input,'body',601,.01));
 assert.ok(pauseReason(input,'test',200,.6));assert.ok(pauseReason(input,'test',200,.01,true));
 input.reset();assert.equal(input.calibrated,false);assert.equal(inputFresh(input,'test',200),false);
 input.push(0,200);assert.equal(inputFresh(input,'test',1e6),true);
});
test('CSV adds contextual fields but preserves old columns and excludes images',()=>{
 const game=new SeesawGame('normal',{gameMode:'STAR',objectType:'MY_FACE',inputMode:'body'});
 game.step(config.step,{rawAngle:10,relativeAngle:4,gameAngle:8,bodyAxisAngle:4,trackingConfidence:.9});
 const row=game.samples[0];assert.equal(row.bodyAxisAngle,4);assert.equal(row.trackingConfidence,.9);
 for(const key of ['eggPosition','eggVelocity','rawAngle','relativeAngle','difficulty','gameMode','objectType','inputMode','survivalTime','dropCount','starCount'])assert.ok(key in row);
 const csv=toCSV(game.samples);assert.ok(csv.includes('bodyAxisAngle'));assert.ok(!csv.includes('data:image'));assert.equal(game.summary().numberOfEggDrops,game.summary().dropCount);
});
test('image validation accepts only supported types and bounds file size / crop geometry',()=>{
 for(const type of ['image/jpeg','image/png','image/webp'])assert.doesNotThrow(()=>validateImage({type,size:500}));
 assert.throws(()=>validateImage({type:'image/svg+xml',size:5}));assert.throws(()=>validateImage({type:'image/png',size:26*1024*1024}));
 const c=cropGeometry(1200,800,256,2,1,-1);assert.equal(c.x,0);assert.ok(Math.abs(c.y-(256-c.h))<1e-8);
});
test('gift interface has event, optional images, and mode-specific result',()=>{
 for(const gameMode of ['KEEP','STAR','SURVIVAL']){
 const game=new SeesawGame('easy',{gameMode});advance(game,1);const data=giftData(game);
 assert.equal(data.event.date,'2026.10.18');assert.equal(data.event.name,'風に立つ');assert.deepEqual(data.images,{});assert.ok(resultText(data));
 }
 const data=giftData(new SeesawGame(),{MY_FACE:'data:image/png;base64,test'});assert.ok(data.images.MY_FACE);assert.ok(!JSON.stringify(data.result).includes('data:image'));
});
