import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PeerBus } from '../src/peer-bus.js';
import { controllerURL, isPhoneURL, renderQR } from '../src/qr-connection.js';
import { VBFInput, TiltInput } from '../src/input.js';
import { RemoteTiltInput, tiltPacket } from '../src/remote-input.js';
import { EggGame } from '../src/game.js';
import { config } from '../src/config.js';

function sample({ sequence = 1, sensorOn = true, calibrated = true, now = 100, angle = 12 } = {}) {
  const sensor = new VBFInput(); sensor.push(0, 0);
  if (calibrated) sensor.calibrate();
  for (let i = 0; i < 100; i++) sensor.push(angle, now);
  return tiltPacket(sensor, { sequence, sensorOn, calibrationId: calibrated ? 1 : 0, sessionId: 'phone-1', now, timestamp: 1000 });
}
test('remote start gate requires connection, fresh sensor and controller calibration', () => {
  const input = new RemoteTiltInput(); assert.equal(input.receive(sample(), 100), false);
  input.setConnected(true); assert.equal(input.canStart(100), false);
  input.receive(sample({ sensorOn: false }), 100); assert.equal(input.canStart(100), false);
  input.receive(sample({ sequence: 2, calibrated: false }), 101); assert.equal(input.canStart(101), false);
  input.receive(sample({ sequence: 3 }), 102); assert.equal(input.canStart(102), true);
  assert.equal(input.canStart(102 + config.staleMs), false);
  input.setConnected(false); assert.equal(input.canStart(103), false); assert.equal(input.calibrated, false);
});
test('raw, filtered, relative and time fields survive transport without double filtering', () => {
  const packet = sample(); const input = new RemoteTiltInput(); input.setConnected(true);
  input.receive(packet, 100); assert.equal(input.read().relativeAngle, packet.relativeAngle);
  assert.equal(input.read().rawAngle, 12); assert.equal(input.filteredAngle, packet.filteredAngle);
  assert.equal(input.timestamp, 1000);
});
test('reject malformed, duplicate, reordered and other-session packets without refreshing liveness', () => {
  const input = new RemoteTiltInput(); input.setConnected(true); input.receive(sample(), 100);
  for (const overrides of [{ sequenceNumber: 1 }, { sequenceNumber: 0 }, { rawAngle: NaN }, { relativeAngle: 999 },
    { calibrated: 'true' }, { protocol: 'other' }, { sessionId: 'phone-2' }, { sampleAgeMs: 99999 }]) {
    assert.equal(input.receive({ ...sample({ sequence: 2 }), ...overrides }, 200), false);
    assert.equal(input.lastSample, 100);
  }
  input.setConnected(false); input.setConnected(true);
  assert.equal(input.receive({ ...sample(), sessionId: 'phone-2' }, 201), true);
});
test('background or stopped sensors cannot appear live despite state heartbeats', () => {
  const sensor = new VBFInput(); sensor.push(0, 0); sensor.calibrate();
  const fields = { sequence: 1, sessionId: 'phone', sensorOn: true, calibrationId: 1, now: 100, timestamp: 1000 };
  assert.equal(tiltPacket(sensor, { ...fields, visible: false }).sensorOn, false);
  assert.equal(tiltPacket(sensor, { ...fields, now: 3000 }).sensorOn, false);
});
test('UCM QR URL format preserves deployment subpath and replaces old params; one QR', () => {
  const url = controllerURL('https://example.com/egg/index.html?old=1#x', 'room-1');
  assert.equal(url, 'https://example.com/egg/index.html?room=room-1&player=A');
  assert.equal(controllerURL('https://kkodamalab.github.io/slackline-game-egg/', 'room-1'),
    'https://kkodamalab.github.io/slackline-game-egg/?room=room-1&player=A');
  assert.equal(isPhoneURL(url), true); assert.equal(isPhoneURL('http://localhost:4173/'), false);
  assert.throws(() => controllerURL('javascript:alert(1)', 'room'));
  let cleared = 0, generated;
  class QR { static CorrectLevel = { M: 0 }; constructor(element, options) { generated = options; } }
  renderQR({ replaceChildren() { cleared++; }, removeAttribute() {} }, url, QR);
  assert.equal(cleared, 1); assert.equal(generated.text, url); assert.equal(generated.width, 240);
});

class Connection extends EventEmitter {
  constructor(metadata) { super(); this.metadata = metadata; this.open = false; this.bufferSize = 0; this.sent = []; }
  send(message) { this.sent.push(message); this.other?.emit('data', message); }
  close() { if (this.closed) return; this.closed = true; this.open = false; this.emit('close'); this.other?.close(); }
}
function network() {
  const peers = new Map(), timers = new Map(); let timerId = 0, peerId = 0;
  class Peer extends EventEmitter {
    constructor() { super(); this.id = 'peer-' + ++peerId; peers.set(this.id, this); this.destroyed = false; }
    start() { this.emit('open', this.id); }
    connect(room, options) {
      const outbound = new Connection(options.metadata), inbound = new Connection(options.metadata);
      outbound.other = inbound; inbound.other = outbound; peers.get(room).emit('connection', inbound);
      this.last = outbound; this.options = options; return outbound;
    }
    reconnect() { this.disconnected = false; this.start(); }
    destroy() { this.destroyed = true; }
  }
  const opts = { PeerClass: Peer, sessionId: 'session-A',
    setTimer: fn => { timers.set(++timerId, fn); return timerId; }, clearTimer: id => timers.delete(id) };
  const open = connection => { connection.open = connection.other.open = true; connection.other.emit('open'); connection.emit('open'); };
  return { opts, timers, open };
}
test('Host QR → Controller input → PeerBus DataChannel abstraction → EggGame full trial', () => {
  const net = network(); const host = new PeerBus('', 'host', net.opts); const remote = new RemoteTiltInput();
  const game = new EggGame();
  host.onPresence = (_, connected) => remote.setConnected(connected);
  let now = 0; host.onInput = (_, message) => remote.receive(message, now);
  host.peer.start(); const url = new URL(controllerURL('https://example.test/', host.room));
  const controller = new PeerBus(url.searchParams.get('room'), url.searchParams.get('player'), net.opts);
  controller.peer.start(); net.open(controller.connection);
  assert.equal(controller.peer.options.reliable, false); assert.equal(controller.peer.options.metadata.role, 'A');
  const sensor = new VBFInput(); sensor.push(0, now); sensor.calibrate();
  for (let i = 1; i <= 3600; i++) {
    now = i * config.step * 1000; sensor.push(0, now);
    controller.send(tiltPacket(sensor, { sessionId: 'session-A', sequence: i, sensorOn: true, calibrationId: 1, now, timestamp: now }));
    assert.equal(remote.canStart(now), true); game.step(config.step, remote.read());
  }
  assert.equal(game.done, true); assert.equal(game.stars, 15);
  let feedback; controller.onFeedback = value => feedback = value;
  host.send({ type: 'feedback', payload: { phase: 'result' } }); assert.equal(feedback.phase, 'result');
  controller.close(); host.close();
});
test('received positive and negative relative angles move the egg in matching directions', () => {
  for (const angle of [20, -20]) {
    const remote = new RemoteTiltInput(); remote.setConnected(true); remote.receive(sample({ angle }), 100);
    const game = new EggGame(); for (let i = 0; i < 120; i++) game.step(config.step, remote.read());
    assert.equal(Math.sign(game.position), Math.sign(angle));
  }
});
test('transport disconnect clears presence and retries, close cancels retry', () => {
  const net = network(), host = new PeerBus('', 'host', net.opts); host.peer.start();
  const phone = new PeerBus(host.room, 'A', net.opts); let presence;
  host.onPresence = (_, value) => presence = value; phone.peer.start(); net.open(phone.connection);
  assert.equal(presence, true); phone.connection.close(); assert.equal(presence, false);
  assert.equal(net.timers.size, 1); const retry = [...net.timers.values()][0]; net.timers.clear(); retry();
  net.open(phone.connection); assert.equal(presence, true);
  phone.close(); host.close(); assert.equal(net.timers.size, 0);
});
test('old connection data/close cannot update the replacement controller state', () => {
  const net = network(), host = new PeerBus('', 'host', net.opts); host.peer.start();
  const first = new Connection({ role: 'A', sessionId: 'same' }); host.accept(first); first.open = true; first.emit('open');
  const second = new Connection({ role: 'A', sessionId: 'same' }); host.accept(second); second.open = true; second.emit('open');
  let inputs = 0; host.onInput = () => inputs++;
  first.emit('data', { type: 'input' }); second.emit('data', { type: 'input' }); first.emit('close');
  assert.equal(inputs, 1); assert.equal(host.connections.A, second);
  const intruder = new Connection({ role: 'A', sessionId: 'other' }); host.accept(intruder);
  assert.equal(intruder.closed, true); assert.equal(host.connections.A, second); host.close();
});
test('bounded buffering drops samples rather than building a stale tilt backlog', () => {
  const net = network(), host = new PeerBus('', 'host', net.opts); const conn = new Connection({ role: 'A' });
  host.accept(conn); conn.open = true; conn.bufferSize = 3;
  host.send({ type: 'feedback' }); assert.equal(conn.sent.length, 0); host.close();
});
test('browser timer functions are called without binding PeerBus as their receiver', () => {
  const net = network();
  const host = new PeerBus('', 'host', { ...net.opts,
    clearTimer: function () { assert.equal(this, undefined); },
    setTimer: function () { assert.equal(this, undefined); return 1; },
  });
  host.peer.start(); host.peer.disconnected = true; host.peer.emit('disconnected'); host.close();
});
test('permission requested synchronously, denial adds no listeners, reconnect does not duplicate sensor listeners', async () => {
  const oldWindow = globalThis.window, oldScreen = globalThis.screen;
  const listeners = new Map(); let permissionCalls = 0, grant = 'denied';
  globalThis.window = { isSecureContext: true, DeviceOrientationEvent: { requestPermission() { permissionCalls++; return Promise.resolve(grant); } },
    addEventListener(type, listener) { listeners.set(type, listener); }, removeEventListener(type) { listeners.delete(type); } };
  globalThis.screen = { orientation: { angle: 0, addEventListener() {}, removeEventListener() {} } };
  try {
    const input = new TiltInput(); const denied = input.connect();
    assert.equal(permissionCalls, 1); await assert.rejects(denied); assert.equal(listeners.size, 0);
    grant = 'granted'; await input.connect(); await input.connect(); assert.equal(listeners.size, 1);
    listeners.get('deviceorientation')({ beta: 0, gamma: 12 }); assert.equal(input.rawAngle, 12);
    input.disconnect(); assert.equal(listeners.size, 0);
  } finally { globalThis.window = oldWindow; globalThis.screen = oldScreen; }
});
