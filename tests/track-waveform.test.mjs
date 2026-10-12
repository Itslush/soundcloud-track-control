import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWaveformLoader,
  waveformData,
  waveformTrack,
} from '../src/soundcloud/track-waveform.js';
import {
  envelopeColumns,
  waveformTime,
} from '../src/controls/tempo-waveform.js';

const track = 'https://soundcloud.com/artist/track';
const metadata = {
  permalink_url: track,
  waveform_url: 'https://wave.sndcdn.com/abc_m.json',
  duration: 10000,
};
const payload = { width: 4, height: 100, samples: [0, 20, 100, 50] };
const response = (data) => new Response(JSON.stringify(data));

test('normalizes real envelope amplitudes and preserves maxima during downsampling', () => {
  const samples = waveformData(payload);
  assert.deepEqual(Array.from(envelopeColumns(samples, 10, 0, 10, 2)), [
    samples[1],
    1,
  ]);
  assert.deepEqual(Array.from(envelopeColumns(samples, 10, -5, 10, 4)), [
    0,
    0,
    0,
    samples[1],
  ]);
  assert.equal(envelopeColumns(samples, 10, 0, 10, 9999).length, 1024);
  assert.equal(waveformTime(91.9), '1:31');
});

test('rejects fabricated, unbounded or malformed amplitudes and private URLs', () => {
  for (const invalid of [
    { ...payload, width: 5 },
    { ...payload, height: 0 },
    { ...payload, samples: [0, -1, 100, 50] },
    { ...payload, samples: [0, Infinity, 100, 50] },
    { ...payload, width: 16385 },
  ])
    assert.throws(() => waveformData(invalid));
  for (const url of [
    'http://soundcloud.com/a/b',
    'https://other.com/a/b',
    'https://soundcloud.com/a/b?secret_token=x',
    'https://soundcloud.com/a',
    'https://user@soundcloud.com/a/b',
  ])
    assert.throws(() => waveformTrack(url));
});

test('loads compact JSON only, caches bounded tracks and rejects identity/host mismatches', async () => {
  const urls = [];
  const loader = createWaveformLoader({
    fetch: async (url, options) => {
      urls.push(url);
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      return response(payload);
    },
  });
  const result = await loader.load(track, { metadata });
  assert.equal(result.duration, 10);
  assert.equal(await loader.load(track, { metadata }), result);
  assert.deepEqual(urls, [metadata.waveform_url]);
  await assert.rejects(
    loader.load('/artist/mismatch', { metadata }),
    /another track/,
  );
  await assert.rejects(
    loader.load('/artist/badhost', {
      metadata: {
        ...metadata,
        permalink_url: 'https://soundcloud.com/artist/badhost',
        waveform_url: 'https://evil.com/abc.json',
      },
    }),
    /host/,
  );
  for (let i = 0; i < 3; i++)
    await loader.load(`/artist/track${i}`, {
      metadata: {
        ...metadata,
        permalink_url: `https://soundcloud.com/artist/track${i}`,
      },
    });
  await loader.load(track, { metadata });
  assert.equal(urls.length, 5);
  loader.dispose();
  await assert.rejects(loader.load(track, { metadata }), {
    name: 'AbortError',
  });
});

test('reads identity-matched public hydration, and same-origin HTML only as fallback', async () => {
  const hydration = [{ hydratable: 'sound', data: metadata }];
  const direct = createWaveformLoader({
    document: { defaultView: { __sc_hydration: hydration } },
    fetch: async (url) => {
      assert.equal(url, metadata.waveform_url);
      return response(payload);
    },
  });
  await direct.load(track);
  direct.dispose();
  const urls = [];
  const fallback = createWaveformLoader({
    document: { location: { origin: 'https://soundcloud.com' } },
    fetch: async (url) => {
      urls.push(url);
      return url === track
        ? new Response(
            `<script>window.__sc_hydration = ${JSON.stringify(hydration)};</script>`,
          )
        : response(payload);
    },
  });
  await fallback.load(track);
  assert.deepEqual(urls, [track, metadata.waveform_url]);
  fallback.dispose();
});

test('caps concurrency, propagates cancellation and rejects oversized streamed bodies', async () => {
  let requested = 0;
  const loader = createWaveformLoader({
    fetch: (_url, { signal }) => {
      requested++;
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        }),
      );
    },
  });
  const first = new AbortController(),
    second = new AbortController();
  const a = loader.load(track, { signal: first.signal, metadata });
  const b = loader.load('/artist/two', {
    signal: second.signal,
    metadata: {
      ...metadata,
      permalink_url: 'https://soundcloud.com/artist/two',
    },
  });
  await assert.rejects(loader.load('/artist/three', { metadata }), /busy/);
  assert.equal(requested, 2);
  first.abort();
  second.abort();
  await assert.rejects(a, { name: 'AbortError' });
  await assert.rejects(b, { name: 'AbortError' });
  loader.dispose();
  const huge = createWaveformLoader({
    fetch: async () => new Response('x'.repeat(128 * 1024 + 1)),
  });
  await assert.rejects(huge.load(track, { metadata }), /size limit/);
  huge.dispose();
});
