import { useEffect, useRef, useState, type CSSProperties } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { Upload } from 'lucide-react';
import { AudioPreview } from '../scripts/audio-preview';
import { MixerTransport } from './MixerTransport';
import { artworkFilter } from '../../../src/appearance/artwork-filter.js';
import { validOutputDb } from '../../../src/audio/output-level.mjs';
import {
  peakProtectionKey,
  readPeakProtection,
} from '../../../src/audio/pitch-quality.mjs';

export type EqBand = 'low' | 'mid' | 'high';

type DeckBus = {
  context: AudioContext;
  level: GainNode;
  setGain: (db: number) => void;
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
  otherBpm?: number | null;
  onBpmChange?: (bpm: number | null) => void;
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
  otherBpm = null,
  onBpmChange,
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
  const [gainDb, setGainDb] = useState(0);
  const [gainCapDb, setGainCapDb] = useState(12);
  const [gainDraft, setGainDraft] = useState('0');
  const [capDraft, setCapDraft] = useState('12');
  const [baseBpm, setBaseBpm] = useState<number | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const tapsRef = useRef<number[]>([]);
  const player = useRef<AudioPreview | null>(null);
  const deckBus = useRef<DeckBus | null>(null);
  const events = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const eqRef = useRef(eq);
  const djFilterRef = useRef(djFilter);
  const gainDbRef = useRef(gainDb);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onNoticeRef = useRef(onNotice);
  const onBpmChangeRef = useRef(onBpmChange);
  eqRef.current = eq;
  djFilterRef.current = djFilter;
  gainDbRef.current = gainDb;
  onPlayingChangeRef.current = onPlayingChange;
  onNoticeRef.current = onNotice;
  onBpmChangeRef.current = onBpmChange;

  function reportError(message: string) {
    setStatus(message);
    if (embedded && message) onNoticeRef.current?.(`Deck ${name}: ${message}`);
  }

  function syncToneNodes(activeBus: DeckBus | null) {
    if (!activeBus) return;
    activeBus.setGain(gainDbRef.current);
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
    deckBus.current?.setGain(gainDb);
  }, [gainDb]);

  const effectiveBpm =
    baseBpm !== null ? Math.round(baseBpm * tempo * 10) / 10 : null;

  useEffect(() => {
    onBpmChangeRef.current?.(effectiveBpm);
  }, [effectiveBpm]);

  useEffect(() => {
    if (pauseSignal > 0) player.current?.audio.pause();
  }, [pauseSignal]);

  async function load(file?: File, requestedUrl?: string) {
    tapsRef.current = [];
    setBaseBpm(null);
    setTapCount(0);
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
    eq.low !== 0 ||
    eq.mid !== 0 ||
    eq.high !== 0 ||
    djFilter !== 0 ||
    gainDb !== 0;
  const altered = tempo !== 1 || shift !== 0 || toneAltered;
  const readoutParts = [`${Number(tempo.toFixed(2))}×`];
  if (shift !== 0) readoutParts.push(`${shift > 0 ? '+' : ''}${shift}st`);
  if (toneAltered) readoutParts.push('EQ');
  const readout = readoutParts.join(' ');

  function applyGain(raw: string) {
    const next = Number(raw);
    if (raw.trim() === '' || !validOutputDb(next)) {
      reportError(
        'Enter a dB value of -24 or higher that Web Audio can represent.',
      );
      setGainDraft(String(gainDb));
      return;
    }
    setGainDb(next);
    setGainDraft(String(next));
    if (next > gainCapDb) {
      setGainCapDb(next);
      setCapDraft(String(next));
    }
    setStatus('');
  }

  function applyGainCap(raw: string) {
    const next = Number(raw);
    if (raw.trim() === '' || !validOutputDb(next) || next < -12) {
      reportError(
        'Enter a dB cap of -12 or higher that Web Audio can represent.',
      );
      setCapDraft(String(gainCapDb));
      return;
    }
    setGainCapDb(next);
    setCapDraft(String(next));
    if (gainDb > next) {
      setGainDb(next);
      setGainDraft(String(next));
    }
    setStatus('');
  }

  function handleTapBpm() {
    const now = Date.now();
    const list = tapsRef.current;
    if (list.length && now - list[list.length - 1] > 2500) list.length = 0;
    list.push(now);
    if (list.length > 8) list.shift();
    setTapCount(list.length);
    if (list.length >= 2) {
      const avgMs = (list[list.length - 1] - list[0]) / (list.length - 1);
      if (avgMs > 0) {
        const tapped = 60000 / avgMs;
        setBaseBpm(Math.round((tapped / Math.max(0.25, tempo)) * 10) / 10);
      }
    }
  }

  function syncDeckBpm() {
    if (!baseBpm || !otherBpm) return;
    const synced = Math.max(
      0.5,
      Math.min(2, Math.round((otherBpm / baseBpm) * 1000) / 1000),
    );
    setTempo(synced);
  }

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
          <Upload size={14} strokeWidth={1.85} aria-hidden="true" />
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
                '--range-fill':
                  shift === 0 ? '0%' : ((shift + 12) / 24) * 100 + '%',
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
              setGainDb(0);
              setGainDraft('0');
            }}
          >
            Reset EQ
          </button>
        </div>
        <div className="deck-gain-row">
          <label className="deck-gain-slider-label">
            Gain <output>{formatDb(gainDb)}</output>
            <input
              aria-label={'Deck ' + name + ' gain'}
              type="range"
              min={-24}
              max={gainCapDb}
              step={0.5}
              value={Math.min(gainCapDb, Math.max(-24, gainDb))}
              style={
                {
                  '--range-fill':
                    gainDb === 0
                      ? '0%'
                      : ((Math.min(gainCapDb, Math.max(-24, gainDb)) + 24) /
                          Math.max(1, gainCapDb + 24)) *
                          100 +
                        '%',
                } as CSSProperties
              }
              onDoubleClick={() => {
                setGainDb(0);
                setGainDraft('0');
              }}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                setGainDb(v);
                setGainDraft(String(v));
              }}
            />
          </label>
          <div className="deck-gain-inputs">
            <label>
              dB
              <input
                aria-label={'Deck ' + name + ' gain dB'}
                type="number"
                min={-24}
                step="any"
                value={gainDraft}
                onChange={(e) => setGainDraft(e.target.value)}
                onBlur={(e) => applyGain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyGain(e.currentTarget.value);
                }}
              />
            </label>
            <label>
              Cap dB
              <input
                aria-label={'Deck ' + name + ' volume cap dB'}
                type="number"
                min={-12}
                step="any"
                value={capDraft}
                onChange={(e) => setCapDraft(e.target.value)}
                onBlur={(e) => applyGainCap(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyGainCap(e.currentTarget.value);
                }}
              />
            </label>
          </div>
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
                    '--range-fill':
                      eq[band] === 0
                        ? '0%'
                        : ((eq[band] + 24) / 30) * 100 + '%',
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
                '--range-fill':
                  djFilter === 0 ? '0%' : ((djFilter + 100) / 200) * 100 + '%',
              } as CSSProperties
            }
            onDoubleClick={() => setDjFilter(0)}
            onChange={(e) => setDjFilter(e.target.valueAsNumber)}
          />
        </label>
        <div className="deck-bpm-row">
          <button type="button" className="deck-bpm-tap" onClick={handleTapBpm}>
            Tap BPM
          </button>
          <span className="deck-bpm-readout">
            {effectiveBpm !== null
              ? `${effectiveBpm.toFixed(1)} BPM`
              : tapCount === 1
                ? '1 tap…'
                : 'No BPM'}
          </span>
          <button
            type="button"
            className="deck-bpm-sync"
            disabled={!baseBpm || !otherBpm}
            onClick={syncDeckBpm}
          >
            Sync BPM
          </button>
        </div>
      </div>
      <div className="deck-lock">
        <Switch.Root
          id={`deck-lock-${name}`}
          className="deck-switch"
          checked={lock}
          onCheckedChange={setLock}
        >
          <Switch.Thumb className="deck-switch-thumb" />
        </Switch.Root>
        <label htmlFor={`deck-lock-${name}`}>
          Preserve key at different tempos
        </label>
      </div>
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
          hidden={!playing}
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
          hidden={!playing}
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
