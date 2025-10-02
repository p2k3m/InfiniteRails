(function () {
  const WORLD_SIZE = 64;
  const DEFAULT_PROCEDURAL_VOXEL_PALETTE = {
    base: '#9a9a9a',
    highlight: '#c7c7c7',
    shadow: '#6e6e6e',
    accent: '#b5b5b5',
  };
  const BLOCK_SIZE = 1;
  const MIN_COLUMN_HEIGHT = 1;
  const MAX_COLUMN_HEIGHT = 6;
  const MAX_TERRAIN_VOXELS = WORLD_SIZE * WORLD_SIZE * MAX_COLUMN_HEIGHT;
  const DEFAULT_TERRAIN_VOXEL_CAP = WORLD_SIZE * WORLD_SIZE * 4;
  const TERRAIN_CULLING_POSITION_EPSILON_SQ = 0.0001;
  const TERRAIN_CULLING_ROTATION_EPSILON = 0.0001;
  const LAZY_ASSET_WARMUP_DELAY_MS = 250;
  const PLAYER_EYE_HEIGHT = 1.8;
  const PLAYER_BASE_SPEED = 4.5;
  const PLAYER_INERTIA = 0.88;
  const DAY_LENGTH_SECONDS = 600;
  const POINTER_SENSITIVITY = 0.0022;
  const POINTER_TUTORIAL_MESSAGE =
    'Click the viewport to capture your mouse, then use your movement keys to move and left-click to mine.';
  const POINTER_LOCK_FALLBACK_MESSAGE =
    'Pointer lock is blocked by your browser or an extension. Click and drag to look around, or allow mouse capture to re-enable full look controls.';
  const POINTER_LOCK_MAX_RETRIES = 2;
  const POINTER_LOCK_RETRY_DELAY_MS = 200;
  const POINTER_LOCK_RETRY_HINT_MESSAGE = 'Browser blocked mouse capture — retrying…';
  const POINTER_LOCK_CHANGE_EVENTS = ['pointerlockchange', 'mozpointerlockchange', 'webkitpointerlockchange'];
  const POINTER_LOCK_ERROR_EVENTS = ['pointerlockerror', 'mozpointerlockerror', 'webkitpointerlockerror'];
  const FALLBACK_HEALTH = 10;
  const PORTAL_BLOCK_REQUIREMENT = 10;
  const PORTAL_INTERACTION_RANGE = 4.5;
  const ZOMBIE_CONTACT_RANGE = 1.35;
  const ZOMBIE_SPAWN_INTERVAL = 8;
  const ZOMBIE_MAX_PER_DIMENSION = 4;
  const HOTBAR_SLOTS = 9;
  const KEY_BINDINGS_STORAGE_KEY = 'infinite-rails-keybindings';
  const SCOREBOARD_STORAGE_KEY = 'infinite-dimension-scoreboard';
  const FIRST_RUN_TUTORIAL_STORAGE_KEY = 'infinite-rails-first-run-tutorial';
  const MOVEMENT_ACTIONS = ['moveForward', 'moveBackward', 'moveLeft', 'moveRight'];
  const DEFAULT_KEY_BINDINGS = (() => {
    const map = {
      moveForward: ['KeyW', 'ArrowUp'],
      moveBackward: ['KeyS', 'ArrowDown'],
      moveLeft: ['KeyA', 'ArrowLeft'],
      moveRight: ['KeyD', 'ArrowRight'],
      jump: ['Space'],
      interact: ['KeyF'],
      buildPortal: ['KeyR'],
      resetPosition: ['KeyT'],
      placeBlock: ['KeyQ'],
      toggleCameraPerspective: ['KeyV'],
      toggleCrafting: ['KeyE'],
      toggleInventory: ['KeyI'],
      openGuide: ['F1'],
      openSettings: ['F2'],
      openLeaderboard: ['F3'],
      closeMenus: ['Escape'],
    };
    for (let slot = 1; slot <= HOTBAR_SLOTS; slot += 1) {
      const digit = slot;
      const action = `hotbar${slot}`;
      const bindings = [`Digit${digit}`];
      if (slot <= 9) {
        bindings.push(`Numpad${slot}`);
      }
      map[action] = bindings;
    }
    Object.keys(map).forEach((action) => {
      map[action] = Object.freeze([...map[action]]);
    });
    return Object.freeze(map);
  })();

  const configWarningDeduper = new Set();

  function logConfigWarning(message, context = {}) {
    const consoleRef = typeof console !== 'undefined' ? console : null;
    if (!consoleRef) {
      return;
    }
    const sortedKeys = Object.keys(context).sort();
    const dedupeKey = `${message}|${sortedKeys.map((key) => `${key}:${context[key]}`).join(',')}`;
    if (configWarningDeduper.has(dedupeKey)) {
      return;
    }
    configWarningDeduper.add(dedupeKey);
    if (typeof consoleRef.warn === 'function') {
      consoleRef.warn(message, context);
    } else if (typeof consoleRef.error === 'function') {
      consoleRef.error(message, context);
    } else if (typeof consoleRef.log === 'function') {
      if (typeof consoleRef.error === 'function') {
        consoleRef.error(message, context);
      } else {
        consoleRef.log(message, context);
      }
    }
  }

  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object') {
      return value;
    }
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
    const propertyNames = Object.getOwnPropertyNames(value);
    for (const name of propertyNames) {
      const property = value[name];
      if (property && typeof property === 'object') {
        deepFreeze(property, seen);
      }
    }
    return Object.freeze(value);
  }

  function normaliseApiBaseUrl(base) {
    if (!base || typeof base !== 'string') {
      return null;
    }
    const trimmed = base.trim();
    if (!trimmed) {
      return null;
    }
    let resolved;
    try {
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      resolved = new URL(trimmed, scope?.location?.href ?? undefined);
    } catch (error) {
      logConfigWarning(
        'Invalid APP_CONFIG.apiBaseUrl detected; remote sync disabled. Update APP_CONFIG.apiBaseUrl to a valid absolute HTTP(S) URL in your configuration to restore remote synchronisation.',
        {
          apiBaseUrl: base,
          error: error?.message ?? String(error),
        },
      );
      return null;
    }
    const hasExplicitProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    if (!hasExplicitProtocol) {
      logConfigWarning(
        'APP_CONFIG.apiBaseUrl must be an absolute URL including the protocol. Set APP_CONFIG.apiBaseUrl to a fully-qualified HTTP(S) endpoint (for example, https://example.com/api).',
        {
          apiBaseUrl: base,
          resolved: resolved.href,
        },
      );
      return null;
    }
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      logConfigWarning(
        'APP_CONFIG.apiBaseUrl must use HTTP or HTTPS. Update the configuration to point at an HTTP(S) service that can accept leaderboard sync requests.',
        {
          apiBaseUrl: base,
          protocol: resolved.protocol,
        },
      );
      return null;
    }
    if (resolved.search || resolved.hash) {
      logConfigWarning(
        'APP_CONFIG.apiBaseUrl should not include query strings or fragments; ignoring extras. Remove trailing query parameters or hashes from APP_CONFIG.apiBaseUrl so requests reach the API root.',
        {
          apiBaseUrl: base,
          search: resolved.search,
          hash: resolved.hash,
        },
      );
      resolved.search = '';
      resolved.hash = '';
    }
    return resolved.href.replace(/\/+$/, '');
  }

  function cloneKeyBindingMap(source = {}) {
    const result = {};
    Object.entries(source).forEach(([action, keys]) => {
      if (Array.isArray(keys)) {
        result[action] = [...keys];
      }
    });
    return result;
  }

  function normaliseKeyBindingValue(value) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }
    if (Array.isArray(value)) {
      const seen = new Set();
      const result = [];
      value.forEach((entry) => {
        if (typeof entry !== 'string') return;
        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed)) return;
        seen.add(trimmed);
        result.push(trimmed);
      });
      return result;
    }
    return [];
  }

  function normaliseKeyBindingMap(source) {
    if (!source || typeof source !== 'object') {
      return null;
    }
    const result = {};
    Object.entries(source).forEach(([action, value]) => {
      const keys = normaliseKeyBindingValue(value);
      if (keys.length) {
        result[action] = keys;
      }
    });
    return Object.keys(result).length ? result : null;
  }

  function mergeKeyBindingMaps(base, ...sources) {
    const merged = cloneKeyBindingMap(base);
    sources.forEach((source) => {
      if (!source) return;
      Object.entries(source).forEach(([action, keys]) => {
        if (!Array.isArray(keys) || !keys.length) return;
        merged[action] = [...keys];
      });
    });
    return merged;
  }

  function formatKeyLabel(code) {
    if (!code || typeof code !== 'string') {
      return '';
    }
    if (code.startsWith('Key')) {
      return code.slice(3);
    }
    if (code.startsWith('Digit')) {
      return code.slice(5);
    }
    if (code.startsWith('Numpad')) {
      return `Numpad ${code.slice(6)}`;
    }
    switch (code) {
      case 'ArrowUp':
        return '↑';
      case 'ArrowDown':
        return '↓';
      case 'ArrowLeft':
        return '←';
      case 'ArrowRight':
        return '→';
      case 'Space':
        return 'Space';
      case 'Escape':
        return 'Esc';
      default:
        return code;
    }
  }

  function joinKeyLabels(labels, options = {}) {
    const { fallback = '' } = options ?? {};
    if (!Array.isArray(labels)) {
      return fallback;
    }
    const filtered = labels.filter((label) => typeof label === 'string' && label.trim());
    if (!filtered.length) {
      return fallback;
    }
    if (filtered.length === 1) {
      return filtered[0];
    }
    return filtered.join(' / ');
  }

  function formatKeyListForSentence(labels, options = {}) {
    const { fallback = '' } = options ?? {};
    if (!Array.isArray(labels) || !labels.length) {
      return fallback;
    }
    if (labels.length === 1) {
      return labels[0];
    }
    if (labels.length === 2) {
      return `${labels[0]} or ${labels[1]}`;
    }
    const head = labels.slice(0, -1).join(', ');
    return `${head}, or ${labels[labels.length - 1]}`;
  }
  const MAX_STACK_SIZE = 99;
  const GOLEM_CONTACT_RANGE = 1.6;
  const GOLEM_SPAWN_INTERVAL = 26;
  const GOLEM_MAX_PER_DIMENSION = 2;
  const CHEST_COUNT_PER_DIMENSION = 2;
  const CHEST_INTERACT_RANGE = 1.8;
  const CHEST_HINT_COOLDOWN = 4.5;

  const DIMENSION_LOOT_TABLES = {
    origin: [
      {
        items: [
          { item: 'stick', quantity: 3 },
          { item: 'stone', quantity: 1 },
        ],
        score: 2,
        message: 'Starter cache recovered — craft your tools.',
      },
      {
        items: [
          { item: 'grass-block', quantity: 3 },
          { item: 'dirt', quantity: 2 },
        ],
        score: 1.5,
        message: 'Extra building stock secured from the chest.',
      },
    ],
    rock: [
      {
        items: [
          { item: 'stone', quantity: 4 },
          { item: 'portal-charge', quantity: 1 },
        ],
        score: 3,
        message: 'Dense rock cache pulsing with portal energy.',
      },
      {
        items: [
          { item: 'stone', quantity: 3 },
          { item: 'stick', quantity: 1 },
        ],
        score: 2.5,
        message: 'Rails reinforced with honed stone slabs.',
      },
    ],
    stone: [
      {
        items: [
          { item: 'portal-charge', quantity: 2 },
          { item: 'stone', quantity: 2 },
        ],
        score: 3.5,
        message: 'Portal charges hum with refined stone dust.',
      },
      {
        items: [
          { item: 'stone-pickaxe', quantity: 1 },
          { item: 'portal-charge', quantity: 1 },
        ],
        score: 4,
        message: 'A tempered pickaxe gleams inside the vault.',
      },
    ],
    tar: [
      {
        items: [
          { item: 'portal-charge', quantity: 2 },
          { item: 'grass-block', quantity: 2 },
        ],
        score: 3,
        message: 'Recovered supplies before the tar swallowed them.',
      },
      {
        items: [
          { item: 'stone', quantity: 2 },
          { item: 'stick', quantity: 2 },
        ],
        score: 2.5,
        message: 'Tar-soaked lumber salvaged for future rails.',
      },
    ],
    marble: [
      {
        items: [
          { item: 'portal-charge', quantity: 3 },
        ],
        score: 4.5,
        message: 'Marble vault releases concentrated portal charge.',
      },
      {
        items: [
          { item: 'stone', quantity: 2 },
          { item: 'grass-block', quantity: 2 },
        ],
        score: 3,
        message: 'Lightweight marble bricks packed for construction.',
      },
    ],
    netherite: [
      {
        items: [
          { item: 'portal-charge', quantity: 4 },
        ],
        score: 5,
        message: 'Eternal Ingot fragments resonate through the chest.',
      },
      {
        items: [
          { item: 'stone-pickaxe', quantity: 1 },
          { item: 'portal-charge', quantity: 2 },
        ],
        score: 5,
        message: 'Armaments secured for the final Netherite sprint.',
      },
    ],
  };

  const GLTF_LOADER_URLS = ['vendor/GLTFLoader.js'];

  const assetResolver =
    (typeof window !== 'undefined' && window.InfiniteRailsAssetResolver) ||
    (typeof globalThis !== 'undefined' && globalThis.InfiniteRailsAssetResolver) ||
    null;

  const createAssetUrlCandidates =
    assetResolver?.createAssetUrlCandidates ||
    ((relativePath) => {
      if (!relativePath || typeof relativePath !== 'string') {
        return [];
      }
      try {
        const base =
          (typeof document !== 'undefined' && document.baseURI) ||
          (typeof window !== 'undefined' && window.location?.href) ||
          undefined;
        const resolved = new URL(relativePath, base);
        return [resolved.href, relativePath];
      } catch (error) {
        return [relativePath];
      }
    });

  const resolveAssetUrl =
    assetResolver?.resolveAssetUrl ||
    ((relativePath) => {
      const candidates = createAssetUrlCandidates(relativePath);
      return candidates.length ? candidates[0] : relativePath;
    });

  const RECIPE_UNLOCK_STORAGE_KEY = 'infinite-rails-recipe-unlocks';

  const PORTAL_MECHANICS =
    (typeof window !== 'undefined' && window.PortalMechanics) ||
    (typeof globalThis !== 'undefined' && globalThis.PortalMechanics) ||
    null;

  const IDENTITY_STORAGE_KEY = 'infinite-rails-simple-identity';

  const MODEL_URLS = {
    arm: resolveAssetUrl('assets/arm.gltf'),
    steve: resolveAssetUrl('assets/steve.gltf'),
    zombie: resolveAssetUrl('assets/zombie.gltf'),
    golem: resolveAssetUrl('assets/iron_golem.gltf'),
  };

  const BASE_TERRAIN_REFERENCES = ['grass-block', 'dirt', 'stone', 'rail-segment', 'portal-anchor'];
  const BASE_MOB_REFERENCES = ['player-avatar', 'zombie', 'iron-golem'];
  const BASE_OBJECT_REFERENCES = [
    'loot-chest',
    'portal-frame',
    'portal-core',
    'rail-network',
    'crafting-interface',
    'eternal-ingot',
  ];
  const BASE_TEXTURE_REFERENCES = {
    grass: 'grass',
    dirt: 'dirt',
    stone: 'stone',
    rails: 'rails',
  };
  const BASE_MODEL_REFERENCES = {
    player: MODEL_URLS.steve,
    helperArm: MODEL_URLS.arm,
    zombie: MODEL_URLS.zombie,
    golem: MODEL_URLS.golem,
  };

  function normaliseStringSet(values, fallback) {
    const list = Array.isArray(values) && values.length ? values : fallback;
    return Array.from(
      new Set(
        list
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length > 0),
      ),
    );
  }

  function buildDimensionManifestEntry({
    id,
    name,
    inheritsFrom = null,
    terrain = BASE_TERRAIN_REFERENCES,
    mobs = BASE_MOB_REFERENCES,
    objects = BASE_OBJECT_REFERENCES,
    textures = BASE_TEXTURE_REFERENCES,
    models = BASE_MODEL_REFERENCES,
  }) {
    return {
      id,
      name,
      inheritsFrom,
      terrain: normaliseStringSet(terrain, BASE_TERRAIN_REFERENCES),
      mobs: normaliseStringSet(mobs, BASE_MOB_REFERENCES),
      objects: normaliseStringSet(objects, BASE_OBJECT_REFERENCES),
      assets: {
        textures: { ...(textures && typeof textures === 'object' ? textures : BASE_TEXTURE_REFERENCES) },
        models: { ...(models && typeof models === 'object' ? models : BASE_MODEL_REFERENCES) },
      },
    };
  }

  const DIMENSION_ASSET_MANIFEST = deepFreeze({
    origin: buildDimensionManifestEntry({ id: 'origin', name: 'Origin Grassland' }),
    rock: buildDimensionManifestEntry({
      id: 'rock',
      name: 'Rock Frontier',
      inheritsFrom: 'origin',
    }),
    stone: buildDimensionManifestEntry({
      id: 'stone',
      name: 'Stone Bastion',
      inheritsFrom: 'rock',
      objects: [...BASE_OBJECT_REFERENCES, 'bastion-rampart'],
    }),
    tar: buildDimensionManifestEntry({
      id: 'tar',
      name: 'Tar Marsh',
      inheritsFrom: 'stone',
      terrain: [...BASE_TERRAIN_REFERENCES, 'tar-pool'],
      mobs: [...BASE_MOB_REFERENCES, 'swamp-phantom'],
    }),
    marble: buildDimensionManifestEntry({
      id: 'marble',
      name: 'Marble Heights',
      inheritsFrom: 'tar',
      objects: [...BASE_OBJECT_REFERENCES, 'marble-bridge'],
    }),
    netherite: buildDimensionManifestEntry({
      id: 'netherite',
      name: 'Netherite Terminus',
      inheritsFrom: 'marble',
      objects: [...BASE_OBJECT_REFERENCES, 'eternal-ingot-pedestal'],
    }),
  });

  if (typeof window !== 'undefined') {
    window.InfiniteRailsDimensionManifest = DIMENSION_ASSET_MANIFEST;
  } else if (typeof globalThis !== 'undefined') {
    globalThis.InfiniteRailsDimensionManifest = DIMENSION_ASSET_MANIFEST;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports.DIMENSION_ASSET_MANIFEST = DIMENSION_ASSET_MANIFEST;
  }

  let cachedGltfLoaderPromise = null;

  function loadExternalScript(url) {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('Document is unavailable for script injection.'));
        return;
      }
      const existing = document.querySelector(`script[data-src="${url}"]`);
      if (existing) {
        if (existing.hasAttribute('data-loaded')) {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error(`Failed to load script: ${url}`)),
          { once: true },
        );
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.async = false;
      script.dataset.src = url;
      script.addEventListener('load', () => {
        script.setAttribute('data-loaded', 'true');
        resolve();
      });
      script.addEventListener('error', () => {
        script.remove();
        reject(new Error(`Failed to load script: ${url}`));
      });
      document.head.appendChild(script);
    });
  }

  function tryLoadGltfLoader(index = 0) {
    if (index >= GLTF_LOADER_URLS.length) {
      return Promise.reject(new Error('Unable to load any GLTFLoader sources.'));
    }
    const url = GLTF_LOADER_URLS[index];
    return loadExternalScript(url).catch(() => tryLoadGltfLoader(index + 1));
  }

  function ensureGltfLoader(THREE) {
    if (!THREE) {
      return Promise.reject(new Error('Three.js is unavailable; cannot initialise GLTFLoader.'));
    }
    if (THREE.GLTFLoader) {
      return Promise.resolve(THREE.GLTFLoader);
    }
    if (!cachedGltfLoaderPromise) {
      const scope = typeof window !== 'undefined' ? window : globalThis;
      cachedGltfLoaderPromise = tryLoadGltfLoader()
        .then(() => {
          if (!THREE.GLTFLoader && scope?.GLTFLoaderModule?.GLTFLoader) {
            THREE.GLTFLoader = scope.GLTFLoaderModule.GLTFLoader;
          }
          if (!THREE.GLTFLoader) {
            throw new Error('GLTFLoader script loaded but did not register the loader.');
          }
          return THREE.GLTFLoader;
        })
        .catch((error) => {
          cachedGltfLoaderPromise = null;
          throw error;
        });
    }
    return cachedGltfLoaderPromise;
  }

  function disposeObject3D(object) {
    if (!object || typeof object.traverse !== 'function') return;
    object.traverse((child) => {
      if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material?.dispose?.());
        } else {
          child.material?.dispose?.();
        }
        child.geometry?.dispose?.();
      }
    });
  }

  const ITEM_DEFINITIONS = {
    'grass-block': {
      label: 'Grass Block',
      icon: '🟩',
      placeable: true,
      description: 'Surface block with a soil base — perfect for bridging gaps.',
    },
    dirt: {
      label: 'Soil Chunk',
      icon: '🟫',
      placeable: true,
      description: 'Packed earth used for scaffolding and quick terrain fixes.',
    },
    stone: {
      label: 'Stone Brick',
      icon: '⬜',
      placeable: true,
      description: 'Dense masonry ideal for sturdy portal frames.',
    },
    stick: {
      label: 'Stick',
      icon: '🪵',
      placeable: false,
      description: 'Basic handle carved from wood — anchors most tools.',
    },
    'stone-pickaxe': {
      label: 'Stone Pickaxe',
      icon: '⛏️',
      placeable: false,
      equipment: true,
      description: 'Reliable pickaxe that cracks tougher ores and rails.',
    },
    'portal-charge': {
      label: 'Portal Charge',
      icon: '🌀',
      placeable: false,
      description: 'Volatile energy cell required to ignite the portal.',
    },
    'eternal-ingot': {
      label: 'Eternal Ingot',
      icon: '🔥',
      placeable: false,
      description: 'Legendary alloy that stabilises the Netherite rail network.',
    },
  };
  const DIMENSION_BADGE_SYMBOLS = {
    origin: '🌱',
    rock: '🪨',
    stone: '⛏️',
    tar: '⚫',
    marble: '🏛️',
    netherite: '🔥',
  };
  const DIMENSION_BADGE_SYNONYMS = {
    origin: ['origin', 'grass', 'plains'],
    rock: ['rock', 'basalt', 'ore'],
    stone: ['stone', 'bastion', 'fortress'],
    tar: ['tar', 'marsh', 'swamp'],
    marble: ['marble', 'temple', 'atrium'],
    netherite: ['nether', 'netherite', 'inferno'],
  };
  const DEFAULT_DIMENSION_BADGE_SYMBOL = '🌀';

  const DIMENSION_THEME = [
    {
      id: 'origin',
      name: 'Origin Grassland',
      palette: {
        grass: '#69c368',
        dirt: '#b07a42',
        stone: '#9d9d9d',
        rails: '#c9a14d',
      },
      fog: '#87ceeb',
      sky: '#87ceeb',
      sun: '#ffffff',
      hemi: '#bddcff',
      gravity: 1,
      speedMultiplier: 1,
      description:
        'Gentle plains with forgiving gravity. Harvest and craft to stabilise the portal frame.',
    },
    {
      id: 'rock',
      name: 'Rock Frontier',
      palette: {
        grass: '#7b858a',
        dirt: '#5d6468',
        stone: '#3b4248',
        rails: '#e0b072',
      },
      fog: '#65727c',
      sky: '#4d565f',
      sun: '#f6f1d9',
      hemi: '#5b748a',
      gravity: 1.35,
      speedMultiplier: 0.92,
      description:
        'Heavier steps and denser air. Keep momentum up and beware of zombies charging along the rails.',
    },
    {
      id: 'stone',
      name: 'Stone Bastion',
      palette: {
        grass: '#a0a8ad',
        dirt: '#6c7479',
        stone: '#525a60',
        rails: '#d7b16f',
      },
      fog: '#6f7b84',
      sky: '#5d6870',
      sun: '#f0e8d2',
      hemi: '#70808a',
      gravity: 1.18,
      speedMultiplier: 0.9,
      description:
        'Fortified cliffs that demand precise jumps. Blocks are dense but reward extra portal charge fragments.',
    },
    {
      id: 'tar',
      name: 'Tar Marsh',
      palette: {
        grass: '#3c3a45',
        dirt: '#2d2b33',
        stone: '#1f1e25',
        rails: '#ffb347',
      },
      fog: '#1f1a21',
      sky: '#261c2f',
      sun: '#ffb347',
      hemi: '#45364d',
      gravity: 0.85,
      speedMultiplier: 1.1,
      description:
        'Low gravity swamp. Use the extra lift to hop across gaps while night creatures emerge from the mist.',
    },
    {
      id: 'marble',
      name: 'Marble Heights',
      palette: {
        grass: '#f3f6fb',
        dirt: '#d7dce5',
        stone: '#c0c7d4',
        rails: '#ffd27f',
      },
      fog: '#cfd7e4',
      sky: '#e3e8f4',
      sun: '#ffffff',
      hemi: '#d5deef',
      gravity: 0.95,
      speedMultiplier: 1.18,
      description:
        'Floating terraces of marble that accelerate explorers. Keep your footing while rails twist in the breeze.',
    },
    {
      id: 'netherite',
      name: 'Netherite Terminus',
      palette: {
        grass: '#4c1f24',
        dirt: '#321016',
        stone: '#14070a',
        rails: '#ff7043',
      },
      fog: '#160607',
      sky: '#1a0304',
      sun: '#ff7043',
      hemi: '#471414',
      gravity: 1.15,
      speedMultiplier: 1,
      description:
        'Final gauntlet of collapsing rails. Activate the portal swiftly to claim the Eternal Ingot.',
    },
  ].map((theme) => {
    const manifest = DIMENSION_ASSET_MANIFEST[theme.id] || null;
    if (!manifest) {
      return theme;
    }
    return { ...theme, assetManifest: manifest };
  });

  function pseudoRandom(x, z) {
    const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function getItemDefinition(id) {
    if (!id) {
      return { label: 'Empty', icon: '·', placeable: false };
    }
    return (
      ITEM_DEFINITIONS[id] || {
        label: id,
        icon: '⬜',
        placeable: false,
        description: '',
      }
    );
  }

  function formatInventoryLabel(item, quantity) {
    const def = getItemDefinition(item);
    const count = Number.isFinite(quantity) ? quantity : 0;
    return `${def.icon} ${def.label}${count > 1 ? ` ×${count}` : ''}`;
  }

  function createHeartMarkup(health) {
    const fullHearts = Math.floor(health / 2);
    const halfHeart = health % 2;
    const pieces = [];
    for (let i = 0; i < 5; i += 1) {
      const index = i * 2;
      let glyph = '♡';
      if (index + 1 <= fullHearts) {
        glyph = '❤';
      } else if (index < fullHearts + halfHeart) {
        glyph = '❥';
      }
      const span = `<span class="heart-icon" aria-hidden="true">${glyph}</span>`;
      pieces.push(span);
    }
    return `<span class="hud-hearts" role="img" aria-label="${health / 2} hearts remaining">${pieces.join('')}</span>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  class SimpleExperience {
    constructor(options) {
      if (!options || !options.canvas) {
        throw new Error('SimpleExperience requires a target canvas element.');
      }
      const THREE = window.THREE_GLOBAL || window.THREE;
      if (!THREE) {
        throw new Error('Three.js is required for the simplified experience.');
      }
      this.THREE = THREE;
      if (THREE?.Cache && THREE.Cache.enabled !== true) {
        THREE.Cache.enabled = true;
        THREE.Cache.autoClear = false;
      }
      this.canvas = options.canvas;
      this.ui = options.ui || {};
      this.victoryBannerEl = this.ui.victoryBanner || null;
      this.victoryCelebrationEl = this.ui.victoryCelebration || null;
      this.victoryConfettiEl = this.ui.victoryConfetti || null;
      this.victoryFireworksEl = this.ui.victoryFireworks || null;
      this.victoryMessageEl = this.ui.victoryMessageEl || null;
      this.victoryStatsEl = this.ui.victoryStatsEl || null;
      this.victoryShareButton = this.ui.victoryShareButton || null;
      this.victoryCloseButton = this.ui.victoryCloseButton || null;
      this.victoryShareStatusEl = this.ui.victoryShareStatusEl || null;
      this.apiBaseUrl = normaliseApiBaseUrl(options.apiBaseUrl || null);
      this.playerDisplayName = (options.playerName || '').trim() || 'Explorer';
      this.defaultPlayerName = this.playerDisplayName;
      this.playerGoogleId = null;
      this.playerEmail = null;
      this.playerAvatarUrl = null;
      this.playerLocation = null;
      this.playerLocationLabel = 'Location hidden';
      this.identityStorageKey = options.identityStorageKey || IDENTITY_STORAGE_KEY;
      this.identityHydrating = false;
      this.locationRequestCooldownSeconds = Math.max(
        15,
        Number.isFinite(options.locationRequestCooldownSeconds)
          ? Number(options.locationRequestCooldownSeconds)
          : 45,
      );
      this.lastLocationRequestAt = 0;
      this.pendingLocationRequest = null;
      this.deviceLabel = this.describeDevice();
      this.scene = null;
      this.camera = null;
      this.cameraFrustumHeight = 6;
      this.cameraFieldOfView = 60;
      this.renderer = null;
      this.sunLight = null;
      this.hemiLight = null;
      this.moonLight = null;
      this.ambientLight = null;
      this.daySkyColor = new THREE.Color('#87ceeb');
      this.nightSkyColor = new THREE.Color('#0b1738');
      this.duskSkyColor = new THREE.Color('#ff9a64');
      this.dayFogColor = new THREE.Color('#87ceeb');
      this.nightFogColor = new THREE.Color('#0f182f');
      this.daySunColor = new THREE.Color('#fff4cc');
      this.nightMoonColor = new THREE.Color('#8ea2ff');
      this.dayGroundColor = new THREE.Color('#3e4e2a');
      this.nightGroundColor = new THREE.Color('#101522');
      this.tmpColorA = new THREE.Color();
      this.tmpColorB = new THREE.Color();
      this.terrainGroup = null;
      this.railsGroup = null;
      this.portalGroup = null;
      this.zombieGroup = null;
      this.portalMechanics = PORTAL_MECHANICS;
      this.playerRig = null;
      this.cameraBoom = null;
      this.handGroup = null;
      this.handMaterials = [];
      this.handMaterialsDynamic = true;
      this.handModelLoaded = false;
      this.playerAvatar = null;
      this.playerMixer = null;
      this.playerIdleAction = null;
      this.handSwingStrength = 0;
      this.handSwingTimer = 0;
      this.modelPromises = new Map();
      this.loadedModels = new Map();
      this.dimensionBadgeSymbols = DIMENSION_BADGE_SYMBOLS;
      this.scoreboardListEl = this.ui.scoreboardListEl || null;
      this.scoreboardStatusEl = this.ui.scoreboardStatusEl || null;
      this.refreshScoresButton = this.ui.refreshScoresButton || null;
      this.scoreboardContainer = this.scoreboardListEl?.closest('#leaderboardTable') || null;
      this.scoreboardEmptyEl =
        (typeof document !== 'undefined' && document.getElementById('leaderboardEmptyMessage')) || null;
      this.scoreboardPollIntervalSeconds = 45;
      this.scoreboardPollTimer = 0;
      this.scoreboardStorageKey = options.scoreboardStorageKey || SCOREBOARD_STORAGE_KEY;
      this.lastScoreboardFetch = 0;
      this.offlineSyncActive = false;
      this.lastOfflineSyncHintAt = 0;
      this.offlineSyncHintCooldownMs = 16000;
      this.hotbarEl = this.ui.hotbarEl || null;
      this.playerHintEl = this.ui.playerHintEl || null;
      this.pointerHintEl = this.ui.pointerHintEl || null;
      this.footerEl = this.ui.footerEl || null;
      this.footerScoreEl = this.ui.footerScoreEl || null;
      this.footerDimensionEl = this.ui.footerDimensionEl || null;
      this.footerStatusEl = this.ui.footerStatusEl || null;
      this.assetRecoveryOverlayEl = this.ui.assetRecoveryOverlay || null;
      this.assetRecoveryDialogEl = this.ui.assetRecoveryDialogEl || null;
      this.assetRecoveryTitleEl = this.ui.assetRecoveryTitleEl || null;
      this.assetRecoveryMessageEl = this.ui.assetRecoveryMessageEl || null;
      this.assetRecoveryActionsEl = this.ui.assetRecoveryActionsEl || null;
      this.assetRecoveryRetryButton = this.ui.assetRecoveryRetryButton || null;
      this.assetRecoveryReloadButton = this.ui.assetRecoveryReloadButton || null;
      this.startButtonEl = this.ui.startButton || null;
      this.introModalEl = this.ui.introModal || null;
      this.hudRootEl = this.ui.hudRootEl || null;
      this.pointerHintActive = false;
      this.pointerHintHideTimer = null;
      this.pointerHintAutoDismissTimer = null;
      this.pointerHintLastMessage = '';
      this.pointerLockFallbackActive = false;
      this.pointerLockWarningShown = false;
      this.pointerLockFallbackNoticeShown = false;
      this.pointerLockFallbackMessageActive = false;
      this.pointerLockRetryTimer = null;
      this.pointerLockRetryAttempts = 0;
      this.pointerLockBlockWarningIssued = false;
      this.pointerFallbackDragging = false;
      this.pointerFallbackLast = null;
      this.pointerFallbackButton = null;
      this.firstRunTutorialEl = this.ui?.firstRunTutorial || null;
      this.firstRunTutorialBackdrop = this.ui?.firstRunTutorialBackdrop || null;
      this.firstRunTutorialCloseButton = this.ui?.firstRunTutorialCloseButton || null;
      this.firstRunTutorialPrimaryButton = this.ui?.firstRunTutorialPrimaryButton || null;
      this.firstRunTutorialControlsBound = false;
      this.firstRunTutorialHideTimer = null;
      this.firstRunTutorialMarkOnDismiss = false;
      this.firstRunTutorialShowBriefingOnDismiss = false;
      this.firstRunTutorialSeenCache = null;
      this.onFirstRunTutorialClose = this.handleFirstRunTutorialClose.bind(this);
      this.assetFailureNotices = new Set();
      this.eventFailureNotices = new Set();
      this.boundEventDisposers = [];
      this.boundEventRecords = [];
      this.bindAssetRecoveryControls();
      this.onOpenCraftingSearchClick = () => this.toggleCraftingSearch(true);
      this.onCloseCraftingSearchClick = () => this.toggleCraftingSearch(false);
      this.lastHintMessage = '';
      this.craftingModal = this.ui.craftingModal || null;
      this.craftSequenceEl = this.ui.craftSequenceEl || null;
      this.craftingInventoryEl = this.ui.craftingInventoryEl || null;
      this.craftSuggestionsEl = this.ui.craftSuggestionsEl || null;
      this.craftButton = this.ui.craftButton || null;
      this.clearCraftButton = this.ui.clearCraftButton || null;
      this.craftLauncherButton = this.ui.craftLauncherButton || null;
      this.closeCraftingButton = this.ui.closeCraftingButton || null;
      this.craftingSearchPanel = this.ui.craftingSearchPanel || null;
      this.craftingSearchInput = this.ui.craftingSearchInput || null;
      this.craftingSearchResultsEl = this.ui.craftingSearchResultsEl || null;
      this.craftingHelperEl = this.ui.craftingHelperEl || null;
      this.craftingHelperTitleEl = this.ui.craftingHelperTitleEl || null;
      this.craftingHelperDescriptionEl = this.ui.craftingHelperDescriptionEl || null;
      this.craftingHelperMatchesEl = this.ui.craftingHelperMatchesEl || null;
      this.craftingHelperOverride = null;
      this.openCraftingSearchButton = this.ui.openCraftingSearchButton || null;
      this.closeCraftingSearchButton = this.ui.closeCraftingSearchButton || null;
      this.inventoryModal = this.ui.inventoryModal || null;
      this.inventoryGridEl = this.ui.inventoryGridEl || null;
      this.inventorySortButton = this.ui.inventorySortButton || null;
      this.inventoryOverflowEl = this.ui.inventoryOverflowEl || null;
      this.closeInventoryButton = this.ui.closeInventoryButton || null;
      const openInventorySource = this.ui.openInventoryButtons || [];
      this.openInventoryButtons = Array.isArray(openInventorySource)
        ? openInventorySource
        : Array.from(openInventorySource);
      this.hotbarExpandButton = this.ui.hotbarExpandButton || null;
      this.extendedInventoryEl = this.ui.extendedInventoryEl || null;
      this.hotbarExpanded = false;
      this.activeHotbarDrag = null;
      this.columns = new Map();
      this.heightMap = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
      this.blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
      this.railGeometry = new THREE.BoxGeometry(BLOCK_SIZE * 0.9, BLOCK_SIZE * 0.15, BLOCK_SIZE * 1.2);
      this.textureCache = new Map();
      this.defaultVoxelTexturePalettes = new Map();
      this.textureLoader = null;
      this.pendingTextureLoads = new Map();
      this.minColumnHeight = MIN_COLUMN_HEIGHT;
      const requestedMaxColumnHeight = Number.isFinite(options.maxColumnHeight)
        ? Math.floor(options.maxColumnHeight)
        : MAX_COLUMN_HEIGHT;
      this.maxColumnHeight = Math.max(this.minColumnHeight, requestedMaxColumnHeight);
      const minVoxelBudget = WORLD_SIZE * WORLD_SIZE * this.minColumnHeight;
      const requestedVoxelBudget = Number.isFinite(options.maxTerrainVoxels)
        ? Math.max(0, Math.floor(options.maxTerrainVoxels))
        : DEFAULT_TERRAIN_VOXEL_CAP;
      const maxTerrainCap = Math.min(MAX_TERRAIN_VOXELS, DEFAULT_TERRAIN_VOXEL_CAP);
      this.maxTerrainVoxels = Math.max(
        minVoxelBudget,
        Math.min(requestedVoxelBudget, maxTerrainCap),
      );
      this.renderAccumulator = 0;
      this.renderActiveInterval = 1 / 60;
      this.renderIdleInterval = 1 / 30;
      this.renderIdleThresholdSeconds = 2.5;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.lastInteractionTimeMs = now;
      this.lazyAssetLoading = options.lazyAssetLoading !== false;
      this.lazyModelWarmupQueue = [];
      this.lazyModelWarmupHandle = null;
      this.assetLoadBudgetMs = Number.isFinite(options.assetLoadBudgetMs)
        ? Math.max(500, options.assetLoadBudgetMs)
        : 3000;
      this.assetLoadTimers = {
        textures: new Map(),
        models: new Map(),
      };
      this.assetDelayHandles = {
        textures: new Map(),
        models: new Map(),
      };
      this.assetLoadLog = [];
      this.assetFailureCounts = new Map();
      this.assetRetryState = new Map();
      this.assetRecoveryPendingKeys = new Set();
      this.assetRecoveryPromptActive = false;
      this.assetRecoveryControlsBound = false;
      this.assetDelayNotices = new Set();
      this.assetRetryLimit = Number.isFinite(options.assetRetryLimit)
        ? Math.max(1, Math.floor(options.assetRetryLimit))
        : 3;
      this.assetRetryBackoffMs = Number.isFinite(options.assetRetryBackoffMs)
        ? Math.max(100, Math.floor(options.assetRetryBackoffMs))
        : 700;
      this.assetRetryBackoffMaxMs = Number.isFinite(options.assetRetryBackoffMaxMs)
        ? Math.max(this.assetRetryBackoffMs, Math.floor(options.assetRetryBackoffMaxMs))
        : 4000;
      this.assetRecoveryPromptThreshold = Math.max(
        2,
        Number.isFinite(options.assetRecoveryPromptThreshold)
          ? Math.floor(options.assetRecoveryPromptThreshold)
          : 2,
      );
      this.onAssetRecoveryRetryClick = (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        this.handleAssetRecoveryRetry();
      };
      this.onAssetRecoveryReloadClick = (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        this.handleAssetRecoveryReload();
      };
      this.materials = this.createMaterials();
      this.defaultKeyBindings = cloneKeyBindingMap(DEFAULT_KEY_BINDINGS);
      this.configKeyBindingOverrides = normaliseKeyBindingMap(window.APP_CONFIG?.keyBindings) || null;
      this.optionKeyBindingOverrides = normaliseKeyBindingMap(options.keyBindings) || null;
      this.baseKeyBindings = mergeKeyBindingMaps(
        this.defaultKeyBindings,
        this.configKeyBindingOverrides,
        this.optionKeyBindingOverrides,
      );
      this.keyBindings = this.buildKeyBindings({ includeStored: true });
      this.keys = new Set();
      this.velocity = new THREE.Vector3();
      this.tmpForward = new THREE.Vector3();
      this.tmpRight = new THREE.Vector3();
      this.tmpVector = new THREE.Vector3();
      this.tmpVector2 = new THREE.Vector3();
      this.tmpVector3 = new THREE.Vector3();
      this.tmpQuaternion = new THREE.Quaternion();
      this.movementBindingDiagnostics = {
        pending: false,
        triggeredAt: 0,
        timeoutMs: 650,
        initialPosition: new THREE.Vector3(),
        key: null,
      };
      this.cameraBaseOffset = new THREE.Vector3();
      this.cameraShakeOffset = new THREE.Vector3();
      this.cameraShakeRotation = new THREE.Euler();
      this.cameraShakeNoise = new THREE.Vector3();
      this.cameraShakeDuration = 0;
      this.cameraShakeTime = 0;
      this.cameraShakeIntensity = 0;
      this.cameraPerspective = 'first';
      this.firstPersonCameraOffset = new THREE.Vector3(0, 0.08, 0.04);
      this.thirdPersonCameraOffset = new THREE.Vector3(0, 0.8, 3.4);
      this.sessionToken = 0;
      this.activeSessionId = 0;
      this.playerHeadAttachment = null;
      this.unloadBeaconSent = false;
      this.pointerLocked = false;
      this.yaw = Math.PI;
      this.pitch = 0;
      // Begin the day/night cycle at mid-day so the HUD daylight bar starts at 50%.
      this.elapsed = DAY_LENGTH_SECONDS * 0.5;
      this.health = FALLBACK_HEALTH;
      this.score = 0;
      this.scoreBreakdown = {
        recipes: 0,
        dimensions: 0,
        loot: 0,
        exploration: 0,
        combat: 0,
        misc: 0,
        penalties: 0,
      };
      this.blocksMined = 0;
      this.blocksPlaced = 0;
      this.portalBlocksPlaced = 0;
      this.portalActivated = false;
      this.portalReady = false;
      this.portalMesh = null;
      this.portalActivations = 0;
      this.portalHintShown = false;
      this.portalState = null;
      this.portalIgnitionLog = [];
      this.portalStatusState = 'inactive';
      this.portalStatusMessage = '';
      this.portalStatusLabel = '';
      this.portalStatusFlashTimer = null;
      this.dimensionIntroAutoHideTimer = null;
      this.dimensionIntroFadeTimer = null;
      this.victoryAchieved = false;
      this.currentDimensionIndex = 0;
      this.dimensionSettings = DIMENSION_THEME[0];
      this.chestGroup = null;
      this.chests = [];
      this.activeChestId = null;
      this.chestPulseTime = 0;
      this.lastChestHintAt = 0;
      this.currentSpeed = PLAYER_BASE_SPEED;
      this.gravityScale = this.dimensionSettings.gravity;
      this.verticalVelocity = 0;
      this.isGrounded = false;
      this.portalAnchor = new THREE.Vector3(0, 0, -WORLD_SIZE * 0.45);
      this.initialHeightMap = [];
      this.portalAnchorGrid = this.computePortalAnchorGrid();
      this.portalFrameLayout = this.createPortalFrameLayout();
      this.portalFrameSlots = new Map();
      this.portalFrameRequiredCount = PORTAL_BLOCK_REQUIREMENT;
      this.portalFrameInteriorValid = false;
      this.portalHiddenInterior = [];
      this.portalFootprintObstructed = false;
      this.portalFootprintObstructionSummary = '';
      this.challengeGroup = null;
      this.railSegments = [];
      this.crumblingRails = [];
      this.netheriteChallengePlanned = false;
      this.netheriteChallengeActive = false;
      this.netheriteChallengeTimer = 0;
      this.netheriteCollapseInterval = 3.5;
      this.netheriteNextCollapse = 0;
      this.netheriteCollapseIndex = 0;
      this.netheriteCountdownSeconds = 45;
      this.netheriteCountdownDisplay = Infinity;
      this.netheriteFailureAnnounced = false;
      this.eternalIngot = null;
      this.eternalIngotCollected = false;
      this.eternalIngotSpin = 0;
      this.eternalIngotBaseY = 0;
      this.terrainChunkSize = 8;
      this.terrainChunkGroups = [];
      this.terrainChunkMap = new Map();
      this.dirtyTerrainChunks = new Set();
      this.chunkFrustum = new THREE.Frustum();
      this.chunkFrustumMatrix = new THREE.Matrix4();
      this.terrainCullingAccumulator = 0;
      this.terrainCullingInterval = 0.08;
      this.lastCullingCameraPosition = new THREE.Vector3();
      this.lastCullingCameraQuaternion = new THREE.Quaternion();
      this.lastCullingCameraValid = false;
      this.debugChunkCulling = this.detectChunkDebugFlag();
      this.lastCullingDebugLog = 0;
      this.zombies = [];
      this.lastZombieSpawn = 0;
      this.zombieIdCounter = 0;
      this.zombieGeometry = null;
      this.golems = [];
      this.golemGroup = null;
      this.lastGolemSpawn = 0;
      this.scoreboardUtils = window.ScoreboardUtils || null;
      this.scoreEntries = [];
      this.restoreScoreboardEntries();
      this.sessionId =
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
      this.scoreSyncInFlight = false;
      this.pendingScoreSyncReason = null;
      this.lastScoreSyncAt = 0;
      this.scoreSyncCooldownSeconds = 6;
      this.scoreboardHydrated = false;
      this.scoreSyncHeartbeat = 0;
      this.portalFrameGeometryVertical = null;
      this.portalFrameGeometryHorizontal = null;
      this.portalPlaneGeometry = null;
      this.daylightIntensity = 1;
      this.raycaster = new THREE.Raycaster();
      this.hotbar = Array.from({ length: HOTBAR_SLOTS }, () => ({ item: null, quantity: 0 }));
      this.selectedHotbarIndex = 0;
      this.satchel = new Map();
      this.craftingState = {
        sequence: [],
        unlocked: new Map(),
        searchTerm: '',
      };
      this.craftingRecipes = this.createCraftingRecipes();
      this.craftedRecipes = new Set();
      this.restorePersistentUnlocks();
      this.restoreIdentitySnapshot();
      this.animationFrame = null;
      this.modelPreloadHandle = null;
      this.modelPreloadUsingIdle = false;
      this.briefingAutoHideTimer = null;
      this.briefingFadeTimer = null;
      this.victoryHideTimer = null;
      this.victoryCelebrationActive = false;
      this.victorySummary = null;
      this.victoryShareBusy = false;
      this.victoryEffectTimers = [];
      this.started = false;
      this.lastStatePublish = 0;
      this.prevTime = null;
      this.mobileControlsRoot = this.ui.mobileControls || null;
      this.virtualJoystickEl = this.ui.virtualJoystick || null;
      this.virtualJoystickThumb = this.ui.virtualJoystickThumb || null;
      this.mobileControlsActive = false;
      this.touchButtonStates = { up: false, down: false, left: false, right: false };
      this.joystickVector = new THREE.Vector2();
      this.joystickPointerId = null;
      this.touchLookPointerId = null;
      this.touchLookLast = null;
      this.touchActionStart = 0;
      this.touchActionPending = false;
      this.touchJumpRequested = false;
      this.mobileControlDisposers = [];
      this.isTouchPreferred = this.detectTouchPreferred();
      this.pointerPreferenceObserver = null;
      this.detachPointerPreferenceObserver = null;
      this.prefersReducedMotion = this.detectReducedMotion();
      this.audio = this.createAudioController();
      this.onPointerLockChange = this.handlePointerLockChange.bind(this);
      this.onPointerLockError = this.handlePointerLockError.bind(this);
      this.onMouseUp = this.handleMouseUp.bind(this);
      this.onMouseMove = this.handleMouseMove.bind(this);
      this.onKeyDown = this.handleKeyDown.bind(this);
      this.onKeyUp = this.handleKeyUp.bind(this);
      this.onResize = this.handleResize.bind(this);
      this.onMouseDown = this.handleMouseDown.bind(this);
      this.preventContextMenu = (event) => event.preventDefault();
      this.onDismissBriefing = this.handleBriefingDismiss.bind(this);
      this.onJoystickPointerDown = this.handleJoystickPointerDown.bind(this);
      this.onJoystickPointerMove = this.handleJoystickPointerMove.bind(this);
      this.onJoystickPointerUp = this.handleJoystickPointerUp.bind(this);
      this.onTouchButtonPress = this.handleTouchButtonPress.bind(this);
      this.onTouchButtonRelease = this.handleTouchButtonRelease.bind(this);
      this.onPortalButton = this.handlePortalButton.bind(this);
      this.onTouchLookPointerDown = this.handleTouchLookPointerDown.bind(this);
      this.onTouchLookPointerMove = this.handleTouchLookPointerMove.bind(this);
      this.onTouchLookPointerUp = this.handleTouchLookPointerUp.bind(this);
      this.onHotbarClick = this.handleHotbarClick.bind(this);
      this.onExtendedInventoryClick = this.handleExtendedInventoryClick.bind(this);
      this.onHotbarDragStart = this.handleHotbarDragStart.bind(this);
      this.onHotbarDragEnter = this.handleHotbarDragEnter.bind(this);
      this.onHotbarDragOver = this.handleHotbarDragOver.bind(this);
      this.onHotbarDragLeave = this.handleHotbarDragLeave.bind(this);
      this.onHotbarDrop = this.handleHotbarDrop.bind(this);
      this.onHotbarDragEnd = this.handleHotbarDragEnd.bind(this);
      this.onCanvasWheel = this.handleCanvasWheel.bind(this);
      this.onCraftButton = this.handleCraftButton.bind(this);
      this.onClearCraft = this.handleClearCraft.bind(this);
      this.onOpenCrafting = this.handleOpenCrafting.bind(this);
      this.onCloseCrafting = this.handleCloseCrafting.bind(this);
      this.onCraftSequenceClick = this.handleCraftSequenceClick.bind(this);
      this.onCraftSuggestionClick = this.handleCraftSuggestionClick.bind(this);
      this.onCraftSearchInput = this.handleCraftSearchInput.bind(this);
      this.onInventorySort = this.handleInventorySort.bind(this);
      this.onInventoryToggle = this.handleInventoryToggle.bind(this);
      this.onCraftingInventoryClick = this.handleCraftingInventoryClick.bind(this);
      this.onCraftingInventoryFocus = this.handleCraftingInventoryFocus.bind(this);
      this.onCraftingInventoryBlur = this.handleCraftingInventoryBlur.bind(this);
      this.onCraftSuggestionFocus = this.handleCraftSuggestionFocus.bind(this);
      this.onCraftSuggestionBlur = this.handleCraftSuggestionBlur.bind(this);
      this.onCraftSequenceFocus = this.handleCraftSequenceFocus.bind(this);
      this.onCraftSequenceBlur = this.handleCraftSequenceBlur.bind(this);
      this.onVictoryReplay = this.handleVictoryReplay.bind(this);
      this.onVictoryClose = this.handleVictoryClose.bind(this);
      this.onVictoryShare = this.handleVictoryShare.bind(this);
      this.onBeforeUnload = this.handleBeforeUnload.bind(this);
      this.onPointerPreferenceChange = this.handlePointerPreferenceChange.bind(this);
      this.onGlobalPointerDown = this.handleGlobalPointerDown.bind(this);
      this.onGlobalTouchStart = this.handleGlobalTouchStart.bind(this);
      this.onCraftingModalBackdrop = (event) => {
        if (event?.target === this.craftingModal) {
          this.handleCloseCrafting(event);
        }
      };
      this.rendererUnavailable = false;
      this.contextLost = false;
      this.webglEventsBound = false;
      this.rendererFailureMessage = '';
      this.onWebglContextLost = this.handleWebglContextLost.bind(this);
      this.onWebglContextRestored = this.handleWebglContextRestored.bind(this);
      this.isTabVisible =
        typeof document === 'undefined' ||
        document.visibilityState === 'visible' ||
        document.visibilityState === 'prerender';
      this.onVisibilityChange = this.handleVisibilityChange.bind(this);
      this.eventsBound = false;
      this.onCanvasPointerLock = this.handleCanvasPointerLockRequest.bind(this);
    }

    emitGameEvent(type, detail = {}) {
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      if (!scope || typeof scope.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') {
        return;
      }
      try {
        scope.dispatchEvent(
          new CustomEvent(`infinite-rails:${type}`, {
            detail: {
              mode: 'simple',
              timestamp: Date.now(),
              ...detail,
            },
          }),
        );
      } catch (error) {
        if (typeof console !== 'undefined') {
          console.debug('Failed to dispatch simple experience event', type, error);
        }
      }
    }

    start() {
      if (this.started || this.rendererUnavailable) return;
      if (!this.verifyWebglSupport()) {
        return;
      }
      this.sessionToken += 1;
      this.activeSessionId = this.sessionToken;
      const sessionId = this.activeSessionId;
      this.cameraPerspective = 'first';
      this.resetPlayerCharacterState();
      this.started = true;
      this.unloadBeaconSent = false;
      this.rendererUnavailable = false;
      this.contextLost = false;
      this.clearVictoryEffectTimers();
      this.hideVictoryCelebration(true);
      this.hideVictoryBanner();
      this.victorySummary = null;
      this.victoryCelebrationActive = false;
      this.victoryShareBusy = false;
      try {
        this.setupScene();
        this.queueCharacterPreload();
        this.loadFirstPersonArms(sessionId);
        this.initializeScoreboardUi();
        this.applyDimensionSettings(this.currentDimensionIndex);
        this.buildTerrain();
        this.buildRails();
        this.spawnDimensionChests();
        this.refreshPortalState();
        this.attachPlayerToSimulation();
        this.evaluateBossChallenge();
        this.bindEvents();
        this.initializeMobileControls();
        this.updatePointerHintForInputMode();
        this.showDesktopPointerTutorialHint();
        this.updateHud();
        this.revealDimensionIntro(this.dimensionSettings, { duration: 6200, intent: 'arrival' });
        this.refreshCraftingUi();
        this.hideIntro();
        const tutorialShown = this.maybeShowFirstRunTutorial();
        if (!tutorialShown) {
          this.showBriefingOverlay();
        }
        this.autoCaptureLocation({ updateOnFailure: true }).catch((error) => {
          console.warn('Location capture failed', error);
        });
        this.updateLocalScoreEntry('start');
        this.loadScoreboard();
        this.exposeDebugInterface();
        this.renderFrame(performance.now());
        this.emitGameEvent('started', { summary: this.createRunSummary('start') });
        this.publishStateSnapshot('started');
        this.lastStatePublish = 0;
      } catch (error) {
        const failureMessage = 'Renderer initialisation failed. Check your browser console for details.';
        this.presentRendererFailure(failureMessage, {
          error,
        });
        this.started = false;
        const errorMessage =
          typeof error?.message === 'string' && error.message.trim().length
            ? error.message.trim()
            : failureMessage;
        this.emitGameEvent('start-error', {
          message: failureMessage,
          errorMessage,
          errorName: typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined,
          stack: typeof error?.stack === 'string' && error.stack.trim().length ? error.stack.trim() : undefined,
          stage: 'startup',
        });
        this.publishStateSnapshot('start-error');
      }
    }

    hideIntro() {
      const { introModal, startButton, hudRootEl } = this.ui;
      if (introModal) {
        introModal.hidden = true;
        introModal.style.display = 'none';
        introModal.setAttribute('aria-hidden', 'true');
      }
      if (startButton) {
        startButton.disabled = true;
        startButton.setAttribute('aria-hidden', 'true');
        startButton.setAttribute('tabindex', '-1');
        startButton.blur();
      }
      if (hudRootEl) {
        document.body.classList.add('game-active');
      }
      if (this.canvas && typeof this.canvas.focus === 'function') {
        try {
          this.canvas.focus({ preventScroll: true });
        } catch (error) {
          try {
            this.canvas.focus();
          } catch (nestedError) {
            console.debug('Canvas focus unavailable in this browser.', nestedError);
          }
        }
      }
    }

    bindFirstRunTutorialControls() {
      if (this.firstRunTutorialControlsBound) {
        return;
      }
      if (this.firstRunTutorialCloseButton) {
        this.firstRunTutorialCloseButton.addEventListener('click', this.onFirstRunTutorialClose);
      }
      if (this.firstRunTutorialPrimaryButton) {
        this.firstRunTutorialPrimaryButton.addEventListener('click', this.onFirstRunTutorialClose);
      }
      if (this.firstRunTutorialBackdrop) {
        this.firstRunTutorialBackdrop.addEventListener('click', this.onFirstRunTutorialClose);
      }
      this.firstRunTutorialControlsBound = true;
    }

    hasSeenFirstRunTutorial() {
      if (this.firstRunTutorialSeenCache === true) {
        return true;
      }
      if (this.firstRunTutorialSeenCache === false) {
        return false;
      }
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      if (!scope?.localStorage) {
        this.firstRunTutorialSeenCache = false;
        return false;
      }
      try {
        const stored = scope.localStorage.getItem(FIRST_RUN_TUTORIAL_STORAGE_KEY);
        const seen = stored === '1' || stored === 'true';
        this.firstRunTutorialSeenCache = seen;
        return seen;
      } catch (error) {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('Unable to read first run tutorial preference from storage.', error);
        }
        this.firstRunTutorialSeenCache = false;
        return false;
      }
    }

    markFirstRunTutorialSeen() {
      this.firstRunTutorialSeenCache = true;
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      if (!scope?.localStorage) {
        return;
      }
      try {
        scope.localStorage.setItem(FIRST_RUN_TUTORIAL_STORAGE_KEY, '1');
      } catch (error) {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('Unable to persist first run tutorial preference.', error);
        }
      }
    }

    maybeShowFirstRunTutorial() {
      if (!this.firstRunTutorialEl) {
        return false;
      }
      if (this.hasSeenFirstRunTutorial()) {
        return false;
      }
      this.showFirstRunTutorial({ markSeenOnDismiss: true, autoFocus: true, showBriefingAfter: true });
      return true;
    }

    showFirstRunTutorial({ markSeenOnDismiss = false, autoFocus = false, showBriefingAfter = false } = {}) {
      const overlay = this.firstRunTutorialEl;
      if (!overlay) {
        return false;
      }
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      if (scope && this.firstRunTutorialHideTimer) {
        scope.clearTimeout(this.firstRunTutorialHideTimer);
        this.firstRunTutorialHideTimer = null;
      }
      this.bindFirstRunTutorialControls();
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      overlay.setAttribute('data-visible', 'true');
      this.firstRunTutorialMarkOnDismiss = !!markSeenOnDismiss;
      this.firstRunTutorialShowBriefingOnDismiss = !!showBriefingAfter;
      const body = typeof document !== 'undefined' ? document.body : null;
      if (body?.classList) {
        body.classList.add('first-run-tutorial-active');
      }
      const raf =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : scope?.requestAnimationFrame ?? null;
      if (typeof raf === 'function') {
        raf(() => {
          overlay.classList.add('is-visible');
        });
      } else {
        overlay.classList.add('is-visible');
      }
      if (autoFocus && this.firstRunTutorialPrimaryButton) {
        const focusTarget = this.firstRunTutorialPrimaryButton;
        const timerHost = scope ?? (typeof globalThis !== 'undefined' ? globalThis : null);
        const focus = () => {
          try {
            focusTarget.focus({ preventScroll: true });
          } catch (error) {
            try {
              focusTarget.focus();
            } catch (nestedError) {
              if (typeof console !== 'undefined' && console.debug) {
                console.debug('Unable to focus tutorial primary action.', nestedError);
              }
            }
          }
        };
        if (timerHost?.setTimeout) {
          timerHost.setTimeout(focus, 80);
        } else {
          focus();
        }
      }
      return true;
    }

    hideFirstRunTutorial({ markSeen = false, showBriefingAfter = false } = {}) {
      const overlay = this.firstRunTutorialEl;
      if (!overlay) {
        if (markSeen) {
          this.markFirstRunTutorialSeen();
        }
        if (showBriefingAfter) {
          this.showBriefingOverlay();
        }
        return false;
      }
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      if (scope && this.firstRunTutorialHideTimer) {
        scope.clearTimeout(this.firstRunTutorialHideTimer);
        this.firstRunTutorialHideTimer = null;
      }
      overlay.classList.remove('is-visible');
      overlay.setAttribute('data-visible', 'false');
      const body = typeof document !== 'undefined' ? document.body : null;
      const finalise = () => {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        if (body?.classList) {
          body.classList.remove('first-run-tutorial-active');
        }
        if (showBriefingAfter) {
          this.showBriefingOverlay();
        }
        this.firstRunTutorialHideTimer = null;
      };
      if (scope?.setTimeout) {
        this.firstRunTutorialHideTimer = scope.setTimeout(finalise, 220);
      } else {
        finalise();
      }
      if (markSeen) {
        this.markFirstRunTutorialSeen();
      }
      this.firstRunTutorialMarkOnDismiss = false;
      this.firstRunTutorialShowBriefingOnDismiss = false;
      return true;
    }

    handleFirstRunTutorialClose(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      const markSeen = this.firstRunTutorialMarkOnDismiss;
      const showBriefingAfter = this.firstRunTutorialShowBriefingOnDismiss;
      this.hideFirstRunTutorial({ markSeen, showBriefingAfter });
    }

    showBriefingOverlay() {
      const briefing = this.ui?.gameBriefing;
      if (!briefing) return;
      const timerHost = typeof window !== 'undefined' ? window : globalThis;
      timerHost.clearTimeout(this.briefingAutoHideTimer);
      timerHost.clearTimeout(this.briefingFadeTimer);
      briefing.hidden = false;
      briefing.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        briefing.classList.add('is-visible');
      });
      const dismissButton = this.ui?.dismissBriefingButton;
      if (dismissButton) {
        dismissButton.disabled = false;
        dismissButton.addEventListener('click', this.onDismissBriefing, { once: true });
      }
      this.briefingAutoHideTimer = timerHost.setTimeout(() => {
        this.hideBriefingOverlay();
      }, 5000);
    }

    handleBriefingDismiss(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      this.hideBriefingOverlay(true);
    }

    hideBriefingOverlay(force = false) {
      const briefing = this.ui?.gameBriefing;
      if (!briefing) return;
      const timerHost = typeof window !== 'undefined' ? window : globalThis;
      timerHost.clearTimeout(this.briefingAutoHideTimer);
      if (!briefing.classList.contains('is-visible')) {
        briefing.hidden = true;
        briefing.setAttribute('aria-hidden', 'true');
        return;
      }
      briefing.classList.remove('is-visible');
      briefing.setAttribute('aria-hidden', 'true');
      const duration = force ? 120 : 280;
      this.briefingFadeTimer = timerHost.setTimeout(() => {
        briefing.hidden = true;
        this.canvas.focus({ preventScroll: true });
      }, duration);
    }

    showPointerHint(message) {
      if (!this.pointerHintEl) return;
      this.cancelPointerHintAutoHide();
      if (this.detectTouchPreferred()) {
        this.hidePointerHint(true);
        return;
      }
      const text =
        (typeof message === 'string' && message.trim()) || this.getPointerTutorialMessage();
      if (this.pointerHintEl.textContent !== text) {
        this.pointerHintEl.textContent = text;
      }
      this.pointerHintEl.hidden = false;
      this.pointerHintEl.setAttribute('aria-hidden', 'false');
      // Force a reflow so the transition triggers reliably when toggling classes quickly.
      void this.pointerHintEl.offsetWidth;
      this.pointerHintEl.classList.add('is-visible');
      this.pointerHintActive = true;
      this.pointerHintLastMessage = text;
      if (this.pointerHintHideTimer) {
        clearTimeout(this.pointerHintHideTimer);
        this.pointerHintHideTimer = null;
      }
    }

    hidePointerHint(immediate = false) {
      if (!this.pointerHintEl) return;
      this.cancelPointerHintAutoHide();
      if (!this.pointerHintActive && !immediate) {
        return;
      }
      const el = this.pointerHintEl;
      const finalize = () => {
        el.hidden = true;
        el.removeEventListener('transitionend', finalize);
        this.pointerHintLastMessage = '';
      };
      el.setAttribute('aria-hidden', 'true');
      el.classList.remove('is-visible');
      this.pointerHintActive = false;
      if (this.pointerHintHideTimer) {
        clearTimeout(this.pointerHintHideTimer);
        this.pointerHintHideTimer = null;
      }
      if (immediate) {
        el.hidden = true;
        this.pointerHintLastMessage = '';
        return;
      }
      el.addEventListener('transitionend', finalize, { once: true });
      this.pointerHintHideTimer = setTimeout(finalize, 340);
    }

    updatePointerHintForInputMode(message) {
      if (!this.pointerHintEl) return;
      if (this.detectTouchPreferred()) {
        this.hidePointerHint(true);
        return;
      }
      const override = typeof message === 'string' ? message : null;
      if (this.pointerLockFallbackActive) {
        const fallbackMessage = override || this.getPointerLockFallbackMessage();
        if (!this.pointerHintActive || this.pointerHintLastMessage !== fallbackMessage) {
          this.showPointerHint(fallbackMessage);
        }
        return;
      }
      if (this.getPointerLockElement() === this.canvas) {
        this.hidePointerHint();
        this.pointerHintLastMessage = '';
        return;
      }
      if (!override && this.pointerHintActive && this.pointerHintLastMessage) {
        // Avoid re-triggering the animation if the hint is already visible with the same text.
        return;
      }
      this.showPointerHint(override || this.pointerHintLastMessage || undefined);
    }

    cancelPointerHintAutoHide() {
      if (!this.pointerHintAutoDismissTimer) {
        return;
      }
      const scope = typeof window !== 'undefined' ? window : globalThis;
      scope.clearTimeout(this.pointerHintAutoDismissTimer);
      this.pointerHintAutoDismissTimer = null;
    }

    schedulePointerHintAutoHide(seconds = 5) {
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return;
      }
      const scope = typeof window !== 'undefined' ? window : globalThis;
      this.cancelPointerHintAutoHide();
      this.pointerHintAutoDismissTimer = scope.setTimeout(() => {
        this.pointerHintAutoDismissTimer = null;
        this.hidePointerHint();
      }, seconds * 1000);
    }

    showDesktopPointerTutorialHint() {
      if (this.detectTouchPreferred()) {
        return;
      }
      if (this.pointerLocked) {
        return;
      }
      this.updatePointerHintForInputMode(this.getPointerTutorialMessage());
      this.schedulePointerHintAutoHide(5);
    }

    enablePointerLockFallback(reason = 'unavailable', error = null, options = {}) {
      const reasonDetail = typeof reason === 'string' && reason ? ` (${reason})` : '';
      const fallbackMessage =
        typeof options?.message === 'string' && options.message.trim() ? options.message.trim() : null;
      this.cancelPointerLockRetry();
      this.pointerLockRetryAttempts = 0;
      this.pointerLockBlockWarningIssued = false;
      if (this.pointerLockFallbackActive) {
        if (!this.pointerLockWarningShown) {
          this.pointerLockWarningShown = true;
          if (typeof console !== 'undefined') {
            if (error) {
              console.warn(
                `Pointer lock unavailable${reasonDetail}; continuing with drag-to-look fallback.${
                  reason === 'error' || reason === 'request-rejected'
                    ? ' Browser privacy settings or extensions may be blocking mouse capture.'
                    : ''
                }`,
                error
              );
            } else {
              console.warn(
                `Pointer lock unavailable${reasonDetail}; continuing with drag-to-look fallback.${
                  reason === 'error' || reason === 'request-rejected'
                    ? ' Browser privacy settings or extensions may be blocking mouse capture.'
                    : ''
                }`
              );
            }
          }
        }
        if (fallbackMessage) {
          this.showPointerLockFallbackNotice(fallbackMessage);
        } else if (!this.pointerLockFallbackMessageActive) {
          this.showPointerLockFallbackNotice();
        } else {
          const message = fallbackMessage || this.getPointerLockFallbackMessage();
          this.updatePointerHintForInputMode(message);
          this.schedulePointerHintAutoHide(8);
        }
        return;
      }
      this.pointerLockFallbackActive = true;
      this.pointerLocked = false;
      this.endPointerFallbackDrag();
      if (!this.pointerLockWarningShown && typeof console !== 'undefined') {
        if (error) {
          console.warn(
            `Pointer lock unavailable${reasonDetail}; switching to drag-to-look fallback.${
              reason === 'error' || reason === 'request-rejected'
                ? ' Browser privacy settings or extensions may be blocking mouse capture.'
                : ''
            }`,
            error
          );
        } else {
          console.warn(
            `Pointer lock unavailable${reasonDetail}; switching to drag-to-look fallback.${
              reason === 'error' || reason === 'request-rejected'
                ? ' Browser privacy settings or extensions may be blocking mouse capture.'
                : ''
            }`
          );
        }
        this.pointerLockWarningShown = true;
      }
      this.emitGameEvent('pointer-lock-fallback', { reason });
      if (!this.pointerLockFallbackNoticeShown) {
        this.pointerLockFallbackNoticeShown = true;
        this.showPointerLockFallbackNotice(fallbackMessage || undefined);
      } else {
        const message = fallbackMessage || this.getPointerLockFallbackMessage();
        this.updatePointerHintForInputMode(message);
        this.schedulePointerHintAutoHide(8);
      }
    }

    beginPointerFallbackDrag(event) {
      if (!this.pointerLockFallbackActive) {
        return;
      }
      if (event?.button !== 0 && event?.button !== 2 && event?.button !== 1) {
        return;
      }
      this.pointerFallbackDragging = true;
      this.pointerFallbackButton = event?.button ?? 0;
      this.pointerFallbackLast = { x: event?.clientX ?? 0, y: event?.clientY ?? 0 };
    }

    endPointerFallbackDrag() {
      this.pointerFallbackDragging = false;
      this.pointerFallbackLast = null;
      this.pointerFallbackButton = null;
    }

    initializeScoreboardUi() {
      if (this.refreshScoresButton) {
        this.refreshScoresButton.addEventListener('click', () => {
          try {
            this.loadScoreboard({ force: true });
          } catch (error) {
            this.handleEventDispatchError('refreshing the leaderboard', error);
          }
        });
      }
      if (this.scoreboardStatusEl) {
        this.scoreboardStatusEl.textContent = 'Preparing leaderboard…';
      }
    }

    getNowTimestamp() {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
      return Date.now();
    }

    handleLeaderboardOffline(error, options = {}) {
      if (!this.apiBaseUrl) {
        return;
      }
      const { source = 'sync', reason = null } = options;
      const statusMessage =
        typeof options.message === 'string' && options.message.trim().length
          ? options.message.trim()
          : 'Leaderboard offline — progress saved locally.';
      const hintMessage =
        typeof options.hint === 'string' && options.hint.trim().length
          ? options.hint.trim()
          : 'Connection lost — progress saved locally.';
      this.persistScoreboardEntries();
      if (this.scoreboardStatusEl) {
        this.scoreboardStatusEl.textContent = statusMessage;
      }
      if (typeof this.showHint === 'function') {
        const now = this.getNowTimestamp();
        if (!this.offlineSyncActive || now - this.lastOfflineSyncHintAt >= this.offlineSyncHintCooldownMs) {
          this.showHint(hintMessage);
          this.lastOfflineSyncHintAt = now;
        }
      }
      this.offlineSyncActive = true;
      const detail = {
        source,
        reason: reason ?? null,
        message: statusMessage,
      };
      if (error) {
        detail.error = typeof error.message === 'string' ? error.message : String(error);
      }
      this.emitGameEvent('score-sync-offline', detail);
    }

    clearOfflineSyncNotice(source, options = {}) {
      if (!this.offlineSyncActive) {
        return;
      }
      this.offlineSyncActive = false;
      this.lastOfflineSyncHintAt = 0;
      const detail = { source };
      if (typeof options.message === 'string' && options.message.trim().length) {
        detail.message = options.message.trim();
      }
      this.emitGameEvent('score-sync-restored', detail);
    }

    async loadScoreboard({ force = false } = {}) {
      if (!this.apiBaseUrl) {
        this.scoreboardPollTimer = 0;
        if (force && this.scoreboardStatusEl) {
          this.scoreboardStatusEl.textContent = 'Offline mode: connect an API to sync runs.';
        }
        if (!force && this.scoreboardStatusEl) {
          this.scoreboardStatusEl.textContent =
            'Local leaderboard active — set APP_CONFIG.apiBaseUrl to publish runs.';
        }
        if (!this.scoreboardHydrated) {
          this.renderScoreboard();
          this.scoreboardHydrated = true;
        }
        return;
      }
      if (this.scoreSyncInFlight && !force) {
        return;
      }
      const baseUrl = this.apiBaseUrl.replace(/\/$/, '');
      const url = `${baseUrl}/scores`;
      this.lastScoreboardFetch = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (this.scoreboardStatusEl) {
        this.scoreboardStatusEl.textContent = 'Syncing leaderboard…';
      }
      if (this.refreshScoresButton) {
        this.refreshScoresButton.dataset.loading = 'true';
        this.refreshScoresButton.disabled = true;
        this.refreshScoresButton.setAttribute('aria-busy', 'true');
      }
      try {
        this.scoreSyncInFlight = true;
        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'omit',
        });
        if (!response.ok) {
          throw new Error(`Leaderboard request failed with ${response.status}`);
        }
        let payload = null;
        try {
          payload = await response.json();
        } catch (parseError) {
          payload = null;
        }
        const incoming = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];
        if (incoming.length) {
          this.mergeScoreEntries(incoming);
        } else {
          this.renderScoreboard();
        }
        let statusMessage;
        if (incoming.length) {
          statusMessage = 'Live multiverse rankings';
        } else {
          statusMessage = 'No public runs yet — forge the first legend!';
        }
        if (this.scoreboardStatusEl) {
          this.scoreboardStatusEl.textContent = statusMessage;
        }
        this.clearOfflineSyncNotice('load', { message: statusMessage });
        this.scoreboardHydrated = true;
        this.scoreboardPollTimer = 0;
      } catch (error) {
        console.warn('Failed to load scoreboard data', error);
        this.handleLeaderboardOffline(error, {
          source: 'load',
          message: 'Leaderboard offline — progress saved locally.',
          hint: 'Leaderboard offline — progress saved locally.',
        });
        if (!this.scoreboardHydrated) {
          this.renderScoreboard();
          this.scoreboardHydrated = true;
        }
      } finally {
        this.scoreSyncInFlight = false;
        if (this.refreshScoresButton) {
          this.refreshScoresButton.dataset.loading = 'false';
          this.refreshScoresButton.disabled = false;
          this.refreshScoresButton.setAttribute('aria-busy', 'false');
        }
        this.scoreboardPollTimer = 0;
      }
    }

    updateScoreboardPolling(delta) {
      if (!this.apiBaseUrl) {
        return;
      }
      if (!this.scoreboardHydrated || this.scoreSyncInFlight) {
        return;
      }
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      this.scoreboardPollTimer += delta;
      if (this.scoreboardPollTimer < this.scoreboardPollIntervalSeconds) {
        return;
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsedSinceFetch = this.lastScoreboardFetch ? (now - this.lastScoreboardFetch) / 1000 : Infinity;
      this.scoreboardPollTimer = 0;
      if (elapsedSinceFetch < this.scoreboardPollIntervalSeconds * 0.5) {
        return;
      }
      this.loadScoreboard();
    }

    getStoredScoreboardEntries() {
      if (typeof localStorage === 'undefined' || !this.scoreboardStorageKey) {
        return [];
      }
      try {
        const raw = localStorage.getItem(this.scoreboardStorageKey);
        if (!raw) {
          return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.warn('Unable to load cached scoreboard snapshot', error);
        return [];
      }
    }

    persistScoreboardEntries() {
      if (typeof localStorage === 'undefined' || !this.scoreboardStorageKey) {
        return;
      }
      try {
        if (!Array.isArray(this.scoreEntries) || this.scoreEntries.length === 0) {
          localStorage.removeItem(this.scoreboardStorageKey);
          return;
        }
        const snapshotLimit = 25;
        const entries = this.scoreEntries
          .slice(0, snapshotLimit)
          .map((entry) => {
            if (!entry || typeof entry !== 'object') {
              return null;
            }
            const copy = { ...entry };
            delete copy.rank;
            delete copy.highlight;
            delete copy.isPlayer;
            return copy;
          })
          .filter(Boolean);
        if (!entries.length) {
          localStorage.removeItem(this.scoreboardStorageKey);
          return;
        }
        localStorage.setItem(this.scoreboardStorageKey, JSON.stringify(entries));
      } catch (error) {
        console.warn('Unable to persist scoreboard snapshot', error);
      }
    }

    restoreScoreboardEntries() {
      const stored = this.getStoredScoreboardEntries();
      if (!stored.length) {
        return;
      }
      const utils = this.scoreboardUtils;
      const normalized = utils?.normalizeScoreEntries
        ? utils.normalizeScoreEntries(stored)
        : stored.slice();
      this.scoreEntries = normalized;
      this.renderScoreboard();
    }

    updateLocalScoreEntry(reason) {
      const entry = this.createRunSummary(reason);
      this.mergeScoreEntries([entry]);
      this.emitGameEvent('score-updated', { summary: entry });
      return entry;
    }

    createRunSummary(reason) {
      const entryId = this.playerGoogleId || this.sessionId;
      const locationLabel = this.playerLocationLabel || 'Location hidden';
      const locationPayload = this.playerLocation
        ? {
            latitude: this.playerLocation.latitude ?? null,
            longitude: this.playerLocation.longitude ?? null,
            accuracy: this.playerLocation.accuracy ?? null,
            label: this.playerLocation.label ?? locationLabel,
          }
        : null;
      const totalDimensions = DIMENSION_THEME.length;
      const unlockedCount = Math.max(1, this.currentDimensionIndex + 1);
      const safeCount = Math.min(unlockedCount, totalDimensions);
      const unlockedDimensions = DIMENSION_THEME.slice(0, safeCount).map((dimension) => {
        const name = typeof dimension?.name === 'string' ? dimension.name.trim() : '';
        if (name.length > 0) {
          return name;
        }
        const label = typeof dimension?.label === 'string' ? dimension.label.trim() : '';
        if (label.length > 0) {
          return label;
        }
        if (typeof dimension?.id === 'string' && dimension.id.trim().length > 0) {
          return dimension.id.trim();
        }
        return 'Unknown Dimension';
      });
      const activeDimensionLabel = (() => {
        const activeName = typeof this.dimensionSettings?.name === 'string' ? this.dimensionSettings.name.trim() : '';
        if (activeName.length > 0) {
          return activeName;
        }
        const activeLabel = typeof this.dimensionSettings?.label === 'string' ? this.dimensionSettings.label.trim() : '';
        if (activeLabel.length > 0) {
          return activeLabel;
        }
        const fallback = unlockedDimensions[unlockedDimensions.length - 1];
        if (typeof fallback === 'string' && fallback.trim().length > 0) {
          return fallback.trim();
        }
        const defaultName = typeof DIMENSION_THEME[0]?.name === 'string' ? DIMENSION_THEME[0].name.trim() : '';
        return defaultName || 'Unknown Dimension';
      })();
      const craftedRecipes = Array.from(this.craftedRecipes ?? []);
      const recipeCount = craftedRecipes.length;
      return {
        id: entryId,
        googleId: this.playerGoogleId ?? null,
        playerId: entryId,
        name: this.playerDisplayName,
        score: Math.round(this.score),
        dimensionCount: safeCount,
        dimensionTotal: totalDimensions,
        dimensionLabel: activeDimensionLabel,
        dimensions: unlockedDimensions,
        runTimeSeconds: Math.round(this.elapsed),
        inventoryCount: Math.max(0, this.getTotalInventoryCount()),
        location: locationPayload,
        locationLabel,
        device: this.deviceLabel,
        updatedAt: new Date().toISOString(),
        reason,
        eternalIngot: Boolean(this.eternalIngotCollected),
        recipeCount,
        recipes: craftedRecipes,
        recipePoints: Number(this.scoreBreakdown?.recipes ?? 0),
        dimensionPoints: Number(this.scoreBreakdown?.dimensions ?? 0),
        penalties: Number(this.scoreBreakdown?.penalties ?? 0),
        breakdown: this.getScoreBreakdownSnapshot(),
      };
    }

    mergeScoreEntries(entries) {
      const utils = this.scoreboardUtils;
      if (utils?.upsertScoreEntry && utils?.normalizeScoreEntries) {
        let next = this.scoreEntries.slice();
        for (const entry of entries) {
          next = utils.upsertScoreEntry(next, entry);
        }
        this.scoreEntries = utils.normalizeScoreEntries(next);
      } else {
        const combined = [...this.scoreEntries, ...entries];
        combined.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        this.scoreEntries = combined;
      }
      this.persistScoreboardEntries();
      this.renderScoreboard();
    }

    getScoreEntryIdentifier(entry) {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const candidate =
        entry.id ??
        entry.playerId ??
        entry.player_id ??
        entry.googleId ??
        entry.google_id ??
        entry.userId ??
        entry.user_id ??
        null;
      if (candidate === null || candidate === undefined) {
        return null;
      }
      const normalised = String(candidate).trim().toLowerCase();
      return normalised || null;
    }

    getPlayerScoreEntryIds() {
      const ids = [];
      const normalise = (value) => {
        if (value === null || value === undefined) {
          return null;
        }
        const normalised = String(value).trim().toLowerCase();
        return normalised || null;
      };
      const googleId = normalise(this.playerGoogleId);
      const sessionId = normalise(this.sessionId);
      if (googleId) ids.push(googleId);
      if (sessionId) ids.push(sessionId);
      return ids;
    }

    isPlayerScoreEntry(entry) {
      const ids = this.getPlayerScoreEntryIds();
      if (!ids.length) {
        return false;
      }
      const identifier = this.getScoreEntryIdentifier(entry);
      if (!identifier) {
        return false;
      }
      return ids.includes(identifier);
    }

    renderScoreboard() {
      if (!this.scoreboardListEl) return;
      const entries = this.scoreEntries.slice(0, 10);
      const utils = this.scoreboardUtils;
      const formatScore = utils?.formatScoreNumber
        ? utils.formatScoreNumber
        : (value) => Math.round(value ?? 0).toLocaleString();
      const formatRunTime = utils?.formatRunTime
        ? utils.formatRunTime
        : (seconds) => `${Math.round(seconds ?? 0)}s`;
      const formatLocation = utils?.formatLocationLabel
        ? (entry) => utils.formatLocationLabel(entry)
        : (entry) => entry.locationLabel || '—';
      if (!entries.length) {
        this.scoreboardListEl.innerHTML = `
          <tr>
            <td colspan="8" class="leaderboard-empty-row">No runs tracked yet — start exploring!</td>
          </tr>
        `;
        if (this.scoreboardContainer) {
          this.scoreboardContainer.dataset.empty = 'true';
        }
        if (this.scoreboardEmptyEl) {
          this.scoreboardEmptyEl.hidden = false;
        }
        return;
      }
      const rows = entries
        .map((entry, index) => {
          const rank = index + 1;
          const updated = entry.updatedAt
            ? new Date(entry.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—';
          let dimensionNames = Array.isArray(entry.dimensions)
            ? entry.dimensions.filter((name) => typeof name === 'string' && name.trim().length > 0)
            : [];
          if (!dimensionNames.length && Array.isArray(entry.dimensionNames)) {
            dimensionNames = entry.dimensionNames.filter(
              (name) => typeof name === 'string' && name.trim().length > 0,
            );
          }
          if (!dimensionNames.length && Array.isArray(entry.dimensionLabels)) {
            dimensionNames = entry.dimensionLabels.filter(
              (name) => typeof name === 'string' && name.trim().length > 0,
            );
          }
          if (
            !dimensionNames.length &&
            typeof entry.dimensionLabel === 'string' &&
            entry.dimensionLabel.trim().length > 0
          ) {
            dimensionNames = [entry.dimensionLabel.trim()];
          }
          const dimensionNameSet = new Set();
          const normalizedDimensionNames = [];
          dimensionNames.forEach((label) => {
            const trimmed = label.trim();
            if (!trimmed || dimensionNameSet.has(trimmed.toLowerCase())) {
              return;
            }
            dimensionNameSet.add(trimmed.toLowerCase());
            normalizedDimensionNames.push(trimmed);
          });
          dimensionNames = normalizedDimensionNames;
          const dimensionTotal = Number.isFinite(entry.dimensionTotal)
            ? Math.max(1, Math.floor(entry.dimensionTotal))
            : DIMENSION_THEME.length;
          const completedDimensions = Number.isFinite(entry.dimensionCount)
            ? Math.max(1, Math.floor(entry.dimensionCount))
            : Math.max(1, dimensionNames.length || 1);
          const boundedCompleted = Math.min(completedDimensions, dimensionTotal);
          const badges = dimensionNames.length
            ? dimensionNames
                .map((label) => {
                  const safeLabel = escapeHtml(label.trim());
                  const symbol = escapeHtml(this.getDimensionBadgeSymbol(label));
                  return `
                    <li class="leaderboard-dimension-badges__item">
                      <span class="leaderboard-dimension-badge">
                        <span class="leaderboard-dimension-badge__icon" aria-hidden="true">${symbol}</span>
                        <span class="leaderboard-dimension-badge__label">${safeLabel}</span>
                      </span>
                    </li>
                  `;
                })
                .join('')
            : `
                <li class="leaderboard-dimension-badges__item leaderboard-dimension-badges__item--empty">
                  <span class="leaderboard-dimension-badge">—</span>
                </li>
              `;
          const isPlayer = this.isPlayerScoreEntry(entry);
          const rowClasses = ['leaderboard-row'];
          if (isPlayer) {
            rowClasses.push('leaderboard-row--player');
          }
          const rowAttributes = isPlayer ? ' data-player="true" aria-current="true"' : '';
          const safeName = escapeHtml(entry.name ?? 'Explorer');
          const explorerLabel = isPlayer
            ? `${safeName} <span class="leaderboard-player-tag" aria-hidden="true">You</span><span class="sr-only"> (Current player)</span>`
            : safeName;
          const scoreDisplay = escapeHtml(formatScore(entry.score));
          const runTimeDisplay = escapeHtml(formatRunTime(entry.runTimeSeconds));
          const dimensionCountDisplay = escapeHtml(String(boundedCompleted));
          const inventoryDisplay = escapeHtml(
            String(Number.isFinite(entry.inventoryCount) ? Math.max(0, Math.round(entry.inventoryCount)) : 0),
          );
          const locationDisplay = escapeHtml(formatLocation(entry));
          const updatedDisplay = escapeHtml(updated);
          return `
            <tr class="${rowClasses.join(' ')}"${rowAttributes}>
              <th scope="row" class="leaderboard-col-rank">${rank}</th>
              <td>${explorerLabel}</td>
              <td>${scoreDisplay}</td>
              <td>${runTimeDisplay}</td>
              <td data-cell="dimensions">
                <span class="leaderboard-dimension-count">${dimensionCountDisplay}</span>
                <ul class="leaderboard-dimension-badges" aria-label="Dimensions unlocked">
                  ${badges}
                </ul>
                <span class="leaderboard-dimension-list sr-only">${escapeHtml(
                  dimensionNames.length ? dimensionNames.join(', ') : 'No additional dimensions tracked',
                )}</span>
              </td>
              <td>${inventoryDisplay}</td>
              <td data-cell="location">${locationDisplay}</td>
              <td data-cell="updated">${updatedDisplay}</td>
            </tr>
          `;
        })
        .join('');
      this.scoreboardListEl.innerHTML = rows;
      if (this.scoreboardContainer) {
        this.scoreboardContainer.dataset.empty = 'false';
      }
      if (this.scoreboardEmptyEl) {
        this.scoreboardEmptyEl.hidden = true;
      }
      if (this.victoryCelebrationActive) {
        this.updateVictoryCelebrationStats();
      }
    }

    getDimensionBadgeSymbol(label) {
      if (!label) {
        return DEFAULT_DIMENSION_BADGE_SYMBOL;
      }
      const raw = String(label).trim();
      if (!raw) {
        return DEFAULT_DIMENSION_BADGE_SYMBOL;
      }
      const lower = raw.toLowerCase();
      const matchedTheme = DIMENSION_THEME.find((dimension) => {
        const id = dimension.id?.toLowerCase();
        const name = dimension.name?.toLowerCase();
        return lower === id || lower === name || lower.includes(id ?? '') || lower.includes(name ?? '');
      });
      if (matchedTheme && this.dimensionBadgeSymbols[matchedTheme.id]) {
        return this.dimensionBadgeSymbols[matchedTheme.id];
      }
      for (const [key, synonyms] of Object.entries(DIMENSION_BADGE_SYNONYMS)) {
        if (synonyms.some((token) => lower.includes(token))) {
          return this.dimensionBadgeSymbols[key] ?? DEFAULT_DIMENSION_BADGE_SYMBOL;
        }
      }
      return DEFAULT_DIMENSION_BADGE_SYMBOL;
    }

    getPlayerLeaderboardRank() {
      const ids = this.getPlayerScoreEntryIds();
      if (!ids.length) {
        return null;
      }
      const index = this.scoreEntries.findIndex((entry) => {
        const identifier = this.getScoreEntryIdentifier(entry);
        return identifier && ids.includes(identifier);
      });
      if (index < 0) {
        return null;
      }
      return index + 1;
    }

    scheduleScoreSync(reason) {
      this.updateLocalScoreEntry(reason);
      if (!this.apiBaseUrl) {
        return;
      }
      this.pendingScoreSyncReason = reason;
      this.flushScoreSync();
    }

    async flushScoreSync(force = false) {
      if (!this.apiBaseUrl || (!force && this.scoreSyncInFlight)) {
        return;
      }
      if (!this.pendingScoreSyncReason) {
        const now = performance.now();
        if (!force && now - this.lastScoreSyncAt < this.scoreSyncCooldownSeconds * 1000) {
          return;
        }
      }
      const reason = this.pendingScoreSyncReason ?? 'auto';
      this.pendingScoreSyncReason = null;
      const entry = this.createRunSummary(reason);
      const baseUrl = this.apiBaseUrl.replace(/\/$/, '');
      const url = `${baseUrl}/scores`;
      try {
        this.scoreSyncInFlight = true;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(entry),
          credentials: 'omit',
        });
        if (!response.ok) {
          throw new Error(`Score sync failed with ${response.status}`);
        }
        let payload = null;
        try {
          payload = await response.json();
        } catch (parseError) {
          payload = null;
        }
        const entries = Array.isArray(payload?.items)
          ? payload.items
          : payload && typeof payload === 'object'
            ? [payload]
            : [entry];
        this.mergeScoreEntries(entries);
        this.lastScoreSyncAt = performance.now();
        this.scoreSyncHeartbeat = 0;
        const statusMessage = 'Leaderboard synced';
        if (this.scoreboardStatusEl) {
          this.scoreboardStatusEl.textContent = statusMessage;
        }
        this.clearOfflineSyncNotice('sync', { message: statusMessage });
        console.error(
          'Score sync diagnostic — confirm the leaderboard API accepted the update. Inspect the network panel if the leaderboard remains stale.',
          {
            reason,
            score: entry.score,
          },
        );
      } catch (error) {
        console.warn('Unable to sync score to backend', error);
        this.pendingScoreSyncReason = reason;
        this.handleLeaderboardOffline(error, {
          source: 'sync',
          reason,
          message: 'Sync failed — run saved locally. Will retry shortly.',
          hint: 'Leaderboard offline — progress saved locally.',
        });
      } finally {
        this.scoreSyncInFlight = false;
      }
    }

    stop() {
      this.cancelQueuedModelPreload();
      this.cancelAllAssetDelayWarnings();
      if (this.animationFrame !== null) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
      this.unbindEvents();
      this.hidePointerHint(true);
      this.clearVictoryEffectTimers();
      this.hideVictoryCelebration(true);
      this.hideVictoryBanner();
      this.victoryShareBusy = false;
      this.activeSessionId = 0;
      this.resetPlayerCharacterState();
      this.started = false;
    }

    resetPlayerCharacterState() {
      if (this.playerMixer) {
        try {
          this.playerMixer.stopAllAction();
          if (this.playerAvatar && typeof this.playerMixer.uncacheRoot === 'function') {
            this.playerMixer.uncacheRoot(this.playerAvatar);
          }
        } catch (error) {
          console.debug('Unable to stop player mixer cleanly.', error);
        }
      }
      this.playerMixer = null;
      this.playerIdleAction = null;

      this.cameraPerspective = 'first';
      this.playerHeadAttachment = null;
      if (this.camera && this.camera.parent && typeof this.camera.parent.remove === 'function') {
        try {
          this.camera.parent.remove(this.camera);
        } catch (error) {
          console.debug('Failed to detach camera from previous parent.', error);
        }
      }
      const cameraHolder = this.cameraBoom && typeof this.cameraBoom.add === 'function' ? this.cameraBoom : this.playerRig;
      if (cameraHolder && this.camera && typeof cameraHolder.add === 'function') {
        try {
          cameraHolder.add(this.camera);
          this.camera.position.set(0, 0, 0);
        } catch (error) {
          console.debug('Unable to reset camera rig state.', error);
        }
      }

      if (this.playerAvatar) {
        if (this.playerRig && typeof this.playerRig.remove === 'function') {
          this.playerRig.remove(this.playerAvatar);
        }
        disposeObject3D(this.playerAvatar);
        this.playerAvatar = null;
      }

      if (this.handGroup) {
        if (this.handGroup.parent && typeof this.handGroup.parent.remove === 'function') {
          this.handGroup.parent.remove(this.handGroup);
        }
        if (typeof this.handGroup.clear === 'function') {
          this.handGroup.clear();
        }
        this.handGroup.visible = true;
        this.handGroup = null;
      }

      this.handMaterials = [];
      this.handMaterialsDynamic = true;
      this.handModelLoaded = false;
      this.lastCullingCameraValid = false;
    }

    setupScene() {
      const THREE = this.THREE;
      const width = this.canvas.clientWidth || this.canvas.width || 1;
      const height = this.canvas.clientHeight || this.canvas.height || 1;
      const aspect = width / Math.max(1, height);

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      } catch (error) {
        const errorMessage =
          typeof error?.message === 'string' && error.message.trim().length
            ? error.message.trim()
            : 'Failed to initialise Three.js renderer.';
        this.emitGameEvent('initialisation-error', {
          stage: 'renderer',
          message: 'Failed to initialise Three.js renderer.',
          errorMessage,
          errorName: typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined,
          stack: typeof error?.stack === 'string' && error.stack.trim().length ? error.stack.trim() : undefined,
        });
        console.error('Failed to initialise Three.js renderer.', error);
        if (error && error.stack) {
          console.error('Renderer initialisation stack trace:', error.stack);
        }
        this.renderer = null;
        throw error;
      }

      this.renderer = renderer;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);
      this.renderer.setSize(width, height, false);
      this.applyTextureAnisotropy();
      this.bindWebglContextEvents();

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#87ceeb');
      this.scene.fog = new THREE.Fog(0x87ceeb, 40, 140);

      const fov = this.cameraFieldOfView ?? 60;
      this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 250);
      this.camera.position.set(0, 0, 0);

      this.playerRig = new THREE.Group();
      this.playerRig.name = 'PlayerRig';
      this.playerRig.position.set(0, PLAYER_EYE_HEIGHT, 0);
      this.cameraBoom = new THREE.Object3D();
      this.cameraBoom.name = 'PlayerCameraBoom';
      this.playerRig.add(this.cameraBoom);
      this.cameraBoom.add(this.camera);
      this.scene.add(this.playerRig);
      this.camera.position.set(0, 0, 0);
      this.updateCameraFrustum(width, height);

      this.hemiLight = new THREE.HemisphereLight(0xbddcff, 0x34502d, 0.9);
      this.scene.add(this.hemiLight);

      this.sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
      this.sunLight.position.set(18, 32, 12);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
      this.sunLight.shadow.camera.near = 0.5;
      this.sunLight.shadow.camera.far = 160;
      this.sunLight.shadow.camera.left = -60;
      this.sunLight.shadow.camera.right = 60;
      this.sunLight.shadow.camera.top = 60;
      this.sunLight.shadow.camera.bottom = -60;
      this.scene.add(this.sunLight);
      this.scene.add(this.sunLight.target);

      this.moonLight = new THREE.DirectionalLight(0x8ea2ff, 0.4);
      this.moonLight.position.set(-32, 18, -20);
      this.moonLight.castShadow = false;
      this.scene.add(this.moonLight);
      this.scene.add(this.moonLight.target);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.18);
      this.scene.add(this.ambientLight);

      this.terrainGroup = new THREE.Group();
      this.railsGroup = new THREE.Group();
      this.portalGroup = new THREE.Group();
      this.zombieGroup = new THREE.Group();
      this.golemGroup = new THREE.Group();
      this.chestGroup = new THREE.Group();
      this.challengeGroup = new THREE.Group();
      this.scene.add(this.terrainGroup);
      this.scene.add(this.railsGroup);
      this.scene.add(this.portalGroup);
      this.scene.add(this.zombieGroup);
      this.scene.add(this.golemGroup);
      this.scene.add(this.chestGroup);
      this.scene.add(this.challengeGroup);
      this.createFirstPersonHands();
      this.loadPlayerCharacter().catch((error) => {
        console.warn('Player model failed to load; continuing with primitive hands.', error);
      });
      this.refreshCameraBaseOffset();
      if (typeof console !== 'undefined') {
        console.error(
          'Scene population check fired — validate terrain, rails, portals, mobs, and chests render correctly. Re-run asset bootstrap if visuals are missing.',
        );
      }
    }

    updateCameraFrustum(width, height) {
      if (!this.camera || typeof width !== 'number' || typeof height !== 'number') {
        return;
      }
      const safeWidth = Math.max(1, width);
      const safeHeight = Math.max(1, height);
      if (this.camera.isPerspectiveCamera) {
        this.camera.aspect = safeWidth / safeHeight;
        this.camera.updateProjectionMatrix();
        return;
      }
      if (this.camera.isOrthographicCamera) {
        const aspect = safeWidth / safeHeight;
        const frustumHeight = this.cameraFrustumHeight ?? 6;
        const frustumWidth = frustumHeight * aspect;
        this.camera.left = -frustumWidth / 2;
        this.camera.right = frustumWidth / 2;
        this.camera.top = frustumHeight / 2;
        this.camera.bottom = -frustumHeight / 2;
        this.camera.updateProjectionMatrix();
      }
    }

    refreshCameraBaseOffset() {
      if (!this.camera || !this.cameraBaseOffset) {
        return;
      }
      this.cameraBaseOffset.copy(this.camera.position);
    }

    applyCameraPerspective(mode) {
      const perspective = mode === 'third' ? 'third' : 'first';
      this.cameraPerspective = perspective;
      if (!this.camera) {
        return;
      }
      const desiredParent =
        perspective === 'first'
          ? (this.playerHeadAttachment && this.playerHeadAttachment.isObject3D
              ? this.playerHeadAttachment
              : this.cameraBoom || this.playerRig || this.scene)
          : this.cameraBoom || this.playerRig || this.scene;
      if (desiredParent && this.camera.parent !== desiredParent && typeof desiredParent.add === 'function') {
        try {
          this.camera.parent?.remove?.(this.camera);
        } catch (error) {
          console.debug('Unable to detach camera from previous parent.', error);
        }
        try {
          desiredParent.add(this.camera);
        } catch (error) {
          console.debug('Unable to reparent camera for perspective change.', error);
        }
      }
      if (perspective === 'third') {
        if (this.thirdPersonCameraOffset) {
          this.camera.position.copy(this.thirdPersonCameraOffset);
        }
      } else if (this.firstPersonCameraOffset) {
        this.camera.position.copy(this.firstPersonCameraOffset);
      }
      this.refreshCameraBaseOffset();
      this.ensurePlayerArmsVisible();
    }

    toggleCameraPerspective() {
      const next = this.cameraPerspective === 'first' ? 'third' : 'first';
      this.applyCameraPerspective(next);
      const message = next === 'first' ? 'First-person view enabled.' : 'Third-person view enabled.';
      this.showHint(message);
    }

    ensurePlayerArmsVisible() {
      if (this.playerAvatar) {
        this.playerAvatar.visible = true;
        if (typeof this.playerAvatar.traverse === 'function') {
          this.playerAvatar.traverse((child) => {
            if (child && child.visible === false) {
              child.visible = true;
            }
          });
        }
      }
      if (!this.handGroup) {
        return;
      }
      const shouldShowHands = this.cameraPerspective === 'first';
      if (shouldShowHands && this.camera && this.handGroup.parent !== this.camera) {
        try {
          this.handGroup.parent?.remove?.(this.handGroup);
        } catch (error) {
          console.debug('Unable to detach hand group from previous parent.', error);
        }
        try {
          this.camera.add(this.handGroup);
        } catch (error) {
          console.debug('Unable to attach hand group to camera.', error);
        }
      }
      this.handGroup.visible = shouldShowHands;
    }

    getHighResTimestamp() {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
      return Date.now();
    }

    beginAssetTimer(kind, key) {
      if (!kind || !key) {
        return;
      }
      const timers = this.assetLoadTimers?.[kind];
      if (!timers || timers.has(key)) {
        return;
      }
      timers.set(key, this.getHighResTimestamp());
      this.emitGameEvent('asset-fetch-start', { kind, key });
      this.scheduleAssetDelayWarning(kind, key);
    }

    completeAssetTimer(kind, key, details = {}) {
      if (!kind || !key) {
        return;
      }
      const timers = this.assetLoadTimers?.[kind];
      if (!timers || !timers.has(key)) {
        return;
      }
      const startedAt = timers.get(key);
      timers.delete(key);
      const duration = Math.max(0, this.getHighResTimestamp() - startedAt);
      const entry = {
        kind,
        key,
        duration,
        status: details.success ? 'fulfilled' : 'failed',
        url: details.url ?? null,
        timestamp: Date.now(),
      };
      this.assetLoadLog.push(entry);
      if (this.assetLoadLog.length > 40) {
        this.assetLoadLog.splice(0, this.assetLoadLog.length - 40);
      }
      this.emitGameEvent('asset-fetch-complete', entry);
      this.cancelAssetDelayWarning(kind, key);
      this.clearAssetDelayNoticesForKey(key);
      const budget = Number.isFinite(this.assetLoadBudgetMs) ? this.assetLoadBudgetMs : 3000;
      const formattedDuration = duration.toFixed(0);
      const sourceLabel = details.url ? ` from ${details.url}` : '';
      if (details.success) {
        if (duration > budget) {
          console.warn(
            `[AssetBudget] ${kind}:${key} ready in ${formattedDuration}ms (exceeds ${budget}ms budget)${sourceLabel}.`,
          );
        } else {
          console.info(`[AssetBudget] ${kind}:${key} ready in ${formattedDuration}ms${sourceLabel}.`);
        }
      } else if (!details.silent) {
        const attemptLabel = details.url ? ` (last attempted ${details.url})` : '';
        const scheme = typeof window !== 'undefined' ? window.location?.protocol : null;
        const logFn = scheme === 'file:' ? console.info : console.warn;
        logFn(`[AssetBudget] ${kind}:${key} failed after ${formattedDuration}ms${attemptLabel}.`);
      }
    }

    scheduleAssetDelayWarning(kind, key) {
      if (!kind || !key) {
        return;
      }
      const handles = this.assetDelayHandles?.[kind];
      if (!handles || handles.has(key)) {
        return;
      }
      const budget = Number.isFinite(this.assetLoadBudgetMs) ? Math.max(500, this.assetLoadBudgetMs) : 3000;
      const scope =
        typeof window !== 'undefined'
          ? window
          : typeof globalThis !== 'undefined'
            ? globalThis
            : null;
      const setTimer = typeof scope?.setTimeout === 'function' ? scope.setTimeout.bind(scope) : setTimeout;
      const handle = setTimer(() => {
        handles.delete(key);
        this.handleAssetLoadDelay(kind, key);
      }, budget);
      handles.set(key, handle);
    }

    cancelAssetDelayWarning(kind, key) {
      if (!kind || !key) {
        return;
      }
      const handles = this.assetDelayHandles?.[kind];
      if (!handles || !handles.has(key)) {
        return;
      }
      const handle = handles.get(key);
      handles.delete(key);
      const scope =
        typeof window !== 'undefined'
          ? window
          : typeof globalThis !== 'undefined'
            ? globalThis
            : null;
      const clearTimer = typeof scope?.clearTimeout === 'function' ? scope.clearTimeout.bind(scope) : clearTimeout;
      try {
        clearTimer(handle);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to cancel asset delay timer cleanly.', { kind, key, error });
        }
      }
    }

    cancelAllAssetDelayWarnings() {
      const scope =
        typeof window !== 'undefined'
          ? window
          : typeof globalThis !== 'undefined'
            ? globalThis
            : null;
      const clearTimer = typeof scope?.clearTimeout === 'function' ? scope.clearTimeout.bind(scope) : clearTimeout;
      if (!this.assetDelayHandles) {
        return;
      }
      Object.values(this.assetDelayHandles).forEach((handles) => {
        if (!handles) {
          return;
        }
        handles.forEach((handle, key) => {
          try {
            clearTimer(handle);
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Failed to cancel asset delay timer during teardown.', { key, error });
            }
          }
        });
        handles.clear();
      });
      if (this.assetDelayNotices && typeof this.assetDelayNotices.clear === 'function') {
        this.assetDelayNotices.clear();
      }
    }

    handleAssetLoadDelay(kind, key) {
      if (!key) {
        return;
      }
      if (kind === 'models') {
        if (key === 'steve') {
          this.ensurePlayerAvatarPlaceholder('loading');
        } else if (key === 'arm') {
          this.ensurePlayerArmsVisible();
        }
      }
      const messageMap = {
        arm: 'Explorer hands streaming slowly — simplified overlay active.',
        steve: 'Explorer avatar streaming slowly — placeholder rig active.',
        zombie: 'Hostile models streaming slowly — husk stand-ins deployed.',
        golem: 'Golem armour streaming slowly — placeholder guardian active.',
      };
      const fallbackMessage = messageMap[key] || 'Asset stream delayed — placeholder visuals active.';
      this.announceAssetStreamIssue(key, fallbackMessage, { kind: 'delay', variant: 'warning' });
    }

    announceAssetStreamIssue(key, message, options = {}) {
      const text = typeof message === 'string' ? message.trim() : '';
      if (!text) {
        return;
      }
      const kind = options.kind || 'delay';
      const normalisedKey = typeof key === 'string' && key.trim().length ? key.trim() : 'asset';
      const dedupeKey = `${kind}:${normalisedKey}|${text}`;
      if (this.assetDelayNotices?.has(dedupeKey)) {
        return;
      }
      this.assetDelayNotices?.add(dedupeKey);
      const variant = options.variant || 'warning';
      if (this.playerHintEl) {
        this.playerHintEl.textContent = text;
        this.playerHintEl.classList.add('visible');
        this.playerHintEl.setAttribute('data-variant', variant);
      }
      this.lastHintMessage = text;
      if (this.footerStatusEl) {
        this.footerStatusEl.textContent = text;
      }
      if (this.footerEl) {
        this.footerEl.dataset.state = variant === 'critical' ? 'error' : 'warning';
      }
      this.updateFooterSummary();
      this.emitGameEvent('asset-delay-warning', {
        key: normalisedKey,
        originalKey: typeof key === 'string' ? key : null,
        kind,
        message: text,
        variant,
      });
    }

    clearAssetDelayNoticesForKey(key) {
      if (!this.assetDelayNotices) {
        return;
      }
      const normalisedKey = typeof key === 'string' && key.trim().length ? key.trim() : 'asset';
      const prefix = `delay:${normalisedKey}|`;
      Array.from(this.assetDelayNotices).forEach((entry) => {
        if (entry.startsWith(prefix)) {
          this.assetDelayNotices.delete(entry);
        }
      });
    }

    getAssetLoadLog(limit = 20) {
      const size = Math.max(1, Math.floor(limit));
      if (!this.assetLoadLog?.length) {
        return [];
      }
      return this.assetLoadLog.slice(-size);
    }

    createMaterials() {
      const THREE = this.THREE;
      const grassTexture = this.createVoxelTexture('grass', {
        base: '#69c368',
        highlight: '#92dd83',
        shadow: '#3f8f3a',
        accent: '#7dcf6f',
      });
      const dirtTexture = this.createVoxelTexture('dirt', {
        base: '#a66a33',
        highlight: '#c28145',
        shadow: '#7b4a26',
        accent: '#b5773a',
      });
      const stoneTexture = this.createVoxelTexture('stone', {
        base: '#8f8f8f',
        highlight: '#b8babd',
        shadow: '#5b5f63',
        accent: '#a5a5a5',
      });
      const materials = {
        grass: new THREE.MeshLambertMaterial({
          map: grassTexture,
          color: new THREE.Color('#ffffff'),
        }),
        dirt: new THREE.MeshLambertMaterial({
          map: dirtTexture,
          color: new THREE.Color('#ffffff'),
        }),
        stone: new THREE.MeshLambertMaterial({
          map: stoneTexture,
          color: new THREE.Color('#ffffff'),
        }),
        rails: new THREE.MeshLambertMaterial({
          color: new THREE.Color('#c9a14d'),
        }),
        zombie: new THREE.MeshStandardMaterial({
          color: new THREE.Color('#2e7d32'),
          roughness: 0.8,
          metalness: 0.1,
        }),
        portal: new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: {
            uTime: { value: 0 },
            uColorA: { value: new THREE.Color('#7f5af0') },
            uColorB: { value: new THREE.Color('#2cb67d') },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform float uTime;
            uniform vec3 uColorA;
            uniform vec3 uColorB;
            varying vec2 vUv;
            void main() {
              float swirl = sin((vUv.x + vUv.y + uTime * 0.7) * 6.2831) * 0.5 + 0.5;
              float vignette = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
              vec3 color = mix(uColorA, uColorB, swirl) * vignette;
              gl_FragColor = vec4(color, vignette);
            }
          `,
        }),
      };
      this.queueExternalTextureUpgrade('grass', materials.grass);
      this.queueExternalTextureUpgrade('dirt', materials.dirt);
      this.queueExternalTextureUpgrade('stone', materials.stone);
      return materials;
    }

    createCraftingRecipes() {
      return new Map([
        [
          'stick,stick,stone',
          {
            id: 'stone-pickaxe',
            label: 'Stone Pickaxe',
            score: 2,
            description: 'Unlocks tougher mining strikes and portal prep.',
            sequence: ['stick', 'stick', 'stone'],
          },
        ],
        [
          'stone,stone,grass-block',
          {
            id: 'portal-charge',
            label: 'Portal Charge',
            score: 4,
            description: 'Stabilises the next realm transition.',
            sequence: ['stone', 'stone', 'grass-block'],
          },
        ],
      ]);
    }

    restorePersistentUnlocks() {
      if (typeof localStorage === 'undefined') {
        return;
      }
      let payload = null;
      try {
        const raw = localStorage.getItem(RECIPE_UNLOCK_STORAGE_KEY);
        if (!raw) {
          return;
        }
        payload = JSON.parse(raw);
      } catch (error) {
        console.warn('Failed to parse stored recipe unlocks', error);
        return;
      }
      const sequences = Array.isArray(payload?.sequences) ? payload.sequences : [];
      const craftedIds = Array.isArray(payload?.craftedIds) ? payload.craftedIds : [];
      sequences.forEach((key) => {
        if (typeof key !== 'string' || !key) return;
        const recipe = this.craftingRecipes.get(key);
        if (recipe) {
          this.craftingState.unlocked.set(key, recipe);
        }
      });
      craftedIds.forEach((id) => {
        if (typeof id !== 'string' || !id) return;
        this.craftedRecipes.add(id);
      });
    }

    savePersistentUnlocks() {
      if (typeof localStorage === 'undefined') {
        return;
      }
      try {
        const data = {
          sequences: Array.from(this.craftingState.unlocked.keys()),
          craftedIds: Array.from(this.craftedRecipes.values()),
        };
        localStorage.setItem(RECIPE_UNLOCK_STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to persist recipe unlocks', error);
      }
    }

    restoreIdentitySnapshot() {
      if (typeof localStorage === 'undefined') {
        return;
      }
      this.identityHydrating = true;
      try {
        const raw = localStorage.getItem(this.identityStorageKey);
        if (!raw) {
          return;
        }
        let payload = null;
        try {
          payload = JSON.parse(raw);
        } catch (error) {
          console.warn('Failed to parse stored identity snapshot', error);
          return;
        }
        if (!payload || typeof payload !== 'object') {
          return;
        }
        if (typeof payload.displayName === 'string' && payload.displayName.trim().length > 0) {
          this.playerDisplayName = payload.displayName.trim();
          this.defaultPlayerName = this.playerDisplayName;
        }
        if (typeof payload.googleId === 'string' && payload.googleId.trim().length > 0) {
          this.playerGoogleId = payload.googleId.trim();
        }
        if (payload.location && typeof payload.location === 'object') {
          this.setPlayerLocation({ ...payload.location });
        } else if (typeof payload.locationLabel === 'string' && payload.locationLabel.trim().length > 0) {
          this.playerLocationLabel = payload.locationLabel.trim();
        }
      } finally {
        this.identityHydrating = false;
      }
    }

    persistIdentitySnapshot() {
      if (this.identityHydrating || typeof localStorage === 'undefined') {
        return;
      }
      try {
        const payload = {
          displayName: this.playerDisplayName,
          googleId: this.playerGoogleId,
          location: this.playerLocation,
          locationLabel: this.playerLocationLabel,
        };
        localStorage.setItem(this.identityStorageKey, JSON.stringify(payload));
      } catch (error) {
        console.warn('Failed to persist identity snapshot', error);
      }
    }

    autoCaptureLocation(options = {}) {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (options.updateOnFailure !== false) {
          this.setPlayerLocation({ error: 'Location unavailable' });
        }
        return Promise.resolve(null);
      }
      if (this.pendingLocationRequest) {
        return this.pendingLocationRequest;
      }
      if (!options.force && this.playerLocation && !this.playerLocation.error) {
        return Promise.resolve(this.playerLocation);
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (
        !options.force &&
        this.lastLocationRequestAt &&
        now - this.lastLocationRequestAt < this.locationRequestCooldownSeconds * 1000
      ) {
        return Promise.resolve(this.playerLocation);
      }
      this.lastLocationRequestAt = now;
      this.pendingLocationRequest = new Promise((resolve) => {
        const handleSuccess = (position) => {
          this.pendingLocationRequest = null;
          const coords = position?.coords || {};
          const payload = {
            latitude: Number.isFinite(coords.latitude) ? coords.latitude : null,
            longitude: Number.isFinite(coords.longitude) ? coords.longitude : null,
            accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
          };
          this.setPlayerLocation(payload);
          this.persistIdentitySnapshot();
          resolve(payload);
        };
        const handleError = (error) => {
          this.pendingLocationRequest = null;
          if (options.updateOnFailure !== false) {
            const denied = error?.code === error?.PERMISSION_DENIED;
            const label = denied ? 'Location permission denied' : 'Location unavailable';
            this.setPlayerLocation({ error: label });
            this.persistIdentitySnapshot();
          }
          resolve(null);
        };
        try {
          navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
            enableHighAccuracy: options.highAccuracy === true,
            maximumAge: Number.isFinite(options.maximumAge) ? options.maximumAge : 60000,
            timeout: Number.isFinite(options.timeout) ? options.timeout : 8000,
          });
        } catch (error) {
          handleError(error);
        }
      });
      return this.pendingLocationRequest;
    }

    describeDevice() {
      if (typeof navigator === 'undefined') {
        return 'Device details pending';
      }
      const platform = navigator.userAgentData?.platform || navigator.platform || 'Unknown platform';
      const brand = Array.isArray(navigator.userAgentData?.brands)
        ? navigator.userAgentData.brands.map((entry) => entry.brand).join(' · ')
        : navigator.vendor || '';
      const userAgent = navigator.userAgent || '';
      const labelParts = [platform.trim(), brand.trim(), userAgent.trim()].filter(Boolean);
      return labelParts.length ? labelParts.join(' · ') : 'Device details pending';
    }

    getDeviceLabel() {
      return this.deviceLabel;
    }

    inferLocationLabel(coords) {
      if (!coords) {
        return 'Location unavailable';
      }
      if (coords.error) {
        return typeof coords.error === 'string' ? coords.error : 'Location unavailable';
      }
      const latitude = Number(coords.latitude);
      const longitude = Number(coords.longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        const latLabel = latitude.toFixed(1);
        const lonLabel = longitude.toFixed(1);
        return `Lat ${latLabel}°, Lon ${lonLabel}°`;
      }
      return 'Location unavailable';
    }

    setPlayerLocation(location) {
      const hydrating = this.identityHydrating;
      if (!location) {
        this.playerLocation = null;
        this.playerLocationLabel = 'Location hidden';
      } else if (location.error) {
        this.playerLocation = { error: location.error };
        this.playerLocationLabel = typeof location.error === 'string' ? location.error : 'Location hidden';
      } else {
        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);
        const accuracy = Number.isFinite(location.accuracy) ? Number(location.accuracy) : null;
        const normalized = {
          latitude: Number.isFinite(latitude) ? latitude : null,
          longitude: Number.isFinite(longitude) ? longitude : null,
          accuracy,
        };
        const label = location.label || this.inferLocationLabel(normalized);
        normalized.label = label;
        this.playerLocation = normalized;
        this.playerLocationLabel = label;
      }
      if (this.started) {
        this.updateHud();
      }
      if (!hydrating) {
        this.updateLocalScoreEntry('location-update');
        this.scheduleScoreSync('location-update');
        this.renderScoreboard();
      }
      this.persistIdentitySnapshot();
    }

    setIdentity(identity = {}) {
      const previousId = this.playerGoogleId;
      const name = typeof identity.name === 'string' ? identity.name.trim() : '';
      if (name) {
        this.playerDisplayName = name;
      }
      this.playerGoogleId = identity.googleId ?? null;
      this.playerEmail = identity.email ?? null;
      this.playerAvatarUrl = identity.avatar ?? null;
      if (identity.location || identity.locationLabel) {
        this.setPlayerLocation(identity.location || { label: identity.locationLabel });
      }
      if (identity.locationLabel && !identity.location) {
        this.playerLocationLabel = identity.locationLabel;
      }
      if (this.started) {
        this.updateHud();
      }
      this.updateLocalScoreEntry('identity-update');
      this.scheduleScoreSync('identity-update');
      this.persistIdentitySnapshot();
      if (previousId !== this.playerGoogleId && typeof this.loadScoreboard === 'function') {
        this.loadScoreboard({ force: true }).catch(() => {});
      } else {
        this.renderScoreboard();
      }
    }

    clearIdentity() {
      this.playerGoogleId = null;
      this.playerEmail = null;
      this.playerAvatarUrl = null;
      this.playerDisplayName = this.defaultPlayerName || 'Explorer';
      this.playerLocation = null;
      this.playerLocationLabel = 'Location hidden';
      if (this.started) {
        this.updateHud();
      }
      this.updateLocalScoreEntry('identity-cleared');
      this.scheduleScoreSync('identity-cleared');
      this.renderScoreboard();
      this.persistIdentitySnapshot();
    }

    registerDefaultVoxelTexturePalette(key, palette) {
      if (!key || !palette || typeof palette !== 'object') {
        return;
      }
      const safePalette = {
        base: palette.base || DEFAULT_PROCEDURAL_VOXEL_PALETTE.base,
        highlight: palette.highlight || palette.base || DEFAULT_PROCEDURAL_VOXEL_PALETTE.highlight,
        shadow: palette.shadow || palette.base || DEFAULT_PROCEDURAL_VOXEL_PALETTE.shadow,
        accent: palette.accent || palette.highlight || DEFAULT_PROCEDURAL_VOXEL_PALETTE.accent,
      };
      this.defaultVoxelTexturePalettes.set(key, safePalette);
    }

    ensureProceduralTexture(key) {
      if (!key) {
        return null;
      }
      let texture = this.textureCache.get(key) || null;
      if (texture) {
        return texture;
      }
      const storedPalette = this.defaultVoxelTexturePalettes.get(key) || DEFAULT_PROCEDURAL_VOXEL_PALETTE;
      texture = this.createVoxelTexture(key, storedPalette);
      return texture;
    }

    createVoxelTexture(key, palette) {
      if (palette && typeof palette === 'object') {
        this.registerDefaultVoxelTexturePalette(key, palette);
      }
      const cached = this.textureCache.get(key);
      if (cached) {
        return cached;
      }
      const THREE = this.THREE;
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        const fallback = new THREE.Texture();
        this.textureCache.set(key, fallback);
        return fallback;
      }
      const colors = [palette.base, palette.highlight, palette.shadow, palette.accent].filter(Boolean);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const noise = Math.sin(x * 12.3 + y * 7.1) * 43758.5453;
          const index = Math.floor(Math.abs(noise) * colors.length) % colors.length;
          ctx.fillStyle = colors[index] ?? palette.base;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 1;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.needsUpdate = true;
      this.textureCache.set(key, texture);
      return texture;
    }

    getExternalTextureSources(key) {
      if (typeof window === 'undefined') {
        return [];
      }
      const config = window.APP_CONFIG || {};
      const explicit = config.textures && typeof config.textures === 'object' ? config.textures[key] : null;
      const sources = [];
      if (typeof explicit === 'string' && explicit.trim()) {
        sources.push(explicit.trim());
      } else if (Array.isArray(explicit)) {
        explicit
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean)
          .forEach((value) => sources.push(value));
      }
      const base = typeof config.textureBaseUrl === 'string' ? config.textureBaseUrl.trim() : '';
      if (base) {
        const normalised = base.endsWith('/') ? base.slice(0, -1) : base;
        sources.push(`${normalised}/${key}.png`);
      }
      const manifest = config.textureManifest && typeof config.textureManifest === 'object' ? config.textureManifest : null;
      if (manifest) {
        const manifestEntry = manifest[key];
        if (typeof manifestEntry === 'string' && manifestEntry.trim()) {
          sources.push(manifestEntry.trim());
        } else if (Array.isArray(manifestEntry)) {
          manifestEntry
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean)
            .forEach((value) => sources.push(value));
        }
      }
      return sources.filter(Boolean);
    }

    prepareExternalTexture(texture) {
      const THREE = this.THREE;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 1;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    }

    loadExternalVoxelTexture(key) {
      const sources = this.getExternalTextureSources(key);
      if (!sources.length) {
        return null;
      }
      if (this.pendingTextureLoads.has(key)) {
        return this.pendingTextureLoads.get(key);
      }
      const THREE = this.THREE;
      if (!this.textureLoader) {
        this.textureLoader = new THREE.TextureLoader();
        if (typeof this.textureLoader.setCrossOrigin === 'function') {
          this.textureLoader.setCrossOrigin('anonymous');
        } else {
          this.textureLoader.crossOrigin = 'anonymous';
        }
      }
      const useCachedFallbackTexture = (options = {}) => {
        const fallbackTexture = this.ensureProceduralTexture(key);
        if (fallbackTexture) {
          if (!options.silent) {
            const lastUrl = options.url ? ` after ${options.url}` : '';
            console.warn(
              `Falling back to default ${key} texture${lastUrl} because external sources failed.`,
            );
          }
        } else if (!options.silent) {
          console.warn(`No procedural fallback texture is available for ${key}.`);
        }
        return fallbackTexture;
      };

      const attemptLoad = (index) => {
        if (index >= sources.length) {
          return Promise.resolve(null);
        }
        const url = sources[index];
        return new Promise((resolve) => {
          this.textureLoader.load(
            url,
            (texture) => {
              resolve({ texture, url });
            },
            undefined,
            () => {
              console.warn(`Failed to load texture ${url}; attempting fallback source.`);
              resolve(null);
            },
          );
        }).then((result) => {
          if (result) {
            return result;
          }
          return attemptLoad(index + 1);
        });
      };
      this.beginAssetTimer('textures', key);
      const loadPromise = attemptLoad(0)
        .then((result) => {
          if (!result || !result.texture) {
            const url = result?.url ?? null;
            this.completeAssetTimer('textures', key, { success: false, url });
            return useCachedFallbackTexture({ url }) ?? null;
          }
          this.prepareExternalTexture(result.texture);
          console.error(
            `Texture streaming check — ${key} resolved via ${result.url}. If textures appear blank, verify CDN availability and fallback cache configuration.`,
          );
          this.completeAssetTimer('textures', key, { success: true, url: result.url });
          return result.texture;
        })
        .catch((error) => {
          console.warn(`Unable to stream external texture for ${key}`, error);
          this.completeAssetTimer('textures', key, { success: false });
          return useCachedFallbackTexture({ silent: true });
        })
        .finally(() => {
          this.pendingTextureLoads.delete(key);
        });
      this.pendingTextureLoads.set(key, loadPromise);
      return loadPromise;
    }

    queueExternalTextureUpgrade(key, material) {
      const promise = this.loadExternalVoxelTexture(key);
      if (!promise) {
        return;
      }
      promise.then((texture) => {
        if (!texture || !material) {
          return;
        }
        this.textureCache.set(key, texture);
        material.map = texture;
        material.needsUpdate = true;
        if (this.renderer) {
          this.applyTextureAnisotropy();
        }
      });
    }

    detectTouchPreferred() {
      if (typeof window === 'undefined') return false;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
        return true;
      }
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.maxTouchPoints && nav.maxTouchPoints > 0) {
        return true;
      }
      return 'ontouchstart' in window;
    }

    detectReducedMotion() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
      }
      try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (error) {
        console.debug('Unable to determine motion preferences', error);
        return false;
      }
    }

    createAudioController() {
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const samples = scope?.INFINITE_RAILS_EMBEDDED_ASSETS?.audioSamples || null;
      if (!samples || !Object.keys(samples).length) {
        return {
          has: () => false,
          play: () => {},
          playRandom: () => {},
          stopAll: () => {},
          setMasterVolume: () => {},
        };
      }
      const HowlCtor = scope?.Howl;
      const useHowler = typeof HowlCtor === 'function';
      const AudioCtor = !useHowler
        ? scope?.Audio || (typeof Audio !== 'undefined' ? Audio : null)
        : null;
      if (!useHowler && typeof AudioCtor !== 'function') {
        return {
          has: (name) => Boolean(samples[name]),
          play: () => {},
          playRandom: () => {},
          stopAll: () => {},
          setMasterVolume: () => {},
          _resolve: (name) => (samples[name] ? name : null),
        };
      }
      const available = new Set(Object.keys(samples));
      const aliasSource = scope?.INFINITE_RAILS_AUDIO_ALIASES || null;
      const aliasMap = new Map();
      if (aliasSource && typeof aliasSource === 'object') {
        Object.entries(aliasSource).forEach(([name, value]) => {
          if (!name) return;
          const entries = Array.isArray(value) ? value : [value];
          const filtered = entries
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
          if (filtered.length) {
            aliasMap.set(name, filtered);
          }
        });
      }
      const aliasCache = new Map();
      const aliasNotified = new Set();
      const resolveAudioName = (name) => {
        if (!name) return null;
        if (available.has(name)) {
          return name;
        }
        if (aliasCache.has(name)) {
          return aliasCache.get(name);
        }
        const candidates = aliasMap.get(name);
        if (!candidates || !candidates.length) {
          aliasCache.set(name, null);
          return null;
        }
        const resolved = candidates.find((candidate) => available.has(candidate)) || null;
        aliasCache.set(name, resolved);
        return resolved;
      };
      const howlCache = useHowler ? new Map() : null;
      const fallbackPlaying = useHowler ? null : new Map();
      let lastCaptionText = null;
      let lastCaptionAt = 0;
      let masterVolume = 1;
      const clampVolume = (value) => {
        if (!Number.isFinite(value)) {
          return 1;
        }
        return Math.max(0, Math.min(1, value));
      };
      const applyMasterVolume = (audio, baseVolume) => {
        if (!audio) return;
        const volume = clampVolume(baseVolume) * masterVolume;
        audio.volume = clampVolume(volume);
      };
      const getCaptionText = (requestedName, resolvedName) => {
        const captions = scope?.INFINITE_RAILS_AUDIO_CAPTIONS;
        if (!captions || typeof captions !== 'object') {
          return null;
        }
        if (requestedName && typeof captions[requestedName] === 'string') {
          return captions[requestedName];
        }
        if (resolvedName && typeof captions[resolvedName] === 'string') {
          return captions[resolvedName];
        }
        return null;
      };

      const announceCaption = (requestedName, resolvedName) => {
        const caption = getCaptionText(requestedName, resolvedName);
        if (!caption || typeof scope?.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') {
          return;
        }
        const now = Date.now();
        if (caption === lastCaptionText && now - lastCaptionAt < 1200) {
          return;
        }
        lastCaptionText = caption;
        lastCaptionAt = now;
        try {
          scope.dispatchEvent(
            new CustomEvent('infinite-rails:audio-caption', {
              detail: {
                caption,
                name: requestedName || resolvedName || null,
                resolvedName: resolvedName || null,
                timestamp: now,
              },
            }),
          );
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Unable to dispatch audio caption event.', error);
          }
        }
      };

      const resumeAudioContext = () => {
        const ctx = scope?.Howler?.ctx;
        const state = typeof ctx?.state === 'string' ? ctx.state : '';
        if (!ctx || state === 'running' || typeof ctx.resume !== 'function') {
          return;
        }
        try {
          const result = ctx.resume();
          if (result && typeof result.catch === 'function') {
            result.catch((error) => {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Audio context resume rejected.', error);
              }
            });
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Audio context resume failed.', error);
          }
        }
      };

      const playInternal = (requestedName, resolvedName, options = {}) => {
        if (!resolvedName || !samples[resolvedName]) {
          return;
        }
        resumeAudioContext();
        if (useHowler) {
          let howl = howlCache.get(resolvedName);
          if (!howl) {
            howl = new HowlCtor({
              src: [`data:audio/wav;base64,${samples[resolvedName]}`],
              volume: options.volume ?? 1,
              preload: true,
            });
            howlCache.set(resolvedName, howl);
          }
          if (options.volume !== undefined && typeof howl.volume === 'function') {
            howl.volume(options.volume);
          }
          if (options.rate !== undefined && typeof howl.rate === 'function') {
            howl.rate(options.rate);
          }
          if (options.loop !== undefined && typeof howl.loop === 'function') {
            howl.loop(Boolean(options.loop));
          }
          howl.play();
        } else {
          const baseVolume = options.volume !== undefined ? clampVolume(options.volume) : 1;
          const src = `data:audio/wav;base64,${samples[resolvedName]}`;
          const instance = new AudioCtor(src);
          instance.preload = 'auto';
          instance.loop = Boolean(options.loop);
          if (options.rate !== undefined && Number.isFinite(options.rate)) {
            try {
              instance.playbackRate = Math.max(0.5, Math.min(4, options.rate));
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Unable to apply playback rate to audio element.', error);
              }
            }
          }
          applyMasterVolume(instance, baseVolume);
          const cleanup = () => {
            fallbackPlaying.delete(instance);
            instance.removeEventListener('ended', cleanup);
            instance.removeEventListener('error', cleanup);
          };
          instance.addEventListener('ended', cleanup);
          instance.addEventListener('error', cleanup);
          fallbackPlaying.set(instance, baseVolume);
          let playPromise;
          try {
            playPromise = instance.play();
          } catch (error) {
            fallbackPlaying.delete(instance);
            if (typeof console !== 'undefined' && typeof console.warn === 'function') {
              console.warn('Audio playback failed in fallback controller.', error);
            }
            return;
          }
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((error) => {
              fallbackPlaying.delete(instance);
              if (typeof console !== 'undefined' && typeof console.warn === 'function') {
                console.warn('Audio playback failed in fallback controller.', error);
              }
            });
          }
        }
        announceCaption(requestedName, resolvedName);
        if (
          requestedName &&
          requestedName !== resolvedName &&
          !aliasNotified.has(requestedName) &&
          typeof console !== 'undefined' &&
          typeof console.debug === 'function'
        ) {
          console.debug(
            `Audio sample "${requestedName}" unavailable — falling back to "${resolvedName}".`,
          );
          aliasNotified.add(requestedName);
        }
      };
      const controller = {
        has(name) {
          return Boolean(resolveAudioName(name));
        },
        play(name, options = {}) {
          const resolved = resolveAudioName(name);
          if (!resolved) return;
          playInternal(name, resolved, options);
        },
        playRandom(names = [], options = {}) {
          const pool = [];
          names.forEach((name) => {
            const resolved = resolveAudioName(name);
            if (resolved) {
              pool.push({ requested: name, resolved });
            }
          });
          if (!pool.length) return;
          const choice = pool[Math.floor(Math.random() * pool.length)];
          playInternal(choice.requested, choice.resolved, options);
        },
        stopAll() {
          if (useHowler) {
            howlCache.forEach((howl) => howl.stop?.());
            if (scope?.Howler?.stop) {
              scope.Howler.stop();
            }
            return;
          }
          Array.from(fallbackPlaying.keys()).forEach((audio) => {
            audio.pause();
            try {
              audio.currentTime = 0;
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Unable to reset audio element state.', error);
              }
            }
            fallbackPlaying.delete(audio);
          });
        },
        setMasterVolume(volume) {
          masterVolume = clampVolume(volume);
          if (useHowler) {
            if (scope?.Howler?.volume) {
              scope.Howler.volume(masterVolume);
            }
            return;
          }
          fallbackPlaying.forEach((baseVolume, audio) => applyMasterVolume(audio, baseVolume));
        },
        resumeContextIfNeeded() {
          resumeAudioContext();
        },
        _resolve(name) {
          // Exposed for debugging and automated tests.
          return resolveAudioName(name);
        },
      };
      return controller;
    }

    initializeMobileControls() {
      if (!this.mobileControlsRoot) {
        return;
      }
      const controls = this.mobileControlsRoot;
      const controlsVerified = this.verifyMobileControlsDom();
      if (!controlsVerified) {
        this.teardownMobileControls();
        controls.dataset.active = 'false';
        controls.setAttribute('aria-hidden', 'true');
        this.virtualJoystickEl?.setAttribute?.('aria-hidden', 'true');
        this.mobileControlsActive = false;
        this.updatePointerHintForInputMode();
        return;
      }
      const shouldActivate = Boolean(this.isTouchPreferred);
      if (shouldActivate === this.mobileControlsActive) {
        controls.setAttribute('aria-hidden', shouldActivate ? 'false' : 'true');
        controls.dataset.active = shouldActivate ? 'true' : 'false';
        if (shouldActivate) {
          this.virtualJoystickEl?.setAttribute('aria-hidden', 'false');
        } else {
          this.virtualJoystickEl?.setAttribute('aria-hidden', 'true');
          this.updatePointerHintForInputMode();
        }
        return;
      }
      this.teardownMobileControls();
      controls.setAttribute('aria-hidden', shouldActivate ? 'false' : 'true');
      controls.dataset.active = shouldActivate ? 'true' : 'false';
      if (!shouldActivate) {
        this.updatePointerHintForInputMode();
        return;
      }
      this.hidePointerHint(true);
      const blockDefault = (event) => event.preventDefault();
      controls.addEventListener('contextmenu', blockDefault);
      this.mobileControlDisposers.push(() => controls.removeEventListener('contextmenu', blockDefault));

      const directionButtons = controls.querySelectorAll(
        'button[data-action="up"], button[data-action="down"], button[data-action="left"], button[data-action="right"]'
      );
      directionButtons.forEach((button) => {
        button.addEventListener('pointerdown', this.onTouchButtonPress, { passive: false });
        button.addEventListener('pointerup', this.onTouchButtonRelease);
        button.addEventListener('pointercancel', this.onTouchButtonRelease);
        button.addEventListener('lostpointercapture', this.onTouchButtonRelease);
        button.addEventListener('click', blockDefault);
        this.mobileControlDisposers.push(() => {
          button.removeEventListener('pointerdown', this.onTouchButtonPress);
          button.removeEventListener('pointerup', this.onTouchButtonRelease);
          button.removeEventListener('pointercancel', this.onTouchButtonRelease);
          button.removeEventListener('lostpointercapture', this.onTouchButtonRelease);
          button.removeEventListener('click', blockDefault);
        });
      });

      const actionButton = controls.querySelector('button[data-action="action"]');
      if (actionButton) {
        const handlePointerDown = (event) => {
          event.preventDefault();
          this.markInteraction();
          this.touchActionPending = true;
          this.touchActionStart = performance.now();
        };
        const handlePointerUp = (event) => {
          event.preventDefault();
          this.markInteraction();
          if (!this.touchActionPending) {
            return;
          }
          this.touchActionPending = false;
          const duration = performance.now() - this.touchActionStart;
          if (duration > 260) {
            this.touchJumpRequested = true;
          } else {
            this.mineBlock();
          }
        };
        const handlePointerCancel = () => {
          this.markInteraction();
          this.touchActionPending = false;
        };
        actionButton.addEventListener('pointerdown', handlePointerDown, { passive: false });
        actionButton.addEventListener('pointerup', handlePointerUp);
        actionButton.addEventListener('pointercancel', handlePointerCancel);
        actionButton.addEventListener('click', blockDefault);
        this.mobileControlDisposers.push(() => {
          actionButton.removeEventListener('pointerdown', handlePointerDown);
          actionButton.removeEventListener('pointerup', handlePointerUp);
          actionButton.removeEventListener('pointercancel', handlePointerCancel);
          actionButton.removeEventListener('click', blockDefault);
        });
      }

      const portalButton = controls.querySelector('button[data-action="portal"]');
      if (portalButton) {
        const markPortalInteraction = () => this.markInteraction();
        portalButton.addEventListener('click', this.onPortalButton);
        portalButton.addEventListener('pointerdown', blockDefault, { passive: false });
        portalButton.addEventListener('pointerdown', markPortalInteraction);
        this.mobileControlDisposers.push(() => {
          portalButton.removeEventListener('click', this.onPortalButton);
          portalButton.removeEventListener('pointerdown', blockDefault);
          portalButton.removeEventListener('pointerdown', markPortalInteraction);
        });
      }

      if (this.virtualJoystickEl) {
        this.virtualJoystickEl.setAttribute('aria-hidden', 'false');
        this.virtualJoystickEl.addEventListener('pointerdown', this.onJoystickPointerDown, { passive: false });
        window.addEventListener('pointermove', this.onJoystickPointerMove, { passive: false });
        window.addEventListener('pointerup', this.onJoystickPointerUp);
        window.addEventListener('pointercancel', this.onJoystickPointerUp);
        this.mobileControlDisposers.push(() => {
          this.virtualJoystickEl.removeEventListener('pointerdown', this.onJoystickPointerDown);
          window.removeEventListener('pointermove', this.onJoystickPointerMove);
          window.removeEventListener('pointerup', this.onJoystickPointerUp);
          window.removeEventListener('pointercancel', this.onJoystickPointerUp);
        });
      }
      this.mobileControlsActive = true;
    }

    verifyMobileControlsDom() {
      const controls = this.mobileControlsRoot;
      if (!controls) {
        return false;
      }
      if (!this.virtualJoystickEl && typeof controls.querySelector === 'function') {
        const fallbackJoystick = controls.querySelector('.virtual-joystick');
        if (fallbackJoystick) {
          this.virtualJoystickEl = fallbackJoystick;
        }
      }
      if (!this.virtualJoystickThumb && this.virtualJoystickEl?.querySelector) {
        const thumb = this.virtualJoystickEl.querySelector('.virtual-joystick__thumb');
        if (thumb) {
          this.virtualJoystickThumb = thumb;
        }
      }
      let buttonCount = 0;
      if (typeof controls.querySelectorAll === 'function') {
        try {
          const buttons = controls.querySelectorAll('button[data-action]');
          if (Array.isArray(buttons)) {
            buttonCount = buttons.length;
          } else if (buttons && typeof buttons.length === 'number') {
            buttonCount = buttons.length;
          } else if (buttons && typeof buttons[Symbol.iterator] === 'function') {
            buttonCount = Array.from(buttons).length;
          }
        } catch (error) {
          if (typeof console !== 'undefined') {
            console.warn('Failed to inspect mobile control buttons.', error);
          }
          buttonCount = 0;
        }
      }
      const joystickReady = Boolean(this.virtualJoystickEl);
      const verified = joystickReady && buttonCount > 0;
      controls.dataset.ready = verified ? 'true' : 'false';
      if (!verified && typeof console !== 'undefined') {
        console.warn('Mobile controls unavailable — virtual joystick or buttons missing.');
      }
      return verified;
    }

    attachPointerPreferenceObserver() {
      if (this.detachPointerPreferenceObserver || typeof window === 'undefined') {
        return;
      }
      if (typeof window.matchMedia !== 'function') {
        return;
      }
      try {
        const query = window.matchMedia('(pointer: coarse)');
        this.pointerPreferenceObserver = query;
        const handler = this.onPointerPreferenceChange;
        if (typeof query.addEventListener === 'function') {
          query.addEventListener('change', handler);
          this.detachPointerPreferenceObserver = () => {
            try {
              query.removeEventListener('change', handler);
            } catch (error) {
              console.debug('Unable to detach coarse pointer listener', error);
            }
            this.detachPointerPreferenceObserver = null;
          };
        } else if (typeof query.addListener === 'function') {
          query.addListener(handler);
          this.detachPointerPreferenceObserver = () => {
            try {
              query.removeListener(handler);
            } catch (error) {
              console.debug('Unable to detach coarse pointer listener', error);
            }
            this.detachPointerPreferenceObserver = null;
          };
        }
      } catch (error) {
        console.debug('Unable to observe pointer preference changes', error);
        this.pointerPreferenceObserver = null;
        this.detachPointerPreferenceObserver = null;
      }
    }

    handlePointerPreferenceChange(event) {
      const prefersTouch = Boolean(event?.matches) || this.detectTouchPreferred();
      if (prefersTouch !== this.isTouchPreferred) {
        this.isTouchPreferred = prefersTouch;
      }
      if (prefersTouch !== this.mobileControlsActive) {
        this.initializeMobileControls();
      }
    }

    getPointerInputTargets() {
      const targets = [];
      if (this.canvas) {
        targets.push(this.canvas);
      }
      const doc =
        this.canvas?.ownerDocument ||
        (typeof document !== 'undefined' ? document : null);
      if (!doc || typeof doc.querySelectorAll !== 'function') {
        return targets;
      }
      let canvases = [];
      try {
        const nodeList = doc.querySelectorAll('canvas');
        if (Array.isArray(nodeList)) {
          canvases = nodeList.slice();
        } else if (nodeList && typeof nodeList.length === 'number') {
          canvases = Array.from(nodeList);
        } else if (nodeList && typeof nodeList[Symbol.iterator] === 'function') {
          canvases = Array.from(nodeList);
        }
      } catch (error) {
        canvases = [];
      }
      if (!canvases.length) {
        return targets;
      }
      const view = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      const getStyle = typeof view?.getComputedStyle === 'function' ? (element) => view.getComputedStyle(element) : null;
      let topmost = null;
      let bestScore = -Infinity;
      canvases.forEach((element, index) => {
        if (!element) {
          return;
        }
        if (getStyle) {
          const style = getStyle(element);
          if (!style) {
            return;
          }
          if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
            return;
          }
          const zIndex = Number.parseFloat(style.zIndex);
          const zScore = Number.isFinite(zIndex) ? zIndex : 0;
          const positionScore = style.position !== 'static' ? 1 : 0;
          const orderScore = index / 1000;
          const score = zScore * 100 + positionScore * 10 + orderScore;
          if (score >= bestScore) {
            bestScore = score;
            topmost = element;
          }
        } else {
          topmost = element;
        }
      });
      if (!topmost && canvases.length) {
        topmost = canvases[canvases.length - 1];
      }
      if (topmost && !targets.includes(topmost)) {
        targets.push(topmost);
      }
      return targets;
    }

    handleGlobalPointerDown(event) {
      if (!event) {
        return;
      }
      const type = event.pointerType || '';
      if (type !== 'touch' && type !== 'pen') {
        return;
      }
      if (!this.isTouchPreferred) {
        this.isTouchPreferred = true;
      }
      if (!this.mobileControlsActive) {
        this.initializeMobileControls();
      }
    }

    handleGlobalTouchStart() {
      if (!this.isTouchPreferred) {
        this.isTouchPreferred = true;
      }
      if (!this.mobileControlsActive) {
        this.initializeMobileControls();
      }
    }

    teardownMobileControls() {
      if (this.mobileControlDisposers.length) {
        this.mobileControlDisposers.forEach((dispose) => {
          try {
            dispose();
          } catch (error) {
            console.warn('Failed to remove mobile control handler', error);
          }
        });
      }
      this.mobileControlDisposers = [];
      this.touchButtonStates.up = false;
      this.touchButtonStates.down = false;
      this.touchButtonStates.left = false;
      this.touchButtonStates.right = false;
      this.touchActionPending = false;
      this.touchJumpRequested = false;
      this.resetJoystick();
      if (this.mobileControlsRoot) {
        this.mobileControlsRoot.dataset.active = 'false';
        this.mobileControlsRoot.setAttribute('aria-hidden', 'true');
      }
      if (this.virtualJoystickEl) {
        this.virtualJoystickEl.setAttribute('aria-hidden', 'true');
      }
      this.mobileControlsActive = false;
      this.updatePointerHintForInputMode();
    }

    resetJoystick() {
      this.joystickPointerId = null;
      this.joystickVector.set(0, 0);
      if (this.virtualJoystickThumb) {
        this.virtualJoystickThumb.style.transform = 'translate(0px, 0px)';
      }
    }

    handleJoystickPointerDown(event) {
      if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        return;
      }
      event.preventDefault();
      this.markInteraction();
      this.joystickPointerId = event.pointerId ?? 'touch';
      this.updateJoystickFromPointer(event);
      this.virtualJoystickEl?.setPointerCapture?.(event.pointerId ?? 0);
    }

    handleJoystickPointerMove(event) {
      if (this.joystickPointerId === null) return;
      if (event.pointerId !== undefined && event.pointerId !== this.joystickPointerId) return;
      if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      event.preventDefault();
      this.markInteraction();
      this.updateJoystickFromPointer(event);
    }

    handleJoystickPointerUp(event) {
      if (this.joystickPointerId === null) return;
      if (event.pointerId !== undefined && event.pointerId !== this.joystickPointerId) return;
      event.preventDefault();
      this.markInteraction();
      this.virtualJoystickEl?.releasePointerCapture?.(event.pointerId ?? 0);
      this.resetJoystick();
    }

    updateJoystickFromPointer(event) {
      if (!this.virtualJoystickEl) return;
      const rect = this.virtualJoystickEl.getBoundingClientRect();
      const radius = rect.width / 2;
      if (radius <= 0) return;
      const centerX = rect.left + radius;
      const centerY = rect.top + radius;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const distance = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
      const angle = Math.atan2(dy, dx);
      const limitedX = Math.cos(angle) * distance;
      const limitedY = Math.sin(angle) * distance;
      const normalisedX = limitedX / radius;
      const normalisedY = limitedY / radius;
      this.joystickVector.set(normalisedX, normalisedY);
      if (this.virtualJoystickThumb) {
        const thumbRadius = radius * 0.65;
        const thumbX = normalisedX * thumbRadius;
        const thumbY = normalisedY * thumbRadius;
        this.virtualJoystickThumb.style.transform = `translate(${thumbX.toFixed(1)}px, ${thumbY.toFixed(1)}px)`;
      }
    }

    handleTouchButtonPress(event) {
      if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        return;
      }
      event.preventDefault();
      this.markInteraction();
      const button = event.currentTarget;
      if (!button) return;
      button.setPointerCapture?.(event.pointerId ?? 0);
      const action = button.dataset?.action;
      if (!action) return;
      if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
        this.touchButtonStates[action] = true;
      }
    }

    handleTouchButtonRelease(event) {
      const button = event.currentTarget;
      if (!button) return;
      const action = button.dataset?.action;
      if (!action) return;
      this.markInteraction();
      if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
        this.touchButtonStates[action] = false;
      }
    }

    handlePortalButton(event) {
      event.preventDefault();
      this.markInteraction();
      if (this.tryOpenNearbyChest()) {
        return;
      }
      if (this.portalActivated && this.isPlayerNearPortal()) {
        this.advanceDimension();
        return;
      }
      if (this.portalReady && this.isPlayerNearPortalFrame()) {
        this.ignitePortal('torch');
        return;
      }
      this.placeBlock();
    }

    handleTouchLookPointerDown(event) {
      if (event.pointerType !== 'touch') {
        return;
      }
      if (this.mobileControlsRoot?.contains(event.target)) {
        return;
      }
      event.preventDefault();
      this.markInteraction();
      this.touchLookPointerId = event.pointerId;
      this.touchLookLast = { x: event.clientX, y: event.clientY };
    }

    handleTouchLookPointerMove(event) {
      if (event.pointerType !== 'touch') {
        return;
      }
      if (this.touchLookPointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      this.markInteraction();
      if (!this.touchLookLast) {
        this.touchLookLast = { x: event.clientX, y: event.clientY };
        return;
      }
      const dx = event.clientX - this.touchLookLast.x;
      const dy = event.clientY - this.touchLookLast.y;
      this.touchLookLast = { x: event.clientX, y: event.clientY };
      this.yaw -= dx * POINTER_SENSITIVITY * 0.9;
      this.pitch -= dy * POINTER_SENSITIVITY * 0.9;
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    }

    handleTouchLookPointerUp(event) {
      if (event.pointerType !== 'touch') {
        return;
      }
      if (this.touchLookPointerId !== event.pointerId) {
        return;
      }
      this.markInteraction();
      this.touchLookPointerId = null;
      this.touchLookLast = null;
    }

    applyTextureAnisotropy() {
      if (!this.renderer) return;
      const anisotropy = this.renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
      Object.values(this.materials).forEach((material) => {
        if (material?.map) {
          material.map.anisotropy = anisotropy;
          material.map.needsUpdate = true;
        }
      });
    }

    createFirstPersonHands() {
      const THREE = this.THREE;
      if (!THREE || !this.camera) return;
      const cameraHolder = this.cameraBoom || this.playerRig;
      if (cameraHolder && this.camera.parent !== cameraHolder) {
        this.camera.parent?.remove(this.camera);
        cameraHolder.add(this.camera);
      }

      if (this.handGroup) {
        this.camera.remove(this.handGroup);
      }

      this.handGroup = new THREE.Group();
      this.handGroup.position.set(0.42, -0.46, -0.8);
      this.handGroup.rotation.set(-0.55, 0, 0);
      this.handMaterials = [];
      this.handMaterialsDynamic = true;
      this.handModelLoaded = false;

      const handGeometry = new THREE.BoxGeometry(0.24, 0.46, 0.24);
      const sleeveGeometry = new THREE.BoxGeometry(0.26, 0.22, 0.26);
      const baseMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#82c7ff'),
        metalness: 0.1,
        roughness: 0.55,
      });
      const sleeveMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#2563eb'),
        metalness: 0.05,
        roughness: 0.75,
      });

      const createHand = (side) => {
        const hand = new THREE.Group();
        const palm = new THREE.Mesh(handGeometry, baseMaterial.clone());
        palm.castShadow = true;
        palm.receiveShadow = true;
        palm.position.set(0, -0.1, 0);
        const sleeve = new THREE.Mesh(sleeveGeometry, sleeveMaterial.clone());
        sleeve.castShadow = false;
        sleeve.receiveShadow = true;
        sleeve.position.set(0, 0.2, 0);
        hand.add(sleeve);
        hand.add(palm);
        hand.position.set(side * 0.32, 0, 0);
        hand.rotation.z = side * -0.12;
        return { group: hand, palm, sleeve };
      };

      const left = createHand(-1);
      const right = createHand(1);
      this.handGroup.add(left.group);
      this.handGroup.add(right.group);
      this.camera.add(this.handGroup);
      this.handMaterials = [left.palm.material, right.palm.material, left.sleeve.material, right.sleeve.material];
      this.ensurePlayerArmsVisible();
    }

    markInteraction() {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.lastInteractionTimeMs = now;
      if (this.audio && typeof this.audio.resumeContextIfNeeded === 'function') {
        try {
          this.audio.resumeContextIfNeeded();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Audio context resume threw during interaction.', error);
          }
        }
      }
    }

    isSceneActive() {
      if (!this.started) {
        return false;
      }
      if (this.pointerLocked) {
        return true;
      }
      if (this.keys?.size) {
        return true;
      }
      if (this.touchLookPointerId !== null) {
        return true;
      }
      if (this.playerActionAnimation) {
        return true;
      }
      if (this.joystickPointerId !== null) {
        return true;
      }
      if (this.touchButtonStates) {
        if (this.touchButtonStates.up || this.touchButtonStates.down || this.touchButtonStates.left || this.touchButtonStates.right) {
          return true;
        }
      }
      if (this.cameraShakeIntensity > 0 && this.cameraShakeTime < this.cameraShakeDuration) {
        return true;
      }
      if (this.velocity?.lengthSq?.() > 0.0001) {
        return true;
      }
      if (Math.abs(this.verticalVelocity ?? 0) > 0.0001) {
        return true;
      }
      if (Array.isArray(this.zombies) && this.zombies.length > 0) {
        return true;
      }
      if (Array.isArray(this.golems) && this.golems.length > 0) {
        return true;
      }
      return false;
    }

    isRenderIdle() {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const idleSeconds = (now - (this.lastInteractionTimeMs ?? now)) / 1000;
      if (idleSeconds < this.renderIdleThresholdSeconds) {
        return false;
      }
      return !this.isSceneActive();
    }

    queueCharacterPreload() {
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      if (!scope) {
        if (this.started && !this.rendererUnavailable) {
          this.preloadCharacterModels();
        }
        return;
      }
      this.cancelQueuedModelPreload();
      const executePreload = () => {
        this.modelPreloadHandle = null;
        this.modelPreloadUsingIdle = false;
        if (!this.started || this.rendererUnavailable) {
          return;
        }
        this.preloadCharacterModels();
      };
      if (typeof scope.requestIdleCallback === 'function') {
        this.modelPreloadUsingIdle = true;
        this.modelPreloadHandle = scope.requestIdleCallback(executePreload, {
          timeout: Math.max(500, Math.min(4000, this.assetLoadBudgetMs || 1500)),
        });
        return;
      }
      if (typeof scope.setTimeout === 'function') {
        this.modelPreloadUsingIdle = false;
        this.modelPreloadHandle = scope.setTimeout(executePreload, 0);
        return;
      }
      executePreload();
    }

    cancelQueuedModelPreload() {
      this.cancelLazyModelWarmup();
      if (this.modelPreloadHandle === null) {
        this.modelPreloadUsingIdle = false;
        return;
      }
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      if (scope) {
        if (this.modelPreloadUsingIdle && typeof scope.cancelIdleCallback === 'function') {
          scope.cancelIdleCallback(this.modelPreloadHandle);
        } else if (typeof scope.clearTimeout === 'function') {
          scope.clearTimeout(this.modelPreloadHandle);
        }
      }
      this.modelPreloadHandle = null;
      this.modelPreloadUsingIdle = false;
    }

    cancelLazyModelWarmup() {
      if (this.lazyModelWarmupHandle !== null) {
        const scope =
          typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
        if (scope && typeof scope.clearTimeout === 'function') {
          scope.clearTimeout(this.lazyModelWarmupHandle);
        }
        this.lazyModelWarmupHandle = null;
      }
      this.lazyModelWarmupQueue = [];
    }

    preloadCharacterModels() {
      const eagerKeys = this.lazyAssetLoading ? [] : ['arm', 'steve', 'zombie', 'golem'];
      eagerKeys.forEach((key) => {
        if (!key) return;
        if (this.loadedModels.has(key) || this.modelPromises.has(key)) {
          return;
        }
        this.loadModel(key).catch((error) => {
          this.handleAssetLoadFailure(key, error);
        });
      });
      if (this.lazyAssetLoading) {
        this.enqueueLazyModelWarmup(['steve', 'arm', 'zombie', 'golem']);
      }
    }

    enqueueLazyModelWarmup(keys = []) {
      if (!Array.isArray(keys) || !keys.length) {
        return;
      }
      const pending = keys
        .map((key) => `${key || ''}`.trim())
        .filter((key) => key && !this.loadedModels.has(key) && !this.modelPromises.has(key));
      if (!pending.length) {
        return;
      }
      const merged = new Set(this.lazyModelWarmupQueue);
      pending.forEach((key) => merged.add(key));
      this.lazyModelWarmupQueue = Array.from(merged);
      this.scheduleLazyModelWarmup();
    }

    scheduleLazyModelWarmup() {
      if (!this.lazyModelWarmupQueue.length || this.lazyModelWarmupHandle !== null) {
        return;
      }
      const scope =
        typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      if (!scope || typeof scope.setTimeout !== 'function') {
        this.runLazyModelWarmup();
        return;
      }
      const delay = this.lazyAssetLoading
        ? Math.max(LAZY_ASSET_WARMUP_DELAY_MS, Math.round(this.renderIdleThresholdSeconds * 1000))
        : 0;
      this.lazyModelWarmupHandle = scope.setTimeout(() => {
        this.lazyModelWarmupHandle = null;
        this.runLazyModelWarmup();
      }, delay);
    }

    runLazyModelWarmup() {
      if (!this.lazyModelWarmupQueue.length) {
        return;
      }
      if (!this.started || this.rendererUnavailable) {
        this.lazyModelWarmupQueue = [];
        return;
      }
      if (this.lazyAssetLoading && !this.isRenderIdle()) {
        this.scheduleLazyModelWarmup();
        return;
      }
      const nextKey = this.lazyModelWarmupQueue.shift();
      if (!nextKey) {
        this.scheduleLazyModelWarmup();
        return;
      }
      if (this.loadedModels.has(nextKey) || this.modelPromises.has(nextKey)) {
        this.scheduleLazyModelWarmup();
        return;
      }
      this.loadModel(nextKey)
        .catch((error) => {
          this.handleAssetLoadFailure(nextKey, error);
        })
        .finally(() => {
          this.scheduleLazyModelWarmup();
        });
    }

    loadModel(key, overrideUrl) {
      const THREE = this.THREE;
      const url = overrideUrl ? resolveAssetUrl(overrideUrl) : MODEL_URLS[key];
      if (!url) {
        return Promise.reject(new Error(`No model URL configured for key "${key}".`));
      }
      if (this.loadedModels.has(key)) {
        return Promise.resolve(this.loadedModels.get(key));
      }
      if (this.modelPromises.has(key)) {
        return this.modelPromises.get(key);
      }
      this.beginAssetTimer('models', key);
      const attemptLoad = (attempt) => {
        const attemptNumber = Math.max(1, attempt || 1);
        this.assetRetryState.set(key, attemptNumber);
        return ensureGltfLoader(THREE)
          .then((LoaderClass) => {
            return new Promise((resolve, reject) => {
              try {
                const loader = new LoaderClass();
                loader.load(
                  url,
                  (gltf) => resolve(gltf),
                  undefined,
                  (error) => reject(error || new Error(`Failed to load GLTF: ${url}`)),
                );
              } catch (error) {
                reject(error);
              }
            });
          })
          .then((gltf) => {
            if (!gltf?.scene) {
              throw new Error(`Model at ${url} is missing a scene graph.`);
            }
            gltf.scene.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            return { scene: gltf.scene, animations: gltf.animations || [] };
          })
          .catch((error) => {
            if (attemptNumber < this.assetRetryLimit) {
              this.noteAssetRetry(key, attemptNumber, error, url);
              const delay = this.computeAssetRetryDelay(attemptNumber);
              return this.delay(delay).then(() => attemptLoad(attemptNumber + 1));
            }
            throw error;
          });
      };
      const promise = attemptLoad(1)
        .then((payload) => {
          const attemptsUsed = this.assetRetryState.get(key) || 1;
          this.assetRetryState.delete(key);
          this.completeAssetTimer('models', key, { success: true, url });
          this.loadedModels.set(key, payload);
          this.assetFailureCounts.delete(key);
          this.assetRecoveryPendingKeys.delete(key);
          this.clearAssetFailureNoticesForKey(key);
          if (attemptsUsed > 1) {
            this.emitGameEvent('asset-retry-success', {
              key,
              attempts: attemptsUsed,
              url,
            });
          }
          this.maybeHideAssetRecoveryPrompt();
          return payload;
        })
        .catch((error) => {
          const attemptsTried = this.assetRetryState.get(key) || this.assetRetryLimit;
          this.assetRetryState.delete(key);
          this.completeAssetTimer('models', key, { success: false, url });
          if (error && typeof error === 'object') {
            error.__assetFailureHandled = true;
          }
          console.warn(
            `Failed to load model "${key}" from ${url} after ${attemptsTried} attempt(s).`,
            error,
          );
          this.handleAssetLoadFailure(key, error);
          this.modelPromises.delete(key);
          throw error;
        });
      this.modelPromises.set(key, promise);
      return promise;
    }

    async cloneModelScene(key, overrideUrl) {
      try {
        const payload = await this.loadModel(key, overrideUrl);
        if (!payload?.scene) {
          return null;
        }
        const clone = payload.scene.clone(true);
        clone.traverse((child) => {
          if (child.isMesh) {
            if (Array.isArray(child.material)) {
              child.material = child.material.map((material) => (material?.clone ? material.clone() : material));
            } else if (child.material?.clone) {
              child.material = child.material.clone();
            }
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        return { scene: clone, animations: payload.animations };
      } catch (error) {
        if (!error || error.__assetFailureHandled !== true) {
          this.handleAssetLoadFailure(key, error);
        }
        return null;
      }
    }

    ensurePlayerAvatarPlaceholder(reason = 'loading') {
      const THREE = this.THREE;
      if (!THREE || !this.playerRig) {
        return null;
      }
      if (this.playerAvatar && !this.playerAvatar.userData?.placeholder) {
        return this.playerAvatar;
      }
      const reasonLabel = typeof reason === 'string' && reason.trim().length ? reason.trim() : 'loading';
      const severityOrder = { boot: 0, loading: 1, failed: 2 };
      const placeholderColor =
        reasonLabel === 'failed'
          ? 0xf97316
          : reasonLabel === 'boot'
            ? 0x22d3ee
            : 0x3b82f6;
      if (this.playerAvatar && this.playerAvatar.userData?.placeholder) {
        const currentReason = this.playerAvatar.userData.placeholderReason || 'loading';
        const currentSeverity = severityOrder[currentReason] ?? 0;
        const nextSeverity = severityOrder[reasonLabel] ?? 0;
        if (nextSeverity < currentSeverity) {
          return this.playerAvatar;
        }
        if (this.playerAvatar.material?.color) {
          this.playerAvatar.material.color.set(placeholderColor);
        }
        this.playerAvatar.userData.placeholderReason = reasonLabel;
        if (this.camera && this.camera.parent !== this.playerAvatar) {
          try {
            this.playerAvatar.add(this.camera);
            this.camera.position.copy(this.firstPersonCameraOffset);
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Unable to reparent camera to placeholder avatar.', error);
            }
          }
        }
        this.applyCameraPerspective(this.cameraPerspective);
        this.ensurePlayerArmsVisible();
        this.emitGameEvent('avatar-placeholder-activated', {
          key: 'steve',
          reason: reasonLabel,
        });
        return this.playerAvatar;
      }
      const material = new THREE.MeshStandardMaterial({ color: placeholderColor, metalness: 0.12, roughness: 0.58 });
      const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.4);
      const placeholder = new THREE.Mesh(geometry, material);
      placeholder.name = 'PlayerAvatarPlaceholder';
      placeholder.position.set(0, -PLAYER_EYE_HEIGHT, 0);
      placeholder.castShadow = true;
      placeholder.receiveShadow = true;
      placeholder.userData = placeholder.userData || {};
      placeholder.userData.placeholder = true;
      placeholder.userData.placeholderReason = reasonLabel;
      if (this.playerAvatar && this.playerRig?.remove) {
        try {
          this.playerRig.remove(this.playerAvatar);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Unable to remove previous avatar placeholder cleanly.', error);
          }
        }
      }
      this.playerRig.add(placeholder);
      this.playerAvatar = placeholder;
      this.playerHeadAttachment = placeholder;
      if (this.camera && placeholder && this.camera.parent !== placeholder) {
        try {
          placeholder.add(this.camera);
          this.camera.position.copy(this.firstPersonCameraOffset);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Unable to attach camera to avatar placeholder.', error);
          }
        }
      }
      this.applyCameraPerspective(this.cameraPerspective);
      this.ensurePlayerArmsVisible();
      this.emitGameEvent('avatar-placeholder-activated', {
        key: 'steve',
        reason: reasonLabel,
      });
      return placeholder;
    }

    async loadFirstPersonArms(sessionId = this.activeSessionId) {
      if (!this.handGroup) return;
      const currentSessionId = sessionId;
      let asset = null;
      try {
        asset = await this.cloneModelScene('arm');
      } catch (error) {
        asset = null;
        this.handleAssetLoadFailure('arm', error);
      }
      if (currentSessionId !== this.activeSessionId || !this.handGroup) {
        if (asset?.scene) {
          disposeObject3D(asset.scene);
        }
        return;
      }
      if (!asset?.scene) {
        this.ensurePlayerArmsVisible();
        this.handleAssetLoadFailure('arm', null, {
          fallbackMessage: 'First-person hands unavailable — showing simplified explorer overlay.',
        });
        return;
      }
      if (typeof this.handGroup.clear === 'function') {
        this.handGroup.clear();
      }
      const leftArm = asset.scene;
      leftArm.position.set(-0.32, -0.1, -0.58);
      leftArm.rotation.set(-0.32, 0.32, 0.12);
      let rightAsset = null;
      try {
        rightAsset = await this.cloneModelScene('arm');
      } catch (error) {
        rightAsset = null;
        this.handleAssetLoadFailure('arm', error);
      }
      if (currentSessionId !== this.activeSessionId || !this.handGroup) {
        disposeObject3D(leftArm);
        if (rightAsset?.scene) {
          disposeObject3D(rightAsset.scene);
        }
        return;
      }
      if (!rightAsset?.scene) {
        this.handGroup.add(leftArm);
        this.handMaterials = [];
        leftArm.traverse((child) => {
          if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
              this.handMaterials.push(...child.material.filter(Boolean));
            } else {
              this.handMaterials.push(child.material);
            }
          }
        });
        this.handMaterialsDynamic = false;
        this.handModelLoaded = true;
        this.ensurePlayerArmsVisible();
        this.handleAssetLoadFailure('arm', null, {
          fallbackMessage: 'First-person hands partially loaded — rendering single arm fallback.',
        });
        return;
      }
      const rightArm = rightAsset.scene;
      rightArm.position.set(0.32, -0.1, -0.58);
      rightArm.rotation.set(-0.32, -0.32, -0.12);
      rightArm.rotation.y = Math.PI;
      this.handGroup.add(leftArm);
      this.handGroup.add(rightArm);
      this.handMaterials = [];
      this.handGroup.traverse((child) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) {
            this.handMaterials.push(...child.material.filter(Boolean));
          } else {
            this.handMaterials.push(child.material);
          }
        }
      });
      this.handMaterialsDynamic = false;
      this.handModelLoaded = true;
      this.ensurePlayerArmsVisible();
    }

    async loadPlayerCharacter() {
      if (!this.playerRig) return;
      const THREE = this.THREE;
      const sessionId = this.activeSessionId;
      this.ensurePlayerAvatarPlaceholder('boot');
      let asset = null;
      try {
        asset = await this.cloneModelScene('steve');
      } catch (error) {
        console.warn('Failed to load Steve model.', error);
        asset = null;
      }
      if (sessionId !== this.activeSessionId) {
        if (asset?.scene) {
          disposeObject3D(asset.scene);
        }
        return;
      }
      if (!asset?.scene) {
        console.warn('Model load failed, using fallback cube');
        const fallback = this.ensurePlayerAvatarPlaceholder('failed');
        if (fallback) {
          console.error(
            'Avatar visibility fallback active — Steve forced visible without standard model. Inspect character load pipeline to restore the default avatar.',
          );
        }
        return;
      }
      if (this.playerAvatar) {
        this.playerRig.remove(this.playerAvatar);
        disposeObject3D(this.playerAvatar);
        this.playerAvatar = null;
      }
      const model = asset.scene;
      model.name = 'PlayerAvatar';
      model.position.set(0, -PLAYER_EYE_HEIGHT, 0);
      model.scale.setScalar(0.98);
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.playerRig.add(model);
      this.playerAvatar = model;

      const head = model.getObjectByName('HeadPivot') || model.getObjectByName('Head');
      this.playerHeadAttachment = head && head.isObject3D ? head : model;
      if (this.handGroup && this.handGroup.parent !== this.camera) {
        this.camera.add(this.handGroup);
      }

      this.applyCameraPerspective(this.cameraPerspective);

      if (this.playerMixer) {
        this.playerMixer.stopAllAction();
        this.playerMixer = null;
        this.playerIdleAction = null;
      }

      let clip = null;
      if (Array.isArray(asset.animations) && asset.animations.length) {
        clip = asset.animations.find((animation) => `${animation?.name ?? ''}`.toLowerCase().includes('idle')) || asset.animations[0];
      }
      this.playerMixer = new THREE.AnimationMixer(model);
      if (clip) {
        this.playerIdleAction = this.playerMixer.clipAction(clip);
      } else {
        const idleTrack = new THREE.NumberKeyframeTrack('.rotation[y]', [0, 1.5, 3], [0, 0.1, 0]);
        const bobTrack = new THREE.NumberKeyframeTrack(
          '.position[y]',
          [0, 1.5, 3],
          [-PLAYER_EYE_HEIGHT, -PLAYER_EYE_HEIGHT + 0.05, -PLAYER_EYE_HEIGHT],
        );
        const proceduralClip = new THREE.AnimationClip('ProceduralIdle', 3, [idleTrack, bobTrack]);
        this.playerIdleAction = this.playerMixer.clipAction(proceduralClip);
      }
      if (this.playerIdleAction) {
        this.playerIdleAction.loop = THREE.LoopRepeat;
        this.playerIdleAction.play();
      }
      console.error(
        'Avatar visibility confirmed — verify animation rig initialises correctly if the player appears static.',
      );
      this.ensurePlayerArmsVisible();
    }

    upgradeZombie(zombie) {
      this.cloneModelScene('zombie')
        .then((asset) => {
          if (!asset?.scene || !this.zombieGroup) return;
          if (!this.zombies.includes(zombie)) return;
          const placeholder = zombie.mesh;
          const model = asset.scene;
          model.name = `ZombieModel-${zombie.id}`;
          model.position.copy(placeholder.position);
          model.rotation.copy(placeholder.rotation);
          model.scale.setScalar(0.95);
          this.zombieGroup.add(model);
          this.zombieGroup.remove(placeholder);
          disposeObject3D(placeholder);
          zombie.mesh = model;
          zombie.placeholder = false;
        })
        .catch((error) => {
          console.warn('Failed to upgrade zombie model', error);
        });
    }

    upgradeGolem(golem) {
      this.cloneModelScene('golem')
        .then((asset) => {
          if (!asset?.scene || !this.golemGroup) return;
          if (!this.golems.includes(golem)) return;
          const placeholder = golem.mesh;
          const model = asset.scene;
          model.name = `GolemModel-${golem.id ?? 'actor'}`;
          model.position.copy(placeholder.position);
          model.rotation.copy(placeholder.rotation);
          model.scale.setScalar(1.1);
          this.golemGroup.add(model);
          this.golemGroup.remove(placeholder);
          disposeObject3D(placeholder);
          golem.mesh = model;
          golem.placeholder = false;
        })
        .catch((error) => {
          console.warn('Failed to upgrade golem model', error);
        });
    }

    applyDimensionSettings(index) {
      const themeCount = DIMENSION_THEME.length;
      const safeIndex = ((index % themeCount) + themeCount) % themeCount;
      this.currentDimensionIndex = safeIndex;
      const theme = DIMENSION_THEME[safeIndex] ?? DIMENSION_THEME[0];
      this.dimensionSettings = theme;
      this.currentSpeed = PLAYER_BASE_SPEED * (theme.speedMultiplier ?? 1);
      this.gravityScale = theme.gravity ?? 1;
      this.netheriteChallengePlanned = theme.id === 'netherite';
      if (!this.netheriteChallengePlanned) {
        this.resetNetheriteChallenge();
      }

      const { palette } = theme;
      if (palette?.grass) this.materials.grass.color.set(palette.grass);
      if (palette?.dirt) this.materials.dirt.color.set(palette.dirt);
      if (palette?.stone) this.materials.stone.color.set(palette.stone);
      if (palette?.rails) this.materials.rails.color.set(palette.rails);
      if (palette?.dirt) {
        this.dayGroundColor.set(palette.dirt);
        this.nightGroundColor.copy(this.dayGroundColor).offsetHSL(-0.05, -0.12, -0.35);
      }
      if (palette?.rails) {
        this.materials.portal.uniforms.uColorA.value.set(palette.rails);
      }
      if (palette?.grass) {
        this.materials.portal.uniforms.uColorB.value.set(palette.grass);
      }
      if (this.handMaterialsDynamic && this.handMaterials.length) {
        const palmColor = palette?.grass || '#82c7ff';
        const sleeveColor = palette?.rails || '#2563eb';
        this.handMaterials.forEach((material, index) => {
          if (!material?.color) return;
          if (index <= 1) {
            material.color.set(palmColor);
          } else {
            material.color.set(sleeveColor);
          }
        });
      }
      if (this.scene?.background && theme.sky) {
        this.scene.background.set(theme.sky);
      }
      if (this.scene?.fog && theme.fog) {
        this.scene.fog.color.set(theme.fog);
      }
      if (theme.sky) {
        this.daySkyColor.set(theme.sky);
        this.nightSkyColor.copy(this.daySkyColor).offsetHSL(-0.02, -0.12, -0.45);
        this.duskSkyColor.copy(this.daySkyColor).offsetHSL(0.06, 0.08, -0.18);
      }
      if (theme.fog) {
        this.dayFogColor.set(theme.fog);
        this.nightFogColor.copy(this.dayFogColor).offsetHSL(-0.04, -0.1, -0.32);
      }
      if (this.hemiLight && theme.hemi) {
        this.hemiLight.color.set(theme.hemi);
      }
      if (this.sunLight && theme.sun) {
        this.sunLight.color.set(theme.sun);
        this.daySunColor.set(theme.sun);
      }
      if (this.moonLight) {
        this.nightMoonColor.copy(this.daySkyColor).offsetHSL(0.12, -0.05, -0.35);
        this.moonLight.color.copy(this.nightMoonColor);
      }
      this.updateDayNightCycle();
      this.updateDimensionInfoPanel();
      console.error(
        `Dimension activation notice — ${theme.name} assets should now be visible. If the environment loads empty, confirm theme registration and manifest entries for this dimension.`,
      );
    }

    buildTerrain() {
      const THREE = this.THREE;
      this.clearChests();
      this.columns.clear();
      this.heightMap = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
      this.initialHeightMap = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
      const existingChunks = Array.from(this.terrainGroup.children);
      existingChunks.forEach((child) => {
        this.terrainGroup.remove(child);
        disposeObject3D(child);
      });
      this.terrainChunkGroups = [];
      this.terrainChunkMap.clear();
      this.dirtyTerrainChunks.clear();
      this.lastCullingCameraValid = false;
      const half = WORLD_SIZE / 2;
      const totalColumns = WORLD_SIZE * WORLD_SIZE;
      const minColumnHeight = Math.max(1, Math.floor(this.minColumnHeight ?? MIN_COLUMN_HEIGHT));
      const maxColumnHeight = Math.max(minColumnHeight, Math.floor(this.maxColumnHeight ?? MAX_COLUMN_HEIGHT));
      const targetBudget = Number.isFinite(this.maxTerrainVoxels)
        ? Math.max(0, Math.floor(this.maxTerrainVoxels))
        : DEFAULT_TERRAIN_VOXEL_CAP;
      const maxTerrainCap = Math.min(MAX_TERRAIN_VOXELS, DEFAULT_TERRAIN_VOXEL_CAP);
      const safeBudget = Math.max(totalColumns * minColumnHeight, Math.min(targetBudget, maxTerrainCap));
      const voxelBudget = Math.min(maxTerrainCap, safeBudget);
      let remainingVoxels = voxelBudget;
      let cappedColumns = 0;
      let voxelCount = 0;
      for (let gx = 0; gx < WORLD_SIZE; gx += 1) {
        for (let gz = 0; gz < WORLD_SIZE; gz += 1) {
          const offsetX = gx - half;
          const offsetZ = gz - half;
          const worldX = offsetX * BLOCK_SIZE;
          const worldZ = offsetZ * BLOCK_SIZE;
          const distance = Math.hypot(offsetX, offsetZ);
          const falloff = Math.max(0, 1 - distance / (WORLD_SIZE * 0.68));
          const heightNoise = pseudoRandom(gx * 0.35, gz * 0.35);
          const secondary = pseudoRandom(gz * 0.12, gx * 0.18);
          const columnIndex = gx * WORLD_SIZE + gz;
          const desiredHeight = Math.max(
            minColumnHeight,
            Math.round(1 + falloff * 2.6 + heightNoise * 2 + secondary * 0.9),
          );
          const cappedHeight = Math.min(desiredHeight, maxColumnHeight);
          const columnsRemaining = totalColumns - columnIndex - 1;
          const reservedForRemaining = Math.max(0, columnsRemaining * minColumnHeight);
          const budgetForColumn = Math.max(minColumnHeight, remainingVoxels - reservedForRemaining);
          let columnHeight = Math.min(cappedHeight, maxColumnHeight, budgetForColumn, remainingVoxels);
          if (columnHeight < minColumnHeight) {
            columnHeight = Math.min(minColumnHeight, remainingVoxels);
          }
          if (columnHeight < desiredHeight) {
            cappedColumns += 1;
          }
          remainingVoxels = Math.max(0, remainingVoxels - columnHeight);
          this.heightMap[gx][gz] = columnHeight;
          this.initialHeightMap[gx][gz] = columnHeight;
          const columnKey = `${gx}|${gz}`;
          const column = [];
          for (let level = 0; level < columnHeight; level += 1) {
            const isSurface = level === columnHeight - 1;
            const blockType = isSurface
              ? 'grass-block'
              : level > columnHeight - 3
                ? 'dirt'
                : 'stone';
            const material =
              blockType === 'grass-block'
                ? this.materials.grass
                : blockType === 'dirt'
                  ? this.materials.dirt
                  : this.materials.stone;
          const mesh = new THREE.Mesh(this.blockGeometry, material);
          mesh.castShadow = isSurface;
          mesh.receiveShadow = true;
          mesh.position.set(worldX, level * BLOCK_SIZE + BLOCK_SIZE / 2, worldZ);
          mesh.visible = true;
          mesh.userData = {
            columnKey,
            level,
            gx,
            gz,
              blockType,
              chunkKey: this.getTerrainChunkKey(gx, gz),
            };
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            const chunk = this.ensureTerrainChunk(mesh.userData.chunkKey);
            chunk.add(mesh);
            column.push(mesh);
            voxelCount += 1;
          }
          this.columns.set(columnKey, column);
        }
      }
      this.terrainChunkGroups.forEach((chunk) => {
        this.recalculateTerrainChunkBounds(chunk);
      });
      this.terrainCullingAccumulator = this.terrainCullingInterval;
      const voxelsUsed = voxelBudget - remainingVoxels;
      this.terrainVoxelBudget = voxelBudget;
      this.terrainVoxelUsage = voxelsUsed;
      if (typeof console !== 'undefined') {
        const columnCount = WORLD_SIZE * WORLD_SIZE;
        const chunkCount = Array.isArray(this.terrainChunkGroups)
          ? this.terrainChunkGroups.length
          : 0;
        console.error(
          `World generation summary — ${columnCount} columns created. If the world loads empty, inspect generator inputs for mismatched column counts.`,
        );
        console.error(
          `Terrain block placement summary — ${voxelCount} blocks placed. For missing terrain, review the heightmap generator and chunk hydration routines.`,
        );
        console.error(
          `Terrain chunk population summary — ${chunkCount} chunks loaded. Investigate the streaming manager if this number stalls unexpectedly.`,
        );
        if (chunkCount <= 0 || voxelCount <= 0) {
          console.warn('Terrain generation produced no active chunk groups or voxels.', {
            chunkCount,
            voxelCount,
            voxelBudget,
          });
        }
        if (cappedColumns > 0) {
          console.info(
            `Terrain voxel budget applied: ${cappedColumns} columns trimmed to stay under ${voxelBudget} voxels`,
          );
        }
        if (voxelBudget < MAX_TERRAIN_VOXELS || remainingVoxels === 0) {
          console.info(`Terrain voxel cap enforced at ${voxelsUsed}/${voxelBudget} blocks.`);
        }
      }
      this.portalAnchorGrid = this.computePortalAnchorGrid();
      const anchorWorldX = (this.portalAnchorGrid.x - WORLD_SIZE / 2) * BLOCK_SIZE;
      const anchorWorldZ = (this.portalAnchorGrid.z - WORLD_SIZE / 2) * BLOCK_SIZE;
      if (this.portalAnchor?.set) {
        this.portalAnchor.set(anchorWorldX, 0, anchorWorldZ);
      }
    }

    detectChunkDebugFlag() {
      if (typeof window === 'undefined') {
        return false;
      }
      try {
        const params = new URLSearchParams(window.location.search || '');
        return params.get('debugChunks') === '1';
      } catch (error) {
        console.debug('Unable to parse chunk debug flag.', error);
        return false;
      }
    }

    getTerrainChunkKey(gx, gz) {
      const size = this.terrainChunkSize;
      const chunkX = Math.floor(gx / size);
      const chunkZ = Math.floor(gz / size);
      return `${chunkX}|${chunkZ}`;
    }

    ensureTerrainChunk(chunkKey) {
      let chunk = this.terrainChunkMap.get(chunkKey);
      if (chunk) {
        return chunk;
      }
      const THREE = this.THREE;
      const [chunkXRaw, chunkZRaw] = chunkKey.split('|');
      const chunkX = Number.parseInt(chunkXRaw ?? '0', 10) || 0;
      const chunkZ = Number.parseInt(chunkZRaw ?? '0', 10) || 0;
      chunk = new THREE.Group();
      chunk.name = `TerrainChunk-${chunkX}-${chunkZ}`;
      chunk.visible = true;
      chunk.userData = {
        chunkX,
        chunkZ,
        minY: 0,
        maxY: BLOCK_SIZE,
        boundingSphere: new THREE.Sphere(new THREE.Vector3(), BLOCK_SIZE),
      };
      this.terrainChunkMap.set(chunkKey, chunk);
      this.terrainChunkGroups.push(chunk);
      this.terrainGroup.add(chunk);
      return chunk;
    }

    recalculateTerrainChunkBounds(chunk) {
      if (!chunk) return;
      const data = chunk.userData || {};
      let minY = Infinity;
      let maxY = -Infinity;
      for (const child of chunk.children) {
        if (!child?.position) continue;
        const y = child.position.y;
        const childMin = y - BLOCK_SIZE / 2;
        const childMax = y + BLOCK_SIZE / 2;
        if (childMin < minY) minY = childMin;
        if (childMax > maxY) maxY = childMax;
      }
      if (!Number.isFinite(minY)) {
        minY = 0;
        maxY = BLOCK_SIZE;
        chunk.visible = false;
      } else {
        chunk.visible = true;
      }
      data.minY = minY;
      data.maxY = maxY;
      const size = this.terrainChunkSize;
      const halfWorld = WORLD_SIZE / 2;
      const startX = data.chunkX * size;
      const startZ = data.chunkZ * size;
      const centerOffsetX = startX - halfWorld + (size - 1) / 2;
      const centerOffsetZ = startZ - halfWorld + (size - 1) / 2;
      const centerX = centerOffsetX * BLOCK_SIZE;
      const centerZ = centerOffsetZ * BLOCK_SIZE;
      const centerY = (minY + maxY) / 2;
      const horizontalExtent = (size * BLOCK_SIZE) / 2;
      const verticalExtent = Math.max(BLOCK_SIZE * 0.5, (maxY - minY) / 2 + BLOCK_SIZE * 0.5);
      const radius = Math.sqrt(horizontalExtent * horizontalExtent * 2 + verticalExtent * verticalExtent);
      if (!data.boundingSphere) {
        data.boundingSphere = new this.THREE.Sphere(new this.THREE.Vector3(centerX, centerY, centerZ), radius);
      } else {
        data.boundingSphere.center.set(centerX, centerY, centerZ);
        data.boundingSphere.radius = radius;
      }
      chunk.userData = data;
    }

    markTerrainChunkDirty(chunkKey) {
      if (!chunkKey || !this.terrainChunkMap.has(chunkKey)) return;
      this.dirtyTerrainChunks.add(chunkKey);
    }

    refreshDirtyTerrainChunks() {
      if (!this.dirtyTerrainChunks.size) return;
      for (const key of this.dirtyTerrainChunks) {
        const chunk = this.terrainChunkMap.get(key);
        if (!chunk) continue;
        this.recalculateTerrainChunkBounds(chunk);
      }
      this.dirtyTerrainChunks.clear();
    }

    buildRails() {
      const THREE = this.THREE;
      this.railsGroup.clear();
      this.railSegments = [];
      const segments = 22;
      const radius = WORLD_SIZE * 0.18;
      for (let i = 0; i < segments; i += 1) {
        const t = i / (segments - 1);
        const angle = (t - 0.5) * Math.PI * 0.45;
        const x = Math.sin(angle) * radius;
        const z = -t * WORLD_SIZE * 0.65;
        const ground = this.sampleGroundHeight(x, z);
        const mesh = new THREE.Mesh(this.railGeometry, this.materials.rails);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.position.set(x, ground + 0.1, z);
        mesh.rotation.y = angle * 0.6;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.visible = true;
        mesh.scale.set(1, 1, 1);
        mesh.userData = {
          type: 'rail-segment',
          baseY: mesh.position.y,
          collapseState: 'intact',
          collapseTimer: 0,
          collapseDuration: 2.6,
          baseMatrixAutoUpdate: false,
        };
        this.railsGroup.add(mesh);
        this.railSegments.push(mesh);
      }
    }

    evaluateBossChallenge() {
      if (this.victoryAchieved) {
        this.resetNetheriteChallenge();
        return;
      }
      if (this.netheriteChallengePlanned && this.railSegments.length) {
        if (!this.netheriteChallengeActive) {
          this.startNetheriteChallenge();
        }
      } else if (!this.netheriteChallengePlanned) {
        this.resetNetheriteChallenge();
      }
    }

    resetNetheriteChallenge() {
      this.netheriteChallengeActive = false;
      this.netheriteChallengeTimer = 0;
      this.netheriteNextCollapse = 0;
      this.netheriteCollapseIndex = 0;
      this.netheriteCountdownDisplay = Infinity;
      this.netheriteFailureAnnounced = false;
      this.crumblingRails = [];
      if (Array.isArray(this.railSegments)) {
        this.railSegments.forEach((segment) => {
          if (!segment) return;
          if (segment.userData) {
            segment.userData.collapseState = 'intact';
            segment.userData.collapseTimer = 0;
          }
          if (segment.scale?.set) {
            segment.scale.set(1, 1, 1);
          }
          if (segment.position && segment.userData && Number.isFinite(segment.userData.baseY)) {
            segment.position.y = segment.userData.baseY;
          }
          if (segment.updateMatrix) {
            segment.updateMatrix();
          }
          segment.visible = true;
          segment.matrixAutoUpdate = false;
        });
      }
      if (this.eternalIngot?.mesh) {
        this.challengeGroup?.remove(this.eternalIngot.mesh);
        disposeObject3D(this.eternalIngot.mesh);
      }
      if (this.eternalIngot?.light) {
        this.challengeGroup?.remove(this.eternalIngot.light);
      }
      this.eternalIngot = null;
      this.eternalIngotSpin = 0;
      if (this.started) {
        this.updatePortalProgress();
        this.updateDimensionInfoPanel();
      }
    }

    startNetheriteChallenge() {
      if (!this.netheriteChallengePlanned || this.victoryAchieved) {
        return;
      }
      if (!Array.isArray(this.railSegments) || !this.railSegments.length) {
        this.netheriteChallengeActive = false;
        return;
      }
      this.resetNetheriteChallenge();
      this.netheriteChallengeActive = true;
      this.netheriteChallengeTimer = 0;
      this.netheriteCollapseIndex = 0;
      this.netheriteNextCollapse = 6;
      this.netheriteCountdownSeconds = 45;
      this.netheriteCountdownDisplay = Infinity;
      this.netheriteFailureAnnounced = false;
      if (!this.victoryAchieved) {
        this.eternalIngotCollected = false;
      }
      this.spawnEternalIngot();
      this.showHint('Rails destabilising — reach the Eternal Ingot!');
      this.scheduleScoreSync('netherite-challenge');
      if (this.started) {
        this.updatePortalProgress();
        this.updateDimensionInfoPanel();
      }
    }

    spawnEternalIngot() {
      const THREE = this.THREE;
      if (!THREE || !this.challengeGroup) return;
      if (this.eternalIngot?.mesh) {
        this.challengeGroup.remove(this.eternalIngot.mesh);
        disposeObject3D(this.eternalIngot.mesh);
      }
      if (this.eternalIngot?.light) {
        this.challengeGroup.remove(this.eternalIngot.light);
      }
      const anchor = this.railSegments?.[this.railSegments.length - 1] || null;
      const base = anchor?.position?.clone?.() || new THREE.Vector3(0, 0, -WORLD_SIZE * 0.55);
      if (!anchor) {
        base.y = this.sampleGroundHeight(base.x, base.z) + 0.1;
      }
      const mesh = new THREE.Mesh(
        CRYSTAL_GEOMETRY,
        new THREE.MeshStandardMaterial({
          color: '#ffbf5f',
          emissive: '#ff8a3d',
          emissiveIntensity: 0.9,
          metalness: 0.35,
          roughness: 0.3,
        }),
      );
      mesh.name = 'EternalIngot';
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.position.copy(base);
      mesh.position.y = (anchor?.userData?.baseY ?? base.y) + 1.6;
      this.eternalIngotBaseY = mesh.position.y;
      this.challengeGroup.add(mesh);
      let light = null;
      if (typeof THREE.PointLight === 'function') {
        light = new THREE.PointLight(0xffa94d, 1.1, 12, 1.6);
        light.position.copy(mesh.position);
        this.challengeGroup.add(light);
      }
      this.eternalIngot = { mesh, light };
      this.eternalIngotSpin = 0;
    }

    triggerRailCollapse(segment) {
      if (!segment || !segment.userData) return;
      if (segment.userData.collapseState === 'crumbling' || segment.userData.collapseState === 'collapsed') {
        return;
      }
      segment.userData.collapseState = 'crumbling';
      segment.userData.collapseTimer = 0;
      segment.userData.collapseDuration = 2.4;
      segment.userData.baseMatrixAutoUpdate = segment.matrixAutoUpdate;
      segment.matrixAutoUpdate = true;
      if (!this.crumblingRails.includes(segment)) {
        this.crumblingRails.push(segment);
      }
    }

    updateRailCollapseAnimations(delta) {
      if (!this.crumblingRails.length) return;
      const THREE = this.THREE;
      const remaining = [];
      for (const segment of this.crumblingRails) {
        const data = segment.userData || {};
        data.collapseTimer = (data.collapseTimer || 0) + delta;
        const duration = Math.max(0.1, data.collapseDuration || 2.4);
        const rawProgress = Math.min(1, data.collapseTimer / duration);
        const eased = THREE.MathUtils.smootherstep
          ? THREE.MathUtils.smootherstep(0, 1, rawProgress)
          : rawProgress * rawProgress * (3 - 2 * rawProgress);
        const scale = Math.max(0.05, 1 - eased);
        if (segment.scale?.setScalar) {
          segment.scale.setScalar(scale);
        }
        if (Number.isFinite(data.baseY)) {
          segment.position.y = data.baseY - eased * 1.8;
        }
        if (segment.updateMatrix) {
          segment.updateMatrix();
        }
        if (rawProgress >= 1) {
          segment.visible = false;
          segment.matrixAutoUpdate = data.baseMatrixAutoUpdate ?? false;
          if (segment.scale?.set) {
            segment.scale.set(1, 1, 1);
          }
          data.collapseState = 'collapsed';
        } else {
          remaining.push(segment);
        }
      }
      this.crumblingRails = remaining;
    }

    updateEternalIngot(delta) {
      if (!this.eternalIngot?.mesh) return;
      const mesh = this.eternalIngot.mesh;
      this.eternalIngotSpin += delta;
      mesh.rotation.y += delta * 2.4;
      const bob = Math.sin(this.eternalIngotSpin * 3) * 0.18;
      mesh.position.y = this.eternalIngotBaseY + bob;
      if (this.eternalIngot.light) {
        this.eternalIngot.light.position.copy(mesh.position);
        this.eternalIngot.light.intensity = 1 + Math.sin(this.eternalIngotSpin * 5) * 0.25;
      }
      const playerPosition = this.getCameraWorldPosition(this.tmpVector3);
      if (playerPosition.distanceTo(mesh.position) < 1.4) {
        this.collectEternalIngot();
      }
    }

    updateNetheriteChallenge(delta) {
      if (!this.netheriteChallengeActive) return;
      this.netheriteChallengeTimer += delta;
      this.updateRailCollapseAnimations(delta);
      this.updateEternalIngot(delta);
      if (!this.eternalIngotCollected && this.netheriteChallengeTimer >= this.netheriteNextCollapse) {
        const candidates = this.railSegments.filter((segment) => segment?.userData?.collapseState === 'intact');
        if (candidates.length) {
          const targetIndex = Math.max(0, candidates.length - 1 - this.netheriteCollapseIndex);
          const target = candidates[targetIndex] || candidates[candidates.length - 1];
          this.triggerRailCollapse(target);
          this.netheriteCollapseIndex += 1;
        }
        this.netheriteNextCollapse += this.netheriteCollapseInterval;
      }
      const remaining = Math.max(0, this.netheriteCountdownSeconds - this.netheriteChallengeTimer);
      const seconds = Math.ceil(remaining);
      if (seconds !== this.netheriteCountdownDisplay) {
        this.netheriteCountdownDisplay = seconds;
        this.updatePortalProgress();
        this.updateDimensionInfoPanel();
      }
      if (remaining <= 0 && !this.netheriteFailureAnnounced && !this.eternalIngotCollected) {
        this.netheriteFailureAnnounced = true;
        this.handleNetheriteFailure();
      }
    }

    collectEternalIngot() {
      if (this.eternalIngotCollected) return;
      this.eternalIngotCollected = true;
      if (this.eternalIngot?.mesh) {
        this.challengeGroup?.remove(this.eternalIngot.mesh);
        disposeObject3D(this.eternalIngot.mesh);
      }
      if (this.eternalIngot?.light) {
        this.challengeGroup?.remove(this.eternalIngot.light);
      }
      this.eternalIngot = null;
      this.netheriteChallengeActive = false;
      this.showHint('Eternal Ingot secured! Portal stabilising…');
      this.collectDrops([{ item: 'eternal-ingot', quantity: 1 }]);
      this.score += 12;
      this.addScoreBreakdown('dimensions', 12);
      this.updateHud();
      this.scheduleScoreSync('eternal-ingot');
      this.triggerVictory();
    }

    handleNetheriteFailure() {
      this.showHint('The Netherite rails collapsed! Respawning…');
      this.scheduleScoreSync('netherite-collapse');
      this.resetNetheriteChallenge();
      this.handleDefeat();
      this.buildRails();
      this.spawnDimensionChests();
      this.refreshPortalState();
      this.evaluateBossChallenge();
    }

    getChestLootForDimension(dimensionId, index) {
      const normalizedId = typeof dimensionId === 'string' ? dimensionId : 'origin';
      const tables = DIMENSION_LOOT_TABLES[normalizedId] || DIMENSION_LOOT_TABLES.origin || [];
      if (!tables.length) {
        return { items: [], score: 0, message: '' };
      }
      const safeIndex = ((index % tables.length) + tables.length) % tables.length;
      const entry = tables[safeIndex];
      return {
        items: Array.isArray(entry.items)
          ? entry.items.map((item) => ({ item: item.item, quantity: item.quantity }))
          : [],
        score: Number.isFinite(entry.score) ? entry.score : 0,
        message: entry.message || '',
      };
    }

    createChestMesh(theme) {
      const THREE = this.THREE;
      const palette = theme?.palette ?? {};
      const baseColor = palette.dirt || '#a66a33';
      const accentColor = palette.rails || '#f5b041';
      const group = new THREE.Group();
      const baseMaterial = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.72,
        metalness: 0.18,
      });
      const trimMaterial = new THREE.MeshStandardMaterial({
        color: accentColor,
        roughness: 0.4,
        metalness: 0.68,
        emissive: new THREE.Color(accentColor),
        emissiveIntensity: 0.18,
      });
      const lockMaterial = trimMaterial.clone();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), baseMaterial);
      body.castShadow = true;
      body.receiveShadow = true;
      body.position.y = 0.25;
      group.add(body);
      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.5, -0.3);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.6), baseMaterial.clone());
      lid.position.set(0, 0, 0.3);
      lid.castShadow = true;
      lid.receiveShadow = true;
      lidPivot.add(lid);
      group.add(lidPivot);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.12), trimMaterial);
      band.position.set(0, 0.32, 0);
      band.castShadow = true;
      band.receiveShadow = true;
      group.add(band);
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.05), lockMaterial);
      lock.position.set(0, 0.32, 0.33);
      lock.castShadow = true;
      lock.receiveShadow = true;
      group.add(lock);
      group.userData = {
        lid,
        lidPivot,
        highlightMaterials: [trimMaterial, lockMaterial],
      };
      return group;
    }

    spawnDimensionChests() {
      const chestGroup = this.ensureEntityGroup('chest');
      if (!chestGroup) return;
      this.clearChests();
      const theme = this.dimensionSettings || DIMENSION_THEME[0];
      const chestCount = CHEST_COUNT_PER_DIMENSION;
      const seedBase = (this.currentDimensionIndex + 1) * 97;
      this.chestPulseTime = 0;
      for (let i = 0; i < chestCount; i += 1) {
        const randAngle = pseudoRandom(seedBase + i * 11.37, seedBase - i * 5.29);
        const randRadius = pseudoRandom(seedBase * 0.41 + i * 3.17, seedBase * 0.77 - i * 2.61);
        const angle = randAngle * Math.PI * 2;
        const radius = Math.max(4, WORLD_SIZE * 0.18 * (0.65 + randRadius * 0.35));
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const ground = this.sampleGroundHeight(x, z);
        const mesh = this.createChestMesh(theme);
        mesh.position.set(x, ground + 0.35, z);
        mesh.name = `LootChest-${theme?.id || 'dimension'}-${i}`;
        chestGroup.add(mesh);
        const loot = this.getChestLootForDimension(theme?.id || 'origin', i);
        const chest = {
          id: `${theme?.id || 'dimension'}-${i}-${Date.now()}`,
          mesh,
          lidPivot: mesh.userData?.lidPivot ?? null,
          lid: mesh.userData?.lid ?? null,
          highlightMaterials: mesh.userData?.highlightMaterials ?? [],
          baseY: mesh.position.y,
          opened: false,
          openProgress: 0,
          loot,
          pulseOffset: randAngle * Math.PI * 2,
          glowLevel: 0.25,
          hintShown: false,
        };
        this.chests.push(chest);
      }
      this.lastChestHintAt = this.elapsed;
    }

    clearChests() {
      if (this.chestGroup) {
        const children = Array.from(this.chestGroup.children);
        children.forEach((child) => {
          this.chestGroup.remove(child);
          disposeObject3D(child);
        });
      }
      this.chests = [];
      this.activeChestId = null;
    }

    findInteractableChest(range = CHEST_INTERACT_RANGE) {
      if (!this.chests.length) return null;
      const playerPosition = this.getCameraWorldPosition(this.tmpVector3);
      let best = null;
      let bestDistance = range;
      for (const chest of this.chests) {
        if (!chest || chest.opened || !chest.mesh) continue;
        const distance = chest.mesh.position.distanceTo(playerPosition);
        if (!Number.isFinite(distance)) continue;
        if (distance <= bestDistance) {
          bestDistance = distance;
          best = chest;
        }
      }
      return best;
    }

    tryOpenNearbyChest() {
      const chest = this.findInteractableChest();
      if (!chest) {
        return false;
      }
      this.openChest(chest);
      return true;
    }

    openChest(chest) {
      if (!chest || chest.opened) return;
      chest.opened = true;
      chest.openProgress = Math.max(chest.openProgress ?? 0, 0.01);
      const loot = chest.loot || { items: [], score: 0, message: '' };
      if (Array.isArray(loot.items) && loot.items.length) {
        this.collectDrops(loot.items);
      }
      if (Number.isFinite(loot.score) && loot.score !== 0) {
        this.addScoreBreakdown('loot', loot.score);
        this.score += loot.score;
      }
      this.updateHud();
      this.scheduleScoreSync('loot-chest');
      if (loot.message) {
        this.showHint(loot.message);
      }
      this.audio.play('craftChime', { volume: 0.68 });
      this.lastChestHintAt = this.elapsed;
      console.error(
        `Loot chest interaction flagged — ${chest.id}. If rewards are missing, review the chest configuration and loot tables for this encounter.`,
      );
    }

    updateLootChests(delta) {
      if (!this.chests.length) return;
      const THREE = this.THREE;
      this.chestPulseTime += delta;
      const playerPosition = this.getCameraWorldPosition(this.tmpVector3);
      let nearest = null;
      let nearestDistance = Infinity;
      for (const chest of this.chests) {
        if (!chest?.mesh) continue;
        const mesh = chest.mesh;
        if (!Number.isFinite(chest.baseY)) {
          chest.baseY = mesh.position.y;
        }
        const floatOffset = Math.sin(this.chestPulseTime * 2 + (chest.pulseOffset || 0)) * 0.05;
        mesh.position.y = chest.baseY + Math.max(0, floatOffset);
        if (chest.lidPivot) {
          const target = chest.opened ? 1 : 0;
          const speed = chest.opened ? 3.2 : 4.5;
          chest.openProgress = THREE.MathUtils.lerp(chest.openProgress ?? 0, target, delta * speed);
          const eased = chest.openProgress * chest.openProgress;
          chest.lidPivot.rotation.x = -Math.PI * 0.6 * eased;
        }
        const distance = mesh.position.distanceTo(playerPosition);
        if (!chest.opened && distance < nearestDistance) {
          nearest = chest;
          nearestDistance = distance;
        }
        let targetGlow = chest.opened ? 0.15 : 0.35;
        if (!chest.opened && distance <= CHEST_INTERACT_RANGE + 0.6) {
          targetGlow = 1.05;
          if (
            distance <= CHEST_INTERACT_RANGE &&
            !chest.hintShown &&
            this.elapsed - this.lastChestHintAt > CHEST_HINT_COOLDOWN
          ) {
            const interactSentence = formatKeyListForSentence(this.getActionKeyLabels('interact', { limit: 3 }));
            const chestHint = interactSentence
              ? `Press ${interactSentence} to open the loot chest.`
              : 'Use your interact control to open the loot chest.';
            this.showHint(chestHint);
            chest.hintShown = true;
            this.lastChestHintAt = this.elapsed;
          }
        }
        chest.glowLevel = THREE.MathUtils.lerp(chest.glowLevel ?? 0.25, targetGlow, delta * 4.5);
        if (Array.isArray(chest.highlightMaterials)) {
          chest.highlightMaterials.forEach((material) => {
            if (material?.emissiveIntensity !== undefined) {
              material.emissiveIntensity = chest.glowLevel * 0.45;
            }
          });
        }
      }
      this.activeChestId = nearest?.id ?? null;
    }

    computePortalAnchorGrid() {
      const half = WORLD_SIZE / 2;
      const clampIndex = (value) => Math.max(0, Math.min(WORLD_SIZE - 1, value));
      const xIndex = clampIndex(Math.round((this.portalAnchor?.x ?? 0) / BLOCK_SIZE + half));
      const zIndex = clampIndex(Math.round((this.portalAnchor?.z ?? 0) / BLOCK_SIZE + half));
      return { x: xIndex, z: zIndex };
    }

    createPortalFrameLayout() {
      const layout = [];
      for (let x = -1; x <= 1; x += 1) {
        for (let y = 0; y < 4; y += 1) {
          const required = Math.abs(x) === 1 || y === 0 || y === 3;
          layout.push({ xOffset: x, y, required });
        }
      }
      return layout;
    }

    getPortalSlotKey(gridX, gridZ, relY) {
      return `${gridX}|${gridZ}|${relY}`;
    }

    resetPortalFrameState() {
      this.portalFrameSlots.clear();
      this.restorePortalInteriorBlocks();
      this.portalHiddenInterior = [];
      this.portalReady = false;
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      const layout = this.portalFrameLayout || this.createPortalFrameLayout();
      const initial = this.initialHeightMap;
      let requiredCount = 0;
      layout.forEach(({ xOffset, y, required }) => {
        if (!required) return;
        const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x + xOffset));
        const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
        const slotKey = this.getPortalSlotKey(gridX, gridZ, y);
        const baseHeight = initial?.[gridX]?.[gridZ] ?? 0;
        this.portalFrameSlots.set(slotKey, {
          gridX,
          gridZ,
          relY: y,
          baseHeight,
          filled: false,
        });
        requiredCount += 1;
      });
      this.portalFrameRequiredCount = requiredCount || PORTAL_BLOCK_REQUIREMENT;
      this.portalBlocksPlaced = 0;
      this.portalFrameInteriorValid = this.checkPortalInterior();
      this.updatePortalProgress();
    }

    updatePortalInteriorValidity() {
      const previous = this.portalFrameInteriorValid;
      this.portalFrameInteriorValid = this.checkPortalInterior();
      return previous !== this.portalFrameInteriorValid;
    }

    checkPortalInterior() {
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (!anchor) {
        return false;
      }
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ];
      if (baseHeight === undefined) {
        return true;
      }
      const columnKey = `${gridX}|${gridZ}`;
      const column = this.columns.get(columnKey) ?? [];
      for (let relY = 1; relY <= 2; relY += 1) {
        const index = baseHeight + relY;
        const mesh = column[index];
        if (mesh) {
          const blockType = mesh.userData?.blockType;
          if (blockType === 'stone' || mesh.userData?.hiddenForPortal) {
            continue;
          }
          return false;
        }
      }
      return true;
    }

    hidePortalInteriorBlocks() {
      this.restorePortalInteriorBlocks();
      this.portalHiddenInterior = [];
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
      const columnKey = `${gridX}|${gridZ}`;
      const column = this.columns.get(columnKey) ?? [];
      for (let relY = 1; relY <= 2; relY += 1) {
        const index = baseHeight + relY;
        const mesh = column[index];
        if (mesh && mesh.visible !== false) {
          mesh.visible = false;
          if (mesh.userData) {
            mesh.userData.hiddenForPortal = true;
          }
          this.portalHiddenInterior.push(mesh);
        }
      }
    }

    restorePortalInteriorBlocks() {
      if (!Array.isArray(this.portalHiddenInterior) || !this.portalHiddenInterior.length) {
        this.portalHiddenInterior = [];
        return;
      }
      this.portalHiddenInterior.forEach((mesh) => {
        if (!mesh) return;
        mesh.visible = true;
        if (mesh.userData) {
          delete mesh.userData.hiddenForPortal;
        }
      });
      this.portalHiddenInterior = [];
    }

    getPortalAnchorWorldPosition(target = this.tmpVector3) {
      const THREE = this.THREE;
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (!anchor) {
        if (target?.set) {
          target.set(0, 0, 0);
        } else {
          target.x = 0;
          target.y = 0;
          target.z = 0;
        }
        return target;
      }
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
      const worldX = (gridX - WORLD_SIZE / 2) * BLOCK_SIZE;
      const worldZ = (gridZ - WORLD_SIZE / 2) * BLOCK_SIZE;
      const worldY = (baseHeight + 1.5) * BLOCK_SIZE;
      if (target?.set && THREE?.Vector3 && target instanceof THREE.Vector3) {
        target.set(worldX, worldY, worldZ);
      } else if (target) {
        target.x = worldX;
        target.y = worldY;
        target.z = worldZ;
      }
      return target;
    }

    isPlayerNearPortalFrame() {
      const anchorWorld = this.getPortalAnchorWorldPosition(this.tmpVector3);
      const cameraPosition = this.getCameraWorldPosition(this.tmpVector2);
      const distance = anchorWorld.distanceTo ? anchorWorld.distanceTo(cameraPosition) : null;
      if (distance === null || Number.isNaN(distance)) {
        return false;
      }
      return distance <= PORTAL_INTERACTION_RANGE;
    }

    getPortalFootprint() {
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (!anchor) {
        return null;
      }
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
      const frame = [];
      const interior = [];
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        for (let relY = 0; relY <= 3; relY += 1) {
          const entry = {
            x: gridX + xOffset,
            y: baseHeight + relY,
            z: gridZ,
          };
          if (Math.abs(xOffset) === 1 || relY === 0 || relY === 3) {
            frame.push(entry);
          } else if (relY > 0 && relY < 3) {
            interior.push(entry);
          }
        }
      }
      return {
        frame,
        interior,
        orientation: 'horizontal',
        bounds: { width: 3, height: 4 },
      };
    }

    getPortalInteriorBounds(padding = 0.2) {
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (!anchor) {
        return null;
      }
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
      const centerX = (gridX - WORLD_SIZE / 2) * BLOCK_SIZE;
      const centerZ = (gridZ - WORLD_SIZE / 2) * BLOCK_SIZE;
      const centerY = (baseHeight + 1.5) * BLOCK_SIZE;
      const halfWidth = 0.5 + padding;
      const halfDepth = 0.45 + padding;
      const minY = baseHeight * BLOCK_SIZE - padding;
      const maxY = (baseHeight + 3) * BLOCK_SIZE + padding;
      return {
        centerX,
        centerY,
        centerZ,
        halfWidth,
        halfDepth,
        minY,
        maxY,
      };
    }

    isEntityWithinPortalBounds(entry, bounds) {
      if (!entry?.position || !bounds) {
        return false;
      }
      const position = entry.position;
      const x = Number(position.x);
      const y = Number(position.y);
      const z = Number(position.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return false;
      }
      const radius = Number.isFinite(entry.radius) ? entry.radius : 0.5;
      const bottom = Number.isFinite(entry.bottom) ? entry.bottom : y - radius;
      const top = Number.isFinite(entry.top) ? entry.top : y + radius;
      if (top < bounds.minY || bottom > bounds.maxY) {
        return false;
      }
      const dx = Math.abs(x - bounds.centerX);
      const dz = Math.abs(z - bounds.centerZ);
      if (dx > bounds.halfWidth + radius) {
        return false;
      }
      if (dz > bounds.halfDepth + radius) {
        return false;
      }
      return true;
    }

    collectPortalFootprintObstructions() {
      const bounds = this.getPortalInteriorBounds(0.25);
      if (!bounds) {
        return [];
      }
      const obstructions = [];
      const addIfBlocking = (entry) => {
        if (!entry) return;
        if (this.isEntityWithinPortalBounds(entry, bounds)) {
          obstructions.push(entry);
        }
      };
      if (this.playerRig?.position) {
        const playerPosition = this.playerRig.position;
        addIfBlocking({
          kind: 'player',
          description: 'player',
          position: playerPosition,
          radius: 0.6,
          bottom: playerPosition.y - PLAYER_EYE_HEIGHT,
          top: playerPosition.y + 0.2,
        });
      }
      if (Array.isArray(this.zombies)) {
        this.zombies.forEach((zombie) => {
          const mesh = zombie?.mesh;
          if (!mesh?.position) return;
          addIfBlocking({
            kind: 'zombie',
            description: 'zombie',
            position: mesh.position,
            radius: 0.6,
            bottom: mesh.position.y - 0.9,
            top: mesh.position.y + 0.9,
          });
        });
      }
      if (Array.isArray(this.golems)) {
        this.golems.forEach((golem) => {
          const mesh = golem?.mesh;
          if (!mesh?.position) return;
          addIfBlocking({
            kind: 'golem',
            description: 'iron golem',
            position: mesh.position,
            radius: 0.9,
            bottom: mesh.position.y - 1.1,
            top: mesh.position.y + 1.6,
          });
        });
      }
      if (Array.isArray(this.chests)) {
        this.chests.forEach((chest) => {
          const mesh = chest?.mesh;
          if (!mesh?.position) return;
          addIfBlocking({
            kind: 'chest',
            description: 'loot chest',
            position: mesh.position,
            radius: 0.6,
            bottom: mesh.position.y - 0.5,
            top: mesh.position.y + 0.5,
          });
        });
      }
      return obstructions;
    }

    formatPortalObstructionMessage(obstructions = []) {
      if (!Array.isArray(obstructions) || !obstructions.length) {
        return '';
      }
      const descriptors = [];
      obstructions.forEach((entry) => {
        if (entry?.description) {
          descriptors.push(entry.description);
        } else if (entry?.kind) {
          descriptors.push(entry.kind);
        }
      });
      if (!descriptors.length) {
        return 'Portal activation blocked — clear the obstruction occupying the gateway.';
      }
      const unique = Array.from(new Set(descriptors));
      let label;
      if (unique.length === 1) {
        label = unique[0];
      } else if (unique.length === 2) {
        label = `${unique[0]} and ${unique[1]}`;
      } else {
        label = `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`;
      }
      return `Portal activation blocked — clear the ${label} occupying the gateway.`;
    }

    refreshPortalObstructionState() {
      const obstructions = this.collectPortalFootprintObstructions();
      const blocked = obstructions.length > 0;
      const summary = blocked ? this.formatPortalObstructionMessage(obstructions) : '';
      const changed =
        this.portalFootprintObstructed !== blocked ||
        this.portalFootprintObstructionSummary !== summary;
      this.portalFootprintObstructed = blocked;
      this.portalFootprintObstructionSummary = summary;
      return { blocked, summary, obstructions, changed };
    }

    ignitePortal(tool = 'torch') {
      if (!this.portalReady || this.portalActivated) {
        return;
      }
      const footprint = this.getPortalFootprint();
      let events = [];
      if (this.portalMechanics?.ignitePortalFrame && footprint) {
        try {
          const result = this.portalMechanics.ignitePortalFrame(footprint, { tool });
          if (Array.isArray(result?.events)) {
            events = result.events.slice();
            this.portalIgnitionLog = events.slice(0, 6);
          }
          if (result?.portal) {
            this.portalState = result.portal;
          }
        } catch (error) {
          console.warn('Portal ignition mechanics failed', error);
        }
      }
      const activated = this.activatePortal();
      if (!activated) {
        return;
      }
      this.portalReady = false;
      this.score += 5;
      this.addScoreBreakdown('portal', 5);
      const message = events.length ? events.join(' ') : 'Portal ignited — step through to travel.';
      this.showHint(message);
      this.scheduleScoreSync('portal-primed');
    }

    updatePortalFrameStateForColumn(gx, gz) {
      if (!this.portalFrameSlots.size) {
        return;
      }
      let changed = false;
      const columnKey = `${gx}|${gz}`;
      const column = this.columns.get(columnKey) ?? [];
      this.portalFrameSlots.forEach((slot) => {
        if (slot.gridX !== gx || slot.gridZ !== gz) {
          return;
        }
        const baseHeight = slot.baseHeight ?? this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? 0;
        const targetIndex = baseHeight + slot.relY;
        const mesh = column[targetIndex];
        const valid = Boolean(mesh?.userData?.blockType) && mesh.userData.blockType === 'stone';
        if (slot.filled !== valid) {
          slot.filled = valid;
          changed = true;
        }
      });
      const interiorChanged = this.updatePortalInteriorValidity();
      if (changed || interiorChanged) {
        this.recalculatePortalFrameProgress();
      }
    }

    recalculatePortalFrameProgress() {
      let filled = 0;
      this.portalFrameSlots.forEach((slot) => {
        if (slot.filled) {
          filled += 1;
        }
      });
      this.portalBlocksPlaced = filled;
      this.checkPortalActivation();
    }

    deactivatePortal() {
      if (this.portalMesh) {
        this.portalGroup.remove(this.portalMesh);
        disposeObject3D(this.portalMesh);
        this.portalMesh = null;
      }
      this.portalActivated = false;
      this.portalReady = false;
      this.portalState = null;
      this.portalIgnitionLog = [];
      this.portalFootprintObstructed = false;
      this.portalFootprintObstructionSummary = '';
      this.restorePortalInteriorBlocks();
      this.updatePortalInteriorValidity();
      this.updatePortalProgress();
    }

    refreshPortalState() {
      this.deactivatePortal();
      this.portalGroup.clear();
      this.portalHintShown = false;
      this.resetPortalFrameState();
    }

    activatePortal() {
      const { blocked, summary } = this.refreshPortalObstructionState();
      if (blocked) {
        const message = summary ||
          'Portal activation blocked — clear the obstruction occupying the gateway.';
        if (typeof this.showHint === 'function') {
          this.showHint(message);
        }
        this.portalIgnitionLog = [message];
        this.updatePortalProgress();
        return false;
      }
      const THREE = this.THREE;
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
      const anchorWorld = this.getPortalAnchorWorldPosition(this.tmpVector3);
      const worldX = anchorWorld.x;
      const worldY = anchorWorld.y;
      const worldZ = anchorWorld.z;
      this.portalGroup.clear();
      this.portalActivated = true;
      if (!this.portalPlaneGeometry) {
        this.portalPlaneGeometry = new THREE.PlaneGeometry(2.4, 3.2);
      }
      const portalMaterial = this.materials.portal.clone();
      portalMaterial.uniforms = {
        uTime: { value: 0 },
        uColorA: { value: this.materials.portal.uniforms.uColorA.value.clone() },
        uColorB: { value: this.materials.portal.uniforms.uColorB.value.clone() },
      };
      const plane = new THREE.Mesh(this.portalPlaneGeometry, portalMaterial);
      plane.position.set(worldX, worldY, worldZ + 0.02);
      plane.rotation.y = Math.PI;
      plane.renderOrder = 2;
      plane.castShadow = false;
      plane.receiveShadow = false;
      this.portalGroup.add(plane);
      this.portalMesh = plane;
      this.hidePortalInteriorBlocks();
      this.updatePortalInteriorValidity();
      this.portalHintShown = true;
      this.updatePortalProgress();
      this.updateHud();
      this.scheduleScoreSync('portal-activated');
      console.error(
        'Portal activation triggered — ensure portal shaders and collision volumes initialise. Rebuild the portal pipeline if travellers become stuck.',
      );
      const activeDimension = this.dimensionSettings?.name || 'Unknown Dimension';
      console.error(
        `Portal dimension status — active dimension: ${activeDimension}. If transitions fail, verify the dimension registry and connection graph.`,
      );
      this.emitGameEvent('portal-activated', {
        dimension: this.dimensionSettings?.id ?? null,
        summary: this.createRunSummary('portal-activated'),
      });
      return true;
    }

    isPlayerNearPortal() {
      if (!this.portalMesh || !this.camera) return false;
      const cameraPosition = this.getCameraWorldPosition(this.tmpVector3);
      const distance = this.portalMesh.position.distanceTo(cameraPosition);
      return distance <= PORTAL_INTERACTION_RANGE;
    }

    checkPortalActivation() {
      const required = this.portalFrameRequiredCount || PORTAL_BLOCK_REQUIREMENT;
      const ready = required > 0 && this.portalFrameInteriorValid && this.portalBlocksPlaced >= required;
      if (this.portalActivated) {
        if (!ready) {
          this.deactivatePortal();
        } else {
          this.updatePortalProgress();
        }
        return;
      }
      if (!ready) {
        const progress = required > 0 ? this.portalBlocksPlaced / required : 0;
        if (!this.portalHintShown && progress >= 0.5) {
          this.portalHintShown = true;
          this.addScoreBreakdown('portal', 1);
          this.score += 1;
          this.updateHud();
        }
        this.portalReady = false;
        this.updatePortalProgress();
        return;
      }
      if (!this.portalReady) {
        this.portalReady = true;
        this.portalHintShown = true;
        this.portalIgnitionLog = [];
        this.addScoreBreakdown('portal', 1);
        this.score += 1;
        this.updateHud();
        this.showHint('Portal frame complete — press F to ignite your torch.');
        this.emitGameEvent('portal-ready', {
          dimension: this.dimensionSettings?.id ?? null,
          required,
          placed: this.portalBlocksPlaced,
        });
      }
      this.updatePortalProgress();
    }

    advanceDimension() {
      if (!this.portalActivated || this.victoryAchieved) return;
      this.portalActivations += 1;
      if (this.currentDimensionIndex >= DIMENSION_THEME.length - 1) {
        this.triggerVictory();
        return;
      }
      const nextIndex = this.currentDimensionIndex + 1;
      const nextSettings = DIMENSION_THEME[nextIndex] || null;
      let pointsAwarded = 5;
      let portalLog = '';
      let transitionResult = null;
      const rulesSummary = this.buildDimensionRuleSummary(nextSettings);
      if (this.portalMechanics?.enterPortal) {
        try {
          const result = this.portalMechanics.enterPortal(this.portalState || { active: true }, {
            name: nextSettings?.name || `Dimension ${nextIndex + 1}`,
            id: nextSettings?.id || `dimension-${nextIndex + 1}`,
            physics: { gravity: nextSettings?.gravity ?? this.gravityScale, shaderProfile: nextSettings?.id ?? 'default' },
            unlockPoints: 5,
            description: nextSettings?.description ?? '',
            rules: rulesSummary,
          });
          transitionResult = result;
          if (result?.pointsAwarded !== undefined) {
            pointsAwarded = result.pointsAwarded;
          }
          if (result?.log) {
            portalLog = result.log;
          }
        } catch (error) {
          console.warn('Portal transition mechanics failed', error);
        }
      }
      this.applyDimensionSettings(nextIndex);
      if (transitionResult?.physics?.gravity !== undefined) {
        this.gravityScale = transitionResult.physics.gravity;
      }
      if (this.dimensionSettings) {
        console.error(
          `Dimension unlock flow fired — ${this.dimensionSettings.name}. If the unlock fails to present rewards, audit quest requirements and persistence flags.`,
        );
      }
      this.buildTerrain();
      this.buildRails();
      this.spawnDimensionChests();
      this.refreshPortalState();
      const arrivalRules = this.buildDimensionRuleSummary(
        this.dimensionSettings,
        transitionResult?.dimensionRules ?? rulesSummary,
      );
      this.revealDimensionIntro(this.dimensionSettings, {
        intent: 'arrival',
        rulesOverride: arrivalRules,
      });
      this.positionPlayer();
      this.evaluateBossChallenge();
      this.clearZombies();
      this.clearGolems();
      this.lastGolemSpawn = this.elapsed;
      if (Number.isFinite(pointsAwarded)) {
        this.score += pointsAwarded;
        this.addScoreBreakdown('dimensions', pointsAwarded);
      }
      this.updateHud();
      this.scheduleScoreSync('dimension-advanced');
      this.audio.play('bubble', { volume: 0.5 });
      if (portalLog) {
        this.showHint(portalLog);
      }
      this.portalState = null;
      this.emitGameEvent('dimension-advanced', {
        dimension: this.dimensionSettings?.id ?? null,
        index: this.currentDimensionIndex,
        summary: this.createRunSummary('dimension-advanced'),
      });
      this.publishStateSnapshot('dimension-advanced');
    }

    triggerVictory() {
      this.victoryAchieved = true;
      this.resetNetheriteChallenge();
      this.portalActivated = false;
      this.portalGroup.clear();
      this.portalMesh = null;
      this.score += 25;
      this.addScoreBreakdown('dimensions', 25);
      this.clearZombies();
      this.clearGolems();
      this.clearChests();
      this.updatePortalProgress();
      this.updateHud();
      this.scheduleScoreSync('victory');
      this.audio.play('victoryCheer', { volume: 0.75 });
      this.emitGameEvent('victory', { summary: this.createRunSummary('victory') });
      this.showVictoryCelebration();
      this.showVictoryBanner('Eternal Ingot secured — celebrate and share your run.');
    }

    positionPlayer() {
      const spawnColumn = `${Math.floor(WORLD_SIZE / 2)}|${Math.floor(WORLD_SIZE / 2)}`;
      const column = this.columns.get(spawnColumn);
      if (column && column.length) {
        const top = column[column.length - 1];
        const spawnY = top.position.y + PLAYER_EYE_HEIGHT;
        const spawnZ = top.position.z;
        if (this.playerRig) {
          this.playerRig.position.set(top.position.x, spawnY, spawnZ);
        } else if (this.camera) {
          this.camera.position.set(top.position.x, spawnY, spawnZ);
        }
      } else {
        if (this.playerRig) {
          this.playerRig.position.set(0, PLAYER_EYE_HEIGHT + 1, 0);
        } else if (this.camera) {
          this.camera.position.set(0, PLAYER_EYE_HEIGHT + 1, 0);
        }
      }
    }

    buildKeyBindings({ includeStored = true } = {}) {
      const base = this.baseKeyBindings
        ? cloneKeyBindingMap(this.baseKeyBindings)
        : cloneKeyBindingMap(this.defaultKeyBindings);
      if (!includeStored) {
        return base;
      }
      const stored = this.loadStoredKeyBindingOverrides();
      return mergeKeyBindingMaps(base, stored);
    }

    loadStoredKeyBindingOverrides() {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      try {
        const raw = window.localStorage.getItem(KEY_BINDINGS_STORAGE_KEY);
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        return normaliseKeyBindingMap(parsed);
      } catch (error) {
        console.debug('Failed to load key bindings from storage.', error);
        return null;
      }
    }

    persistKeyBindings() {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      try {
        const base = this.baseKeyBindings || this.defaultKeyBindings || {};
        const overrides = {};
        Object.entries(this.keyBindings || {}).forEach(([action, keys]) => {
          if (!Array.isArray(keys)) {
            return;
          }
          const baseline = base[action] || [];
          if (!this.areKeyListsEqual(keys, baseline)) {
            overrides[action] = [...keys];
          }
        });
        if (Object.keys(overrides).length) {
          window.localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(overrides));
        } else {
          window.localStorage.removeItem(KEY_BINDINGS_STORAGE_KEY);
        }
      } catch (error) {
        console.debug('Failed to persist key bindings.', error);
      }
    }

    setKeyBinding(action, keys, options = {}) {
      const { persist = true } = options;
      if (typeof action !== 'string' || !action.trim()) {
        return false;
      }
      const normalised = normaliseKeyBindingValue(keys);
      let nextKeys = normalised;
      if (!nextKeys.length) {
        const fallback = this.baseKeyBindings?.[action.trim()];
        nextKeys = fallback ? [...fallback] : [];
      }
      const changed = this.applyKeyBinding(action.trim(), nextKeys);
      if (changed && persist) {
        this.persistKeyBindings();
      }
      return changed;
    }

    setKeyBindings(overrides, options = {}) {
      const { persist = true } = options;
      const normalised = normaliseKeyBindingMap(overrides);
      if (!normalised) {
        return false;
      }
      let changed = false;
      Object.entries(normalised).forEach(([action, keys]) => {
        const updated = this.applyKeyBinding(action, [...keys]);
        if (updated) {
          changed = true;
        }
      });
      if (changed && persist) {
        this.persistKeyBindings();
      }
      return changed;
    }

    resetKeyBindings(options = {}) {
      const { persist = true } = options;
      this.keyBindings = this.buildKeyBindings({ includeStored: false });
      if (persist) {
        this.persistKeyBindings();
      }
      return cloneKeyBindingMap(this.keyBindings);
    }

    getKeyBindings() {
      return cloneKeyBindingMap(this.keyBindings);
    }

    getDefaultKeyBindings() {
      return cloneKeyBindingMap(this.defaultKeyBindings);
    }

    getActionKeyLabels(action, options = {}) {
      const { limit = null } = options ?? {};
      if (typeof action !== 'string' || !action.trim()) {
        return [];
      }
      const binding = this.keyBindings?.[action.trim()] ?? [];
      const seen = new Set();
      const labels = [];
      binding.forEach((code) => {
        const label = formatKeyLabel(code);
        if (!label || seen.has(label)) {
          return;
        }
        seen.add(label);
        labels.push(label);
      });
      if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) {
        return labels.slice(0, Math.floor(limit));
      }
      return labels;
    }

    getActionKeySummary(action, options = {}) {
      const { limit = null, fallback = '' } = options ?? {};
      const labels = this.getActionKeyLabels(action, { limit });
      return joinKeyLabels(labels, { fallback });
    }

    getCombinedActionLabels(actions = [], options = {}) {
      const { limitPerAction = null } = options ?? {};
      const labels = [];
      const seen = new Set();
      actions.forEach((action) => {
        const actionLabels = this.getActionKeyLabels(action, { limit: limitPerAction });
        actionLabels.forEach((label) => {
          if (!label || seen.has(label)) {
            return;
          }
          seen.add(label);
          labels.push(label);
        });
      });
      return labels;
    }

    getMovementKeySets() {
      const actions = ['moveForward', 'moveLeft', 'moveBackward', 'moveRight'];
      const primary = [];
      const secondary = [];
      let hasSecondary = true;
      actions.forEach((action) => {
        const labels = this.getActionKeyLabels(action);
        if (labels.length) {
          primary.push(labels[0]);
        }
        if (labels.length > 1) {
          secondary.push(labels[1]);
        } else {
          hasSecondary = false;
        }
      });
      return {
        primary,
        secondary: hasSecondary && secondary.length === actions.length ? secondary : [],
      };
    }

    getMovementKeySummary(options = {}) {
      const { joiner = ' / ', fallback = '' } = options ?? {};
      const { primary } = this.getMovementKeySets();
      const filtered = primary.filter((label) => typeof label === 'string' && label.trim());
      if (!filtered.length) {
        return fallback;
      }
      return filtered.join(joiner);
    }

    getPointerTutorialMessage() {
      const movementSummary = this.getMovementKeySummary({ fallback: '' });
      if (movementSummary) {
        return `Click the viewport to capture your mouse, then use ${movementSummary} to move and left-click to mine.`;
      }
      return POINTER_TUTORIAL_MESSAGE;
    }

    getPointerLockFallbackMessage() {
      return POINTER_LOCK_FALLBACK_MESSAGE;
    }

    showPointerLockFallbackNotice(message) {
      const text = typeof message === 'string' && message.trim() ? message.trim() : this.getPointerLockFallbackMessage();
      if (this.playerHintEl) {
        this.playerHintEl.textContent = text;
        this.playerHintEl.setAttribute('data-variant', 'warning');
        this.playerHintEl.classList.add('visible');
      }
      this.pointerLockFallbackNoticeShown = true;
      this.pointerLockFallbackMessageActive = true;
      this.lastHintMessage = text;
      this.updatePointerHintForInputMode(text);
      this.schedulePointerHintAutoHide(8);
    }

    applyKeyBinding(action, keys) {
      if (typeof action !== 'string' || !Array.isArray(keys)) {
        return false;
      }
      const trimmedAction = action.trim();
      if (!trimmedAction) {
        return false;
      }
      const filteredKeys = [];
      const seen = new Set();
      keys.forEach((key) => {
        if (typeof key !== 'string') {
          return;
        }
        const trimmed = key.trim();
        if (!trimmed || seen.has(trimmed)) {
          return;
        }
        seen.add(trimmed);
        filteredKeys.push(trimmed);
      });
      const nextKeys = filteredKeys.length
        ? filteredKeys
        : [...(this.baseKeyBindings?.[trimmedAction] ?? [])];
      const current = this.keyBindings?.[trimmedAction] ?? [];
      if (this.areKeyListsEqual(current, nextKeys)) {
        return false;
      }
      if (!this.keyBindings) {
        this.keyBindings = {};
      }
      this.keyBindings[trimmedAction] = [...nextKeys];
      return true;
    }

    areKeyListsEqual(a = [], b = []) {
      if (a.length !== b.length) {
        return false;
      }
      for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) {
          return false;
        }
      }
      return true;
    }

    isKeyForAction(code, action) {
      if (!code || !action) {
        return false;
      }
      const binding = this.keyBindings?.[action];
      if (!binding || !binding.length) {
        return false;
      }
      return binding.includes(code);
    }

    isActionActive(action) {
      const binding = this.keyBindings?.[action];
      if (!binding || !binding.length) {
        return false;
      }
      return binding.some((code) => this.keys?.has(code));
    }

    isMovementKey(code) {
      if (!code) {
        return false;
      }
      return MOVEMENT_ACTIONS.some((action) => this.isKeyForAction(code, action));
    }

    getHotbarSlotFromKey(code) {
      if (!code) {
        return null;
      }
      for (let slot = 1; slot <= HOTBAR_SLOTS; slot += 1) {
        if (this.isKeyForAction(code, `hotbar${slot}`)) {
          return slot - 1;
        }
      }
      return null;
    }

    bindEvents() {
      if (this.eventsBound) {
        return;
      }
      this.boundEventDisposers = [];
      this.boundEventRecords = [];
      const add = (target, eventName, handler, context, eventOptions) => {
        this.addSafeEventListener(target, eventName, handler, { context, eventOptions });
      };
      POINTER_LOCK_CHANGE_EVENTS.forEach((eventName) => {
        add(document, eventName, this.onPointerLockChange, 'tracking pointer lock state');
      });
      POINTER_LOCK_ERROR_EVENTS.forEach((eventName) => {
        add(document, eventName, this.onPointerLockError, 'handling pointer lock errors');
      });
      add(document, 'visibilitychange', this.onVisibilityChange, 'monitoring tab visibility');
      add(document, 'keydown', this.onKeyDown, 'processing keyboard input');
      add(document, 'keyup', this.onKeyUp, 'releasing keyboard input');
      const view = typeof window !== 'undefined' ? window : null;
      if (view) {
        add(view, 'keydown', this.onKeyDown, 'processing keyboard input (window fallback)');
        add(view, 'keyup', this.onKeyUp, 'releasing keyboard input (window fallback)');
      }
      if (this.canvas) {
        if (typeof this.canvas.setAttribute === 'function') {
          const existingTabIndex = this.canvas.getAttribute ? this.canvas.getAttribute('tabindex') : null;
          if (existingTabIndex === null) {
            this.canvas.setAttribute('tabindex', '0');
          }
        }
        add(this.canvas, 'keydown', this.onKeyDown, 'processing keyboard input (canvas focus fallback)');
        add(this.canvas, 'keyup', this.onKeyUp, 'releasing keyboard input (canvas focus fallback)');
      }
      add(document, 'mousemove', this.onMouseMove, 'tracking pointer movement');
      add(document, 'mousedown', this.onMouseDown, 'handling pointer presses');
      add(document, 'mouseup', this.onMouseUp, 'handling pointer releases');
      add(window, 'resize', this.onResize, 'resizing the renderer');
      add(window, 'beforeunload', this.onBeforeUnload, 'saving session state before unload');
      add(this.canvas, 'wheel', this.onCanvasWheel, 'scrolling the viewport', { passive: false });
      const pointerTargets = this.getPointerInputTargets();
      pointerTargets.forEach((target) => {
        add(target, 'pointerdown', this.onTouchLookPointerDown, 'starting touch look drag', {
          passive: false,
        });
      });
      add(window, 'pointermove', this.onTouchLookPointerMove, 'tracking touch look drag', {
        passive: false,
      });
      add(window, 'pointerup', this.onTouchLookPointerUp, 'ending touch look drag');
      add(window, 'pointercancel', this.onTouchLookPointerUp, 'cancelling touch look drag');
      add(window, 'pointerdown', this.onGlobalPointerDown, 'tracking global pointer activity', {
        passive: true,
      });
      add(window, 'touchstart', this.onGlobalTouchStart, 'tracking touch activity', { passive: true });
      pointerTargets.forEach((target) => {
        add(target, 'click', this.onCanvasPointerLock, 'engaging pointer lock');
        add(target, 'contextmenu', this.preventContextMenu, 'preventing context menu');
      });
      add(this.hotbarEl, 'click', this.onHotbarClick, 'selecting hotbar slots');
      add(this.craftLauncherButton, 'click', this.onOpenCrafting, 'opening crafting');
      add(this.closeCraftingButton, 'click', this.onCloseCrafting, 'closing crafting');
      add(this.craftingModal, 'click', this.onCraftingModalBackdrop, 'handling crafting modal backdrop');
      add(this.craftButton, 'click', this.onCraftButton, 'crafting items');
      add(this.clearCraftButton, 'click', this.onClearCraft, 'clearing craft sequence');
      add(this.craftSequenceEl, 'click', this.onCraftSequenceClick, 'managing craft sequence');
      add(this.craftSuggestionsEl, 'click', this.onCraftSuggestionClick, 'choosing craft suggestion');
      add(this.craftingSearchResultsEl, 'click', this.onCraftSuggestionClick, 'choosing search suggestion');
      add(this.craftingInventoryEl, 'click', this.onCraftingInventoryClick, 'selecting crafting resources');
      add(this.craftingInventoryEl, 'pointerover', this.onCraftingInventoryFocus, 'highlighting crafting inventory');
      add(this.craftingInventoryEl, 'focusin', this.onCraftingInventoryFocus, 'focusing crafting inventory');
      add(this.craftingInventoryEl, 'pointerout', this.onCraftingInventoryBlur, 'clearing crafting hover');
      add(this.craftingInventoryEl, 'focusout', this.onCraftingInventoryBlur, 'blurring crafting inventory');
      add(this.extendedInventoryEl, 'pointerover', this.onCraftingInventoryFocus, 'highlighting extended inventory');
      add(this.extendedInventoryEl, 'focusin', this.onCraftingInventoryFocus, 'focusing extended inventory');
      add(this.extendedInventoryEl, 'pointerout', this.onCraftingInventoryBlur, 'clearing extended inventory hover');
      add(this.extendedInventoryEl, 'focusout', this.onCraftingInventoryBlur, 'blurring extended inventory');
      add(this.craftSuggestionsEl, 'pointerover', this.onCraftSuggestionFocus, 'highlighting craft suggestion');
      add(this.craftSuggestionsEl, 'focusin', this.onCraftSuggestionFocus, 'focusing craft suggestion');
      add(this.craftSuggestionsEl, 'pointerout', this.onCraftSuggestionBlur, 'clearing craft suggestion hover');
      add(this.craftSuggestionsEl, 'focusout', this.onCraftSuggestionBlur, 'blurring craft suggestion');
      add(this.craftingSearchResultsEl, 'pointerover', this.onCraftSuggestionFocus, 'highlighting search suggestion');
      add(this.craftingSearchResultsEl, 'focusin', this.onCraftSuggestionFocus, 'focusing search suggestion');
      add(this.craftingSearchResultsEl, 'pointerout', this.onCraftSuggestionBlur, 'clearing search suggestion hover');
      add(this.craftingSearchResultsEl, 'focusout', this.onCraftSuggestionBlur, 'blurring search suggestion');
      add(this.craftSequenceEl, 'pointerover', this.onCraftSequenceFocus, 'highlighting craft sequence');
      add(this.craftSequenceEl, 'focusin', this.onCraftSequenceFocus, 'focusing craft sequence');
      add(this.craftSequenceEl, 'pointerout', this.onCraftSequenceBlur, 'clearing craft sequence hover');
      add(this.craftSequenceEl, 'focusout', this.onCraftSequenceBlur, 'blurring craft sequence');
      add(this.extendedInventoryEl, 'click', this.onExtendedInventoryClick, 'managing extended inventory');
      add(this.openCraftingSearchButton, 'click', this.onOpenCraftingSearchClick, 'opening crafting search');
      add(this.closeCraftingSearchButton, 'click', this.onCloseCraftingSearchClick, 'closing crafting search');
      add(this.craftingSearchInput, 'input', this.onCraftSearchInput, 'filtering crafting search');
      add(this.inventorySortButton, 'click', this.onInventorySort, 'sorting inventory');
      add(this.closeInventoryButton, 'click', this.onInventoryToggle, 'closing inventory');
      this.openInventoryButtons.forEach((el) => {
        add(el, 'click', this.onInventoryToggle, 'toggling inventory');
      });
      add(this.ui?.dimensionInfoEl || null, 'click', this.onVictoryReplay, 'triggering victory replay');
      add(this.victoryCloseButton, 'click', this.onVictoryClose, 'closing victory overlay');
      add(this.victoryShareButton, 'click', this.onVictoryShare, 'sharing victory summary');
      this.attachPointerPreferenceObserver();
      this.eventsBound = true;
    }

    unbindEvents() {
      if (!this.eventsBound) {
        return;
      }
      this.boundEventDisposers.forEach((dispose) => {
        try {
          dispose();
        } catch (error) {
          if (typeof console !== 'undefined') {
            console.debug('Failed to dispose event listener cleanly.', error);
          }
        }
      });
      this.boundEventDisposers = [];
      this.boundEventRecords = [];
      if (this.detachPointerPreferenceObserver) {
        try {
          this.detachPointerPreferenceObserver();
        } catch (error) {
          console.debug('Failed to detach pointer preference observer', error);
        }
      }
      this.pointerPreferenceObserver = null;
      this.detachPointerPreferenceObserver = null;
      this.teardownMobileControls();
      this.cancelPointerLockRetry();
      this.pointerLockRetryAttempts = 0;
      this.eventsBound = false;
    }

    getPointerLockElement() {
      if (typeof document === 'undefined') {
        return null;
      }
      return (
        document.pointerLockElement ||
        document.mozPointerLockElement ||
        document.webkitPointerLockElement ||
        null
      );
    }

    cancelPointerLockRetry() {
      if (!this.pointerLockRetryTimer) {
        return;
      }
      const scope = typeof window !== 'undefined' ? window : globalThis;
      scope.clearTimeout(this.pointerLockRetryTimer);
      this.pointerLockRetryTimer = null;
    }

    schedulePointerLockRetry(delayMs = POINTER_LOCK_RETRY_DELAY_MS) {
      if (!this.canvas) {
        return;
      }
      const scope = typeof window !== 'undefined' ? window : globalThis;
      this.cancelPointerLockRetry();
      const timeout = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : POINTER_LOCK_RETRY_DELAY_MS;
      this.pointerLockRetryTimer = scope.setTimeout(() => {
        this.pointerLockRetryTimer = null;
        if (!this.canvas || this.pointerLocked || this.getPointerLockElement() === this.canvas) {
          return;
        }
        this.attemptPointerLock();
      }, timeout);
    }

    handlePointerLockChange() {
      this.pointerLocked = this.getPointerLockElement() === this.canvas;
      if (this.pointerLocked) {
        this.cancelPointerLockRetry();
        this.pointerLockRetryAttempts = 0;
        this.pointerLockBlockWarningIssued = false;
        this.pointerLockFallbackActive = false;
        this.pointerLockWarningShown = false;
        this.pointerLockFallbackNoticeShown = false;
        if (this.pointerLockFallbackMessageActive && this.playerHintEl) {
          this.playerHintEl.classList.remove('visible');
          this.playerHintEl.removeAttribute('data-variant');
        }
        this.pointerLockFallbackMessageActive = false;
        this.endPointerFallbackDrag();
        this.markInteraction();
        this.cancelPointerHintAutoHide();
        this.hidePointerHint(true);
        return;
      }
      this.markInteraction();
      if (this.pointerLockFallbackActive) {
        this.updatePointerHintForInputMode(this.getPointerLockFallbackMessage());
        this.schedulePointerHintAutoHide(8);
      } else {
        this.showDesktopPointerTutorialHint();
      }
    }

    handlePointerLockError(event) {
      this.pointerLocked = false;
      this.cancelPointerHintAutoHide();
      const error = event?.error || event || null;
      const attempts = this.pointerLockRetryAttempts ?? 0;
      if (!this.pointerLockFallbackActive && attempts < POINTER_LOCK_MAX_RETRIES) {
        this.pointerLockRetryAttempts = attempts + 1;
        const backoff = POINTER_LOCK_RETRY_DELAY_MS * Math.pow(2, this.pointerLockRetryAttempts - 1);
        this.schedulePointerLockRetry(backoff);
        if (typeof console !== 'undefined' && !this.pointerLockBlockWarningIssued) {
          if (error) {
            console.warn(
              'Pointer lock request was blocked by the browser or an extension. Retrying shortly.',
              error,
            );
          } else {
            console.warn('Pointer lock request was blocked by the browser or an extension. Retrying shortly.');
          }
          this.pointerLockBlockWarningIssued = true;
        }
        this.updatePointerHintForInputMode(POINTER_LOCK_RETRY_HINT_MESSAGE);
        this.schedulePointerHintAutoHide(4);
        return;
      }
      if (typeof console !== 'undefined' && attempts >= POINTER_LOCK_MAX_RETRIES) {
        if (error) {
          console.warn(
            'Pointer lock could not be acquired after multiple attempts. The browser or an extension may be blocking mouse capture. Falling back to drag-to-look controls.',
            error,
          );
        } else {
          console.warn(
            'Pointer lock could not be acquired after multiple attempts. The browser or an extension may be blocking mouse capture. Falling back to drag-to-look controls.',
          );
        }
      }
      this.enablePointerLockFallback('error', error, { message: POINTER_LOCK_FALLBACK_MESSAGE });
    }

    attemptPointerLock() {
      if (!this.canvas) {
        return;
      }
      const requestPointerLock =
        this.canvas.requestPointerLock ||
        this.canvas.mozRequestPointerLock ||
        this.canvas.webkitRequestPointerLock;
      if (typeof requestPointerLock !== 'function') {
        this.enablePointerLockFallback('unsupported');
        return;
      }
      const requestWithoutOptions = (initialError = null) => {
        try {
          const fallbackResult = requestPointerLock.call(this.canvas);
          if (fallbackResult && typeof fallbackResult.catch === 'function') {
            fallbackResult.catch((fallbackError) => {
              this.enablePointerLockFallback('request-rejected', fallbackError || initialError);
            });
          }
        } catch (fallbackError) {
          this.enablePointerLockFallback('request-error', fallbackError || initialError);
        }
      };
      try {
        const result = requestPointerLock.call(this.canvas, { unadjustedMovement: true });
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            requestWithoutOptions(error);
          });
        }
      } catch (error) {
        requestWithoutOptions(error);
      }
    }

    handleCanvasPointerLockRequest() {
      if (!this.canvas) {
        return;
      }
      this.markInteraction();
      this.cancelPointerLockRetry();
      this.pointerLockRetryAttempts = 0;
      this.pointerLockBlockWarningIssued = false;
      if (this.pointerLocked || this.getPointerLockElement() === this.canvas) {
        return;
      }
      if (typeof this.canvas.focus === 'function') {
        try {
          this.canvas.focus({ preventScroll: true });
        } catch (error) {
          try {
            this.canvas.focus();
          } catch (nestedError) {
            console.debug('Canvas focus unavailable in this browser.', nestedError);
          }
        }
      }
      this.attemptPointerLock();
      this.updatePointerHintForInputMode();
    }

    handleMouseMove(event) {
      if (this.pointerLocked) {
        this.markInteraction();
        this.yaw -= event.movementX * POINTER_SENSITIVITY;
        this.pitch -= event.movementY * POINTER_SENSITIVITY;
        const maxPitch = Math.PI / 2 - 0.01;
        this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
        return;
      }
      if (!this.pointerLockFallbackActive) {
        return;
      }
      if (!this.pointerFallbackDragging) {
        if (event.buttons === 0) {
          return;
        }
        this.pointerFallbackDragging = true;
        if (typeof event.buttons === 'number') {
          if (event.buttons & 1) {
            this.pointerFallbackButton = 0;
          } else if (event.buttons & 2) {
            this.pointerFallbackButton = 2;
          } else if (event.buttons & 4) {
            this.pointerFallbackButton = 1;
          } else {
            this.pointerFallbackButton = null;
          }
        } else {
          this.pointerFallbackButton = this.pointerFallbackButton ?? 0;
        }
        this.pointerFallbackLast = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
      }
      if (event.buttons === 0) {
        this.endPointerFallbackDrag();
        return;
      }
      this.markInteraction();
      if (!this.pointerFallbackLast) {
        this.pointerFallbackLast = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
      }
      const movementX = Number.isFinite(event.movementX)
        ? event.movementX
        : (event.clientX ?? 0) - this.pointerFallbackLast.x;
      const movementY = Number.isFinite(event.movementY)
        ? event.movementY
        : (event.clientY ?? 0) - this.pointerFallbackLast.y;
      this.pointerFallbackLast = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
      this.yaw -= movementX * POINTER_SENSITIVITY;
      this.pitch -= movementY * POINTER_SENSITIVITY;
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      if (event.preventDefault) {
        event.preventDefault();
      }
    }

    handleMouseUp(event) {
      this.markInteraction();
      if (!this.pointerLockFallbackActive || !this.pointerFallbackDragging) {
        return;
      }
      if (
        typeof event?.button === 'number' &&
        this.pointerFallbackButton !== null &&
        event.button !== this.pointerFallbackButton
      ) {
        return;
      }
      this.endPointerFallbackDrag();
    }

    handleKeyDown(event) {
      if (event && event.__infiniteRailsHandled) {
        return;
      }
      if (event) {
        event.__infiniteRailsHandled = true;
      }
      this.markInteraction();
      const code = typeof event.code === 'string' ? event.code : '';
      if (code) {
        this.keys.add(code);
      }
      if (this.isMovementKey(code) || this.isKeyForAction(code, 'jump')) {
        event.preventDefault();
      }
      if (this.isKeyForAction(code, 'moveForward') && !event.repeat) {
        console.error(
          'Movement input detected (forward). If the avatar fails to advance, confirm control bindings and resolve any physics constraints blocking motion.',
        );
        this.queueMovementBindingValidation('moveForward');
      }
      if (this.isKeyForAction(code, 'resetPosition')) {
        this.resetPosition();
        event.preventDefault();
      }
      if (this.isKeyForAction(code, 'interact')) {
        const openedChest = this.tryOpenNearbyChest();
        if (openedChest) {
          event.preventDefault();
          return;
        }
        if (this.portalActivated && this.isPlayerNearPortal()) {
          this.advanceDimension();
        } else if (this.portalReady && this.isPlayerNearPortalFrame()) {
          this.ignitePortal('torch');
        }
        event.preventDefault();
      }
      if (this.isKeyForAction(code, 'placeBlock')) {
        this.placeBlock();
        event.preventDefault();
      }
      if (this.isKeyForAction(code, 'toggleCameraPerspective') && !event.repeat) {
        this.toggleCameraPerspective();
        event.preventDefault();
      }
      if (this.isKeyForAction(code, 'toggleCrafting')) {
        const open = this.craftingModal?.hidden !== false;
        this.toggleCraftingModal(open);
        event.preventDefault();
      }
      if (this.isKeyForAction(code, 'toggleInventory')) {
        const open = this.inventoryModal?.hidden !== false;
        this.toggleInventoryModal(open);
        event.preventDefault();
      }
      if (this.isKeyForAction(code, 'closeMenus')) {
        this.toggleCraftingModal(false);
        this.toggleInventoryModal(false);
      }
      const hotbarSlot = this.getHotbarSlotFromKey(code);
      if (hotbarSlot !== null) {
        this.selectHotbarSlot(hotbarSlot, true);
        event.preventDefault();
      }
    }

    handleKeyUp(event) {
      if (event && event.__infiniteRailsHandled) {
        return;
      }
      if (event) {
        event.__infiniteRailsHandled = true;
      }
      this.markInteraction();
      const code = typeof event.code === 'string' ? event.code : '';
      if (code) {
        this.keys.delete(code);
      }
    }

    queueMovementBindingValidation(actionLabel) {
      const diagnostics = this.movementBindingDiagnostics;
      if (!diagnostics) {
        return;
      }
      const anchor = this.getMovementAnchorPosition();
      if (!anchor) {
        diagnostics.pending = false;
        this.validateMovementBindings(null, null);
        return;
      }
      if (!diagnostics.initialPosition) {
        diagnostics.initialPosition = this.THREE?.Vector3 ? new this.THREE.Vector3() : null;
      }
      if (!diagnostics.initialPosition) {
        diagnostics.pending = false;
        this.validateMovementBindings(anchor, null);
        return;
      }
      diagnostics.initialPosition.copy(anchor);
      diagnostics.pending = true;
      diagnostics.triggeredAt = this.getHighResTimestamp();
      diagnostics.key = typeof actionLabel === 'string' ? actionLabel : null;
    }

    getMovementAnchorPosition() {
      if (this.playerRig?.position) {
        return this.playerRig.position;
      }
      if (this.camera?.position) {
        return this.camera.position;
      }
      return null;
    }

    evaluateMovementBindingDiagnostics() {
      const diagnostics = this.movementBindingDiagnostics;
      if (!diagnostics || !diagnostics.pending) {
        return;
      }
      const anchor = this.getMovementAnchorPosition();
      if (!anchor) {
        diagnostics.pending = false;
        this.validateMovementBindings(null, null);
        diagnostics.key = null;
        return;
      }
      if (!diagnostics.initialPosition) {
        diagnostics.initialPosition = anchor.clone ? anchor.clone() : null;
        diagnostics.pending = false;
        diagnostics.key = null;
        return;
      }
      const canMeasureDisplacement =
        diagnostics.initialPosition && typeof anchor.distanceToSquared === 'function';
      const displacementSq = canMeasureDisplacement
        ? anchor.distanceToSquared(diagnostics.initialPosition)
        : null;
      if (Number.isFinite(displacementSq) && displacementSq > 0.0025) {
        diagnostics.pending = false;
        diagnostics.key = null;
        return;
      }
      const now = this.getHighResTimestamp();
      if (now - diagnostics.triggeredAt < diagnostics.timeoutMs) {
        return;
      }
      diagnostics.pending = false;
      this.validateMovementBindings(anchor, displacementSq);
      diagnostics.key = null;
    }

    validateMovementBindings(anchor, displacementSq) {
      const consoleRef = typeof console !== 'undefined' ? console : null;
      if (!consoleRef) {
        return;
      }
      const warn =
        typeof consoleRef.warn === 'function'
          ? consoleRef.warn.bind(consoleRef)
          : typeof consoleRef.error === 'function'
            ? consoleRef.error.bind(consoleRef)
            : typeof consoleRef.log === 'function'
              ? consoleRef.log.bind(consoleRef)
              : null;
      const groupCollapsed =
        typeof consoleRef.groupCollapsed === 'function' ? consoleRef.groupCollapsed.bind(consoleRef) : null;
      const groupEnd = typeof consoleRef.groupEnd === 'function' ? consoleRef.groupEnd.bind(consoleRef) : null;
      const records = Array.isArray(this.boundEventRecords) ? this.boundEventRecords : [];
      const hasDocumentKeydown = records.some(
        (record) => record && record.eventName === 'keydown' && record.targetLabel === 'document',
      );
      const hasDocumentKeyup = records.some(
        (record) => record && record.eventName === 'keyup' && record.targetLabel === 'document',
      );
      const hasWindowKeydown = records.some(
        (record) => record && record.eventName === 'keydown' && record.targetLabel === 'window',
      );
      const hasWindowKeyup = records.some(
        (record) => record && record.eventName === 'keyup' && record.targetLabel === 'window',
      );
      const hasCanvasKeydown = records.some(
        (record) => record && record.eventName === 'keydown' && record.targetLabel === 'canvas',
      );
      const hasCanvasKeyup = records.some(
        (record) => record && record.eventName === 'keyup' && record.targetLabel === 'canvas',
      );
      const summariseVector = (vector) => {
        if (!vector || typeof vector.x !== 'number' || typeof vector.y !== 'number' || typeof vector.z !== 'number') {
          return null;
        }
        return {
          x: Number.parseFloat(vector.x.toFixed(3)),
          y: Number.parseFloat(vector.y.toFixed(3)),
          z: Number.parseFloat(vector.z.toFixed(3)),
        };
      };
      const rigPosition = this.playerRig?.position || null;
      const rigSummary = summariseVector(rigPosition);
      const cameraPosition = this.camera?.position || null;
      const cameraSummary = summariseVector(cameraPosition);
      let avatarWorldSummary = null;
      if (this.playerAvatar && typeof this.playerAvatar.getWorldPosition === 'function' && this.THREE?.Vector3) {
        const probe = new this.THREE.Vector3();
        try {
          this.playerAvatar.getWorldPosition(probe);
          avatarWorldSummary = {
            x: Number.parseFloat(probe.x.toFixed(3)),
            y: Number.parseFloat(probe.y.toFixed(3)),
            z: Number.parseFloat(probe.z.toFixed(3)),
          };
        } catch (error) {
          if (typeof consoleRef.debug === 'function') {
            consoleRef.debug('Unable to read player avatar world position for diagnostics.', error);
          }
        }
      }
      const anchorSummary = summariseVector(anchor);
      const message =
        'Movement diagnostics: input registered but no displacement detected. Verify keyboard listeners and avatar rig transforms.';
      const report = {
        keyboardListeners: {
          document: { keydown: hasDocumentKeydown, keyup: hasDocumentKeyup },
          window: { keydown: hasWindowKeydown, keyup: hasWindowKeyup },
          canvas: { keydown: hasCanvasKeydown, keyup: hasCanvasKeyup },
        },
        displacementSq,
        rig: {
          present: Boolean(this.playerRig),
          position: rigSummary,
          avatarAttached: Boolean(this.playerAvatar && this.playerAvatar.parent === this.playerRig),
        },
        camera: {
          present: Boolean(this.camera),
          position: cameraSummary,
        },
        avatarWorldPosition: avatarWorldSummary,
        anchorPosition: anchorSummary,
      };
      if (!warn) {
        return;
      }
      if (groupCollapsed && groupEnd) {
        groupCollapsed(message);
        warn('Keyboard listener coverage', report.keyboardListeners);
        warn('Rig status', report.rig);
        warn('Camera status', report.camera);
        warn('Avatar mesh position', report.avatarWorldPosition);
        warn('Anchor position', report.anchorPosition);
        warn('Displacement squared', report.displacementSq);
        groupEnd();
      } else {
        warn(message, report);
      }
    }

    handleResize() {
      if (!this.renderer || !this.camera) return;
      const width = this.canvas.clientWidth || window.innerWidth || 1;
      const height = this.canvas.clientHeight || window.innerHeight || 1;
      this.renderer.setSize(width, height, false);
      this.updateCameraFrustum(width, height);
      const touchPreference = this.detectTouchPreferred();
      if (touchPreference !== this.isTouchPreferred) {
        this.isTouchPreferred = touchPreference;
        this.initializeMobileControls();
      }
      this.updatePointerHintForInputMode();
    }

    handleBeforeUnload() {
      this.cancelQueuedModelPreload();
      if (!this.started || this.unloadBeaconSent) {
        return;
      }
      this.unloadBeaconSent = true;
      try {
        this.savePersistentUnlocks();
      } catch (error) {
        console.debug('Failed to persist crafting unlocks before unload', error);
      }
      try {
        this.persistIdentitySnapshot();
      } catch (error) {
        console.debug('Failed to persist identity snapshot before unload', error);
      }
      const summary = this.updateLocalScoreEntry('unload');
      if (!summary || !this.apiBaseUrl) {
        return;
      }
      const baseUrl = typeof this.apiBaseUrl === 'string' ? this.apiBaseUrl.replace(/\/$/, '') : '';
      if (!baseUrl) {
        return;
      }
      const url = `${baseUrl}/scores`;
      const payload = JSON.stringify(summary);
      let delivered = false;
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.sendBeacon) {
        try {
          delivered = nav.sendBeacon(url, payload);
        } catch (error) {
          console.debug('Score beacon sendBeacon failed', error);
          delivered = false;
        }
      }
      if (!delivered && typeof fetch === 'function') {
        try {
          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: payload,
            keepalive: true,
            credentials: 'omit',
          }).catch(() => {});
        } catch (error) {
          console.debug('Score beacon fetch failed', error);
        }
      }
    }

    handleMouseDown(event) {
      if (!this.canvas) return;
      this.markInteraction();
      const isPrimary = event.button === 0;
      const isSecondary = event.button === 2;
      if (!isPrimary && !isSecondary) {
        return;
      }

      const target = event.target;
      const interactedWithCanvas =
        this.pointerLocked ||
        target === this.canvas ||
        (this.canvas?.contains ? this.canvas.contains(target) : false);

      if (!interactedWithCanvas) {
        return;
      }

      event.preventDefault?.();

      const alreadyLocked = this.pointerLocked || this.getPointerLockElement() === this.canvas;
      if (!alreadyLocked) {
        this.attemptPointerLock();
        if (typeof this.canvas?.focus === 'function') {
          try {
            this.canvas.focus({ preventScroll: true });
          } catch (error) {
            this.canvas.focus();
          }
        }
      }

      if (!alreadyLocked && this.pointerLockFallbackActive) {
        this.beginPointerFallbackDrag(event);
      }

      if (isPrimary) {
        this.mineBlock();
      } else if (isSecondary) {
        this.placeBlock();
      }

      if (!alreadyLocked) {
        this.updatePointerHintForInputMode();
      }
    }

    resetPosition() {
      this.velocity.set(0, 0, 0);
      this.verticalVelocity = 0;
      this.isGrounded = false;
      this.positionPlayer();
    }

    attachPlayerToSimulation() {
      this.resetPosition();
      this.isGrounded = true;
      this.prevTime = null;
      this.renderAccumulator = 0;
      if (this.keys && typeof this.keys.clear === 'function') {
        this.keys.clear();
      }
      if (this.joystickVector?.set) {
        this.joystickVector.set(0, 0);
      }
      if (this.touchButtonStates) {
        this.touchButtonStates.up = false;
        this.touchButtonStates.down = false;
        this.touchButtonStates.left = false;
        this.touchButtonStates.right = false;
      }
      this.touchJumpRequested = false;
      this.refreshCameraBaseOffset();
    }

    scheduleNextFrame() {
      if (this.rendererUnavailable || !this.renderer) {
        return;
      }
      if (this.animationFrame !== null) {
        return;
      }
      this.animationFrame = requestAnimationFrame((nextTimestamp) => {
        this.animationFrame = null;
        this.renderFrame(nextTimestamp);
      });
    }

    stepSimulation(delta) {
      if (delta <= 0) {
        return;
      }
      this.elapsed += delta;
      this.updateDayNightCycle();
      this.updateMovement(delta);
      this.updateCameraShake(delta);
      this.updateTerrainCulling(delta);
      this.updateZombies(delta);
      this.updateGolems(delta);
      this.updatePortalAnimation(delta);
      this.updateLootChests(delta);
      this.updateNetheriteChallenge(delta);
      this.updateHands(delta);
      this.updatePlayerAnimation(delta);
      this.updateScoreSync(delta);
      this.updateScoreboardPolling(delta);
    }

    handleRenderLoopError(stage, error) {
      this.animationFrame = null;
      this.prevTime = null;
      if (this.rendererUnavailable) {
        if (typeof console !== 'undefined' && error) {
          const label = stage === 'simulation' ? 'updating the world' : 'rendering the scene';
          console.error(`Render loop error encountered after renderer shutdown while ${label}.`, error);
        }
        return;
      }
      const label = stage === 'simulation' ? 'updating the world' : 'drawing the scene';
      const message = `Rendering paused — a fatal error occurred while ${label}. Reload the page to continue your run.`;
      this.presentRendererFailure(message, { error, stage });
    }

    renderFrame(timestamp) {
      if (this.rendererUnavailable || !this.renderer) {
        this.animationFrame = null;
        return;
      }
      if (!this.isTabVisible) {
        this.prevTime = null;
        this.animationFrame = null;
        return;
      }
      if (!this.prevTime) {
        this.prevTime = timestamp;
      }
      const rawDelta = (timestamp - this.prevTime) / 1000;
      this.prevTime = timestamp;
      if (!Number.isFinite(rawDelta)) {
        this.scheduleNextFrame();
        return;
      }
      const safeDelta = Math.min(0.05, Math.max(0, rawDelta));
      this.renderAccumulator = Math.min(this.renderAccumulator + safeDelta, 0.5);
      const targetInterval = this.isRenderIdle() ? this.renderIdleInterval : this.renderActiveInterval;
      if (this.renderAccumulator + 1e-6 < targetInterval) {
        this.scheduleNextFrame();
        return;
      }
      const maxSteps = Math.min(3, Math.max(1, Math.floor(this.renderAccumulator / targetInterval)));
      const stepDelta = Math.min(0.05, this.renderAccumulator / maxSteps || 0);
      try {
        for (let i = 0; i < maxSteps; i += 1) {
          this.stepSimulation(stepDelta);
        }
      } catch (error) {
        this.handleRenderLoopError('simulation', error);
        return;
      }
      this.renderAccumulator = Math.max(0, this.renderAccumulator - stepDelta * maxSteps);
      try {
        this.renderer.render(this.scene, this.camera);
      } catch (error) {
        this.handleRenderLoopError('render', error);
        return;
      }
      if (!Number.isFinite(this.lastStatePublish) || this.lastStatePublish === null) {
        this.lastStatePublish = 0;
      }
      if (timestamp - this.lastStatePublish >= 250) {
        this.publishStateSnapshot('frame');
        this.lastStatePublish = timestamp;
      }
      this.scheduleNextFrame();
    }

    handleVisibilityChange() {
      if (typeof document === 'undefined') {
        return;
      }
      const hidden = document.visibilityState === 'hidden';
      this.isTabVisible = !hidden;
      if (hidden) {
        this.prevTime = null;
        if (this.animationFrame !== null) {
          cancelAnimationFrame(this.animationFrame);
          this.animationFrame = null;
        }
        this.cancelQueuedModelPreload();
        return;
      }
      if (!this.started || this.rendererUnavailable || !this.renderer) {
        return;
      }
      this.queueCharacterPreload();
      this.prevTime = null;
      if (this.animationFrame === null) {
        const now =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
        this.renderFrame(now);
      }
    }

    verifyWebglSupport() {
      if (typeof document === 'undefined') {
        return true;
      }
      try {
        const probe = document.createElement('canvas');
        const attributeCandidates = [
          { failIfMajorPerformanceCaveat: true, powerPreference: 'high-performance' },
          { powerPreference: 'high-performance' },
          {},
        ];
        let context = null;
        let attributesUsed = null;
        for (const attributes of attributeCandidates) {
          context =
            probe.getContext('webgl2', attributes) ||
            probe.getContext('webgl', attributes) ||
            probe.getContext('experimental-webgl', attributes);
          if (context) {
            attributesUsed = attributes;
            break;
          }
        }
        if (!context) {
          this.emitGameEvent('initialisation-error', {
            stage: 'webgl-probe',
            message:
              'WebGL is unavailable. Enable hardware acceleration or switch to a compatible browser to explore the realms.',
          });
          this.presentRendererFailure(
            'WebGL is unavailable. Enable hardware acceleration or switch to a compatible browser to explore the realms.',
          );
          return false;
        }
        const loseContext = typeof context.getExtension === 'function' ? context.getExtension('WEBGL_lose_context') : null;
        loseContext?.loseContext?.();
        if (typeof console !== 'undefined') {
          const attributeSummary = attributesUsed
            ? Object.entries(attributesUsed)
                .map(([key, value]) => `${key}=${value}`)
                .join(', ')
            : 'default attributes';
          console.info(`WebGL probe succeeded (${attributeSummary}).`);
        }
        return true;
      } catch (error) {
        const errorMessage =
          typeof error?.message === 'string' && error.message.trim().length
            ? error.message.trim()
            : 'Unable to initialise WebGL.';
        this.emitGameEvent('initialisation-error', {
          stage: 'webgl-probe',
          message: 'Unable to initialise WebGL.',
          errorMessage,
          errorName: typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined,
          stack: typeof error?.stack === 'string' && error.stack.trim().length ? error.stack.trim() : undefined,
        });
        this.presentRendererFailure('Unable to initialise WebGL. See console output for troubleshooting steps.', {
          error,
        });
        return false;
      }
    }

    presentRendererFailure(message, details = {}) {
      if (details?.error && typeof console !== 'undefined') {
        console.error(message, details.error);
      } else if (typeof console !== 'undefined') {
        console.error(message);
      }
      this.cancelQueuedModelPreload();
      this.rendererUnavailable = true;
      this.rendererFailureMessage = message;
      if (this.playerHintEl) {
        this.playerHintEl.textContent = message;
      }
      if (this.footerStatusEl) {
        this.footerStatusEl.textContent = message;
      }
      if (this.footerEl) {
        this.footerEl.dataset.state = 'alert';
      }
      if (this.scoreboardStatusEl) {
        this.scoreboardStatusEl.textContent = 'Renderer offline — unable to sync runs.';
      }
      if (this.startButtonEl) {
        this.startButtonEl.disabled = true;
        this.startButtonEl.textContent = 'Renderer unavailable';
        this.startButtonEl.setAttribute('aria-hidden', 'true');
        this.startButtonEl.setAttribute('tabindex', '-1');
      }
      if (this.introModalEl) {
        this.introModalEl.hidden = false;
        this.introModalEl.style.display = 'grid';
        this.introModalEl.setAttribute('aria-hidden', 'false');
      }
      if (this.hudRootEl) {
        this.hudRootEl.classList.add('renderer-unavailable');
      }
      if (this.pointerHintEl) {
        this.pointerHintEl.hidden = true;
        this.pointerHintEl.classList.remove('is-visible');
      }
      const failureDetail = { message: typeof message === 'string' ? message : 'Renderer unavailable' };
      if (details && typeof details === 'object') {
        if (details.stage && typeof details.stage === 'string') {
          failureDetail.stage = details.stage;
        }
        if (details.error) {
          const errorMessage =
            typeof details.error?.message === 'string'
              ? details.error.message
              : String(details.error);
          failureDetail.error = errorMessage;
          if (typeof details.error?.name === 'string' && details.error.name.trim().length) {
            failureDetail.errorName = details.error.name.trim();
          }
          if (typeof details.error?.stack === 'string' && details.error.stack.trim().length) {
            failureDetail.stack = details.error.stack.trim();
          }
        }
        if (!failureDetail.stack && typeof details.errorStack === 'string' && details.errorStack.trim().length) {
          failureDetail.stack = details.errorStack.trim();
        }
        if (!failureDetail.errorName && typeof details.errorName === 'string' && details.errorName.trim().length) {
          failureDetail.errorName = details.errorName.trim();
        }
      }
      this.emitGameEvent('renderer-failure', failureDetail);
      this.publishStateSnapshot('renderer-failure');
    }

    bindWebglContextEvents() {
      if (!this.canvas || this.webglEventsBound) {
        return;
      }
      this.canvas.addEventListener('webglcontextlost', this.onWebglContextLost, false);
      this.canvas.addEventListener('webglcontextrestored', this.onWebglContextRestored, false);
      this.webglEventsBound = true;
    }

    handleWebglContextLost(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      if (this.contextLost) {
        return;
      }
      this.contextLost = true;
      this.rendererUnavailable = true;
      this.prevTime = null;
      if (this.animationFrame !== null) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
      this.presentRendererFailure('Rendering paused — WebGL context lost. Reload the page to continue your run.');
    }

    handleWebglContextRestored() {
      if (typeof console !== 'undefined') {
        console.info('WebGL context restored — refreshing to recover renderer resources.');
      }
      if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
        window.location.reload();
      }
    }

    updateMovement(delta) {
      const THREE = this.THREE;
      const forward = this.tmpForward;
      const right = this.tmpRight;
      const yawOnly = new THREE.Euler(0, this.yaw, 0, 'YXZ');
      forward.set(0, 0, -1).applyEuler(yawOnly);
      if (forward.lengthSq() > 0) forward.normalize();
      const up = this.tmpVector2.set(0, 1, 0);
      right.copy(forward).cross(up);
      if (right.lengthSq() > 0) right.normalize();

      const speed = this.currentSpeed;
      if (this.isActionActive('moveForward')) {
        this.velocity.addScaledVector(forward, speed * delta);
      }
      if (this.isActionActive('moveBackward')) {
        this.velocity.addScaledVector(forward, -speed * delta);
      }
      if (this.isActionActive('moveLeft')) {
        this.velocity.addScaledVector(right, -speed * delta);
      }
      if (this.isActionActive('moveRight')) {
        this.velocity.addScaledVector(right, speed * delta);
      }

      const joystickForward = this.THREE.MathUtils.clamp(-this.joystickVector.y, -1, 1);
      const joystickRight = this.THREE.MathUtils.clamp(this.joystickVector.x, -1, 1);
      const digitalForward = (this.touchButtonStates.up ? 1 : 0) - (this.touchButtonStates.down ? 1 : 0);
      const digitalRight = (this.touchButtonStates.right ? 1 : 0) - (this.touchButtonStates.left ? 1 : 0);
      const combinedForward = this.THREE.MathUtils.clamp(joystickForward + digitalForward, -1, 1);
      const combinedRight = this.THREE.MathUtils.clamp(joystickRight + digitalRight, -1, 1);
      if (Math.abs(combinedForward) > 0.001) {
        this.velocity.addScaledVector(forward, speed * delta * combinedForward);
      }
      if (Math.abs(combinedRight) > 0.001) {
        this.velocity.addScaledVector(right, speed * delta * combinedRight);
      }

      this.velocity.multiplyScalar(PLAYER_INERTIA);

      const cameraPitch = this.pitch;
      const cameraQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(cameraPitch, 0, 0, 'YXZ'));
      if (this.playerRig) {
        this.playerRig.rotation.y = this.yaw;
      }
      if (this.camera) {
        this.camera.quaternion.copy(cameraQuaternion);
      }

      const position = this.playerRig ? this.playerRig.position : this.camera.position;
      position.add(this.velocity);

      const groundHeight = this.sampleGroundHeight(position.x, position.z);
      if ((this.isActionActive('jump') || this.touchJumpRequested) && this.isGrounded) {
        const jumpBoost = 4.6 + (1.5 - Math.min(1.5, this.gravityScale));
        this.verticalVelocity = jumpBoost;
        this.isGrounded = false;
      }
      this.touchJumpRequested = false;
      const gravityForce = 22 * this.gravityScale;
      this.verticalVelocity -= gravityForce * delta;
      position.y += this.verticalVelocity * delta;
      const desiredHeight = groundHeight + PLAYER_EYE_HEIGHT;
      if (position.y <= desiredHeight) {
        position.y = desiredHeight;
        this.verticalVelocity = 0;
        this.isGrounded = true;
      }

      const maxDistance = (WORLD_SIZE / 2 - 2) * BLOCK_SIZE;
      position.x = THREE.MathUtils.clamp(position.x, -maxDistance, maxDistance);
      position.z = THREE.MathUtils.clamp(position.z, -maxDistance, maxDistance);

      this.evaluateMovementBindingDiagnostics();
    }

    updateCameraShake(delta) {
      if (!this.camera || !this.cameraBaseOffset) {
        return;
      }
      if (this.cameraShakeIntensity <= 0 || this.cameraShakeDuration <= 0) {
        this.camera.position.copy(this.cameraBaseOffset);
        this.cameraShakeOffset.set(0, 0, 0);
        this.cameraShakeRotation.set(0, 0, 0);
        this.cameraShakeDuration = 0;
        this.cameraShakeTime = 0;
        return;
      }
      this.cameraShakeTime += delta;
      const progress = this.cameraShakeDuration > 0 ? this.cameraShakeTime / this.cameraShakeDuration : 1;
      if (progress >= 1) {
        this.cameraShakeIntensity = 0;
        this.cameraShakeOffset.set(0, 0, 0);
        this.cameraShakeRotation.set(0, 0, 0);
        this.camera.position.copy(this.cameraBaseOffset);
        this.cameraShakeDuration = 0;
        this.cameraShakeTime = 0;
        return;
      }
      const falloff = (1 - progress) * (1 - progress);
      const strength = this.cameraShakeIntensity * falloff;
      this.cameraShakeNoise.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      this.cameraShakeOffset.copy(this.cameraShakeNoise).multiplyScalar(0.08 * strength);
      this.camera.position.copy(this.cameraBaseOffset).add(this.cameraShakeOffset);
      this.cameraShakeRotation.set(this.cameraShakeOffset.y * 0.6, -this.cameraShakeOffset.x * 1.1, 0);
      this.tmpQuaternion.setFromEuler(this.cameraShakeRotation);
      this.camera.quaternion.multiply(this.tmpQuaternion);
    }

    triggerCameraImpulse(strength = 0.35, duration = 0.25) {
      if (!this.camera || !this.cameraBaseOffset) {
        return;
      }
      this.cameraShakeIntensity = Math.min(1.6, Math.max(strength, this.cameraShakeIntensity * 0.6 + strength));
      this.cameraShakeDuration = Math.max(duration, 0.12);
      this.cameraShakeTime = 0;
    }

    updateHands(delta) {
      if (!this.handGroup || !this.handGroup.visible) return;
      const THREE = this.THREE;
      const speed = this.velocity.length();
      const target = Math.min(1, speed * 3.2 + (this.isGrounded ? 0 : 0.25));
      this.handSwingStrength = THREE.MathUtils.lerp(this.handSwingStrength, target, delta * 6.5);
      this.handSwingTimer += delta * (4 + speed * 3);
      const bob = Math.sin(this.handSwingTimer) * 0.05 * this.handSwingStrength;
      const sway = Math.cos(this.handSwingTimer * 0.5) * 0.08 * this.handSwingStrength;
      this.handGroup.position.set(0.42 + sway, -0.46 + bob, -0.8);
      this.handGroup.rotation.set(-0.55 + bob * 1.8, sway * 0.6, sway * 0.15);
    }

    updatePlayerAnimation(delta) {
      if (!this.playerMixer) return;
      this.playerMixer.update(delta);
    }

    updateScoreSync(delta) {
      if (!this.apiBaseUrl) return;
      this.scoreSyncHeartbeat += delta;
      const now = performance.now();
      if (this.pendingScoreSyncReason && !this.scoreSyncInFlight) {
        if (now - this.lastScoreSyncAt > this.scoreSyncCooldownSeconds * 1000) {
          this.flushScoreSync();
        }
        return;
      }
      if (
        !this.scoreSyncInFlight &&
        this.scoreSyncHeartbeat >= this.scoreSyncCooldownSeconds * 2 &&
        now - this.lastScoreSyncAt > this.scoreSyncCooldownSeconds * 1000
      ) {
        this.flushScoreSync(true);
        this.scoreSyncHeartbeat = 0;
      }
    }

    updateTerrainCulling(delta) {
      if (!this.camera || !this.terrainChunkGroups.length) {
        return;
      }
      this.terrainCullingAccumulator += delta;
      if (this.terrainCullingAccumulator < this.terrainCullingInterval) {
        return;
      }
      this.camera.updateMatrixWorld();
      const cameraPosition = this.camera.getWorldPosition
        ? this.camera.getWorldPosition(this.tmpVector3)
        : this.getCameraWorldPosition(this.tmpVector3);
      let cameraQuaternion = null;
      if (typeof this.camera.getWorldQuaternion === 'function') {
        cameraQuaternion = this.camera.getWorldQuaternion(this.tmpQuaternion);
      } else if (this.camera.quaternion) {
        cameraQuaternion = this.tmpQuaternion.copy(this.camera.quaternion);
      }
      const hasDirtyChunks = this.dirtyTerrainChunks.size > 0;
      let cameraMoved = !this.lastCullingCameraValid;
      if (!cameraMoved) {
        const positionDelta = cameraPosition.distanceToSquared(this.lastCullingCameraPosition);
        if (positionDelta > TERRAIN_CULLING_POSITION_EPSILON_SQ) {
          cameraMoved = true;
        } else if (cameraQuaternion) {
          const dot = Math.abs(cameraQuaternion.dot(this.lastCullingCameraQuaternion));
          if (1 - dot > TERRAIN_CULLING_ROTATION_EPSILON) {
            cameraMoved = true;
          }
        }
      }
      if (!cameraMoved && !hasDirtyChunks) {
        this.terrainCullingAccumulator = 0;
        return;
      }
      this.terrainCullingAccumulator = 0;
      if (hasDirtyChunks) {
        this.refreshDirtyTerrainChunks();
      }
      this.chunkFrustumMatrix.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      );
      this.chunkFrustum.setFromProjectionMatrix(this.chunkFrustumMatrix);
      for (const chunk of this.terrainChunkGroups) {
        const sphere = chunk.userData?.boundingSphere;
        if (!sphere) {
          chunk.visible = true;
          continue;
        }
        chunk.visible = this.chunkFrustum.intersectsSphere(sphere);
      }
      this.lastCullingCameraPosition.copy(cameraPosition);
      if (cameraQuaternion) {
        this.lastCullingCameraQuaternion.copy(cameraQuaternion);
      }
      this.lastCullingCameraValid = true;
      if (this.debugChunkCulling) {
        const visibleCount = this.terrainChunkGroups.reduce(
          (total, chunk) => total + (chunk.visible ? 1 : 0),
          0,
        );
        const now = performance.now();
        if (!this.lastCullingDebugLog || now - this.lastCullingDebugLog > 500) {
          console.debug(`[Chunks] visible ${visibleCount}/${this.terrainChunkGroups.length}`);
          this.lastCullingDebugLog = now;
        }
      }
    }

    sampleGroundHeight(x, z) {
      const gridX = Math.round(x / BLOCK_SIZE + WORLD_SIZE / 2);
      const gridZ = Math.round(z / BLOCK_SIZE + WORLD_SIZE / 2);
      const height = this.heightMap[gridX]?.[gridZ] ?? 0;
      return height * BLOCK_SIZE;
    }

    updateDayNightCycle() {
      const THREE = this.THREE;
      if (!this.sunLight || !this.hemiLight || !THREE?.MathUtils) return;
      const cycle = (this.elapsed % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
      const sunAngle = cycle * Math.PI * 2;
      const sunElevation = Math.sin(sunAngle);
      const dayStrength = THREE.MathUtils.clamp((sunElevation + 1) / 2, 0, 1);
      this.daylightIntensity = dayStrength;

      const sunRadius = 70;
      const sunHeight = 12 + Math.max(0, sunElevation * 48);
      this.sunLight.position.set(
        Math.cos(sunAngle) * sunRadius,
        sunHeight,
        Math.sin(sunAngle) * sunRadius * 0.7,
      );
      this.sunLight.target.position.set(0, 0, 0);
      this.sunLight.target.updateMatrixWorld();
      this.sunLight.intensity = 0.35 + dayStrength * 1.1;
      const warmFactor = THREE.MathUtils.clamp(1 - Math.abs(sunElevation) * 1.1, 0, 1);
      this.tmpColorA.copy(this.daySunColor);
      this.tmpColorB.copy(this.duskSkyColor);
      this.tmpColorA.lerp(this.tmpColorB, warmFactor * 0.5);
      this.tmpColorA.offsetHSL(0, -0.05 * (1 - dayStrength), (dayStrength - 0.5) * 0.2);
      this.sunLight.color.copy(this.tmpColorA);

      const moonAngle = sunAngle + Math.PI;
      const moonElevation = Math.sin(moonAngle);
      const nightStrength = THREE.MathUtils.clamp((moonElevation + 1) / 2, 0, 1);
      if (this.moonLight) {
        const moonRadius = 70;
        const moonHeight = 10 + Math.max(0, moonElevation * 38);
        this.moonLight.position.set(
          Math.cos(moonAngle) * moonRadius,
          moonHeight,
          Math.sin(moonAngle) * moonRadius * 0.7,
        );
        this.moonLight.target.position.set(0, 0, 0);
        this.moonLight.target.updateMatrixWorld();
        this.moonLight.intensity = 0.12 + nightStrength * 0.45;
        this.tmpColorA.copy(this.nightMoonColor);
        this.tmpColorB.copy(this.duskSkyColor);
        this.tmpColorA.lerp(this.tmpColorB, Math.max(0, 0.6 - nightStrength) * 0.35);
        this.moonLight.color.copy(this.tmpColorA);
      }

      if (this.ambientLight) {
        const ambientStrength = 0.18 + dayStrength * 0.36;
        this.ambientLight.intensity = ambientStrength;
        this.tmpColorA
          .copy(this.nightSkyColor)
          .lerp(this.daySkyColor, Math.min(1, dayStrength * 0.85 + 0.15));
        this.ambientLight.color.copy(this.tmpColorA);
      }

      this.hemiLight.intensity = 0.42 + dayStrength * 0.58;
      this.hemiLight.color.lerpColors(this.nightSkyColor, this.daySkyColor, dayStrength);
      if (this.hemiLight.groundColor) {
        this.tmpColorB.copy(this.nightGroundColor).lerp(this.dayGroundColor, dayStrength);
        this.hemiLight.groundColor.copy(this.tmpColorB);
      }

      const horizonGlow = THREE.MathUtils.clamp(1 - Math.abs(sunElevation) * 1.6, 0, 1);
      const fogBlend = Math.min(1, dayStrength * 0.85 + 0.15);
      this.tmpColorA.copy(this.nightSkyColor).lerp(this.daySkyColor, dayStrength);
      if (horizonGlow > 0) {
        this.tmpColorB.copy(this.duskSkyColor);
        this.tmpColorA.lerp(this.tmpColorB, horizonGlow * 0.6);
      }
      if (this.scene?.background) {
        this.scene.background.copy(this.tmpColorA);
      }

      if (this.scene?.fog) {
        this.tmpColorB.copy(this.nightFogColor).lerp(this.dayFogColor, fogBlend);
        if (horizonGlow > 0.2) {
          this.tmpColorB.lerp(this.duskSkyColor, horizonGlow * 0.25);
        }
        this.scene.fog.color.copy(this.tmpColorB);
      }

      if (this.ui?.timeEl) {
        const daylight = Math.round(dayStrength * 100);
        let label = 'Daylight';
        if (dayStrength < 0.32) {
          label = dayStrength < 0.16 ? 'Nightfall (Midnight)' : 'Nightfall';
        } else if (dayStrength < 0.52) {
          label = 'Dawn';
        } else if (dayStrength > 0.82) {
          label = 'High Sun';
        }
        this.ui.timeEl.textContent = `${label} ${daylight}%`;
      }
    }

    updatePortalAnimation(delta) {
      if (!this.portalMesh) return;
      const material = this.portalMesh.material;
      if (material?.uniforms?.uTime) {
        material.uniforms.uTime.value += delta * 1.2;
      }
    }

    updateZombies(delta) {
      const zombieGroup = this.ensureEntityGroup('zombie');
      if (!zombieGroup) return;
      const THREE = this.THREE;
      if (!this.isNight()) {
        if (this.zombies.length) {
          this.clearZombies();
        }
        return;
      }
      if (this.elapsed - this.lastZombieSpawn > ZOMBIE_SPAWN_INTERVAL && this.zombies.length < ZOMBIE_MAX_PER_DIMENSION) {
        this.spawnZombie();
        this.lastZombieSpawn = this.elapsed;
      }
      const playerPosition = this.getCameraWorldPosition(this.tmpVector3);
      const tmpDir = this.tmpVector;
      const tmpStep = this.tmpVector2;
      for (const zombie of this.zombies) {
        const { mesh } = zombie;
        tmpDir.subVectors(playerPosition, mesh.position);
        const distance = tmpDir.length();
        if (distance > 0.001) {
          tmpDir.normalize();
          tmpStep.copy(tmpDir).multiplyScalar(zombie.speed * delta);
          mesh.position.add(tmpStep);
          mesh.rotation.y = Math.atan2(tmpDir.x, tmpDir.z);
        }
        const groundHeight = this.sampleGroundHeight(mesh.position.x, mesh.position.z);
        mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, groundHeight + 0.9, delta * 10);
        if (distance < ZOMBIE_CONTACT_RANGE && this.elapsed - zombie.lastAttack > 1.2) {
          this.damagePlayer(1);
          zombie.lastAttack = this.elapsed;
        }
      }
    }

    isNight() {
      return this.daylightIntensity < 0.32;
    }

    spawnZombie() {
      const THREE = this.THREE;
      const zombieGroup = this.ensureEntityGroup('zombie');
      if (!THREE || !zombieGroup) return;
      if (!Array.isArray(this.zombies)) {
        this.zombies = [];
      }
      const id = (this.zombieIdCounter += 1);
      const angle = Math.random() * Math.PI * 2;
      const radius = WORLD_SIZE * 0.45;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const ground = this.sampleGroundHeight(x, z);
      if (!this.zombieGeometry) {
        this.zombieGeometry = new THREE.BoxGeometry(0.9, 1.8, 0.9);
      }
      const material = this.materials.zombie.clone();
      material.color.offsetHSL(0, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
      const mesh = new THREE.Mesh(this.zombieGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(x, ground + 0.9, z);
      zombieGroup.add(mesh);
      const zombie = { id, mesh, speed: 2.4, lastAttack: this.elapsed, placeholder: true };
      this.zombies.push(zombie);
      this.upgradeZombie(zombie);
      console.error(
        'Zombie spawn and chase triggered. If AI stalls or pathfinding breaks, validate the navmesh and spawn configuration.',
      );
    }

    clearZombies() {
      for (const zombie of this.zombies) {
        this.zombieGroup.remove(zombie.mesh);
        disposeObject3D(zombie.mesh);
      }
      this.zombieGroup.clear();
      this.zombies = [];
    }

    removeZombie(target) {
      if (!target) return;
      const index = this.zombies.indexOf(target);
      if (index >= 0) {
        this.zombies.splice(index, 1);
      }
      this.zombieGroup.remove(target.mesh);
      disposeObject3D(target.mesh);
    }

    findNearestZombie(position) {
      if (!position) return null;
      let best = null;
      let bestDistance = Infinity;
      for (const zombie of this.zombies) {
        const distance = position.distanceTo(zombie.mesh.position);
        if (distance < bestDistance) {
          best = zombie;
          bestDistance = distance;
        }
      }
      return best;
    }

    ensureEntityGroup(kind) {
      if (!kind) {
        return null;
      }
      const THREE =
        this.THREE ||
        (typeof globalThis !== 'undefined' && globalThis.THREE ? globalThis.THREE : null) ||
        (typeof window !== 'undefined' && window.THREE ? window.THREE : null);
      if (!THREE || typeof THREE.Group !== 'function') {
        return null;
      }
      const property = `${kind}Group`;
      let group = this[property];
      if (!(group instanceof THREE.Group)) {
        group = new THREE.Group();
        group.name = `${kind.charAt(0).toUpperCase() + kind.slice(1)}Group`;
        this[property] = group;
      }
      if (group.parent && group.parent !== this.scene && typeof group.parent.remove === 'function') {
        group.parent.remove(group);
      }
      if (this.scene && group.parent !== this.scene && typeof this.scene.add === 'function') {
        this.scene.add(group);
      }
      return group;
    }

    createGolemActor() {
      const THREE = this.THREE;
      if (!THREE) return null;
      const group = new THREE.Group();
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#d9c9a7', roughness: 0.7, metalness: 0.1 });
      const accentMaterial = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff7043', emissiveIntensity: 0.3 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.6), bodyMaterial);
      body.position.y = 0.8;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), bodyMaterial.clone());
      head.position.y = 1.6;
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.02), accentMaterial);
      eye.position.set(0, 1.6, 0.32);
      const armGeometry = new THREE.BoxGeometry(0.28, 0.9, 0.28);
      const leftArm = new THREE.Mesh(armGeometry, bodyMaterial.clone());
      leftArm.position.set(-0.65, 0.6, 0);
      const rightArm = new THREE.Mesh(armGeometry, bodyMaterial.clone());
      rightArm.position.set(0.65, 0.6, 0);
      const legGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
      const leftLeg = new THREE.Mesh(legGeometry, bodyMaterial.clone());
      leftLeg.position.set(-0.25, 0.1, 0);
      const rightLeg = new THREE.Mesh(legGeometry, bodyMaterial.clone());
      rightLeg.position.set(0.25, 0.1, 0);
      [body, head, eye, leftArm, rightArm, leftLeg, rightLeg].forEach((mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      });
      return group;
    }

    spawnGolem() {
      const THREE = this.THREE;
      const golemGroup = this.ensureEntityGroup('golem');
      if (!THREE || !golemGroup) return;
      if (!Array.isArray(this.golems)) {
        this.golems = [];
      }
      if (this.golems.length >= GOLEM_MAX_PER_DIMENSION) return;
      const actor = this.createGolemActor();
      if (!actor) return;
      const base = this.getCameraWorldPosition(this.tmpVector3);
      const angle = Math.random() * Math.PI * 2;
      const radius = 6 + Math.random() * 4;
      const x = base.x + Math.cos(angle) * radius;
      const z = base.z + Math.sin(angle) * radius;
      const ground = this.sampleGroundHeight(x, z);
      actor.position.set(x, ground + 1, z);
      golemGroup.add(actor);
      const golem = {
        id: `golem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        mesh: actor,
        cooldown: 0,
        speed: 3.1,
        placeholder: true,
      };
      this.golems.push(golem);
      this.upgradeGolem(golem);
      this.lastGolemSpawn = this.elapsed;
      this.showHint('An iron golem joins your defense.');
    }

    updateGolems(delta) {
      const golemGroup = this.ensureEntityGroup('golem');
      if (!golemGroup) return;
      const shouldSpawnGuard = this.isNight() || this.zombies.length > 0;
      if (
        shouldSpawnGuard &&
        this.elapsed - this.lastGolemSpawn > GOLEM_SPAWN_INTERVAL &&
        this.golems.length < GOLEM_MAX_PER_DIMENSION
      ) {
        this.spawnGolem();
      }
      if (!this.golems.length) return;
      const THREE = this.THREE;
      const playerPosition = this.getCameraWorldPosition(this.tmpVector3);
      for (const golem of this.golems) {
        golem.cooldown = Math.max(0, golem.cooldown - delta);
        const target = this.findNearestZombie(golem.mesh.position) ?? null;
        const destination = target?.mesh?.position ?? playerPosition;
        if (destination) {
          this.tmpVector.subVectors(destination, golem.mesh.position);
          const distance = this.tmpVector.length();
          if (distance > 0.001) {
            this.tmpVector.normalize();
            this.tmpVector2.copy(this.tmpVector).multiplyScalar(golem.speed * delta);
            golem.mesh.position.add(this.tmpVector2);
            golem.mesh.rotation.y = Math.atan2(this.tmpVector.x, this.tmpVector.z);
          }
          const ground = this.sampleGroundHeight(golem.mesh.position.x, golem.mesh.position.z);
          golem.mesh.position.y = THREE.MathUtils.lerp(golem.mesh.position.y, ground + 1.1, delta * 8);
          if (target && distance < GOLEM_CONTACT_RANGE && golem.cooldown <= 0) {
            this.removeZombie(target);
            golem.cooldown = 1.1;
            this.score += 0.5;
            this.addScoreBreakdown('combat', 0.5);
            this.updateHud();
            this.audio.play('zombieGroan', { volume: 0.3 });
            this.showHint('Iron golem smashed a zombie!');
            this.scheduleScoreSync('golem-defense');
          }
        }
      }
      this.golems = this.golems.filter((golem) => golem.mesh.parent === this.golemGroup);
    }

    clearGolems() {
      if (!this.golems.length) return;
      for (const golem of this.golems) {
        this.golemGroup.remove(golem.mesh);
        disposeObject3D(golem.mesh);
      }
      this.golemGroup?.clear?.();
      this.golems = [];
    }

    damagePlayer(amount) {
      const previous = this.health;
      this.health = Math.max(0, this.health - amount);
      if (this.health !== previous) {
        this.updateHud();
        this.audio.play('crunch', { volume: 0.55 + Math.random() * 0.2 });
        this.triggerCameraImpulse(0.6, 0.4);
      }
      if (this.health <= 0) {
        this.handleDefeat();
      }
    }

    handleDefeat() {
      this.health = FALLBACK_HEALTH;
      const penalty = Math.min(4, Math.max(0, this.score ?? 0));
      if (penalty > 0) {
        this.addScoreBreakdown('penalties', penalty);
      }
      this.score = Math.max(0, this.score - 4);
      this.verticalVelocity = 0;
      this.isGrounded = false;
      this.positionPlayer();
      this.clearZombies();
      this.lastZombieSpawn = this.elapsed;
      this.clearGolems();
      this.lastGolemSpawn = this.elapsed;
      this.updateHud();
      this.scheduleScoreSync('respawn');
      this.audio.play('bubble', { volume: 0.45 });
      console.error(
        'Respawn handler invoked. Ensure checkpoint logic restores player position, inventory, and status effects as expected.',
      );
    }

    mineBlock() {
      const intersections = this.castFromCamera();
      if (!intersections.length) return;
      const hit = intersections.find((intersection) => intersection.object?.userData?.columnKey);
      if (!hit) return;
      const mesh = hit.object;
      const columnKey = mesh.userData.columnKey;
      const column = this.columns.get(columnKey);
      if (!column || !column.length) return;
      const top = column[column.length - 1];
      if (top !== mesh) {
        return;
      }
      column.pop();
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      } else {
        this.terrainGroup.remove(mesh);
      }
      const removedChunkKey = mesh.userData?.chunkKey || this.getTerrainChunkKey(mesh.userData.gx, mesh.userData.gz);
      this.markTerrainChunkDirty(removedChunkKey);
      this.blocksMined += 1;
      const blockType = mesh.userData.blockType || 'stone';
      const blockScore = blockType === 'stone' ? 1 : 0.75;
      this.score += blockScore;
      this.addScoreBreakdown('exploration', blockScore);
      this.heightMap[mesh.userData.gx][mesh.userData.gz] = column.length;
      if (column.length) {
        const newTop = column[column.length - 1];
        newTop.material = this.materials.grass;
        newTop.userData.blockType = 'grass-block';
      }
      this.updatePortalFrameStateForColumn(mesh.userData.gx, mesh.userData.gz);
      const drops = this.getDropsForBlock(blockType);
      if (drops.length) {
        this.collectDrops(drops);
      }
      this.updateHud();
      this.audio.playRandom(['miningA', 'miningB'], {
        volume: 0.45 + Math.random() * 0.2,
        rate: 0.92 + Math.random() * 0.12,
      });
      this.triggerCameraImpulse(0.45, 0.22);
    }

    placeBlock() {
      const intersections = this.castFromCamera();
      if (!intersections.length) return;
      const hit = intersections.find((intersection) => intersection.object?.userData?.columnKey);
      if (!hit) return;
      const mesh = hit.object;
      const { columnKey, gx, gz } = mesh.userData;
      const column = this.columns.get(columnKey) ?? [];
      const newLevel = column.length;
      const worldX = mesh.position.x;
      const worldZ = mesh.position.z;
      if (newLevel >= 12) {
        this.showHint('Column at maximum height. Try another spot.');
        return;
      }
      const allowed = new Set(['grass-block', 'dirt', 'stone']);
      const consumed = this.useSelectedItem({ allow: allowed });
      if (!consumed) {
        this.showHint('Select a block in your hotbar to place it.');
        return;
      }
      const blockType = consumed;
      const material = this.getMaterialForBlock(blockType);
      if (column.length) {
        const prevTop = column[column.length - 1];
        if (prevTop) {
          prevTop.material = this.materials.dirt;
          prevTop.userData.blockType = 'dirt';
        }
      }
      const chunkKey = this.getTerrainChunkKey(gx, gz);
      const chunk = this.ensureTerrainChunk(chunkKey);
      const newMesh = new this.THREE.Mesh(this.blockGeometry, material);
      newMesh.castShadow = true;
      newMesh.receiveShadow = true;
      newMesh.position.set(worldX, newLevel * BLOCK_SIZE + BLOCK_SIZE / 2, worldZ);
      newMesh.matrixAutoUpdate = false;
      newMesh.updateMatrix();
      newMesh.userData = { columnKey, level: newLevel, gx, gz, blockType, chunkKey };
      chunk.add(newMesh);
      this.markTerrainChunkDirty(chunkKey);
      column.push(newMesh);
      this.columns.set(columnKey, column);
      this.heightMap[gx][gz] = column.length;
      this.blocksPlaced += 1;
      const placementPenalty = Math.min(0.25, Math.max(0, this.score ?? 0));
      if (placementPenalty > 0) {
        this.addScoreBreakdown('penalties', placementPenalty);
      }
      this.score = Math.max(0, this.score - 0.25);
      this.updatePortalFrameStateForColumn(gx, gz);
      this.updateHud();
      this.audio.play('crunch', { volume: 0.4 + Math.random() * 0.15 });
      this.triggerCameraImpulse(0.32, 0.18);
    }

    castFromCamera() {
      const THREE = this.THREE;
      if (!this.camera) return [];
      const origin = this.getCameraWorldPosition(this.tmpVector3);
      const direction = this.getCameraWorldDirection(this.tmpVector);
      this.raycaster.set(origin, direction.normalize());
      return this.raycaster.intersectObjects(this.terrainGroup.children, true);
    }

    getMaterialForBlock(blockType) {
      if (blockType === 'grass-block') return this.materials.grass;
      if (blockType === 'dirt') return this.materials.dirt;
      return this.materials.stone;
    }

    getDropsForBlock(blockType) {
      const drops = [];
      if (blockType === 'grass-block') {
        drops.push({ item: 'grass-block', quantity: 1 });
        if (Math.random() < 0.35) {
          drops.push({ item: 'stick', quantity: 1 });
        }
      } else if (blockType === 'dirt') {
        drops.push({ item: 'dirt', quantity: 1 });
        if (Math.random() < 0.15) {
          drops.push({ item: 'stick', quantity: 1 });
        }
      } else if (blockType === 'stone') {
        drops.push({ item: 'stone', quantity: 1 });
        if (this.currentDimensionIndex >= 2 && Math.random() < 0.18) {
          drops.push({ item: 'portal-charge', quantity: 1 });
        }
      } else {
        drops.push({ item: blockType, quantity: 1 });
      }
      return drops;
    }

    collectDrops(drops = []) {
      let collectedAny = false;
      drops.forEach(({ item, quantity }) => {
        if (!item || quantity <= 0) return;
        const accepted = this.addItemToInventory(item, quantity);
        if (accepted) {
          collectedAny = true;
        }
      });
      if (collectedAny) {
        this.updateHud();
      }
    }

    getCameraWorldPosition(target) {
      const THREE = this.THREE;
      const destination = target ?? (THREE ? new THREE.Vector3() : { x: 0, y: 0, z: 0 });
      if (this.camera?.getWorldPosition) {
        this.camera.getWorldPosition(destination);
        return destination;
      }
      if (this.playerRig) {
        destination.copy?.(this.playerRig.position);
        if (!destination.copy) {
          destination.x = this.playerRig.position.x;
          destination.y = this.playerRig.position.y;
          destination.z = this.playerRig.position.z;
        }
        return destination;
      }
      if (destination.set) {
        destination.set(0, 0, 0);
      } else {
        destination.x = 0;
        destination.y = 0;
        destination.z = 0;
      }
      return destination;
    }

    getCameraWorldDirection(target) {
      const THREE = this.THREE;
      const destination = target ?? (THREE ? new THREE.Vector3() : { x: 0, y: 0, z: -1 });
      if (this.camera?.getWorldDirection) {
        this.camera.getWorldDirection(destination);
        if (destination.normalize) destination.normalize();
        return destination;
      }
      if (this.camera?.quaternion && destination.set) {
        destination.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
        return destination;
      }
      if (destination.set) {
        destination.set(0, 0, -1);
      } else {
        destination.x = 0;
        destination.y = 0;
        destination.z = -1;
      }
      return destination;
    }

    addItemToInventory(item, quantity = 1) {
      if (!item || quantity <= 0) return false;
      let remaining = quantity;
      for (let i = 0; i < this.hotbar.length && remaining > 0; i += 1) {
        const slot = this.hotbar[i];
        if (slot.item === item && slot.quantity < MAX_STACK_SIZE) {
          const add = Math.min(MAX_STACK_SIZE - slot.quantity, remaining);
          slot.quantity += add;
          remaining -= add;
        }
      }
      for (let i = 0; i < this.hotbar.length && remaining > 0; i += 1) {
        const slot = this.hotbar[i];
        if (!slot.item) {
          const add = Math.min(MAX_STACK_SIZE, remaining);
          slot.item = item;
          slot.quantity = add;
          remaining -= add;
        }
      }
      if (remaining > 0) {
        const existing = this.satchel.get(item) ?? 0;
        this.satchel.set(item, existing + remaining);
        remaining = 0;
      }
      if (remaining === 0) {
        this.updateInventoryUi();
        return true;
      }
      return false;
    }

    removeItemFromInventory(item, quantity = 1) {
      if (!item || quantity <= 0) return 0;
      let remaining = quantity;
      for (let i = 0; i < this.hotbar.length && remaining > 0; i += 1) {
        const slot = this.hotbar[i];
        if (slot.item !== item) continue;
        const take = Math.min(slot.quantity, remaining);
        slot.quantity -= take;
        remaining -= take;
        if (slot.quantity <= 0) {
          slot.item = null;
          slot.quantity = 0;
        }
      }
      if (remaining > 0) {
        const available = this.satchel.get(item) ?? 0;
        const take = Math.min(available, remaining);
        if (take > 0) {
          this.satchel.set(item, available - take);
          remaining -= take;
        }
        if (this.satchel.get(item) === 0) {
          this.satchel.delete(item);
        }
      }
      if (remaining > 0) {
        return quantity - remaining;
      }
      this.updateInventoryUi();
      return quantity;
    }

    useSelectedItem({ allow } = {}) {
      const slot = this.hotbar[this.selectedHotbarIndex];
      if (!slot?.item || slot.quantity <= 0) {
        return null;
      }
      if (allow instanceof Set && !allow.has(slot.item)) {
        return null;
      }
      const item = slot.item;
      slot.quantity -= 1;
      if (slot.quantity <= 0) {
        slot.item = null;
        slot.quantity = 0;
        this.refillHotbarSlot(this.selectedHotbarIndex, item);
      }
      this.updateInventoryUi();
      return item;
    }

    refillHotbarSlot(index, item) {
      if (!item) return;
      const available = this.satchel.get(item);
      if (!available) return;
      const slot = this.hotbar[index];
      const take = Math.min(MAX_STACK_SIZE, available);
      slot.item = item;
      slot.quantity = take;
      this.satchel.set(item, available - take);
      if (this.satchel.get(item) === 0) {
        this.satchel.delete(item);
      }
    }

    getTotalInventoryCount() {
      const hotbarTotal = this.hotbar.reduce((sum, slot) => sum + (slot.quantity || 0), 0);
      let satchelTotal = 0;
      this.satchel.forEach((value) => {
        satchelTotal += value;
      });
      return hotbarTotal + satchelTotal;
    }

    updateInventoryUi() {
      this.activeHotbarDrag = null;
      this.updateHotbarUi();
      this.updateCraftingInventoryUi();
      this.updateInventoryModal();
      this.updateExtendedInventoryUi();
      this.updateHotbarExpansionUi();
      this.updateCraftButtonState();
    }

    updateHotbarUi() {
      if (!this.hotbarEl) return;
      const fragment = document.createDocumentFragment();
      this.hotbar.forEach((slot, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hotbar-slot';
        button.dataset.hotbarSlot = String(index);
        const isActive = index === this.selectedHotbarIndex;
        button.dataset.active = isActive ? 'true' : 'false';
        if (slot?.item) {
          const def = getItemDefinition(slot.item);
          button.textContent = `${def.icon} ${slot.quantity}`;
          button.setAttribute('aria-label', formatInventoryLabel(slot.item, slot.quantity));
          button.setAttribute('draggable', 'true');
          const hints = [];
          if (def.description) {
            hints.push(def.description);
          }
          hints.push('Click to equip • Drag to reorder');
          button.setAttribute('data-hint', `${hints.join(' — ')} (×${slot.quantity})`);
          button.addEventListener('dragstart', this.onHotbarDragStart);
        } else {
          button.textContent = '·';
          button.setAttribute('aria-label', 'Empty slot');
          button.setAttribute('draggable', 'false');
          button.setAttribute('data-hint', 'Empty slot — gather resources to fill your hotbar.');
        }
        button.addEventListener('dragenter', this.onHotbarDragEnter);
        button.addEventListener('dragover', this.onHotbarDragOver);
        button.addEventListener('dragleave', this.onHotbarDragLeave);
        button.addEventListener('drop', this.onHotbarDrop);
        button.addEventListener('dragend', this.onHotbarDragEnd);
        fragment.appendChild(button);
      });
      this.hotbarEl.innerHTML = '';
      this.hotbarEl.appendChild(fragment);
    }

    clearHotbarDragIndicators() {
      if (!this.hotbarEl) return;
      this.hotbarEl
        .querySelectorAll('.hotbar-slot.dragging, .hotbar-slot.drag-over')
        .forEach((node) => node.classList.remove('dragging', 'drag-over'));
    }

    getHotbarSlotIndexFromElement(element) {
      if (!(element instanceof HTMLElement)) return null;
      const raw = element.dataset?.hotbarSlot ?? '-1';
      const index = Number.parseInt(raw, 10);
      if (!Number.isInteger(index) || index < 0 || index >= this.hotbar.length) {
        return null;
      }
      return index;
    }

    swapHotbarSlots(fromIndex, toIndex) {
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return false;
      if (fromIndex === toIndex) return false;
      if (fromIndex < 0 || toIndex < 0) return false;
      if (fromIndex >= this.hotbar.length || toIndex >= this.hotbar.length) return false;
      const from = this.hotbar[fromIndex];
      const to = this.hotbar[toIndex];
      this.hotbar[fromIndex] = to;
      this.hotbar[toIndex] = from;
      if (this.selectedHotbarIndex === fromIndex) {
        this.selectedHotbarIndex = toIndex;
      } else if (this.selectedHotbarIndex === toIndex) {
        this.selectedHotbarIndex = fromIndex;
      }
      this.updateInventoryUi();
      return true;
    }

    handleHotbarDragStart(event) {
      const button = event.currentTarget;
      const index = this.getHotbarSlotIndexFromElement(button);
      if (index === null) {
        event.preventDefault();
        return;
      }
      const slot = this.hotbar[index];
      if (!slot?.item) {
        event.preventDefault();
        return;
      }
      this.activeHotbarDrag = { from: index };
      button.classList.add('dragging');
      if (event.dataTransfer) {
        try {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(index));
        } catch (error) {
          // Ignore unsupported drag data operations.
        }
      }
    }

    handleHotbarDragEnter(event) {
      if (!this.activeHotbarDrag) return;
      event.preventDefault();
      event.currentTarget.classList.add('drag-over');
    }

    handleHotbarDragOver(event) {
      if (!this.activeHotbarDrag) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    }

    handleHotbarDragLeave(event) {
      if (!this.activeHotbarDrag) return;
      const { currentTarget, relatedTarget } = event;
      if (relatedTarget instanceof HTMLElement && currentTarget.contains(relatedTarget)) {
        return;
      }
      currentTarget.classList.remove('drag-over');
    }

    handleHotbarDrop(event) {
      if (!this.activeHotbarDrag) return;
      event.preventDefault();
      let fromIndex = this.activeHotbarDrag.from;
      const targetIndex = this.getHotbarSlotIndexFromElement(event.currentTarget);
      if (event.dataTransfer) {
        try {
          const raw = event.dataTransfer.getData('text/plain');
          const parsed = Number.parseInt(raw, 10);
          if (Number.isInteger(parsed)) {
            fromIndex = parsed;
          }
        } catch (error) {
          // Ignore unsupported drag data operations.
        }
      }
      this.clearHotbarDragIndicators();
      this.activeHotbarDrag = null;
      if (fromIndex === null || targetIndex === null) {
        return;
      }
      this.swapHotbarSlots(fromIndex, targetIndex);
    }

    handleHotbarDragEnd() {
      this.clearHotbarDragIndicators();
      this.activeHotbarDrag = null;
    }

    getCombinedInventoryEntries() {
      const aggregate = new Map();
      this.hotbar.forEach((slot) => {
        if (!slot?.item || slot.quantity <= 0) return;
        aggregate.set(slot.item, (aggregate.get(slot.item) ?? 0) + slot.quantity);
      });
      this.satchel.forEach((quantity, item) => {
        if (!quantity) return;
        aggregate.set(item, (aggregate.get(item) ?? 0) + quantity);
      });
      return Array.from(aggregate.entries()).map(([item, quantity]) => ({ item, quantity }));
    }

    updateCraftingInventoryUi() {
      if (!this.craftingInventoryEl) return;
      const fragment = document.createDocumentFragment();
      const items = this.getCombinedInventoryEntries();
      items.sort((a, b) => b.quantity - a.quantity);
      items.forEach(({ item, quantity }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-inventory__item';
        button.dataset.itemId = item;
        button.dataset.quantity = String(quantity);
        button.textContent = formatInventoryLabel(item, quantity);
        button.setAttribute('role', 'listitem');
        button.setAttribute('aria-label', formatInventoryLabel(item, quantity));
        const def = getItemDefinition(item);
        const hintParts = [];
        if (def.description) {
          hintParts.push(def.description);
        }
        hintParts.push(`Tap to queue • Carrying ×${quantity}`);
        button.setAttribute('data-hint', hintParts.join(' — '));
        fragment.appendChild(button);
      });
      this.craftingInventoryEl.innerHTML = '';
      this.craftingInventoryEl.appendChild(fragment);
    }

    updateInventoryModal() {
      if (!this.inventoryGridEl) return;
      const items = this.getCombinedInventoryEntries();
      items.sort((a, b) => a.item.localeCompare(b.item));
      this.inventoryGridEl.innerHTML = '';
      if (!items.length) {
        this.inventoryGridEl.textContent = 'Inventory empty — gather resources to craft.';
        return;
      }
      items.forEach(({ item, quantity }) => {
        const cell = document.createElement('div');
        cell.className = 'inventory-grid__cell';
        cell.textContent = formatInventoryLabel(item, quantity);
        this.inventoryGridEl.appendChild(cell);
      });
      if (this.inventoryOverflowEl) {
        const satchelOnly = Array.from(this.satchel.entries()).reduce((sum, [, value]) => sum + value, 0);
        if (satchelOnly > 0) {
          this.inventoryOverflowEl.hidden = false;
          this.inventoryOverflowEl.textContent = `${satchelOnly} items stored in satchel reserves.`;
        } else {
          this.inventoryOverflowEl.hidden = true;
          this.inventoryOverflowEl.textContent = '';
        }
      }
    }

    updateExtendedInventoryUi() {
      if (!this.extendedInventoryEl) return;
      const items = this.getCombinedInventoryEntries();
      items.sort((a, b) => a.item.localeCompare(b.item));
      const fragment = document.createDocumentFragment();
      if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'inventory-extended__empty';
        empty.textContent = 'Gather resources to populate your satchel.';
        fragment.appendChild(empty);
      } else {
        items.forEach(({ item, quantity }) => {
          const def = getItemDefinition(item);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'inventory-slot';
          button.dataset.itemId = item;
          button.dataset.quantity = String(quantity);
          button.innerHTML = `<span>${def.label}</span><span class="quantity">×${quantity}</span>`;
          button.setAttribute('aria-label', `${def.label} ×${quantity}`);
          const hintParts = [];
          if (def.description) {
            hintParts.push(def.description);
          }
          hintParts.push(`Tap to queue • Stored ×${quantity}`);
          button.setAttribute('data-hint', hintParts.join(' — '));
          fragment.appendChild(button);
        });
      }
      this.extendedInventoryEl.innerHTML = '';
      this.extendedInventoryEl.appendChild(fragment);
    }

    updateHotbarExpansionUi() {
      const expanded = this.hotbarExpanded === true;
      if (this.extendedInventoryEl) {
        this.extendedInventoryEl.dataset.visible = expanded ? 'true' : 'false';
        this.extendedInventoryEl.setAttribute('aria-hidden', expanded ? 'false' : 'true');
      }
      if (this.hotbarExpandButton) {
        this.hotbarExpandButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        if (this.hotbarExpandButton.tagName === 'BUTTON') {
          this.hotbarExpandButton.textContent = expanded ? 'Collapse Inventory' : 'Expand Inventory';
        }
      }
    }

    toggleHotbarExpansion(forceValue) {
      const next = typeof forceValue === 'boolean' ? forceValue : !this.hotbarExpanded;
      if (this.hotbarExpanded === next) {
        this.updateHotbarExpansionUi();
        return this.hotbarExpanded;
      }
      this.hotbarExpanded = next;
      this.updateHotbarExpansionUi();
      return this.hotbarExpanded;
    }

    selectHotbarSlot(index, announce = true) {
      if (!Number.isInteger(index) || index < 0 || index >= this.hotbar.length) {
        return;
      }
      this.selectedHotbarIndex = index;
      this.updateHotbarUi();
      if (announce) {
        const slot = this.hotbar[index];
        const label = slot?.item ? formatInventoryLabel(slot.item, slot.quantity) : 'Empty slot';
        this.showHint(`Selected ${label}`);
      }
    }

    cycleHotbar(direction) {
      const next = (this.selectedHotbarIndex + direction + this.hotbar.length) % this.hotbar.length;
      this.selectHotbarSlot(next, true);
    }

    showHint(message) {
      if (!this.playerHintEl || !message) return;
      this.playerHintEl.textContent = message;
      this.playerHintEl.classList.add('visible');
      this.playerHintEl.removeAttribute('data-variant');
      this.lastHintMessage = message;
      this.pointerLockFallbackMessageActive = false;
      this.pointerLockFallbackNoticeShown = false;
      this.updateFooterSummary();
    }

    handleEventDispatchError(context, error) {
      const label = context || 'processing the last input';
      const dedupeKey = `${label}|${error?.message ?? 'unknown'}`;
      if (this.eventFailureNotices.has(dedupeKey)) {
        return;
      }
      this.eventFailureNotices.add(dedupeKey);
      if (typeof console !== 'undefined') {
        console.error(`Event handler failed while ${label}.`, error);
      }
      this.presentRendererFailure(
        `Critical input error detected while ${label}. Reload the page to continue exploring.`,
        { error, stage: `event:${label}` }
      );
    }

    addSafeEventListener(target, eventName, handler, options = {}) {
      if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
        return;
      }
      const { context = null, eventOptions = undefined } = options;
      const label = context || `handling ${eventName}`;
      const safeHandler = (...args) => {
        try {
          handler(...args);
        } catch (error) {
          this.handleEventDispatchError(label, error);
        }
      };
      target.addEventListener(eventName, safeHandler, eventOptions);
      if (!this.boundEventRecords) {
        this.boundEventRecords = [];
      }
      this.boundEventRecords.push({
        targetLabel: this.describeEventTarget(target),
        eventName,
        contextLabel: label,
      });
      this.boundEventDisposers.push(() => {
        if (typeof target.removeEventListener === 'function') {
          try {
            target.removeEventListener(eventName, safeHandler, eventOptions);
          } catch (removeError) {
            if (typeof console !== 'undefined') {
              console.debug('Failed to remove event listener cleanly.', {
                event: eventName,
                removeError,
              });
            }
          }
        }
      });
    }

    describeEventTarget(target) {
      if (!target) {
        return 'unknown';
      }
      const scopeWindow = typeof window !== 'undefined' ? window : null;
      if (scopeWindow && target === scopeWindow) {
        return 'window';
      }
      const scopeDocument = typeof document !== 'undefined' ? document : null;
      if (scopeDocument && target === scopeDocument) {
        return 'document';
      }
      if (this.canvas && target === this.canvas) {
        return 'canvas';
      }
      if (typeof target.nodeName === 'string' && target.nodeName) {
        return target.nodeName.toLowerCase();
      }
      if (typeof target.constructor?.name === 'string' && target.constructor.name) {
        return target.constructor.name;
      }
      return 'unknown';
    }

    handleAssetLoadFailure(key, error, options = {}) {
      if (error && typeof console !== 'undefined') {
        console.warn(`Asset load failure for ${key || 'unknown asset'}.`, error);
      }
      if (key === 'steve') {
        this.ensurePlayerAvatarPlaceholder('failed');
      } else if (key === 'arm') {
        this.ensurePlayerArmsVisible();
      }
      const messageMap = {
        arm: 'First-person hands offline — showing simplified explorer arms.',
        steve: 'Explorer avatar unavailable — using the fallback rig until models return.',
        zombie: 'Hostile models offline — zombies now appear as simplified husks.',
        golem: 'Iron golems using simplified armour while detailed models load.',
      };
      const fallbackMessage = (options.fallbackMessage || messageMap[key] || '').trim();
      this.recordAssetFailure(key, { error, fallbackMessage });
      if (!fallbackMessage) {
        return;
      }
      const dedupeKey = `${key || 'asset'}|${fallbackMessage}`;
      if (this.assetFailureNotices.has(dedupeKey)) {
        return;
      }
      this.assetFailureNotices.add(dedupeKey);
      if (this.playerHintEl) {
        this.playerHintEl.textContent = fallbackMessage;
        this.playerHintEl.classList.add('visible');
        this.playerHintEl.setAttribute('data-variant', 'warning');
      }
      this.lastHintMessage = fallbackMessage;
      if (this.footerStatusEl) {
        this.footerStatusEl.textContent = fallbackMessage;
      }
      if (this.footerEl) {
        this.footerEl.dataset.state = 'warning';
      }
      this.emitGameEvent('asset-fallback', {
        key,
        message: fallbackMessage,
        failureCount: this.assetFailureCounts.get(typeof key === 'string' && key ? key : 'asset') || 1,
      });
    }

    noteAssetRetry(key, attemptNumber, error, url) {
      const friendlyName = this.describeAssetKey(key);
      const nextAttempt = Math.min(this.assetRetryLimit, attemptNumber + 1);
      if (typeof console !== 'undefined') {
        console.warn(
          `Retrying ${friendlyName} asset (attempt ${nextAttempt} of ${this.assetRetryLimit}) after a loading error.`,
          {
            key,
            attempt: attemptNumber,
            nextAttempt,
            url,
            error,
          },
        );
      }
      this.emitGameEvent('asset-retry-scheduled', {
        key,
        attempt: nextAttempt,
        previousAttempt: attemptNumber,
        url,
        errorMessage: error?.message ?? null,
      });
    }

    computeAssetRetryDelay(attemptNumber) {
      const exponent = Math.max(0, attemptNumber - 1);
      const multiplier = Math.pow(1.8, exponent);
      const delay = Math.round(this.assetRetryBackoffMs * multiplier);
      return Math.min(this.assetRetryBackoffMaxMs, Math.max(this.assetRetryBackoffMs, delay));
    }

    delay(ms) {
      const duration = Math.max(0, Number.isFinite(ms) ? Math.floor(ms) : 0);
      return new Promise((resolve) => {
        setTimeout(resolve, duration);
      });
    }

    recordAssetFailure(key, context = {}) {
      const normalisedKey = typeof key === 'string' && key.trim().length ? key : 'asset';
      const previous = this.assetFailureCounts.get(normalisedKey) || 0;
      const next = previous + 1;
      this.assetFailureCounts.set(normalisedKey, next);
      const detail = {
        key: normalisedKey,
        failureCount: next,
        fallbackMessage: context?.fallbackMessage || null,
        errorMessage: context?.error?.message ?? null,
      };
      this.emitGameEvent('asset-load-failure', detail);
      if (next >= this.assetRecoveryPromptThreshold) {
        this.assetRecoveryPendingKeys.add(normalisedKey);
        this.promptAssetRecovery();
      }
    }

    describeAssetKey(key) {
      const normalisedKey = typeof key === 'string' && key.trim().length ? key : 'asset';
      const mapping = {
        arm: 'first-person hands',
        steve: 'explorer avatar',
        zombie: 'zombie models',
        golem: 'golem armour',
        asset: 'critical assets',
      };
      return mapping[normalisedKey] || `${normalisedKey} assets`;
    }

    buildAssetRecoveryMessage() {
      if (!this.assetRecoveryPendingKeys.size) {
        return 'Critical assets failed to load after multiple attempts. Reload the page or retry the stream to continue.';
      }
      const friendlyNames = Array.from(this.assetRecoveryPendingKeys).map((key) => this.describeAssetKey(key));
      let label = friendlyNames[0] || 'critical assets';
      if (friendlyNames.length === 2) {
        label = `${friendlyNames[0]} and ${friendlyNames[1]}`;
      } else if (friendlyNames.length > 2) {
        const initial = friendlyNames.slice(0, -1).join(', ');
        label = `${initial}, and ${friendlyNames[friendlyNames.length - 1]}`;
      }
      const capitalised = label.charAt(0).toUpperCase() + label.slice(1);
      return `${capitalised} failed to load after multiple attempts. Reload the page to rebuild caches or press “Retry Assets” to try again.`;
    }

    updateAssetRecoveryPromptMessage(messageOverride = null) {
      const message = messageOverride || this.buildAssetRecoveryMessage();
      if (this.assetRecoveryTitleEl) {
        this.assetRecoveryTitleEl.textContent = 'Restore missing assets';
      }
      if (this.assetRecoveryMessageEl) {
        this.assetRecoveryMessageEl.textContent = message;
      }
      if (this.assetRecoveryActionsEl) {
        this.assetRecoveryActionsEl.hidden = false;
      }
    }

    showAssetRecoveryPrompt() {
      if (!this.assetRecoveryOverlayEl) {
        return;
      }
      this.updateAssetRecoveryPromptMessage();
      this.assetRecoveryOverlayEl.hidden = false;
      this.assetRecoveryOverlayEl.removeAttribute('hidden');
      this.assetRecoveryOverlayEl.setAttribute('aria-hidden', 'false');
      this.assetRecoveryOverlayEl.setAttribute('data-mode', 'error');
      if (this.assetRecoveryDialogEl) {
        this.assetRecoveryDialogEl.setAttribute('aria-busy', 'false');
      }
      this.assetRecoveryPromptActive = true;
      if (typeof this.assetRecoveryDialogEl?.focus === 'function') {
        try {
          this.assetRecoveryDialogEl.focus();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Unable to focus asset recovery dialog.', error);
          }
        }
      }
    }

    promptAssetRecovery() {
      const message = this.buildAssetRecoveryMessage();
      if (this.assetRecoveryOverlayEl) {
        const eventDetail = {
          keys: Array.from(this.assetRecoveryPendingKeys),
          failureCounts: Array.from(this.assetFailureCounts.entries()),
          message,
        };
        if (this.assetRecoveryPromptActive) {
          this.emitGameEvent('asset-recovery-prompt-update', eventDetail);
        } else {
          this.emitGameEvent('asset-recovery-prompt', eventDetail);
        }
        this.showAssetRecoveryPrompt();
      } else {
        this.showHint(message);
      }
    }

    hideAssetRecoveryPrompt() {
      if (!this.assetRecoveryOverlayEl) {
        this.assetRecoveryPromptActive = false;
        return;
      }
      this.assetRecoveryOverlayEl.setAttribute('aria-hidden', 'true');
      this.assetRecoveryOverlayEl.setAttribute('hidden', '');
      this.assetRecoveryOverlayEl.hidden = true;
      this.assetRecoveryPromptActive = false;
    }

    maybeHideAssetRecoveryPrompt() {
      if (!this.assetRecoveryPromptActive) {
        return;
      }
      if (this.assetRecoveryPendingKeys.size === 0) {
        this.hideAssetRecoveryPrompt();
      } else {
        this.updateAssetRecoveryPromptMessage();
      }
    }

    handleAssetRecoveryRetry() {
      const keys = Array.from(this.assetRecoveryPendingKeys);
      if (!keys.length) {
        this.hideAssetRecoveryPrompt();
        return;
      }
      this.emitGameEvent('asset-retry-requested', { keys, source: 'player' });
      this.retryFailedAssets(keys);
    }

    handleAssetRecoveryReload() {
      const keys = Array.from(this.assetRecoveryPendingKeys);
      this.emitGameEvent('asset-recovery-reload-requested', { keys, source: 'player' });
      const scope =
        (typeof window !== 'undefined' && window) ||
        (typeof globalThis !== 'undefined' && globalThis) ||
        null;
      if (scope?.location?.reload) {
        scope.location.reload();
        return;
      }
      this.hideAssetRecoveryPrompt();
      this.showHint('Reload the page to restore missing assets.');
    }

    bindAssetRecoveryControls() {
      if (this.assetRecoveryControlsBound) {
        return;
      }
      if (!this.assetRecoveryOverlayEl) {
        return;
      }
      if (this.assetRecoveryRetryButton) {
        this.addSafeEventListener(this.assetRecoveryRetryButton, 'click', this.onAssetRecoveryRetryClick, {
          context: 'retrying missing assets',
        });
      }
      if (this.assetRecoveryReloadButton) {
        this.addSafeEventListener(this.assetRecoveryReloadButton, 'click', this.onAssetRecoveryReloadClick, {
          context: 'reloading after asset failure',
        });
      }
      this.assetRecoveryControlsBound = true;
    }

    retryFailedAssets(keys = []) {
      const uniqueKeys = Array.from(
        new Set(
          keys
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter((entry) => entry.length > 0),
        ),
      );
      if (!uniqueKeys.length) {
        this.hideAssetRecoveryPrompt();
        return;
      }
      uniqueKeys.forEach((assetKey) => {
        this.assetFailureCounts.delete(assetKey);
        this.assetRecoveryPendingKeys.delete(assetKey);
        this.assetRetryState.delete(assetKey);
        this.clearAssetFailureNoticesForKey(assetKey);
        this.clearAssetDelayNoticesForKey(assetKey);
        this.loadedModels.delete(assetKey);
        this.modelPromises.delete(assetKey);
      });
      if (this.THREE?.Cache?.clear) {
        try {
          this.THREE.Cache.clear();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Unable to clear Three.js cache during asset retry.', error);
          }
        }
      }
      this.hideAssetRecoveryPrompt();
      this.emitGameEvent('asset-retry-queued', { keys: uniqueKeys });
      this.showHint('Retrying asset stream — missing details will restore shortly.');
      if (uniqueKeys.includes('arm')) {
        this.loadFirstPersonArms(this.activeSessionId);
      }
      if (uniqueKeys.includes('steve')) {
        this.loadPlayerCharacter();
      }
      if (uniqueKeys.includes('zombie') && Array.isArray(this.zombies)) {
        this.zombies.forEach((zombie) => {
          if (zombie && zombie.placeholder !== false) {
            this.upgradeZombie(zombie);
          }
        });
      }
      if (uniqueKeys.includes('golem') && Array.isArray(this.golems)) {
        this.golems.forEach((golem) => {
          if (golem && golem.placeholder !== false) {
            this.upgradeGolem(golem);
          }
        });
      }
      this.enqueueLazyModelWarmup(uniqueKeys);
      this.maybeHideAssetRecoveryPrompt();
    }

    clearAssetFailureNoticesForKey(key) {
      if (!key || !this.assetFailureNotices) {
        return;
      }
      const prefix = `${key}|`;
      Array.from(this.assetFailureNotices).forEach((entry) => {
        if (entry.startsWith(prefix)) {
          this.assetFailureNotices.delete(entry);
        }
      });
    }

    handleHotbarClick(event) {
      const button = event.target.closest('[data-hotbar-slot]');
      if (!button) return;
      const index = Number.parseInt(button.dataset.hotbarSlot ?? '-1', 10);
      if (!Number.isInteger(index)) return;
      this.selectHotbarSlot(index, true);
    }

    handleCanvasWheel(event) {
      if (!this.pointerLocked) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? 1 : -1;
      this.cycleHotbar(delta);
    }

    handleVictoryReplay(event) {
      const button = event?.target?.closest('[data-action="replay-run"]');
      if (!button) {
        return;
      }
      if (event?.preventDefault) {
        event.preventDefault();
      }
      if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
        window.location.reload();
      }
    }

    queueCraftingItem(item) {
      if (!item) return false;
      const slotCount = this.getCraftingSlotCount();
      if (this.craftingState.sequence.length >= slotCount) {
        this.showHint('Sequence full — craft or clear to add more.');
        return false;
      }
      const available = this.getInventoryCountForItem(item);
      const planned = this.craftingState.sequence.filter((entry) => entry === item).length;
      if (planned >= available) {
        this.showHint('Not enough resources in your satchel. Gather more.');
        return false;
      }
      this.craftingState.sequence.push(item);
      this.refreshCraftingUi();
      return true;
    }

    handleCraftingInventoryClick(event) {
      const button = event.target.closest('[data-item-id]');
      if (!button) return;
      const item = button.dataset.itemId;
      if (!item) return;
      this.queueCraftingItem(item);
    }

    handleCraftingInventoryFocus(event) {
      const button = event.target.closest('[data-item-id]');
      if (!button) {
        return;
      }
      const item = button.dataset.itemId;
      if (!item) {
        return;
      }
      const quantity = Number.parseInt(button.dataset.quantity ?? '0', 10);
      const def = getItemDefinition(item);
      const recipes = this.getRecipesUsingItem(item);
      const matches = recipes.length
        ? recipes.slice(0, 3).map((entry) => {
            const sequenceText = this.formatRecipeSequence(entry.parts);
            const summary = this.formatRecipeStepSummary(entry.positions, entry.parts.length);
            const detail = summary ? `${summary}, +${entry.recipe.score} pts` : `+${entry.recipe.score} pts`;
            return `${entry.recipe.label} — ${sequenceText} (${detail})`;
          })
        : ['Experiment with this resource to discover new recipes.'];
      let description = def.description || def.label;
      if (quantity > 0) {
        description += ` — You carry ×${quantity}.`;
      }
      description += ' Tap to queue it into the crafting sequence.';
      this.showCraftingHelperHint('inventory', {
        title: def.label,
        description,
        matches,
      });
    }

    handleCraftingInventoryBlur(event) {
      if (event?.relatedTarget && event.currentTarget?.contains?.(event.relatedTarget)) {
        return;
      }
      this.clearCraftingHelperHint('inventory');
    }

    handleExtendedInventoryClick(event) {
      const button = event.target.closest('[data-item-id]');
      if (!button) return;
      const item = button.dataset.itemId;
      if (!item) return;
      this.queueCraftingItem(item);
    }

    handleCraftSuggestionFocus(event) {
      const button = event.target.closest('[data-recipe-key]');
      if (!button) {
        return;
      }
      const key = button.dataset.recipeKey;
      if (!key) {
        return;
      }
      const recipe = this.craftingRecipes.get(key);
      if (!recipe) {
        return;
      }
      const parts = this.getRecipeSequence(recipe, key);
      const descriptionSegments = [];
      if (recipe.description) {
        descriptionSegments.push(recipe.description);
      }
      descriptionSegments.push(`Autofill to award +${recipe.score} pts.`);
      this.showCraftingHelperHint('recipe', {
        title: recipe.label,
        description: descriptionSegments.join(' '),
        matches: [`Sequence: ${this.formatRecipeSequence(parts)}`, `Reward: +${recipe.score} pts`],
      });
    }

    handleCraftSuggestionBlur(event) {
      if (event?.relatedTarget && event.currentTarget?.contains?.(event.relatedTarget)) {
        return;
      }
      this.clearCraftingHelperHint('recipe');
    }

    handleCraftSequenceClick(event) {
      const button = event.target.closest('[data-sequence-index]');
      if (!button) return;
      const index = Number.parseInt(button.dataset.sequenceIndex ?? '-1', 10);
      if (!Number.isInteger(index) || index < 0 || index >= this.craftingState.sequence.length) {
        return;
      }
      this.craftingState.sequence.splice(index, 1);
      this.refreshCraftingUi();
    }

    handleCraftSequenceFocus(event) {
      const button = event.target.closest('[data-sequence-index]');
      if (!button) {
        return;
      }
      const index = Number.parseInt(button.dataset.sequenceIndex ?? '-1', 10);
      if (!Number.isInteger(index)) {
        return;
      }
      const sequence = Array.isArray(this.craftingState?.sequence) ? this.craftingState.sequence : [];
      const item = sequence[index];
      if (item) {
        const def = getItemDefinition(item);
        const matches = this.buildRecipeMatchSummaries(this.findRecipesMatchingPrefix(sequence), 3);
        const details = matches.length
          ? matches
          : ['Sequence incomplete — continue adding ingredients to discover matches.'];
        let description = def.description || def.label;
        description += ' Click to remove this step from the sequence.';
        this.showCraftingHelperHint('sequence', {
          title: `Step ${index + 1}: ${def.label}`,
          description,
          matches: details,
        });
      } else {
        const prefix = sequence.slice(0, index);
        const matches = this.buildRecipeMatchSummaries(this.findRecipesMatchingPrefix(prefix), 3);
        const details = matches.length
          ? matches
          : ['Experiment with ingredients to discover new recipes.'];
        this.showCraftingHelperHint('sequence', {
          title: `Slot ${index + 1}`,
          description: 'Empty slot — drop an ingredient here to extend the recipe.',
          matches: details,
        });
      }
    }

    handleCraftSequenceBlur(event) {
      if (event?.relatedTarget && event.currentTarget?.contains?.(event.relatedTarget)) {
        return;
      }
      this.clearCraftingHelperHint('sequence');
    }

    handleClearCraft() {
      if (!this.craftingState.sequence.length) return;
      this.craftingState.sequence = [];
      this.refreshCraftingUi();
    }

    handleCraftButton() {
      const craftedSequence = this.craftingState.sequence.slice();
      const validation = this.validateCraftingSequence();
      if (!validation.valid) {
        this.showHint(validation.message || 'Sequence unstable.');
        this.announceCraftingValidation(validation);
        return;
      }
      const { recipe, key } = validation;
      recipe.sequence.forEach((itemId) => {
        this.removeItemFromInventory(itemId, 1);
      });
      this.addItemToInventory(recipe.id, 1);
      this.craftingState.sequence = [];
      this.craftedRecipes.add(recipe.id);
      this.craftingState.unlocked.set(key, recipe);
      this.score += recipe.score;
      this.addScoreBreakdown('recipes', recipe.score);
      this.savePersistentUnlocks();
      this.announceCraftingValidation({ valid: true });
      this.showHint(validation.message || `${recipe.label} crafted!`);
      this.refreshCraftingUi();
      this.updateHud();
      this.scheduleScoreSync('recipe-crafted');
      this.audio.play('craftChime', { volume: 0.6 });
      this.emitGameEvent('recipe-crafted', {
        recipeId: recipe.id,
        recipeKey: key,
        recipeLabel: recipe.label,
        scoreAwarded: recipe.score,
        sequence: craftedSequence,
        inventoryCount: this.getTotalInventoryCount(),
      });
    }

    handleCraftSuggestionClick(event) {
      const button = event.target.closest('[data-recipe-key]');
      if (!button) return;
      const key = button.dataset.recipeKey;
      if (!key) return;
      const parts = key.split(',').filter(Boolean);
      this.craftingState.sequence = parts.slice(0, this.getCraftingSlotCount());
      this.refreshCraftingUi();
    }

    handleCraftSearchInput(event) {
      this.craftingState.searchTerm = (event.target?.value || '').toLowerCase();
      this.updateCraftingSearchResults();
    }

    handleOpenCrafting(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      this.toggleCraftingModal(true);
    }

    handleCloseCrafting(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      this.toggleCraftingModal(false);
    }

    handleInventorySort(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      this.sortInventoryByQuantity();
      this.updateInventoryUi();
      this.showHint('Inventory sorted.');
      this.inventorySortButton?.setAttribute('aria-pressed', 'true');
    }

    handleInventoryToggle(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      const willOpen = this.inventoryModal?.hidden !== false;
      this.toggleInventoryModal(willOpen);
    }

    getInventoryCountForItem(item) {
      if (!item) return 0;
      let total = 0;
      this.hotbar.forEach((slot) => {
        if (slot.item === item) {
          total += slot.quantity;
        }
      });
      total += this.satchel.get(item) ?? 0;
      return total;
    }

    getCraftingSlotCount() {
      const count = Number.parseInt(this.craftSequenceEl?.dataset.slotCount ?? '0', 10);
      return Number.isInteger(count) && count > 0 ? count : 7;
    }

    toggleCraftingModal(visible) {
      if (!this.craftingModal) return;
      if (visible) {
        this.craftingModal.hidden = false;
        this.craftingModal.setAttribute('aria-hidden', 'false');
        document.exitPointerLock?.();
        this.refreshCraftingUi();
      } else {
        this.craftingModal.hidden = true;
        this.craftingModal.setAttribute('aria-hidden', 'true');
        this.toggleCraftingSearch(false);
        this.canvas.focus({ preventScroll: true });
        this.clearCraftingHelperHint();
      }
      if (this.craftLauncherButton) {
        this.craftLauncherButton.setAttribute('aria-expanded', visible ? 'true' : 'false');
      }
    }

    toggleInventoryModal(visible) {
      if (!this.inventoryModal) return;
      if (visible) {
        this.inventoryModal.hidden = false;
        this.inventoryModal.setAttribute('aria-hidden', 'false');
        document.exitPointerLock?.();
        this.updateInventoryModal();
        this.inventorySortButton?.setAttribute('aria-pressed', 'false');
      } else {
        this.inventoryModal.hidden = true;
        this.inventoryModal.setAttribute('aria-hidden', 'true');
        this.canvas.focus({ preventScroll: true });
        this.inventorySortButton?.setAttribute('aria-pressed', 'false');
      }
      this.openInventoryButtons.forEach((btn) => {
        if (!btn) return;
        btn.setAttribute('aria-expanded', visible ? 'true' : 'false');
        if (btn.tagName === 'BUTTON') {
          btn.textContent = visible ? 'Close Inventory' : 'Open Inventory';
        }
      });
    }

    toggleCraftingSearch(visible) {
      if (!this.craftingSearchPanel) return;
      if (visible) {
        this.craftingSearchPanel.hidden = false;
        this.craftingSearchPanel.setAttribute('aria-hidden', 'false');
        this.updateCraftingSearchResults();
        this.craftingSearchInput?.focus();
      } else {
        this.craftingSearchPanel.hidden = true;
        this.craftingSearchPanel.setAttribute('aria-hidden', 'true');
        this.craftingState.searchTerm = '';
      }
    }

    refreshCraftingUi() {
      this.updateCraftingSequenceUi();
      this.updateCraftingInventoryUi();
      this.updateCraftingSuggestions();
      this.updateCraftButtonState();
      this.updateCraftingHelperOverlay();
    }

    updateCraftingSequenceUi() {
      if (!this.craftSequenceEl) return;
      const slotCount = this.getCraftingSlotCount();
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < slotCount; i += 1) {
        const item = this.craftingState.sequence[i] ?? null;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-sequence__slot';
        button.dataset.sequenceIndex = i;
        if (item) {
          const def = getItemDefinition(item);
          button.textContent = formatInventoryLabel(item, 1);
          button.setAttribute('aria-label', `Remove ${def.label} from sequence`);
          button.setAttribute('data-hint', `Click to remove ${def.label} from the sequence.`);
        } else {
          button.textContent = '·';
          button.setAttribute('aria-label', 'Empty sequence slot');
          button.setAttribute('data-hint', 'Empty slot — drop an ingredient here.');
        }
        fragment.appendChild(button);
      }
      this.craftSequenceEl.innerHTML = '';
      this.craftSequenceEl.appendChild(fragment);
    }

    updateCraftingSuggestions() {
      if (!this.craftSuggestionsEl) return;
      const fragment = document.createDocumentFragment();
      const entries = Array.from(this.craftingState.unlocked.entries());
      entries.sort((a, b) => a[1].label.localeCompare(b[1].label));
      entries.forEach(([key, recipe]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-suggestions__item';
        button.dataset.recipeKey = key;
        button.textContent = `${recipe.label} (${key.replace(/,/g, ' → ')})`;
        const hintParts = [];
        if (recipe.description) {
          hintParts.push(recipe.description);
        }
        hintParts.push(`Autofill sequence • +${recipe.score} pts`);
        button.setAttribute('data-hint', hintParts.join(' — '));
        const li = document.createElement('li');
        li.appendChild(button);
        fragment.appendChild(li);
      });
      if (!entries.length) {
        const empty = document.createElement('li');
        empty.textContent = 'Discover recipes to unlock quick sequences.';
        fragment.appendChild(empty);
      }
      this.craftSuggestionsEl.innerHTML = '';
      this.craftSuggestionsEl.appendChild(fragment);
    }

    updateCraftButtonState() {
      if (!this.craftButton) return;
      const validation = this.validateCraftingSequence();
      const enabled = validation.valid === true;
      this.craftButton.disabled = !enabled;
      if (validation.reason) {
        this.craftButton.dataset.validationState = enabled ? 'ready' : validation.reason;
      } else {
        delete this.craftButton.dataset.validationState;
      }
    }

    buildIngredientCount(parts = []) {
      const tally = new Map();
      if (!Array.isArray(parts)) {
        return tally;
      }
      parts.forEach((itemId) => {
        if (!itemId) return;
        tally.set(itemId, (tally.get(itemId) ?? 0) + 1);
      });
      return tally;
    }

    findRecipeByIngredients(sequence) {
      if (!Array.isArray(sequence) || !sequence.length) {
        return null;
      }
      const target = this.buildIngredientCount(sequence);
      let match = null;
      this.craftingRecipes.forEach((recipe, key) => {
        if (match || !recipe) {
          return;
        }
        const parts = this.getRecipeSequence(recipe, key);
        if (parts.length !== sequence.length) {
          return;
        }
        const counts = this.buildIngredientCount(parts);
        if (counts.size !== target.size) {
          return;
        }
        let valid = true;
        for (const [itemId, required] of counts.entries()) {
          if (target.get(itemId) !== required) {
            valid = false;
            break;
          }
        }
        if (valid) {
          match = { recipe, key, parts };
        }
      });
      return match;
    }

    describeMissingIngredients(missing = []) {
      if (!Array.isArray(missing) || !missing.length) {
        return '';
      }
      return missing
        .map((entry) => {
          const def = getItemDefinition(entry.itemId);
          const shortfall = Number.isFinite(entry.missing) ? Math.max(1, entry.missing) : 1;
          return `${def.label} ×${shortfall}`;
        })
        .join(', ');
    }

    validateCraftingSequence() {
      const sequence = Array.isArray(this.craftingState?.sequence)
        ? this.craftingState.sequence.filter(Boolean)
        : [];
      if (!sequence.length) {
        return {
          valid: false,
          reason: 'empty-sequence',
          message: 'Add items to the sequence to craft.',
        };
      }
      const key = sequence.join(',');
      const recipe = this.craftingRecipes.get(key);
      if (!recipe) {
        const ingredientMatch = this.findRecipeByIngredients(sequence);
        if (ingredientMatch) {
          const order = this.formatRecipeSequence(ingredientMatch.parts);
          return {
            valid: false,
            reason: 'order-mismatch',
            recipe: ingredientMatch.recipe,
            message: `${ingredientMatch.recipe.label} requires the order ${order}.`,
          };
        }
        return {
          valid: false,
          reason: 'no-recipe',
          message: 'Sequence fizzles. No recipe matched.',
        };
      }
      const counts = this.buildIngredientCount(recipe.sequence);
      const missing = [];
      counts.forEach((required, itemId) => {
        const available = this.getInventoryCountForItem(itemId);
        if (available < required) {
          missing.push({
            itemId,
            required,
            available,
            missing: required - available,
          });
        }
      });
      if (missing.length) {
        return {
          valid: false,
          reason: 'missing-ingredients',
          recipe,
          missing,
          message: `Missing materials: ${this.describeMissingIngredients(missing)}.`,
        };
      }
      return {
        valid: true,
        reason: 'ready',
        recipe,
        key,
        message: `${recipe.label} crafted!`,
      };
    }

    announceCraftingValidation(validation) {
      if (!validation) {
        return;
      }
      if (!validation.valid) {
        const matches = [];
        if (validation.reason === 'order-mismatch' && validation.recipe) {
          const parts = this.getRecipeSequence(validation.recipe);
          matches.push(
            `${validation.recipe.label} — ${this.formatRecipeSequence(parts)} • +${validation.recipe.score} pts`,
          );
        } else if (validation.reason === 'missing-ingredients' && Array.isArray(validation.missing)) {
          const summary = this.describeMissingIngredients(validation.missing);
          if (summary) {
            matches.push(`Still required: ${summary}`);
          }
        }
        this.showCraftingHelperHint('craft-validation', {
          title: 'Sequence Invalid',
          description: validation.message || 'This combination cannot be crafted yet.',
          matches,
        });
      } else {
        this.clearCraftingHelperHint('craft-validation');
      }
    }

    updateCraftingSearchResults() {
      if (!this.craftingSearchResultsEl) return;
      const term = (this.craftingState.searchTerm || '').trim();
      const results = [];
      this.craftingRecipes.forEach((recipe, key) => {
        if (!term || recipe.label.toLowerCase().includes(term) || key.includes(term)) {
          results.push({ key, recipe });
        }
      });
      const fragment = document.createDocumentFragment();
      results.slice(0, 12).forEach(({ key, recipe }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-search__result';
        button.dataset.recipeKey = key;
        button.textContent = `${recipe.label} — ${key.replace(/,/g, ' → ')}`;
        const hintParts = [];
        if (recipe.description) {
          hintParts.push(recipe.description);
        }
        hintParts.push(`Autofill sequence • +${recipe.score} pts`);
        button.setAttribute('data-hint', hintParts.join(' — '));
        const li = document.createElement('li');
        li.appendChild(button);
        fragment.appendChild(li);
      });
      if (!results.length) {
        const li = document.createElement('li');
        li.className = 'crafting-search__empty';
        li.textContent = 'No recipes match that phrase.';
        fragment.appendChild(li);
      }
      this.craftingSearchResultsEl.innerHTML = '';
      this.craftingSearchResultsEl.appendChild(fragment);
    }

    getRecipeSequence(recipe, key) {
      if (Array.isArray(recipe?.sequence) && recipe.sequence.length) {
        return recipe.sequence.slice();
      }
      if (typeof key === 'string' && key.length) {
        return key.split(',').filter(Boolean);
      }
      return [];
    }

    formatRecipeSequence(parts) {
      if (!Array.isArray(parts) || !parts.length) {
        return '—';
      }
      return parts.map((itemId) => getItemDefinition(itemId).label).join(' → ');
    }

    hasMaterialsForRecipe(recipe) {
      const parts = this.getRecipeSequence(recipe);
      if (!parts.length) {
        return false;
      }
      const counts = new Map();
      parts.forEach((itemId) => {
        counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
      });
      for (const [itemId, required] of counts.entries()) {
        if (this.getInventoryCountForItem(itemId) < required) {
          return false;
        }
      }
      return true;
    }

    findRecipesMatchingPrefix(sequence) {
      if (!Array.isArray(sequence)) {
        return [];
      }
      const matches = [];
      this.craftingRecipes.forEach((recipe, key) => {
        const parts = this.getRecipeSequence(recipe, key);
        let valid = true;
        for (let i = 0; i < sequence.length; i += 1) {
          if (parts[i] !== sequence[i]) {
            valid = false;
            break;
          }
        }
        if (!valid) {
          return;
        }
        const remaining = Math.max(0, parts.length - sequence.length);
        const nextId = parts[sequence.length] || null;
        matches.push({ recipe, key, parts, remaining, nextId });
      });
      matches.sort((a, b) => {
        if (a.remaining !== b.remaining) {
          return a.remaining - b.remaining;
        }
        return a.recipe.label.localeCompare(b.recipe.label);
      });
      return matches;
    }

    getRecipesUsingItem(itemId) {
      if (!itemId) {
        return [];
      }
      const results = [];
      this.craftingRecipes.forEach((recipe, key) => {
        const parts = this.getRecipeSequence(recipe, key);
        const positions = [];
        parts.forEach((part, index) => {
          if (part === itemId) {
            positions.push(index);
          }
        });
        if (positions.length) {
          results.push({ recipe, parts, positions });
        }
      });
      results.sort((a, b) => a.recipe.label.localeCompare(b.recipe.label));
      return results;
    }

    formatRecipeStepSummary(positions, total) {
      if (!Array.isArray(positions) || !positions.length || !Number.isFinite(total) || total <= 0) {
        return '';
      }
      if (positions.length === total) {
        return 'used in every step';
      }
      if (positions.length === 1) {
        return `used at step ${positions[0] + 1} of ${total}`;
      }
      return `used at steps ${positions.map((index) => index + 1).join(', ')} of ${total}`;
    }

    buildRecipeMatchSummaries(matches, limit = 3) {
      if (!Array.isArray(matches) || !matches.length) {
        return [];
      }
      return matches.slice(0, limit).map((match) => {
        const parts = match.parts;
        const sequenceText = this.formatRecipeSequence(parts);
        let status = '';
        if (match.remaining === 0) {
          status = this.hasMaterialsForRecipe(match.recipe) ? 'Ready to craft' : 'Missing ingredients';
        } else if (match.nextId) {
          status = `Next: ${getItemDefinition(match.nextId).label}`;
        }
        const base = `${match.recipe.label} — ${sequenceText}`;
        const bonus = `+${match.recipe.score} pts`;
        return status ? `${base} (${status}) • ${bonus}` : `${base} • ${bonus}`;
      });
    }

    showCraftingHelperHint(source, payload = {}) {
      if (!this.craftingHelperEl) {
        return;
      }
      this.craftingHelperOverride = {
        source: source || 'default',
        title: payload.title || null,
        description: payload.description || null,
        matches: Array.isArray(payload.matches) ? payload.matches.filter((text) => typeof text === 'string' && text.trim()) : [],
      };
      this.updateCraftingHelperOverlay();
    }

    clearCraftingHelperHint(source) {
      if (!this.craftingHelperEl) {
        return;
      }
      if (source && this.craftingHelperOverride?.source && this.craftingHelperOverride.source !== source) {
        return;
      }
      this.craftingHelperOverride = null;
      this.updateCraftingHelperOverlay();
    }

    updateCraftingHelperOverlay() {
      const helperEl = this.craftingHelperEl;
      if (!helperEl) {
        return;
      }
      const titleEl = this.craftingHelperTitleEl;
      const descriptionEl = this.craftingHelperDescriptionEl;
      const matchesEl = this.craftingHelperMatchesEl;
      const defaultTitle = 'Recipe Helper';
      let title = defaultTitle;
      let description = 'Queue materials to preview known recipes.';
      const matchSummaries = [];
      const override = this.craftingHelperOverride;

      if (override) {
        if (override.title) {
          title = override.title;
        }
        if (override.description) {
          description = override.description;
        }
        if (Array.isArray(override.matches) && override.matches.length) {
          override.matches.forEach((text) => {
            if (text && typeof text === 'string') {
              matchSummaries.push(text);
            }
          });
        }
      } else {
        const sequence = Array.isArray(this.craftingState?.sequence) ? this.craftingState.sequence : [];
        if (sequence.length === 0) {
          const unlocked = Array.from(this.craftingState?.unlocked?.values?.() || []);
          if (unlocked.length) {
            description = 'Select an unlocked recipe to auto-fill the crafting circle.';
            unlocked.slice(0, 3).forEach((recipe) => {
              const parts = this.getRecipeSequence(recipe);
              matchSummaries.push(`${recipe.label} — ${this.formatRecipeSequence(parts)} • +${recipe.score} pts`);
            });
          } else {
            description = 'Drag ingredients from your satchel to experiment with new combinations.';
          }
        } else {
          const prefixMatches = this.findRecipesMatchingPrefix(sequence);
          if (prefixMatches.length) {
            const top = prefixMatches[0];
            if (top.remaining === 0) {
              const readyText = this.hasMaterialsForRecipe(top.recipe)
                ? 'Ready to craft — press Craft Item to claim the reward.'
                : 'Recipe located — gather the remaining ingredients to craft it.';
              description = `${top.recipe.label} detected. ${readyText}`;
            } else if (top.nextId) {
              const nextLabel = getItemDefinition(top.nextId).label;
              description = `Next add ${nextLabel} to craft ${top.recipe.label}.`;
            }
            this.buildRecipeMatchSummaries(prefixMatches, 3).forEach((summary) => matchSummaries.push(summary));
          } else {
            description = 'No known recipes use this order yet. Try reordering the sequence.';
          }
        }
      }

      if (titleEl) {
        titleEl.textContent = title;
      }
      if (descriptionEl) {
        descriptionEl.textContent = description;
      }
      if (matchesEl) {
        matchesEl.innerHTML = '';
        if (matchSummaries.length) {
          const fragment = document.createDocumentFragment();
          matchSummaries.slice(0, 3).forEach((text) => {
            const li = document.createElement('li');
            li.textContent = text;
            fragment.appendChild(li);
          });
          matchesEl.appendChild(fragment);
        }
        matchesEl.setAttribute('data-empty', matchSummaries.length ? 'false' : 'true');
      }
      helperEl.dataset.state = override
        ? 'focused'
        : this.craftingState.sequence.length
          ? 'active'
          : 'idle';
      helperEl.setAttribute('data-has-matches', matchSummaries.length ? 'true' : 'false');
    }

    sortInventoryByQuantity() {
      const items = this.hotbar.filter((slot) => slot.item);
      items.sort((a, b) => b.quantity - a.quantity);
      const reordered = [];
      items.forEach((slot) => {
        reordered.push({ item: slot.item, quantity: slot.quantity });
      });
      while (reordered.length < this.hotbar.length) {
        reordered.push({ item: null, quantity: 0 });
      }
      this.hotbar = reordered;
      this.selectedHotbarIndex = 0;
    }

    addScoreBreakdown(category, amount) {
      if (!this.scoreBreakdown || typeof this.scoreBreakdown !== 'object') {
        this.scoreBreakdown = {};
      }
      const key = typeof category === 'string' && category.trim() ? category.trim() : 'misc';
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount === 0) {
        return;
      }
      const previous = Number.isFinite(this.scoreBreakdown[key]) ? this.scoreBreakdown[key] : 0;
      this.scoreBreakdown[key] = previous + numericAmount;
    }

    getScoreBreakdownSnapshot() {
      const snapshot = {};
      const source = this.scoreBreakdown && typeof this.scoreBreakdown === 'object' ? this.scoreBreakdown : {};
      Object.entries(source).forEach(([key, value]) => {
        if (typeof key !== 'string') return;
        const trimmed = key.trim();
        if (!trimmed) return;
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          snapshot[trimmed] = numeric;
        }
      });
      return snapshot;
    }

    formatPointValue(value) {
      const numeric = Math.max(0, Number(value) || 0);
      if (!Number.isFinite(numeric)) {
        return '0';
      }
      const maxFractionDigits = numeric < 1 ? 2 : numeric < 10 ? 1 : 0;
      return numeric.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxFractionDigits,
      });
    }

    updateHud() {
      const { heartsEl, scoreTotalEl, scoreRecipesEl, scoreDimensionsEl } = this.ui;
      if (heartsEl) {
        heartsEl.innerHTML = createHeartMarkup(this.health);
      }
      if (scoreTotalEl) {
        const roundedScore = Math.round(this.score ?? 0);
        scoreTotalEl.textContent = roundedScore.toLocaleString();
      }
      if (scoreRecipesEl) {
        const recipeCount = this.craftedRecipes?.size ?? 0;
        const recipePoints = this.scoreBreakdown?.recipes ?? 0;
        scoreRecipesEl.textContent = `${recipeCount} (+${this.formatPointValue(recipePoints)} pts)`;
      }
      if (scoreDimensionsEl) {
        const dimensionCount = Math.max(1, this.currentDimensionIndex + 1);
        const dimensionPoints = this.scoreBreakdown?.dimensions ?? 0;
        const penaltyPoints = this.scoreBreakdown?.penalties ?? 0;
        let display = `${dimensionCount} (+${this.formatPointValue(dimensionPoints)} pts`;
        if (penaltyPoints > 0) {
          display += `, -${this.formatPointValue(penaltyPoints)} penalty`;
        }
        display += ')';
        scoreDimensionsEl.textContent = display;
      }
      this.updateInventoryUi();
      this.updateDimensionInfoPanel();
      this.updatePortalProgress();
      this.updateFooterSummary();
    }

    setPortalStatusIndicator(state, message, label) {
      const stateLabels = {
        inactive: 'Portal Dormant',
        building: 'Portal Stabilising',
        ready: 'Portal Ready',
        active: 'Portal Active',
        blocked: 'Portal Blocked',
        victory: 'Network Secured',
      };
      const nextState = state || 'inactive';
      const nextMessage = message || 'Portal dormant';
      const nextLabel = label || stateLabels[nextState] || 'Portal Status';
      const previousState = this.portalStatusState;
      const previousMessage = this.portalStatusMessage;
      const previousLabel = this.portalStatusLabel;
      if (
        previousState === nextState &&
        previousMessage === nextMessage &&
        previousLabel === nextLabel
      ) {
        return;
      }
      this.portalStatusState = nextState;
      this.portalStatusMessage = nextMessage;
      this.portalStatusLabel = nextLabel;
      const {
        portalStatusEl,
        portalStatusText,
        portalStatusStateText,
        portalStatusDetailText,
        portalStatusIcon,
      } = this.ui;
      if (portalStatusEl) {
        portalStatusEl.dataset.state = nextState;
        portalStatusEl.setAttribute('aria-label', `Portal status: ${nextLabel}. ${nextMessage}`);
        portalStatusEl.classList.remove('portal-status--flash');
        void portalStatusEl.offsetWidth;
        portalStatusEl.classList.add('portal-status--flash');
        const globalScope = typeof globalThis !== 'undefined' ? globalThis : undefined;
        const clearTimer =
          (typeof window !== 'undefined' ? window?.clearTimeout : undefined) ||
          globalScope?.clearTimeout ||
          clearTimeout;
        const setTimer =
          (typeof window !== 'undefined' ? window?.setTimeout : undefined) ||
          globalScope?.setTimeout ||
          setTimeout;
        if (typeof clearTimer === 'function' && typeof setTimer === 'function') {
          clearTimer(this.portalStatusFlashTimer);
          this.portalStatusFlashTimer = setTimer(() => {
            portalStatusEl.classList.remove('portal-status--flash');
            this.portalStatusFlashTimer = null;
          }, 620);
        }
      }
      if (portalStatusStateText) {
        portalStatusStateText.textContent = nextLabel;
      }
      if (portalStatusDetailText) {
        portalStatusDetailText.textContent = nextMessage;
      } else if (!portalStatusStateText && portalStatusText) {
        portalStatusText.textContent = nextMessage;
      } else if (portalStatusText && !portalStatusDetailText && portalStatusStateText) {
        portalStatusText.textContent = `${nextLabel}: ${nextMessage}`;
      }
      if (portalStatusIcon) {
        portalStatusIcon.dataset.state = nextState;
      }
      if (previousState !== nextState) {
        if (nextState === 'active') {
          this.audio.play('portalActivate', { volume: 0.7 });
          this.previewUpcomingDimension();
        } else if (nextState === 'ready') {
          this.audio.play('portalPrimed', { volume: 0.55 });
        } else if (nextState === 'building') {
          this.audio.play('portalPrimed', { volume: 0.35 });
        } else if (nextState === 'blocked') {
          this.audio.play('portalDormant', { volume: 0.45 });
        } else if (nextState === 'inactive' && previousState !== 'inactive') {
          this.audio.play('portalDormant', { volume: 0.38 });
        } else if (previousState === 'active' && nextState !== 'victory') {
          this.audio.play('portalDormant', { volume: 0.5 });
        }
      }
    }

    updatePortalProgress() {
      const { portalProgressLabel, portalProgressBar } = this.ui;
      const obstructionState = this.refreshPortalObstructionState();
      const required = this.portalFrameRequiredCount || PORTAL_BLOCK_REQUIREMENT;
      const rawProgress = required > 0 ? this.portalBlocksPlaced / required : 0;
      const progress = Math.min(1, Math.max(0, rawProgress));
      const progressPercent = Math.round(progress * 100);
      const remainingBlocks = Math.max(0, Math.ceil(required - this.portalBlocksPlaced));
      const nextTheme = DIMENSION_THEME[this.currentDimensionIndex + 1] ?? null;
      const nextName = nextTheme?.name ?? null;
      const nextRulesSummary = nextTheme ? this.buildDimensionRuleSummary(nextTheme) : '';
      let statusState = 'inactive';
      let statusLabel = 'Portal Dormant';
      let statusMessage = remainingBlocks
        ? `${remainingBlocks} frame block${remainingBlocks === 1 ? '' : 's'} required to stabilise.`
        : 'Awaiting ignition sequence';
      if (portalProgressLabel) {
        if (this.victoryAchieved) {
          portalProgressLabel.textContent = 'Eternal Ingot secured';
          statusState = 'victory';
          statusLabel = 'Network Secured';
          statusMessage = 'Eternal Ingot secured';
        } else if (this.netheriteChallengeActive && this.dimensionSettings?.id === 'netherite') {
          const seconds = Number.isFinite(this.netheriteCountdownDisplay)
            ? Math.max(0, this.netheriteCountdownDisplay)
            : Math.ceil(Math.max(0, this.netheriteCountdownSeconds - this.netheriteChallengeTimer));
          portalProgressLabel.textContent = `Collapse in ${seconds}s`;
          statusState = 'active';
          statusLabel = 'Collapse Imminent';
          statusMessage = `Collapse in ${seconds}s`;
        } else if (this.portalActivated) {
          portalProgressLabel.textContent = 'Portal stabilised';
          statusState = 'active';
          statusLabel = 'Portal Active';
          if (nextName) {
            statusMessage = `Next: ${nextName}${nextRulesSummary ? ` — ${nextRulesSummary}` : ''}`;
          } else {
            statusMessage = 'Gateway stabilised — return to base.';
          }
        } else if (this.portalReady) {
          portalProgressLabel.textContent = 'Portal ready — press F to ignite';
          statusState = 'ready';
          statusLabel = 'Portal Ready';
          statusMessage = nextName
            ? `Ignite with F to access ${nextName}.`
            : 'Ignite with F to open the final gateway.';
        } else if (obstructionState.blocked && !this.portalActivated) {
          portalProgressLabel.textContent = 'Clear the portal footprint';
          statusState = 'blocked';
          statusLabel = 'Portal Blocked';
          statusMessage = obstructionState.summary || 'Gateway occupied';
        } else if (!this.portalFrameInteriorValid && this.portalBlocksPlaced > 0) {
          portalProgressLabel.textContent = 'Clear the portal interior';
          statusState = 'blocked';
          statusLabel = 'Portal Blocked';
          statusMessage = 'Interior obstructed';
        } else {
          portalProgressLabel.textContent = `Portal frame ${progressPercent}%`;
          if (progress > 0) {
            statusState = 'building';
            statusLabel = 'Portal Stabilising';
            statusMessage = `${progressPercent}% frame integrity`;
          }
        }
      }
      this.setPortalStatusIndicator(statusState, statusMessage, statusLabel);
      if (portalProgressBar) {
        let displayProgress = this.victoryAchieved ? 1 : progress;
        if (this.portalReady && !this.portalActivated) {
          displayProgress = 1;
        } else if (obstructionState.blocked && !this.portalActivated) {
          displayProgress = Math.min(displayProgress, 0.5);
        } else if (!this.portalFrameInteriorValid && !this.portalActivated) {
          displayProgress = Math.min(displayProgress, 0.5);
        } else if (this.netheriteChallengeActive && this.dimensionSettings?.id === 'netherite') {
          const remaining = Math.max(0, this.netheriteCountdownSeconds - this.netheriteChallengeTimer);
          const fraction = this.netheriteCountdownSeconds > 0 ? 1 - Math.min(1, remaining / this.netheriteCountdownSeconds) : 1;
          displayProgress = Math.max(displayProgress, fraction);
        }
        portalProgressBar.style.setProperty('--progress', displayProgress.toFixed(2));
      }
    }

    updateFooterSummary() {
      if (!this.footerEl) return;
      const scoreValue = Math.round(this.score ?? 0);
      if (this.footerScoreEl) {
        this.footerScoreEl.textContent = scoreValue.toLocaleString();
      }
      const currentTheme = this.dimensionSettings ?? DIMENSION_THEME[this.currentDimensionIndex] ?? null;
      const dimensionName = currentTheme?.name ?? 'Unknown Realm';
      if (this.footerDimensionEl) {
        this.footerDimensionEl.textContent = dimensionName;
      }
      let statusMessage = '';
      if (this.victoryAchieved) {
        statusMessage = 'Eternal Ingot secured — portals stabilised.';
      } else if (this.portalActivated) {
        const nextName = this.getNextDimensionName();
        statusMessage = nextName ? `Crossing to ${nextName}.` : 'Crossing to the next realm.';
      } else if (this.portalReady) {
        statusMessage = 'Portal ready — ignite with F to travel.';
      } else if (this.lastHintMessage) {
        statusMessage = this.lastHintMessage;
      } else if (currentTheme?.description) {
        statusMessage = currentTheme.description;
      } else {
        statusMessage = 'Stabilising the portal network.';
      }
      if (this.footerStatusEl) {
        this.footerStatusEl.textContent = statusMessage;
      }
      const state = this.victoryAchieved
        ? 'victory'
        : this.portalActivated
          ? 'transition'
          : this.portalReady
            ? 'ready'
            : 'explore';
      this.footerEl.dataset.state = state;
    }

    revealDimensionIntro(theme, options = {}) {
      const { dimensionIntroEl, dimensionIntroNameEl, dimensionIntroRulesEl } = this.ui;
      if (!dimensionIntroEl || !dimensionIntroNameEl || !dimensionIntroRulesEl) {
        return;
      }
      const timerHost = typeof window !== 'undefined' ? window : globalThis;
      timerHost.clearTimeout(this.dimensionIntroAutoHideTimer);
      timerHost.clearTimeout(this.dimensionIntroFadeTimer);
      const name = typeof theme?.name === 'string' && theme.name.trim() ? theme.name.trim() : 'Unknown Dimension';
      const intent = typeof options.intent === 'string' ? options.intent : 'arrival';
      const rules = this.buildDimensionRuleSummary(theme, options.rulesOverride);
      const heading =
        intent === 'preview'
          ? `Next: ${name}`
          : intent === 'arrival'
            ? `Entering ${name}`
            : name;
      const ruleLabel = intent === 'preview' ? 'Rules Preview' : 'Rules';
      dimensionIntroEl.dataset.intent = intent;
      dimensionIntroNameEl.textContent = heading;
      dimensionIntroRulesEl.textContent = `${ruleLabel}: ${rules}`;
      dimensionIntroEl.hidden = false;
      dimensionIntroEl.setAttribute('aria-hidden', 'false');
      dimensionIntroEl.classList.remove('active');
      void dimensionIntroEl.offsetWidth;
      dimensionIntroEl.classList.add('active');
      const defaultDuration = intent === 'preview' ? 6400 : 5200;
      const duration = Number.isFinite(options.duration)
        ? Math.max(0, options.duration)
        : defaultDuration;
      if (duration > 0 && !this.prefersReducedMotion) {
        this.dimensionIntroAutoHideTimer = timerHost.setTimeout(() => {
          this.hideDimensionIntro();
        }, duration);
      }
    }

    hideDimensionIntro(immediate = false) {
      const { dimensionIntroEl } = this.ui;
      if (!dimensionIntroEl) {
        return;
      }
      const timerHost = typeof window !== 'undefined' ? window : globalThis;
      timerHost.clearTimeout(this.dimensionIntroAutoHideTimer);
      this.dimensionIntroAutoHideTimer = null;
      timerHost.clearTimeout(this.dimensionIntroFadeTimer);
      const finalize = () => {
        dimensionIntroEl.hidden = true;
        dimensionIntroEl.setAttribute('aria-hidden', 'true');
        dimensionIntroEl.dataset.intent = 'hidden';
      };
      if (immediate || this.prefersReducedMotion) {
        dimensionIntroEl.classList.remove('active');
        finalize();
        return;
      }
      dimensionIntroEl.classList.remove('active');
      this.dimensionIntroFadeTimer = timerHost.setTimeout(finalize, 360);
    }

    getNextDimensionName() {
      const nextTheme = DIMENSION_THEME[this.currentDimensionIndex + 1];
      return nextTheme?.name ?? null;
    }

    buildDimensionRuleSummary(theme, override) {
      if (override && typeof override === 'string' && override.trim()) {
        return override.trim();
      }
      if (!theme) {
        return 'Adapt quickly to the realm\'s rules to survive.';
      }
      const descriptors = [];
      const gravity = Number.isFinite(theme?.gravity) ? Number(theme.gravity).toFixed(2) : null;
      if (gravity) {
        descriptors.push(`Gravity ×${gravity}`);
      }
      const speed =
        Number.isFinite(theme?.speedMultiplier) && theme.speedMultiplier !== 1
          ? Number(theme.speedMultiplier).toFixed(2)
          : null;
      if (speed) {
        descriptors.push(`Speed ×${speed}`);
      }
      const extraRules = Array.isArray(theme?.rules)
        ? theme.rules.filter((rule) => typeof rule === 'string' && rule.trim()).map((rule) => rule.trim())
        : typeof theme?.rules === 'string' && theme.rules.trim()
          ? [theme.rules.trim()]
          : [];
      if (extraRules.length) {
        descriptors.push(...extraRules);
      }
      const description = typeof theme?.description === 'string' ? theme.description.trim() : '';
      if (descriptors.length && description) {
        return `${descriptors.join(' · ')} — ${description}`;
      }
      if (description) {
        return description;
      }
      if (descriptors.length) {
        return descriptors.join(' · ');
      }
      return 'Adapt quickly to the realm\'s rules to survive.';
    }

    previewUpcomingDimension() {
      if (this.victoryAchieved) {
        return;
      }
      const nextTheme = DIMENSION_THEME[this.currentDimensionIndex + 1];
      if (!nextTheme) {
        return;
      }
      const summary = this.buildDimensionRuleSummary(nextTheme);
      this.revealDimensionIntro(nextTheme, {
        intent: 'preview',
        duration: 6400,
        rulesOverride: summary,
      });
    }

    updateDimensionInfoPanel() {
      const { dimensionInfoEl } = this.ui;
      if (!dimensionInfoEl) return;
      if (this.victoryAchieved) {
        const rank = this.getPlayerLeaderboardRank();
        const totalRuns = Math.max(this.scoreEntries.length, rank ?? 0);
        const leaderboardLabel = rank
          ? `Rank #${rank} of ${Math.max(totalRuns, rank)}`
          : 'Unranked — connect to publish your run.';
        const scoreLabel = Math.round(this.score);
        dimensionInfoEl.innerHTML = `
          <h3>Netherite Terminus</h3>
          <p>You stabilised every dimension and recovered the Eternal Ingot.</p>
          <p class="dimension-meta">Score ${scoreLabel} · ${leaderboardLabel}</p>
          <p><button type="button" class="victory-replay-button" data-action="replay-run">Replay Run</button></p>
        `;
        return;
      }
      const theme = this.dimensionSettings ?? DIMENSION_THEME[0];
      dimensionInfoEl.dataset.simpleInit = 'true';
      const gravity = (theme.gravity ?? 1).toFixed(2);
      const speed = (theme.speedMultiplier ?? 1).toFixed(2);
      let meta = `Gravity ×${gravity} · Speed ×${speed} · Dimension ${
        this.currentDimensionIndex + 1
      }/${DIMENSION_THEME.length}`;
      if (theme.id === 'netherite' && !this.victoryAchieved) {
        if (this.netheriteChallengeActive && !this.eternalIngotCollected) {
          const seconds = Number.isFinite(this.netheriteCountdownDisplay)
            ? Math.max(0, this.netheriteCountdownDisplay)
            : Math.ceil(Math.max(0, this.netheriteCountdownSeconds - this.netheriteChallengeTimer));
          meta += ` · Collapse in ${seconds}s`;
        } else if (this.eternalIngotCollected) {
          meta += ' · Eternal Ingot secured';
        }
      }
      dimensionInfoEl.innerHTML = `
        <h3>${theme.name}</h3>
        <p>${theme.description ?? ''}</p>
        <p class="dimension-meta">${meta}</p>
      `;
    }

    showVictoryCelebration() {
      const doc = typeof document !== 'undefined' ? document : null;
      this.victorySummary = this.createRunSummary('victory');
      this.victoryCelebrationActive = true;
      this.victoryShareBusy = false;
      if (this.victoryCelebrationEl) {
        this.victoryCelebrationEl.hidden = false;
        this.victoryCelebrationEl.setAttribute('aria-hidden', 'false');
        this.victoryCelebrationEl.classList.remove('active');
        void this.victoryCelebrationEl.offsetWidth;
        this.victoryCelebrationEl.classList.add('active');
      }
      if (doc?.body) {
        doc.body.classList.add('victory-celebration-active');
      }
      if (this.victoryShareStatusEl) {
        this.victoryShareStatusEl.textContent = '';
      }
      if (this.victoryShareButton) {
        this.victoryShareButton.disabled = false;
        this.victoryShareButton.removeAttribute('aria-busy');
      }
      if (this.victoryCloseButton) {
        this.victoryCloseButton.disabled = false;
      }
      this.clearVictoryEffectTimers();
      this.prepareVictoryEffects();
      this.updateVictoryCelebrationStats();
      if (typeof requestAnimationFrame === 'function' && this.victoryShareButton?.focus) {
        requestAnimationFrame(() => {
          try {
            this.victoryShareButton.focus({ preventScroll: true });
          } catch (error) {
            // Ignore focus issues if the browser prevents it.
          }
        });
      }
      this.updateFooterSummary();
    }

    hideVictoryCelebration(immediate = false) {
      const doc = typeof document !== 'undefined' ? document : null;
      if (!this.victoryCelebrationEl) {
        this.victoryCelebrationActive = false;
        return;
      }
      this.victoryCelebrationActive = false;
      this.clearVictoryEffectTimers();
      this.victoryCelebrationEl.classList.remove('active');
      this.victoryCelebrationEl.setAttribute('aria-hidden', 'true');
      const finalize = () => {
        this.victoryCelebrationEl.hidden = true;
        if (this.victoryConfettiEl) {
          this.victoryConfettiEl.innerHTML = '';
        }
        if (this.victoryFireworksEl) {
          this.victoryFireworksEl.innerHTML = '';
        }
      };
      if (this.victoryHideTimer) {
        clearTimeout(this.victoryHideTimer);
        this.victoryHideTimer = null;
      }
      if (immediate) {
        finalize();
      } else {
        this.victoryHideTimer = setTimeout(finalize, 360);
      }
      if (this.victoryShareStatusEl) {
        this.victoryShareStatusEl.textContent = '';
      }
      if (this.victoryShareButton) {
        this.victoryShareButton.disabled = false;
        this.victoryShareButton.removeAttribute('aria-busy');
      }
      if (doc?.body) {
        doc.body.classList.remove('victory-celebration-active');
      }
      this.updateFooterSummary();
    }

    clearVictoryEffectTimers() {
      if (Array.isArray(this.victoryEffectTimers) && this.victoryEffectTimers.length) {
        this.victoryEffectTimers.forEach((timer) => clearTimeout(timer));
      }
      this.victoryEffectTimers = [];
    }

    prepareVictoryEffects() {
      if (this.prefersReducedMotion) {
        if (this.victoryConfettiEl) {
          this.victoryConfettiEl.innerHTML = '';
        }
        if (this.victoryFireworksEl) {
          this.victoryFireworksEl.innerHTML = '';
        }
        return;
      }
      const doc = typeof document !== 'undefined' ? document : null;
      if (!doc) {
        return;
      }
      if (this.victoryConfettiEl) {
        this.victoryConfettiEl.innerHTML = '';
        const colors = ['#f7b333', '#78f2ff', '#ff5e8b', '#7bff85', '#b19cff'];
        const pieces = 42;
        for (let i = 0; i < pieces; i += 1) {
          const piece = doc.createElement('div');
          piece.className = 'victory-confetti__piece';
          const color = colors[i % colors.length];
          piece.style.setProperty('--x', `${Math.random() * 100}%`);
          piece.style.setProperty('--offset-x', `${(Math.random() - 0.5) * 40}vw`);
          piece.style.setProperty('--rotation', `${Math.floor(Math.random() * 540) - 180}deg`);
          piece.style.setProperty('--duration', `${(2.4 + Math.random() * 1.4).toFixed(2)}s`);
          piece.style.setProperty('--delay', `${(Math.random() * 0.8).toFixed(2)}s`);
          piece.style.setProperty('--color', color);
          this.victoryConfettiEl.appendChild(piece);
        }
      }
      if (this.victoryFireworksEl) {
        this.victoryFireworksEl.innerHTML = '';
        const bursts = 3;
        for (let i = 0; i < bursts; i += 1) {
          const firework = doc.createElement('div');
          firework.className = 'victory-firework';
          firework.style.setProperty('--left', `${20 + Math.random() * 60}%`);
          firework.style.setProperty('--duration', `${(1.6 + Math.random() * 0.6).toFixed(2)}s`);
          firework.style.setProperty('--delay', `${(0.35 * i).toFixed(2)}s`);
          firework.style.setProperty('--travel', `${(-35 - Math.random() * 28).toFixed(2)}vh`);
          firework.style.setProperty('--hue', `${Math.floor(Math.random() * 360)}`);
          const burst = doc.createElement('div');
          burst.className = 'victory-firework__burst';
          firework.appendChild(burst);
          this.victoryFireworksEl.appendChild(firework);
          const timer = setTimeout(() => {
            firework.classList.add('burst');
          }, 550 + Math.random() * 420 + i * 140);
          this.victoryEffectTimers.push(timer);
        }
      }
    }

    updateVictoryCelebrationStats() {
      if (!this.victoryCelebrationActive) {
        return;
      }
      const summary = { ...(this.victorySummary || this.createRunSummary('victory')) };
      summary.score = Math.round(this.score ?? summary.score ?? 0);
      summary.dimensionCount = Math.min(DIMENSION_THEME.length, this.currentDimensionIndex + 1);
      summary.dimensionTotal = DIMENSION_THEME.length;
      summary.runTimeSeconds = Math.round(this.elapsed ?? summary.runTimeSeconds ?? 0);
      summary.recipeCount = this.craftedRecipes?.size ?? summary.recipeCount ?? 0;
      summary.dimensionLabel = this.dimensionSettings?.name ?? summary.dimensionLabel;
      this.victorySummary = summary;
      const rank = this.getPlayerLeaderboardRank();
      const formatRunTime = this.scoreboardUtils?.formatRunTime
        ? (seconds) => this.scoreboardUtils.formatRunTime(seconds)
        : (seconds) => {
            const total = Math.max(0, Math.round(seconds ?? 0));
            const minutes = Math.floor(total / 60);
            const secs = total % 60;
            const pad = (value) => String(value).padStart(2, '0');
            return `${pad(minutes)}:${pad(secs)}`;
          };
      if (this.victoryStatsEl) {
        const stats = [
          { label: 'Final Score', value: summary.score.toLocaleString() },
          {
            label: 'Dimensions Stabilised',
            value: `${summary.dimensionCount}/${summary.dimensionTotal}`,
          },
          { label: 'Recipes Crafted', value: Number(summary.recipeCount || 0).toLocaleString() },
          { label: 'Run Time', value: formatRunTime(summary.runTimeSeconds) },
          { label: 'Leaderboard Rank', value: rank ? `#${rank}` : 'Offline' },
        ];
        const breakdown = this.getScoreBreakdownSnapshot();
        const formatBreakdownValue = (value) =>
          this.formatPointValue
            ? this.formatPointValue(value)
            : Math.max(0, Number(value) || 0).toLocaleString();
        if (breakdown.dimensions !== undefined) {
          stats.push({ label: 'Dimension Score', value: formatBreakdownValue(breakdown.dimensions) });
        }
        if (breakdown.recipes !== undefined) {
          stats.push({ label: 'Crafting Score', value: formatBreakdownValue(breakdown.recipes) });
        }
        if (breakdown.penalties) {
          stats.push({ label: 'Penalties', value: `-${formatBreakdownValue(breakdown.penalties)}` });
        }
        const statsMarkup = stats
          .map(
            (stat) => `
          <div>
            <dt>${escapeHtml(stat.label)}</dt>
            <dd>${escapeHtml(String(stat.value))}</dd>
          </div>
        `,
          )
          .join('');
        this.victoryStatsEl.innerHTML = statsMarkup;
      }
      if (this.victoryMessageEl) {
        const dimensionText = summary.dimensionCount === 1 ? 'dimension' : 'dimensions';
        const rankMessage = rank
          ? `Rank #${rank} on the current leaderboard.`
          : this.apiBaseUrl
            ? 'Sign in to publish your run to the leaderboard.'
            : 'Connect to the leaderboard to publish your run.';
        this.victoryMessageEl.textContent = `You stabilised ${summary.dimensionCount} ${dimensionText} and recovered the Eternal Ingot. ${rankMessage}`;
      }
      if (this.victoryBannerEl?.classList.contains('visible')) {
        const bannerMessage = rank
          ? `Score ${summary.score.toLocaleString()} · Rank #${rank}`
          : `Score ${summary.score.toLocaleString()} · Offline run`;
        this.victoryBannerEl.innerHTML = `
          <h3>Victory</h3>
          <p>${escapeHtml(bannerMessage)}</p>
        `;
      }
    }

    handleVictoryClose(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      this.hideVictoryCelebration();
      this.hideVictoryBanner();
      this.showHint('Celebration closed — continue exploring!');
      try {
        this.canvas?.focus({ preventScroll: true });
      } catch (error) {
        // Ignore focus errors in browsers that block programmatic focus.
      }
      this.updatePointerHintForInputMode();
    }

    async handleVictoryShare(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      if (this.victoryShareBusy) {
        return;
      }
      this.victoryShareBusy = true;
      this.updateVictoryCelebrationStats();
      const summary = { ...(this.victorySummary || this.createRunSummary('victory')) };
      const rank = this.getPlayerLeaderboardRank();
      const formatRunTime = this.scoreboardUtils?.formatRunTime
        ? (seconds) => this.scoreboardUtils.formatRunTime(seconds)
        : (seconds) => {
            const total = Math.max(0, Math.round(seconds ?? 0));
            const minutes = Math.floor(total / 60);
            const secs = total % 60;
            const pad = (value) => String(value).padStart(2, '0');
            return `${pad(minutes)}:${pad(secs)}`;
          };
      const baseLines = [
        `Secured the Eternal Ingot in Infinite Rails with ${summary.score.toLocaleString()} points!`,
        `Stabilised ${summary.dimensionCount}/${summary.dimensionTotal} dimensions in ${formatRunTime(summary.runTimeSeconds)}.`,
        rank ? `Current leaderboard rank: #${rank}.` : 'Offline run — connect to publish your rank.',
      ];
      const shareUrl = typeof window !== 'undefined' && window.location ? window.location.href : '';
      const shareText = baseLines.join(' ');
      const clipboardText = shareUrl ? `${shareText}\n${shareUrl}` : shareText;
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      let statusMessage = '';
      if (this.victoryShareButton) {
        this.victoryShareButton.disabled = true;
        this.victoryShareButton.setAttribute('aria-busy', 'true');
      }
      try {
        if (nav?.share) {
          const payload = { title: 'Infinite Rails Victory', text: shareText };
          if (shareUrl) {
            payload.url = shareUrl;
          }
          const canShare = typeof nav.canShare === 'function' ? nav.canShare(payload) : true;
          if (canShare) {
            await nav.share(payload);
            statusMessage = 'Shared your victory!';
          }
        }
        if (!statusMessage && nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(clipboardText);
          statusMessage = 'Copied run summary to clipboard.';
        }
        if (!statusMessage) {
          if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
            window.prompt('Copy your Infinite Rails victory summary:', clipboardText);
            statusMessage = 'Share unsupported — summary ready to copy.';
          } else {
            statusMessage = `Share unsupported — copy this summary: ${clipboardText}`;
          }
        }
        this.scheduleScoreSync('victory-share');
      } catch (error) {
        if (error?.name === 'AbortError') {
          statusMessage = 'Share cancelled.';
        } else {
          console.warn('Victory share failed', error);
          statusMessage = 'Share failed — copy your summary manually.';
        }
      } finally {
        if (this.victoryShareButton) {
          this.victoryShareButton.disabled = false;
          this.victoryShareButton.removeAttribute('aria-busy');
        }
        this.victoryShareBusy = false;
      }
      if (statusMessage) {
        if (this.victoryShareStatusEl) {
          this.victoryShareStatusEl.textContent = statusMessage;
        } else {
          this.showHint(statusMessage);
        }
      }
      this.updateFooterSummary();
    }

    showVictoryBanner(message) {
      if (!this.victoryBannerEl) return;
      const text = typeof message === 'string' && message.trim().length
        ? message.trim()
        : 'Victory achieved — Eternal Ingot secured!';
      this.victoryBannerEl.innerHTML = `
        <h3>Victory</h3>
        <p>${escapeHtml(text)}</p>
      `;
      this.victoryBannerEl.classList.add('visible');
      this.victoryBannerEl.setAttribute('aria-hidden', 'false');
    }

    hideVictoryBanner() {
      if (!this.victoryBannerEl) return;
      this.victoryBannerEl.classList.remove('visible');
      this.victoryBannerEl.setAttribute('aria-hidden', 'true');
      this.victoryBannerEl.innerHTML = '';
    }

    exposeDebugInterface() {
      if (typeof window === 'undefined') {
        return;
      }
      const scope = window;
      scope.__INFINITE_RAILS_ACTIVE_EXPERIENCE__ = this;
      scope.__INFINITE_RAILS_DEBUG__ = {
        experience: this,
        getSnapshot: () => this.getDebugSnapshot(),
        forceNight: (seconds) => this.forceNightCycle(seconds),
        spawnZombieWave: (count) => this.debugSpawnZombieWave(count),
        completePortalFrame: () => this.debugCompletePortalFrame(),
        ignitePortal: (tool) => this.debugIgnitePortal(tool),
        advanceDimension: () => this.debugAdvanceDimension(),
        assetLoads: (limit) => this.getAssetLoadLog(limit),
        setVerboseMode: (enabled) => {
          const controls = scope.InfiniteRails?.debug;
          if (controls && typeof controls.setEnabled === 'function') {
            controls.setEnabled(Boolean(enabled), { source: 'debug-interface' });
            return true;
          }
          return false;
        },
        enableVerboseMode: () => {
          const controls = scope.InfiniteRails?.debug;
          if (controls && typeof controls.setEnabled === 'function') {
            controls.setEnabled(true, { source: 'debug-interface' });
            return true;
          }
          return false;
        },
        disableVerboseMode: () => {
          const controls = scope.InfiniteRails?.debug;
          if (controls && typeof controls.setEnabled === 'function') {
            controls.setEnabled(false, { source: 'debug-interface' });
            return true;
          }
          return false;
        },
        toggleVerboseMode: () => {
          const controls = scope.InfiniteRails?.debug;
          if (controls && typeof controls.toggle === 'function') {
            controls.toggle({ source: 'debug-interface' });
            return true;
          }
          if (controls && typeof controls.setEnabled === 'function' && typeof controls.isEnabled === 'function') {
            try {
              const current = Boolean(controls.isEnabled());
              controls.setEnabled(!current, { source: 'debug-interface' });
              return true;
            } catch (error) {
              console.debug('Verbose mode toggle failed', error);
            }
          }
          return false;
        },
        isVerboseModeEnabled: () => {
          const controls = scope.InfiniteRails?.debug;
          if (controls && typeof controls.isEnabled === 'function') {
            try {
              return Boolean(controls.isEnabled());
            } catch (error) {
              console.debug('Verbose mode probe failed', error);
            }
          }
          return false;
        },
      };
      try {
        scope.dispatchEvent(
          new CustomEvent('infinite-rails:start', {
            detail: {
              mode: 'simple',
              timestamp: Date.now(),
            },
          }),
        );
      } catch (error) {
        console.debug('Debug event dispatch failed', error);
      }
    }

    createWorldSnapshot() {
      if (!Array.isArray(this.heightMap)) {
        return [];
      }
      return this.heightMap.map((row) => (Array.isArray(row) ? row.slice() : []));
    }

    publishStateSnapshot(reason = 'update') {
      if (typeof window === 'undefined') {
        return;
      }
      const scope = window;
      const world = this.createWorldSnapshot();
      const score = {
        total: Math.round(this.score ?? 0),
        recipes: this.craftedRecipes?.size ?? 0,
        dimensions: Math.max(0, this.currentDimensionIndex + 1),
      };
      scope.__INFINITE_RAILS_STATE__ = {
        isRunning: Boolean(this.started && !this.rendererUnavailable),
        rendererMode: scope.__INFINITE_RAILS_RENDERER_MODE__ || null,
        world,
        dimension: { name: this.dimensionSettings?.name ?? null },
        portal: {
          ready: Boolean(this.portalReady),
          activated: Boolean(this.portalActivated),
        },
        score,
        reason,
        updatedAt: Date.now(),
      };
    }

    getDebugSnapshot() {
      return {
        started: this.started,
        dimension: this.dimensionSettings?.name ?? null,
        dimensionIndex: this.currentDimensionIndex,
        voxelColumns: this.columns?.size ?? 0,
        portalReady: Boolean(this.portalReady),
        portalActivated: Boolean(this.portalActivated),
        zombieCount: Array.isArray(this.zombies) ? this.zombies.length : 0,
        golemCount: Array.isArray(this.golems) ? this.golems.length : 0,
        score: Math.round(this.score ?? 0),
        hotbarSlots: Array.isArray(this.hotbar) ? this.hotbar.length : 0,
        hotbarExpanded: Boolean(this.hotbarExpanded),
        sceneChildren: this.scene?.children?.length ?? 0,
        hudActive:
          typeof document !== 'undefined' ? document.body.classList.contains('game-active') : false,
        netheriteChallengeActive: Boolean(this.netheriteChallengeActive),
        netheriteCountdown: Math.max(0, Math.ceil(Math.max(0, this.netheriteCountdownSeconds - this.netheriteChallengeTimer))),
        eternalIngotCollected: Boolean(this.eternalIngotCollected),
        daylight: this.daylightIntensity ?? 0,
        assetLoadsRecent: this.getAssetLoadLog(5),
        assetFailures: Array.from(this.assetFailureCounts.entries()),
        assetRecoveryPending: Array.from(this.assetRecoveryPendingKeys),
        assetRecoveryPromptActive: Boolean(this.assetRecoveryPromptActive),
      };
    }

    forceNightCycle(seconds = DAY_LENGTH_SECONDS * 0.75) {
      if (!Number.isFinite(seconds)) {
        seconds = DAY_LENGTH_SECONDS * 0.75;
      }
      this.elapsed = seconds % DAY_LENGTH_SECONDS;
      this.updateDayNightCycle();
      this.lastZombieSpawn = this.elapsed - ZOMBIE_SPAWN_INTERVAL - 0.1;
      return this.daylightIntensity;
    }

    debugSpawnZombieWave(count = 1) {
      const total = Math.max(1, Math.floor(count));
      if (!this.isNight()) {
        this.forceNightCycle();
      }
      let spawned = 0;
      for (let i = 0; i < total; i += 1) {
        if (this.zombies.length >= ZOMBIE_MAX_PER_DIMENSION) {
          break;
        }
        this.spawnZombie();
        spawned += 1;
        this.elapsed += 0.05;
      }
      return spawned;
    }

    debugCompletePortalFrame() {
      if (!this.portalFrameSlots?.size) {
        this.resetPortalFrameState();
      }
      this.portalFrameSlots.forEach((slot) => {
        slot.filled = true;
      });
      this.portalBlocksPlaced = this.portalFrameSlots.size;
      this.portalFrameInteriorValid = true;
      this.checkPortalActivation();
      return this.portalReady;
    }

    debugIgnitePortal(tool = 'torch') {
      if (!this.portalReady) {
        this.debugCompletePortalFrame();
      }
      if (!this.portalActivated) {
        this.ignitePortal(tool);
      }
      return this.portalActivated;
    }

    debugAdvanceDimension() {
      const previousIndex = this.currentDimensionIndex;
      if (!this.portalActivated) {
        this.debugIgnitePortal();
      }
      if (!this.portalActivated) {
        return false;
      }
      this.advanceDimension();
      return this.currentDimensionIndex !== previousIndex;
    }
  }

  function createSimpleExperience(options) {
    return new SimpleExperience(options);
  }

  window.SimpleExperience = {
    create: createSimpleExperience,
    dimensionManifest: DIMENSION_ASSET_MANIFEST,
    dimensionThemes: DIMENSION_THEME,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports.SimpleExperience = window.SimpleExperience;
  }
})();
