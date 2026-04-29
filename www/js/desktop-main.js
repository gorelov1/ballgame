/**
 * desktop-main.js — Menu system + game bootstrap for Ball Bounce Game.
 *
 * Screens: username-entry → main-menu → [play | high-scores | about]
 * During play: pause overlay accessible via Escape or P key.
 */
(function () {
  'use strict';

  // Backend URL — change this to your deployed Render/Railway URL when hosted.
  // Leave as localhost for local development.
  var BACKEND_URL = window.BACKEND_URL || 'https://ball-bounce-game-backend-production.up.railway.app';
  var STORAGE_KEY_USERNAME = 'bbg_username';
  var STORAGE_KEY_PLAYER_ID = 'bbg_player_id';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var canvas, engine;
  var currentScreen = null;
  var isPlaying = false;
  var isPaused = false;

  // ---------------------------------------------------------------------------
  // Screen helpers
  // ---------------------------------------------------------------------------
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    if (id) {
      document.getElementById(id).classList.add('active');
    }
    currentScreen = id;
  }

  function hideAllScreens() {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    currentScreen = null;
  }

  // ---------------------------------------------------------------------------
  // Username screen
  // ---------------------------------------------------------------------------
  function initUsernameScreen() {
    var input = document.getElementById('username-input');
    var error = document.getElementById('username-error');
    var btn   = document.getElementById('btn-username-confirm');

    function submit() {
      var name = input.value.trim();
      if (!name || name.length < 2) {
        error.textContent = 'Please enter at least 2 characters.';
        return;
      }
      error.textContent = '';
      btn.textContent = 'CONNECTING…';
      btn.disabled = true;

      registerPlayer(name, function (playerId, username) {
        localStorage.setItem(STORAGE_KEY_USERNAME, username);
        localStorage.setItem(STORAGE_KEY_PLAYER_ID, playerId);
        btn.textContent = 'PLAY';
        btn.disabled = false;
        updateUserBadge(username);
        showScreen('screen-menu');
      }, function () {
        // Offline fallback — still let them play
        localStorage.setItem(STORAGE_KEY_USERNAME, name);
        btn.textContent = 'PLAY';
        btn.disabled = false;
        updateUserBadge(name);
        showScreen('screen-menu');
      });
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submit();
    });
    // Auto-focus
    setTimeout(function () { input.focus(); }, 100);
  }

  function registerPlayer(username, onSuccess, onError) {
    fetch(BACKEND_URL + '/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) { onSuccess(data.playerId, data.username); })
    .catch(function () { onError(); });
  }

  function updateUserBadge(username) {
    var badge = document.getElementById('current-user-badge');
    if (badge) badge.textContent = '👤 ' + username;
  }

  // ---------------------------------------------------------------------------
  // Main menu
  // ---------------------------------------------------------------------------
  function initMainMenu() {
    document.getElementById('btn-play').addEventListener('click', startGame);
    document.getElementById('btn-highscores').addEventListener('click', function () {
      showHighScores('screen-menu');
    });
    document.getElementById('btn-about').addEventListener('click', function () {
      showScreen('screen-about');
    });
    document.getElementById('btn-change-user').addEventListener('click', function () {
      localStorage.removeItem(STORAGE_KEY_USERNAME);
      localStorage.removeItem(STORAGE_KEY_PLAYER_ID);
      document.getElementById('username-input').value = '';
      showScreen('screen-username');
      setTimeout(function () { document.getElementById('username-input').focus(); }, 100);
    });
  }

  // ---------------------------------------------------------------------------
  // High scores screen
  // ---------------------------------------------------------------------------
  var _highScoresReturnScreen = 'screen-menu';

  function showHighScores(returnTo) {
    _highScoresReturnScreen = returnTo || 'screen-menu';
    showScreen('screen-highscores');
    loadLeaderboard();
  }

  function loadLeaderboard() {
    var loading = document.getElementById('leaderboard-loading');
    var table   = document.getElementById('leaderboard-table');
    var tbody   = document.getElementById('leaderboard-body');

    loading.style.display = 'block';
    table.style.display   = 'none';
    tbody.innerHTML = '';

    fetch(BACKEND_URL + '/api/leaderboard?limit=10')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        loading.style.display = 'none';
        var rows = data.leaderboard || [];
        if (rows.length === 0) {
          loading.textContent = 'No scores yet. Be the first!';
          loading.style.display = 'block';
          return;
        }
        rows.forEach(function (row, i) {
          var tr = document.createElement('tr');
          var medals = ['🥇', '🥈', '🥉'];
          var rank = medals[i] || (i + 1);
          tr.innerHTML =
            '<td class="rank-col">' + rank + '</td>' +
            '<td>' + escapeHtml(row.username || 'Anonymous') + '</td>' +
            '<td class="score-col">' + Math.floor(row.score) + '</td>' +
            '<td class="score-col">' + Math.floor(row.heightPx || 0) + ' px</td>';
          tbody.appendChild(tr);
        });
        table.style.display = 'table';
      })
      .catch(function () {
        loading.textContent = 'Could not load scores (backend offline).';
        loading.style.display = 'block';
      });
  }

  document.getElementById('btn-highscores-back').addEventListener('click', function () {
    showScreen(_highScoresReturnScreen);
  });

  // ---------------------------------------------------------------------------
  // About screen
  // ---------------------------------------------------------------------------
  document.getElementById('btn-about-back').addEventListener('click', function () {
    showScreen('screen-menu');
  });

  // ---------------------------------------------------------------------------
  // Pause screen
  // ---------------------------------------------------------------------------
  function initPauseScreen() {
    document.getElementById('btn-resume').addEventListener('click', resumeGame);
    document.getElementById('btn-quit').addEventListener('click', function () {
      quitToMenu();
    });
  }

  function showSettingsButton(visible) {
    var btn = document.getElementById('btn-settings');
    btn.style.display = visible ? 'flex' : 'none';
  }

  function pauseGame() {
    if (!isPlaying || isPaused) return;
    isPaused = true;
    if (engine) engine.pause();
    showSettingsButton(false);
    showScreen('screen-pause');
  }

  function resumeGame() {
    if (!isPaused) return;
    isPaused = false;
    hideAllScreens();
    showSettingsButton(true);
    if (engine) engine.resume();
  }

  function quitToMenu() {
    isPaused = false;
    isPlaying = false;
    showSettingsButton(false);
    if (engine) {
      engine.pause();
      engine = null;
    }
    showScreen('screen-menu');
  }

  // Keyboard: Escape or P to pause/resume
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (isPlaying && !isPaused) pauseGame();
      else if (isPaused) resumeGame();
    }
  });

  // ---------------------------------------------------------------------------
  // Game lifecycle
  // ---------------------------------------------------------------------------
  function startGame() {
    hideAllScreens();
    isPlaying = true;
    isPaused  = false;
    showSettingsButton(true);

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    var username = localStorage.getItem(STORAGE_KEY_USERNAME) || 'Anonymous';
    updateUserBadge(username);

    var config = {
      backendUrl: BACKEND_URL,
      username: username,
    };

    // Destroy previous engine if any
    if (engine) {
      try { engine.pause(); } catch (e) {}
      engine = null;
    }

    engine = new window.GameEngine(canvas, config);

    // When the game ends (ball out of bounds), show menu after a short delay
    // GameEngine already shows its own game-over overlay; we hook into restart
    var origRestart = engine.restart.bind(engine);
    engine.restart = function () {
      showSettingsButton(true);
      origRestart();
    };

    engine.start().catch(function (err) {
      console.error('GameEngine.start() error:', err);
    });

    // Hide settings button when game over (engine stops itself)
    // We poll sessionActive to detect game-over state
    var gameOverCheck = setInterval(function () {
      if (!engine) { clearInterval(gameOverCheck); return; }
      if (engine._sessionActive === false && isPlaying && !isPaused) {
        showSettingsButton(false);
        clearInterval(gameOverCheck);
      }
    }, 200);
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    canvas = document.getElementById('gameCanvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    window.addEventListener('resize', function () {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    });

    initUsernameScreen();
    initMainMenu();
    initPauseScreen();

    // Settings button
    document.getElementById('btn-settings').addEventListener('click', function () {
      if (isPlaying && !isPaused) pauseGame();
      else if (isPaused) resumeGame();
    });

    // Check if we already have a stored username
    var storedName = localStorage.getItem(STORAGE_KEY_USERNAME);
    if (storedName) {
      updateUserBadge(storedName);
      showScreen('screen-menu');
    } else {
      showScreen('screen-username');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}());
