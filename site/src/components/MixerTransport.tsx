import { useRef } from 'react';
import * as Slider from '@radix-ui/react-slider';

// Adapted from ElevenLabs’ Audio Player on 21st.dev; see vendor/elevenlabs-ui.
export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '--:--';
  const whole = Math.max(0, Math.floor(seconds));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}

type TransportProps = {
  deck: string;
  playing: boolean;
  ready: boolean;
  time: number;
  duration: number;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
};

export function MixerTransport({
  deck,
  playing,
  ready,
  time,
  duration,
  play,
  pause,
  seek,
}: TransportProps) {
  const resumeAfterSeek = useRef(false);
  const toggle = playing ? pause : play;
  return (
    <div className="deck-transport">
      <button
        type="button"
        className="deck-play"
        disabled={!ready}
        onClick={toggle}
        aria-label={(playing ? 'Pause deck ' : 'Play deck ') + deck}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d={playing ? 'M5 3h4v14H5zM12 3h4v14h-4z' : 'M5 3v14l12-7z'} />
        </svg>
      </button>
      <div className="deck-position">
        <Slider.Root
          className="deck-seek"
          min={0}
          max={duration || 1}
          step={0.25}
          value={[time]}
          disabled={!ready}
          onValueChange={([seconds]) => seek(seconds)}
          onPointerDown={() => {
            resumeAfterSeek.current = playing;
            if (playing) pause();
          }}
          onPointerUp={() => {
            if (resumeAfterSeek.current) play();
            resumeAfterSeek.current = false;
          }}
          onPointerCancel={() => {
            if (resumeAfterSeek.current) play();
            resumeAfterSeek.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === ' ') {
              event.preventDefault();
              toggle();
            }
          }}
        >
          <Slider.Track className="deck-rail">
            <Slider.Range className="deck-fill" />
          </Slider.Track>
          <Slider.Thumb
            className="deck-thumb"
            aria-label={'Deck ' + deck + ' position'}
            aria-valuetext={formatTime(time)}
          />
        </Slider.Root>
        <div className="deck-times">
          <span>{formatTime(time)}</span>
          <span>{ready ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>
    </div>
  );
}
