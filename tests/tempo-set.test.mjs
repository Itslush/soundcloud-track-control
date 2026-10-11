import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  stat,
  mkdir,
  truncate,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  validateTempoSet,
  encodeTempoSet,
  decodeTempoSet,
  adjustedDuration,
  tempoSetLink,
} from '../src/tempo-set.js';
import { parseRenderCode, createShareStore } from '../server/shares/store.mjs';
import {
  stitchPcm,
  setTimings,
  artworkFrames,
} from '../server/shares/set-media.mjs';
import { SAMPLE_RATE, renderPcm } from '../server/shares/audio.mjs';

const track = (duration = 4, rate = 1, name = 'first') => ({
  v: 1,
  track: '/artist/' + name,
  duration,
  points: [{ t: 0, r: rate, d: 0, c: 'instant' }],
  pitch: 'preserve',
  keyShift: -4.5,
});
const parseTrack = (value) => (/^\/[\w-]+\/[\w-]+$/.test(value) ? value : '');
const set = { v: 1, tracks: [track(), track(4, 1, 'second')], overlaps: [2] };

test('set codec preserves both automation lanes, bounds the whole set and rejects private paths', () => {
  const automated = {
    ...set,
    tracks: [
      {
        ...track(),
        points: [
          { t: 0, r: 0.75, d: 0, c: 'instant' },
          { t: 3, r: 1.5, d: 2, c: 'smooth' },
        ],
        pitchPoints: [
          { t: 0, k: -4.5, d: 0, c: 'instant' },
          { t: 3, k: 0.5, d: 2, c: 'linear' },
        ],
      },
      track(4, 1, 'second'),
    ],
  };
  const canonical = validateTempoSet(automated, parseTrack);
  assert.deepEqual(
    decodeTempoSet(encodeTempoSet(canonical), parseTrack),
    canonical,
  );
  assert.deepEqual(parseRenderCode(encodeTempoSet(canonical)), canonical);
  assert.equal(
    new URL(tempoSetLink(canonical, 'https://site.example/')).hash,
    '#scs=' + encodeTempoSet(canonical),
  );
  assert.equal(
    new URL(tempoSetLink(canonical, 'https://site.example/base/')).pathname,
    '/base/set/',
  );
  assert.throws(() => decodeTempoSet('SCT1.bad', parseTrack));
  for (const invalid of [
    { ...set, tracks: [track()] },
    {
      ...set,
      tracks: Array.from({ length: 11 }, () => track()),
      overlaps: Array(10).fill(0),
    },
    { ...set, overlaps: [] },
    { ...set, overlaps: [-1] },
    { ...set, overlaps: [11] },
    { ...set, overlaps: [NaN] },
    { ...set, overlaps: [5] },
    { ...set, tracks: [track(500), track(401)], overlaps: [0] },
    { ...set, tracks: [track(900, 0.25), track()], overlaps: [2] },
    { ...set, tracks: [track(500, 0.5), track(400, 0.499)], overlaps: [10] },
    {
      ...set,
      tracks: [track(), track(4, 1, 'second'), track(4, 1, 'third')],
      overlaps: [3, 3],
    },
    { ...set, tracks: [{ ...track(), track: '/../../etc' }, track()] },
    { ...set, tracks: [{ ...track(), keyShift: 13 }, track()] },
  ])
    assert.throws(() => parseRenderCode(encodeTempoSet(invalid)));
});

test('duration budgeting includes curved tempo ramps rather than only first or average rate', () => {
  assert.equal(adjustedDuration(track(4, 0.5)), 8);
  const ramp = {
    ...track(),
    points: [
      { t: 0, r: 0.5, d: 0, c: 'instant' },
      { t: 4, r: 1.5, d: 4, c: 'linear' },
    ],
  };
  assert.ok(Math.abs(adjustedDuration(ramp) - 4 * Math.log(3)) < 0.00001);
  assert.deepEqual(setTimings([4, 5, 6], [2, 1]), [
    { start: 0, duration: 4 },
    { start: 2, duration: 5 },
    { start: 6, duration: 6 },
  ]);
});

test('bounded PCM stitching has audible overlap, exact endpoints, stereo and gapless zero joins', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tempo-set-pcm-'));
  try {
    const pcm = (left, right) => {
      const value = Buffer.alloc(4 * SAMPLE_RATE * 8);
      for (let i = 0; i < 4 * SAMPLE_RATE; i++) {
        value.writeFloatLE(left, i * 8);
        value.writeFloatLE(right, i * 8 + 4);
      }
      return value;
    };
    const first = path.join(dir, 'first.pcm'),
      second = path.join(dir, 'second.pcm');
    await writeFile(first, pcm(0.2, 0));
    await writeFile(second, pcm(0, 0.4));
    const output = path.join(dir, 'mixed.pcm');
    assert.deepEqual(stitchPcm([first, second], output, [2]), [4, 4]);
    const value = await readFile(output);
    assert.equal(value.length, 6 * SAMPLE_RATE * 8);
    const sample = (seconds, channel) =>
      value.readFloatLE(Math.round(seconds * SAMPLE_RATE) * 8 + channel * 4);
    assert.ok(Math.abs(sample(1, 0) - 0.2) < 0.00001);
    assert.ok(Math.abs(sample(3, 0) - 0.1) < 0.00001);
    assert.ok(Math.abs(sample(3, 1) - 0.2) < 0.00001);
    assert.ok(Math.abs(sample(5, 1) - 0.4) < 0.00001);
    stitchPcm([first, second], path.join(dir, 'gapless.pcm'), [0]);
    assert.equal(
      (await stat(path.join(dir, 'gapless.pcm'))).size,
      8 * SAMPLE_RATE * 8,
    );
    assert.throws(
      () => stitchPcm([first, second], path.join(dir, 'invalid.pcm'), [5]),
      /fit/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('short adjusted tracks remain valid with gapless and short crossfade joins', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tempo-set-short-'));
  try {
    const source = path.join(dir, 'source.pcm');
    const pcm = Buffer.alloc(2 * SAMPLE_RATE * 8);
    for (let frame = 0; frame < 2 * SAMPLE_RATE; frame++)
      for (let channel = 0; channel < 2; channel++)
        pcm.writeFloatLE(
          0.2 * Math.sin((frame * 2 * Math.PI * 440) / SAMPLE_RATE),
          frame * 8 + channel * 4,
        );
    await writeFile(source, pcm);
    const profiles = [track(2, 4), track(2, 4, 'second')];
    const files = [path.join(dir, 'first.pcm'), path.join(dir, 'second.pcm')];
    for (let index = 0; index < files.length; index++) {
      const duration = await renderPcm(source, files[index], profiles[index]);
      assert.ok(Math.abs(duration - 0.5) < 0.005);
    }
    for (const overlap of [0, 0.1]) {
      const configured = validateTempoSet(
        { v: 1, tracks: profiles, overlaps: [overlap] },
        parseTrack,
      );
      const output = path.join(dir, `mix-${overlap}.pcm`);
      const durations = stitchPcm(files, output, configured.overlaps);
      assert.ok(
        Math.abs(
          (await stat(output)).size / (SAMPLE_RATE * 8) -
            (durations[0] + durations[1] - overlap),
        ) <
          1 / SAMPLE_RATE,
      );
    }
    await writeFile(files[0], '');
    assert.throws(
      () => stitchPcm(files, path.join(dir, 'empty.pcm'), [0]),
      /invalid audio/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('actual adjusted PCM duration cannot use crossfades to evade the input budget', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tempo-set-budget-'));
  try {
    const files = [path.join(dir, 'first.pcm'), path.join(dir, 'second.pcm')];
    for (const filename of files) {
      await writeFile(filename, '');
      await truncate(filename, 901 * SAMPLE_RATE * 8);
    }
    assert.throws(
      () => stitchPcm(files, path.join(dir, 'out.pcm'), [10]),
      /30-minute/,
    );
    assert.equal(existsSync(path.join(dir, 'out.pcm')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('set store persists canonical profiles and uses the existing single-worker queue', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tempo-set-store-'));
  let work, child;
  const store = await createShareStore(dir, {
    launch: (_command, args) => {
      work = args.at(-1);
      child = new EventEmitter();
      child.kill = () => {};
      return child;
    },
  });
  try {
    const code = encodeTempoSet(set);
    const job = await store.create(code);
    assert.equal(job.state, 'rendering');
    assert.deepEqual(
      JSON.parse(await readFile(path.join(work, 'profile.json'), 'utf8')),
      set,
    );
    assert.equal((await store.create(code)).id, job.id);
    await assert.rejects(
      store.create(encodeTempoSet({ ...set, overlaps: [1] })),
      (error) => error.status === 429,
    );
  } finally {
    child?.emit('close', 1);
    store.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await rm(dir, { recursive: true, force: true });
  }
});

test('artwork keeps outgoing left and incoming right on the audio join clock', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tempo-set-art-'));
  try {
    const files = [path.join(dir, 'first.rgb'), path.join(dir, 'second.rgb')];
    await writeFile(files[0], Buffer.alloc(640 * 640 * 3, 0));
    await writeFile(files[1], Buffer.alloc(640 * 640 * 3, 200));
    let count = 0;
    for await (const frame of artworkFrames(files, setTimings([4, 4], [2]), [
      2,
    ])) {
      if (count === 4) assert.equal(frame[0], 0);
      if (count === 12) {
        assert.equal(frame[0], 0);
        assert.equal(frame[639 * 3], 200);
        assert.ok(Math.abs(frame[320 * 3] - 100) < 2);
      }
      if (count === 20) assert.equal(frame[0], 200);
      count++;
    }
    assert.equal(count, 24);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const available =
  spawnSync(ffmpeg, ['-version'], { windowsHide: true }).status === 0;
test(
  'real set worker makes a seekable AAC/H264 MP4 with both titles and crossfading covers',
  { skip: !available },
  async () => {
    const { renderSet } = await import('../server/shares/set-worker.mjs');
    const { runFfmpeg } = await import('../server/shares/worker.mjs');
    const dir = await mkdtemp(path.join(tmpdir(), 'tempo-set-video-'));
    const fetcher = globalThis.fetch;
    try {
      await runFfmpeg([
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=4',
        '-c:a',
        'libmp3lame',
        path.join(dir, 'fixture.mp3'),
      ]);
      const audio = await readFile(path.join(dir, 'fixture.mp3'));
      await runFfmpeg([
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=640x640',
        '-frames:v',
        '1',
        '-update',
        '1',
        path.join(dir, 'red.jpg'),
      ]);
      await runFfmpeg([
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=640x640',
        '-frames:v',
        '1',
        '-update',
        '1',
        path.join(dir, 'blue.jpg'),
      ]);
      const red = await readFile(path.join(dir, 'red.jpg'));
      const blue = await readFile(path.join(dir, 'blue.jpg'));
      globalThis.fetch = async (url) =>
        new Response(
          url.endsWith('red.jpg')
            ? red
            : url.endsWith('blue.jpg')
              ? blue
              : audio,
        );
      await renderSet(dir, set, runFfmpeg, async (url) => ({
        title: url.endsWith('first')
          ? 'First fixture track: 100% <title>'
          : 'Second fixture track',
        artist: url.endsWith('first') ? 'First creator' : 'Second creator',
        duration: 4,
        preview: false,
        format: 'audio',
        stream: 'https://x.sndcdn.com/fixture.mp3',
        artwork:
          'https://x.sndcdn.com/' +
          (url.endsWith('first') ? 'red.jpg' : 'blue.jpg'),
      }));
      const result = JSON.parse(
        await readFile(path.join(dir, 'result.json'), 'utf8'),
      );
      assert.equal(
        await readFile(path.join(dir, 'notice-0.txt'), 'utf8'),
        'Pitch shifted −4.5 st',
      );
      assert.equal(result.tracks.length, 2);
      assert.equal(result.tracks[0].artist, 'First creator');
      assert.equal(result.tracks[1].title, 'Second fixture track');
      assert.ok(Math.abs(result.duration - 6) < 0.01);
      assert.ok((await stat(path.join(dir, 'audio.mp4'))).size > 10000);
      assert.ok(existsSync(path.join(dir, 'poster.jpg')));
      const bytes = await readFile(path.join(dir, 'audio.mp4'));
      assert.ok(
        bytes.indexOf(Buffer.from('moov')) < bytes.indexOf(Buffer.from('mdat')),
      );
      await runFfmpeg([
        '-ss',
        '3',
        '-i',
        path.join(dir, 'audio.mp4'),
        '-frames:v',
        '1',
        '-update',
        '1',
        path.join(dir, 'middle.jpg'),
      ]);
      await runFfmpeg([
        '-i',
        path.join(dir, 'audio.mp4'),
        '-map',
        '0:a:0',
        '-f',
        'null',
        '-',
      ]);
      const evidence = path.resolve('test-results');
      await mkdir(evidence, { recursive: true });
      await runFfmpeg([
        '-y',
        '-ss',
        '3',
        '-i',
        path.join(dir, 'audio.mp4'),
        '-frames:v',
        '1',
        '-update',
        '1',
        path.join(evidence, 'set-render-fixture-overlap.png'),
      ]);
      await runFfmpeg([
        '-y',
        '-ss',
        '5',
        '-i',
        path.join(dir, 'audio.mp4'),
        '-frames:v',
        '1',
        '-update',
        '1',
        path.join(evidence, 'set-render-fixture-next.png'),
      ]);
      await runFfmpeg([
        '-ss',
        '3',
        '-i',
        path.join(dir, 'audio.mp4'),
        '-frames:v',
        '1',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        path.join(dir, 'mid.rgb'),
      ]);
      const mid = await readFile(path.join(dir, 'mid.rgb'));
      const center = (100 * 640 + 100) * 3;
      const right = (100 * 640 + 540) * 3;
      assert.ok(mid[center] > 200 && mid[center + 2] < 30);
      assert.ok(mid[right] < 30 && mid[right + 2] > 200);
    } finally {
      globalThis.fetch = fetcher;
      await rm(dir, { recursive: true, force: true });
    }
  },
);
