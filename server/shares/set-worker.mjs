import { writeFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { createSoundCloud } from '../soundcloud.mjs';
import { renderPcm, SAMPLE_RATE, MAX_SOURCE_SECONDS } from './audio.mjs';
import { downloadMedia } from './download.mjs';
import { stitchPcm, setTimings, artworkFrames } from './set-media.mjs';
import { formatPitchNotice } from '../../src/sharing/tempo-pitch-notice.js';

const filterPath = (filename) =>
  filename.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'");
const words = (value, width) =>
  String(value)
    .replace(/[\r\n\0]/g, ' ')
    .slice(0, width * 2)
    .match(new RegExp(`.{1,${width}}(?:\\s|$)|.{1,${width}}`, 'gu'))
    ?.map((line) => line.trim())
    .slice(0, 2)
    .join('\n') || '';

export async function renderSet(
  directory,
  set,
  convert,
  resolve = createSoundCloud().resolve,
) {
  const file = (name) => path.join(directory, name);
  const adjusted = [];
  const artwork = [];
  const tracks = [];
  const font =
    process.env.SHARE_FONT_PATH ||
    (process.platform === 'win32'
      ? 'C:/Windows/Fonts/arial.ttf'
      : '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf');
  const text = (filename, size, y, color = '0xf4f4f4', x = 24) =>
    `drawtext=fontfile='${filterPath(font)}':textfile='${filterPath(filename)}':expansion=none:fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`;
  let sourceSeconds = 0;
  let decodedSeconds = 0;
  for (const [index, profile] of set.tracks.entries()) {
    const track = await resolve(
      'https://soundcloud.com' + profile.track,
      AbortSignal.timeout(35000),
    );
    sourceSeconds += track.duration;
    if (
      track.preview ||
      sourceSeconds > MAX_SOURCE_SECONDS ||
      Math.abs(track.duration - profile.duration) >
        Math.max(2, track.duration * 0.01)
    )
      throw new Error(
        'A set needs full public tracks totalling no more than 15 minutes.',
      );
    await downloadMedia(track.stream, file('source.audio'), {
      hls: track.format === 'hls',
      signal: AbortSignal.timeout(120000),
    });
    await convert([
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
    decodedSeconds += (await stat(file('source.pcm'))).size / (SAMPLE_RATE * 8);
    if (decodedSeconds > MAX_SOURCE_SECONDS)
      throw new Error('The original set audio exceeds the 15-minute limit.');
    const output = file(`track-${index}.pcm`);
    const duration = await renderPcm(file('source.pcm'), output, profile);
    adjusted.push(output);
    await rm(file('source.audio'));
    await rm(file('source.pcm'));
    const titleFile = file(`title-${index}.txt`);
    const artistFile = file(`artist-${index}.txt`);
    const settingsFile = file(`settings-${index}.txt`);
    const noticeFile = file(`notice-${index}.txt`);
    const range = (values, unit) => {
      const min = Math.min(...values),
        max = Math.max(...values);
      return min === max ? `${min}${unit}` : `${min} to ${max}${unit}`;
    };
    const tempo = range(
      profile.points.map((point) => point.r),
      'x',
    );
    const semitone = range(
      profile.pitchPoints?.map((point) => point.k) || [profile.keyShift || 0],
      ' st',
    );
    const title = words(track.title, 40);
    const artist = words(track.artist, 50).split('\n')[0];
    const settings = `${index + 1}/${set.tracks.length}   Tempo ${tempo}   Semitone ${semitone}`;
    await writeFile(titleFile, title);
    await writeFile(artistFile, artist);
    await writeFile(settingsFile, settings);
    const notice = formatPitchNotice(
      profile.pitchPoints?.map((point) => point.k) || profile.keyShift || 0,
    );
    await writeFile(noticeFile, notice);
    const fit = (value, size) =>
      Math.floor(
        Math.min(
          size,
          592 / Math.max(1, ...value.split('\n').map((line) => line.length)),
        ),
      );
    const filters = [
      'scale=640:640:force_original_aspect_ratio=decrease',
      'pad=640:640:(ow-iw)/2:(oh-ih)/2:color=0x111111',
      'setsar=1',
      'drawbox=x=0:y=476:w=640:h=164:color=0x141414@0.94:t=fill',
      'drawbox=x=0:y=476:w=640:h=1:color=0x383838:t=fill',
      'drawbox=x=0:y=476:w=4:h=164:color=0xff5500:t=fill',
      text(titleFile, fit(title, 22), 492, '0xf4f4f4', 24),
      text(artistFile, fit(artist, 18), 550, '0xb2b2b2', 24),
      'drawbox=x=24:y=582:w=592:h=34:color=0x202020:t=fill',
      'drawbox=x=24:y=582:w=592:h=34:color=0x383838:t=1',
      'drawbox=x=24:y=582:w=3:h=34:color=0xff5500:t=fill',
      text(settingsFile, fit(settings, 16), 591, '0xff8547', 38),
      ...(notice ? [text(noticeFile, 12, 622, '0x9e9e9e', 24)] : []),
    ].join(',');
    const input = track.artwork
      ? ['-protocol_whitelist', 'file,pipe', '-i', file('artwork.image')]
      : ['-f', 'lavfi', '-i', 'color=c=0x111111:s=640x640'];
    if (track.artwork)
      await downloadMedia(track.artwork, file('artwork.image'), {
        maxBytes: 5 * 1024 * 1024,
        signal: AbortSignal.timeout(20000),
      });
    const rgb = file(`artwork-${index}.rgb`);
    await convert([
      '-max_alloc',
      '67108864',
      ...input,
      '-vf',
      filters,
      '-frames:v',
      '1',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      rgb,
    ]);
    if (track.artwork) await rm(file('artwork.image'));
    artwork.push(rgb);
    tracks.push({
      title: track.title,
      artist: track.artist,
      track: profile.track,
      duration,
      tempo,
      semitone,
    });
  }
  const durations = stitchPcm(adjusted, file('adjusted.pcm'), set.overlaps);
  const footers = [];
  for (let index = 0; index < tracks.length - 1; index++) {
    const labels = [
      tracks[index].title,
      tracks[index].artist,
      tracks[index + 1].title,
      tracks[index + 1].artist,
      `${tracks[index].tempo} to ${tracks[index + 1].tempo}   ${formatPitchNotice(set.tracks.slice(index, index + 2).flatMap((profile) => profile.pitchPoints?.map((point) => point.k) || [profile.keyShift || 0])) || 'Pitch unchanged'}`,
    ];
    const filters = [
      'drawbox=x=0:y=476:w=640:h=164:color=0x141414:t=fill',
      'drawbox=x=0:y=476:w=640:h=1:color=0x383838:t=fill',
      'drawbox=x=0:y=476:w=4:h=164:color=0xff5500:t=fill',
      'drawbox=x=24:y=592:w=592:h=32:color=0x202020:t=fill',
      'drawbox=x=24:y=592:w=592:h=32:color=0x383838:t=1',
      'drawbox=x=24:y=592:w=3:h=32:color=0xff5500:t=fill',
    ];
    const rowColors = [
      '0x9e9e9e',
      '0x7a7a7a',
      '0xf4f4f4',
      '0xb2b2b2',
      '0xff8547',
    ];
    const rowYs = [488, 512, 538, 566, 600];
    const rowXs = [24, 24, 24, 24, 38];
    for (const [row, label] of labels.entries()) {
      const filename = file(`join-${index}-${row}.txt`);
      const line = words(label, 50).split('\n')[0];
      await writeFile(filename, line);
      const size = Math.floor(
        Math.min(
          row === 2 ? 20 : row === 0 ? 18 : 15,
          576 / Math.max(1, line.length),
        ),
      );
      filters.push(
        text(filename, size, rowYs[row], rowColors[row], rowXs[row]),
      );
    }
    const footer = file(`join-${index}.rgb`);
    await convert([
      '-f',
      'lavfi',
      '-i',
      'color=c=0x111111:s=640x640',
      '-vf',
      filters.join(','),
      '-frames:v',
      '1',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      footer,
    ]);
    footers.push(footer);
  }
  const timings = setTimings(durations, set.overlaps);
  const duration = timings.at(-1).start + timings.at(-1).duration;
  for (const filename of adjusted) await rm(filename);
  await convert([
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-video_size',
    '640x640',
    '-i',
    artwork[0],
    '-frames:v',
    '1',
    '-update',
    '1',
    file('poster.jpg'),
  ]);
  await convert(
    [
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-video_size',
      '640x640',
      '-framerate',
      '4',
      '-i',
      'pipe:0',
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
      '-c:v',
      'libx264',
      '-threads',
      '1',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
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
    ],
    artworkFrames(artwork, timings, set.overlaps, 4, footers),
  );
  if ((await stat(file('audio.mp4'))).size > 48 * 1024 * 1024)
    throw new Error('The rendered file exceeds the sharing limit.');
  await writeFile(
    file('result.json'),
    JSON.stringify({
      title: tracks
        .map((track) => track.title)
        .join(' / ')
        .slice(0, 300),
      artist: [...new Set(tracks.map((track) => track.artist))]
        .join(' / ')
        .slice(0, 200),
      duration,
      overlaps: set.overlaps,
      tracks: tracks.map((track, index) => ({ ...track, ...timings[index] })),
    }),
  );
}
