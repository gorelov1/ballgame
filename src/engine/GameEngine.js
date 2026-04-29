'use strict';

/**
 * GameEngine — coordinates all game subsystems and owns the main game loop.
 *
 * Responsibilities:
 *  - Instantiate and wire all subsystems (PhysicsEngine, Renderer, InputHandler,
 *    ScoreManager, FuelManager, GemSpawner, DatabaseClient)
 *  - Run the fixed-timestep accumulator game loop via requestAnimationFrame
 *  - Handle input events (platform requests, drag previews)
 *  - Handle physics callbacks (gem contact, platform contact, out-of-bounds)
 *  - Manage viewport scrolling and height milestone tracking
 *  - Manage platform lifetimes and fade-out
 *  - Persist session records and display game-over screen
 *
 * Requirements: 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5,
 *               5.1, 5.2, 6.4, 6.5, 7.3, 9.1, 9.3, 9.4
 */

const PhysicsEngine = require('../physics/PhysicsEngine');
const Renderer = require('../render/Renderer');
const InputHandler = require('../input/InputHandler');
const ScoreManager = require('../score/ScoreManager');
const FuelManager = require('../fuel/FuelManager');
const GemSpawner = require('../gems/GemSpawner');
const DatabaseClient = require('../db/DatabaseClient');
const LevelManager = require('../level/LevelManager');
const { v4: uuidv4 } = require('uuid');
const {
  FIXED_STEP,
  MAX_DELTA,
  BALL_RADIUS,
  GEM_SPAWN_MILESTONE_PX,
  STARTING_FUEL,
  MAX_FUEL,
  PLATFORM_FUEL_COST,
  GEM_FUEL_VALUE,
  HEIGHT_WEIGHT,
  GEM_WEIGHT,
  GRAVITY,
  BOUNCE_RESTITUTION,
  MAX_BALL_SPEED,
  PLATFORM_LIFETIME_MS,
} = require('../config/constants');

class GameEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} config - GameConfig object (or defaults from constants)
   */
  constructor(canvas, config) {
    config = config || {};

    // --- Subsystem instantiation ---

    this._physicsEngine = new PhysicsEngine(config.gravity || GRAVITY, config);

    this._renderer = new Renderer(canvas, config);

    this._fuelManager = new FuelManager(
      config.startingFuel || STARTING_FUEL,
      config.maxFuel || MAX_FUEL
    );

    this._scoreManager = new ScoreManager(
      config.heightWeightScore || HEIGHT_WEIGHT,
      config.gemWeightScore || GEM_WEIGHT
    );

    this._gemSpawner = new GemSpawner(
      { ...config, viewportWidth: canvas.width },
      this._physicsEngine
    );

    this._inputHandler = new InputHandler(canvas, this._fuelManager);

    this._dbClient = new DatabaseClient({
      baseUrl: config.backendUrl || 'http://localhost:3000',
      storage: config.storage,
    });

    this._levelManager = new LevelManager();

    // --- Session state ---
    this._sessionActive = false;
    this._rafHandle = null;
    this._lastTimestamp = null;
    this._currentTimestamp = 0;
    this._accumulator = 0;

    // --- Viewport ---
    this._viewportOffset = 0;
    this._lastHeightMilestone = 0;
    this._maxHeightReached = 0; // tracks the highest point the ball has reached (in pixels above start)

    // --- Ball handle ---
    this._ballHandle = null;

    // --- Active platforms: Map<id, PlatformHandle> ---
    this._activePlatforms = new Map();

    // --- Canvas dimensions ---
    this._canvasWidth = canvas.width;
    this._canvasHeight = canvas.height;

    // --- Wire events ---
    this._wireInputEvents();
    this._wirePhysicsCallbacks();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Begin a new session: fetch high score, create ball, start rAF loop.
   * Requirements: 7.3, 9.1
   */
  async start() {
    // Fetch high score from DB (falls back to cache if offline)
    try {
      const highScore = await this._dbClient.fetchHighScore();
      this._scoreManager.setHighScore(highScore);
    } catch (_err) {
      // fetchHighScore never rejects, but guard defensively
    }

    // Create ball near the very top-centre of the canvas
    this._ballHandle = this._physicsEngine.createBall(
      { x: this._canvasWidth / 2, y: 50 },
      BALL_RADIUS
    );

    // Create left and right boundary walls
    this._physicsEngine.createWalls(this._canvasWidth, this._canvasHeight);

    // Set out-of-bounds threshold: ball falls below the initial canvas bottom
    // (world y > canvasHeight + small margin). The viewport follows the ball
    // downward so game-over only triggers when it truly hits the floor.
    this._physicsEngine._outOfBoundsY = this._canvasHeight * 1.5;

    // Enable touch input, set max platform length to 25% of canvas width
    this._inputHandler.setMaxLength(this._canvasWidth * 0.25);
    this._inputHandler.enable();

    this._sessionActive = true;
    this._rafHandle = requestAnimationFrame((ts) => this._tick(ts));
  }

  /**
   * Suspend physics and rendering (e.g. app backgrounded).
   * Requirements: 9.3
   */
  pause() {
    cancelAnimationFrame(this._rafHandle);
    this._rafHandle = null;
    this._lastTimestamp = null;
  }

  /**
   * Resume from paused state.
   * Requirements: 9.4
   */
  resume() {
    this._accumulator = 0;
    this._lastTimestamp = null;
    this._rafHandle = requestAnimationFrame((ts) => this._tick(ts));
  }

  /**
   * Reset all session state and start a new session.
   * Requirements: 4.5
   */
  restart() {
    // Cancel any running loop
    if (this._rafHandle !== null) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }

    this._sessionActive = false;
    this._lastTimestamp = null;
    this._accumulator = 0;

    // Reset subsystems
    this._fuelManager.reset();
    this._scoreManager.reset();
    this._gemSpawner.reset();
    this._levelManager.reset();

    // Destroy all active platforms
    for (const handle of this._activePlatforms.values()) {
      this._physicsEngine.destroyBody(handle);
    }
    this._activePlatforms.clear();

    // Destroy ball
    if (this._ballHandle) {
      this._physicsEngine.destroyBody(this._ballHandle);
      this._ballHandle = null;
    }

    // Reset viewport
    this._viewportOffset = 0;
    this._lastHeightMilestone = 0;
    this._maxHeightReached = 0;
    this._renderer.setViewportOffset(0);
    this._inputHandler.setViewportOffset(0);

    // Hide game-over overlay
    this._renderer.hideGameOver();

    // Start fresh
    this.start();
  }

  // ---------------------------------------------------------------------------
  // Task 11.2 — Main game loop with fixed-timestep accumulator
  // ---------------------------------------------------------------------------

  /**
   * Per-frame callback driven by requestAnimationFrame.
   * Implements the fixed-timestep accumulator pattern.
   * Requirements: 6.4, 6.5
   *
   * @param {DOMHighResTimeStamp} timestamp
   */
  _tick(timestamp) {
    if (!this._sessionActive) return;

    if (this._lastTimestamp === null) {
      this._lastTimestamp = timestamp;
    }

    const deltaTime = Math.min((timestamp - this._lastTimestamp) / 1000, MAX_DELTA);
    this._lastTimestamp = timestamp;
    this._accumulator += deltaTime;

    while (this._accumulator >= FIXED_STEP) {
      this._physicsEngine.step(FIXED_STEP);
      this._accumulator -= FIXED_STEP;
    }

    // Update level based on current score
    const currentScore = this._scoreManager.currentScore;
    this._levelManager.update(currentScore);
    this._levelManager.tick(deltaTime * 1000);
    // Apply physics params for current level every tick (cheap, idempotent)
    this._physicsEngine.setPhysicsParams(
      this._levelManager.gravity,
      this._levelManager.bounceSpeed,
      this._levelManager.maxBallSpeed
    );

    // Update viewport scrolling after physics steps
    this._updateViewport();

    // Store current rAF timestamp for platform creation timestamping
    this._currentTimestamp = timestamp;

    // Update platform lifetimes and remove expired ones
    this._updatePlatforms(timestamp);

    // Sync renderer state
    if (this._ballHandle) {
      const posPx = this._physicsEngine.getBallPositionPx();
      if (posPx) {
        this._renderer.updateBall(posPx.x, posPx.y);
      }
    }
    this._renderer.updatePlatforms(Array.from(this._activePlatforms.values()));
    this._renderer.updateGems(this._gemSpawner.getActiveGems());
    this._renderer.updateHUD(
      this._scoreManager.currentScore,
      this._scoreManager.currentHeight,
      this._fuelManager.currentFuel,
      this._fuelManager.maxFuel,
      this._scoreManager.highScore,
      this._levelManager.currentLevel,
      this._levelManager.currentLabel,
      this._levelManager.isLevelUpFlashing,
      this._levelManager.levelUpTimerMs
    );

    this._renderer.draw(this._accumulator / FIXED_STEP);

    this._rafHandle = requestAnimationFrame((ts) => this._tick(ts));
  }

  // ---------------------------------------------------------------------------
  // Task 11.4 — Viewport scrolling
  // ---------------------------------------------------------------------------

  /**
   * Keep the ball visible by scrolling the viewport to follow it.
   *
   * Scroll UP  when ball rises above the upper 35% of the screen.
   * Scroll DOWN when ball falls below the lower 65% of the screen,
   *             but never scroll below the world origin (viewportOffset >= 0
   *             means the top of the canvas shows world y=0 or higher).
   *
   * Height score only increases — it is never decremented when scrolling down.
   */
  _updateViewport() {
    if (!this._ballHandle) return;

    const posPx = this._physicsEngine.getBallPositionPx();
    if (!posPx) return;

    const ballWorldY  = posPx.y;
    const ballScreenY = ballWorldY - this._viewportOffset;

    const upperZone = this._canvasHeight * 0.35;
    const lowerZone = this._canvasHeight * 0.65;

    if (ballScreenY < upperZone) {
      // Ball is above the upper zone — scroll up to follow it
      const delta = upperZone - ballScreenY;
      this._viewportOffset -= delta;
      this._renderer.setViewportOffset(this._viewportOffset);
      this._inputHandler.setViewportOffset(this._viewportOffset);

      // Height score: only increase when ball reaches a new maximum height.
      // In y-down coords, higher up = smaller Y. We track height as pixels
      // above the spawn point (y=50). A new max means ballWorldY < previous min.
      const heightAboveStart = Math.max(0, 50 - ballWorldY);
      if (heightAboveStart > this._maxHeightReached) {
        const newHeight = heightAboveStart - this._maxHeightReached;
        this._maxHeightReached = heightAboveStart;
        this._scoreManager.onHeightGained(newHeight);
      }

      // Gem spawn milestones
      const currentHeight = this._scoreManager.currentHeight;
      const milestone =
        Math.floor(currentHeight / GEM_SPAWN_MILESTONE_PX) * GEM_SPAWN_MILESTONE_PX;
      if (milestone > 0 && milestone > this._lastHeightMilestone) {
        this._lastHeightMilestone = milestone;
        this._gemSpawner.onHeightMilestone(milestone, ballWorldY, this._canvasHeight);
      }

    } else if (ballScreenY > lowerZone) {
      // Ball is below the lower zone — scroll down to follow it
      const delta = ballScreenY - lowerZone;
      const newOffset = this._viewportOffset + delta;
      this._viewportOffset = Math.min(newOffset, 0);
      this._renderer.setViewportOffset(this._viewportOffset);
      this._inputHandler.setViewportOffset(this._viewportOffset);
    }
  }

  /**
   * Advance platform lifetime tracking; fade and remove expired platforms.
   * Requirements: 2.5, 8.4
   *
   * @param {DOMHighResTimeStamp} timestamp - Current rAF timestamp in ms.
   */
  _updatePlatforms(timestamp) {
    for (const [id, handle] of this._activePlatforms) {
      const elapsed = timestamp - handle._createdAt;
      const lifetimeRatio = Math.max(0, 1 - elapsed / handle.lifetimeMs);
      this._renderer.setPlatformOpacity(id, lifetimeRatio);

      if (elapsed >= handle.lifetimeMs) {
        this._physicsEngine.destroyBody(handle);
        this._activePlatforms.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Task 11.3 — Event handler wiring
  // ---------------------------------------------------------------------------

  /** Wire InputHandler events to GameEngine handlers. */
  _wireInputEvents() {
    this._inputHandler.on('platformRequest', ({ start, end }) =>
      this._onPlatformRequest(start, end)
    );
    this._inputHandler.on('previewUpdate', ({ start, end }) =>
      this._renderer.setPreviewLine(start, end)
    );
  }

  /** Wire PhysicsEngine collision callbacks to GameEngine handlers. */
  _wirePhysicsCallbacks() {
    this._physicsEngine.onBallPlatformContact = (platformId, relVel) =>
      this._onBallPlatformContact(platformId, relVel);
    this._physicsEngine.onBallGemContact = (gemId) =>
      this._onBallGemContact(gemId);
    this._physicsEngine.onBallOutOfBounds = (ballY) =>
      this._onBallOutOfBounds(ballY);
  }

  // ---------------------------------------------------------------------------
  // Task 11.3 — Event handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle a platform draw request from InputHandler.
   * Deducts fuel, creates the platform body, and registers it for lifetime tracking.
   * Requirements: 2.2, 2.3
   *
   * @param {{ x: number, y: number }} start
   * @param {{ x: number, y: number }} end
   */
  _onPlatformRequest(start, end) {
    // Deduct fuel; bail out if insufficient
    if (!this._fuelManager.deduct(PLATFORM_FUEL_COST)) {
      return;
    }

    // Create the platform body using the current level's lifetime
    const handle = this._physicsEngine.createPlatform(start, end, this._levelManager.platformLifetimeMs);

    // Tag with the current rAF timestamp for lifetime tracking
    // (must match the timestamp used in _updatePlatforms)
    handle._createdAt = this._currentTimestamp;

    // Register in active platforms map
    this._activePlatforms.set(handle.id, handle);

    // Start fully opaque
    this._renderer.setPlatformOpacity(handle.id, 1.0);

    // Clear the drag preview line
    this._renderer.setPreviewLine(null, null);
  }

  /**
   * Handle ball–gem contact.
   * Destroys the gem body, removes it from the spawner, and awards fuel + score.
   * Requirements: 5.2
   *
   * @param {string} gemId
   */
  _onBallGemContact(gemId) {
    const gemHandle = this._gemSpawner.getActiveGems().find((g) => g.id === gemId);
    if (gemHandle) {
      this._physicsEngine.destroyBody(gemHandle);
    }
    this._gemSpawner.removeGem(gemId);
    this._fuelManager.add(GEM_FUEL_VALUE);
    this._scoreManager.onGemCollected();
  }

  /**
   * Handle ball–platform contact.
   * Physics handles the bounce; this hook is reserved for future audio/visual feedback.
   * Requirements: (no-op for now)
   *
   * @param {string} _platformId
   * @param {number} _relVel
   */
  _onBallPlatformContact(_platformId, _relVel) {
    // Bounce boost is handled inside PhysicsEngine's post-solve listener.
    // Hook reserved for future audio/visual feedback.
  }

  /**
   * Handle ball falling below the viewport bottom — transition to game-over.
   * Requirements: 4.1, 4.2, 4.3, 4.4
   *
   * @param {number} _ballY - Ball's world Y at the time of the out-of-bounds event.
   */
  _onBallOutOfBounds(_ballY) {
    // Guard against double-trigger (physics may fire multiple times)
    if (!this._sessionActive) return;

    this._sessionActive = false;
    cancelAnimationFrame(this._rafHandle);
    this._rafHandle = null;

    // Compute final score
    const finalScore = this._scoreManager.computeFinalScore();

    // Update high score if beaten — persist to local cache immediately
    if (finalScore > this._scoreManager.highScore) {
      this._scoreManager.setHighScore(finalScore);
      this._dbClient.cacheHighScore(finalScore);
    }

    // Build session record and persist
    const record = {
      sessionId: uuidv4(),
      playerId: this._dbClient._playerId,
      score: finalScore,
      heightPx: this._scoreManager.currentHeight,
      gemsCollected: this._scoreManager.gemsCollected,
      startedAt: new Date(Date.now() - this._scoreManager.currentHeight).toISOString(), // approximate
      endedAt: new Date().toISOString(),
      appVersion: '1.0.0',
    };
    this._dbClient.saveSession(record);

    // Show game-over overlay
    this._renderer.showGameOver(finalScore, this._scoreManager.highScore);

    // Wire tap-to-restart: one-time touchend listener on the canvas
    const canvas = this._inputHandler._canvas;
    const onTap = () => {
      canvas.removeEventListener('touchend', onTap);
      this.restart();
    };
    canvas.addEventListener('touchend', onTap);

    // Render one final frame
    this._renderer.draw(0);
  }
}

module.exports = GameEngine;
