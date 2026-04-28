'use strict';

const GemSpawner = require('../src/gems/GemSpawner');
const { GEM_RADIUS } = require('../src/config/constants');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePhysicsEngine() {
  return {
    createGem: jest.fn().mockImplementation((pos, r) => ({
      id: 'gem-' + Math.random().toString(36).slice(2),
      body: {},
      type: 'gem',
      position: pos,
    })),
  };
}

function makeConfig(viewportWidth = 400) {
  return { viewportWidth };
}

// Shared test values for the new signature
const BALL_WORLD_Y = 300;  // ball is at y=300 in world (y-down)
const CANVAS_HEIGHT = 600;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GemSpawner', () => {
  let physicsEngine;
  let config;
  let spawner;

  beforeEach(() => {
    physicsEngine = makePhysicsEngine();
    config = makeConfig(400);
    spawner = new GemSpawner(config, physicsEngine);
  });

  // -------------------------------------------------------------------------
  // _generateGemPositions
  // -------------------------------------------------------------------------

  describe('_generateGemPositions', () => {
    it('returns exactly count positions', () => {
      const positions = spawner._generateGemPositions(3, 400, BALL_WORLD_Y, CANVAS_HEIGHT);
      expect(positions).toHaveLength(3);
    });

    it('returns 1 position when count is 1', () => {
      const positions = spawner._generateGemPositions(1, 400, BALL_WORLD_Y, CANVAS_HEIGHT);
      expect(positions).toHaveLength(1);
    });

    it('returns 0 positions when count is 0', () => {
      const positions = spawner._generateGemPositions(0, 400, BALL_WORLD_Y, CANVAS_HEIGHT);
      expect(positions).toHaveLength(0);
    });

    it('all x positions are within [GEM_RADIUS, viewportWidth - GEM_RADIUS]', () => {
      const viewportWidth = 400;
      const positions = spawner._generateGemPositions(50, viewportWidth, BALL_WORLD_Y, CANVAS_HEIGHT);
      for (const pos of positions) {
        expect(pos.x).toBeGreaterThanOrEqual(GEM_RADIUS);
        expect(pos.x).toBeLessThanOrEqual(viewportWidth - GEM_RADIUS);
      }
    });

    it('all y positions are above the ball (smaller y in y-down space)', () => {
      const positions = spawner._generateGemPositions(50, 400, BALL_WORLD_Y, CANVAS_HEIGHT);
      for (const pos of positions) {
        // Gems must be above the ball (lower y value in y-down)
        expect(pos.y).toBeLessThan(BALL_WORLD_Y);
      }
    });

    it('each position has numeric x and y properties', () => {
      const positions = spawner._generateGemPositions(3, 400, BALL_WORLD_Y, CANVAS_HEIGHT);
      for (const pos of positions) {
        expect(typeof pos.x).toBe('number');
        expect(typeof pos.y).toBe('number');
      }
    });
  });

  // -------------------------------------------------------------------------
  // onHeightMilestone — spawn count
  // -------------------------------------------------------------------------

  describe('onHeightMilestone', () => {
    it('spawns between 1 and 3 gems per milestone call', () => {
      const counts = new Set();
      for (let i = 0; i < 200; i++) {
        physicsEngine = makePhysicsEngine();
        spawner = new GemSpawner(config, physicsEngine);
        spawner.onHeightMilestone(200 * (i + 1), BALL_WORLD_Y, CANVAS_HEIGHT);
        const count = physicsEngine.createGem.mock.calls.length;
        expect(count).toBeGreaterThanOrEqual(1);
        expect(count).toBeLessThanOrEqual(3);
        counts.add(count);
      }
      expect(counts.has(1)).toBe(true);
      expect(counts.has(2)).toBe(true);
      expect(counts.has(3)).toBe(true);
    });

    it('stores spawned gems in the active gems map', () => {
      spawner.onHeightMilestone(200, BALL_WORLD_Y, CANVAS_HEIGHT);
      const activeGems = spawner.getActiveGems();
      expect(activeGems.length).toBeGreaterThanOrEqual(1);
      expect(activeGems.length).toBeLessThanOrEqual(3);
    });

    it('calls physicsEngine.createGem with GEM_RADIUS', () => {
      spawner.onHeightMilestone(200, BALL_WORLD_Y, CANVAS_HEIGHT);
      for (const call of physicsEngine.createGem.mock.calls) {
        expect(call[1]).toBe(GEM_RADIUS);
      }
    });
  });

  // -------------------------------------------------------------------------
  // removeGem
  // -------------------------------------------------------------------------

  describe('removeGem', () => {
    it('removes the gem from active gems by id', () => {
      spawner.onHeightMilestone(200, BALL_WORLD_Y, CANVAS_HEIGHT);
      const before = spawner.getActiveGems();
      expect(before.length).toBeGreaterThan(0);

      const gemId = before[0].id;
      spawner.removeGem(gemId);

      const after = spawner.getActiveGems();
      expect(after.find((g) => g.id === gemId)).toBeUndefined();
      expect(after.length).toBe(before.length - 1);
    });

    it('is a no-op when the gem id does not exist', () => {
      spawner.onHeightMilestone(200, BALL_WORLD_Y, CANVAS_HEIGHT);
      const before = spawner.getActiveGems().length;
      spawner.removeGem('non-existent-id');
      expect(spawner.getActiveGems().length).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  describe('reset', () => {
    it('clears all active gems', () => {
      spawner.onHeightMilestone(200, BALL_WORLD_Y, CANVAS_HEIGHT);
      spawner.onHeightMilestone(400, BALL_WORLD_Y - 200, CANVAS_HEIGHT);
      expect(spawner.getActiveGems().length).toBeGreaterThan(0);

      spawner.reset();
      expect(spawner.getActiveGems()).toHaveLength(0);
    });

    it('resets the last milestone counter so new milestones can be tracked', () => {
      spawner.onHeightMilestone(200, BALL_WORLD_Y, CANVAS_HEIGHT);
      spawner.reset();
      spawner.onHeightMilestone(200, BALL_WORLD_Y, CANVAS_HEIGHT);
      expect(spawner.getActiveGems().length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // getActiveGems
  // -------------------------------------------------------------------------

  describe('getActiveGems', () => {
    it('returns an empty array when no gems have been spawned', () => {
      expect(spawner.getActiveGems()).toEqual([]);
    });

    it('returns all spawned gems across multiple milestones', () => {
      spawner.onHeightMilestone(200, BALL_WORLD_Y, CANVAS_HEIGHT);
      const afterFirst = spawner.getActiveGems().length;
      spawner.onHeightMilestone(400, BALL_WORLD_Y - 200, CANVAS_HEIGHT);
      const afterSecond = spawner.getActiveGems().length;
      expect(afterSecond).toBeGreaterThan(afterFirst);
    });
  });
});
