/**
 * Shared constants used across all game subsystems.
 * Import individual named exports as needed.
 */

/** Fixed physics timestep in seconds (1/60 s) */
const FIXED_STEP = 1 / 60;

/** Maximum allowed delta time per frame in seconds (1/30 s — caps at 2 sub-steps) */
const MAX_DELTA = 1 / 30;

/**
 * Pixels per metre — converts physics world metres to canvas pixels.
 * All positions/sizes passed to PhysicsEngine are in pixels; it divides by PPM
 * before creating planck bodies, and multiplies by PPM when reading positions back.
 */
const PPM = 60;

/** Gravitational acceleration in m/s² */
const GRAVITY = 6;

/** Minimum upward speed (m/s) applied on every platform bounce */
const MIN_BOUNCE_SPEED = 8;

/** Maximum allowed ball speed in m/s */
const MAX_BALL_SPEED = 20;

/** Minimum platform length in pixels */
const MIN_PLATFORM_PX = 50;

/** Maximum platform length in pixels */
const MAX_PLATFORM_PX = 400;

/** Fuel units deducted per platform drawn (base cost for minimum-length line) */
const PLATFORM_FUEL_COST = 5;

/** Maximum fuel reserve cap */
const MAX_FUEL = 500;

/** Fuel units restored when the ball collects a gem */
const GEM_FUEL_VALUE = 30;

/** Fuel effect per gem type */
const GEM_TYPES = {
  red:    { fuel: -10, label: 'RED',   color: '#ff3333' },
  yellow: { fuel: +10, label: 'YELLOW', color: '#ffd700' },
  green:  { fuel: +25, label: 'GREEN',  color: '#44ee44' },
  blue:   { fuel:   0, label: 'BLUE',   color: '#44aaff' }, // speed boost, no fuel change
};

/** Blue gem speed boost multiplier and duration */
const SPEED_BOOST_MULTIPLIER = 2;
const SPEED_BOOST_DURATION_MS = 5000;

/** Fuel reserve at the start of each session */
const STARTING_FUEL = 100;

/** Score multiplier applied to height gained (pixels) */
const HEIGHT_WEIGHT = 1;

/** Score multiplier applied per gem collected */
const GEM_WEIGHT = 50;

/** Ball radius in pixels */
const BALL_RADIUS = 15;

/** Gem radius in pixels */
const GEM_RADIUS = 12;

/** Platform lifetime in milliseconds */
const PLATFORM_LIFETIME_MS = 4000;

/** Coefficient of restitution for ball bounces [0, 1] */
const BOUNCE_RESTITUTION = 0.85;

/** Height interval in pixels at which gems are spawned */
const GEM_SPAWN_MILESTONE_PX = 400; // doubled from 200 to halve spawn frequency

module.exports = {
  FIXED_STEP,
  MAX_DELTA,
  PPM,
  GRAVITY,
  MAX_BALL_SPEED,
  MIN_BOUNCE_SPEED,
  MIN_PLATFORM_PX,
  MAX_PLATFORM_PX,
  PLATFORM_FUEL_COST,
  MAX_FUEL,
  GEM_FUEL_VALUE,
  GEM_TYPES,
  SPEED_BOOST_MULTIPLIER,
  SPEED_BOOST_DURATION_MS,
  STARTING_FUEL,
  HEIGHT_WEIGHT,
  GEM_WEIGHT,
  BALL_RADIUS,
  GEM_RADIUS,
  PLATFORM_LIFETIME_MS,
  BOUNCE_RESTITUTION,
  GEM_SPAWN_MILESTONE_PX
};
