import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AudioPreview } from '../scripts/audio-preview';
import { MixerTransport } from './MixerTransport';
import { artworkFilter } from '../../../src/appearance/artwork-filter.js';
import {
  peakProtectionKey,
  readPeakProtection,
} from '../../../src/audio/pitch-quality.mjs';

type Props = {
  name: 'A' | 'B';
  embedded: boolean;
  expanded: boolean;
  onExpand: () => void;
  seed: string;
  command: { track: string; id: number } | null;
  bus: () => { context: AudioContext; level: GainNode };
  onSound: () => void;
};

function trackUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(
      url.hostname,
    ) ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/[\w-]+\/[\w-]+\/?$/.test(url.pathname)
  )
    throw new Error('Enter a public SoundCloud track URL.');
  return 'https://soundcloud.com' + url.pathname;
}

export function MixerDeck({
  name,
  embedded,
  expanded,
  onExpand,
  seed,
  command,
  bus,
  onSound,
}: Props) {
  const [url, setUrl] = useState(seed);
  const [song, setSong] = useState<{
    title: string;
    artist?: string;
    artwork?: string;
  } | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tempo, setTempo] = useState(1);
  const [shift, setShift] = useState(0);
  const [lock, setLock] = useState(false);
  const player = useRef<AudioPreview | null>(null);
  const events = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);

  function getPlayer() {
    if (player.current) return player.current;
    const audio = new AudioPreview(
      setStatus,
      (message) => {
        setStatus(message);
        setPlaying(false);
        setSong(null);
      },
      bus(),
    );
    player.current = audio;
    audio.apply(tempo, lock, shift);
    audio.setPeakProtection(readPeakProtection());
    events.current = new AbortController();
    const options = { signal: events.current.signal };
    audio.audio.addEventListener(
      'timeupdate',
      () => setTime(audio.audio.currentTime),
      options,
    );
    audio.audio.addEventListener(
      'playing',
      () => {
        setPlaying(true);
        onSound();
      },
      options,
    );
    for (const event of ['pause', 'ended'])
      audio.audio.addEventListener(event, () => setPlaying(false), options);
    window.addEventListener(
      'storage',
      (event) => {
        if (!event.key || event.key === peakProtectionKey)
          audio.setPeakProtection(readPeakProtection());
      },
      options,
    );
    return audio;
  }

  useEffect(
    () => () => {
      generation.current++;
      events.current?.abort();
      player.current?.dispose();
    },
    [],
  );

  useEffect(() => {
    player.current?.apply(tempo, lock, shift);
  }, [tempo, lock, shift]);

  async function load(file?: File, requestedUrl?: string) {
    let link = '';
    if (!file) {
      try {
        link = trackUrl((requestedUrl ?? url).trim());
      } catch {
        setStatus('Enter a public SoundCloud track URL.');
        return;
      }
    }
    if (requestedUrl) setUrl(link);
    const request = ++generation.current;
    setLoading(true);
    setSong(null);
    setTime(0);
    setDuration(0);
    setPlaying(false);
    setStatus('Loading track…');
    try {
      const deck = getPlayer();
      if (file) {
        await deck.loadFile(file);
        if (request !== generation.current) return;
        setSong({ title: file.name });
        setStatus('');
      } else {
        const track = await deck.loadLink(link);
        if (!track || request !== generation.current) return;
        setSong({
          title: track.title,
          artist: track.artist,
          artwork: track.artwork?.startsWith('https://')
            ? track.artwork
            : undefined,
        });
        setStatus(track.preview ? 'SoundCloud preview' : '');
      }
      setDuration(deck.audio.duration);
    } catch (error) {
      if (request === generation.current)
        setStatus(
          error instanceof Error ? error.message : 'Track could not be loaded.',
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (command) void load(undefined, command.track);
  }, [command]);

  useEffect(() => {
    if (seed && window.parent !== window) void load(undefined, seed);
  }, []);

  function play() {
    const deck = player.current;
    if (!deck || !song) return;
    const request = generation.current;
    void deck.play().catch((error) => {
      if (request === generation.current && error.name !== 'AbortError')
        setStatus('Playback could not start. Press Play to retry.');
    });
  }

  const filter = artworkFilter(tempo, shift, lock);
  return (
    <section
      className="mixer-deck"
      data-expanded={embedded && expanded}
      aria-label={'Deck ' + name}
    >
      <header className="deck-heading">
        <h2>Deck {name}</h2>
        {embedded && (
          <button
            className="deck-expand"
            type="button"
            aria-expanded={expanded}
            aria-label={
              (expanded ? 'Hide' : 'Show') + ' deck ' + name + ' controls'
            }
            onClick={onExpand}
          >
            {expanded ? 'Less' : 'More'}
          </button>
        )}
        <span
          className="deck-light"
          data-playing={playing}
          aria-hidden="true"
        />
      </header>
      <div className="deck-track">
        <div className="deck-sleeve" aria-hidden="true">
          {song?.artwork ? (
            <img
              src={song.artwork}
              alt=""
              style={{ filter }}
              onError={() =>
                setSong((current) =>
                  current?.artwork === song.artwork && current
                    ? { ...current, artwork: undefined }
                    : current,
                )
              }
            />
          ) : (
            <span className="deck-record" />
          )}
        </div>
        <div className="deck-track-text">
          <h3>{song?.title ?? 'No track loaded'}</h3>
          {song?.artist && <p>{song.artist}</p>}
        </div>
      </div>
      <form
        className="deck-source"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label htmlFor={'deck-url-' + name}>SoundCloud track URL</label>
        <div className="deck-source-row">
          <input
            id={'deck-url-' + name}
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" disabled={!url.trim()}>
            Load
          </button>
        </div>
      </form>
      <div className="deck-file-row">
        <button
          type="button"
          className="deck-file"
          onClick={() => fileInput.current?.click()}
        >
          Open audio file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void load(file);
          }}
        />
        <span role="status" className="deck-status">
          {status}
        </span>
      </div>
      <MixerTransport
        deck={name}
        ready={Boolean(song) && !loading}
        playing={playing}
        time={time}
        duration={duration}
        play={play}
        pause={() => player.current?.audio.pause()}
        seek={(seconds) => {
          if (player.current && song) {
            player.current.audio.currentTime = seconds;
            setTime(seconds);
          }
        }}
      />
      <div className="deck-adjustments">
        <label>
          Tempo <output>{Number(tempo.toFixed(3))}×</output>
          <input
            aria-label={'Deck ' + name + ' tempo'}
            type="range"
            min={0.5}
            max={2}
            step={0.005}
            value={tempo}
            style={
              {
                '--range-fill': ((tempo - 0.5) / 1.5) * 100 + '%',
              } as CSSProperties
            }
            onChange={(e) => setTempo(e.target.valueAsNumber)}
          />
        </label>
        <label>
          Pitch{' '}
          <output>
            {shift > 0 ? '+' : ''}
            {shift} st
          </output>
          <input
            aria-label={'Deck ' + name + ' pitch'}
            type="range"
            min={-12}
            max={12}
            step={0.25}
            value={shift}
            style={
              {
                '--range-fill': ((shift + 12) / 24) * 100 + '%',
              } as CSSProperties
            }
            onChange={(e) => setShift(e.target.valueAsNumber)}
          />
        </label>
      </div>
      <label className="deck-lock">
        <input
          type="checkbox"
          checked={lock}
          onChange={(e) => setLock(e.target.checked)}
        />
        Preserve key at different tempos
      </label>
    </section>
  );
}
