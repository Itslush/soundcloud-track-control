const initSource =
  'function(){try{var e=this._webAudioContext.getAudioContextWithSuspender();if(!e)return this._logger.debug("WebAudio not supported/enabled."),null;this._logger.debug("WebAudio supported.");var t=e.context,r=e.suspender;r.watchPlayer(this);var n=t.createGain(),i=t.createGain(),o=t.createGain();return n.connect(i),i.connect(o),o.connect(t.destination),{context:t,suspender:r,gainNodes:{glitchCoverup:o,pausePlay:n,seek:i}}}catch(e){return e===C?this._triggerError(new m(e)):this._triggerError(new v(e)),this._logger.error("Failed initializing web audio.",e),null}}';
const mediaSource =
  'function(e){if(this._webAudioOrchestration&&this._fadeManagers){this._logger.debug("Creating media element source node...");var t=j.get(e);if(t?this._logger.debug("Reusing media element source node."):(t=this._webAudioOrchestration.context.createMediaElementSource(e),j.set(e,t)),this._webAudioOrchestration.mediaElementSource=t,t.connect(this._webAudioOrchestration.gainNodes.pausePlay),this._logger.debug("Created media element source node."),this._shouldCoverGlitch){var r=this._webAudioOrchestration.context.currentTime,n=this._webAudioOrchestration.gainNodes.glitchCoverup;n.gain.setValueAtTime(0,r),n.gain.setValueAtTime(1,r+.1),this._shouldCoverGlitch=!1}}}';

const ownValue = (object, key) => {
  const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};

function method(value, name) {
  for (let depth = 0; value && depth < 16; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor) return 'value' in descriptor ? descriptor.value : undefined;
    value = Object.getPrototypeOf(value);
  }
}

export function soundCloudSeekOutput(sound, audio, context, source, realm) {
  const wrapper = ownValue(sound, 'player');
  let player = ownValue(wrapper, 'player');
  const seen = new Set();
  while (player && !seen.has(player) && seen.size < 8) {
    seen.add(player);
    const media = ownValue(player, '_mediaElementAndState');
    if (media) {
      if (
        ownValue(media, 'state') !== 'USABLE' ||
        ownValue(media, 'element') !== audio
      )
        return null;
      const init = method(player, '_initWebAudio');
      const attach = method(player, '_createMediaElementSource');
      if (
        typeof init !== 'function' ||
        typeof attach !== 'function' ||
        Function.prototype.toString.call(init) !== initSource ||
        Function.prototype.toString.call(attach) !== mediaSource
      )
        return null;
      const orchestration = ownValue(player, '_webAudioOrchestration');
      const gains = ownValue(orchestration, 'gainNodes');
      const nodes = ['pausePlay', 'seek', 'glitchCoverup'].map((key) =>
        ownValue(gains, key),
      );
      const readMedia = Object.getOwnPropertyDescriptor(
        realm.MediaElementAudioSourceNode.prototype,
        'mediaElement',
      )?.get;
      const readContext = Object.getOwnPropertyDescriptor(
        realm.AudioNode.prototype,
        'context',
      )?.get;
      const readGain = Object.getOwnPropertyDescriptor(
        realm.GainNode.prototype,
        'gain',
      )?.get;
      const readValue = Object.getOwnPropertyDescriptor(
        realm.AudioParam.prototype,
        'value',
      )?.get;
      if (
        typeof readMedia !== 'function' ||
        typeof readContext !== 'function' ||
        typeof readGain !== 'function' ||
        typeof readValue !== 'function' ||
        ownValue(orchestration, 'context') !== context ||
        ownValue(orchestration, 'mediaElementSource') !== source ||
        !(source instanceof realm.MediaElementAudioSourceNode) ||
        Reflect.apply(readMedia, source, []) !== audio ||
        Reflect.apply(readContext, source, []) !== context ||
        !(context instanceof realm.AudioContext) ||
        nodes.some(
          (node) =>
            !(node instanceof realm.GainNode) ||
            Reflect.apply(readContext, node, []) !== context,
        ) ||
        new Set(nodes).size !== nodes.length
      )
        return null;
      const pauseGain = Reflect.apply(readGain, nodes[0], []);
      const pauseLevel = Reflect.apply(readValue, pauseGain, []);
      if (
        !Number.isFinite(pauseLevel) ||
        pauseLevel < 0.999 ||
        pauseLevel > 1.001
      )
        return null;
      return nodes[2];
    }
    player = ownValue(player, '_player');
  }
  return null;
}
