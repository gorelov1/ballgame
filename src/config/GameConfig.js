/**
 * Default game configuration object.
 * All constants used throughout the game are defined here.
 */
const GameConfig = {
  /** Gravitational acceleration in pixels/s² */
  gravity: 980,

  /** Maximum allowed ball speed in pixels/s */
  maxBallSpeed: 1800,

  /** Coefficient of restitution for ball bounces [0, 1] */
  bounceRestitution: 0.85,

  /** How long a platform persists in milliseconds */
  platformLifetimeMs: 4000,

  /** Fuel units deducted per platform drawn */
  platformFuelCost: 10,

  /** Minimum platform length in pixels */
  minPlatformPx: 50,

  /** Maximum platform length in pixels */
  maxPlatformPx: 400,

  /** Fuel reserve at the start of each session */
  startingFuel: 100,

  /** Maximum fuel reserve cap */
  maxFuel: 200,

  /** Fuel units restored when the ball collects a gem */
  gemFuelValue: 30,

  /** Score multiplier applied to height gained (pixels) */
  heightWeightScore: 1,

  /** Score multiplier applied per gem collected */
  gemWeightScore: 50,

  /** Target rendering frame rate */
  targetFps: 60,

  /** Fixed physics timestep in seconds (1/60) */
  fixedStepS: 1 / 60
};

module.exports = GameConfig;
