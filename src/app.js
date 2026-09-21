import { config, difficulties } from './config.js';
import { VBFInput, TiltInput, clamp } from './input.js';
import { EggGame, toCSV } from './game.js';
const $ = id => document.getElementById(id);
let difficulty = 'easy', mode = 'sensor', phase = 'setup', game = null, paused = false;
let needsCenter = false, accumulator = 0, previous = 0, wakeLock = null, requestingLock = false;
let testAngle = 0, connectionVersion = 0, connectionTimer, trialMetadata;
const testInput = new VBFInput();
const tiltInput = new TiltInput(() => {
  needsCenter = true;
  if (phase === 'play') pause('画面の向きが変わりました。まんなかを設定し直してください。');
  else { $('status').textContent = '画面の向きが変わったよ。もういちど まんなかにしてね。'; $('start').disabled = true; }
});
const input = () => mode === 'test' ? testInput : tiltInput;
const fresh = () => input().ready && (mode === 'test' || performance.now() - input().lastSample < config.staleMs);
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
  $('reset-center').hidden = !needsCenter;
  $('resume').hidden = needsCenter;
}
function resume(recenter = false) {
  if (!fresh()) { $('pause-reason').textContent = 'センサーの入力を待っています。端末とブラウザーの許可を確認してください。'; return; }
  if (recenter) { input().calibrate(); needsCenter = false; }
  if (needsCenter) return;
  paused = false; previous = performance.now(); accumulator = 0; $('pause-panel').hidden = true;
  acquireWakeLock();
}
function prepare() {
  game = null; paused = false; releaseWakeLock(); show('setup');
  $('pause-panel').hidden = true;
  $('status').textContent = '固定をたしかめて、まんなかにしてね。';
  input().calibrated = false; $('start').disabled = true;
  $('research').open = false;
}
$('mode').addEventListener('change', () => {
  connectionVersion++; clearTimeout(connectionTimer); tiltInput.disconnect(); tiltInput.reset();
  mode = $('mode').value; needsCenter = false;
  $('connect').disabled = mode === 'test'; $('start').disabled = true;
  $('test-controls').hidden = mode !== 'test';
  if (mode === 'test') { testAngle = 0; $('tilt').value = 0; testInput.reset(); testInput.push(0); }
  $('status').textContent = mode === 'test' ? 'キーやスライダーで動かして、② まんなかにしてね。' : 'スマホを固定して、①からはじめよう。';
});
$('connect').addEventListener('click', async () => {
  const version = ++connectionVersion;
  $('connect').disabled = true;
  $('status').textContent = 'センサーを待っています…';
  try {
    await tiltInput.connect();
    if (version !== connectionVersion) { tiltInput.disconnect(); return; }
    $('status').textContent = '入力を待っています。受信したら②を押してね。';
    connectionTimer = setTimeout(() => {
      if (version !== connectionVersion) return;
      $('status').textContent = fresh() ? '準備できたよ。② まんなかにしてね。' : '入力が届きません。HTTPS・センサー許可を確認するか、PCテストを選んでね。';
      $('connect').disabled = false;
    }, 3000);
  } catch (error) { if (version === connectionVersion) { $('status').textContent = error.message; $('connect').disabled = false; } }
});
$('center').addEventListener('click', () => {
  if (!fresh()) return;
  input().calibrate(); needsCenter = false; $('start').disabled = false;
  clearTimeout(connectionTimer); $('connect').disabled = mode === 'test';
  $('status').textContent = 'ここが まんなか！ あそぶ準備ができたよ。';
});
document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => {
  difficulty = button.dataset.level;
  document.querySelectorAll('[data-level]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));
$('start').addEventListener('click', () => {
  if (!fresh() || !input().calibrated) { $('status').textContent = '入力を確認して、まんなかを設定してね。'; return; }
  game = new EggGame(difficulty); paused = false; needsCenter = false;
  trialMetadata = { startedAt: new Date().toISOString(), inputMode: mode, baselineAngle: input().baselineAngle,
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
    $('storage-note').textContent = '最新の1試行をこのブラウザー内に保存しました。外部には送信しません。必要な記録はCSVで保存してください。';
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
  if (phase === 'setup') { $('center').disabled = !fresh(); $('start').disabled = !fresh() || !input().calibrated; }
  if (phase === 'play' && !paused) {
    const dt = (now - previous) / 1000;
    if (!fresh()) pause('センサーの入力がとぎれました。入力が戻ったら、つづけよう。');
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
