import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneGeometry, rollingAngle } from '../src/geometry.js';
import { objects, physicsSettings, isImageObject } from '../src/config.js';
import { SeesawGame } from '../src/game.js';
import { resultText, giftData } from '../src/gift.js';
for(const [width,height] of [[280,250],[660,440],[1000,180]])test(`responsive contact geometry ${width}x${height}`,()=>{
 for(const angle of [-30,0,30])for(const position of [-1,0,1]){
 const g=sceneGeometry(width,height,position,angle,60),r=angle*Math.PI/180;
 assert.ok(Math.abs(g.pivotY+g.support-g.ground)<1e-8);
 const dx=g.center.x-g.contact.x,dy=g.center.y-g.contact.y;
 assert.ok(Math.abs(Math.hypot(dx,dy)-30)<1e-8);assert.ok(Math.abs(dx*Math.cos(r)+dy*Math.sin(r))<1e-8);assert.ok(dy<0);
 assert.equal(sceneGeometry(width,height,position,angle,60,.5).center.y,g.center.y+height*.325);
 }
});
test('rolling distance matches circumference without changing engine or score',()=>{
 assert.ok(Math.abs(rollingAngle(2,Math.PI*60,60)-360)<1e-8);
 for(const type of ['IMAGE_FILE','IMAGE_CAMERA','MY_FACE','MY_DRAWING','MY_PHOTO','PEAR','CHESTNUT','MAPLE','LEAF','PUMPKIN','MUSHROOM']){
 assert.ok(objects[type]);assert.deepEqual(physicsSettings('hard',type),physicsSettings('hard','EGG'));
 for(const gameMode of ['KEEP','STAR','SURVIVAL']){const g=new SeesawGame('easy',{gameMode,objectType:type,duration:5});for(let n=0;n<600;n++)g.step(1/120,{rawAngle:0,relativeAngle:0});assert.ok(g.done);assert.equal(g.drops,0);assert.equal(g.stars,gameMode==='STAR'?2:0);}
 }
 assert.ok(isImageObject('MY_FACE'));assert.ok(isImageObject('IMAGE_CAMERA'));assert.ok(!isImageObject('EGG'));
});
test('child-friendly survival wording is shared by result and PHOTO GIFT',()=>{
 const g=new SeesawGame('easy',{gameMode:'SURVIVAL',duration:5});g.elapsed=5;
 assert.equal(resultText(giftData(g)),'5.0秒 バランスできた！');assert.ok(!resultText(giftData(g)).includes('生存'));
});
