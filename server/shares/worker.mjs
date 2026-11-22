import { spawn } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSoundCloud } from '../soundcloud.mjs';
import { renderPcm, SAMPLE_RATE, MAX_SOURCE_SECONDS } from './audio.mjs';
import { downloadMedia } from './download.mjs';
import { renderSet } from './set-worker.mjs';
import { formatPitchNotice } from '../../src/sharing/tempo-pitch-notice.js';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
export function runFfmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-threads',
        '1',
        '-filter_threads',
        '1',
        ...args,
      ],
      {
        windowsHide: true,
        stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'],
      },
    );
    let detail = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
    if (input)
      pipeline(
        Readable.from(input, { objectMode: false, highWaterMark: 128 * 1024 }),
        child.stdin,
      ).catch((error) => {
        child.kill('SIGKILL');
        reject(error);
      });
    child.stderr.on('data', (chunk) => {
      detail = (detail + chunk).slice(-2000);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('Audio conversion failed: ' + detail));
    });
  });
}

async function render(directory) {
  const file = (name) => path.join(directory, name);
  const profile = JSON.parse(await readFile(file('profile.json'), 'utf8'));
  if (profile.tracks) return renderSet(directory, profile, runFfmpeg);
  const track = await createSoundCloud().resolve(
    'https://soundcloud.com' + profile.track,
    AbortSignal.timeout(35000),
  );
  if (
    track.preview ||
    track.duration > MAX_SOURCE_SECONDS ||
    Math.abs(track.duration - profile.duration) >
      Math.max(2, track.duration * 0.01)
  )
    throw new Error(
      'A full track matching this timeline is required, up to 15 minutes.',
    );
  await downloadMedia(track.stream, file('source.audio'), {
    hls: track.format === 'hls',
    signal: AbortSignal.timeout(120000),
  });
  await runFfmpeg([
    '-protocol_whitelist',
    'file,pipe',
    '-format_whitelist',
    'aac,mp3,mpegts,mov,ogg,flac',
    '-i',
    file('source.audio'),
    '-map',
    '0:a:0',
    '-vn',
    '-t',
    String(MAX_SOURCE_SECONDS + 1),
    '-ac',
    '2',
    '-ar',
    String(SAMPLE_RATE),
    '-f',
    'f32le',
    file('source.pcm'),
  ]);
  const duration = await renderPcm(
    file('source.pcm'),
    file('adjusted.pcm'),
    profile,
  );
  if (track.artwork) {
    await downloadMedia(track.artwork, file('artwork.image'), {
      maxBytes: 5 * 1024 * 1024,
      signal: AbortSignal.timeout(20000),
    });
    await runFfmpeg([
      '-max_alloc',
      '67108864',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      file('artwork.image'),
      '-vf',
      'scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2:color=0x111111,setsar=1',
      '-frames:v',
      '1',
      '-update',
      '1',
      file('poster.jpg'),
    ]);
  } else {
    await runFfmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=0x111111:s=640x640',
      '-frames:v',
      '1',
      '-update',
      '1',
      file('poster.jpg'),
    ]);
  }
  const filterPath = (filename) =>
    filename
      .replaceAll('\\', '/')
      .replaceAll(':', '\\:')
      .replaceAll("'", "\\'");
  const words = (value, width) =>
    String(value)
      .replace(/[\r\n\0]/g, ' ')
      .slice(0, width * 2)
      .match(new RegExp(`.{1,${width}}(?:\\s|$)|.{1,${width}}`, 'gu'))
      ?.map((line) => line.trim())
      .slice(0, 2)
      .join('\n') || '';
  const range = (values, unit) => {
    const min = Math.min(...values),
      max = Math.max(...values);
    return min === max ? `${min}${unit}` : `${min} to ${max}${unit}`;
  };
  const font =
    process.env.SHARE_FONT_PATH ||
    (process.platform === 'win32'
      ? 'C:/Windows/Fonts/arial.ttf'
      : '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf');
  const text = (filename, size, y, color = '0xf4f4f4', x = 24) =>
    `drawtext=fontfile='${filterPath(font)}':textfile='${filterPath(filename)}':expansion=none:fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`;
  const fit = (value, size) =>
    Math.floor(
      Math.min(
        size,
        592 / Math.max(1, ...value.split('\n').map((line) => line.length)),
      ),
    );
  const titleText = words(track.title, 40);
  const artistText = words(track.artist, 50).split('\n')[0];
  const tempo = range(
    profile.points.map((point) => point.r),
    'x',
  );
  const semitone = range(
    profile.pitchPoints?.map((point) => point.k) || [profile.keyShift || 0],
    ' st',
  );
  const settingsText = `Tempo ${tempo}   Semitone ${semitone}   ${profile.pitch === 'preserve' ? 'Preserve key' : 'Natural pitch'}`;
  const notice = formatPitchNotice(
    profile.pitchPoints?.map((point) => point.k) || profile.keyShift || 0,
  );
  await writeFile(file('title.txt'), titleText);
  await writeFile(file('artist.txt'), artistText);
  await writeFile(file('settings.txt'), settingsText);
  if (notice) await writeFile(file('pitch-notice.txt'), notice);
  const noticeFilter = [
    '-vf',
    [
      'drawbox=x=0:y=476:w=640:h=164:color=0x141414@0.94:t=fill',
      'drawbox=x=0:y=476:w=640:h=1:color=0x383838:t=fill',
      'drawbox=x=0:y=476:w=4:h=164:color=0xff5500:t=fill',
      text(file('title.txt'), fit(titleText, 22), 492, '0xf4f4f4', 24),
      text(file('artist.txt'), fit(artistText, 18), 550, '0xb2b2b2', 24),
      'drawbox=x=24:y=582:w=592:h=34:color=0x202020:t=fill',
      'drawbox=x=24:y=582:w=592:h=34:color=0x383838:t=1',
      'drawbox=x=24:y=582:w=3:h=34:color=0xff5500:t=fill',
      text(file('settings.txt'), fit(settingsText, 16), 591, '0xff8547', 38),
      ...(notice
        ? [text(file('pitch-notice.txt'), 12, 622, '0x9e9e9e', 24)]
        : []),
    ].join(','),
  ];
  await runFfmpeg([
    '-loop',
    '1',
    '-framerate',
    '1',
    '-i',
    file('poster.jpg'),
    '-f',
    'f32le',
    '-ar',
    String(SAMPLE_RATE),
    '-ac',
    '2',
    '-i',
    file('adjusted.pcm'),
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    ...noticeFilter,
    '-c:v',
    'libx264',
    '-threads',
    '1',
    '-preset',
    'ultrafast',
    '-tune',
    'stillimage',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-t',
    String(duration),
    '-movflags',
    '+faststart',
    file('audio.mp4'),
  ]);
  if ((await stat(file('audio.mp4'))).size > 48 * 1024 * 1024)
    throw new Error('The rendered file exceeds the sharing limit.');
  await writeFile(
    file('result.json'),
    JSON.stringify({ title: track.title, artist: track.artist, duration }),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  render(process.argv[2]).catch(async (error) => {
    const message = /conversion failed/.test(error.message)
      ? 'The audio could not be converted. Try another track.'
      : error.message;
    await writeFile(
      path.join(process.argv[2], 'error.json'),
      JSON.stringify({ error: message }),
    ).catch(() => {});
    process.exitCode = 1;
  });
}
