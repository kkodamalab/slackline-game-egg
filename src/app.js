import { config, difficulties } from './config.js';
import { VBFInput, clamp } from './input.js';
import { RemoteTiltInput } from './remote-input.js';
import { PeerBus } from './peer-bus.js';
import { controllerURL, isPhoneURL, renderQR } from './qr-connection.js';
import { EggGame, toCSV } from './game.js';
const $ = id => document.getElementById(id);
let difficulty = 'easy', mode = 'sensor', phase = 'setup', game = null, paused = false;
let needsCenter = false, accumulator = 0, previous = 0, wakeLock = null, requestingLock = false;
let testAngle = 0, trialMetadata, bus = null, room = '';
const testInput = new VBFInput();
const remoteInput = new RemoteTiltInput();
const input = () => mode === 'test' ? testInput : remoteInput;
const fresh = () => mode === 'test' ? testInput.ready : remoteInput.fresh();
const playable = () => fresh() && input().calibrated;
const setText = (id, text) => { if ($(id).textContent !== text) $(id).textContent = text; };
function connectionUI() {
  if (mode !== 'sensor') return;
  setText('connection-state', remoteInput.connected ? '● スマホ接続中' : '○ スマホをつないでください');
  setText('sensor-state', remoteInput.fresh() ? '✓ センサーON' + (remoteInput.inputType === 'test' ? '（模擬入力）' : '') : '○ スマホでセンサーをONにしてください');
  setText('center-state', remoteInput.calibrated ? '✓ まんなか設定済み' : '○ スマホで「まんなかにする」を押してください');
  if (phase === 'setup') setText('status', playable() ? '準備できたよ！ PCで「あそぶ！」を押してね。' : 'スマホの接続・センサーON・まんなか設定がそろうと始められます。');
}
function updateQR() {
  if (!room) return;
  try {
    const url = controllerURL($('controller-base').value, room);
    $('controller-link').href = url; $('controller-link').hidden = false;
    renderQR($('qr'), url);
    setText('qr-note', isPhoneURL(url) ? 'スマホのカメラでQRコードを読み取ってください。' : 'このURLはスマホのセンサーに使えません。同じPCの接続テスト専用です。スマホ接続にはゲームを配信したHTTPS URLを指定してください。');
    $('qr-note').classList.toggle('warning', !isPhoneURL(url));
    setText('room-code', 'ROOM ' + room.slice(-6).toUpperCase());
  } catch (error) { $('qr').replaceChildren(); $('controller-link').hidden = true; setText('qr-note', error.message); }
}
function createHost() {
  bus?.close(); remoteInput.reset(); room = ''; $('qr').replaceChildren(); $('controller-link').hidden = true;
  setText('qr-note', '接続用のQRコードを準備しています…'); setText('room-code', '');
  try {
    bus = new PeerBus('', 'host');
    bus.onReady = id => { room = id; updateQR(); };
    bus.onPresence = (role, connected) => {
      if (role !== 'A') return;
      remoteInput.setConnected(connected);
      if (!connected && phase === 'play') pause('スマホとの接続が切れました。再接続を待ってから、つづけよう。');
      connectionUI();
    };
    bus.onInput = (role, packet) => {
      if (role !== 'A' || mode !== 'sensor') return;
      if (!remoteInput.receive(packet)) return;
      needsCenter = !remoteInput.calibrated;
      const calibrationKey = `${remoteInput.sessionId}:${remoteInput.calibrationId}:${remoteInput.baselineAngle}`;
      if (phase === 'play' && game && trialMetadata.controllerCalibrationKey !== calibrationKey) {
        trialMetadata.controllerCalibrationKey = calibrationKey;
        (trialMetadata.recalibrations ??= []).push({ timestamp: game.elapsed, baselineAngle: remoteInput.baselineAngle, calibrationId: remoteInput.calibrationId });
        pause(remoteInput.calibrated ? 'スマホのまんなか設定が変わりました。準備ができたら、つづけよう。' : 'スマホで「まんなかにする」を押してください。');
      }
      connectionUI();
    };
    bus.onConnectionError = () => {
      if (!room) setText('qr-note', '接続サービスに到達できません。「接続を作り直す」で再試行してください。');
    };
  } catch (error) { setText('qr-note', error.message); }
}
$('controller-base').value = location.origin + location.pathname;
$('update-qr').addEventListener('click', updateQR);
$('new-room').addEventListener('click', createHost);
createHost();
const feedbackTimer = setInterval(() => {
  if (bus && mode === 'sensor') bus.send({ type: 'feedback', payload: { phase, paused, canStart: playable() } });
}, 500);
window.addEventListener('pagehide', () => { clearInterval(feedbackTimer); bus?.close(); });
function show(next) {
  phase = next;
  for (const name of ['setup', 'play', 'result']) $(name).hidden = name !== next;
  $('test-controls').hidden = mode !== 'test' || next === 'result';
  window.scrollTo(0, 0);
}
async function acquireWakeLock() {
  if (wakeLock || requestingLock || phase !== 'play' || paused || document.hidden) return;
  requestingLock = true;
  try {
    const lock = await navigator.wakeLock?.request('screen');
    if (!lock) return;
    if (phase !== 'play' || paused || document.hidden) { await lock.release(); return; }
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  } catch { /* Optional enhancement; unsupported devices can still play. */ }
  finally { requestingLock = false; }
}
function releaseWakeLock() { const lock = wakeLock; wakeLock = null; lock?.release().catch(() => {}); }
function pause(reason) {
  if (phase !== 'play') return;
  paused = true; accumulator = 0; releaseWakeLock();
  $('pause-panel').hidden = false; $('pause-reason').textContent = reason;
  $('reset-center').hidden = mode !== 'test' || !needsCenter;
  $('resume').hidden = false;
}
function resume(recenter = false) {
  if (!fresh()) { $('pause-reason').textContent = 'センサーの入力を待っています。端末とブラウザーの許可を確認してください。'; return; }
  if (recenter && mode === 'test') { testInput.calibrate(); needsCenter = false; }
  if (!input().calibrated) { $('pause-reason').textContent = 'スマホで「まんなかにする」を押してください。'; return; }
  needsCenter = false;
  paused = false; previous = performance.now(); accumulator = 0; $('pause-panel').hidden = true;
  acquireWakeLock();
}
function prepare() {
  game = null; paused = false; releaseWakeLock(); show('setup');
  $('pause-panel').hidden = true;
  $('status').textContent = '固定をたしかめて、まんなかにしてね。';
  if (mode === 'test') testInput.calibrated = false;
  $('start').disabled = !playable();
  $('research').open = false;
}
$('mode').addEventListener('change', () => {
  mode = $('mode').value; needsCenter = false;
  $('phone-connection').hidden = mode !== 'sensor';
  $('test-preparation').hidden = mode !== 'test';
  $('test-controls').hidden = mode !== 'test';
  if (mode === 'test') {
    bus?.close(); bus = null; remoteInput.reset();
    testAngle = 0; $('tilt').value = 0; testInput.reset(); testInput.push(0);
    $('status').textContent = 'キーやスライダーで動かして、まんなかにしてね。';
  } else createHost();
  $('start').disabled = !playable();
});
$('center').addEventListener('click', () => {
  if (mode !== 'test' || !fresh()) return;
  testInput.calibrate(); needsCenter = false; $('start').disabled = false;
  $('status').textContent = 'ここが まんなか！ あそぶ準備ができたよ。';
});
document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => {
  difficulty = button.dataset.level;
  document.querySelectorAll('[data-level]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));
$('start').addEventListener('click', () => {
  if (!fresh() || !input().calibrated) { $('status').textContent = '入力を確認して、まんなかを設定してね。'; return; }
  game = new EggGame(difficulty); paused = false; needsCenter = false;
  trialMetadata = { startedAt: new Date().toISOString(), inputMode: mode === 'sensor' ? 'remote-' + remoteInput.inputType : 'test', baselineAngle: input().baselineAngle,
    roomId: mode === 'sensor' ? room : null, calibrationId: mode === 'sensor' ? remoteInput.calibrationId : null,
    controllerCalibrationKey: mode === 'sensor' ? `${remoteInput.sessionId}:${remoteInput.calibrationId}:${remoteInput.baselineAngle}` : null,
    filterAlpha: config.alpha, sampleInterval: config.sampleInterval, difficulty, settings: { ...difficulties[difficulty] } };
  accumulator = 0; previous = performance.now(); show('play'); acquireWakeLock(); render();
});
$('pause').addEventListener('click', () => pause('準備ができたら、つづけよう。'));
$('resume').addEventListener('click', () => resume());
$('reset-center').addEventListener('click', () => {
  if (fresh()) (trialMetadata.recalibrations ??= []).push({ timestamp: game.elapsed, baselineAngle: input().rawAngle });
  resume(true);
});
$('quit').addEventListener('click', prepare);
$('again').addEventListener('click', prepare);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause('画面をはなれたので、おやすみしています。'); });
window.addEventListener('pagehide', releaseWakeLock);
$('tilt').addEventListener('input', () => { testAngle = Number($('tilt').value); });
window.addEventListener('keydown', event => {
  if (mode !== 'test' || phase === 'result' || !['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) return;
  if (event.target.matches('select,textarea,input:not([type=range])')) return;
  event.preventDefault();
  testAngle = event.code === 'Space' ? 0 : clamp(testAngle + (event.code === 'ArrowRight' ? 2 : -2), -30, 30);
  $('tilt').value = testAngle;
});
function render() {
  if (!game) return;
  const angle = input().read().gameAngle;
  $('platform').style.transform = `rotate(${angle}deg)`;
  $('platform').classList.toggle('safe', game.isSafe);
  $('zone').style.width = `${game.settings.safeZoneWidth * 100}%`;
  $('egg').style.left = `${50 + game.position * 50}%`;
  const falling = game.respawn > 0;
  const fallProgress = falling ? 1 - game.respawn / config.respawnSeconds : 0;
  $('egg').style.transform = `translate(-50%, ${fallProgress * 230}px) rotate(${game.position * 24}deg)`;
  $('egg').style.opacity = String(1 - fallProgress);
  $('face').textContent = game.isSafe ? '•‿•' : '•ᴗ•';
  $('time').textContent = Math.max(0, Math.ceil(config.duration - game.elapsed));
  $('stars').textContent = game.stars;
  const message = falling ? 'おっと！ もういちど' : !game.isSafe ? 'そーっと、まっすぐ' : game.streak >= 6 ? 'すごい！' : game.streak >= 2 ? 'いいね！' : 'そのまま！';
  if ($('message').textContent !== message) $('message').textContent = message;
}
function finish() {
  releaseWakeLock(); show('result');
  $('total-stars').textContent = game.stars;
  const summary = game.summary();
  $('metrics').textContent = JSON.stringify({ ...trialMetadata, ...summary }, null, 2);
  try {
    localStorage.setItem('keep-the-egg:last-trial', JSON.stringify({ metadata: trialMetadata, summary, samples: game.samples }));
    $('storage-note').textContent = '最新の1試行をこのブラウザー内に保存しました。試行記録は外部保存しません。スマホの傾きはDataChannel経由でこのPCへ届きます。必要な記録はCSVで保存してください。';
  } catch { $('storage-note').textContent = 'ブラウザー内に保存できませんでした。画面を閉じる前にCSVを保存してください。'; }
}
function downloadCSV(name, rows) {
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('samples-csv').addEventListener('click', () => downloadCSV('keep-the-egg-samples.csv', game.samples));
$('summary-csv').addEventListener('click', () => downloadCSV('keep-the-egg-summary.csv', [{ ...trialMetadata, settings: JSON.stringify(trialMetadata.settings), recalibrations: JSON.stringify(trialMetadata.recalibrations ?? []), ...game.summary() }]));
function frame(now) {
  if (mode === 'test') { testInput.push(testAngle, now); $('tilt-value').textContent = `${testAngle}°`; }
  connectionUI();
  if (phase === 'setup') { $('center').disabled = mode !== 'test' || !fresh(); $('start').disabled = !playable(); }
  if (phase === 'play' && !paused) {
    const dt = (now - previous) / 1000;
    if (!fresh()) pause('スマホの入力がとぎれました。接続とセンサーを確認してから、つづけよう。');
    else if (!input().calibrated) pause('スマホで「まんなかにする」を押してください。');
    else if (dt > 0.5) pause('少しおやすみしました。準備ができたら、つづけよう。');
    else {
      accumulator += Math.max(0, dt);
      while (accumulator >= config.step && !game.done) { game.step(config.step, input().read()); accumulator -= config.step; }
      render();
      if (game.done) finish();
    }
  }
  previous = now; requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
