export function createMediaGuards({
  apply,
  readPlayback,
  readServices,
  readUI,
  handleShortcut,
}) {
  const proto = HTMLMediaElement.prototype;
  const pitchNames = [
    'preservesPitch',
    'mozPreservesPitch',
    'webkitPreservesPitch',
  ];
  const properties = ['playbackRate', 'defaultPlaybackRate', ...pitchNames];
  const native = Object.fromEntries(
    properties.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(proto, name),
    ]),
  );
  const known = new WeakSet();
  const references = new Set();
  function isAudio(audio) {
    return audio instanceof HTMLAudioElement;
  }

  function discover(audio) {
    if (!isAudio(audio) || known.has(audio)) {
      return;
    }
    readServices().outputLevel.attach(audio);
    known.add(audio);
    references.add(new WeakRef(audio));
    for (const event of [
      'play',
      'playing',
      'loadstart',
      'loadedmetadata',
      'ratechange',
      'emptied',
    ]) {
      audio.addEventListener(event, () => apply(audio));
    }
  }

  function setNative(audio, name, value) {
    const descriptor = native[name];
    if (descriptor?.set && descriptor.get.call(audio) !== value) {
      descriptor.set.call(audio, value);
    }
  }

  function applyNative(audio) {
    const { wasmAudio } = readServices();
    const { preserve, useWasm, keyShift, rate } = readPlayback();
    const wasmActive = wasmAudio.sync(
      audio,
      (preserve && useWasm) || keyShift !== 0,
      rate,
    );
    for (const name of pitchNames)
      setNative(audio, name, preserve && !wasmActive);
    setNative(audio, 'defaultPlaybackRate', rate);
    setNative(audio, 'playbackRate', rate);
  }

  function installGuards() {
    for (const name of properties) {
      const descriptor = native[name];
      if (!descriptor?.configurable || !descriptor.set) {
        continue;
      }
      Object.defineProperty(proto, name, {
        ...(Object.getOwnPropertyDescriptor(proto, name) || descriptor),
        set(value) {
          if (!isAudio(this)) {
            return descriptor.set.call(this, value);
          }
          discover(this);
          if (pitchNames.includes(name)) {
            return descriptor.set.call(
              this,
              readPlayback().preserve && !readServices().wasmAudio.active(this),
            );
          }
          apply(this);
        },
      });
    }
    const play = proto.play;
    proto.play = function (...args) {
      if (isAudio(this)) {
        readServices().bufferedAudio.select(this);
        readServices().crossfade?.select(this);
        apply(this);
        return readServices().bufferedAudio.play(this, () =>
          Reflect.apply(play, this, args),
        );
      }
      return Reflect.apply(play, this, args);
    };
    const pause = proto.pause;
    proto.pause = function (...args) {
      if (isAudio(this) && readServices().bufferedAudio.pause(this)) return;
      return Reflect.apply(pause, this, args);
    };
    for (const event of ['play', 'loadedmetadata']) {
      document.addEventListener(
        event,
        (e) => {
          if (isAudio(e.target)) {
            if (e.type === 'play' && e.isTrusted)
              readServices().bufferedAudio.select(e.target);
            if (e.type === 'play') readServices().crossfade?.select(e.target);
            apply(e.target);
          }
        },
        true,
      );
    }
    document.addEventListener(
      'keydown',
      (event) => {
        if (
          event
            .composedPath()
            .some(
              (el) =>
                el instanceof Element &&
                (el === readUI()?.host ||
                  el.matches('input,textarea,select') ||
                  el.isContentEditable),
            )
        ) {
          return;
        }
        handleShortcut(event);
      },
      true,
    );
  }

  return {
    references,
    discover,
    isAudio,
    applyNative,
    installGuards,
    supportsPitch: () => pitchNames.some((name) => native[name]?.set),
  };
}
