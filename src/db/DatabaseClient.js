'use strict';

// Use uuid v4 for player ID generation
const { v4: uuidv4 } = require('uuid');

// Storage keys
const KEY_PLAYER_ID = 'bbg_player_id';
const KEY_HIGH_SCORE = 'bbg_high_score';
const KEY_PENDING_SESSIONS = 'bbg_pending_sessions';

// Exponential back-off delays in milliseconds (max 30 000 ms)
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RETRIES = 4;

/**
 * In-memory storage fallback for Node.js environments where localStorage is
 * not available.  Implements the same subset of the Web Storage API that
 * DatabaseClient uses (getItem / setItem / removeItem).
 */
class InMemoryStorage {
  constructor() {
    this._store = new Map();
  }

  getItem(key) {
    const value = this._store.get(key);
    return value === undefined ? null : value;
  }

  setItem(key, value) {
    this._store.set(key, String(value));
  }

  removeItem(key) {
    this._store.delete(key);
  }
}

/**
 * DatabaseClient
 *
 * Handles communication with the REST backend for high-score retrieval and
 * session persistence.  When the device is offline, session records are
 * queued in storage and flushed automatically when connectivity is restored.
 *
 * @param {object} config
 * @param {string} config.baseUrl   - Base URL of the REST backend (e.g. 'http://localhost:3000')
 * @param {object} [config.storage] - Optional storage object (defaults to localStorage or in-memory fallback)
 */
class DatabaseClient {
  constructor(config) {
    this._baseUrl = config.baseUrl;
    this._storage = config.storage || this._resolveDefaultStorage();

    // Retrieve or generate a stable device-level player ID (UUID fallback)
    let playerId = this._storage.getItem(KEY_PLAYER_ID);
    if (!playerId) {
      playerId = uuidv4();
      this._storage.setItem(KEY_PLAYER_ID, playerId);
    }
    this._playerId = playerId;
    this._username = this._storage.getItem('bbg_username') || null;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._flushQueue());
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Register or retrieve a player by username.
   * Stores the returned playerId and username locally.
   * @param {string} username
   * @returns {Promise<{ playerId: string, username: string }>}
   */
  async registerPlayer(username) {
    const url = `${this._baseUrl}/api/players`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this._playerId = data.playerId;
      this._username = data.username;
      this._storage.setItem(KEY_PLAYER_ID, data.playerId);
      this._storage.setItem('bbg_username', data.username);
      return data;
    } catch (err) {
      // Offline fallback: use local UUID and store username
      this._username = username;
      this._storage.setItem('bbg_username', username);
      return { playerId: this._playerId, username };
    }
  }

  /**
   * Fetch the global leaderboard (top N scores across all players).
   * @param {number} [limit=10]
   * @returns {Promise<Array<{ username: string, score: number, heightPx: number }>>}
   */
  async fetchLeaderboard(limit = 10) {
    const url = `${this._baseUrl}/api/leaderboard?limit=${limit}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.leaderboard || [];
    } catch (_err) {
      return [];
    }
  }

  /**
   * Persist a high score to local storage immediately.
   * Called by GameEngine when the player beats their previous best,
   * so the cached value survives page reloads even when the backend is offline.
   * @param {number} score
   */
  cacheHighScore(score) {
    const current = this._getCachedHighScore();
    if (score > current) {
      this._storage.setItem(KEY_HIGH_SCORE, String(score));
    }
  }

  /**
   * Fetch the player's all-time high score from the backend.
   *
   * On success the score is cached in storage and returned.
   * On failure the cached value (or 0) is returned and a background retry is
   * scheduled with exponential back-off.
   *
   * @param {number} [_retryCount=0] - Internal retry counter (not part of public API)
   * @returns {Promise<number>}
   */
  async fetchHighScore(_retryCount = 0) {
    const url = `${this._baseUrl}/api/highscore?playerId=${encodeURIComponent(this._playerId)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const score = typeof data.score === 'number' ? data.score : 0;

      // Cache the latest score locally
      this._storage.setItem(KEY_HIGH_SCORE, String(score));
      return score;
    } catch (_err) {
      // Return the cached value while scheduling a background retry
      const cached = this._getCachedHighScore();
      this._scheduleHighScoreRetry(_retryCount);
      return cached;
    }
  }

  /**
   * Persist a session record to the backend.
   *
   * On failure the record is pushed onto the offline queue in storage so it
   * can be retried later.  This method always resolves — it never rejects —
   * so the game-over screen is never blocked.
   *
   * @param {object} record - SessionRecord object
   * @returns {Promise<void>}
   */
  async saveSession(record) {
    const url = `${this._baseUrl}/api/sessions`;
    // Always attach the current username to the record
    const enriched = Object.assign({}, record, { username: this._username || 'Anonymous' });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enriched),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (_err) {
      const queue = this._getQueue();
      queue.push({
        record: enriched,
        enqueuedAt: new Date().toISOString(),
        retryCount: 0,
      });
      this._saveQueue(queue);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Drain the offline queue, attempting to POST each pending session record.
   * Successfully sent records are removed immediately; failed records remain
   * in the queue for the next retry.
   *
   * @returns {Promise<void>}
   */
  async _flushQueue() {
    const queue = this._getQueue();
    if (queue.length === 0) return;

    const url = `${this._baseUrl}/api/sessions`;
    const remaining = [];

    for (const entry of queue) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry.record),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        // Successfully sent — do NOT add to remaining
      } catch (_err) {
        // Keep in queue for next attempt
        remaining.push(entry);
      }
    }

    this._saveQueue(remaining);
  }

  /**
   * Returns the storage object in use (localStorage or in-memory fallback).
   *
   * @returns {object}
   */
  _getStorage() {
    return this._storage;
  }

  /**
   * Reads and parses the pending-sessions queue from storage.
   *
   * @returns {Array<object>}
   */
  _getQueue() {
    const raw = this._storage.getItem(KEY_PENDING_SESSIONS);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  /**
   * Serialises and writes the pending-sessions queue to storage.
   *
   * @param {Array<object>} queue
   */
  _saveQueue(queue) {
    this._storage.setItem(KEY_PENDING_SESSIONS, JSON.stringify(queue));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the default storage: use localStorage when available (browser /
   * Cordova WebView), otherwise fall back to an in-memory Map (Node.js tests).
   *
   * @returns {object}
   */
  _resolveDefaultStorage() {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      return localStorage;
    }
    return new InMemoryStorage();
  }

  /**
   * Read the cached high score from storage, defaulting to 0.
   *
   * @returns {number}
   */
  _getCachedHighScore() {
    const raw = this._storage.getItem(KEY_HIGH_SCORE);
    if (raw === null || raw === undefined) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Schedule a background retry of `fetchHighScore` using exponential back-off.
   * Stops after MAX_RETRIES attempts.
   *
   * @param {number} retryCount - Number of retries already attempted
   */
  _scheduleHighScoreRetry(retryCount) {
    if (retryCount >= MAX_RETRIES) return;

    const delayIndex = Math.min(retryCount, BACKOFF_DELAYS.length - 1);
    const delay = BACKOFF_DELAYS[delayIndex];

    setTimeout(() => {
      this.fetchHighScore(retryCount + 1).catch(() => {
        // Errors are handled inside fetchHighScore; swallow here to avoid
        // unhandled-rejection warnings.
      });
    }, delay);
  }
}

module.exports = DatabaseClient;
