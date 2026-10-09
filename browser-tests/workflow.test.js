import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
let browser, server, origin;
before(async()=>{
 const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
 origin=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
 for(let i=0;i<100;i++){try{const r=await fetch(origin);if(r.ok)break;}catch{}await delay(50);if(i===99)throw new Error('Server did not become ready');}
 const executablePath=process.env.BROWSER_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 browser=await chromium.launch({executablePath,channel:process.env.BROWSER_CHANNEL || undefined,headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
});
after(async()=>{await browser?.close();server?.kill();});
async function pageFor({clock=true, mobile=false}={}){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1100,height:850},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.errors=errors;
 if(clock)await page.clock.install();await page.goto(origin);return page;
}
async function pcStart(page,mode='KEEP',type='EGG'){
 await page.click(`[data-game-mode="${mode}"]`);await page.click(`[data-object="${type}"]`);
 await page.selectOption('#mode','test');await page.clock.runFor(32);await page.click('#center');await page.click('#start');
}
for(const mode of ['KEEP','STAR','SURVIVAL'])test(`PC ${mode}: complete, results, CSV, gift without photos`,async()=>{
 const page=await pageFor();try{
 await pcStart(page,mode);await page.clock.runFor(mode==='SURVIVAL'?61000:31000);
 assert.equal(await page.locator('#result').isVisible(),true);
 const stats=JSON.parse(await page.locator('#metrics').textContent());assert.equal(stats.gameMode,mode);assert.equal(stats.dropCount,0);assert.equal(stats.starCount,mode==='STAR'?15:0);
 await page.locator('#research').evaluate(e=>e.open=true);
 const csvPromise=page.waitForEvent('download');await page.click('#samples-csv');const csv=await csvPromise;
 const stream=await csv.createReadStream();let text='';for await(const chunk of stream)text+=chunk;
 assert.ok(text.includes('eggPosition'));assert.ok(text.includes('trackingConfidence'));assert.ok(text.includes(mode));assert.ok(!text.includes('data:image'));
 await page.click('#gift-open');await page.waitForFunction(()=>!document.getElementById('gift-save').disabled);
 const pngPromise=page.waitForEvent('download');await page.click('#gift-save');const png=await pngPromise;const data=await png.createReadStream();const chunks=[];for await(const c of data)chunks.push(c);const bytes=Buffer.concat(chunks);
 assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1620);
 assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('SURVIVAL falls immediately; pause freezes and resume/replay work',async()=>{
 const page=await pageFor();try{
 await pcStart(page,'SURVIVAL','SOCCER_BALL');await page.clock.runFor(1000);await page.click('#pause');const time=await page.locator('#time').textContent();
 await page.clock.runFor(5000);assert.equal(await page.locator('#time').textContent(),time);
 await page.click('#resume');await page.locator('#tilt').fill('30');await page.locator('#tilt').dispatchEvent('input');await page.clock.runFor(10000);
 const stats=JSON.parse(await page.locator('#metrics').textContent());assert.equal(stats.dropCount,1);assert.ok(stats.survivalTime<10);
 await page.click('#again');assert.equal(await page.locator('#start').isDisabled(),true);await page.clock.runFor(32);await page.click('#center');await page.click('#start');assert.equal(await page.locator('#play').isVisible(),true);
 assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('JPEG, PNG, WebP crop, bad image recovery, photo gift and erasure',async()=>{
 const page=await pageFor({mobile:true});try{
 for(const [type,mime] of [['MY_FACE','image/jpeg'],['MY_DRAWING','image/png'],['MY_PHOTO','image/webp']]){
 await page.click(`[data-object="${type}"]`);
 const encoded=await page.evaluate(mime=>{const c=document.createElement('canvas');c.width=1200;c.height=800;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,1200,800);return c.toDataURL(mime).split(',')[1];},mime);
 await page.setInputFiles('#image-file',{name:'test.'+mime.split('/')[1],mimeType:mime,buffer:Buffer.from(encoded,'base64')});
 await page.waitForSelector('#crop-controls:not([hidden])');await page.locator('#crop-zoom').fill('2');await page.locator('#crop-zoom').dispatchEvent('input');await page.click('#use-image');
 assert.equal(await page.locator(`[data-object="${type}"] img`).count(),1);
 }
 await page.setInputFiles('#image-file',{name:'bad.png',mimeType:'image/png',buffer:Buffer.from('invalid')});await page.waitForFunction(()=>document.getElementById('image-status').textContent.includes('読み込めません')); 
 await page.click('[data-game-mode="STAR"]');await page.selectOption('#mode','test');await page.clock.runFor(32);await page.click('#center');await page.click('#start');assert.equal(await page.locator('#egg img').count(),1);
 await page.clock.runFor(31000);const stats=JSON.parse(await page.locator('#metrics').textContent());assert.equal(stats.starCount,15);assert.equal(stats.objectType,'MY_PHOTO');
 const storage=await page.evaluate(()=>localStorage.getItem('keep-the-egg:last-trial'));assert.ok(!storage.includes('data:image'));
 await page.click('#gift-open');await page.waitForFunction(()=>!document.getElementById('gift-save').disabled);await page.click('#gift-discard');await page.waitForFunction(()=>!document.getElementById('gift-save').disabled);
 await page.click('#gift-back');await page.click('#other-game');assert.equal(await page.locator('[data-object="MY_PHOTO"] img').count(),0);assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('BODY AXIS camera integration with simulated 33 landmarks: lost tracking pauses, switch stops camera',async()=>{
 const page=await pageFor({clock:false});try{
 await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@*/vision_bundle.mjs',r=>r.fulfill({contentType:'application/javascript',body:`
 export const FilesetResolver={forVisionTasks:async()=>({})};
 export const PoseLandmarker={createFromOptions:async()=>({close(){},detectForVideo(){return {landmarks:window.simulateLoss?[]:[Array.from({length:33},(_,i)=>({x:i===11||i===23?.4:.6,y:i===11||i===12?.2:.6,visibility:.95,presence:.95}))]};}})};
 `}));
 await page.selectOption('#mode','body');await page.click('#connect');await page.waitForFunction(()=>!document.getElementById('center').disabled);await page.click('#center');await page.click('#start');
 assert.equal(await page.locator('#body-preview').isVisible(),true);
 await page.evaluate(()=>window.simulateLoss=true);await page.waitForSelector('#pause-panel:not([hidden])');assert.ok((await page.locator('#pause-reason').textContent()).includes('からだ'));
 const time=await page.locator('#time').textContent();await page.waitForTimeout(1000);assert.equal(await page.locator('#time').textContent(),time);
 await page.evaluate(()=>window.simulateLoss=false);await page.waitForTimeout(200);await page.click('#resume');assert.equal(await page.locator('#pause-panel').isVisible(),false);
 await page.click('#pause');await page.click('#quit');await page.selectOption('#mode','test');assert.equal(await page.evaluate(()=>document.getElementById('body-video').srcObject),null);assert.equal(await page.locator('#body-preview').isVisible(),false);assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('MediaPipe failure offers input fallback and closes camera',async()=>{
 const page=await pageFor({clock:false});try{
 await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@*/vision_bundle.mjs',r=>r.abort());
 await page.selectOption('#mode','body');await page.click('#connect');await page.waitForFunction(()=>!document.getElementById('connect').disabled);
 assert.equal(await page.evaluate(()=>document.getElementById('body-video').srcObject),null);
 await page.selectOption('#mode','test');await page.waitForFunction(()=>!document.getElementById('center').disabled);await page.click('#center');await page.click('#start');assert.equal(await page.locator('#play').isVisible(),true);assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('GiBoard permission in click, rotation and stale input safely pause',async()=>{
 const page=await pageFor();try{
 await page.evaluate(()=>{window.DeviceOrientationEvent.requestPermission=async()=>{window.permissionCalled=true;return 'granted';};});
 await page.selectOption('#mode','sensor');await page.click('#connect');assert.equal(await page.evaluate(()=>window.permissionCalled),true);
 await page.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:0,gamma:0})));
 await page.clock.runFor(32);await page.click('#center');await page.click('#start');await page.clock.runFor(2600);
 assert.equal(await page.locator('#pause-panel').isVisible(),true);
 await page.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:0,gamma:0})));await page.click('#resume');
 await page.evaluate(()=>screen.orientation.dispatchEvent(new Event('change')));assert.equal(await page.locator('#reset-center').isVisible(),true);
 await page.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:0,gamma:0})));await page.click('#reset-center');assert.equal(await page.locator('#pause-panel').isVisible(),false);assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('face camera capture and retake are local; closing camera ends all tracks',async()=>{
 const page=await pageFor({clock:false});try{
 await page.click('[data-object="MY_FACE"]');await page.click('#photo-camera');await page.waitForSelector('#capture:not([hidden])');
 await page.evaluate(()=>window.capturedStream=document.getElementById('photo-video').srcObject);await page.click('#capture');
 assert.equal(await page.evaluate(()=>window.capturedStream.getTracks().every(t=>t.readyState==='ended')),true);
 await page.click('#use-image');assert.equal(await page.locator('[data-object="MY_FACE"] img').count(),1);
 await page.click('#photo-camera');await page.waitForSelector('#capture:not([hidden])');await page.click('#stop-photo');
 assert.equal(await page.evaluate(()=>document.getElementById('photo-video').srcObject),null);assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('slow startup cannot lose a mode or difficulty choice before event registration',async()=>{
 const page=await browser.newPage();let release;const gate=new Promise(resolve=>release=resolve);
 try{
 await page.route('**/src/app.js*',async route=>{await gate;await route.continue();});
 await page.goto(origin,{waitUntil:'commit'});await page.waitForSelector('[data-game-mode="SURVIVAL"]',{state:'attached'});
 assert.equal(await page.locator('[data-game-mode="SURVIVAL"]').isDisabled(),true);
 assert.equal(await page.locator('[data-level="hard"]').isDisabled(),true);assert.equal(await page.locator('#mode').isDisabled(),true);
 release();await page.waitForFunction(()=>document.body.dataset.appReady==='true');
 await page.click('[data-game-mode="SURVIVAL"]');await page.click('[data-level="hard"]');await page.selectOption('#mode','test');
 await page.waitForFunction(()=>!document.getElementById('center').disabled);await page.click('#center');await page.click('#start');
 assert.equal(await page.locator('#time-label').textContent(),'いま');assert.equal(await page.locator('[data-level="hard"]').getAttribute('aria-pressed'),'true');
 }finally{release?.();await page.close();}
});
test('variable time, rolling balls, sound preferences and gift five layouts with editable independent photos',async()=>{
 const page=await pageFor();try{
 await page.locator('#staff').evaluate(e=>e.open=true);await page.selectOption('#audio-alert','whistle');await page.locator('#audio-effects-volume').fill('25');await page.locator('#audio-effects-volume').dispatchEvent('input');await page.selectOption('#audio-voice-mode','SELECT');await page.selectOption('#audio-phrase','まんなか！');await page.selectOption('#audio-event','star');await page.click('#audio-test');
 const prefs=JSON.parse(await page.evaluate(()=>localStorage.getItem('seesaw:audio')));assert.equal(prefs.alert,'whistle');assert.equal(prefs.effectsVolume,.25);assert.equal(prefs.voiceMode,'SELECT');await page.reload();await page.waitForFunction(()=>document.body.dataset.appReady==='true');assert.equal(await page.locator('#audio-alert').inputValue(),'whistle');
 await page.locator('#play-duration').fill('5');await page.locator('#play-duration').dispatchEvent('input');assert.equal(await page.locator('#play-duration-value').textContent(),'5びょう');await pcStart(page,'STAR','BASKETBALL');await page.locator('#tilt').fill('10');await page.locator('#tilt').dispatchEvent('input');await page.clock.runFor(900);const rotation1=await page.locator('#egg').evaluate(e=>e.style.transform);await page.clock.runFor(500);assert.notEqual(await page.locator('#egg').evaluate(e=>e.style.transform),rotation1);await page.locator('#tilt').fill('0');await page.locator('#tilt').dispatchEvent('input');await page.clock.runFor(4100);
 const stats=JSON.parse(await page.locator('#metrics').textContent());assert.equal(stats.configuredDuration,5);assert.ok(stats.starCount<=2);await page.click('#gift-open');await page.waitForFunction(()=>!document.getElementById('gift-save').disabled);
 for(const k of ['smile','drawing']){const bytes=await page.evaluate(k=>{const c=document.createElement('canvas');c.width=900;c.height=600;const x=c.getContext('2d');x.fillStyle=k==='smile'?'#ff0000':'#0000ff';x.fillRect(0,0,900,600);return c.toDataURL('image/png').split(',')[1];},k);await page.setInputFiles(`#gift-file-${k}`,{name:k+'.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});await page.waitForFunction(()=>!document.getElementById('gift-save').disabled);}
 for(const layout of ['A','B','C','D','E'])for(const orientation of ['portrait','landscape']){await page.selectOption('#gift-layout',layout);await page.selectOption('#gift-orientation',orientation);await page.waitForFunction(()=>!document.getElementById('gift-save').disabled);const geometry=await page.locator('#gift-canvas').evaluate(c=>[c.width,c.height]);assert.deepEqual(geometry,orientation==='portrait'?[1080,1620]:[1620,1080]);}
 await page.locator('#gift-zoom-smile').fill('2');await page.locator('#gift-zoom-smile').dispatchEvent('input');await page.locator('#gift-x-smile').fill('1');await page.locator('#gift-x-smile').dispatchEvent('input');await page.selectOption('#gift-background','pink');await page.selectOption('#gift-frame','nature');await page.waitForFunction(()=>!document.getElementById('gift-save').disabled);
 const colors=await page.locator('#gift-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(400,400,1,1).data));assert.deepEqual(colors.slice(0,3),[0,0,255]); // E uses independent drawing, not smile/object.
 await page.click('#gift-remove-drawing');await page.waitForFunction(()=>!document.getElementById('gift-save').disabled);const color=await page.locator('#gift-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(400,400,1,1).data));assert.deepEqual(color.slice(0,3),[255,0,0]);
 await page.click('#gift-discard');await page.waitForFunction(()=>!document.getElementById('gift-save').disabled);await page.click('#gift-back');await page.click('#other-game');assert.equal(await page.locator('[data-object="MY_FACE"] img').count(),0);assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
test('PHOTO GIFT camera captures and retakes both independent materials, closes all tracks',async()=>{
 const page=await pageFor({clock:false});try{
 await page.selectOption('#mode','test');await page.locator('#play-duration').fill('5');await page.locator('#play-duration').dispatchEvent('input');await page.waitForFunction(()=>!document.getElementById('center').disabled);await page.click('#center');await page.click('#start');await page.waitForSelector('#result:not([hidden])',{timeout:10000});await page.click('#gift-open');
 for(const k of ['smile','drawing']){await page.click(`#gift-camera-${k}`);await page.waitForFunction(()=>document.getElementById('gift-video').videoWidth>0);await page.evaluate(()=>window.giftStream=document.getElementById('gift-video').srcObject);await page.click('#gift-capture');assert.equal(await page.evaluate(()=>window.giftStream.getTracks().every(t=>t.readyState==='ended')),true);await page.waitForFunction(()=>!document.getElementById('gift-save').disabled);}
 await page.click('#gift-camera-smile');await page.waitForSelector('#gift-camera-panel:not([hidden])');await page.evaluate(()=>window.giftStream=document.getElementById('gift-video').srcObject);await page.click('#gift-back');assert.equal(await page.evaluate(()=>window.giftStream.getTracks().every(t=>t.readyState==='ended')),true);assert.deepEqual(page.errors,[]);
 }finally{await page.close();}
});
