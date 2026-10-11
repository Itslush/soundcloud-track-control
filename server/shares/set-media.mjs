import { openSync, closeSync, readSync, writeSync, fstatSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { SAMPLE_RATE, MAX_OUTPUT_SECONDS } from './audio.mjs';

export function stitchPcm(inputs, output, overlaps) {
  const handles = [];
  let target;
  try {
    for (const input of inputs) handles.push(openSync(input, 'r'));
    const frames = handles.map((handle) => fstatSync(handle).size / 8);
    if (frames.some((count) => !Number.isInteger(count) || count <= 0))
      throw new Error('A set track has invalid audio.');
    const joins = overlaps.map((seconds) => Math.round(seconds * SAMPLE_RATE));
    if (
      joins.length !== frames.length - 1 ||
      joins.some(
        (count) =>
          !Number.isInteger(count) || count < 0 || count > 10 * SAMPLE_RATE,
      )
    )
      throw new Error('Invalid set crossfades.');
    for (let i = 0; i < frames.length; i++)
      if ((joins[i - 1] || 0) + (joins[i] || 0) > frames[i])
        throw new Error('The crossfades do not fit the adjusted audio.');
    if (frames.reduce((a, b) => a + b, 0) > MAX_OUTPUT_SECONDS * SAMPLE_RATE)
      throw new Error('The adjusted set exceeds the 30-minute render limit.');
    target = openSync(output, 'wx');
    const first = Buffer.alloc(4096 * 8);
    const second = Buffer.alloc(first.length);
    const copy = (handle, position, count, buffer) => {
      const bytes = count * 8;
      if (readSync(handle, buffer, 0, bytes, position * 8) !== bytes)
        throw new Error('A set track ended early.');
    };
    for (let track = 0; track < handles.length; track++) {
      const incoming = joins[track - 1] || 0;
      const end = frames[track] - (joins[track] || 0);
      for (let position = incoming; position < end; position += 4096) {
        const count = Math.min(4096, end - position);
        copy(handles[track], position, count, first);
        writeSync(target, first, 0, count * 8);
      }
      const join = joins[track] || 0;
      for (let position = 0; position < join; position += 4096) {
        const count = Math.min(4096, join - position);
        copy(handles[track], end + position, count, first);
        copy(handles[track + 1], position, count, second);
        for (let frame = 0; frame < count; frame++) {
          const incomingGain = join === 1 ? 1 : (position + frame) / (join - 1);
          for (let channel = 0; channel < 2; channel++) {
            const offset = frame * 8 + channel * 4;
            const value =
              first.readFloatLE(offset) * (1 - incomingGain) +
              second.readFloatLE(offset) * incomingGain;
            if (!Number.isFinite(value))
              throw new Error('A set track contains invalid audio.');
            first.writeFloatLE(value, offset);
          }
        }
        writeSync(target, first, 0, count * 8);
      }
    }
    return frames.map((count) => count / SAMPLE_RATE);
  } finally {
    for (const handle of handles) closeSync(handle);
    if (target !== undefined) closeSync(target);
  }
}

export function setTimings(durations, overlaps) {
  let start = 0;
  return durations.map((duration, index) => {
    const timing = { start, duration };
    start += duration - (overlaps[index] || 0);
    return timing;
  });
}

export async function* artworkFrames(
  files,
  timings,
  overlaps,
  fps = 4,
  footers = [],
) {
  const size = 640 * 640 * 3;
  const blended = Buffer.alloc(size);
  let index = 0;
  let current = await readFile(files[0]);
  let next = files[1] ? await readFile(files[1]) : null;
  let footer = footers[0] ? await readFile(footers[0]) : null;
  const check = (frame) => {
    if (frame && frame.length !== size)
      throw new Error('Invalid set artwork dimensions.');
  };
  check(current);
  check(next);
  check(footer);
  const end = timings.at(-1).start + timings.at(-1).duration;
  for (let frame = 0; frame < Math.ceil(end * fps); frame++) {
    const time = frame / fps;
    while (
      index < files.length - 1 &&
      time >= timings[index].start + timings[index].duration
    ) {
      index++;
      current = next;
      next = files[index + 1] ? await readFile(files[index + 1]) : null;
      footer = footers[index] ? await readFile(footers[index]) : null;
      check(next);
      check(footer);
    }
    const join = overlaps[index] || 0;
    const progress =
      next && join
        ? Math.max(0, Math.min(1, (time - timings[index + 1].start) / join))
        : 0;
    if (progress > 0) {
      for (let byte = 0; byte < size; byte++)
        blended[byte] = Math.round(
          current[byte] * (1 - progress) + next[byte] * progress,
        );
      if (footer) footer.copy(blended, 476 * 640 * 3, 476 * 640 * 3);
      yield Buffer.from(blended);
    } else yield current;
  }
}
