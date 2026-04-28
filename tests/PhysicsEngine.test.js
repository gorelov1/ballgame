'use strict';

const PhysicsEngine = require('../src/physics/PhysicsEngine');
const { GRAVITY, BOUNCE_RESTITUTION, MAX_BALL_SPEED, FIXED_STEP, BALL_RADIUS, GEM_RADIUS, PPM } = require('../src/config/constants');

describe('PhysicsEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new PhysicsEngine(GRAVITY, {
      bounceRestitution: BOUNCE_RESTITUTION,
      maxBallSpeed: MAX_BALL_SPEED,
    });
  });

  // ---------------------------------------------------------------------------
  // createBall
  // ---------------------------------------------------------------------------

  describe('createBall', () => {
    it('returns a handle with a body and type "ball"', () => {
      const handle = engine.createBall({ x: 100, y: 200 }, BALL_RADIUS);
      expect(handle).toBeDefined();
      expect(handle.body).toBeDefined();
      expect(handle.type).toBe('ball');
      expect(handle.id).toBeDefined();
    });

    it('creates a dynamic body', () => {
      const handle = engine.createBall({ x: 100, y: 200 }, BALL_RADIUS);
      expect(handle.body.isDynamic()).toBe(true);
    });

    it('positions the ball at the given pixel coordinates (converted to metres internally)', () => {
      const handle = engine.createBall({ x: 120, y: 180 }, BALL_RADIUS);
      const pos = handle.body.getPosition();
      // planck stores in metres; pixel / PPM = metres
      expect(pos.x).toBeCloseTo(120 / PPM);
      expect(pos.y).toBeCloseTo(180 / PPM);
    });
  });

  // ---------------------------------------------------------------------------
  // createPlatform
  // ---------------------------------------------------------------------------

  describe('createPlatform', () => {
    it('returns a handle with a body and type "platform"', () => {
      const handle = engine.createPlatform({ x: 0, y: 300 }, { x: 200, y: 300 }, 4000);
      expect(handle).toBeDefined();
      expect(handle.body).toBeDefined();
      expect(handle.type).toBe('platform');
      expect(handle.id).toBeDefined();
    });

    it('creates a static body', () => {
      const handle = engine.createPlatform({ x: 0, y: 300 }, { x: 200, y: 300 }, 4000);
      expect(handle.body.isStatic()).toBe(true);
    });

    it('stores start and end world coordinates in pixels', () => {
      const start = { x: 10, y: 300 };
      const end   = { x: 210, y: 300 };
      const handle = engine.createPlatform(start, end, 4000);
      expect(handle.startWorld).toEqual(start);
      expect(handle.endWorld).toEqual(end);
    });

    it('stores the lifetime', () => {
      const handle = engine.createPlatform({ x: 0, y: 300 }, { x: 200, y: 300 }, 4000);
      expect(handle.lifetimeMs).toBe(4000);
    });

    it('creates a fixture on the body', () => {
      const handle = engine.createPlatform({ x: 0, y: 300 }, { x: 200, y: 300 }, 4000);
      const fixture = handle.body.getFixtureList();
      expect(fixture).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // createGem
  // ---------------------------------------------------------------------------

  describe('createGem', () => {
    it('returns a handle with a body and type "gem"', () => {
      const handle = engine.createGem({ x: 100, y: 300 }, GEM_RADIUS);
      expect(handle).toBeDefined();
      expect(handle.body).toBeDefined();
      expect(handle.type).toBe('gem');
      expect(handle.id).toBeDefined();
    });

    it('creates a sensor fixture', () => {
      const handle = engine.createGem({ x: 100, y: 300 }, GEM_RADIUS);
      const fixture = handle.body.getFixtureList();
      expect(fixture).not.toBeNull();
      expect(fixture.isSensor()).toBe(true);
    });

    it('stores the pixel position', () => {
      const pos = { x: 123, y: 456 };
      const handle = engine.createGem(pos, GEM_RADIUS);
      expect(handle.position).toEqual(pos);
    });
  });

  // ---------------------------------------------------------------------------
  // destroyBody
  // ---------------------------------------------------------------------------

  describe('destroyBody', () => {
    it('removes the ball body and nulls the internal ball handle', () => {
      const handle = engine.createBall({ x: 100, y: 200 }, BALL_RADIUS);
      expect(engine._ballHandle).not.toBeNull();
      engine.destroyBody(handle);
      expect(engine._ballHandle).toBeNull();
    });

    it('removes a platform body without error', () => {
      const handle = engine.createPlatform({ x: 0, y: 300 }, { x: 200, y: 300 }, 4000);
      expect(() => engine.destroyBody(handle)).not.toThrow();
    });

    it('removes a gem body without error', () => {
      const handle = engine.createGem({ x: 100, y: 300 }, GEM_RADIUS);
      expect(() => engine.destroyBody(handle)).not.toThrow();
    });

    it('is a no-op when called with null', () => {
      expect(() => engine.destroyBody(null)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Velocity clamping
  // ---------------------------------------------------------------------------

  describe('velocity clamping', () => {
    it('clamps ball speed to MAX_BALL_SPEED after a step', () => {
      const planck = require('planck-js');
      const ball = engine.createBall({ x: 200, y: 180 }, BALL_RADIUS);
      // Place a platform just below the ball so it contacts immediately
      engine.createPlatform({ x: 0, y: 200 }, { x: 400, y: 200 }, 4000);

      // Set velocity well above the cap (in m/s) — downward so it hits the platform
      ball.body.setLinearVelocity(planck.Vec2(0, MAX_BALL_SPEED * 3));

      // Step several times to ensure contact and post-solve fires
      for (let i = 0; i < 5; i++) {
        engine.step(FIXED_STEP);
      }

      const vel = ball.body.getLinearVelocity();
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      expect(speed).toBeLessThanOrEqual(MAX_BALL_SPEED + 0.01);
    });
  });

  // ---------------------------------------------------------------------------
  // Gravity (y-down coordinate system)
  // ---------------------------------------------------------------------------

  describe('gravity', () => {
    it('increases the ball y-position over time (ball falls in y-down coordinates)', () => {
      const ball = engine.createBall({ x: 200, y: 100 }, BALL_RADIUS);
      const initialY = ball.body.getPosition().y;

      for (let i = 0; i < 10; i++) {
        engine.step(FIXED_STEP);
      }

      const finalY = ball.body.getPosition().y;
      expect(finalY).toBeGreaterThan(initialY);
    });
  });

  // ---------------------------------------------------------------------------
  // getBallPositionPx
  // ---------------------------------------------------------------------------

  describe('getBallPositionPx', () => {
    it('returns pixel position matching the spawn position', () => {
      engine.createBall({ x: 120, y: 240 }, BALL_RADIUS);
      const pos = engine.getBallPositionPx();
      expect(pos.x).toBeCloseTo(120, 0);
      expect(pos.y).toBeCloseTo(240, 0);
    });

    it('returns null when no ball exists', () => {
      expect(engine.getBallPositionPx()).toBeNull();
    });
  });
});
