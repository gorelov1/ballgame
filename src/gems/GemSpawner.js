/**
 * GemSpawner — spawns gems at randomised positions as height milestones are crossed.
 *
 * Each time the ball crosses a 200 px height milestone, GemSpawner places 1–3 gems
 * at random positions within the current viewport. Gem handles are stored internally
 * and can be removed when the ball collects them.
 */

const { GEM_RADIUS, GEM_SPAWN_MILESTONE_PX } = require('../config/constants');

class GemSpawner {
  /**
   * @param {object} config - Game configuration object.
   * @param {object} physicsEngine - PhysicsEngine instance used to create gem bodies.
   */
  constructor(config, physicsEngine) {
    this._config = config;
    this._physicsEngine = physicsEngine;
    this._lastMilestone = 0;
    /** @type {Map<string, object>} Maps gem id → GemHandle */
    this._gems = new Map();
  }

  /**
   * Called by GameEngine each time the ball's height crosses a 200 px milestone.
   *
   * Spawns 1–3 gems placed *above* the ball's current world position so they
   * appear ahead of the player as the screen scrolls up.
   *
   * @param {number} heightPx   - Total height gained so far (used for milestone tracking).
   * @param {number} ballWorldY - Ball's current world Y in pixels (y-down: smaller = higher).
   * @param {number} canvasHeight - Canvas height in pixels (used to place gems in the upcoming zone).
   */
  onHeightMilestone(heightPx, ballWorldY, canvasHeight) {
    const viewportWidth = this._config.viewportWidth || 400;
    const count = Math.floor(Math.random() * 3) + 1;
    const positions = this._generateGemPositions(count, viewportWidth, ballWorldY, canvasHeight);

    for (const position of positions) {
      try {
        const handle = this._physicsEngine.createGem(position, GEM_RADIUS);
        if (handle && handle.id != null) {
          this._gems.set(handle.id, handle);
        }
      } catch (err) {
        console.error('GemSpawner: failed to create gem', err);
      }
    }

    this._lastMilestone = heightPx;
  }

  /**
   * Generate `count` spawn positions for gems ahead of the ball (above it in y-down space).
   *
   * In y-down coordinates, "above the ball" means smaller y values.
   * Gems are placed in the zone from (ballWorldY - canvasHeight) to (ballWorldY - canvasHeight/2),
   * i.e. one screen-height above the ball, so they appear as the player scrolls up.
   *
   * @param {number} count         - Number of positions to generate.
   * @param {number} viewportWidth - Width of the viewport in pixels.
   * @param {number} ballWorldY    - Ball's current world Y in pixels.
   * @param {number} canvasHeight  - Canvas height in pixels.
   * @returns {{ x: number, y: number }[]}
   */
  _generateGemPositions(count, viewportWidth, ballWorldY, canvasHeight) {
    const positions = [];
    const xMin = GEM_RADIUS;
    const xMax = viewportWidth - GEM_RADIUS;

    // Place gems above the ball: between one full screen-height and half screen-height above it
    const yMax = ballWorldY - (canvasHeight * 0.3);
    const yMin = ballWorldY - (canvasHeight * 0.9);

    for (let i = 0; i < count; i++) {
      const x = xMin + Math.random() * (xMax - xMin);
      const y = yMin + Math.random() * Math.max(0, yMax - yMin);
      positions.push({ x, y });
    }

    return positions;
  }

  /**
   * Remove a gem handle from the active gems map.
   * Called by GameEngine when the ball collects a gem.
   *
   * @param {string} gemId - The id of the gem to remove.
   */
  removeGem(gemId) {
    this._gems.delete(gemId);
  }

  /**
   * Returns an array of all active GemHandle objects.
   *
   * @returns {object[]} Array of GemHandle references.
   */
  getActiveGems() {
    return Array.from(this._gems.values());
  }

  /**
   * Reset the spawner state for a new session.
   * Clears all active gem handles and resets the milestone counter.
   */
  reset() {
    this._gems.clear();
    this._lastMilestone = 0;
  }
}

module.exports = GemSpawner;
