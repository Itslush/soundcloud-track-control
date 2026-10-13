import test from 'node:test';
import assert from 'node:assert/strict';
import { createFooterVisuals } from '../src/soundcloud/footer-visuals.js';

test('footer themes refresh the player after colors change, without repeating unchanged refreshes', (t) => {
  const previous = {
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    getComputedStyle: Object.getOwnPropertyDescriptor(
      globalThis,
      'getComputedStyle',
    ),
  };
  t.after(() => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  let foreground = 'rgb(34, 34, 34)';
  const root = {};
  globalThis.document = { documentElement: root };
  globalThis.getComputedStyle = () => ({
    color: foreground,
    backgroundColor: 'rgb(255, 85, 0)',
    fontFamily: 'Arial',
    getPropertyValue: () => '',
  });
  const properties = new Map();
  const style = { setProperty: (key, value) => properties.set(key, value) };
  const element = { getBoundingClientRect: () => ({ y: 0, height: 10 }) };
  const bar = { querySelector: () => element };
  const ui = {
    host: { isConnected: true, style, closest: () => bar },
    root: { querySelector: () => element },
  };
  const refreshed = [];
  const visuals = createFooterVisuals({
    readUI: () => ui,
    readPlayback: () => ({ rate: 1, trackKey: '', failure: '' }),
    themeChanged: () => refreshed.push(properties.get('--tempo-surface')),
  });
  visuals.syncTheme();
  visuals.syncTheme();
  assert.deepEqual(refreshed, ['#f2f2f2']);
  foreground = 'rgb(255, 255, 255)';
  visuals.syncTheme();
  visuals.syncTheme();
  assert.deepEqual(refreshed, ['#f2f2f2', '#303030']);
  assert.equal(style.colorScheme, 'dark');
});
