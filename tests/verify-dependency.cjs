const assert = require('node:assert/strict');
const vm = require('node:vm');
const adapter = require('./module-fixture.cjs')([
  'soundcloud/tempo-dependency.js',
]);

async function main() {
  const urls = [],
    revoked = [],
    loads = [];
  class Node extends EventTarget {
    constructor(context, name, options) {
      super();
      assert.equal(context, audio);
      assert.equal(name, 'soundcloud-live-pitch-v1');
      assert.equal(options, config);
      this.port = {};
      queueMicrotask(() => this.port.onmessage({ data: ['ready'] }));
    }
  }
  const create = vm.runInNewContext(adapter + ';createStretchNode', {
    AudioWorkletNode: Node,
    Blob,
    URL: {
      createObjectURL(blob) {
        assert.ok(blob.size);
        urls.push(blob);
        return 'blob:' + urls.length;
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
    },
  });
  const config = { outputChannelCount: [2] };
  const audio = {
    audioWorklet: {
      async addModule(url) {
        loads.push(url);
        if (loads.length === 1) throw new Error('Load failed');
      },
    },
  };
  await assert.rejects(create(audio, config), /Load failed/);
  const [first, second] = await Promise.all([
    create(audio, config),
    create(audio, config),
  ]);
  assert.notEqual(first, second);
  assert.deepEqual(loads, ['blob:1', 'blob:2']);
  assert.deepEqual(revoked, loads);
  const messages = [];
  first.port.postMessage = (data) => messages.push(data);
  const latency = first.latency(),
    schedule = first.schedule({ active: true });
  first.port.onmessage({ data: [messages[1][0], undefined] });
  first.port.onmessage({ data: [messages[0][0], 0.077] });
  assert.equal(await latency, 0.077);
  await schedule;
  const pending = first.configure({});
  first.dispatchEvent(new Event('processorerror'));
  await assert.rejects(pending, /processor stopped/);
  console.log(
    'Worklet load retry, concurrent callers, URL cleanup and request routing passed.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
