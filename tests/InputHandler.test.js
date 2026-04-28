'use strict';

const InputHandler = require('../src/input/InputHandler');
const { MIN_PLATFORM_PX, MAX_PLATFORM_PX } = require('../src/config/constants');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal canvas mock suitable for InputHandler. */
function makeCanvas() {
  return {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
}

/** Build a minimal fuelManager mock with the given fuel level. */
function makeFuelManager(fuel = 100) {
  return { currentFuel: fuel };
}

/**
 * Build a synthetic TouchEvent-like object with a single changedTouch.
 * @param {number} clientX
 * @param {number} clientY
 */
function makeTouchEvent(clientX, clientY) {
  return {
    changedTouches: [{ clientX, clientY }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InputHandler', () => {
  let canvas;
  let fuelManager;
  let handler;

  beforeEach(() => {
    canvas = makeCanvas();
    fuelManager = makeFuelManager(100);
    handler = new InputHandler(canvas, fuelManager);
  });

  // -------------------------------------------------------------------------
  // Platform length clamping — too short
  // -------------------------------------------------------------------------

  describe('platform length clamping', () => {
    it('clamps gesture shorter than MIN_PLATFORM_PX to MIN_PLATFORM_PX', () => {
      const events = [];
      handler.on('platformRequest', (data) => events.push(data));

      // Gesture of 10 px (well below MIN_PLATFORM_PX = 50)
      handler._handleTouchStart(makeTouchEvent(100, 100));
      handler._handleTouchEnd(makeTouchEvent(110, 100)); // dx=10, dy=0 → length=10

      expect(events).toHaveLength(1);
      const { start, end } = events[0];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      expect(length).toBeCloseTo(MIN_PLATFORM_PX);
    });

    it('clamps gesture longer than MAX_PLATFORM_PX to MAX_PLATFORM_PX', () => {
      const events = [];
      handler.on('platformRequest', (data) => events.push(data));

      // Gesture of 600 px (above MAX_PLATFORM_PX = 400)
      handler._handleTouchStart(makeTouchEvent(0, 100));
      handler._handleTouchEnd(makeTouchEvent(600, 100)); // dx=600, dy=0 → length=600

      expect(events).toHaveLength(1);
      const { start, end } = events[0];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      expect(length).toBeCloseTo(MAX_PLATFORM_PX);
    });

    it('does not clamp a gesture within [MIN_PLATFORM_PX, MAX_PLATFORM_PX]', () => {
      const events = [];
      handler.on('platformRequest', (data) => events.push(data));

      const rawLength = 200; // within bounds
      handler._handleTouchStart(makeTouchEvent(0, 100));
      handler._handleTouchEnd(makeTouchEvent(rawLength, 100));

      expect(events).toHaveLength(1);
      const { start, end } = events[0];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      expect(length).toBeCloseTo(rawLength);
    });
  });

  // -------------------------------------------------------------------------
  // Coordinate translation — viewport offset
  // -------------------------------------------------------------------------

  describe('coordinate translation', () => {
    it('adds the viewport offset to the y coordinate', () => {
      const events = [];
      handler.on('platformRequest', (data) => events.push(data));

      const offset = 300;
      handler.setViewportOffset(offset);

      // Touch at screen (100, 50) → world y = 50 + 300 = 350
      handler._handleTouchStart(makeTouchEvent(100, 50));
      // End far enough away to avoid clamping (200 px horizontal)
      handler._handleTouchEnd(makeTouchEvent(300, 50));

      expect(events).toHaveLength(1);
      expect(events[0].start.y).toBeCloseTo(50 + offset);
      expect(events[0].end.y).toBeCloseTo(50 + offset);
    });

    it('uses y=0 offset when no viewport offset is set', () => {
      const events = [];
      handler.on('platformRequest', (data) => events.push(data));

      handler._handleTouchStart(makeTouchEvent(0, 80));
      handler._handleTouchEnd(makeTouchEvent(200, 80));

      expect(events).toHaveLength(1);
      expect(events[0].start.y).toBeCloseTo(80);
    });
  });

  // -------------------------------------------------------------------------
  // Zero-fuel rejection
  // -------------------------------------------------------------------------

  describe('zero-fuel rejection', () => {
    it('does not emit platformRequest when fuel is 0', () => {
      fuelManager.currentFuel = 0;
      const events = [];
      handler.on('platformRequest', (data) => events.push(data));

      handler._handleTouchStart(makeTouchEvent(0, 100));
      handler._handleTouchEnd(makeTouchEvent(200, 100));

      expect(events).toHaveLength(0);
    });

    it('emits platformRequest when fuel is greater than 0', () => {
      fuelManager.currentFuel = 1;
      const events = [];
      handler.on('platformRequest', (data) => events.push(data));

      handler._handleTouchStart(makeTouchEvent(0, 100));
      handler._handleTouchEnd(makeTouchEvent(200, 100));

      expect(events).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Zero-length gesture guard
  // -------------------------------------------------------------------------

  describe('zero-length gesture guard', () => {
    it('discards a gesture where start equals end (zero length)', () => {
      const events = [];
      handler.on('platformRequest', (data) => events.push(data));

      handler._handleTouchStart(makeTouchEvent(100, 100));
      handler._handleTouchEnd(makeTouchEvent(100, 100)); // same point → length = 0

      expect(events).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Preview update during drag
  // -------------------------------------------------------------------------

  describe('previewUpdate event', () => {
    it('emits previewUpdate during touchmove', () => {
      const previews = [];
      handler.on('previewUpdate', (data) => previews.push(data));

      handler._handleTouchStart(makeTouchEvent(0, 0));
      handler._handleTouchMove(makeTouchEvent(100, 0));

      expect(previews).toHaveLength(1);
      expect(previews[0].start).toBeDefined();
      expect(previews[0].end).toBeDefined();
    });

    it('does not emit previewUpdate if touchmove fires before touchstart', () => {
      const previews = [];
      handler.on('previewUpdate', (data) => previews.push(data));

      handler._handleTouchMove(makeTouchEvent(100, 0));

      expect(previews).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // enable / disable
  // -------------------------------------------------------------------------

  describe('enable / disable', () => {
    it('calls addEventListener three times on enable', () => {
      handler.enable();
      expect(canvas.addEventListener).toHaveBeenCalledTimes(3);
    });

    it('calls removeEventListener three times on disable', () => {
      handler.disable();
      expect(canvas.removeEventListener).toHaveBeenCalledTimes(3);
    });
  });
});
