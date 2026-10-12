import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import moduleFixture from './module-fixture.cjs';

test('the set entry can export current automation without enabling copy-link rewriting', () => {
  const profile = {
    v: 1,
    track: '/artist/song',
    duration: 60,
    pitch: 'preserve',
    keyShift: -3.5,
    points: [
      { t: 0, r: 0.9, d: 0, c: 'instant' },
      { t: 30, r: 1.2, d: 5, c: 'smooth' },
    ],
    pitchPoints: [
      { t: 0, k: -3.5, d: 0, c: 'instant' },
      { t: 25, k: 0.5, d: 5, c: 'linear' },
    ],
  };
  const api = {
    ready: false,
    rate: 1,
    copyLinks: false,
    pitchMode: 'preserve',
    applySaved: true,
    parseTrack: (path) => (/^\/[a-z]+\/[a-z]+$/.test(path) ? path : ''),
    refresh() {},
    normal() {},
  };
  const window = new EventTarget();
  const editor = vm.runInNewContext(
    moduleFixture(['timeline/tempo-editor.js']) + '\ncreateTempoEditor(api)',
    {
      window,
      document: Object.assign(new EventTarget(), { hidden: true }),
      location: { hash: '' },
      localStorage: {
        getItem: () => JSON.stringify({ enabled: true, data: profile }),
      },
      TextEncoder,
      TextDecoder,
      URL,
      btoa,
      atob,
      api,
      setTimeout: () => 1,
      clearTimeout() {},
    },
  );
  editor.changeTrack(profile.track);
  editor.observe(
    Object.assign(new EventTarget(), {
      paused: true,
      currentTime: 0,
      duration: 60,
      dataset: {},
    }),
  );
  const original = 'https://soundcloud.com' + profile.track;
  assert.equal(editor.shareLink(original), original);
  const forced = new URL(editor.shareLink(original, true));
  const decoded = JSON.parse(
    Buffer.from(forced.searchParams.get('sct').slice(5), 'base64url'),
  );
  assert.deepEqual(decoded.points, profile.points);
  assert.deepEqual(decoded.pitchPoints, profile.pitchPoints);
  assert.equal(decoded.keyShift, -3.5);
  assert.equal(api.copyLinks, false);
  editor.setKeyShift(-2.5);
  const overridden = new URL(editor.shareLink(original, true));
  const override = JSON.parse(
    Buffer.from(overridden.searchParams.get('sct').slice(5), 'base64url'),
  );
  assert.equal(override.keyShift, -2.5);
  assert.equal(override.pitchPoints, undefined);
  assert.equal(editor.shareLink(original), original);
});
