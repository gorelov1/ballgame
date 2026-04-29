/**
 * mouse-shim.js
 *
 * Maps mouse events on the canvas to synthetic Touch/TouchEvent objects so
 * InputHandler (which listens for touchstart/touchmove/touchend) works on
 * desktop browsers without any code changes.
 *
 * Only active when the device does not already support real touch events.
 */
(function () {
  'use strict';

  // If the device has real touch support, do nothing.
  if ('ontouchstart' in window) return;

  var canvas = document.getElementById('gameCanvas');
  var isDown = false;

  function makeTouch(e) {
    return {
      clientX: e.clientX,
      clientY: e.clientY,
      identifier: 0,
      target: canvas,
    };
  }

  function dispatch(type, mouseEvent) {
    var touch = makeTouch(mouseEvent);
    var event = new Event(type, { bubbles: true, cancelable: true });
    event.changedTouches = [touch];
    event.targetTouches  = isDown ? [touch] : [];
    event.touches        = isDown ? [touch] : [];
    canvas.dispatchEvent(event);
  }

  canvas.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return; // left button only
    isDown = true;
    dispatch('touchstart', e);
  });

  canvas.addEventListener('mousemove', function (e) {
    if (!isDown) return;
    dispatch('touchmove', e);
  });

  canvas.addEventListener('mouseup', function (e) {
    if (!isDown) return;
    isDown = false;
    dispatch('touchend', e);
  });

  // Cancel drag if mouse leaves the window
  window.addEventListener('mouseup', function (e) {
    if (!isDown) return;
    isDown = false;
    dispatch('touchend', e);
  });
}());
