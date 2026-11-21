import {
  DEFAULT_FX,
  createMasterFx,
  isDefaultFx,
  normalizeFxSettings,
} from './master-fx.mjs';
import { validOutputDb } from './output-level.mjs';
import { createPitchOutput, pitchTiming } from './pitch-quality.mjs';

const MAX_EXPORT_SECONDS = 900;

export function encodeWav(audioBuffer) {
  const channels = Math.max(1, audioBuffer.numberOfChannels || 1);
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate || 48000;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = length * blockAlign;
  const output = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(output);
  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataBytes, true);

  const channelData = Array.from({ length: channels }, (_, ch) =>
    audioBuffer.getChannelData(ch),
  );
  let pos = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i] || 0));
      view.setInt16(
        pos,
        sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767),
        true,
      );
      pos += 2;
    }
  }
  return output;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

export async function exportAdjustedTrack({
  audio,
  trackKey,
  modules,
  resolveSource,
  createStretchNode,
  settings,
  fx = DEFAULT_FX,
  onProgress,
  signal,
}) {
  if (!audio || !modules || !resolveSource)
    throw new Error('Play the track briefly before exporting WAV.');
  const rate = Number(settings?.rate ?? 1);
  if (!Number.isFinite(rate) || rate < 0.25 || rate > 4)
    throw new Error('Tempo must be between 0.25× and 4× to export.');
  const outputDb = Number(settings?.outputDb ?? 0);
  if (!validOutputDb(outputDb))
    throw new Error('Output level cannot be exported cleanly.');

  onProgress?.(0.02, 'Resolving stream…');
  const source = await resolveSource(audio, { signal });
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  if (source.status !== 'bound' || !source.playlistUrl)
    throw new Error('Track stream is not bound yet. Let playback run for a moment.');

  const { Mediabunny } = await modules.loadAudioDependencies({ signal });
  const provider = modules.createPcmWindow({
    source: modules.createPcmSource({
      library: Mediabunny,
      url: source.playlistUrl,
    }),
  });

  let decoded;
  try {
    const info = await provider.info({ signal });
    const sampleRate = info.sampleRate || 48000;
    const duration =
      info.totalSourceFrames === undefined
        ? info.durationHint
        : info.totalSourceFrames / sampleRate;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error('Track duration is unavailable.');
    if (duration > MAX_EXPORT_SECONDS)
      throw new Error('Track exceeds 15-minute local WAV export limit.');

    const totalFrames = Math.floor(duration * sampleRate);
    decoded = new AudioBuffer({
      numberOfChannels: 2,
      length: totalFrames,
      sampleRate,
    });
    for (let from = 0; from < totalFrames; from += sampleRate) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const to = Math.min(totalFrames, from + sampleRate);
      const lease = await provider.acquire(from, to, { signal });
      try {
        for (let ch = 0; ch < 2; ch++) {
          const channel = lease.channels[ch] || lease.channels[0];
          decoded.copyToChannel(channel, ch, from);
        }
      } finally {
        lease.release();
      }
      onProgress?.(0.05 + 0.55 * (to / totalFrames), 'Decoding audio…');
    }
  } finally {
    await provider.dispose();
  }

  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  onProgress?.(0.65, 'Rendering tempo, pitch and FX…');

  const sampleRate = decoded.sampleRate;
  const semitones =
    (Number(settings?.keyShift) || 0) -
    (settings?.preserve ? 12 * Math.log2(rate) : 0);
  const outFrames = Math.max(1, Math.floor((decoded.length / rate)));
  let latencyFrames = 0;

  const offline = new OfflineAudioContext(2, outFrames + sampleRate, sampleRate);
  const bufferSource = offline.createBufferSource();
  bufferSource.buffer = decoded;
  bufferSource.playbackRate.value = rate;

  const gainNode = offline.createGain();
  gainNode.gain.value = 10 ** (outputDb / 20);

  let tailNode = bufferSource;
  let processor = null;
  const normalizedFx = normalizeFxSettings(fx);
  let fxBus = null;

  try {
    if (Math.abs(semitones) >= 1e-4 && createStretchNode) {
      processor = await createStretchNode(offline, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      await processor.configure({
        ...pitchTiming,
        splitComputation: false,
      });
      const latency = await processor.latency();
      if (Number.isFinite(latency) && latency > 0 && latency <= 1)
        latencyFrames = Math.round(latency * sampleRate);
      await processor.schedule({
        active: true,
        semitones,
        engine: settings?.pitchEngine || 'auto',
      });
      const pitchOut = createPitchOutput(
        offline,
        gainNode,
        Boolean(settings?.peakProtection ?? true),
      );
      tailNode.connect(processor).connect(pitchOut.input);
      tailNode = gainNode;
    } else {
      tailNode.connect(gainNode);
      tailNode = gainNode;
    }

    if (!isDefaultFx(normalizedFx)) {
      fxBus = createMasterFx(offline, offline.destination, normalizedFx);
      tailNode.connect(fxBus.input);
    } else {
      tailNode.connect(offline.destination);
    }

    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    bufferSource.start(0);
    const rendered = await offline.startRendering();
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

    const result = new AudioBuffer({
      numberOfChannels: 2,
      length: outFrames,
      sampleRate,
    });
    const endFrame = Math.min(rendered.length, latencyFrames + outFrames);
    for (let ch = 0; ch < 2; ch++) {
      const slice = rendered.getChannelData(ch).subarray(latencyFrames, endFrame);
      result.copyToChannel(slice, ch, 0);
    }

    onProgress?.(0.92, 'Encoding WAV…');
    const wav = encodeWav(result);
    const slug =
      (trackKey || '/soundcloud-track')
        .replace(/^\/+/, '')
        .replace(/[^\w-]+/g, '-')
        .slice(0, 64) || 'soundcloud-track';
    const filename = `${slug}-${Number(rate.toFixed(3))}x.wav`;
    downloadBlob(new Blob([wav], { type: 'audio/wav' }), filename);
    onProgress?.(1, `Exported ${filename}`);
    return filename;
  } finally {
    try {
      fxBus?.dispose();
    } catch {}
    try {
      processor?.disconnect();
      processor?.port?.close();
    } catch {}
  }
}
