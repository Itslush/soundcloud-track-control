import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPitchNotice } from '../src/sharing/tempo-pitch-notice.js';

test('pitch notice handles zero, fractional shifts and automation ranges', () => {
  assert.equal(formatPitchNotice(0), '');
  assert.equal(formatPitchNotice(-0), '');
  assert.equal(formatPitchNotice(-5.5), 'Pitch shifted −5.5 st');
  assert.equal(formatPitchNotice(0.5), 'Pitch shifted +0.5 st');
  assert.equal(formatPitchNotice(0.0001), 'Pitch shifted +0.0001 st');
  assert.equal(formatPitchNotice([-5, 3, -1]), 'Pitch shifted −5 to +3 st');
  assert.equal(formatPitchNotice([0, 0]), '');
  assert.equal(formatPitchNotice([-3, -3]), 'Pitch shifted −3 st');
});
