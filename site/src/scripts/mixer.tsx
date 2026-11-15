import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { MixerDeck } from '../components/MixerDeck';

function gains(position: number) {
  const angle = (position * Math.PI) / 2;
  return [position === 1 ? 0 : Math.cos(angle), Math.sin(angle)];
}

function Mixer() {
  const [position, setPosition] = useState(0);
  const [expanded, setExpanded] = useState({ A: false, B: false });
  const embedded = window.parent !== window;
  const engine = useRef<{ context: AudioContext; levels: GainNode[] } | null>(
    null,
  );
  const [commands, setCommands] = useState<
    Partial<Record<'A' | 'B', { deck: 'A' | 'B'; track: string; id: number }>>
  >({});
  const seed = new URLSearchParams(location.hash.slice(1)).get('track') ?? '';
  const parentOrigin = new URLSearchParams(location.search).get('host');

  function bus(index: number) {
    if (!engine.current) {
      const context = new AudioContext();
      const levels = gains(position).map((value) => {
        const level = context.createGain();
        level.gain.value = value;
        level.connect(context.destination);
        return level;
      });
      engine.current = { context, levels };
    }
    return {
      context: engine.current.context,
      level: engine.current.levels[index],
    };
  }
  function mix(value: number) {
    setPosition(value);
    const graph = engine.current;
    if (!graph) return;
    gains(value).forEach((gain, index) => {
      graph.levels[index].gain.setTargetAtTime(
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
      [
        'https://soundcloud.com',
        'https://m.soundcloud.com',
        'https://www.soundcloud.com',
      ].includes(parentOrigin)
    )
      window.parent.postMessage(message, parentOrigin);
  }
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
        ![
          'https://soundcloud.com',
          'https://m.soundcloud.com',
          'https://www.soundcloud.com',
        ].includes(event.origin) ||
        ![
          'soundcloud-track-control:mixer-load',
          'soundcloud-track-control:mixer-theme',
        ].includes(event.data?.type) ||
        (event.data.type === 'soundcloud-track-control:mixer-load' &&
          (!['A', 'B'].includes(event.data.deck) ||
            typeof event.data.track !== 'string'))
      )
        return;
      if (event.data.type === 'soundcloud-track-control:mixer-theme') {
        if (['light', 'oled', 'charcoal'].includes(event.data.theme))
          document.documentElement.dataset.theme = event.data.theme;
        return;
      }
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
    const next = { ...expanded, [name]: !expanded[name] };
    setExpanded(next);
    notifyHost({
      type: 'soundcloud-track-control:mixer-size',
      expanded: next.A || next.B,
    });
  }
  const label =
    position === 0
      ? 'A only'
      : position === 1
        ? 'B only'
        : position === 0.5
          ? 'Center'
          : Math.round(position * 100) + '% toward B';
  return (
    <>
      <div className="deck-pair">
        <MixerDeck
          name="A"
          embedded={embedded}
          expanded={expanded.A}
          onExpand={() => toggleDeck('A')}
          command={commands.A ?? null}
          seed={seed}
          bus={() => bus(0)}
          onSound={() => notifyHost('soundcloud-track-control:mixer-playing')}
        />
        <MixerDeck
          name="B"
          embedded={embedded}
          expanded={expanded.B}
          onExpand={() => toggleDeck('B')}
          command={commands.B ?? null}
          seed=""
          bus={() => bus(1)}
          onSound={() => notifyHost('soundcloud-track-control:mixer-playing')}
        />
      </div>
      <div className="mixer-fader">
        <div>
          <label htmlFor="deck-blend">Crossfader</label>
          <output htmlFor="deck-blend">{label}</output>
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
            aria-valuetext={label}
            onChange={(e) => mix(e.target.valueAsNumber)}
          />
          <span aria-hidden="true">B</span>
        </div>
      </div>
    </>
  );
}

const container = document.getElementById('two-deck-mixer');
if (container) createRoot(container).render(<Mixer />);
