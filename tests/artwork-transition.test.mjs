import test from 'node:test';
import assert from 'node:assert/strict';
import { artworkTransition } from '../src/appearance/artwork-transition.js';

test('artwork starts and finishes gently with a broad feather and fixed endpoints', () => {
  assert.deepEqual(artworkTransition(0), { progress: 0, start: 1, end: 1.5 });
  assert.deepEqual(artworkTransition(0.5), {
    progress: 0.5,
    start: 0.25,
    end: 0.75,
  });
  assert.deepEqual(artworkTransition(1), { progress: 1, start: -0.5, end: 0 });
  assert.equal(artworkTransition(0.25).progress, 0.15625);
  assert.equal(artworkTransition(0.75).progress, 0.84375);
  assert.deepEqual(artworkTransition(-1), artworkTransition(0));
  assert.deepEqual(artworkTransition(2), artworkTransition(1));
  assert.deepEqual(artworkTransition(NaN), artworkTransition(0));
  let previous = -1;
  for (let i = 0; i <= 100; i++) {
    const frame = artworkTransition(i / 100);
    assert.ok(frame.progress >= previous);
    assert.ok(Math.abs(frame.end - frame.start - 0.5) < 1e-12);
    previous = frame.progress;
  }
});
