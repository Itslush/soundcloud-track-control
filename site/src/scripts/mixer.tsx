import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createRoot } from 'react-dom/client';
import { MixerDeck, type EqBand } from '../components/MixerDeck';

type DeckBusNodes = {
  input: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  djFilter: BiquadFilterNode;
  crossfade: GainNode;
};

type Engine = {
  context: AudioContext;
  decks: DeckBusNodes[];
};

const allowedOrigins = [
  'https://soundcloud.com',
  'https://m.soundcloud.com',
  'https://www.soundcloud.com',
];

function gains(position: number) {
  const angle = (position * Math.PI) / 2;
  return [position === 1 ? 0 : Math.cos(angle), Math.sin(angle)];
}

function createFilterNode(
  context: AudioContext,
  type: BiquadFilterType,
  frequency: number,
  q = 0.707,
) {
  const node = context.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  node.gain.value = 0;
  return node;
}

function Mixer() {
  const [position, setPosition] = useState(0);
  const [expanded, setExpanded] = useState({ A: false, B: false });
  const [activeDeck, setActiveDeck] = useState<'A' | 'B'>('A');
  const [pauseSignal, setPauseSignal] = useState(0);
  const embedded = window.parent !== window;
  const engine = useRef<Engine | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef({ A: false, B: false });
  const lastReportedHeight = useRef(0);
  const expandedRef = useRef(false);
  const [commands, setCommands] = useState<
    Partial<Record<'A' | 'B', { deck: 'A' | 'B'; track: string; id: number }>>
  >({});
  const seed = new URLSearchParams(location.hash.slice(1)).get('track') ?? '';
  const parentOrigin = new URLSearchParams(location.search).get('host');
  const anyExpanded = expanded.A || expanded.B;
  expandedRef.current = anyExpanded;

  function bus(index: number) {
    if (!engine.current) {
      const context = new AudioContext();
      const decks = gains(position).map((value) => {
        const input = context.createGain();
        input.gain.value = 1;
        const low = createFilterNode(context, 'lowshelf', 200);
        const mid = createFilterNode(context, 'peaking', 1000, 1);
        const high = createFilterNode(context, 'highshelf', 4000);
        const djFilter = createFilterNode(context, 'peaking', 1000, 0.7);
        const crossfade = context.createGain();
        crossfade.gain.value = value;
        input
          .connect(low)
          .connect(mid)
          .connect(high)
          .connect(djFilter)
          .connect(crossfade)
          .connect(context.destination);
        return { input, low, mid, high, djFilter, crossfade };
      });
      engine.current = { context, decks };
    }
    const { context, decks } = engine.current;
    const deck = decks[index];
    return {
      context,
      level: deck.input,
      setEq(band: EqBand, db: number) {
        const clamped = Number.isFinite(db) ? Math.max(-24, Math.min(6, db)) : 0;
        deck[band].gain.setTargetAtTime(clamped, context.currentTime, 0.012);
      },
      setFilter(value: number) {
        const clamped = Number.isFinite(value)
          ? Math.max(-100, Math.min(100, value))
          : 0;
        const now = context.currentTime;
        if (clamped === 0) {
          deck.djFilter.type = 'peaking';
          deck.djFilter.gain.setTargetAtTime(0, now, 0.01);
          deck.djFilter.Q.setTargetAtTime(0.7, now, 0.01);
          deck.djFilter.frequency.setTargetAtTime(1000, now, 0.01);
        } else if (clamped < 0) {
          const freq = 18000 * Math.pow(180 / 18000, -clamped / 100);
          deck.djFilter.type = 'lowpass';
          deck.djFilter.Q.setTargetAtTime(1.4, now, 0.015);
          deck.djFilter.frequency.setTargetAtTime(freq, now, 0.015);
        } else {
          const freq = 35 * Math.pow(4500 / 35, clamped / 100);
          deck.djFilter.type = 'highpass';
          deck.djFilter.Q.setTargetAtTime(1.4, now, 0.015);
          deck.djFilter.frequency.setTargetAtTime(freq, now, 0.015);
        }
      },
    };
  }

  function mix(value: number) {
    setPosition(value);
    const graph = engine.current;
    if (!graph) return;
    gains(value).forEach((gain, index) => {
      graph.decks[index].crossfade.gain.setTargetAtTime(
        gain,
        graph.context.currentTime,
        0.005,
      );
    });
  }

  function notifyHost(message: string | object) {
    if (
      window.parent !== window &&
      parentOrigin &&
      allowedOrigins.includes(parentOrigin)
    )
      window.parent.postMessage(message, parentOrigin);
  }

  function handlePlayingChange(name: 'A' | 'B', isPlaying: boolean) {
    if (playingRef.current[name] === isPlaying) return;
    playingRef.current[name] = isPlaying;
    if (isPlaying) notifyHost('soundcloud-track-control:mixer-playing');
    else if (!playingRef.current.A && !playingRef.current.B)
      notifyHost('soundcloud-track-control:mixer-paused');
  }

  function reportSize(force = false) {
    if (!embedded) return;
    const node = consoleRef.current;
    const height = node ? Math.ceil(node.getBoundingClientRect().height) : 0;
    if (
      !force &&
      height > 0 &&
      Math.abs(height - lastReportedHeight.current) < 2
    )
      return;
    if (height > 0) lastReportedHeight.current = height;
    notifyHost({
      type: 'soundcloud-track-control:mixer-size',
      expanded: expandedRef.current,
      ...(height > 0 ? { height } : {}),
    });
  }

  useLayoutEffect(() => {
    reportSize(true);
  }, [anyExpanded]);

  useEffect(() => {
    if (
      !embedded ||
      !consoleRef.current ||
      typeof ResizeObserver === 'undefined'
    )
      return;
    const observer = new ResizeObserver(() => reportSize(false));
    observer.observe(consoleRef.current);
    return () => observer.disconnect();
  }, [embedded]);

  useEffect(() => {
    const close = (event: PageTransitionEvent) => {
      if (!event.persisted && engine.current)
        void engine.current.context.close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented)
        notifyHost('soundcloud-track-control:mixer-close');
    };
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        event.origin !== parentOrigin ||
        !allowedOrigins.includes(event.origin) ||
        ![
          'soundcloud-track-control:mixer-load',
          'soundcloud-track-control:mixer-theme',
          'soundcloud-track-control:mixer-pause',
        ].includes(event.data?.type) ||
        (event.data.type === 'soundcloud-track-control:mixer-load' &&
          (!['A', 'B'].includes(event.data.deck) ||
            typeof event.data.track !== 'string'))
      )
        return;
      if (event.data.type === 'soundcloud-track-control:mixer-pause') {
        setPauseSignal((count) => count + 1);
        return;
      }
      if (event.data.type === 'soundcloud-track-control:mixer-theme') {
        if (['light', 'oled', 'charcoal'].includes(event.data.theme))
          document.documentElement.dataset.theme = event.data.theme;
        const tokens = event.data.tokens;
        if (tokens && typeof tokens === 'object') {
          const map: Record<string, string> = {
            ground: '--ground',
            surface: '--surface',
            ink: '--ink',
            muted: '--muted',
            line: '--line',
            control: '--control',
            accent: '--accent',
            onAccent: '--on-accent',
            track: '--track',
          };
          for (const [key, variable] of Object.entries(map))
            if (typeof tokens[key] === 'string')
              document.documentElement.style.setProperty(variable, tokens[key]);
        }
        return;
      }
      setActiveDeck(event.data.deck);
      setCommands((current) => ({
        ...current,
        [event.data.deck]: {
          deck: event.data.deck,
          track: event.data.track,
          id: Date.now() + Math.random(),
        },
      }));
    };
    window.addEventListener('message', receive);
    notifyHost('soundcloud-track-control:mixer-ready');
    window.addEventListener('pagehide', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('message', receive);
      window.removeEventListener('pagehide', close);
      window.removeEventListener('keydown', escape);
    };
  }, []);

  function toggleDeck(name: 'A' | 'B') {
    setExpanded((current) => ({ ...current, [name]: !current[name] }));
  }

  const fullLabel =
    position === 0
      ? 'A only'
      : position === 1
        ? 'B only'
        : position === 0.5
          ? 'Center'
          : Math.round(position * 100) + '% toward B';
  const compactLabel =
    position === 0
      ? 'A'
      : position === 1
        ? 'B'
        : position === 0.5
          ? '50/50'
          : Math.round(position * 100) + '% B';

  return (
    <div
      ref={consoleRef}
      className="mixer-console"
      data-embedded={embedded || undefined}
      data-expanded={anyExpanded || undefined}
    >
      <div className="deck-pair">
        <MixerDeck
          name="A"
          embedded={embedded}
          expanded={expanded.A}
          mobileActive={activeDeck === 'A'}
          onExpand={() => toggleDeck('A')}
          command={commands.A ?? null}
          seed={seed}
          bus={() => bus(0)}
          pauseSignal={pauseSignal}
          onPlayingChange={(isPlaying) => handlePlayingChange('A', isPlaying)}
          onNotice={(message) =>
            notifyHost({
              type: 'soundcloud-track-control:mixer-notice',
              message,
            })
          }
        />
        <MixerDeck
          name="B"
          embedded={embedded}
          expanded={expanded.B}
          mobileActive={activeDeck === 'B'}
          onExpand={() => toggleDeck('B')}
          command={commands.B ?? null}
          seed=""
          bus={() => bus(1)}
          pauseSignal={pauseSignal}
          onPlayingChange={(isPlaying) => handlePlayingChange('B', isPlaying)}
          onNotice={(message) =>
            notifyHost({
              type: 'soundcloud-track-control:mixer-notice',
              message,
            })
          }
        />
      </div>
      <div className="mixer-fader">
        {embedded && (
          <div
            className="mixer-mobile-tabs"
            role="group"
            aria-label="Active deck"
          >
            {(['A', 'B'] as const).map((deckName) => (
              <button
                key={deckName}
                type="button"
                className="mixer-mobile-tab"
                aria-pressed={activeDeck === deckName}
                onClick={() => setActiveDeck(deckName)}
              >
                <span className="deck-prefix">Deck </span>
                {deckName}
              </button>
            ))}
          </div>
        )}
        <div className="mixer-fader-header">
          <label htmlFor="deck-blend">Crossfader</label>
          <output htmlFor="deck-blend">
            {embedded ? compactLabel : fullLabel}
          </output>
        </div>
        <div className="mixer-blend">
          <span aria-hidden="true">A</span>
          <input
            id="deck-blend"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={position}
            style={{ '--range-fill': position * 100 + '%' } as CSSProperties}
            aria-valuetext={fullLabel}
            onChange={(e) => mix(e.target.valueAsNumber)}
          />
          <span aria-hidden="true">B</span>
        </div>
      </div>
      {embedded && (
        <div className="mixer-dock-actions">
          <a
            href={location.origin + location.pathname}
            target="_blank"
            rel="noopener noreferrer"
            className="mixer-full-link"
          >
            Full mixer
          </a>
          <button
            type="button"
            className="mixer-hide-button"
            aria-label="Hide two-deck mixer"
            onClick={() => notifyHost('soundcloud-track-control:mixer-close')}
          >
            Hide
          </button>
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('two-deck-mixer');
if (container) createRoot(container).render(<Mixer />);
