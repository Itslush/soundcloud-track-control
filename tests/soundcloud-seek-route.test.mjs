import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { soundCloudSeekOutput } from '../src/audio/soundcloud-seek-route.mjs';

const source = JSON.parse(
  readFileSync(
    new URL('./fixtures/soundcloud-seek-route.json', import.meta.url),
  ),
);
class AudioContext {}
class AudioNode {
  constructor(context) {
    this._context = context;
  }
  get context() {
    return this._context;
  }
}
class AudioParam {
  constructor(value = 1) {
    this._value = value;
  }
  get value() {
    return this._value;
  }
}
class GainNode extends AudioNode {
  constructor(context) {
    super(context);
    this._gain = new AudioParam();
  }
  get gain() {
    return this._gain;
  }
}
class MediaElementAudioSourceNode extends AudioNode {
  constructor(context, mediaElement) {
    super(context);
    this._mediaElement = mediaElement;
  }
  get mediaElement() {
    return this._mediaElement;
  }
}
const realm = {
  AudioContext,
  AudioNode,
  AudioParam,
  GainNode,
  MediaElementAudioSourceNode,
};
function fixture() {
  const audio = {};
  const context = new AudioContext();
  const sourceNode = new MediaElementAudioSourceNode(context, audio);
  const gains = Object.fromEntries(
    ['pausePlay', 'seek', 'glitchCoverup'].map((name) => [
      name,
      new GainNode(context),
    ]),
  );
  const proto = {
    _initWebAudio: Function(`return (${source.init})`)(),
    _createMediaElementSource: Function(`return (${source.attach})`)(),
  };
  const player = Object.assign(Object.create(proto), {
    _mediaElementAndState: { state: 'USABLE', element: audio },
    _webAudioOrchestration: {
      context,
      mediaElementSource: sourceNode,
      gainNodes: gains,
    },
  });
  const sound = { player: { player: { _player: player } } };
  const read = () =>
    soundCloudSeekOutput(sound, audio, context, sourceNode, realm);
  return { audio, context, sourceNode, gains, proto, player, sound, read };
}

test('returns only the selected player’s verified post-seek output', () => {
  const f = fixture();
  assert.equal(f.read(), f.gains.glitchCoverup);
});

test('rejects changed player identity, SDK fingerprints and graph shapes', () => {
  for (const breakRoute of [
    (f) => {
      f.player._mediaElementAndState.state = 'STABLE';
    },
    (f) => {
      f.player._mediaElementAndState.element = {};
    },
    (f) => {
      f.player._webAudioOrchestration.context = new AudioContext();
    },
    (f) => {
      f.player._webAudioOrchestration.mediaElementSource =
        new MediaElementAudioSourceNode(f.context, f.audio);
    },
    (f) => {
      f.sourceNode._mediaElement = {};
    },
    (f) => {
      f.gains.seek = f.gains.glitchCoverup;
    },
    (f) => {
      f.gains.pausePlay.gain._value = 0.5;
    },
    (f) => {
      f.gains.pausePlay.gain._value = 1.5;
    },
    (f) => {
      f.gains.pausePlay.gain._value = NaN;
    },
    (f) => {
      f.gains.glitchCoverup._context = new AudioContext();
    },
    (f) => {
      f.gains.glitchCoverup = {};
    },
    (f) => {
      f.proto._initWebAudio = () => {};
    },
    (f) => {
      f.proto._createMediaElementSource = () => {};
    },
    (f) => {
      Object.defineProperty(f.player, '_webAudioOrchestration', {
        get() {
          throw Error('must not call');
        },
      });
    },
    (f) => {
      f.sound.player.player._player = f.sound.player.player;
    },
  ]) {
    const f = fixture();
    breakRoute(f);
    assert.equal(f.read(), null);
  }
});

test('ignores per-node accessors when verifying native ownership', () => {
  const f = fixture();
  Object.defineProperty(f.sourceNode, 'mediaElement', {
    get() {
      throw Error('spoofed');
    },
  });
  Object.defineProperty(f.gains.glitchCoverup, 'context', {
    get() {
      throw Error('spoofed');
    },
  });
  assert.equal(f.read(), f.gains.glitchCoverup);
});
