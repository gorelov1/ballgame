# Requirements Document

## Introduction

Ball Bounce Game is an Android mobile game built with JavaScript and MongoDB. A small ball continuously falls under gravity, and the player draws temporary platforms on the screen to bounce the ball upward. The screen scrolls upward as the ball rises. Players collect fuel/gems while ascending to maintain the ability to draw platforms. The game ends when the ball falls off the bottom edge of the screen. Physics simulation is handled via a physics engine (Box2D or Canvas API with collision detection). Player scores and progress are persisted in MongoDB.

## Glossary

- **Ball**: The circular game object subject to gravity and platform collisions.
- **Platform**: A temporary line drawn by the player on the screen that the Ball can bounce off of.
- **Fuel**: The consumable resource spent when drawing Platforms; replenished by collecting Gems.
- **Gem**: A collectible item that appears during gameplay and restores Fuel when the Ball contacts it.
- **Game_Engine**: The JavaScript runtime responsible for the physics simulation, rendering loop, and collision detection.
- **Physics_Engine**: The Box2D or Canvas-based subsystem that applies gravity, detects collisions, and resolves bounce forces.
- **Renderer**: The Canvas API subsystem responsible for drawing the Ball, Platforms, Gems, background, and UI elements each frame.
- **Input_Handler**: The subsystem that captures touch/drag gestures and converts them into Platform creation requests.
- **Score_Manager**: The subsystem that tracks the player's current height, score, and high score.
- **Database_Client**: The MongoDB client responsible for persisting and retrieving player data.
- **Session**: A single play-through from game start to game over.
- **Viewport**: The visible area of the game world, which scrolls upward as the Ball rises.

---

## Requirements

### Requirement 1: Ball Physics and Gravity

**User Story:** As a player, I want the ball to fall continuously under gravity, so that the game presents a constant challenge requiring me to act.

#### Acceptance Criteria

1. THE Game_Engine SHALL apply a constant downward gravitational acceleration to the Ball at all times during an active Session.
2. WHEN the Ball contacts a Platform, THE Physics_Engine SHALL apply an upward bounce force to the Ball proportional to the Ball's incoming velocity.
3. WHEN the Ball contacts a Platform, THE Physics_Engine SHALL resolve the collision within the same rendered frame in which contact is detected.
4. WHILE the Ball is airborne, THE Physics_Engine SHALL update the Ball's position and velocity each frame using the configured gravity constant.
5. IF the Ball's velocity after a bounce would exceed the maximum allowed speed, THEN THE Physics_Engine SHALL clamp the Ball's velocity to the configured maximum speed.

---

### Requirement 2: Platform Drawing

**User Story:** As a player, I want to draw lines on the screen to create temporary platforms, so that I can redirect the ball upward.

#### Acceptance Criteria

1. WHEN the player performs a drag gesture on the screen, THE Input_Handler SHALL record the start and end coordinates of the gesture as a Platform.
2. WHEN a Platform is created, THE Game_Engine SHALL add it to the active physics simulation immediately.
3. WHEN a Platform is created, THE Game_Engine SHALL deduct the configured Fuel cost from the player's current Fuel reserve.
4. WHILE a Platform exists in the simulation, THE Renderer SHALL draw the Platform as a visible line on the Viewport.
5. WHEN a Platform's configured lifetime expires, THE Game_Engine SHALL remove the Platform from the physics simulation and the Renderer SHALL stop drawing it.
6. IF the player's Fuel reserve is zero, THEN THE Input_Handler SHALL reject new Platform creation gestures and THE Renderer SHALL display a visual indicator that no Fuel remains.
7. THE Game_Engine SHALL support a minimum Platform length of 50 pixels and a maximum Platform length of 400 pixels; gestures outside this range SHALL be clamped to the nearest valid length.

---

### Requirement 3: Screen Scrolling

**User Story:** As a player, I want the screen to scroll upward as the ball rises, so that I can keep playing as the ball ascends higher.

#### Acceptance Criteria

1. WHEN the Ball's vertical position rises above the midpoint of the Viewport, THE Renderer SHALL scroll the Viewport upward to keep the Ball at or above the midpoint.
2. WHILE the Viewport is scrolling, THE Renderer SHALL reposition all active Platforms and Gems relative to the updated Viewport offset.
3. WHILE the Viewport is scrolling, THE Score_Manager SHALL increment the player's height score based on the distance scrolled.
4. THE Renderer SHALL NOT scroll the Viewport downward when the Ball descends below the midpoint.

---

### Requirement 4: Game Over Condition

**User Story:** As a player, I want the game to end when the ball falls off the bottom of the screen, so that there is a clear failure state.

#### Acceptance Criteria

1. WHEN the Ball's position falls below the bottom edge of the Viewport, THE Game_Engine SHALL transition the Session to the game-over state.
2. WHEN the Session transitions to game-over, THE Score_Manager SHALL record the final score for the Session.
3. WHEN the Session transitions to game-over, THE Database_Client SHALL persist the final score and height to MongoDB.
4. WHEN the Session transitions to game-over, THE Renderer SHALL display a game-over screen showing the player's final score and all-time high score.
5. WHEN the player confirms a restart from the game-over screen, THE Game_Engine SHALL reset all Session state and begin a new Session.

---

### Requirement 5: Fuel and Gem Resource Management

**User Story:** As a player, I want to collect gems while ascending to replenish my fuel, so that I must manage resources strategically to keep drawing platforms.

#### Acceptance Criteria

1. THE Game_Engine SHALL spawn Gems at randomised positions within the Viewport at a rate of 1 to 3 Gems per 200 pixels of height gained.
2. WHEN the Ball contacts a Gem, THE Game_Engine SHALL remove the Gem from the simulation and add the configured Fuel value of that Gem to the player's Fuel reserve.
3. THE Game_Engine SHALL cap the player's Fuel reserve at the configured maximum Fuel value; Fuel collected beyond the maximum SHALL be discarded.
4. WHILE the player's Fuel reserve is above zero, THE Renderer SHALL display the current Fuel level as a numeric value and a progress bar in the HUD.
5. WHEN the player's Fuel reserve drops to zero, THE Renderer SHALL display a low-fuel warning indicator in the HUD.
6. THE Game_Engine SHALL initialise each new Session with the configured starting Fuel value.

---

### Requirement 6: Physics Engine Integration

**User Story:** As a developer, I want the game to use a physics engine for collision detection and bounce mechanics, so that ball movement feels realistic and predictable.

#### Acceptance Criteria

1. THE Game_Engine SHALL integrate either Box2D (via box2d-wasm or planck.js) or a Canvas-based custom physics subsystem for all collision detection and force resolution.
2. THE Physics_Engine SHALL detect collisions between the Ball and all active Platforms each frame.
3. THE Physics_Engine SHALL detect collisions between the Ball and all active Gems each frame.
4. THE Physics_Engine SHALL simulate physics at a fixed timestep of 60 frames per second.
5. IF the device frame rate drops below 30 frames per second, THEN THE Physics_Engine SHALL apply sub-step simulation to maintain physics accuracy without skipping collision events.

---

### Requirement 7: Score Tracking and Persistence

**User Story:** As a player, I want my scores to be saved and my high score displayed, so that I have a long-term goal to work toward.

#### Acceptance Criteria

1. THE Score_Manager SHALL calculate the player's score as a function of height gained and the number of Gems collected during the Session.
2. WHEN a Session ends, THE Database_Client SHALL write the Session record — including score, height, Gems collected, and timestamp — to the MongoDB `sessions` collection.
3. WHEN the game launches, THE Database_Client SHALL retrieve the player's all-time high score from MongoDB and provide it to the Score_Manager.
4. IF the MongoDB connection is unavailable at launch, THEN THE Database_Client SHALL fall back to locally cached score data and retry the connection in the background.
5. IF the MongoDB write fails at session end, THEN THE Database_Client SHALL queue the Session record locally and retry the write when connectivity is restored.
6. THE Score_Manager SHALL expose the current session score and all-time high score to the Renderer for display in the HUD at all times during a Session.

---

### Requirement 8: Rendering and Visual Feedback

**User Story:** As a player, I want smooth, responsive visuals, so that the game feels polished and the ball's movement is easy to track.

#### Acceptance Criteria

1. THE Renderer SHALL render all game elements — Ball, Platforms, Gems, background, and HUD — at a target frame rate of 60 frames per second.
2. THE Renderer SHALL draw the Ball as a filled circle with a radius of 15 pixels in the game world coordinate space.
3. WHEN a Platform is drawn by the player, THE Renderer SHALL display a visual preview of the Platform line during the drag gesture before the gesture is released.
4. WHEN a Platform's remaining lifetime falls below 20% of its configured duration, THE Renderer SHALL render the Platform with a fading opacity to signal imminent removal.
5. THE Renderer SHALL display the current score, height, and Fuel level in a HUD overlay that remains fixed relative to the Viewport at all times.

---

### Requirement 9: Android Deployment

**User Story:** As a player, I want to install and play the game on my Android device, so that I can enjoy it as a native mobile experience.

#### Acceptance Criteria

1. THE Game_Engine SHALL be packaged as an Android application using Apache Cordova or a compatible JavaScript-to-Android bridge.
2. THE Game_Engine SHALL request and handle the `INTERNET` Android permission to enable MongoDB connectivity.
3. WHEN the Android application is backgrounded, THE Game_Engine SHALL pause the physics simulation and rendering loop.
4. WHEN the Android application is foregrounded after being backgrounded, THE Game_Engine SHALL resume the physics simulation and rendering loop from the paused state.
5. THE Game_Engine SHALL target Android API level 26 (Android 8.0) or higher.
