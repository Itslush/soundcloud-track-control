import test from 'node:test';
import assert from 'node:assert/strict';
import { touchViewport } from '../src/controls/tempo-mobile-player.js';

test('touch-capable phone keeps its touch player when pointer queries report fine', () => {
  const viewport = { width: 980, height: 2110, scale: 393 / 980 };
  const geometry = touchViewport(viewport, 393, false, 5);
  assert.equal(geometry.touch, true);
  assert.equal(geometry.width, 393);
});

test('a narrow mouse-only desktop window does not activate the phone layout', () => {
  assert.equal(
    touchViewport({ width: 393, scale: 1 }, 1920, false, 0).touch,
    false,
  );
});

test('a wide touchscreen desktop does not activate the phone layout', () => {
  assert.equal(
    touchViewport({ width: 1200, scale: 1 }, 1920, true, 10).touch,
    false,
  );
});

test('a coarse-pointer phone still works without maxTouchPoints', () => {
  assert.equal(
    touchViewport({ width: 980, scale: 320 / 980 }, 320, true).touch,
    true,
  );
});

test('a phone retains the touch layout after rotating to landscape', () => {
  const geometry = touchViewport(
    { width: 980, scale: 844 / 980 },
    844,
    false,
    5,
    393,
  );
  assert.equal(geometry.touch, true);
  assert.equal(geometry.width, 844);
});
