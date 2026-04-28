'use strict';

const FuelManager = require('../src/fuel/FuelManager');
const { STARTING_FUEL, MAX_FUEL } = require('../src/config/constants');

describe('FuelManager', () => {
  let fm;

  beforeEach(() => {
    fm = new FuelManager(STARTING_FUEL, MAX_FUEL); // 100 starting, 200 max
  });

  // --- deduct ---

  describe('deduct', () => {
    it('returns true and reduces fuel when reserve is sufficient', () => {
      const result = fm.deduct(30);
      expect(result).toBe(true);
      expect(fm.currentFuel).toBe(70);
    });

    it('returns false and leaves fuel unchanged when reserve is insufficient', () => {
      const result = fm.deduct(150); // more than 100 starting
      expect(result).toBe(false);
      expect(fm.currentFuel).toBe(100);
    });

    it('returns true and reaches zero on exact-match deduction', () => {
      const result = fm.deduct(100); // exactly equal to current fuel
      expect(result).toBe(true);
      expect(fm.currentFuel).toBe(0);
    });

    it('returns false and keeps fuel at 0 when reserve is empty (zero-fuel guard)', () => {
      fm.deduct(100); // drain to zero
      expect(fm.currentFuel).toBe(0);

      const result = fm.deduct(1);
      expect(result).toBe(false);
      expect(fm.currentFuel).toBe(0);
    });
  });

  // --- add ---

  describe('add', () => {
    it('increases fuel by the given amount', () => {
      fm.deduct(50); // bring to 50
      fm.add(20);
      expect(fm.currentFuel).toBe(70);
    });

    it('caps fuel at maxFuel when adding would exceed the cap', () => {
      fm.add(150); // 100 + 150 = 250, capped at 200
      expect(fm.currentFuel).toBe(MAX_FUEL);
    });

    it('caps fuel at maxFuel when adding exactly the remaining headroom', () => {
      fm.add(100); // 100 + 100 = 200 exactly
      expect(fm.currentFuel).toBe(MAX_FUEL);
    });
  });

  // --- reset ---

  describe('reset', () => {
    it('restores fuel to the starting value after spending some', () => {
      fm.deduct(60);
      expect(fm.currentFuel).toBe(40);

      fm.reset();
      expect(fm.currentFuel).toBe(STARTING_FUEL);
    });

    it('restores fuel to the starting value after overfilling', () => {
      fm.add(200); // fill to max
      fm.reset();
      expect(fm.currentFuel).toBe(STARTING_FUEL);
    });
  });
});
