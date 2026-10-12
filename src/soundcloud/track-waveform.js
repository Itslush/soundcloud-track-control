const MAX_JSON_BYTES = 128 * 1024;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export function waveformTrack(value) {
  const url = new URL(value, 'https://soundcloud.com');
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'soundcloud.com' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^\/[^/]+\/[^/]+\/?$/.test(url.pathname)
  )
    throw new TypeError('A public SoundCloud track is required.');
  return url.origin + url.pathname.replace(/\/$/, '');
}

export function waveformData(data) {
  if (
    !data ||
    !Number.isInteger(data.width) ||
    data.width < 1 ||
    data.width > 16384 ||
    !Number.isFinite(data.height) ||
    data.height <= 0 ||
    data.height > 65535 ||
    !Array.isArray(data.samples) ||
    data.samples.length !== data.width ||
    data.samples.some(
      (value) => !Number.isFinite(value) || value < 0 || value > data.height,
    )
  )
    throw new TypeError('The waveform data is invalid.');
  return Float32Array.from(data.samples, (value) => value / data.height);
}

async function boundedText(response, limit, signal) {
  if (
    !response.ok ||
    Number(response.headers.get('content-length')) > limit ||
    !response.body
  )
    throw new Error('Waveform data is unavailable.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    text = '';
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit)
        throw new Error('Waveform data exceeds its size limit.');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function matchingMetadata(items, track) {
  if (!Array.isArray(items)) return null;
  return (
    items.find((item) => {
      try {
        return (
          item?.hydratable === 'sound' &&
          waveformTrack(item.data?.permalink_url) === track
        );
      } catch {
        return false;
      }
    })?.data || null
  );
}

export function createWaveformLoader({
  document = globalThis.document,
  fetch = globalThis.fetch,
} = {}) {
  const cache = new Map(),
    active = new Set();
  let disposed = false;
  return {
    async load(value, { signal, metadata } = {}) {
      const track = waveformTrack(value);
      signal?.throwIfAborted();
      if (disposed) throw new DOMException('Waveform disposed.', 'AbortError');
      if (cache.has(track)) return cache.get(track);
      if (
        [...active].filter((controller) => !controller.signal.aborted).length >=
        2
      )
        throw new Error('Waveform loading is busy.');
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(
        () => controller.abort(new Error('Waveform loading timed out.')),
        8000,
      );
      active.add(controller);
      try {
        if (metadata && waveformTrack(metadata.permalink_url) !== track)
          throw new TypeError('Waveform metadata belongs to another track.');
        metadata ||= matchingMetadata(
          document?.defaultView?.__sc_hydration,
          track,
        );
        if (!metadata) {
          if (document?.location?.origin !== 'https://soundcloud.com')
            throw new Error('Waveform metadata is unavailable.');
          const response = await fetch(track, {
            signal: controller.signal,
            credentials: 'omit',
            redirect: 'error',
          });
          const html = await boundedText(
            response,
            MAX_PAGE_BYTES,
            controller.signal,
          );
          const hydration = html.match(
            /window\.__sc_hydration\s*=\s*(\[.*?\]);/s,
          );
          metadata =
            hydration && matchingMetadata(JSON.parse(hydration[1]), track);
        }
        if (
          !metadata ||
          !Number.isFinite(metadata.duration) ||
          metadata.duration <= 0
        )
          throw new Error('Waveform metadata is unavailable.');
        const url = new URL(metadata.waveform_url);
        if (
          url.protocol !== 'https:' ||
          url.hostname !== 'wave.sndcdn.com' ||
          url.username ||
          url.password ||
          url.port ||
          url.search ||
          url.hash ||
          !/^\/[\w-]+\.json$/.test(url.pathname)
        )
          throw new TypeError('The waveform host is unsupported.');
        const response = await fetch(url.href, {
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
        });
        const text = await boundedText(
          response,
          MAX_JSON_BYTES,
          controller.signal,
        );
        const result = {
          samples: waveformData(JSON.parse(text)),
          duration: metadata.duration / 1000,
        };
        controller.signal.throwIfAborted();
        cache.set(track, result);
        if (cache.size > 3) cache.delete(cache.keys().next().value);
        return result;
      } finally {
        clearTimeout(timeout);
        active.delete(controller);
        signal?.removeEventListener('abort', abort);
      }
    },
    dispose() {
      disposed = true;
      for (const controller of active) controller.abort();
      cache.clear();
    },
  };
}
