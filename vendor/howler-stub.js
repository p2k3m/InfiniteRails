(function (globalScope) {
  if (globalScope.Howl || globalScope.Howler) {
    return;
  }
  function noop() {}
  const howler = {
    ctx: {
      state: 'running',
      resume: () => Promise.resolve(),
    },
    volume: noop,
    mute: noop,
    stop: noop,
  };
  globalScope.Howler = howler;
})(typeof window !== 'undefined' ? window : globalThis);
