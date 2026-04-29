/**
 * www/js/main.js — Cordova WebView entry point for Ball Bounce Game.
 *
 * PRODUCTION BUILD NOTE:
 * In a production build, all modules under src/ should be bundled into this
 * file using a bundler such as webpack or browserify. For example:
 *
 *   # Using browserify:
 *   browserify src/engine/GameEngine.js -o www/js/main.js \
 *     --require ./src/config/GameConfig.js:GameConfig
 *
 *   # Using webpack:
 *   webpack --entry ./src/engine/GameEngine.js --output-path ./www/js \
 *     --output-filename main.js
 *
 * The bundler resolves all require() calls in src/ and produces a single
 * self-contained script that runs in the Cordova WebView without Node.js.
 *
 * For development without a bundler, load each src/ module via individual
 * <script> tags in index.html (in dependency order) before this file, and
 * expose the classes on the window object.
 */

'use strict';

// NOTE: In a production build, all src/ modules would be bundled into this file
// via a bundler (e.g. webpack or browserify). For now, this file contains the
// game bootstrap logic and assumes the GameEngine class is available globally
// or via a bundler.

// Since we're in a Cordova WebView without a bundler, we inline the game
// initialisation here. The actual module files in src/ are the source of truth;
// this file wires them together for the browser environment.

document.addEventListener('deviceready', function () {
  // Resize canvas to fill the screen
  var canvas = document.getElementById('gameCanvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Initialise the game engine
  // In a bundled build, GameConfig and GameEngine would be imported here.
  // For the Cordova WebView, they are loaded via script tags or a bundler.
  var config = window.GameConfig || {};
  config.backendUrl = config.backendUrl || 'https://ball-bounce-game-backend-production.up.railway.app';

  var engine = new window.GameEngine(canvas, config);
  window.gameEngine = engine;

  // Cordova lifecycle hooks
  document.addEventListener('pause', function () {
    if (window.gameEngine) {
      window.gameEngine.pause();
    }
  }, false);

  document.addEventListener('resume', function () {
    if (window.gameEngine) {
      window.gameEngine.resume();
    }
  }, false);

  // Handle tap on game-over screen to restart
  canvas.addEventListener('touchend', function (e) {
    // GameEngine handles restart internally via the game-over overlay tap.
    // This listener is a fallback for environments without the overlay tap wired.
  }, false);

  // Start the game
  engine.start();
}, false);
