(function () {
  const scope =
    (typeof window !== 'undefined' && window) ||
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof global !== 'undefined' && global) ||
    {};

  const existing = (scope.INFINITE_RAILS_AUDIO_ALIASES || {});

  const aliasConfig = Object.assign({}, existing, {
    ambientOverworld: existing.ambientOverworld || ['bubble', 'miningA'],
    ambientDefault: existing.ambientDefault || existing.ambientOverworld || ['bubble', 'miningA'],
    theme: existing.theme || ['ambientOverworld', 'ambientDefault'],
    craftChime: existing.craftChime || ['victoryCheer', 'miningA'],
    blockPlace: existing.blockPlace || ['crunch', 'miningB'],
    lootChestOpen: existing.lootChestOpen || ['bubble', 'victoryCheer'],
    playerHit: existing.playerHit || ['crunch'],
    zombieGroan: existing.zombieGroan || ['miningB', 'crunch'],
    portalActivate: existing.portalActivate || ['victoryCheer', 'miningA'],
    portalDormant: existing.portalDormant || ['bubble', 'crunch'],
    portalPrimed: existing.portalPrimed || ['bubble', 'miningA'],
    welcome: existing.welcome || ['victoryCheer', 'bubble'],
  });

  scope.INFINITE_RAILS_AUDIO_ALIASES = aliasConfig;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = aliasConfig;
    if (typeof Object.defineProperty === 'function') {
      Object.defineProperty(module.exports, 'default', {
        value: aliasConfig,
        enumerable: false,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(module.exports, '__esModule', {
        value: true,
        enumerable: false,
        configurable: true,
      });
    } else {
      module.exports.default = aliasConfig;
      module.exports.__esModule = true;
    }
  }
})();
