import { encodeWave } from './test-capture.mjs';

export async function steadyAudio() {
  const context = new AudioContext({ sampleRate: 48000 });
  const audio = new Audio();
  const pcm = [440, 660].map((hz) =>
    Float32Array.from(
      { length: 48000 * 40 },
      (_, i) => 0.15 * Math.sin((i * 2 * Math.PI * hz) / 48000),
    ),
  );
  const url = URL.createObjectURL(
    new Blob([encodeWave(pcm, 48000)], { type: 'audio/wav' }),
  );
  audio.src = url;
  audio.loop = true;
  const source = context.createMediaElementSource(audio);
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(mute).connect(context.destination);
  await context.audioWorklet.addModule('/tests/fixtures/boundary-capture.mjs');
  await context.resume();
  await audio.play();
  return {
    async capture() {
      const frames = 48000 * 4;
      const node = new AudioWorkletNode(context, 'boundary-capture', {
        numberOfInputs: 2,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        processorOptions: { frames },
      });
      let timer;
      try {
        source.connect(node).connect(mute);
        const data = await new Promise((resolve, reject) => {
          node.port.onmessage = ({ data }) => {
            if (data.type === 'complete') resolve(data);
          };
          node.onprocessorerror = () =>
            reject(new Error('Continuity capture failed'));
          timer = setTimeout(
            () => reject(new Error('Continuity capture timed out')),
            15000,
          );
          node.port.postMessage('start');
        });
        const channels = [0, 1].map((ch) => {
          let energy = 0,
            peak = 0,
            crossings = 0,
            invalid = 0,
            maxJump = 0,
            silentQuanta = 0;
          let previous = data.pcm[ch];
          for (let block = 0; block < frames; block += 128) {
            let blockEnergy = 0;
            for (let i = block; i < block + 128; i++) {
              const value = data.pcm[i * 4 + ch];
              if (!Number.isFinite(value)) invalid++;
              if (previous <= 0 && value > 0) crossings++;
              maxJump = Math.max(maxJump, Math.abs(value - previous));
              peak = Math.max(peak, Math.abs(value));
              energy += value * value;
              blockEnergy += value * value;
              previous = value;
            }
            if (blockEnergy / 128 < 1e-8) silentQuanta++;
          }
          return {
            rms: Math.sqrt(energy / frames),
            peak,
            frequency: crossings / 4,
            maxJump,
            silentQuanta,
            invalid,
          };
        });
        return {
          channels,
          frames,
          sampleRate: context.sampleRate,
          skippedQuanta: data.timestamps.filter(
            (frame, i, all) => i && frame !== all[i - 1] + 128,
          ).length,
          missingInputs: data.inputChannels.filter(
            (count, i) => i % 2 === 0 && count !== 2,
          ).length,
        };
      } finally {
        clearTimeout(timer);
        source.disconnect(node);
        node.disconnect();
        node.port.close();
      }
    },
    async close() {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      await context.close();
      URL.revokeObjectURL(url);
    },
  };
}
