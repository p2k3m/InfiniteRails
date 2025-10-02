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
    blockPlace: existing.blockPlace || 'Block slots into place with a quick click.',
    lootChestOpen: existing.lootChestOpen || 'Chest lid pops open with a burst of loot.',
    playerHit: existing.playerHit || 'A dull thud signals a hit from an enemy.',
    miningA: existing.miningA || 'Pickaxe strikes echo through the cavern.',
    miningB: existing.miningB || 'Mining impacts rumble nearby.',
    portalActivate: existing.portalActivate || 'Portal bursts alive with swirling energy.',
    portalDormant: existing.portalDormant || 'Portal energy settles into silence.',
    portalPrimed: existing.portalPrimed || 'Portal hums, waiting for activation.',
    victoryCheer: existing.victoryCheer || 'A triumphant cheer erupts in the distance.',
    zombieGroan: existing.zombieGroan || 'A zombie groans from the shadows.',
  });

  scope.INFINITE_RAILS_AUDIO_CAPTIONS = captions;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = captions;
  }
})();
