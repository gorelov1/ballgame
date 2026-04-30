'use strict';

/**
 * LevelManager — 50 levels, interpolated from level 1 to level 50.
 *
 * Ranges:
 *   Gravity:           3 m/s²  (L1)  → 12.4 m/s²  (L50)  [range ÷5 vs original]
 *   BounceSpeed:       5 m/s   (L1)  → 14 m/s      (L50)  [range ÷5 vs original]
 *   MaxBallSpeed:     12 m/s   (L1)  → 80 m/s      (L50)
 *   PlatformLifetime: 10 s     (L1)  →  5 s        (L50)
 *
 * Score thresholds: original thresholds ×5 — level 50 reached at score 1,000,000.
 */

// 10 anchor scores (×5 vs original)
const ANCHOR_SCORES = [0, 10000, 25000, 50000, 100000, 200000, 350000, 550000, 750000, 1000000];

// Total levels
const TOTAL_LEVELS = 50;

// Physics ranges
const GRAVITY_MIN      =  6;    // 2× starting gravity (was 3)
const GRAVITY_MAX      = 12.4;  // original 50, range reduced 5x: 3 + (50-3)/5 = 12.4
const BOUNCE_MIN       = 10;    // 2× starting bounce speed (was 5)
const BOUNCE_MAX       = 14;    // original 50, range reduced 5x: 5 + (50-5)/5 = 14
const MAX_SPEED_MIN    = 12;
const MAX_SPEED_MAX    = 80;
const LIFETIME_MIN_MS  =  5000;
const LIFETIME_MAX_MS  = 10000;

/**
 * Linear interpolation.
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Progress [0, 1]
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Build the LEVELS array by interpolating between anchor scores.
 * Each of the 10 anchors is split into 5 sub-levels (10 × 5 = 50).
 */
function buildLevels() {
  const levels = [];

  for (let i = 0; i < TOTAL_LEVELS; i++) {
    // Progress from 0 (level 1) to 1 (level 50)
    const t = i / (TOTAL_LEVELS - 1);

    // Score threshold: interpolate between anchor scores
    // Map i to the anchor space (0–9 anchors, each covering 5 sub-levels)
    const anchorIndex     = Math.floor(i / 5);
    const anchorNext      = Math.min(anchorIndex + 1, ANCHOR_SCORES.length - 1);
    const subProgress     = (i % 5) / 5; // 0, 0.2, 0.4, 0.6, 0.8 within each anchor band
    const minScore        = Math.round(lerp(ANCHOR_SCORES[anchorIndex], ANCHOR_SCORES[anchorNext], subProgress));

    levels.push({
      minScore,
      gravity:            parseFloat(lerp(GRAVITY_MIN,   GRAVITY_MAX,   t).toFixed(1)),
      bounceSpeed:        parseFloat(lerp(BOUNCE_MIN,    BOUNCE_MAX,    t).toFixed(1)),
      maxBallSpeed:       parseFloat(lerp(MAX_SPEED_MIN, MAX_SPEED_MAX, t).toFixed(1)),
      // Lifetime decreases as level increases
      platformLifetimeMs: Math.round(lerp(LIFETIME_MAX_MS, LIFETIME_MIN_MS, t)),
    });
  }

  return levels;
}

const LEVELS = buildLevels();

class LevelManager {
  constructor() {
    this._currentLevel = 1;
    this._justLeveledUp = false;
    this._levelUpTimer = 0;
  }

  /**
   * Update the level based on the current score.
   * @param {number} score
   * @returns {boolean} true if the level just increased
   */
  update(score) {
    let newLevel = 1;
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (score >= LEVELS[i].minScore) {
        newLevel = i + 1;
        break;
      }
    }
    if (newLevel > this._currentLevel) {
      this._currentLevel = newLevel;
      this._justLeveledUp = true;
      this._levelUpTimer = 2500;
      return true;
    }
    return false;
  }

  /**
   * Tick the level-up flash timer.
   * @param {number} dtMs
   */
  tick(dtMs) {
    if (this._levelUpTimer > 0) {
      this._levelUpTimer = Math.max(0, this._levelUpTimer - dtMs);
      if (this._levelUpTimer === 0) this._justLeveledUp = false;
    }
  }

  get currentLevel()        { return this._currentLevel; }
  get isLevelUpFlashing()   { return this._levelUpTimer > 0; }
  get levelUpTimerMs()      { return this._levelUpTimer; }
  get gravity()             { return LEVELS[this._currentLevel - 1].gravity; }
  get bounceSpeed()         { return LEVELS[this._currentLevel - 1].bounceSpeed; }
  get maxBallSpeed()        { return LEVELS[this._currentLevel - 1].maxBallSpeed; }
  get platformLifetimeMs()  { return LEVELS[this._currentLevel - 1].platformLifetimeMs; }

  reset() {
    this._currentLevel = 1;
    this._justLeveledUp = false;
    this._levelUpTimer = 0;
  }
}

module.exports = LevelManager;
module.exports.LEVELS = LEVELS;
