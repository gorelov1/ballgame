'use strict';

/**
 * LevelManager — 50 levels with a two-phase physics curve.
 *
 * Phase 1 — L1 → L20 (ease in):
 *   Gravity:     6  → 2   (decreasing — ball gets "lighter", easier to bounce)
 *   BounceSpeed: 10 → 15  (increasing — platforms give more lift)
 *
 * Phase 2 — L20 → L50 (ramp up difficulty):
 *   Gravity:     2  → 20  (increasing — ball falls faster)
 *   BounceSpeed: 15 → 2   (decreasing — platforms give less lift)
 *
 * MaxBallSpeed: 12 m/s (L1) → 80 m/s (L50), linear throughout.
 * PlatformLifetime: 10 s (L1) → 5 s (L50), linear throughout.
 *
 * Score thresholds: level 50 reached at score 1,000,000.
 */

// 10 anchor scores (×5 vs original)
const ANCHOR_SCORES = [0, 10000, 25000, 50000, 100000, 200000, 350000, 550000, 750000, 1000000];

// Total levels and phase boundary
const TOTAL_LEVELS  = 50;
const PHASE_BOUNDARY = 20; // level index (0-based: index 19 = L20)

// Phase 1 physics (L1 → L20)
const P1_GRAVITY_START = 6;
const P1_GRAVITY_END   = 2;
const P1_BOUNCE_START  = 10;
const P1_BOUNCE_END    = 15;

// Phase 2 physics (L20 → L50)
const P2_GRAVITY_START = 2;
const P2_GRAVITY_END   = 20;
const P2_BOUNCE_START  = 15;
const P2_BOUNCE_END    = 2;

// Speed and lifetime ranges (linear across all 50 levels)
const MAX_SPEED_MIN   = 12;
const MAX_SPEED_MAX   = 80;
const LIFETIME_MIN_MS = 5000;
const LIFETIME_MAX_MS = 10000;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function buildLevels() {
  const levels = [];

  for (let i = 0; i < TOTAL_LEVELS; i++) {
    // ── Score threshold ──────────────────────────────────────────────────────
    const anchorIndex = Math.floor(i / 5);
    const anchorNext  = Math.min(anchorIndex + 1, ANCHOR_SCORES.length - 1);
    const subProgress = (i % 5) / 5;
    const minScore    = Math.round(lerp(ANCHOR_SCORES[anchorIndex], ANCHOR_SCORES[anchorNext], subProgress));

    // ── Two-phase gravity & bounce ───────────────────────────────────────────
    let gravity, bounceSpeed;
    if (i < PHASE_BOUNDARY) {
      // Phase 1: i goes 0 → 19, t goes 0 → 1
      const t = i / (PHASE_BOUNDARY - 1);
      gravity     = lerp(P1_GRAVITY_START, P1_GRAVITY_END,  t);
      bounceSpeed = lerp(P1_BOUNCE_START,  P1_BOUNCE_END,   t);
    } else {
      // Phase 2: i goes 20 → 49, t goes 0 → 1
      const t = (i - PHASE_BOUNDARY) / (TOTAL_LEVELS - 1 - PHASE_BOUNDARY);
      gravity     = lerp(P2_GRAVITY_START, P2_GRAVITY_END,  t);
      bounceSpeed = lerp(P2_BOUNCE_START,  P2_BOUNCE_END,   t);
    }

    // ── Linear speed & lifetime across all levels ────────────────────────────
    const tAll = i / (TOTAL_LEVELS - 1);

    levels.push({
      minScore,
      gravity:            parseFloat(gravity.toFixed(1)),
      bounceSpeed:        parseFloat(bounceSpeed.toFixed(1)),
      maxBallSpeed:       parseFloat(lerp(MAX_SPEED_MIN, MAX_SPEED_MAX, tAll).toFixed(1)),
      platformLifetimeMs: Math.round(lerp(LIFETIME_MAX_MS, LIFETIME_MIN_MS, tAll)),
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
