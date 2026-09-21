import test from 'node:test';
import assert from 'node:assert/strict';
import { EggGame, toCSV } from '../src/game.js';
import { VBFInput, screenRoll, angleDifference } from '../src/input.js';
import { config } from '../src/config.js';
const advance = (game, seconds, angle = 0, dt = config.step) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) game.step(dt, { relativeAngle: angle, rawAngle: angle });
};
test('screen-relative directions across all four orientations; null data rejected', () => {
  assert.equal(screenRoll(15, 10, 0), 10);
  assert.equal(screenRoll(15, 10, 90), -15);
  assert.equal(screenRoll(15, 10, 180), -10);
  assert.equal(screenRoll(15, 10, 270), 15);
  assert.equal(screenRoll(15, 10, -90), 15);
  for (const angle of [0, 90, 180, 270]) assert.equal(screenRoll(null, null, angle), null);
  assert.equal(screenRoll(NaN, NaN), null);
});
test('calibration captures current raw angle and resets filter; clamp only affects game', () => {
  const input = new VBFInput(); assert.equal(input.calibrate(), false);
  input.push(17, 0); input.calibrate(); assert.equal(input.read().relativeAngle, 0);
  input.push(22, 1); assert.ok(Math.abs(input.read().relativeAngle - 1.2) < 1e-10);
  input.calibrate(); assert.equal(input.baselineAngle, 22); assert.equal(input.read().relativeAngle, 0);
  for (let i = 0; i < 100; i++) input.push(75, i);
  assert.equal(input.read().gameAngle, 30); assert.ok(input.read().relativeAngle > 50);
  input.reset(); assert.equal(input.calibrated, false); assert.equal(input.ready, false);
});
test('filter handles angle wrap and ignores invalid samples', () => {
  assert.equal(angleDifference(-179, 179), 2);
  const input = new VBFInput(); input.push(179); input.calibrate(); input.push(-179);
  assert.ok(Math.abs(input.read().relativeAngle - .48) < 1e-9);
  input.push(NaN); assert.equal(input.rawAngle, -179);
});
test('tilt moves in matching direction and speed varies by difficulty', () => {
  const positions = [];
  for (const level of ['easy', 'normal', 'hard']) {
    const right = new EggGame(level), left = new EggGame(level);
    advance(right, 1, 20); advance(left, 1, -20);
    assert.ok(right.position > 0); assert.ok(left.position < 0);
    assert.ok(Math.abs(right.position + left.position) < 1e-10);
    positions.push(right.position);
  }
  assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
});
test('horizontal input gently returns an offset egg toward center', () => {
  const game = new EggGame(); game.position = .7;
  advance(game, 5, 0); assert.ok(game.position < .15); assert.equal(game.drops, 0);
});
test('safe zones shrink with difficulty', () => {
  const easy = new EggGame('easy'), hard = new EggGame('hard');
  easy.position = hard.position = .4;
  advance(easy, .1); advance(hard, .1);
  assert.equal(easy.isSafe, true); assert.equal(hard.isSafe, false);
});
test('30 seconds ends with 15 stars, full safe time, recorded samples, and replay starts fresh', () => {
  const game = new EggGame(); advance(game, 35);
  assert.equal(game.done, true); assert.equal(game.stars, 15);
  assert.ok(Math.abs(game.elapsed - 30) < 1e-8);
  assert.ok(Math.abs(game.summary().safeZonePercentage - 100) < 1e-8);
  assert.ok(game.samples.length >= 299 && game.samples.length <= 301);
  assert.equal(game.summary().RMSE_from_zero, 0);
  assert.equal(new EggGame().elapsed, 0); assert.equal(new EggGame().stars, 0);
});
test('fall triggers a single drop, no point penalty, and respawn within two seconds', () => {
  const game = new EggGame(); advance(game, 2.1); const stars = game.stars;
  game.position = .9999; game.velocity = .5;
  advance(game, .1, 30); assert.equal(game.drops, 1); assert.ok(game.respawn > 0);
  const time = game.elapsed; advance(game, 1.5, 0);
  assert.equal(game.respawn, 0); assert.equal(game.position, 0);
  assert.equal(game.stars, stars); assert.ok(game.elapsed > time); assert.equal(game.done, false);
});
test('metrics use unclamped relative angles, time-weighted population SD and RMSE', () => {
  const game = new EggGame(); advance(game, 1, 40); advance(game, 1, -40);
  const summary = game.summary();
  assert.ok(Math.abs(summary.meanAngle) < 1e-8);
  assert.ok(Math.abs(summary.SDAngle - 40) < 1e-8);
  assert.ok(Math.abs(summary.RMSE_from_zero - 40) < 1e-8);
  assert.equal(summary.maxAbsAngle, 40);
});
test('simulation is consistent at 60 and 120 Hz', () => {
  const a = new EggGame(), b = new EggGame(); advance(a, 2, 10, 1/60); advance(b, 2, 10, 1/120);
  assert.ok(Math.abs(a.position - b.position) < .005);
});
test('CSV preserves quotes, commas, Unicode and headings', () => {
  assert.equal(toCSV([{ name: 'たまご,"A"', value: 1 }]), '\uFEFF"name","value"\r\n"たまご,""A""","1"');
});
