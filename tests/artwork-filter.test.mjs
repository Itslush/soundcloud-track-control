import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { artworkFilter } from '../src/appearance/artwork-filter.js';

test('artwork follows audible pitch and returns to the native image', () => {
  assert.equal(artworkFilter(1, 0, false), '');
  assert.equal(artworkFilter(2, 0, false), 'hue-rotate(180deg)');
  assert.equal(artworkFilter(2, 0, true), '');
  assert.equal(artworkFilter(1, -3, true), 'hue-rotate(-45deg)');
  assert.equal(artworkFilter(2, -12, false), '');
});
