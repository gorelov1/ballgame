'use strict';

const ScoreManager = require('../src/score/ScoreManager');
const { HEIGHT_WEIGHT, GEM_WEIGHT } = require('../src/config/constants');

describe('ScoreManager', () => {
  let sm;

  beforeEach(() => {
    sm = new ScoreManager(HEIGHT_WEIGHT, GEM_WEIGHT); // 1 per px, 50 per gem
  });

  // --- score formula ---

  describe('computeFinalScore / currentScore', () => {
    it('computes score correctly with known height and gem values', () => {
      sm.onHeightGained(500);
      sm.onGemCollected();
      sm.onGemCollected();
      // 500 * 1 + 2 * 50 = 600
      expect(sm.computeFinalScore()).toBe(600);
      expect(sm.currentScore).toBe(600);
    });

    it('returns 0 when no height or gems have been accumulated', () => {
      expect(sm.computeFinalScore()).toBe(0);
    });
  });

  // --- onHeightGained ---

  describe('onHeightGained', () => {
    it('accumulates height correctly across multiple calls', () => {
      sm.onHeightGained(100);
      sm.onHeightGained(250);
      sm.onHeightGained(50);
      expect(sm.currentHeight).toBe(400);
      // score: 400 * 1 + 0 * 50 = 400
      expect(sm.currentScore).toBe(400);
    });
  });

  // --- onGemCollected ---

  describe('onGemCollected', () => {
    it('increments gem count by 1 on each call', () => {
      expect(sm.gemsCollected).toBe(0);
      sm.onGemCollected();
      expect(sm.gemsCollected).toBe(1);
      sm.onGemCollected();
      expect(sm.gemsCollected).toBe(2);
    });
  });

  // --- reset ---

  describe('reset', () => {
    it('zeroes height and gems but does not touch the high score', () => {
      sm.onHeightGained(300);
      sm.onGemCollected();
      sm.setHighScore(9999);

      sm.reset();

      expect(sm.currentHeight).toBe(0);
      expect(sm.gemsCollected).toBe(0);
      expect(sm.currentScore).toBe(0);
      expect(sm.highScore).toBe(9999); // high score preserved
    });
  });

  // --- setHighScore / highScore ---

  describe('setHighScore / highScore', () => {
    it('stores and returns the value set via setHighScore', () => {
      sm.setHighScore(12345);
      expect(sm.highScore).toBe(12345);
    });

    it('overwrites a previously stored high score', () => {
      sm.setHighScore(100);
      sm.setHighScore(500);
      expect(sm.highScore).toBe(500);
    });

    it('defaults to 0 before any high score is set', () => {
      expect(sm.highScore).toBe(0);
    });
  });
});
