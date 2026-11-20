import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AudioPreview } from '../scripts/audio-preview';
import { MixerTransport } from './MixerTransport';
import { artworkFilter } from '../../../src/appearance/artwork-filter.js';
import {
  peakProtectionKey,
  readPeakProtection,
} from '../../../src/audio/pitch-quality.mjs';

export type EqBand = 'low' | 'mid' | 'high';

type DeckBus = {
  context: AudioContext;
  level: GainNode;
  setEq: (band: EqBand, db: number) => void;
  setFilter: (value: number) => void;
};

type Props = {
  name: 'A' | 'B';
  embedded: boolean;
  expanded: boolean;
  mobileActive?: boolean;
  onExpand: () => void;
  seed: string;
  command: { track: string; id: number } | null;
  bus: () => DeckBus;
  pauseSignal: number;
  onPlayingChange: (playing: boolean) => void;
  onNotice?: (message: string) => void;
};

type EqValues = Record<EqBand, number>;

const flatEq: EqValues = { low: 0, mid: 0, high: 0 };

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

function formatDb(value: number) {
  return `${value > 0 ? '+' : ''}${value} dB`;
}

function formatFilter(value: number) {
  if (value === 0) return 'Flat';
  return value < 0 ? `LPF ${Math.abs(value)}%` : `HPF ${value}%`;
}

export function MixerDeck({
  name,
  embedded,
  expanded,
  mobileActive = true,
  onExpand,
  seed,
  command,
  bus,
  pauseSignal,
  onPlayingChange,
  onNotice,
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
  const [eq, setEq] = useState<EqValues>(flatEq);
  const [djFilter, setDjFilter] = useState(0);
  const player = useRef<AudioPreview | null>(null);
  const deckBus = useRef<DeckBus | null>(null);
  const events = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const eqRef = useRef(eq);
  const djFilterRef = useRef(djFilter);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onNoticeRef = useRef(onNotice);
  eqRef.current = eq;
  djFilterRef.current = djFilter;
  onPlayingChangeRef.current = onPlayingChange;
  onNoticeRef.current = onNotice;

  function reportError(message: string) {
    setStatus(message);
    if (embedded && message) onNoticeRef.current?.(`Deck ${name}: ${message}`);
  }

  function syncToneNodes(activeBus: DeckBus | null) {
    if (!activeBus) return;
    activeBus.setEq('low', eqRef.current.low);
    activeBus.setEq('mid', eqRef.current.mid);
    activeBus.setEq('high', eqRef.current.high);
    activeBus.setFilter(djFilterRef.current);
  }

  function getPlayer() {
    if (player.current) return player.current;
    const connectedBus = bus();
    deckBus.current = connectedBus;
    syncToneNodes(connectedBus);
    const audio = new AudioPreview(
      setStatus,
      (message) => {
        reportError(message);
        setPlaying(false);
        setSong(null);
        onPlayingChangeRef.current(false);
      },
      connectedBus,
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
        onPlayingChangeRef.current(true);
      },
      options,
    );
    for (const event of ['pause', 'ended'])
      audio.audio.addEventListener(
        event,
        () => {
          setPlaying(false);
          onPlayingChangeRef.current(false);
        },
        options,
      );
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
      onPlayingChangeRef.current(false);
      events.current?.abort();
      player.current?.dispose();
    },
    [],
  );

  useEffect(() => {
    player.current?.apply(tempo, lock, shift);
  }, [tempo, lock, shift]);

  useEffect(() => {
    deckBus.current?.setEq('low', eq.low);
    deckBus.current?.setEq('mid', eq.mid);
    deckBus.current?.setEq('high', eq.high);
  }, [eq]);

  useEffect(() => {
    deckBus.current?.setFilter(djFilter);
  }, [djFilter]);

  useEffect(() => {
    if (pauseSignal > 0) player.current?.audio.pause();
  }, [pauseSignal]);

  async function load(file?: File, requestedUrl?: string) {
    let link = '';
    if (!file) {
      try {
        link = trackUrl((requestedUrl ?? url).trim());
      } catch {
        reportError('Enter a public SoundCloud track URL.');
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
    onPlayingChangeRef.current(false);
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
        reportError(
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
        reportError('Playback could not start. Press Play to retry.');
    });
  }

  const filter = artworkFilter(tempo, shift, lock);
  const toneAltered =
    eq.low !== 0 || eq.mid !== 0 || eq.high !== 0 || djFilter !== 0;
  const altered = tempo !== 1 || shift !== 0 || toneAltered;
  const readoutParts = [`${Number(tempo.toFixed(2))}×`];
  if (shift !== 0) readoutParts.push(`${shift > 0 ? '+' : ''}${shift}st`);
  if (toneAltered) readoutParts.push('EQ');
  const readout = readoutParts.join(' ');

  const sourceControls = (
    <>
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
    </>
  );

  const pitchAndToneControls = (
    <>
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
            onDoubleClick={() => setTempo(1)}
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
            onDoubleClick={() => setShift(0)}
            onChange={(e) => setShift(e.target.valueAsNumber)}
          />
        </label>
      </div>
      <div className="deck-tone">
        <div className="deck-tone-header">
          <span>EQ & Filter</span>
          <button
            type="button"
            className="deck-tone-reset"
            hidden={!toneAltered}
            onClick={() => {
              setEq(flatEq);
              setDjFilter(0);
            }}
          >
            Reset EQ
          </button>
        </div>
        <div className="deck-eq-grid">
          {(['low', 'mid', 'high'] as const).map((band) => (
            <label key={band}>
              {band[0].toUpperCase() + band.slice(1)}{' '}
              <output>{formatDb(eq[band])}</output>
              <input
                aria-label={'Deck ' + name + ' ' + band + ' EQ'}
                type="range"
                min={-24}
                max={6}
                step={0.5}
                value={eq[band]}
                style={
                  {
                    '--range-fill': ((eq[band] + 24) / 30) * 100 + '%',
                  } as CSSProperties
                }
                onDoubleClick={() =>
                  setEq((current) => ({ ...current, [band]: 0 }))
                }
                onChange={(e) =>
                  setEq((current) => ({
                    ...current,
                    [band]: e.target.valueAsNumber,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <label className="deck-filter">
          Filter <output>{formatFilter(djFilter)}</output>
          <input
            aria-label={'Deck ' + name + ' filter'}
            type="range"
            min={-100}
            max={100}
            step={1}
            value={djFilter}
            style={
              {
                '--range-fill': ((djFilter + 100) / 200) * 100 + '%',
              } as CSSProperties
            }
            onDoubleClick={() => setDjFilter(0)}
            onChange={(e) => setDjFilter(e.target.valueAsNumber)}
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
    </>
  );

  const compactTrackPlaceholder = embedded
    ? name === 'A'
      ? 'Alt+Shift+1'
      : 'Alt+Shift+2'
    : 'No track loaded';

  const barControls = (
    <div className="deck-bar">
      <header className="deck-heading">
        <h2>
          <span className="deck-prefix">Deck </span>
          {name}
        </h2>
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
          <h3 data-empty={!song || undefined}>
            {song?.title ?? compactTrackPlaceholder}
          </h3>
          {embedded && status ? (
            <p role="status" className="deck-inline-status">
              {status}
            </p>
          ) : (
            song?.artist && <p>{song.artist}</p>
          )}
        </div>
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
      {embedded && (
        <>
          <span
            className="deck-readout"
            data-altered={altered || undefined}
            aria-hidden="true"
          >
            {readout}
          </span>
          <button
            className="deck-expand"
            type="button"
            aria-expanded={expanded}
            aria-label={
              (expanded ? 'Hide' : 'Show') + ' deck ' + name + ' controls'
            }
            onClick={onExpand}
          >
            {expanded ? `Less ${name}` : `More ${name}`}
          </button>
        </>
      )}
    </div>
  );

  if (embedded) {
    return (
      <section
        className="mixer-deck"
        data-expanded={expanded}
        data-mobile-active={mobileActive}
        aria-label={'Deck ' + name}
      >
        {barControls}
        <div className="deck-drawer" hidden={!expanded}>
          {sourceControls}
          {pitchAndToneControls}
        </div>
      </section>
    );
  }

  return (
    <section
      className="mixer-deck"
      data-expanded={false}
      aria-label={'Deck ' + name}
    >
      <header className="deck-heading">
        <h2>
          <span className="deck-prefix">Deck </span>
          {name}
        </h2>
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
      {sourceControls}
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
      {pitchAndToneControls}
    </section>
  );
}
