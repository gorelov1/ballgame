/**
 * FuelManager — tracks the player's fuel reserve.
 *
 * Fuel is spent when drawing platforms and replenished by collecting gems.
 * The reserve is capped at maxFuel and cannot go below zero.
 */
class FuelManager {
  /**
   * @param {number} startingFuel - Initial fuel value for each session.
   * @param {number} maxFuel - Maximum fuel the reserve can hold.
   */
  constructor(startingFuel, maxFuel) {
    this._startingFuel = startingFuel;
    this._maxFuel = maxFuel;
    this._currentFuel = startingFuel;
  }

  /**
   * Current fuel level (read-only).
   * @returns {number}
   */
  get currentFuel() {
    return this._currentFuel;
  }

  /**
   * Maximum fuel capacity (read-only).
   * @returns {number}
   */
  get maxFuel() {
    return this._maxFuel;
  }

  /**
   * Attempt to deduct `amount` from the fuel reserve.
   *
   * Returns `false` and leaves fuel unchanged if the current reserve is less
   * than `amount`. Otherwise subtracts `amount` and returns `true`.
   *
   * @param {number} amount - Fuel units to deduct.
   * @returns {boolean} `true` if the deduction succeeded, `false` otherwise.
   */
  deduct(amount) {
    if (this._currentFuel < amount) {
      return false;
    }
    this._currentFuel -= amount;
    return true;
  }

  /**
   * Add `amount` fuel to the reserve, capped at `maxFuel`.
   *
   * @param {number} amount - Fuel units to add.
   */
  add(amount) {
    this._currentFuel = Math.min(this._currentFuel + amount, this._maxFuel);
  }

  /**
   * Restore the fuel reserve to the starting value.
   * Called at the beginning of each new session.
   */
  reset() {
    this._currentFuel = this._startingFuel;
  }
}

module.exports = FuelManager;
