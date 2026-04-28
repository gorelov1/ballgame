'use strict';

/**
 * LevelManager — maps the player's current score to a game level (1–10)
 * and computes the corresponding physics parameters.
 *
 * Level curve design:
 *   - Level 1 at score 0:      very floaty, slow gravity, long-lived platforms
 *   - Level 10 at score ~200k: frantic gravity, fast bounces, short platforms
 *
 * Physics ranges:
 *   Gravity:           3 m/s² (L1) → 18 m/s² (L10)
 *   BounceSpeed:       5 m/s  (L1) → 20 m/s  (L10)
 *   MaxBallSpeed:     12 m/s  (L1) → 40 m/s  (L10)
 *   PlatformLifetime: 30 s    (L1) →  5 s    (L10)
 */

const LEVELS = [
  { minScore:       0, gravity:  3, bounceSpeed:  5, maxBallSpeed: 12, platformLifetimeMs: 10000, label: 'EASY'   },
  { minScore:    2000, gravity:  4, bounceSpeed:  7, maxBallSpeed: 15, platformLifetimeMs:  9000, label: 'NORMAL' },
  { minScore:    5000, gravity:  5, bounceSpeed:  8, maxBallSpeed: 17, platformLifetimeMs:  8000, label: 'NORMAL' },
  { minScore:   10000, gravity:  6, bounceSpeed:  9, maxBallSpeed: 19, platformLifetimeMs:  7000, label: 'MEDIUM' },
  { minScore:   20000, gravity:  7, bounceSpeed: 11, maxBallSpeed: 22, platformLifetimeMs:  6500, label: 'MEDIUM' },
  { minScore:   40000, gravity:  9, bounceSpeed: 13, maxBallSpeed: 25, platformLifetimeMs:  6000, label: 'HARD'   },
  { minScore:   70000, gravity: 11, bounceSpeed: 15, maxBallSpeed: 28, platformLifetimeMs:  5800, label: 'HARD'   },
  { minScore:  110000, gravity: 13, bounceSpeed: 17, maxBallSpeed: 32, platformLifetimeMs:  5500, label: 'INSANE' },
  { minScore:  150000, gravity: 16, bounceSpeed: 19, maxBallSpeed: 37, platformLifetimeMs:  5200, label: 'INSANE' },
  { minScore:  200000, gravity: 18, bounceSpeed: 20, maxBallSpeed: 40, platformLifetimeMs:  5000, label: '🔥 MAX' },
];

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
  get currentLabel()        { return LEVELS[this._currentLevel - 1].label; }
  get gravity()             { return LEVELS[this._currentLevel - 1].gravity; }
  get bounceSpeed()         { return LEVELS[this._currentLevel - 1].bounceSpeed; }
  get maxBallSpeed()        { return LEVELS[this._currentLevel - 1].maxBallSpeed; }
  /** Platform lifetime in milliseconds for the current level. */
  get platformLifetimeMs()  { return LEVELS[this._currentLevel - 1].platformLifetimeMs; }

  reset() {
    this._currentLevel = 1;
    this._justLeveledUp = false;
    this._levelUpTimer = 0;
  }
}

module.exports = LevelManager;
module.exports.LEVELS = LEVELS;
