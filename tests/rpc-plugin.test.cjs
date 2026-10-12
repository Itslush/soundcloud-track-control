const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { rpcPluginSource } = require('../scripts/rpc-plugin.cjs');

function plugin(source) {
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(
    rpcPluginSource(source, '1.2.1', 'https://example.com/'),
    sandbox,
  );
  return sandbox.module.exports.contentScript();
}

function page(hostname = 'soundcloud.com', protocol = 'https:') {
  const timers = [];
  const location = {
    hostname,
    protocol,
    reload() {
      this.reloaded = true;
    },
  };
  const window = {
    location,
    setTimeout(fn) {
      timers.push(fn);
    },
  };
  window.top = window;
  return { window, location, timers };
}

test('RPC plugin returns the userscript intact without executing it in the host VM', () => {
  const script =
    'window.payload = "`${quoted}\\\\"; window.__soundCloudTempoControlV1 = true;';
  const content = plugin(script);
  assert.ok(content.includes(script));
  const sandbox = page();
  vm.runInNewContext(content, sandbox);
  assert.equal(sandbox.window.payload, '`${quoted}\\');
  assert.equal(sandbox.window.__soundCloudTempoControlV1, true);
  sandbox.window.__scrpc_cleanup_soundcloud_tempo_control();
  assert.equal(sandbox.location.reloaded, undefined);
  sandbox.timers[0]();
  assert.equal(sandbox.location.reloaded, true);
});

test('RPC injection excludes other origins, HTTP, subframes and duplicate activation', () => {
  const content = plugin(
    'window.runs = (window.runs || 0) + 1; window.__soundCloudTempoControlV1 = true;',
  );
  for (const sandbox of [
    page('soundcloud.com.attacker.example'),
    page('example.com'),
    page('soundcloud.com', 'http:'),
  ]) {
    vm.runInNewContext(content, sandbox);
    assert.equal(sandbox.window.runs, undefined);
    assert.equal(
      sandbox.window.__scrpc_cleanup_soundcloud_tempo_control,
      undefined,
    );
  }
  const frame = page();
  frame.window.top = {};
  vm.runInNewContext(content, frame);
  assert.equal(frame.window.runs, undefined);
  for (const hostname of ['soundcloud.com', 'm.soundcloud.com']) {
    const sandbox = page(hostname);
    vm.runInNewContext(content, sandbox);
    const cleanup = sandbox.window.__scrpc_cleanup_soundcloud_tempo_control;
    vm.runInNewContext(content, sandbox);
    assert.equal(sandbox.window.runs, 1);
    assert.equal(
      sandbox.window.__scrpc_cleanup_soundcloud_tempo_control,
      cleanup,
    );
  }
});
