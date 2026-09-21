import { config, difficulties } from './config.js';
import { clamp } from './input.js';

export class EggGame {
  constructor(difficulty = 'easy') {
    if (!difficulties[difficulty]) throw new Error('Unknown difficulty');
    this.difficulty = difficulty;
    this.settings = difficulties[difficulty];
    this.elapsed = 0; this.position = 0; this.velocity = 0;
    this.stars = 0; this.drops = 0; this.safeTime = 0; this.streak = 0;
    this.respawn = 0; this.done = false; this.isSafe = true;
    this.angleSum = 0; this.angleSquareSum = 0; this.maxAbsAngle = 0;
    this.samples = []; this.nextSample = 0;
  }
  // Called with a fixed timestep by the renderer. No DOM or sensor dependencies.
  step(dt, input) {
    if (this.done || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, config.duration - this.elapsed);
    const { relativeAngle, rawAngle } = input;
    if (!Number.isFinite(relativeAngle) || !Number.isFinite(rawAngle)) return;
    const gameAngle = clamp(relativeAngle, -config.maxAngle, config.maxAngle);
    const p = this.settings;
    if (this.respawn > 0) {
      this.respawn = Math.max(0, this.respawn - dt);
      if (!this.respawn) { this.position = 0; this.velocity = 0; }
    } else {
      const centering = p.centering * Math.max(0, 1 - Math.abs(gameAngle) / 10);
      this.velocity += (p.gravity * Math.sin(gameAngle * Math.PI / 180) - centering * this.position) * dt;
      this.velocity *= Math.exp(-p.damping * dt);
      this.velocity = clamp(this.velocity, -p.maxSpeed, p.maxSpeed);
      this.position += this.velocity * dt;
      if (Math.abs(this.position) > 1) {
        this.drops++; this.respawn = config.respawnSeconds; this.streak = 0;
      }
    }
    this.isSafe = this.respawn === 0 && Math.abs(this.position) <= p.safeZoneWidth;
    if (this.isSafe) {
      this.safeTime += dt;
      const before = Math.floor((this.streak + 1e-8) / config.starSeconds);
      this.streak += dt;
      this.stars += Math.floor((this.streak + 1e-8) / config.starSeconds) - before;
    } else this.streak = 0;
    this.elapsed += dt;
    this.angleSum += relativeAngle * dt;
    this.angleSquareSum += relativeAngle ** 2 * dt;
    this.maxAbsAngle = Math.max(this.maxAbsAngle, Math.abs(relativeAngle));
    if (this.elapsed + 1e-8 >= this.nextSample) {
      this.samples.push({ timestamp: +this.elapsed.toFixed(4), rawAngle, relativeAngle,
        eggPosition: this.position, eggVelocity: this.velocity, isSafeZone: this.isSafe, difficulty: this.difficulty });
      this.nextSample = this.elapsed + config.sampleInterval;
    }
    this.done = this.elapsed >= config.duration - 1e-8;
  }
  summary() {
    const time = this.elapsed;
    const mean = time ? this.angleSum / time : 0;
    const square = time ? this.angleSquareSum / time : 0;
    return { trialDuration: time, meanAngle: mean, SDAngle: Math.sqrt(Math.max(0, square - mean * mean)),
      RMSE_from_zero: Math.sqrt(square), maxAbsAngle: this.maxAbsAngle,
      safeZoneTime: this.safeTime, safeZonePercentage: time ? this.safeTime / time * 100 : 0,
      numberOfEggDrops: this.drops, stars: this.stars };
  }
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = value => '"' + String(value).replaceAll('"', '""') + '"';
  return '\uFEFF' + [keys, ...rows.map(row => keys.map(key => row[key]))].map(row => row.map(escape).join(',')).join('\r\n');
}
