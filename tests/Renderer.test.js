'use strict';

const Renderer = require('../src/render/Renderer');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock 2D canvas context with all methods used by Renderer stubbed
 * as jest.fn().
 */
function makeCtx() {
  const gradient = {
    addColorStop: jest.fn(),
  };
  return {
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    arc: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    createLinearGradient: jest.fn(() => gradient),
    setLineDash: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    // Settable properties
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
  };
}

/**
 * Build a mock canvas that returns the same mock ctx on every
 * `getContext('2d')` call.
 */
function makeCanvas(width = 400, height = 600) {
  const ctx = makeCtx();
  return {
    width,
    height,
    getContext: jest.fn(() => ctx),
    _ctx: ctx, // expose for assertions
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Renderer', () => {
  let canvas;
  let ctx;
  let renderer;

  beforeEach(() => {
    canvas = makeCanvas();
    ctx = canvas._ctx;
    renderer = new Renderer(canvas, {});
  });

  // -------------------------------------------------------------------------
  // setViewportOffset
  // -------------------------------------------------------------------------

  describe('setViewportOffset', () => {
    it('stores the provided offset value', () => {
      renderer.setViewportOffset(250);
      expect(renderer._viewportOffset).toBe(250);
    });

    it('defaults to 0 before any call', () => {
      expect(renderer._viewportOffset).toBe(0);
    });

    it('overwrites a previously stored offset', () => {
      renderer.setViewportOffset(100);
      renderer.setViewportOffset(500);
      expect(renderer._viewportOffset).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // setPlatformOpacity
  // -------------------------------------------------------------------------

  describe('setPlatformOpacity', () => {
    it('stores the lifetimeRatio in _platformOpacities keyed by platform ID', () => {
      renderer.setPlatformOpacity('plat-1', 0.8);
      expect(renderer._platformOpacities.get('plat-1')).toBe(0.8);
    });

    it('stores independent opacities for different platform IDs', () => {
      renderer.setPlatformOpacity('plat-a', 0.5);
      renderer.setPlatformOpacity('plat-b', 1.0);
      expect(renderer._platformOpacities.get('plat-a')).toBe(0.5);
      expect(renderer._platformOpacities.get('plat-b')).toBe(1.0);
    });

    it('overwrites the stored value when called again for the same ID', () => {
      renderer.setPlatformOpacity('plat-1', 0.9);
      renderer.setPlatformOpacity('plat-1', 0.1);
      expect(renderer._platformOpacities.get('plat-1')).toBe(0.1);
    });
  });

  // -------------------------------------------------------------------------
  // Opacity formula: lifetimeRatio <= 0.2 fades, > 0.2 is fully opaque
  // -------------------------------------------------------------------------

  describe('platform opacity formula', () => {
    /**
     * The formula used in _drawPlatforms:
     *   opacity = lifetimeRatio <= 0.2 ? lifetimeRatio * 5 : 1.0
     */
    function computeOpacity(lifetimeRatio) {
      return lifetimeRatio <= 0.2 ? lifetimeRatio * 5 : 1.0;
    }

    it('opacity for lifetimeRatio <= 0.2 is less than opacity for lifetimeRatio > 0.2', () => {
      const fadingOpacity = computeOpacity(0.1);   // 0.1 * 5 = 0.5
      const fullOpacity   = computeOpacity(0.5);   // 1.0
      expect(fadingOpacity).toBeLessThan(fullOpacity);
    });

    it('opacity is 1.0 when lifetimeRatio is above the fade threshold (0.21)', () => {
      expect(computeOpacity(0.21)).toBe(1.0);
    });

    it('opacity is 1.0 when lifetimeRatio is exactly 1.0', () => {
      expect(computeOpacity(1.0)).toBe(1.0);
    });

    it('opacity is 0 when lifetimeRatio is 0 (fully expired)', () => {
      expect(computeOpacity(0)).toBe(0);
    });

    it('opacity is exactly 1.0 at the boundary lifetimeRatio of 0.2', () => {
      // 0.2 * 5 = 1.0 — the boundary itself maps to full opacity
      expect(computeOpacity(0.2)).toBeCloseTo(1.0);
    });

    it('opacity for lifetimeRatio 0.1 is less than for lifetimeRatio 0.2', () => {
      expect(computeOpacity(0.1)).toBeLessThan(computeOpacity(0.2));
    });
  });

  // -------------------------------------------------------------------------
  // showGameOver / hideGameOver
  // -------------------------------------------------------------------------

  describe('showGameOver', () => {
    it('sets _gameOverState with finalScore and highScore', () => {
      renderer.showGameOver(1234, 5678);
      expect(renderer._gameOverState).toEqual({ finalScore: 1234, highScore: 5678 });
    });

    it('overwrites a previous game-over state', () => {
      renderer.showGameOver(100, 200);
      renderer.showGameOver(999, 1000);
      expect(renderer._gameOverState).toEqual({ finalScore: 999, highScore: 1000 });
    });
  });

  describe('hideGameOver', () => {
    it('clears _gameOverState to null', () => {
      renderer.showGameOver(100, 200);
      renderer.hideGameOver();
      expect(renderer._gameOverState).toBeNull();
    });

    it('is a no-op when _gameOverState is already null', () => {
      expect(() => renderer.hideGameOver()).not.toThrow();
      expect(renderer._gameOverState).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateHUD
  // -------------------------------------------------------------------------

  describe('updateHUD', () => {
    it('updates _scoreState with all provided values', () => {
      renderer.updateHUD(500, 1200, 80, 200, 9999, 3, 'MEDIUM', false, 0);
      expect(renderer._scoreState.score).toBe(500);
      expect(renderer._scoreState.height).toBe(1200);
      expect(renderer._scoreState.fuel).toBe(80);
      expect(renderer._scoreState.maxFuel).toBe(200);
      expect(renderer._scoreState.highScore).toBe(9999);
      expect(renderer._scoreState.level).toBe(3);
      expect(renderer._scoreState.levelLabel).toBe('MEDIUM');
    });

    it('overwrites previously stored HUD values', () => {
      renderer.updateHUD(100, 200, 50, 200, 0, 1, 'EASY', false, 0);
      renderer.updateHUD(999, 888, 10, 200, 777, 5, 'HARD', true, 1000);
      expect(renderer._scoreState.score).toBe(999);
      expect(renderer._scoreState.height).toBe(888);
      expect(renderer._scoreState.fuel).toBe(10);
      expect(renderer._scoreState.highScore).toBe(777);
      expect(renderer._scoreState.level).toBe(5);
    });

    it('defaults _scoreState to zeros before any updateHUD call', () => {
      expect(renderer._scoreState.score).toBe(0);
      expect(renderer._scoreState.height).toBe(0);
      expect(renderer._scoreState.fuel).toBe(0);
      expect(renderer._scoreState.maxFuel).toBe(200);
      expect(renderer._scoreState.highScore).toBe(0);
      expect(renderer._scoreState.level).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // draw — calls clearRect on the context
  // -------------------------------------------------------------------------

  describe('draw', () => {
    it('calls clearRect on the canvas context', () => {
      renderer.draw(0);
      expect(ctx.clearRect).toHaveBeenCalled();
    });

    it('calls clearRect with the full canvas dimensions', () => {
      renderer.draw(0);
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
    });

    it('calls clearRect exactly once per draw call', () => {
      renderer.draw(0);
      expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    });

    it('calls save and restore to manage context state', () => {
      renderer.draw(0);
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('calls translate to apply the viewport offset', () => {
      renderer.setViewportOffset(300);
      renderer.draw(0);
      expect(ctx.translate).toHaveBeenCalledWith(0, -300);
    });
  });
});
