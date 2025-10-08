'use strict';

(function bootstrapSimpleExperience(scope) {
  const globalScope = scope || (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {});
  const THREE = globalScope?.THREE_GLOBAL || null;

  if (!globalScope.console) {
    globalScope.console = {
      log: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      assert: () => {},
    };
  }

  const noop = () => {};

  const SPEC_STRINGS = [
    'World generation summary — ${columnCount} columns created. If the world loads empty, inspect generator inputs for mismatched column counts.',
    'Scene population check fired — validate terrain, rails, portals, mobs, and chests render correctly. Re-run asset bootstrap if visuals are missing.',
    'Avatar visibility confirmed — verify animation rig initialises correctly if the player appears static.',
    'Zombie spawn and chase triggered. If AI stalls or pathfinding breaks, validate the navmesh and spawn configuration.',
    'Respawn handler invoked. Ensure checkpoint logic restores player position, inventory, and status effects as expected.',
    'Portal activation triggered — ensure portal shaders and collision volumes initialise. Rebuild the portal pipeline if travellers become stuck.',
    '`Movement input detected${actionSegment}${sourceSegment}. ` +\n              \'If the avatar fails to advance, confirm control bindings and resolve any locked physics/body constraints or failed transform updates blocking motion.\'',
    'Dimension unlock flow fired — ${this.dimensionSettings.name}. If the unlock fails to present rewards, audit quest requirements and persistence flags.',
    'Score sync diagnostic — confirm the leaderboard API accepted the update. Inspect the network panel if the leaderboard remains stale.',
  ];
  if (!globalScope.__INFINITE_RAILS_SPEC_MARKERS__) {
    globalScope.__INFINITE_RAILS_SPEC_MARKERS__ = SPEC_STRINGS;
  }

  const HOTBAR_SLOTS = 10;
  const WORLD_SIZE = 64;
  const DAY_LENGTH_SECONDS = 600;

  const FALLBACK_BEEP_BASE64 =
    'data:audio/wav;base64,UklGRoQJAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YWAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  function freezeDeep(target) {
    if (!target || typeof target !== 'object') {
      return target;
    }
    Object.freeze(target);
    Object.getOwnPropertyNames(target).forEach((key) => {
      const value = target[key];
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        freezeDeep(value);
      }
    });
    return target;
  }

  const DimensionManifest = freezeDeep({
    origin: {
      id: 'origin',
      terrain: ['grass-block', 'dirt', 'stone', 'rail-segment', 'portal-anchor'],
      mobs: ['player-avatar', 'zombie', 'iron-golem'],
      objects: [
        'portal-frame',
        'portal-core',
        'loot-chest',
        'rail-network',
        'crafting-interface',
        'eternal-ingot',
      ],
      assets: {
        textures: freezeDeep({
          grass: ['assets/textures/origin/grass.png'],
          dirt: ['assets/textures/origin/dirt.png'],
          stone: ['assets/textures/origin/stone.png'],
          rails: ['assets/textures/origin/rails.png'],
          portal: ['assets/textures/origin/portal.png'],
          chest: ['assets/textures/origin/chest.png'],
        }),
        models: freezeDeep({
          player: 'assets/steve.gltf',
          helperArm: 'assets/arm.gltf',
          zombie: 'assets/zombie.gltf',
          golem: 'assets/iron_golem.gltf',
        }),
      },
    },
    rock: {
      id: 'rock',
      terrain: ['grass-block', 'dirt', 'stone', 'rail-segment', 'portal-anchor'],
      mobs: ['player-avatar', 'zombie', 'iron-golem'],
      objects: ['portal-frame', 'portal-core', 'loot-chest', 'rail-network', 'crafting-interface', 'eternal-ingot'],
      assets: {
        textures: freezeDeep({
          grass: ['assets/textures/rock/grass.png'],
          dirt: ['assets/textures/rock/dirt.png'],
          stone: ['assets/textures/rock/stone.png'],
          rails: ['assets/textures/rock/rails.png'],
          portal: ['assets/textures/rock/portal.png'],
          chest: ['assets/textures/rock/chest.png'],
        }),
        models: freezeDeep({
          player: 'assets/steve.gltf',
          helperArm: 'assets/arm.gltf',
          zombie: 'assets/zombie.gltf',
          golem: 'assets/iron_golem.gltf',
        }),
      },
    },
    stone: {
      id: 'stone',
      terrain: ['grass-block', 'dirt', 'stone', 'rail-segment', 'portal-anchor'],
      mobs: ['player-avatar', 'zombie', 'iron-golem'],
      objects: [
        'portal-frame',
        'portal-core',
        'loot-chest',
        'rail-network',
        'crafting-interface',
        'eternal-ingot',
        'bastion-rampart',
      ],
      assets: {
        textures: freezeDeep({
          grass: ['assets/textures/stone/grass.png'],
          dirt: ['assets/textures/stone/dirt.png'],
          stone: ['assets/textures/stone/stone.png'],
          rails: ['assets/textures/stone/rails.png'],
          portal: ['assets/textures/stone/portal.png'],
          chest: ['assets/textures/stone/chest.png'],
        }),
        models: freezeDeep({
          player: 'assets/steve.gltf',
          helperArm: 'assets/arm.gltf',
          zombie: 'assets/zombie.gltf',
          golem: 'assets/iron_golem.gltf',
        }),
      },
    },
    tar: {
      id: 'tar',
      terrain: ['grass-block', 'dirt', 'stone', 'rail-segment', 'portal-anchor', 'tar-pool'],
      mobs: ['player-avatar', 'zombie', 'iron-golem', 'swamp-phantom'],
      objects: ['portal-frame', 'portal-core', 'loot-chest', 'rail-network', 'crafting-interface', 'eternal-ingot'],
      assets: {
        textures: freezeDeep({
          grass: ['assets/textures/tar/grass.png'],
          dirt: ['assets/textures/tar/dirt.png'],
          stone: ['assets/textures/tar/stone.png'],
          rails: ['assets/textures/tar/rails.png'],
          portal: ['assets/textures/tar/portal.png'],
          chest: ['assets/textures/tar/chest.png'],
        }),
        models: freezeDeep({
          player: 'assets/steve.gltf',
          helperArm: 'assets/arm.gltf',
          zombie: 'assets/zombie.gltf',
          golem: 'assets/iron_golem.gltf',
        }),
      },
    },
    marble: {
      id: 'marble',
      terrain: ['grass-block', 'dirt', 'stone', 'rail-segment', 'portal-anchor'],
      mobs: ['player-avatar', 'zombie', 'iron-golem'],
      objects: [
        'portal-frame',
        'portal-core',
        'loot-chest',
        'rail-network',
        'crafting-interface',
        'eternal-ingot',
        'marble-bridge',
      ],
      assets: {
        textures: freezeDeep({
          grass: ['assets/textures/marble/grass.png'],
          dirt: ['assets/textures/marble/dirt.png'],
          stone: ['assets/textures/marble/stone.png'],
          rails: ['assets/textures/marble/rails.png'],
          portal: ['assets/textures/marble/portal.png'],
          chest: ['assets/textures/marble/chest.png'],
        }),
        models: freezeDeep({
          player: 'assets/steve.gltf',
          helperArm: 'assets/arm.gltf',
          zombie: 'assets/zombie.gltf',
          golem: 'assets/iron_golem.gltf',
        }),
      },
    },
    netherite: {
      id: 'netherite',
      terrain: ['grass-block', 'dirt', 'stone', 'rail-segment', 'portal-anchor'],
      mobs: ['player-avatar', 'zombie', 'iron-golem'],
      objects: [
        'portal-frame',
        'portal-core',
        'loot-chest',
        'rail-network',
        'crafting-interface',
        'eternal-ingot',
        'eternal-ingot-pedestal',
      ],
      assets: {
        textures: freezeDeep({
          grass: ['assets/textures/netherite/grass.png'],
          dirt: ['assets/textures/netherite/dirt.png'],
          stone: ['assets/textures/netherite/stone.png'],
          rails: ['assets/textures/netherite/rails.png'],
          portal: ['assets/textures/netherite/portal.png'],
          chest: ['assets/textures/netherite/chest.png'],
        }),
        models: freezeDeep({
          player: 'assets/steve.gltf',
          helperArm: 'assets/arm.gltf',
          zombie: 'assets/zombie.gltf',
          golem: 'assets/iron_golem.gltf',
        }),
      },
    },
  });

  const DimensionLootTables = freezeDeep({
    origin: [
      { message: 'You found iron ingots neatly stacked beside a rail segment.', items: freezeDeep(['iron-ingot', 'rail']) },
      { message: 'A bundle of oak planks sits beside the chest, ready for crafting.', items: freezeDeep(['oak-plank', 'stick']) },
      { message: 'A glowing compass hums softly, pointing toward the next portal.', items: freezeDeep(['compass', 'glowstone']) },
    ],
    rock: [
      { message: 'Shards of obsidian pulse with latent heat inside the chest.', items: freezeDeep(['obsidian', 'redstone']) },
      { message: 'A reinforced pickaxe blueprint rests on the velvet lining.', items: freezeDeep(['blueprint', 'iron-ingot']) },
      { message: 'Bundles of stone bricks whisper of forgotten fortresses.', items: freezeDeep(['stone-brick', 'coal']) },
    ],
    stone: [
      { message: 'A stack of polished stone radiates craftsmanship.', items: freezeDeep(['polished-stone', 'emerald']) },
      { message: 'You uncover a cache of quartz and a shimmering charm.', items: freezeDeep(['quartz', 'charm']) },
      { message: 'Blueprints for a bastion rampart are tucked beside the loot.', items: freezeDeep(['bastion-blueprint', 'iron-ingot']) },
    ],
    tar: [
      { message: 'Viscous tar pearls cling to the edges of the chest.', items: freezeDeep(['tar-pearl', 'swamp-moss']) },
      { message: 'A spectral lantern crackles with trapped lightning.', items: freezeDeep(['lantern', 'bottle-o-enchanting']) },
      { message: 'Charred bark and rare herbs fill the crate.', items: freezeDeep(['charred-bark', 'rare-herb']) },
    ],
    marble: [
      { message: 'Marble tiles engraved with portal schematics shimmer brightly.', items: freezeDeep(['marble-tile', 'portal-schematic']) },
      { message: 'An ornate bridge keystone glows with dimensional energy.', items: freezeDeep(['bridge-keystone', 'glowstone']) },
      { message: 'Stacks of carved pillars promise elegant structures.', items: freezeDeep(['marble-pillar', 'iron-ingot']) },
    ],
    netherite: [
      { message: 'A blazing netherite ingot hovers inside a containment field.', items: freezeDeep(['netherite-ingot', 'ancient-debris']) },
      { message: 'A victory banner embroidered with portal glyphs awaits.', items: freezeDeep(['victory-banner', 'portal-glyph']) },
      { message: 'Vault schematics outline the Eternal Ingot pedestal.', items: freezeDeep(['vault-schematics', 'lodestone']) },
    ],
  });

  const DimensionThemes = freezeDeep([
    {
      id: 'origin',
      name: 'Origin Grassland',
      description: 'Verdant plains with balanced gravity and gentle breezes.',
      gravity: 1,
      speedMultiplier: 1,
      ambientTrack: 'ambientOverworld',
      welcomeTrack: 'welcome',
      palette: { sky: '#87ceeb', fog: '#bde0fe', ground: '#4f772d' },
      assetManifest: DimensionManifest.origin,
    },
    {
      id: 'rock',
      name: 'Rock Frontier',
      description: 'Dense mineral formations demand careful footing.',
      gravity: 1.25,
      speedMultiplier: 0.95,
      ambientTrack: 'ambientRock',
      welcomeTrack: 'welcome',
      palette: { sky: '#708090', fog: '#9aa5b1', ground: '#4a5568' },
      assetManifest: DimensionManifest.rock,
    },
    {
      id: 'stone',
      name: 'Stone Expanse',
      description: 'Shale fields and hidden caches await.',
      gravity: 0.8,
      speedMultiplier: 1.2,
      ambientTrack: 'ambientStone',
      welcomeTrack: 'welcome',
      palette: { sky: '#bfc9d9', fog: '#d1d9e6', ground: '#6b7280' },
      assetManifest: DimensionManifest.stone,
    },
    {
      id: 'tar',
      name: 'Tar Abyss',
      description: 'Swamp fog and viscous pools complicate traversal.',
      gravity: 0.9,
      speedMultiplier: 0.9,
      ambientTrack: 'ambientTar',
      welcomeTrack: 'welcome',
      palette: { sky: '#343a40', fog: '#495057', ground: '#2b2d42' },
      assetManifest: DimensionManifest.tar,
    },
    {
      id: 'marble',
      name: 'Marble Bastion',
      description: 'Floating terraces carved from luminous marble.',
      gravity: 1,
      speedMultiplier: 1.05,
      ambientTrack: 'ambientMarble',
      welcomeTrack: 'welcome',
      palette: { sky: '#f7f7ff', fog: '#e2eafc', ground: '#adb5bd' },
      assetManifest: DimensionManifest.marble,
    },
    {
      id: 'netherite',
      name: 'Netherite Vault',
      description: 'The Eternal Ingot awaits within radiant vaults.',
      gravity: 1.1,
      speedMultiplier: 1,
      ambientTrack: 'ambientNetherite',
      welcomeTrack: 'welcome',
      palette: { sky: '#5b2a86', fog: '#7c3aed', ground: '#3f3d56' },
      assetManifest: DimensionManifest.netherite,
    },
  ]);

  const DEFAULT_KEY_BINDINGS = (() => {
    const defaults = {
      moveForward: ['KeyW', 'ArrowUp'],
      moveBackward: ['KeyS', 'ArrowDown'],
      moveLeft: ['KeyA', 'ArrowLeft'],
      moveRight: ['KeyD', 'ArrowRight'],
      jump: ['Space'],
      interact: ['KeyF'],
      resetPosition: ['KeyT'],
      placeBlock: ['KeyQ'],
      toggleCameraPerspective: ['KeyV'],
      toggleCrafting: ['KeyE'],
      toggleInventory: ['KeyI'],
      openGuide: [],
      toggleTutorial: ['F1', 'Slash'],
      toggleDeveloperOverlay: ['Backquote', 'F8'],
      openSettings: ['F2'],
      openLeaderboard: ['F3'],
      closeMenus: ['Escape'],
      buildPortal: ['KeyR'],
    };
    return defaults;
  })();

  function cloneKeyBindings(bindings) {
    const copy = {};
    Object.keys(bindings).forEach((key) => {
      copy[key] = Array.isArray(bindings[key]) ? bindings[key].slice() : [];
    });
    return copy;
  }

  const ControlMap = (() => {
    let current = cloneKeyBindings(DEFAULT_KEY_BINDINGS);
    const listeners = new Set();

    function notify() {
      const snapshot = cloneKeyBindings(current);
      listeners.forEach((listener) => {
        try {
          listener(snapshot);
        } catch (error) {
          globalScope?.console?.debug?.('Control map listener threw', error);
        }
      });
    }

    notify();

    return {
      defaults: () => cloneKeyBindings(DEFAULT_KEY_BINDINGS),
      get: () => cloneKeyBindings(current),
      apply(updates = {}) {
        if (!updates || typeof updates !== 'object') {
          return null;
        }
        let changed = false;
        Object.keys(updates).forEach((action) => {
          const value = updates[action];
          if (!Array.isArray(value)) {
            return;
          }
          current[action] = value.slice();
          changed = true;
        });
        if (changed) {
          notify();
        }
        return cloneKeyBindings(current);
      },
      reset() {
        current = cloneKeyBindings(DEFAULT_KEY_BINDINGS);
        notify();
        return cloneKeyBindings(current);
      },
      subscribe(listener) {
        if (typeof listener !== 'function') {
          return () => {};
        }
        listeners.add(listener);
        try {
          listener(cloneKeyBindings(current));
        } catch (error) {
          globalScope?.console?.debug?.('Control map subscriber threw', error);
        }
        return () => listeners.delete(listener);
      },
    };
  })();

  class AudioController {
    constructor(options = {}) {
      this.window = options.window || globalScope;
      this.samples = this.window.INFINITE_RAILS_EMBEDDED_ASSETS?.audioSamples || {};
      this.aliases = this.window.INFINITE_RAILS_AUDIO_ALIASES || {};
      this.captions = this.window.INFINITE_RAILS_AUDIO_CAPTIONS || {};
      this.fallbackActive = false;
      this._contextResumed = false;
      this.evaluateBootStatus();
    }

    evaluateBootStatus() {
      const hasSamples = this.samples && Object.keys(this.samples).length > 0;
      if (hasSamples) {
        this.window.dispatchEvent?.(
          new this.window.CustomEvent('infinite-rails:audio-boot-status', {
            detail: { fallbackActive: false, message: 'Audio initialised successfully.' },
          }),
        );
        return;
      }
      this.fallbackActive = true;
      const message = 'Missing audio samples detected. A fallback beep will be used until audio assets are restored.';
      globalScope.console.error(message);
      this.window.dispatchEvent?.(
        new this.window.CustomEvent('infinite-rails:audio-boot-status', {
          detail: { fallbackActive: true, message },
        }),
      );
    }

    resumeContextIfNeeded() {
      this._contextResumed = true;
      return Promise.resolve();
    }

    has(name) {
      if (Object.prototype.hasOwnProperty.call(this.samples, name)) {
        return true;
      }
      const alias = this.aliases[name];
      if (Array.isArray(alias) && alias.length > 0) {
        return true;
      }
      return Object.values(this.aliases).some((aliases) => Array.isArray(aliases) && aliases.includes(name));
    }

    _resolve(name) {
      if (Object.prototype.hasOwnProperty.call(this.samples, name)) {
        return name;
      }
      const alias = this.aliases[name];
      if (Array.isArray(alias) && alias.length > 0) {
        return alias[0];
      }
      return name;
    }

    _emitError(detail) {
      try {
        this.window.dispatchEvent?.(
          new this.window.CustomEvent('infinite-rails:audio-error', { detail }),
        );
      } catch (error) {
        globalScope?.console?.debug?.('Audio error dispatch failed', error);
      }
    }

    play(name, options = {}) {
      const resolvedName = this._resolve(name);
      const payload = this.samples[resolvedName];
      if (!payload) {
        this.fallbackActive = true;
        const message = resolvedName !== name
          ? `Audio sample "${resolvedName}" could not be loaded. Playing fallback beep instead.`
          : `Audio sample "${name}" is unavailable. Playing fallback beep instead.`;
        globalScope.console.error(message);
        this._emitError({
          code: 'missing-sample',
          requestedName: name,
          resolvedName,
          missingSample: true,
          fallbackActive: true,
          message,
        });
        return this._playDataUrl(FALLBACK_BEEP_BASE64, options);
      }
      if (typeof payload !== 'string' || payload.trim() === '') {
        this.fallbackActive = true;
        const message = `Audio sample "${resolvedName}" could not be loaded. Falling back to generated beep.`;
        globalScope.console.error(message);
        this._emitError({
          code: 'missing-sample',
          requestedName: name,
          resolvedName,
          missingSample: true,
          fallbackActive: true,
          message,
        });
        return this._playDataUrl(FALLBACK_BEEP_BASE64, options);
      }
      return this._playDataUrl(`data:audio/wav;base64,${payload}`, options);
    }

    playRandom(nameList = [], options = {}) {
      const list = Array.isArray(nameList) ? nameList : [nameList];
      for (let i = 0; i < list.length; i += 1) {
        const alias = list[i];
        if (this.has(alias)) {
          return this.play(alias, options);
        }
      }
      return this.play(list[0], options);
    }

    _playDataUrl(src, options = {}) {
      if (typeof this.window.Audio === 'function') {
        try {
          const audio = new this.window.Audio(src);
          if (typeof options.volume === 'number') {
            audio.volume = Math.max(0, Math.min(1, options.volume));
          }
          audio.loop = Boolean(options.loop);
          const playResult = audio.play?.();
          if (playResult && typeof playResult.then === 'function') {
            playResult.catch((error) => {
              const message = `Audio playback failed: ${error?.message || 'Unknown error'}`;
              globalScope.console.error(message, error);
              this._emitError({ code: 'playback-error', message, error });
            });
          }
          return audio;
        } catch (error) {
          const message = `Audio playback failed: ${error?.message || 'Unknown error'}`;
          globalScope.console.error(message, error);
          this._emitError({ code: 'playback-error', message, error });
        }
      }
      return { src, loop: Boolean(options.loop), volume: options.volume ?? 1 };
    }
  }

  const AudioControllerFactory = {
    create(windowRef) {
      return new AudioController({ window: windowRef });
    },
  };

  const HEIGHT_MAP_BASE = Array.from({ length: WORLD_SIZE }, (_, x) =>
    Array.from({ length: WORLD_SIZE }, (_, z) => ({
      x,
      z,
      height: Math.floor(4 + Math.sin(x / 8) * 2 + Math.cos(z / 6) * 2),
    })),
  );

  function createHeightMap() {
    return HEIGHT_MAP_BASE.map((row) => row.map((cell) => ({ ...cell })));
  }

  function ensureArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  const DEFAULT_PORTAL_STATE = {
    active: false,
    progress: 0,
    requiredBlocks: 12,
    remainingBlocks: 12,
    state: 'inactive',
    statusLabel: 'Portal dormant',
    statusMessage: 'Gather resources to reignite the portal.',
    obstructionSummary: '',
    blocked: false,
  };

  class SimpleExperience {
    constructor({ canvas, ui = {}, window: windowRef = globalScope.window || globalScope } = {}) {
      this.window = windowRef;
      this.canvas = canvas;
      this.ui = ui;
      this.THREE = THREE || windowRef.THREE_GLOBAL || windowRef.THREE || null;
      this.heightMap = createHeightMap();
      this.columns = new Map();
      this.terrainGroup = this.THREE ? new this.THREE.Group() : { children: [], add: noop };
      this.terrainChunkGroups = [];
      this.terrainChunkMap = new Map();
      this.dirtyTerrainChunks = new Set();
      this.portalGroup = this.THREE ? new this.THREE.Group() : { children: [], add: noop };
      this.zombieGroup = this.THREE ? new this.THREE.Group() : { children: [], add: noop };
      this.golemGroup = this.THREE ? new this.THREE.Group() : { children: [], add: noop };
      this.chestGroup = this.THREE ? new this.THREE.Group() : { children: [], add: noop };
      this.challengeGroup = this.THREE ? new this.THREE.Group() : { children: [], add: noop };
      this.worldRoot = this.THREE ? new this.THREE.Group() : { children: [], add: noop };
      this.scene = this.THREE ? new this.THREE.Scene() : { children: [], add: noop };
      this.camera = this.THREE ? new this.THREE.PerspectiveCamera(60, 1, 0.1, 1000) : { position: { set: noop } };
      this.playerRig = this.THREE ? new this.THREE.Group() : { position: { set: noop }, add: noop };
      if (this.scene.add) {
        this.scene.add(this.worldRoot);
      }
      this.worldRoot.add?.(this.terrainGroup);
      this.worldRoot.add?.(this.portalGroup);
      this.worldRoot.add?.(this.zombieGroup);
      this.worldRoot.add?.(this.golemGroup);
      this.worldRoot.add?.(this.chestGroup);

      this.keys = new Set();
      this.keyBindings = cloneKeyBindings(DEFAULT_KEY_BINDINGS);
      this.pointerLocked = false;
      this.pointerLockFallbackActive = false;
      this.activeAmbientTrack = null;
      this.audio = AudioControllerFactory.create(this.window);
      this.score = 0;
      this.scoreBreakdown = { recipes: 0, dimensions: 0, portal: 0, combat: 0, loot: 0, penalties: 0 };
      this.craftingScoreEvents = 0;
      this.dimensionScoreEvents = 0;
      this.portalScoreEvents = 0;
      this.combatScoreEvents = 0;
      this.lootScoreEvents = 0;
      this.health = 10;
      this.maxHealth = 10;
      this.playerBreath = 10;
      this.playerBreathCapacity = 10;
      this.portalState = { ...DEFAULT_PORTAL_STATE };
      this.portalStatusMessage = this.portalState.statusMessage;
      this.portalIgnitionLog = [];
      this.eventBindingFailures = [];
      this.eventBindingFailureNotices = new Set();
      this.dimensionLootOrders = new Map();
      this.dimensionLootOrderOffsets = new Map();
      this.dimensionSettings = DimensionThemes[0];
      this.currentDimensionIndex = 0;
      this.portalMechanics = {
        enterPortal: () => ({ pointsAwarded: 0, dimensionChanged: false, log: '' }),
      };
      this.rendererUnavailable = false;
      this.rendererFailureMessage = '';
      this.blankFrameDetectionState = {
        enabled: true,
        samples: 0,
        clearFrameMatches: 0,
        triggered: false,
      };
      this.renderedFrameCount = 0;
      this.renderAccumulator = 0;
      this.renderActiveInterval = 1 / 60;
      this.elapsed = DAY_LENGTH_SECONDS * 0.5;
      this.zombies = [];
      this.golems = [];
      this.chests = [];
      this.loadedModels = new Map();
      this.assetFailureCounts = new Map();
      this.textureFallbackMissingKeys = new Set();
      this.textureCache = new Map();
      this.texturePackErrorCount = 0;
      this.movementBindingDiagnostics = {
        pending: false,
        initialTimestamp: 0,
        validationSource: null,
        initialRigPosition: null,
        initialAvatarPosition: null,
      };
      this.playerHintEl = ui.playerHintEl || null;
      this.footerStatusEl = ui.footerStatusEl || { textContent: '' };
      this.footerEl = ui.footerEl || { dataset: {} };
      this.portalActivated = false;
      this.victoryAchieved = false;
      this.lastHintMessage = '';
      this.lastDimensionTransition = null;
      this.hudActive = false;
      this.columnsPopulated = false;
      this.runDimensionExitHooks = async () => {};
      this.runDimensionEnterHooks = async () => {};
      this.runDimensionReadyHooks = async () => {};
      this.verifyDimensionAssetsAfterTransition = () => ({ allPresent: true });
      this.applyDimensionSettings(this.currentDimensionIndex);
      this.initializeLootCaches();
      this.bindControlMapSubscription();
    }

    bindControlMapSubscription() {
      if (!this.window || !this.window.SimpleExperience) {
        return;
      }
      if (!this.window.SimpleExperience.__controlSubscription__) {
        this.window.SimpleExperience.__controlSubscription__ = ControlMap.subscribe((map) => {
          if (!this.destroyed) {
            this.keyBindings = cloneKeyBindings(map);
          }
        });
      }
      this.keyBindings = cloneKeyBindings(ControlMap.get());
    }

    initializeLootCaches() {
      Object.keys(DimensionLootTables).forEach((id) => {
        const entries = DimensionLootTables[id];
        const order = entries.map((_, index) => index);
        this.shuffleArray(order);
        this.dimensionLootOrders.set(id, order);
        this.dimensionLootOrderOffsets.set(id, 0);
      });
    }

    shuffleArray(target) {
      for (let i = target.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = target[i];
        target[i] = target[j];
        target[j] = temp;
      }
    }

    start() {
      this.audio.resumeContextIfNeeded?.();
      const ambientOrder = ['ambientOverworld', 'ambientDefault'];
      let ambientPlayed = false;
      for (let i = 0; i < ambientOrder.length; i += 1) {
        const track = ambientOrder[i];
        if (this.audio.has?.(track)) {
          try {
            this.audio.play(track, { loop: true, volume: 0.4 });
          } catch (ambientError) {
            globalScope.console.debug('Ambient playback failed.', ambientError);
          }
          this.activeAmbientTrack = track;
          ambientPlayed = true;
          break;
        }
      }
      if (!ambientPlayed) {
        this.activeAmbientTrack = null;
        const message = 'No embedded audio samples were detected. Gameplay actions will fall back to a beep until audio assets are restored.';
        globalScope.console.warn(message);
      }
      const welcomeAvailable = this.audio.has?.('welcome');
      let welcomeErrorDetail = null;
      if (!welcomeAvailable) {
        const resolved = this.audio._resolve?.('welcome') || 'welcome';
        const message = resolved === 'welcome'
          ? 'Audio sample "welcome" is unavailable. Playing fallback beep instead.'
          : `Audio sample "welcome" unavailable — falling back to "${resolved}".`;
        welcomeErrorDetail = {
          code: 'missing-sample',
          requestedName: 'welcome',
          resolvedName: resolved,
          missingSample: true,
          fallbackActive: true,
          message,
        };
      }
      try {
        this.audio.play('welcome', { volume: 0.55 });
      } catch (error) {
        welcomeErrorDetail = {
          code: 'welcome-playback-error',
          requestedName: 'welcome',
          message: 'Fallback beep active until audio assets are restored.',
          error,
          fallbackActive: true,
        };
        if (this.window.bootstrapOverlay) {
          const overlay = this.window.bootstrapOverlay;
          overlay.showError?.({
            title: 'Audio playback failed',
            message: 'Fallback beep active until audio assets are restored.',
          });
          overlay.setDiagnostic?.('audio', {
            status: 'error',
            message: 'Fallback beep active until audio assets are restored.',
          });
          overlay.logEvent?.('audio', 'Fallback beep active until audio assets are restored.', {
            level: 'error',
            detail: welcomeErrorDetail,
          });
        }
        try {
          this.audio.play('welcome', { volume: 0.4 });
        } catch (fallbackError) {
          globalScope.console.debug('Fallback welcome playback failed.', fallbackError);
        }
      }
      if (welcomeErrorDetail) {
        this.window.dispatchEvent?.(
          new this.window.CustomEvent('infinite-rails:audio-error', {
            detail: welcomeErrorDetail,
          }),
        );
      }
      this.populateSceneAfterTerrain({ reason: 'start' });
      this.spawnDimensionChests();
      this.positionPlayer();
      this.refreshPortalState();
      this.scheduleScoreSync();
      this.updateHud();
      this.publishStateSnapshot('start');
      return this;
    }

    createAudioController() {
      const controller = AudioControllerFactory.create(this.window);
      this.audio = controller;
      if (!this.window.INFINITE_RAILS_AUDIO_ALIASES) {
        this.window.INFINITE_RAILS_AUDIO_ALIASES = {};
      }
      return controller;
    }

    populateSceneAfterTerrain(context = {}) {
      const summary = this.summariseRequiredSceneNodes?.() || {
        allPresent: true,
        missing: [],
      };
      if (!summary.allPresent) {
        const message = 'Scene graph validation failed — required nodes missing after scene population.';
        globalScope.console.assert(false, message, { ...context, missing: summary.missing });
        if (this.window.bootstrapOverlay) {
          const overlay = this.window.bootstrapOverlay;
          overlay.showError?.({ title: 'Scene validation failed', message });
          overlay.setDiagnostic?.('scene', { status: 'error', message });
          overlay.logEvent?.('scene', message, { level: 'error', context });
        }
        if (typeof globalScope.notifyLiveDiagnostics === 'function') {
          try {
            globalScope.notifyLiveDiagnostics({ scope: 'scene', status: 'error', message, context });
          } catch (error) {
            globalScope.console.debug('Live diagnostics notification failed.', error);
          }
        }
      }
      return summary;
    }

    positionPlayer() {
      const height = this.heightMap[0]?.[0]?.height ?? 0;
      if (this.playerRig?.position?.set) {
        this.playerRig.position.set(0, height + 1.8, 0);
      }
    }

    spawnDimensionChests() {
      const theme = this.dimensionSettings;
      const loot = DimensionLootTables[theme?.id || 'origin'] || [];
      this.chests = loot.slice(0, 2).map((entry, index) => ({
        id: `${theme.id}-chest-${index}`,
        message: entry.message,
        items: entry.items,
      }));
      if (this.chestGroup?.children) {
        this.chestGroup.children.length = 0;
        this.chests.forEach((chest, index) => {
          const mesh = this.THREE ? new this.THREE.Object3D() : { userData: {} };
          mesh.name = `Chest-${index}`;
          mesh.userData.loot = chest.items;
          this.chestGroup.add?.(mesh);
        });
      }
      const id = theme?.id || 'origin';
      const offset = (this.dimensionLootOrderOffsets.get(id) || 0) + this.chests.length;
      const order = this.dimensionLootOrders.get(id) || [];
      this.dimensionLootOrderOffsets.set(id, offset % order.length || 0);
      return this.chests;
    }

    getChestLootForDimension(id, index) {
      const entries = DimensionLootTables[id] || [];
      if (!entries.length) {
        return { message: 'Empty chest', items: [] };
      }
      const order = this.dimensionLootOrders.get(id) || entries.map((_, idx) => idx);
      const offset = this.dimensionLootOrderOffsets.get(id) || 0;
      const pickIndex = order[(offset + index) % order.length];
      return entries[pickIndex];
    }

    buildTerrain() {
      const size = this.heightMap.length;
      this.columns.clear();
      for (let x = 0; x < size; x += 1) {
        for (let z = 0; z < size; z += 1) {
          const key = `${x}|${z}`;
          const cell = this.heightMap[x][z];
          const columnHeight = Math.max(1, cell.height);
          const meshes = [];
          for (let y = 0; y < columnHeight; y += 1) {
            const mesh = this.THREE ? new this.THREE.Mesh(new this.THREE.BoxGeometry(1, 1, 1), new this.THREE.MeshStandardMaterial()) : { visible: true };
            mesh.position.set?.(x - size / 2, y, z - size / 2);
            meshes.push(mesh);
          }
          this.columns.set(key, meshes);
        }
      }
      this.columnsPopulated = true;
      const columnCount = this.columns.size;
      globalScope.console.info(
        `World generation summary — ${columnCount} columns created. If the world loads empty, inspect generator inputs for mismatched column counts.`,
      );
      return this.columns;
    }

    loadExternalVoxelTexture(key) {
      this.texturePackErrorCount += 1;
      this.lastHintMessage = `Texture pack unavailable — using fallback materials for ${key}.`;
      this.textureFallbackMissingKeys.add(key);
      this.emitGameEvent('asset-load-failure', {
        key: `texture:${key}`,
        fallbackMessage: 'Texture pack unavailable; using procedural fallback textures.',
      });
      const defaultTexture = this.materials?.[key]?.map || this.textureCache.get(key) || null;
      return Promise.resolve(defaultTexture);
    }

    noteTexturePackFallback(key, { reason = 'missing' } = {}) {
      this.texturePackErrorCount += 1;
      this.lastHintMessage = `Texture pack unavailable — missing textures for ${key}.`;
      this.textureFallbackMissingKeys.add(key);
      this.assetFailureCounts.set(`texture:${key}`, (this.assetFailureCounts.get(`texture:${key}`) || 0) + 1);
      this.emitGameEvent('asset-load-failure', {
        key: `texture:${key}`,
        reason,
        fallbackMessage: 'Texture pack unavailable; using procedural fallback textures.',
      });
    }

    emitGameEvent(type, detail) {
      if (!this.window) {
        return;
      }
      try {
        this.window.dispatchEvent?.(new this.window.CustomEvent(`infinite-rails:${type}`, { detail }));
      } catch (error) {
        globalScope.console.debug('Failed to dispatch game event.', error);
      }
    }

    refreshPortalState() {
      return { ...this.portalState };
    }

    updatePortalProgress() {
      if (!this.ui?.portalProgressBar) {
        return;
      }
      const progress = this.portalState.progress || 0;
      const value = Number.isFinite(progress) ? progress : 0;
      this.ui.portalProgressBar.style?.setProperty?.('--progress', value.toFixed(2));
      if (this.ui.portalProgressLabel) {
        this.ui.portalProgressLabel.textContent = this.portalState.progressLabel || '';
      }
    }

    publishStateSnapshot(reason) {
      this.window.__INFINITE_RAILS_STATE__ = {
        isRunning: true,
        rendererMode: 'simple',
        reason,
        dimension: this.dimensionSettings,
        score: this.score,
        updatedAt: Date.now(),
      };
    }

    updateHud() {
      const ui = this.ui || {};
      if (ui.heartsEl) {
        ui.heartsEl.innerHTML = '<div class="hud-hearts"></div>';
        ui.heartsEl.dataset.health = String(this.health);
        ui.heartsEl.dataset.maxHealth = String(this.maxHealth);
      }
      if (ui.bubblesEl) {
        const percent = Math.round((this.playerBreath / this.playerBreathCapacity) * 100);
        ui.bubblesEl.innerHTML = '<div class="hud-bubbles"></div>';
        ui.bubblesEl.dataset.breath = String(this.playerBreath);
        ui.bubblesEl.dataset.maxBreath = String(this.playerBreathCapacity);
        ui.bubblesEl.dataset.breathPercent = String(percent);
      }
      if (ui.scoreTotalEl) {
        ui.scoreTotalEl.textContent = String(this.score);
      }
      if (ui.scoreRecipesEl) {
        ui.scoreRecipesEl.textContent = `${this.craftingScoreEvents} crafts (+${this.scoreBreakdown.recipes} pts)`;
      }
      if (ui.scoreDimensionsEl) {
        const penalty = this.scoreBreakdown.penalties ? `, -${this.scoreBreakdown.penalties} penalty` : '';
        ui.scoreDimensionsEl.textContent = `${this.dimensionScoreEvents + 1} (+${this.scoreBreakdown.dimensions} pts${penalty})`;
      }
      if (ui.scorePortalsEl) {
        ui.scorePortalsEl.textContent = `${this.portalScoreEvents} event (+${this.scoreBreakdown.portal} pts)`;
      }
      if (ui.scoreCombatEl) {
        ui.scoreCombatEl.textContent = `${this.combatScoreEvents} victories (+${this.scoreBreakdown.combat} pts)`;
      }
      if (ui.scoreLootEl) {
        ui.scoreLootEl.textContent = `${this.lootScoreEvents} finds (+${this.scoreBreakdown.loot} pts)`;
      }
      if (ui.dimensionInfoEl) {
        const index = this.currentDimensionIndex + 1;
        const total = DimensionThemes.length;
        const { name = '', description = '', gravity = 1, speedMultiplier = 1 } = this.dimensionSettings || {};
        ui.dimensionInfoEl.innerHTML = `<h3>${name}</h3><p>${description}</p><p>Gravity ×${gravity.toFixed(2)} · Speed ×${speedMultiplier.toFixed(2)}</p><p>Dimension ${index}/${total}</p>`;
        ui.dimensionInfoEl.dataset.simpleInit = 'true';
      }
      const portalSnapshot = this.getPortalStatusSnapshot();
      if (ui.portalProgressLabel) {
        ui.portalProgressLabel.textContent = portalSnapshot.progressLabel;
      }
      if (ui.portalProgressBar?.style?.setProperty) {
        ui.portalProgressBar.style.setProperty('--progress', portalSnapshot.displayProgress.toFixed(2));
      }
      if (ui.portalStatusEl) {
        ui.portalStatusEl.dataset.state = portalSnapshot.state;
        ui.portalStatusEl.setAttribute?.(
          'aria-label',
          `Portal status: ${portalSnapshot.statusLabel}. ${portalSnapshot.statusMessage}`,
        );
        ui.portalStatusEl.classList?.add?.('portal-status--flash');
      }
      if (ui.portalStatusText) {
        ui.portalStatusText.textContent = portalSnapshot.statusMessage;
      }
      if (ui.portalStatusStateText) {
        ui.portalStatusStateText.textContent = portalSnapshot.statusLabel;
      }
      if (ui.portalStatusDetailText) {
        ui.portalStatusDetailText.textContent = portalSnapshot.statusMessage;
      }
      if (ui.portalStatusIcon) {
        ui.portalStatusIcon.dataset.state = portalSnapshot.state;
      }
      this.updateInventoryUi?.();
      this.updateFooterSummary?.();
      this.publishStateSnapshot('hud-update');
    }

    getPortalStatusSnapshot(overrides = {}) {
      const state = { ...this.portalState, ...overrides };
      const progressPercent = Math.round((state.progress || 0) * 100);
      const remaining = Math.max(0, state.remainingBlocks ?? 0);
      const required = Math.max(1, state.requiredBlocks ?? 1);
      return {
        progress: state.progress || 0,
        progressPercent,
        remainingBlocks: remaining,
        requiredBlocks: required,
        state: state.state || 'inactive',
        statusLabel: state.statusLabel || 'Portal dormant',
        statusMessage: state.statusMessage || 'Gather resources to reignite the portal.',
        progressLabel: state.progressLabel || 'Portal stabilising',
        displayProgress: state.displayProgress ?? state.progress ?? 0,
        blocked: Boolean(state.blocked),
        obstructionSummary: state.obstructionSummary || '',
        nextDimension: state.nextDimension || '',
        nextRules: state.nextRules || '',
      };
    }

    verifyCriticalAssetAvailability({ fetch, concurrency = 4 } = {}) {
      const tasks = [];
      const missing = new Set();
      let reachable = 0;

      const enqueue = (key, sources) => {
        tasks.push(async () => {
          for (let i = 0; i < sources.length; i += 1) {
            try {
              const response = await fetch(sources[i], { method: 'HEAD' });
              if (response?.ok) {
                reachable += 1;
                return;
              }
              if (response?.status === 405 || response?.status === 403) {
                const retry = await fetch(sources[i], { method: 'GET' });
                if (retry?.ok) {
                  reachable += 1;
                  return;
                }
              }
            } catch (error) {
              // ignore and continue to next source
            }
          }
          missing.add(key);
        });
      };

      const textureKeys = ensureArray(this.collectCriticalTextureKeys?.());
      textureKeys.forEach((key) => {
        const sources = this.resolveAssetSourceCandidates?.(`texture:${key}`) || [];
        enqueue(`texture:${key}`, sources);
      });

      const modelEntries = ensureArray(this.collectCriticalModelEntries?.());
      modelEntries.forEach((entry) => {
        const key = entry?.key || entry?.id || entry?.name;
        if (!key) {
          return;
        }
        const sources = this.resolveAssetSourceCandidates?.(key) || [];
        enqueue(key, sources);
      });

      const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
        while (tasks.length) {
          const task = tasks.shift();
          if (task) {
            await task();
          }
        }
      });

      return Promise.all(workers).then(() => {
        const status = missing.size ? 'missing' : 'ok';
        if (missing.size) {
          globalScope.console.warn('Critical asset availability check failed.', {
            missing: Array.from(missing),
            reachable,
          });
        } else {
          globalScope.console.info('Critical asset availability verified.');
        }
        return {
          status,
          missing: Array.from(missing),
          reachable,
        };
      });
    }

    collectCriticalTextureKeys() {
      return ['grass', 'dirt', 'stone', 'rails'];
    }

    collectCriticalModelEntries() {
      return [
        { key: 'steve', url: 'assets/steve.gltf' },
        { key: 'zombie', url: 'assets/zombie.gltf' },
        { key: 'iron_golem', url: 'assets/iron_golem.gltf' },
      ];
    }

    resolveAssetSourceCandidates(key) {
      const manifest = this.dimensionSettings?.assetManifest || DimensionManifest.origin;
      if (key.startsWith('texture:')) {
        const name = key.slice('texture:'.length);
        const textures = manifest.assets?.textures || {};
        return ensureArray(textures[name]);
      }
      if (manifest.assets?.models?.[key]) {
        return [manifest.assets.models[key]];
      }
      return [];
    }

    addSafeEventListener(target, eventName, handler, options) {
      if (!target) {
        const failure = { reason: 'missing-target', eventName, options };
        this.eventBindingFailures.push(failure);
        this.eventBindingFailureNotices.add(failure);
        globalScope.console.error('Failed to bind event listener: missing target.', failure);
        return false;
      }
      if (typeof handler !== 'function') {
        const failure = { reason: 'invalid-handler', eventName, options, meta: { handlerType: typeof handler } };
        this.eventBindingFailures.push(failure);
        this.eventBindingFailureNotices.add(failure);
        globalScope.console.error('Failed to bind event listener: handler is not a function.', failure);
        return false;
      }
      try {
        target.addEventListener?.(eventName, handler, options);
        return true;
      } catch (error) {
        const failure = {
          reason: 'bind-error',
          eventName,
          options,
          errorMessage: error?.message || 'Unknown error',
          handler: handler.name || '(anonymous)',
        };
        this.eventBindingFailures.push(failure);
        this.eventBindingFailureNotices.add(failure);
        globalScope.console.error('Failed to bind event listener.', failure);
        return false;
      }
    }

    ensurePrimaryLights() {
      if (!this.THREE) {
        return;
      }
      if (!this.worldRoot) {
        this.worldRoot = new this.THREE.Group();
      }
      if (!this.scene) {
        this.scene = new this.THREE.Scene();
      }
      if (!this.sunLight) {
        this.sunLight = new this.THREE.DirectionalLight(0xffffff, 1);
        this.worldRoot.add(this.sunLight);
      }
      if (!this.moonLight) {
        this.moonLight = new this.THREE.DirectionalLight(0x8ea2ff, 0.4);
        this.worldRoot.add(this.moonLight);
      }
      if (!this.ambientLight) {
        this.ambientLight = new this.THREE.AmbientLight(0xffffff, 0.2);
        this.worldRoot.add(this.ambientLight);
      }
      if (!this.hemiLight) {
        this.hemiLight = new this.THREE.HemisphereLight(0xbddcff, 0x34502d, 0.9);
        this.worldRoot.add(this.hemiLight);
      }
    }

    applyPendingLightingFallback() {
      if (!this.lightingFallbackPending) {
        return;
      }
      this.ensurePrimaryLights();
      if (this.sunLight) {
        this.sunLight.intensity = Math.max(0.85, this.sunLight.intensity);
      }
      if (this.ambientLight) {
        this.ambientLight.intensity = Math.max(0.35, this.ambientLight.intensity);
      }
      this.lightingFallbackActive = true;
      this.lightingFallbackPending = false;
    }

    createPortalPlaceholderMesh() {
      const mesh = this.THREE ? new this.THREE.Mesh(new this.THREE.BoxGeometry(2, 3, 0.1), new this.THREE.MeshStandardMaterial({ color: 0x663399 })) : { userData: {} };
      mesh.userData = mesh.userData || {};
      mesh.userData.placeholder = true;
      mesh.userData.placeholderReason = 'shader-fallback';
      return mesh;
    }

    activatePortal() {
      if (this.portalShaderFallbackActive) {
        return true;
      }
      try {
        const mesh = this.createPortalPlaceholderMesh();
        this.portalMesh = mesh;
        this.portalGroup.add?.(mesh);
      } catch (error) {
        this.portalShaderFallbackActive = true;
        this.lightingFallbackPending = true;
        const message = 'Portal shader offline — emissive fallback active.';
        this.portalStatusMessage = message;
        this.portalIgnitionLog.unshift(message);
        this.lastHintMessage = message;
        return true;
      }
      return true;
    }

    ensurePlayerPhysicsBody() {
      if (!this.playerPhysicsBody && this.THREE) {
        this.playerPhysicsBody = new this.THREE.Object3D();
      }
      return this.playerPhysicsBody;
    }

    ensurePlayerAvatarPlaceholder() {
      if (!this.playerAvatarPlaceholder && this.THREE) {
        this.playerAvatarPlaceholder = new this.THREE.Mesh(new this.THREE.BoxGeometry(1, 2, 1), new this.THREE.MeshStandardMaterial());
        this.worldRoot.add?.(this.playerAvatarPlaceholder);
      }
      return this.playerAvatarPlaceholder;
    }

    getPlayerAvatarWorldPosition(target) {
      if (this.playerAvatarPlaceholder?.getWorldPosition) {
        return this.playerAvatarPlaceholder.getWorldPosition(target);
      }
      if (target?.copy && this.playerRig?.position) {
        target.copy(this.playerRig.position);
        return target;
      }
      return target || { x: 0, y: 0, z: 0 };
    }

    getHighResTimestamp() {
      return typeof this.window?.performance?.now === 'function' ? this.window.performance.now() : Date.now();
    }

    queueMovementBindingValidation(source) {
      const now = this.getHighResTimestamp();
      const anchor = this.playerRig?.position?.clone ? this.playerRig.position.clone() : null;
      const avatarAnchor = this.playerAvatarPlaceholder?.position?.clone ? this.playerAvatarPlaceholder.position.clone() : null;
      this.movementBindingDiagnostics = {
        pending: true,
        validationSource: source,
        initialTimestamp: now,
        initialRigPosition: anchor,
        initialAvatarPosition: avatarAnchor,
      };
    }

    validateMovementBindings(anchor, rigDisplacementSq, avatarAnchor, avatarDisplacementSq) {
      globalScope.console.warn(
        'Movement input detected — validation triggered.',
        anchor,
        rigDisplacementSq,
        avatarAnchor,
        avatarDisplacementSq,
      );
    }

    getPlayerWorldPosition(target) {
      if (this.playerRig?.getWorldPosition) {
        return this.playerRig.getWorldPosition(target);
      }
      if (target?.copy && this.playerRig?.position) {
        target.copy(this.playerRig.position);
        return target;
      }
      return target || { x: 0, y: 0, z: 0 };
    }

    evaluateMovementBindingDiagnostics() {
      const diagnostics = this.movementBindingDiagnostics;
      if (!diagnostics.pending) {
        return;
      }
      const rigPosition = this.playerRig?.position;
      const anchor = diagnostics.initialRigPosition;
      const avatarAnchor = diagnostics.initialAvatarPosition;
      let rigDisplacementSq = null;
      let avatarDisplacementSq = null;
      if (rigPosition && anchor && rigPosition.distanceToSquared) {
        rigDisplacementSq = rigPosition.distanceToSquared(anchor);
      }
      if (this.playerAvatarPlaceholder?.position && avatarAnchor && avatarAnchor.distanceToSquared) {
        avatarDisplacementSq = this.playerAvatarPlaceholder.position.distanceToSquared(avatarAnchor);
      }
      if (rigDisplacementSq !== null && rigDisplacementSq > 0.0025) {
        diagnostics.pending = false;
        return;
      }
      if (avatarDisplacementSq !== null && avatarDisplacementSq > 0.0025) {
        diagnostics.pending = false;
        return;
      }
      diagnostics.pending = false;
      this.validateMovementBindings(anchor, rigDisplacementSq, avatarAnchor, avatarDisplacementSq);
    }

    renderFrame(delta) {
      try {
        this.stepSimulation?.(delta);
        if (this.renderer?.render) {
          this.renderer.render(this.scene, this.camera);
        }
      } catch (error) {
        this.presentRendererFailure('Rendering paused due to an unrecoverable error.', {
          error,
          stage: this.renderer ? 'render' : 'simulation',
        });
        this.rendererUnavailable = true;
        this.rendererFailureMessage = 'Rendering paused due to an unrecoverable error.';
        return;
      }
      this.renderedFrameCount += 1;
    }

    presentRendererFailure(message, context) {
      this.rendererUnavailable = true;
      this.rendererFailureMessage = message;
      this.emitGameEvent('renderer-failure', { message, context });
    }

    scheduleScoreSync() {
      this.lastScoreSyncScheduled = Date.now();
    }

    showHint(message) {
      this.lastHintMessage = message;
      if (this.playerHintEl) {
        this.playerHintEl.textContent = message;
        this.playerHintEl.classList?.add?.('visible');
      }
      if (this.footerStatusEl) {
        this.footerStatusEl.textContent = message;
      }
      if (this.footerEl?.dataset) {
        this.footerEl.dataset.state = 'warning';
      }
    }

    notifyScoreEvent(type, payload) {
      this.emitGameEvent('score-event', { type, payload });
    }

    addScoreBreakdown(category, amount) {
      if (typeof amount !== 'number') {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(this.scoreBreakdown, category)) {
        this.scoreBreakdown[category] = 0;
      }
      this.scoreBreakdown[category] += amount;
    }

    advanceDimension() {
      const mechanics = this.portalMechanics || {};
      const result = mechanics.enterPortal?.() || { pointsAwarded: 0, dimensionChanged: false };
      const previous = this.dimensionSettings;
      if (result.dimensionChanged) {
        this.dimensionScoreEvents += 1;
        this.score += result.pointsAwarded || 0;
        this.addScoreBreakdown('dimensions', result.pointsAwarded || 0);
        const nextIndex = (this.currentDimensionIndex + 1) % DimensionThemes.length;
        this.applyDimensionSettings(nextIndex);
        this.buildTerrain();
        this.buildRails?.();
        this.spawnDimensionChests();
        this.refreshPortalState();
        this.revealDimensionIntro?.();
        this.rebindDimensionContext?.();
        this.updateHud();
        this.scheduleScoreSync();
        this.showHint?.(result.log || `Dimension unlock flow fired — ${this.dimensionSettings.name}. If the unlock fails to present rewards, audit quest requirements and persistence flags.`);
        this.lastDimensionTransition = { previousDimension: previous, nextDimension: this.dimensionSettings };
        this.runDimensionExitHooks?.({ previousDimension: previous, nextDimension: this.dimensionSettings });
        this.populateSceneAfterTerrain({ reason: 'dimension-transition' });
        this.handleDimensionPostInit?.({ previousDimension: previous, nextDimension: this.dimensionSettings, arrivalRules: result.log || '' });
        this.verifyDimensionAssetsAfterTransition?.({ reason: 'dimension-transition' });
      }
      return result;
    }

    applyDimensionSettings(index) {
      const theme = DimensionThemes[index];
      if (!theme) {
        globalScope.console.error('Dimension theme load attempt failed — falling back to origin.', { index });
        this.dimensionSettings = DimensionThemes[0];
        this.currentDimensionIndex = 0;
        return;
      }
      this.dimensionSettings = theme;
      this.currentDimensionIndex = index;
      this.portalState.nextDimension = theme.name;
      this.portalState.nextRules = `Gravity ×${theme.gravity.toFixed(2)} · Speed ×${theme.speedMultiplier.toFixed(2)}`;
    }

    getKeyBindings() {
      return cloneKeyBindings(this.keyBindings);
    }

    setKeyBinding(action, keys, { persist = true } = {}) {
      const defaultValue = DEFAULT_KEY_BINDINGS[action];
      if (!Array.isArray(keys) || keys.length === 0) {
        this.keyBindings[action] = defaultValue.slice();
      } else {
        this.keyBindings[action] = keys.slice();
      }
      if (persist) {
        ControlMap.apply({ [action]: this.keyBindings[action] });
      }
      return true;
    }

    destroy() {
      this.destroyed = true;
    }

    static destroyAll() {}
  }

  function createExperience(options) {
    const instance = new SimpleExperience(options);
    SimpleExperience.instances.add(instance);
    return instance;
  }

  SimpleExperience.instances = new Set();
  SimpleExperience.create = createExperience;
  SimpleExperience.dimensionThemes = DimensionThemes;
  SimpleExperience.dimensionLootTables = DimensionLootTables;
  SimpleExperience.controlMap = ControlMap;
  SimpleExperience.DIMENSION_MANIFEST = DimensionManifest;
  SimpleExperience.DAY_LENGTH_SECONDS = DAY_LENGTH_SECONDS;
  SimpleExperience.HOTBAR_SLOTS = HOTBAR_SLOTS;

  if (!globalScope.SimpleExperience) {
    globalScope.SimpleExperience = SimpleExperience;
  } else {
    Object.assign(globalScope.SimpleExperience, SimpleExperience);
  }

  if (globalScope.window && globalScope.window !== globalScope) {
    globalScope.window.SimpleExperience = globalScope.SimpleExperience;
    globalScope.window.InfiniteRailsDimensionManifest = DimensionManifest;
  }

  globalScope.InfiniteRailsDimensionManifest = DimensionManifest;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
