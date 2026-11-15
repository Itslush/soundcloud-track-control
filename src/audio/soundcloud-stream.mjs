export function soundCloudStream(sound, unsupported) {
  const own = (value, key) => Object.getOwnPropertyDescriptor(value, key);
  const object = (value) =>
    value !== null && ['object', 'function'].includes(typeof value);
  const data = (value, key) => {
    const descriptor = object(value) && own(value, key);
    if (!descriptor || !('value' in descriptor))
      throw unsupported(`unexpected ${key} descriptor`);
    return descriptor.value;
  };
  const method = (value, key) => {
    for (let depth = 0; value && depth < 16; depth++) {
      const descriptor = own(value, key);
      if (descriptor) return descriptor.value;
      value = Object.getPrototypeOf(value);
    }
    throw unsupported(`missing ${key} method`);
  };
  const wrapper = data(sound, 'player');
  let player = wrapper && data(wrapper, 'player');
  for (let depth = 0; object(player) && depth < 8; depth++) {
    const manager = own(player, '_controllerManager')?.value;
    const entry =
      manager && own(manager, '_controlledPlayerWithRendition')?.value;
    const controller = entry && data(entry, 'controlledPlayer');
    if (controller) {
      const getUrl = method(controller, 'getUrl');
      const getPlayer = method(controller, 'getPlayer');
      if (
        typeof getUrl !== 'function' ||
        typeof getPlayer !== 'function' ||
        Function.prototype.toString.call(getUrl) !==
          'function(){return this._currentUrl}' ||
        Function.prototype.toString.call(getPlayer) !==
          'function(){return this._player}' ||
        Reflect.apply(getPlayer, controller, []) !== data(player, '_player')
      )
        throw unsupported('the HLS stream controller changed');
      return Reflect.apply(getUrl, controller, []);
    }
    player = own(player, '_player')?.value;
  }
  throw unsupported('the HLS stream is not ready');
}
