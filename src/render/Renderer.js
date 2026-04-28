'use strict';

/**
 * Renderer — draws all game elements onto the HTML5 Canvas each frame.
 *
 * Responsibilities:
 *  - Clear and redraw the canvas every frame via draw(alpha)
 *  - Apply a viewport transform (ctx.translate) so world objects scroll with the ball
 *  - Draw background, platforms (with fade-out), gems, ball, and drag-preview line
 *  - Draw a fixed HUD overlay (score, height, fuel bar, low-fuel warning, high score)
 *  - Draw a game-over overlay when the session ends
 *
 * Requirements: 2.4, 3.2, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5
 */
class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} config  — GameConfig object (used for future extensibility)
   */
  constructor(canvas, config) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._config = config;

    // Viewport
    this._viewportOffset = 0;

    // Per-platform opacity keyed by platform id
    this._platformOpacities = new Map();

    // Current ball position (world coords)
    this._ballState = null;

    // Active platforms: [{ id, startWorld, endWorld }]
    this._platforms = [];

    // Active gems: [{ id, position }]
    this._gems = [];

    // In-progress drag preview line: { start, end } or null
    this._previewLine = null;

    // Game-over overlay state: { finalScore, highScore } or null
    this._gameOverState = null;

    // HUD values
    this._scoreState = {
      score: 0,
      height: 0,
      fuel: 0,
      maxFuel: 200,
      highScore: 0,
      level: 1,
      levelLabel: 'EASY',
      levelUpFlashing: false,
      levelUpTimerMs: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Public state-update methods (called by GameEngine each tick)
  // ---------------------------------------------------------------------------

  /**
   * Update the vertical viewport offset (pixels scrolled upward).
   * @param {number} yOffset
   */
  setViewportOffset(yOffset) {
    this._viewportOffset = yOffset;
  }

  /**
   * Store the opacity for a platform based on its remaining lifetime ratio.
   *
   * Opacity formula:
   *   lifetimeRatio > 0.2  → 1.0  (fully opaque)
   *   lifetimeRatio ≤ 0.2  → lifetimeRatio * 5  (fades from 1.0 → 0.0)
   *
   * Requirement 8.4: platform fades when remaining lifetime < 20 %.
   *
   * @param {string} platformId
   * @param {number} lifetimeRatio  — remaining lifetime fraction in [0, 1]
   */
  setPlatformOpacity(platformId, lifetimeRatio) {
    this._platformOpacities.set(platformId, lifetimeRatio);
  }

  /**
   * Update the ball's world-space position for rendering.
   * @param {number} x
   * @param {number} y
   */
  updateBall(x, y) {
    this._ballState = { x, y };
  }

  /**
   * Replace the list of active platforms.
   * @param {Array<{ id: string, startWorld: {x,y}, endWorld: {x,y} }>} platforms
   */
  updatePlatforms(platforms) {
    this._platforms = platforms;
  }

  /**
   * Replace the list of active gems.
   * @param {Array<{ id: string, position: {x,y} }>} gems
   */
  updateGems(gems) {
    this._gems = gems;
  }

  /**
   * Set the in-progress drag preview line.
   * Pass null to clear it (after touchend).
   * @param {{ x: number, y: number }|null} start
   * @param {{ x: number, y: number }|null} end
   */
  setPreviewLine(start, end) {
    if (start === null || end === null) {
      this._previewLine = null;
    } else {
      this._previewLine = { start, end };
    }
  }

  /**
   * Show the game-over overlay.
   * Requirement 4.4: display final score and all-time high score.
   * @param {number} finalScore
   * @param {number} highScore
   */
  showGameOver(finalScore, highScore) {
    this._gameOverState = { finalScore, highScore };
  }

  /** Hide the game-over overlay (called when a new session starts). */
  hideGameOver() {
    this._gameOverState = null;
  }

  /**
   * Update HUD values.
   * Requirement 8.5: HUD shows score, height, and fuel at all times.
   * @param {number} score
   * @param {number} height
   * @param {number} fuel
   * @param {number} maxFuel
   * @param {number} highScore
   */
  updateHUD(score, height, fuel, maxFuel, highScore, level, levelLabel, levelUpFlashing, levelUpTimerMs) {
    this._scoreState = { score, height, fuel, maxFuel, highScore,
      level: level || 1,
      levelLabel: levelLabel || 'EASY',
      levelUpFlashing: !!levelUpFlashing,
      levelUpTimerMs: levelUpTimerMs || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Main render method
  // ---------------------------------------------------------------------------

  /**
   * Clear and redraw the entire canvas.
   * Called once per animation frame by GameEngine.
   *
   * @param {number} alpha  — interpolation factor [0, 1] (reserved for future
   *                          position interpolation between physics steps)
   */
  draw(alpha) { // eslint-disable-line no-unused-vars
    const ctx = this._canvas.getContext('2d');
    const w = this._canvas.width;
    const h = this._canvas.height;

    // 1. Clear
    ctx.clearRect(0, 0, w, h);

    // 2. Background — dark gradient
    this._drawBackground(ctx, w, h);

    // 3. Apply viewport transform: shift world coords so the scrolled region is visible.
    // viewportOffset is negative (decreases as ball rises), so translating by it
    // moves world objects upward on screen as the player ascends.
    ctx.save();
    ctx.translate(0, -this._viewportOffset);

    // 4. Platforms
    this._drawPlatforms(ctx);

    // 5. Gems
    this._drawGems(ctx);

    // 6. Ball
    this._drawBall(ctx);

    // 7. Drag-preview line (drawn in world space so it scrolls with the viewport)
    if (this._previewLine !== null) {
      this._drawPreviewLine(ctx);
    }

    // Restore transform — everything below is fixed to the screen
    ctx.restore();

    // 8. HUD overlay (fixed, not affected by viewport transform)
    this._drawHUD(ctx, w, h);

    // 9. Game-over overlay
    if (this._gameOverState !== null) {
      this._drawGameOver(ctx, w, h);
    }
  }

  // ---------------------------------------------------------------------------
  // Private drawing helpers
  // ---------------------------------------------------------------------------

  /** Draw a dark vertical gradient as the background. */
  _drawBackground(ctx, w, h) {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  /**
   * Draw all active platforms as white/light lines with per-platform opacity.
   * Requirement 8.4: fading opacity when lifetimeRatio ≤ 0.2.
   */
  _drawPlatforms(ctx) {
    for (const platform of this._platforms) {
      const lifetimeRatio = this._platformOpacities.has(platform.id)
        ? this._platformOpacities.get(platform.id)
        : 1.0;

      // Opacity formula: fade from 1.0 → 0.0 as ratio goes from 0.2 → 0
      const opacity = lifetimeRatio <= 0.2 ? lifetimeRatio * 5 : 1.0;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(platform.startWorld.x, platform.startWorld.y);
      ctx.lineTo(platform.endWorld.x, platform.endWorld.y);
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * Draw all active gems as filled gold circles.
   * Requirement 5.4: gems are visible in the viewport.
   */
  _drawGems(ctx) {
    const GEM_RADIUS = 12;

    for (const gem of this._gems) {
      ctx.save();
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 8;

      ctx.beginPath();
      ctx.arc(gem.position.x, gem.position.y, GEM_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * Draw the ball as a bright filled circle.
   * Requirement 8.2: ball is a filled circle with radius 15 px.
   */
  _drawBall(ctx) {
    if (this._ballState === null) return;

    const BALL_RADIUS = 15;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#aaddff';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.arc(this._ballState.x, this._ballState.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draw the in-progress drag preview line.
   * Requirement 8.3: visual preview during drag gesture.
   */
  _drawPreviewLine(ctx) {
    const { start, end } = this._previewLine;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#88ccff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.setLineDash([8, 6]);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw the HUD overlay (fixed to screen, not affected by viewport transform).
   *
   * Displays:
   *  - Current score (top-left)
   *  - Height below score
   *  - Fuel progress bar + numeric value
   *  - Low-fuel warning (red) when fuel === 0
   *  - High score
   *
   * Requirements 5.4, 5.5, 8.5
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w  canvas width
   * @param {number} h  canvas height
   */
  _drawHUD(ctx, w, h) {
    const { score, height, fuel, maxFuel, highScore, level, levelLabel, levelUpFlashing, levelUpTimerMs } = this._scoreState;
    const PAD = 16;
    const LINE_H = 24;

    ctx.save();
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';

    // Score
    ctx.fillText(`SCORE  ${Math.floor(score)}`, PAD, PAD);

    // Height
    ctx.fillText(`HEIGHT ${Math.floor(height)} px`, PAD, PAD + LINE_H);

    // High score (top-right)
    ctx.textAlign = 'right';
    ctx.fillText(`BEST  ${Math.floor(highScore)}`, w - PAD, PAD);
    ctx.textAlign = 'left';

    // Level indicator (top-right, below high score)
    const levelColor = level >= 10 ? '#ff4444' : level >= 8 ? '#ff8800' : level >= 6 ? '#ffdd00' : '#88ccff';
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = levelColor;
    ctx.textAlign = 'right';
    ctx.fillText(`LVL ${level}  ${levelLabel}`, w - PAD, PAD + LINE_H);
    ctx.textAlign = 'left';

    // Fuel bar
    const barY = PAD + LINE_H * 2 + 4;
    const barW = 140;
    const barH = 14;
    const fuelRatio = maxFuel > 0 ? Math.max(0, Math.min(1, fuel / maxFuel)) : 0;

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(PAD, barY, barW, barH);

    if (fuelRatio > 0.5) {
      ctx.fillStyle = '#44dd44';
    } else if (fuelRatio > 0.2) {
      ctx.fillStyle = '#dddd22';
    } else {
      ctx.fillStyle = '#dd4444';
    }
    ctx.fillRect(PAD, barY, barW * fuelRatio, barH);

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD, barY, barW, barH);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`FUEL ${Math.floor(fuel)} / ${Math.floor(maxFuel)}`, PAD + barW + 8, barY + barH / 2);

    if (fuel === 0) {
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#ff4444';
      ctx.textBaseline = 'top';
      ctx.fillText('⚠ NO FUEL — CANNOT DRAW PLATFORMS', PAD, barY + barH + 6);
    }

    ctx.restore();

    // Level-up flash overlay
    if (levelUpFlashing && levelUpTimerMs > 0) {
      const FLASH_DURATION = 2500;
      const progress = levelUpTimerMs / FLASH_DURATION; // 1 → 0 as it fades
      // Fade in quickly, hold, then fade out
      const alpha = progress > 0.7 ? (1 - progress) / 0.3 : progress < 0.15 ? progress / 0.15 : 1.0;

      ctx.save();
      ctx.globalAlpha = Math.min(0.85, alpha);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, h / 2 - 70, w, 140);

      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(w * 0.07)}px monospace`;
      ctx.fillStyle = levelColor;
      ctx.shadowColor = levelColor;
      ctx.shadowBlur = 30;
      ctx.fillText(`LEVEL ${level}`, w / 2, h / 2 - 20);

      ctx.font = `bold ${Math.round(w * 0.04)}px monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.fillText(levelLabel, w / 2, h / 2 + 28);
      ctx.restore();
    }
  }

  /**
   * Draw the game-over overlay.
   *
   * Displays:
   *  - Semi-transparent dark overlay
   *  - "GAME OVER" heading
   *  - Final score and high score
   *  - "TAP TO RESTART" prompt
   *
   * Requirement 4.4
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w  canvas width
   * @param {number} h  canvas height
   */
  _drawGameOver(ctx, w, h) {
    const { finalScore, highScore } = this._gameOverState;
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();

    // Semi-transparent dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, w, h);

    // "GAME OVER" heading
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 48px monospace';
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 20;
    ctx.fillText('GAME OVER', cx, cy - 80);

    ctx.shadowBlur = 0;

    // Final score
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE  ${Math.floor(finalScore)}`, cx, cy - 20);

    // High score
    ctx.font = '22px monospace';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`BEST   ${Math.floor(highScore)}`, cx, cy + 20);

    // "TAP TO RESTART" prompt
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('TAP TO RESTART', cx, cy + 80);

    ctx.restore();
  }
}

module.exports = Renderer;
