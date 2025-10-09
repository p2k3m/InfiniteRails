(function () {
  const scope =
    (typeof window !== 'undefined' && window) ||
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof global !== 'undefined' && global) ||
    {};

  const existing = typeof scope.INFINITE_RAILS_AUDIO_CAPTIONS === 'object' ? scope.INFINITE_RAILS_AUDIO_CAPTIONS : {};

  const captions = Object.assign({}, existing, {
    bubble: existing.bubble || 'Bubbles fizz around you.',
    crunch: existing.crunch || 'You crunch through brittle stone.',
    craftChime: existing.craftChime || 'Crafting terminal confirms your recipe.',
    craftError: existing.craftError || 'Crafting matrix crackles, rejecting the sequence.',
    blockPlace: existing.blockPlace || 'Block slots into place with a quick click.',
    lootChestOpen: existing.lootChestOpen || 'Chest lid pops open with a burst of loot.',
    playerHit: existing.playerHit || 'A dull thud signals a hit from an enemy.',
    playerDefeat: existing.playerDefeat || 'Vitals flatline before respawn protocols engage.',
    miningA: existing.miningA || 'Pickaxe strikes echo through the cavern.',
    miningB: existing.miningB || 'Mining impacts rumble nearby.',
    portalActivate: existing.portalActivate || 'Portal bursts alive with swirling energy.',
    portalDormant: existing.portalDormant || 'Portal energy settles into silence.',
    portalPrimed: existing.portalPrimed || 'Portal hums, waiting for activation.',
    inventoryOverflow:
      existing.inventoryOverflow || 'Satchel indicator chimes — hotbar storage maxed out.',
    victoryCheer: existing.victoryCheer || 'A triumphant cheer erupts in the distance.',
    zombieGroan: existing.zombieGroan || 'A zombie groans from the shadows.',
    welcome: existing.welcome || 'Control tower greets the expedition with a bright chime.',
  });

  scope.INFINITE_RAILS_AUDIO_CAPTIONS = captions;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = captions;
    if (typeof Object.defineProperty === 'function') {
      Object.defineProperty(module.exports, 'default', {
        value: captions,
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
      module.exports.default = captions;
      module.exports.__esModule = true;
    }
  }
})();
