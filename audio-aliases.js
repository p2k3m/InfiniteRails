(function () {
  const scope =
    (typeof window !== 'undefined' && window) ||
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof global !== 'undefined' && global) ||
    {};

  const existing = (scope.INFINITE_RAILS_AUDIO_ALIASES || {});

  const aliasConfig = Object.assign({}, existing, {
    craftChime: existing.craftChime || ['victoryCheer', 'miningA'],
    zombieGroan: existing.zombieGroan || ['miningB', 'crunch'],
    portalActivate: existing.portalActivate || ['victoryCheer', 'miningA'],
    portalDormant: existing.portalDormant || ['bubble', 'crunch'],
  });

  scope.INFINITE_RAILS_AUDIO_ALIASES = aliasConfig;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = aliasConfig;
  }
})();
