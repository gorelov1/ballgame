/**
 * InputHandler — captures touch drag gestures on the canvas and emits
 * platform creation requests.
 *
 * Event API (browser-native EventEmitter pattern, no Node.js dependency):
 *   handler.on('platformRequest', ({ start, end }) => { ... })
 *   handler.on('previewUpdate',   ({ start, end }) => { ... })
 *
 * Requirements: 2.1, 2.6, 2.7
 */

'use strict';

const { MIN_PLATFORM_PX, MAX_PLATFORM_PX } = require('../config/constants');

class InputHandler {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ currentFuel: number }} fuelManager
   */
  constructor(canvas, fuelManager) {
    this._canvas = canvas;
    this._fuelManager = fuelManager;

    /** @type {number} World-space Y offset added to screen coordinates */
    this._viewportOffset = 0;

    /** @type {{ x: number, y: number } | null} */
    this._dragStart = null;

    /** @type {{ x: number, y: number } | null} */
    this._dragEnd = null;

    /** @type {Map<string, Function[]>} */
    this._listeners = new Map();

    // Bind handlers once so the same reference can be removed in disable()
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove  = this._handleTouchMove.bind(this);
    this._onTouchEnd   = this._handleTouchEnd.bind(this);
  }

  // ---------------------------------------------------------------------------
  // Public lifecycle
  // ---------------------------------------------------------------------------

  /** Attach touch event listeners to the canvas. */
  enable() {
    this._canvas.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this._canvas.addEventListener('touchmove',  this._onTouchMove,  { passive: true });
    this._canvas.addEventListener('touchend',   this._onTouchEnd,   { passive: true });
  }

  /** Remove touch event listeners from the canvas. */
  disable() {
    this._canvas.removeEventListener('touchstart', this._onTouchStart);
    this._canvas.removeEventListener('touchmove',  this._onTouchMove);
    this._canvas.removeEventListener('touchend',   this._onTouchEnd);
  }

  /**
   * Update the viewport Y offset used to translate screen → world coordinates.
   * @param {number} yOffset
   */
  setViewportOffset(yOffset) {
    this._viewportOffset = yOffset;
  }

  // ---------------------------------------------------------------------------
  // Read-only getters
  // ---------------------------------------------------------------------------

  /** @returns {{ x: number, y: number } | null} */
  get dragStart() {
    return this._dragStart;
  }

  /** @returns {{ x: number, y: number } | null} */
  get dragEnd() {
    return this._dragEnd;
  }

  // ---------------------------------------------------------------------------
  // EventEmitter pattern (browser-safe, no Node.js dependency)
  // ---------------------------------------------------------------------------

  /**
   * Register a listener for the given event.
   * @param {string} event
   * @param {Function} listener
   */
  on(event, listener) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(listener);
  }

  /**
   * Remove a previously registered listener.
   * @param {string} event
   * @param {Function} listener
   */
  off(event, listener) {
    if (!this._listeners.has(event)) return;
    const updated = this._listeners.get(event).filter(l => l !== listener);
    this._listeners.set(event, updated);
  }

  /**
   * Emit an event, calling all registered listeners with the provided data.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    if (!this._listeners.has(event)) return;
    for (const listener of this._listeners.get(event)) {
      listener(data);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal touch handlers
  // ---------------------------------------------------------------------------

  /**
   * Translate a Touch object's client coordinates into world space.
   * @param {Touch} touch
   * @returns {{ x: number, y: number }}
   */
  _toWorldSpace(touch) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top + this._viewportOffset,
    };
  }

  /** @param {TouchEvent} event */
  _handleTouchStart(event) {
    const touch = event.changedTouches[0];
    if (!touch) return;

    this._dragStart = this._toWorldSpace(touch);
    this._dragEnd   = null;
  }

  /** @param {TouchEvent} event */
  _handleTouchMove(event) {
    if (!this._dragStart) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    this._dragEnd = this._toWorldSpace(touch);

    // Emit a preview so the Renderer can draw the in-progress line
    this.emit('previewUpdate', {
      start: { ...this._dragStart },
      end:   { ...this._dragEnd  },
    });
  }

  /** @param {TouchEvent} event */
  _handleTouchEnd(event) {
    if (!this._dragStart) return;

    const touch = event.changedTouches[0];
    if (touch) {
      this._dragEnd = this._toWorldSpace(touch);
    }

    const start = this._dragStart;
    const rawEnd = this._dragEnd;

    // Reset drag state before any early returns
    this._dragStart = null;
    this._dragEnd   = null;

    // Guard: no end point recorded
    if (!rawEnd) return;

    // Guard: zero-length gesture (start === end)
    const dx = rawEnd.x - start.x;
    const dy = rawEnd.y - start.y;
    const rawLength = Math.sqrt(dx * dx + dy * dy);
    if (rawLength === 0) return;

    // Guard: no fuel
    if (this._fuelManager.currentFuel === 0) return;

    // Clamp the gesture length to [MIN_PLATFORM_PX, MAX_PLATFORM_PX]
    const clampedLength = Math.max(MIN_PLATFORM_PX, Math.min(MAX_PLATFORM_PX, rawLength));

    // Scale the end point along the gesture direction to match the clamped length
    const scale = clampedLength / rawLength;
    const end = {
      x: start.x + dx * scale,
      y: start.y + dy * scale,
    };

    this.emit('platformRequest', { start, end });
  }
}

module.exports = InputHandler;
