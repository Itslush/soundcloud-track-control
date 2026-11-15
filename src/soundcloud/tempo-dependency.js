import createModule from '../../vendor/signalsmith/wasm-factory.mjs';
import { WaveformPitch } from '../audio/waveform-pitch.mjs';
import { registerLivePitch } from '../audio/live-pitch-worklet.mjs';

const modules = new WeakMap();
const name = 'soundcloud-live-pitch-v1';

function loadProcessor(context) {
  if (modules.has(context)) return modules.get(context);
  const source = new Blob(
    [
      'const _scriptName = undefined; (',
      registerLivePitch.toString(),
      ')(',
      createModule.toString(),
      ',',
      WaveformPitch.toString(),
      ',',
      JSON.stringify(name),
      ');',
    ],
    { type: 'text/javascript' },
  );
  const url = URL.createObjectURL(source);
  const loading = Promise.resolve()
    .then(() => context.audioWorklet.addModule(url))
    .catch((error) => {
      modules.delete(context);
      throw error;
    })
    .finally(() => URL.revokeObjectURL(url));
  modules.set(context, loading);
  return loading;
}

export async function createStretchNode(context, options) {
  await loadProcessor(context);
  const node = new AudioWorkletNode(context, name, options);
  const requests = new Map();
  let id = 0;
  const ready = new Promise((resolve, reject) =>
    requests.set('ready', { resolve, reject }),
  );
  node.port.onmessage = ({ data: [key, value, error] }) => {
    const request = requests.get(key);
    if (!request) return;
    requests.delete(key);
    if (error) request.reject(new Error(error));
    else request.resolve(value);
  };
  node.addEventListener('processorerror', () => {
    for (const { reject } of requests.values())
      reject(new Error('Pitch processor stopped'));
    requests.clear();
  });
  for (const method of ['configure', 'latency', 'schedule']) {
    node[method] = (value) =>
      new Promise((resolve, reject) => {
        requests.set(++id, { resolve, reject });
        node.port.postMessage([id, method, value]);
      });
  }
  try {
    await ready;
    return node;
  } catch (error) {
    node.port.close();
    node.disconnect();
    throw error;
  }
}
