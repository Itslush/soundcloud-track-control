import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('completed capture ignores later render calls while its input remains connected', () => {
  let Processor;
  const messages = [];
  vm.runInNewContext(
    readFileSync(
      new URL('./fixtures/boundary-capture.mjs', import.meta.url),
      'utf8',
    ),
    {
      sampleRate: 48000,
      currentFrame: 0,
      AudioWorkletProcessor: class {
        constructor() {
          this.port = {
            postMessage: (value) => messages.push(value),
            close() {},
          };
        }
      },
      registerProcessor: (_, value) => {
        Processor = value;
      },
    },
  );
  const processor = new Processor({ processorOptions: { frames: 128 } });
  const inputs = [[new Float32Array(128).fill(0.25)]];
  processor.port.onmessage({ data: 'start' });
  assert.equal(processor.process(inputs), false);
  assert.equal(messages[1].type, 'complete');
  assert.equal(messages[1].pcm.length, 512);
  assert.equal(messages[1].pcm[0], 0.25);
  assert.equal(processor.process(inputs), false);
  assert.equal(messages.length, 2);
});
