# Implementation Plan: Ball Bounce Game

## Overview

Implement a JavaScript-based Android mobile game using planck.js for physics, HTML5 Canvas for rendering, Apache Cordova for Android packaging, and a Node.js/Express + MongoDB Atlas backend for score persistence. The implementation follows the layered architecture defined in the design: `GameEngine` coordinates `PhysicsEngine`, `Renderer`, `InputHandler`, `ScoreManager`, `FuelManager`, `GemSpawner`, and `DatabaseClient`.

## Tasks

- [x] 1. Set up project structure, configuration, and tooling
  - Initialise a Cordova project targeting Android API 26+
  - Create the `src/` directory layout: `engine/`, `physics/`, `render/`, `input/`, `score/`, `fuel/`, `gems/`, `db/`, `config/`
  - Add `package.json` with dependencies: `planck-js`, `jest`, `fast-check`, `uuid`
  - Create `src/config/GameConfig.js` exporting the default `GameConfig` object with all constants (`gravity`, `maxBallSpeed`, `bounceRestitution`, `platformLifetimeMs`, `platformFuelCost`, `minPlatformPx`, `maxPlatformPx`, `startingFuel`, `maxFuel`, `gemFuelValue`, `heightWeightScore`, `gemWeightScore`, `targetFps`, `fixedStepS`)
  - Create `src/config/constants.js` for `FIXED_STEP`, `MAX_DELTA`, `MAX_BALL_SPEED`, `MIN_PLATFORM_PX`, `MAX_PLATFORM_PX`, `PLATFORM_FUEL_COST`, `MAX_FUEL`, `GEM_FUEL_VALUE`
  - Set up Jest config (`jest.config.js`) and a `tests/` directory
  - _Requirements: 6.1, 9.1, 9.5_

- [ ] 2. Implement `FuelManager`
  - [x] 2.1 Create `src/fuel/FuelManager.js`
    - Implement `constructor(startingFuel, maxFuel)`
    - Implement `deduct(amount)` — returns `false` and leaves fuel unchanged if `currentFuel < amount`; otherwise subtracts and returns `true`
    - Implement `add(amount)` — adds fuel capped at `maxFuel`
    - Implement `reset()` — restores to `startingFuel`
    - Expose `currentFuel` and `maxFuel` as read-only getters
    - _Requirements: 2.3, 2.6, 5.2, 5.3, 5.6_

  - [ ]* 2.2 Write unit tests for `FuelManager`
    - Test `deduct` with sufficient fuel, insufficient fuel, and exact-match fuel
    - Test `add` capping at `maxFuel`
    - Test `reset` restores starting value
    - Test zero-fuel guard: `deduct` on empty reserve returns `false` and fuel stays 0
    - _Requirements: 2.3, 2.6, 5.3_

  - [ ]* 2.3 Write property test for `FuelManager` — Property 4: Platform creation deducts fuel
    - `// Feature: ball-bounce-game, Property 4: Platform creation deducts fuel`
    - For any `f > PLATFORM_FUEL_COST`, after `deduct(PLATFORM_FUEL_COST)` the fuel equals `f - PLATFORM_FUEL_COST`
    - **Property 4: Platform creation deducts fuel**
    - **Validates: Requirements 2.3**

  - [ ]* 2.4 Write property test for `FuelManager` — Property 5: Zero-fuel guard rejects platform creation
    - `// Feature: ball-bounce-game, Property 5: Zero-fuel guard rejects platform creation`
    - For any `amount > 0`, when `currentFuel === 0`, `deduct(amount)` returns `false` and fuel remains 0
    - **Property 5: Zero-fuel guard rejects platform creation**
    - **Validates: Requirements 2.6**

  - [ ]* 2.5 Write property test for `FuelManager` — Property 7: Gem collection increases fuel (capped at maximum)
    - `// Feature: ball-bounce-game, Property 7: Gem collection increases fuel (capped at maximum)`
    - For any `f ∈ [0, MAX_FUEL]` and `g > 0`, after `add(g)` the fuel equals `min(f + g, MAX_FUEL)`
    - **Property 7: Gem collection increases fuel (capped at maximum)**
    - **Validates: Requirements 5.2, 5.3**

- [ ] 3. Implement `ScoreManager`
  - [x] 3.1 Create `src/score/ScoreManager.js`
    - Implement `constructor(heightWeight, gemWeight)`
    - Implement `onHeightGained(pixels)` — accumulates height
    - Implement `onGemCollected()` — increments gem count
    - Implement `computeFinalScore()` — returns `currentHeight * HEIGHT_WEIGHT + gemsCollected * GEM_WEIGHT`
    - Implement `setHighScore(score)` and `reset()`
    - Expose `currentScore`, `currentHeight`, `gemsCollected`, `highScore` as read-only getters
    - _Requirements: 3.3, 7.1, 7.6_

  - [ ] 3.2 Write unit tests for `ScoreManager`
    - Test score formula with known height and gem values
    - Test `onHeightGained` accumulates correctly across multiple calls
    - Test `onGemCollected` increments count
    - Test `reset` zeroes height and gems
    - Test `setHighScore` / `highScore` getter
    - _Requirements: 7.1_

  - [ ] 3.3 Write property test for `ScoreManager` — Property 9: Score formula is correctly applied
    - `// Feature: ball-bounce-game, Property 9: Score formula is correctly applied`
    - For any `h ≥ 0` and `n ≥ 0`, `computeFinalScore()` returns exactly `h * HEIGHT_WEIGHT + n * GEM_WEIGHT`
    - **Property 9: Score formula is correctly applied**
    - **Validates: Requirements 7.1**

  - [ ]* 3.4 Write property test for `ScoreManager` — Property 10: Score is monotonically non-decreasing during a session
    - `// Feature: ball-bounce-game, Property 10: Score is monotonically non-decreasing during a session`
    - For any sequence of `onHeightGained` and `onGemCollected` events, `computeFinalScore()` never decreases between consecutive events
    - **Property 10: Score is monotonically non-decreasing during a session**
    - **Validates: Requirements 3.3, 7.1**

- [x] 4. Checkpoint — Ensure all FuelManager and ScoreManager tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement `PhysicsEngine`
  - [x] 5.1 Create `src/physics/PhysicsEngine.js`
    - Wrap planck.js `World` with configured gravity vector
    - Implement `createBall(position, radius)` — dynamic body with circle shape, configured `restitution`
    - Implement `createPlatform(start, end, lifetime)` — static body with edge shape; store as `PlatformHandle`
    - Implement `createGem(position, radius)` — sensor circle shape; store as `GemHandle`
    - Implement `destroyBody(handle)` — removes body from world
    - Implement `step(dt)` — calls `world.step(dt)`
    - Wire `post-solve` contact listener to clamp ball speed to `MAX_BALL_SPEED`
    - Wire contact callbacks: `onBallPlatformContact`, `onBallGemContact`, `onBallOutOfBounds`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4_

  - [ ]* 5.2 Write unit tests for `PhysicsEngine`
    - Test ball creation: body exists, correct radius, dynamic type
    - Test platform creation: static body, edge shape
    - Test gem creation: sensor fixture
    - Test `destroyBody` removes body from world
    - Test velocity clamping: set ball velocity above `MAX_BALL_SPEED`, call `step`, verify speed ≤ `MAX_BALL_SPEED`
    - _Requirements: 1.5, 6.1, 6.2, 6.3_

  - [ ]* 5.3 Write property test for `PhysicsEngine` — Property 1: Gravity always acts downward
    - `// Feature: ball-bounce-game, Property 1: Gravity always acts downward`
    - For any ball position and initial velocity, after `step(FIXED_STEP)` the vertical velocity component is more negative (or equal at max downward speed)
    - **Property 1: Gravity always acts downward**
    - **Validates: Requirements 1.1, 1.4**

  - [ ]* 5.4 Write property test for `PhysicsEngine` — Property 2: Bounce applies upward force proportional to incoming speed
    - `// Feature: ball-bounce-game, Property 2: Bounce applies upward force proportional to incoming speed`
    - For any downward velocity `v_in`, after collision with a horizontal platform the ball's vertical velocity is upward and within `[restitution * |v_in| * 0.9, restitution * |v_in| * 1.1]`
    - **Property 2: Bounce applies upward force proportional to incoming speed**
    - **Validates: Requirements 1.2**

  - [ ]* 5.5 Write property test for `PhysicsEngine` — Property 3: Ball speed is always clamped
    - `// Feature: ball-bounce-game, Property 3: Ball speed is always clamped`
    - For any sequence of physics steps, the magnitude of the ball's velocity vector never exceeds `MAX_BALL_SPEED`
    - **Property 3: Ball speed is always clamped**
    - **Validates: Requirements 1.5**

  - [ ]* 5.6 Write property test for `PhysicsEngine` — Property 15: Collision detection fires for all overlapping bodies
    - `// Feature: ball-bounce-game, Property 15: Collision detection fires for all overlapping bodies`
    - For any ball position that geometrically overlaps an active platform or gem body, `step(FIXED_STEP)` fires the corresponding contact callback before the step returns
    - **Property 15: Collision detection fires for all overlapping bodies**
    - **Validates: Requirements 6.2, 6.3**

- [ ] 6. Implement `InputHandler`
  - [x] 6.1 Create `src/input/InputHandler.js`
    - Listen for `touchstart`, `touchmove`, `touchend` events on the canvas
    - On `touchend`, compute raw gesture length; clamp to `[MIN_PLATFORM_PX, MAX_PLATFORM_PX]`
    - Translate touch coordinates from screen space to world space by adding current viewport offset
    - Silently drop gesture if `fuelManager.currentFuel === 0`
    - Discard gestures where `start === end` (zero-length guard)
    - Emit `platformRequest` event with `{ start: Vec2, end: Vec2 }` on valid gestures
    - Implement `enable()` and `disable()` to attach/detach listeners
    - _Requirements: 2.1, 2.6, 2.7_

  - [ ]* 6.2 Write unit tests for `InputHandler`
    - Test platform length clamping: gesture shorter than `MIN_PLATFORM_PX` → clamped to min
    - Test platform length clamping: gesture longer than `MAX_PLATFORM_PX` → clamped to max
    - Test coordinate translation adds viewport offset correctly
    - Test zero-fuel rejection: no `platformRequest` event emitted when fuel is 0
    - Test zero-length gesture is discarded
    - _Requirements: 2.1, 2.6, 2.7_

  - [ ]* 6.3 Write property test for `InputHandler` — Property 6: Platform length clamping
    - `// Feature: ball-bounce-game, Property 6: Platform length clamping`
    - For any raw gesture length outside `[MIN_PLATFORM_PX, MAX_PLATFORM_PX]`, the resulting platform length equals the nearest boundary value
    - **Property 6: Platform length clamping**
    - **Validates: Requirements 2.7**

- [ ] 7. Implement `GemSpawner`
  - [x] 7.1 Create `src/gems/GemSpawner.js`
    - Implement `constructor(config, physicsEngine)`
    - Implement `onHeightMilestone(heightPx)` — called each time height crosses a 200 px milestone; spawns 1–3 gems
    - Implement `_generateGemPositions(count, viewportWidth)` — returns `count` positions within `[0, viewportWidth]` horizontally
    - Call `physicsEngine.createGem` for each spawned gem; store `GemHandle` references
    - _Requirements: 5.1_

  - [ ]* 7.2 Write unit tests for `GemSpawner`
    - Test `_generateGemPositions` returns exactly `count` positions
    - Test all positions are within `[0, viewportWidth]`
    - Test `onHeightMilestone` spawns between 1 and 3 gems
    - _Requirements: 5.1_

  - [ ]* 7.3 Write property test for `GemSpawner` — Property 8: Gem spawn count is always within bounds
    - `// Feature: ball-bounce-game, Property 8: Gem spawn count is always within bounds`
    - For any height milestone crossing, the number of gems spawned is in `[1, 3]` and all positions lie within the viewport's horizontal bounds
    - **Property 8: Gem spawn count is always within bounds**
    - **Validates: Requirements 5.1**

- [x] 8. Checkpoint — Ensure all PhysicsEngine, InputHandler, and GemSpawner tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement `Renderer`
  - [x] 9.1 Create `src/render/Renderer.js`
    - Implement `constructor(canvas, config)`
    - Implement `draw(alpha)` — clears canvas, applies `ctx.translate(0, -viewportOffset)`, draws ball (filled circle, 15 px radius), platforms (lines with opacity), gems, background, then resets transform and draws HUD overlay
    - Implement `setViewportOffset(yOffset)` — updates the stored offset
    - Implement `setPlatformOpacity(platformId, lifetimeRatio)` — stores opacity per platform; applies fading when `lifetimeRatio ≤ 0.2`
    - Draw platform preview line during active drag gesture (before `touchend`)
    - Draw HUD: current score, height, fuel level (numeric + progress bar), low-fuel warning when fuel is 0
    - _Requirements: 2.4, 3.2, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 9.2 Write unit tests for `Renderer`
    - Test `setViewportOffset` stores the value correctly
    - Test `setPlatformOpacity` stores opacity per platform ID
    - Test that opacity for `lifetimeRatio ≤ 0.2` is less than opacity for `lifetimeRatio > 0.2`
    - Mock canvas context and verify `draw` calls `clearRect` and `translate`
    - _Requirements: 8.4_

  - [ ]* 9.3 Write property test for `Renderer` — Property 14: Platform fade opacity decreases with remaining lifetime
    - `// Feature: ball-bounce-game, Property 14: Platform fade opacity decreases with remaining lifetime`
    - For any `r ∈ [0, 0.2]`, the opacity used to render the platform is strictly less than the opacity used when `r > 0.2`
    - **Property 14: Platform fade opacity decreases with remaining lifetime**
    - **Validates: Requirements 8.4**

- [ ] 10. Implement `DatabaseClient` and backend API
  - [x] 10.1 Create `src/db/DatabaseClient.js`
    - Implement `constructor(config)` with `baseUrl`, `playerId` (UUID from `localStorage` or newly generated)
    - Implement `fetchHighScore()` — `GET /api/highscore?playerId=...`; on network error, read `bbg_high_score` from `localStorage` and schedule exponential back-off retry (1 s, 2 s, 4 s, max 30 s)
    - Implement `saveSession(record)` — `POST /api/sessions`; on failure, push to `bbg_pending_sessions` queue in `localStorage` and resolve without rejecting
    - Implement `_flushQueue()` — drain `bbg_pending_sessions`; remove each successfully sent record individually; leave failed records for next retry
    - Wire `window` `online` event to call `_flushQueue()`
    - _Requirements: 4.3, 7.2, 7.3, 7.4, 7.5_

  - [x] 10.2 Create the Node.js/Express backend (`backend/server.js`)
    - `GET /api/highscore?playerId=...` — queries MongoDB `sessions` collection using `{ playerId: 1, score: -1 }` index, returns top score
    - `POST /api/sessions` — validates and inserts a `SessionRecord` document into `sessions` collection
    - Connect to MongoDB Atlas using connection string from environment variable `MONGODB_URI`
    - _Requirements: 7.2, 7.3_

  - [ ]* 10.3 Write unit tests for `DatabaseClient`
    - Test `fetchHighScore` returns cached value when `fetch` throws (offline simulation)
    - Test `saveSession` pushes to `bbg_pending_sessions` queue on network failure
    - Test `_flushQueue` removes successfully sent records and retains failed ones
    - Mock `fetch` and `localStorage` for all tests
    - _Requirements: 7.4, 7.5_

  - [ ]* 10.4 Write property test for `DatabaseClient` — Property 11: Session record round-trip
    - `// Feature: ball-bounce-game, Property 11: Session record round-trip`
    - For any `SessionRecord` object, serialising to JSON and deserialising produces an object with identical field values
    - **Property 11: Session record round-trip**
    - **Validates: Requirements 7.2**

  - [ ]* 10.5 Write property test for `DatabaseClient` — Property 12: Offline queue preserves all pending records
    - `// Feature: ball-bounce-game, Property 12: Offline queue preserves all pending records`
    - For any set of `SessionRecord` objects written to the queue while offline, after `_flushQueue()` completes successfully the queue is empty and each record was submitted exactly once
    - **Property 12: Offline queue preserves all pending records**
    - **Validates: Requirements 7.5**

- [ ] 11. Implement `GameEngine` and main game loop
  - [x] 11.1 Create `src/engine/GameEngine.js`
    - Implement `constructor(config)` — instantiate all subsystems (`PhysicsEngine`, `Renderer`, `InputHandler`, `ScoreManager`, `FuelManager`, `GemSpawner`, `DatabaseClient`); wire all event callbacks
    - Implement `start()` — fetch high score, set on `ScoreManager`, begin `requestAnimationFrame` loop
    - Implement `pause()` — cancel `rAF` handle, record pause timestamp (Cordova `pause` event)
    - Implement `resume()` — reset accumulator to 0, restart `rAF` loop (Cordova `resume` event)
    - Implement `restart()` — reset all subsystem state, start new session
    - _Requirements: 4.5, 7.3, 9.1, 9.3, 9.4_

  - [x] 11.2 Implement `GameEngine._tick` with fixed-timestep accumulator
    - Accumulate `min(deltaTime, MAX_DELTA)` each frame
    - Step physics `while (accumulator >= FIXED_STEP)` with `FIXED_STEP = 1/60 s`
    - Call `renderer.draw(accumulator / FIXED_STEP)` for interpolation
    - _Requirements: 6.4, 6.5_

  - [x] 11.3 Implement `GameEngine` event handlers
    - `_onPlatformRequest(start, end)` — call `fuelManager.deduct`; if successful, call `physicsEngine.createPlatform` and schedule destruction after `platformLifetimeMs`; call `renderer.setPlatformOpacity` on each tick
    - `_onBallGemContact(gemId)` — destroy gem body, call `fuelManager.add(gemFuelValue)`, call `scoreManager.onGemCollected()`
    - `_onBallPlatformContact(platformId, relativeVelocity)` — no-op (physics handles bounce); hook for future audio/visual feedback
    - `_onBallOutOfBounds()` — transition to game-over: call `scoreManager.computeFinalScore()`, call `databaseClient.saveSession(record)`, call `renderer` to show game-over screen
    - _Requirements: 2.2, 2.3, 2.5, 4.1, 4.2, 4.3, 4.4, 5.2_

  - [x] 11.4 Implement viewport scrolling logic inside `_tick`
    - After each physics step, read ball Y position; if ball is above viewport midpoint, increase `viewportOffset`
    - Call `renderer.setViewportOffset(viewportOffset)` and `scoreManager.onHeightGained(delta)`
    - Check height milestones (every 200 px) and call `gemSpawner.onHeightMilestone(height)`
    - Never decrease `viewportOffset`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.1_

  - [ ]* 11.5 Write property test for `GameEngine` — Property 13: Viewport scrolls only upward
    - `// Feature: ball-bounce-game, Property 13: Viewport scrolls only upward`
    - For any sequence of ball position updates, `viewportOffset` is monotonically non-decreasing
    - **Property 13: Viewport scrolls only upward**
    - **Validates: Requirements 3.4**

- [x] 12. Checkpoint — Ensure all GameEngine and Renderer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Wire `index.html`, Cordova integration, and HUD
  - [x] 13.1 Create `www/index.html`
    - Include `<canvas id="gameCanvas">` sized to `window.innerWidth × window.innerHeight`
    - Load `cordova.js` and the bundled game script
    - Listen for `deviceready` event before calling `gameEngine.start()`
    - _Requirements: 9.1_

  - [x] 13.2 Add Cordova lifecycle hooks in `main.js`
    - Listen for `pause` event → call `gameEngine.pause()`
    - Listen for `resume` event → call `gameEngine.resume()`
    - Add `INTERNET` permission to `config.xml`
    - _Requirements: 9.2, 9.3, 9.4_

  - [x] 13.3 Implement game-over screen in `Renderer`
    - When `GameEngine` signals game-over, render an overlay showing final score and all-time high score
    - Render a "Restart" button; wire tap to `gameEngine.restart()`
    - _Requirements: 4.4, 4.5_

- [x] 14. Final checkpoint — Ensure all tests pass and Cordova build succeeds
  - Run the full Jest test suite: `npx jest --runInBand`
  - Verify the Cordova Android build completes without errors: `cordova build android`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests use `fast-check` with a minimum of 100 iterations per property; each is tagged with `// Feature: ball-bounce-game, Property N: <property text>`
- Unit tests use Jest
- The backend (`backend/server.js`) can be run locally during development or hosted remotely; the `DatabaseClient` `baseUrl` is configurable via `GameConfig`
- Offline queue key: `bbg_pending_sessions`; high-score cache key: `bbg_high_score`; player ID key: `bbg_player_id`
