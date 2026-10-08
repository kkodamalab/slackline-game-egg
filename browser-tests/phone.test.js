import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import jsQR from 'jsqr';
let browser, app, signal, turn, origin, peerPort, turnPort;
before(async()=>{
 const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));origin=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
 signal=spawn(process.execPath,['--input-type=module','-e',"import { PeerServer } from 'peer';PeerServer({port:0,host:'127.0.0.1',path:'/peerjs'},server=>console.log(server.address().port));"],{stdio:'pipe'});
 peerPort=Number((await once(signal.stdout,'data'))[0].toString().trim());assert.ok(peerPort>0);
 for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await delay(50);if(i===99)throw Error('App startup failed');}
 const executablePath=process.env.BROWSER_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 // A loopback-only TCP TURN fixture respects managed Chromium's UDP prohibition.
 // Production continues to use the original PeerJS defaults.
 const root='/workspace/.seesaw-test-tools/coturn';
 const extracted=existsSync(`${root}/usr/bin/turnserver`);
 const binary=process.env.SEESAW_TURN_BINARY || (extracted?`${root}/usr/bin/turnserver`:existsSync('/usr/bin/turnserver')?'/usr/bin/turnserver':null);
 if (binary) {
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');turnPort=listener.address().port;await new Promise(r=>listener.close(r));
 const program=extracted && !process.env.SEESAW_TURN_BINARY ? '/lib64/ld-linux-x86-64.so.2':binary;
 const prefix=program===binary?[]:['--library-path',`${root}/usr/lib/x86_64-linux-gnu`,binary];
 turn=spawn(program,[...prefix,'-n','--listening-ip=127.0.0.1','--relay-ip=127.0.0.1',`--listening-port=${turnPort}`,'--user=seesaw-test:local-only-test','--realm=seesaw-local-test','--lt-cred-mech','--relay-threads=1','--no-tls','--no-dtls','--no-udp','--allow-loopback-peers','--no-cli','--log-file=stdout','--pidfile=/tmp/seesaw-test-turn.pid'],{stdio:'pipe'});
 await delay(1000);if(turn.exitCode!==null)throw Error('Test TCP TURN failed to start');
 }
 browser=await chromium.launch({executablePath,channel:process.env.BROWSER_CHANNEL||undefined,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();app?.kill();signal?.kill();turn?.kill();});
async function contextFor(){
 const context=await browser.newContext();
 const options={host:'127.0.0.1',port:peerPort,path:'/peerjs',secure:false,config:turnPort?{iceTransportPolicy:'relay',iceServers:[{urls:`turn:127.0.0.1:${turnPort}?transport=tcp`,username:'seesaw-test',credential:'local-only-test'}]}:{iceServers:[]}};
 const source=readFileSync('vendor/peerjs-1.5.5.min.js','utf8');
 await context.route('**/vendor/peerjs-1.5.5.min.js',route=>route.fulfill({contentType:'application/javascript',body:source+`\nconst RealPeer = window.Peer; window.Peer = class extends RealPeer {constructor(id,options){if(typeof id === 'object'){options=id;id=undefined;}super(id,{...options,...${JSON.stringify(options)}});}};`}));
 return context;
}
async function pair(mode='KEEP',{sensor=false}={}){
 const hostContext=await contextFor(),phoneContext=await contextFor();
 const host=await hostContext.newPage(),phone=await phoneContext.newPage();const errors=[];host.on('pageerror',e=>errors.push(e.message));phone.on('pageerror',e=>errors.push(e.message));
 await host.goto(origin);await host.click(`[data-game-mode="${mode}"]`);
 await host.waitForSelector('#qr canvas',{state:'attached',timeout:15000});
 await host.waitForFunction(()=>document.getElementById('connection-state').textContent.includes('スマホをつないで'));
 const url=await host.locator('#controller-link').getAttribute('href');assert.equal(new URL(url).searchParams.get('player'),'A');
 await phone.goto(url+(sensor?'':'&controllerTest=1'));
 await phone.waitForFunction(()=>document.getElementById('controller-connection').textContent.includes('●'),null,{timeout:15000});
 if(sensor)await phone.evaluate(()=>{window.DeviceOrientationEvent.requestPermission=async()=>{window.permissionFromClick=true;return 'granted';};});
 await phone.click('#controller-enable');
 if(sensor)await phone.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:0,gamma:0})));
 await phone.waitForFunction(()=>!document.getElementById('controller-center').disabled);await phone.click('#controller-center');
 await host.waitForFunction(()=>!document.getElementById('start').disabled);
 return {host,phone,errors,hostContext,phoneContext,url,close:async()=>{await hostContext.close();await phoneContext.close();}};
}
test('real generated QR decodes to correct Controller URL, and titles follow every object',async()=>{
 const context=await contextFor(),page=await context.newPage();try{
 await page.goto(origin);await page.waitForSelector('#qr canvas',{state:'attached'});
 assert.ok((await page.locator('#qr-note').textContent()).includes('同じPC'));
 const pixels=await page.locator('#qr canvas').evaluate(c=>({width:c.width,height:c.height,data:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)}));
 const decoded=jsQR(Uint8ClampedArray.from(pixels.data),pixels.width,pixels.height);assert.ok(decoded);
 assert.equal(decoded.data,await page.locator('#controller-link').getAttribute('href'));
 assert.equal(new URL(decoded.data).pathname,'/');assert.ok((await page.locator('#room-code').textContent()).includes(new URL(decoded.data).searchParams.get('room')));
 for(const [type,name] of [['EGG','たまご'],['BALL','ボール'],['APPLE','りんご'],['CHICK','ひよこ'],['MY_FACE','じぶんの顔'],['MY_DRAWING','じぶんの絵'],['MY_PHOTO','写真']]){
 await page.click(`[data-object="${type}"]`);assert.equal(await page.locator('#object-title').textContent(),`${name}を落とすな！`);assert.ok((await page.title()).includes(name));}
 }finally{await context.close();}
});
for(const mode of ['KEEP','STAR','SURVIVAL'])test(`two real WebRTC screens: PHONE CONTROLLER operates ${mode}`,async()=>{
 const p=await pair(mode);try{
 assert.equal(await p.host.locator('#qr-panel').getAttribute('open'),null);
 await p.host.click('#start');await p.phone.locator('#controller-test-tilt').fill('20');
 await p.host.waitForFunction(()=>parseFloat(document.getElementById('platform').style.transform.match(/[-\d.]+/)?.[0])>10);
 await p.host.waitForFunction(()=>parseFloat(document.getElementById('egg').style.left)>52);
 if(mode==='STAR'){
 await p.phone.locator('#controller-test-tilt').fill('0');await p.host.waitForTimeout(2500);assert.ok(Number(await p.host.locator('#stars').textContent())>=1);
 }
 if(mode==='SURVIVAL'){
 await p.phone.locator('#controller-test-tilt').fill('30');await p.host.waitForSelector('#result:not([hidden])',{timeout:15000});
 const summary=JSON.parse(await p.host.locator('#metrics').textContent());assert.equal(summary.inputMode,'phone');assert.equal(summary.dropCount,1);assert.ok(summary.survivalTime<60);
 }
 assert.deepEqual(p.errors,[]);
 }finally{await p.close();}
});
test('disconnect freezes; same-room reconnect, remote calibration, input switch and new-room rejection',async()=>{
 const p=await pair();try{
 await p.host.click('#start');await p.host.waitForTimeout(1100);await p.phone.click('#controller-retry');
 await p.host.waitForSelector('#pause-panel:not([hidden])');const time=await p.host.locator('#time').textContent();
 await p.host.waitForTimeout(1200);assert.equal(await p.host.locator('#time').textContent(),time);
 await p.phone.waitForFunction(()=>document.getElementById('controller-connection').textContent.includes('●'));await p.host.waitForFunction(()=>document.getElementById('center-state').textContent.includes('✓'));
 await p.host.click('#resume');assert.equal(await p.host.locator('#pause-panel').isVisible(),false);
 await p.host.click('#pause');await p.host.click('#quit');await p.phone.locator('#controller-test-tilt').fill('12');await p.host.waitForTimeout(200);
 await p.host.click('#phone-center');await p.host.waitForTimeout(200);await p.host.click('#start');
 await p.host.waitForFunction(()=>Math.abs(parseFloat(document.getElementById('platform').style.transform.match(/[-\d.]+/)?.[0]))<1);
 await p.host.click('#pause');await p.host.click('#quit');await p.host.selectOption('#mode','test');
 assert.equal(await p.host.locator('#phone-connection').isVisible(),false);await p.host.click('#center');await p.host.click('#start');
 await p.phone.locator('#controller-test-tilt').fill('30');await p.host.waitForTimeout(300);assert.ok((await p.host.locator('#platform').getAttribute('style')).includes('rotate(0deg)'));
 await p.host.click('#pause');await p.host.click('#quit');await p.host.selectOption('#mode','phone');await p.host.waitForSelector('#qr canvas',{state:'attached'});
 assert.notEqual(await p.host.locator('#controller-link').getAttribute('href'),p.url);assert.equal(await p.host.locator('#start').isDisabled(),true);
 assert.deepEqual(p.errors,[]);
 }finally{await p.close();}
});
test('real DataChannel carries simulated sensor permission, rotation and stale sensor pause',async()=>{
 const p=await pair('KEEP',{sensor:true});try{
 assert.equal(await p.phone.evaluate(()=>window.permissionFromClick),true);await p.host.click('#start');
 await p.phone.evaluate(()=>{for(let i=0;i<30;i++)window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:0,gamma:15}));});
 await p.host.waitForFunction(()=>parseFloat(document.getElementById('platform').style.transform.match(/[-\d.]+/)?.[0])>10);
 await p.phone.evaluate(()=>screen.orientation.dispatchEvent(new Event('change')));await p.host.waitForSelector('#pause-panel:not([hidden])');
 await p.phone.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:0,gamma:10})));
 await p.phone.click('#controller-center');await p.host.waitForFunction(()=>document.getElementById('center-state').textContent.includes('✓'));await p.host.click('#resume');
 await p.host.waitForFunction(()=>!document.getElementById('pause-panel').hidden,{timeout:6000});assert.deepEqual(p.errors,[]);
 }finally{await p.close();}
});
