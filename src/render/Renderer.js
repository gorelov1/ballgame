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

    // Ground Y position in world pixels (set by GameEngine)
    this._groundY = 800;

    // Stars: fixed positions generated once
    this._stars = this._generateStars(120);

    // Space debris: floating objects
    this._debris = this._generateDebris(18);

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
      speedBoostMs: 0,
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

  /** Set the world Y coordinate of the ground (bottom of the world). */
  setGroundY(y) {
    this._groundY = y;
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
  updateHUD(score, height, fuel, maxFuel, highScore, level, levelLabel, levelUpFlashing, levelUpTimerMs, speedBoostMs) {
    this._scoreState = { score, height, fuel, maxFuel, highScore,
      level: level || 1,
      levelLabel: levelLabel || 'EASY',
      levelUpFlashing: !!levelUpFlashing,
      levelUpTimerMs: levelUpTimerMs || 0,
      speedBoostMs: speedBoostMs || 0,
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

    // 4. Ground scene (grass, lake, house) — drawn in world space at the bottom
    this._drawGroundScene(ctx, w);

    // 5. Platforms
    this._drawPlatforms(ctx);

    // 6. Gems
    this._drawGems(ctx);

    // 7. Ball
    this._drawBall(ctx);

    // 8. Drag-preview line (drawn in world space so it scrolls with the viewport)
    if (this._previewLine !== null) {
      this._drawPreviewLine(ctx);
    }

    // Restore transform — everything below is fixed to the screen
    ctx.restore();

    // 8. HUD overlay (fixed, not affected by viewport transform)
    this._drawHUD(ctx, w, h);

    // Note: game-over is now handled as an HTML overlay (screen-gameover),
    // not drawn on canvas. The _gameOverState flag is kept for compatibility.
  }

  // ---------------------------------------------------------------------------
  // Private drawing helpers
  // ---------------------------------------------------------------------------

  /**
   * Draw the sky-to-space background.
   * Near the ground: bright blue sky with sun.
   * Higher up: transitions to deep space with stars and debris.
   */
  _drawBackground(ctx, w, h) {
    const TRANSITION_HEIGHT = 60000; // 1000 metres at 60 px/m
    const spaceProgress = Math.min(1, Math.max(0, -this._viewportOffset / TRANSITION_HEIGHT));

    // Sky/space gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (spaceProgress < 0.5) {
      const t = spaceProgress * 2;
      const topR = Math.round(10  + t * 2);
      const topG = Math.round(10  + t * 5);
      const topB = Math.round(30  + t * 20);
      const botR = Math.round(30  + (1-t) * 100);
      const botG = Math.round(100 + (1-t) * 60);
      const botB = Math.round(200 + (1-t) * 55);
      grad.addColorStop(0, `rgb(${topR},${topG},${topB})`);
      grad.addColorStop(1, `rgb(${botR},${botG},${botB})`);
    } else {
      const t = (spaceProgress - 0.5) * 2;
      const botB = Math.round(60 - t * 50);
      grad.addColorStop(0, '#050510');
      grad.addColorStop(1, `rgb(5,5,${botB})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Sun (visible near ground)
    if (spaceProgress < 0.7) {
      const sunAlpha = 1 - spaceProgress / 0.7;
      const sunX = w * 0.78;
      const sunY = h * 0.18;
      const sunR = Math.min(w, h) * 0.07;
      ctx.save();
      ctx.globalAlpha = sunAlpha;
      const sunGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 2.5);
      sunGlow.addColorStop(0, 'rgba(255,255,180,0.4)');
      sunGlow.addColorStop(1, 'rgba(255,200,50,0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 2.5, 0, Math.PI * 2);
      ctx.fill();
      const sunDisc = ctx.createRadialGradient(sunX - sunR * 0.2, sunY - sunR * 0.2, sunR * 0.1, sunX, sunY, sunR);
      sunDisc.addColorStop(0, '#fffde0');
      sunDisc.addColorStop(0.6, '#ffe066');
      sunDisc.addColorStop(1, '#ffaa00');
      ctx.fillStyle = sunDisc;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Stars (fade in as we go higher)
    if (spaceProgress > 0.1) {
      const starAlpha = Math.min(1, (spaceProgress - 0.1) / 0.4);
      ctx.save();
      ctx.globalAlpha = starAlpha;
      for (const star of this._stars) {
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Space debris (fade in deep space)
    if (spaceProgress > 0.5) {
      const debrisAlpha = Math.min(1, (spaceProgress - 0.5) / 0.3);
      const now = performance.now() / 1000;
      ctx.save();
      ctx.globalAlpha = debrisAlpha;
      for (const d of this._debris) {
        const dx = ((d.x + d.vx * now) % 1 + 1) % 1;
        const dy = ((d.y + d.vy * now) % 1 + 1) % 1;
        const px = dx * w;
        const py = dy * h;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(d.angle + d.spin * now);
        ctx.fillStyle = d.color;
        if (d.type === 'bolt') {
          ctx.fillRect(-d.size * 1.5, -d.size * 0.3, d.size * 3, d.size * 0.6);
          ctx.fillRect(-d.size * 0.3, -d.size * 1.5, d.size * 0.6, d.size * 3);
        } else if (d.type === 'panel') {
          ctx.fillStyle = '#334466';
          ctx.fillRect(-d.size * 1.2, -d.size * 0.5, d.size * 2.4, d.size);
          ctx.strokeStyle = '#5577aa';
          ctx.lineWidth = 1;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * d.size * 0.8, -d.size * 0.5);
            ctx.lineTo(i * d.size * 0.8,  d.size * 0.5);
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(d.size, 0);
          for (let i = 1; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const r = d.size * (0.6 + Math.sin(i * 7 + d.seed) * 0.4);
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    }

    // Celestial bodies (Moon, Venus, Mars) at high altitudes
    this._drawCelestialBodies(ctx, w, h);
  }

  _generateStars(count) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      const b = 180 + Math.floor(Math.random() * 75);
      stars.push({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.5, color: `rgb(${b},${b},${Math.min(255,b+20)})` });
    }
    return stars;
  }

  _generateDebris(count) {
    const types  = ['bolt', 'panel', 'rock'];
    const colors = ['#aabbcc', '#889aaa', '#ccaa88', '#aaaaaa', '#778899'];
    const debris = [];
    for (let i = 0; i < count; i++) {
      debris.push({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.008, vy: (Math.random() - 0.5) * 0.004,
        angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.5,
        size: 2 + Math.random() * 4.7,  // 3x smaller than original (was 6–20)
        type: types[Math.floor(Math.random() * types.length)],
        color: colors[Math.floor(Math.random() * colors.length)],
        seed: Math.random() * 100,
      });
    }
    return debris;
  }

  /**
   * Draw celestial bodies that appear at specific altitude ranges.
   *
   * Height in metres = -viewportOffset / 3  (px → m conversion used in HUD)
   *
   * Moon:         5,000 –  10,000 m
   * Venus:       10,000 –  15,000 m
   * Mars:        15,000 –  20,000 m
   * Jupiter:     20,000 –  27,500 m
   * Saturn:      27,500 –  35,000 m
   * Uranus:      35,000 –  42,500 m
   * Neptune:     42,500 –  50,000 m
   * Pluto:       50,000 –  65,000 m
   * Kuiper Belt: 65,000 –  80,000 m
   * Oort Cloud:  80,000 – 100,000 m
   */
  _drawCelestialBodies(ctx, w, h) {
    const heightM = -this._viewportOffset / 3;
    const S = Math.min(w, h);

    const bodyAlpha = (s, e, f) => {
      if (heightM < s || heightM > e) return 0;
      return Math.min(Math.min(1, (heightM - s) / f), Math.min(1, (e - heightM) / f));
    };

    const FADE = 500;

    // ── Moon ────────────────────────────────────────────────────────────────
    const moonAlpha = bodyAlpha(5000, 10000, FADE);
    if (moonAlpha > 0) {
      const mx = w * 0.72;
      const my = h * 0.22;
      const mr = Math.min(w, h) * 0.09;
      ctx.save();
      ctx.globalAlpha = moonAlpha;

      // Outer glow
      const moonGlow = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2);
      moonGlow.addColorStop(0, 'rgba(220,220,180,0.15)');
      moonGlow.addColorStop(1, 'rgba(220,220,180,0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 2, 0, Math.PI * 2);
      ctx.fill();

      // Moon disc
      const moonDisc = ctx.createRadialGradient(mx - mr * 0.25, my - mr * 0.25, mr * 0.1, mx, my, mr);
      moonDisc.addColorStop(0, '#fffff0');
      moonDisc.addColorStop(0.5, '#d8d8c0');
      moonDisc.addColorStop(1, '#a8a890');
      ctx.fillStyle = moonDisc;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();

      // Craters
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      [[0.3, -0.2, 0.18], [-0.25, 0.3, 0.13], [0.1, 0.35, 0.09], [-0.35, -0.1, 0.1]].forEach(([dx, dy, rs]) => {
        ctx.beginPath();
        ctx.arc(mx + dx * mr, my + dy * mr, rs * mr, 0, Math.PI * 2);
        ctx.fill();
      });

      // Shadow crescent (right side darker)
      const shadow = ctx.createRadialGradient(mx + mr * 0.3, my, mr * 0.1, mx + mr * 0.5, my, mr * 1.1);
      shadow.addColorStop(0, 'rgba(0,0,20,0)');
      shadow.addColorStop(1, 'rgba(0,0,20,0.35)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(200,200,180,0.7)';
      ctx.font = `${Math.round(mr * 0.35)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('MOON', mx, my + mr + 6);

      ctx.restore();
    }

    // ── Venus ────────────────────────────────────────────────────────────────
    const venusAlpha = bodyAlpha(10000, 15000, FADE);
    if (venusAlpha > 0) {
      const vx = w * 0.25;
      const vy = h * 0.28;
      const vr = Math.min(w, h) * 0.075;
      ctx.save();
      ctx.globalAlpha = venusAlpha;

      // Outer glow (yellowish)
      const venusGlow = ctx.createRadialGradient(vx, vy, vr * 0.8, vx, vy, vr * 2.2);
      venusGlow.addColorStop(0, 'rgba(255,220,100,0.18)');
      venusGlow.addColorStop(1, 'rgba(255,200,50,0)');
      ctx.fillStyle = venusGlow;
      ctx.beginPath();
      ctx.arc(vx, vy, vr * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Venus disc — thick cloud bands, pale yellow-white
      const venusDisc = ctx.createRadialGradient(vx - vr * 0.2, vy - vr * 0.2, vr * 0.05, vx, vy, vr);
      venusDisc.addColorStop(0, '#fffbe8');
      venusDisc.addColorStop(0.4, '#f0d878');
      venusDisc.addColorStop(0.75, '#c8a830');
      venusDisc.addColorStop(1, '#a07820');
      ctx.fillStyle = venusDisc;
      ctx.beginPath();
      ctx.arc(vx, vy, vr, 0, Math.PI * 2);
      ctx.fill();

      // Cloud band stripes
      ctx.save();
      ctx.beginPath();
      ctx.arc(vx, vy, vr, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,200,0.18)';
      ctx.lineWidth = vr * 0.18;
      [-0.45, -0.15, 0.15, 0.45].forEach(dy => {
        ctx.beginPath();
        ctx.moveTo(vx - vr, vy + dy * vr);
        ctx.lineTo(vx + vr, vy + dy * vr);
        ctx.stroke();
      });
      ctx.restore();

      // Atmosphere haze rim
      const venusRim = ctx.createRadialGradient(vx, vy, vr * 0.85, vx, vy, vr);
      venusRim.addColorStop(0, 'rgba(255,200,50,0)');
      venusRim.addColorStop(1, 'rgba(255,180,30,0.3)');
      ctx.fillStyle = venusRim;
      ctx.beginPath();
      ctx.arc(vx, vy, vr, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(255,220,100,0.75)';
      ctx.font = `${Math.round(vr * 0.35)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('VENUS', vx, vy + vr + 6);

      ctx.restore();
    }

    // ── Mars ─────────────────────────────────────────────────────────────────
    const marsAlpha = bodyAlpha(15000, 20000, FADE);
    if (marsAlpha > 0) {
      const rx = w * 0.68;
      const ry = h * 0.32;
      const rr = Math.min(w, h) * 0.065;
      ctx.save();
      ctx.globalAlpha = marsAlpha;

      // Outer glow (reddish)
      const marsGlow = ctx.createRadialGradient(rx, ry, rr * 0.8, rx, ry, rr * 2);
      marsGlow.addColorStop(0, 'rgba(220,80,40,0.2)');
      marsGlow.addColorStop(1, 'rgba(200,60,20,0)');
      ctx.fillStyle = marsGlow;
      ctx.beginPath();
      ctx.arc(rx, ry, rr * 2, 0, Math.PI * 2);
      ctx.fill();

      // Mars disc — rusty red
      const marsDisc = ctx.createRadialGradient(rx - rr * 0.25, ry - rr * 0.25, rr * 0.05, rx, ry, rr);
      marsDisc.addColorStop(0, '#f0a070');
      marsDisc.addColorStop(0.4, '#d05030');
      marsDisc.addColorStop(0.75, '#a03020');
      marsDisc.addColorStop(1, '#701808');
      ctx.fillStyle = marsDisc;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      ctx.fill();

      // Surface detail — darker patches
      ctx.save();
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(80,20,10,0.25)';
      [[-0.2, -0.3, 0.28], [0.3, 0.2, 0.22], [-0.35, 0.25, 0.18]].forEach(([dx, dy, rs]) => {
        ctx.beginPath();
        ctx.arc(rx + dx * rr, ry + dy * rr, rs * rr, 0, Math.PI * 2);
        ctx.fill();
      });
      // Polar ice cap (top)
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(rx, ry - rr * 0.78, rr * 0.35, rr * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Atmosphere rim
      const marsRim = ctx.createRadialGradient(rx, ry, rr * 0.85, rx, ry, rr);
      marsRim.addColorStop(0, 'rgba(220,80,40,0)');
      marsRim.addColorStop(1, 'rgba(220,80,40,0.25)');
      ctx.fillStyle = marsRim;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(240,140,100,0.8)';
      ctx.font = `${Math.round(rr * 0.38)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('MARS', rx, ry + rr + 6);

      ctx.restore();
    }

    // ── Jupiter ───────────────────────────────────────────────────────────
    const jupA = bodyAlpha(20000, 27500, FADE);
    if (jupA > 0) {
      const jx=w*0.3, jy=h*0.25, jr=S*0.13;
      ctx.save(); ctx.globalAlpha=jupA;
      let g = ctx.createRadialGradient(jx,jy,jr*0.8,jx,jy,jr*2);
      g.addColorStop(0,'rgba(200,160,120,0.15)'); g.addColorStop(1,'rgba(200,160,120,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(jx,jy,jr*2,0,Math.PI*2); ctx.fill();
      g = ctx.createRadialGradient(jx-jr*0.2,jy-jr*0.2,jr*0.05,jx,jy,jr);
      g.addColorStop(0,'#f5dfc0'); g.addColorStop(0.5,'#d4a870'); g.addColorStop(1,'#a07040');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(jx,jy,jr,0,Math.PI*2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(jx,jy,jr,0,Math.PI*2); ctx.clip();
      [{dy:-0.55,bh:0.12,c:'rgba(180,100,60,0.55)'},{dy:-0.3,bh:0.18,c:'rgba(210,140,80,0.45)'},
       {dy:-0.05,bh:0.22,c:'rgba(160,80,40,0.5)'},{dy:0.22,bh:0.16,c:'rgba(200,130,70,0.45)'},{dy:0.5,bh:0.12,c:'rgba(170,100,55,0.5)'}
      ].forEach(b=>{ctx.fillStyle=b.c; ctx.fillRect(jx-jr,jy+b.dy*jr,jr*2,b.bh*jr);});
      ctx.fillStyle='rgba(200,60,30,0.7)'; ctx.beginPath(); ctx.ellipse(jx+jr*0.25,jy-jr*0.05,jr*0.22,jr*0.13,-0.2,0,Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.fillStyle='rgba(220,180,130,0.75)'; ctx.font=`${Math.round(jr*0.28)}px monospace`;
      ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText('JUPITER',jx,jy+jr+6);
      ctx.restore();
    }

    // ── Saturn ────────────────────────────────────────────────────────────
    const satA = bodyAlpha(27500, 35000, FADE);
    if (satA > 0) {
      const sx=w*0.65, sy=h*0.3, sr=S*0.085;
      ctx.save(); ctx.globalAlpha=satA;
      ctx.save(); ctx.translate(sx,sy); ctx.scale(1,0.28);
      ctx.strokeStyle='rgba(210,185,130,0.55)'; ctx.lineWidth=sr*0.55;
      ctx.beginPath(); ctx.arc(0,0,sr*1.85,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle='rgba(180,155,100,0.4)'; ctx.lineWidth=sr*0.25;
      ctx.beginPath(); ctx.arc(0,0,sr*1.45,0,Math.PI*2); ctx.stroke();
      ctx.restore();
      let g = ctx.createRadialGradient(sx-sr*0.2,sy-sr*0.2,sr*0.05,sx,sy,sr);
      g.addColorStop(0,'#f8eac0'); g.addColorStop(0.5,'#e0c070'); g.addColorStop(1,'#b09040');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.clip();
      ctx.strokeStyle='rgba(160,120,50,0.25)'; ctx.lineWidth=sr*0.15;
      [-0.35,0,0.35].forEach(dy=>{ctx.beginPath();ctx.moveTo(sx-sr,sy+dy*sr);ctx.lineTo(sx+sr,sy+dy*sr);ctx.stroke();}); ctx.restore();
      ctx.fillStyle='rgba(230,200,120,0.75)'; ctx.font=`${Math.round(sr*0.35)}px monospace`;
      ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText('SATURN',sx,sy+sr+6);
      ctx.restore();
    }

    // ── Uranus ────────────────────────────────────────────────────────────
    const urA = bodyAlpha(35000, 42500, FADE);
    if (urA > 0) {
      const ux=w*0.28, uy=h*0.3, ur=S*0.075;
      ctx.save(); ctx.globalAlpha=urA;
      let g = ctx.createRadialGradient(ux,uy,ur*0.8,ux,uy,ur*2);
      g.addColorStop(0,'rgba(100,220,210,0.18)'); g.addColorStop(1,'rgba(80,200,190,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ux,uy,ur*2,0,Math.PI*2); ctx.fill();
      g = ctx.createRadialGradient(ux-ur*0.2,uy-ur*0.2,ur*0.05,ux,uy,ur);
      g.addColorStop(0,'#d0f8f5'); g.addColorStop(0.5,'#70d8d0'); g.addColorStop(1,'#30a8a0');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ux,uy,ur,0,Math.PI*2); ctx.fill();
      ctx.save(); ctx.translate(ux,uy); ctx.rotate(Math.PI*0.15); ctx.scale(0.3,1);
      ctx.strokeStyle='rgba(100,200,195,0.4)'; ctx.lineWidth=ur*0.18;
      ctx.beginPath(); ctx.arc(0,0,ur*1.5,0,Math.PI*2); ctx.stroke(); ctx.restore();
      ctx.fillStyle='rgba(100,220,210,0.8)'; ctx.font=`${Math.round(ur*0.35)}px monospace`;
      ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText('URANUS',ux,uy+ur+6);
      ctx.restore();
    }

    // ── Neptune ───────────────────────────────────────────────────────────
    const nepA = bodyAlpha(42500, 50000, FADE);
    if (nepA > 0) {
      const nx=w*0.7, ny=h*0.28, nr=S*0.07;
      ctx.save(); ctx.globalAlpha=nepA;
      let g = ctx.createRadialGradient(nx,ny,nr*0.8,nx,ny,nr*2);
      g.addColorStop(0,'rgba(50,80,220,0.2)'); g.addColorStop(1,'rgba(30,60,200,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(nx,ny,nr*2,0,Math.PI*2); ctx.fill();
      g = ctx.createRadialGradient(nx-nr*0.2,ny-nr*0.2,nr*0.05,nx,ny,nr);
      g.addColorStop(0,'#a0b8ff'); g.addColorStop(0.4,'#3060e0'); g.addColorStop(1,'#1030a0');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(nx,ny,nr,0,Math.PI*2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(nx,ny,nr,0,Math.PI*2); ctx.clip();
      ctx.fillStyle='rgba(20,20,120,0.5)'; ctx.beginPath(); ctx.ellipse(nx-nr*0.2,ny+nr*0.15,nr*0.28,nr*0.18,0.3,0,Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.translate(nx,ny); ctx.scale(1,0.22);
      ctx.strokeStyle='rgba(80,100,220,0.3)'; ctx.lineWidth=nr*0.12;
      ctx.beginPath(); ctx.arc(0,0,nr*1.55,0,Math.PI*2); ctx.stroke(); ctx.restore();
      ctx.fillStyle='rgba(100,130,255,0.8)'; ctx.font=`${Math.round(nr*0.35)}px monospace`;
      ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText('NEPTUNE',nx,ny+nr+6);
      ctx.restore();
    }

    // ── Pluto ─────────────────────────────────────────────────────────────
    const plutoA = bodyAlpha(50000, 65000, FADE);
    if (plutoA > 0) {
      const px=w*0.35, py=h*0.32, pr=S*0.04;
      ctx.save(); ctx.globalAlpha=plutoA;
      let g = ctx.createRadialGradient(px,py,pr*0.8,px,py,pr*2.5);
      g.addColorStop(0,'rgba(180,150,130,0.2)'); g.addColorStop(1,'rgba(160,130,110,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,py,pr*2.5,0,Math.PI*2); ctx.fill();
      g = ctx.createRadialGradient(px-pr*0.2,py-pr*0.2,pr*0.05,px,py,pr);
      g.addColorStop(0,'#e8d8c8'); g.addColorStop(0.5,'#b89878'); g.addColorStop(1,'#806050');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,py,pr,0,Math.PI*2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(px,py,pr,0,Math.PI*2); ctx.clip();
      ctx.fillStyle='rgba(240,230,210,0.6)'; ctx.beginPath(); ctx.ellipse(px+pr*0.1,py+pr*0.1,pr*0.45,pr*0.38,-0.3,0,Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.fillStyle='rgba(200,170,140,0.8)'; ctx.font=`${Math.round(pr*0.55)}px monospace`;
      ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText('PLUTO',px,py+pr+6);
      ctx.restore();
    }

    // ── Kuiper Belt ───────────────────────────────────────────────────────
    const kuiperA = bodyAlpha(65000, 80000, FADE);
    if (kuiperA > 0) {
      const now = performance.now() / 1000;
      ctx.save(); ctx.globalAlpha=kuiperA*0.85;
      [{x:0.15,y:0.2,r:6,vx:0.006,c:'#b0a898'},{x:0.45,y:0.15,r:9,vx:0.004,c:'#c8c0b0'},
       {x:0.7,y:0.35,r:5,vx:0.007,c:'#a09888'},{x:0.25,y:0.42,r:7,vx:0.005,c:'#d0c8b8'},
       {x:0.6,y:0.22,r:4,vx:0.009,c:'#b8b0a0'},{x:0.82,y:0.18,r:8,vx:0.003,c:'#c0b8a8'},
       {x:0.5,y:0.38,r:5,vx:0.006,c:'#a8a098'},{x:0.1,y:0.38,r:6,vx:0.008,c:'#b8b0a0'}
      ].forEach(o=>{
        const ox=((o.x+o.vx*now)%1)*w, oy=o.y*h;
        const g=ctx.createRadialGradient(ox-o.r*0.3,oy-o.r*0.3,o.r*0.1,ox,oy,o.r);
        g.addColorStop(0,'#e8e0d0'); g.addColorStop(1,o.c);
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ox,oy,o.r,0,Math.PI*2); ctx.fill();
      });
      ctx.fillStyle='rgba(200,190,170,0.85)'; ctx.font=`bold ${Math.round(S*0.025)}px monospace`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('KUIPER BELT',w*0.5,h*0.08);
      ctx.restore();
    }

    // ── Oort Cloud ────────────────────────────────────────────────────────
    const oortA = bodyAlpha(80000, 100000, FADE);
    if (oortA > 0) {
      const now = performance.now() / 1000;
      ctx.save(); ctx.globalAlpha=oortA*0.8;
      [{x:0.08,y:0.12,r:3,vx:0.002,c:'#c8d8e8'},{x:0.22,y:0.28,r:2,vx:0.003,c:'#d0e0f0'},
       {x:0.38,y:0.1,r:4,vx:0.002,c:'#b8ccd8'},{x:0.55,y:0.32,r:2,vx:0.004,c:'#c0d4e4'},
       {x:0.72,y:0.18,r:3,vx:0.002,c:'#d8e8f8'},{x:0.88,y:0.25,r:2,vx:0.003,c:'#c8d8e8'},
       {x:0.15,y:0.45,r:3,vx:0.002,c:'#b0c8d8'},{x:0.42,y:0.42,r:2,vx:0.003,c:'#c0d0e0'},
       {x:0.65,y:0.4,r:4,vx:0.002,c:'#d0e0f0'},{x:0.9,y:0.38,r:2,vx:0.004,c:'#c8d8e8'},
       {x:0.3,y:0.55,r:3,vx:0.002,c:'#b8cce0'},{x:0.78,y:0.52,r:2,vx:0.003,c:'#d0e0f0'}
      ].forEach(o=>{
        const ox=((o.x+o.vx*now)%1)*w, oy=o.y*h;
        const g=ctx.createRadialGradient(ox,oy,0,ox,oy,o.r*2);
        g.addColorStop(0,'#ffffff'); g.addColorStop(0.4,o.c); g.addColorStop(1,'rgba(180,210,240,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ox,oy,o.r*2,0,Math.PI*2); ctx.fill();
      });
      const haze=ctx.createRadialGradient(w*0.5,h*0.5,0,w*0.5,h*0.5,w*0.6);
      haze.addColorStop(0,'rgba(150,180,220,0.06)'); haze.addColorStop(1,'rgba(100,140,200,0)');
      ctx.fillStyle=haze; ctx.fillRect(0,0,w,h);
      ctx.fillStyle='rgba(180,210,240,0.9)'; ctx.font=`bold ${Math.round(S*0.025)}px monospace`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('OORT CLOUD',w*0.5,h*0.08);
      ctx.restore();
    }
  }

  /**
   * Draw the ground scene at the bottom of the world:
   * grass ground, a small lake, and a house with a roof.
   * Drawn in world coordinates — scrolls with the viewport.
   */
  _drawGroundScene(ctx, w) {
    const gy = this._groundY; // world Y of the ground surface
    const sceneH = 200;       // how tall the scene is below the ground line

    ctx.save();

    // ── Sky/ground fill below the ground line ──────────────────────────────
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, gy, w, sceneH);

    // ── Grass strip ─────────────────────────────────────────────────────────
    // Wavy grass using a bezier path
    ctx.beginPath();
    ctx.moveTo(0, gy);
    const grassH = 18;
    const segments = Math.ceil(w / 60);
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments) * w;
      const bump = (i % 2 === 0) ? -grassH : -grassH * 0.4;
      ctx.lineTo(x, gy + bump);
    }
    ctx.lineTo(w, gy + 30);
    ctx.lineTo(0, gy + 30);
    ctx.closePath();
    ctx.fillStyle = '#2d7a2d';
    ctx.fill();

    // Lighter grass highlight
    ctx.beginPath();
    ctx.moveTo(0, gy - 2);
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments) * w;
      const bump = (i % 2 === 0) ? -grassH + 4 : -grassH * 0.4 + 2;
      ctx.lineTo(x, gy + bump);
    }
    ctx.strokeStyle = '#4aaa4a';
    ctx.lineWidth = 3;
    ctx.stroke();

    // ── Lake ────────────────────────────────────────────────────────────────
    const lakeX = w * 0.55;
    const lakeY = gy + 10;
    const lakeW = w * 0.22;
    const lakeH2 = 28;

    ctx.beginPath();
    ctx.ellipse(lakeX, lakeY, lakeW / 2, lakeH2 / 2, 0, 0, Math.PI * 2);
    const lakeGrad = ctx.createRadialGradient(lakeX - lakeW * 0.1, lakeY - 4, 2, lakeX, lakeY, lakeW / 2);
    lakeGrad.addColorStop(0, '#88ccff');
    lakeGrad.addColorStop(0.5, '#2277bb');
    lakeGrad.addColorStop(1, '#114466');
    ctx.fillStyle = lakeGrad;
    ctx.fill();

    // Lake shimmer
    ctx.beginPath();
    ctx.ellipse(lakeX - lakeW * 0.15, lakeY - 4, lakeW * 0.12, 3, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    // ── House ───────────────────────────────────────────────────────────────
    const hx = w * 0.18;
    const hy = gy - 10;
    const houseW = w * 0.12;
    const houseH = houseW * 0.75;

    // House body
    ctx.fillStyle = '#d4a96a';
    ctx.fillRect(hx - houseW / 2, hy - houseH, houseW, houseH);

    // Door
    const doorW = houseW * 0.22;
    const doorH = houseH * 0.42;
    ctx.fillStyle = '#7a4a1a';
    ctx.fillRect(hx - doorW / 2, hy - doorH, doorW, doorH);

    // Windows
    const winSize = houseW * 0.18;
    ctx.fillStyle = '#aaddff';
    ctx.fillRect(hx - houseW * 0.35, hy - houseH * 0.65, winSize, winSize);
    ctx.fillRect(hx + houseW * 0.17, hy - houseH * 0.65, winSize, winSize);
    // Window cross
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    [-0.35, 0.17].forEach(function(ox) {
      const wx = hx + ox * houseW;
      ctx.beginPath();
      ctx.moveTo(wx + winSize / 2, hy - houseH * 0.65);
      ctx.lineTo(wx + winSize / 2, hy - houseH * 0.65 + winSize);
      ctx.moveTo(wx, hy - houseH * 0.65 + winSize / 2);
      ctx.lineTo(wx + winSize, hy - houseH * 0.65 + winSize / 2);
      ctx.stroke();
    });

    // Roof (triangle)
    ctx.beginPath();
    ctx.moveTo(hx - houseW / 2 - 6, hy - houseH);
    ctx.lineTo(hx, hy - houseH - houseW * 0.55);
    ctx.lineTo(hx + houseW / 2 + 6, hy - houseH);
    ctx.closePath();
    ctx.fillStyle = '#8b2020';
    ctx.fill();

    // Chimney
    ctx.fillStyle = '#6a3a1a';
    ctx.fillRect(hx + houseW * 0.2, hy - houseH - houseW * 0.45, houseW * 0.1, houseW * 0.3);

    // Smoke puffs
    ctx.fillStyle = 'rgba(200,200,200,0.5)';
    [0, 6, 11].forEach(function(offset) {
      ctx.beginPath();
      ctx.arc(hx + houseW * 0.25, hy - houseH - houseW * 0.5 - offset * 2, 4 + offset * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Tree ────────────────────────────────────────────────────────────────
    const tx = w * 0.35;
    const ty = gy - 5;
    const trunkH = 35;
    const trunkW = 7;
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(tx - trunkW / 2, ty - trunkH, trunkW, trunkH);
    // Foliage (3 layered circles)
    [[0, trunkH + 18, 22], [0, trunkH + 32, 18], [-14, trunkH + 22, 14], [14, trunkH + 22, 14]].forEach(function([dx, dy, r]) {
      ctx.beginPath();
      ctx.arc(tx + dx, ty - dy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#1a6a1a';
      ctx.fill();
    });
    // Foliage highlight
    ctx.beginPath();
    ctx.arc(tx - 4, ty - trunkH - 22, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#2a9a2a';
    ctx.fill();

    ctx.restore();
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
   * Draw all active gems with distinct colours and shapes per type:
   *   red    → downward triangle  (danger / fuel drain)
   *   yellow → circle             (small fuel)
   *   green  → diamond            (big fuel)
   *   blue   → star               (speed boost)
   */
  _drawGems(ctx) {
    const R = 12; // base radius

    for (const gem of this._gems) {
      const t = gem.gemType || 'yellow';
      ctx.save();
      ctx.translate(gem.position.x, gem.position.y);

      // Glow
      const glowColors = { red: '#ff0000', yellow: '#ffaa00', green: '#00cc00', blue: '#0088ff' };
      const fillColors = { red: '#ff3333', yellow: '#ffd700', green: '#44ee44', blue: '#44aaff' };
      ctx.shadowColor = glowColors[t] || '#ffaa00';
      ctx.shadowBlur = 10;
      ctx.fillStyle = fillColors[t] || '#ffd700';

      if (t === 'yellow') {
        // Circle
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();

      } else if (t === 'red') {
        // Downward triangle
        ctx.beginPath();
        ctx.moveTo(0, R);
        ctx.lineTo(-R * 0.87, -R * 0.5);
        ctx.lineTo( R * 0.87, -R * 0.5);
        ctx.closePath();
        ctx.fill();

      } else if (t === 'green') {
        // Diamond (rotated square)
        ctx.beginPath();
        ctx.moveTo(0, -R * 1.2);
        ctx.lineTo( R * 0.85, 0);
        ctx.lineTo(0,  R * 1.2);
        ctx.lineTo(-R * 0.85, 0);
        ctx.closePath();
        ctx.fill();

      } else if (t === 'blue') {
        // 4-point star
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 === 0 ? R * 1.2 : R * 0.5;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Small white highlight dot
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(-R * 0.3, -R * 0.3, R * 0.22, 0, Math.PI * 2);
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
    const { score, height, fuel, maxFuel, highScore, level, levelLabel, levelUpFlashing, levelUpTimerMs, speedBoostMs } = this._scoreState;
    const PAD = 16;
    const LINE_H = 24;

    // Level colour (used for level indicator and level-up flash)
    const levelColor = level >= 10 ? '#ff4444' : level >= 8 ? '#ff8800' : level >= 6 ? '#ffdd00' : '#88ccff';

    ctx.save();
    ctx.textBaseline = 'top';

    // ── Top-left: SCORE and HEIGHT ──────────────────────────────────────────
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE  ${Math.floor(score)}`, PAD, PAD);
    ctx.fillText(`HEIGHT ${(height / 3).toFixed(1)} m`, PAD, PAD + LINE_H);

    // ── Top-right: BEST and LVL — inset enough to clear the ⚙ button (56px) ──
    const rightX = w - 64;   // 64px from right edge clears the 40px button + padding
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText(`BEST  ${Math.floor(highScore)}`, rightX, PAD);

    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = levelColor;
    ctx.fillText(`LVL ${level}`, rightX, PAD + LINE_H);
    ctx.textAlign = 'left';

    // ── Bottom-left: Fuel bar ───────────────────────────────────────────────
    const barW = 160;
    const barH = 14;
    const barX = PAD;
    const barY = h - PAD - barH;
    const fuelRatio = maxFuel > 0 ? Math.max(0, Math.min(1, fuel / maxFuel)) : 0;

    // Background track
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(barX, barY, barW, barH);

    // Fill
    if (fuelRatio > 0.5) {
      ctx.fillStyle = '#44dd44';
    } else if (fuelRatio > 0.2) {
      ctx.fillStyle = '#dddd22';
    } else {
      ctx.fillStyle = '#dd4444';
    }
    ctx.fillRect(barX, barY, barW * fuelRatio, barH);

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // Label to the right of the bar
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`FUEL  ${Math.floor(fuel)} / ${Math.floor(maxFuel)}`, barX + barW + 8, barY + barH / 2);

    // No-fuel warning above the bar
    if (fuel === 0) {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#ff4444';
      ctx.textBaseline = 'bottom';
      ctx.fillText('⚠ NO FUEL — CANNOT DRAW', barX, barY - 4);
    }

    // Speed boost indicator (above fuel bar when active)
    if (speedBoostMs > 0) {
      const boostProgress = speedBoostMs / 5000;
      const boostBarW = 160;
      const boostBarH = 10;
      const boostBarY = barY - (fuel === 0 ? 44 : 22);

      ctx.fillStyle = 'rgba(68,170,255,0.2)';
      ctx.fillRect(barX, boostBarY, boostBarW, boostBarH);
      ctx.fillStyle = '#44aaff';
      ctx.fillRect(barX, boostBarY, boostBarW * boostProgress, boostBarH);
      ctx.strokeStyle = 'rgba(68,170,255,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, boostBarY, boostBarW, boostBarH);

      ctx.fillStyle = '#44aaff';
      ctx.font = 'bold 12px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(`⚡ BOOST  ${(speedBoostMs / 1000).toFixed(1)}s`, barX + boostBarW + 8, boostBarY + boostBarH / 2);
    }

    ctx.restore();

    // ── Level-up flash overlay ──────────────────────────────────────────────
    if (levelUpFlashing && levelUpTimerMs > 0) {
      const FLASH_DURATION = 2500;
      const progress = levelUpTimerMs / FLASH_DURATION;
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
      ctx.fillText(`LEVEL ${level}`, w / 2, h / 2);
      ctx.shadowBlur = 0;
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
