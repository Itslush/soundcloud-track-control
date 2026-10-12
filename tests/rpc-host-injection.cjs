const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if (!process.argv[2])
  throw new Error('Pass the soundcloud-rpc v0.2.0 resources/app.asar path.');
const archive = fs.readFileSync(process.argv[2]);
const header = JSON.parse(archive.subarray(16, 16 + archive.readUInt32LE(12)));
const profile = path.join(root, 'test-results/rpc-host');
fs.mkdirSync(path.join(profile, 'plugins'), { recursive: true });
fs.copyFileSync(
  path.join(root, 'dist/soundcloud_tempo_control.js'),
  path.join(profile, 'plugins/soundcloud_tempo_control.js'),
);
function read(name) {
  const entry = name
    .split('/')
    .reduce((node, part) => node.files[part], header);
  const offset = 8 + archive.readUInt32LE(4) + Number(entry.offset);
  return archive.subarray(offset, offset + entry.size).toString('utf8');
}
const metadata = { exports: {} };
assert.equal(JSON.parse(read('package.json')).version, '0.2.0');
vm.runInNewContext(read('tsc/utils/metadataParser.js'), {
  exports: metadata.exports,
  module: metadata,
});
const host = { exports: {} };
vm.runInNewContext(read('tsc/services/pluginService.js'), {
  module: host,
  exports: host.exports,
  require(name) {
    if (name === 'electron')
      return {
        app: { getPath: () => profile },
        ipcMain: { handle() {} },
      };
    if (name === '../utils/metadataParser') return metadata.exports;
    return require(name);
  },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
});
const injections = [];
const store = { get: () => ({ soundcloud_tempo_control: true }), set() {} };
const service = new host.exports.PluginService(store);
service.stopWatching();
service.setContentView({
  webContents: {
    executeJavaScript(code) {
      injections.push(code);
      return Promise.resolve();
    },
  },
});
service.injectAllContentScripts();
const info = service
  .getPlugins()
  .find((plugin) => plugin.id === 'soundcloud_tempo_control');
assert.equal(info.metadata.name, 'SoundCloud Track Control');
assert.equal(info.metadata.version, require('../package.json').version);
assert.equal(info.enabled, true);
assert.equal(injections.length, 1);
service.setPluginEnabled('soundcloud_tempo_control', false);
assert.equal(injections.length, 2);
fs.writeFileSync(
  path.join(root, 'test-results/rpc-host-injection.json'),
  JSON.stringify({
    inject: injections[0],
    cleanup: injections[1],
    metadata: info.metadata,
  }),
);
console.log(
  'Installed v0.2.0 PluginService activated and deactivated the shipped adapter.',
);
