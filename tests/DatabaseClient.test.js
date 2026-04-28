'use strict';

const DatabaseClient = require('../src/db/DatabaseClient');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a simple in-memory storage mock that mirrors the Web Storage API
 * subset used by DatabaseClient (getItem / setItem / removeItem).
 */
function makeStorage() {
  return {
    store: {},
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this.store, k)
        ? this.store[k]
        : null;
    },
    setItem(k, v) {
      this.store[k] = v;
    },
    removeItem(k) {
      delete this.store[k];
    },
  };
}

/**
 * Build a DatabaseClient wired to the provided storage mock.
 * Uses a fixed baseUrl so tests don't need a real server.
 */
function makeClient(storage) {
  return new DatabaseClient({
    baseUrl: 'http://localhost:3000',
    storage,
  });
}

/**
 * Build a minimal session record for use in tests.
 */
function makeRecord(overrides = {}) {
  return {
    sessionId: 'test-session-id',
    playerId: 'test-player-id',
    score: 1234,
    heightPx: 500,
    gemsCollected: 3,
    startedAt: '2024-01-01T00:00:00.000Z',
    endedAt: '2024-01-01T00:01:00.000Z',
    appVersion: '1.0.0',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DatabaseClient', () => {
  let storage;
  let client;

  beforeEach(() => {
    storage = makeStorage();
    client = makeClient(storage);
    // Reset any global fetch mock between tests
    global.fetch = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // fetchHighScore — successful fetch
  // -------------------------------------------------------------------------

  describe('fetchHighScore', () => {
    it('returns the score from a successful fetch response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ score: 9876 }),
      });

      const score = await client.fetchHighScore();
      expect(score).toBe(9876);
    });

    it('caches the fetched score in storage', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ score: 500 }),
      });

      await client.fetchHighScore();
      expect(storage.getItem('bbg_high_score')).toBe('500');
    });

    it('returns the cached value when fetch throws (offline simulation)', async () => {
      // Pre-seed the cache
      storage.setItem('bbg_high_score', '4200');

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const score = await client.fetchHighScore();
      expect(score).toBe(4200);
    });

    it('returns 0 when fetch throws and no cached value exists', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const score = await client.fetchHighScore();
      expect(score).toBe(0);
    });

    it('returns 0 when fetch returns a non-numeric score field', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ score: 'not-a-number' }),
      });

      const score = await client.fetchHighScore();
      expect(score).toBe(0);
    });

    it('falls back to cache when the server returns a non-OK status', async () => {
      storage.setItem('bbg_high_score', '777');

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const score = await client.fetchHighScore();
      expect(score).toBe(777);
    });
  });

  // -------------------------------------------------------------------------
  // saveSession — successful POST
  // -------------------------------------------------------------------------

  describe('saveSession', () => {
    it('calls fetch with the correct URL and body', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const record = makeRecord();
      await client.saveSession(record);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('http://localhost:3000/api/sessions');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
      // The client enriches the record with username — check core fields
      const sent = JSON.parse(options.body);
      expect(sent.sessionId).toBe(record.sessionId);
      expect(sent.playerId).toBe(record.playerId);
      expect(sent.score).toBe(record.score);
      expect(sent.username).toBeDefined(); // enriched by client
    });

    it('resolves without throwing even when fetch succeeds', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      await expect(client.saveSession(makeRecord())).resolves.toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // saveSession — network failure → offline queue
    // -----------------------------------------------------------------------

    it('pushes the record to bbg_pending_sessions queue on network failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const record = makeRecord();
      await client.saveSession(record);

      const raw = storage.getItem('bbg_pending_sessions');
      expect(raw).not.toBeNull();
      const queue = JSON.parse(raw);
      expect(queue).toHaveLength(1);
      // Core fields should be present (client enriches with username)
      expect(queue[0].record.sessionId).toBe(record.sessionId);
      expect(queue[0].record.score).toBe(record.score);
      expect(queue[0].record.username).toBeDefined();
    });

    it('appends to the existing queue on repeated failures', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await client.saveSession(makeRecord({ sessionId: 'a' }));
      await client.saveSession(makeRecord({ sessionId: 'b' }));

      const queue = JSON.parse(storage.getItem('bbg_pending_sessions'));
      expect(queue).toHaveLength(2);
    });

    it('resolves without throwing even when fetch fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      await expect(client.saveSession(makeRecord())).resolves.toBeUndefined();
    });

    it('does not push to the queue when the POST succeeds', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      await client.saveSession(makeRecord());

      const raw = storage.getItem('bbg_pending_sessions');
      // Either null (never written) or an empty array
      if (raw !== null) {
        expect(JSON.parse(raw)).toHaveLength(0);
      } else {
        expect(raw).toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // _flushQueue
  // -------------------------------------------------------------------------

  describe('_flushQueue', () => {
    it('removes successfully sent records from the queue', async () => {
      // Pre-populate the queue with two records
      const queue = [
        { record: makeRecord({ sessionId: 'r1' }), enqueuedAt: new Date().toISOString(), retryCount: 0 },
        { record: makeRecord({ sessionId: 'r2' }), enqueuedAt: new Date().toISOString(), retryCount: 0 },
      ];
      storage.setItem('bbg_pending_sessions', JSON.stringify(queue));

      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      await client._flushQueue();

      const remaining = JSON.parse(storage.getItem('bbg_pending_sessions'));
      expect(remaining).toHaveLength(0);
    });

    it('retains records that fail to send', async () => {
      const queue = [
        { record: makeRecord({ sessionId: 'r1' }), enqueuedAt: new Date().toISOString(), retryCount: 0 },
        { record: makeRecord({ sessionId: 'r2' }), enqueuedAt: new Date().toISOString(), retryCount: 0 },
      ];
      storage.setItem('bbg_pending_sessions', JSON.stringify(queue));

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await client._flushQueue();

      const remaining = JSON.parse(storage.getItem('bbg_pending_sessions'));
      expect(remaining).toHaveLength(2);
    });

    it('removes only the successfully sent records and retains failed ones', async () => {
      const queue = [
        { record: makeRecord({ sessionId: 'ok' }),   enqueuedAt: new Date().toISOString(), retryCount: 0 },
        { record: makeRecord({ sessionId: 'fail' }), enqueuedAt: new Date().toISOString(), retryCount: 0 },
      ];
      storage.setItem('bbg_pending_sessions', JSON.stringify(queue));

      // First call succeeds, second fails
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error('Network error'));

      await client._flushQueue();

      const remaining = JSON.parse(storage.getItem('bbg_pending_sessions'));
      expect(remaining).toHaveLength(1);
      expect(remaining[0].record.sessionId).toBe('fail');
    });

    it('is a no-op when the queue is empty', async () => {
      global.fetch = jest.fn();

      await client._flushQueue();

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // _getQueue
  // -------------------------------------------------------------------------

  describe('_getQueue', () => {
    it('returns an empty array when storage is empty', () => {
      const queue = client._getQueue();
      expect(queue).toEqual([]);
    });

    it('returns an empty array when the stored value is not valid JSON', () => {
      storage.setItem('bbg_pending_sessions', 'not-json{{{');
      const queue = client._getQueue();
      expect(queue).toEqual([]);
    });

    it('returns an empty array when the stored value is a non-array JSON value', () => {
      storage.setItem('bbg_pending_sessions', JSON.stringify({ not: 'an array' }));
      const queue = client._getQueue();
      expect(queue).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // _saveQueue / _getQueue round-trip
  // -------------------------------------------------------------------------

  describe('_saveQueue / _getQueue round-trip', () => {
    it('persists and retrieves a queue with a single entry', () => {
      const entry = { record: makeRecord(), enqueuedAt: new Date().toISOString(), retryCount: 0 };
      client._saveQueue([entry]);

      const retrieved = client._getQueue();
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].record).toEqual(entry.record);
      expect(retrieved[0].retryCount).toBe(0);
    });

    it('persists and retrieves a queue with multiple entries', () => {
      const entries = [
        { record: makeRecord({ sessionId: 'a' }), enqueuedAt: new Date().toISOString(), retryCount: 0 },
        { record: makeRecord({ sessionId: 'b' }), enqueuedAt: new Date().toISOString(), retryCount: 1 },
        { record: makeRecord({ sessionId: 'c' }), enqueuedAt: new Date().toISOString(), retryCount: 2 },
      ];
      client._saveQueue(entries);

      const retrieved = client._getQueue();
      expect(retrieved).toHaveLength(3);
      expect(retrieved.map((e) => e.record.sessionId)).toEqual(['a', 'b', 'c']);
    });

    it('overwrites the previous queue on a second _saveQueue call', () => {
      client._saveQueue([{ record: makeRecord({ sessionId: 'old' }), enqueuedAt: '', retryCount: 0 }]);
      client._saveQueue([{ record: makeRecord({ sessionId: 'new' }), enqueuedAt: '', retryCount: 0 }]);

      const retrieved = client._getQueue();
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].record.sessionId).toBe('new');
    });

    it('round-trips an empty queue correctly', () => {
      client._saveQueue([]);
      expect(client._getQueue()).toEqual([]);
    });
  });
});
