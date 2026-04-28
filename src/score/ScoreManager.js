/**
 * ScoreManager — tracks height gained and gems collected during a session,
 * computes the session score, and maintains the all-time high score.
 *
 * Score formula: currentHeight * heightWeight + gemsCollected * gemWeight
 */
class ScoreManager {
  /**
   * @param {number} heightWeight - Score multiplier applied to height gained (pixels).
   * @param {number} gemWeight - Score multiplier applied per gem collected.
   */
  constructor(heightWeight, gemWeight) {
    this._heightWeight = heightWeight;
    this._gemWeight = gemWeight;
    this._currentHeight = 0;
    this._gemsCollected = 0;
    this._highScore = 0;
  }

  /**
   * Current session score (same as computeFinalScore). Read-only.
   * @returns {number}
   */
  get currentScore() {
    return this.computeFinalScore();
  }

  /**
   * Total height gained in pixels during the current session. Read-only.
   * @returns {number}
   */
  get currentHeight() {
    return this._currentHeight;
  }

  /**
   * Number of gems collected during the current session. Read-only.
   * @returns {number}
   */
  get gemsCollected() {
    return this._gemsCollected;
  }

  /**
   * All-time high score. Read-only.
   * @returns {number}
   */
  get highScore() {
    return this._highScore;
  }

  /**
   * Set the all-time high score. Called at launch after fetching from the database.
   *
   * @param {number} score - The high score value to store.
   */
  setHighScore(score) {
    this._highScore = score;
  }

  /**
   * Accumulate height gained. Called by GameEngine as the viewport scrolls upward.
   *
   * @param {number} pixels - Number of pixels of height gained since the last call.
   */
  onHeightGained(pixels) {
    this._currentHeight += pixels;
  }

  /**
   * Increment the gems-collected counter. Called by GameEngine on ball-gem contact.
   */
  onGemCollected() {
    this._gemsCollected += 1;
  }

  /**
   * Compute and return the current session score.
   *
   * @returns {number} height * heightWeight + gemsCollected * gemWeight
   */
  computeFinalScore() {
    return this._currentHeight * this._heightWeight + this._gemsCollected * this._gemWeight;
  }

  /**
   * Reset session state (height and gems) for a new session.
   * Does NOT reset the all-time high score.
   */
  reset() {
    this._currentHeight = 0;
    this._gemsCollected = 0;
  }
}

module.exports = ScoreManager;
