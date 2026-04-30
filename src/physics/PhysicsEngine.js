'use strict';

/**
 * PhysicsEngine — wraps planck.js (Box2D port) to manage the physics simulation.
 *
 * Coordinate system: y-DOWN to match the Canvas API (origin top-left, y increases downward).
 * Gravity is a positive y value.
 *
 * Unit scaling: planck.js works in metres. All pixel values passed in from the game
 * are divided by PPM (pixels-per-metre) before being given to planck, and all
 * positions read back from planck are multiplied by PPM before being returned.
 * This keeps physics numerically stable (bodies are ~0.1–5 m, not 6–300 px).
 */

const planck = require('planck-js');
const { v4: uuidv4 } = require('uuid');
const { MAX_BALL_SPEED, BOUNCE_RESTITUTION, PPM, MIN_BOUNCE_SPEED } = require('../config/constants');

class PhysicsEngine {
  /**
   * @param {number} gravity  - Gravitational acceleration in m/s² (positive = downward).
   * @param {object} config   - Physics configuration object.
   * @param {number} config.bounceRestitution - Coefficient of restitution [0, 1].
   * @param {number} config.maxBallSpeed      - Maximum ball speed in m/s.
   */
  constructor(gravity, config) {
    this._config = config || {};
    this._maxBallSpeed = (config && config.maxBallSpeed != null) ? config.maxBallSpeed : MAX_BALL_SPEED;
    this._restitution  = (config && config.bounceRestitution != null) ? config.bounceRestitution : BOUNCE_RESTITUTION;
    this._minBounceSpeed = MIN_BOUNCE_SPEED;
    this._ppm          = PPM;

    // Flag set in begin-contact, consumed in post-solve to boost speed after reflection
    this._pendingBounceBoost = false;

    // out-of-bounds threshold in PIXELS (set by GameEngine after construction)
    this._outOfBoundsY = Infinity;

    // y-down world: positive y = downward, matching Canvas.
    this._world = planck.World({ gravity: planck.Vec2(0, gravity) });

    /** @type {{ id: string, body: object, type: 'ball' } | null} */
    this._ballHandle = null;

    // Collision callbacks — set by GameEngine after construction.
    this.onBallPlatformContact = null;
    this.onBallGemContact      = null;
    this.onBallOutOfBounds     = null;

    this._wireContactListeners();
  }

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------

  /** Convert pixels → metres for planck input */
  _toM(px) { return px / this._ppm; }

  /** Convert metres → pixels for rendering output */
  _toPx(m) { return m * this._ppm; }

  // ---------------------------------------------------------------------------
  // Body factory methods  (all positions/sizes in PIXELS)
  // ---------------------------------------------------------------------------

  /**
   * Creates a dynamic ball body.
   * @param {{ x: number, y: number }} positionPx - Canvas pixel position.
   * @param {number} radiusPx - Ball radius in pixels.
   */
  createBall(positionPx, radiusPx) {
    const id = uuidv4();
    const body = this._world.createBody({
      type: 'dynamic',
      position: planck.Vec2(this._toM(positionPx.x), this._toM(positionPx.y)),
      // Prevent the ball from sleeping so gravity always acts on it
      allowSleep: false,
    });
    body.createFixture({
      shape: planck.Circle(this._toM(radiusPx)),
      restitution: this._restitution,
      density: 1.0,
      friction: 0.0,
    });
    body.setUserData({ id, type: 'ball' });

    const handle = { id, body, type: 'ball' };
    this._ballHandle = handle;
    return handle;
  }

  /**
   * Creates a static platform body with a thin box shape.
   * Using a box (polygon) instead of an edge shape gives reliable restitution
   * in planck.js — edge shapes can silently ignore bounce in some versions.
   *
   * @param {{ x: number, y: number }} startPx - Start point in pixels.
   * @param {{ x: number, y: number }} endPx   - End point in pixels.
   * @param {number} lifetime - Platform lifetime in milliseconds.
   */
  createPlatform(startPx, endPx, lifetime) {
    const id = uuidv4();

    const x1 = this._toM(startPx.x);
    const y1 = this._toM(startPx.y);
    const x2 = this._toM(endPx.x);
    const y2 = this._toM(endPx.y);

    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const halfThickness = this._toM(4); // 4 px thick platform

    // Create a static body at the platform centre, rotated to match the drawn line
    const body = this._world.createBody({
      type: 'static',
      position: planck.Vec2(cx, cy),
      angle: angle,
    });

    // Box shape: half-width = half the platform length, half-height = thickness
    body.createFixture({
      shape: planck.Box(len / 2, halfThickness),
      restitution: 1.0,   // platform must also carry restitution for bounce to work
      friction: 0.0,
      density: 0.0,
    });
    body.setUserData({ id, type: 'platform' });

    return {
      id,
      body,
      type: 'platform',
      createdAt: Date.now(),
      lifetimeMs: lifetime,
      startWorld: startPx,
      endWorld: endPx,
    };
  }

  /**
   * Creates two tall static wall bodies on the left and right edges of the canvas.
   * The walls extend far above and below the visible area so the ball can never
   * escape horizontally regardless of how high the viewport scrolls.
   *
   * @param {number} canvasWidthPx  - Canvas width in pixels.
   * @param {number} canvasHeightPx - Canvas height in pixels (used to size wall height).
   */
  createWalls(canvasWidthPx, canvasHeightPx) {
    const wallThicknessPx = 20;
    // Make walls very tall — 500 screens worth — so they never run out
    const wallHeightPx = canvasHeightPx * 500;
    const halfH = this._toM(wallHeightPx / 2);
    const halfT = this._toM(wallThicknessPx / 2);

    // Centre the walls vertically around y=0 so they cover all scroll positions
    const wallCentreY = 0;

    // Left wall: right edge sits at x=0
    const leftBody = this._world.createBody({
      type: 'static',
      position: planck.Vec2(this._toM(-wallThicknessPx / 2), wallCentreY),
    });
    leftBody.createFixture({
      shape: planck.Box(halfT, halfH),
      restitution: 0.5,
      friction: 0.0,
    });
    leftBody.setUserData({ id: 'wall-left', type: 'wall' });

    // Right wall: left edge sits at x=canvasWidth
    const rightBody = this._world.createBody({
      type: 'static',
      position: planck.Vec2(this._toM(canvasWidthPx + wallThicknessPx / 2), wallCentreY),
    });
    rightBody.createFixture({
      shape: planck.Box(halfT, halfH),
      restitution: 0.5,
      friction: 0.0,
    });
    rightBody.setUserData({ id: 'wall-right', type: 'wall' });
  }
  createGem(positionPx, radiusPx, gemType) {
    const id = uuidv4();
    const type = gemType || 'yellow';
    const body = this._world.createBody({
      type: 'static',
      position: planck.Vec2(this._toM(positionPx.x), this._toM(positionPx.y)),
    });
    body.createFixture({
      shape: planck.Circle(this._toM(radiusPx)),
      isSensor: true,
    });
    body.setUserData({ id, type: 'gem', gemType: type });

    return { id, body, type: 'gem', gemType: type, position: positionPx };
  }

  /**
   * Removes a body from the physics world.
   * @param {{ body: object }} handle
   */
  destroyBody(handle) {
    if (handle && handle.body) {
      if (this._ballHandle && this._ballHandle.body === handle.body) {
        this._ballHandle = null;
      }
      this._world.destroyBody(handle.body);
    }
  }

  /**
   * Advances the physics simulation by dt seconds.
   * Returns the ball's current position in PIXELS (or null if no ball).
   * @param {number} dt - Time step in seconds.
   * @returns {{ x: number, y: number } | null}
   */
  step(dt) {
    this._world.step(dt, 8, 3);

    if (!this._ballHandle) return null;

    const pos = this._ballHandle.body.getPosition();
    const ballPxY = this._toPx(pos.y);

    // Out-of-bounds check (pixel space)
    if (this.onBallOutOfBounds && ballPxY > this._outOfBoundsY) {
      this.onBallOutOfBounds(ballPxY);
    }

    return { x: this._toPx(pos.x), y: ballPxY };
  }

  /**
   * Returns the ball's current position in pixels, or null.
   */
  getBallPositionPx() {
    if (!this._ballHandle) return null;
    const pos = this._ballHandle.body.getPosition();
    return { x: this._toPx(pos.x), y: this._toPx(pos.y) };
  }

  /**
   * Dynamically update gravity and bounce/speed limits.
   * Called by GameEngine each tick when the level changes.
   * @param {number} gravity      - New gravity in m/s²
   * @param {number} bounceSpeed  - New minimum bounce speed in m/s
   * @param {number} maxBallSpeed - New maximum ball speed in m/s
   */
  setPhysicsParams(gravity, bounceSpeed, maxBallSpeed) {
    this._world.setGravity(planck.Vec2(0, gravity));
    this._minBounceSpeed = bounceSpeed;
    this._maxBallSpeed   = maxBallSpeed;
  }

  /**
   * Ensure the ball has enough speed before a bounce so it always rises meaningfully.
   * Instead of forcing a direction, we boost the ball's current speed if it's
   * below the minimum — preserving the angle so angled platforms redirect correctly.
   */
  applyBounceImpulse() {
    if (!this._ballHandle) return;
    const body = this._ballHandle.body;
    const vel = body.getLinearVelocity();
    const speed = vel.length();

    // Only boost if the ball is moving too slowly to bounce high enough
    if (speed < this._minBounceSpeed) {
      const scale = this._minBounceSpeed / (speed || 1);
      body.setLinearVelocity(planck.Vec2(vel.x * scale, vel.y * scale));
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _wireContactListeners() {
    // post-solve: runs after planck has resolved the collision and updated velocities.
    // 1. Apply minimum speed boost (preserves the reflected direction).
    // 2. Clamp to max speed.
    this._world.on('post-solve', () => {
      if (!this._ballHandle) return;
      const ballBody = this._ballHandle.body;
      const vel = ballBody.getLinearVelocity();
      let speed = vel.length();

      // If this step involved a platform contact, ensure minimum bounce speed
      if (this._pendingBounceBoost) {
        this._pendingBounceBoost = false;
        if (speed < this._minBounceSpeed) {
          const scale = this._minBounceSpeed / (speed || 1);
          ballBody.setLinearVelocity(planck.Vec2(vel.x * scale, vel.y * scale));
          speed = this._minBounceSpeed;
        }
      }

      // Always clamp to max speed
      if (speed > this._maxBallSpeed) {
        const scale = this._maxBallSpeed / speed;
        ballBody.setLinearVelocity(planck.Vec2(vel.x * scale, vel.y * scale));
      }
    });

    // begin-contact: identify ball-platform and ball-gem contacts
    this._world.on('begin-contact', (contact) => {
      const fixtureA = contact.getFixtureA();
      const fixtureB = contact.getFixtureB();
      const bodyA = fixtureA.getBody();
      const bodyB = fixtureB.getBody();
      const dataA = bodyA.getUserData();
      const dataB = bodyB.getUserData();

      if (!dataA || !dataB) return;

      let otherData, otherBody;
      if (dataA.type === 'ball') {
        otherData = dataB; otherBody = bodyB;
      } else if (dataB.type === 'ball') {
        otherData = dataA; otherBody = bodyA;
      } else {
        return;
      }

      if (otherData.type === 'platform') {
        // Flag that post-solve should apply the minimum bounce boost
        this._pendingBounceBoost = true;

        if (this.onBallPlatformContact) {
          const ballVel  = this._ballHandle.body.getLinearVelocity();
          const otherVel = otherBody.getLinearVelocity();
          const relSpeed = Math.sqrt(
            Math.pow(ballVel.x - otherVel.x, 2) + Math.pow(ballVel.y - otherVel.y, 2)
          );
          this.onBallPlatformContact(otherData.id, relSpeed);
        }
      } else if (otherData.type === 'gem' && this.onBallGemContact) {
        this.onBallGemContact(otherData.id, otherData.gemType || 'yellow');
      }
    });
  }
}

module.exports = PhysicsEngine;
