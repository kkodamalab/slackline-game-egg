import test from 'node:test';
import assert from 'node:assert/strict';
import { SeesawGame,toCSV } from '../src/game.js';
import { playDuration,physicsSettings } from '../src/config.js';
import { FeedbackEvents, GameAudio, SpeechPlayer, audioSettings } from '../src/audio.js';
import { giftRects,giftDefaults } from '../src/gift.js';
import { giftURL,validManifest,pngBytes,transferLimits } from '../src/gift-transfer.js';
import { objectSVG } from '../src/art.js';
for(const duration of [5,30,60])for(const gameMode of ['KEEP','STAR','SURVIVAL'])test(`${gameMode} ${duration}s freezes duration, ends, and records CSV`,()=>{
 const g=new SeesawGame('easy',{gameMode,duration});for(let n=0;n<duration*120+120;n++)g.step(1/120,{rawAngle:0,relativeAngle:0});
 assert.ok(g.done);assert.ok(Math.abs(g.elapsed-duration)<1e-7);assert.equal(g.stars,gameMode==='STAR'?Math.floor(duration/2):0);assert.equal(g.summary().configuredDuration,duration);assert.ok(toCSV(g.samples).includes('configuredDuration'));assert.equal(g.samples[0].configuredDuration,duration);
});
test('duration validation, configured survival fall, and legacy ball equivalence',()=>{
 for(const n of [0,4,6,61,NaN,Infinity])assert.throws(()=>playDuration(n));
 const g=new SeesawGame('hard',{gameMode:'SURVIVAL',duration:5});g.position=1;g.velocity=1;g.step(1/120,{rawAngle:30,relativeAngle:30});assert.ok(g.done);assert.equal(g.drops,1);
 for(const k of ['SOCCER_BALL','BASKETBALL'])assert.deepEqual(physicsSettings('hard',k),physicsSettings('hard','BALL'));
 assert.notEqual(objectSVG('SOCCER_BALL'),objectSVG('BASKETBALL'));assert.ok(objectSVG('SOCCER_BALL').includes('ball-edge'));
});
test('alert levels, cooldown, returning safe, drop, star and countdown events',()=>{
 const f=new FeedbackEvents(),g={position:.69,elapsed:0,stars:0,drops:0,streak:0,isSafe:false,respawn:0,duration:30,done:false};
 assert.deepEqual(f.update(g),[]);g.position=.7;assert.deepEqual(f.update(g),['danger']);g.elapsed=1;assert.deepEqual(f.update(g),[]);g.position=.9;assert.deepEqual(f.update(g),['danger']);g.elapsed=2;assert.deepEqual(f.update(g),[]);g.elapsed=3;assert.deepEqual(f.update(g),['danger']);
 g.position=0;f.update(g);g.position=.7;g.elapsed=3.1;assert.deepEqual(f.update(g),['danger']);g.drops=1;g.respawn=1;assert.deepEqual(f.update(g),['drop']);g.respawn=0;g.position=0;g.isSafe=true;g.streak=2;g.stars=1;assert.deepEqual(f.update(g),['stable','star']);g.elapsed=27;assert.deepEqual(f.update(g),['countdown']);assert.deepEqual(f.update(g),[]);g.done=true;assert.deepEqual(f.update(g),['success']);assert.deepEqual(f.update(g),[]);
});
test('AudioContext initializes on unlock only; mute and all alert types',async()=>{
 let constructed=0,started=0,stored;class Context {constructor(){constructed++;this.state='suspended';this.currentTime=0;this.destination={};}async resume(){this.state='running';}createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){started++;},stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}}
 const a=new GameAudio({AudioContext:Context,localStorage:{getItem(){return stored;},setItem(k,v){stored=v;}}});assert.equal(constructed,0);a.tone('bell');assert.equal(started,0);await a.unlock();assert.equal(constructed,1);await a.unlock();assert.equal(constructed,1);
 for(const kind of ['horn','whistle','bell','beep','comic']){a.configure({...a.settings,alert:kind});a.tone(kind);}assert.equal(started,10);a.configure({...a.settings,effects:false});a.tone('bell');assert.equal(started,10);a.configure({...a.settings,effects:true,alert:'none'});a.tone('none');assert.equal(started,10);assert.equal(new GameAudio({localStorage:{getItem(){return stored;}}}).settings.alert,'none');
});
test('asynchronous Japanese voices, AUTO SELECT OFF, cooldown, unsupported fallback',()=>{
 const spoken=[];let voices=[],listener,status;const env={SpeechSynthesisUtterance:class {constructor(t){this.text=t;}},speechSynthesis:{getVoices:()=>voices,addEventListener:(e,f)=>listener=f,cancel(){},speak:u=>spoken.push(u)}};
 const a=new GameAudio(env,t=>status=t);assert.ok(status.includes('見つかりません'));a.voice('danger',0);assert.equal(spoken.length,0);voices=[{lang:'ja-JP'}];listener();assert.ok(status.includes('使えます'));a.voice('danger',0);a.voice('danger',1);assert.equal(spoken.length,1);a.voice('star',4);assert.equal(spoken[1].text,'やったね！');a.configure({...a.settings,voiceMode:'SELECT',phrase:'まんなか！',voiceEvent:'drop'});a.voice('danger',8);assert.equal(spoken.length,2);a.voice('drop',8);assert.equal(spoken[2].text,'まんなか！');a.configure({...a.settings,voiceMode:'OFF'});a.voice('success',20);assert.equal(spoken.length,3);assert.equal(new SpeechPlayer({}).play('声',1),false);assert.equal(audioSettings({effectsVolume:2}).effectsVolume,1);
});
for(const layout of ['A','B','C','D','E'])for(const orientation of ['portrait','landscape'])test(`gift ${layout} ${orientation} has bounded photo slots and no empty frames`,()=>{
 const o={...giftDefaults,layout,orientation};const g=giftRects(o,{smile:true,drawing:true});assert.equal(g.w,orientation==='portrait'?1080:1620);assert.equal(g.h,orientation==='portrait'?1620:1080);assert.equal(g.rects.length,['D','E'].includes(layout)?1:2);
 for(const r of g.rects){assert.ok(r.x>=0&&r.y>=0&&r.w>0&&r.h>0&&r.x+r.w<=g.w&&r.y+r.h<=g.h);}
 assert.equal(giftRects(o,{}).rects.length,0);assert.equal(giftRects(o,{drawing:true}).rects.length,1);
});
test('gift URL separates Controller, preserves Pages path and uses capability token only',()=>{
 const u=new URL(giftURL('https://kkodamalab.github.io/slackline-game-egg/?room=old&player=A','peer-id','a'.repeat(64)));assert.equal(u.pathname,'/slackline-game-egg/');assert.equal(u.searchParams.get('gift'),'peer-id');assert.equal(u.searchParams.has('room'),false);assert.equal(u.searchParams.has('player'),false);assert.equal(u.searchParams.size,2);assert.throws(()=>giftURL('https://x/','peer','weak'));assert.throws(()=>giftURL('javascript:alert(1)','peer','a'.repeat(64)));
});
test('transfer metadata caps memory, enforces chunk count, PNG signature',()=>{
 const m={type:'manifest',size:100000,chunks:Math.ceil(100000/transferLimits.chunk),mime:'image/png'};assert.ok(validManifest(m));for(const patch of [{size:0},{size:transferLimits.bytes+1},{chunks:1},{mime:'image/jpeg'}])assert.equal(validManifest({...m,...patch}),false);assert.ok(pngBytes(Uint8Array.from([137,80,78,71,13,10,26,10]).buffer));assert.equal(pngBytes(new ArrayBuffer(8)),false);
});
test('gift draw crop covers landscape viewport and moves without changing physics',async()=>{
 const {drawPhoto}=await import('../src/gift.js');let args;const ctx={save(){},beginPath(){},roundRect(){},clip(){},drawImage(...a){args=a;},restore(){}};
 const img={width:1200,height:800},r={x:60,y:190,w:960,h:800};drawPhoto(ctx,img,r,{zoom:2,x:1,y:-1});assert.equal(args[1],60);assert.equal(args[2],190+800-1600);assert.equal(args[3],2400);assert.equal(args[4],1600);
});
test('gift sender rejects unauthorized receiver and destroys expired session',async t=>{
 const {GiftSender}=await import('../src/gift-transfer.js');const oldPeer=globalThis.Peer,oldQR=globalThis.QRCode;let peer,closed=false;
 class P {constructor(){this.handlers={};peer=this;}on(e,f){this.handlers[e]=f;}destroy(){this.destroyed=true;}}
 globalThis.Peer=P;globalThis.QRCode=class {static CorrectLevel={M:0};};t.mock.timers.enable({apis:['setTimeout']});
 const sender=new GiftSender();try{await sender.start(new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])],{type:'image/png'}),'https://x/game/',{replaceChildren(){},removeAttribute(){}},{});
 const c={handlers:{},on(e,f){this.handlers[e]=f;},close(){closed=true;},send(){throw Error('Unauthenticated receiver got data');}};peer.handlers.connection(c);c.handlers.data({type:'hello',token:'wrong'});assert.equal(closed,true);assert.ok(sender.blob);t.mock.timers.tick(transferLimits.ttl);assert.equal(peer.destroyed,true);assert.equal(sender.blob,null);assert.equal(sender.token,null);
 }finally{sender.stop();globalThis.Peer=oldPeer;globalThis.QRCode=oldQR;t.mock.timers.reset();}
});
test('star voice takes priority over stability when both happen in one frame',()=>{
 const spoken=[];const a=new GameAudio({SpeechSynthesisUtterance:class{constructor(t){this.text=t;}},speechSynthesis:{getVoices:()=>[{lang:'ja-JP'}],cancel(){},speak:u=>spoken.push(u.text)}});
 a.update({gameMode:'STAR',elapsed:2,duration:30,position:0,isSafe:true,streak:2,stars:1,drops:0,respawn:0,done:false});assert.deepEqual(spoken,['やったね！']);
});
