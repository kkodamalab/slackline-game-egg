export const config = Object.freeze({
  duration: 30, maxAngle: 30, alpha: 0.24, sampleInterval: 0.1,
  step: 1 / 120, respawnSeconds: 1.4, starSeconds: 2, staleMs: 2500,
});
// Positions are normalized: platform ends are -1 and +1. Times are seconds.
export const difficulties = Object.freeze({
  easy: { label: '★ かんたん', safeZoneWidth: 0.52, gravity: 1.8, damping: 2.8, centering: 1.3, maxSpeed: 0.55 },
  normal: { label: '★★ ふつう', safeZoneWidth: 0.36, gravity: 2.8, damping: 2.2, centering: 1.0, maxSpeed: 0.8 },
  hard: { label: '★★★ むずかしい', safeZoneWidth: 0.23, gravity: 4, damping: 1.8, centering: 0.8, maxSpeed: 1.1 },
});
