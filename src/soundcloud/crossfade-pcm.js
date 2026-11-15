export async function decodeCrossfade(
  modules,
  graph,
  current,
  url,
  start,
  length = Infinity,
) {
  const { signal } = current.controller;
  const { Mediabunny } = await modules.loadAudioDependencies({ signal });
  const provider = modules.createPcmWindow({
    source: modules.createPcmSource({ library: Mediabunny, url }),
  });
  try {
    const info = await provider.info({ signal });
    const duration =
      info.totalSourceFrames === undefined
        ? info.durationHint
        : info.totalSourceFrames / info.sampleRate;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error('This stream’s duration is unavailable.');
    const first = Math.floor(start * info.sampleRate);
    const end = Math.floor(
      Math.min(duration, start + length) * info.sampleRate,
    );
    const frames = end - first;
    if (frames <= 0 || frames * 8 > 32 * 1024 * 1024)
      throw new Error('This track’s crossfade buffer is too large.');
    const buffer = graph
      .contextFor(current.audio)
      .createBuffer(2, frames, info.sampleRate);
    for (let from = first; from < end; from += info.sampleRate) {
      const to = Math.min(end, from + info.sampleRate);
      const lease = await provider.acquire(from, to, { signal });
      try {
        if (
          lease.channels.length !== 2 ||
          lease.channels.some((channel) => channel.length !== to - from)
        )
          throw new Error('The crossfade audio buffer is incomplete.');
        for (let channel = 0; channel < 2; channel++)
          buffer.copyToChannel(lease.channels[channel], channel, from - first);
      } finally {
        lease.release();
      }
    }
    return { buffer, duration, start: first / info.sampleRate };
  } finally {
    await provider.dispose();
  }
}
