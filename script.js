(function () {
  const globalScope =
    (typeof window !== 'undefined' && window) ||
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof global !== 'undefined' && global) ||
    {};

  const externalAssetResolver = globalScope.InfiniteRailsAssetResolver || null;

  function fallbackNormaliseAssetBase(base) {
    if (!base || typeof base !== 'string') {
      return null;
    }
    try {
      const resolved = new URL(base, globalScope?.location?.href ?? undefined);
      if (!resolved) return null;
      let href = resolved.href;
      if (!href.endsWith('/')) {
        href += '/';
      }
      return href;
    } catch (error) {
      return null;
    }
  }

  function fallbackCreateAssetUrlCandidates(relativePath, normaliseBaseFn) {
    if (!relativePath || typeof relativePath !== 'string') {
      return [];
    }
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (value) => {
      if (!value || seen.has(value)) {
        return;
      }
      seen.add(value);
      candidates.push(value);
    };

    const configBase = normaliseBaseFn(globalScope.APP_CONFIG?.assetBaseUrl ?? null);
    if (configBase) {
      try {
        pushCandidate(new URL(relativePath, configBase).href);
      } catch (error) {
        // Ignore invalid config values and continue exploring fallbacks.
      }
    }

    const documentRef = typeof document !== 'undefined' ? document : globalScope.document || null;
    const windowLocation =
      typeof window !== 'undefined' ? window.location : globalScope.location || null;

    if (documentRef) {
      const findScriptElement = () => {
        if (documentRef.currentScript) {
          return documentRef.currentScript;
        }
        const scripts = Array.from(documentRef.getElementsByTagName('script'));
        return scripts.find((element) =>
          typeof element.src === 'string' && /\bscript\.js(?:[?#].*)?$/i.test(element.src || ''),
        );
      };

      const currentScript = findScriptElement();
      if (currentScript?.src) {
        try {
          const scriptUrl = new URL(currentScript.src, windowLocation?.href ?? undefined);
          const scriptDir = scriptUrl.href.replace(/[^/]*$/, '');
          pushCandidate(new URL(relativePath, scriptDir).href);
          if (scriptUrl.origin) {
            pushCandidate(new URL(relativePath, `${scriptUrl.origin}/`).href);
          }
        } catch (error) {
          // Swallow and continue gathering fallbacks.
        }
      }

      if (documentRef.baseURI) {
        try {
          pushCandidate(new URL(relativePath, documentRef.baseURI).href);
        } catch (error) {
          // Ignore invalid base URIs.
        }
      }
    }

    if (windowLocation?.origin) {
      try {
        pushCandidate(new URL(relativePath, `${windowLocation.origin}/`).href);
      } catch (error) {
        // Continue to relative fallbacks below.
      }
    }

    pushCandidate(relativePath);

    return candidates;
  }

  function fallbackResolveAssetUrl(relativePath, createCandidatesFn) {
    const candidates = createCandidatesFn(relativePath);
    return candidates.length ? candidates[0] : relativePath;
  }

  const normaliseAssetBase =
    externalAssetResolver?.normaliseAssetBase ?? fallbackNormaliseAssetBase;

  const createAssetUrlCandidates =
    externalAssetResolver?.createAssetUrlCandidates ??
    ((relativePath) => fallbackCreateAssetUrlCandidates(relativePath, normaliseAssetBase));

  const resolveAssetUrl =
    externalAssetResolver?.resolveAssetUrl ??
    ((relativePath) => fallbackResolveAssetUrl(relativePath, createAssetUrlCandidates));

  if (!externalAssetResolver) {
    globalScope.InfiniteRailsAssetResolver = {
      normaliseAssetBase,
      createAssetUrlCandidates,
      resolveAssetUrl,
    };
  }

  const THREE_CDN_URLS = [
    // Local build bundled with the project so the experience works offline/file://
    // without depending on a CDN (which may be blocked in classroom environments).
    ...createAssetUrlCandidates('vendor/three.min.js'),
    'https://unpkg.com/three@0.161.0/build/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.min.js',
  ];
  const GLTF_SCRIPT_URLS = [
    ...createAssetUrlCandidates('vendor/GLTFLoader.js'),
    'https://unpkg.com/three@0.161.0/examples/js/loaders/GLTFLoader.js',
    'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/js/loaders/GLTFLoader.js',
  ];
  const MODEL_ASSET_URLS = {
    arm: resolveAssetUrl('assets/arm.gltf'),
    steve: resolveAssetUrl('assets/steve.gltf'),
    zombie: resolveAssetUrl('assets/zombie.gltf'),
    ironGolem: resolveAssetUrl('assets/iron_golem.gltf'),
  };
  let gltfLoaderPromise = null;
  let threeLoaderPromise = null;
  let gltfLoaderInstancePromise = null;

  function getGlobalScope() {
    return globalScope;
  }

  function createScoreboardUtilsFallback() {
    function normalizeDimensionLabels(entry) {
      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const sources = [];
      const addSource = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
          if (value.length) {
            sources.push(value);
          }
          return;
        }
        if (typeof value === 'string') {
          const segments = value
            .split(/[|,/\u2022\u2013\u2014]+/)
            .map((segment) => segment.trim())
            .filter(Boolean);
          if (segments.length) {
            sources.push(segments);
          }
        }
      };

      addSource(entry.dimensionLabels);
      addSource(entry.dimensionNames);
      addSource(entry.dimensionList);
      addSource(Array.isArray(entry.dimensions) ? entry.dimensions : null);
      addSource(Array.isArray(entry.realms) ? entry.realms : null);
      addSource(entry.dimensionSummary);

      const labels = [];
      const seen = new Set();
      sources.forEach((source) => {
        source.forEach((item) => {
          let label = null;
          if (typeof item === 'string') {
            label = item.trim();
          } else if (item && typeof item === 'object') {
            if (typeof item.name === 'string') {
              label = item.name.trim();
            } else if (typeof item.label === 'string') {
              label = item.label.trim();
            } else if (typeof item.id === 'string') {
              label = item.id.trim();
            }
          }
          if (label && !seen.has(label)) {
            seen.add(label);
            labels.push(label);
          }
        });
      });

      return labels;
    }

    function normalizeScoreEntries(entries = []) {
      return entries
        .map((entry) => ({
          id: entry.id ?? entry.googleId ?? entry.playerId ?? `guest-${Math.random().toString(36).slice(2)}`,
          name: entry.name ?? entry.displayName ?? 'Explorer',
          score: Number(entry.score ?? entry.points ?? 0),
          dimensionCount: Number(entry.dimensionCount ?? entry.dimensions ?? entry.realms ?? 0),
          runTimeSeconds: Number(entry.runTimeSeconds ?? entry.runtimeSeconds ?? entry.runtime ?? 0),
          inventoryCount: Number(entry.inventoryCount ?? entry.resources ?? entry.items ?? 0),
          location:
            entry.location ??
            (entry.latitude !== undefined && entry.longitude !== undefined
              ? { latitude: entry.latitude, longitude: entry.longitude }
              : null),
          locationLabel: entry.locationLabel ?? entry.location?.label ?? entry.locationName ?? null,
          updatedAt: entry.updatedAt ?? entry.lastUpdated ?? entry.updated_at ?? null,
          dimensionLabels: normalizeDimensionLabels(entry),
        }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    function upsertScoreEntry(entries, entry) {
      const next = entries.slice();
      const index = next.findIndex((item) => item.id === entry.id);
      if (index >= 0) {
        if ((entry.score ?? 0) >= (next[index].score ?? 0)) {
          next[index] = { ...next[index], ...entry };
        } else {
          next[index] = { ...entry, score: next[index].score };
        }
      } else {
        next.push(entry);
      }
      return normalizeScoreEntries(next);
    }

    function formatScoreNumber(score) {
      return Math.round(score ?? 0).toLocaleString();
    }

    function formatRunTime(seconds) {
      if (!seconds) return '—';
      const totalSeconds = Math.max(0, Math.round(seconds));
      const minutes = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remMinutes = minutes % 60;
        return `${hours}h ${remMinutes}m`;
      }
      if (minutes > 0) {
        return `${minutes}m ${secs}s`;
      }
      return `${secs}s`;
    }

    function formatLocationLabel(entry) {
      if (entry.locationLabel) return entry.locationLabel;
      const location = entry.location;
      if (!location) return 'Location hidden';
      if (location.error) return location.error;
      if (location.latitude !== undefined && location.longitude !== undefined) {
        return `Lat ${Number(location.latitude).toFixed(1)}, Lon ${Number(location.longitude).toFixed(1)}`;
      }
      return 'Location hidden';
    }

    return {
      normalizeScoreEntries,
      upsertScoreEntry,
      formatScoreNumber,
      formatRunTime,
      formatLocationLabel,
    };
  }

  function createCombatUtilsFallback() {
    const DEFAULT_CHUNK_SIZE = 16;
    const DEFAULT_PER_CHUNK = 3;

    function normaliseDimensionAccessor(value) {
      if (typeof value === 'function') {
        return value;
      }
      if (Number.isFinite(value)) {
        return () => value;
      }
      return () => 0;
    }

    function key(x, y) {
      return `${x},${y}`;
    }

    function calculateZombieSpawnCount(options = {}) {
      const widthAccessor = normaliseDimensionAccessor(options.width ?? options.getWidth ?? 0);
      const heightAccessor = normaliseDimensionAccessor(options.height ?? options.getHeight ?? 0);
      const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_SIZE));
      const perChunk = Math.max(1, Math.floor(options.perChunk ?? DEFAULT_PER_CHUNK));
      const width = Math.max(1, Math.floor(widthAccessor()));
      const height = Math.max(1, Math.floor(heightAccessor()));
      const chunkX = Math.max(1, Math.ceil(width / chunkSize));
      const chunkY = Math.max(1, Math.ceil(height / chunkSize));
      return chunkX * chunkY * perChunk;
    }

    function createGridPathfinder({ getWidth, getHeight, isWalkable, maxIterations = 512 } = {}) {
      if (typeof isWalkable !== 'function') {
        throw new Error('createGridPathfinder requires an isWalkable function.');
      }
      const widthAccessor = normaliseDimensionAccessor(getWidth ?? 0);
      const heightAccessor = normaliseDimensionAccessor(getHeight ?? 0);
      const neighborOffsets = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];

      const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

      function reconstructPath(cameFrom, goalKey, startKey) {
        const path = [];
        let currentKey = goalKey;
        while (currentKey && currentKey !== startKey) {
          const entry = cameFrom.get(currentKey);
          if (!entry) {
            return [];
          }
          const [cx, cy] = currentKey.split(',').map((value) => Number.parseInt(value, 10));
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
            return [];
          }
          path.push({ x: cx, y: cy });
          currentKey = entry;
        }
        path.reverse();
        return path;
      }

      function findPath(start, goal, options = {}) {
        if (!start || !goal) return [];
        const width = Math.max(1, Math.floor(widthAccessor()));
        const height = Math.max(1, Math.floor(heightAccessor()));
        const allowGoal = Boolean(options.allowGoal);
        const iterationLimit = Math.max(1, Math.floor(options.maxIterations ?? maxIterations));
        const startKey = key(start.x, start.y);
        const goalKey = key(goal.x, goal.y);
        if (startKey === goalKey) {
          return [];
        }

        const open = [];
        const cameFrom = new Map();
        const gScore = new Map();
        cameFrom.set(startKey, null);
        gScore.set(startKey, 0);
        open.push({ x: start.x, y: start.y, g: 0, f: heuristic(start, goal) });

        let iterations = 0;
        while (open.length && iterations < iterationLimit) {
          iterations += 1;
          let bestIndex = 0;
          for (let i = 1; i < open.length; i++) {
            if (open[i].f < open[bestIndex].f) {
              bestIndex = i;
            }
          }
          const current = open.splice(bestIndex, 1)[0];
          const currentKey = key(current.x, current.y);
          const expectedScore = gScore.get(currentKey);
          if (expectedScore !== current.g) {
            continue;
          }
          if (currentKey === goalKey) {
            return reconstructPath(cameFrom, currentKey, startKey);
          }
          for (const offset of neighborOffsets) {
            const nx = current.x + offset.x;
            const ny = current.y + offset.y;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              continue;
            }
            const neighborKey = key(nx, ny);
            if (!(allowGoal && neighborKey === goalKey) && !isWalkable(nx, ny)) {
              continue;
            }
            const tentativeScore = current.g + 1;
            if (tentativeScore >= (gScore.get(neighborKey) ?? Infinity)) {
              continue;
            }
            cameFrom.set(neighborKey, currentKey);
            gScore.set(neighborKey, tentativeScore);
            const fScore = tentativeScore + heuristic({ x: nx, y: ny }, goal);
            open.push({ x: nx, y: ny, g: tentativeScore, f: fScore });
          }
        }
        return [];
      }

      return { findPath };
    }

    function applyZombieStrike(state, { onStrike, onDeath } = {}) {
      if (!state || typeof state !== 'object' || !state.player) {
        throw new Error('applyZombieStrike requires a state with a player.');
      }
      const player = state.player;
      const maxHearts = Number.isFinite(player.maxHearts) ? player.maxHearts : 10;
      const heartsPerHit = maxHearts / 5;
      const hits = (player.zombieHits ?? 0) + 1;
      player.zombieHits = hits;
      const remainingHearts = Math.max(0, maxHearts - heartsPerHit * hits);
      player.hearts = remainingHearts;
      const result = {
        hits,
        remainingHearts,
        defeated: hits >= 5,
      };
      if (result.defeated) {
        if (typeof onDeath === 'function') {
          onDeath('Death');
        }
      } else {
        const remainingHits = 5 - hits;
        if (typeof onStrike === 'function') {
          onStrike(
            `Minecraft zombie strike! ${remainingHits} more hit${remainingHits === 1 ? '' : 's'} before defeat.`
          );
        }
      }
      return result;
    }

    function snapshotInventory(player) {
      if (!player || typeof player !== 'object') {
        return { inventory: [], satchel: [], selectedSlot: 0 };
      }
      const inventory = Array.isArray(player.inventory)
        ? player.inventory.map((slot) =>
            slot && typeof slot === 'object' && slot.item
              ? { item: slot.item, quantity: slot.quantity }
              : null
          )
        : [];
      const satchel = Array.isArray(player.satchel)
        ? player.satchel
            .map((bundle) =>
              bundle && typeof bundle === 'object' && bundle.item
                ? { item: bundle.item, quantity: bundle.quantity }
                : null
            )
            .filter(Boolean)
        : [];
      const selectedSlot = Number.isInteger(player.selectedSlot) ? player.selectedSlot : 0;
      return { inventory, satchel, selectedSlot };
    }

    function restoreInventory(player, snapshot) {
      if (!player || typeof player !== 'object' || !snapshot) return;
      if (Array.isArray(snapshot.inventory)) {
        player.inventory = snapshot.inventory.map((slot) =>
          slot && typeof slot === 'object' && slot.item ? { item: slot.item, quantity: slot.quantity } : null
        );
      }
      if (Array.isArray(snapshot.satchel)) {
        player.satchel = snapshot.satchel.map((bundle) => ({ item: bundle.item, quantity: bundle.quantity }));
      }
      if (Number.isInteger(snapshot.selectedSlot)) {
        player.selectedSlot = snapshot.selectedSlot;
      }
    }

    function completeRespawnState(state) {
      if (!state || !state.player) return;
      const player = state.player;
      if (Number.isFinite(player.maxHearts)) {
        player.hearts = player.maxHearts;
      }
      if (Number.isFinite(player.maxAir)) {
        player.air = player.maxAir;
      }
      player.zombieHits = 0;
    }

    return {
      calculateZombieSpawnCount,
      createGridPathfinder,
      applyZombieStrike,
      snapshotInventory,
      restoreInventory,
      completeRespawnState,
    };
  }

  const SCOREBOARD_UTILS_FALLBACK = createScoreboardUtilsFallback();
  const COMBAT_UTILS_FALLBACK = createCombatUtilsFallback();

  const globalScope = getGlobalScope();
  const EMBEDDED_ASSETS = globalScope?.INFINITE_RAILS_EMBEDDED_ASSETS ?? null;
  if (globalScope) {
    if (!globalScope.ScoreboardUtils) {
      globalScope.ScoreboardUtils = SCOREBOARD_UTILS_FALLBACK;
    }
    if (!globalScope.CombatUtils) {
      globalScope.CombatUtils = COMBAT_UTILS_FALLBACK;
    }
  }

  const KEY_BINDINGS_STORAGE_KEY = 'infinite-rails-keybindings';
  const HOTBAR_SLOT_COUNT = 10;
  const DEFAULT_KEY_BINDINGS = (() => {
    const map = {
      moveForward: ['KeyW', 'ArrowUp'],
      moveBackward: ['KeyS', 'ArrowDown'],
      moveLeft: ['KeyA', 'ArrowLeft'],
      moveRight: ['KeyD', 'ArrowRight'],
      jump: ['Space'],
      interact: ['KeyF'],
      placeBlock: ['KeyQ'],
      toggleCrafting: ['KeyE'],
      toggleInventory: ['KeyI'],
      buildPortal: ['KeyR'],
      resetPosition: ['KeyT'],
      toggleCameraPerspective: ['KeyV'],
      closeMenus: ['Escape'],
    };
    for (let slot = 1; slot <= HOTBAR_SLOT_COUNT; slot += 1) {
      const action = `hotbar${slot}`;
      const bindings = [];
      if (slot <= 9) {
        bindings.push(`Digit${slot}`);
        bindings.push(`Numpad${slot}`);
      } else {
        bindings.push('Digit0');
        bindings.push('Numpad0');
      }
      map[action] = bindings;
    }
    Object.keys(map).forEach((action) => {
      map[action] = Object.freeze([...map[action]]);
    });
    return Object.freeze(map);
  })();

  const KEY_BINDING_ACTION_GROUPS = Object.freeze([
    {
      id: 'movement',
      title: 'Movement',
      actions: [
        { id: 'moveForward', label: 'Move forward' },
        { id: 'moveBackward', label: 'Move backward' },
        { id: 'moveLeft', label: 'Strafe left' },
        { id: 'moveRight', label: 'Strafe right' },
        { id: 'jump', label: 'Jump / Harvest' },
      ],
    },
    {
      id: 'interaction',
      title: 'Core actions',
      actions: [
        { id: 'interact', label: 'Interact / Use' },
        { id: 'placeBlock', label: 'Place block' },
        { id: 'buildPortal', label: 'Ignite portal' },
        { id: 'resetPosition', label: 'Reset position' },
      ],
    },
    {
      id: 'menus',
      title: 'Menus & camera',
      actions: [
        { id: 'toggleCrafting', label: 'Toggle crafting' },
        { id: 'toggleInventory', label: 'Toggle inventory' },
        { id: 'toggleCameraPerspective', label: 'Toggle camera view' },
        { id: 'closeMenus', label: 'Close menus' },
      ],
    },
    {
      id: 'hotbar',
      title: 'Hotbar slots',
      actions: Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => ({
        id: `hotbar${index + 1}`,
        label: `Select slot ${index + 1}`,
      })),
    },
  ]);

  const KEY_BINDING_ACTION_LABELS = (() => {
    const map = new Map();
    KEY_BINDING_ACTION_GROUPS.forEach((group) => {
      group.actions.forEach((action) => {
        map.set(action.id, action.label);
      });
    });
    return map;
  })();

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

  function areKeyListsEqual(a = [], b = []) {
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

  function diffKeyBindingMaps(base = {}, current = {}) {
    const overrides = {};
    const actions = new Set([...Object.keys(base), ...Object.keys(current)]);
    actions.forEach((action) => {
      const baseKeys = base[action] ?? [];
      const currentKeys = current[action] ?? [];
      if (!areKeyListsEqual(baseKeys, currentKeys)) {
        if (currentKeys.length) {
          overrides[action] = [...currentKeys];
        }
      }
    });
    return Object.keys(overrides).length ? overrides : null;
  }

  function loadStoredKeyBindingOverrides() {
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

  function persistKeyBindingsToStorage(base, current) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      const overrides = diffKeyBindingMaps(base, current);
      if (overrides) {
        window.localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(overrides));
      } else {
        window.localStorage.removeItem(KEY_BINDINGS_STORAGE_KEY);
      }
    } catch (error) {
      console.debug('Failed to persist key bindings.', error);
    }
  }

  function buildKeyBindings({ includeStored = true } = {}) {
    const config = typeof window !== 'undefined' ? window.APP_CONFIG : globalScope?.APP_CONFIG;
    const configOverrides = normaliseKeyBindingMap(config?.keyBindings);
    const defaults = cloneKeyBindingMap(DEFAULT_KEY_BINDINGS);
    const base = mergeKeyBindingMaps(defaults, configOverrides);
    const stored = includeStored ? loadStoredKeyBindingOverrides() : null;
    const keyBindings = mergeKeyBindingMaps(base, stored);
    return { defaults, base, keyBindings };
  }

  function normaliseEventCode(code, keyFallback = '') {
    if (typeof code === 'string' && code.trim()) {
      return code;
    }
    const key = typeof keyFallback === 'string' ? keyFallback.trim() : '';
    if (!key) {
      return '';
    }
    const lower = key.toLowerCase();
    if (lower.length === 1 && lower >= 'a' && lower <= 'z') {
      return `Key${lower.toUpperCase()}`;
    }
    if (/^[0-9]$/.test(lower)) {
      return `Digit${lower}`;
    }
    switch (lower) {
      case ' ': {
        return 'Space';
      }
      case 'space':
      case 'spacebar':
        return 'Space';
      case 'arrowup':
        return 'ArrowUp';
      case 'arrowdown':
        return 'ArrowDown';
      case 'arrowleft':
        return 'ArrowLeft';
      case 'arrowright':
        return 'ArrowRight';
      case 'escape':
        return 'Escape';
      case 'esc':
        return 'Escape';
      case 'enter':
        return 'Enter';
      default:
        break;
    }
    return '';
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

  const SUPPORTS_MODEL_ASSETS =
    typeof window === 'undefined' || (typeof window.location !== 'undefined' && window.location.protocol !== 'file:');

  const originalConsoleWarn = console.warn?.bind(console);
  if (originalConsoleWarn) {
    console.warn = (...args) => {
      const [message] = args;
      if (typeof message === 'string' && message.includes('Texture marked for update but no image data found.')) {
        return;
      }
      originalConsoleWarn(...args);
    };
  }

  const originalConsoleError = console.error?.bind(console);
  if (originalConsoleError) {
    console.error = (...args) => {
      const [message] = args;
      if (typeof message === 'string' && message.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
        return;
      }
      originalConsoleError(...args);
    };
  }

  function loadScript(src, attributes = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      Object.entries(attributes).forEach(([key, value]) => {
        script.setAttribute(key, value);
      });
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  const composeOverlayControllers = {};

  function createComposeOverlayController(elements = {}, options = {}) {
    const {
      overlay = null,
      dialog = null,
      title: titleEl = null,
      message: messageEl = null,
      spinner: spinnerEl = null,
      actionsContainer = null,
    } = elements;
    if (!overlay) {
      return {
        show: () => {},
        hide: () => {},
        update: () => {},
        isVisible: () => false,
        getState: () => ({ visible: false, mode: 'idle', title: '', message: '', actions: [] }),
      };
    }

    const {
      defaults = {},
      shouldAutoFocus = null,
      onStateChange = null,
    } = options ?? {};

    const fallbackTitles = {
      loading: defaults.loadingTitle ?? 'Working…',
      error: defaults.errorTitle ?? 'Something went wrong',
      idle: defaults.idleTitle ?? '',
    };
    const fallbackMessages = {
      loading: defaults.loadingMessage ?? '',
      error: defaults.errorMessage ?? '',
      idle: defaults.idleMessage ?? '',
    };

    let state = {
      visible: false,
      mode: 'idle',
      title: '',
      message: '',
      actions: [],
      focusActionId: null,
    };

    let lastVisible = false;
    let renderedActions = [];

    function render() {
      const { visible, mode, title, message, actions } = state;
      overlay.hidden = !visible;
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
      overlay.setAttribute('data-mode', mode);
      if (dialog) {
        dialog.setAttribute('role', mode === 'error' ? 'alertdialog' : 'dialog');
        dialog.setAttribute('aria-modal', visible ? 'true' : 'false');
      }
      if (titleEl) {
        const fallback = fallbackTitles[mode] ?? fallbackTitles.idle ?? '';
        titleEl.textContent = title || fallback;
      }
      if (messageEl) {
        const fallbackMessage = fallbackMessages[mode] ?? fallbackMessages.idle ?? '';
        messageEl.textContent = message || fallbackMessage;
      }
      if (spinnerEl) {
        spinnerEl.hidden = mode !== 'loading';
      }

      renderedActions = [];
      if (actionsContainer) {
        const hasActions = Array.isArray(actions) && actions.length > 0;
        actionsContainer.innerHTML = '';
        actionsContainer.hidden = !hasActions;
        if (hasActions) {
          actions.forEach((action) => {
            if (!action) return;
            const button = document.createElement('button');
            button.type = 'button';
            const variant = action.variant === 'accent' ? 'accent' : action.variant === 'danger' ? 'danger' : 'ghost';
            button.className = `${variant} small compose-overlay__action`;
            button.textContent = action.label || (variant === 'accent' ? 'Confirm' : 'Dismiss');
            if (action.title) {
              button.title = action.title;
            }
            if (action.id) {
              button.dataset.actionId = action.id;
            }
            const disabled = Boolean(action.disabled);
            button.disabled = disabled;
            button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
            if (typeof action.onClick === 'function') {
              button.addEventListener('click', (event) => {
                if (button.disabled) return;
                action.onClick(event);
              });
            }
            actionsContainer.appendChild(button);
            renderedActions.push({
              id: action.id ?? null,
              button,
              variant,
            });
          });
        }
      }

      const shouldFocus =
        visible &&
        !lastVisible &&
        (typeof shouldAutoFocus !== 'function' || shouldAutoFocus(state));
      lastVisible = visible;
      if (shouldFocus) {
        let focusTarget = null;
        if (state.focusActionId) {
          focusTarget = renderedActions.find((entry) => entry.id === state.focusActionId)?.button ?? null;
        }
        if (!focusTarget) {
          focusTarget = renderedActions.find((entry) => entry.variant === 'accent')?.button ?? null;
        }
        if (!focusTarget) {
          focusTarget = renderedActions[0]?.button ?? null;
        }
        if (!focusTarget) {
          focusTarget = dialog;
        }
        try {
          focusTarget?.focus?.({ preventScroll: true });
        } catch (error) {
          console.warn('Unable to focus overlay action.', error);
        }
      }

      if (typeof onStateChange === 'function') {
        onStateChange({ ...state });
      }
    }

    function update(partial = {}) {
      state = { ...state, ...partial };
      render();
    }

    function show(options = {}) {
      const {
        mode = 'loading',
        title = '',
        message = '',
        actions = [],
        focusActionId: explicitFocusId = null,
      } = options ?? {};
      const actionList = Array.isArray(actions) ? actions : [];
      const resolvedFocus =
        explicitFocusId ??
        actionList.find((action) => action?.autoFocus && action?.id)?.id ??
        null;
      update({
        visible: true,
        mode,
        title,
        message,
        actions: actionList,
        focusActionId: resolvedFocus,
      });
    }

    function hide() {
      update({
        visible: false,
        mode: 'idle',
        title: '',
        message: '',
        actions: [],
        focusActionId: null,
      });
    }

    function isVisible() {
      return state.visible;
    }

    function getState() {
      return { ...state };
    }

    function focus() {
      if (!state.visible) {
        return;
      }
      lastVisible = false;
      render();
    }

    return { show, hide, update, isVisible, getState, focus };
  }

  function getGlobalOverlayController() {
    if (composeOverlayControllers.global) {
      return composeOverlayControllers.global;
    }
    const overlay = document.getElementById('globalOverlay');
    if (!overlay) {
      return null;
    }
    const controller = createComposeOverlayController(
      {
        overlay,
        dialog: document.getElementById('globalOverlayDialog'),
        title: document.getElementById('globalOverlayTitle'),
        message: document.getElementById('globalOverlayMessage'),
        spinner: document.getElementById('globalOverlaySpinner'),
        actionsContainer: document.getElementById('globalOverlayActions'),
      },
      {
        defaults: {
          loadingTitle: 'Working…',
          errorTitle: 'Action required',
          idleTitle: '',
        },
        shouldAutoFocus: () => true,
      },
    );
    composeOverlayControllers.global = controller;
    return controller;
  }

  function showDependencyError(message, error) {
    console.error(message, error);
    const modal = document.getElementById('introModal');
    const startButton = document.getElementById('startButton');
    if (startButton) {
      startButton.disabled = true;
      startButton.textContent = 'Unable to start';
      startButton.setAttribute('aria-hidden', 'true');
      startButton.setAttribute('tabindex', '-1');
    }
    const overlay = getGlobalOverlayController();
    if (!modal) {
      if (overlay) {
        overlay.show({
          mode: 'error',
          title: 'Unable to start experience',
          message,
          actions: [
            {
              id: 'dismiss',
              label: 'Dismiss',
              variant: 'accent',
              onClick: () => overlay.hide(),
              autoFocus: true,
            },
          ],
        });
      } else {
        alert(message);
      }
      return;
    }
    modal.hidden = false;
    modal.style.display = 'grid';
    modal.setAttribute('aria-hidden', 'false');
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.innerHTML = `
        <h2>Infinite Dimension</h2>
        <p class=\"modal-error\">${message}</p>
      `;
    }
    if (overlay) {
      overlay.show({
        mode: 'error',
        title: 'Unable to start experience',
        message,
        actions: [
          {
            id: 'dismiss',
            label: 'Dismiss',
            variant: 'accent',
            onClick: () => overlay.hide(),
            autoFocus: true,
          },
        ],
      });
    }
  }

  function bootstrap() {
    const THREE = window.THREE_GLOBAL || window.THREE;

    if (!THREE) {
      throw new Error('Three.js failed to load. Ensure the CDN script is available.');
    }

    let portalShaderSupport = typeof THREE?.ShaderMaterial === 'function';
    let rendererRecoveryFrames = 0;
    let pendingUniformSanitizations = 0;
    let uniformSanitizationFailureStreak = 0;

    const scoreboardUtils =
      (typeof window !== 'undefined' && window.ScoreboardUtils) ||
      (typeof globalThis !== 'undefined' && globalThis.ScoreboardUtils) ||
      SCOREBOARD_UTILS_FALLBACK;

    const { normalizeScoreEntries, upsertScoreEntry, formatScoreNumber, formatRunTime, formatLocationLabel } = scoreboardUtils;

    const canvas = document.getElementById('gameCanvas');
    if (canvas && !canvas.hasAttribute('tabindex')) {
      canvas.setAttribute('tabindex', '0');
    }
    const startButton = document.getElementById('startButton');
    const introModal = document.getElementById('introModal');
    const guideModal = document.getElementById('guideModal');
    const mobileControls = document.getElementById('mobileControls');
    const virtualJoystickEl = document.getElementById('virtualJoystick');
    const virtualJoystickThumb = virtualJoystickEl?.querySelector('.virtual-joystick__thumb') ?? null;
    const heartsEl = document.getElementById('hearts');
    const bubblesEl = document.getElementById('bubbles');
    const timeEl = document.getElementById('timeOfDay');
    const dimensionInfoEl = document.getElementById('dimensionInfo');
    const portalProgressEl = document.getElementById('portalProgress');
    const portalStatusEl = document.getElementById('portalStatus');
    const hudRootEl = document.getElementById('gameHud');
    const objectivesPanelEl = document.getElementById('objectivesPanel');
    const victoryBannerEl = document.getElementById('victoryBanner');
    const victoryCelebrationEl = document.getElementById('victoryCelebration');
    const victoryConfettiEl = document.getElementById('victoryConfetti');
    const victoryFireworksEl = document.getElementById('victoryFireworks');
    const victoryShareButton = document.getElementById('victoryShareButton');
    const victoryCloseButton = document.getElementById('victoryCloseButton');
    const victoryShareStatusEl = document.getElementById('victoryShareStatus');
    const victoryStatsEl = document.getElementById('victoryStats');
    const victoryMessageEl = document.getElementById('victoryMessage');
    const hotbarEl = document.getElementById('hotbar');
    const extendedInventoryEl = document.getElementById('extendedInventory');
    const toggleExtendedBtn = document.getElementById('toggleExtended');
    const craftButton = document.getElementById('craftButton');
    const clearCraftButton = document.getElementById('clearCraft');
    const recipeListEl = document.getElementById('recipeList');
    const recipeSearchEl = document.getElementById('recipeSearch');
    const craftSequenceEl = document.getElementById('craftSequence');
    const craftSuggestionsEl = document.getElementById('craftSuggestions');
    const craftConfettiEl = document.getElementById('craftConfetti');
    const craftingInventoryEl = document.getElementById('craftingInventory');
    const openCraftingSearchButton = document.getElementById('openCraftingSearch');
    const craftingSearchPanel = document.getElementById('craftingSearchPanel');
    const craftingSearchInput = document.getElementById('craftingSearchInput');
    const craftingSearchResultsEl = document.getElementById('craftingSearchResults');
    const craftingHelperEl = document.getElementById('craftingHelper');
    const craftingHelperTitleEl = document.getElementById('craftingHelperTitle');
    const craftingHelperDescriptionEl = document.getElementById('craftingHelperDescription');
    const craftingHelperMatchesEl = document.getElementById('craftingHelperMatches');
    const closeCraftingSearchButton = document.getElementById('closeCraftingSearch');
    const craftLauncherButton = document.getElementById('openCrafting');
    const craftingModal = document.getElementById('craftingModal');
    const closeCraftingButton = document.getElementById('closeCrafting');
    const eventLogEl = document.getElementById('eventLog');
    const codexListEl = document.getElementById('dimensionCodex');
    const openGuideButton = document.getElementById('openGuide');
    const landingGuideButton = document.getElementById('landingGuideButton');
    const openSettingsButton = document.getElementById('openSettings');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsButton = document.getElementById('closeSettings');
    const subtitleOverlay = document.getElementById('subtitleOverlay');
    const crosshairEl = document.getElementById('crosshair');
    const pointerHintEl = document.getElementById('pointerHint');
    const handOverlayEl = document.getElementById('handOverlay');
    const handOverlayLabel = document.getElementById('handOverlayLabel');
    const handOverlayIcon = document.getElementById('handOverlayIcon');
    const colorBlindToggle = document.getElementById('colorBlindMode');
    const subtitleToggle = document.getElementById('subtitleToggle');
    const gameBriefingEl = document.getElementById('gameBriefing');
    const dismissBriefingButton = document.getElementById('dismissBriefing');
    const gameBriefingStepsEl = document.getElementById('gameBriefingSteps');
    const briefingMovementKeysEl = document.getElementById('briefingMovementKeys');
    const briefingGatherKeysEl = document.getElementById('briefingGatherKeys');
    const briefingPlaceKeysEl = document.getElementById('briefingPlaceKeys');
    const desktopControlsSummaryEl = document.getElementById('desktopControlsSummary');
    const primerHarvestJumpEl = document.querySelector('[data-keybinding-copy="harvest-jump"]');
    const primerHarvestInteractEl = document.querySelector('[data-keybinding-copy="harvest-interact"]');
    const primerPlaceKeyEl = document.querySelector('[data-keybinding-copy="place-block"]');
    const primerIgniteKeyEl = document.querySelector('[data-keybinding-copy="ignite-portal"]');
    const controlReferenceCells = {
      movement: document.querySelector('[data-keybinding-table="movement"]'),
      jump: document.querySelector('[data-keybinding-table="jump"]'),
      interact: document.querySelector('[data-keybinding-table="interact"]'),
      toggleCrafting: document.querySelector('[data-keybinding-table="toggleCrafting"]'),
      toggleInventory: document.querySelector('[data-keybinding-table="toggleInventory"]'),
      placeBlock: document.querySelector('[data-keybinding-table="placeBlock"]'),
      toggleCameraPerspective: document.querySelector('[data-keybinding-table="toggleCameraPerspective"]'),
      resetPosition: document.querySelector('[data-keybinding-table="resetPosition"]'),
      hotbar: document.querySelector('[data-keybinding-table="hotbar"]'),
    };
    const settingsVolumeInputs = {
      master: document.getElementById('masterVolume'),
      music: document.getElementById('musicVolume'),
      effects: document.getElementById('effectsVolume'),
    };
    const settingsVolumeLabels = {
      master: document.querySelector('[data-volume-label="master"]'),
      music: document.querySelector('[data-volume-label="music"]'),
      effects: document.querySelector('[data-volume-label="effects"]'),
    };
    const settingsKeyBindingsList = document.getElementById('settingsKeyBindingsList');
    const resetKeyBindingsButton = document.getElementById('resetKeyBindingsButton');
    let lastFocusedBeforeGuide = null;
    const keyBindingButtonMap = new Map();
    const keyBindingDefaultLabelMap = new Map();
    let activeKeyBindingCapture = null;
    const portalProgressLabel = portalProgressEl?.querySelector('.label') ?? null;
    const portalProgressBar = portalProgressEl?.querySelector('.bar') ?? null;
    const portalStatusText = portalStatusEl?.querySelector('.portal-status__text') ?? null;
    const portalStatusStateText = portalStatusEl?.querySelector('.portal-status__state') ?? null;
    const portalStatusDetailText = portalStatusEl?.querySelector('.portal-status__detail') ?? null;
    const portalStatusIcon = portalStatusEl?.querySelector('.portal-status__icon') ?? null;
    const dimensionIntroEl = document.getElementById('dimensionIntro');
    const dimensionIntroNameEl = document.getElementById('dimensionIntroName');
    const dimensionIntroRulesEl = document.getElementById('dimensionIntroRules');
    const headerUserNameEl = document.getElementById('headerUserName');
    const headerUserLocationEl = document.getElementById('headerUserLocation');
    const userNameDisplayEl = document.getElementById('userNameDisplay');
    const userLocationDisplayEl = document.getElementById('userLocationDisplay');
    const userDeviceDisplayEl = document.getElementById('userDeviceDisplay');
    const googleButtonContainers = Array.from(document.querySelectorAll('[data-google-button-container]'));
    const googleFallbackButtons = Array.from(document.querySelectorAll('[data-google-fallback-signin]'));
    const googleSignOutButtons = Array.from(document.querySelectorAll('[data-google-sign-out]'));
    const landingSignInPanel = document.getElementById('landingSignInPanel');
    const scoreboardListEl = document.getElementById('scoreboardList');
    const scoreboardStatusEl = document.getElementById('scoreboardStatus');
    const refreshScoresButton = document.getElementById('refreshScores');
    const leaderboardOverlay = document.getElementById('leaderboardOverlay');
    const leaderboardOverlayDialog = document.getElementById('leaderboardOverlayDialog');
    const leaderboardOverlayTitle = document.getElementById('leaderboardOverlayTitle');
    const leaderboardOverlayMessage = document.getElementById('leaderboardOverlayMessage');
    const leaderboardOverlaySpinner = document.getElementById('leaderboardOverlaySpinner');
    const leaderboardOverlayActions = document.getElementById('leaderboardOverlayActions');
    const scorePanelEl = document.getElementById('scorePanel');
    const scoreTotalEl = document.getElementById('scoreTotal');
    const scoreRecipesEl = document.getElementById('scoreRecipes');
    const scoreDimensionsEl = document.getElementById('scoreDimensions');
    const playerHintEl = document.getElementById('playerHint');
    const inventoryModal = document.getElementById('inventoryModal');
    const closeInventoryButton = document.getElementById('closeInventory');
    const inventoryGridEl = document.getElementById('inventoryGrid');
    const inventorySortButton = document.getElementById('inventorySortButton');
    const inventoryOverflowEl = document.getElementById('inventoryOverflow');

    function shouldStartSimpleMode() {
      if (typeof window === 'undefined') return false;
      const params = new URLSearchParams(window.location.search ?? '');
      const explicitMode = params.get('mode');
      if (explicitMode === 'advanced') return false;
      if (explicitMode === 'simple') return true;
      if (params.get('advanced') === '1') return false;
      if (params.get('simple') === '1') return true;
      const simpleAvailable = Boolean(window.SimpleExperience?.create);
      const advancedAvailable = Boolean(window.APP_CONFIG?.enableAdvancedExperience);
      if (window.APP_CONFIG?.forceSimpleMode) return true;
      if (window.APP_CONFIG?.forceAdvanced) return false;
      if (window.APP_CONFIG?.defaultMode) {
        if (window.APP_CONFIG.defaultMode === 'advanced') return false;
        if (window.APP_CONFIG.defaultMode === 'simple') return true;
      }
      if (!simpleAvailable) {
        return false;
      }
      if (!advancedAvailable) {
        return true;
      }
      return window.APP_CONFIG?.preferAdvanced !== true;
    }

    function setupSimpleExperienceIntegrations(experience) {
      if (!experience) return;
      const appConfig = window.APP_CONFIG || {};
      const IDENTITY_STORAGE_KEY = 'infinite-rails-simple-identity';
      const identityState = {
        signedIn: false,
        googleBusy: false,
        displayName: experience.playerDisplayName,
        googleId: null,
        googleAvatar: null,
        location: null,
        locationLabel: 'Location unavailable',
        deviceLabel:
          (typeof experience.getDeviceLabel === 'function'
            ? experience.getDeviceLabel()
            : experience.deviceLabel) || 'Device details pending',
      };
      let googleAuthInstance = null;
      let googleAuthPromise = null;
      let gsiScriptPromise = null;
      let gsiInitialized = false;
      let hydratingIdentity = false;

      const simpleEventCleanup = [];
      let pendingSummary = null;
      let pendingVictorySummary = null;

      function getGlobalInteractionScope() {
        if (typeof window !== 'undefined') return window;
        if (typeof globalThis !== 'undefined') return globalThis;
        return null;
      }

      function registerSimpleEvent(eventName, handler) {
        const scope = getGlobalInteractionScope();
        if (!scope || typeof scope.addEventListener !== 'function') return;
        scope.addEventListener(eventName, handler);
        simpleEventCleanup.push(() => scope.removeEventListener(eventName, handler));
      }

      function getActiveGameState() {
        const scope = getGlobalInteractionScope();
        if (!scope) return null;
        return scope.__INFINITE_RAILS_STATE__ || null;
      }

      function normaliseSimpleSummary(payload = {}) {
        const source = payload && typeof payload.summary === 'object' ? payload.summary : payload;
        if (!source || typeof source !== 'object') {
          return null;
        }
        const normalizedDimensions = ensureArrayOfStrings(source.dimensions ?? []);
        const normalizedRecipes = ensureArrayOfStrings(source.recipes ?? []);
        const dimensionCount = Number.isFinite(source.dimensionCount)
          ? Number(source.dimensionCount)
          : normalizedDimensions.length;
        const recipeCount = Number.isFinite(source.recipeCount)
          ? Number(source.recipeCount)
          : normalizedRecipes.length;
        return {
          score: Number.isFinite(source.score) ? Math.round(Number(source.score)) : null,
          runTimeSeconds: Number.isFinite(source.runTimeSeconds)
            ? Math.max(0, Number(source.runTimeSeconds))
            : null,
          inventoryCount: Number.isFinite(source.inventoryCount)
            ? Math.max(0, Number(source.inventoryCount))
            : null,
          dimensionCount,
          recipeCount,
          dimensions: normalizedDimensions,
          recipes: normalizedRecipes,
          reason: payload?.reason ?? source.reason ?? null,
        };
      }

      function mergeSimpleSummary(partial) {
        if (!partial) return null;
        const currentState = getActiveGameState();
        const existing = (currentState && currentState.simpleSummary) || pendingSummary || {};
        return {
          score: Number.isFinite(partial.score) ? partial.score : existing.score ?? null,
          runTimeSeconds: Number.isFinite(partial.runTimeSeconds)
            ? partial.runTimeSeconds
            : existing.runTimeSeconds ?? null,
          inventoryCount: Number.isFinite(partial.inventoryCount)
            ? partial.inventoryCount
            : existing.inventoryCount ?? null,
          dimensionCount: Number.isFinite(partial.dimensionCount)
            ? partial.dimensionCount
            : Number.isFinite(existing.dimensionCount)
              ? existing.dimensionCount
              : partial.dimensions?.length ?? existing.dimensions?.length ?? null,
          recipeCount: Number.isFinite(partial.recipeCount)
            ? partial.recipeCount
            : Number.isFinite(existing.recipeCount)
              ? existing.recipeCount
              : partial.recipes?.length ?? existing.recipes?.length ?? null,
          dimensions: partial.dimensions?.length ? partial.dimensions : existing.dimensions ?? [],
          recipes: partial.recipes?.length ? partial.recipes : existing.recipes ?? [],
          reason: partial.reason ?? existing.reason ?? null,
        };
      }

      function applySummaryToState(summary) {
        const gameState = getActiveGameState();
        if (!gameState) {
          pendingSummary = summary;
          return false;
        }
        gameState.simpleSummary = summary;
        pendingSummary = null;
        return true;
      }

      function syncScoreStateFromSummary(summary) {
        if (!summary) return;
        scoreState.recipes.clear();
        const recipeList = Array.isArray(summary.recipes) ? summary.recipes : [];
        recipeList.forEach((id, index) => {
          const key = (typeof id === 'string' && id.trim()) || `recipe-${index + 1}`;
          scoreState.recipes.add(key);
        });
        if (Number.isFinite(summary.recipeCount)) {
          while (scoreState.recipes.size < summary.recipeCount) {
            scoreState.recipes.add(`recipe-${scoreState.recipes.size + 1}`);
          }
        }
        scoreState.dimensions.clear();
        const dimensionList = Array.isArray(summary.dimensions) ? summary.dimensions : [];
        dimensionList.forEach((label, index) => {
          const key = (typeof label === 'string' && label.trim()) || `dimension-${index + 1}`;
          scoreState.dimensions.add(key);
        });
        if (Number.isFinite(summary.dimensionCount)) {
          while (scoreState.dimensions.size < summary.dimensionCount) {
            scoreState.dimensions.add(`dimension-${scoreState.dimensions.size + 1}`);
          }
        }
        if (Number.isFinite(summary.score)) {
          scoreState.score = summary.score;
        }
      }

      function updateScoreFromSummary(summary, options = {}) {
        if (!summary) return false;
        syncScoreStateFromSummary(summary);
        const applied = applySummaryToState(summary);
        if (applied || getActiveGameState()) {
          updateScoreOverlay({ flash: options.flash, triggerFlip: options.triggerFlip });
        }
        return applied;
      }

      registerSimpleEvent('infinite-rails:state-ready', () => {
        if (pendingSummary) {
          const summary = pendingSummary;
          pendingSummary = null;
          updateScoreFromSummary(summary, {});
        }
        if (pendingVictorySummary) {
          const summary = pendingVictorySummary;
          pendingVictorySummary = null;
          const applied = updateScoreFromSummary(summary, { flash: true, triggerFlip: true });
          const activeState = getActiveGameState();
          if (applied && activeState) {
            activeState.victory = true;
            activeState.scoreSubmitted = true;
            openVictoryCelebration();
          }
        }
      });

      registerSimpleEvent('infinite-rails:score-updated', (event) => {
        const summary = mergeSimpleSummary(normaliseSimpleSummary(event?.detail ?? {}));
        if (!summary) return;
        const reason = summary.reason ?? event?.detail?.summary?.reason ?? null;
        const flash = reason !== 'start' && reason !== 'identity-update' && reason !== 'location-update';
        updateScoreFromSummary(summary, { flash });
      });

      registerSimpleEvent('infinite-rails:dimension-advanced', (event) => {
        const summary = mergeSimpleSummary(normaliseSimpleSummary(event?.detail ?? {}));
        if (!summary) return;
        updateScoreFromSummary(summary, { flash: true, triggerFlip: true });
      });

      registerSimpleEvent('infinite-rails:portal-activated', (event) => {
        const summary = mergeSimpleSummary(normaliseSimpleSummary(event?.detail ?? {}));
        if (!summary) return;
        updateScoreFromSummary(summary, { flash: true });
      });

      registerSimpleEvent('infinite-rails:victory', (event) => {
        const summary = mergeSimpleSummary(normaliseSimpleSummary(event?.detail ?? {}));
        if (!summary) return;
        const applied = updateScoreFromSummary(summary, { flash: true, triggerFlip: true });
        const activeState = getActiveGameState();
        if (applied && activeState) {
          activeState.victory = true;
          activeState.scoreSubmitted = true;
          openVictoryCelebration();
        } else {
          pendingVictorySummary = summary;
        }
      });

      if (typeof experience?.createRunSummary === 'function') {
        const bootstrapSummary = mergeSimpleSummary(
          normaliseSimpleSummary({ summary: experience.createRunSummary('start') })
        );
        if (bootstrapSummary) {
          updateScoreFromSummary(bootstrapSummary, {});
        }
      }

      registerSimpleEvent('pagehide', () => {
        while (simpleEventCleanup.length) {
          const dispose = simpleEventCleanup.pop();
          try {
            dispose();
          } catch (error) {
            console.debug('Failed to remove simple integration listener', error);
          }
        }
      });

      function persistIdentity() {
      if (hydratingIdentity) return;
      if (typeof localStorage === 'undefined') return;
      try {
          const payload = {
            displayName: identityState.displayName,
            googleId: identityState.googleId,
            locationLabel: identityState.locationLabel,
            location: identityState.location,
          };
          localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(payload));
        } catch (error) {
          console.warn('Unable to persist identity profile.', error);
        }
      }

      function updateIdentityUI() {
        const displayName = identityState.displayName || 'Explorer';
        const locationLabel = identityState.locationLabel || 'Location unavailable';
        if (headerUserNameEl) {
          headerUserNameEl.textContent = displayName;
        }
        if (headerUserLocationEl) {
          headerUserLocationEl.textContent = locationLabel;
        }
        if (userNameDisplayEl) {
          userNameDisplayEl.textContent = identityState.signedIn ? displayName : `Guest ${displayName}`;
        }
        if (userLocationDisplayEl) {
          userLocationDisplayEl.textContent = locationLabel;
        }
        if (userDeviceDisplayEl) {
          userDeviceDisplayEl.textContent = identityState.deviceLabel || 'Device details pending';
        }
        googleFallbackButtons.forEach((button) => {
          if (!button) return;
          const unavailable = !appConfig.googleClientId;
          button.hidden = identityState.signedIn;
          button.disabled = identityState.googleBusy || unavailable;
          button.setAttribute('aria-busy', identityState.googleBusy ? 'true' : 'false');
          if (unavailable) {
            button.title = 'Google Sign-In unavailable in offline mode.';
          } else {
            button.removeAttribute('title');
          }
        });
        googleButtonContainers.forEach((container) => {
          if (!container) return;
          container.hidden = identityState.signedIn || !appConfig.googleClientId;
        });
        googleSignOutButtons.forEach((button) => {
          if (!button) return;
          button.hidden = !identityState.signedIn;
          button.disabled = identityState.googleBusy;
          button.setAttribute('aria-busy', identityState.googleBusy ? 'true' : 'false');
        });
        if (landingSignInPanel) {
          if (identityState.signedIn) {
            landingSignInPanel.hidden = true;
            landingSignInPanel.setAttribute('aria-hidden', 'true');
          } else {
            landingSignInPanel.hidden = false;
            landingSignInPanel.setAttribute('aria-hidden', 'false');
          }
        }
      }

      function formatLocationLabel(location) {
        if (!location) return 'Location unavailable';
        if (location.label) return location.label;
        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          return `Lat ${latitude.toFixed(1)}°, Lon ${longitude.toFixed(1)}°`;
        }
        if (location.error) {
          return typeof location.error === 'string' ? location.error : 'Location unavailable';
        }
        return 'Location unavailable';
      }

      function setLocation(location) {
        if (location?.error) {
          identityState.location = null;
          identityState.locationLabel = typeof location.error === 'string' ? location.error : 'Location unavailable';
          experience.setPlayerLocation({ error: identityState.locationLabel });
        } else if (location) {
          const normalized = {
            latitude: Number.isFinite(location.latitude) ? Number(location.latitude) : null,
            longitude: Number.isFinite(location.longitude) ? Number(location.longitude) : null,
            accuracy: Number.isFinite(location.accuracy) ? Number(location.accuracy) : null,
          };
          const label = formatLocationLabel({ ...normalized, label: location.label });
          normalized.label = label;
          identityState.location = normalized;
          identityState.locationLabel = label;
          experience.setPlayerLocation({ ...normalized });
        } else {
          identityState.location = null;
          identityState.locationLabel = 'Location unavailable';
          experience.setPlayerLocation(null);
        }
        updateIdentityUI();
        persistIdentity();
      }

      function captureLocation(forcePrompt = false) {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          return Promise.resolve(null);
        }
        return new Promise((resolve) => {
          const options = {
            enableHighAccuracy: Boolean(forcePrompt),
            maximumAge: forcePrompt ? 0 : 300000,
            timeout: forcePrompt ? 5000 : 3500,
          };
          try {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                resolve({
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                });
              },
              (error) => {
                resolve({ error: error?.message || 'Location unavailable' });
              },
              options,
            );
          } catch (error) {
            resolve({ error: error?.message || 'Location unavailable' });
          }
        });
      }

      function decodeJwt(token) {
        if (!token || typeof token !== 'string') return null;
        try {
          const [, payload] = token.split('.');
          if (!payload) return null;
          const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
          const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
          const decoded = atob(padded);
          const json = decodeURIComponent(
            decoded
              .split('')
              .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
              .join(''),
          );
          return JSON.parse(json);
        } catch (error) {
          console.warn('Failed to decode Google credential payload.', error);
          return null;
        }
      }

      function ensureGoogleIdentityScript() {
        if (!appConfig.googleClientId) {
          return Promise.reject(new Error('Missing Google client ID.'));
        }
        if (gsiScriptPromise) {
          return gsiScriptPromise;
        }
        gsiScriptPromise = loadScript('https://accounts.google.com/gsi/client').catch((error) => {
          gsiScriptPromise = null;
          throw error;
        });
        return gsiScriptPromise;
      }

      function ensureGapiAuth() {
        if (!appConfig.googleClientId) {
          return Promise.resolve(null);
        }
        if (googleAuthInstance) {
          return Promise.resolve(googleAuthInstance);
        }
        if (googleAuthPromise) {
          return googleAuthPromise;
        }
        googleAuthPromise = loadScript('https://apis.google.com/js/api.js')
          .then(
            () =>
              new Promise((resolve, reject) => {
                if (!window.gapi?.load) {
                  reject(new Error('Google API unavailable.'));
                  return;
                }
                window.gapi.load('auth2', () => {
                  try {
                    const instance =
                      window.gapi.auth2.getAuthInstance?.() ||
                      window.gapi.auth2.init({
                        client_id: appConfig.googleClientId,
                      });
                    instance
                      .then(() => {
                        googleAuthInstance = instance;
                        resolve(instance);
                      })
                      .catch(reject);
                  } catch (error) {
                    reject(error);
                  }
                });
              }),
          )
          .catch((error) => {
            console.warn('Failed to load Google auth script.', error);
            throw error;
          })
          .finally(() => {
            googleAuthPromise = null;
          });
        return googleAuthPromise;
      }

      async function applyIdentity(profile) {
        if (!profile) return;
        identityState.signedIn = true;
        identityState.displayName = profile.name?.trim() || identityState.displayName || 'Explorer';
        identityState.googleId = profile.sub || profile.user_id || profile.id || null;
        identityState.googleAvatar = profile.picture || null;
        experience.setIdentity({
          name: identityState.displayName,
          googleId: identityState.googleId,
          email: profile.email ?? null,
          avatar: profile.picture ?? null,
          location: identityState.location ? { ...identityState.location } : null,
          locationLabel: identityState.locationLabel,
        });
        updateIdentityUI();
        persistIdentity();
        if (typeof experience.loadScoreboard === 'function') {
          experience.loadScoreboard({ force: true }).catch(() => {});
        }
        if (!identityState.location || identityState.locationLabel === 'Location unavailable') {
          const resolved = await captureLocation(true);
          setLocation(resolved);
        }
      }

      async function handleFallbackSignIn(event) {
        event?.preventDefault?.();
        const overlay = getGlobalOverlayController();
        if (!appConfig.googleClientId) {
          if (overlay) {
            overlay.show({
              mode: 'error',
              title: 'Google Sign-In unavailable',
              message: 'Google Sign-In is not configured for this deployment.',
              actions: [
                {
                  id: 'dismiss',
                  label: 'Dismiss',
                  variant: 'accent',
                  onClick: () => overlay.hide(),
                  autoFocus: true,
                },
              ],
            });
          } else {
            alert('Google Sign-In is not configured for this deployment.');
          }
          return;
        }
        identityState.googleBusy = true;
        overlay?.show({
          mode: 'loading',
          title: 'Connecting to Google',
          message: 'Preparing secure sign-in…',
          actions: [],
        });
        updateIdentityUI();
        try {
          const auth = await ensureGapiAuth();
          if (!auth) {
            throw new Error('Google auth unavailable.');
          }
          let googleUser = auth.currentUser?.get?.();
          if (!googleUser || !auth.isSignedIn?.get?.()) {
            googleUser = await auth.signIn();
          }
          const profile = googleUser?.getBasicProfile?.();
          if (!profile) {
            throw new Error('Google profile unavailable.');
          }
          await applyIdentity({
            sub: profile.getId?.(),
            email: profile.getEmail?.() || null,
            name: profile.getName?.() || profile.getGivenName?.() || 'Explorer',
            picture: profile.getImageUrl?.() || null,
          });
          overlay?.hide();
        } catch (error) {
          console.warn('Google Sign-In failed.', error);
          if (overlay) {
            overlay.show({
              mode: 'error',
              title: 'Google Sign-In failed',
              message: 'Please try again later.',
              actions: [
                {
                  id: 'dismiss',
                  label: 'Dismiss',
                  variant: 'accent',
                  onClick: () => overlay.hide(),
                  autoFocus: true,
                },
              ],
            });
          } else {
            alert('Google Sign-In failed. Please try again later.');
          }
        } finally {
          identityState.googleBusy = false;
          updateIdentityUI();
        }
      }

      async function handleSignOut(event) {
        event?.preventDefault?.();
        if (!identityState.signedIn) return;
        identityState.googleBusy = true;
        updateIdentityUI();
        try {
          const auth = await ensureGapiAuth();
          await auth?.signOut?.();
        } catch (error) {
          console.warn('Unable to sign out of Google.', error);
        }
        identityState.signedIn = false;
        identityState.googleId = null;
        identityState.googleAvatar = null;
        identityState.displayName = experience.defaultPlayerName || 'Explorer';
        experience.clearIdentity?.();
        identityState.location = null;
        identityState.locationLabel = 'Location unavailable';
        experience.setPlayerLocation({ error: identityState.locationLabel });
        if (window.google?.accounts?.id && gsiInitialized) {
          try {
            window.google.accounts.id.disableAutoSelect();
          } catch (error) {
            console.warn('Unable to disable Google auto-select.', error);
          }
        }
        identityState.googleBusy = false;
        updateIdentityUI();
        persistIdentity();
      }

      function renderGoogleButtons() {
        if (!appConfig.googleClientId) {
          updateIdentityUI();
          return;
        }
        ensureGoogleIdentityScript()
          .then(() => {
            if (!window.google?.accounts?.id) {
              throw new Error('Google Identity Services did not initialise.');
            }
            const client = window.google.accounts.id;
            client.initialize({
              client_id: appConfig.googleClientId,
              callback: async (response) => {
                const profile = decodeJwt(response?.credential);
                if (!profile) return;
                identityState.googleBusy = true;
                updateIdentityUI();
                try {
                  await applyIdentity(profile);
                } finally {
                  identityState.googleBusy = false;
                  updateIdentityUI();
                }
              },
            });
            googleButtonContainers.forEach((container) => {
              if (!container) return;
              container.hidden = identityState.signedIn;
              if (container.hidden) return;
              container.innerHTML = '';
              client.renderButton(container, {
                theme: 'filled_blue',
                size: 'medium',
                shape: 'rectangular',
                type: 'standard',
              });
            });
            client.prompt();
            gsiInitialized = true;
          })
          .catch((error) => {
            console.warn('Google Identity Services unavailable.', error);
            googleButtonContainers.forEach((container) => {
              if (container) {
                container.hidden = true;
              }
            });
          });
      }

      function hydrateStoredIdentity() {
        if (typeof localStorage === 'undefined') return;
        let payload = null;
        hydratingIdentity = true;
        try {
          const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
          if (raw) {
            payload = JSON.parse(raw);
          }
        } catch (error) {
          console.warn('Unable to hydrate stored identity.', error);
        }
        if (!payload) {
          hydratingIdentity = false;
          updateIdentityUI();
          return;
        }
        if (payload.displayName) {
          identityState.displayName = payload.displayName;
          experience.setIdentity({ name: payload.displayName, locationLabel: identityState.locationLabel });
        }
        if (payload.location) {
          setLocation(payload.location);
        } else if (payload.locationLabel) {
          identityState.locationLabel = payload.locationLabel;
        }
        hydratingIdentity = false;
        updateIdentityUI();
      }

      googleFallbackButtons.forEach((button) => {
        button.addEventListener('click', handleFallbackSignIn);
      });

      googleSignOutButtons.forEach((button) => {
        button.addEventListener('click', handleSignOut);
      });

      if (identityState.deviceLabel && userDeviceDisplayEl) {
        userDeviceDisplayEl.textContent = identityState.deviceLabel;
      }

      hydrateStoredIdentity();
      updateIdentityUI();

      captureLocation(false)
        .then((location) => {
          if (location) {
            setLocation(location);
          }
        })
        .catch(() => {
          setLocation({ error: 'Location unavailable' });
        });

      renderGoogleButtons();
    }

    function updateRendererModeMetadata(mode) {
      const normalizedMode = mode === 'simple' ? 'simple' : 'advanced';
      if (typeof document !== 'undefined') {
        if (document.documentElement) {
          document.documentElement.setAttribute('data-renderer-mode', normalizedMode);
        }
        if (document.body) {
          document.body.setAttribute('data-renderer-mode', normalizedMode);
        }
      }
      const scope =
        (typeof window !== 'undefined' && window) ||
        (typeof globalThis !== 'undefined' && globalThis) ||
        null;
      if (scope) {
        const store =
          scope.InfiniteRails && typeof scope.InfiniteRails === 'object'
            ? scope.InfiniteRails
            : {};
        if (!scope.InfiniteRails || scope.InfiniteRails !== store) {
          scope.InfiniteRails = store;
        }
        store.rendererMode = normalizedMode;
        scope.__INFINITE_RAILS_RENDERER_MODE__ = normalizedMode;
      }
    }

    const simpleModeEnabled = shouldStartSimpleMode();
    updateRendererModeMetadata('advanced');
    let simpleExperience = null;
    if (simpleModeEnabled && window.SimpleExperience?.create) {
      updateRendererModeMetadata('simple');
      try {
        simpleExperience = window.SimpleExperience.create({
          canvas,
          apiBaseUrl: window.APP_CONFIG?.apiBaseUrl ?? null,
          playerName:
            (headerUserNameEl?.textContent || window.APP_CONFIG?.playerName || '').trim() || 'Explorer',
          ui: {
            introModal,
            startButton,
            hudRootEl,
            gameBriefing: gameBriefingEl,
            dismissBriefingButton,
            heartsEl,
            bubblesEl,
            timeEl,
          dimensionInfoEl,
          scoreTotalEl,
          scoreRecipesEl,
          scoreDimensionsEl,
          portalStatusEl,
          portalStatusText,
          portalStatusStateText,
          portalStatusDetailText,
          portalStatusIcon,
          portalProgressLabel,
          portalProgressBar,
          hotbarEl,
          hotbarExpandButton: toggleExtendedBtn,
          extendedInventoryEl,
          playerHintEl,
          dimensionIntroEl,
          dimensionIntroNameEl,
          dimensionIntroRulesEl,
            scoreboardListEl,
            scoreboardStatusEl,
            refreshScoresButton,
            mobileControls,
            virtualJoystick: virtualJoystickEl,
            virtualJoystickThumb,
            craftingModal,
            craftSequenceEl,
            craftingInventoryEl,
          craftSuggestionsEl,
          craftButton,
          clearCraftButton,
          craftLauncherButton,
          closeCraftingButton,
          victoryBanner: victoryBannerEl,
          victoryCelebration: victoryCelebrationEl,
          victoryConfetti: victoryConfettiEl,
          victoryFireworks: victoryFireworksEl,
          victoryMessageEl,
          victoryStatsEl,
          victoryShareButton,
          victoryCloseButton,
          victoryShareStatusEl,
          openCraftingSearchButton,
          closeCraftingSearchButton,
          craftingSearchPanel,
          craftingSearchInput,
          craftingSearchResultsEl,
          craftingHelperEl,
          craftingHelperTitleEl,
          craftingHelperDescriptionEl,
          craftingHelperMatchesEl,
            inventoryModal,
            inventoryGridEl,
            inventorySortButton,
            inventoryOverflowEl,
            closeInventoryButton,
            pointerHintEl,
            footerEl: document.getElementById('siteFooter'),
            footerScoreEl: document.getElementById('footerScore'),
            footerDimensionEl: document.getElementById('footerDimension'),
            footerStatusEl: document.getElementById('footerStatus'),
          },
        });
      } catch (error) {
        console.error('Failed to initialise simple gameplay sandbox.', error);
        simpleExperience = null;
      }

      if (simpleExperience) {
        let startFailed = false;
        const launchSimple = () => {
          try {
            simpleExperience.start();
            if (!simpleExperience.started) {
              throw new Error('Simple experience start completed without reporting an active session.');
            }
            if (console?.info) {
              console.info('Simple experience ready — immersive sandbox initialised.');
            }
          } catch (error) {
            console.error('Simple experience start failed; falling back to advanced mode.', error);
            startFailed = true;
            if (startButton) {
              startButton.disabled = false;
            }
          }
        };
        if (startButton) {
          startButton.addEventListener('click', launchSimple, { once: true });
        }
        launchSimple();
        if (!startFailed && simpleExperience.started) {
          setupSimpleExperienceIntegrations(simpleExperience);
          updateRendererModeMetadata('simple');
          return;
        }
        console.warn('Simple experience could not start — continuing with advanced mode.');
      }
      if (!simpleExperience) {
        console.warn('Simple experience unavailable — reverting to advanced mode.');
      }
      updateRendererModeMetadata('advanced');
    }
    let previousLeaderboardSnapshot = new Map();
    let leaderboardHasRenderedOnce = false;
    let hudGoogleButton = null;
    let gapiScriptPromise = null;
    let googleAuthPromise = null;
    let googleAuthInstance = null;
    const leaderboardModal = document.getElementById('leaderboardModal');
    const openLeaderboardButton = document.getElementById('openLeaderboard');
    const closeLeaderboardButton = document.getElementById('closeLeaderboard');
    const leaderboardTableContainer = document.getElementById('leaderboardTable');
    const leaderboardEmptyMessage = document.getElementById('leaderboardEmptyMessage');
    const leaderboardSortHeaders = Array.from(document.querySelectorAll('.leaderboard-sortable'));
    const scoreState = {
      score: 0,
      recipes: new Set(),
      dimensions: new Set(),
      points: {
        recipe: 0,
        dimension: 0,
      },
    };
    const objectives = [
      { id: 'gather-wood', label: 'Gather wood' },
      { id: 'craft-pickaxe', label: 'Craft pickaxe' },
      { id: 'build-portal', label: 'Build portal' },
    ];
    const objectiveState = {
      completed: new Set(),
    };
    let dimensionOverlayState = { info: null, tasks: [] };
    let scoreFlipTimeout = null;
    let scoreOverlayInitialized = false;
    const reduceMotionQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    victoryCloseButton?.addEventListener('click', () => {
      dismissVictoryCelebration();
    });

    victoryShareButton?.addEventListener('click', handleVictoryShareClick);

    victoryCelebrationEl?.addEventListener('click', (event) => {
      if (
        event.target === victoryCelebrationEl ||
        (event.target instanceof HTMLElement && event.target.classList.contains('victory-celebration__backdrop'))
      ) {
        dismissVictoryCelebration();
      }
    });

    const HUD_INACTIVITY_TIMEOUT = 12000;
    let hudInactivityTimer = null;

    function hasActiveBlockingOverlay() {
      if (document.body.classList.contains('sidebar-open')) return true;
      return Boolean(document.querySelector('.modal[aria-modal="true"]:not([hidden])'));
    }

    function applyHudInactiveState() {
      if (!hudRootEl && !objectivesPanelEl) return;
      if (!document.body.classList.contains('game-active')) return;
      if (hasActiveBlockingOverlay()) return;
      document.body.classList.add('hud-inactive');
    }

    function resetHudInactivityTimer() {
      if (!hudRootEl && !objectivesPanelEl) return;
      document.body.classList.remove('hud-inactive');
      if (hudInactivityTimer) {
        window.clearTimeout(hudInactivityTimer);
        hudInactivityTimer = null;
      }
      if (!document.body.classList.contains('game-active')) return;
      hudInactivityTimer = window.setTimeout(applyHudInactiveState, HUD_INACTIVITY_TIMEOUT);
    }

    const hudActivityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    hudActivityEvents.forEach((eventName) => {
      const listenerOptions = eventName === 'keydown' ? false : { passive: true };
      window.addEventListener(eventName, resetHudInactivityTimer, listenerOptions);
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resetHudInactivityTimer();
      }
    });

    resetHudInactivityTimer();

    const leaderboardDefaultSortDirection = {
      score: 'desc',
      name: 'asc',
      runTimeSeconds: 'asc',
      dimensionCount: 'desc',
      inventoryCount: 'desc',
      locationLabel: 'asc',
      updatedAt: 'desc',
    };

    let leaderboardSortState = { key: 'score', direction: 'desc' };

    function initializeScoreOverlayUI() {
      if (scoreOverlayInitialized) return;
      if (!scoreTotalEl) return;

      const initialValue = (scoreTotalEl.textContent || '0').trim() || '0';
      scoreTotalEl.dataset.value = initialValue;
      scoreTotalEl.textContent = '';
      scoreTotalEl.classList.add('score-overlay__value--ready');

      const digits = initialValue.split('');
      digits.forEach((digit, index) => {
        const slot = document.createElement('span');
        slot.className = 'score-digit-slot';

        const digitEl = document.createElement('span');
        digitEl.className = 'score-digit score-digit--current';
        digitEl.dataset.value = digit;
        digitEl.textContent = digit;
        digitEl.style.setProperty('--digit-index', index);

        slot.appendChild(digitEl);
        scoreTotalEl.appendChild(slot);
      });

      if (scoreRecipesEl) {
        scoreRecipesEl.dataset.value = scoreRecipesEl.textContent ?? '';
      }

      if (scoreDimensionsEl) {
        scoreDimensionsEl.dataset.value = scoreDimensionsEl.textContent ?? '';
      }

      scoreOverlayInitialized = true;
    }

    function createDigitElement(char, index) {
      const digitEl = document.createElement('span');
      digitEl.className = 'score-digit score-digit--current score-digit--enter';
      digitEl.dataset.value = char;
      digitEl.textContent = char;
      digitEl.style.setProperty('--digit-index', index);
      digitEl.addEventListener(
        'animationend',
        () => {
          digitEl.classList.remove('score-digit--enter');
        },
        { once: true },
      );
      return digitEl;
    }

    function animateScoreDigits(container, value) {
      if (!container) return;
      const normalizedValue = value.toString();
      const previousValue = container.dataset.value ?? '';
      if (previousValue === normalizedValue) return;

      const digits = normalizedValue.split('');
      const existingSlots = Array.from(container.querySelectorAll('.score-digit-slot'));

      while (existingSlots.length < digits.length) {
        const slot = document.createElement('span');
        slot.className = 'score-digit-slot';
        container.appendChild(slot);
        existingSlots.push(slot);
      }

      digits.forEach((char, index) => {
        const slot = existingSlots[index];
        if (!slot) return;
        const currentDigit = slot.querySelector('.score-digit--current');
        if (currentDigit?.dataset.value === char) {
          currentDigit.style.setProperty('--digit-index', index);
          return;
        }

        if (currentDigit) {
          currentDigit.classList.remove('score-digit--current');
          currentDigit.classList.add('score-digit--exit');
          currentDigit.style.setProperty('--digit-index', index);
          currentDigit.addEventListener(
            'animationend',
            () => {
              if (currentDigit.parentElement === slot) {
                currentDigit.remove();
              }
            },
            { once: true },
          );
        }

        const digitEl = createDigitElement(char, index);
        slot.appendChild(digitEl);
      });

      for (let i = digits.length; i < existingSlots.length; i += 1) {
        const slot = existingSlots[i];
        const currentDigit = slot.querySelector('.score-digit--current');
        if (currentDigit) {
          currentDigit.classList.remove('score-digit--current');
          currentDigit.classList.add('score-digit--exit');
          currentDigit.style.setProperty('--digit-index', i);
          currentDigit.addEventListener(
            'animationend',
            () => {
              if (slot.parentElement) {
                slot.remove();
              }
            },
            { once: true },
          );
        } else if (slot.parentElement) {
          slot.remove();
        }
      }

      container.dataset.value = normalizedValue;
    }

    function animateMetricUpdate(element, text) {
      if (!element) return;
      const previousValue = element.dataset.value ?? '';
      if (previousValue === text) return;

      element.dataset.value = text;
      element.textContent = text;

      if (typeof element.getAnimations === 'function') {
        element.getAnimations().forEach((animation) => animation.cancel());
      }

      if (typeof element.animate === 'function') {
        element.animate(
          [
            { transform: 'translateY(0.55em)', opacity: 0 },
            { transform: 'translateY(0)', opacity: 1, offset: 0.45 },
            { transform: 'translateY(0)', opacity: 1 },
          ],
          {
            duration: 420,
            easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
          },
        );
      }
    }

    function recalculateScoreState() {
      const recipePoints = scoreState.recipes.size * SCORE_POINTS.recipe;
      const dimensionPoints = scoreState.dimensions.size * SCORE_POINTS.dimension;
      const total = recipePoints + dimensionPoints;
      scoreState.points.recipe = SCORE_POINTS.recipe;
      scoreState.points.dimension = SCORE_POINTS.dimension;
      scoreState.score = total;
      if (state) {
        state.score = total;
      }
      return { recipePoints, dimensionPoints, total };
    }

    function updateScore(type, value, options = {}) {
      if (!value) {
        updateScoreOverlay(options);
        return false;
      }
      let updated = false;
      if (type === 'recipe') {
        if (!scoreState.recipes.has(value)) {
          scoreState.recipes.add(value);
          updated = true;
        }
      } else if (type === 'dimension') {
        if (!scoreState.dimensions.has(value)) {
          scoreState.dimensions.add(value);
          updated = true;
        }
      }
      const triggerFlip = options.triggerFlip ?? updated;
      const shouldFlash = options.flash ?? (updated ? !triggerFlip : false);
      const overlayOptions = {
        ...options,
        flash: shouldFlash,
        triggerFlip,
      };
      updateScoreOverlay(overlayOptions);
      if (updated && type === 'dimension') {
        updatePortalProgress();
      }
      return updated;
    }

    function renderObjectiveChecklist() {
      if (!objectives.length) {
        return '';
      }
      const items = objectives
        .map(({ id, label }) => {
          const completed = objectiveState.completed.has(id);
          const statusLabel = completed ? 'Completed' : 'Incomplete';
          return `
            <li class="objective-item${completed ? ' objective-item--complete' : ''}" data-objective="${id}">
              <span class="objective-item__status" aria-hidden="true">${completed ? '&#10003;' : ''}</span>
              <span class="objective-item__label">${label}</span>
              <span class="sr-only">${statusLabel}</span>
            </li>
          `;
        })
        .join('');
      return `
        <div class="objective-checklist" aria-live="polite">
          <span class="objective-checklist__title">Primary Objectives</span>
          <ul class="objective-checklist__list">
            ${items}
          </ul>
        </div>
      `;
    }

    function celebrateObjectiveCompletion(objectiveId) {
      if (!objectiveId || !dimensionInfoEl) return;
      const item = dimensionInfoEl.querySelector(`.objective-item[data-objective="${objectiveId}"]`);
      if (!item) return;
      item.classList.add('objective-item--celebrate');
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < 8; i += 1) {
        const piece = document.createElement('span');
        piece.className = 'objective-item__confetti-piece';
        piece.style.setProperty('--offset-x', `${(Math.random() - 0.5) * 70}px`);
        piece.style.setProperty('--offset-y', `${Math.random() * -70 - 20}px`);
        piece.style.setProperty('--hue', `${Math.floor(Math.random() * 60) + (i % 2 === 0 ? 180 : 20)}`);
        fragment.appendChild(piece);
      }
      item.appendChild(fragment);
      window.setTimeout(() => {
        item.classList.remove('objective-item--celebrate');
        item.querySelectorAll('.objective-item__confetti-piece').forEach((piece) => piece.remove());
      }, 900);
    }

    function renderDimensionOverlay(context, { animate = true, celebrateObjectiveId = null } = {}) {
      if (!dimensionInfoEl || !context?.info) return;
      const { info, tasks = [] } = context;
      const tasksMarkup = tasks.length
        ? `
          <div class="overlay-panel__tasks">
            <span class="overlay-panel__subheading">Dimension Briefing</span>
            <ul class="overlay-panel__task-list">
              ${tasks.map((task) => `<li>${task}</li>`).join('')}
            </ul>
          </div>
        `
        : '';
      const objectivesMarkup = renderObjectiveChecklist();
      dimensionInfoEl.innerHTML = `
        <div class="overlay-panel__heading">
          <strong>${info.name}</strong>
          <p class="overlay-panel__description">${info.description}</p>
        </div>
        ${tasksMarkup}
        ${objectivesMarkup}
      `;
      dimensionInfoEl.classList.add('visible');
      if (animate) {
        dimensionInfoEl.classList.remove('pop');
        void dimensionInfoEl.offsetWidth;
        dimensionInfoEl.classList.add('pop');
        dimensionInfoEl.addEventListener(
          'animationend',
          () => {
            dimensionInfoEl.classList.remove('pop');
          },
          { once: true },
        );
      }
      if (celebrateObjectiveId) {
        window.requestAnimationFrame(() => celebrateObjectiveCompletion(celebrateObjectiveId));
      }
    }

    function markObjectiveComplete(objectiveId, { celebrate = true } = {}) {
      if (!objectiveId || objectiveState.completed.has(objectiveId)) return;
      objectiveState.completed.add(objectiveId);
      if (dimensionOverlayState.info) {
        renderDimensionOverlay(dimensionOverlayState, {
          animate: false,
          celebrateObjectiveId: celebrate ? objectiveId : null,
        });
      }
    }

    function resetObjectiveProgress() {
      objectiveState.completed.clear();
      if (dimensionOverlayState.info) {
        renderDimensionOverlay(dimensionOverlayState, { animate: false });
      }
    }

    function evaluateObjectiveProgress({ celebrate = false } = {}) {
      if (scoreState.recipes.has('stone-pickaxe')) {
        markObjectiveComplete('craft-pickaxe', { celebrate });
      }
      if (scoreState.dimensions.size > 0) {
        markObjectiveComplete('build-portal', { celebrate });
      }
      const hasWood =
        objectiveState.completed.has('gather-wood') ||
        hasItem?.('wood', 1) ||
        scoreState.recipes.size > 0 ||
        scoreState.dimensions.size > 0;
      if (hasWood) {
        markObjectiveComplete('gather-wood', { celebrate });
      }
    }
    const drowningVignetteEl = document.getElementById('drowningVignette');
    const tarOverlayEl = document.getElementById('tarOverlay');
    const dimensionTransitionEl = document.getElementById('dimensionTransition');
    const defeatOverlayEl = document.getElementById('defeatOverlay');
    const defeatMessageEl = document.getElementById('defeatMessage');
    const defeatInventoryEl = document.getElementById('defeatInventory');
    const defeatCountdownEl = document.getElementById('defeatCountdown');
    const defeatRespawnButton = document.getElementById('defeatRespawn');
    const mainLayoutEl = document.querySelector('.main-layout');
    const primaryPanelEl = document.querySelector('.primary-panel');
    const topBarEl = document.querySelector('.top-bar');
    const footerEl = document.querySelector('.footer');

    let gameBriefingTimer = null;

    if (defeatRespawnButton) {
      defeatRespawnButton.addEventListener('click', () => {
        completeRespawn();
      });
    }
    const toggleSidebarButton = document.getElementById('toggleSidebar');
    const sidePanelEl = document.getElementById('sidePanel');
    const sidePanelScrim = document.getElementById('sidePanelScrim');
    const rootElement = document.documentElement;
    const computedVars = getComputedStyle(rootElement);
    const readVar = (name, fallback) => {
      const value = computedVars.getPropertyValue(name);
      return value ? value.trim() : fallback;
    };
    const BASE_THEME = {
      accent: readVar('--accent', '#49f2ff'),
      accentStrong: readVar('--accent-strong', '#f7b733'),
      accentSoft: readVar('--accent-soft', 'rgba(73, 242, 255, 0.3)'),
      bgPrimary: readVar('--bg-primary', '#050912'),
      bgSecondary: readVar('--bg-secondary', '#0d182f'),
      bgTertiary: readVar('--bg-tertiary', 'rgba(21, 40, 72, 0.85)'),
      pageBackground:
        readVar(
          '--page-background',
          'radial-gradient(circle at 20% 20%, rgba(73, 242, 255, 0.2), transparent 45%), radial-gradient(circle at 80% 10%, rgba(247, 183, 51, 0.2), transparent 55%), linear-gradient(160deg, #050912, #0b1230 60%, #05131f 100%)'
        ),
      dimensionGlow: readVar('--dimension-glow', 'rgba(73, 242, 255, 0.45)'),
    };

    const appConfig = {
      apiBaseUrl: window.APP_CONFIG?.apiBaseUrl ?? null,
      googleClientId: window.APP_CONFIG?.googleClientId ?? null,
    };

    const TILE_UNIT = 1;
    const BASE_GEOMETRY = new THREE.BoxGeometry(TILE_UNIT, TILE_UNIT, TILE_UNIT);
    const PLANE_GEOMETRY = new THREE.PlaneGeometry(TILE_UNIT, TILE_UNIT);
    const PORTAL_PLANE_GEOMETRY = new THREE.PlaneGeometry(TILE_UNIT * 0.92, TILE_UNIT * 1.5);
    const CRYSTAL_GEOMETRY = new THREE.OctahedronGeometry(TILE_UNIT * 0.22);
    const PORTAL_ACTIVATION_DURATION = 2;
    const PORTAL_TRANSITION_BUILDUP = 2;
    const PORTAL_TRANSITION_FADE = 0.65;
    const raycaster = new THREE.Raycaster();

    const PORTAL_VERTEX_SHADER = `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const PORTAL_FRAGMENT_SHADER = `
      varying vec2 vUv;

      uniform float uTime;
      uniform float uActivation;
      uniform vec3 uColor;
      uniform float uOpacity;

      void main() {
        vec2 uv = vUv - 0.5;
        float radius = length(uv);
        float activation = clamp(uActivation, 0.0, 2.0);
        float time = uTime * (0.7 + activation * 0.35);
        float swirl = activation * 2.4;
        float theta = swirl * (1.0 - radius);
        float s = sin(theta + time);
        float c = cos(theta + time);
        vec2 rotated = mat2(c, -s, s, c) * uv;
        rotated += 0.05 * vec2(
          sin(time * 1.7 + radius * 12.0),
          cos(time * 1.3 + radius * 9.0)
        );

        float angle = atan(rotated.y, rotated.x);
        float bands = sin(angle * 6.0 - time * 2.2);
        float ripples = sin(radius * 18.0 - time * 4.5);
        float spokes = sin(angle * 12.0 + time * 3.5);

        float core = smoothstep(0.55, 0.0, radius);
        float edge = smoothstep(0.6, 0.4, radius);
        float intensity = core * (0.6 + 0.4 * sin(time * 2.0 + radius * 10.0));
        intensity += edge * (0.2 + 0.3 * bands);
        intensity += (0.2 + 0.25 * activation) * max(0.0, spokes);

        float alpha = clamp(intensity * (0.6 + 0.5 * activation), 0.0, 1.2);
        alpha *= (0.8 + 0.2 * sin(time * 5.0 + radius * 12.0));
        if (radius > 0.52) {
          alpha *= smoothstep(0.58, 0.52, radius);
        }

        vec3 base = mix(vec3(0.04, 0.07, 0.13), uColor, 0.55 + 0.25 * activation);
        base += uColor * (0.3 + 0.25 * ripples) * (0.4 + 0.6 * activation);
        base += uColor * 0.2 * max(0.0, bands);

        gl_FragColor = vec4(base, alpha * uOpacity);
      }
    `;

    const marbleGhosts = [];

    const SCORE_POINTS = {
      recipe: 2,
      dimension: 5,
    };

    scoreState.points.recipe = SCORE_POINTS.recipe;
    scoreState.points.dimension = SCORE_POINTS.dimension;

    const AUDIO_SETTINGS_KEY = 'infinite-dimension-audio-settings';
    const ACCESSIBILITY_SETTINGS_KEY = 'infinite-dimension-accessibility';
    const AUDIO_SAMPLE_URL = resolveAssetUrl('assets/audio-samples.json');
    const CRUNCH_RESOURCES = new Set(['wood', 'tar']);
    const STATIC_EFFECT_SOURCES = {
      footstep: {
        src: [
          'data:audio/wav;base64,',
          'UklGRmwdAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YUgdAAAAAJYEIgmeDQESRBZgGk4eCiKLJc8ozyteLFUsTCxDLDosMSwoLB8sFiwNLAQs',
          '+yvyK+kr4CvXK84rxSu8K9oqfCgLJowjBCF7HvUbeBkJF6wUZxI8EC8ORAx7CtgIWwcFBtUEzQPqAisCjgEQAbAAaQA4ABkACAABAAAAAAD9//H/2v+z/3j/',
          'Jv+5/i/+hP24/Mj7tPp6+Rz4mfby9CrzQfE87x3t6Oqg6Erm6+OJ4Sffzdx+2kLYYtZr1nPWfNaE1o3Wldae1qbWr9a31sDWyNbQ1tnW4dbq1vLW+9YD1/bY',
          '6dsU33XiBOa96Zntk/Gj9cP56/0UAjoGUgpYDkUSERa3GTEdeiCMI2MmPig1KC0oJSgdKBUoDCgEKPwn9CfsJ+Mn2yfTJ8snwye7J7InqieiJ8klmyNdIRUf',
          'yBx9GjYY+xXOE7MRsA/GDfkLSwq+CFMHCwbnBOYDBwNJAqwBLAHIAHwARgAjAA0AAwAAAAAA///5/+r/zv+i/2L/DP+c/hH+Z/2e/LT7qfp8+S34vvYv9YPz',
          'u/Ha7+Pt2evB6Z/nduVM4ybhCd/53P3aSdpR2ljaYNpo2nDad9p/2ofajtqW2p7apdqt2rXavNrE2sva09pa2+vdseCq48/mHeqO7RzxwfR4+Dr8AADFA4IH',
          'MQvMDk0SrRXpGPob3B6LIQIkeCRwJGkkYSRaJFMkSyREJDwkNSQtJCYkHyQXJBAkCCQBJPoj8iM4I0chRR83HSMbDRn6Fu8U7xL+ECAPWA2pCxQKnQhFBwsG',
          '8gT5Ax8DZQLIAUcB4ACQAFYALgAUAAYAAQAAAAAA/f/0/+H/wf+Q/03/8/6C/vb9Tv2J/KX7pPqE+UX46vZz9eLzOPJ68Knuyeze6uvo9eYB5RHjLOFW38vd',
          '0t3Z3eDd593u3fXd/N0D3greEd4Y3h/eJt4t3jTeO95C3kjeT97q31bi8eS356XqtO3g8CX0e/ff+kr+tgEeBXwIygsEDyMSIxX+F7EaOB2OHxMhDSEGIf8g',
          '+CDyIOsg5CDdINcg0CDJIMIgvCC1IK4gqCChIJoglCAPH0QdbBuMGagXxRXnExESRxCNDuUMUgvXCXYIMAcFBvgEBwQ0A30C4QFgAfcApABmADoAHAALAAIA',
          'AAAAAP//+v/u/9f/s/9//zj/3P5p/t79OP14/Jz7pfqS+WT4HPe89UX0uvIc8XDvt+326zDqaeil5ujkNuOU4QDhB+EN4RPhGuEg4SbhLOEz4TnhP+FG4Uzh',
          'UuFZ4V/hZeFr4XLh4eH840TmtehM6wPu1/DD88L2z/nm/AAAGQMsBjMJKQwKD9EReRT/Fl0ZkhuZHfod8x3tHecd4R3bHdUdzx3JHcIdvB22HbAdqh2kHZ4d',
          'mB2SHYwd8xxaG7QZBBhOFpcU4xI1EZAP9w1uDPgKlQlJCBUH+QX4BBEERAORAvgBdwEMAbgAdwBHACUAEQAFAAAAAAAAAP7/9v/n/8z/pP9t/yP/xv5T/sn9',
          'J/1s/Jj7q/qm+Yj4VPcK9q30PvPA8TXwoe4I7Wvrz+k46KnmJ+Xi4+jj7uP04/nj/+MF5AvkEOQW5BzkIuQn5C3kM+Q45D7kRORJ5E/koOWe58PpCuxy7vbw',
          'kvNB9gD5yfuY/mgBNAT5BrEJVwzoDl8RuRPxFQQY7xkwGyobJRsfGxkbFBsOGwkbAxv+Gvga8xrtGuga4hrdGtca0hrMGscahxkOGIoWABVyE+URWxDZDmEN',
          '9QuZCk4JFwj0BugF8wQVBFADogILAosBIQHLAIcAVAAvABcACQACAAAAAAAAAPv/8f/e/8H/lv9b/xD/sf4//rf9Gf1k/Jn7t/q/+bL4kPdc9hf1w/Nj8vnw',
          'h+8S7pzsKOu76Vbo/+aF5ormkOaV5prmn+ak5qrmr+a05rnmvubE5snmzubT5tjm3ebj5j7n+ejZ6tvs++438Yrz8fVn+Or6c/0AAIwCEgWPB/8JXQylDtQQ',
          '5hLZFKkWVBijGJ4YmRiUGI8YihiFGIAYexh2GHEYbBhnGGIYXRhYGFMYThhJGMsXexYgFb0TVRLtEIYPJA7KDHsLOAoECeAHzwbSBekEFQRXA68CHAKeATQB',
          '3QCXAGEAOgAfAA0ABAAAAAAAAAD+//j/6//V/7X/h/9L//7+n/4u/qn9D/1h/J77x/rd+d/40Pex9oP1SfQF87nxaPAV78PtdOws6+/p5Ojp6O7o8uj36Pzo',
          'AOkF6QrpD+kT6RjpHekh6SbpK+kv6TTpOek96VPq9uu47ZjvkvGk88j1/fc/+on82P4nAXUDuwX3ByUKQQxHDjYQCBK9E1EVWBZUFk8WSxZGFkIWPRY4FjQW',
          'LxYrFiYWIhYdFhkWFBYQFgsWBxYCFvwUxROHEkIR/A+1DnINNAz/CtQJtgimB6YGtwXbBBEEWwO5AioCrgFFAe0ApgBvAEUAJwATAAcAAQAAAAAAAAD8//T/',
          '5P/M/6n/ef87/+3+j/4f/p39Cf1i/Kj73Pr/+RH5E/gI9/H1z/Sm83byRPEQ8N/usu2N7HPrD+sT6xfrHOsg6yTrKOst6zHrNes56z7rQutG60rrT+tT61fr',
          'W+um6xPtnu5E8APy2fPC9bv3wvnS++j9AAAXAisENwY3CCkKCQzVDYkPIxGgEv8TQBQ8FDgUNBQvFCsUJxQjFB8UGxQXFBMUDhQKFAYUAhT+E/oT9hOPE3oS',
          'XRE5EBIP6Q3CDKALgwpvCWYIaQd5BpkFyAQJBFsDvwI1ArwBVAH9ALUAfABQAC8AGQALAAMAAAAAAAAA///6/+//3f/C/53/a/8s/97+gf4T/pX9Bv1m/LX7',
          '9fok+kX5Wfhh91/2VfVE9C/zGPIC8e/v4u7d7QHtBe0J7Q3tEe0V7RntHe0h7STtKO0s7TDtNO047TztP+1D7UftS+0v7ofv+vCE8iT01/Wa92v5Rfsn/Q3/',
          '8wDXArYEjAZWCBIKvAtTDdIOORCFEV4SWhJWElISTxJLEkcSQxJAEjwSOBI1EjESLRIpEiYSIhIeEhsSFxI/EUAQOg8wDiMNFwwNCwgKCgkUCCkHSQZ3BbME',
          '/QNYA8ICPALHAWEBCwHDAIkAWwA4ACAADwAGAAEAAAAAAAAA/f/2/+n/1f+4/5H/Xv8e/9H+df4K/pD9B/1u/Mb7EPtN+n35ofi898722fXf9OPz5/Lr8fTw',
          'BPAb78nuze7Q7tTu1+7b7t/u4u7m7unu7e7w7vTu9+777v7uAe8F7wjvRu9y8LbxEfOB9AP2lfc0+d76kPxH/gAAuAFtAxsFwQZaCOUJXgvFDBYOTw9vEKUQ',
          'ohCeEJsQlxCUEJEQjRCKEIYQgxCAEHwQeRB1EHIQbxBrEGgQExAwD0UOVg1jDG8LfQqOCaQIwQfnBhcGUgWaBO4DUQPCAkIC0AFtARcB0ACVAGYAQgAnABUA',
          'CQADAAAAAAAAAP//+//y/+P/zf+u/4b/Uv8S/8X+a/4E/o79Cv15/Nv7L/t4+rb56vgW+Dv3W/Z39ZL0rvPM8u7xF/Fj8GfwavBt8HDwc/B38HrwffCA8IPw',
          'hvCK8I3wkPCT8JbwmfCd8KDwW/F28qfz6/RB9qb3GfmX+h38qf04/8cAVgLfA2EF2gZHCKUJ8wovDFYNZw4ZDxUPEg8PDwwPCQ8GDwMPAA/9DvoO9w70DvEO',
          '7Q7qDucO5A7hDt4OLQ5bDYQMqQvMCvAJFQk/CG4HpAbiBSsFfgTcA0cDvwJEAtYBdgEiAdsAoABwAEsALgAaAA0ABQABAAAAAAAAAP7/+P/u/93/xf+l/3v/',
          'Rv8H/7v+ZP7//Y79Ef2H/PL7Ufum+vH5Nflx+Kj32/YL9jz1bfSi89zyHvLa8d3x4PHj8ebx6fHr8e7x8fH08ffx+vH98QDyAvIF8gjyC/IO8kHyN/NB9F/1',
          'jfbK9xX5avrI+y39lv4AAGoB0QIzBI0F3QYiCFgJfwqTC5UMgg2uDasNqQ2mDaMNoA2dDZsNmA2VDZINjw2NDYoNhw2EDYINfw18DTYNfAy7C/YKLgpmCZ8I',
          '2gcaB2AGrAUBBV8EyAM7A7oCRALbAX0BLAHmAKsAegBUADYAIAARAAcAAgAAAAAAAAD///z/9f/p/9b/vf+b/3H/PP/9/rP+Xv79/ZH9Gv2Y/Av8dPvV+i36',
          'f/nL+BP4WPeb9t/1JvVw9L/zK/Mu8zDzM/M28zjzO/M980DzQ/NF80jzSvNN81DzUvNV81fzWvNd8/fz3/Ta9eT2/fcj+VT6jvvO/BT+XP+kAOsBLwNsBKIF',
          'zgbuBwAJAwr2CtYLaAxmDGMMYQxeDFwMWQxXDFQMUgxPDEwMSgxHDEUMQgxADD0MOww4DKcL+gpJCpUJ4AgrCHcHxwYbBnUF1gQ/BLEDLAOyAkIC3QGDATMB',
          '7wC0AIQAXAA9ACYAFQAKAAQAAQAAAAAAAAD+//n/8f/j/9D/tf+T/2j/M//1/q3+W/7+/Zf9Jf2r/Cb8mvsF+2r6yvkk+Xz40fcn93321vUz9Zf0X/Rh9GT0',
          'ZvRp9Gv0bfRw9HL0dPR39Hn0fPR+9ID0g/SF9If0ivSz9H71WfZD9zz4QflQ+mn7ifyu/db+AAApAVACcwOQBKQFrwauB6AIhAlXChoLPws8CzoLOAs1CzML',
          'MQsuCywLKgsoCyULIwshCx4LHAsaCxgLFQvcCkMKpAkCCV4IuQcWB3QG1gU9BaoEHQSYAxsDqAI9At0BhgE5AfYAvQCMAGQARQAsABoADgAGAAIAAAAAAAAA',
          'AAD9//f/7f/e/8n/rf+K/1//K//v/qn+Wf4A/p79M/2//ET8wfs3+6j6FPp8+eL4SPit9xT3f/bu9XT1dvV49Xv1ffV/9YH1g/WF9Yf1ivWM9Y71kPWS9ZT1',
          'lvWZ9Zv1nfUb9tv2qPeD+Gr5XPpW+1j8YP1s/nn/hwCUAZ0CogOhBJcFhAZmBzsIAgm6CTMKMQovCiwKKgooCiYKJAoiCiAKHgocChoKGAoWChQKEQoPCg0K',
          'CwqTCQYJdAjgB0sHtgYjBpIFBQV8BPoDfQMJA5wCNwLbAYgBPgH8AMQAlABsAEwAMgAfABEACAADAAAAAAAAAAAA///7//T/6f/Y/8P/pv+D/1j/Jf/q/qb+',
          'Wv4F/qj9Q/3W/GL86Ptp++X6XfrS+Ub5uvgv+KX3IPef9nH2c/Z19nf2efZ79n32f/aB9oP2hfaH9on2i/aM9o72kPaS9pT2tvZd9xH40vie+XT6U/s6/Cf9',
          'GP4L/wAA9ADnAdYCwAOjBH4FUAYXB9IHgAggCT4JPAk6CTgJNgk0CTMJMQkvCS0JKwkpCScJJQkkCSIJIAkeCRwJ7QhvCO0HZwfgBlkG0wVOBcwETgTVA2ED',
          '9AKOAi8C1wGIAUEBAQHKAJsAcwBSADgAJAAVAAsABQABAAAAAAAAAAAA/f/5//D/5P/T/7z/n/98/1H/H//m/qX+XP4L/rP9VP3u/IL8Efyb+yL7pfon+qj5',
          'Kfmr+DD4ufdV91f3WPda91z3Xvdf92H3Y/dl92f3aPdq92z3bvdv93H3c/d193b33vd8+CX52fmX+l37K/z//Nj9tP6R/28ATAEmAv0CzgOYBFsFFAbEBmcH',
          '/wdiCGAIXghdCFsIWQhXCFYIVAhSCFEITwhNCEwISghICEYIRQhDCEEI3wdrB/MGeQb/BYQFCwWUBCAEsANEA94CfgIlAtIBhgFCAQUBzwChAHoAWQA+ACkA',
          'GgAOAAcAAgAAAAAAAAAAAP///P/2/+3/4P/O/7b/mf92/0z/G//k/qX+X/4T/sD9Zv0H/aP8OvzO+1777Pp5+gb6k/ki+bT4Svgl+Cf4KPgq+Cv4Lfgv+DD4',
          'Mvgz+DX4N/g4+Dr4O/g9+D/4QPhC+F745/h7+Rn6wfpx+yn85vyp/W/+N/8AAMkAkAFUAhUD0AOEBDAF1AVtBvwGgAeZB5cHlQeUB5IHkQePB44HjAeLB4kH',
          'iAeGB4QHgweBB4AHfgd9B1YH7gaDBhYGpwU4BckEXATxA4oDJgPHAm0CGQLLAYMBQgEHAdMApgB/AF8ARAAuAB4AEgAJAAQAAQAAAAAAAAAAAP7/+v/z/+n/',
          '2//I/7H/lP9x/0j/GP/j/qb+ZP4c/s79ev0h/cT8ZPwA/Jn7MfvJ+mH6+fmU+TL54Pji+OP45Pjm+Of46fjq+Oz47fjv+PD48vjz+PT49vj3+Pn4+vj8+FH5',
          '0vld+vH6jfsx/Nr8iP06/u/+pf9bABABxAF0AiADxwNnBP8EjwUWBpIG5AbiBuEG3wbeBt0G2wbaBtgG1wbWBtQG0wbRBtAGzwbNBswGygbJBngGGAa2BVIF',
          '7QSJBCUEwwNkAwgDrwJbAgwCwwF/AUEBCQHWAKoAhABkAEkAMwAiABUADAAFAAIAAAAAAAAAAAD///3/+P/w/+X/1//E/6z/j/9s/0T/Fv/j/qn+a/4m/t39',
          'j/08/eb8jfwx/NT7dfsW+7j6W/oB+qr5i/mM+Y75j/mQ+ZL5k/mU+Zb5l/mY+Zr5m/mc+Z75n/mg+aH5o/m6+Sr6pPom+7D7QfzY/HT9E/62/lv/AAClAEkB',
          '6gGIAiIDtgNEBMoESAW+BSoGPgY9BjwGOgY5BjgGNwY1BjQGMwYxBjAGLwYuBiwGKwYqBikGJwYIBrIFWgUABaUESgTvA5UDPgPoApcCSQL/AbkBeQE+AQkB',
          '2ACuAIgAaQBOADgAJgAYAA4ABwADAAEAAAAAAAAAAAD+//v/9v/t/+L/0v+//6f/iv9o/0L/Ff/k/q7+cv4y/u39pP1Y/Qj9tvxi/A38t/th+wz7ufpo+iX6',
          'Jvon+in6Kvor+iz6Lfou+jD6Mfoy+jP6NPo2+jf6OPo5+jr6PPqC+uz6XvvY+1j83vxp/fn9i/4g/7X/SwDgAHMBBAKSAhsDngMbBJIEAAVnBaoFqAWnBaYF',
          'pQWkBaMFoQWgBZ8FngWdBZwFmwWZBZgFlwWWBZUFlAVRBQIFsgRfBA0EugNoAxcDyQJ9AjUC8AGvAXIBOwEIAdkAsACMAG0AUgA8ACoAHAARAAkABAABAAAA',
          'AAAAAAAA///9//n/8//q/97/zv+7/6P/h/9m/0D/Fv/n/rP+e/4+/v79u/10/Sr93/yS/ET89vup+137EvvL+rL6s/q0+rX6tvq3+rj6ufq6+rv6vPq9+r76',
          'wPrB+sL6w/rE+sX62Po0+5j7A/x1/Oz8aP3o/Wv+8f54/wAAhwAOAZMBFQKTAg0DgQPwA1cEuAQRBSIFIQUfBR4FHQUcBRsFGgUZBRgFFwUWBRUFFAUTBRIF',
          'EQUQBQ8F9QSvBGYEHATRA4YDPAPyAqoCZAIhAuABpAFrATYBBQHZALIAjwBwAFYAQAAuAB8AFAAMAAYAAgAAAAAAAAAAAAAA///8//j/8f/n/9v/y/+3/5//',
          'hP9k/z//F//q/rn+hP5M/hD+0f2Q/Uz9B/3B/Hr8NPzu+6r7Z/sw+zH7Mvsz+zT7Nfs2+zf7OPs5+zr7O/s8+z37Pvs/+0D7QftC+0P7fPvU+zH8lfz//G39',
          '3/1V/s7+SP/D/z0AuAAxAagBHQKNAvkCYAPBAxwEcASnBKYEpQSkBKQEowSiBKEEoASfBJ4EnQScBJsEmgSZBJgElwSWBJUEXwQeBNwDmANUAxADzQKKAkoC',
          'DALQAZgBYgEwAQIB2QCzAJEAcwBZAEMAMQAiABcADgAIAAQAAQAAAAAAAAAAAAAA/v/7//b/7v/k/9f/x/+0/5z/gf9i/z//Gf/u/sD+j/5a/iL+6P2s/W79',
          'Lv3u/K78b/ww/PP7uPuj+6T7pfum+6f7qPup+6r7q/ur+6z7rfuu+6/7sPux+7L7s/uz+8P7D/xh/Ln8Fv14/d79R/6z/iH/kf8AAG8A3gBLAbYBHgKCAuEC',
          'PAORA+EDKgQ4BDcENgQ1BDQEMwQyBDIEMQQwBC8ELgQtBCwELAQrBCoEKQQoBBME2QOeA2EDIwPmAqgCbAIwAvcBvwGLAVkBKgH/ANcAswCSAHUAXABGADQA',
          'JQAZABAACQAFAAIAAAAAAAAAAAAAAP///f/5//T/7P/h/9T/xP+x/5r/f/9i/0D/HP/z/sj+mv5o/jX+//3H/Y/9Vf0b/eH8qPxv/Dn8C/wM/A38DvwP/A/8',
          'EPwR/BL8E/wT/BT8FfwW/Bf8F/wY/Bn8Gvwb/Er8kvzf/DH9iP3j/UH+of4E/2n/zv8yAJcA+wBdAbwBGQJyAsYCFgNhA6YD0wPSA9ID0QPQA88DzgPOA80D',
          'zAPLA8sDygPJA8gDxwPHA8YDxQPEA5cDYgMsA/QCvAKEAk0CFwLiAa4BfQFPASMB+gDUALIAkwB3AF4ASQA3ACgAHAATAAsABgADAAEAAAAAAAAAAAAAAP7/',
          '/P/4//H/6f/f/9H/wf+u/5j/fv9i/0L/H//5/tD+pf53/kf+Fv7j/a/9ev1G/RH93vys/Hv8avxr/Gz8bfxt/G78b/xv/HD8cfxy/HL8c/x0/HX8dfx2/Hf8',
          'd/yE/MP8Bv1P/Zv97P0//pb+7/5J/6X/AABbALYAEAFoAb0BDwJeAqkC7wIwA2wDdwN3A3YDdQN0A3QDcwNyA3IDcQNwA3ADbwNuA20DbQNsA2sDawNZAyoD',
          '+QLHApQCYQIvAv0BzAGdAXABRAEbAfUA0QCwAJMAeABgAEwAOgArAB8AFQANAAgABAABAAAAAAAAAAAAAAD///7/+v/2/+//5//c/8//v/+s/5b/fv9j/0T/',
          'I/8A/9n+sf6H/lr+Lf7+/c/9n/1v/UD9Ev3l/MD8wPzB/ML8wvzD/MT8xPzF/Mb8xvzH/Mj8yPzJ/Mr8yvzL/Mz8zPzz/C79bv2x/fn9Q/6Q/uD+Mf+E/9f/',
          'KQB8AM4AHwFtAbkBAgJIAokCxwIAAyUDJAMjAyMDIgMhAyEDIAMgAx8DHgMeAx0DHAMcAxsDGgMaAxkDGQP0AsgCmwJtAj8CEQLkAbcBjAFiATkBEwHvAM4A',
          'rgCSAHgAYgBOADwALQAhABcADwAJAAUAAgABAAAAAAAAAAAAAAD///3/+f/0/+3/5f/a/8z/vf+q/5b/fv9k/0f/KP8H/+P+vf6W/m3+Q/4Z/u39wv2X/W39',
          'RP0c/Q79Dv0P/RD9EP0R/RH9Ev0T/RP9FP0U/RX9Fv0W/Rf9F/0Y/Rn9I/1X/Y79yf0I/kv+j/7W/h//av+1/wAASwCWAN8AKAFuAbEB8gEvAmkCnwLQAtkC',
          '2QLYAtcC1wLWAtYC1QLVAtQC0wLTAtIC0gLRAtEC0ALPAs8CwAKZAnECSAIfAvUBywGiAXoBVAEuAQsB6QDJAKwAkQB4AGMATwA+AC8AIwAZABEACwAGAAMA',
          'AQAAAAAAAAAAAAAAAAD+//z/+P/y/+v/4//Y/8v/u/+p/5X/f/9m/0v/Lf8O/+3+yv6m/oD+Wv4z/gv+5P2+/Zj9c/1U/VX9Vf1W/Vb9V/1X/Vj9WP1Z/Vn9',
          'Wv1b/Vv9XP1c/V39Xf1e/V79fv2v/eP9G/5V/pL+0v4T/1b/mv/e/yIAZgCpAOsALAFqAaYB4AEWAkgCdwKVApUClAKUApMCkwKSApICkQKRApACkAKPAo4C',
          'jgKNAo0CjAKMAosCbQJJAiQC/wHZAbMBjgFpAUUBIwECAeIAxACpAI8AeABjAFAAQAAxACUAGwATAAwACAAEAAIAAAAAAAAAAAAAAAAA///9//r/9v/x/+r/',
          '4f/W/8n/uv+p/5X/gP9o/0//M/8W//f+1/61/pP+cP5M/ij+Bf7i/cD9oP2U/ZX9lf2W/Zb9l/2X/Zj9mP2Z/Zn9mv2a/Zv9m/2c/Zz9nf2d/ab90P3+/S7+',
          'Yv6Z/tH+DP9I/4X/wv8AAD4AewC4APMALAFkAZkBzAH7AScCUAJXAlcCVgJWAlUCVQJUAlQCUwJTAlMCUgJSAlECUQJQAlACTwJPAkMCIwICAuABvgGcAXkB',
          'WAE3ARcB+ADbAL8ApQCNAHcAYwBRAEEAMwAnAB0AFQAOAAkABQACAAEAAAAAAAAAAAAAAAAA/v/8//n/9f/v/+j/3//U/w==',
        ].join(''),
        volume: 0.5,
      },
      zombieGroan: {
        src: [
          'data:audio/wav;base64,',
          'UklGRuJeAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0Yb5eAAAAAKwBWAMEBa8GWQgCCqkLTw3zDpYQNhLVE3EVChehGDQaxRtSHdweYyDlIWQj',
          '3yRWJsgnNSmeKgMsYi28LhEwYTGrMsUywTK+MrsyuDK0MrEyrjKrMqgypDKhMp4ymzKYMpQykTKOMosyiDKEMoEyfjJ7MngydDJxMm4yazJoMmQyYTJeMlsy',
          'WDJUMlEyTjJLMkgyRTJBMj4yOzI4MjUyMTIuMisyKDIlMiIyHjIbMhgyFTISMg8yCzIIMgUyAjL/Mfwx+DH1MfIx7zHsMekx5THiMd8x3DHZMdYx0jHPMcwx',
          'yTHGMcMxwDG8MbkxtjGzMbAxrTGqMaYxozE+MSIwBC/kLcEsnCt2Kk4pJSj6Js4loSRzI0UiFiHnH7ceiB1YHCkb+xnNGKAXdBZJFR8U9hLPEaoQhw9lDkYN',
          'KQwOC/YJ4QjPB78GswWpBKMDoQKiAacAsP+9/s794vz7+xn7O/ph+Yz4vPfw9ir2aPWs9PXzQ/OW8u7xTPGv8Bjwh+/77nTu9O157QTtlOwr7MfraesR67/q',
          'c+ot6uzpsul96U7pJekC6eXozei86LDoqeip6K7ouOjI6N7o+egZ6T/pauma6c/pCepI6ozq1eoj63Xry+sn7Ibs6uxR7b3tLe6g7hjvk+8R8JPwGPGg8Svy',
          'ufJK893zc/QL9ab1Qvbh9oH3JPjH+G35E/q7+mP7Dfy3/GL9Dv65/mX/EAC8AGgBEwK+AmgDEQS5BGAFBwarBk4H8AeQCC4JygljCvsKkAsiDLIMQA3KDVEO',
          '1Q5WD9MPTRDEEDcRpREREngS2xI5E5QT6hM8FIkU0RQVFVQVjhXEFfQVHxZFFmYWghaYFqoWtRa8Fr0WuBauFp4WiRZuFk4WKBb8FcsVlBVYFRUVzhSAFC0U',
          '1BN2ExITqRI6EsYRTBHNEEgQvw8wD5sOAg5jDcAMGAxqC7gKAQpGCYYIwQf4BisGWgWEBKsDzQLsAQcBHgAz/0P+Uf1b/GL7Zvpn+Wb4Yvdc9lT1SfQ88y7y',
          'HvEM8Pnu5e3P7LjroeqJ6XDoV+c95iPlCuTw4tfhv+Cn35Deed1k3FDbPdos2R3YD9cE1vrU89Pu0uzRx9HK0czRz9HS0dXR2NHb0d7R4dHk0efR6tHt0fDR',
          '8tH10fjR+9H+0QHSBNIH0grSDdIQ0hLSFdIY0hvSHtIh0iTSJ9Iq0i3SMNIy0jXSONI70j7SQdJE0kfSStJN0k/SUtJV0ljSW9Je0mHSZNJn0mnSbNJv0nLS',
          'ddJ40nvSftKA0oPShtKJ0ozSj9KS0pXSmNKa0p3SoNKj0qbSqdKs0q/SsdK00rfSutK90sDSw9LF0sjSy9LO0iTTUNSB1bbW8Ncu2W/atdv+3EzenN/w4Efi',
          'ouP/5F/mwucn6Y7q+Otj7dHuQPCx8SPzlvQK9oD39vhs+uT7W/3S/kkAwAE3A60EIwaXBwsJfQrvC14NzA44EKMRCxNxFNQVNReTGO8ZRxucHO4dPR+HIM8h',
          'EiNRJI0lxCb2JyQpTipzK3QscSxuLGssaSxmLGMsYCxdLFosWCxVLFIsTyxMLEosRyxELEEsPiw8LDksNiwzLDAsLiwrLCgsJSwiLCAsHSwaLBcsFCwSLA8s',
          'DCwJLAcsBCwBLP4r+yv5K/Yr8yvwK+0r6yvoK+Ur4ivgK90r2ivXK9Qr0ivPK8wrySvHK8QrwSu+K7sruSu2K7MrsCuuK6srqCulK6MroCudK5ormCuVK5Ir',
          'jyuNK4orhyuEK4Erfyt8K3krdit0K+sq8yn4KPsn/Cb8Jfok9iPxIuwh5SDdH9UezB3DHLkbsBqmGZ0YlBeLFoMVexR1E28SahFnEGUPZQ5mDWkMbgt1Cn4J',
          'iQiXB6cGugXPBOgDAwMhAkMBZwCR/7z+6/0e/VX8j/vN+hD6Vvmg+O/3Qvea9vb1VvW79CX0k/MG837y+vF88QLxjvAe8LPvTu/t7pLuPO7q7Z7tWO0W7dns',
          'ouxw7EPsG+z469rrweuu65/rluuR65Lrl+uh67DrxOvd6/rrHOxC7G3snOzQ7AjtRe2F7crtEu5f7rDuBO9c77fvFvB58N/wSPG08SPylfIK84Lz/PN59Pj0',
          'evX99YP2C/eU9x/4rPg6+cr5W/rt+oD7FPyo/D390/1p/gD/lv8sAMIAWAHuAYMCGAOsAz8E0QRjBfIFgQYOB5oHJAisCDIJtgk4CrgKNguxCykMnwwSDYIN',
          '8A1aDsEOJQ+FD+IPPBCSEOQQMhF9EcQRBxJFEoASthLoEhYTPxNkE4UToRO4E8sT2RPjE+cT5xPiE9gTyhO2E54TgRNeEzcTCxPaEqQSaRIpEuURmxFMEfkQ',
          'oBBDEOEPeg8PD58OKg6wDTINsAwoDJ0LDQt5CuAJQwmjCP4HVQeoBvcFQwWLBM8DEANNAogBvgDz/yT/Uv59/aX8yvvt+g76LPlI+GP3e/aR9aX0uPPK8trx',
          '6fD37wPvD+4b7SXsL+s56kPpTOhW51/maeV05H/jiuKX4aTgs9/D3tTd59z72xHbKdpD2V/Yh9eJ14zXjteR15PXlteZ15vXnteg16PXpdeo16vXrdew17LX',
          'tde317rXvNe/18HXxNfH18nXzNfO19HX09fW19jX29fd1+DX49fl1+jX6tft1+/X8tf01/fX+df81/7XAdgE2AbYCdgL2A7YENgT2BXYGNga2B3YH9gi2CTY',
          'J9gp2CzYLtgx2DTYNtg52DvYPthA2EPYRdhI2ErYTdhP2FLYVNhX2FnYXNhe2GHYY9hm2GjYa9ht2HDY7tj12QHbENwj3TreVd9y4JThuOLf4wnlNuZm55jo',
          'zekE6z3seO217vPvM/F18rjz/PRC9oj3z/gW+l77p/zv/Tj/gADIARADWASfBeUGKghuCbEK8wszDXEOrg/pECISWRONFL8V7xYcGEYZbRqRG7Ic0B3qHgEg',
          'FCEkIjAjNyQ7JTsm6ibnJuUm4ibgJt0m2ybYJtYm1CbRJs8mzCbKJscmxSbCJsAmvSa7Jrkmtia0JrEmryasJqompyalJqImoCaeJpsmmSaWJpQmkSaPJowm',
          'iiaIJoUmgyaAJn4meyZ5JncmdCZyJm8mbSZqJmgmZSZjJmEmXiZcJlkmVyZUJlImUCZNJksmSCZGJkQmQSY/JjwmOiY3JjUmMyYwJi4mKyYpJiYmJCYiJh8m',
          'HSYaJhgmFiYTJhEmDiYMJgomaCWOJLIj1CL1IRQhMiBPH2oehR2fHLgb0RrpGQAZGBgvF0cWXhV2FI8TqBLBEdsQ9g8TDzAOTg1uDI8LsgrXCf0IJQhPB3wG',
          'qgXbBA4ERAN8ArcB9QA1AHr/wf4K/lf9qPz7+1L7rfoL+m350/g8+Kn3GveP9gj2hvUH9Yz0FvSk8zbzzPJn8gbyqvFR8f7wr/Bk8B7w3O+f72bvMu8D79ju',
          'se6P7nHuWO5D7jPuJ+4g7h3uHu4j7i3uO+5N7mPufu6c7r/u5e4P7z3vb++l797vG/Bb8J/w5vAw8X7xz/Ei8nny0/Iv84/z8PNV9Lz0JfWQ9f71bvbg9lP3',
          'yfdA+Lj4Mvmu+Sv6qfoo+6j7KPyq/Cz9r/0y/rb+Of+9/0AAwwBHAcoBTQLPAlAD0QNRBM8ETQXKBUUGvwY3B64HIwiXCAgJeAnlCVEKugogC4UL5gtGDKIM',
          '/AxSDaYN9w1FDpAO1w4bD1wPmQ/TDwkQOxBqEJUQvRDgEAARHBEzEUcRVxFiEWoRbRFsEWcRXRFQET4RKBENEe4QyxCkEHgQSBATENsPng9cDxcPzQ5/DiwO',
          '1g17DRwNuQxSDOcLdwsEC40KEgqTCREJiwgBCHMH4gZOBrYFGgV8BNoDNQONAuIBNQGEANL/HP9j/qj96/wr/Gn7pfrf+Rf5TviD97b25/UX9Ub0dPOh8s3x',
          '+PAi8EvvdO6d7cXs7usW6z7qZumP6Ljn4uYM5jflY+SQ477i7eEe4VDgg9+53vDdKN2S3JTcltyZ3Jvcndyf3KLcpNym3Kjcq9yt3K/csdyz3LbcuNy63Lzc',
          'v9zB3MPcxdzI3MrczNzO3NDc09zV3Nfc2dzc3N7c4Nzi3OXc59zp3Ovc7dzw3PLc9Nz23Pjc+9z93P/cAd0E3QbdCN0K3QzdD90R3RPdFd0Y3RrdHN0e3SDd',
          'I90l3SfdKd0r3S7dMN0y3TTdNt053TvdPd0/3UHdRN1G3UjdSt1M3U/dUd1T3VXdV91a3VzdXt353eDey9+54Kvhn+KX45Lkj+WQ5pPnmOig6avqt+vG7Nbt',
          '6e797xLxKvJC81z0d/WT9rD3zvjs+Qv7KvxK/Wn+if+oAMcB5gIFBCMFQAZdB3gIkwmsCsQL2wzwDQMPFRAkETISPhNHFE4VUhZUF1QYUBlKGkAbNBwkHREe',
          '+x7hH8QgoyEQIg4iDCIKIggiBiIDIgEi/yH9Ifsh+SH2IfQh8iHwIe4h7CHqIech5SHjIeEh3yHdIdsh2CHWIdQh0iHQIc4hzCHJIcchxSHDIcEhvyG9Iboh',
          'uCG2IbQhsiGwIa4hqyGpIachpSGjIaEhnyGdIZohmCGWIZQhkiGQIY4hjCGJIYchhSGDIYEhfyF9IXsheCF2IXQhciFwIW4hbCFqIWghZSFjIWEhXyFdIVsh',
          'WSFXIVUhUiFQIU4hTCGaINsfGh9YHpQdzxwJHEEbeRqwGecYHRhSF4cWuxXwFCQUWRONEsIR9xAtEGMPmw7SDQsNRQx/C7sK+Qk3CXgIuQf9BkIGiQXSBB0E',
          'agO5AgsCXwG1AA4Aa//J/ir+jv31/F78y/s7+676JPqe+Rr5mvge+KX3MPe+9lD25fV+9Rv1u/Rg9Aj0tPNj8xfzz/KK8kryDfLU8Z/xb/FC8Rnx9PDT8Lbw',
          'nfCH8HbwaPBf8FnwV/BZ8F7waPB18IXwmfCx8Mzw6/AO8TPxXPGI8bjx6/Eg8lnylfLU8hbzWvOh8+vzOPSH9Nj0LPWC9dr1NfaR9vD2UPey9xb4fPjj+Ev5',
          'tfkg+o36+vpp+9j7SPy5/Cv9nf0P/oL+9f5p/9z/TgDBADQBpwEZAosC/AJtA90DTAS5BCYFkgX8BWYGzQY0B5gH+wddCLwIGgl1Cc8JJgp7Cs4KHwttC7gL',
          'AQxHDIsMzAwKDUUNfQ2yDeQNEg4+DmYOiw6tDswO5w7+DhIPIw8wDzkPPw9BD0APOg8xDyUPFA8AD+gOzQ6tDooOYw44DgkO1w2hDWcNKQ3oDKIMWgwNDL0L',
          'aQsSC7cKWAr2CZEJKAm8CEwI2QdjB+oGbQbtBWsF5QRdBNEDQwOyAh8CiQHwAFUAuf8Z/3f+0/0s/YT82vsu+4H60fkh+W74u/cG91D2mfXg9Cf0bfOz8vfx',
          'O/F/8MPvBu9J7oztz+wS7Fbrmure6SPpaeiw5/fmP+aJ5dPkH+Rt47viDOJe4fzg/uAA4QLhBOEG4QjhCuEM4Q7hEOES4RThFuEY4RrhHOEd4R/hIeEj4SXh',
          'J+Ep4SvhLeEv4THhM+E14TfhOeE74T3hP+FB4UPhReFG4UjhSuFM4U7hUOFS4VThVuFY4VrhXOFe4WDhYuFk4WbhZ+Fp4WvhbeFv4XHhc+F14XfheeF74X3h',
          'f+GB4YPhhOGG4YjhiuGM4Y7hkOGS4ZThluGY4ZrhnOGe4Z/hoeGj4aXhp+Gp4avhreGv4V3iKOP248jknOVy5kznKOgG6efpyuqw65fsge1s7lnvSPA58Svy',
          'HvMT9An1APb49vD36vjk+d/62vvW/NH9zf7J/8QAwAG7ArYDsASqBaMGmweSCIgJfQpwC2IMUw1CDjAPHBAFEe0R0xK3E5gUdxVUFi4XBRjaGKwZehpGGw8c',
          '1RyYHdId0B3OHcwdyh3IHcYdxB3CHcEdvx29HbsduR23HbUdsx2yHbAdrh2sHaodqB2mHaQdox2hHZ8dnR2bHZkdlx2VHZQdkh2QHY4djB2KHYgdhh2FHYMd',
          'gR1/HX0dex15HXcddh10HXIdcB1uHWwdah1pHWcdZR1jHWEdXx1dHVwdWh1YHVYdVB1SHVAdTx1NHUsdSR1HHUUdQx1CHUAdPh08HTodOB02HTUdMx0xHS8d',
          'LR0rHSodKB0QHWocwhsZG28awxkWGWkYuhcLF1sWqhX5FEcUlhPjEjESfxHNEBsQaQ+4DgcOVg2mDPcLSQucCu8JRAmaCPEHSQejBv4FWgW5BBkEewPfAkQC',
          'rAEWAYIA8f9i/9X+Sv7C/Tz9ufw5/Lv7QPvI+lP64Plx+QX5m/g1+NL3cvcV97z2ZvYT9sP1d/Uu9ej0pvRn9Cz09PPA84/zYfM38xHz7vLO8rLymfKD8nHy',
          'Y/JY8lDyTPJK8k3yUvJb8mfydvKI8p7ytvLS8vDyEvM2817ziPO18+TzF/RM9IP0vfT69Dj1efW99QL2SvaU9uD2Lfd99873Ifh2+Mz4JPl9+dj5M/qQ+u76',
          'Tfut+w78cPzS/DX9mf38/WH+xf4q/4//9P9YAL0AIgGGAeoBTQKwAhMDdAPVAzUElATzBFAFqwUGBl8GtwYOB2IHtgcHCFcIpQjxCDsJgwnJCQ0KTwqOCssK',
          'Bgs+C3QLpwvYCwYMMQxZDH8MogzCDN8M+QwQDSQNNQ1DDU0NVQ1ZDVsNWQ1TDUsNPw0wDR4NCA3wDNMMtAyRDGsMQQwVDOQLsQt6C0ALAwvDCn8KOAruCaEJ',
          'UQn+CKcITgjyB5IHMAfLBmMG+AWLBRoFpwQyBLoDQAPDAkMCwgE+AbgAMACm/xr/jP78/Wr91/xB/Kv7Evt5+t75Qfmk+AX4ZvfF9iT2gfXe9Dv0l/Py8k3y',
          'qPED8V7wuO8T727uye0k7YDs3es665fq9ulV6bboF+h6597mQ+ap5RHl2uTb5N3k3+Tg5OLk5OTm5Ofk6eTr5Ozk7uTw5PLk8+T15Pfk+OT65Pzk/uT/5AHl',
          'A+UE5QblCOUK5QvlDeUP5RDlEuUU5RblF+UZ5RvlHOUe5SDlIeUj5SXlJ+Uo5SrlLOUt5S/lMeUy5TTlNuU45TnlO+U95T7lQOVC5UPlReVH5UjlSuVM5U7l',
          'T+VR5VPlVOVW5VjlWeVb5V3lXuVg5WLlY+Vl5WflaeVq5WzlbuVv5XHlc+V05YHlMebj5pjnUOgK6cbphepG6wnsz+yW7V/uKu/378XwlfFm8jnzDfTj9Ln1',
          'kfZp90L4HPn3+dL6rfuJ/Gb9Qv4f//v/1wCzAY8CagNFBCAF+QXSBqoHgghYCS0KAQvTC6QMdA1CDg4P2Q+iEGkRLhLwErETbxQrFeUVnBZRFwMYshhfGQka',
          'GhoZGhcaFRoUGhIaEBoPGg0aCxoKGggaBhoFGgMaAhoAGv4Z/Rn7GfkZ+Bn2GfQZ8xnxGe8Z7hnsGesZ6RnnGeYZ5BniGeEZ3xndGdwZ2hnZGdcZ1RnUGdIZ',
          '0BnPGc0ZyxnKGcgZxxnFGcMZwhnAGb4ZvRm7GbkZuBm2GbUZsxmxGbAZrhmsGasZqRmoGaYZpBmjGaEZnxmeGZwZmxmZGZcZlhmUGZIZkRmPGY4ZjBmKGYkZ',
          'hxmGGVUZwxgwGJwXBhdwFtkVQBWnFA4UdBPZEj4SohEHEWsQzw8zD5cO+w1fDcQMKQyPC/UKXArDCSwJlQj/B2oH1wZEBrMFIwWUBAcEewPxAmkC4gFdAdoA',
          'WQDa/13/4v5p/vL9fv0L/Zv8LvzD+1r79PqQ+i/60fl1+R35xvhz+CL41feK90L3/Pa69nv2P/YF9s/1nPVr9T71FPXs9Mj0p/SJ9G70VvRA9C70H/QT9Ar0',
          'BPQA9AD0AvQI9BD0G/Qp9Dn0TfRj9Hv0l/S09NX0+PQd9UX1b/Wc9cr1+/Uu9mT2m/bV9hD3TfeM9833EPhU+Jr44vgr+XX5wfkO+lz6rPr8+k77oPvz+0j8',
          'nfzy/Ej9n/32/U7+pv7+/lb/r/8GAF4AtwAPAWYBvgEVAmsCwQIXA2sDvwMTBGUEtgQGBVUFowXwBTsGhQbOBhUHWweeB+EHIQhgCJ0I2AgRCUgJfQmwCeEJ',
          'EAo8CmYKjgqzCtYK9goUCzALSQtfC3MLhAuSC54LpwutC7ALsQuuC6kLoQuWC4kLeAtlC04LNQsZC/oK2AqzCosKYQozCgMKzwmZCWAJJQnmCKUIYQgaCNAH',
          'hAc2B+QGkAY6BuEFhQUnBccEZAT/A5gDLgPDAlUC5QFzAf8AigASAJr/H/+i/iP+pP0i/Z/8G/yV+w/7h/r++XT56Phd+ND3Qve09ib2lvUH9Xb05vNW88Xy',
          'NPKj8RPxgvDy72Lv0u5D7rXtJ+2Z7A3sgev36m3q5eld6dfoUug86D3oP+hA6ELoQ+hF6EboSOhJ6EvoTOhO6E/oUehS6FToVehX6FjoWuhb6F3oXuhg6GHo',
          'Y+hk6GboZ+hp6GrobOht6G/ocOhy6HPodeh26Hjoeeh76Hzofuh/6IHoguiE6IXoh+iI6Iroi+iM6I7oj+iR6JLolOiV6JfomOia6Jvoneie6KDooeij6KTo',
          'puin6Knoquis6K3or+iw6LLos+i06Lbot+i56LrovOi96L/owOjC6MPo7OiG6SPqwupj6wbsrOxT7fztqO5V7wPwtPBm8RnyzvKF8zz09fSv9Wr2Jvfi96D4',
          'Xvkd+t36nftd/B793v2f/mD/IADhAKIBYwIjA+IDoQRgBR4G2waXB1IIDQnGCX4KNQvqC54MUQ0CDrEOXw8LELUQXhEEEqgSShPqE4gUIxW9FVMW2xbaFtgW',
          '1xbVFtQW0hbRFs8WzhbNFssWyhbIFscWxRbEFsIWwRbAFr4WvRa7FroWuBa3FrUWtBazFrEWsBauFq0WqxaqFqkWpxamFqQWoxahFqAWnxadFpwWmhaZFpcW',
          'lhaVFpMWkhaQFo8WjRaMFosWiRaIFoYWhRaDFoIWgRZ/Fn4WfBZ7FnkWeBZ3FnUWdBZyFnEWbxZuFm0WaxZqFmgWZxZmFmQWYxZhFmAWXhZdFlwWWhZZFlcW',
          'FBaUFRMVkRQOFIsTBhOBEvsRdBHtEGUQ3Q9VD80ORA68DTMNqwwiDJoLEguLCgQKfQn3CHII7QdqB+cGZAbjBWMF5ARmBOoDbgP0AnwCBQKPARsBqAA4AMr/',
          'XP/x/of+IP66/Vb99fyV/Dj83fuE+y372fqH+jf66fme+Vb5EPnM+Iv4TPgQ+Nf3oPds9zr3C/ff9rX2jvZp9kf2KPYM9vL12vXG9bT1pPWY9Y71hvWB9X/1',
          'f/WC9Yf1jvWZ9aX1tPXF9dn17/UH9iL2P/Ze9n/2ovbH9u/2GPdD93H3oPfQ9wP4N/ht+KX43vgZ+VX5kvnR+RH6U/qV+tn6Hvtj+6r78fs6/IP8zfwX/WL9',
          'rv36/Ub+k/7g/i3/ev/I/xQAYgCvAPwASQGVAeEBLQJ4AsMCDQNWA58D5gMtBHMEuAT8BD8FgQXCBQEGPwZ8BrcG8QYpB18HlQfIB/oHKQhXCIQIrgjWCP0I',
          'IQlECWQJggmeCbgJ0AnlCfgJCQoXCiMKLQo0CjkKPAo8CjkKNAotCiMKFgoHCvYJ4gnLCbIJlgl4CVcJNAkOCeYIuwiNCF4IKwj2B78HhgdKBwsHygaHBkIG',
          '+gWwBWQFFgXFBHIEHgTHA24DEwO3AlgC+AGVATEBzABkAPz/kv8m/7j+Sf7Z/Wf99PyA/Av8lfse+6b6Lfqz+Tj5vfhB+MT3R/fK9kz2zvVP9dH0UvTT81Xz',
          '1vJX8tnxW/He8GDw5O9o7+zuce737X7tBu2O7Bjso+sx6zLrM+s16zbrN+s56zrrO+s96z7rP+tA60LrQ+tE60brR+tI60rrS+tM607rT+tQ61LrU+tU61Xr',
          'V+tY61nrW+tc613rX+tg62HrY+tk62XrZuto62nrauts623rbutw63Hrcutz63Xrdut363nreut7633rfut/64DrguuD64TrhuuH64jriuuL64zrjeuP65Dr',
          'keuT65TrleuW65jrmeua65zrneue66Droeui66Prpeum66frqevm627s9+yD7RDun+4w78PvWPDu8IbxH/K68lbz8/OS9DL10/V19hj3vPdg+Ab5rPlS+vr6',
          'oftJ/PL8m/1D/uz+lf89AOYAjwE3At8ChwMuBNUEewUgBsUGaQcMCK4ITwnuCY0KKgvHC2EM+wySDSkOvQ5QD+IPcRD/EIoRFBKcEiETpRMCFAEU/xP+E/0T',
          '/BP6E/kT+BP2E/UT9BPzE/ET8BPvE+4T7BPrE+oT6RPnE+YT5RPkE+IT4RPgE94T3RPcE9sT2RPYE9cT1hPUE9MT0hPRE88TzhPNE8wTyhPJE8gTxxPFE8QT',
          'wxPCE8ATvxO+E70TuxO6E7kTuBO2E7UTtBOzE7ETsBOvE64TrBOrE6oTqROnE6YTpROkE6IToROgE58TnROcE5sTmhOZE5cTlhOVE5QTkhORE5ATjxM+E84S',
          'XRLrEXgRBRGREBwQpg8wD7oOQw7MDVUN3gxmDO4Ldwv/CogKEQqaCSQJrQg4CMMHTgfaBmcG9AWCBRIFogQzBMUDWAPsAoECGAKwAUkB5ACAAB4Avv9e/wH/',
          'pf5K/vH9m/1F/fL8ofxR/AT8uPtv+yf74vqf+l36Hvrh+af5bvk4+QT50vii+HX4Svgh+Pv31ve195X3ePdd90T3Lvca9wn3+fbs9uL22fbT9s/2zvbO9tH2',
          '1vbd9ub28vb/9g/3Ifc090r3Yvd795f3tPfT9/T3F/g7+GL4iviz+N74C/k5+Wj5mfnL+f/5NPpq+qH62voT+037ifvF+wL8QPx//L/8//xA/YH9w/0F/kj+',
          'iv7O/hH/Vf+Y/9z/HwBjAKYA6gAtAXABsgH0ATYCdwK4AvgCOAN2A7QD8QMuBGkEowTdBBUFTAWCBbcF6wUdBk4GfQasBtgGAwctB1UHewegB8MH5QcECCII',
          'PghYCHAIhgiaCK0IvQjLCNgI4gjqCPAI9Aj1CPUI8gjuCOcI3QjSCMUItQijCI8IeAhfCEQIJwgICOYHwwedB3UHSgceB+8GvgaMBlcGIAbmBasFbgUvBe4E',
          'qwRmBB8E1gOMAz8D8QKhAlAC/QGoAVIB+gChAEYA6/+N/y7/zv5t/gr+p/1C/dz8dfwO/KX7PPvS+mf6/PmP+SP5tvhI+Nr3bPf99o/2IPax9UL10/Rk9PXz',
          'h/MZ86vyPfLQ8WTx+PCM8CLwuO9P7+buf+4Y7sntyu3L7cztze3O7c/t0e3S7dPt1O3V7dbt2O3Z7drt2+3c7d3t3u3g7eHt4u3j7eTt5e3m7ejt6e3q7evt',
          '7O3t7e7t8O3x7fLt8+307fXt9u347fnt+u377fzt/e3+7QDuAe4C7gPuBO4F7gbuCO4J7gruC+4M7g3uDu4Q7hHuEu4T7hTuFe4W7hfuGe4a7hvuHO4d7h7u',
          'H+4h7iLuI+4k7iXuJu4n7ijuKu4r7izuLe4u7i/uMO4y7n7u9e5u7+jvZPDi8GLx4vFl8unybvP083z0BfWP9Rr2pvYz98H3UPjf+HD5AfqS+iT7t/tJ/N38',
          'cP0E/pj+LP/A/1IA5gB6AQ0CoAIzA8UDVwToBHkFCQaYBicHtAdBCM0IVwnhCWoK8Qp3C/sLfwwBDYENAA59DvkOcw/rD2EQ1hBIEYQRghGBEYARfxF+EX0R',
          'fBF7EXoReBF3EXYRdRF0EXMRchFxEXARbxFtEWwRaxFqEWkRaBFnEWYRZRFkEWIRYRFgEV8RXhFdEVwRWxFaEVkRVxFWEVURVBFTEVIRURFQEU8RThFMEUsR',
          'ShFJEUgRRxFGEUURRBFDEUERQBE/ET4RPRE8ETsROhE5ETgRNxE1ETQRMxEyETERMBEvES4RLREsESsRKhEoEScRJhElESQRIxEiESERIBEfEcYQYxAAEJwP',
          'Nw/SDmwOBg6fDTgN0AxoDAAMlwsvC8YKXQr1CYwJJAm8CFQI7AeFBx4HtwZRBuwFhwUjBb8EXQT7A5oDOgPbAnwCHwLDAWgBDwG2AF8ACQC2/2L/Ef/A/nH+',
          'JP7Y/Y79Rv3//Lr8dvw0/PT7tvt6+z/7BvvP+pr6Z/o2+gf62vmu+YX5Xvk5+RX59PjV+Lj4nPiD+Gz4V/hE+DP4JPgX+Az4A/j89/f39Pfz9/T39/f79wL4',
          'CvgV+CH4L/g/+FD4ZPh5+I/4qPjC+N34+/gZ+Tr5W/l/+aP5yfnw+Rn6Q/pu+pr6yPr2+ib7VvuI+7r77fsi/Ff8jPzD/Pr8Mf1q/aP93P0V/k/+iv7F/v/+',
          'Ov92/7H/7P8nAGIAnQDYABMBTQGHAcEB+wE0AmwCpALcAhIDSAN+A7ID5gMZBEsEfAStBNwECgU3BWIFjQW2Bd8FBQYrBk8GcgaTBrMG0QbuBgoHIwc7B1IH',
          'Zwd6B4sHmwepB7UHvwfIB88H1AfXB9gH1wfUB9AHyQfBB7cHqgecB4wHegdmB1AHOAceBwIH5QbFBqMGgAZaBjMGCgbfBbIFgwVTBSAF7AS2BH8ERQQKBM4D',
          'jwNPAw4DywKGAkAC+AGvAWUBGQHMAH0ALQDd/4v/OP/k/o7+OP7g/Yj9L/3V/Hr8HvzC+2X7B/up+kr66/mM+Sz5y/hr+Ar4qfdI9+f2hvYl9sT1Y/UC9aH0',
          'QfTi84LzI/PF8mfyCvKt8VHx9vCc8ELwDvAP8BDwEfAS8BPwFPAV8BbwF/AY8BnwGvAb8BzwHfAe8B/wIPAh8CLwI/Ak8CXwJvAn8CjwKfAq8CvwLPAt8C7w',
          'L/Aw8DHwMvAz8DTwNfA28DfwOPA58DrwO/A88D3wPvA/8EDwQfBC8EPwRPBF8EbwR/BI8EnwSvBL8EzwTfBO8E/wUPBR8FLwU/BU8FXwVvBX8FjwWfBa8Fvw',
          'XPBd8F7wX/Bg8GHwYvBj8GTwZfBm8GfwaPBp8GrwwfAp8ZPx//Fs8trySvO78y30ofQW9Yv1AvZ79vT2bffo92T44Phd+dv5WvrZ+lj72PtY/Nn8Wv3b/Vz+',
          '3v5f/+H/YQDjAGQB5QFmAuYCZgPmA2UE4wRhBd4FWwbXBlIHzAdFCL0INQmrCSAKlAoGC3gL6AtXDMQMMA2bDQMOaw7QDjUPVQ9UD1MPUg9RD1APTw9OD00P',
          'TA9LD0oPSQ9ID0cPRg9FD0QPQw9CD0EPQA8/Dz8PPg89DzwPOw86DzkPOA83DzYPNQ80DzMPMg8xDzAPLw8uDy0PLA8rDyoPKQ8oDycPJg8mDyUPJA8jDyIP',
          'IQ8gDx8PHg8dDxwPGw8aDxkPGA8XDxYPFQ8UDxMPEg8RDxAPEA8PDw4PDQ8MDwsPCg8JDwgPBw8GDwUPBA8DDwIPAQ8AD/8O/g79DvMOng5IDvENmQ1BDegM',
          'jww1DNsLgAsmC8sKbwoUCrgJXQkBCaUISgjuB5MHOAfeBoMGKQbPBXYFHgXFBG4EFwTBA2sDFgPCAm8CHQLMAXsBLAHeAJEARAD6/7H/aP8h/9v+lv5S/hD+',
          '0P2Q/VP9Fv3c/KL8a/w0/AD8zfub+2z7PvsR++f6vvqW+nH6Tfor+gv67PnP+bT5m/mE+W75WvlI+Tj5Kfkc+RH5CPkA+fv49/j0+PT49fj4+Pz4AvkK+RP5',
          'Hvkr+Tn5Sfla+W35gfmW+a35xvng+fv5F/o1+lT6dfqW+rn63PoB+yf7Tvt2+5/7yfvz+x/8S/x4/Kb81fwE/TP9ZP2V/cb9+P0q/l3+j/7D/vb+Kv9d/5H/',
          'xf/5/ywAYACTAMcA+gAuAWABkwHFAfcBKQJZAooCugLpAhgDRQNzA58DywP2AyAESQRxBJgEvgTjBAcFKgVMBWwFjAWqBccF4wX9BRYGLgZEBlkGbAZ+Bo4G',
          'nQarBrcGwQbKBtEG1wbbBt0G3gbdBtoG1gbQBsgGvwa0BqcGmAaIBnYGYwZNBjYGHgYDBucFygWqBYkFZgVCBRwF9ATLBKAEdARGBBcE5gOzA38DSgMTA9sC',
          'oQJmAikC7AGtAW0BKwHpAKUAYAAaANT/jP9D//n+rv5i/hX+yP15/Sr92/yK/Dn86PuW+0P78Pqd+kn69fmh+Uz59/ii+E34+Pej9073+fal9lD2/PWo9VT1',
          'APWt9Fv0CfS382bzFvPG8nfyKfIK8gvyDPIN8g7yD/IQ8hHyEvIS8hPyFPIV8hbyF/IY8hnyGfIa8hvyHPId8h7yH/Ig8iHyIfIi8iPyJPIl8ibyJ/Io8ijy',
          'KfIq8ivyLPIt8i7yL/Iv8jDyMfIy8jPyNPI18jbyNvI38jjyOfI68jvyPPI98j3yPvI/8kDyQfJC8kPyQ/JE8kXyRvJH8kjySfJK8kryS/JM8k3yTvJP8lDy',
          'UfJR8lLyU/JU8lXyVvJX8lfyWPJZ8lryXvK58hTzcfPQ8y/0kPTy9Fb1uvUf9ob27fZW97/3KfiU+P/4bPnZ+Uf6tfok+5P7Avxz/OP8VP3F/Tb+p/4Y/4r/',
          '+/9rAN0ATgG+AS8CnwIPA38D7gNdBMsEOAWlBRIGfQboBlIHuwcjCIsI8QhWCboJHQp/CuAKPwueC/sLVgywDAkNYQ1sDWsNag1pDWgNZw1nDWYNZQ1kDWMN',
          'Yg1hDWENYA1fDV4NXQ1cDVwNWw1aDVkNWA1XDVYNVg1VDVQNUw1SDVENUQ1QDU8NTg1NDUwNTA1LDUoNSQ1IDUcNRg1GDUUNRA1DDUINQQ1BDUANPw0+DT0N',
          'PA08DTsNOg05DTgNNw03DTYNNQ00DTMNMg0yDTENMA0vDS4NLQ0tDSwNKw0qDSkNKA0nDScNJg0lDSQNIw0jDSINIQ0gDR8NCA29DHEMJQzYC4sLPQvvCqAK',
          'UQoCCrMJYwkTCcMIcwgiCNIHggcyB+IGkgZCBvMFpAVVBQcFuQRrBB4E0gOGAzoD8AKmAlwCFALMAYUBPwH5ALUAcQAvAO//rv9v/zH/8/63/n3+Q/4L/tT9',
          'nv1p/Tb9BP3U/KT8d/xK/B/89vvO+6f7gvtf+z37HPv9+t/6w/qp+pD6efpj+k/6PPor+hv6DfoB+vb57fnl+d/52vnX+dX51fnW+dn53fni+en58vn8+Qf6',
          'FPoi+jH6QvpU+mf6e/qR+qj6wPrZ+vP6D/sr+0n7Z/uH+6f7yPvr+w78MvxW/Hz8ovzJ/PH8Gf1C/Wv9lf2//er9Fv5B/m3+mf7G/vP+IP9N/3r/qP/V/wIA',
          'LwBdAIoAtwDkABEBPQFpAZUBwQHsARcCQQJrApQCvQLlAgwDMwNZA34DowPHA+oDDAQtBE0EbQSLBKkExQTgBPoEFAUrBUIFWAVsBYAFkgWiBbIFwAXNBdgF',
          '4gXrBfMF+QX9BQAGAgYDBgEG/wX7BfUF7gXmBdwF0AXDBbUFpQWTBYEFbAVWBT8FJgUMBfAE0wS0BJQEcgRPBCsEBQTeA7YDjANhAzQDBgPXAqcCdgJDAg8C',
          '2gGkAWwBNAH7AMAAhQBIAAsAzf+O/07/Df/L/oj+Rf4B/r39d/0x/ev8pPxd/BX8zPuD+zr78fqn+l76E/rJ+X/5NPnq+KD4VfgL+MH3d/ct9+P2mvZR9gj2',
          'wPV49TH16vSk9F70GfTV88jzyfPJ88rzy/PM88zzzfPO88/z0PPQ89Hz0vPT89Pz1PPV89bz1/PX89jz2fPa89rz2/Pc893z3fPe89/z4PPh8+Hz4vPj8+Tz',
          '5PPl8+bz5/Pn8+jz6fPq8+rz6/Ps8+3z7vPu8+/z8PPx8/Hz8vPz8/Tz9PP18/bz9/P38/jz+fP68/vz+/P88/3z/vP+8//zAPQB9AH0AvQD9AT0BPQF9Ab0',
          'B/QH9Aj0CfQK9Ar0C/QM9A30DfQg9HD0wPQS9WX1ufUO9mT2u/YT92z3xvcg+Hz42Pg1+ZP58flQ+rD6EPtx+9L7M/yV/Pf8Wv28/R/+gv7l/kn/rP8OAHEA',
          '1AA3AZoB/QFfAsECIgOEA+QDRQSlBAQFYgXABR4GegbWBjEHjAflBz0IlQjsCEEJlgnpCTsKjArcCisLeAvAC78Lvwu+C70LvQu8C7sLugu6C7kLuAu3C7cL',
          'tgu1C7QLtAuzC7ILsQuxC7ALrwuuC64LrQusC6sLqwuqC6kLqQuoC6cLpgumC6ULpAujC6MLoguhC6ALoAufC54LnQudC5wLmwubC5oLmQuYC5gLlwuWC5UL',
          'lQuUC5MLkguSC5ELkAuQC48LjguNC40LjAuLC4oLiguJC4gLhwuHC4YLhQuFC4QLgwuCC4ILgQuAC38Lfwt+C30LfQtcCxoL2AqVClEKDgrJCYUJQAn7CLUI',
          'cAgqCOQHngdXBxEHywaFBj8G+QWzBW0FKAXjBJ4EWQQVBNEDjgNLAwgDxwKFAkQCBALFAYYBSAELAc4AkwBYAB4A5v+t/3b/QP8L/9b+o/5x/kD+EP7h/bP9',
          'hv1b/TH9CP3g/Ln8lPxw/E38K/wL/Oz7z/uz+5j7fvtm+0/7Ofsl+xL7Afvx+uL61frJ+r76tfqt+qb6ofqd+pv6mfqa+pv6nvqh+qf6rfq1+r76yPrT+t/6',
          '7fr8+gz7Hfsv+0L7Vvtr+4L7mfux+8r75Pv/+xv8N/xV/HP8kvyx/NL88/wU/Tb9Wf18/aD9xf3p/Q/+NP5a/oD+p/7O/vX+HP9E/2v/k/+7/+L/CQAxAFkA',
          'gACoAM8A9gAdAUQBagGQAbYB2wEAAiUCSQJsAo8CsgLUAvUCFQM1A1QDcwORA60DygPlA/8DGQQxBEkEYAR2BIsEngSxBMME0wTjBPEE/wQLBRYFIAUoBTAF',
          'NgU7BT8FQQVDBUMFQQU/BTsFNgUwBSgFHwUVBQkF/ATuBN4EzgS8BKgEkwR9BGYETgQ0BBkE/APfA8ADoAN+A1wDOAMTA+0CxgKeAnUCSgIfAvIBxAGWAWYB',
          'NQEEAdEAngBqADUAAADJ/5H/Wf8g/+b+rP5x/jX++f28/X/9Qf0D/cT8hfxG/Ab8xvuG+0X7BfvE+oP6QvoA+r/5fvk9+fz4u/h6+Dr4+fe593n3Ovf79rz2',
          'fvZA9gL2xvWJ9U71TvVO9U/1UPVQ9VH1UvVS9VP1VPVU9VX1VvVX9Vf1WPVZ9Vn1WvVb9Vv1XPVd9V31XvVf9V/1YPVh9WH1YvVj9WP1ZPVl9WX1ZvVn9Wf1',
          'aPVp9Wn1avVr9Wv1bPVt9W31bvVv9W/1cPVx9XH1cvVz9XP1dPV19XX1dvV39Xf1ePV59Xn1evV79Xv1fPV99X31fvV/9X/1gPWB9YH1gvWD9YP1hPWF9YX1',
          'hvWH9Yf1iPWJ9Yn1ivWL9an17vU19n32xfYP91r3pffy9z/4jfjc+Cv5e/nM+R76cPrD+hb7avu++xP8aPy9/BP9af2//RX+bP7D/hr/cP/H/x0AdADLACEB',
          'eAHOASQCegLPAiQDeQPNAyEEdATHBBkFawW8BQwGWwaqBvgGRgeSB94HKAhyCLsIAwlKCY8J1AkYCkkKSQpICkcKRwpGCkUKRQpECkMKQwpCCkIKQQpACkAK',
          'Pwo+Cj4KPQo8CjwKOwo6CjoKOQo4CjgKNwo2CjYKNQo1CjQKMwozCjIKMQoxCjAKLwovCi4KLQotCiwKLAorCioKKgopCigKKAonCiYKJgolCiQKJAojCiMK',
          'IgohCiEKIAofCh8KHgodCh0KHAobChsKGgoaChkKGAoYChcKFgoWChUKFAoUChMKEwoSChEKEQoQCg8KDwoOCuYJrQlyCTgJ/QjBCIYISggNCNEHlAdXBxkH',
          '3AafBmEGJAbmBakFbAUuBfEEtAR3BDsE/wPDA4cDTAMRA9YCnAJjAioC8QG5AYIBSwEVAd8AqgB2AEMAEADf/67/fv9P/yD/8/7G/pr+b/5F/h3+9f3O/aj9',
          'g/1f/T39G/37/Nv8vfyg/IT8afxQ/Df8IPwK/PX74fvO+737rfue+5D7g/t4+237ZPtc+1b7UPtM+0n7R/tG+0b7R/tK+077UvtY+1/7Z/tw+3r7hfuR+5/7',
          'rfu8+8z73fvv+wH8Ffwp/D/8Vfxs/IP8nPy1/M/86fwE/SD9Pf1a/Xf9lf20/dP98v0S/jL+U/50/pX+t/7Z/vv+Hf8//2L/hf+n/8r/7f8PADIAVAB3AJoA',
          'vADeAAABIgFEAWUBhgGmAccB5wEGAiUCQwJiAn8CnAK4AtQC7wIKAyQDPQNVA20DhAOaA7ADxAPYA+sD/QMOBB8ELgQ8BEoEVgRhBGwEdQR+BIUEiwSRBJUE',
          'mASaBJsEmwSZBJcEkwSPBIkEggR6BHEEZgRbBE4EQAQxBCEEEAT+A+oD1gPAA6kDkQN4A14DQwMmAwkD6wLLAqsCiQJnAkMCHwL6AdMBrAGEAVsBMQEGAdsA',
          'rwCBAFMAJQD2/8b/lv9k/zL/AP/M/pn+ZP4v/vr9xP2O/Vj9If3q/LL8evxC/Ar80fuY+2D7J/vu+rX6fPpD+gr60fmY+V/5J/nu+Lb4fvhH+BD42fei92z3',
          'N/cB9832ovaj9qT2pPal9qX2pvan9qf2qPao9qn2qvaq9qv2q/as9qz2rfau9q72r/av9rD2sfax9rL2svaz9rT2tPa19rX2tva29rf2uPa49rn2ufa69rv2',
          'u/a89rz2vfa+9r72v/a/9sD2wPbB9sL2wvbD9sP2xPbF9sX2xvbG9sf2x/bI9sn2yfbK9sr2y/bM9sz2zfbN9s72zvbP9tD20PbR9tH20vbT9tP21PbU9tX2',
          '1fbW9tf21/bY9tj2/vY793n3uPf49zn4evi9+AD5Q/mI+c35E/pZ+qD66Pow+3j7wfsK/FT8nvzp/DT9f/3K/Rb+Yf6t/vn+Rf+R/93/KAB0AMAADAFYAaMB',
          '7gE5AoQCzgIYA2IDqwP0AzwEhATMBBIFWQWeBeMFJwZrBq4G8AYxB3EHsQfwBy0IagimCOEIAQkBCQAJ/wj/CP4I/gj9CP0I/Aj7CPsI+gj6CPkI+Qj4CPcI',
          '9wj2CPYI9Qj1CPQI8wjzCPII8gjxCPEI8AjvCO8I7gjuCO0I7QjsCOwI6wjqCOoI6QjpCOgI6AjnCOYI5gjlCOUI5AjkCOMI4wjiCOEI4QjgCOAI3wjfCN4I',
          '3QjdCNwI3AjbCNsI2gjaCNkI2AjYCNcI1wjWCNYI1QjUCNQI0wjTCNII0gjRCNEI0AjPCM8IzgjOCM0IoQhuCDsICAjUB6AHbAc3BwIHzQaYBmIGLQb3BcEF',
          'iwVVBSAF6gS0BH8ESQQUBN8DqgN1A0EDDAPZAqUCcgI/Ag0C2wGqAXkBSAEYAekAugCMAF8AMgAGANv/sP+G/13/NP8N/+b+v/6a/nb+Uv4v/g3+7P3M/a39',
          'j/1y/Vb9Ov0g/Qf97/zX/MH8rPyY/IT8cvxh/FH8Qvw0/Cf8G/wQ/Ab8/vv2++/76fvl++H73/vd+9z73fve++H75Pvo++779Pv7+wP8DPwW/CH8Lfw5/Ef8',
          'Vfxk/HT8hPyV/Kf8uvzO/OL89/wM/SL9Of1Q/Wj9gf2a/bP9zf3o/QL+Hv45/lX+cf6O/qv+yP7m/gP/If8//13/fP+a/7j/1//1/xMAMQBQAG4AjACqAMgA',
          '5gAEASEBPgFbAXcBkwGvAcsB5gEAAhsCNAJOAmYCfwKWAq0CxALaAu8CBAMYAysDPgNQA2EDcQOBA5ADngOrA7cDwwPOA9gD4QPpA/AD9gP7AwAEAwQGBAcE',
          'CAQIBAYEBAQBBPwD9wPxA+oD4QPYA84DwwO2A6kDmwOLA3sDagNYA0QDMAMbAwUD7gLWAr0CowKIAm0CUAIzAhQC9QHVAbQBkgFwAU0BKQEEAd4AuACRAGkA',
          'QQAYAPD/xf+b/2//Q/8X/+r+vP6P/mD+Mv4C/tP9o/1z/UP9Ev3h/LD8fvxN/Bv86vu4+4b7VPsi+/D6vvqM+lv6Kfr3+cb5lflk+TT5BPnU+KT4dfhG+Bf4',
          '6ffN9873zvfP98/30PfQ99H30ffS99L30/fT99T31PfV99b31vfX99f32PfY99n32ffa99r32/fb99z33Pfd99333vfe99/33/fg9+D34ffh9+L34vfj9+P3',
          '5Pfk9+X35ffm9+f35/fo9+j36ffp9+r36vfr9+v37Pfs9+337ffu9+737/fv9/D38Pfx9/H38vfy9/P38/f09/T39ff19/b39vf39/f3+Pf49/n3+ff69/r3',
          '+/f79/z3/Pco+F74lPjL+AP5PPl2+bD56vkm+mL6n/rc+hn7WPuW+9X7FfxV/JX81vwX/Vj9mv3c/R7+YP6i/uT+J/9p/6z/7/8wAHMAtQD3ADoBfAG9Af8B',
          'QAKBAsICAwNDA4IDwgMABD8EfQS6BPcEMwVvBaoF5AUeBlcGjwbGBv0GMwdoB50H0AfiB+EH4QfgB+AH3wffB94H3gfdB90H3AfcB9sH2wfaB9oH2QfZB9gH',
          '2AfXB9cH1gfWB9UH1QfUB9QH0wfTB9IH0gfRB9EH0AfQB88HzwfOB84HzQfNB8wHzAfLB8sHygfKB8kHyQfJB8gHyAfHB8cHxgfGB8UHxQfEB8QHwwfDB8IH',
          'wgfBB8EHwAfAB78Hvwe+B74HvQe9B7wHvAe7B7sHuge6B7kHuQe4B7gHtwe3B7YHtge1B7UHsQeFB1kHLAf/BtEGpAZ2BkgGGQbrBbwFjQVeBS8FAAXRBKIE',
          'cwREBBUE5gO3A4kDWgMsA/4C0AKiAnUCSAIbAu8BwwGXAWwBQQEXAe0AxACbAHMASwAkAP7/2P+z/47/av9H/yT/Av/h/sD+of6C/mP+Rv4p/g3+8v3Y/b/9',
          'pv2O/Xj9Yv1M/Tj9Jf0T/QH98Pzh/NL8xPy3/Kv8oPyV/Iz8hPx8/Hb8cPxr/Gf8ZPxi/GH8Yfxh/GL8Zfxo/Gz8cfx2/H38hPyM/JX8nvyp/LT8wPzM/Nr8',
          '6Pz2/AX9Ff0m/Tf9Sf1b/W79gv2W/ar9v/3V/ev9Af4Y/i/+R/5e/nf+j/6o/sH+2/70/g7/KP9C/1z/d/+R/6z/x//h//z/FgAwAEsAZQCAAJoAtADOAOgA',
          'AgEbATQBTQFmAX4BlgGuAcUB3AHyAQgCHgIzAkgCXAJvAoMClQKnArgCyQLZAukC+AIGAxQDIQMtAzgDQwNNA1YDXwNmA20DcwN5A30DgQOEA4YDhwOHA4cD',
          'hgODA4ADfAN4A3IDawNkA1wDUwNJAz4DMgMlAxgDCQP6AuoC2QLHArQCoQKMAncCYQJKAjMCGgIBAucBzQGxAZUBeAFaATwBHQH9AN0AvACaAHgAVQAyAA4A',
          '6v/F/6D/ev9T/yz/Bf/d/rX+jP5j/jr+EP7m/bz9kv1n/Tz9Ef3m/Lv8j/xj/Dj8DPzg+7X7iftd+zL7Bvvb+rD6hPpa+i/6BPra+bD5h/ld+TT5DPnj+NP4',
          '0/jU+NT41fjV+Nb41vjW+Nf41/jY+Nj42fjZ+Nr42vjb+Nv42/jc+Nz43fjd+N743vjf+N/44Pjg+OD44fjh+OL44vjj+OP45Pjk+OT45fjl+Ob45vjn+Of4',
          '6Pjo+On46fjp+Or46vjr+Ov47Pjs+O347fjt+O747vjv+O/48Pjw+PH48fjx+PL48vjz+PP49Pj0+PX49fj1+Pb49vj3+Pf4+Pj4+Pn4+fj5+Pr4+vj7+Pv4',
          '/Pj9+Cv5WvmK+bv57Pke+lD6g/q3+uv6H/tV+4r7wPv3+y78Zfyd/NX8Df1G/X/9uP3y/Sv+Zf6f/tn+E/9N/4j/wv/8/zYAcACqAOQAHgFYAZEBywEEAj0C',
          'dQKuAuYCHQNVA4sDwgP4Ay4EYwSXBMsE/wQyBWQFlgXHBfgFJwZXBoUGswbfBuYG5gblBuUG5QbkBuQG4wbjBuIG4gbiBuEG4QbgBuAG3wbfBt4G3gbeBt0G',
          '3QbcBtwG2wbbBtsG2gbaBtkG2QbYBtgG2AbXBtcG1gbWBtUG1QbUBtQG1AbTBtMG0gbSBtEG0QbRBtAG0AbPBs8GzgbOBs4GzQbNBswGzAbLBssGywbKBsoG',
          'yQbJBsgGyAbIBscGxwbGBsYGxQbFBsUGxAbEBsMGwwbCBsIGwgbBBsEGwAbABr8Gvwa0Bo0GZwY/BhgG8AXIBaAFeAVPBSYF/QTUBKsEggRZBC8EBgTdA7QD',
          'iwNiAzkDEAPnAr8ClgJuAkYCHwL3AdABqgGDAV0BNwESAe0AyACkAIEAXgA7ABkA+P/X/7b/lv93/1j/Ov8c///+4/7H/qz+kv54/l/+R/4v/hj+Av7t/dj9',
          'xf2x/Z/9jv19/W39Xv1P/UL9Nf0p/R79E/0K/QH9+fzy/Ov85fzh/N382fzX/NX81PzU/NX81vzY/Nv83/zj/Oj87vz0/Pz8A/0M/RX9H/0q/TX9QP1N/Vr9',
          'Z/11/YT9k/2j/bP9xP3V/eb9+P0L/h7+Mf5F/ln+bf6C/pf+rP7B/tf+7f4E/xr/Mf9H/17/df+M/6T/u//S/+r/AAAXAC8ARgBdAHQAiwCiALkA0ADmAPwA',
          'EgEoAT0BUwFoAXwBkAGkAbgBywHeAfABAgIUAiUCNgJGAlUCZQJzAoECjwKcAqgCtAK/AskC0wLdAuUC7QL0AvsCAQMGAwsDDwMSAxQDFgMXAxcDFgMVAxMD',
          'EAMMAwgDAwP9AvYC7wLnAt4C1ALKAr8CswKmApgCigJ7AmsCWwJJAjgCJQIRAv0B6QHTAb0BpgGPAXYBXgFEASoBDwH0ANgAvACfAIEAYwBFACYABgDn/8b/',
          'pf+E/2L/QP8d//r+1/60/pD+a/5H/iL+/f3Y/bP9jf1n/UH9G/31/M/8qfyD/Fz8NvwQ/Or7xPud+3j7Uvss+wb74fq8+pf6cvpO+ir6Bvrj+b/5uPm4+bn5',
          'ufm5+br5uvm7+bv5u/m8+bz5vfm9+b35vvm++b/5v/m/+cD5wPnB+cH5wfnC+cL5w/nD+cP5xPnE+cT5xfnF+cb5xvnG+cf5x/nI+cj5yPnJ+cn5yvnK+cr5',
          'y/nL+cz5zPnM+c35zfnO+c75zvnP+c/50PnQ+dD50fnR+dH50vnS+dP50/nT+dT51PnV+dX51fnW+db51/nX+df52PnY+dn52fnZ+dr52vna+dv52/nc+eT5',
          'Dfo3+mH6i/q2+uL6Dvs7+2j7lvvE+/P7IvxR/IH8sfzi/BP9RP11/af92f0L/j3+cP6i/tX+CP87/27/of/U/wYAOQBsAJ8A0QAEATcBaQGbAc0B/wEwAmIC',
          'kwLDAvQCJANTA4MDsQPgAw4EOwRoBJUEwQTsBBcFQQVrBZQFvQXlBQsGCgYKBgkGCQYJBggGCAYHBgcGBwYGBgYGBgYFBgUGBAYEBgQGAwYDBgMGAgYCBgEG',
          'AQYBBgAGAAb/Bf8F/wX+Bf4F/gX9Bf0F/AX8BfwF+wX7BfsF+gX6BfkF+QX5BfgF+AX4BfcF9wX2BfYF9gX1BfUF9AX0BfQF8wXzBfMF8gXyBfEF8QXxBfAF',
          '8AXwBe8F7wXuBe4F7gXtBe0F7QXsBewF6wXrBesF6gXqBeoF6QXpBegF6AXoBdgFtgWUBXEFTwUsBQkF5gTCBJ8EewRXBDMEDwTrA8cDowN/A1sDNwMTA+8C',
          'ywKnAoQCYAI9AhoC9wHUAbIBkAFuAUwBKwEKAekAyQCpAIoAawBMAC4AEADz/9f/uv+e/4P/aP9N/zT/Gv8C/+n+0v67/qX+j/56/mX+Uf4+/iz+Gv4I/vj9',
          '6P3Z/cr9vP2v/aP9l/2M/YL9eP1v/Wf9X/1Y/VL9TP1I/UT9QP09/Tv9Ov05/Tn9Ov07/T39QP1D/Uf9TP1R/Vf9Xf1k/Wz9dP19/Yb9kP2a/aX9sP28/cn9',
          '1v3j/fH9//0O/h3+LP48/kz+Xf5u/n/+kf6j/rX+x/7a/u3+AP8T/yf/O/9O/2L/dv+L/5//s//I/9z/8f8EABgALQBBAFYAagB+AJIApgC6AM0A4AD0AAcB',
          'GQEsAT4BUAFiAXMBhAGVAaYBtgHFAdUB4wHyAQACDgIbAicCNAI/AksCVQJfAmkCcgJ7AoMCigKRApcCnQKiAqcCqgKuArACsgKzArQCtAK0ArICsAKuAqoC',
          'pwKiAp0ClwKQAokCgQJ4Am8CZQJaAk8CQwI2AikCGwINAv0B7gHdAcwBugGoAZUBggFtAVkBRAEuARcBAAHpANEAuACfAIYAbABSADcAGwAAAOX/yP+r/47/',
          'cP9S/zT/Ff/2/tf+t/6Y/nj+V/43/hb+9v3V/bT9k/1x/VD9L/0N/ez8yvyp/If8ZvxE/CP8Avzh+8D7n/t++177Pfsd+/763vq/+qD6gfqA+oH6gfqB+oL6',
          'gvqC+oP6g/qD+oT6hPqE+oX6hfqF+ob6hvqH+of6h/qI+oj6iPqJ+on6ifqK+or6ivqL+ov6i/qM+oz6jPqN+o36jfqO+o76jvqP+o/6kPqQ+pD6kfqR+pH6',
          'kvqS+pL6k/qT+pP6lPqU+pT6lfqV+pX6lvqW+pb6l/qX+pf6mPqY+pj6mfqZ+pn6mvqa+pr6m/qb+pz6nPqc+p36nfqd+p76nvqe+p/6n/qf+qD6rvrS+vb6',
          'G/tB+2b7jfu0+9v7Avwr/FP8fPyl/M/8+fwj/U79eP2j/c/9+v0m/lL+fv6q/tb+A/8v/1z/if+1/+L/DgA6AGcAkwDAAOwAGAFEAXABnAHIAfMBHgJJAnMC',
          'ngLIAvECGwNEA2wDlAO8A+MDCgQxBFcEfAShBMUE6QQNBS8FSgVJBUkFSQVIBUgFSAVHBUcFRwVGBUYFRgVFBUUFRQVEBUQFRAVDBUMFQwVCBUIFQgVBBUEF',
          'QQVABUAFQAU/BT8FPwU+BT4FPgU9BT0FPQU8BTwFPAU7BTsFOwU6BToFOgU5BTkFOQU4BTgFOAU3BTcFNwU2BTYFNgU1BTUFNQU0BTQFNAUzBTMFMwUzBTIF',
          'MgUyBTEFMQUxBTAFMAUwBS8FLwUvBS4FLgUuBS0FLQUtBSwFLAUsBSsFGAX6BNwEvgSfBIEEYgRDBCQEBQTmA8YDpwOHA2gDSAMpAwkD6gLKAqoCiwJsAkwC',
          'LQIOAvAB0QGyAZQBdgFYATsBHQEAAeMAxwCrAI8AcwBYAD0AIwAJAPD/1/++/6b/jv92/1//Sf8z/x3/CP/0/uD+zP65/qf+lf6E/nP+Y/5T/kT+Nv4o/hv+',
          'Dv4C/vf97P3i/dj9z/3H/b/9uP2y/az9pv2i/Z79mv2X/ZX9k/2S/ZL9kv2T/ZT9lv2Y/Zv9n/2j/aj9rf2y/bn9v/3H/c791/3f/en98v38/Qf+Ev4d/in+',
          'Nf5C/k7+XP5p/nf+hv6U/qP+sv7C/tH+4f7x/gL/Ev8j/zT/Rf9X/2j/ef+L/53/r//A/9L/5P/2/wcAGQArAD0ATgBgAHIAgwCUAKYAtwDIANkA6QD6AAoB',
          'GgEpATkBSAFXAWUBdAGCAY8BnQGqAbYBwgHOAdoB5QHvAfoBAwINAhUCHgImAi0CNAI6AkACRgJLAk8CUwJWAlkCWwJcAl0CXgJeAl0CXAJaAlgCVQJRAk0C',
          'SAJDAj0CNwIwAigCIAIXAg0CAwL5Ae4B4gHWAckBuwGtAZ8BkAGAAXABXwFOATwBKgEXAQQB8QDcAMgAswCdAIcAcQBaAEMAKwATAPz/4//K/7H/l/99/2P/',
          'SP8t/xL/9/7b/r/+o/6H/mr+Tv4x/hT+9/3a/b39oP2D/WX9SP0r/Q398PzT/Lb8mPx7/F78Qvwl/Aj87PvQ+7T7mPt8+2H7Rvsv+zD7MPsw+zH7Mfsx+zL7',
          'Mvsy+zL7M/sz+zP7NPs0+zT7Nfs1+zX7Nvs2+zb7Nvs3+zf7N/s4+zj7OPs5+zn7Ofs5+zr7Ovs6+zv7O/s7+zz7PPs8+zz7Pfs9+z37Pvs++z77P/s/+z/7',
          'QPtA+0D7QPtB+0H7QftC+0L7QvtD+0P7Q/tD+0T7RPtE+0X7RftF+0b7RvtG+0b7R/tH+0f7SPtI+0j7SftJ+0n7SftK+0r7SvtL+0v7S/te+337nfu++977',
          'APwh/EP8ZvyJ/Kz8z/zz/Bf9PP1h/Yb9q/3Q/fb9HP5C/mn+j/62/tz+A/8q/1H/eP+f/8b/7f8UADsAYgCJAK8A1gD9ACQBSgFwAZYBvAHiAQcCLAJRAnYC',
          'mgK/AuICBgMpA0wDbgOQA7ED0wPzAxQEMwRTBHIEkAShBKEEoASgBKAEoASfBJ8EnwSeBJ4EngSdBJ0EnQSdBJwEnAScBJsEmwSbBJsEmgSaBJoEmQSZBJkE',
          'mQSYBJgEmASXBJcElwSWBJYElgSWBJUElQSVBJQElASUBJQEkwSTBJMEkgSSBJIEkgSRBJEEkQSQBJAEkASQBI8EjwSPBI4EjgSOBI4EjQSNBI0EjASMBIwE',
          'iwSLBIsEiwSKBIoEigSJBIkEiQSJBIgEiASIBIcEhwSHBIcEhgRwBFYEPAQhBAcE7APRA7YDmwOAA2QDSQMtAxED9gLaAr8CowKHAmwCUAI1AhkC/gHjAccB',
          'rAGSAXcBXQFCASgBDgH1ANsAwgCpAJAAeABgAEgAMQAaAAMA7v/Y/8L/rf+Y/4T/cP9c/0n/Nv8k/xL/AP/v/t/+z/6//rD+ov6U/ob+ef5t/mH+Vf5K/kD+',
          'Nv4t/iT+HP4U/g3+Bv4A/vr99f3x/e396f3m/eT94v3h/eD93/3g/eD94v3j/eb96P3r/e/98/34/f39A/4J/g/+Fv4d/iX+Lf41/j7+SP5R/lv+Zv5w/nv+',
          'h/6S/p7+q/63/sT+0f7f/uz++v4I/xb/JP8z/0L/Uf9g/2//fv+N/53/rP+8/8v/2//r//r/CQAZACgAOABHAFcAZgB2AIUAlACjALIAwADPAN0A6wD5AAcB',
          'FAEiAS8BOwFIAVQBYAFrAXcBggGMAZcBoQGqAbMBvAHFAc0B1AHcAeIB6QHvAfQB+QH+AQICBgIJAgwCDgIQAhECEgISAhICEgIQAg8CDQIKAgcCAwL/AfoB',
          '9QHvAekB4gHaAdMBygHBAbgBrgGkAZkBjgGCAXUBaQFbAU0BPwExASEBEgECAfEA4ADPAL0AqwCZAIYAcwBfAEsANgAiAA0A+P/j/83/tv+g/4n/cv9a/0P/',
          'K/8T//v+4v7K/rH+mP5//mb+Tf4z/hr+AP7n/c39tP2a/YD9Zv1N/TP9Gv0A/ef8zfy0/Jv8gvxp/FH8OPwg/Aj88PvY+8n7yfvK+8r7yvvK+8v7y/vL+8v7',
          'zPvM+8z7zfvN+837zfvO+877zvvO+8/7z/vP+8/70PvQ+9D70fvR+9H70fvS+9L70vvS+9P70/vT+9P71PvU+9T71fvV+9X71fvW+9b71vvW+9f71/vX+9f7',
          '2PvY+9j72PvZ+9n72fva+9r72vva+9v72/vb+9v73Pvc+9z73Pvd+9373fvd+9773vve+9/73/vf+9/74Pvg++D74Pvh++H74fvh+/f7E/wv/Ev8aPyF/KP8',
          'wPzf/P38HP07/Vv9ev2a/bv92/38/R3+Pv5f/oD+ov7E/uX+B/8p/0v/bv+Q/7L/1P/2/xgAOgBcAH4AoADCAOQABgEnAUkBagGLAawBzQHtAQ4CLgJOAm0C',
          'jAKrAsoC6AIGAyQDQQNeA3sDlwOzA84D6QMDBA0EDQQNBA0EDAQMBAwECwQLBAsECwQKBAoECgQKBAkECQQJBAkECAQIBAgECAQHBAcEBwQHBAYEBgQGBAYE',
          'BQQFBAUEBQQEBAQEBAQEBAMEAwQDBAMEAgQCBAIEAgQBBAEEAQQBBAAEAAQABAAE/wP/A/8D/gP+A/4D/gP9A/0D/QP9A/wD/AP8A/wD+wP7A/sD+wP6A/oD',
          '+gP6A/kD+QP5A/kD+AP4A/gD+AP3A/cD9wP3A/YD9gP1A94DxwOwA5kDggNqA1MDOwMjAwsD8wLbAsMCqwKTAnoCYgJKAjICGgICAukB0QG6AaIBigFyAVsB',
          'RAEtARYB/wDoANIAuwClAJAAegBlAFAAOwAnABMAAADs/9n/xv+0/6L/kP9+/23/XP9M/zz/LP8d/w//AP/y/uX+2P7L/r/+s/6o/p3+k/6J/n/+dv5u/mX+',
          'Xv5X/lD+Sv5E/j/+Ov42/jL+Lv4r/in+J/4l/iT+JP4j/iT+JP4l/if+Kf4s/i7+Mv41/jr+Pv5D/kj+Tv5U/lv+Yf5p/nD+eP6A/on+kf6b/qT+rv64/sL+',
          'zf7X/uL+7v75/gX/Ef8d/yn/Nv9C/0//XP9p/3b/g/+R/57/rP+5/8f/1f/i//D//v8LABgAJgA0AEEATwBcAGoAdwCEAJEAngCrALcAxADQANwA6AD0AAAB',
          'CwEWASEBLAE2AUABSgFTAV0BZgFuAXcBfwGGAY4BlQGbAaEBpwGtAbIBtwG7Ab8BwwHGAckBywHNAc4BzwHQAdAB0AHPAc4BzQHLAcgBxQHCAb4BugG1AbAB',
          'qgGkAZ4BlwGQAYgBfwF3AW4BZAFaAU8BRQE5AS4BIQEVAQgB+wDtAN8A0ADBALIAowCTAIIAcgBhAFAAPgAsABoABwD2/+P/z/+8/6j/lP+A/2v/Vv9C/yz/',
          'F/8C/+z+1/7B/qv+lf5//mj+Uv48/iX+D/74/eL9zP21/Z/9iP1y/Vz9Rf0v/Rn9A/3t/Nj8wvyt/Jf8gvxt/Fn8UPxQ/FD8UPxR/FH8UfxR/FH8UvxS/FL8',
          'UvxT/FP8U/xT/FT8VPxU/FT8VPxV/FX8VfxV/Fb8VvxW/Fb8V/xX/Ff8V/xY/Fj8WPxY/Fj8WfxZ/Fn8Wfxa/Fr8Wvxa/Fv8W/xb/Fv8W/xc/Fz8XPxc/F38',
          'Xfxd/F38Xvxe/F78Xvxe/F/8X/xf/F/8YPxg/GD8YPxh/GH8Yfxh/GH8Yvxi/GL8Yvxj/GP8Y/xj/GP8ZPxk/GT8ZPxl/GX8ffyV/K38xvzg/Pn8E/0t/Uj9',
          'Y/1+/Zn9tf3Q/ez9Cf4l/kL+X/58/pn+tv7T/vH+Dv8s/0r/aP+G/6T/wv/g//7/GwA4AFYAdACSALAAzQDrAAgBJQFDAWABfAGZAbUB0gHuAQkCJQJAAlsC',
          'dgKRAqsCxQLeAvgCEQMpA0EDWQNxA4gDjAOMA4wDiwOLA4sDiwOKA4oDigOKA4kDiQOJA4kDiQOIA4gDiAOIA4cDhwOHA4cDhwOGA4YDhgOGA4UDhQOFA4UD',
          'hQOEA4QDhAOEA4MDgwODA4MDgwOCA4IDggOCA4EDgQOBA4EDgQOAA4ADgAOAA38DfwN/A38DfwN+A34DfgN+A30DfQN9A30DfQN8A3wDfAN8A3sDewN7A3sD',
          'ewN6A3oDegN6A3kDeQN5A3kDeQN4A3gDeAN4A3MDXwNLAzcDIgMOA/kC5QLQArsCpgKRAnwCZwJSAjwCJwISAv0B6AHSAb0BqAGTAX4BagFVAUABLAEXAQMB',
          '7wDbAMcAtACgAI0AegBnAFUAQgAwAB4ADQD9/+z/2//K/7r/qv+b/4v/ff9u/2D/Uv9E/zf/Kv8e/xL/Bv/6/u/+5f7b/tH+x/6+/rb+rv6m/p7+l/6R/or+',
          'hf5//nr+dv5y/m7+a/5o/mX+Y/5i/mD+X/5f/l/+X/5g/mH+Yv5k/mb+af5s/m/+c/53/nv+gP6F/ov+kP6W/p3+o/6q/rH+uf7B/sn+0f7a/uL+7P71/v7+',
          'CP8S/xz/Jv8x/zv/Rv9R/1z/Z/9z/37/iv+V/6H/rf+5/8X/0P/c/+j/9P8AAAwAGAAjAC8AOwBHAFMAXwBqAHYAgQCMAJgAowCuALgAwwDNANgA4gDsAPUA',
          '/wAIAREBGgEiASsBMwE7AUIBSQFQAVcBXQFjAWkBbgF0AXgBfQGBAYUBiAGLAY4BkAGSAZQBlQGWAZYBlgGWAZUBlAGTAZEBjwGMAYkBhgGCAX4BeQF0AW8B',
          'aQFjAVwBVQFOAUYBPgE2AS0BJAEaARABBgH7APAA5QDZAM0AwQC0AKcAmQCMAH4AbwBhAFIAQwAzACMAEwADAPT/4//S/8H/sP+e/4z/ev9o/1b/Q/8x/x7/',
          'C//4/uX+0v6+/qv+l/6E/nD+Xf5J/jX+Iv4O/vr95/3T/cD9rP2Z/YX9cv1f/Uz9Of0m/RP9AP3u/Nz8yvzF/Mb8xvzG/Mb8xvzH/Mf8x/zH/Mf8yPzI/Mj8',
          'yPzI/Mn8yfzJ/Mn8yfzK/Mr8yvzK/Mr8y/zL/Mv8y/zL/Mz8zPzM/Mz8zPzN/M38zfzN/M38zvzO/M78zvzP/M/8z/zP/M/80PzQ/ND80PzQ/NH80fzR/NH8',
          '0fzS/NL80vzS/NL80/zT/NP80/zT/NT81PzU/NT81PzV/NX81fzV/NX81vzW/Nb81vzW/Nf81/zX/Nf81/zY/Nj83Pzx/Ab9HP0x/Uj9Xv11/Yz9o/27/dL9',
          '6v0C/hv+M/5M/mX+fv6Y/rH+yv7k/v7+GP8y/0z/Zv+A/5r/tP/P/+n/AgAcADYAUQBrAIUAnwC5ANMA7AAGAR8BOQFSAWsBhAGcAbUBzQHlAf0BFQIsAkMC',
          'WgJxAocCnQKzAsgC3gLyAgcDGwMbAxsDGgMaAxoDGgMaAxkDGQMZAxkDGQMYAxgDGAMYAxgDFwMXAxcDFwMXAxYDFgMWAxYDFgMVAxUDFQMVAxUDFAMUAxQD',
          'FAMUAxQDEwMTAxMDEwMTAxIDEgMSAxIDEgMRAxEDEQMRAxEDEAMQAxADEAMQAw8DDwMPAw8DDwMOAw4DDgMOAw4DDQMNAw0DDQMNAw0DDAMMAwwDDAMMAwsD',
          'CwMLAwsDCwMKAwoDCgMKAwoDCQMJAwkDAQPwAt4CzQK7AqkClwKFAnMCYAJOAjsCKQIXAgQC8QHfAcwBugGnAZUBggFwAV0BSwE5AScBFQEDAfEA3wDOALwA',
          'qwCaAIkAeABoAFcARwA3ACcAGAAIAPr/6//d/87/wP+y/6X/l/+K/37/cf9l/1n/Tv9D/zj/Lf8j/xn/EP8G//7+9f7t/uX+3v7W/tD+yf7D/r3+uP6z/q7+',
          'qv6m/qP+oP6d/pr+mP6W/pX+lP6T/pP+k/6T/pT+lf6W/pj+mv6c/p/+ov6l/qn+rf6x/rX+uv6//sT+yv7Q/tb+3P7j/ur+8f74/gD/CP8Q/xj/IP8p/zH/',
          'Ov9D/0z/Vv9f/2n/c/98/4b/kP+a/6X/r/+5/8T/zv/Z/+P/7v/4/wIADAAXACEAKwA2AEAASwBVAF8AaQBzAH0AhwCQAJoAowCsALYAvgDHANAA2ADhAOkA',
          '8QD4AAABBwEOARUBGwEhAScBLQEzATgBPQFCAUYBSgFOAVIBVQFYAVoBXQFfAWABYgFjAWMBZAFkAWMBYwFiAWABXwFdAVoBWAFVAVEBTQFJAUUBQAE7ATYB',
          'MAEqASMBHAEVAQ4BBgH+APUA7QDjANoA0ADGALwAsQCmAJsAkACEAHgAbABfAFIARQA4ACoAHAAOAAAA8v/k/9X/xv+3/6f/mP+I/3j/aP9Y/0f/N/8m/xb/',
          'Bf/0/uP+0v7B/rD+n/6O/nz+a/5a/kn+OP4m/hX+BP7z/eL90f3A/a/9n/2O/X79bf1d/U39Pf0t/Sz9Lf0t/S39Lf0t/S39Lv0u/S79Lv0u/S/9L/0v/S/9',
          'L/0v/TD9MP0w/TD9MP0x/TH9Mf0x/TH9Mf0y/TL9Mv0y/TL9Mv0z/TP9M/0z/TP9NP00/TT9NP00/TT9Nf01/TX9Nf01/TX9Nv02/Tb9Nv02/Tf9N/03/Tf9',
          'N/03/Tj9OP04/Tj9OP04/Tn9Of05/Tn9Of06/Tr9Ov06/Tr9Ov07/Tv9O/07/Tv9O/08/Tz9PP08/Tz9Pf1E/Vb9af18/Y/9ov22/cr93v3z/Qf+HP4x/kb+',
          'XP5x/of+nf6z/sn+3/71/gz/I/85/1D/Z/9+/5T/q//C/9n/8P8GAB0ANABLAGIAeQCPAKYAvQDTAOoAAAEWASwBQgFYAW0BgwGYAa0BwgHWAesB/wETAicC',
          'OgJOAmECcwKGApgCqgK4ArgCtwK3ArcCtwK3ArcCtgK2ArYCtgK2ArYCtQK1ArUCtQK1ArUCtAK0ArQCtAK0ArQCswKzArMCswKzArMCsgKyArICsgKyArEC',
          'sQKxArECsQKxArACsAKwArACsAKwAq8CrwKvAq8CrwKvAq4CrgKuAq4CrgKuAq0CrQKtAq0CrQKtAqwCrAKsAqwCrAKsAqsCqwKrAqsCqwKrAqoCqgKqAqoC',
          'qgKqAqkCqQKpAqkCqQKoAqgCqAKeAo8CgAJwAmECUQJBAjECIQIRAgEC8QHhAdEBwAGwAaABkAF/AW8BXwFPAT8BLwEfAQ8B/wDvAN8A0ADAALEAogCTAIQA',
          'dQBmAFgASQA7AC0AIAASAAUA+P/r/9//0v/G/7r/rv+i/5f/jP+B/3f/bP9i/1j/T/9G/z3/NP8s/yT/HP8V/w7/B/8B//r+9P7v/ur+5f7g/tz+2P7U/tH+',
          'zv7L/sn+xv7F/sP+wv7B/sH+wP7A/sH+wf7C/sT+xf7H/sn+y/7O/tH+1P7Y/tv+3/7k/uj+7f7y/vf+/P4C/wj/Dv8U/xv/If8o/y//Nv89/0X/Tf9U/1z/',
          'ZP9t/3X/ff+G/4//l/+g/6n/sv+7/8T/zf/W/9//6P/y//v/AwAMABUAHwAoADEAOgBDAEwAVQBeAGYAbwB3AIAAiACQAJgAoACoALAAtwC/AMYAzQDUAA==',
        ].join(''),
        volume: 0.8,
      },
      craftChime: {
        src: [
          'data:audio/wav;base64,',
          'UklGRtIzAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0Ya4zAAAAAAcAGwAvAD8ATwBfAG4AZABIACQA/v/Y/7X/lv95/13/Qf8n/xL/CP8O/yj/',
          'W/+j//v/WwC5AAsBSwFzAYUBhQF3AWABQQEZAd8AjAAZAIP/zf4G/lf9R/03/Sf9GP1Y/Xn+1/9HAZ4CSANXA2cDdwOHA/YC9wH0AAgAQv+i/iT+vv1l/RX9',
          '0Pyh/Jf8wfws/dn9wf7Q/+sA9QHVAngD2QP6A+oDuANxAxkDrgIhAmABXAAR/4b92vs++i/6H/oP+v/5WPqe/Fr/NgLeBGAGcAaABpAGoAa6BdoD9gE9AMz+',
          'qP3F/BL8evv0+oH6M/oi+mj6GPs4/Lj9e/9RAQ0DgwSUBTYGcAZWBgMGjQX/BFQEeANQAsQAy/5x/OL5ZfcW9wb39vbm9h73efqJ/tUC2AZ5CYkJmAmoCbgJ',
          'rwjyBSkDnQB5/sj8evt1+pz53vg8+Mr3q/cD+O/4d/qJ/Pr+jQH/AxMGnAeKCOQIxwhXCLUH8gYKBuQEXANQAbL+jvse+Lz0/fPu897zzvO+8wv4Z/0hA4kI',
          'kQyhDLEMwQzRDNQLPgiOBCkBSv4D/ET66fjM99T2APZm9TP1lfWz9pn4NPtQ/p8BywSEB48J0gpWCz0LtQrpCfMI0AdkBoIE/gHD/t36jvZG8uXw1fDF8LXw',
          'pfBX9fP7GQPvCaMPug/KD9kP6Q8nD74KJwbjAUH+W/sj+W73CvbW9M7zCfO88iDzZfSf9rv5fP2FAW8F1AhqCw4NxQ22DRoNKAwAC6QJ9gfABc0C/v5d+jP1',
          'AfDM7bztre2d7Y3tYPIv+r4CCAsOEtIS4hLyEgITpxJxDfQHywJe/tL6GvgE9lb05fKm8bPwRvCk8Afyi/Qf+H/8QQHqBQIKLQ07Dy4QMhCID3EOGg2HC5oJ',
          'Fge7A2D/DfoN9PDttOqk6pTqhOp06invHPgPAtILNxTrFfsVChYaFioWWBD0CeMDo/5o+ij3rPSw8gDxie9l7tTtI+6b71/yYPZZ+9EAPAYNC9QOVxGREq8S',
          '/BHFEEAPeQ1QC4IIxwTp/+v5GfMT7Jvni+d852znXOe067v1DAFLDB0WAxkTGSMZMxlDGXETKgwsBRL/H/pP9mfzGvEo73ftIOxl65/rIu0b8IL0C/o2AGQG',
          '8gtgEGET7BQtFXcUIxNyEXcPFQ0ECu8FlgD2+VryauqD5HPkY+RT5EPkBugQ87X/cQy8FxwcLBw8HEscWxy7FpQOqAas//j5kPU28pPvXe1x6+Tp++ga6Z7q',
          'w+2E8pf4cv9hBrIMzhFYFTwXqRf3FooVrxOEEesOmgsyB2cBLvrN8fboauFa4UrhO+Er4SLkHPAK/kMMERk0H0QfVB9kH3QfNhozEVYIcgD2+ez0GfEc7qDr',
          'd+mx55fmk+YR6FfrafD99oH+MwZLDRsTOBeCGSQafBn6F/gVnRPQEEMNjghbApD6cvG453jeQt4y3iLeEt4L4OHsDfzBCxkaTSJdIm0ifSKMIuAdBxQ4CmcB',
          'Gfpm9BLwtuzx6YnnieU65A7kfeXa6DLuP/Vm/dkFuw1IFAEZuhuaHAUccxpMGMIVwxL+DgMKbwMc+0nxr+Z13CnbGdsJ2/raxdti6b756QrSGmYldSWFJZUl',
          'pSW3IQ8XTwyLAmP6/fMh72HrT+io5Wzj5eGM4ePiTebh61zzIvxUBQIOUxWxGuQdDB+QHvQcqxr0F8UUyxCQC6IE0PtQ8dvlptoR2AHY8dfh19HXoeUe97wJ',
          'Oxt+KI4oniiuKL0ouyVMGpsO3gPa+sbzbe5Z6hDnQOTj4Tzgxt8K4XLkHerM8eH6eASWDVUVFRuSHugfgB/gHYgbvxiEFYwRYQyRBeP8gvIf5+DbLtg32D/Y',
          'SNhQ2DjkOPV8B9IYLCd9J3QnbCdjJ5IlmRpFD84E9Pv29KrvpOts6K7lXOOt4RThFOIZ5Uvqd/EP+j8DFQyyE3IZCh2KHlAe3RytGg0YAhVOEYEMKwYN/kP0',
          'Z+mK3tHZ2dni2erZ8tmu47bzMQUFFjEk3SXVJc0lxSUiJb0a2g+tBf78F/bY8N/st+kM58TkEeNZ4h3jxuWF6jTxU/kcAqsKIxLgF44bNh0oHeAb1xldF4AU',
          'ChGUDLAGGv/h9YrrEOFj22vbc9t724PbRuNd8hEDYBNWIU4kRyQ/JDckLyTRGl4QfQb7/Sr3+PEL7vPqWegd5mfkluMi5HfmyuoB8ar4DwFVCaYQXBYfGuob',
          'BxzpGgUZsBb9E8EQnAwiBwwAXveK7XLj5dzs3PTc+9wD3f3iK/EaAeEQmx7QIskiwSK6IrIi1hrTED4H6f4w+AzzKu8h7JfpaOex5crkJeUr5xnr3fAV+BcA',
          'FAg8D+gUuxioGu4a+Bk5GAYWexN0EJkMgwflAL34Z++z5VbeXd5l3mzec97S4h7wTP+IDgAcYiFbIVMhTCFFIc0aOBHwB8r/KvkS9DzwQO3F6qPo7+b15SPm',
          '4udw68fwkvc0/+cG5A2EE2MXbxncGQwZcRdfFfkSIxCNDNMHqAH++STx1Oe538Dfx9/N39TfwuI076L9VAyEGQIg+x/0H+4f5x+2Go8RlAidABf6DfVB8VHu',
          '5uvR6R/oF+cd55roz+u/8CD3Y/7NBZ0MLRIXFj8Y0BgmGK0WuxR4Es8PeQwVCFYCJPvB8tTpXeET4RrhIOEn4cviau4d/EIKJhexHqsepB6dHpcekhrXESsJ',
          'ZAH5+vz1OvJW7/ns8epE6S/oE+hT6TXswvC+9qT9xQRmC+UQ1xQYF8wXRhfuFRsU+BF5D10MSgjwAjH8QfS3637jWeJf4mXibOLr4r/tu/pTCOYUbh1oHWEd',
          'Wx1VHWMaEhK0CR4Cz/vg9ifzTvD/7QTsXeo/6QPpDOqg7NHwavb2/M8DQQqsD6IT+hXOFmsWMxV+E3oRIg88DHMIdwMm/ab1fO2D5ZHjl+Od46PjqeMw7Xn5',
          'hgbEEjgcMhwsHCYcIBwoGkESMArNApr8uvcK9Dvx+e4L7WrrReru6cTqEO3p8CX2WfzpAisJgA54EuUU1xWVFX0U5BL9EMkOFQyRCO4DBP7v9iXvb+e85MLk',
          'yOTO5NTkvOxX+NcEvhChGgkbBBv+Gvga4hljEqEKcQNa/Yn44/Qd8ufvBe5s7ELr0+p864XtC/Ht9cv7FAIkCGENWRHYE+cUxRTLE00SghBvDukLpQhWBM7+',
          'IPi08EHp2+Xh5efl7OXy5WLsUvdIA9QOlhjtGecZ4hncGZMZehIFCwkEEP5P+bL19fLK8PTuY+027LPrMuz97TTxwPVL+04BLQdQDEUQ0xL9E/kTHRO6EQkQ',
          'FQ66C7EIrwSE/zn5KPL66u/m9Ob55v/mBOce7Gn21gEGDaIW3BjWGNEYzBjGGIYSXguWBL3+C/p39sPzovHY70/uIe2N7Obsd+5l8Z/12vqYAEQGTAs8D9cR',
          'GRMzE3MSKhGSD7sNhwu1CPsEJwA8+oXzm+z25/znAegG6Avo8eub9YEAUgvEFNYX0RfMF8cXwheHEqwLGQVf/7/6M/eH9HDysfAx7wPuYO2Y7fTunfGJ9Xb6',
          '8P9pBVQKPg7jEDwSchLNEZ0QHQ9hDVELsQg7BboAKvvJ9CTu9Oj46P3oAukH6dfr5vRH/7kJ/BLbFtYW0RbMFscWfxLwC5MF+f9p++f3QvU084DxCfDc7i3u',
          'R+5y79rxfPUd+lX/nARpCUkN+A9lEbURKxEUEKsOCA0ZC6gIcQU+AQT8+PWY7+bp6+nw6fTp+enP60n0Jv44CEgR6hXmFeEV3BXYFW0SKgwCBogAC/yS+PT1',
          '7/NG8tfwre/07vPu8u8d8nj10fnI/twDiQhfDBQPlRD+EI0QjQ86Dq8M3wqZCJ0FswHM/BL39fAm69Pq2Ord6uHq2evC8x/9zwaqDwQV/xT7FPYU8hRTEloM',
          'aAYQAaX8Nvmf9qH0AvOd8XXwtO+c73HwZPJ89Y/5Rv4oA7UHfgs4DsoPSxDzDwoPzA1XDKMKhQi/BRsCgv0X+D7ymuyy67fru+u/6/LrUPMu/H4FIQ4mFCIU',
          'HhQaFBUUMBKBDMUGjwE4/dL5QfdL9bXzWfI18W/wQfDx8K/yh/VY+dH9gALtBqgKZA0GD5wPXQ+KDmANAAxmCm0I2gV2Aij+Cflz8/ztiOyM7JDsleyZ7PHy',
          'VftEBKwMUhNOE0oTRhNCEwYSoAwZBwYCwv1n+t337vVg9Azz7vEi8ePwcPH98pn1Kvlm/eQBLwbaCZgMRw7zDsoODA72DKoLKQpSCO0FxgK//un5lfRL71Xt',
          'We1d7WHtZe2l8pD6HwNKCxkSgxJ/EnsSdxLVEbYMZQd2Akb+9fpx+Ij2A/W4857y0PGB8e/xTvOx9QT5Bv1TAXwFFwnUC48NTg47DpINjgxVC+sJMwj6BQsD',
          'R/+4+qX1ifAa7h3uIe4l7inuavLg+Q8C/Am0EMARvBG4EbURnRHEDKkH3QLC/nz7/vgc9571W/RH83fyGvJt8qHzz/Xn+LD8zQDTBFwIFwvcDK0Nrw0bDSkM',
          'AgutCRIIAQZHA8L/d/uj9rfx1u7a7t3u4e7l7j7yQ/kUAcAIXQ8FEQER/hD6EPcQywzlBz0DOP/9+4X5qPcx9vf06fMY87Dy6fL28/L10vhk/FEANQSqB2EK',
          'LwwRDScNpgzGC7AKbwnuBwMGegMwACf8kPfT8ovvju+S75Xvme8i8rn4LACXBxYOUhBOEEsQRxBEEMoMGQiXA6f/d/wG+i74vvaL9YP0s/NB82PzTPQZ9sT4',
          'IPzf/58DAAezCYgLeQyiDDQMZgtgCjAJyAf/BaUDlADJ/G344PM48DvwP/BC8EbwEvI/+Ff/gAbeDKYPow+fD5wPmQ/DDEcI6QMPAOz8gfqu+EX3GfYX9Uj0',
          'zfPc86T0RPa8+OX7dv8TA2AGCwnmCuYLIAzFCwcLEQrzCKEH+AXIA+wAXf07+d303vDh8OXw6PDr8BDy1veT/nkFtAsBD/4O+w74DvQOtgxtCDQEcQBb/fb6',
          'KPnE96D2pPXX9Fb0UvT89HP2uvix+xb/kALHBWsISgpWC6ILWAurCsMJtgh5B+0F5QM7AeT9+/nM9c/xgfGE8YfxivEY8nv34P2EBJkKYw5gDl0OWg5XDqIM',
          'jQh5BM4AxP1m+535Pvgh9yv2YPXa9Mb0VPWk9r74hfu+/hYCNgXRB7QJywonC+4KUAp3CXkIUAffBfwDgQFg/qz6rPbN8hnyHPIf8iLyLPIv9z79ngONCcwN',
          'yQ3GDcMNwA2JDKcIuAQkASj+0fsM+rP4m/es9uP1WfU49az12fbH+GD7b/6kAa0EPgcjCUUKsAqHCvgJLQk9CCYHzgUNBL4B0P5R+3/3v/Os8q/ysfK08rfy',
          '8faq/MgCjgg7DTgNNQ0yDS8Nawy7CPEEdQGH/jf8dvoi+RD4J/di9tX1p/UE9g/31PhC+yb+OQEsBLIGlwjCCTsKIgqiCeQIAgj7BroFGgT0ATb/6ftF+KT0',
          'OPM78z7zQPND8772JvwBApwHTQytDKoMpwykDEgMyQglBcEB4P6Y/Nz6i/l/+Jz32vZM9hP2W/ZH9+b4Kfvm/dcAsgMsBhAIQwnKCb8JTgmdCMgH0AalBSIE',
          'IwKS/3b8/vh99b/zwfPE88bzyfOY9q/7SAG4BlgLJwwlDCIMHwwdDNIIUgUIAjX/9Pw9+/D56fgM+E73vvZ89rL2gff7+Bb7rP17AD4DrAWOB8kIWwlfCfwI',
          'WAiOB6UGjQUmBEsC5v/4/Kv5S/ZA9EL0RfRH9Er0fPZF+50A4QVuCqcLpQuiC6ALnQvVCHsFSQKG/0z9mftQ+k75dvi99yz34/YH97z3FPkJ+3j9JwDSAjMF',
          'EgdSCPAIAgmsCBQIVgd6BnQFJgRtAi8Ab/1M+g33u/S+9MD0w/TF9Gr26PoAABYFjgktCyoLKAslCyML1AieBYYC0f+g/fH7rPqv+dz4J/iX90f3W/f49zD5',
          'APtL/dr/bAK/BJsG3weICKcIXQjRBx4HUAZaBSMEiQJzAN394/rF9zL1NPU39Tn1O/Vh9pb6cP9XBLgItwq1CrIKsAquCs4IvAW+AhgA8P1F/AT7C/o9+Yz4',
          '/Pen9673NPhO+fv6I/2T/w0CUQQoBnEHIwhOCBEIkAfoBiUGPwUeBKECrgBB/m/7cvik9ab1qPWq9a31YfZQ+uv+pQPtB0YKRApCCj8KPQrECNYF8QJbADv+',
          'lfxX+2L6mfns+F74BfgA+HH4b/n7+gD9Uv+0AekDugUGB8AH9wfGB1EHswb7BSMFFgS0AuQAnf7x+xT5V/YT9hX2F/YZ9mj2E/py/v0CLAfaCdgJ1gnUCdEJ',
          'tgjrBSADmgCD/uL8p/u2+vH5Sfm8+F/4UPiu+JH5/vrj/Bf/YAGGA1EFngZhB6MHfQcTB38G0QUGBQsEwwITAfH+avyt+QX3fPZ+9oD2gvaE9uH5A/5hAnQG',
          'cglwCW4JbAlqCaQI/AVKA9UAyP4r/fP7BftF+qH5F/m3+J746/i2+QX7yvzh/hIBKAPsBDsGBQdQBzYH1gZMBqgF6QT/A84CPAE9/9r8Pfqq9+D24vbk9ub2',
          '6Pa3+aD9zwHGBQsJDQkLCQkJBwmPCAkGcQMMAQj/cP08/FH7lfr1+W35C/nq+Cf52/kP+7b8sP7KANACjATbBasGAAfxBpsGGgZ/BcwE8QPWAmABgv9C/cT6',
          'R/hA90L3RPdF90f3lvlG/UgBIQVcCK0IrAiqCKgIdggSBpQDQAFG/7P9gfyZ++H6RfrA+V35NPlj+QL6HPum/IT+hwB8AjEEfwVUBrMGrgZhBukFVwWuBOID',
          '2wJ/AcD/of1C+9v4nPee96D3ofej93359vzKAIUEtAdSCFAITghNCEsIGAayA3ABgP/y/cP83vsp+5H6D/qr+X35n/kq+iv7mvxd/kkALgLZAyYFAAZnBmwG',
          'KQa5BTAFkQTSA90CmgH5//n9uPto+fT39vf49/r3+/dr+a/8VgDyAxQH+gf5B/cH9Qf0BxkGzgOdAbb/Lv4C/SD8b/va+lr69/nD+dr5U/o8+5H8Ov4QAOQB',
          'hgPRBK8FHQYrBvIFigUJBXMEwAPdArEBKgBK/iX87PlJ+Ev4TPhO+FD4YPlw/Oz/aAN7BqYHpQejB6IHoAcYBuUDxgHq/2f+P/1f/LD7IPuj+kD6CPoU+n36',
          'UPuL/Bz+3P+fATcDfwRgBdYF7QW8BV0F4wRWBK4D2wLEAVgAlf6M/Gr6mvic+J34n/ih+Fv5OfyJ/+YC6QVWB1QHUwdRB1AHEwb6A+wBGgCe/nj9m/zv+2L7',
          '6PqF+kr6Tfqm+mX7ifwB/qz/XgHsAjEEFAWQBbAFhwUwBb0EOASbA9YC0wGAANn+6/zg+vD46vjr+O347vhc+Qr8L/9sAl4FCQcHBwYHBAcDBwwGCwQOAkgA',
          '0v6v/dT8K/yh+yr7yPqK+oX60Pp8+4n86v1//yEBpQLlA8sETQV0BVQFBAWZBBsEiAPQAuABpAAX/0T9T/tt+TT5Nvk3+Tn5Yvnh+93++gHZBL8GvQa8BroG',
          'uQYBBhkELgJzAAP/4/0K/WT83ftp+wn7yPq8+vr6lPuM/Nb9V//oAGECnQOEBAsFOgUiBdoEdQT+A3QDyQLqAcMAUP+W/bf75Pl8+X35f/mA+YH5wPuT/pAB',
          'XAR4BnYGdQZzBnIG9AUkBEsCmwAy/xX+Pv2a/Bb8pvtH+wT78vok+637kfzG/TP/swAhAlkDQATMBAIF8QSwBFIE4gNgA8EC8QHfAIP/4v0Z/FX6wfnC+cP5',
          'xfnG+aT7T/4sAeUDJQYyBjEGLwYuBuUFLARlAsEAXv9F/nD9zvxN/N/7gvs++yb7TvvI+5j8uP0S/4IA5QEXA/4DjgTLBMEEhwQvBMYDTAO3AvYB9wCy/yn+',
          'dfzA+gL6BPoF+gb6B/qP+xP+0AB0A64F8QXwBe4F7QXUBTIEfALkAIj/cv6f/QD9gfwW/Lr7dvtZ+3j74/uh/K799P5UAKwB2AK/A1MElQSTBGAEDgSqAzcD',
          'rAL5AQwB3P9q/sr8JftB+kP6RPpF+kb6fvvd/XsACgM7BbIFsQWwBa8FrQU1BJECBAGv/53+zf0v/bP8Svzw+6z7i/uh+/77rPym/dr+KgB3AZ0CggMZBGEE',
          'ZgQ5BO0DjwMjA6EC+gEeAQEApv4b/YX7fvp/+oD6gfqD+nP7rP0sAKYCzQR2BXUFdAVzBXIFNgSkAiMB1f/H/vj9XP3i/Hz8JPzf+7v7yfsb/Ln8oP3C/gMA',
          'RAFkAkgD4QMvBDoEEwTNA3QDDgOVAvoBLQEkAN3+Zv3g+7j6ufq6+rv6vPps+4L95P9HAmUEPQU8BTsFOQU4BTQEswI/Afj/7v4h/of9D/2r/Fb8Efzq+/H7',
          'N/zG/J39rv7g/xUBLgIQA6sD/gMPBO4DrQNaA/oCiAL4AToBQgAP/6v9Nfzw+vH68vrz+vT6avtd/aH/7wEBBAYFBQUDBQIFAQUxBMECWAEYABP/Sf6w/Tr9',
          '2fyF/EH8GPwZ/FT81fyc/Zz+wP/pAPoB2gJ3A84D5QPKA48DQQPmAnsC9QFEAV0APf/s/Yb8Mvsm+yf7KPsp+2v7Pv1k/5wBogPRBNAEzwTOBM0EKwTMAnAB',
          'NwA2/27+1/1j/QT9svxv/ET8P/xx/OX8nP2M/qL/vwDKAaYCRQOfA7wDpwNxAycD0gJtAvABTQF2AGf/Kf7R/If7Wfta+1v7XPtw+yP9Lf9OAUcDngSdBJwE',
          'mwSaBCQE1gKFAVUAWP+S/vz9iv0t/d78m/xu/GX8jvz2/J79f/6G/5kAnAF1AhQDcwOUA4QDUwMPA74CYALrAVMBiwCO/2D+GP3Y+4r7i/uM+437jvsN/fr+',
          'BgHyAm0EbARsBGsEagQaBN0CmQFwAHj/tP4g/q/9VP0H/cX8l/yK/Kv8CP2i/XT+bv91AHABRgLmAkcDbQNjAzcD9wKqAlIC5QFYAZ0Asf+U/lv9Jfy5+7r7',
          'u/u8+737+vzN/sIAoAItBD4EPQQ8BDsEEATiAqsBigCW/9X+Qv7T/Xr9Lv3u/L/8rvzI/Br9p/1s/lf/UwBHARkCuQIdA0cDQgMbA98ClwJEAt4BWwGuAND/',
          'xP6a/W785vvn++j76fvq++z8pP6DAFMC2wMRBBAEDwQPBAME5gK6AaIAs//0/mL+9P2d/VT9Ff3l/NH85fwt/a79Zf5D/zQAIAHuAY0C9AIjAyID/wLIAoQC',
          'NQLXAV0BvADt//D+1P20/BH8EvwT/BT8Ffzi/H/+SQALAo0D5gPmA+UD5APjA+gCyAG4AM7/Ef+B/hX+v/13/Tr9Cv3z/AH9QP22/V/+Mv8XAPsAxQFkAswC',
          '/wIDA+UCsQJxAicCzwFdAcgABgAZ/wv+9fw7/Dv8PPw9/D782vxf/hQAxgFCA70DvAO8A7sDugPoAtUBzADn/y3/n/4z/t/9mf1d/S79FP0d/VT9vv1c/iL/',
          '/v/ZAJ8BPAKmAtwC5QLLApsCXwIZAsYBXQHSAB0APv8+/jP9Yvxj/GT8Zfxl/Nb8Qv7j/4YB+gKWA5UDlAOUA5MD5wLfAd8A//9I/7v+Uf7+/br9f/1Q/TT9',
          'OP1n/cj9Wv4U/+b/uQB6ARUCgQK7AscCsQKGAk0CCwK9AVsB2gAxAGD/bf5t/Yj8ifyK/Iv8i/zV/Cr+tv9KAbYCcANvA28DbgNtA+QC6AHxABUAYf/W/m3+',
          'HP7Z/Z/9cP1U/VP9e/3S/Vn+CP/P/5sAVwHxAV0CmgKqApkCcAI7Av0BtAFZAeEARACA/5r+pP27/K78rvyv/LD81/wV/o3/EQF1AkwDSwNKA0oDSQPgAvAB',
          'AQEqAHr/8P6I/jj+9v2+/ZD9cv1u/Y/93v1a/v7+u/9+ADUBzQE7AnoCjgKAAlwCKgLvAasBVgHnAFQAnP/D/tj99fzR/NH80vzT/Nv8A/5n/9wANwIpAykD',
          'KAMnAyYD2gL2ARABPgCR/wj/of5S/hP+3P2u/Y/9iP2j/en9XP71/qn/ZAAWAawBGgJbAnMCaQJIAhkC4gGhAVIB6wBiALb/6f4I/i398vzz/PT89Pz1/PT9',
          'Rf+rAP0BCAMHAwcDBgMFA9QC+wEdAVEApv8f/7n+bP4t/vj9y/2r/aH9t/32/V7+7v6Y/0wA+ACLAfoBPQJYAlICNAIIAtQBmAFOAe4AbwDO/wz/Nv5h/RL9',
          'E/0U/RT9Ff3o/Sb/fQDFAdcC5wLnAuYC5QLMAv4BKQFiALv/Nv/R/oT+R/4T/uf9xv26/cv9Av5i/uj+if81ANwAbQHbASACPgI7AiEC+AHHAY4BSQHwAHoA',
          '4/8s/2D+k/0x/TL9Mv0z/TT93/0K/1IAkQGfAskCyALIAscCwwIAAjMBcwDP/0v/5/6b/l/+Lf4B/uH90v3f/Q/+Z/7j/nv/IADBAE8BvQEEAiUCJQIOAugB',
          'ugGEAUQB8QCDAPf/Sv+I/sL9T/1P/VD9Uf1R/dj98v4rAF8BaQKrAqsCqgKqAqkCAgI9AYIA4f9f//z+sf52/kX+G/76/en98v0d/mz+4P5v/wwAqQAzAaEB',
          '6QENAhAC/AHZAa0BewE+AfEAiwAHAGb/rf7v/Wv9bP1s/W39bf3T/dz+BgAxATYCjwKPAo4CjgKNAgECRQGQAPL/cv8Q/8b+jf5c/jP+Ev4A/gb+Kv5z/t7+',
          'Zf/7/5EAGQGFAc8B9QH7AeoByQGgAXEBOAHxAJIAFwB//9D+Gf6G/Yf9h/2I/Yj90f3J/ub/BQEFAnQCdAJzAnMCcgIAAkwBnQACAIX/JP/a/qL+c/5K/ir+',
          'Fv4Z/jj+ef7d/lv/6/97AAABawG2Ad4B5wHYAbsBlAFnATIB7wCYACUAlv/w/kH+oP2h/aH9ov2i/dD9uP7H/9wA1gFaAloCWQJZAlgC/gFSAakAEQCW/zb/',
          '7v62/oj+YP5A/iz+K/5G/oH+3P5T/9z/ZwDoAFIBnQHHAdMBxwGsAYgBXQEsAe4AnAAxAKz/D/9m/sb9uv26/bv9u/3S/ar+q/+1AKkBQgJBAkECQAJAAvsB',
          'VwGzACAAp/9I/wD/yf6c/nX+Vf5A/j3+VP6I/t3+TP/O/1MA0QA6AYUBsQHAAbcBngF8AVQBJQHrAKAAPAC//yr/iv7u/dL90v3T/dP91f2e/pL/kQB/ASoC',
          'KQIpAigCKAL3AVsBvQAtALb/WP8R/9v+r/6K/mr+VP5P/mH+kf7e/kf/wf9BALsAIwFvAZwBrQGnAZABcAFLAR8B6QCiAEYA0f9E/6v+FP7p/en96v3q/ev9',
          'lP56/28AVwETAhMCEgISAhEC8wFeAcYAOgDF/2j/Iv/s/sL+nf5+/mj+Yf5v/pn+4P5C/7b/MQCnAA0BWQGIAZsBlwGDAWUBQQEYAeYApABOAOH/XP/K/jj+',
          '//3//QD+AP4B/o3+Zv9QADEB7gH9AfwB/AH8Ae0BYQHOAEYA0/94/zL//f7T/q/+kf56/nL+ff6i/uP+Pv+s/yEAlAD4AEQBdAGJAYcBdQFaATgBEQHiAKYA',
          'VQDv/3L/5/5a/hT+FP4V/hX+Fv6G/lP/MwAOAccB6AHnAecB5wHmAWIB1QBRAOH/hv9B/w3/5P7B/qP+jP6C/ov+q/7m/jv/o/8TAIIA4wAvAWEBeAF4AWkB',
          'TwEvAQsB3wCmAFwA/P+H/wL/ev4o/in+Kf4p/ir+gv5C/xgA7ACjAdQB0wHTAdMB0gFiAdwAWwDt/5T/UP8c//P+0v60/p7+kv6Y/rT+6v45/5v/BgBxANAA',
          'HAFOAWcBaQFcAUQBJgEEAdsApgBhAAcAmf8b/5n+PP48/jz+Pf49/n/+NP8AAMwAfwHBAcABwAG/Ab8BYgHhAGUA+f+h/13/Kv8D/+L+xf6u/qL+pf6+/u/+',
          'OP+U//v/YQC+AAkBPAFWAVsBUAE6AR4B/QDXAKYAZQASAKv/M/+2/k7+T/5P/k/+UP5+/if/6v+uAF4BrgGuAa0BrQGtAWEB5gBuAAMArf9r/zj/Ef/x/tX+',
          'vv6x/rL+x/7z/jf/jf/v/1IArQD3ACsBRgFNAUQBLwEVAfYA0gClAGkAGwC6/0n/0f5g/mH+Yf5h/mL+fv4c/9X/kgA+AZwBnAGcAZsBmwFgAeoAdgAOALn/',
          'd/9F/x////7k/s7+wP6//tH++f43/4j/5f9EAJ0A5gAaATcBQAE4ASUBDQHwAM4ApABsACMAyf9d/+r+fP5y/nL+cv5z/n/+Ev/C/3gAIAGLAYsBiwGKAYoB',
          'XgHtAH0AGADF/4P/Uv8s/w3/8/7d/s7+y/7a/v7+N/+D/9z/NwCNANUACgEoATIBLQEcAQUB6QDJAKIAbwArANb/cP8C/5j+gv6C/oP+g/6D/gr/sf9fAAMB',
          'ewF7AXoBegF6AVsB8ACEACEAz/+P/17/OP8a/wD/6/7c/tj+5P4E/zj/f//T/ysAfgDFAPoAGgElASEBEgH9AOMAxQCgAHAAMQDi/4L/Gf+y/pL+kv6S/pP+',
          'k/4E/6H/SADnAGsBawFrAWsBagFXAfIAigAqANr/mv9p/0T/J/8O//j+6f7k/u3+Cv86/3z/zP8fAHEAtgDrAAsBGQEWAQkB9QDcAMAAngByADcA7f+S/y7/',
          'yv6h/qH+of6i/qL+//6T/zMAzgBPAVwBXAFcAVsBUwH0AI8AMgDj/6T/dP9Q/zP/Gv8F//b+7/73/hD/PP96/8X/FQBjAKgA3AD+AA0BDAEAAe0A1gC8AJwA',
          'cgA8APb/of9C/+H+r/6w/rD+sP6w/vv+hv8fALUANQFOAU4BTQFNAU0B9ACUADkA7P+u/37/Wv8+/yb/Ev8C//v+AP8W/z7/eP+//wsAVwCaAM4A8QABAQIB',
          '9wDmANAAtwCZAHMAQAD//6//VP/3/r3+vf6+/r7+vv74/nv/DQCeABwBQAFAAUABPwE/AfUAmABAAPX/t/+I/2X/Sf8y/x7/Dv8G/wn/HP9B/3b/uf8CAEwA',
          'jQDBAOQA9QD3AO4A3gDKALIAlgBzAEMABgC8/2b/DP/K/sv+y/7L/sv+9v5x//3/iAAEATMBMwEyATIBMgH0AJwARwD9/8D/kv9v/1P/PP8p/xn/Ef8S/yP/',
          'RP92/7T/+/9BAIEAtADYAOoA7gDmANcAxACuAJMAcgBGAA0Ax/92/yD/1/7X/tj+2P7Y/vX+af/u/3QA7QAmASYBJgEmASUB9ACfAE0ABADJ/5v/eP9d/0f/',
          'NP8k/xv/G/8p/0f/df+w//P/NgB1AKgAzADfAOQA3gDQAL4AqQCRAHIASQAUANL/hf8y/+X+5P7k/uT+5P72/mH/4P9hANcAGgEaARoBGQEZAfIAogBSAAsA',
          '0f+j/4H/Zv9R/z7/L/8l/yT/MP9L/3X/rf/s/y0AagCcAMAA1QDbANYAyQC4AKUAjQBxAEsAGQDc/5P/RP/4/u/+8P7w/vD+9/5b/9P/TwDCAA8BDgEOAQ4B',
          'DgHxAKQAVwASANn/rP+K/2//Wv9I/zn/L/8t/zf/T/92/6r/5v8kAF8AkQC1AMoA0gDOAMIAswCgAIoAcABMAB4A5f+f/1T/C//7/vv++/77/vv+Vv/H/z4A',
          'rwADAQMBAwEDAQMB7wCmAFwAGADg/7P/kv94/2P/Uv9D/zj/Nf89/1P/dv+n/+D/HABVAIYAqgDAAMkAxgC8AK0AnACHAG4ATgAjAO3/q/9k/x3/Bf8G/wb/',
          'Bv8G/1H/vP8vAJwA9wD5APgA+AD4AOwApwBgAB4A5/+7/5n/gP9s/1v/TP9B/z3/RP9X/3j/pf/b/xQATAB8AKAAtwDAAL8AtgCoAJcAhABtAE4AJgD0/7b/',
          'cv8t/xD/EP8Q/xD/Ef9O/7P/IACKAOQA7gDuAO4A7gDqAKgAYwAjAO7/wv+h/4j/dP9j/1X/Sv9G/0r/W/95/6P/1v8NAEMAcgCWAK0AuAC3AK8AogCTAIEA',
          'awBPACoA+//B/3//Pf8a/xr/Gv8a/xr/S/+q/xMAegDSAOQA5ADkAOQA5ACpAGcAKAD0/8n/qP+P/3z/a/9d/1L/Tf9R/1//e/+i/9L/BgA6AGkAjQCkALAA',
          'sACpAJ0AjwB+AGkATwAsAAAAyv+M/0z/I/8j/yP/JP8k/0r/o/8GAGoAwQDbANsA2wDaANoAqQBqAC0A+v/P/6//lv+D/3P/Zf9b/1X/V/9k/33/of/P/wAA',
          'MgBgAIMAmwCoAKkAowCYAIoAegBnAE8ALwAFANP/mP9b/yz/LP8t/y3/Lf9I/5z//P9bALAA0gDSANIA0QDRAKkAbAAyAP//1f+1/53/iv97/23/Yv9c/13/',
          'aP9//6H/y//7/ysAVwB7AJMAoACjAJ0AkwCGAHcAZQBPADEACgDb/6P/aP81/zX/Nf81/zb/SP+X//L/TQCgAMkAyQDJAMkAyQCoAG4ANgADANv/u/+j/5H/',
          'gv91/2r/Y/9k/23/gf+g/8n/9v8kAE8AcgCLAJgAnACYAI8AggB0AGMATgAyAA4A4v+t/3X/P/89/z7/Pv8+/0j/kv/o/0AAkQDBAMEAwQDBAMAApwBwADkA',
          'CADh/8H/qv+X/4n/fP9x/2r/av9x/4T/oP/G//L/HgBHAGoAgwCRAJYAkgCKAH4AcQBhAE0ANAASAOj/tv+B/03/Rf9G/0b/Rv9J/43/3/80AIMAuQC5ALkA',
          'uQC4AKYAcQA9AA0A5v/H/6//nv+P/4L/eP9x/3D/dv+G/6H/xP/t/xgAQABiAHsAigCPAI0AhQB6AG4AXwBNADUAFQDv/7//jP9Z/03/Tf9N/07/Tv+K/9f/',
          'KQB2ALEAsQCxALEAsQCkAHMAQAARAOv/zP+1/6P/lf+J/3//d/91/3v/if+h/8L/6f8SADkAWwB0AIMAiQCIAIEAdwBrAF0ATAA2ABgA9P/H/5b/Zv9V/1X/',
          'Vf9V/1X/h//Q/x4AaQCnAKoAqgCqAKoAowBzAEMAFQDw/9H/uv+p/5v/j/+F/37/e/9//4z/ov/B/+b/DQAzAFQAbQB9AIMAggB8AHMAaABbAEsANgAbAPn/',
          'z/+g/3H/XP9c/1z/XP9c/4X/yv8UAF0AmwCjAKMAowCjAKEAdABFABkA9P/W/7//rv+h/5X/i/+E/4D/hP+P/6P/wP/j/wgALQBNAGYAdgB+AH0AeABvAGUA',
          'WABJADYAHQD9/9b/qf98/2L/Y/9j/2P/Y/+D/8T/CwBSAI4AnACcAJwAnACcAHQARwAcAPn/2//E/7P/pv+b/5H/if+G/4j/kv+k/7//4P8DACcARwBgAHAA',
          'eAB5AHQAbABiAFYASAA2AB8AAADc/7L/hv9p/2n/af9p/2n/gv+//wMARwCCAJYAlgCWAJUAlQB0AEkAIAD9/9//yf+4/6v/oP+W/4//i/+M/5X/pv++/97/',
          'AAAiAEEAWQBqAHIAdABwAGgAXwBUAEcANgAhAAQA4v+6/5D/b/9v/2//cP9w/4H/uv/8/z0AdwCQAJAAjwCPAI8AdABLACMAAADk/83/vf+w/6X/nP+U/5D/',
          'kf+Y/6f/vv/b//z/HQA7AFMAZABtAG8AbABlAFwAUgBFADYAIgAHAOf/wf+Z/3X/df91/3X/dv+B/7f/9f8zAGwAigCKAIkAiQCJAHQATAAlAAMA6P/S/8H/',
          'tP+q/6H/mv+V/5X/m/+p/77/2f/5/xgANQBOAF8AaABrAGgAYgBZAE8ARAA2ACMACgDs/8j/ov99/3v/e/97/3v/gf+z/+7/KgBiAIQAhACEAIQAhABzAE0A',
          'KAAGAOv/1v/F/7n/r/+m/57/mv+Z/57/q/++/9j/9v8TADAASABZAGMAZgBkAF4AVwBNAEMANQAkAA0A8f/P/6r/hv+A/4H/gf+B/4L/sP/o/yIAWQB/AH4A',
          'fgB+AH4AcgBOACoACQDv/9r/yf+9/7P/qv+j/57/nf+i/63/vv/X//P/DwArAEMAVABeAGIAYABbAFQASwBBADUAJAAPAPX/1f+x/4//hv+G/4b/hv+G/67/',
          '4/8aAE8AeQB5AHkAeQB5AHEATwAsAAwA8v/d/83/wf+3/6//qP+j/6H/pf+u/7//1f/w/wsAJwA+AE8AWgBeAF0AWABRAEkAQAA0ACUAEQD5/9r/uP+X/4v/',
          'i/+L/4v/i/+s/97/EwBHAHIAdAB0AHQAdABwAFAALgAPAPb/4f/R/8X/u/+z/6z/p/+l/6j/sP+//9T/7v8IACIAOQBKAFUAWgBZAFUATwBHAD4AMwAlABMA',
          '/P/f/7//n/+Q/5D/kP+Q/5D/q//a/wwAPgBpAG8AbwBvAG8AbwBQADAAEgD5/+T/1P/I/7//t/+w/6v/qf+r/7L/wP/U/+z/BQAeADQARQBRAFYAVgBSAEwA',
          'RQA9ADIAJQAUAP//5P/F/6b/lP+U/5T/lf+V/6r/1v8GADcAYABrAGsAawBrAGoAUAAxABQA/P/n/9j/zP/D/7v/tP+v/63/rv+1/8H/0//q/wEAGgAwAEEA',
          'TABSAFIATwBKAEMAOwAyACUAFQABAOj/y/+t/5n/mf+Z/5n/mf+p/9P/AQAvAFgAZgBmAGYAZgBmAFAAMwAWAP7/6v/b/8//xv+//7j/s/+w/7H/t//C/9P/',
          '6P8AABYALAA9AEgATgBPAEwARwBBADkAMQAlABYAAwDs/9H/tP+d/53/nf+d/53/qf/Q//z/KABRAGIAYgBiAGIAYgBQADQAGAAAAO3/3v/S/8n/wv+8/7f/',
          'tP+0/7n/w//T/+f//f8TACgAOQBEAEsATABKAEUAPwA4ADAAJQAXAAUA8P/W/7r/of+h/6H/of+h/6n/zf/4/yIASQBeAF4AXgBeAF4AUAA1ABoAAgDw/+H/',
          '1f/N/8X/v/+6/7f/t/+7/8T/0//l//v/EAAkADUAQABHAEkARwBDAD0ANgAvACUAGAAHAPP/2//A/6f/pf+l/6X/pf+p/8v/8/8cAEIAWgBaAFoAWgBaAE8A',
          'NQAcAAUA8v/j/9j/0P/J/8L/vf+6/7r/vf/F/9P/5P/5/w0AIAAxAD0ARABGAEQAQQA7ADUALgAlABkACQD2/9//xv+t/6n/qf+p/6n/qf/J/+//FgA8AFcA',
          'VgBWAFYAVgBPADYAHQAHAPX/5v/b/9L/zP/G/8H/vf+8/7//x//T/+P/9/8KAB0ALQA5AEAAQwBCAD4AOQAzAC0AJAAZAAsA+f/j/8v/s/+s/63/rf+t/63/',
          'x//r/xEANQBTAFMAUwBTAFMATgA3AB8ACQD3/+n/3v/V/87/yf/E/8D/v//C/8j/0//j//X/BwAaACoANgA9AEAAPwA8ADgAMgAsACQAGQAMAPz/5//Q/7n/',
          'sP+w/7D/sP+w/8b/6P8MADAATQBPAE8ATwBPAE0ANwAgAAsA+f/r/+D/2P/R/8z/x//D/8L/xP/J/9T/4v/z/wUAFwAmADIAOgA9AD0AOgA2ADEAKgAjABoA',
          'DQD+/+r/1P++/7P/s/+z/7P/s//F/+X/CAAqAEcATABMAEwATABMADcAIQAMAPv/7f/i/9r/1P/O/8r/xv/E/8b/y//U/+L/8v8DABQAIwAvADcAOwA7ADgA',
          'NAAvACkAIwAaAA4AAADt/9n/w/+2/7b/t/+3/7f/xP/j/wMAJQBBAEkASQBJAEkASQA3ACIADgD9/+//5f/d/9b/0f/M/8n/x//I/8z/1f/h//H/AAARACAA',
          'LAA0ADgAOAA2ADIALgAoACIAGgAPAAEA8P/d/8j/uf+5/7r/uv+6/8T/4P8=',
        ].join(''),
        volume: 0.65,
      },
    };

    const audioState = {
      context: null,
      masterVolume: 0.8,
      musicVolume: 0.6,
      effectsVolume: 0.85,
      registry: [],
      effects: {},
      ready: false,
      initialized: false,
      loadingSamples: false,
      staticEffectsRegistered: false,
      lastHarvestAt: 0,
      lastFootstepAt: 0,
      lastZombieGroanAt: 0,
    };

    const accessibilityState = {
      colorBlindAssist: false,
      subtitlesEnabled: false,
    };

    let subtitleHideTimer = null;
    let lastSubtitleMessage = '';

    function clampVolume(value) {
      if (!Number.isFinite(value)) return 0;
      return Math.min(1, Math.max(0, value));
    }

    function formatVolumePercent(value) {
      return `${Math.round(clampVolume(value) * 100)}%`;
    }

    function updateVolumeLabels() {
      Object.entries(settingsVolumeLabels).forEach(([key, label]) => {
        if (!label) return;
        const stateKey = `${key}Volume`;
        label.textContent = formatVolumePercent(audioState[stateKey]);
      });
    }

    function persistAudioSettings() {
      try {
        if (!window.localStorage) return;
        const payload = {
          master: audioState.masterVolume,
          music: audioState.musicVolume,
          effects: audioState.effectsVolume,
        };
        window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('Unable to persist audio settings.', error);
      }
    }

    function loadStoredAudioSettings() {
      try {
        if (!window.localStorage) return;
        const raw = window.localStorage.getItem(AUDIO_SETTINGS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed.master === 'number') {
          audioState.masterVolume = clampVolume(parsed.master);
        }
        if (typeof parsed.music === 'number') {
          audioState.musicVolume = clampVolume(parsed.music);
        }
        if (typeof parsed.effects === 'number') {
          audioState.effectsVolume = clampVolume(parsed.effects);
        }
      } catch (error) {
        console.warn('Unable to load stored audio settings.', error);
      }
    }

    function applyAudioSettingsToInputs() {
      Object.entries(settingsVolumeInputs).forEach(([key, input]) => {
        if (!input) return;
        const stateKey = `${key}Volume`;
        const value = clampVolume(audioState[stateKey]);
        input.value = Math.round(value * 100);
      });
    }

    function updateHowlVolumeEntry(entry) {
      if (!entry?.howl) return;
      const channelVolume = entry.channel === 'music' ? audioState.musicVolume : audioState.effectsVolume;
      entry.howl.volume(audioState.masterVolume * channelVolume * entry.baseVolume);
    }

    function refreshHowlVolumes() {
      audioState.registry.forEach((entry) => updateHowlVolumeEntry(entry));
    }

    function registerHowl(options, channel = 'effects', baseVolume = 1) {
      if (typeof window.Howl !== 'function') return null;
      const howl = new window.Howl({ ...options, volume: 0 });
      const entry = { howl, channel, baseVolume };
      audioState.registry.push(entry);
      updateHowlVolumeEntry(entry);
      return howl;
    }

    function registerStaticAudioEffects() {
      if (audioState.staticEffectsRegistered) return;
      if (typeof window.Howl !== 'function') return;
      let registeredAny = false;
      Object.entries(STATIC_EFFECT_SOURCES).forEach(([key, descriptor]) => {
        if (audioState.effects[key]) return;
        const howl = registerHowl({ src: [descriptor.src], preload: true }, 'effects', descriptor.volume);
        if (howl) {
          audioState.effects[key] = howl;
          registeredAny = true;
        }
      });
      if (registeredAny) {
        audioState.staticEffectsRegistered = true;
      }
    }

    function handleVolumeChange(channel, normalizedValue) {
      const clamped = clampVolume(normalizedValue);
      if (channel === 'master') {
        audioState.masterVolume = clamped;
      } else if (channel === 'music') {
        audioState.musicVolume = clamped;
      } else {
        audioState.effectsVolume = clamped;
      }
      updateVolumeLabels();
      refreshHowlVolumes();
      persistAudioSettings();
    }

    function initializeAudioControls() {
      loadStoredAudioSettings();
      applyAudioSettingsToInputs();
      updateVolumeLabels();
      Object.entries(settingsVolumeInputs).forEach(([channel, input]) => {
        if (!input) return;
        input.addEventListener('input', (event) => {
          const value = Number(event.target.value) / 100;
          handleVolumeChange(channel, value);
        });
      });
      initializeAudioEngine();
    }

    function applyAccessibilitySettingsToInputs() {
      if (colorBlindToggle) {
        colorBlindToggle.checked = accessibilityState.colorBlindAssist;
      }
      if (subtitleToggle) {
        subtitleToggle.checked = accessibilityState.subtitlesEnabled;
      }
    }

    function applyAccessibilityClasses() {
      document.body.classList.toggle('colorblind-assist', accessibilityState.colorBlindAssist);
      document.body.classList.toggle('subtitles-enabled', accessibilityState.subtitlesEnabled);
      if (!accessibilityState.subtitlesEnabled) {
        hideSubtitle(true);
      } else if (lastSubtitleMessage) {
        showSubtitle(lastSubtitleMessage);
      }
    }

    function persistAccessibilitySettings() {
      try {
        if (!window.localStorage) return;
        const payload = {
          colorBlindAssist: Boolean(accessibilityState.colorBlindAssist),
          subtitlesEnabled: Boolean(accessibilityState.subtitlesEnabled),
        };
        window.localStorage.setItem(ACCESSIBILITY_SETTINGS_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('Unable to persist accessibility settings.', error);
      }
    }

    function loadStoredAccessibilitySettings() {
      try {
        if (!window.localStorage) return;
        const raw = window.localStorage.getItem(ACCESSIBILITY_SETTINGS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed.colorBlindAssist === 'boolean') {
          accessibilityState.colorBlindAssist = parsed.colorBlindAssist;
        }
        if (typeof parsed.subtitlesEnabled === 'boolean') {
          accessibilityState.subtitlesEnabled = parsed.subtitlesEnabled;
        }
      } catch (error) {
        console.warn('Unable to load stored accessibility settings.', error);
      }
    }

    function hideSubtitle(immediate = false) {
      if (!subtitleOverlay) return;
      if (subtitleHideTimer) {
        window.clearTimeout(subtitleHideTimer);
        subtitleHideTimer = null;
      }
      subtitleOverlay.removeAttribute('data-visible');
      const finalize = () => {
        subtitleOverlay.hidden = true;
      };
      if (immediate) {
        finalize();
        return;
      }
      window.setTimeout(() => {
        if (!subtitleOverlay.hasAttribute('data-visible')) {
          finalize();
        }
      }, 220);
    }

    function showSubtitle(message) {
      if (!subtitleOverlay || !accessibilityState.subtitlesEnabled) return;
      subtitleOverlay.textContent = message;
      subtitleOverlay.hidden = false;
      subtitleOverlay.setAttribute('data-visible', 'true');
      if (subtitleHideTimer) {
        window.clearTimeout(subtitleHideTimer);
      }
      subtitleHideTimer = window.setTimeout(() => {
        subtitleHideTimer = null;
        hideSubtitle();
      }, 6000);
    }

    function handleSubtitleFromLog(message) {
      lastSubtitleMessage = message;
      if (accessibilityState.subtitlesEnabled) {
        showSubtitle(message);
      }
    }

    function initializeAccessibilityControls() {
      loadStoredAccessibilitySettings();
      applyAccessibilitySettingsToInputs();
      applyAccessibilityClasses();
      colorBlindToggle?.addEventListener('change', (event) => {
        accessibilityState.colorBlindAssist = event.target.checked;
        applyAccessibilityClasses();
        persistAccessibilitySettings();
      });
      subtitleToggle?.addEventListener('change', (event) => {
        accessibilityState.subtitlesEnabled = event.target.checked;
        persistAccessibilitySettings();
        applyAccessibilityClasses();
      });
    }

    function getEmbeddedAudioSamples() {
      if (!EMBEDDED_ASSETS?.audioSamples) return null;
      try {
        return JSON.parse(JSON.stringify(EMBEDDED_ASSETS.audioSamples));
      } catch (error) {
        console.warn('Unable to clone embedded audio samples.', error);
        return null;
      }
    }

    function shouldPreferEmbeddedAudio() {
      if (!EMBEDDED_ASSETS?.audioSamples) return false;
      if (typeof window === 'undefined' || !window.location) return false;
      return window.location.protocol === 'file:';
    }

    async function initializeAudioEngine() {
      registerStaticAudioEffects();
      if (audioState.initialized || audioState.loadingSamples) {
        refreshHowlVolumes();
        return;
      }
      if (typeof window.Howl !== 'function') {
        console.info('Howler.js is unavailable. Audio cues will fall back to basic tones.');
        return;
      }
      audioState.loadingSamples = true;
      try {
        registerStaticAudioEffects();
        let samples = null;
        if (shouldPreferEmbeddedAudio()) {
          samples = getEmbeddedAudioSamples();
        } else {
          try {
            const response = await fetch(AUDIO_SAMPLE_URL, { cache: 'no-cache' });
            if (!response.ok) {
              throw new Error(`Failed to load audio samples: ${response.status}`);
            }
            samples = await response.json();
          } catch (networkError) {
            const embeddedSamples = getEmbeddedAudioSamples();
            if (embeddedSamples) {
              console.info('Falling back to embedded audio samples after fetch failure.', networkError);
              samples = embeddedSamples;
            } else {
              throw networkError;
            }
          }
        }
        if (!samples) {
          throw new Error('Audio samples unavailable.');
        }
        const miningSources = [samples?.miningA, samples?.miningB]
          .filter((value) => typeof value === 'string' && value.length > 0)
          .map((value) => `data:audio/wav;base64,${value}`);
        audioState.effects.mining = miningSources
          .map((src) => registerHowl({ src: [src], preload: true }, 'effects', 0.9))
          .filter(Boolean);
        if (typeof samples?.crunch === 'string' && samples.crunch.length > 0) {
          audioState.effects.crunch = registerHowl(
            { src: [`data:audio/wav;base64,${samples.crunch}`], preload: true },
            'effects',
            0.92,
          );
        }
        if (typeof samples?.bubble === 'string' && samples.bubble.length > 0) {
          audioState.effects.bubble = registerHowl(
            { src: [`data:audio/wav;base64,${samples.bubble}`], preload: true },
            'effects',
            0.7,
          );
        }
        if (typeof samples?.victoryCheer === 'string' && samples.victoryCheer.length > 0) {
          audioState.effects.victoryCheer = registerHowl(
            { src: [`data:audio/wav;base64,${samples.victoryCheer}`], preload: true, loop: true },
            'effects',
            0.75,
          );
        }
        audioState.initialized = true;
        audioState.ready = true;
        refreshHowlVolumes();
      } catch (error) {
        console.warn('Unable to initialise audio engine.', error);
      } finally {
        audioState.loadingSamples = false;
      }
    }

    function playHowlInstance(howl) {
      if (!howl) return;
      try {
        if (window.Howler?.ctx?.state === 'suspended') {
          window.Howler.ctx.resume().catch(() => {});
        }
        howl.play();
      } catch (error) {
        console.warn('Unable to play Howler effect.', error);
      }
    }

    function playFallbackEffect({ startFreq, endFreq, duration, type = 'triangle', peak = 0.2 }) {
      const context = ensureAudioContext();
      if (!context) return;
      if (context.state === 'suspended') {
        context.resume().catch(() => {});
      }
      const now = context.currentTime;
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(Math.max(20, startFreq), now);
        if (endFreq && endFreq !== startFreq) {
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
        }
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + Math.min(0.05, duration * 0.35));
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.05);
      } catch (error) {
        console.warn('Unable to play fallback effect.', error);
      }
    }

    function playHarvestAudio(resourceId) {
      if (typeof state?.elapsed === 'number') {
        if (state.elapsed - audioState.lastHarvestAt < 0.12) {
          return;
        }
        audioState.lastHarvestAt = state.elapsed;
      }
      const isCrunch = CRUNCH_RESOURCES.has(resourceId);
      if (isCrunch && audioState.effects?.crunch) {
        playHowlInstance(audioState.effects.crunch);
        return;
      }
      if (!isCrunch && Array.isArray(audioState.effects?.mining) && audioState.effects.mining.length > 0) {
        const index = Math.floor(Math.random() * audioState.effects.mining.length);
        const howl = audioState.effects.mining[index];
        playHowlInstance(howl);
        return;
      }
      if (isCrunch) {
        const base = 180 + Math.random() * 40;
        playFallbackEffect({ startFreq: base, endFreq: base * 0.55, duration: 0.22, type: 'square', peak: 0.18 });
      } else {
        const base = 320 + Math.random() * 60;
        playFallbackEffect({ startFreq: base, endFreq: base * 0.45, duration: 0.2, type: 'sawtooth', peak: 0.2 });
      }
    }

    function playFootstepSound() {
      if (typeof state?.elapsed === 'number') {
        if (state.elapsed - audioState.lastFootstepAt < 0.16) {
          return;
        }
        audioState.lastFootstepAt = state.elapsed;
      }
      if (audioState.effects?.footstep) {
        playHowlInstance(audioState.effects.footstep);
        return;
      }
      const base = 140 + Math.random() * 30;
      playFallbackEffect({ startFreq: base, endFreq: base * 0.55, duration: 0.16, type: 'square', peak: 0.12 });
    }

    function playZombieGroan() {
      if (typeof state?.elapsed === 'number') {
        if (state.elapsed - audioState.lastZombieGroanAt < 0.45) {
          return;
        }
        audioState.lastZombieGroanAt = state.elapsed;
      }
      if (audioState.effects?.zombieGroan) {
        playHowlInstance(audioState.effects.zombieGroan);
        return;
      }
      const base = 90 + Math.random() * 20;
      playFallbackEffect({ startFreq: base, endFreq: base * 0.35, duration: 0.5, type: 'sawtooth', peak: 0.2 });
    }

    function playCraftSuccessChime() {
      if (audioState.effects?.craftChime) {
        playHowlInstance(audioState.effects.craftChime);
        return;
      }
      const base = 780 + Math.random() * 120;
      playFallbackEffect({ startFreq: base, endFreq: base * 1.1, duration: 0.32, type: 'triangle', peak: 0.16 });
    }

    const MAX_CRAFT_SLOTS = 7;
    const craftSlots = [];
    let craftConfettiTimer = null;
    let victoryConfettiInterval = null;
    let victoryFireworksInterval = null;
    const victoryFireworkTimeouts = new Set();
    let victoryCheerFallbackInterval = null;
    const victoryCheerFallbackTimeouts = new Set();
    let victoryHideTimeout = null;
    let previousVictoryFocus = null;
    let latestVictoryShareDetails = null;
    let craftingDragGhost = null;
    let craftingDragTrailEl = null;
    let activeHotbarDrag = null;
    let activeInventoryDrag = null;
    let dragFallbackSlotIndex = null;
    let craftSequenceErrorTimeout = null;
    let playerMineAudioTimeout = null;
    const inventoryClickBypass = new WeakSet();

    let eventListenersBound = false;
    let virtualJoystickReady = false;

    let renderer;
    const renderClock = new THREE.Clock();
    let scene;
    let camera;
    let worldGroup;
    let worldTilesRoot;
    let environmentGroup;
    const voxelIslandAssets = {
      mesh: null,
      geometry: null,
      material: null,
      texture: null,
      instancingFallbackNotified: false,
      voxelBudget: 0,
      voxelUsage: 0,
      voxelCount: 0,
      columnsTrimmed: 0,
    };
    const voxelIslandDummy = new THREE.Object3D();
    let entityGroup;
    let particleGroup;
    let playerMesh;
    let playerMeshParts;
    let playerSessionToken = 0;
    let activePlayerSessionId = 0;
    let playerMeshSessionId = 0;
    let playerModelLoading = false;
    let playerActionAnimation = null;
    let gltfLoader;
    let playerMixer = null;
    const playerAnimationActions = {};
    const playerAnimationBlend = { idle: 1, walk: 0 };
    let tileRenderState = [];
    const tileUpdateQueue = new Set();
    const animatedTileRenderInfos = new Set();
    let fullWorldRefreshPending = false;
    const zombieMeshes = [];
    const ironGolemMeshes = [];
    let zombieModelTemplate = null;
    let zombieModelPromise = null;
    let ironGolemModelTemplate = null;
    let ironGolemModelPromise = null;
    const combatUtils =
      (typeof window !== 'undefined' && window.CombatUtils) ||
      (typeof globalThis !== 'undefined' && globalThis.CombatUtils) ||
      COMBAT_UTILS_FALLBACK;
    let gridPathfinder = null;
    let zombieIdCounter = 0;
    let hemiLight;
    let sunLight;
    let moonLight;
    let torchLight;
    let ambientLight;
    let rimLight;
    let playerKeyLight;
    let playerLocator;
    let playerHintTimer = null;
    const visualFallbackNotices = new Set();
    let lastDimensionHintKey = null;

    let previewGroup;
    let previewCamera;
    let previewAnimationFrame = null;
    let previewHandModel = null;
    let previewHandTemplate = null;
    let previewHandPromise = null;
    const PREVIEW_VIEW_SIZE = 3.8;
    const PREVIEW_MOUSE_SENSITIVITY = 0.0032;
    const PREVIEW_TOUCH_SENSITIVITY = 0.0052;
    const PREVIEW_KEY_YAW_DELTA = THREE.MathUtils.degToRad(6);
    const PREVIEW_MAX_YAW = THREE.MathUtils.degToRad(60);
    const PREVIEW_MAX_PITCH = THREE.MathUtils.degToRad(50);
    const PREVIEW_ISLAND_SIZE = 20;
    const PREVIEW_BLOCK_SIZE = 1;
    const PREVIEW_BOB_HEIGHT = 0.08;
    const PREVIEW_PLAYER_EYE_HEIGHT = 1.6;
    const PREVIEW_PLAYER_STAND_OFFSET = 2.6;
    const PREVIEW_LOOK_DISTANCE = 8;
    const PREVIEW_DAY_LENGTH = 20000;
    const PREVIEW_FOV = 75;

    const previewState = {
      active: false,
      yaw: 0,
      pitch: -0.12,
      frameTimes: [],
      lastTimestamp: null,
      wireframe: false,
      seed: 0,
      spawnHeight: 0,
    };

    const previewAssets = {
      textures: {},
      materials: {},
    };

    const previewPlayerPosition = new THREE.Vector3(0, PREVIEW_PLAYER_EYE_HEIGHT, PREVIEW_PLAYER_STAND_OFFSET);
    const tmpPreviewForward = new THREE.Vector3(0, 0, -1);
    const tmpPreviewTarget = new THREE.Vector3();
    const previewHandOffset = new THREE.Vector3(0.32, -0.42, -0.65);
    const previewInteractiveTrees = new Set();
    const previewInteractiveMeshes = new Set();
    const previewTreeBursts = [];
    const previewLootDrops = [];
    const previewRaycaster = new THREE.Raycaster();
    const previewRayPointer = new THREE.Vector2(0, 0);
    const tmpPreviewTreePosition = new THREE.Vector3();
    let previewInteractionCleanup = null;

    function getNowMs() {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    function normalizeDirectionVector(direction) {
      if (!direction) return { x: 0, y: 1 };
      const dx = Number.isFinite(direction.x) ? direction.x : 0;
      const dy = Number.isFinite(direction.y) ? direction.y : 0;
      const length = Math.hypot(dx, dy);
      if (length === 0) {
        return { x: 0, y: 1 };
      }
      return { x: dx / length, y: dy / length };
    }

    function getDayNightMetrics(elapsedOverride) {
      const dayLength = state.dayLength > 0 ? state.dayLength : 1;
      const ratio = dayLength > 0 ? ((elapsedOverride ?? state.elapsed) % dayLength) / dayLength : 0;
      const clampedDayPortion = THREE.MathUtils.clamp(DAY_PORTION, 0.05, 0.95);
      const clampedNightPortion = Math.max(1 - clampedDayPortion, 0.05);
      const isNight = ratio >= clampedDayPortion;
      const safeDayPortion = clampedDayPortion || 1;
      const safeNightPortion = clampedNightPortion || 1;
      const dayProgress = isNight ? 1 : THREE.MathUtils.clamp(ratio / safeDayPortion, 0, 1);
      const nightProgress = isNight
        ? THREE.MathUtils.clamp((ratio - clampedDayPortion) / safeNightPortion, 0, 1)
        : 0;
      return {
        ratio,
        isNight,
        dayProgress,
        nightProgress,
        dayPortion: clampedDayPortion,
        nightPortion: clampedNightPortion,
      };
    }

    function triggerPlayerActionAnimation(type, options = {}) {
      playerActionAnimation = {
        type,
        start: getNowMs(),
        duration: options.duration ?? 520,
        direction: normalizeDirectionVector(options.direction),
        strength: THREE.MathUtils.clamp(options.strength ?? 1, 0, 2),
      };
      if (type === 'mine') {
        startPlayerMineAnimation(playerActionAnimation);
        if (playerMineAudioTimeout) {
          window.clearTimeout(playerMineAudioTimeout);
          playerMineAudioTimeout = null;
        }
        const resourceId = options.audioResourceId;
        const shouldPlayAudio = options.skipAudio !== true && typeof resourceId === 'string' && resourceId.length > 0;
        if (shouldPlayAudio) {
          const delay = Number.isFinite(options.audioDelayMs) ? Math.max(0, options.audioDelayMs) : 120;
          playerMineAudioTimeout = window.setTimeout(() => {
            playHarvestAudio(resourceId);
            playerMineAudioTimeout = null;
          }, delay);
        }
      }
    }

    function triggerGolemPunchAnimation(golem, options = {}) {
      if (!golem) return;
      const direction = normalizeDirectionVector(options.direction ?? golem.facing);
      const duration = options.duration ?? 620;
      const strength = THREE.MathUtils.clamp(options.strength ?? 1, 0.2, 2);
      golem.attackAnimation = {
        type: 'punch',
        start: getNowMs(),
        duration,
        direction,
        strength,
      };
    }

    playerHintEl?.addEventListener('click', hidePlayerHint);
    playerHintEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        hidePlayerHint();
      }
    });

    dismissBriefingButton?.addEventListener('click', () => {
      if (state?.ui) {
        state.ui.briefingAcknowledged = true;
      }
      hideGameBriefing();
      canvas?.focus();
    });

    const CAMERA_EYE_OFFSET = 1.6;
    const CAMERA_FORWARD_OFFSET = 3.6;
    const CAMERA_LOOK_DISTANCE = 6.5;
    const CAMERA_FRUSTUM_HEIGHT = 9.2;
    const CAMERA_BASE_ZOOM = 1.18;
    const CAMERA_MAX_YAW_OFFSET = THREE.MathUtils.degToRad(45);
    const CAMERA_MOUSE_SENSITIVITY = 0.0032;
    const CAMERA_TOUCH_SENSITIVITY = 0.0055;
    const CAMERA_DRAG_SUPPRESS_THRESHOLD = 5;
    const WORLD_UP = new THREE.Vector3(0, 1, 0);
    const CAMERA_VERTICAL_OFFSET = 0;
    const CAMERA_PERSPECTIVE_SETTINGS = {
      third: {
        eyeOffset: CAMERA_EYE_OFFSET,
        forwardOffset: CAMERA_FORWARD_OFFSET,
        verticalOffset: CAMERA_VERTICAL_OFFSET,
        lookDistance: CAMERA_LOOK_DISTANCE,
        zoom: CAMERA_BASE_ZOOM,
      },
      first: {
        eyeOffset: CAMERA_EYE_OFFSET - 0.18,
        forwardOffset: 0.6,
        verticalOffset: CAMERA_VERTICAL_OFFSET,
        lookDistance: CAMERA_LOOK_DISTANCE * 0.75,
        zoom: CAMERA_BASE_ZOOM * 1.08,
      },
    };
    let cameraPerspective = 'third';
    function getCameraPerspectiveSettings(perspective = cameraPerspective) {
      return CAMERA_PERSPECTIVE_SETTINGS[perspective] ?? CAMERA_PERSPECTIVE_SETTINGS.third;
    }
    const cameraState = {
      lastFacing: new THREE.Vector3(0, 0, 1),
      lastPlayerFacing: new THREE.Vector3(0, 0, 1),
      yawOffset: 0,
      lastIdleBob: 0,
      lastWalkBob: 0,
      lastMovementStrength: 0,
      perspective: 'third',
    };
    const tmpCameraForward = new THREE.Vector3();
    const tmpCameraTarget = new THREE.Vector3();
    const tmpCameraRight = new THREE.Vector3();
    const MOVEMENT_CARDINAL_DIRECTIONS = [
      { dx: 0, dy: -1, vector: new THREE.Vector3(0, 0, -1) },
      { dx: 1, dy: 0, vector: new THREE.Vector3(1, 0, 0) },
      { dx: 0, dy: 1, vector: new THREE.Vector3(0, 0, 1) },
      { dx: -1, dy: 0, vector: new THREE.Vector3(-1, 0, 0) },
    ];
    const RAIL_MOVE_DELAY = 1;
    const tmpMovementForward = new THREE.Vector3();
    const tmpMovementRight = new THREE.Vector3();
    const tmpMovementVector = new THREE.Vector3();
    const tmpCullingCenter = new THREE.Vector3();
    const tmpColorA = new THREE.Color();
    const tmpColorB = new THREE.Color();
    const tmpColorC = new THREE.Color();
    const tmpColorD = new THREE.Color();
    let frameCounter = 0;
    const viewFrustumState = {
      frustum: new THREE.Frustum(),
      matrix: new THREE.Matrix4(),
      scratchSphere: new THREE.Sphere(),
    };
    let viewFrustumFrameId = -1;
    const worldCullingState = {
      islandCenter: new THREE.Vector3(0, 0, 0),
      islandRadius: 0,
    };

    function invalidateViewFrustum() {
      viewFrustumFrameId = -1;
    }

    function ensureViewFrustum() {
      if (!camera) {
        return false;
      }
      if (viewFrustumFrameId === frameCounter) {
        return true;
      }
      camera.updateMatrixWorld(true);
      viewFrustumState.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      viewFrustumState.frustum.setFromProjectionMatrix(viewFrustumState.matrix);
      viewFrustumFrameId = frameCounter;
      return true;
    }

    function isSceneSphereVisible(center, radius) {
      if (!ensureViewFrustum()) {
        return true;
      }
      const sphere = viewFrustumState.scratchSphere;
      sphere.center.copy(center);
      sphere.radius = radius;
      return viewFrustumState.frustum.intersectsSphere(sphere);
    }
    const raycastPointer = new THREE.Vector2();
    const tmpRaycastBox = new THREE.Box3();
    const hoverState = { tile: null, entity: null };
    let tileHighlightHelper = null;
    let enemyHighlightHelper = null;
    const HOVER_OUTLINE_COLORS = {
      placeable: '#3cff9a',
      interactable: '#49f2ff',
      enemy: '#ff5a7a',
    };
    let miningState = null;
    const MINING_DURATION_MS = 3000;
    const MINING_OVERLAY_SIZE = 256;
    const MINING_OVERLAY_CRACK_COUNT = 7;

    const ZOMBIE_OUTLINE_COLOR = new THREE.Color('#ff5a7a');
    const GOLEM_OUTLINE_COLOR = new THREE.Color('#58b7ff');
    const DAY_NIGHT_CYCLE_SECONDS = 10 * 60;
    const DAY_PORTION = 0.5;
    const NIGHT_PORTION = 1 - DAY_PORTION;
    const DEFAULT_DAY_START_RATIO = 0.5;
    const DEFAULT_MOVE_DELAY_SECONDS = 1;
    const ZOMBIES_PER_CHUNK = 3;
    const ZOMBIE_CHUNK_SIZE = 16;
    const ZOMBIE_SPAWN_INTERVAL = 10;
    const ZOMBIE_AGGRO_RANGE = 10;
    const MAX_CONCURRENT_ZOMBIES = 30;

    const baseMaterialCache = new Map();
    const accentMaterialCache = new Map();
    const sanitizedMaterialRefs = new WeakSet();

    const getRendererBoundLight = (material) => {
      if (!material || !renderer || typeof renderer.properties?.get !== 'function') {
        return null;
      }
      try {
        const props = renderer.properties.get(material);
        if (props && typeof props === 'object' && props.light) {
          return props.light;
        }
      } catch (error) {
        // Ignore lookup failures; absence of a bound light is handled by callers.
      }
      return null;
    };

    const restoreRendererBoundLight = (material, light) => {
      if (!light || !material || !renderer || typeof renderer.properties?.get !== 'function') {
        return;
      }
      try {
        const props = renderer.properties.get(material);
        if (props && typeof props === 'object') {
          props.light = light;
        }
      } catch (error) {
        // Ignore restoration failures; renderer will manage light bindings if possible.
      }
    };
    const textureVariantCache = new Map();
    const spriteTextureCache = new Map();
    let treeLeavesMaterial = null;

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin?.('anonymous');

    function drawBaseGrassTexture(ctx, size) {
      const gradient = ctx.createLinearGradient(0, 0, 0, size);
      gradient.addColorStop(0, '#6fd86f');
      gradient.addColorStop(1, '#2e7d32');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let i = 0; i < 320; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const w = Math.random() * 3 + 1;
        const h = Math.random() * 3 + 1;
        ctx.fillRect(x, y, w, h);
      }
      ctx.fillStyle = 'rgba(0, 60, 0, 0.12)';
      for (let i = 0; i < 220; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const w = Math.random() * 2 + 1;
        const h = Math.random() * 5 + 1;
        ctx.fillRect(x, y, w, h);
      }
    }

    function drawBaseWoodTexture(ctx, size) {
      const gradient = ctx.createLinearGradient(0, 0, size, 0);
      gradient.addColorStop(0, '#b07943');
      gradient.addColorStop(0.5, '#d2a574');
      gradient.addColorStop(1, '#81542c');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(81, 49, 23, 0.55)';
      ctx.lineWidth = 4;
      for (let i = 0; i < 6; i += 1) {
        const x = (i / 6) * size + Math.random() * 4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(64, 35, 15, 0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i += 1) {
        const y = Math.random() * size;
        const length = size * (0.25 + Math.random() * 0.45);
        ctx.beginPath();
        ctx.moveTo(Math.random() * size, y);
        ctx.lineTo(Math.random() * size, y + length);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      for (let i = 0; i < 20; i += 1) {
        const radius = Math.random() * 10 + 4;
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawBaseLeavesTexture(ctx, size) {
      ctx.clearRect(0, 0, size, size);
      for (let i = 0; i < 420; i += 1) {
        const radius = Math.random() * 8 + 6;
        const x = Math.random() * size;
        const y = Math.random() * size;
        const green = Math.floor(120 + Math.random() * 80);
        ctx.fillStyle = `rgba(34, ${green}, 34, ${0.55 + Math.random() * 0.35})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const VOXEL_ISLAND_CONFIG = {
      size: 64,
      tileSize: 1,
      radiusMultiplier: 0.48,
      minHeight: 0.65,
      maxHeight: 4.8,
      noiseScale: 0.65,
      falloffPower: 1.6,
    };

    const TERRAIN_VOXEL_CAP = VOXEL_ISLAND_CONFIG.size * VOXEL_ISLAND_CONFIG.size * 4;

    const particleSystems = [];

    const BASE_ATMOSPHERE = {
      daySky: '#9ed9ff',
      nightSky: '#0d1630',
      duskSky: '#f7c690',
      groundDay: '#76bb6f',
      groundNight: '#1c2d1a',
      fogColor: '#8ac8ff',
      fogDensity: 0.032,
    };

    const lightingState = {
      daySky: new THREE.Color(BASE_ATMOSPHERE.daySky),
      nightSky: new THREE.Color(BASE_ATMOSPHERE.nightSky),
      duskSky: new THREE.Color(BASE_ATMOSPHERE.duskSky),
      groundDay: new THREE.Color(BASE_ATMOSPHERE.groundDay),
      groundNight: new THREE.Color(BASE_ATMOSPHERE.groundNight),
      dayStrength: 1,
      nightStrength: 0,
    };

    const rimLightColors = {
      day: new THREE.Color('#7cc3ff'),
      night: new THREE.Color('#3c5fd6'),
    };

    const identityState = {
      googleProfile: null,
      displayName: null,
      location: null,
      device: null,
      scoreboard: [],
      scoreboardSource: 'remote',
      scoreboardTotal: 0,
      playerRank: null,
      loadingScores: false,
      googleInitialized: false,
      scoreboardMessage: '',
      scoreboardError: null,
    };

    const SCOREBOARD_STORAGE_KEY = 'infinite-dimension-scoreboard';
    const PROFILE_STORAGE_KEY = 'infinite-dimension-profile';
    const LOCAL_PROFILE_ID_KEY = 'infinite-dimension-local-id';
    const PROGRESS_STORAGE_KEY = 'infinite-dimension-progress';
    const SYNC_PROMPT_STORAGE_KEY = 'infinite-dimension-sync-prompt';
    const PROGRESS_AUTOSAVE_INTERVAL_SECONDS = 30;
    let pendingProgressSnapshot = null;
    let pendingProgressSource = null;

    function getBaseMaterial(color, variant = 'default') {
      const key = `${variant}|${color}`;
      if (!baseMaterialCache.has(key)) {
        const options = {
          color: new THREE.Color(color),
          roughness: 0.85,
          metalness: 0.05,
        };
        const textures = getTextureSetForVariant(variant);
        if (textures) {
          options.map = textures.map;
          options.normalMap = textures.normalMap;
          options.roughnessMap = textures.roughnessMap;
        }
        baseMaterialCache.set(key, new THREE.MeshStandardMaterial(options));
      }
      return baseMaterialCache.get(key);
    }

    function getAccentMaterial(color, opacity = 0.75) {
      const key = `${color}-${opacity}`;
      if (!accentMaterialCache.has(key)) {
        accentMaterialCache.set(
          key,
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            roughness: 0.6,
            metalness: 0.15,
            transparent: true,
            opacity,
            emissive: new THREE.Color(color).multiplyScalar(0.2),
            emissiveIntensity: 0.3,
            side: THREE.DoubleSide,
          })
        );
      }
      return accentMaterialCache.get(key);
    }

    function getTextureSetForVariant(variant) {
      if (!variant || variant === 'default') {
        return null;
      }
      if (textureVariantCache.has(variant)) {
        return textureVariantCache.get(variant);
      }
      let generator = null;
      switch (variant) {
        case 'dew':
          generator = createDewTextureSet;
          break;
        case 'grain':
          generator = createGrainTextureSet;
          break;
        case 'bark':
          generator = createBarkTextureSet;
          break;
        default:
          generator = null;
      }
      const result = generator ? generator() : null;
      textureVariantCache.set(variant, result);
      return result;
    }

    function createProceduralTextureDataUrl(size, draw) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      draw(ctx, size);
      return canvas.toDataURL('image/png');
    }

    function isCrossOriginTextureUrl(url) {
      if (!url || typeof url !== 'string') return false;
      if (url.startsWith('data:') || url.startsWith('blob:')) return false;
      if (typeof window === 'undefined' || !window.location) return false;
      try {
        const resolved = new URL(url, window.location.href);
        const protocol = resolved.protocol.toLowerCase();
        if (protocol !== 'http:' && protocol !== 'https:') {
          return false;
        }
        return resolved.origin !== window.location.origin;
      } catch (error) {
        return false;
      }
    }

    const BASE_TEXTURE_URLS = (() => {
      const size = 256;
      return {
        grass: createProceduralTextureDataUrl(size, drawBaseGrassTexture),
        wood: createProceduralTextureDataUrl(size, drawBaseWoodTexture),
        leaves: createProceduralTextureDataUrl(size, drawBaseLeavesTexture),
      };
    })();

    function applyTextureSettings(texture, options = {}) {
      const repeat = options.repeat ?? { x: 2, y: 2 };
      const anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
      texture.wrapS = options.wrapS ?? THREE.RepeatWrapping;
      texture.wrapT = options.wrapT ?? THREE.RepeatWrapping;
      if (typeof repeat === 'number') {
        texture.repeat.set(repeat, repeat);
      } else if (repeat) {
        texture.repeat.set(repeat.x ?? 1, repeat.y ?? 1);
      }
      texture.anisotropy = anisotropy;
      texture.magFilter = options.magFilter ?? THREE.LinearFilter;
      texture.minFilter = options.minFilter ?? THREE.LinearMipmapLinearFilter;
      if (options.colorSpace) {
        texture.colorSpace = options.colorSpace;
      }
      texture.needsUpdate = true;
    }

    function createTexture(url, options) {
      if (!url) {
        return null;
      }
      if (isCrossOriginTextureUrl(url)) {
        console.warn(`Skipping cross-origin texture due to CORS restrictions: ${url}`);
        return null;
      }
      let texture = null;
      try {
        texture = textureLoader.load(url, (loaded) => applyTextureSettings(loaded, options));
      } catch (error) {
        console.warn(`Failed to load texture: ${url}`, error);
        texture = null;
      }
      if (texture) {
        applyTextureSettings(texture, options);
      }
      return texture;
    }

    function clonePreviewTexture(baseTexture, options = {}) {
      if (!baseTexture) {
        return null;
      }
      const texture = baseTexture.clone();
      texture.image = baseTexture.image;
      texture.needsUpdate = true;
      texture.wrapS = options.wrapS ?? baseTexture.wrapS ?? THREE.RepeatWrapping;
      texture.wrapT = options.wrapT ?? baseTexture.wrapT ?? THREE.RepeatWrapping;
      const repeat = options.repeat;
      if (typeof repeat === 'number') {
        texture.repeat.set(repeat, repeat);
      } else if (repeat) {
        texture.repeat.set(repeat.x ?? texture.repeat.x, repeat.y ?? texture.repeat.y);
      } else if (baseTexture.repeat) {
        texture.repeat.copy(baseTexture.repeat);
      }
      texture.magFilter = options.magFilter ?? baseTexture.magFilter ?? THREE.LinearFilter;
      texture.minFilter = options.minFilter ?? baseTexture.minFilter ?? THREE.LinearMipmapLinearFilter;
      texture.colorSpace = options.colorSpace ?? baseTexture.colorSpace ?? THREE.SRGBColorSpace;
      texture.generateMipmaps = baseTexture.generateMipmaps ?? true;
      const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
      texture.anisotropy = options.anisotropy ?? baseTexture.anisotropy ?? maxAnisotropy;
      if (options.transparent || baseTexture.format === THREE.RGBAFormat) {
        texture.format = THREE.RGBAFormat;
      }
      return texture;
    }

    function addNoise(ctx, size, variance = 0.15) {
      const image = ctx.getImageData(0, 0, size, size);
      for (let i = 0; i < image.data.length; i += 4) {
        const offset = (Math.random() - 0.5) * variance * 255;
        image.data[i] = clamp(image.data[i] + offset, 0, 255);
        image.data[i + 1] = clamp(image.data[i + 1] + offset, 0, 255);
        image.data[i + 2] = clamp(image.data[i + 2] + offset, 0, 255);
      }
      ctx.putImageData(image, 0, 0);
    }

    function createDewTextureSet() {
      ensurePreviewTextures();
      const baseGrass = previewAssets.textures.grass;
      let grassTexture = clonePreviewTexture(baseGrass, { repeat: { x: 4, y: 4 } });
      const size = 256;
      if (!grassTexture) {
        const fallbackUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
          const gradient = ctx.createLinearGradient(0, 0, dimension, dimension);
          gradient.addColorStop(0, '#1d7a46');
          gradient.addColorStop(1, '#2aa35a');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, dimension, dimension);
          for (let i = 0; i < 220; i++) {
            const radius = Math.random() * 6 + 2;
            const x = Math.random() * dimension;
            const y = Math.random() * dimension;
            const droplet = ctx.createRadialGradient(x, y, 0, x, y, radius);
            droplet.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
            droplet.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = droplet;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
          }
          addNoise(ctx, dimension, 0.05);
        });
        grassTexture = createTexture(fallbackUrl, { repeat: { x: 4, y: 4 }, colorSpace: THREE.SRGBColorSpace });
      }
      const normalUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(128,128,255)';
        ctx.fillRect(0, 0, dimension, dimension);
        for (let i = 0; i < 200; i++) {
          const radius = Math.random() * 6 + 2;
          const x = Math.random() * dimension;
          const y = Math.random() * dimension;
          const highlight = ctx.createRadialGradient(x, y, 0, x, y, radius);
          highlight.addColorStop(0, 'rgb(170,200,255)');
          highlight.addColorStop(1, 'rgb(120,120,250)');
          ctx.fillStyle = highlight;
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
      });

      const roughnessUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(180, 180, 180)';
        ctx.fillRect(0, 0, dimension, dimension);
        for (let i = 0; i < 220; i++) {
          const radius = Math.random() * 6 + 2;
          const x = Math.random() * dimension;
          const y = Math.random() * dimension;
          const droplet = ctx.createRadialGradient(x, y, 0, x, y, radius);
          droplet.addColorStop(0, 'rgb(120, 120, 120)');
          droplet.addColorStop(1, 'rgb(200, 200, 200)');
          ctx.fillStyle = droplet;
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        addNoise(ctx, dimension, 0.08);
      });

      return {
        map: grassTexture,
        normalMap: createTexture(normalUrl, { repeat: { x: 4, y: 4 }, colorSpace: THREE.NoColorSpace }),
        roughnessMap: createTexture(roughnessUrl, { repeat: { x: 4, y: 4 }, colorSpace: THREE.NoColorSpace }),
      };
    }

    function createGrainTextureSet() {
      const size = 256;
      const albedoUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        const gradient = ctx.createLinearGradient(0, 0, dimension, dimension);
        gradient.addColorStop(0, '#d4b179');
        gradient.addColorStop(1, '#c59855');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 28; i++) {
          const y = (dimension / 28) * i + Math.random() * 4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(dimension, y + Math.random() * 6 - 3);
          ctx.stroke();
        }
        addNoise(ctx, dimension, 0.12);
      });

      const normalUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(128,128,255)';
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(150, 130, 255, 0.35)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 24; i++) {
          const y = (dimension / 24) * i + Math.random() * 4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(dimension, y + Math.random() * 4 - 2);
          ctx.stroke();
        }
      });

      const roughnessUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(210,210,210)';
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(90,90,90,0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 36; i++) {
          const y = (dimension / 36) * i + Math.random() * 3;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(dimension, y + Math.random() * 4 - 2);
          ctx.stroke();
        }
        addNoise(ctx, dimension, 0.1);
      });

      return {
        map: createTexture(albedoUrl, { repeat: { x: 2.2, y: 2.2 }, colorSpace: THREE.SRGBColorSpace }),
        normalMap: createTexture(normalUrl, { repeat: { x: 2.2, y: 2.2 }, colorSpace: THREE.NoColorSpace }),
        roughnessMap: createTexture(roughnessUrl, { repeat: { x: 2.2, y: 2.2 }, colorSpace: THREE.NoColorSpace }),
      };
    }

    function createBarkTextureSet() {
      ensurePreviewTextures();
      const baseWood = previewAssets.textures.wood;
      let woodTexture = clonePreviewTexture(baseWood, { repeat: { x: 1.4, y: 1.4 } });
      const size = 256;
      if (!woodTexture) {
        const fallbackUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
          const gradient = ctx.createLinearGradient(0, 0, dimension, dimension);
          gradient.addColorStop(0, '#4f3418');
          gradient.addColorStop(1, '#3a2412');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, dimension, dimension);
          ctx.strokeStyle = 'rgba(255, 210, 150, 0.22)';
          ctx.lineWidth = 4;
          for (let i = 0; i < 12; i++) {
            const x = (dimension / 12) * i + Math.random() * 6;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.bezierCurveTo(
              x + Math.random() * 10 - 5,
              dimension * 0.25,
              x + Math.random() * 10 - 5,
              dimension * 0.75,
              x + Math.random() * 8 - 4,
              dimension
            );
            ctx.stroke();
          }
          addNoise(ctx, dimension, 0.18);
        });
        woodTexture = createTexture(fallbackUrl, { repeat: { x: 1.4, y: 1.4 }, colorSpace: THREE.SRGBColorSpace });
      }
      const normalUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(128,128,255)';
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(90,70,230,0.6)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 14; i++) {
          const x = (dimension / 14) * i + Math.random() * 8;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.bezierCurveTo(
            x + Math.random() * 12 - 6,
            dimension * 0.3,
            x + Math.random() * 12 - 6,
            dimension * 0.7,
            x + Math.random() * 8 - 4,
            dimension
          );
          ctx.stroke();
        }
      });

      const roughnessUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(140,140,140)';
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(60,60,60,0.4)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 18; i++) {
          const x = (dimension / 18) * i + Math.random() * 6;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + Math.random() * 6 - 3, dimension);
          ctx.stroke();
        }
        addNoise(ctx, dimension, 0.14);
      });

      return {
        map: woodTexture,
        normalMap: createTexture(normalUrl, { repeat: { x: 1.4, y: 1.4 }, colorSpace: THREE.NoColorSpace }),
        roughnessMap: createTexture(roughnessUrl, { repeat: { x: 1.4, y: 1.4 }, colorSpace: THREE.NoColorSpace }),
      };
    }

    function getParticleTexture() {
      const key = 'harvestSpark';
      if (spriteTextureCache.has(key)) {
        return spriteTextureCache.get(key);
      }
      const size = 128;
      const dataUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.clearRect(0, 0, dimension, dimension);
        const gradient = ctx.createRadialGradient(
          dimension / 2,
          dimension / 2,
          0,
          dimension / 2,
          dimension / 2,
          dimension / 2
        );
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(dimension / 2, dimension / 2, dimension / 2, 0, Math.PI * 2);
        ctx.fill();
      });
      const texture = createTexture(dataUrl, {
        repeat: { x: 1, y: 1 },
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        colorSpace: THREE.SRGBColorSpace,
      });
      spriteTextureCache.set(key, texture);
      return texture;
    }

    function worldToScene(x, y) {
      return {
        x: (x - state.width / 2) * TILE_UNIT + TILE_UNIT / 2,
        z: (y - state.height / 2) * TILE_UNIT + TILE_UNIT / 2,
      };
    }

    function sceneToWorld(sceneX, sceneZ) {
      const gridX = (sceneX - TILE_UNIT / 2) / TILE_UNIT + state.width / 2;
      const gridY = (sceneZ - TILE_UNIT / 2) / TILE_UNIT + state.height / 2;
      return {
        x: Math.round(gridX),
        y: Math.round(gridY),
      };
    }

    function updateLayoutMetrics() {
      if (!primaryPanelEl || !mainLayoutEl) return;
      const mainStyles = getComputedStyle(mainLayoutEl);
      const paddingTop = parseFloat(mainStyles.paddingTop) || 0;
      const paddingBottom = parseFloat(mainStyles.paddingBottom) || 0;
      const headerHeight = topBarEl?.offsetHeight ?? 0;
      const footerHeight = footerEl?.offsetHeight ?? 0;
      const availableHeight = window.innerHeight - headerHeight - footerHeight - paddingTop - paddingBottom;
      if (availableHeight > 320) {
        primaryPanelEl.style.setProperty('--primary-panel-min-height', `${availableHeight}px`);
      } else {
        primaryPanelEl.style.removeProperty('--primary-panel-min-height');
      }
    }

    function syncSidebarForViewport() {
      if (!sidePanelEl) return;
      const isMobile = window.innerWidth <= 860;
        if (!isMobile) {
          if (sidePanelEl.classList.contains('open')) {
            sidePanelEl.setAttribute('aria-hidden', 'false');
            document.body.classList.add('sidebar-open');
            toggleSidebarButton?.setAttribute('aria-expanded', 'true');
            if (sidePanelScrim) sidePanelScrim.hidden = false;
          } else {
            sidePanelEl.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('sidebar-open');
            toggleSidebarButton?.setAttribute('aria-expanded', 'false');
            if (sidePanelScrim) sidePanelScrim.hidden = true;
          }
          resetHudInactivityTimer();
          return;
        }
      if (sidePanelEl.classList.contains('open')) {
        sidePanelEl.setAttribute('aria-hidden', 'false');
        if (sidePanelScrim) sidePanelScrim.hidden = false;
      } else {
        sidePanelEl.setAttribute('aria-hidden', 'true');
        if (sidePanelScrim) sidePanelScrim.hidden = true;
      }
      resetHudInactivityTimer();
    }

    function openSidebar() {
      if (!sidePanelEl) return;
      sidePanelEl.classList.add('open');
      sidePanelEl.setAttribute('aria-hidden', 'false');
      document.body.classList.add('sidebar-open');
      toggleSidebarButton?.setAttribute('aria-expanded', 'true');
      if (sidePanelScrim) sidePanelScrim.hidden = false;
      if (typeof sidePanelEl.focus === 'function') {
        sidePanelEl.focus();
      }
      resetHudInactivityTimer();
    }

    function closeSidebar(shouldFocusToggle = false) {
      if (!sidePanelEl) return;
      sidePanelEl.classList.remove('open');
      if (window.innerWidth <= 860) {
        sidePanelEl.setAttribute('aria-hidden', 'true');
      } else {
        sidePanelEl.removeAttribute('aria-hidden');
      }
      document.body.classList.remove('sidebar-open');
      toggleSidebarButton?.setAttribute('aria-expanded', 'false');
      if (sidePanelScrim) sidePanelScrim.hidden = true;
      if (shouldFocusToggle) toggleSidebarButton?.focus();
      resetHudInactivityTimer();
    }

    function toggleSidebar() {
      if (!sidePanelEl) return;
      if (sidePanelEl.classList.contains('open')) {
        closeSidebar(true);
      } else {
        openSidebar();
      }
    }

    function hidePlayerHint() {
      if (!playerHintEl) return;
      if (playerHintTimer) {
        clearTimeout(playerHintTimer);
        playerHintTimer = null;
      }
      playerHintEl.classList.remove('visible');
      playerHintEl.removeAttribute('data-variant');
    }

    function announceVisualFallback(key, message) {
      if (!message || visualFallbackNotices.has(key)) {
        return;
      }
      visualFallbackNotices.add(key);
      showPlayerHint(message, {
        variant: 'warning',
        duration: 10000,
      });
    }

    function getDefaultBriefingSteps() {
      const harvestLabels = collectActionLabels(['jump', 'interact'], { limitPerAction: 2 });
      const harvestText = formatKeyListForSentence(harvestLabels, { fallback: 'Space or F' });
      const gatherSentence = harvestText
        ? `Collect wood and stone with ${harvestText}, or tap while facing a resource tile.`
        : 'Collect wood and stone by using your harvest controls while facing a resource tile.';
      const placeLabel = getActionKeySummary('placeBlock', { fallback: 'Q' });
      const igniteLabel = getActionKeySummary('buildPortal', { fallback: 'R' });
      const portalSentence = placeLabel && igniteLabel
        ? `Form a 4×3 portal frame with ${placeLabel} and ignite it with ${igniteLabel} to stabilise a gateway.`
        : 'Form a 4×3 portal frame and ignite it to stabilise a gateway.';
      return [
        gatherSentence,
        'Open the hammer icon to craft a Stone Pickaxe and unlock new recipes.',
        portalSentence,
      ];
    }

    function getBriefingSteps() {
      const tasks = Array.isArray(dimensionOverlayState?.tasks) ? dimensionOverlayState.tasks.filter(Boolean) : [];
      if (!tasks.length) {
        return getDefaultBriefingSteps();
      }
      const combined = tasks.slice(0, 3);
      const defaults = getDefaultBriefingSteps();
      for (const step of defaults) {
        if (combined.length >= 3) break;
        if (!combined.includes(step)) {
          combined.push(step);
        }
      }
      return combined;
    }

    function renderGameBriefingSteps() {
      if (!gameBriefingStepsEl) return;
      const steps = getBriefingSteps();
      gameBriefingStepsEl.innerHTML = steps.map((step) => `<li>${step}</li>`).join('');
    }

    function hideGameBriefing({ immediate = false } = {}) {
      if (!gameBriefingEl) return;
      if (gameBriefingTimer) {
        clearTimeout(gameBriefingTimer);
        gameBriefingTimer = null;
      }
      if (immediate) {
        gameBriefingEl.classList.remove('is-visible');
        gameBriefingEl.hidden = true;
        gameBriefingEl.setAttribute('aria-hidden', 'true');
        return;
      }
      if (!gameBriefingEl.classList.contains('is-visible')) {
        return;
      }
      gameBriefingEl.classList.remove('is-visible');
      window.setTimeout(() => {
        gameBriefingEl.hidden = true;
        gameBriefingEl.setAttribute('aria-hidden', 'true');
      }, 260);
    }

    function showGameBriefing(options = {}) {
      if (!gameBriefingEl) return;
      const hasAcknowledged = Boolean(state?.ui?.briefingAcknowledged);
      const autoHide = options.autoHide ?? hasAcknowledged;
      const duration = options.duration ?? (hasAcknowledged ? 14000 : 20000);
      renderGameBriefingSteps();
      if (gameBriefingTimer) {
        clearTimeout(gameBriefingTimer);
        gameBriefingTimer = null;
      }
      gameBriefingEl.hidden = false;
      gameBriefingEl.setAttribute('aria-hidden', 'false');
      // Restart transition
      gameBriefingEl.classList.remove('is-visible');
      void gameBriefingEl.offsetWidth;
      gameBriefingEl.classList.add('is-visible');
      if (autoHide) {
        gameBriefingTimer = window.setTimeout(() => {
          hideGameBriefing();
        }, Math.max(2000, duration));
      }
    }

    function showPlayerHint(message, options = {}) {
      if (!playerHintEl || (!message && !options.html)) return;
      if (playerHintTimer) {
        clearTimeout(playerHintTimer);
        playerHintTimer = null;
      }
      if (options.variant) {
        playerHintEl.setAttribute('data-variant', options.variant);
      } else {
        playerHintEl.removeAttribute('data-variant');
      }
      if (options.html) {
        playerHintEl.innerHTML = options.html;
      } else if (message) {
        playerHintEl.textContent = message;
      } else {
        playerHintEl.textContent = '';
      }
      playerHintEl.classList.add('visible');
      const duration = Number.isFinite(options.duration) ? Number(options.duration) : 5600;
      if (!options.persist) {
        playerHintTimer = window.setTimeout(() => {
          hidePlayerHint();
        }, Math.max(1000, duration));
      }
    }

    function dismissMovementHint() {
      if (typeof state === 'undefined' || !state || !state.ui) {
        return;
      }
      if (state.ui.movementHintDismissed) {
        return;
      }
      state.ui.movementHintDismissed = true;
      hidePlayerHint();
      hideGameBriefing();
    }

    const coarsePointerQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)')
        : null;

    function prefersTouchControls() {
      if (coarsePointerQuery?.matches) return true;
      if (navigator.maxTouchPoints != null && navigator.maxTouchPoints > 0) return true;
      if (navigator.msMaxTouchPoints != null && navigator.msMaxTouchPoints > 0) return true;
      return typeof window !== 'undefined' && 'ontouchstart' in window;
    }

    function createControlsHintMarkup(preferredScheme = 'desktop') {
      const desktopActive = preferredScheme === 'desktop';
      const mobileActive = preferredScheme === 'touch';
      const desktopBadge = desktopActive ? '<span class="player-hint__badge">Detected</span>' : '';
      const mobileBadge = mobileActive ? '<span class="player-hint__badge">Detected</span>' : '';
      const forwardKey = getActionKeyLabels('moveForward', { limit: 1 })[0];
      const leftKey = getActionKeyLabels('moveLeft', { limit: 1 })[0];
      const backwardKey = getActionKeyLabels('moveBackward', { limit: 1 })[0];
      const rightKey = getActionKeyLabels('moveRight', { limit: 1 })[0];
      const jumpKey = joinKeyLabels(getActionKeyLabels('jump', { limit: 2 }));
      const placeBlockKey = joinKeyLabels(getActionKeyLabels('placeBlock', { limit: 1 }));
      const igniteKey = joinKeyLabels(getActionKeyLabels('interact', { limit: 1 }));

      const movementKeys = [forwardKey, leftKey, backwardKey, rightKey].filter(Boolean);
      const desktopList = [
        movementKeys.length ? `Move with ${movementKeys.join('/')}.` : 'Use your keyboard to move between rails.',
        jumpKey
          ? `Press ${jumpKey} to jump or gather resources.`
          : 'Use the jump control or click adjacent tiles to gather resources.',
        placeBlockKey && igniteKey
          ? `Press ${placeBlockKey} to place blocks and ${igniteKey} to ignite portal frames.`
          : 'Use your action keys to build portals and place blocks.',
      ];
      const mobileList = [
        'Tap the on-screen arrows to move.',
        'Tap ✦ to interact or gather from nearby tiles.',
        'Tap ⧉ to ignite portal frames.',
      ];
      const renderList = (items) =>
        `<ul class="player-hint__list">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
      const renderKeys = (keys) =>
        `<div class="player-hint__key-row" aria-hidden="true">${keys
          .map((key) => `<span class="player-hint__key">${key}</span>`)
          .join('')}</div>`;
      const movementRowKeys = [forwardKey, leftKey, backwardKey, rightKey].map((value) => value || '—');
      const desktopKeys = renderKeys(movementRowKeys);
      const mobileKeys =
        '<div class="player-hint__key-row player-hint__key-row--mobile" aria-hidden="true">' +
        ['◀', '▲', '▼', '▶']
          .map((key) => `<span class="player-hint__key player-hint__key--arrow">${key}</span>`)
          .join('') +
        '</div>';
      return `
        <div class="player-hint__controls">
          <h3 class="player-hint__title">Choose your controls</h3>
          <p class="player-hint__intro">Pick the movement scheme that matches your device before night falls.</p>
          <div class="player-hint__columns">
            <section class="player-hint__column${desktopActive ? ' is-active' : ''}" aria-label="Desktop controls">
              <header class="player-hint__column-header">
                <span class="player-hint__label">Desktop</span>
                ${desktopBadge}
              </header>
              ${desktopKeys}
              ${renderList(desktopList)}
            </section>
            <section class="player-hint__column${mobileActive ? ' is-active' : ''}" aria-label="Touch controls">
              <header class="player-hint__column-header">
                <span class="player-hint__label">Touch</span>
                ${mobileBadge}
              </header>
              ${mobileKeys}
              ${renderList(mobileList)}
            </section>
          </div>
          <p class="player-hint__note">Move to make your compass ring glow gold, then face a tree or stone and press ${
            jumpKey || 'your jump key'
          } or ✦ to gather.</p>
        </div>
      `;
    }

    function handleResize() {
      updateLayoutMetrics();
      syncSidebarForViewport();
      if (!renderer || !camera) return;
      const width = canvas.clientWidth || canvas.width || 1;
      const height = canvas.clientHeight || canvas.height || 1;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      if (camera.isPerspectiveCamera) {
        camera.aspect = aspect;
      } else if (camera.isOrthographicCamera) {
        const halfHeight = CAMERA_FRUSTUM_HEIGHT / 2;
        const halfWidth = halfHeight * aspect;
        camera.left = -halfWidth;
        camera.right = halfWidth;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
      }
      camera.updateProjectionMatrix();
      if (previewCamera) {
        updatePreviewCameraFrustum();
        updatePreviewCameraPosition();
      }
      syncCameraToPlayer({ idleBob: 0, walkBob: 0, movementStrength: 0 });
    }

    function syncCameraToPlayer(options = {}) {
      if (!camera || !state?.player) return;
      const facing = options.facing ?? state.player?.facing ?? { x: 0, y: 1 };
      const idleBob = options.idleBob ?? cameraState.lastIdleBob ?? 0;
      const walkBob = options.walkBob ?? cameraState.lastWalkBob ?? 0;
      const movementStrength = options.movementStrength ?? cameraState.lastMovementStrength ?? 0;
      cameraState.lastIdleBob = idleBob;
      cameraState.lastWalkBob = walkBob;
      cameraState.lastMovementStrength = movementStrength;
      const perspectiveSettings = getCameraPerspectiveSettings();
      const { x, z } = worldToScene(state.player.x, state.player.y);
      const baseHeight = tileSurfaceHeight(state.player.x, state.player.y) || 0;

      tmpCameraForward.set(facing.x, 0, facing.y);
      if (tmpCameraForward.lengthSq() < 0.0001) {
        tmpCameraForward.copy(cameraState.lastPlayerFacing);
      } else {
        tmpCameraForward.normalize();
        cameraState.lastPlayerFacing.copy(tmpCameraForward);
      }

      if (Math.abs(cameraState.yawOffset) > 0.00001) {
        const sin = Math.sin(cameraState.yawOffset);
        const cos = Math.cos(cameraState.yawOffset);
        const baseX = tmpCameraForward.x;
        const baseZ = tmpCameraForward.z;
        tmpCameraForward.set(baseX * cos - baseZ * sin, 0, baseX * sin + baseZ * cos);
      }

      cameraState.lastFacing.copy(tmpCameraForward);

      const timestamp = performance?.now ? performance.now() : Date.now();
      const bobOffset = idleBob * 0.35 + walkBob * 0.22;
      const bounceOffset =
        movementStrength > 0.01 ? Math.sin(timestamp / 320) * 0.05 * movementStrength : 0;
      const headY = baseHeight + perspectiveSettings.eyeOffset + bobOffset + bounceOffset;

      tmpCameraTarget.set(x, headY, z);

      camera.position.copy(tmpCameraTarget);
      camera.position.addScaledVector(cameraState.lastFacing, -perspectiveSettings.forwardOffset);
      camera.position.y += perspectiveSettings.verticalOffset;

      tmpCameraTarget.addScaledVector(cameraState.lastFacing, perspectiveSettings.lookDistance);

      if (movementStrength > 0.01) {
        const sway = Math.sin(timestamp / 280) * 0.18 * movementStrength;
        if (Math.abs(sway) > 0.0001) {
          tmpCameraRight.crossVectors(cameraState.lastFacing, WORLD_UP).normalize();
          tmpCameraTarget.addScaledVector(tmpCameraRight, sway);
        }
      }

      camera.up.copy(WORLD_UP);
      camera.lookAt(tmpCameraTarget);
      invalidateViewFrustum();
    }

    function applyCameraPerspective(perspective, options = {}) {
      if (!perspective || !CAMERA_PERSPECTIVE_SETTINGS[perspective]) {
        return false;
      }
      const { force = false, log = true } = options ?? {};
      if (!force && perspective === cameraPerspective) {
        return false;
      }
      cameraPerspective = perspective;
      cameraState.perspective = perspective;
      if (state && typeof state === 'object') {
        state.cameraPerspective = perspective;
      }
      const settings = getCameraPerspectiveSettings(perspective);
      if (camera) {
        const targetZoom = settings.zoom ?? CAMERA_BASE_ZOOM;
        if (Math.abs((camera.zoom ?? 0) - targetZoom) > 0.0001) {
          camera.zoom = targetZoom;
          camera.updateProjectionMatrix();
        }
      }
      if (camera && state?.player) {
        syncCameraToPlayer({ idleBob: 0, walkBob: 0, movementStrength: 0, facing: state.player.facing });
      }
      if (log && typeof logEvent === 'function') {
        const label = perspective === 'first' ? 'First-person view engaged.' : 'Third-person view engaged.';
        logEvent(label);
      }
      return true;
    }

    function toggleCameraPerspective(options = {}) {
      const { log = true } = options ?? {};
      const next = cameraPerspective === 'first' ? 'third' : 'first';
      return applyCameraPerspective(next, { log });
    }

    const JOYSTICK_DEADZONE = 0.18;
    const JOYSTICK_MAX_DISTANCE = 60;
    const joystickState = {
      active: false,
      pointerId: null,
      vector: { x: 0, forward: 0 },
    };

    function updateJoystickThumb() {
      if (!virtualJoystickEl || !virtualJoystickThumb) return;
      const radius = Math.min(virtualJoystickEl.clientWidth, virtualJoystickEl.clientHeight) / 2 || 1;
      const offsetX = joystickState.vector.x * radius * 0.6;
      const offsetY = -joystickState.vector.forward * radius * 0.6;
      virtualJoystickThumb.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }

    function setJoystickVector(rawX, rawForward) {
      const length = Math.hypot(rawX, rawForward);
      let x = rawX;
      let forward = rawForward;
      if (length > 1) {
        x /= length;
        forward /= length;
      }
      const magnitude = Math.hypot(x, forward);
      if (magnitude < JOYSTICK_DEADZONE) {
        x = 0;
        forward = 0;
      }
      joystickState.vector.x = x;
      joystickState.vector.forward = forward;
      if (state.joystickInput) {
        state.joystickInput.strafe = x;
        state.joystickInput.forward = forward;
      }
      updateJoystickThumb();
    }

    function resetJoystickVector() {
      setJoystickVector(0, 0);
      joystickState.active = false;
      joystickState.pointerId = null;
    }

    function handleVirtualJoystickMove(event) {
      if (!virtualJoystickEl) return;
      const rect = virtualJoystickEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxDistance = Math.max(virtualJoystickEl.clientWidth, virtualJoystickEl.clientHeight) / 2 || JOYSTICK_MAX_DISTANCE;
      const dx = THREE.MathUtils.clamp((event.clientX - centerX) / maxDistance, -1, 1);
      const dy = THREE.MathUtils.clamp((event.clientY - centerY) / maxDistance, -1, 1);
      setJoystickVector(dx, THREE.MathUtils.clamp(-dy, -1, 1));
    }

    function initVirtualJoystick() {
      if (virtualJoystickReady || !virtualJoystickEl) {
        return;
      }
      virtualJoystickReady = true;
      setJoystickVector(0, 0);

      virtualJoystickEl.addEventListener(
        'pointerdown',
        (event) => {
          joystickState.active = true;
          joystickState.pointerId = event.pointerId;
          handleVirtualJoystickMove(event);
          if (typeof virtualJoystickEl.setPointerCapture === 'function') {
            try {
              virtualJoystickEl.setPointerCapture(event.pointerId);
            } catch (error) {
              // Ignore pointer capture failures on unsupported browsers.
            }
          }
          event.preventDefault();
        },
        { passive: false },
      );

      virtualJoystickEl.addEventListener(
        'pointermove',
        (event) => {
          if (!joystickState.active || event.pointerId !== joystickState.pointerId) return;
          handleVirtualJoystickMove(event);
          event.preventDefault();
        },
        { passive: false },
      );

      const handleRelease = (event) => {
        if (joystickState.pointerId != null && event.pointerId !== joystickState.pointerId) {
          return;
        }
        if (
          virtualJoystickEl &&
          typeof virtualJoystickEl.releasePointerCapture === 'function' &&
          joystickState.pointerId != null
        ) {
          try {
            virtualJoystickEl.releasePointerCapture(joystickState.pointerId);
          } catch (error) {
            // Ignore release errors when the pointer capture is no longer active.
          }
        }
        resetJoystickVector();
      };

      virtualJoystickEl.addEventListener('pointerup', handleRelease);
      virtualJoystickEl.addEventListener('pointercancel', handleRelease);
      virtualJoystickEl.addEventListener('pointerleave', handleRelease);
    }

    function initPointerControls() {
      const pointer = {
        active: false,
        id: null,
        pointerType: null,
        button: 0,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        moved: false,
      };
      let suppressNextClick = false;
      canvas.style.cursor = 'pointer';

      const computeFacingFromDelta = (dx, dy) => {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX === 0 && absY === 0) {
          return { ...state.player.facing };
        }
        if (absX > absY) {
          return { x: Math.sign(dx), y: 0 };
        }
        if (absY > absX) {
          return { x: 0, y: Math.sign(dy) };
        }
        if (state.player.facing.x !== 0 && Math.sign(dx) !== 0) {
          return { x: Math.sign(dx), y: 0 };
        }
        if (state.player.facing.y !== 0 && Math.sign(dy) !== 0) {
          return { x: 0, y: Math.sign(dy) };
        }
        return {
          x: Math.sign(dx) || 0,
          y: Math.sign(dy) || 0,
        };
      };

      const handlePointerClick = (event, button = 0) => {
        if (!state.isRunning) {
          return;
        }
        if (!camera || !worldGroup) {
          if (button === 2) {
            placeBlock();
          } else {
            interact();
          }
          return;
        }
        const { tile: tileTarget, entity: entityTarget } = getCenterTarget();
        if (button === 2) {
          if (!tileTarget) {
            placeBlock();
            return;
          }
          const diffX = tileTarget.tileX - state.player.x;
          const diffY = tileTarget.tileY - state.player.y;
          const adjacent = Math.max(Math.abs(diffX), Math.abs(diffY)) <= 1;
          const nextFacing = computeFacingFromDelta(diffX, diffY);
          state.player.facing = nextFacing;
          if (!adjacent) {
            logEvent('Move closer to place that block.');
            return;
          }
          placeBlock({ x: tileTarget.tileX, y: tileTarget.tileY });
          return;
        }
        if (tileTarget && (!entityTarget || tileTarget.distance <= entityTarget.distance)) {
          const tile = getTile(tileTarget.tileX, tileTarget.tileY);
          if (!tile) {
            interact();
            return;
          }
          const diffX = tileTarget.tileX - state.player.x;
          const diffY = tileTarget.tileY - state.player.y;
          const adjacent = Math.max(Math.abs(diffX), Math.abs(diffY)) <= 1;
          const nextFacing = computeFacingFromDelta(diffX, diffY);
          state.player.facing = nextFacing;
          if (!adjacent) {
            logEvent('Move closer to interact with that block.');
            return;
          }
          if (tile.resource && (tile.type === 'tree' || tile.type === 'stone' || tile.type === 'rock')) {
            beginMining(tile, tileTarget.tileX, tileTarget.tileY);
            return;
          }
        }
        interact(false);
      };

      const resetPointerState = () => {
        if (pointer.active && pointer.id != null && typeof canvas.releasePointerCapture === 'function') {
          try {
            canvas.releasePointerCapture(pointer.id);
          } catch (error) {
            // Swallow errors when releasePointerCapture is invoked without a capture.
          }
        }
        pointer.active = false;
        pointer.id = null;
        pointer.pointerType = null;
        pointer.button = 0;
        pointer.startX = 0;
        pointer.startY = 0;
        pointer.lastX = 0;
        pointer.lastY = 0;
        pointer.moved = false;
      };

      canvas.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) {
          return;
        }
        pointer.active = true;
        pointer.id = event.pointerId;
        pointer.pointerType = event.pointerType;
        pointer.button = event.button;
        pointer.startX = event.clientX;
        pointer.startY = event.clientY;
        pointer.lastX = event.clientX;
        pointer.lastY = event.clientY;
        pointer.moved = false;
        if (typeof canvas.setPointerCapture === 'function') {
          try {
            canvas.setPointerCapture(event.pointerId);
          } catch (error) {
            // Ignore pointer capture failures (e.g., unsupported browsers).
          }
        }
      });

      canvas.addEventListener('pointermove', (event) => {
        if (!pointer.active || event.pointerId !== pointer.id) return;
        const dx = event.clientX - pointer.lastX;
        const dy = event.clientY - pointer.lastY;
        pointer.lastX = event.clientX;
        pointer.lastY = event.clientY;

        if (Math.abs(dx) + Math.abs(dy) > 0) {
          const totalDelta = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
          if (totalDelta > CAMERA_DRAG_SUPPRESS_THRESHOLD) {
            pointer.moved = true;
          }
        }

        if (!state.isRunning && previewState.active && previewCamera) {
          const previewSensitivity =
            pointer.pointerType === 'mouse'
              ? PREVIEW_MOUSE_SENSITIVITY
              : pointer.pointerType === 'touch' || pointer.pointerType === 'pen'
              ? PREVIEW_TOUCH_SENSITIVITY
              : PREVIEW_MOUSE_SENSITIVITY;
          if (Math.abs(dx) > 0.0001 && previewSensitivity > 0) {
            setPreviewYaw(previewState.yaw - dx * previewSensitivity);
            pointer.moved = true;
          }
          if (Math.abs(dy) > 0.0001 && previewSensitivity > 0) {
            setPreviewPitch(previewState.pitch - dy * previewSensitivity * 0.6);
            pointer.moved = true;
          }
          if (pointer.pointerType === 'touch') {
            event.preventDefault();
          }
          return;
        }

        if (!camera) return;
        const sensitivity =
          pointer.pointerType === 'mouse'
            ? CAMERA_MOUSE_SENSITIVITY
            : pointer.pointerType === 'touch' || pointer.pointerType === 'pen'
            ? CAMERA_TOUCH_SENSITIVITY
            : CAMERA_MOUSE_SENSITIVITY;
        if (Math.abs(dx) > 0.0001 && sensitivity > 0) {
          const previousOffset = cameraState.yawOffset;
          cameraState.yawOffset = THREE.MathUtils.clamp(
            previousOffset - dx * sensitivity,
            -CAMERA_MAX_YAW_OFFSET,
            CAMERA_MAX_YAW_OFFSET,
          );
          if (Math.abs(cameraState.yawOffset - previousOffset) > 0.00001) {
            pointer.moved = true;
            syncCameraToPlayer({
              facing: state.player?.facing,
            });
          }
        }

        if (pointer.pointerType === 'touch') {
          event.preventDefault();
        }
      });

      canvas.addEventListener('pointerup', (event) => {
        if (!pointer.active) return;
        const wasTouch = pointer.pointerType === 'touch' || pointer.pointerType === 'pen';
        const releasedButton = event.button ?? pointer.button ?? 0;
        if (state.isRunning && !pointer.moved) {
          const buttonToUse = wasTouch ? 0 : pointer.button ?? releasedButton ?? 0;
          suppressNextClick = true;
          if (typeof event.preventDefault === 'function') {
            event.preventDefault();
          }
          handlePointerClick(event, buttonToUse);
        } else if (pointer.pointerType === 'mouse' && pointer.moved) {
          suppressNextClick = true;
        }
        resetPointerState();
      });

      const cancelPointer = () => {
        if (!pointer.active) return;
        suppressNextClick = pointer.moved || suppressNextClick;
        resetPointerState();
      };

      canvas.addEventListener('pointerleave', cancelPointer);
      canvas.addEventListener('pointercancel', cancelPointer);
      canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
      });
      canvas.addEventListener('click', (event) => {
        if (suppressNextClick) {
          suppressNextClick = false;
          return;
        }
        if (!state.isRunning) return;
        handlePointerClick(event, event.button ?? 0);
      });
    }

    function getCenterTarget() {
      if (!camera) {
        hoverState.tile = null;
        hoverState.entity = null;
        return { tile: null, entity: null };
      }
      raycastPointer.set(0, 0);
      raycaster.setFromCamera(raycastPointer, camera);
      let tileTarget = null;
      if (worldTilesRoot) {
        const intersections = raycaster.intersectObjects(worldTilesRoot.children, true);
        for (const intersection of intersections) {
          let current = intersection.object;
          while (current.parent && current.parent !== worldTilesRoot) {
            current = current.parent;
          }
          if (!current || current.parent !== worldTilesRoot) continue;
          const coords = sceneToWorld(current.position.x, current.position.z);
          if (!isWithinBounds(coords.x, coords.y)) continue;
          tileTarget = {
            object: current,
            tileX: coords.x,
            tileY: coords.y,
            distance: intersection.distance,
          };
          break;
        }
      }
      let entityTarget = null;
      if (entityGroup) {
        const intersections = raycaster.intersectObjects(entityGroup.children, true);
        for (const intersection of intersections) {
          let current = intersection.object;
          while (current.parent && current.parent !== entityGroup) {
            current = current.parent;
          }
          if (!current || current.parent !== entityGroup) continue;
          if (current === playerMesh || current === playerLocator) continue;
          const name = current.name || current.parent?.name || '';
          if (name !== 'minecraft-zombie') continue;
          entityTarget = {
            object: current,
            distance: intersection.distance,
          };
          break;
        }
      }
      hoverState.tile = tileTarget;
      hoverState.entity = entityTarget;
      return { tile: tileTarget, entity: entityTarget };
    }

    function hideHoverHighlights() {
      if (tileHighlightHelper) {
        tileHighlightHelper.visible = false;
      }
      if (enemyHighlightHelper) {
        enemyHighlightHelper.visible = false;
      }
    }

    function updateHoverHighlight() {
      if (!state.isRunning || !scene || !camera) {
        hoverState.tile = null;
        hoverState.entity = null;
        hideHoverHighlights();
        return;
      }
      const { tile: tileTarget, entity: entityTarget } = getCenterTarget();
      const highlightEnemy = Boolean(entityTarget && (!tileTarget || entityTarget.distance < tileTarget.distance));
      if (tileHighlightHelper) {
        if (tileTarget && (!highlightEnemy || !entityTarget || tileTarget.distance <= entityTarget.distance)) {
          tmpRaycastBox.setFromObject(tileTarget.object);
          tmpRaycastBox.expandByScalar(0.03);
          tileHighlightHelper.box.copy(tmpRaycastBox);
          const tile = getTile(tileTarget.tileX, tileTarget.tileY);
          let color = HOVER_OUTLINE_COLORS.interactable;
          if (tile?.type === 'grass') {
            color = HOVER_OUTLINE_COLORS.placeable;
          }
          if (tileHighlightHelper.material?.color) {
            tileHighlightHelper.material.color.set(color);
          }
          tileHighlightHelper.visible = true;
          if (tileHighlightHelper.geometry?.attributes?.position) {
            tileHighlightHelper.geometry.attributes.position.needsUpdate = true;
          }
          tileHighlightHelper.updateMatrixWorld(true);
        } else {
          tileHighlightHelper.visible = false;
        }
      }
      if (enemyHighlightHelper) {
        if (highlightEnemy && entityTarget) {
          tmpRaycastBox.setFromObject(entityTarget.object);
          tmpRaycastBox.expandByScalar(0.05);
          enemyHighlightHelper.box.copy(tmpRaycastBox);
          if (enemyHighlightHelper.material?.color) {
            enemyHighlightHelper.material.color.set(HOVER_OUTLINE_COLORS.enemy);
          }
          enemyHighlightHelper.visible = true;
          if (enemyHighlightHelper.geometry?.attributes?.position) {
            enemyHighlightHelper.geometry.attributes.position.needsUpdate = true;
          }
          enemyHighlightHelper.updateMatrixWorld(true);
        } else {
          enemyHighlightHelper.visible = false;
        }
      }
    }

    function initRenderer() {
      if (renderer) return true;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        const gl = renderer.getContext();
        if (!gl || typeof gl.getParameter !== 'function') {
          throw new Error('WebGL context unavailable');
        }
        try {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          const rendererLabel = debugInfo
            ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER);
          if (typeof rendererLabel === 'string') {
            const normalisedLabel = rendererLabel.toLowerCase();
            const softwareRendererPatterns = [
              'swiftshader',
              'llvmpipe',
              'software',
              'basic render driver',
              'mesa',
            ];
            if (softwareRendererPatterns.some((pattern) => normalisedLabel.includes(pattern))) {
              portalShaderSupport = false;
            }
          }
        } catch (contextError) {
          // Ignore renderer identification issues; fallback will be used if shaders fail.
        }
        if (portalShaderSupport) {
          const capabilities = renderer.capabilities || {};
          const isWebGL2 = Boolean(capabilities.isWebGL2);
          const derivativesSupported = Boolean(
            isWebGL2 || gl.getExtension('OES_standard_derivatives')
          );
          if (!derivativesSupported) {
            portalShaderSupport = false;
          }
        }
      } catch (error) {
        renderer = null;
        showDependencyError(
          'Your browser could not initialise the 3D renderer. Please ensure WebGL is enabled and refresh to try again.',
          error
        );
        return false;
      }
      renderer.setPixelRatio(window.devicePixelRatio ?? 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.setClearColor(new THREE.Color('#7ec6ff'), 1);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(new THREE.Color(BASE_ATMOSPHERE.fogColor), BASE_ATMOSPHERE.fogDensity);

      const width = canvas.clientWidth || canvas.width || 1;
      const height = canvas.clientHeight || canvas.height || 1;
      const aspect = width / height;
      const halfHeight = CAMERA_FRUSTUM_HEIGHT / 2;
      const halfWidth = halfHeight * aspect;

      camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.1, 80);
      const perspectiveSettings = getCameraPerspectiveSettings();
      camera.zoom = perspectiveSettings.zoom ?? CAMERA_BASE_ZOOM;
      camera.updateProjectionMatrix();
      camera.position.set(0, perspectiveSettings.eyeOffset, perspectiveSettings.forwardOffset);
      camera.up.copy(WORLD_UP);
      camera.lookAt(0, perspectiveSettings.eyeOffset, 0);

      worldGroup = new THREE.Group();
      worldGroup.name = 'world-root';
      environmentGroup = new THREE.Group();
      environmentGroup.name = 'world-environment';
      environmentGroup.userData.environment = true;
      worldTilesRoot = new THREE.Group();
      worldTilesRoot.name = 'world-tiles-root';
      worldGroup.add(environmentGroup);
      worldGroup.add(worldTilesRoot);
      entityGroup = new THREE.Group();
      particleGroup = new THREE.Group();
      scene.add(worldGroup);
      scene.add(entityGroup);
      scene.add(particleGroup);
      tileHighlightHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(HOVER_OUTLINE_COLORS.placeable));
      tileHighlightHelper.visible = false;
      scene.add(tileHighlightHelper);
      enemyHighlightHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(HOVER_OUTLINE_COLORS.enemy));
      enemyHighlightHelper.visible = false;
      scene.add(enemyHighlightHelper);

      hemiLight = new THREE.HemisphereLight(0xd5e8ff, 0x1a243f, 1.2);
      scene.add(hemiLight);

      sunLight = new THREE.DirectionalLight(0xfff2d8, 1.6);
      sunLight.position.set(12, 16, 6);
      sunLight.target.position.set(0, 0, 0);
      sunLight.castShadow = true;
      const sunShadowSize = 24;
      sunLight.shadow.mapSize.set(2048, 2048);
      sunLight.shadow.camera.near = 0.5;
      sunLight.shadow.camera.far = 80;
      sunLight.shadow.camera.left = -sunShadowSize;
      sunLight.shadow.camera.right = sunShadowSize;
      sunLight.shadow.camera.top = sunShadowSize;
      sunLight.shadow.camera.bottom = -sunShadowSize;
      sunLight.shadow.bias = -0.0008;
      sunLight.shadow.normalBias = 0.02;
      sunLight.shadow.radius = 2.5;
      sunLight.shadow.camera.updateProjectionMatrix();
      scene.add(sunLight);
      scene.add(sunLight.target);

      moonLight = new THREE.DirectionalLight(0x5a74ff, 0.5);
      moonLight.position.set(-10, 10, -8);
      moonLight.target.position.set(0, 0, 0);
      scene.add(moonLight);
      scene.add(moonLight.target);

      ambientLight = new THREE.AmbientLight(0xbddcff, 0.45);
      scene.add(ambientLight);

      rimLight = new THREE.DirectionalLight(rimLightColors.day.clone(), 0.45);
      rimLight.position.set(-14, 14, -6);
      rimLight.target.position.set(0, 0, 0);
      rimLight.castShadow = false;
      scene.add(rimLight);
      scene.add(rimLight.target);

      torchLight = new THREE.PointLight(0xffd27f, 0, 8, 2.4);
      torchLight.castShadow = true;
      torchLight.shadow.mapSize.set(1024, 1024);
      torchLight.shadow.camera.near = 0.1;
      torchLight.shadow.camera.far = 16;
      torchLight.shadow.bias = -0.001;
      torchLight.shadow.radius = 3;
      torchLight.visible = false;
      scene.add(torchLight);

      buildProceduralIsland();
      initPointerControls();
      window.addEventListener('resize', handleResize);
      handleResize();
      createPlayerMesh(beginNewPlayerSession());
      createPlayerLocator();
      syncCameraToPlayer({ idleBob: 0, walkBob: 0, movementStrength: 0 });
      updateLighting(0);
      validatePortalShaderSupport();
      const uniformsReady = sanitizeSceneUniforms();
      if (!uniformsReady) {
        pendingUniformSanitizations = Math.max(pendingUniformSanitizations, 2);
      }
      rendererRecoveryFrames = Math.max(rendererRecoveryFrames, 1);
      console.log('Scene loaded');
      return true;
    }

    function validatePortalShaderSupport() {
      if (!portalShaderSupport || !renderer || typeof THREE?.ShaderMaterial !== 'function') {
        portalShaderSupport = false;
        return;
      }

      let testMaterial = null;
      let testScene = null;
      let testCamera = null;
      let testMesh = null;

      const disposeTestResources = () => {
        if (testMesh && testScene) {
          testScene.remove(testMesh);
        }
        if (testMaterial) {
          try {
            testMaterial.dispose?.();
          } catch (disposeError) {
            // Ignore disposal issues for the capability probe.
          }
        }
        if (testMesh?.geometry) {
          try {
            testMesh.geometry.dispose?.();
          } catch (geometryDisposeError) {
            // Ignore geometry disposal issues for the capability probe.
          }
        }
        testMaterial = null;
        testScene = null;
        testCamera = null;
        testMesh = null;
      };

      try {
        const uniforms = {
          uTime: { value: 0 },
          uActivation: { value: 0.8 },
          uColor: { value: new THREE.Color('#7b6bff') },
          uOpacity: { value: 0.75 },
        };

        testMaterial = new THREE.ShaderMaterial({
          uniforms,
          vertexShader: PORTAL_VERTEX_SHADER,
          fragmentShader: PORTAL_FRAGMENT_SHADER,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });

        const guardedUniforms = guardUniformContainer(testMaterial.uniforms);
        if (guardedUniforms && guardedUniforms !== testMaterial.uniforms) {
          testMaterial.uniforms = guardedUniforms;
        }

        if (!hasValidPortalUniformStructure(testMaterial.uniforms)) {
          throw new Error('Portal shader uniforms invalid after initialisation.');
        }

        testScene = new THREE.Scene();
        testCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
        testCamera.position.z = 2.4;
        testMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.6), testMaterial);
        testScene.add(testMesh);

        if (typeof renderer.compile === 'function') {
          renderer.compile(testScene, testCamera);
        }

        renderer.render(testScene, testCamera);

        if (!hasValidPortalUniformStructure(testMaterial.uniforms)) {
          throw new Error('Portal shader uniforms became invalid after compilation.');
        }
      } catch (error) {
        portalShaderSupport = false;
        console.warn(
          'Portal shaders unavailable on this device; using emissive fallback materials instead.',
          error
        );
        announceVisualFallback(
          'portal-shader',
          'Portal glow effects are disabled because your GPU rejected the shader. Gates still work – visuals are just simplified.'
        );
      } finally {
        disposeTestResources();
      }
    }

    function supportsInstancedRendering() {
      if (!renderer || typeof THREE?.InstancedMesh !== 'function') {
        return false;
      }
      const capabilities = renderer.capabilities || {};
      if (capabilities.isWebGL2) {
        return true;
      }
      try {
        if (renderer.extensions && typeof renderer.extensions.has === 'function') {
          if (renderer.extensions.has('ANGLE_instanced_arrays')) {
            return true;
          }
        }
      } catch (error) {
        console.warn('Failed to detect instanced rendering support.', error);
      }
      return false;
    }

    function buildProceduralIsland() {
      if (!environmentGroup) return;
      if (voxelIslandAssets.mesh) {
        environmentGroup.remove(voxelIslandAssets.mesh);
        if (typeof voxelIslandAssets.mesh.dispose === 'function') {
          voxelIslandAssets.mesh.dispose();
        }
        voxelIslandAssets.mesh = null;
      }

      const {
        size,
        tileSize,
        radiusMultiplier,
        minHeight,
        maxHeight,
        noiseScale,
        falloffPower,
      } = VOXEL_ISLAND_CONFIG;
      const halfSize = size / 2;
      const radius = Math.max(tileSize, size * radiusMultiplier);
      const tileCount = size * size;
      const minColumnUnits = Math.max(1, Math.round(minHeight));
      const maxColumnUnits = Math.max(minColumnUnits, Math.round(maxHeight));
      const totalColumns = tileCount;
      const minRequired = totalColumns * minColumnUnits;
      const maxPossible = totalColumns * maxColumnUnits;
      const cappedBudget = Math.min(TERRAIN_VOXEL_CAP, maxPossible);
      const voxelBudget = Math.max(minRequired, cappedBudget);
      let remainingVoxels = voxelBudget;
      let cappedColumns = 0;
      let voxelCount = 0;
      let highestColumnUnits = 0;

      if (tileCount === 0) {
        return;
      }

      if (!voxelIslandAssets.texture) {
        ensurePreviewTextures();
        const previewGrass = previewAssets.textures.grass;
        if (previewGrass) {
          voxelIslandAssets.texture = clonePreviewTexture(previewGrass, {
            repeat: { x: 4, y: 4 },
            colorSpace: THREE.SRGBColorSpace,
          });
        } else if (BASE_TEXTURE_URLS.grass) {
          voxelIslandAssets.texture = createTexture(BASE_TEXTURE_URLS.grass, {
            repeat: { x: 4, y: 4 },
            colorSpace: THREE.SRGBColorSpace,
          });
        }
        if (!voxelIslandAssets.texture) {
          console.warn('Unable to initialise voxel island texture. Using flat material.');
        }
      }

      if (!voxelIslandAssets.geometry) {
        voxelIslandAssets.geometry = new THREE.BoxGeometry(tileSize, tileSize, tileSize);
      }

      if (!voxelIslandAssets.material) {
        voxelIslandAssets.material = new THREE.MeshStandardMaterial({
          map: voxelIslandAssets.texture ?? null,
          roughness: 0.72,
          metalness: 0.08,
          color: new THREE.Color('#7ecb5c'),
        });
      } else if (voxelIslandAssets.texture && voxelIslandAssets.material.map !== voxelIslandAssets.texture) {
        voxelIslandAssets.material.map = voxelIslandAssets.texture;
        voxelIslandAssets.material.needsUpdate = true;
      }

      const instancingSupported = supportsInstancedRendering();
      let islandMesh = null;
      let fallbackGroup = null;

      if (instancingSupported) {
        islandMesh = new THREE.InstancedMesh(
          voxelIslandAssets.geometry,
          voxelIslandAssets.material,
          tileCount,
        );
        islandMesh.name = 'voxel-island';
        islandMesh.castShadow = true;
        islandMesh.receiveShadow = true;
        islandMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      } else {
        fallbackGroup = new THREE.Group();
        fallbackGroup.name = 'voxel-island';
        fallbackGroup.userData = { ...(fallbackGroup.userData || {}), instancingFallback: true };
      }

      let index = 0;
      const random = (x, z) => {
        const value = Math.sin((x * 127.1 + z * 311.7) * 43758.5453);
        return value - Math.floor(value);
      };

      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          const offsetX = x - halfSize + 0.5;
          const offsetZ = z - halfSize + 0.5;
          const distance = Math.hypot(offsetX, offsetZ);
          const distanceRatio = Math.min(distance / radius, 1);
          const falloff = Math.pow(Math.max(0, 1 - distanceRatio), falloffPower);
          const variation = random(offsetX, offsetZ) * noiseScale;
          const desiredHeight = THREE.MathUtils.clamp(
            minHeight + falloff * (maxHeight - minHeight) + variation,
            minHeight,
            maxHeight,
          );
          const desiredUnits = Math.max(minColumnUnits, Math.round(desiredHeight));
          const columnsRemaining = totalColumns - index - 1;
          const reservedForRemaining = Math.max(0, columnsRemaining * minColumnUnits);
          const availableForColumn = Math.max(minColumnUnits, remainingVoxels - reservedForRemaining);
          let columnUnits = Math.min(desiredUnits, maxColumnUnits, availableForColumn);
          if (columnUnits < minColumnUnits) {
            columnUnits = Math.min(minColumnUnits, remainingVoxels);
          }
          columnUnits = Math.max(0, Math.floor(columnUnits));
          if (columnUnits < minColumnUnits && remainingVoxels > 0) {
            columnUnits = Math.min(minColumnUnits, Math.floor(remainingVoxels));
          }
          if (columnUnits <= 0) {
            columnUnits = minColumnUnits;
          }
          if (columnUnits < desiredUnits) {
            cappedColumns += 1;
          }
          remainingVoxels = Math.max(0, remainingVoxels - columnUnits);
          voxelCount += columnUnits;
          highestColumnUnits = Math.max(highestColumnUnits, columnUnits);
          const columnHeight = columnUnits * tileSize;
          voxelIslandDummy.position.set(offsetX * tileSize, columnHeight / 2, offsetZ * tileSize);
          voxelIslandDummy.scale.set(1, columnUnits, 1);
          voxelIslandDummy.rotation.set(0, 0, 0);
          voxelIslandDummy.updateMatrix();
          if (islandMesh) {
            islandMesh.setMatrixAt(index, voxelIslandDummy.matrix);
          } else if (fallbackGroup) {
            const tileMesh = new THREE.Mesh(voxelIslandAssets.geometry, voxelIslandAssets.material);
            tileMesh.matrixAutoUpdate = false;
            tileMesh.matrix.copy(voxelIslandDummy.matrix);
            tileMesh.castShadow = true;
            tileMesh.receiveShadow = true;
            fallbackGroup.add(tileMesh);
          }
          index += 1;
        }
      }
      if (islandMesh) {
        islandMesh.instanceMatrix.needsUpdate = true;
        environmentGroup.add(islandMesh);
        voxelIslandAssets.mesh = islandMesh;
      } else if (fallbackGroup) {
        fallbackGroup.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.updateMatrixWorld(true);
          }
        });
        environmentGroup.add(fallbackGroup);
        voxelIslandAssets.mesh = fallbackGroup;
        if (!voxelIslandAssets.instancingFallbackNotified) {
          announceVisualFallback(
            'island-instancing',
            'Your browser skips instanced 3D rendering, so the island uses a simplified mesh. Everything still plays the same.',
          );
          voxelIslandAssets.instancingFallbackNotified = true;
        }
      }
      const voxelsUsed = voxelBudget - remainingVoxels;
      voxelIslandAssets.tileCount = tileCount;
      voxelIslandAssets.voxelBudget = voxelBudget;
      voxelIslandAssets.voxelUsage = voxelsUsed;
      voxelIslandAssets.voxelCount = voxelCount;
      voxelIslandAssets.columnsTrimmed = cappedColumns;
      const maxColumnHeight = Math.max(tileSize, highestColumnUnits * tileSize);
      const horizontalRadius = (size * tileSize) / 2;
      const verticalRadius = maxColumnHeight / 2;
      worldCullingState.islandCenter.set(0, verticalRadius, 0);
      worldCullingState.islandRadius = Math.sqrt(
        horizontalRadius * horizontalRadius * 2 + verticalRadius * verticalRadius
      );
      if (typeof console !== 'undefined') {
        console.log(`World generated: ${tileCount} voxels`);
        console.log(`Terrain blocks placed: ${voxelCount}`);
        if (cappedColumns > 0) {
          console.info(
            `Terrain voxel budget applied: ${cappedColumns} columns trimmed to stay under ${voxelBudget} voxels`,
          );
        }
        if (voxelsUsed >= voxelBudget) {
          console.info(`Terrain voxel cap enforced at ${voxelsUsed}/${voxelBudget} blocks.`);
        }
      }
    }

    function previewRandom(x, y, salt = 0) {
      const seed = previewState.seed || 0;
      const value = Math.sin((x * 127.1 + y * 311.7 + salt * 53.7 + seed * 0.618) * 43758.5453);
      return value - Math.floor(value);
    }

    function ensurePreviewTextures() {
      if (
        previewAssets.textures.grass &&
        previewAssets.textures.dirt &&
        previewAssets.textures.wood &&
        previewAssets.textures.leaves
      ) {
        return;
      }
      const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
      const configureTexture = (texture, options = {}) => {
        if (!texture) return texture;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = maxAnisotropy;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        if (options.transparent) {
          texture.format = THREE.RGBAFormat;
        }
        texture.needsUpdate = true;
        return texture;
      };
      const createProceduralTexture = (size, draw, options = {}) => {
        const canvasEl = document.createElement('canvas');
        canvasEl.width = size;
        canvasEl.height = size;
        const ctx = canvasEl.getContext('2d');
        if (options.transparent) {
          ctx.clearRect(0, 0, size, size);
        }
        draw(ctx, size);
        const texture = new THREE.CanvasTexture(canvasEl);
        return configureTexture(texture, options);
      };
      const loadTexture = (path, options = {}, fallbackDraw = null) => {
        const fallbackTexture = fallbackDraw ? createProceduralTexture(128, fallbackDraw, options) : null;
        let texture = null;
        if (!path) {
          return fallbackTexture ? configureTexture(fallbackTexture, options) : null;
        }
        if (isCrossOriginTextureUrl(path)) {
          console.warn(`Skipping cross-origin preview texture due to CORS restrictions: ${path}`);
          return fallbackTexture ? configureTexture(fallbackTexture, options) : null;
        }
        try {
          texture = textureLoader.load(
            path,
            (loaded) => configureTexture(loaded, options),
            undefined,
            (error) => {
              console.warn(`Failed to load preview texture: ${path}`, error);
              if (fallbackTexture && texture) {
                texture.image = fallbackTexture.image;
                configureTexture(texture, options);
              }
            },
          );
        } catch (error) {
          console.warn(`Failed to initialise preview texture: ${path}`, error);
          texture = fallbackTexture;
        }
        if (!texture) {
          texture = fallbackTexture;
        }
        return configureTexture(texture, options);
      };
      const dirt = createProceduralTexture(128, (ctx, size) => {
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#6d4620';
        ctx.fillRect(0, size * 0.55, size, size * 0.45);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        for (let i = 0; i < 180; i += 1) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          const r = Math.random() * 2 + 0.5;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        for (let i = 0; i < 160; i += 1) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          const r = Math.random() * 2 + 0.5;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      const grass = loadTexture(BASE_TEXTURE_URLS.grass, {}, drawBaseGrassTexture);
      const wood = loadTexture(BASE_TEXTURE_URLS.wood, {}, drawBaseWoodTexture);
      const leaves = loadTexture(BASE_TEXTURE_URLS.leaves, { transparent: true }, drawBaseLeavesTexture);
      previewAssets.textures = { grass, dirt, wood, leaves };
    }

    function ensurePreviewMaterials() {
      if (previewAssets.materials.grassTop) return;
      ensurePreviewTextures();
      const { grass, dirt, wood, leaves } = previewAssets.textures;
      previewAssets.materials = {
        grassTop: new THREE.MeshStandardMaterial({ map: grass, roughness: 0.7, metalness: 0.12 }),
        dirt: new THREE.MeshStandardMaterial({ map: dirt, roughness: 0.85, metalness: 0.08, color: new THREE.Color('#9a7347') }),
        dirtBottom: new THREE.MeshStandardMaterial({ map: dirt, roughness: 0.9, metalness: 0.05, color: new THREE.Color('#6c4a28') }),
        woodBark: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.75, metalness: 0.18 }),
        leaves: new THREE.MeshStandardMaterial({
          map: leaves,
          color: new THREE.Color('#2e8b57'),
          roughness: 0.55,
          metalness: 0.08,
          transparent: true,
          opacity: 0.96,
          alphaTest: 0.25,
          side: THREE.DoubleSide,
        }),
        rail: new THREE.MeshStandardMaterial({ color: new THREE.Color('#a7adb3'), metalness: 0.78, roughness: 0.32 }),
        sleeper: new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a424f'), metalness: 0.42, roughness: 0.6 }),
      };
    }

    function applyPreviewWireframe(enabled) {
      Object.values(previewAssets.materials).forEach((material) => {
        if (!material) return;
        material.wireframe = enabled;
      });
    }

    function previewSmoothNoise(x, y) {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const xf = x - x0;
      const yf = y - y0;
      const topLeft = previewRandom(x0, y0);
      const topRight = previewRandom(x0 + 1, y0);
      const bottomLeft = previewRandom(x0, y0 + 1);
      const bottomRight = previewRandom(x0 + 1, y0 + 1);
      const top = THREE.MathUtils.lerp(topLeft, topRight, xf);
      const bottom = THREE.MathUtils.lerp(bottomLeft, bottomRight, xf);
      return THREE.MathUtils.lerp(top, bottom, yf);
    }

    function previewPerlin(x, y) {
      const scale = 0.18;
      let amplitude = 1;
      let frequency = 1;
      let value = 0;
      let max = 0;
      for (let octave = 0; octave < 4; octave += 1) {
        value += previewSmoothNoise(x * frequency * scale, y * frequency * scale) * amplitude;
        max += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      return max > 0 ? value / max : 0;
    }

    function buildPreviewIsland() {
      ensurePreviewMaterials();
      if (!previewGroup) return null;
      const size = PREVIEW_ISLAND_SIZE;
      const blockSize = PREVIEW_BLOCK_SIZE;
      const half = size / 2;
      const spawnTarget = { x: 0, z: PREVIEW_PLAYER_STAND_OFFSET };
      const topMaterials = [
        previewAssets.materials.dirt,
        previewAssets.materials.dirt,
        previewAssets.materials.grassTop,
        previewAssets.materials.dirtBottom,
        previewAssets.materials.dirt,
        previewAssets.materials.dirt,
      ];
      const innerMaterials = [
        previewAssets.materials.dirt,
        previewAssets.materials.dirt,
        previewAssets.materials.dirt,
        previewAssets.materials.dirtBottom,
        previewAssets.materials.dirt,
        previewAssets.materials.dirt,
      ];
      const cubeGeometry = new THREE.BoxGeometry(blockSize, blockSize, blockSize);
      const heights = Array.from({ length: size }, () => Array(size).fill(0));
      const topTiles = [];
      let spawnTileInfo = null;
      for (let gx = 0; gx < size; gx += 1) {
        for (let gz = 0; gz < size; gz += 1) {
          const worldX = (gx - half) * blockSize;
          const worldZ = (gz - half) * blockSize;
          const distance = Math.hypot(worldX, worldZ);
          const falloff = THREE.MathUtils.clamp(1 - distance / (size * blockSize * 0.66), 0, 1);
          if (falloff <= 0.02) {
            continue;
          }
          const noise = previewPerlin(gx, gz);
          const spawnDistance = Math.hypot(worldX - spawnTarget.x, worldZ - spawnTarget.z);
          let height = Math.max(1, Math.round(1 + noise * 2.4 + falloff * 1.4));
          if (spawnDistance < PREVIEW_BLOCK_SIZE * 1.6) {
            height = 1;
          } else if (spawnDistance < PREVIEW_BLOCK_SIZE * 3.2) {
            height = Math.max(1, Math.round(1 + noise * 1.6));
          }
          if (Math.abs(worldX) < PREVIEW_BLOCK_SIZE * 1.2 && worldZ < spawnTarget.z && worldZ > -PREVIEW_BLOCK_SIZE * 2.6) {
            height = Math.max(1, Math.min(height, 2));
          }
          heights[gx][gz] = height;
          for (let gy = 0; gy < height; gy += 1) {
            const isTop = gy === height - 1;
            const mesh = new THREE.Mesh(cubeGeometry, isTop ? topMaterials : innerMaterials);
            mesh.castShadow = isTop;
            mesh.receiveShadow = true;
            mesh.position.set(worldX, gy * blockSize + blockSize / 2, worldZ);
            previewGroup.add(mesh);
          }
          topTiles.push({
            gridX: gx,
            gridZ: gz,
            worldX,
            worldZ,
            height,
            spawnDistance,
          });
          if (!spawnTileInfo || spawnDistance < spawnTileInfo.distance) {
            spawnTileInfo = { tile: topTiles[topTiles.length - 1], distance: spawnDistance };
          }
        }
      }
      const spawnReference = spawnTileInfo?.tile ?? null;
      const spawn = spawnReference
        ? {
            worldX: spawnReference.worldX,
            worldZ: spawnReference.worldZ,
            height: spawnReference.height,
          }
        : { worldX: spawnTarget.x, worldZ: spawnTarget.z, height: 1 };
      return { size, blockSize, heights, topTiles, half, spawn };
    }

    function buildPreviewTrees(island) {
      if (!island || !previewGroup) return;
      const { topTiles, blockSize, size, spawn } = island;
      const spawnPoint = spawn ?? { worldX: 0, worldZ: PREVIEW_PLAYER_STAND_OFFSET };
      const spawnRadius = PREVIEW_BLOCK_SIZE * 2.8;
      const islandHalfExtent = (size ?? PREVIEW_ISLAND_SIZE) * PREVIEW_BLOCK_SIZE * 0.5;
      const candidates = topTiles.filter((tile) => {
        const margin = PREVIEW_BLOCK_SIZE * 1.5;
        const withinBounds =
          Math.abs(tile.worldX) <= islandHalfExtent - margin && Math.abs(tile.worldZ) <= islandHalfExtent - margin;
        const farFromSpawn = Math.hypot(tile.worldX - spawnPoint.worldX, tile.worldZ - spawnPoint.worldZ) > spawnRadius;
        return withinBounds && farFromSpawn && tile.height >= 1;
      });
      if (!candidates.length) return;
      const treeNoise = previewRandom(size ?? PREVIEW_ISLAND_SIZE, candidates.length + 17);
      const desired = Math.min(candidates.length, Math.max(8, Math.round(THREE.MathUtils.lerp(8, 12, treeNoise))));
      const used = new Set();
      let attempts = 0;
      let spawned = 0;
      while (spawned < desired && attempts < candidates.length * 3) {
        const sampleIndex = Math.floor(previewRandom(attempts, desired, spawned) * candidates.length);
        const candidate = candidates[sampleIndex];
        const key = `${candidate.gridX}|${candidate.gridZ}`;
        if (used.has(key)) {
          attempts += 1;
          continue;
        }
        used.add(key);
        spawned += 1;
        attempts += 1;

        const treeGroup = new THREE.Group();
        treeGroup.name = 'preview-tree';
        treeGroup.position.set(
          candidate.worldX + (previewRandom(candidate.gridX + 19, candidate.gridZ + 7) - 0.5) * 0.6,
          candidate.height * blockSize,
          candidate.worldZ + (previewRandom(candidate.gridZ + 11, candidate.gridX + 5) - 0.5) * 0.6,
        );
        treeGroup.rotation.y = previewRandom(candidate.gridX + 3, candidate.gridZ + 9) * Math.PI * 2;
        treeGroup.userData = { type: 'tree', health: 4, meshes: [] };
        previewInteractiveTrees.add(treeGroup);
        previewGroup.add(treeGroup);

        const trunkHeight = 3.4 + previewRandom(candidate.gridX, candidate.gridZ) * 1.1;
        const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.24, trunkHeight, 12);
        const trunk = new THREE.Mesh(trunkGeometry, previewAssets.materials.woodBark);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        trunk.position.set(0, trunkHeight / 2, 0);
        trunk.userData = { type: 'treePart', tree: treeGroup };
        treeGroup.add(trunk);
        treeGroup.userData.meshes.push(trunk);
        treeGroup.userData.trunkHeight = trunkHeight;
        previewInteractiveMeshes.add(trunk);

        const canopyGroup = new THREE.Group();
        const canopyBase = trunkHeight * 0.92;
        canopyGroup.position.y = canopyBase;
        for (let i = 0; i < 4; i += 1) {
          const radius = 0.55 + previewRandom(candidate.gridX + i, candidate.gridZ - i) * 0.45;
          const angle = (i / 4) * Math.PI * 2;
          const leafGeometry = new THREE.SphereGeometry(0.75 + previewRandom(i, spawned) * 0.25, 16, 16);
          const leaf = new THREE.Mesh(leafGeometry, previewAssets.materials.leaves);
          leaf.position.set(
            Math.cos(angle) * radius,
            previewRandom(i + 2, spawned + 4) * 0.6,
            Math.sin(angle) * radius,
          );
          leaf.castShadow = true;
          leaf.receiveShadow = true;
          leaf.userData = { type: 'treePart', tree: treeGroup };
          canopyGroup.add(leaf);
          treeGroup.userData.meshes.push(leaf);
          previewInteractiveMeshes.add(leaf);
        }
        const crownGeometry = new THREE.SphereGeometry(0.9 + previewRandom(spawned, attempts) * 0.3, 16, 16);
        const crown = new THREE.Mesh(crownGeometry, previewAssets.materials.leaves);
        crown.position.set(0, 0.6, 0);
        crown.castShadow = true;
        crown.receiveShadow = true;
        crown.userData = { type: 'treePart', tree: treeGroup };
        canopyGroup.add(crown);
        treeGroup.userData.meshes.push(crown);
        previewInteractiveMeshes.add(crown);
        treeGroup.add(canopyGroup);
      }
    }

    function buildPreviewRails(island) {
      if (!island || !previewGroup) return;
      const { size, blockSize, heights } = island;
      let maxEdgeHeight = 1;
      for (let i = 0; i < size; i += 1) {
        maxEdgeHeight = Math.max(maxEdgeHeight, heights[i][0] || 0, heights[i][size - 1] || 0);
        maxEdgeHeight = Math.max(maxEdgeHeight, heights[0][i] || 0, heights[size - 1][i] || 0);
      }
      const railsGroup = new THREE.Group();
      railsGroup.name = 'preview-rails';
      railsGroup.userData = { type: 'rail' };
      previewGroup.add(railsGroup);
      const railY = maxEdgeHeight * blockSize + 0.55;
      const halfSpan = (size * blockSize) / 2;
      const edgeOffset = blockSize * 0.6;
      const railLength = size * blockSize + blockSize * 2;
      const railWidth = 0.16;
      const railThickness = 0.06;
      const positions = [
        { x: 0, z: halfSpan + edgeOffset, rotation: 0 },
        { x: 0, z: -halfSpan - edgeOffset, rotation: 0 },
        { x: halfSpan + edgeOffset, z: 0, rotation: Math.PI / 2 },
        { x: -halfSpan - edgeOffset, z: 0, rotation: Math.PI / 2 },
      ];
      const railGeometry = new THREE.BoxGeometry(railLength, railThickness, railWidth);
      const railMaterial = previewAssets.materials.rail.clone();
      railMaterial.transparent = true;
      railMaterial.opacity = 0.8;
      railMaterial.emissive = new THREE.Color('#8ac8ff');
      railMaterial.emissiveIntensity = 0.35;
      const sleeperMaterial = previewAssets.materials.sleeper.clone();
      sleeperMaterial.emissive = new THREE.Color('#3d4656');
      sleeperMaterial.emissiveIntensity = 0.12;
      positions.forEach((entry, index) => {
        const rail = new THREE.Mesh(railGeometry, railMaterial);
        rail.castShadow = true;
        rail.receiveShadow = true;
        rail.position.set(entry.x, railY, entry.z);
        rail.rotation.y = entry.rotation;
        railsGroup.add(rail);
        const sleeperCount = Math.max(6, Math.floor(size * 1.5));
        for (let i = 0; i < sleeperCount; i += 1) {
          const t = sleeperCount > 1 ? i / (sleeperCount - 1) : 0.5;
          const offset = (t - 0.5) * (railLength - blockSize);
          const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, railWidth * 2.4), sleeperMaterial);
          sleeper.receiveShadow = true;
          sleeper.castShadow = false;
          if (entry.rotation === 0) {
            sleeper.position.set(entry.x + offset, railY - railThickness * 0.65, entry.z);
          } else {
            sleeper.position.set(entry.x, railY - railThickness * 0.65, entry.z + offset);
          }
          sleeper.rotation.y = entry.rotation;
          sleeper.rotation.z = previewRandom(index, i) * 0.06 - 0.03;
          railsGroup.add(sleeper);
        }
      });
    }

    function clearPreviewInteractiveEffects() {
      for (let i = previewTreeBursts.length - 1; i >= 0; i -= 1) {
        const system = previewTreeBursts[i];
        if (system.points?.parent) {
          system.points.parent.remove(system.points);
        }
        system.points?.geometry?.dispose?.();
        system.points?.material?.dispose?.();
        previewTreeBursts.splice(i, 1);
      }
      for (let i = previewLootDrops.length - 1; i >= 0; i -= 1) {
        const drop = previewLootDrops[i];
        if (drop.mesh?.parent) {
          drop.mesh.parent.remove(drop.mesh);
        }
        drop.mesh?.geometry?.dispose?.();
        drop.mesh?.material?.dispose?.();
        previewLootDrops.splice(i, 1);
      }
    }

    function attachPreviewInteractionHandlers() {
      if (previewInteractionCleanup || !canvas) return;
      const handleClick = (event) => {
        if (event?.button != null && event.button !== 0) return;
        if (state?.isRunning) return;
        if (!previewState.active) return;
        handlePreviewTreeClick();
      };
      canvas.addEventListener('click', handleClick);
      previewInteractionCleanup = () => {
        canvas.removeEventListener('click', handleClick);
        previewInteractionCleanup = null;
      };
    }

    function detachPreviewInteractionHandlers() {
      if (!previewInteractionCleanup) return;
      previewInteractionCleanup();
    }

    function handlePreviewTreeClick() {
      if (!previewCamera || !previewInteractiveMeshes.size) return;
      previewRayPointer.set(0, 0);
      previewRaycaster.setFromCamera(previewRayPointer, previewCamera);
      const interactiveMeshes = Array.from(previewInteractiveMeshes);
      if (!interactiveMeshes.length) return;
      const intersections = previewRaycaster.intersectObjects(interactiveMeshes, false);
      if (!intersections.length) return;
      const { object, point } = intersections[0];
      const treeGroup = object?.userData?.tree ?? null;
      if (!treeGroup) return;
      const data = treeGroup.userData || { health: 4 };
      const nextHealth = Math.max(0, (data.health ?? 4) - 1);
      data.health = nextHealth;
      treeGroup.userData = data;
      const finalHit = nextHealth <= 0;
      spawnPreviewTreeParticles(treeGroup, point, { finalHit });
      if (!finalHit) {
        return;
      }
      previewInteractiveTrees.delete(treeGroup);
      if (data.meshes) {
        data.meshes.forEach((mesh) => {
          previewInteractiveMeshes.delete(mesh);
        });
      }
      spawnPreviewTreeLoot(treeGroup);
      if (treeGroup.parent) {
        treeGroup.parent.remove(treeGroup);
      }
      treeGroup.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose?.();
        if (child.material && !Object.values(previewAssets.materials).includes(child.material)) {
          child.material.dispose?.();
        }
      });
    }

    function spawnPreviewTreeParticles(treeGroup, impactPoint, options = {}) {
      if (!previewGroup) return;
      const finalHit = Boolean(options.finalHit);
      const count = finalHit ? 28 : 18;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        const baseIndex = i * 3;
        positions[baseIndex] = (Math.random() - 0.5) * 0.35;
        positions[baseIndex + 1] = Math.random() * 0.4;
        positions[baseIndex + 2] = (Math.random() - 0.5) * 0.35;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.6 + Math.random() * 0.8;
        velocities[baseIndex] = Math.cos(angle) * speed * 0.45;
        velocities[baseIndex + 1] = Math.random() * 1.2 + 0.6;
        velocities[baseIndex + 2] = Math.sin(angle) * speed * 0.45;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        size: 0.16,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: new THREE.Color(finalHit ? '#ffd27f' : '#f6c068'),
        sizeAttenuation: true,
        map: getParticleTexture(),
      });
      const points = new THREE.Points(geometry, material);
      if (impactPoint) {
        tmpPreviewTreePosition.copy(impactPoint);
      } else {
        treeGroup.getWorldPosition(tmpPreviewTreePosition);
        tmpPreviewTreePosition.y += (treeGroup.userData?.trunkHeight ?? 3.4) * 0.65;
      }
      if (previewGroup) {
        previewGroup.worldToLocal(tmpPreviewTreePosition);
      }
      points.position.copy(tmpPreviewTreePosition);
      previewGroup.add(points);
      previewTreeBursts.push({
        points,
        positions,
        velocities,
        life: 0,
        maxLife: finalHit ? 1.1 : 0.85,
        gravityScale: 0.6,
        fadePower: 1.6,
        swirlStrength: finalHit ? 0.18 : 0.1,
        swirlFrequency: 5.4,
        count,
      });
    }

    function spawnPreviewTreeLoot(treeGroup) {
      if (!previewGroup) return;
      treeGroup.getWorldPosition(tmpPreviewTreePosition);
      previewGroup.worldToLocal(tmpPreviewTreePosition);
      const drops = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < drops; i += 1) {
        const geometry = new THREE.BoxGeometry(0.26, 0.24, 0.26);
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#b4824b'),
          roughness: 0.58,
          metalness: 0.14,
          transparent: true,
          opacity: 1,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.copy(tmpPreviewTreePosition);
        mesh.position.x += (Math.random() - 0.5) * 0.8;
        mesh.position.z += (Math.random() - 0.5) * 0.8;
        mesh.position.y += (treeGroup.userData?.trunkHeight ?? 3.4) * 0.5 + Math.random() * 0.4;
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        previewGroup.add(mesh);
        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 1.1,
          Math.random() * 1.2 + 0.6,
          (Math.random() - 0.5) * 1.1,
        );
        previewLootDrops.push({ mesh, velocity, life: 0, maxLife: 1.4 });
      }
    }

    function updatePreviewInteractiveEffects(deltaSeconds) {
      if (deltaSeconds <= 0) return;
      for (let i = previewTreeBursts.length - 1; i >= 0; i -= 1) {
        const system = previewTreeBursts[i];
        system.life += deltaSeconds;
        const ratio = system.maxLife > 0 ? system.life / system.maxLife : 1;
        const gravityScale = system.gravityScale ?? 0.5;
        for (let j = 0; j < system.count; j += 1) {
          const baseIndex = j * 3;
          system.velocities[baseIndex + 1] -= 9.81 * deltaSeconds * gravityScale;
          const swirlStrength = system.swirlStrength ?? 0;
          const swirlFrequency = system.swirlFrequency ?? 6;
          if (swirlStrength !== 0) {
            const swirl = Math.sin((system.life + j) * swirlFrequency) * swirlStrength * deltaSeconds;
            system.velocities[baseIndex] += swirl;
            system.velocities[baseIndex + 2] -= swirl;
          }
          system.positions[baseIndex] += system.velocities[baseIndex] * deltaSeconds;
          system.positions[baseIndex + 1] += system.velocities[baseIndex + 1] * deltaSeconds;
          system.positions[baseIndex + 2] += system.velocities[baseIndex + 2] * deltaSeconds;
        }
        system.points.geometry.attributes.position.needsUpdate = true;
        if (system.points.material) {
          const fadePower = system.fadePower ?? 1.6;
          const fade = Math.max(0, 1 - Math.pow(ratio, fadePower));
          system.points.material.opacity = fade;
          system.points.material.needsUpdate = true;
        }
        if (ratio >= 1) {
          if (system.points.parent) {
            system.points.parent.remove(system.points);
          }
          system.points.geometry.dispose();
          system.points.material.dispose();
          previewTreeBursts.splice(i, 1);
        }
      }

      for (let i = previewLootDrops.length - 1; i >= 0; i -= 1) {
        const drop = previewLootDrops[i];
        drop.life += deltaSeconds;
        const ratio = drop.maxLife > 0 ? drop.life / drop.maxLife : 1;
        drop.velocity.y -= 9.81 * deltaSeconds * 0.7;
        drop.mesh.position.addScaledVector(drop.velocity, deltaSeconds);
        if (drop.mesh.position.y < 0.05) {
          drop.mesh.position.y = 0.05;
          drop.velocity.y *= -0.25;
          drop.velocity.x *= 0.7;
          drop.velocity.z *= 0.7;
        }
        drop.mesh.rotation.x += deltaSeconds * 1.4;
        drop.mesh.rotation.y += deltaSeconds * 1.2;
        if (drop.mesh.material) {
          const fade = Math.max(0, 1 - Math.pow(ratio, 1.2));
          drop.mesh.material.opacity = fade;
          drop.mesh.material.needsUpdate = true;
        }
        if (ratio >= 1) {
          if (drop.mesh.parent) {
            drop.mesh.parent.remove(drop.mesh);
          }
          drop.mesh.geometry.dispose();
          drop.mesh.material.dispose();
          previewLootDrops.splice(i, 1);
        }
      }
    }

    function generateIsland() {
      clearPreviewInteractiveEffects();
      previewInteractiveTrees.clear();
      previewInteractiveMeshes.clear();
      const island = buildPreviewIsland();
      buildPreviewTrees(island);
      buildPreviewRails(island);
      attachPreviewInteractionHandlers();
      return island;
    }

    function updatePreviewCameraFrustum() {
      if (!previewCamera) return;
      const width = canvas?.clientWidth || window.innerWidth || 1;
      const height = canvas?.clientHeight || window.innerHeight || 1;
      const aspect = width / Math.max(height, 1);
      if (previewCamera.isPerspectiveCamera) {
        previewCamera.aspect = aspect;
        previewCamera.updateProjectionMatrix();
        return;
      }
      previewCamera.left = -PREVIEW_VIEW_SIZE * aspect;
      previewCamera.right = PREVIEW_VIEW_SIZE * aspect;
      previewCamera.top = PREVIEW_VIEW_SIZE;
      previewCamera.bottom = -PREVIEW_VIEW_SIZE;
      previewCamera.near = 0.1;
      previewCamera.far = 100;
      previewCamera.updateProjectionMatrix();
    }

    function updatePreviewCameraPosition(timestamp = performance?.now ? performance.now() : Date.now()) {
      if (!previewCamera) return;
      const yaw = THREE.MathUtils.clamp(previewState.yaw ?? 0, -PREVIEW_MAX_YAW, PREVIEW_MAX_YAW);
      const pitch = THREE.MathUtils.clamp(previewState.pitch ?? 0, -PREVIEW_MAX_PITCH, PREVIEW_MAX_PITCH);
      previewState.yaw = yaw;
      previewState.pitch = pitch;
      tmpPreviewForward.set(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      );
      if (tmpPreviewForward.lengthSq() < 0.0001) {
        tmpPreviewForward.set(0, 0, -1);
      } else {
        tmpPreviewForward.normalize();
      }
      const bob = Math.sin(timestamp / 520) * 0.028;
      previewCamera.position.copy(previewPlayerPosition);
      previewCamera.position.y = previewPlayerPosition.y + bob;
      tmpPreviewTarget.copy(previewCamera.position).addScaledVector(tmpPreviewForward, PREVIEW_LOOK_DISTANCE);
      previewCamera.up.copy(WORLD_UP);
      previewCamera.lookAt(tmpPreviewTarget);
    }

    function setPreviewYaw(yaw) {
      previewState.yaw = yaw;
      updatePreviewCameraPosition();
    }

    function setPreviewPitch(pitch) {
      previewState.pitch = pitch;
      updatePreviewCameraPosition();
    }

    function createFallbackHand() {
      const group = new THREE.Group();
      const armMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#e4c9a7'),
        roughness: 0.58,
        metalness: 0.05,
      });
      const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.6), armMaterial);
      armMesh.position.set(0, -0.05, -0.3);
      armMesh.castShadow = false;
      armMesh.receiveShadow = false;
      group.add(armMesh);
      const gloveMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#c46b3d'),
        roughness: 0.45,
        metalness: 0.08,
      });
      const gloveMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.18), gloveMaterial);
      gloveMesh.position.set(0, -0.09, -0.66);
      gloveMesh.castShadow = false;
      gloveMesh.receiveShadow = false;
      group.add(gloveMesh);
      return group;
    }

    function getGltfLoaderInstance() {
      if (gltfLoader) {
        return Promise.resolve(gltfLoader);
      }
      if (!SUPPORTS_MODEL_ASSETS) {
        return Promise.reject(new Error('Model assets are disabled.'));
      }
      if (gltfLoaderInstancePromise) {
        return gltfLoaderInstancePromise;
      }
      if (!THREE) {
        return Promise.reject(new Error('THREE.js is unavailable for GLTF loading.'));
      }
      const loaderPromise = ensureGLTFLoader(THREE).then((LoaderCtor) => {
        if (!LoaderCtor) {
          throw new Error('GLTFLoader is unavailable.');
        }
        gltfLoader = new LoaderCtor();
        return gltfLoader;
      });
      gltfLoaderInstancePromise = loaderPromise
        .then((loader) => {
          gltfLoaderInstancePromise = null;
          return loader;
        })
        .catch((error) => {
          gltfLoaderInstancePromise = null;
          throw error;
        });
      return gltfLoaderInstancePromise;
    }

    function loadPreviewHandTemplate() {
      if (previewHandTemplate) {
        return Promise.resolve(previewHandTemplate);
      }
      if (!SUPPORTS_MODEL_ASSETS) {
        previewHandTemplate = createFallbackHand();
        return Promise.resolve(previewHandTemplate);
      }
      if (!previewHandPromise) {
        previewHandPromise = getGltfLoaderInstance()
          .then((loader) =>
            new Promise((resolve) => {
              loader.load(
                MODEL_ASSET_URLS.arm,
                (gltf) => {
                  const template = gltf.scene || gltf.scenes?.[0] || createFallbackHand();
                  previewHandTemplate = template;
                  resolve(template);
                },
                undefined,
                (error) => {
                  console.warn('Failed to load first-person hand model.', error);
                  parseEmbeddedModel(
                    'arm',
                    (embeddedGltf) => {
                      const template = embeddedGltf.scene || embeddedGltf.scenes?.[0] || createFallbackHand();
                      previewHandTemplate = template;
                      resolve(template);
                    },
                    () => {
                      const fallback = createFallbackHand();
                      previewHandTemplate = fallback;
                      resolve(fallback);
                    }
                  );
                },
              );
            })
          )
          .catch((error) => {
            console.warn('GLTFLoader unavailable for preview hand; using fallback.', error);
            const fallback = createFallbackHand();
            previewHandTemplate = fallback;
            return fallback;
          })
          .finally(() => {
            previewHandPromise = null;
          });
      }
      return previewHandPromise.then((template) => {
        previewHandTemplate = template || previewHandTemplate || createFallbackHand();
        return previewHandTemplate;
      });
    }

    function attachPreviewHandOverlay() {
      if (previewHandModel || !previewCamera) return;
      loadPreviewHandTemplate()
        .then((template) => {
          if (!previewCamera) return;
          if (previewHandModel) return;
          const source = template || createFallbackHand();
          const instance = source.clone(true);
          instance.name = 'preview-hand-overlay';
          instance.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = false;
              child.receiveShadow = false;
              if (child.material) {
                const cloned = child.material.clone();
                cloned.depthTest = false;
                cloned.depthWrite = false;
                cloned.transparent = true;
                cloned.opacity = (cloned.opacity ?? 1) * 0.96;
                cloned.side = THREE.DoubleSide;
                child.material = cloned;
              }
            }
          });
          previewHandModel = instance;
          previewCamera.add(previewHandModel);
          previewHandModel.position.copy(previewHandOffset);
          previewHandModel.rotation.set(
            THREE.MathUtils.degToRad(-25),
            THREE.MathUtils.degToRad(25),
            THREE.MathUtils.degToRad(5),
          );
        })
        .catch((error) => {
          console.warn('Unable to attach preview hand overlay.', error);
        });
    }

    function renderPreviewScene(timestamp) {
      if (!previewState.active || !renderer || !previewCamera) return;
      previewAnimationFrame = requestAnimationFrame(renderPreviewScene);
      updatePreviewCameraPosition(timestamp);
      if (previewGroup) {
        previewGroup.position.y = Math.sin(timestamp / 1200) * PREVIEW_BOB_HEIGHT;
      }
      const deltaMs = previewState.lastTimestamp != null ? timestamp - previewState.lastTimestamp : 0;
      if (previewState.lastTimestamp != null) {
        previewState.frameTimes.push(deltaMs);
        if (previewState.frameTimes.length > 90) {
          previewState.frameTimes.shift();
        }
        const average = previewState.frameTimes.reduce((sum, value) => sum + value, 0) / previewState.frameTimes.length;
        if (!previewState.wireframe && average > 40) {
          previewState.wireframe = true;
          applyPreviewWireframe(true);
        } else if (previewState.wireframe && average < 28) {
          previewState.wireframe = false;
          applyPreviewWireframe(false);
        }
      }
      previewState.lastTimestamp = timestamp;
      if (deltaMs > 0) {
        updatePreviewInteractiveEffects(deltaMs / 1000);
      }
      const cycleRatio = PREVIEW_DAY_LENGTH > 0 ? (timestamp % PREVIEW_DAY_LENGTH) / PREVIEW_DAY_LENGTH : 0;
      const nightStrength = 1 - (0.5 + 0.5 * Math.sin(cycleRatio * Math.PI * 2));
      if (scene?.fog) {
        tmpColorA.set('#87ceeb');
        tmpColorB.set('#0b1d36');
        tmpColorC.copy(tmpColorA).lerp(tmpColorB, nightStrength);
        scene.fog.color.copy(tmpColorC);
        scene.fog.density = THREE.MathUtils.lerp(0.012, 0.028, nightStrength);
        renderer.setClearColor(tmpColorC, 1);
      }
      if (hemiLight) {
        tmpColorA.set('#fff3d4');
        tmpColorB.set('#314b6b');
        hemiLight.color.copy(tmpColorA).lerp(tmpColorB, nightStrength);
        tmpColorC.set('#4c6b3b');
        tmpColorD.set('#1e2a2f');
        hemiLight.groundColor.copy(tmpColorC).lerp(tmpColorD, nightStrength * 0.6);
        hemiLight.intensity = THREE.MathUtils.lerp(1.15, 0.45, nightStrength);
      }
      const sunAngle = cycleRatio * Math.PI * 2;
      if (sunLight) {
        sunLight.intensity = THREE.MathUtils.lerp(1.2, 0.15, nightStrength);
        sunLight.position.set(Math.sin(sunAngle) * 10, THREE.MathUtils.lerp(14, 6, nightStrength), Math.cos(sunAngle) * 6);
      }
      if (moonLight) {
        const moonAngle = sunAngle + Math.PI;
        moonLight.intensity = THREE.MathUtils.lerp(0.08, 0.6, nightStrength);
        moonLight.position.set(Math.sin(moonAngle) * 10, 8, Math.cos(moonAngle) * 6);
      }
      if (previewHandModel) {
        const sway = Math.sin(timestamp / 620) * 0.06;
        const bob = Math.sin(timestamp / 460) * 0.045;
        previewHandModel.position.set(
          previewHandOffset.x + sway * 0.4,
          previewHandOffset.y + bob,
          previewHandOffset.z,
        );
        previewHandModel.rotation.set(
          THREE.MathUtils.degToRad(-25 + bob * -40),
          THREE.MathUtils.degToRad(25 + sway * 18),
          THREE.MathUtils.degToRad(5),
        );
      }
      renderer.render(scene, previewCamera);
    }

    function teardownPreviewScene() {
      if (!previewState.active) return;
      previewState.active = false;
      previewState.frameTimes = [];
      previewState.lastTimestamp = null;
      detachPreviewInteractionHandlers();
      clearPreviewInteractiveEffects();
      previewInteractiveTrees.clear();
      previewInteractiveMeshes.clear();
      if (previewAnimationFrame != null) {
        cancelAnimationFrame(previewAnimationFrame);
        previewAnimationFrame = null;
      }
      if (previewGroup) {
        const disposable = new Set();
        previewGroup.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) disposable.add(child.geometry);
            if (child.material && !Object.values(previewAssets.materials).includes(child.material)) {
              disposable.add(child.material);
            }
          }
        });
        disposable.forEach((resource) => {
          try {
            resource.dispose?.();
          } catch (error) {
            // Ignore disposal errors for preview assets.
          }
        });
        scene.remove(previewGroup);
        previewGroup = null;
      }
      if (worldGroup) worldGroup.visible = true;
      if (entityGroup) entityGroup.visible = true;
      if (particleGroup) particleGroup.visible = true;
      if (previewHandModel && previewHandModel.parent) {
        previewHandModel.parent.remove(previewHandModel);
      }
      previewHandModel = null;
      previewCamera = null;
      applyPreviewWireframe(false);
      if (scene?.fog) {
        scene.fog.color.set(BASE_ATMOSPHERE.fogColor);
        scene.fog.density = BASE_ATMOSPHERE.fogDensity;
      }
    }

    function setupPreviewScene() {
      if (!renderer || !scene) return;
      if (state?.isRunning) {
        teardownPreviewScene();
        return;
      }
      if (previewState.active) return;
      previewState.seed = Math.random() * 1000 + 1;
      previewState.yaw = 0;
      previewState.pitch = -0.18;
      previewState.frameTimes = [];
      previewState.lastTimestamp = null;
      previewState.wireframe = false;
      applyPreviewWireframe(false);
      previewGroup = new THREE.Group();
      previewGroup.name = 'preview-island';
      scene.add(previewGroup);
      if (worldGroup) worldGroup.visible = false;
      if (entityGroup) entityGroup.visible = false;
      if (particleGroup) particleGroup.visible = false;
      if (scene?.fog) {
        scene.fog.color.set('#87ceeb');
        scene.fog.density = 0.018;
      }
      renderer?.setClearColor?.('#87ceeb', 1);
      if (hemiLight) {
        hemiLight.color.set('#87ceeb');
        hemiLight.groundColor.set('#98fb98');
        hemiLight.intensity = 1.05;
      }
      if (sunLight) {
        sunLight.intensity = 0.85;
        sunLight.position.set(8, 12, 6);
        sunLight.castShadow = true;
      }
      const island = generateIsland();
      if (island?.spawn) {
        const spawnHeight = (island.spawn.height ?? 1) * (island.blockSize ?? PREVIEW_BLOCK_SIZE);
        previewState.spawnHeight = spawnHeight;
        previewPlayerPosition.set(
          island.spawn.worldX ?? 0,
          spawnHeight + PREVIEW_PLAYER_EYE_HEIGHT,
          (island.spawn.worldZ ?? PREVIEW_PLAYER_STAND_OFFSET) + 0.05,
        );
      } else {
        const fallbackHeight = PREVIEW_BLOCK_SIZE;
        previewState.spawnHeight = fallbackHeight;
        previewPlayerPosition.set(0, fallbackHeight + PREVIEW_PLAYER_EYE_HEIGHT, PREVIEW_PLAYER_STAND_OFFSET);
      }
      previewCamera = new THREE.PerspectiveCamera(PREVIEW_FOV, 1, 0.1, 200);
      updatePreviewCameraFrustum();
      updatePreviewCameraPosition();
      attachPreviewHandOverlay();
      previewState.active = true;
      renderPreviewScene(performance?.now ? performance.now() : Date.now());
    }

    function resetWorldMeshes() {
      tileRenderState = [];
      tileUpdateQueue.clear();
      animatedTileRenderInfos.clear();
      fullWorldRefreshPending = true;
      clearMiningState();
      hideHoverHighlights();
      if (worldTilesRoot) {
        while (worldTilesRoot.children.length) {
          worldTilesRoot.remove(worldTilesRoot.children[0]);
        }
      }
      if (particleGroup) {
        while (particleGroup.children.length) {
          const child = particleGroup.children[0];
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
          particleGroup.remove(child);
        }
      }
      particleSystems.length = 0;
    }

    function ensureTileGroups() {
      if (!worldTilesRoot) return;
      if (tileRenderState.length === state.height && tileRenderState[0]?.length === state.width) return;
      resetWorldMeshes();
      for (let y = 0; y < state.height; y++) {
        tileRenderState[y] = [];
        for (let x = 0; x < state.width; x++) {
          const group = new THREE.Group();
          const { x: sx, z: sz } = worldToScene(x, y);
          group.position.set(sx, 0, sz);
          worldTilesRoot.add(group);
          tileRenderState[y][x] = {
            group,
            signature: null,
            animations: {},
            x,
            y,
          };
        }
      }
    }

    function markTileDirty(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix < 0 || iy < 0 || ix >= state.width || iy >= state.height) {
        return;
      }
      tileUpdateQueue.add(`${ix}|${iy}`);
    }

    function markAllTilesDirty() {
      if (!Number.isFinite(state?.width) || !Number.isFinite(state?.height)) {
        return;
      }
      fullWorldRefreshPending = true;
    }

    function syncAnimatedTileTracking(renderInfo) {
      if (!renderInfo) return;
      const animations = renderInfo.animations || {};
      const hasAnimations = Object.keys(animations).some((key) => Boolean(animations[key]));
      if (hasAnimations) {
        animatedTileRenderInfos.add(renderInfo);
      } else if (animatedTileRenderInfos.has(renderInfo)) {
        animatedTileRenderInfos.delete(renderInfo);
      }
    }

    function addBlock(group, options) {
      const {
        color = '#ffffff',
        height = 1,
        width = 1,
        depth = 1,
        y = height / 2,
        geometry = BASE_GEOMETRY,
        material = null,
        transparent = false,
        opacity = 1,
        emissive,
        emissiveIntensity = 0,
        roughness = 0.85,
        metalness = 0.05,
        doubleSide = false,
      } = options;
      let mat = material;
      if (!mat) {
        const materialOptions = {
          color: new THREE.Color(color),
          roughness,
          metalness,
          transparent,
          opacity,
          side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        };
        if (emissive !== undefined) {
          materialOptions.emissive = new THREE.Color(emissive);
          materialOptions.emissiveIntensity = emissiveIntensity;
        }
        mat = new THREE.MeshStandardMaterial(materialOptions);
      }
      const mesh = new THREE.Mesh(geometry, mat);
      const materialOpacity = mat && typeof mat.opacity === 'number' ? mat.opacity : undefined;
      const materialIsTransparent =
        transparent || (mat && mat.transparent) || (materialOpacity !== undefined && materialOpacity < 1);
      mesh.castShadow = !materialIsTransparent;
      mesh.receiveShadow = true;
      mesh.scale.set(width, height, depth);
      mesh.position.y = y;
      group.add(mesh);
      return mesh;
    }

    function addTopPlate(group, color, height, opacity = 0.72) {
      const plate = new THREE.Mesh(PLANE_GEOMETRY, getAccentMaterial(color, opacity));
      plate.rotation.x = -Math.PI / 2;
      plate.position.y = height + 0.01;
      plate.receiveShadow = true;
      group.add(plate);
      return plate;
    }

    const PORTAL_UNIFORM_KEYS = ['uTime', 'uActivation', 'uColor', 'uOpacity'];

    function collectPortalSurfaceMaterialsFromGroup(group) {
      if (!group?.children?.length) {
        return [];
      }

      const collected = [];
      const seen = new Set();

      group.children.forEach((child) => {
        if (!child) return;
        const { material } = child;
        if (Array.isArray(material)) {
          material.forEach((mat) => {
            if (mat?.userData?.portalSurface && !seen.has(mat)) {
              seen.add(mat);
              collected.push(mat);
            }
          });
        } else if (material?.userData?.portalSurface && !seen.has(material)) {
          seen.add(material);
          collected.push(material);
        }
      });

      return collected;
    }

    function hasValidPortalUniformStructure(uniforms) {
      if (!uniforms || typeof uniforms !== 'object') {
        return false;
      }
      const entries = Object.entries(uniforms).filter(
        ([key]) => !RESERVED_UNIFORM_CONTAINER_KEYS.has(key)
      );
      if (!entries.length) {
        return false;
      }
      const hasRequiredUniforms = PORTAL_UNIFORM_KEYS.every((key) => {
        const uniform = uniforms[key];
        return Boolean(uniform && typeof uniform === 'object' && 'value' in uniform);
      });
      if (!hasRequiredUniforms) {
        return false;
      }
      return entries.every(([, uniform]) =>
        Boolean(uniform && typeof uniform === 'object' && 'value' in uniform)
      );
    }

    function ensurePortalShaderMaterialsHaveUniformValues(
      materials,
      metadata = null,
      { forceExpectPortal = false } = {}
    ) {
      if (!Array.isArray(materials) || materials.length === 0) {
        return false;
      }

      let ensuredAny = false;

      materials.forEach((material) => {
        if (!material || typeof material !== 'object') {
          return;
        }

        const portalMetadata = material?.userData?.portalSurface ?? null;
        const accentColor =
          metadata?.accentColor ?? portalMetadata?.accentColor ?? '#7b6bff';
        const isActive =
          typeof metadata?.isActive === 'boolean'
            ? metadata.isActive
            : typeof portalMetadata?.isActive === 'boolean'
            ? portalMetadata.isActive
            : Boolean(portalMetadata?.isActive);

        const isShaderMaterial =
          material?.isShaderMaterial === true || material?.type === 'ShaderMaterial';
        const hasPortalUniforms = hasValidPortalUniformStructure(material.uniforms);
        const usesPortalShader = materialUsesPortalSurfaceShader(material);

        const shouldInspectPortalUniforms =
          forceExpectPortal || isShaderMaterial || hasPortalUniforms || usesPortalShader;
        const hasPortalMetadata = Boolean(portalMetadata);

        if (!shouldInspectPortalUniforms) {
          if (hasPortalMetadata) {
            portalMetadata.accentColor = accentColor;
            portalMetadata.isActive = isActive;
          }
          return;
        }

        let ensured = false;

        const wasValid = hasValidPortalUniformStructure(material.uniforms);
        const modified = ensurePortalUniformIntegrity(material, {
          missingKeys: PORTAL_UNIFORM_KEYS,
          expectPortal: true,
          metadata: { accentColor, isActive },
        });
        let isValid = hasValidPortalUniformStructure(material.uniforms);

        const safeUniformContainer = (() => {
          const previousUniforms = material.uniforms;
          const uniforms = guardUniformContainer(material.uniforms);
          if (uniforms && material.uniforms !== uniforms) {
            try {
              material.uniforms = uniforms;
              if (material.uniforms === uniforms && previousUniforms !== uniforms) {
                resetMaterialUniformCache(material);
              }
            } catch (assignError) {
              // Ignore assignment failures – we'll fall back to the existing reference.
            }
          }
          return uniforms || material.uniforms;
        })();

        const enforcePortalUniformPresence = () => {
          const uniforms = safeUniformContainer;
          if (!uniforms || typeof uniforms !== 'object') {
            return false;
          }

          let updated = false;
          const defaults = {
            uTime: () => 0,
            uActivation: () => (isActive ? 1 : 0.18),
            uOpacity: () => (isActive ? 0.85 : 0.55),
            uColor: () =>
              typeof THREE?.Color === 'function'
                ? new THREE.Color(accentColor ?? '#7b6bff')
                : accentColor ?? '#7b6bff',
          };

          PORTAL_UNIFORM_KEYS.forEach((key) => {
            const ensureValue = defaults[key];
            if (!ensureValue) {
              return;
            }
            const entry = uniforms[key];
            if (!entry || typeof entry !== 'object') {
              uniforms[key] = { value: ensureValue() };
              updated = true;
              return;
            }
            if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
              if (!assignPortalUniformValue(entry, ensureValue())) {
                uniforms[key] = { value: ensureValue() };
              }
              updated = true;
              return;
            }
            if (typeof entry.value === 'undefined') {
              if (!assignPortalUniformValue(entry, ensureValue())) {
                entry.value = ensureValue();
              }
              updated = true;
            }
          });

          if (updated) {
            const cacheReset = resetMaterialUniformCache(material);
            if (!cacheReset) {
              if ('uniformsNeedUpdate' in material) {
                material.uniformsNeedUpdate = true;
              }
              if ('needsUpdate' in material) {
                material.needsUpdate = true;
              }
            }
          }

          return updated;
        };

        if (!isValid && shouldInspectPortalUniforms) {
          const fallbackUniforms = guardUniformContainer({
            uTime: { value: 0 },
            uActivation: { value: isActive ? 1 : 0.18 },
            uColor: {
              value:
                typeof THREE?.Color === 'function'
                  ? new THREE.Color(accentColor ?? '#7b6bff')
                  : accentColor ?? '#7b6bff',
            },
            uOpacity: { value: isActive ? 0.85 : 0.55 },
          });
          try {
            const previousUniforms = material.uniforms;
            material.uniforms = fallbackUniforms;
            if (material.uniforms === fallbackUniforms && previousUniforms !== fallbackUniforms) {
              resetMaterialUniformCache(material);
            }
            isValid = hasValidPortalUniformStructure(material.uniforms);
            if (isValid) {
              if ('uniformsNeedUpdate' in material) {
                material.uniformsNeedUpdate = true;
              }
              if ('needsUpdate' in material) {
                material.needsUpdate = true;
              }
              ensured = true;
            }
          } catch (uniformAssignError) {
            console.warn(
              'Failed to repair portal shader uniforms; continuing with existing fallback handling.',
              uniformAssignError
            );
          }
        }

        if (enforcePortalUniformPresence()) {
          ensured = true;
          isValid = hasValidPortalUniformStructure(material.uniforms);
        }

        if (isValid && (!wasValid || modified)) {
          if ('needsUpdate' in material) {
            material.needsUpdate = true;
          }
          if ('uniformsNeedUpdate' in material) {
            material.uniformsNeedUpdate = true;
          }
          ensured = true;
        }

        if (hasPortalMetadata) {
          portalMetadata.accentColor = accentColor;
          portalMetadata.isActive = isActive;
        }

        ensuredAny = ensuredAny || ensured;
      });

      return ensuredAny;
    }

    function parsePortalAccentColor(color, fallback = '#7b6bff') {
      if (!color) {
        return fallback;
      }
      if (typeof color === 'string') {
        return color;
      }
      if (typeof color === 'object') {
        if (typeof color.getHexString === 'function') {
          return `#${color.getHexString()}`;
        }
        if (Array.isArray(color) && color.length >= 3) {
          const clamp = (value) => Math.min(255, Math.max(0, Math.round(value * 255)));
          const [r, g, b] = color;
          return `#${((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, '0')}`;
        }
      }
      return fallback;
    }

    function inferPortalMaterialState(material, defaults = {}) {
      const accentDefault = defaults.accentColor ?? '#7b6bff';
      const activeDefault = typeof defaults.isActive === 'boolean' ? defaults.isActive : false;
      let accentColor = accentDefault;
      let isActive = activeDefault;
      const uniforms = material?.uniforms;

      if (uniforms && typeof uniforms === 'object') {
        const colorUniform = uniforms.uColor;
        if (colorUniform && typeof colorUniform === 'object') {
          accentColor = parsePortalAccentColor(colorUniform.value, accentColor);
        }
        const activationUniform = uniforms.uActivation;
        if (activationUniform && typeof activationUniform === 'object') {
          const { value } = activationUniform;
          if (typeof value === 'number' && Number.isFinite(value)) {
            isActive = value >= 0.4;
          }
        }
      }

      return { accentColor, isActive };
    }

    function materialUsesPortalSurfaceShader(material) {
      if (!material || typeof material !== 'object') {
        return false;
      }

      const fragmentShader = typeof material.fragmentShader === 'string' ? material.fragmentShader : '';
      const vertexShader = typeof material.vertexShader === 'string' ? material.vertexShader : '';

      if (fragmentShader === PORTAL_FRAGMENT_SHADER && vertexShader === PORTAL_VERTEX_SHADER) {
        return true;
      }

      const uniforms = material.uniforms;
      let matchedUniforms = 0;
      if (uniforms && typeof uniforms === 'object') {
        PORTAL_UNIFORM_KEYS.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(uniforms, key)) {
            matchedUniforms += 1;
          }
        });
        if (matchedUniforms >= 3) {
          return true;
        }
      }

      if (fragmentShader || vertexShader) {
        let referenced = 0;
        PORTAL_UNIFORM_KEYS.forEach((key) => {
          if ((fragmentShader && fragmentShader.includes(key)) || (vertexShader && vertexShader.includes(key))) {
            referenced += 1;
          }
        });
        if (referenced >= 3) {
          return true;
        }
      }

      return false;
    }

    function assignPortalUniformValue(uniform, nextValue) {
      if (!uniform || typeof uniform !== 'object') {
        return false;
      }

      const applyValue = (value) => {
        try {
          uniform.value = value;
          return true;
        } catch (assignError) {
          try {
            Object.defineProperty(uniform, 'value', {
              configurable: true,
              enumerable: true,
              writable: true,
              value,
            });
            return true;
          } catch (defineError) {
            return false;
          }
        }
      };

      if (!Object.prototype.hasOwnProperty.call(uniform, 'value')) {
        return applyValue(nextValue);
      }

      const currentValue = uniform.value;

      if (currentValue && typeof currentValue === 'object') {
        if (typeof currentValue.copy === 'function' && nextValue && typeof nextValue === 'object' && currentValue !== nextValue) {
          try {
            currentValue.copy(nextValue);
            return true;
          } catch (copyError) {
            // Ignore copy failures and fall back to direct assignment.
          }
        }
        if (typeof currentValue.set === 'function' && typeof nextValue !== 'undefined') {
          try {
            currentValue.set(nextValue);
            return true;
          } catch (setError) {
            // Ignore set failures and fall back to direct assignment.
          }
        }
      }

      return applyValue(nextValue);
    }

    const RESERVED_UNIFORM_CONTAINER_KEYS = new Set([
      'seq',
      'map',
      'clone',
      'dispose',
      'onBeforeCompile',
      'isUniformsGroup',
    ]);

    const PORTAL_UNIFORM_CONTAINER_PROXIES = new WeakMap();
    const PORTAL_UNIFORM_PROXY_TARGETS = new WeakMap();

    function resetMaterialUniformCache(material) {
      if (!material || typeof material !== 'object') {
        return false;
      }
      if (!renderer || !renderer.properties || typeof renderer.properties.remove !== 'function') {
        return false;
      }
      try {
        renderer.properties.remove(material);
      } catch (error) {
        return false;
      }
      if ('uniformsNeedUpdate' in material) {
        material.uniformsNeedUpdate = true;
      }
      if ('needsUpdate' in material) {
        material.needsUpdate = true;
      }
      return true;
    }

    function guardUniformContainer(container) {
      if (!container || typeof container !== 'object') {
        return container;
      }

      if (container.isUniformsGroup === true) {
        return container;
      }

      if (Array.isArray(container.seq) && typeof container.map === 'object') {
        return container;
      }

      if (PORTAL_UNIFORM_PROXY_TARGETS.has(container)) {
        return container;
      }

      const existingProxy = PORTAL_UNIFORM_CONTAINER_PROXIES.get(container);
      if (existingProxy) {
        return existingProxy;
      }

      const proxy = new Proxy(container, {
        get(target, key, receiver) {
          if (typeof key === 'symbol') {
            return Reflect.get(target, key, receiver);
          }

          const normalizedKey = `${key}`;
          if (!normalizedKey || RESERVED_UNIFORM_CONTAINER_KEYS.has(normalizedKey)) {
            return Reflect.get(target, key, receiver);
          }

          if (Object.prototype.hasOwnProperty.call(target, normalizedKey)) {
            const entry = target[normalizedKey];
            if (!entry || typeof entry !== 'object') {
              const placeholder = { value: null };
              target[normalizedKey] = placeholder;
              return placeholder;
            }

            if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
              if (!assignPortalUniformValue(entry, null)) {
                const placeholder = { value: null };
                target[normalizedKey] = placeholder;
                return placeholder;
              }
            } else if (typeof entry.value === 'undefined') {
              assignPortalUniformValue(entry, null);
            }

            return entry;
          }

          const placeholder = { value: null };
          target[normalizedKey] = placeholder;
          return placeholder;
        },
        set(target, key, value) {
          if (typeof key === 'symbol') {
            target[key] = value;
            return true;
          }

          const normalizedKey = `${key}`;
          if (!normalizedKey) {
            target[key] = value;
            return true;
          }

          if (RESERVED_UNIFORM_CONTAINER_KEYS.has(normalizedKey)) {
            target[normalizedKey] = value;
            return true;
          }

          if (Array.isArray(value)) {
            target[normalizedKey] = value;
            return true;
          }

          if (value && typeof value === 'object') {
            if (
              Object.prototype.hasOwnProperty.call(value, 'value') ||
              typeof value.setValue === 'function'
            ) {
              target[normalizedKey] = value;
              return true;
            }
          }

          const resolvedValue = typeof value === 'undefined' ? null : value;
          const existing = target[normalizedKey];
          if (existing && typeof existing === 'object') {
            if (Object.prototype.hasOwnProperty.call(existing, 'value')) {
              assignPortalUniformValue(existing, resolvedValue);
              return true;
            }
            if (typeof existing.setValue === 'function') {
              try {
                existing.setValue(resolvedValue);
                return true;
              } catch (setError) {
                // Ignore and fall back to wrapping below.
              }
            }
          }

          target[normalizedKey] = { value: resolvedValue };
          return true;
        },
        deleteProperty(target, key) {
          if (typeof key === 'symbol') {
            return Reflect.deleteProperty(target, key);
          }

          const normalizedKey = `${key}`;
          if (!normalizedKey) {
            return true;
          }

          if (!Object.prototype.hasOwnProperty.call(target, normalizedKey)) {
            return true;
          }

          const entry = target[normalizedKey];
          if (entry && typeof entry === 'object') {
            if (Object.prototype.hasOwnProperty.call(entry, 'value')) {
              assignPortalUniformValue(entry, null);
              return true;
            }
            if (typeof entry.setValue === 'function') {
              try {
                entry.setValue(null);
                return true;
              } catch (setError) {
                // Ignore and fall through to wrapping below.
              }
            }
          }

          target[normalizedKey] = { value: null };
          return true;
        },
      });

      PORTAL_UNIFORM_CONTAINER_PROXIES.set(container, proxy);
      PORTAL_UNIFORM_PROXY_TARGETS.set(proxy, container);
      return proxy;
    }

    function ensureDistanceMaterialUniformIntegrity(material) {
      if (!material || typeof material !== 'object') {
        return { modified: false, requiresRendererReset: false };
      }

      const isDistanceMaterial =
        material.isMeshDistanceMaterial === true || material.type === 'MeshDistanceMaterial';
      if (!isDistanceMaterial) {
        return { modified: false, requiresRendererReset: false };
      }

      const createVector3 = () => {
        if (typeof THREE?.Vector3 === 'function') {
          return new THREE.Vector3();
        }
        return {
          x: 0,
          y: 0,
          z: 0,
          set(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
          },
          copy(target) {
            if (target && typeof target === 'object') {
              if (typeof target.x === 'number') {
                this.x = target.x;
              }
              if (typeof target.y === 'number') {
                this.y = target.y;
              }
              if (typeof target.z === 'number') {
                this.z = target.z;
              }
            }
            return this;
          },
          setFromMatrixPosition() {
            return this;
          },
        };
      };

      let uniforms = material.uniforms;
      if (!uniforms || typeof uniforms !== 'object') {
        uniforms = {};
      }

      const previousUniforms = material.uniforms;
      const guardedUniforms = guardUniformContainer(uniforms);
      if (guardedUniforms && guardedUniforms !== uniforms) {
        uniforms = guardedUniforms;
      }

      if (material.uniforms !== uniforms) {
        try {
          material.uniforms = uniforms;
          if (material.uniforms === uniforms && previousUniforms !== uniforms) {
            resetMaterialUniformCache(material);
          }
        } catch (assignError) {
          return { modified: false, requiresRendererReset: false };
        }
      }

      let modified = false;
      let requiresRendererReset = false;

      const ensureVectorUniform = (key) => {
        let entry = uniforms[key];
        if (!entry || typeof entry !== 'object') {
          uniforms[key] = { value: createVector3() };
          modified = true;
          requiresRendererReset = true;
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
          entry.value = createVector3();
          modified = true;
          return;
        }
        const value = entry.value;
        if (!value || typeof value.setFromMatrixPosition !== 'function') {
          entry.value = createVector3();
          modified = true;
        }
      };

      const ensureNumberUniform = (key, fallback) => {
        let entry = uniforms[key];
        if (!entry || typeof entry !== 'object') {
          uniforms[key] = { value: fallback };
          modified = true;
          requiresRendererReset = true;
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
          entry.value = fallback;
          modified = true;
          return;
        }
        const value = entry.value;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          entry.value = fallback;
          modified = true;
        }
      };

      ensureVectorUniform('referencePosition');
      ensureNumberUniform('nearDistance', 1);
      ensureNumberUniform('farDistance', 1000);

      return { modified, requiresRendererReset };
    }

    function ensurePortalUniformIntegrity(
      material,
      { missingKeys = [], expectPortal = false, metadata = null } = {}
    ) {
      if (!material || typeof material !== 'object') {
        return false;
      }

      let uniforms = material.uniforms;
      if (!uniforms || typeof uniforms !== 'object') {
        uniforms = {};
      }

      const isUniformsGroup =
        uniforms.isUniformsGroup === true ||
        (Array.isArray(uniforms.seq) && typeof uniforms.map === 'object');

      let cacheResetNeeded = false;

      const ensureUniformsGroupEntry = (key, resolvedDefault) => {
        if (!uniforms.map || typeof uniforms.map !== 'object') {
          uniforms.map = {};
        }
        if (!Array.isArray(uniforms.seq)) {
          uniforms.seq = [];
        }

        let container = uniforms.map[key];
        let containerModified = false;

        const ensureContainerShape = () => {
          if (!container || typeof container !== 'object') {
            const uniform = { value: resolvedDefault };
            container = {
              id: `${key}`,
              name: `${key}`,
              cache: [],
              uniform,
              value: resolvedDefault,
              setValue(value) {
                this.value = value;
                if (this.uniform && typeof this.uniform === 'object') {
                  this.uniform.value = value;
                }
                return this;
              },
              updateCache() {},
            };
            containerModified = true;
          }

          if (!container.uniform || typeof container.uniform !== 'object') {
            container.uniform = { value: resolvedDefault };
            containerModified = true;
          }

          if (!Array.isArray(container.cache)) {
            container.cache = [];
            containerModified = true;
          }

          if (typeof container.setValue !== 'function') {
            container.setValue = function setValue(value) {
              this.value = value;
              if (this.uniform && typeof this.uniform === 'object') {
                this.uniform.value = value;
              }
              return this;
            };
            containerModified = true;
          }

          if (typeof container.updateCache !== 'function') {
            container.updateCache = () => {};
            containerModified = true;
          }

          if (!Object.prototype.hasOwnProperty.call(container, 'value')) {
            container.value = resolvedDefault;
            containerModified = true;
          }

          if (!Object.prototype.hasOwnProperty.call(container.uniform, 'value')) {
            container.uniform.value = resolvedDefault;
            containerModified = true;
          }

          return container;
        };

        const targetContainer = ensureContainerShape();

        if (!uniforms.map[key] || uniforms.map[key] !== targetContainer) {
          uniforms.map[key] = targetContainer;
          containerModified = true;
        }

        if (!uniforms.seq.includes(targetContainer)) {
          uniforms.seq.push(targetContainer);
          containerModified = true;
        }

        const uniformEntry = targetContainer.uniform;
        if (containerModified) {
          cacheResetNeeded = true;
        }
        return { uniformEntry, containerModified, container: targetContainer };
      };

      const previousUniforms = material.uniforms;
      const guardedUniforms = guardUniformContainer(uniforms);
      if (guardedUniforms && guardedUniforms !== uniforms) {
        uniforms = guardedUniforms;
      }

      if (material.uniforms !== uniforms) {
        try {
          material.uniforms = uniforms;
          if (material.uniforms === uniforms && previousUniforms !== uniforms) {
            resetMaterialUniformCache(material);
          }
        } catch (assignError) {
          return false;
        }
      }

      const resolveDefault = (value) => (typeof value === 'function' ? value() : value);
      let modified = false;

      const ensureUniformEntry = (key, defaultValue = null) => {
        if (!key) {
          return null;
        }
        const resolvedDefault = resolveDefault(defaultValue);

        if (isUniformsGroup) {
          const { uniformEntry, containerModified, container } = ensureUniformsGroupEntry(
            key,
            resolvedDefault
          );
          if (!uniformEntry || typeof uniformEntry !== 'object') {
            return null;
          }
          if (!Object.prototype.hasOwnProperty.call(uniformEntry, 'value')) {
            uniformEntry.value = resolvedDefault;
            modified = true;
            cacheResetNeeded = true;
          } else if (typeof uniformEntry.value === 'undefined') {
            uniformEntry.value = resolvedDefault;
            modified = true;
            cacheResetNeeded = true;
          }
          if (container && container.value !== uniformEntry.value) {
            container.value = uniformEntry.value;
            modified = true;
            cacheResetNeeded = true;
          }
          if (containerModified) {
            modified = true;
            cacheResetNeeded = true;
          }
          return uniformEntry;
        }

        const replaceEntry = () => {
          const replacement = { value: resolvedDefault };
          uniforms[key] = replacement;
          modified = true;
          cacheResetNeeded = true;
          return replacement;
        };

        let entry = uniforms[key];
        if (!entry || typeof entry !== 'object') {
          return replaceEntry();
        }
        if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
          if (typeof entry.setValue === 'function') {
            try {
              entry.setValue(resolvedDefault);
              modified = true;
              cacheResetNeeded = true;
              return entry;
            } catch (setError) {
              // Ignore failures and fall back to assignPortalUniformValue.
            }
          }
          if (assignPortalUniformValue(entry, resolvedDefault)) {
            modified = true;
            cacheResetNeeded = true;
            return entry;
          }
          return replaceEntry();
        }
        if (typeof entry.value === 'undefined') {
          if (assignPortalUniformValue(entry, resolvedDefault)) {
            modified = true;
            cacheResetNeeded = true;
            return entry;
          }
          return replaceEntry();
        }
        return entry;
      };

      const iterateUniformKeys = () => {
        if (isUniformsGroup) {
          if (uniforms.map && typeof uniforms.map === 'object') {
            Object.keys(uniforms.map).forEach((key) => {
              if (RESERVED_UNIFORM_CONTAINER_KEYS.has(key)) {
                return;
              }
              const entryContainer = uniforms.map[key];
              const uniform =
                entryContainer && typeof entryContainer === 'object'
                  ? entryContainer.uniform && typeof entryContainer.uniform === 'object'
                    ? entryContainer.uniform
                    : entryContainer
                  : null;
              if (!uniform || typeof uniform !== 'object' || !Object.prototype.hasOwnProperty.call(uniform, 'value')) {
                ensureUniformEntry(key, null);
              }
            });
          }
          return;
        }

        Object.keys(uniforms).forEach((key) => {
          if (RESERVED_UNIFORM_CONTAINER_KEYS.has(key)) {
            return;
          }
          const entry = uniforms[key];
          if (!entry || typeof entry !== 'object' || !Object.prototype.hasOwnProperty.call(entry, 'value')) {
            ensureUniformEntry(key, null);
          }
        });
      };

      iterateUniformKeys();

      missingKeys.forEach((key) => {
        ensureUniformEntry(key, null);
      });

      if (expectPortal) {
        const accent = metadata?.accentColor ?? '#7b6bff';
        const isActive = Boolean(metadata?.isActive);
        const ensureNumberUniformValue = (key, fallback) => {
          const entry = ensureUniformEntry(key, fallback);
          if (!entry || typeof entry !== 'object') {
            return;
          }
          const fallbackValue = resolveDefault(fallback);
          const value = entry.value;
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            entry.value = fallbackValue;
            modified = true;
            cacheResetNeeded = true;
          }
        };

        const ensureColorUniformValue = (key, fallback) => {
          const entry = ensureUniformEntry(key, fallback);
          if (!entry || typeof entry !== 'object') {
            return;
          }
          const fallbackValue = resolveDefault(fallback);

          if (typeof THREE?.Color === 'function') {
            const ensureColorInstance = (value) => {
              if (value && typeof value === 'object' && value.isColor === true) {
                return value;
              }
              if (value && typeof value.getHexString === 'function') {
                return value;
              }
              try {
                return new THREE.Color(value ?? accent ?? '#7b6bff');
              } catch (colorError) {
                return new THREE.Color(accent ?? '#7b6bff');
              }
            };

            const current = entry.value;
            if (!current || typeof current !== 'object' || current.isColor !== true) {
              entry.value = ensureColorInstance(fallbackValue);
              modified = true;
              cacheResetNeeded = true;
            }
          } else {
            const normalized =
              typeof fallbackValue === 'string' && fallbackValue
                ? fallbackValue
                : accent ?? '#7b6bff';
            if (typeof entry.value !== 'string' || !entry.value) {
              entry.value = normalized;
              modified = true;
              cacheResetNeeded = true;
            }
          }
        };

        ensureNumberUniformValue('uTime', 0);
        ensureNumberUniformValue('uActivation', isActive ? 1 : 0.18);
        ensureNumberUniformValue('uOpacity', isActive ? 0.85 : 0.55);
        ensureColorUniformValue('uColor', () =>
          typeof THREE?.Color === 'function' ? new THREE.Color(accent) : accent
        );
      }

      if (cacheResetNeeded) {
        const cacheReset = resetMaterialUniformCache(material);
        if (!cacheReset) {
          if ('uniformsNeedUpdate' in material) {
            material.uniformsNeedUpdate = true;
          }
          if ('needsUpdate' in material) {
            material.needsUpdate = true;
          }
        }
      }

      return modified;
    }

    function stabilizePortalShaderMaterial(material, metadata = null) {
      if (!material || typeof material !== 'object') {
        return false;
      }

      const normalizedMetadata = metadata && typeof metadata === 'object'
        ? metadata
        : material.userData?.portalSurface
        ? {
            accentColor: material.userData.portalSurface.accentColor,
            isActive: material.userData.portalSurface.isActive,
          }
        : null;

      const accentColor = normalizedMetadata?.accentColor ?? '#7b6bff';
      const isActive =
        typeof normalizedMetadata?.isActive === 'boolean' ? normalizedMetadata.isActive : false;

      const wasValid = hasValidPortalUniformStructure(material.uniforms);
      const modified = ensurePortalUniformIntegrity(material, {
        missingKeys: PORTAL_UNIFORM_KEYS,
        expectPortal: true,
        metadata: { accentColor, isActive },
      });
      const isValid = hasValidPortalUniformStructure(material.uniforms);

      if (isValid && (!wasValid || modified)) {
        if ('needsUpdate' in material) {
          material.needsUpdate = true;
        }
        if ('uniformsNeedUpdate' in material) {
          material.uniformsNeedUpdate = true;
        }
      }

      return isValid;
    }

    function tagPortalSurfaceMaterial(material, accentColor, active) {
      if (!material || typeof material !== 'object') {
        return;
      }
      material.userData = material.userData || {};
      material.userData.portalSurface = {
        accentColor,
        isActive: Boolean(active),
      };
      ensurePortalUniformIntegrity(material, {
        expectPortal: true,
        metadata: { accentColor, isActive: Boolean(active) },
      });
    }

    function isValidPortalShaderMaterial(material) {
      if (!material || typeof material !== 'object') {
        return false;
      }
      return hasValidPortalUniformStructure(material.uniforms);
    }

      function createPortalSurfaceMaterial(accentColor, active = false) {
        const baseUniforms = {
          uTime: { value: 0 },
          uActivation: { value: active ? 1 : 0.18 },
          uColor: { value: new THREE.Color(accentColor) },
          uOpacity: { value: active ? 0.85 : 0.55 },
        };
        const material = new THREE.ShaderMaterial({
          uniforms: baseUniforms,
          vertexShader: PORTAL_VERTEX_SHADER,
          fragmentShader: PORTAL_FRAGMENT_SHADER,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
        material.extensions = material.extensions || {};
        const previousUniforms = material.uniforms;
        const guardedUniforms = guardUniformContainer(material.uniforms);
        if (guardedUniforms && guardedUniforms !== material.uniforms) {
          material.uniforms = guardedUniforms;
          if (material.uniforms === guardedUniforms && previousUniforms !== guardedUniforms) {
            resetMaterialUniformCache(material);
          }
        }
        if (!hasValidPortalUniformStructure(material.uniforms)) {
          material.dispose?.();
          throw new Error('Portal shader uniforms unavailable');
        }
      tagPortalSurfaceMaterial(material, accentColor, active);
      return { material, uniforms: material.uniforms };
    }

    function recreatePortalSurfaceMaterialFromMetadata(metadata = {}, options = {}) {
      const accentColor = metadata?.accentColor ?? '#7b6bff';
      const isActive = Boolean(metadata?.isActive);
      const { forceFallback = false, onShaderError = null } = options;

      if (portalShaderSupport && !forceFallback) {
        try {
          const rebuilt = createPortalSurfaceMaterial(accentColor, isActive);
          return { ...rebuilt, accentColor, isActive, usedFallback: false };
        } catch (error) {
          if (typeof onShaderError === 'function') {
            onShaderError(error, { accentColor, isActive });
          }
          portalShaderSupport = false;
        }
      }

      const fallback = createPortalFallbackMaterial(accentColor, isActive);
      if (fallback?.userData) {
        fallback.userData.portalSurface = { accentColor, isActive };
      }

      return { material: fallback, uniforms: null, accentColor, isActive, usedFallback: true };
    }

    function createPortalFallbackMaterial(accentColor, active = false) {
      const accent = new THREE.Color(accentColor ?? '#7b6bff');
      const baseColor = new THREE.Color('#060b16').lerp(accent, active ? 0.45 : 0.35);
      // The fallback needs to stay visible on very low-end GPUs without overwhelming
      // the scene with a solid white glow. A darker base colour combined with a dimmed
      // emissive term keeps the gate readable while allowing Steve and the terrain to
      // remain visible behind the transparent surface.
      return new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: accent.clone().multiplyScalar(active ? 0.4 : 0.25),
        emissiveIntensity: 1,
        transparent: true,
        opacity: active ? 0.4 : 0.28,
        metalness: 0.12,
        roughness: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }

    function addPortalSurface(group, renderInfo, accentColor, height, active) {
      if (!portalShaderSupport || typeof THREE.ShaderMaterial !== 'function') {
        const frontMaterial = createPortalFallbackMaterial(accentColor, active);
        const sideMaterial = createPortalFallbackMaterial(accentColor, active);
        const frontPlane = new THREE.Mesh(PORTAL_PLANE_GEOMETRY, frontMaterial);
        frontPlane.position.y = height + 0.85;
        frontPlane.renderOrder = 2;
        group.add(frontPlane);
        const sidePlane = new THREE.Mesh(PORTAL_PLANE_GEOMETRY, sideMaterial);
        sidePlane.position.y = height + 0.85;
        sidePlane.rotation.y = Math.PI / 2;
        sidePlane.renderOrder = 2;
        group.add(sidePlane);
        return;
      }
      try {
        const frontSurface = createPortalSurfaceMaterial(accentColor, active);
        const frontPlane = new THREE.Mesh(PORTAL_PLANE_GEOMETRY, frontSurface.material);
        frontPlane.position.y = height + 0.85;
        frontPlane.renderOrder = 2;
        group.add(frontPlane);

        const sideSurface = createPortalSurfaceMaterial(accentColor, active);
        const sidePlane = new THREE.Mesh(PORTAL_PLANE_GEOMETRY, sideSurface.material);
        sidePlane.position.y = height + 0.85;
        sidePlane.rotation.y = Math.PI / 2;
        sidePlane.renderOrder = 2;
        group.add(sidePlane);

        const uniformSets = [frontSurface.uniforms, sideSurface.uniforms]
          .map((uniforms) => {
            const guarded = guardUniformContainer(uniforms);
            return guarded || uniforms;
          })
          .filter(Boolean);
        renderInfo.animations.portalSurface = {
          uniforms: frontSurface.uniforms,
          uniformSets,
          materials: [frontPlane.material, sidePlane.material],
          accentColor,
          isActive: active,
        };
      } catch (error) {
        console.warn('Portal shader initialisation failed; switching to emissive fallback material.', error);
        portalShaderSupport = false;
        addPortalSurface(group, renderInfo, accentColor, height, active);
      }
    }

    function getTileSignature(tile) {
      if (!tile) return 'void';
      const entries = tile.data
        ? Object.entries(tile.data)
            .map(([key, value]) => `${key}:${typeof value === 'object' ? JSON.stringify(value) : value}`)
            .sort()
            .join('|')
        : '';
      return `${tile.type}|${tile.resource ?? ''}|${tile.hazard ? 1 : 0}|${entries}`;
    }

    function getTileHeight(tile) {
      switch (tile?.type) {
        case 'void':
          return 0;
        case 'water':
        case 'lava':
          return 0.28;
        case 'tar':
          return 0.55;
        case 'rail':
          return 0.35;
        case 'railVoid':
          return 0.12;
        case 'portal':
        case 'portalDormant':
          return 0.2;
        default:
          return 1;
      }
    }

    function getSurfaceVariantForTile(type) {
      switch (type) {
        case 'grass':
        case 'tree':
        case 'village':
          return 'dew';
        case 'sand':
        case 'canyon':
        case 'stone':
        case 'rock':
        case 'ore':
        case 'marble':
        case 'marbleEcho':
        case 'netherite':
          return 'grain';
        default:
          return 'default';
      }
    }

    function getTreeLeavesMaterial() {
      if (treeLeavesMaterial) {
        return treeLeavesMaterial;
      }
      ensurePreviewTextures();
      const baseLeaves = previewAssets.textures.leaves;
      if (!baseLeaves) {
        treeLeavesMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#2e8b57'),
          roughness: 0.55,
          metalness: 0.08,
          transparent: true,
          opacity: 0.95,
          alphaTest: 0.25,
          side: THREE.DoubleSide,
        });
        return treeLeavesMaterial;
      }
      const leavesTexture = clonePreviewTexture(baseLeaves, {
        repeat: { x: 2, y: 2 },
        transparent: true,
      });
      leavesTexture.needsUpdate = true;
      treeLeavesMaterial = new THREE.MeshStandardMaterial({
        map: leavesTexture,
        color: new THREE.Color('#2e8b57'),
        roughness: 0.55,
        metalness: 0.08,
        transparent: true,
        opacity: 0.95,
        alphaTest: 0.25,
        side: THREE.DoubleSide,
      });
      return treeLeavesMaterial;
    }

    function rebuildTileGroup(renderInfo, tile) {
      const { group } = renderInfo;
      while (group.children.length) {
        group.remove(group.children[0]);
      }
      renderInfo.animations = {};

      if (!tile || tile.type === 'void') {
        group.visible = false;
        return;
      }

      group.visible = true;
      const def = TILE_TYPES[tile.type] ?? TILE_TYPES.grass;
      const baseColor = def.base ?? '#1c1f2d';
      const accentColor = def.accent ?? '#49f2ff';
      const height = getTileHeight(tile);

      switch (tile.type) {
        case 'water': {
          addBlock(group, {
            color: new THREE.Color(baseColor).lerp(new THREE.Color(accentColor), 0.5),
            height,
            transparent: true,
            opacity: 0.82,
            emissive: accentColor,
            emissiveIntensity: 0.08,
          });
          addTopPlate(group, accentColor, height, 0.35);
          break;
        }
        case 'lava': {
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(baseColor).lerp(new THREE.Color(accentColor), 0.35),
            roughness: 0.35,
            metalness: 0.25,
            emissive: new THREE.Color(accentColor),
            emissiveIntensity: 1.1,
            transparent: true,
            opacity: 0.88,
          });
          addBlock(group, { height, material: mat });
          break;
        }
        case 'tar': {
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(baseColor),
            roughness: 0.2,
            metalness: 0.5,
            emissive: new THREE.Color(accentColor).multiplyScalar(0.15),
            emissiveIntensity: 0.2,
          });
          addBlock(group, { height, material: mat });
          addTopPlate(group, accentColor, height, 0.45);
          break;
        }
        case 'rail': {
          const base = addBlock(group, {
            height,
            material: getBaseMaterial(baseColor, getSurfaceVariantForTile(tile.type)),
          });
          base.receiveShadow = true;
          const railMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(accentColor),
            emissive: new THREE.Color(accentColor),
            emissiveIntensity: 0.12,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
          });
          const railPlate = new THREE.Mesh(PLANE_GEOMETRY, railMaterial);
          railPlate.rotation.x = -Math.PI / 2;
          railPlate.position.y = height + 0.02;
          group.add(railPlate);
          renderInfo.animations.railGlow = railMaterial;
          break;
        }
        case 'railVoid': {
          addBlock(group, {
            height,
            material: getBaseMaterial('#050912'),
          });
          break;
        }
        case 'tree': {
          addBlock(group, { material: getBaseMaterial(TILE_TYPES.grass.base, 'dew'), height: 0.9 });
          addTopPlate(group, TILE_TYPES.grass.accent, 0.9, 0.5);
          addBlock(group, {
            material: getBaseMaterial('#4f3418', 'bark'),
            width: 0.28,
            depth: 0.28,
            height: 1.4,
            y: 0.9 + 0.7,
          });
          addBlock(group, {
            material: getTreeLeavesMaterial(),
            width: 1.3,
            depth: 1.3,
            height: 1.2,
            y: 0.9 + 1.4,
          });
          break;
        }
        case 'chest': {
          addBlock(group, { material: getBaseMaterial(baseColor, 'grain'), height: 0.8 });
          const lid = addBlock(group, {
            color: new THREE.Color(accentColor).lerp(new THREE.Color(baseColor), 0.4),
            height: 0.3,
            y: 0.8 + 0.15,
          });
          lid.material.metalness = 0.35;
          break;
        }
        case 'portalFrame': {
          const column = addBlock(group, {
            color: baseColor,
            height: 1.4,
            width: 0.9,
            depth: 0.9,
            y: 0.7,
            roughness: 0.4,
            metalness: 0.4,
          });
          column.material.emissive = new THREE.Color(accentColor);
          column.material.emissiveIntensity = 0.3;
          addTopPlate(group, accentColor, 1.4, 0.4);
          break;
        }
        case 'portal':
        case 'portalDormant': {
          addBlock(group, {
            color: new THREE.Color(baseColor).lerp(new THREE.Color('#1a1f39'), 0.4),
            height,
            roughness: 0.45,
            metalness: 0.35,
          });
          addPortalSurface(group, renderInfo, accentColor, height, tile.type === 'portal');
          break;
        }
        case 'crystal': {
          addBlock(group, { color: baseColor, height: 0.9 });
          addTopPlate(group, accentColor, 0.9, 0.35);
          const crystal = addBlock(group, {
            geometry: CRYSTAL_GEOMETRY,
            color: accentColor,
            height: 1,
            width: 1,
            depth: 1,
            y: 1.2,
            emissive: accentColor,
            emissiveIntensity: 0.4,
            roughness: 0.3,
            metalness: 0.6,
          });
          crystal.rotation.y = Math.PI / 4;
          break;
        }
        default: {
          const variant = getSurfaceVariantForTile(tile.type);
          const baseBlock = addBlock(group, { height, material: getBaseMaterial(baseColor, variant) });
          baseBlock.receiveShadow = true;
          if (tile.type !== 'marbleEcho' && tile.type !== 'marble') {
            addTopPlate(group, accentColor, height);
          } else {
            addTopPlate(group, accentColor, height, tile.type === 'marble' ? 0.6 : 0.45);
          }
          break;
        }
      }

      if (tile.resource && tile.type !== 'tree') {
        const resourceGem = addBlock(group, {
          geometry: CRYSTAL_GEOMETRY,
          color: accentColor,
          height: 1,
          width: 1,
          depth: 1,
          y: getTileHeight(tile) + 0.75,
          emissive: accentColor,
          emissiveIntensity: 0.4,
          roughness: 0.25,
          metalness: 0.5,
        });
        resourceGem.rotation.y = Math.PI / 4;
        renderInfo.animations.resourceGem = resourceGem;
      }
      syncAnimatedTileTracking(renderInfo);
    }

    function updateTileVisual(tile, renderInfo) {
      if (!tile || tile.type === 'void') return;
      if (renderInfo.animations.portalSurface) {
        const portalSurface = renderInfo.animations.portalSurface;
        const accentColor = portalSurface?.accentColor ?? '#7b6bff';
        const portalIsActive = tile.type === 'portal';
        const knownMaterials = Array.isArray(portalSurface.materials)
          ? portalSurface.materials.filter(Boolean)
          : [];
        if (knownMaterials.length !== (portalSurface.materials?.length ?? 0)) {
          portalSurface.materials = knownMaterials;
          ensurePortalShaderMaterialsHaveUniformValues(portalSurface.materials, {
            accentColor,
            isActive: portalIsActive,
          });
        }

        const groupMaterials = collectPortalSurfaceMaterialsFromGroup(renderInfo.group);
        let materials = knownMaterials;

        const shouldResyncMaterials =
          groupMaterials.length > 0 &&
          (materials.length === 0 ||
            materials.length !== groupMaterials.length ||
            groupMaterials.some((material, idx) => material !== materials[idx]));

        if (shouldResyncMaterials) {
          materials = groupMaterials;
          portalSurface.materials = materials;
          ensurePortalShaderMaterialsHaveUniformValues(portalSurface.materials, {
            accentColor,
            isActive: portalIsActive,
          });
        }

        if (materials.length > 0 && !materials.every(isValidPortalShaderMaterial)) {
          let repaired = false;
          materials.forEach((material) => {
            if (!material || isValidPortalShaderMaterial(material)) {
              return;
            }
            if (
              stabilizePortalShaderMaterial(material, {
                accentColor,
                isActive: portalIsActive,
              })
            ) {
              repaired = true;
            }
          });
          if (repaired) {
            const repairedMaterials = materials.filter(isValidPortalShaderMaterial);
            if (repairedMaterials.length) {
              materials = repairedMaterials;
              portalSurface.materials = materials;
              ensurePortalShaderMaterialsHaveUniformValues(portalSurface.materials, {
                accentColor,
                isActive: portalIsActive,
              });
            }
          }
        }

        const materialsInvalid =
          materials.length > 0 && !materials.every(isValidPortalShaderMaterial);
        if (materialsInvalid) {
          if (portalShaderSupport) {
            disablePortalSurfaceShaders(new Error('Portal shader materials lost required uniforms.'));
          } else {
            delete renderInfo.animations.portalSurface;
          }
          return;
        }

        const derivedUniformSets = materials
          .map((material) => {
            if (!material || !material.uniforms) {
              return null;
            }
            const guarded = guardUniformContainer(material.uniforms);
            if (guarded && material.uniforms !== guarded) {
              const previousUniforms = material.uniforms;
              material.uniforms = guarded;
              if (material.uniforms === guarded && previousUniforms !== guarded) {
                resetMaterialUniformCache(material);
              }
            }
            return guarded || material.uniforms;
          })
          .filter((uniforms) => hasValidPortalUniformStructure(uniforms));

        const existingUniformSets = Array.isArray(portalSurface.uniformSets)
          ? portalSurface.uniformSets
          : portalSurface.uniforms
          ? Array.isArray(portalSurface.uniforms)
            ? portalSurface.uniforms
            : [portalSurface.uniforms]
          : [];

        let uniformSets = (existingUniformSets || [])
          .filter((uniforms) => hasValidPortalUniformStructure(uniforms));

        const needsUniformResync =
          derivedUniformSets.length > 0 &&
          (uniformSets.length !== derivedUniformSets.length ||
            derivedUniformSets.some((set, idx) => set !== uniformSets[idx]));

        if (needsUniformResync || (!uniformSets.length && derivedUniformSets.length)) {
          uniformSets = derivedUniformSets;
        }

        if (portalSurface.uniformSets !== uniformSets) {
          portalSurface.uniformSets = uniformSets;
        }

        if (!uniformSets.length) {
          if (portalShaderSupport) {
            disablePortalSurfaceShaders(new Error('Portal shader uniforms missing expected values.'));
          } else {
            delete renderInfo.animations.portalSurface;
          }
          return;
        }

        if (!hasValidPortalUniformStructure(portalSurface.uniforms)) {
          const primaryUniforms = guardUniformContainer(uniformSets[0] ?? null);
          portalSurface.uniforms = primaryUniforms ?? uniformSets[0] ?? null;
        } else {
          const guardedPortalUniforms = guardUniformContainer(portalSurface.uniforms);
          if (guardedPortalUniforms && guardedPortalUniforms !== portalSurface.uniforms) {
            portalSurface.uniforms = guardedPortalUniforms;
          }
        }

        const applyPortalUniforms = (uniforms) => {
          if (!uniforms || typeof uniforms !== 'object') return;
          const accentColor = portalSurface.accentColor ?? '#7b6bff';
          const portalIsActive = tile.type === 'portal';
          let uniformsUpdated = false;
          Object.entries(uniforms).forEach(([key, uniform]) => {
            if (!uniform || typeof uniform !== 'object') {
              uniforms[key] = { value: null };
              uniformsUpdated = true;
              return;
            }
            if (!Object.prototype.hasOwnProperty.call(uniform, 'value')) {
              if (typeof uniform.setValue === 'function') {
                try {
                  uniform.setValue(null);
                  uniformsUpdated = true;
                } catch (setError) {
                  uniformsUpdated = assignPortalUniformValue(uniform, null) || uniformsUpdated;
                }
                return;
              }
              let preserved = null;
              if (typeof uniform.clone === 'function') {
                try {
                  preserved = uniform.clone();
                } catch (cloneError) {
                  preserved = null;
                }
              } else if (typeof uniform.value !== 'undefined') {
                preserved = uniform.value;
              }
              const nextValue = preserved ?? null;
              uniformsUpdated = assignPortalUniformValue(uniform, nextValue) || uniformsUpdated;
              return;
            }
            if (typeof uniform.value === 'undefined') {
              uniformsUpdated = assignPortalUniformValue(uniform, null) || uniformsUpdated;
            }
          });
          const ensureUniform = (key, createValue) => {
            const resolveDefault = () =>
              typeof createValue === 'function' ? createValue() : createValue;
            let uniform = uniforms[key];
            if (!uniform || typeof uniform !== 'object') {
              const defaultValue = resolveDefault();
              uniforms[key] = { value: defaultValue };
              uniformsUpdated = true;
              return uniforms[key];
            }
            if (!Object.prototype.hasOwnProperty.call(uniform, 'value')) {
              if (typeof uniform.setValue === 'function') {
                const defaultValue = resolveDefault();
                try {
                  uniform.setValue(defaultValue);
                  uniformsUpdated = true;
                } catch (setError) {
                  // Ignore failures and fall back to assignPortalUniformValue.
                  uniformsUpdated = assignPortalUniformValue(uniform, defaultValue) || uniformsUpdated;
                }
                return uniform;
              }
              let preserved = null;
              if (typeof uniform.clone === 'function') {
                try {
                  preserved = uniform.clone();
                } catch (cloneError) {
                  preserved = null;
                }
              } else if (typeof uniform.value !== 'undefined') {
                preserved = uniform.value;
              }
              const defaultValue = preserved ?? resolveDefault();
              uniformsUpdated = assignPortalUniformValue(uniform, defaultValue) || uniformsUpdated;
              return uniform;
            }
            if (typeof uniform.value === 'undefined') {
              const nextValue = resolveDefault();
              uniformsUpdated = assignPortalUniformValue(uniform, nextValue) || uniformsUpdated;
            }
            return uniform;
          };
          const uTime = ensureUniform('uTime', 0);
          const uActivation = ensureUniform('uActivation', portalIsActive ? 1 : 0.18);
          const uOpacity = ensureUniform('uOpacity', portalIsActive ? 0.85 : 0.55);
          const uColor = ensureUniform('uColor', () => new THREE.Color(accentColor));

          if (uniformsUpdated && Array.isArray(portalSurface.materials)) {
            portalSurface.materials.forEach((material) => {
              if (!material || typeof material !== 'object') {
                return;
              }
              if ('needsUpdate' in material) {
                material.needsUpdate = true;
              }
              if ('uniformsNeedUpdate' in material) {
                material.uniformsNeedUpdate = true;
              }
            });
          }

          if (Array.isArray(portalSurface.materials)) {
            portalSurface.materials.forEach((material) => {
              const metadata = material?.userData?.portalSurface;
              if (metadata) {
                metadata.accentColor = accentColor;
                metadata.isActive = portalIsActive;
              }
            });
          }
          portalSurface.accentColor = accentColor;
          portalSurface.isActive = portalIsActive;

          if (uColor?.value?.set) {
            uColor.value.set(accentColor);
          }
          if (uTime && 'value' in uTime) {
            uTime.value = state.elapsed;
          }
          if (tile.type === 'portal') {
            const portalState = tile.portalState;
            const activation = portalState?.activation ?? 0.6;
            const surge = portalState?.transition ?? 0;
            const energy = Math.min(1.6, 0.25 + activation * 0.9 + surge * 0.8);
            if (uActivation && 'value' in uActivation) {
              uActivation.value = energy;
            }
            if (uOpacity && 'value' in uOpacity) {
              uOpacity.value = Math.min(1, 0.65 + activation * 0.25 + surge * 0.2);
            }
          } else {
            const dormant = tile.portalState?.activation ?? 0;
            if (uActivation && 'value' in uActivation) {
              uActivation.value = 0.12 + dormant * 0.4;
            }
            if (uOpacity && 'value' in uOpacity) {
              uOpacity.value = 0.45;
            }
          }
        };
        uniformSets.forEach(applyPortalUniforms);
      }
      if (renderInfo.animations.railGlow) {
        const active = state.railPhase === (tile.data?.phase ?? 0);
        renderInfo.animations.railGlow.emissiveIntensity = active ? 0.65 : 0.1;
        renderInfo.animations.railGlow.opacity = active ? 0.68 : 0.25;
      }
      if (renderInfo.animations.resourceGem) {
        renderInfo.animations.resourceGem.rotation.y += 0.01;
      }
    }

    function attemptPortalShaderMaterialRecovery() {
      if (!portalShaderSupport) {
        return false;
      }

      const layers = Array.isArray(tileRenderState) ? tileRenderState : [];
      let recovered = false;

      const removeRendererCacheForMaterial = (material) => {
        if (!renderer?.properties?.remove || !material) {
          return;
        }
        try {
          renderer.properties.remove(material);
        } catch (error) {
          // Ignore renderer cache removal failures – the renderer will rebuild its caches lazily.
        }
      };

      const rebuildCache = new Map();

      const rebuildPortalMaterial = (material, metadata = {}) => {
        if (!material) {
          return null;
        }

        if (rebuildCache.has(material)) {
          return rebuildCache.get(material);
        }

        let rendererUniformsInvalid = false;
        if (renderer?.properties?.get) {
          let materialProperties = null;
          try {
            materialProperties = renderer.properties.get(material) ?? null;
          } catch (propertiesError) {
            materialProperties = null;
          }

          const rendererUniforms =
            materialProperties && typeof materialProperties.uniforms === 'object'
              ? materialProperties.uniforms
              : null;
          const programUniforms =
            materialProperties &&
            materialProperties.program &&
            typeof materialProperties.program.getUniforms === 'function'
              ? materialProperties.program.getUniforms()
              : null;

          rendererUniformsInvalid =
            uniformContainerNeedsSanitization(rendererUniforms) ||
            uniformContainerNeedsSanitization(programUniforms);
        }

        if (hasValidPortalUniformStructure(material.uniforms) && !rendererUniformsInvalid) {
          rebuildCache.set(material, null);
          return null;
        }

        const inferredMetadata = metadata && typeof metadata === 'object' ? metadata : {};
        const rebuildResult = recreatePortalSurfaceMaterialFromMetadata({
          accentColor: inferredMetadata.accentColor ?? '#7b6bff',
          isActive: Boolean(inferredMetadata.isActive),
        });
        const replacement = rebuildResult?.material ?? null;

        if (!replacement) {
          rebuildCache.set(material, null);
          return null;
        }

        replacement.renderOrder = material.renderOrder ?? replacement.renderOrder ?? 2;
        replacement.needsUpdate = true;
        if ('uniformsNeedUpdate' in replacement) {
          replacement.uniformsNeedUpdate = true;
        }

        ensurePortalShaderMaterialsHaveUniformValues(
          [replacement],
          { accentColor: rebuildResult?.accentColor, isActive: rebuildResult?.isActive },
          { forceExpectPortal: true }
        );

        const boundLight = getRendererBoundLight(material);

        removeRendererCacheForMaterial(material);
        try {
          material.dispose?.();
        } catch (error) {
          // Ignore material disposal failures.
        }

        if (boundLight) {
          restoreRendererBoundLight(replacement, boundLight);
        }

        rebuildCache.set(material, replacement);
        recovered = true;
        return replacement;
      };

      layers.forEach((row) => {
        if (!Array.isArray(row)) {
          return;
        }
        row.forEach((renderInfo) => {
          const portalSurface = renderInfo?.animations?.portalSurface;
          if (!portalSurface) {
            return;
          }

          const metadata = {
            accentColor: portalSurface?.accentColor ?? '#7b6bff',
            isActive: Boolean(portalSurface?.isActive),
          };

          const { group } = renderInfo;
          if (group?.children) {
            group.children.forEach((child) => {
              if (!child) {
                return;
              }

              const applyReplacement = (oldMaterial, assign) => {
                const replacement = rebuildPortalMaterial(oldMaterial, metadata);
                if (!replacement) {
                  return;
                }
                assign(replacement);
                resyncPortalSurfaceMaterials(oldMaterial, replacement);
              };

              if (Array.isArray(child.material)) {
                child.material.forEach((mat, index) => {
                  applyReplacement(mat, (replacement) => {
                    child.material[index] = replacement;
                  });
                });
              } else if (child.material) {
                applyReplacement(child.material, (replacement) => {
                  child.material = replacement;
                });
              }
            });
          }

          const knownMaterials = Array.isArray(portalSurface.materials)
            ? portalSurface.materials.filter(Boolean)
            : [];
          const remappedMaterials = knownMaterials
            .map((material) => rebuildCache.get(material) ?? material)
            .filter(Boolean);
          const materialsChanged =
            remappedMaterials.length !== knownMaterials.length ||
            remappedMaterials.some((material, idx) => material !== knownMaterials[idx]);

          if (materialsChanged) {
            portalSurface.materials = remappedMaterials;

            ensurePortalShaderMaterialsHaveUniformValues(portalSurface.materials, metadata, {
              forceExpectPortal: true,
            });

            const uniformSets = portalSurface.materials
              .map((material) => {
                if (!material || !material.uniforms) {
                  return null;
                }
                const guarded = guardUniformContainer(material.uniforms);
                if (guarded && material.uniforms !== guarded) {
                  const previousUniforms = material.uniforms;
                  material.uniforms = guarded;
                  if (material.uniforms === guarded && previousUniforms !== guarded) {
                    resetMaterialUniformCache(material);
                  }
                }
                return guarded || material.uniforms;
              })
              .filter((uniforms) => hasValidPortalUniformStructure(uniforms));

            portalSurface.uniformSets = uniformSets;
            if (!hasValidPortalUniformStructure(portalSurface.uniforms)) {
              portalSurface.uniforms = uniformSets[0] ?? portalSurface.uniforms ?? null;
            }
          }
        });
      });

      if (scene && typeof scene.traverse === 'function') {
        const processed = new Set();
        scene.traverse((object) => {
          if (!object || processed.has(object)) {
            return;
          }
          processed.add(object);

          const applyToMaterial = (host, property, metadata) => {
            if (!host || !property || !(property in host)) {
              return;
            }
            const current = host[property];
            if (!current) {
              return;
            }
            if (Array.isArray(current)) {
              current.forEach((mat, index) => {
                const replacement = rebuildPortalMaterial(mat, metadata ?? mat?.userData?.portalSurface);
                if (replacement) {
                  current[index] = replacement;
                  resyncPortalSurfaceMaterials(mat, replacement);
                }
              });
              return;
            }
            const replacement = rebuildPortalMaterial(current, metadata ?? current?.userData?.portalSurface);
            if (replacement) {
              host[property] = replacement;
              resyncPortalSurfaceMaterials(current, replacement);
            }
          };

          applyToMaterial(object, 'material');
          applyToMaterial(object, 'customDepthMaterial');
          applyToMaterial(object, 'customDistanceMaterial');
        });
      }

      return recovered;
    }

    function resyncPortalSurfaceMaterials(oldMaterial, newMaterial) {
        const layers = Array.isArray(tileRenderState) ? tileRenderState : [];
        for (let y = 0; y < layers.length; y += 1) {
          const row = layers[y];
          if (!Array.isArray(row)) continue;
          for (let x = 0; x < row.length; x += 1) {
            const renderInfo = row[x];
            const portalSurface = renderInfo?.animations?.portalSurface;
            if (!portalSurface) continue;

            const group = renderInfo.group;
            const groupMaterials = [];
            if (group?.children) {
              group.children.forEach((child) => {
                if (!child) return;
                const { material } = child;
                if (Array.isArray(material)) {
                  material.forEach((mat) => {
                    if (mat) groupMaterials.push(mat);
                  });
                } else if (material) {
                  groupMaterials.push(material);
                }
              });
            }

            const knownMaterials = Array.isArray(portalSurface.materials)
              ? portalSurface.materials.filter(Boolean)
              : [];
            const candidateMaterials = groupMaterials.length ? groupMaterials : knownMaterials;
            const remappedMaterials = candidateMaterials
              .map((material) => {
                if (material === oldMaterial) {
                  return newMaterial || null;
                }
                return material;
              })
              .filter(Boolean);

            const materialsChanged =
              remappedMaterials.length !== knownMaterials.length ||
              remappedMaterials.some((material, idx) => material !== knownMaterials[idx]);

            if (materialsChanged) {
              portalSurface.materials = remappedMaterials;
              ensurePortalShaderMaterialsHaveUniformValues(portalSurface.materials, {
                accentColor: portalSurface?.accentColor,
                isActive: portalSurface?.isActive,
              });
            }

            const uniformSets = remappedMaterials
              .map((material) => {
                if (!material || !material.uniforms) {
                  return null;
                }
                const guarded = guardUniformContainer(material.uniforms);
                if (guarded && material.uniforms !== guarded) {
                  const previousUniforms = material.uniforms;
                  material.uniforms = guarded;
                  if (material.uniforms === guarded && previousUniforms !== guarded) {
                    resetMaterialUniformCache(material);
                  }
                }
                return guarded || material.uniforms;
              })
              .filter((uniforms) => hasValidPortalUniformStructure(uniforms));

            const uniformSetsChanged =
              materialsChanged ||
              !Array.isArray(portalSurface.uniformSets) ||
              portalSurface.uniformSets.length !== uniformSets.length ||
              uniformSets.some((set, idx) => set !== portalSurface.uniformSets?.[idx]);

            if (uniformSetsChanged) {
              portalSurface.uniformSets = uniformSets;
            }

            const primaryUniforms = remappedMaterials[0]?.uniforms;
            if (portalSurface.uniforms === oldMaterial?.uniforms && newMaterial?.uniforms) {
              portalSurface.uniforms = newMaterial.uniforms;
            } else if (!hasValidPortalUniformStructure(portalSurface.uniforms)) {
              portalSurface.uniforms = hasValidPortalUniformStructure(primaryUniforms)
                ? primaryUniforms
                : uniformSets[0] ?? null;
            }
          }
        }
      }

      const isRendererManagedUniformContainer = (container) =>
        Boolean(container && typeof container === 'object' && Array.isArray(container.seq));

  const RENDERER_MANAGED_UNIFORM_PREFIXES = [
    'modelMatrix',
    'modelViewMatrix',
    'projectionMatrix',
    'viewMatrix',
    'normalMatrix',
    'cameraPosition',
    'isOrthographic',
    'toneMappingExposure',
    'morphTargetBaseInfluence',
    'morphTargetInfluences',
    'boneTexture',
    'boneTextureSize',
    'boneMatrices',
    'bindMatrix',
    'bindMatrixInverse',
    'logDepthBufFC',
    'clippingPlanes',
    'clippingPlanesMatrix',
    'clippingPlanesTexture',
    'clippingPlanesNear',
    'clippingPlanesFar',
  ];

  const isRendererManagedUniform = (uniformKey) => {
    if (!uniformKey) {
      return false;
    }
    const normalizedKey = `${uniformKey}`
      .replace(/\[[^\]]*\]/g, '.')
      .split('.')
      .filter(Boolean)[0];
    if (!normalizedKey) {
      return false;
    }
    return RENDERER_MANAGED_UNIFORM_PREFIXES.some((prefix) => normalizedKey === prefix);
  };

  function hasInvalidUniformEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return true;
    }

    if (entry.map && typeof entry.map === 'object' && Array.isArray(entry.seq)) {
      return false;
    }

    if (Object.prototype.hasOwnProperty.call(entry, 'value')) {
      return typeof entry.value === 'undefined';
    }

    if (typeof entry.setValue === 'function') {
      if (entry.uniform && typeof entry.uniform === 'object') {
        if (!Object.prototype.hasOwnProperty.call(entry.uniform, 'value')) {
          return true;
        }
        return typeof entry.uniform.value === 'undefined';
      }
      return false;
    }

    if (entry.uniform && typeof entry.uniform === 'object') {
      if (!Object.prototype.hasOwnProperty.call(entry.uniform, 'value')) {
        return true;
      }
      return typeof entry.uniform.value === 'undefined';
    }

    return true;
  }

  function stabiliseRendererUniformCache(uniforms) {
    if (!uniforms || typeof uniforms !== 'object') {
      return false;
    }

    let cacheUpdated = false;

    const ensureRendererUniformEntry = (entry, key) => {
      let target = entry && typeof entry === 'object' ? entry : {};
      let modified = target !== entry;

      if (typeof target.setValue !== 'function') {
        target.setValue = () => {};
        modified = true;
      }

      if (typeof target.updateCache !== 'function') {
        target.updateCache = () => {};
        modified = true;
      }

      if (!Array.isArray(target.cache)) {
        target.cache = [];
        modified = true;
      }

      if (!target.uniform || typeof target.uniform !== 'object') {
        target.uniform = { value: null };
        modified = true;
      } else {
        if (!Object.prototype.hasOwnProperty.call(target.uniform, 'value')) {
          target.uniform.value =
            typeof target.uniform.value === 'undefined' ? null : target.uniform.value;
          modified = true;
        } else if (typeof target.uniform.value === 'undefined') {
          target.uniform.value = null;
          modified = true;
        }
      }

      if (!Object.prototype.hasOwnProperty.call(target, 'value')) {
        target.value = target.uniform?.value ?? null;
        modified = true;
      } else if (typeof target.value === 'undefined') {
        target.value = null;
        modified = true;
      }

      if (!Object.prototype.hasOwnProperty.call(target, 'id')) {
        if (typeof key === 'string' || typeof key === 'number') {
          target.id = `${key}`;
        } else if (typeof target.name === 'string' || typeof target.name === 'number') {
          target.id = `${target.name}`;
        } else {
          target.id = null;
        }
        modified = true;
      } else if (typeof target.id === 'undefined') {
        target.id = null;
        modified = true;
      }

      if (modified) {
        cacheUpdated = true;
      }

      return target;
    };

    const stabiliseArrayContainer = (container) => {
      if (!Array.isArray(container)) {
        return;
      }
      for (let index = 0; index < container.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(container, index)) {
          continue;
        }
        const entry = container[index];
        if (Array.isArray(entry)) {
          stabiliseArrayContainer(entry);
          continue;
        }
        if (!entry || typeof entry !== 'object' || hasInvalidUniformEntry(entry)) {
          container[index] = ensureRendererUniformEntry(entry, index);
        }
      }
    };

    const stabiliseMapContainer = (container) => {
      if (!container || typeof container !== 'object') {
        return;
      }
      Object.keys(container).forEach((key) => {
        if (RESERVED_UNIFORM_CONTAINER_KEYS.has(key)) {
          return;
        }
        const entry = container[key];
        if (Array.isArray(entry)) {
          stabiliseArrayContainer(entry);
          return;
        }
        if (!entry || typeof entry !== 'object' || hasInvalidUniformEntry(entry)) {
          container[key] = ensureRendererUniformEntry(entry, key);
        }
      });
    };

    stabiliseArrayContainer(uniforms);
    stabiliseMapContainer(uniforms);

    if (Array.isArray(uniforms.seq)) {
      stabiliseArrayContainer(uniforms.seq);
    }

    if (uniforms.map && typeof uniforms.map === 'object') {
      stabiliseMapContainer(uniforms.map);
    }

    return cacheUpdated;
  }

  function uniformContainerNeedsSanitization(uniforms) {
    if (!uniforms || typeof uniforms !== 'object') {
      return false;
    }

    const inspectArrayEntries = (array) => {
      if (!Array.isArray(array)) {
        return false;
      }
      for (let i = 0; i < array.length; i += 1) {
        if (!Object.prototype.hasOwnProperty.call(array, i)) {
          return true;
        }
        if (hasInvalidUniformEntry(array[i])) {
          return true;
        }
      }
      return false;
    };

    if (inspectArrayEntries(uniforms)) {
      return true;
    }

    for (const key of Object.keys(uniforms)) {
      if (RESERVED_UNIFORM_CONTAINER_KEYS.has(key)) {
        continue;
      }
      const entry = uniforms[key];
      if (Array.isArray(entry)) {
        if (inspectArrayEntries(entry)) {
          return true;
        }
        continue;
      }
      if (hasInvalidUniformEntry(entry)) {
        return true;
      }
    }

    if (isRendererManagedUniformContainer(uniforms)) {
      if (inspectArrayEntries(uniforms.seq)) {
        return true;
      }
      if (uniforms.map && typeof uniforms.map === 'object') {
        for (const key of Object.keys(uniforms.map)) {
          if (hasInvalidUniformEntry(uniforms.map[key])) {
            return true;
          }
        }
      }
    }

    return false;
  }

    function ensureSceneUniformValuePresence() {
      if (!scene || typeof scene.traverse !== 'function') {
        return false;
      }

      let modified = false;
      const visitedMaterials = new Set();

      const normalizeUniformContainer = (material, uniforms) => {
        if (!uniforms || typeof uniforms !== 'object') {
          return false;
        }

        let container = uniforms;
        let updated = false;
        const guarded = guardUniformContainer(uniforms);
        if (guarded && guarded !== uniforms) {
          container = guarded;
          if (material && material.uniforms !== guarded) {
            try {
              const previousUniforms = material.uniforms;
              material.uniforms = guarded;
              if (material.uniforms === guarded && previousUniforms !== guarded) {
                resetMaterialUniformCache(material);
              }
            } catch (assignError) {
              // Ignore assignment failures; we'll still attempt to normalise the proxy.
            }
          }
          updated = true;
        }

        Object.keys(container).forEach((key) => {
          if (!key || RESERVED_UNIFORM_CONTAINER_KEYS.has(key)) {
            return;
          }

          const entry = container[key];
          if (!entry || typeof entry !== 'object') {
            container[key] = { value: null };
            updated = true;
            return;
          }

          if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
            if (!assignPortalUniformValue(entry, null)) {
              container[key] = { value: null };
            }
            updated = true;
            return;
          }

          if (typeof entry.value === 'undefined') {
            if (!assignPortalUniformValue(entry, null)) {
              entry.value = null;
            }
            updated = true;
          }
        });

        if (updated && material && typeof material === 'object') {
          const cacheReset = resetMaterialUniformCache(material);
          if (!cacheReset) {
            if ('uniformsNeedUpdate' in material) {
              material.uniformsNeedUpdate = true;
            }
            if ('needsUpdate' in material) {
              material.needsUpdate = true;
            }
          }
        }

        return updated;
      };

      const inspectMaterial = (material) => {
        if (!material || visitedMaterials.has(material)) {
          return;
        }
        visitedMaterials.add(material);

        const uniforms = material.uniforms;
        if (normalizeUniformContainer(material, uniforms)) {
          modified = true;
        }

        if (!renderer?.properties?.get) {
          return;
        }

        let materialProperties = null;
        try {
          materialProperties = renderer.properties.get(material) ?? null;
        } catch (propertiesError) {
          materialProperties = null;
        }

        if (!materialProperties || typeof materialProperties !== 'object') {
          return;
        }

        const rendererUniforms =
          materialProperties && typeof materialProperties.uniforms === 'object'
            ? materialProperties.uniforms
            : null;
        if (stabiliseRendererUniformCache(rendererUniforms)) {
          modified = true;
        }
        const rendererUniformsInvalid = uniformContainerNeedsSanitization(rendererUniforms);
        if (rendererUniformsInvalid) {
          modified = true;
        }

        const rendererUniformsList = Array.isArray(materialProperties.uniformsList)
          ? materialProperties.uniformsList
          : null;
        if (rendererUniformsList) {
          let listUpdated = false;
          for (let index = 0; index < rendererUniformsList.length; index += 1) {
            if (!Object.prototype.hasOwnProperty.call(rendererUniformsList, index)) {
              continue;
            }
            const entry = rendererUniformsList[index];
            if (!entry || typeof entry !== 'object') {
              rendererUniformsList[index] = {
                id: null,
                value: null,
                uniform: { value: null },
                cache: [],
              };
              listUpdated = true;
              continue;
            }
            if (!entry.uniform || typeof entry.uniform !== 'object') {
              entry.uniform = { value: entry.value ?? null };
              listUpdated = true;
            } else if (!Object.prototype.hasOwnProperty.call(entry.uniform, 'value')) {
              entry.uniform.value = entry.value ?? null;
              listUpdated = true;
            } else if (typeof entry.uniform.value === 'undefined') {
              entry.uniform.value = entry.value ?? null;
              listUpdated = true;
            }
            if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
              entry.value = entry.uniform?.value ?? null;
              listUpdated = true;
            } else if (typeof entry.value === 'undefined') {
              entry.value = entry.uniform?.value ?? null;
              listUpdated = true;
            }
            if (!Array.isArray(entry.cache)) {
              entry.cache = [];
              listUpdated = true;
            }
            if (typeof entry.setValue !== 'function') {
              entry.setValue = function setValue(value) {
                this.value = value;
                if (this.uniform && typeof this.uniform === 'object') {
                  this.uniform.value = value;
                }
                return this;
              };
              listUpdated = true;
            }
          }
          if (listUpdated) {
            modified = true;
          }
        }

        const programUniforms =
          materialProperties &&
          materialProperties.program &&
          typeof materialProperties.program.getUniforms === 'function'
            ? materialProperties.program.getUniforms()
            : null;
        if (programUniforms) {
          stabiliseRendererUniformCache(programUniforms);
          if (uniformContainerNeedsSanitization(programUniforms)) {
            modified = true;
          }
        }
      };

      const collectMaterial = (candidate, cb) => {
        if (!candidate) {
          return;
        }
        if (Array.isArray(candidate)) {
          candidate.forEach((entry) => collectMaterial(entry, cb));
          return;
        }
        cb(candidate);
      };

      scene.traverse((object) => {
        if (!object) {
          return;
        }
        collectMaterial(object.material, inspectMaterial);
        collectMaterial(object.customDepthMaterial, inspectMaterial);
        collectMaterial(object.customDistanceMaterial, inspectMaterial);
      });

      return modified;
    }

    function sanitizeSceneUniforms() {
        if (!scene || typeof scene.traverse !== 'function') {
          return false;
        }

        const visitedMaterials = new Set();
        let sanitized = false;

        const stabiliseRendererUniformEntry = (entry, key = null) => {
          let target = entry && typeof entry === 'object' ? entry : {};
          let modified = !entry || typeof entry !== 'object';

          if (typeof target.setValue !== 'function') {
            target.setValue = () => {};
            modified = true;
          }
          if (typeof target.updateCache !== 'function') {
            target.updateCache = () => {};
            modified = true;
          }
          if (!Array.isArray(target.cache)) {
            target.cache = [];
            modified = true;
          }

          if (!target.uniform || typeof target.uniform !== 'object') {
            target.uniform = { value: null };
            modified = true;
          } else if (!Object.prototype.hasOwnProperty.call(target.uniform, 'value')) {
            target.uniform.value = Object.prototype.hasOwnProperty.call(target, 'value')
              ? target.value ?? null
              : null;
            modified = true;
          } else if (typeof target.uniform.value === 'undefined') {
            target.uniform.value = null;
            modified = true;
          }

          if (!Object.prototype.hasOwnProperty.call(target, 'value')) {
            target.value =
              target.uniform && typeof target.uniform === 'object'
                ? target.uniform.value ?? null
                : null;
            modified = true;
          } else if (typeof target.value === 'undefined') {
            target.value = null;
            modified = true;
          }

          if (!Object.prototype.hasOwnProperty.call(target, 'id') || target.id === undefined) {
            if (typeof key === 'string' || typeof key === 'number') {
              target.id = `${key}`;
            } else if (typeof target.name === 'string' || typeof target.name === 'number') {
              target.id = `${target.name}`;
            } else {
              target.id = null;
            }
            modified = true;
          }

          return { entry: target, modified };
        };

        const purgeRendererUniformCache = (uniforms) => {
          if (!uniforms || typeof uniforms !== 'object') {
            return false;
          }

          let repaired = false;

          if (Array.isArray(uniforms.seq)) {
            for (let i = 0; i < uniforms.seq.length; i += 1) {
              const entry = uniforms.seq[i];
              if (hasInvalidUniformEntry(entry)) {
                const { entry: stabilised, modified } = stabiliseRendererUniformEntry(entry, i);
                uniforms.seq[i] = stabilised;
                if (modified) {
                  repaired = true;
                }
              }
            }
          }

          if (uniforms.map && typeof uniforms.map === 'object') {
            Object.keys(uniforms.map).forEach((key) => {
              const entry = uniforms.map[key];
              if (hasInvalidUniformEntry(entry)) {
                const { entry: stabilised, modified } = stabiliseRendererUniformEntry(entry, key);
                uniforms.map[key] = stabilised;
                if (modified) {
                  repaired = true;
                }
              }
            });
          }

          return repaired;
        };

        const sanitizeUniformEntry = (container, key, entry, options = {}) => {
          const { markRendererReset = false } = options;
          const result = { updated: false, requiresRendererReset: false };
          const markReset = () => {
            if (markRendererReset) {
              result.requiresRendererReset = true;
            }
          };

          if (!entry || typeof entry !== 'object') {
            container[key] = { value: null };
            result.updated = true;
            result.requiresRendererReset = true;
            markReset();
            return result;
          }

          if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
            if (typeof entry.setValue === 'function') {
              const repair = repairRendererUniformEntry(container, key, entry);
              if (repair.removed) {
                const { entry: stabilised } = stabiliseRendererUniformEntry(entry, key);
                if (Array.isArray(container)) {
                  const index = typeof key === 'number' ? key : Number.parseInt(`${key}`, 10);
                  if (Number.isInteger(index)) {
                    container[index] = stabilised;
                  }
                } else {
                  container[key] = stabilised;
                }
                result.updated = true;
                result.requiresRendererReset = true;
                markReset();
                return result;
              }

              if (hasInvalidUniformEntry(entry)) {
                const { entry: stabilised } = stabiliseRendererUniformEntry(entry, key);
                if (Array.isArray(container)) {
                  const index = typeof key === 'number' ? key : Number.parseInt(`${key}`, 10);
                  if (Number.isInteger(index)) {
                    container[index] = stabilised;
                  }
                } else {
                  container[key] = stabilised;
                }
                result.updated = true;
                result.requiresRendererReset = true;
                markReset();
                return result;
              }

              if (repair.updated) {
                result.updated = true;
              }
              if (repair.requiresRendererReset) {
                result.requiresRendererReset = true;
                markReset();
              }
              return result;
            }

            let preservedValue = null;
            if (typeof entry.clone === 'function') {
              try {
                preservedValue = entry.clone();
              } catch (cloneError) {
                preservedValue = null;
              }
            } else if (typeof entry.value !== 'undefined') {
              preservedValue = entry.value;
            }

            container[key] = { value: preservedValue ?? null };
            result.updated = true;
            result.requiresRendererReset = true;
            markReset();
            return result;
          }

          if (typeof entry.value === 'undefined') {
            entry.value = null;
            result.updated = true;
          }

          return result;
        };

        const repairRendererUniformEntry = (container, key, entry) => {
          const result = {
            updated: false,
            requiresRendererReset: false,
            removed: false,
          };

          const ensureArray = () => {
            if (Array.isArray(entry.cache)) {
              return true;
            }
            entry.cache = [];
            result.updated = true;
            return true;
          };

          const ensureFunction = (property) => {
            if (typeof entry[property] === 'function') {
              return true;
            }
            entry[property] = () => {};
            result.updated = true;
            return true;
          };

          const ensureUniformObject = () => {
            if (!entry.uniform || typeof entry.uniform !== 'object') {
              try {
                entry.uniform = { value: null };
                result.updated = true;
                result.requiresRendererReset = true;
              } catch (assignError) {
                const { entry: stabilised } = stabiliseRendererUniformEntry(entry, key);
                try {
                  container[key] = stabilised;
                } catch (assignmentError) {
                  // Ignore assignment failures; caller will reset renderer state.
                }
                result.updated = true;
                result.requiresRendererReset = true;
                return false;
              }
            }

            if (!entry.uniform || typeof entry.uniform !== 'object') {
              const { entry: stabilised } = stabiliseRendererUniformEntry(entry, key);
              try {
                container[key] = stabilised;
              } catch (assignmentError) {
                // Ignore assignment failures.
              }
              result.updated = true;
              result.requiresRendererReset = true;
              return false;
            }

            if (!Object.prototype.hasOwnProperty.call(entry.uniform, 'value')) {
              try {
                entry.uniform.value =
                  typeof entry.uniform.value === 'undefined' ? null : entry.uniform.value;
                result.updated = true;
              } catch (valueAssignError) {
                const { entry: stabilised } = stabiliseRendererUniformEntry(entry, key);
                try {
                  container[key] = stabilised;
                } catch (assignmentError) {
                  // Ignore assignment failures.
                }
                result.updated = true;
                result.requiresRendererReset = true;
                return false;
              }
            }

            if (typeof entry.uniform.value === 'undefined') {
              entry.uniform.value = null;
              result.updated = true;
            }

            return true;
          };

          if (!entry || typeof entry !== 'object') {
            const { entry: stabilised } = stabiliseRendererUniformEntry(null, key);
            try {
              container[key] = stabilised;
            } catch (assignmentError) {
              // Ignore assignment failures; we'll still flag a renderer reset.
            }
            result.updated = true;
            result.requiresRendererReset = true;
            return result;
          }

          ensureFunction('setValue');
          ensureFunction('updateCache');
          ensureArray();

          const hasUniform = ensureUniformObject();
          if (!hasUniform) {
            const { entry: stabilised } = stabiliseRendererUniformEntry(entry, key);
            try {
              container[key] = stabilised;
            } catch (assignmentError) {
              // Ignore assignment failures; caller will handle fallback.
            }
            result.updated = true;
            result.requiresRendererReset = true;
            return result;
          }

          if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
            try {
              entry.value =
                typeof entry.uniform?.value !== 'undefined' ? entry.uniform.value : null;
              result.updated = true;
            } catch (entryAssignError) {
              const { entry: stabilised } = stabiliseRendererUniformEntry(entry, key);
              try {
                container[key] = stabilised;
              } catch (assignmentError) {
                // Ignore assignment failures.
              }
              result.updated = true;
              result.requiresRendererReset = true;
              return result;
            }
          }

          return result;
        };

        const sanitizeUniformContainer = (uniforms) => {
          if (!uniforms || typeof uniforms !== 'object') {
            return { updated: false, requiresRendererReset: false };
          }

          let updated = false;
          let requiresRendererReset = false;
          const visited = new Set();

          if (isRendererManagedUniformContainer(uniforms)) {
            if (!uniforms.map || typeof uniforms.map !== 'object') {
              uniforms.map = {};
              updated = true;
              requiresRendererReset = true;
            }

            if (Array.isArray(uniforms.seq)) {
              for (let i = 0; i < uniforms.seq.length; i += 1) {
                if (!Object.prototype.hasOwnProperty.call(uniforms.seq, i)) {
                  uniforms.seq.splice(i, 1);
                  i -= 1;
                  updated = true;
                  requiresRendererReset = true;
                  continue;
                }

                const repairResult = repairRendererUniformEntry(uniforms.seq, i, uniforms.seq[i]);
                if (repairResult.removed) {
                  const { entry: stabilised } = stabiliseRendererUniformEntry(uniforms.seq[i], i);
                  uniforms.seq[i] = stabilised;
                  updated = true;
                  requiresRendererReset = true;
                }
                if (repairResult.updated) {
                  updated = true;
                }
                if (repairResult.requiresRendererReset) {
                  requiresRendererReset = true;
                }
              }
            }

            if (uniforms.map && typeof uniforms.map === 'object') {
              Object.keys(uniforms.map).forEach((key) => {
                const repairResult = repairRendererUniformEntry(uniforms.map, key, uniforms.map[key]);
                if (repairResult.removed) {
                  const { entry: stabilised } = stabiliseRendererUniformEntry(uniforms.map[key], key);
                  uniforms.map[key] = stabilised;
                  updated = true;
                  requiresRendererReset = true;
                }
                if (repairResult.updated) {
                  updated = true;
                }
                if (repairResult.requiresRendererReset) {
                  requiresRendererReset = true;
                }
              });
            }

            return { updated, requiresRendererReset };
          }

          const processResult = (result) => {
            if (!result) {
              return;
            }
            if (result.updated) {
              updated = true;
            }
            if (result.requiresRendererReset) {
              requiresRendererReset = true;
            }
          };

          const processKey = (key) => {
            if (typeof key !== 'string' && typeof key !== 'number') {
              return;
            }
            const normalizedKey = `${key}`;
            if (!normalizedKey || visited.has(normalizedKey)) {
              return;
            }
            visited.add(normalizedKey);
            processResult(
              sanitizeUniformEntry(uniforms, normalizedKey, uniforms[normalizedKey])
            );
          };

          const sanitizeArrayEntries = (container, options = {}) => {
            if (!Array.isArray(container)) {
              return;
            }
            const { markRendererReset = false, rendererManaged = false } = options;
            for (let i = 0; i < container.length; i += 1) {
              if (!Object.prototype.hasOwnProperty.call(container, i)) {
                if (rendererManaged) {
                  container[i] = {
                    id: `${i}`,
                    setValue: () => {},
                    updateCache: () => {},
                    cache: [],
                    uniform: { value: null },
                    value: null,
                  };
                } else {
                  container[i] = { value: null };
                }
                updated = true;
                if (markRendererReset) {
                  requiresRendererReset = true;
                }
                continue;
              }
              if (rendererManaged) {
                const repairResult = repairRendererUniformEntry(container, i, container[i]);
                if (repairResult.removed) {
                  container.splice(i, 1);
                  i -= 1;
                  updated = true;
                }
                if (repairResult.updated) {
                  updated = true;
                }
                if (markRendererReset && repairResult.requiresRendererReset) {
                  requiresRendererReset = true;
                }
              } else {
                const result = sanitizeUniformEntry(container, i, container[i], {
                  markRendererReset,
                });
                processResult(result);
                if (markRendererReset && result && result.updated) {
                  requiresRendererReset = true;
                }
              }
            }
          };

          sanitizeArrayEntries(uniforms);

          Object.keys(uniforms).forEach((key) => {
            if (key === 'map' && uniforms.map && typeof uniforms.map === 'object') {
              Object.keys(uniforms.map).forEach((mapKey) => {
                const result = sanitizeUniformEntry(uniforms.map, mapKey, uniforms.map[mapKey], {
                  markRendererReset: true,
                });
                processResult(result);
              });
              return;
            }

            if (key === 'seq' && Array.isArray(uniforms.seq)) {
              sanitizeArrayEntries(uniforms.seq, { markRendererReset: true, rendererManaged: true });
              return;
            }

            if (RESERVED_UNIFORM_CONTAINER_KEYS.has(key)) {
              return;
            }

            processKey(key);
          });

          return { updated, requiresRendererReset };
        };

        scene.traverse((object) => {
          if (!object) return;

          const collectedMaterials = [];
          const collectMaterial = (candidate) => {
            if (!candidate) {
              return;
            }
            if (Array.isArray(candidate)) {
              candidate.forEach((entry) => collectMaterial(entry));
              return;
            }
            collectedMaterials.push(candidate);
          };

          collectMaterial(object.material);
          collectMaterial(object.customDepthMaterial);
          collectMaterial(object.customDistanceMaterial);

          if (collectedMaterials.length === 0) {
            return;
          }

          collectedMaterials.forEach((mat) => {
            if (!mat || visitedMaterials.has(mat)) {
              return;
            }
            visitedMaterials.add(mat);
            let updated = false;
            let rendererReset = false;
            const isShaderMaterial =
              mat?.isShaderMaterial === true || mat?.type === 'ShaderMaterial';
            const portalMetadata = mat?.userData?.portalSurface || null;
            const hasPortalUniforms = hasValidPortalUniformStructure(mat?.uniforms);
            const usesPortalShader = materialUsesPortalSurfaceShader(mat);

            const distanceUniformResult = ensureDistanceMaterialUniformIntegrity(mat);
            if (distanceUniformResult.modified) {
              updated = true;
            }
            if (distanceUniformResult.requiresRendererReset) {
              rendererReset = true;
            }

            const shouldInspect = Boolean(
              isShaderMaterial || portalMetadata || hasPortalUniforms || usesPortalShader
            );
            if (shouldInspect) {
              const forcePortalUniforms = Boolean(
                isShaderMaterial || hasPortalUniforms || usesPortalShader
              );
              const ensured = ensurePortalShaderMaterialsHaveUniformValues(
                [mat],
                portalMetadata,
                { forceExpectPortal: forcePortalUniforms }
              );
              if (ensured) {
                updated = true;
                sanitized = true;
              }
            }

            const shouldSanitizeMaterialUniforms = Boolean(
              isShaderMaterial || hasPortalUniforms || usesPortalShader
            );

            if (shouldSanitizeMaterialUniforms && mat.uniforms && typeof mat.uniforms === 'object') {
              const guardedUniforms = guardUniformContainer(mat.uniforms);
              if (guardedUniforms && guardedUniforms !== mat.uniforms) {
                mat.uniforms = guardedUniforms;
              }
              const result = sanitizeUniformContainer(mat.uniforms);
              if (result.updated) {
                updated = true;
                rendererReset = true;
              }
              if (result.requiresRendererReset) {
                rendererReset = true;
              }
            }

            const props =
              renderer?.properties && typeof renderer.properties.get === 'function'
                ? renderer.properties.get(mat)
                : null;
            const uniformsList =
              Array.isArray(props?.uniformsList) && props.uniformsList.length > 0
                ? props.uniformsList
                : null;
            if (uniformsList) {
              const listHasInvalidEntry = uniformsList.some((entry) => {
                if (!entry || typeof entry !== 'object') {
                  return true;
                }
                const uniformRef = entry.uniform;
                if (!uniformRef || typeof uniformRef !== 'object') {
                  return true;
                }
                if (!Object.prototype.hasOwnProperty.call(uniformRef, 'value')) {
                  return true;
                }
                return typeof uniformRef.value === 'undefined';
              });
              if (listHasInvalidEntry) {
                if (renderer?.properties?.remove) {
                  try {
                    renderer.properties.remove(mat);
                  } catch (removeError) {
                    // Ignore removal failures; renderer will rebuild the cache on the next frame.
                  }
                }
                sanitized = true;
                rendererReset = true;
                return;
              }
            }
            const rendererUniformsCandidate =
              props && typeof props.uniforms === 'object' ? props.uniforms : null;
            const programInfo = props?.program?.getUniforms?.() ?? null;

            const rendererUniformsNeedSanitization =
              uniformContainerNeedsSanitization(rendererUniformsCandidate) ||
              uniformContainerNeedsSanitization(programInfo);
            const shouldSanitizeRendererUniforms =
              Boolean(renderer?.properties?.get) &&
              (isShaderMaterial ||
                hasPortalUniforms ||
                usesPortalShader ||
                rendererUniformsNeedSanitization);
            if (shouldSanitizeRendererUniforms) {
              const rendererUniforms = rendererUniformsCandidate;

              if (rendererUniforms && typeof rendererUniforms === 'object') {
                const purgedRendererUniforms = purgeRendererUniformCache(rendererUniforms);
                if (purgedRendererUniforms) {
                  sanitized = true;
                  rendererReset = true;
                }

                const rendererUniformSanitization = sanitizeUniformContainer(rendererUniforms);
                if (rendererUniformSanitization.updated) {
                  sanitized = true;
                  rendererReset = true;
                }
                if (rendererUniformSanitization.requiresRendererReset) {
                  rendererReset = true;
                  sanitized = true;
                }

                if (
                  programInfo &&
                  programInfo !== rendererUniforms &&
                  typeof programInfo === 'object'
                ) {
                  const purgedProgramUniforms = purgeRendererUniformCache(programInfo);
                  if (purgedProgramUniforms) {
                    sanitized = true;
                    rendererReset = true;
                  }

                  const programUniformSanitization = sanitizeUniformContainer(programInfo);
                  if (programUniformSanitization.updated) {
                    sanitized = true;
                    rendererReset = true;
                  }
                  if (programUniformSanitization.requiresRendererReset) {
                    rendererReset = true;
                    sanitized = true;
                  }
                }

                const ensureRendererManagedUniform = (uniformId) => {
                  if (uniformId === null || typeof uniformId === 'undefined') {
                    return;
                  }
                  const key = `${uniformId}`;
                  if (!key) {
                    return;
                  }

                  if (!rendererUniforms.map || typeof rendererUniforms.map !== 'object') {
                    rendererUniforms.map = {};
                    rendererReset = true;
                    sanitized = true;
                  }

                  if (!Array.isArray(rendererUniforms.seq)) {
                    rendererUniforms.seq = [];
                    rendererReset = true;
                    sanitized = true;
                  }

                  const ensureSequenceEntry = (entry) => {
                    let hasEntry = false;
                    for (let i = 0; i < rendererUniforms.seq.length; i += 1) {
                      const seqEntry = rendererUniforms.seq[i];
                      if (!seqEntry || typeof seqEntry !== 'object') {
                        rendererUniforms.seq[i] = entry;
                        hasEntry = true;
                        rendererReset = true;
                        sanitized = true;
                        break;
                      }
                      const seqId =
                        typeof seqEntry.id === 'string' || typeof seqEntry.id === 'number'
                          ? `${seqEntry.id}`
                          : typeof seqEntry.name === 'string' || typeof seqEntry.name === 'number'
                          ? `${seqEntry.name}`
                          : null;
                      if (seqId === key) {
                        hasEntry = true;
                        break;
                      }
                    }
                    if (!hasEntry) {
                      rendererUniforms.seq.push(entry);
                      rendererReset = true;
                      sanitized = true;
                    }
                  };

                  let entry = rendererUniforms.map[key];
                  const repairResult = repairRendererUniformEntry(rendererUniforms.map, key, entry);
                  if (repairResult.removed) {
                    delete rendererUniforms.map[key];
                    rendererReset = true;
                    sanitized = true;
                    return;
                  }
                  if (repairResult.updated) {
                    rendererReset = true;
                    sanitized = true;
                  }
                  if (repairResult.requiresRendererReset) {
                    rendererReset = true;
                  }
                  entry = rendererUniforms.map[key];
                  if (!entry || typeof entry !== 'object') {
                    return;
                  }
                  ensureSequenceEntry(entry);
                };

                if (isRendererManagedUniformContainer(rendererUniforms) && programInfo) {
                  if (programInfo.map && typeof programInfo.map === 'object') {
                    Object.keys(programInfo.map).forEach((key) => {
                      if (typeof key === 'string' && key) {
                        ensureRendererManagedUniform(key);
                      }
                    });
                  } else if (Array.isArray(programInfo.seq)) {
                    programInfo.seq.forEach((uniform) => {
                      const uniformId =
                        typeof uniform?.id === 'string' || typeof uniform?.id === 'number'
                          ? `${uniform.id}`
                          : typeof uniform?.name === 'string' || typeof uniform?.name === 'number'
                          ? `${uniform.name}`
                          : null;
                      if (uniformId) {
                        ensureRendererManagedUniform(uniformId);
                      }
                    });
                  }
                }

                if (!isRendererManagedUniformContainer(rendererUniforms) && programInfo) {
                  let programUniformsUpdated = false;
                  let programUniformsRequireReset = false;

                  const ensureProgramUniform = (key) => {
                    if (!key) {
                      return;
                    }
                    if (isRendererManagedUniform(key)) {
                      return;
                    }
                    const result = sanitizeUniformEntry(rendererUniforms, key, rendererUniforms[key], {
                      markRendererReset: true,
                    });
                    if (result.updated) {
                      programUniformsUpdated = true;
                    }
                    if (result.requiresRendererReset) {
                      programUniformsRequireReset = true;
                    }
                  };

                  if (programInfo.map && typeof programInfo.map === 'object') {
                    Object.keys(programInfo.map).forEach((key) => {
                      ensureProgramUniform(key);
                    });
                  } else if (Array.isArray(programInfo.seq)) {
                    programInfo.seq.forEach((uniformEntry) => {
                      const uniformId =
                        typeof uniformEntry?.id === 'string' || typeof uniformEntry?.id === 'number'
                          ? `${uniformEntry.id}`
                          : null;
                      if (uniformId) {
                        ensureProgramUniform(uniformId);
                      }
                    });
                  }

                  if (programUniformsUpdated) {
                    sanitized = true;
                  }
                  if (programUniformsRequireReset) {
                    rendererReset = true;
                  }
                }

                if (shouldSanitizeMaterialUniforms) {
                  if (!mat.uniforms || typeof mat.uniforms !== 'object') {
                    mat.uniforms = guardUniformContainer({});
                  } else {
                    const guarded = guardUniformContainer(mat.uniforms);
                    if (guarded && guarded !== mat.uniforms) {
                      mat.uniforms = guarded;
                    }
                  }

                  const ensuredKeys = new Set();
                  const ensureMaterialUniformEntry = (rawKey, sourceEntry = null, options = {}) => {
                    if (rawKey === null || typeof rawKey === 'undefined') {
                      return;
                    }
                    const key = `${rawKey}`;
                    if (!key || ensuredKeys.has(key)) {
                      return;
                    }
                    ensuredKeys.add(key);

                    const { primary = false } = options;

                    const linkRendererUniform = (uniformObject) => {
                      if (!uniformObject || typeof uniformObject !== 'object') {
                        return;
                      }
                      if (sourceEntry && typeof sourceEntry === 'object') {
                        const current = sourceEntry.uniform;
                        if (current !== uniformObject) {
                          sourceEntry.uniform = uniformObject;
                          updated = true;
                        } else if (
                          current &&
                          typeof current === 'object' &&
                          Object.prototype.hasOwnProperty.call(current, 'value') &&
                          typeof current.value === 'undefined'
                        ) {
                          current.value = null;
                          updated = true;
                        }
                      }
                      if (
                        rendererUniforms &&
                        rendererUniforms.map &&
                        typeof rendererUniforms.map === 'object'
                      ) {
                        const mappedEntry = rendererUniforms.map[key];
                        if (mappedEntry && typeof mappedEntry === 'object') {
                          if (mappedEntry.uniform !== uniformObject) {
                            mappedEntry.uniform = uniformObject;
                            updated = true;
                          } else if (
                            mappedEntry.uniform &&
                            typeof mappedEntry.uniform === 'object' &&
                            Object.prototype.hasOwnProperty.call(mappedEntry.uniform, 'value') &&
                            typeof mappedEntry.uniform.value === 'undefined'
                          ) {
                            mappedEntry.uniform.value = null;
                            updated = true;
                          }
                        }
                      }
                    };

                    if (isRendererManagedUniform(key)) {
                      if (primary) {
                        linkRendererUniform({ value: null });
                      }
                      return;
                    }

                    let entry = mat.uniforms[key];
                    if (!entry || typeof entry !== 'object') {
                      entry = {
                        value:
                          entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')
                            ? entry.value
                            : null,
                      };
                      mat.uniforms[key] = entry;
                      updated = true;
                    } else if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
                      let preservedValue = null;
                      if (typeof entry.value !== 'undefined') {
                        preservedValue = entry.value;
                      } else if (typeof entry.clone === 'function') {
                        try {
                          preservedValue = entry.clone();
                        } catch (cloneError) {
                          preservedValue = null;
                        }
                      }
                      entry = { value: preservedValue };
                      mat.uniforms[key] = entry;
                      updated = true;
                    } else if (typeof entry.value === 'undefined') {
                      entry.value = null;
                      updated = true;
                    }

                    if (primary) {
                      linkRendererUniform(entry);
                    }
                  };

                  const enumerateUniformKeyCandidates = (candidate) => {
                    if (candidate === null || typeof candidate === 'undefined') {
                      return [];
                    }
                    const key = `${candidate}`;
                    if (!key) {
                      return [];
                    }
                    const normalized = key.replace(/\[[^\]]*\]/g, '.');
                    const segments = normalized.split('.').filter(Boolean);
                    const variants = new Set([key, normalized]);

                    if (segments.length) {
                      variants.add(segments.join('.'));
                      for (let i = 0; i < segments.length; i += 1) {
                        variants.add(segments[i]);
                        const suffix = segments.slice(i).join('.');
                        if (suffix) {
                          variants.add(suffix);
                        }
                        if (i > 0) {
                          const prefix = segments.slice(0, i).join('.');
                          if (prefix) {
                            variants.add(prefix);
                          }
                        }
                      }
                    }

                    return Array.from(variants).filter(Boolean);
                  };

                  const ensureMaterialUniform = (uniformId, uniformEntry = null) => {
                    const candidateMap = new Map();

                    const registerCandidate = (value, primary = false) => {
                      if (value === null || typeof value === 'undefined') {
                        return;
                      }
                      const baseKey = `${value}`;
                      if (!baseKey) {
                        return;
                      }
                      const markCandidate = (key, markPrimary = false) => {
                        if (!key) {
                          return;
                        }
                        const existing = candidateMap.get(key);
                        if (existing) {
                          existing.primary = existing.primary || markPrimary;
                        } else {
                          candidateMap.set(key, { primary: markPrimary });
                        }
                      };

                      markCandidate(baseKey, primary);
                      enumerateUniformKeyCandidates(value).forEach((variant) => {
                        if (variant !== baseKey) {
                          markCandidate(variant, false);
                        }
                      });
                    };

                    registerCandidate(uniformId, true);

                    if (uniformEntry && typeof uniformEntry === 'object') {
                      registerCandidate(uniformEntry.id, true);
                      registerCandidate(uniformEntry.name, true);
                      if (uniformEntry.uniform && typeof uniformEntry.uniform === 'object') {
                        registerCandidate(uniformEntry.uniform.id, true);
                        registerCandidate(uniformEntry.uniform.name, true);
                      }
                    }

                    candidateMap.forEach((meta, key) => {
                      ensureMaterialUniformEntry(key, uniformEntry, { primary: meta.primary });
                    });
                  };

                  if (Array.isArray(rendererUniforms.seq)) {
                    rendererUniforms.seq.forEach((uniform) => {
                      if (!uniform || typeof uniform !== 'object') {
                        return;
                      }
                      ensureMaterialUniform(uniform.id ?? uniform.name ?? null, uniform);
                    });
                  }

                  if (rendererUniforms.map && typeof rendererUniforms.map === 'object') {
                    Object.keys(rendererUniforms.map).forEach((key) => {
                      const entry = rendererUniforms.map[key];
                      ensureMaterialUniform(key, entry && typeof entry === 'object' ? entry : null);
                    });
                  }
                }
              }
            }

            if (rendererReset && renderer?.properties?.remove) {
              try {
                renderer.properties.remove(mat);
              } catch (removeError) {
                // Ignore renderer cache removal failures.
              }
              if ('needsUpdate' in mat) {
                mat.needsUpdate = true;
              }
              if ('uniformsNeedUpdate' in mat) {
                mat.uniformsNeedUpdate = true;
              }
              sanitized = true;
              return;
            }
            if (updated) {
              if ('uniformsNeedUpdate' in mat) {
                mat.uniformsNeedUpdate = true;
              }
              if ('needsUpdate' in mat) {
                mat.needsUpdate = true;
              }
              sanitized = true;
            }
          });
        });

        return sanitized;
      }

      function sceneHasUniformIntegrityIssues() {
        if (!scene || typeof scene.traverse !== 'function') {
          return false;
        }

        const visitedMaterials = new Set();
        let invalid = false;

        scene.traverse((object) => {
          if (invalid || !object) {
            return;
          }

          const collectedMaterials = [];
          const collectMaterial = (candidate) => {
            if (!candidate) {
              return;
            }
            if (Array.isArray(candidate)) {
              candidate.forEach((entry) => collectMaterial(entry));
              return;
            }
            collectedMaterials.push(candidate);
          };

          collectMaterial(object.material);
          collectMaterial(object.customDepthMaterial);
          collectMaterial(object.customDistanceMaterial);

          if (!collectedMaterials.length) {
            return;
          }

          collectedMaterials.forEach((mat) => {
            if (invalid || !mat || visitedMaterials.has(mat)) {
              return;
            }
            visitedMaterials.add(mat);

            const portalMetadata = mat?.userData?.portalSurface ?? null;
            const isShaderMaterial =
              mat?.isShaderMaterial === true || mat?.type === 'ShaderMaterial';
            const usesPortalShader = materialUsesPortalSurfaceShader(mat);
            const hasPortalUniforms = hasValidPortalUniformStructure(mat.uniforms);
            const expectsPortalUniforms =
              usesPortalShader || hasPortalUniforms || (portalMetadata && isShaderMaterial);
            if (expectsPortalUniforms && !hasPortalUniforms) {
              invalid = true;
              return;
            }

            if (uniformContainerNeedsSanitization(mat.uniforms)) {
              invalid = true;
              return;
            }

            if (renderer?.properties?.get) {
              let materialProperties = null;
              try {
                materialProperties = renderer.properties.get(mat) ?? null;
              } catch (propertyError) {
                materialProperties = null;
              }

              const rendererUniforms =
                materialProperties && typeof materialProperties.uniforms === 'object'
                  ? materialProperties.uniforms
                  : null;
              if (uniformContainerNeedsSanitization(rendererUniforms)) {
                invalid = true;
                return;
              }

              const programUniforms =
                materialProperties &&
                materialProperties.program &&
                typeof materialProperties.program.getUniforms === 'function'
                  ? materialProperties.program.getUniforms()
                  : null;
              if (uniformContainerNeedsSanitization(programUniforms)) {
                invalid = true;
              }
            }
          });
        });

        return invalid;
      }

    function rebuildInvalidMaterialUniforms(error) {
      if (!renderer || !scene || typeof renderer.properties?.get !== 'function') {
        return false;
      }

      const RENDERER_UNIFORM_CORRUPTION_SENTINEL = '__renderer_uniform_reset__';

        const enumerateUniformKeyCandidates = (uniformKey) => {
          const normalizedKeys = [];
          const pushCandidate = (key) => {
            if (typeof key !== 'string') {
              return;
            }
            if (key && !normalizedKeys.includes(key)) {
              normalizedKeys.push(key);
            }
          };

          if (typeof uniformKey === 'string') {
            pushCandidate(uniformKey);
            const sanitizedKey = uniformKey.replace(/\[[^\]]*\]/g, '.');
            const segments = sanitizedKey.split('.').filter(Boolean);
            for (let i = segments.length; i >= 1; i -= 1) {
              pushCandidate(segments.slice(0, i).join('.'));
            }
            for (let i = 0; i < segments.length; i += 1) {
              pushCandidate(segments.slice(i).join('.'));
            }
          } else {
            pushCandidate(`${uniformKey}`);
          }

          return normalizedKeys;
        };

        const findUniformInContainer = (container, uniformKey) => {
          if (!container || typeof container !== 'object') {
            return { hasDefinition: false, uniform: null };
          }

          const candidates = enumerateUniformKeyCandidates(uniformKey);

          for (const candidate of candidates) {
            if (!candidate) continue;

            if (Object.prototype.hasOwnProperty.call(container, candidate)) {
              return { hasDefinition: true, uniform: container[candidate] };
            }

            if (typeof container.get === 'function') {
              try {
                const viaGetter = container.get(candidate);
                if (viaGetter !== undefined) {
                  return { hasDefinition: true, uniform: viaGetter };
                }
              } catch (getterError) {
                // Ignore lookup errors from custom uniform containers.
              }
            }

            if (container.map && typeof container.map === 'object' && candidate in container.map) {
              return { hasDefinition: true, uniform: container.map[candidate] };
            }
          }

          return { hasDefinition: false, uniform: null };
        };

        const hasUsableUniformValue = (uniform) => {
          if (!uniform || typeof uniform !== 'object') {
            return false;
          }

          if (Object.prototype.hasOwnProperty.call(uniform, 'value')) {
            return typeof uniform.value !== 'undefined';
          }

          if (uniform.uniform && typeof uniform.uniform === 'object') {
            if (!Object.prototype.hasOwnProperty.call(uniform.uniform, 'value')) {
              return false;
            }
            return typeof uniform.uniform.value !== 'undefined';
          }

          if (typeof uniform.setValue === 'function') {
            return (
              uniform.uniform &&
              typeof uniform.uniform === 'object' &&
              Object.prototype.hasOwnProperty.call(uniform.uniform, 'value') &&
              typeof uniform.uniform.value !== 'undefined'
            );
          }

          if (uniform.map && typeof uniform.map === 'object' && Array.isArray(uniform.seq)) {
            return true;
          }

          return false;
        };

      let recovered = false;

      const updateSharedMaterialReference = (oldMaterial, newMaterial) => {
        if (!oldMaterial || !newMaterial || oldMaterial === newMaterial) {
          return;
        }
        if (voxelIslandAssets.material === oldMaterial) {
          voxelIslandAssets.material = newMaterial;
        }
        if (treeLeavesMaterial === oldMaterial) {
          treeLeavesMaterial = newMaterial;
        }
        const materials = previewAssets?.materials;
        if (materials && typeof materials === 'object') {
          Object.keys(materials).forEach((key) => {
            if (materials[key] === oldMaterial) {
              materials[key] = newMaterial;
            }
          });
        }
      };

      const updateCachedMaterial = (oldMaterial, newMaterial) => {
        baseMaterialCache.forEach((cached, key) => {
          if (cached === oldMaterial) {
            baseMaterialCache.set(key, newMaterial);
          }
        });
        accentMaterialCache.forEach((cached, key) => {
          if (cached === oldMaterial) {
            accentMaterialCache.set(key, newMaterial);
          }
        });
        updateSharedMaterialReference(oldMaterial, newMaterial);
      };
      const inspectMaterial = (host, material, index) => {
        if (!material || sanitizedMaterialRefs.has(material)) {
          return;
        }
        const props = renderer.properties.get(material) ?? {};
        const uniformContainers = [];
        let rendererUniformsCorrupted = false;
        const rendererUniformsList = Array.isArray(props?.uniformsList) ? props.uniformsList : null;
        if (rendererUniformsList) {
          const hasInvalidUniformListEntry = rendererUniformsList.some((entry) => {
            if (!entry || typeof entry !== 'object') {
              return true;
            }
            const uniformRef = entry.uniform;
            if (!uniformRef || typeof uniformRef !== 'object') {
              return true;
            }
            if (!Object.prototype.hasOwnProperty.call(uniformRef, 'value')) {
              return true;
            }
            return typeof uniformRef.value === 'undefined';
          });
          if (hasInvalidUniformListEntry) {
            rendererUniformsCorrupted = true;
          }
        }
        if (material.uniforms && typeof material.uniforms === 'object') {
          uniformContainers.push(material.uniforms);
        }
        const rendererUniformsCandidate =
          props && typeof props.uniforms === 'object' ? props.uniforms : null;
        if (rendererUniformsCandidate) {
          uniformContainers.push(rendererUniformsCandidate);
        }
        const portalUserMetadata = material?.userData?.portalSurface ?? null;
        const isShaderMaterial =
          material?.isShaderMaterial === true || material?.type === 'ShaderMaterial';
        const portalShaderSignature = isShaderMaterial && materialUsesPortalSurfaceShader(material);
        const portalMetadata =
          portalUserMetadata ??
          (portalShaderSignature ? inferPortalMaterialState(material) : null);
        const expectPortalUniforms = Boolean(
          portalShaderSignature ||
            (portalMetadata && (isShaderMaterial || hasValidPortalUniformStructure(material?.uniforms)))
        );
        const programInfo = props.program?.getUniforms?.() ?? null;
        const keySet = new Set();
        uniformContainers.forEach((container) => {
          if (!container || typeof container !== 'object') {
            return;
          }

          const isRendererUniformContainer = isRendererManagedUniformContainer(container);

          if (!isRendererUniformContainer) {
            Object.keys(container).forEach((key) => {
              if (
                typeof key !== 'string' ||
                !key ||
                key === 'map' ||
                key === 'seq' ||
                key === 'value'
              ) {
                return;
              }

              // Register the uniform key even when the stored entry is malformed so that
              // recovery logic can detect the missing value instead of skipping it outright.
              keySet.add(key);

              const entry = container[key];
              if (
                entry &&
                typeof entry === 'object' &&
                (Object.prototype.hasOwnProperty.call(entry, 'value') ||
                  typeof entry.setValue === 'function' ||
                  (entry.map &&
                    typeof entry.map === 'object' &&
                    Array.isArray(entry.seq)))
              ) {
                return;
              }
            });
          } else {
            const inspectRendererUniformEntry = (entry) => {
              if (!hasUsableUniformValue(entry)) {
                rendererUniformsCorrupted = true;
              }
            };

            if (Array.isArray(container.seq)) {
              container.seq.forEach((entry) => {
                inspectRendererUniformEntry(entry);
              });
            }

            if (container.map && typeof container.map === 'object') {
              Object.values(container.map).forEach((entry) => {
                inspectRendererUniformEntry(entry);
              });
            }
          }

          if (container.map && typeof container.map === 'object') {
            Object.keys(container.map).forEach((key) => {
              if (typeof key === 'string' && key && key !== 'value') {
                keySet.add(key);
              }
            });
          }
        });
        if (programInfo && typeof programInfo === 'object') {
          if (programInfo.map && typeof programInfo.map === 'object') {
            Object.keys(programInfo.map).forEach((key) => {
              if (typeof key === 'string' && key) {
                keySet.add(key);
              }
            });
          } else if (Array.isArray(programInfo.seq)) {
            programInfo.seq.forEach((uniform) => {
              if (!uniform || typeof uniform.id === 'undefined') {
                return;
              }
              const uniformId = typeof uniform.id === 'string' ? uniform.id : `${uniform.id}`;
              if (uniformId) {
                keySet.add(uniformId);
              }
            });
          }
        }
        if (expectPortalUniforms) {
          PORTAL_UNIFORM_KEYS.forEach((key) => {
            if (key) {
              keySet.add(key);
            }
          });
        }
        const programUniformKeys = Array.from(keySet);
        const missingUniforms = rendererUniformsCorrupted
          ? [RENDERER_UNIFORM_CORRUPTION_SENTINEL]
          : [];

        if (!programUniformKeys.length) {
          const portalUniformsInvalid =
            expectPortalUniforms && !hasValidPortalUniformStructure(material?.uniforms);
          if (portalUniformsInvalid) {
            PORTAL_UNIFORM_KEYS.forEach((key) => {
              if (typeof key === 'string' && key && !missingUniforms.includes(key)) {
                missingUniforms.push(key);
              }
            });
          } else if (!rendererUniformsCorrupted) {
            return;
          }
        }

        if (!missingUniforms.length) {
          programUniformKeys.forEach((key) => {
            const uniformKey = typeof key === 'string' ? key : `${key}`;
            if (isRendererManagedUniform(uniformKey)) {
              return;
            }

            let definitions = 0;
            let validDefinitions = 0;
            let invalidDefinitions = 0;

            uniformContainers.forEach((container) => {
              const isRendererContainer = isRendererManagedUniformContainer(container);
              const { hasDefinition, uniform } = findUniformInContainer(container, uniformKey);
              if (!hasDefinition) {
                return;
              }
              if (isRendererContainer) {
                if (!hasUsableUniformValue(uniform)) {
                  invalidDefinitions += 1;
                }
                return;
              }

              definitions += 1;
              if (hasUsableUniformValue(uniform)) {
                validDefinitions += 1;
              } else {
                invalidDefinitions += 1;
              }
            });

            if (!definitions || invalidDefinitions > 0 || validDefinitions === 0) {
              missingUniforms.push(uniformKey);
            }
          });
        }
        if (!missingUniforms.length) {
          return;
        }
        let replacement = null;

        const attemptInPlaceRepair = () => {
          const uniformKeysToRepair = missingUniforms.filter(
            (key) => key !== RENDERER_UNIFORM_CORRUPTION_SENTINEL
          );
          const requiresRendererUniformReset = missingUniforms.includes(
            RENDERER_UNIFORM_CORRUPTION_SENTINEL
          );

          if (!uniformKeysToRepair.length && !requiresRendererUniformReset) {
            return false;
          }
          if (!material || typeof material !== 'object') {
            return false;
          }

          if (uniformKeysToRepair.length) {
            if (!material.uniforms || typeof material.uniforms !== 'object') {
              return false;
            }

            ensurePortalUniformIntegrity(material, {
              missingKeys: uniformKeysToRepair,
              expectPortal: expectPortalUniforms,
              metadata: portalMetadata,
            });

            const unresolved = uniformKeysToRepair.filter((key) => {
              const uniform = material.uniforms?.[key];
              return (
                !uniform ||
                typeof uniform !== 'object' ||
                !Object.prototype.hasOwnProperty.call(uniform, 'value')
              );
            });

            if (unresolved.length) {
              return false;
            }
          }

          const boundLight = getRendererBoundLight(material);
          try {
            renderer.properties.remove(material);
          } catch (removeError) {
            // Ignore failures removing cached material properties; renderer will rebuild them when needed.
          }
          restoreRendererBoundLight(material, boundLight);

          if ('needsUpdate' in material) {
            material.needsUpdate = true;
          }
          if ('uniformsNeedUpdate' in material) {
            material.uniformsNeedUpdate = true;
          }

          sanitizedMaterialRefs.add(material);
          recovered = true;
          if (!error?.__silentUniformRepair) {
            console.warn(
              'Repaired material uniforms in-place after renderer failure.',
              {
                name: material.name || host.name || 'unnamed-material',
                type: material.type,
                missingUniforms: uniformKeysToRepair,
                resetRendererCache: requiresRendererUniformReset,
                originalError: error?.message ?? error,
              }
            );
          }
          return true;
        };

        if (attemptInPlaceRepair()) {
          return;
        }

        if (expectPortalUniforms) {
          const rebuildResult = recreatePortalSurfaceMaterialFromMetadata(portalMetadata, {
            onShaderError: (factoryError, context) => {
              console.warn(
                'Failed to regenerate portal surface shader; switching to emissive fallback material.',
                {
                  error: factoryError,
                  accentColor: context.accentColor,
                  isActive: context.isActive,
                }
              );
            },
          });
          replacement = rebuildResult.material;
          if (rebuildResult.usedFallback && replacement) {
            replacement.renderOrder = material.renderOrder ?? replacement.renderOrder ?? 2;
          }
        }
        if (!replacement && portalMetadata) {
          const rebuildResult = recreatePortalSurfaceMaterialFromMetadata(portalMetadata);
          replacement = rebuildResult.material;
          if (rebuildResult.usedFallback && replacement) {
            replacement.renderOrder = material.renderOrder ?? replacement.renderOrder ?? 2;
          }
        }
        if (!replacement) {
          replacement = material.clone();
        }

        const uniformKeysToRepair = missingUniforms.filter(
          (key) => key !== RENDERER_UNIFORM_CORRUPTION_SENTINEL
        );
        const shouldRepairPortalUniforms =
          uniformKeysToRepair.length > 0 &&
          replacement &&
          typeof replacement === 'object' &&
          (replacement.isShaderMaterial === true ||
            replacement.type === 'ShaderMaterial' ||
            hasValidPortalUniformStructure(replacement.uniforms));
        if (shouldRepairPortalUniforms) {
          ensurePortalUniformIntegrity(replacement, {
            missingKeys: uniformKeysToRepair,
            expectPortal: expectPortalUniforms,
            metadata: portalMetadata,
          });
        }

        if (portalMetadata) {
          if (expectPortalUniforms && hasValidPortalUniformStructure(replacement.uniforms)) {
            tagPortalSurfaceMaterial(replacement, portalMetadata.accentColor, portalMetadata.isActive);
          } else if (replacement?.userData?.portalSurface) {
            delete replacement.userData.portalSurface;
          }
        }
        replacement.needsUpdate = true;
        sanitizedMaterialRefs.add(replacement);
          const boundLight = getRendererBoundLight(material);
          if (Array.isArray(host.material)) {
            host.material[index] = replacement;
          } else {
            host.material = replacement;
          }
          renderer.properties.remove(material);
          material.dispose?.();
          if (boundLight) {
            restoreRendererBoundLight(replacement, boundLight);
          }
          updateCachedMaterial(material, replacement);
          resyncPortalSurfaceMaterials(material, replacement);
        recovered = true;
        if (!error?.__silentUniformRepair) {
          console.warn(
            'Rebuilt material after detecting invalid uniform definitions.',
            {
              name: material.name || host.name || 'unnamed-material',
              type: material.type,
              missingUniforms: missingUniforms.filter(
                (key) => key !== RENDERER_UNIFORM_CORRUPTION_SENTINEL
              ),
              originalError: error?.message ?? error,
            }
          );
        }
      };
      scene.traverse((object) => {
        if (!object) {
          return;
        }

        const collectedMaterials = [];
        const collectMaterial = (candidate) => {
          if (!candidate) {
            return;
          }
          if (Array.isArray(candidate)) {
            candidate.forEach((entry) => collectMaterial(entry));
            return;
          }
          collectedMaterials.push(candidate);
        };

        collectMaterial(object.material);
        collectMaterial(object.customDepthMaterial);
        collectMaterial(object.customDistanceMaterial);

        collectedMaterials.forEach((mat, idx) => {
          inspectMaterial(object, mat, idx);
        });
      });
      return recovered;
    }

    function resetRendererUniformCaches() {
      if (!renderer?.properties?.remove || !scene?.traverse) {
        return;
      }

      const visited = new Set();
      scene.traverse((object) => {
        if (!object) {
          return;
        }

        const purgeMaterial = (material) => {
          if (!material || visited.has(material)) {
            return;
          }
          visited.add(material);
          try {
            renderer.properties.remove(material);
          } catch (error) {
            // Ignore cache removal failures; renderer will rebuild as needed.
          }
        };

        const materials = [];
        if (Array.isArray(object.material)) {
          materials.push(...object.material);
        } else if (object.material) {
          materials.push(object.material);
        }
        if (object.customDepthMaterial) {
          materials.push(object.customDepthMaterial);
        }
        if (object.customDistanceMaterial) {
          materials.push(object.customDistanceMaterial);
        }

        materials.forEach(purgeMaterial);
      });

      if (renderer.renderLists?.dispose) {
        try {
          renderer.renderLists.dispose();
        } catch (error) {
          // Continue even if render list disposal fails.
        }
      }
    }

    function preemptivelyRepairRendererUniforms() {
      if (!renderer || !scene) {
        return;
      }
      const repairError = new Error("Cannot read properties of undefined (reading 'value')");
      repairError.__silentUniformRepair = true;
      try {
        rebuildInvalidMaterialUniforms(repairError);
      } catch (error) {
        // Ignore repair failures; runtime sanitisation will handle issues if they persist.
      }
    }

    function disablePortalSurfaceShaders(error) {
      const supportWasEnabled = portalShaderSupport;
      portalShaderSupport = false;
      let disabled = false;
      let needsReset = false;
      const layers = Array.isArray(tileRenderState) ? tileRenderState : [];
      const handledMaterials = new Map();
      const disposedMaterials = new Set();

      const parsePortalAccent = (color, fallback = '#7b6bff') => {
        if (!color) {
          return fallback;
        }
        if (typeof color === 'string') {
          return color;
        }
        if (typeof color === 'object') {
          if (typeof color.getHexString === 'function') {
            return `#${color.getHexString()}`;
          }
          if (Array.isArray(color) && color.length >= 3) {
            const [r, g, b] = color;
            const clamp = (value) => Math.min(255, Math.max(0, Math.round(value * 255)));
            return `#${((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, '0')}`;
          }
        }
        return fallback;
      };

      const inferPortalMaterialState = (material, defaultAccent, defaultState) => {
        if (!material || typeof material !== 'object') {
          return null;
        }

        const metadata = material.userData?.portalSurface;
        if (metadata && typeof metadata === 'object') {
          return {
            accentColor: metadata.accentColor ?? defaultAccent ?? '#7b6bff',
            isActive: typeof metadata.isActive === 'boolean' ? metadata.isActive : Boolean(defaultState),
          };
        }

        const uniforms = material.uniforms;
        let signatureDetected = false;
        if (uniforms && typeof uniforms === 'object') {
          for (const key of PORTAL_UNIFORM_KEYS) {
            if (Object.prototype.hasOwnProperty.call(uniforms, key)) {
              signatureDetected = true;
              break;
            }
          }
        }

        if (!signatureDetected) {
          const fragmentShader = typeof material.fragmentShader === 'string' ? material.fragmentShader : '';
          const vertexShader = typeof material.vertexShader === 'string' ? material.vertexShader : '';
          if (
            (fragmentShader && PORTAL_UNIFORM_KEYS.every((key) => fragmentShader.includes(key))) ||
            (vertexShader && PORTAL_UNIFORM_KEYS.every((key) => vertexShader.includes(key)))
          ) {
            signatureDetected = true;
          }
        }

        if (!signatureDetected) {
          return null;
        }

        let accentColor = defaultAccent ?? '#7b6bff';
        let isActive = Boolean(defaultState);

        if (uniforms && typeof uniforms === 'object') {
          const colorUniform = uniforms.uColor;
          if (colorUniform && typeof colorUniform === 'object') {
            accentColor = parsePortalAccent(colorUniform.value, accentColor);
          }
          const activationUniform = uniforms.uActivation;
          if (activationUniform && typeof activationUniform === 'object') {
            const { value } = activationUniform;
            if (typeof value === 'number' && Number.isFinite(value)) {
              isActive = value >= 0.4;
            }
          }
        }

        return { accentColor, isActive };
      };

      const replaceChildMaterial = (child, material, defaultAccent, defaultState) => {
        if (!child || !material) {
          return false;
        }

        let cacheEntry = handledMaterials.get(material);
        let fallback = cacheEntry?.fallback ?? null;
        let accentColor = cacheEntry?.accentColor ?? defaultAccent ?? '#7b6bff';
        let isActive = cacheEntry?.isActive ?? Boolean(defaultState);

        const ensureFallbackMaterial = () => {
          if (fallback) {
            if (child.renderOrder && fallback.renderOrder < child.renderOrder) {
              fallback.renderOrder = child.renderOrder;
            }
            return fallback;
          }

          const inferredState = inferPortalMaterialState(material, defaultAccent, defaultState);
          const hasPortalSignature = materialUsesPortalSurfaceShader(material);
          if (!inferredState && !material?.userData?.portalSurface && !hasPortalSignature) {
            return null;
          }

          accentColor = inferredState?.accentColor ?? accentColor;
          isActive = inferredState?.isActive ?? isActive;

          const created = createPortalFallbackMaterial(accentColor, isActive);
          created.renderOrder = child.renderOrder ?? 2;
          if (created.renderOrder < (child.renderOrder ?? 2)) {
            created.renderOrder = child.renderOrder ?? 2;
          }

          if (created?.userData) {
            created.userData.portalSurface = {
              accentColor,
              isActive,
            };
          }

          fallback = created;
          handledMaterials.set(material, { fallback, accentColor, isActive });
          return fallback;
        };

        const replaceMaterialProperty = (property, useFallback = true) => {
          if (!property || !(property in child)) {
            return false;
          }

          const current = child[property];
          let updated = false;

          const resolveReplacement = () => {
            if (!useFallback) {
              return null;
            }
            return ensureFallbackMaterial();
          };

          if (Array.isArray(current)) {
            const next = current.map((entry) => {
              if (entry === material) {
                updated = true;
                const replacement = resolveReplacement();
                if (useFallback && !replacement) {
                  updated = false;
                  return entry;
                }
                return replacement;
              }
              return entry;
            });
            if (updated) {
              child[property] = next;
            }
            return updated;
          }

          if (current === material) {
            const replacement = resolveReplacement();
            if (useFallback && !replacement) {
              return false;
            }
            child[property] = replacement;
            return true;
          }

          return false;
        };

        const replacedPrimary = replaceMaterialProperty('material', true);
        const replacedDepth = replaceMaterialProperty('customDepthMaterial', false);
        const replacedDistance = replaceMaterialProperty('customDistanceMaterial', false);

        if (!replacedPrimary && !replacedDepth && !replacedDistance) {
          return false;
        }

        if (!disposedMaterials.has(material)) {
          const boundLight = getRendererBoundLight(material);
          if (renderer?.properties?.remove) {
            try {
              renderer.properties.remove(material);
            } catch (removeError) {
              // Ignore cleanup errors; renderer will rebuild its caches if needed.
            }
          }
          try {
            material.dispose?.();
          } catch (disposeError) {
            // Ignore dispose failures and continue with the fallback material.
          }
          if (boundLight) {
            const replacement = fallback ?? null;
            if (replacement) {
              restoreRendererBoundLight(replacement, boundLight);
            }
          }
          disposedMaterials.add(material);
        }

        needsReset = true;
        return true;
      };

      for (let y = 0; y < layers.length; y += 1) {
        const row = layers[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < row.length; x += 1) {
          const renderInfo = row[x];
          const portalSurface = renderInfo?.animations?.portalSurface;
          const group = renderInfo?.group;
          if (!group) {
            if (portalSurface && renderInfo?.animations) {
              delete renderInfo.animations.portalSurface;
              disabled = true;
              needsReset = true;
            }
            continue;
          }

          const accentColor = portalSurface?.accentColor ?? '#7b6bff';
          const isActive = portalSurface?.isActive ?? false;
          let updated = false;

          if (Array.isArray(portalSurface?.materials)) {
            portalSurface.materials.forEach((material) => {
              if (!material) return;
              const host = group.children?.find((child) => child?.material === material);
              if (host && replaceChildMaterial(host, material, accentColor, isActive)) {
                updated = true;
              }
            });
          }

          if (group?.children?.length) {
            group.children.forEach((child) => {
              if (!child) return;
              const { material } = child;
              if (Array.isArray(material)) {
                material.forEach((mat) => {
                  if (mat?.userData?.portalSurface) {
                    if (replaceChildMaterial(child, mat, accentColor, isActive)) {
                      updated = true;
                    }
                  }
                });
              } else if (material?.userData?.portalSurface) {
                if (replaceChildMaterial(child, material, accentColor, isActive)) {
                  updated = true;
                }
              }
            });
          }

          if (portalSurface || updated) {
            if (renderInfo?.animations && 'portalSurface' in renderInfo.animations) {
              delete renderInfo.animations.portalSurface;
            }
            disabled = true;
            if (portalSurface && !updated) {
              needsReset = true;
            }
          }
        }
      }

      if (scene && typeof scene.traverse === 'function') {
        scene.traverse((object) => {
          if (!object) return;

          const collectedMaterials = [];
          const collectMaterial = (candidate) => {
            if (!candidate) {
              return;
            }
            if (Array.isArray(candidate)) {
              candidate.forEach((entry) => collectMaterial(entry));
              return;
            }
            collectedMaterials.push(candidate);
          };

          collectMaterial(object.material);
          collectMaterial(object.customDepthMaterial);
          collectMaterial(object.customDistanceMaterial);

          const applyFallback = (mat) => {
            if (replaceChildMaterial(object, mat, '#7b6bff', false)) {
              disabled = true;
              return true;
            }
            return false;
          };

          collectedMaterials.forEach((mat) => {
            applyFallback(mat);
          });
        });
      }

      if (scene && typeof scene.traverse === 'function') {
        const fallbackCache = new Map();
        scene.traverse((object) => {
          if (!object) {
            return;
          }

          const collectedMaterials = [];
          const collectMaterial = (candidate) => {
            if (!candidate) {
              return;
            }
            if (Array.isArray(candidate)) {
              candidate.forEach((entry) => collectMaterial(entry));
              return;
            }
            collectedMaterials.push(candidate);
          };

          collectMaterial(object.material);
          collectMaterial(object.customDepthMaterial);
          collectMaterial(object.customDistanceMaterial);

          if (!collectedMaterials.length) {
            return;
          }

          const applyFallback = (host, material, index = null) => {
            if (!material || disposedMaterials.has(material)) {
              return false;
            }

            if (!materialUsesPortalSurfaceShader(material)) {
              return false;
            }

            const inferredState = inferPortalMaterialState(material);
            const accentColor = inferredState?.accentColor ?? '#7b6bff';
            const isActive = inferredState?.isActive ?? false;
            const cacheKey = `${accentColor}|${isActive ? '1' : '0'}`;
            let template = fallbackCache.get(cacheKey) ?? null;
            if (!template) {
              template = createPortalFallbackMaterial(accentColor, isActive);
              if (template?.userData) {
                template.userData.portalSurface = {
                  accentColor,
                  isActive,
                };
              }
              fallbackCache.set(cacheKey, template);
            }

            const fallbackMaterial = template.clone();
            fallbackMaterial.renderOrder = Math.max(
              fallbackMaterial.renderOrder ?? 2,
              material.renderOrder ?? 2
            );

            const boundLight = getRendererBoundLight(material);
            if (Array.isArray(host.material) && index !== null) {
              host.material[index] = fallbackMaterial;
            } else {
              host.material = fallbackMaterial;
            }
            if (renderer?.properties?.remove) {
              try {
                renderer.properties.remove(material);
              } catch (removeError) {
                // Ignore cleanup errors for renderer caches.
              }
            }
            try {
              material.dispose?.();
            } catch (disposeError) {
              // Continue even if disposing fails.
            }
            if (boundLight) {
              restoreRendererBoundLight(fallbackMaterial, boundLight);
            }
            disposedMaterials.add(material);
            disabled = true;
            needsReset = true;
            return true;
          };

          collectedMaterials.forEach((mat, idx) => {
            applyFallback(object, mat, idx);
          });
        });
      }

      if (needsReset || (supportWasEnabled && !disabled)) {
        resetWorldMeshes();
        disabled = true;
        needsReset = false;
      }

      if (renderer?.renderLists?.dispose) {
        try {
          renderer.renderLists.dispose();
        } catch (disposeError) {
          console.warn('Failed to dispose renderer lists after disabling portal shaders.', disposeError);
        }
      }

      if (disabled) {
        console.warn(
          'Portal shaders disabled after renderer failure; continuing with emissive fallback materials.',
          error
        );
      }
      return disabled;
    }

    function updateWorldMeshes() {
      ensureTileGroups();
      if (!Array.isArray(state.world)) {
        return;
      }

      if (fullWorldRefreshPending) {
        fullWorldRefreshPending = false;
        for (let y = 0; y < state.height; y += 1) {
          for (let x = 0; x < state.width; x += 1) {
            tileUpdateQueue.add(`${x}|${y}`);
          }
        }
      }

      const processedKeys = new Set();

      if (tileUpdateQueue.size > 0) {
        const pendingKeys = Array.from(tileUpdateQueue);
        tileUpdateQueue.clear();
        for (const key of pendingKeys) {
          const [sx, sy] = key.split('|');
          const x = Number.parseInt(sx, 10);
          const y = Number.parseInt(sy, 10);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            continue;
          }
          if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
            continue;
          }
          const tile = state.world?.[y]?.[x] ?? null;
          const renderInfo = tileRenderState?.[y]?.[x];
          if (!renderInfo) {
            continue;
          }
          const signature = getTileSignature(tile);
          if (renderInfo.signature !== signature) {
            rebuildTileGroup(renderInfo, tile);
            renderInfo.signature = signature;
          }
          if (!tile) {
            renderInfo.group.visible = false;
            renderInfo.animations = {};
            syncAnimatedTileTracking(renderInfo);
            continue;
          }
          processedKeys.add(`${x}|${y}`);
          updateTileVisual(tile, renderInfo);
          syncAnimatedTileTracking(renderInfo);
        }
      }

      if (animatedTileRenderInfos.size > 0) {
        animatedTileRenderInfos.forEach((renderInfo) => {
          if (!renderInfo) {
            return;
          }
          const { x, y } = renderInfo;
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            animatedTileRenderInfos.delete(renderInfo);
            return;
          }
          const key = `${x}|${y}`;
          if (processedKeys.has(key)) {
            return;
          }
          const tile = state.world?.[y]?.[x] ?? null;
          if (!tile || tile.type === 'void') {
            renderInfo.group.visible = false;
            renderInfo.animations = {};
            syncAnimatedTileTracking(renderInfo);
            return;
          }
          updateTileVisual(tile, renderInfo);
        });
      }
    }

    function resetPlayerAnimationState() {
      if (playerMixer) {
        try {
          playerMixer.stopAllAction();
          if (playerMesh) {
            playerMixer.uncacheRoot(playerMesh);
          }
        } catch (error) {
          console.warn('Unable to reset player animation state.', error);
        }
      }
      playerMixer = null;
      for (const key of Object.keys(playerAnimationActions)) {
        delete playerAnimationActions[key];
      }
      playerAnimationBlend.idle = 1;
      playerAnimationBlend.walk = 0;
    }

    function beginNewPlayerSession() {
      playerSessionToken += 1;
      activePlayerSessionId = playerSessionToken;
      playerMeshSessionId = 0;
      playerModelLoading = false;
      return activePlayerSessionId;
    }

    function srgbColor(hex) {
      const color = new THREE.Color(hex);
      if (typeof color.convertSRGBToLinear === 'function') {
        color.convertSRGBToLinear();
      }
      return color;
    }

    function createPlaceholderHumanoid({
      bodyColor = '#4e8cff',
      headColor = '#f2d7b4',
      bodyWidth = 0.6,
      bodyDepth = 0.4,
      bodyHeight = 1.2,
      headSize = 0.42,
      accentColor = null,
      name = 'placeholder-character',
    } = {}) {
      const group = new THREE.Group();
      group.name = name;
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(bodyColor),
        metalness: 0.12,
        roughness: 0.62,
      });
      if (accentColor) {
        bodyMaterial.emissive = new THREE.Color(accentColor).multiplyScalar(0.12);
        bodyMaterial.emissiveIntensity = 0.25;
      }
      const body = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth), bodyMaterial);
      body.position.y = bodyHeight / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      if (headColor) {
        const headMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(headColor),
          metalness: 0.08,
          roughness: 0.6,
        });
        if (accentColor) {
          headMaterial.emissive = new THREE.Color(accentColor).multiplyScalar(0.25);
          headMaterial.emissiveIntensity = 0.5;
        }
        const head = new THREE.Mesh(new THREE.BoxGeometry(headSize, headSize, headSize), headMaterial);
        head.position.y = bodyHeight + headSize / 2;
        head.castShadow = true;
        head.receiveShadow = true;
        group.add(head);
      }
      return group;
    }

    function createFallbackSteveModel() {
      const group = new THREE.Group();
      group.name = 'player-fallback-steve';

      const palette = {
        shirt: '#3c9ee6',
        jeans: '#2d6ecf',
        boot: '#7b4a2e',
        skin: '#f0c29f',
        hair: '#3f2a1b',
        eye: '#7cd8ff',
        nose: '#d9a06b',
      };

      const shirtColor = srgbColor(palette.shirt);
      const jeansColor = srgbColor(palette.jeans);
      const bootColor = srgbColor(palette.boot);
      const skinColor = srgbColor(palette.skin);
      const hairColor = srgbColor(palette.hair);
      const eyeColor = srgbColor(palette.eye);
      const noseColor = srgbColor(palette.nose);

      const shirtMaterial = new THREE.MeshStandardMaterial({
        color: shirtColor.clone(),
        roughness: 0.58,
        metalness: 0.08,
        emissive: shirtColor.clone().multiplyScalar(0.18),
        emissiveIntensity: 0.55,
      });
      const jeansMaterial = new THREE.MeshStandardMaterial({
        color: jeansColor.clone(),
        roughness: 0.62,
        metalness: 0.04,
        emissive: jeansColor.clone().multiplyScalar(0.12),
        emissiveIntensity: 0.5,
      });
      const bootMaterial = new THREE.MeshStandardMaterial({
        color: bootColor.clone(),
        roughness: 0.65,
        metalness: 0.1,
        emissive: bootColor.clone().multiplyScalar(0.2),
        emissiveIntensity: 0.6,
      });
      const skinMaterial = new THREE.MeshStandardMaterial({
        color: skinColor.clone(),
        roughness: 0.54,
        metalness: 0.04,
        emissive: skinColor.clone().multiplyScalar(0.1),
        emissiveIntensity: 0.4,
      });
      const hairMaterial = new THREE.MeshStandardMaterial({
        color: hairColor.clone(),
        roughness: 0.55,
        metalness: 0.18,
        emissive: hairColor.clone().multiplyScalar(0.22),
        emissiveIntensity: 0.65,
      });
      const eyeMaterial = new THREE.MeshStandardMaterial({
        color: eyeColor.clone(),
        roughness: 0.35,
        metalness: 0.08,
        emissive: eyeColor.clone(),
        emissiveIntensity: 1.4,
      });
      const noseMaterial = new THREE.MeshStandardMaterial({
        color: noseColor.clone(),
        roughness: 0.6,
        metalness: 0.08,
      });

      const legLength = 0.82;
      const bodyHeight = 0.92;
      const headSize = 0.6;
      const armLength = 0.84;
      const bodyWidth = 0.78;

      const body = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, bodyHeight, 0.42), shirtMaterial);
      body.position.y = legLength + bodyHeight / 2;
      group.add(body);

      const headPivot = new THREE.Group();
      headPivot.name = 'HeadPivot';
      headPivot.position.set(0, legLength + bodyHeight, 0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(headSize, headSize, headSize), skinMaterial.clone());
      head.name = 'Head';
      head.position.y = headSize / 2;
      headPivot.add(head);

      const hairPivot = new THREE.Group();
      hairPivot.name = 'Hair';
      hairPivot.position.set(0, headSize * 0.22, 0);
      const hair = new THREE.Mesh(new THREE.BoxGeometry(headSize * 1.04, headSize * 0.52, headSize * 1.04), hairMaterial.clone());
      hair.position.y = headSize * 0.26;
      hairPivot.add(hair);
      headPivot.add(hairPivot);

      const fringePivot = new THREE.Group();
      fringePivot.name = 'Fringe';
      fringePivot.position.set(0, headSize * 0.35, headSize * 0.48);
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(headSize * 0.98, headSize * 0.42, 0.14), hairMaterial.clone());
      fringe.position.y = headSize * 0.16;
      fringePivot.add(fringe);
      headPivot.add(fringePivot);

      const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.02), eyeMaterial.clone());
      leftEye.position.set(-0.12, headSize * 0.36, headSize / 2 + 0.01);
      headPivot.add(leftEye);
      const rightEye = leftEye.clone();
      rightEye.position.x = 0.12;
      headPivot.add(rightEye);

      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.1), noseMaterial);
      nose.position.set(0, headSize * 0.22, headSize / 2 + 0.05);
      headPivot.add(nose);

      group.add(headPivot);

      const leftArmPivot = new THREE.Group();
      leftArmPivot.name = 'LeftArm';
      leftArmPivot.position.set(-(bodyWidth / 2 + 0.2), legLength + bodyHeight - 0.08, 0);
      const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.28, armLength, 0.28), skinMaterial.clone());
      leftArm.position.y = -armLength / 2;
      leftArmPivot.add(leftArm);
      group.add(leftArmPivot);

      const rightArmPivot = new THREE.Group();
      rightArmPivot.name = 'RightArm';
      rightArmPivot.position.set(bodyWidth / 2 + 0.2, legLength + bodyHeight - 0.08, 0);
      const rightArm = leftArm.clone();
      rightArmPivot.add(rightArm);
      group.add(rightArmPivot);

      const legGeometry = new THREE.BoxGeometry(0.3, legLength, 0.3);
      const leftLegPivot = new THREE.Group();
      leftLegPivot.name = 'LeftLeg';
      leftLegPivot.position.set(-0.18, legLength, 0);
      const leftLeg = new THREE.Mesh(legGeometry, jeansMaterial.clone());
      leftLeg.position.y = -legLength / 2;
      leftLegPivot.add(leftLeg);
      const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.34), bootMaterial.clone());
      leftBoot.position.y = -legLength + 0.1;
      leftLegPivot.add(leftBoot);
      group.add(leftLegPivot);

      const rightLegPivot = new THREE.Group();
      rightLegPivot.name = 'RightLeg';
      rightLegPivot.position.set(0.18, legLength, 0);
      const rightLeg = leftLeg.clone();
      rightLegPivot.add(rightLeg);
      const rightBoot = leftBoot.clone();
      rightLegPivot.add(rightBoot);
      group.add(rightLegPivot);

      group.traverse((child) => {
        if (!child?.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
      });

      group.updateMatrixWorld(true);

      const parts = {
        leftArm: leftArmPivot,
        rightArm: rightArmPivot,
        leftLeg: leftLegPivot,
        rightLeg: rightLegPivot,
        head: headPivot,
        hair: hairPivot,
        fringe: fringePivot,
        hairBasePosition: hairPivot.position.clone(),
        fringeBasePosition: fringePivot.position.clone(),
      };

      return { group, parts };
    }

    function disposeMeshTree(root) {
      if (!root) return;
      const disposeMaterial = (material) => {
        if (Array.isArray(material)) {
          material.forEach((mat) => mat?.dispose?.());
        } else {
          material?.dispose?.();
        }
      };
      root.traverse?.((child) => {
        if (child.isMesh) {
          child.geometry?.dispose?.();
          disposeMaterial(child.material);
        }
      });
    }

    function useFallbackPlayerMesh(sessionId = activePlayerSessionId) {
      if (!entityGroup) return;
      const fallback = createFallbackSteveModel();
      if (sessionId !== activePlayerSessionId) {
        disposeMeshTree(fallback.group);
        return;
      }
      const placeholder = fallback.group;
      placeholder.position.y = 0.05;
      placeholder.scale.setScalar(1.18);
      entityGroup.add(placeholder);
      playerMesh = placeholder;
      playerMeshParts = fallback.parts;
      playerMeshSessionId = sessionId;
      attachPlayerKeyLight(playerMesh);
      resetPlayerAnimationState();
      ensurePlayerMeshVisibility();
      restartPlayerAnimationActions({ allowInitialization: false });
      playerModelLoading = false;
      announceVisualFallback(
        'player-model',
        'Your device blocked the detailed explorer model, so a simplified avatar is active. Enable WebGL or switch browsers for full visuals.'
      );
      if (state?.ui) {
        state.ui.fallbackNoticeShown = true;
      }
    }

    function parseEmbeddedModel(key, onLoad, onError) {
      if (!EMBEDDED_ASSETS?.models?.[key]) {
        onError?.(new Error(`Embedded model "${key}" is unavailable.`));
        return;
      }
      const modelString = EMBEDDED_ASSETS.models[key];
      getGltfLoaderInstance()
        .then((loader) => {
          try {
            loader.parse(
              modelString,
              '',
              onLoad,
              (parseError) => {
                onError?.(parseError);
              },
            );
          } catch (error) {
            onError?.(error);
          }
        })
        .catch((error) => {
          onError?.(error);
        });
    }

    function attachPlayerKeyLight(target) {
      if (!target) return;
      if (playerKeyLight && playerKeyLight.parent) {
        playerKeyLight.parent.remove(playerKeyLight);
      }
      if (!playerKeyLight) {
        playerKeyLight = new THREE.PointLight(0xf8e7c9, 0.85, 9, 1.8);
        playerKeyLight.name = 'player-key-light';
        playerKeyLight.castShadow = false;
      } else {
        playerKeyLight.color.set(0xf8e7c9);
        playerKeyLight.intensity = 0.85;
        playerKeyLight.distance = 9;
        playerKeyLight.decay = 1.8;
      }
      playerKeyLight.position.set(0.2, 1.25, 0.6);
      target.add(playerKeyLight);
    }

    function ensurePlayerMeshVisibility() {
      if (!playerMesh) return;
      playerMesh.visible = true;
      playerMesh.traverse((child) => {
        if (!child) return;
        if (child.visible === false) {
          child.visible = true;
        }
      });
      if (playerMeshParts) {
        const parts = [
          playerMeshParts.leftArm,
          playerMeshParts.rightArm,
          playerMeshParts.leftLeg,
          playerMeshParts.rightLeg,
          playerMeshParts.head,
          playerMeshParts.hair,
          playerMeshParts.fringe,
        ];
        parts.forEach((part) => {
          if (part && part.visible === false) {
            part.visible = true;
          }
        });
      }
    }

    function restartPlayerAnimationActions({ allowInitialization = true } = {}) {
      if (!playerMesh) return;
      if (allowInitialization) {
        if (!playerMixer || !playerAnimationActions.idle || !playerAnimationActions.walk) {
          initializePlayerAnimations();
        }
      }
      playerAnimationBlend.idle = 1;
      playerAnimationBlend.walk = 0;
      playerActionAnimation = null;
      if (!playerMixer || !playerAnimationActions.idle || !playerAnimationActions.walk) {
        return;
      }
      const idleAction = playerAnimationActions.idle;
      if (idleAction) {
        idleAction.reset();
        idleAction.play();
        idleAction.enabled = true;
        idleAction.setEffectiveWeight(1);
      }
      const walkAction = playerAnimationActions.walk;
      if (walkAction) {
        walkAction.reset();
        walkAction.play();
        walkAction.enabled = true;
        walkAction.setEffectiveWeight(0);
      }
      const mineAction = playerAnimationActions.mine;
      if (mineAction) {
        mineAction.stop();
        mineAction.reset();
        mineAction.enabled = false;
        mineAction.setEffectiveWeight(0);
      }
    }

    function ensurePlayerAvatarReady({ forceReload = false, resetAnimations = false } = {}) {
      if (!entityGroup) return;
      const needsReload =
        forceReload ||
        !playerMesh ||
        !playerMesh.parent ||
        playerMeshSessionId !== activePlayerSessionId;
      if (needsReload) {
        const sessionId = beginNewPlayerSession();
        createPlayerMesh(sessionId);
        return;
      }
      ensurePlayerMeshVisibility();
      if (!playerMixer || !playerAnimationActions.idle || !playerAnimationActions.walk) {
        restartPlayerAnimationActions({ allowInitialization: true });
        return;
      }
      if (resetAnimations) {
        restartPlayerAnimationActions({ allowInitialization: true });
      }
    }

    function handlePlayerGltfLoad(gltf, sessionId) {
      const steveScene = gltf.scene || gltf.scenes?.[0];
      if (!steveScene) {
        console.error('Steve model did not include a scene.');
        return;
      }

      if (sessionId !== activePlayerSessionId) {
        disposeMeshTree(steveScene);
        return;
      }

      playerMesh = steveScene;
      playerMesh.name = 'player-steve';
      playerMesh.position.set(0, 0.05, 0);
      playerMesh.rotation.set(0, 0, 0);
      playerMesh.scale.setScalar(1.18);
      playerMesh.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (!child.material) return;
        child.material = child.material.clone();
        child.material.flatShading = true;
        if (child.material.map) {
          child.material.map.minFilter = THREE.NearestFilter;
          child.material.map.magFilter = THREE.NearestFilter;
          child.material.map.anisotropy = Math.max(child.material.map.anisotropy ?? 1, 4);
          child.material.map.needsUpdate = true;
        }
        const materialName = child.material.name ?? child.name ?? '';
        const palette = {
          Shirt: '#3c9ee6',
          Skin: '#f0c29f',
          Jeans: '#2d6ecf',
          Boot: '#7b4a2e',
          Hair: '#3f2a1b',
          Eye: '#7cd8ff',
        };
        const targetHex = palette[materialName] ?? null;
        if (targetHex && child.material.color?.isColor) {
          child.material.color.copy(srgbColor(targetHex));
        } else if (child.material.color?.isColor) {
          child.material.color.convertSRGBToLinear?.();
        }
        if (typeof child.material.roughness === 'number') {
          child.material.roughness = THREE.MathUtils.clamp(child.material.roughness * 0.75, 0.35, 0.82);
        }
        if (typeof child.material.metalness === 'number') {
          child.material.metalness = THREE.MathUtils.clamp(child.material.metalness * 0.25, 0, 0.1);
        }
        if (materialName === 'Eye') {
          const glow = srgbColor(palette.Eye);
          if (child.material.color?.isColor) {
            child.material.color.copy(glow);
          }
          child.material.emissive = glow.clone();
          child.material.emissiveIntensity = Math.max(child.material.emissiveIntensity ?? 0.6, 1.6);
        } else if (targetHex) {
          const glow = srgbColor(targetHex).multiplyScalar(0.22);
          if (child.material.emissive?.isColor) {
            child.material.emissive.lerp(glow, 0.7);
          } else {
            child.material.emissive = glow;
          }
          child.material.emissiveIntensity = Math.max(child.material.emissiveIntensity ?? 0.3, 0.85);
        }
        child.material.needsUpdate = true;
      });

      entityGroup.add(playerMesh);
      playerMeshSessionId = sessionId;
      attachPlayerKeyLight(playerMesh);

      if (typeof console !== 'undefined') {
        console.log('Steve visible in scene');
      }

      const hairNode = playerMesh.getObjectByName('Hair') ?? null;
      const fringeNode = playerMesh.getObjectByName('Fringe') ?? null;

      playerMeshParts = {
        leftArm: playerMesh.getObjectByName('LeftArm') ?? null,
        rightArm: playerMesh.getObjectByName('RightArm') ?? null,
        leftLeg: playerMesh.getObjectByName('LeftLeg') ?? null,
        rightLeg: playerMesh.getObjectByName('RightLeg') ?? null,
        head: playerMesh.getObjectByName('HeadPivot') ?? null,
        hair: hairNode,
        fringe: fringeNode,
        hairBasePosition: hairNode ? hairNode.position.clone() : null,
        fringeBasePosition: fringeNode ? fringeNode.position.clone() : null,
      };

      if (playerMeshParts.leftArm && playerMeshParts.rightArm && playerMeshParts.leftLeg && playerMeshParts.rightLeg) {
        initializePlayerAnimations();
      }
      restartPlayerAnimationActions();
      ensurePlayerMeshVisibility();
      playerModelLoading = false;
    }

    function createPlayerMesh(sessionId = activePlayerSessionId) {
      if (!entityGroup) return;
      if (!sessionId) {
        sessionId = beginNewPlayerSession();
      }
      if (sessionId !== activePlayerSessionId) {
        return;
      }
      if (playerModelLoading && sessionId === activePlayerSessionId) return;
      if (playerMesh) {
        entityGroup.remove(playerMesh);
      }
      if (playerKeyLight && playerKeyLight.parent) {
        playerKeyLight.parent.remove(playerKeyLight);
      }
      playerKeyLight = null;
      playerMesh = null;
      playerMeshParts = null;
      playerMeshSessionId = 0;
      resetPlayerAnimationState();

      if (!SUPPORTS_MODEL_ASSETS) {
        useFallbackPlayerMesh(sessionId);
        return;
      }

      const loadSessionId = sessionId;
      playerModelLoading = true;
      getGltfLoaderInstance()
        .then((loader) => {
          loader.load(
            MODEL_ASSET_URLS.steve,
            (gltf) => {
              handlePlayerGltfLoad(gltf, loadSessionId);
            },
            undefined,
            (error) => {
              console.error('Failed to load Steve model.', error);
              parseEmbeddedModel(
                'steve',
                (embeddedGltf) => {
                  handlePlayerGltfLoad(embeddedGltf, loadSessionId);
                },
                () => {
                  useFallbackPlayerMesh(loadSessionId);
                }
              );
            }
          );
        })
        .catch((error) => {
          console.error('GLTFLoader is unavailable; cannot create the Steve model.', error);
          parseEmbeddedModel(
            'steve',
            (embeddedGltf) => {
              handlePlayerGltfLoad(embeddedGltf, loadSessionId);
            },
            () => {
              useFallbackPlayerMesh(loadSessionId);
            }
          );
        });
    }

    function initializePlayerAnimations() {
      if (!playerMesh) return;
      resetPlayerAnimationState();
      playerMixer = new THREE.AnimationMixer(playerMesh);

      const idleClip = new THREE.AnimationClip('steve-idle', -1, [
        new THREE.NumberKeyframeTrack('Torso.rotation[z]', [0, 1.5, 3], [0.02, -0.02, 0.02]),
        new THREE.NumberKeyframeTrack('HeadPivot.rotation[y]', [0, 1.5, 3], [0.05, -0.05, 0.05]),
        new THREE.NumberKeyframeTrack('HeadPivot.rotation[x]', [0, 1.5, 3], [0.015, -0.02, 0.015]),
      ]);

      const walkClip = new THREE.AnimationClip('steve-walk', 0.8, [
        new THREE.NumberKeyframeTrack('LeftArm.rotation[x]', [0, 0.4, 0.8], [0.65, -0.65, 0.65]),
        new THREE.NumberKeyframeTrack('RightArm.rotation[x]', [0, 0.4, 0.8], [-0.65, 0.65, -0.65]),
        new THREE.NumberKeyframeTrack('LeftLeg.rotation[x]', [0, 0.4, 0.8], [-0.6, 0.6, -0.6]),
        new THREE.NumberKeyframeTrack('RightLeg.rotation[x]', [0, 0.4, 0.8], [0.6, -0.6, 0.6]),
        new THREE.NumberKeyframeTrack('Torso.rotation[x]', [0, 0.4, 0.8], [0.04, -0.04, 0.04]),
      ]);

      const mineClip = new THREE.AnimationClip('steve-mine', 0.8, [
        new THREE.NumberKeyframeTrack('RightArm.rotation[x]', [0, 0.2, 0.45, 0.8], [0, -1.4, 0.3, 0]),
        new THREE.NumberKeyframeTrack('RightArm.rotation[y]', [0, 0.2, 0.45, 0.8], [0, 0.25, -0.05, 0]),
        new THREE.NumberKeyframeTrack('LeftArm.rotation[x]', [0, 0.2, 0.45, 0.8], [0.2, 0.4, -0.1, 0.2]),
        new THREE.NumberKeyframeTrack('Torso.rotation[x]', [0, 0.2, 0.45, 0.8], [0, -0.25, 0.08, 0]),
      ]);

      playerAnimationActions.idle = playerMixer.clipAction(idleClip);
      playerAnimationActions.walk = playerMixer.clipAction(walkClip);
      playerAnimationActions.mine = playerMixer.clipAction(mineClip);

      playerAnimationActions.idle.play();
      playerAnimationActions.idle.enabled = true;
      playerAnimationActions.idle.setEffectiveWeight(1);

      playerAnimationActions.walk.play();
      playerAnimationActions.walk.enabled = true;
      playerAnimationActions.walk.setEffectiveWeight(0);

      const mineAction = playerAnimationActions.mine;
      mineAction.setLoop(THREE.LoopOnce, 1);
      mineAction.clampWhenFinished = true;
      mineAction.enabled = false;
      mineAction.setEffectiveWeight(0);

      playerMixer.addEventListener('finished', (event) => {
        if (event.action === mineAction) {
          playerActionAnimation = null;
          mineAction.enabled = false;
          mineAction.setEffectiveWeight(0);
        }
      });
    }

    function startPlayerMineAnimation(action) {
      if (!action || !playerAnimationActions.mine || !playerMixer) return;
      const mineAction = playerAnimationActions.mine;
      const clipDuration = mineAction.getClip()?.duration || 0.8;
      const durationFactor = THREE.MathUtils.clamp((action.duration ?? 520) / 520, 0.6, 1.6);
      const targetDuration = clipDuration * durationFactor;
      const strength = THREE.MathUtils.clamp(action.strength ?? 1, 0.2, 1.5);

      mineAction.reset();
      mineAction.enabled = true;
      mineAction.setEffectiveWeight(Math.min(1, strength));
      mineAction.timeScale = clipDuration / targetDuration;
      mineAction.play();
    }

    function createPlayerLocator() {
      if (!entityGroup) return;
      if (playerLocator) {
        entityGroup.remove(playerLocator);
        if (typeof playerLocator.traverse === 'function') {
          playerLocator.traverse((child) => {
            if (child.isMesh) {
              child.geometry?.dispose?.();
              child.material?.dispose?.();
            }
          });
        } else {
          playerLocator.geometry?.dispose?.();
          playerLocator.material?.dispose?.();
        }
      }
      const ringGeometry = new THREE.RingGeometry(0.55, 0.86, 48);
      const baseLocatorColor = srgbColor(BASE_THEME.accent);
      const highlightLocatorColor = srgbColor(BASE_THEME.accentStrong || '#f7b733');
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: baseLocatorColor.clone(),
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      ringMaterial.userData = { baseOpacity: 0.6 };
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;

      const beaconGeometry = new THREE.CylinderGeometry(0.17, 0.17, 1.6, 24, 1, true);
      const beaconMaterial = new THREE.MeshBasicMaterial({
        color: baseLocatorColor.clone(),
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      beaconMaterial.userData = { baseOpacity: 0.32 };
      const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
      beacon.position.y = 0.8;

      const tipGeometry = new THREE.ConeGeometry(0.22, 0.4, 24);
      const tipMaterial = new THREE.MeshBasicMaterial({
        color: baseLocatorColor.clone().lerp(highlightLocatorColor, 0.45),
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      tipMaterial.userData = { baseOpacity: 0.4 };
      const tip = new THREE.Mesh(tipGeometry, tipMaterial);
      tip.position.y = 1.4;

      const locatorGroup = new THREE.Group();
      locatorGroup.name = 'player-locator';
      locatorGroup.renderOrder = 2;
      locatorGroup.add(ring, beacon, tip);
      entityGroup.add(locatorGroup);

      playerLocator = locatorGroup;
      playerLocator.material = ringMaterial;
      playerLocator.userData = {
        ...(playerLocator.userData || {}),
        pulseMaterials: [ringMaterial, beaconMaterial, tipMaterial],
        baseColor: baseLocatorColor.clone(),
        highlightColor: highlightLocatorColor.clone(),
        lastMovementMix: 0,
      };
    }

    function createFallbackZombieTemplate() {
      const group = createPlaceholderHumanoid({
        bodyColor: '#3d7c42',
        headColor: '#83c27a',
        accentColor: '#a8ffa2',
        bodyWidth: 0.56,
        bodyDepth: 0.44,
        bodyHeight: 1.18,
        headSize: 0.4,
        name: 'zombie-fallback-template',
      });
      group.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.roughness = 0.78;
          child.material.metalness = 0.08;
          if (child.material.emissive?.isColor) {
            child.material.emissive.lerp(srgbColor('#9affb9'), 0.6);
          } else {
            child.material.emissive = srgbColor('#9affb9').multiplyScalar(0.6);
          }
          child.material.emissiveIntensity = Math.max(child.material.emissiveIntensity ?? 0.3, 0.75);
        }
      });
      group.updateMatrixWorld(true);
      return { scene: group, groundOffset: 0, defaultScale: 1 };
    }

    function ensureZombieModelTemplate() {
      if (zombieModelTemplate || zombieModelPromise) return zombieModelPromise;
      if (!SUPPORTS_MODEL_ASSETS) {
        zombieModelTemplate = createFallbackZombieTemplate();
        zombieModelPromise = Promise.resolve(zombieModelTemplate);
        return zombieModelPromise;
      }
      zombieModelPromise = getGltfLoaderInstance()
        .then((loader) =>
          new Promise((resolve) => {
            const resolveWithTemplate = (template) => {
              zombieModelTemplate = template;
              resolve(template);
            };
            loader.load(
              MODEL_ASSET_URLS.zombie,
              (gltf) => {
                const zombieScene = gltf.scene || gltf.scenes?.[0];
                if (!zombieScene) {
                  console.error('Zombie model did not include a scene.');
                  resolveWithTemplate(createFallbackZombieTemplate());
                  return;
                }
                zombieScene.position.set(0, 0, 0);
                zombieScene.rotation.set(0, 0, 0);
                zombieScene.scale.set(1, 1, 1);
                zombieScene.updateMatrixWorld(true);
                const bounds = new THREE.Box3().setFromObject(zombieScene);
                resolveWithTemplate({
                  scene: zombieScene,
                  groundOffset: -bounds.min.y,
                  defaultScale: 0.6,
                });
              },
              undefined,
              (error) => {
                console.error('Failed to load the zombie model.', error);
                parseEmbeddedModel(
                  'zombie',
                  (embeddedGltf) => {
                    const zombieScene = embeddedGltf.scene || embeddedGltf.scenes?.[0];
                    if (!zombieScene) {
                      resolveWithTemplate(createFallbackZombieTemplate());
                      return;
                    }
                    zombieScene.position.set(0, 0, 0);
                    zombieScene.rotation.set(0, 0, 0);
                    zombieScene.scale.set(1, 1, 1);
                    zombieScene.updateMatrixWorld(true);
                    const bounds = new THREE.Box3().setFromObject(zombieScene);
                    resolveWithTemplate({
                      scene: zombieScene,
                      groundOffset: -bounds.min.y,
                      defaultScale: 0.6,
                    });
                  },
                  () => {
                    resolveWithTemplate(createFallbackZombieTemplate());
                  }
                );
              }
            );
          })
        )
        .catch((error) => {
          console.error('GLTFLoader is unavailable; cannot create the zombie model.', error);
          const fallback = createFallbackZombieTemplate();
          zombieModelTemplate = fallback;
          return fallback;
        });
      return zombieModelPromise;
    }

    function createZombieActor() {
      if (!entityGroup || !zombieModelTemplate?.scene) return null;
      const { scene: templateScene, groundOffset = 0, defaultScale = 0.6 } = zombieModelTemplate;
      const clone = templateScene.clone(true);
      clone.name = 'minecraft-zombie';
      clone.traverse((child) => {
        if (!child?.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = child.material.clone();
          if (child.material.color?.isColor) {
            child.material.color.convertSRGBToLinear?.();
          }
          if (child.name?.toLowerCase?.().includes('eye')) {
            const glow = srgbColor('#9fffc7');
            child.material.color?.copy(glow);
            child.material.emissive = glow.clone();
            child.material.emissiveIntensity = Math.max(child.material.emissiveIntensity ?? 0.8, 1.6);
          } else if (child.material.color?.isColor) {
            const emissiveBase = child.material.color.clone().multiplyScalar(0.28);
            if (child.material.emissive?.isColor) {
              child.material.emissive.lerp(emissiveBase, 0.8);
            } else {
              child.material.emissive = emissiveBase;
            }
            child.material.emissiveIntensity = Math.max(child.material.emissiveIntensity ?? 0.35, 0.7);
          }
        }
      });
      clone.scale.setScalar(defaultScale);
      const parts = {
        leftLeg: clone.getObjectByName('ZombieLeftLeg') ?? null,
        rightLeg: clone.getObjectByName('ZombieRightLeg') ?? null,
        leftArm: clone.getObjectByName('ZombieLeftArm') ?? null,
        rightArm: clone.getObjectByName('ZombieRightArm') ?? null,
        head: clone.getObjectByName('ZombieHead') ?? null,
        leftEye: clone.getObjectByName('ZombieLeftEye') ?? null,
        rightEye: clone.getObjectByName('ZombieRightEye') ?? null,
      };
      const bodyMaterials = [];
      const baseBodyColors = [];
      const baseEmissiveColors = [];
      const eyeMaterials = [];
      const baseEyeColors = [];
      clone.traverse((child) => {
        if (!child?.isMesh || !child.material) return;
        const material = child.material;
        const isEye = child.name?.toLowerCase?.().includes('eye');
        if (isEye) {
          eyeMaterials.push(material);
          if (material.color?.isColor) {
            baseEyeColors.push(material.color.clone());
          } else {
            baseEyeColors.push(new THREE.Color('#ffffff'));
          }
          return;
        }
        bodyMaterials.push(material);
        if (material.color?.isColor) {
          baseBodyColors.push(material.color.clone());
        } else {
          baseBodyColors.push(new THREE.Color('#ffffff'));
        }
        if (material.emissive?.isColor) {
          baseEmissiveColors.push(material.emissive.clone());
        } else {
          baseEmissiveColors.push(new THREE.Color('#000000'));
          material.emissive = new THREE.Color('#000000');
        }
      });
      const actor = {
        group: clone,
        parts,
        eyeMaterials,
        baseEyeColors,
        aggressiveEyeColor: new THREE.Color('#ff9a9a'),
        tempColor: new THREE.Color('#ffffff'),
        bodyMaterials,
        baseBodyColors,
        baseEmissiveColors,
        previousXZ: new THREE.Vector2(),
        hasPrev: false,
        lastUpdate: getNowMs(),
        walkPhase: Math.random() * Math.PI * 2,
        movement: 0,
        aggression: 0,
        groundOffset: groundOffset * defaultScale,
      };
      actor.bodyMaterials.forEach((material, index) => {
        if (!material?.color?.isColor) return;
        const baseColor = actor.baseBodyColors[index];
        if (!baseColor) return;
        const emissive = baseColor.clone().multiplyScalar(0.28);
        if (material.emissive?.isColor) {
          material.emissive.copy(emissive);
        } else {
          material.emissive = emissive.clone();
        }
        material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0.35, 0.7);
        actor.baseEmissiveColors[index] = emissive.clone();
      });
      actor.eyeMaterials.forEach((material, index) => {
        const glow = srgbColor('#9fffc7');
        if (material.color?.isColor) {
          material.color.copy(glow);
        }
        if (material.emissive?.isColor) {
          material.emissive.copy(glow);
        } else {
          material.emissive = glow.clone();
        }
        material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 1.1, 1.6);
        actor.baseEyeColors[index] = glow.clone();
      });
      entityGroup.add(clone);
      clone.visible = true;
      clone.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(clone);
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      actor.boundingCenter = sphere?.center?.clone?.() ?? new THREE.Vector3(0, actor.groundOffset, 0);
      actor.boundingRadius = sphere?.radius ?? 1.2;
      return actor;
    }

    function ensureZombieMeshCount(count) {
      ensureZombieModelTemplate();
      if (!entityGroup || !zombieModelTemplate?.scene) return;
      while (zombieMeshes.length < count) {
        const actor = createZombieActor();
        if (!actor) break;
        zombieMeshes.push(actor);
        if (typeof console !== 'undefined') {
          console.log('Zombie spawned, chasing');
        }
      }
      while (zombieMeshes.length > count) {
        const zombieData = zombieMeshes.pop();
        if (!zombieData) continue;
        entityGroup.remove(zombieData.group);
        zombieData.group?.traverse?.((child) => {
          if (child?.isMesh && child.material) {
            child.material.dispose?.();
          }
        });
      }
    }

    function createFallbackGolemTemplate() {
      const group = new THREE.Group();
      group.name = 'iron-golem-fallback-template';
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#b9b3a4'),
        metalness: 0.26,
        roughness: 0.58,
        emissive: srgbColor('#f6d7a7').multiplyScalar(0.12),
        emissiveIntensity: 0.5,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.8, 0.72), bodyMaterial);
      body.position.y = 0.9;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      const headMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#e5dfd0'),
        metalness: 0.18,
        roughness: 0.64,
        emissive: new THREE.Color('#ffa96d').multiplyScalar(0.2),
        emissiveIntensity: 0.6,
      });
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.52, 0.58), headMaterial);
      head.position.y = 1.65;
      head.castShadow = true;
      head.receiveShadow = true;
      group.add(head);
      const armMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#d2ccbd'),
        metalness: 0.22,
        roughness: 0.6,
        emissive: srgbColor('#f6d7a7').multiplyScalar(0.1),
        emissiveIntensity: 0.45,
      });
      const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.2, 0.26), armMaterial);
      leftArm.position.set(-0.72, 0.9, 0);
      const rightArm = leftArm.clone();
      rightArm.position.x = 0.72;
      [leftArm, rightArm].forEach((arm) => {
        arm.castShadow = true;
        arm.receiveShadow = true;
        group.add(arm);
      });
      group.updateMatrixWorld(true);
      return { scene: group, groundOffset: 0, defaultScale: 1 };
    }

    function ensureIronGolemModelTemplate() {
      if (ironGolemModelTemplate || ironGolemModelPromise) return ironGolemModelPromise;
      if (!SUPPORTS_MODEL_ASSETS) {
        ironGolemModelTemplate = createFallbackGolemTemplate();
        ironGolemModelPromise = Promise.resolve(ironGolemModelTemplate);
        return ironGolemModelPromise;
      }
      ironGolemModelPromise = getGltfLoaderInstance()
        .then((loader) =>
          new Promise((resolve) => {
            const resolveWithTemplate = (template) => {
              ironGolemModelTemplate = template;
              resolve(template);
            };
            loader.load(
              MODEL_ASSET_URLS.ironGolem,
              (gltf) => {
                const golemScene = gltf.scene || gltf.scenes?.[0];
                if (!golemScene) {
                  console.error('Iron golem model did not include a scene.');
                  resolveWithTemplate(createFallbackGolemTemplate());
                  return;
                }
                golemScene.position.set(0, 0, 0);
                golemScene.rotation.set(0, 0, 0);
                golemScene.scale.set(1, 1, 1);
                golemScene.updateMatrixWorld(true);
                const bounds = new THREE.Box3().setFromObject(golemScene);
                resolveWithTemplate({
                  scene: golemScene,
                  groundOffset: -bounds.min.y,
                  defaultScale: 0.55,
                });
              },
              undefined,
              (error) => {
                console.error('Failed to load the iron golem model.', error);
                parseEmbeddedModel(
                  'ironGolem',
                  (embeddedGltf) => {
                    const golemScene = embeddedGltf.scene || embeddedGltf.scenes?.[0];
                    if (!golemScene) {
                      resolveWithTemplate(createFallbackGolemTemplate());
                      return;
                    }
                    golemScene.position.set(0, 0, 0);
                    golemScene.rotation.set(0, 0, 0);
                    golemScene.scale.set(1, 1, 1);
                    golemScene.updateMatrixWorld(true);
                    const bounds = new THREE.Box3().setFromObject(golemScene);
                    resolveWithTemplate({
                      scene: golemScene,
                      groundOffset: -bounds.min.y,
                      defaultScale: 0.55,
                    });
                  },
                  () => {
                    resolveWithTemplate(createFallbackGolemTemplate());
                  }
                );
              }
            );
          })
        )
        .catch((error) => {
          console.error('GLTFLoader is unavailable; cannot create the iron golem model.', error);
          const fallback = createFallbackGolemTemplate();
          ironGolemModelTemplate = fallback;
          return fallback;
        });
      return ironGolemModelPromise;
    }

    function createIronGolemActor() {
      if (!entityGroup || !ironGolemModelTemplate?.scene) return null;
      const { scene: templateScene, groundOffset = 0, defaultScale = 0.55 } = ironGolemModelTemplate;
      const clone = templateScene.clone(true);
      clone.name = 'iron-golem';
      clone.traverse((child) => {
        if (!child?.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = child.material.clone();
          if (child.material.color?.isColor) {
            child.material.color.convertSRGBToLinear?.();
          }
          if (child.name?.toLowerCase?.().includes('eye')) {
            const glow = srgbColor('#ffe8a3');
            child.material.color?.copy(glow);
            child.material.emissive = glow.clone();
            child.material.emissiveIntensity = Math.max(child.material.emissiveIntensity ?? 0.8, 1.4);
          } else if (child.material.color?.isColor) {
            const emissiveBase = child.material.color.clone().multiplyScalar(0.18);
            if (child.material.emissive?.isColor) {
              child.material.emissive.lerp(emissiveBase, 0.7);
            } else {
              child.material.emissive = emissiveBase;
            }
            child.material.emissiveIntensity = Math.max(child.material.emissiveIntensity ?? 0.3, 0.6);
          }
        }
      });
      clone.scale.setScalar(defaultScale);
      const parts = {
        leftLeg: clone.getObjectByName('GolemLeftLeg') ?? null,
        rightLeg: clone.getObjectByName('GolemRightLeg') ?? null,
        leftArm: clone.getObjectByName('GolemLeftArm') ?? null,
        rightArm: clone.getObjectByName('GolemRightArm') ?? null,
        head: clone.getObjectByName('GolemHead') ?? null,
      };
      const bodyMaterials = [];
      const baseBodyColors = [];
      const baseEmissiveColors = [];
      const eyeMaterials = [];
      const baseEyeColors = [];
      clone.traverse((child) => {
        if (!child?.isMesh || !child.material) return;
        const material = child.material;
        const isEye = child.name?.toLowerCase?.().includes('eye');
        if (isEye) {
          eyeMaterials.push(material);
          if (material.color?.isColor) {
            baseEyeColors.push(material.color.clone());
          } else {
            baseEyeColors.push(new THREE.Color('#ffffff'));
          }
          return;
        }
        bodyMaterials.push(material);
        if (material.color?.isColor) {
          baseBodyColors.push(material.color.clone());
        } else {
          baseBodyColors.push(new THREE.Color('#ffffff'));
        }
        if (material.emissive?.isColor) {
          baseEmissiveColors.push(material.emissive.clone());
        } else {
          baseEmissiveColors.push(new THREE.Color('#000000'));
          material.emissive = new THREE.Color('#000000');
        }
      });
      const actor = {
        group: clone,
        parts,
        eyeMaterials,
        baseEyeColors,
        aggressiveEyeColor: new THREE.Color('#ffd1d1'),
        tempColor: new THREE.Color('#ffffff'),
        bodyMaterials,
        baseBodyColors,
        baseEmissiveColors,
        previousXZ: new THREE.Vector2(),
        hasPrev: false,
        lastUpdate: getNowMs(),
        walkPhase: Math.random() * Math.PI * 2,
        movement: 0,
        aggression: 0,
        groundOffset: groundOffset * defaultScale,
      };
      actor.bodyMaterials.forEach((material, index) => {
        if (!material?.color?.isColor) return;
        const baseColor = actor.baseBodyColors[index];
        if (!baseColor) return;
        const emissive = baseColor.clone().multiplyScalar(0.2);
        if (material.emissive?.isColor) {
          material.emissive.copy(emissive);
        } else {
          material.emissive = emissive.clone();
        }
        material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0.3, 0.6);
        actor.baseEmissiveColors[index] = emissive.clone();
      });
      actor.eyeMaterials.forEach((material, index) => {
        const glow = srgbColor('#ffe8a3');
        if (material.color?.isColor) {
          material.color.copy(glow);
        }
        if (material.emissive?.isColor) {
          material.emissive.copy(glow);
        } else {
          material.emissive = glow.clone();
        }
        material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0.9, 1.3);
        actor.baseEyeColors[index] = glow.clone();
      });
      entityGroup.add(clone);
      clone.visible = true;
      clone.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(clone);
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      actor.boundingCenter = sphere?.center?.clone?.() ?? new THREE.Vector3(0, actor.groundOffset, 0);
      actor.boundingRadius = sphere?.radius ?? 1.6;
      return actor;
    }

    function ensureIronGolemMeshCount(count) {
      ensureIronGolemModelTemplate();
      if (!entityGroup || !ironGolemModelTemplate?.scene) return;
      while (ironGolemMeshes.length < count) {
        const actor = createIronGolemActor();
        if (!actor) break;
        ironGolemMeshes.push(actor);
      }
      while (ironGolemMeshes.length > count) {
        const golemData = ironGolemMeshes.pop();
        if (!golemData) continue;
        entityGroup.remove(golemData.group);
        golemData.group?.traverse?.((child) => {
          if (child?.isMesh && child.material) {
            child.material.dispose?.();
          }
        });
      }
    }


    function refreshGridPathfinder() {
      if (!combatUtils?.createGridPathfinder) {
        gridPathfinder = null;
        return;
      }
      gridPathfinder = combatUtils.createGridPathfinder({
        getWidth: () => state.width,
        getHeight: () => state.height,
        isWalkable: (x, y) => isWalkable(x, y),
        maxIterations: Math.max(128, state.width * state.height * 6),
      });
    }


    function tileSurfaceHeight(x, y) {
      const tile = getTile(x, y);
      if (!tile) return 0;
      return getTileHeight(tile) + 0.01;
    }

    function updateEntities() {
      const now = performance.now();
      let movementStrength = 0;
      if (playerMesh) {
        const { x, z } = worldToScene(state.player.x, state.player.y);
        const height = tileSurfaceHeight(state.player.x, state.player.y);
        const facing = state.player?.facing ?? { x: 0, y: 1 };

        const movementDelta = now - (state.lastMoveAt || 0);
        const pressedStrength = state.pressedKeys?.size ? 0.75 : 0;
        const recentMoveStrength = THREE.MathUtils.clamp(1 - movementDelta / 360, 0, 1);
        movementStrength = Math.min(1, Math.max(pressedStrength, recentMoveStrength));
        const walkCycle = now / 240;
        const idleBob = Math.sin(now / 1200) * 0.02;
        const bob = Math.sin(walkCycle) * 0.08 * movementStrength;
        const baseHeight = height + idleBob + bob;

        if (movementStrength > 0.28) {
          dismissMovementHint();
          if (state?.ui && !state.ui.movementGlowHintShown) {
            const jumpHintKey =
              joinKeyLabels(getActionKeyLabels('jump', { limit: 1 }), { fallback: 'Jump' }) || 'Jump';
            showPlayerHint(
              `Great! Follow the golden ring as it turns bright—face a tree or stone and press ${jumpHintKey} to gather.`,
              {
                duration: 7200,
              }
            );
            state.ui.movementGlowHintShown = true;
          }
        }

        let playerBodyHeightOffset = 0;
        let playerBodyPitch = 0;
        let playerBodyRoll = 0;

        if (playerMixer && playerAnimationActions.idle && playerAnimationActions.walk) {
          const targetWalk = THREE.MathUtils.clamp(movementStrength, 0, 1);
          const blendLerp = 0.15;
          playerAnimationBlend.walk = THREE.MathUtils.lerp(playerAnimationBlend.walk, targetWalk, blendLerp);
          playerAnimationBlend.idle = THREE.MathUtils.lerp(playerAnimationBlend.idle, 1 - targetWalk, blendLerp);

          const idleAction = playerAnimationActions.idle;
          if (idleAction) {
            idleAction.enabled = true;
            idleAction.setEffectiveWeight(THREE.MathUtils.clamp(playerAnimationBlend.idle, 0, 1));
          }

          const walkAction = playerAnimationActions.walk;
          if (walkAction) {
            walkAction.enabled = true;
            walkAction.setEffectiveWeight(THREE.MathUtils.clamp(playerAnimationBlend.walk, 0, 1));
            walkAction.timeScale = THREE.MathUtils.lerp(0.8, 1.5, THREE.MathUtils.clamp(movementStrength, 0, 1));
          }

          if (playerAnimationActions.mine && !playerAnimationActions.mine.isRunning()) {
            playerAnimationActions.mine.setEffectiveWeight(0);
            playerAnimationActions.mine.enabled = false;
          }

          playerBodyHeightOffset = Math.sin(walkCycle) * 0.05 * movementStrength;
        } else if (playerMeshParts) {
          const swing = Math.sin(walkCycle) * 0.35 * movementStrength;
          const stride = Math.sin(walkCycle) * 0.4 * movementStrength;
          const idleYaw = Math.sin(now / 1800) * 0.03;
          const idlePitch = Math.cos(now / 1700) * 0.02;
          let leftArmRotation = { x: swing, y: 0, z: 0 };
          let rightArmRotation = { x: -swing, y: 0, z: 0 };
          let leftLegRotation = { x: -stride, z: 0 };
          let rightLegRotation = { x: stride, z: 0 };
          let headRotationY = idleYaw + Math.sin(walkCycle * 0.7) * 0.08 * movementStrength;
          let headRotationX = idlePitch + Math.cos(walkCycle * 0.5) * 0.04 * movementStrength;

          const hairBase = playerMeshParts.hairBasePosition;
          const fringeBase = playerMeshParts.fringeBasePosition;
          const idleSway = Math.sin(now / 420) * 0.03;
          const stepSway = Math.sin(walkCycle * 1.2) * 0.08 * movementStrength;
          const backDrift = Math.max(0, Math.cos(walkCycle)) * 0.05 * movementStrength;
          let hairRotationX = -0.18 * movementStrength + (idleSway + stepSway) * 0.7;
          let hairRotationZ = Math.sin(now / 960) * 0.05;
          let hairPosX = hairBase ? hairBase.x + Math.sin(walkCycle * 0.5) * 0.02 * movementStrength : null;
          let hairPosY = hairBase ? hairBase.y : null;
          let hairPosZ = hairBase ? hairBase.z - 0.03 * movementStrength - backDrift : null;

          const idleLift = Math.sin(now / 360) * 0.02;
          const forwardSwing = Math.sin(walkCycle * 1.1 + Math.PI / 3) * 0.05 * movementStrength;
          let fringeRotationX = 0.12 * movementStrength - (idleLift + forwardSwing);
          let fringePosX =
            fringeBase ? fringeBase.x + Math.sin(walkCycle * 0.8 + Math.PI / 6) * 0.015 * movementStrength : null;
          let fringePosY = fringeBase ? fringeBase.y : null;
          let fringePosZ =
            fringeBase ? fringeBase.z + Math.max(0, Math.sin(walkCycle)) * 0.03 * movementStrength : null;

          const action = playerActionAnimation;
          if (action) {
            const elapsed = now - action.start;
            if (elapsed >= action.duration) {
              playerActionAnimation = null;
            } else if (action.type === 'mine') {
              const ratio = THREE.MathUtils.clamp(elapsed / action.duration, 0, 1);
              const strength = action.strength ?? 1;
              const direction = action.direction ?? { x: 0, y: 1 };
              const windupPhase = THREE.MathUtils.clamp(ratio / 0.38, 0, 1);
              const strikePhase = THREE.MathUtils.clamp((ratio - 0.32) / 0.3, 0, 1);
              const recoveryPhase = THREE.MathUtils.clamp((ratio - 0.72) / 0.28, 0, 1);
              const windup = Math.sin(windupPhase * Math.PI * 0.5) * strength;
              const strike = Math.sin(strikePhase * Math.PI) * strength;
              const recovery = recoveryPhase * strength;
              const actionWeight = Math.sin(ratio * Math.PI) * strength;
              const damping = THREE.MathUtils.clamp(1 - actionWeight * 0.9, 0.1, 1);

              leftArmRotation = {
                x: swing * damping + windup * 0.32 - strike * 0.12,
                y: -0.14 * strike,
                z: windup * 0.22 + strike * 0.08,
              };
              rightArmRotation = {
                x: -windup * 0.65 - strike * 1.55 + recovery * 0.75,
                y: (direction.x ?? 0) * 0.4 * strike,
                z: -0.45 * strike - windup * 0.3,
              };
              leftLegRotation = {
                x: leftLegRotation.x * (1 - actionWeight * 0.45),
                z: (direction.x ?? 0) * -0.08 * strike,
              };
              rightLegRotation = {
                x: rightLegRotation.x * (1 - actionWeight * 0.45),
                z: (direction.x ?? 0) * 0.08 * strike,
              };
              headRotationY += (direction.x ?? 0) * 0.26 * strike;
              headRotationX = headRotationX - strike * 0.2 + recovery * 0.12;
              hairRotationX -= strike * 0.32;
              hairRotationZ += (direction.x ?? 0) * 0.08 * strike;
              if (hairPosX !== null && hairPosZ !== null) {
                hairPosX += (direction.x ?? 0) * 0.03 * strike;
                hairPosZ -= 0.05 * strike;
              }
              if (hairPosY !== null) {
                hairPosY += windup * 0.02 - strike * 0.02;
              }
              fringeRotationX -= strike * 0.3;
              if (fringePosX !== null && fringePosZ !== null) {
                fringePosX += (direction.x ?? 0) * 0.02 * strike;
                fringePosZ += 0.05 * strike;
              }
              if (fringePosY !== null) {
                fringePosY += windup * 0.015 - strike * 0.02;
              }
              playerBodyPitch = -strike * 0.1 + windup * 0.05;
              playerBodyRoll = -(direction.x ?? 0) * 0.05 * strike;
              playerBodyHeightOffset = -actionWeight * 0.05 + recovery * 0.02;
            }
          }

          if (playerMeshParts.leftArm) {
            playerMeshParts.leftArm.rotation.x = leftArmRotation.x;
            playerMeshParts.leftArm.rotation.y = leftArmRotation.y;
            playerMeshParts.leftArm.rotation.z = leftArmRotation.z;
          }
          if (playerMeshParts.rightArm) {
            playerMeshParts.rightArm.rotation.x = rightArmRotation.x;
            playerMeshParts.rightArm.rotation.y = rightArmRotation.y;
            playerMeshParts.rightArm.rotation.z = rightArmRotation.z;
          }
          if (playerMeshParts.leftLeg) {
            playerMeshParts.leftLeg.rotation.x = leftLegRotation.x;
            playerMeshParts.leftLeg.rotation.z = leftLegRotation.z;
          }
          if (playerMeshParts.rightLeg) {
            playerMeshParts.rightLeg.rotation.x = rightLegRotation.x;
            playerMeshParts.rightLeg.rotation.z = rightLegRotation.z;
          }
          if (playerMeshParts.head) {
            playerMeshParts.head.rotation.y = headRotationY;
            playerMeshParts.head.rotation.x = headRotationX;
          }
          if (playerMeshParts.hair) {
            playerMeshParts.hair.rotation.x = hairRotationX;
            playerMeshParts.hair.rotation.z = hairRotationZ;
            if (hairPosX !== null && hairPosZ !== null) {
              playerMeshParts.hair.position.x = hairPosX;
              playerMeshParts.hair.position.z = hairPosZ;
            }
            if (hairPosY !== null) {
              playerMeshParts.hair.position.y = hairPosY;
            }
          }
          if (playerMeshParts.fringe) {
            playerMeshParts.fringe.rotation.x = fringeRotationX;
            if (fringePosX !== null && fringePosZ !== null) {
              playerMeshParts.fringe.position.x = fringePosX;
              playerMeshParts.fringe.position.z = fringePosZ;
            }
            if (fringePosY !== null) {
              playerMeshParts.fringe.position.y = fringePosY;
            }
          }
        }

        playerMesh.position.set(x, baseHeight + playerBodyHeightOffset, z);
        playerMesh.rotation.set(playerBodyPitch, Math.atan2(facing.x, facing.y), playerBodyRoll);

        syncCameraToPlayer({
          idleBob,
          walkBob: bob,
          movementStrength,
          facing,
        });
      }
      if (playerLocator) {
        const { x, z } = worldToScene(state.player.x, state.player.y);
        const height = tileSurfaceHeight(state.player.x, state.player.y) + 0.02;
        playerLocator.position.set(x, height, z);
        const cycle = (now % 2400) / 2400;
        const wave = Math.sin(cycle * Math.PI * 2);
        const pulse = 1 + wave * 0.12;
        playerLocator.scale.set(pulse, 1, pulse);
        const materials = playerLocator.userData?.pulseMaterials;
        const baseColor = playerLocator.userData?.baseColor;
        const highlightColor = playerLocator.userData?.highlightColor;
        let movementMix = 0;
        if (baseColor && highlightColor) {
          const normalized = THREE.MathUtils.clamp(movementStrength * 1.25, 0, 1);
          movementMix = normalized * normalized * (3 - 2 * normalized);
        }
        if (Array.isArray(materials) && materials.length) {
          materials.forEach((material, index) => {
            if (!material) return;
            const baseOpacity = material.userData?.baseOpacity ?? material.opacity ?? 0.45;
            const intensity = THREE.MathUtils.clamp(baseOpacity * (0.85 + wave * 0.45), 0.18, 0.95);
            material.opacity = intensity;
            if (material.color?.isColor && baseColor && highlightColor) {
              const tipBoost = index === materials.length - 1 ? Math.min(1, movementMix + 0.2) : movementMix;
              tmpColorA.copy(baseColor).lerp(highlightColor, tipBoost);
              material.color.copy(tmpColorA);
            }
          });
        } else if (playerLocator.material) {
          const opacity = 0.35 + wave * 0.25;
          playerLocator.material.opacity = THREE.MathUtils.clamp(opacity, 0.2, 0.85);
          if (playerLocator.material.color?.isColor && baseColor && highlightColor) {
            tmpColorA.copy(baseColor).lerp(highlightColor, movementMix);
            playerLocator.material.color.copy(tmpColorA);
          }
        }
        playerLocator.userData.lastMovementMix = movementMix;
      }
      ensureZombieMeshCount(state.zombies.length);
      ensureIronGolemMeshCount(state.ironGolems?.length ?? 0);
      const nightFactor = THREE.MathUtils.clamp(lightingState.nightStrength ?? 0, 0, 1);
      state.zombies.forEach((zombie, index) => {
        const actor = zombieMeshes[index];
        if (!actor) return;
        const { group, parts, eyeMaterials = [], baseEyeColors = [], groundOffset = 0 } = actor;
        const { x, z } = worldToScene(zombie.x, zombie.y);
        const h = tileSurfaceHeight(zombie.x, zombie.y);
        const deltaMs = actor.lastUpdate != null ? now - actor.lastUpdate : 16;
        actor.lastUpdate = now;
        const deltaSeconds = deltaMs / 1000;
        const prevXZ = actor.previousXZ;
        const distance = actor.hasPrev ? Math.hypot(x - prevXZ.x, z - prevXZ.y) : 0;
        prevXZ.set(x, z);
        actor.hasPrev = true;
        const targetMovement = THREE.MathUtils.clamp(distance * 3, 0, 1);
        const smoothing = Math.min(1, deltaSeconds * 6);
        const previousMovement = actor.movement ?? targetMovement;
        const movement = previousMovement + (targetMovement - previousMovement) * smoothing;
        actor.movement = movement;
        actor.walkPhase = (actor.walkPhase ?? Math.random() * Math.PI * 2) + deltaSeconds * (5 + movement * 6);
        const stride = Math.sin(actor.walkPhase) * 0.65 * movement;
        const lift = Math.cos(actor.walkPhase) * 0.45 * movement;
        if (parts.leftLeg) {
          parts.leftLeg.rotation.x = stride;
          parts.leftLeg.rotation.z = 0;
        }
        if (parts.rightLeg) {
          parts.rightLeg.rotation.x = -stride;
          parts.rightLeg.rotation.z = 0;
        }
        const idleFlail = Math.sin(now / 260 + index) * 0.2;
        if (parts.leftArm) {
          parts.leftArm.rotation.x = -stride * 0.9 - movement * 0.4;
          parts.leftArm.rotation.z = idleFlail * (1 - movement * 0.6);
        }
        if (parts.rightArm) {
          parts.rightArm.rotation.x = stride * 0.9 - movement * 0.4;
          parts.rightArm.rotation.z = -idleFlail * (1 - movement * 0.6);
        }
        if (parts.head) {
          parts.head.rotation.y = Math.sin(now / 900 + index) * 0.12 + Math.sin(actor.walkPhase * 0.6) * 0.1 * movement;
          parts.head.rotation.x = Math.cos(now / 780 + index) * 0.07 + Math.cos(actor.walkPhase * 0.4) * 0.05 * movement;
        }
        const bob = Math.abs(lift) * 0.15 + Math.sin(now / 520 + index) * 0.01 * (1 - movement);
        group.position.set(x, h + groundOffset + bob, z);

        tmpCullingCenter.set(
          x + (actor.boundingCenter?.x ?? 0),
          h + groundOffset + bob + (actor.boundingCenter?.y ?? 0),
          z + (actor.boundingCenter?.z ?? 0)
        );
        const zombieVisible = isSceneSphereVisible(tmpCullingCenter, actor.boundingRadius ?? 1.2);
        group.visible = zombieVisible;
        if (!zombieVisible) {
          return;
        }

        const distToPlayer = Math.abs(zombie.x - state.player.x) + Math.abs(zombie.y - state.player.y);
        const aggressionTarget = distToPlayer <= 1 ? 1 : Math.max(0, 1 - distToPlayer / 6);
        const previousAggression = actor.aggression ?? 0;
        const aggression = previousAggression + (aggressionTarget - previousAggression) * Math.min(1, deltaSeconds * 4);
        actor.aggression = aggression;
        const pulse = (Math.sin(now / 120 + index) + 1) * 0.25 * aggression;
        const eyeColor = actor.tempColor;
        const eyeBlend = THREE.MathUtils.clamp(aggression + pulse, 0, 1);
        eyeMaterials.forEach((material, eyeIndex) => {
          if (!material?.color) return;
          const baseColor = baseEyeColors[eyeIndex] ?? material.color;
          eyeColor.copy(baseColor).lerp(actor.aggressiveEyeColor, eyeBlend);
          material.color.copy(eyeColor);
          if (typeof material.opacity === 'number') {
            material.opacity = 0.75 + aggression * 0.25;
            material.transparent = true;
          }
          material.needsUpdate = true;
        });
        if (actor.bodyMaterials?.length) {
          const outlineStrength = THREE.MathUtils.clamp(nightFactor * 0.85 + aggression * 0.45, 0, 1);
          actor.bodyMaterials.forEach((material, matIndex) => {
            if (!material) return;
            const baseColor = actor.baseBodyColors?.[matIndex];
            const baseEmissive = actor.baseEmissiveColors?.[matIndex];
            if (baseColor && material.color) {
              tmpColorC.copy(baseColor);
              const targetColor = tmpColorD.copy(ZOMBIE_OUTLINE_COLOR);
              material.color.copy(tmpColorC.lerp(targetColor, outlineStrength * 0.35));
            }
            if (material.emissive) {
              const base = baseEmissive ?? material.emissive;
              tmpColorC.copy(base);
              const target = tmpColorD.copy(ZOMBIE_OUTLINE_COLOR);
              material.emissive.copy(tmpColorC.lerp(target, outlineStrength));
            } else {
              material.emissive = new THREE.Color('#000000');
              material.emissive.copy(ZOMBIE_OUTLINE_COLOR).multiplyScalar(outlineStrength);
            }
            material.emissiveIntensity = 0.25 + outlineStrength * 0.9;
          });
        }
      });
      state.ironGolems?.forEach((golem, index) => {
        const actor = ironGolemMeshes[index];
        if (!actor) return;
        const { group, parts, eyeMaterials = [], baseEyeColors = [], groundOffset = 0 } = actor;
        const { x, z } = worldToScene(golem.x, golem.y);
        const h = tileSurfaceHeight(golem.x, golem.y);
        const deltaMs = actor.lastUpdate != null ? now - actor.lastUpdate : 16;
        actor.lastUpdate = now;
        const deltaSeconds = deltaMs / 1000;
        const prevXZ = actor.previousXZ;
        const distance = actor.hasPrev ? Math.hypot(x - prevXZ.x, z - prevXZ.y) : 0;
        prevXZ.set(x, z);
        actor.hasPrev = true;
        const targetMovement = THREE.MathUtils.clamp(distance * 2.2, 0, 1);
        const smoothing = Math.min(1, deltaSeconds * 4);
        const previousMovement = actor.movement ?? targetMovement;
        const movement = previousMovement + (targetMovement - previousMovement) * smoothing;
        actor.movement = movement;
        actor.walkPhase = (actor.walkPhase ?? Math.random() * Math.PI * 2) + deltaSeconds * (3.2 + movement * 4.2);
        const swing = Math.sin(actor.walkPhase) * 0.38 * movement;
        const stomp = Math.max(0, Math.sin(actor.walkPhase + Math.PI / 2)) * 0.3 * movement;
        let leftLegRotationX = swing;
        let rightLegRotationX = -swing;
        let leftLegRotationZ = 0;
        let rightLegRotationZ = 0;
        let leftArmRotation = { x: -swing * 0.4 - movement * 0.18, y: 0, z: -0.05 * movement };
        let rightArmRotation = { x: swing * 0.4 - movement * 0.18, y: 0, z: 0.05 * movement };
        let headRotationY = Math.sin(actor.walkPhase * 0.35) * 0.1 * movement;
        let headRotationX = Math.cos(now / 1600 + index) * 0.03;
        let groupOffsetX = 0;
        let groupOffsetY = stomp;
        let groupOffsetZ = 0;
        let bodyPitch = 0;
        let bodyRoll = 0;
        let facingDirection = golem.attackAnimation?.direction ?? golem.facing ?? { x: 0, y: 1 };

        const attack = golem.attackAnimation;
        if (attack) {
          const elapsed = now - attack.start;
          if (elapsed >= attack.duration) {
            golem.attackAnimation = null;
            facingDirection = golem.facing ?? facingDirection;
          } else {
            const ratio = THREE.MathUtils.clamp(elapsed / attack.duration, 0, 1);
            const strength = attack.strength ?? 1;
            facingDirection = attack.direction ?? facingDirection;
            const windupPhase = THREE.MathUtils.clamp(ratio / 0.38, 0, 1);
            const strikePhase = THREE.MathUtils.clamp((ratio - 0.3) / 0.28, 0, 1);
            const recoveryPhase = THREE.MathUtils.clamp((ratio - 0.72) / 0.28, 0, 1);
            const windup = Math.sin(windupPhase * Math.PI * 0.5) * strength;
            const strike = Math.sin(strikePhase * Math.PI) * strength;
            const recovery = recoveryPhase * strength;
            const actionWeight = Math.sin(ratio * Math.PI) * strength;
            const damping = THREE.MathUtils.clamp(1 - actionWeight * 0.85, 0.2, 1);
            leftLegRotationX *= damping;
            rightLegRotationX *= damping;
            leftLegRotationZ = (facingDirection.x ?? 0) * -0.1 * strike;
            rightLegRotationZ = (facingDirection.x ?? 0) * 0.1 * strike;
            leftArmRotation = {
              x: -swing * 0.2 - movement * 0.12 + windup * 0.35,
              y: -0.15 * windup,
              z: -0.22 * windup,
            };
            rightArmRotation = {
              x: swing * 0.12 - movement * 0.12 - windup * 0.55 - strike * 1.7 + recovery * 0.8,
              y: (facingDirection.x ?? 0) * 0.55 * strike,
              z: -0.35 * strike - 0.18 * windup,
            };
            headRotationY = (facingDirection.x ?? 0) * 0.28 * strike + headRotationY * (1 - strike * 0.6);
            headRotationX = headRotationX - strike * 0.1 + windup * 0.05;
            const lunge = strike * 0.18;
            groupOffsetX += (facingDirection.x ?? 0) * lunge;
            groupOffsetZ += (facingDirection.y ?? 0) * lunge;
            groupOffsetY += windup * 0.05 - strike * 0.1 + recovery * 0.05;
            bodyPitch = -strike * 0.09 + windup * 0.05;
            bodyRoll = -(facingDirection.x ?? 0) * strike * 0.06;
          }
        }

        if (parts.leftLeg) {
          parts.leftLeg.rotation.x = leftLegRotationX;
          parts.leftLeg.rotation.z = leftLegRotationZ;
        }
        if (parts.rightLeg) {
          parts.rightLeg.rotation.x = rightLegRotationX;
          parts.rightLeg.rotation.z = rightLegRotationZ;
        }
        if (parts.leftArm) {
          parts.leftArm.rotation.x = leftArmRotation.x;
          parts.leftArm.rotation.y = leftArmRotation.y;
          parts.leftArm.rotation.z = leftArmRotation.z;
        }
        if (parts.rightArm) {
          parts.rightArm.rotation.x = rightArmRotation.x;
          parts.rightArm.rotation.y = rightArmRotation.y;
          parts.rightArm.rotation.z = rightArmRotation.z;
        }
        if (parts.head) {
          parts.head.rotation.y = headRotationY;
          parts.head.rotation.x = headRotationX;
        }

        const directionForRotation = normalizeDirectionVector(facingDirection);
        group.position.set(x + groupOffsetX, h + groundOffset + groupOffsetY, z + groupOffsetZ);
        group.rotation.set(bodyPitch, Math.atan2(directionForRotation.x, directionForRotation.y), bodyRoll);

        tmpCullingCenter.set(
          group.position.x + (actor.boundingCenter?.x ?? 0),
          group.position.y + (actor.boundingCenter?.y ?? 0),
          group.position.z + (actor.boundingCenter?.z ?? 0)
        );
        const golemVisible = isSceneSphereVisible(tmpCullingCenter, actor.boundingRadius ?? 1.6);
        group.visible = golemVisible;
        if (!golemVisible) {
          return;
        }

        let nearestZombie = Infinity;
        state.zombies.forEach((z) => {
          const d = Math.abs(z.x - golem.x) + Math.abs(z.y - golem.y);
          if (d < nearestZombie) nearestZombie = d;
        });
        const aggressionTarget = nearestZombie === Infinity ? 0 : Math.max(0, 1 - nearestZombie / 6);
        const previousAggression = actor.aggression ?? 0;
        const aggression = previousAggression + (aggressionTarget - previousAggression) * Math.min(1, deltaSeconds * 3.5);
        actor.aggression = aggression;
        const glowPulse = (Math.sin(now / 180 + index) + 1) * 0.2 * aggression;
        const eyeColor = actor.tempColor;
        const golemEyeBlend = THREE.MathUtils.clamp(aggression + glowPulse, 0, 1);
        eyeMaterials.forEach((material, eyeIndex) => {
          if (!material?.color) return;
          const baseColor = baseEyeColors[eyeIndex] ?? material.color;
          eyeColor.copy(baseColor).lerp(actor.aggressiveEyeColor, golemEyeBlend);
          material.color.copy(eyeColor);
          if (typeof material.opacity === 'number') {
            material.opacity = 0.6 + aggression * 0.35;
            material.transparent = true;
          }
          material.needsUpdate = true;
        });
        if (actor.bodyMaterials?.length) {
          const outlineStrength = THREE.MathUtils.clamp(nightFactor * 0.75 + aggression * 0.6, 0, 1);
          actor.bodyMaterials.forEach((material, matIndex) => {
            if (!material) return;
            const baseColor = actor.baseBodyColors?.[matIndex];
            const baseEmissive = actor.baseEmissiveColors?.[matIndex];
            if (baseColor && material.color) {
              tmpColorC.copy(baseColor);
              const targetColor = tmpColorD.copy(GOLEM_OUTLINE_COLOR);
              material.color.copy(tmpColorC.lerp(targetColor, outlineStrength * 0.32));
            }
            if (material.emissive) {
              const base = baseEmissive ?? material.emissive;
              tmpColorC.copy(base);
              const target = tmpColorD.copy(GOLEM_OUTLINE_COLOR);
              material.emissive.copy(tmpColorC.lerp(target, outlineStrength));
            } else {
              material.emissive = new THREE.Color('#000000');
              material.emissive.copy(GOLEM_OUTLINE_COLOR).multiplyScalar(outlineStrength);
            }
            material.emissiveIntensity = 0.3 + outlineStrength * 0.85;
          });
        }
      });
      updateMarbleGhosts();
    }

    function spawnMarbleEchoGhost() {
      if (state.dimension.id !== 'marble') return;
      if (!playerMesh || !entityGroup) return;
      const ghost = playerMesh.clone(true);
      const materials = [];
      ghost.traverse((child) => {
        if (child.isMesh) {
          const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(DIMENSIONS.marble?.theme?.accent ?? '#f3d688'),
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          child.material = material;
          materials.push(material);
        }
      });
      ghost.scale.multiplyScalar(1.02);
      entityGroup.add(ghost);
      ghost.visible = true;
      ghost.position.set(0, 0, 0);
      ghost.rotation.set(0, 0, 0);
      ghost.updateMatrixWorld(true);
      const ghostBounds = new THREE.Box3().setFromObject(ghost);
      const ghostSphere = ghostBounds.getBoundingSphere(new THREE.Sphere());
      const ghostBoundingCenter = ghostSphere?.center?.clone?.() ?? new THREE.Vector3(0, 0.8, 0);
      const ghostBoundingRadius = ghostSphere?.radius ?? 0.8;
      const rotation = Math.atan2(state.player.facing.x, state.player.facing.y);
      const scenePos = worldToScene(state.player.x, state.player.y);
      const height = tileSurfaceHeight(state.player.x, state.player.y);
      ghost.position.set(scenePos.x, height + 0.05, scenePos.z);
      ghost.rotation.y = rotation;
      marbleGhosts.push({
        group: ghost,
        materials,
        spawnAt: state.elapsed,
        triggerAt: state.elapsed + 5,
        gridX: state.player.x,
        gridY: state.player.y,
        rotation,
        boundingCenter: ghostBoundingCenter,
        boundingRadius: ghostBoundingRadius,
      });
    }

    function disposeMarbleGhost(ghost) {
      if (!ghost) return;
      if (ghost.group && entityGroup) {
        entityGroup.remove(ghost.group);
      }
      ghost.materials?.forEach((material) => material?.dispose?.());
    }

    function clearMarbleGhosts() {
      for (let i = marbleGhosts.length - 1; i >= 0; i--) {
        disposeMarbleGhost(marbleGhosts[i]);
      }
      marbleGhosts.length = 0;
    }

    function updateMarbleGhosts() {
      if (!marbleGhosts.length) return;
      const accent = DIMENSIONS.marble?.theme?.accent ?? '#f3d688';
      for (let i = marbleGhosts.length - 1; i >= 0; i--) {
        const ghost = marbleGhosts[i];
        if (state.dimension.id !== 'marble') {
          disposeMarbleGhost(ghost);
          marbleGhosts.splice(i, 1);
          continue;
        }
        const total = ghost.triggerAt - ghost.spawnAt;
        const elapsed = state.elapsed - ghost.spawnAt;
        const ratio = total > 0 ? THREE.MathUtils.clamp(elapsed / total, 0, 1) : 1;
        const fadeOutElapsed = state.elapsed - ghost.triggerAt;
        const fadeOut = fadeOutElapsed > 0 ? THREE.MathUtils.clamp(fadeOutElapsed / 0.6, 0, 1) : 0;
        const intensity = fadeOut > 0 ? Math.max(0, 1 - fadeOut) : THREE.MathUtils.smoothstep(0.05, 1, ratio);
        const scenePos = worldToScene(ghost.gridX, ghost.gridY);
        const height = tileSurfaceHeight(ghost.gridX, ghost.gridY);
        const bob = Math.sin(state.elapsed * 6 + i) * 0.04;
        ghost.group.position.set(scenePos.x, height + 0.06 + ratio * 0.35 + bob, scenePos.z);
        ghost.group.rotation.y = ghost.rotation;
        tmpCullingCenter.set(
          ghost.group.position.x + (ghost.boundingCenter?.x ?? 0),
          ghost.group.position.y + (ghost.boundingCenter?.y ?? 0),
          ghost.group.position.z + (ghost.boundingCenter?.z ?? 0)
        );
        const ghostVisible = isSceneSphereVisible(tmpCullingCenter, ghost.boundingRadius ?? 0.8);
        ghost.group.visible = ghostVisible;
        if (!ghostVisible) {
          continue;
        }
        ghost.materials?.forEach((material) => {
          if (!material) return;
          material.opacity = THREE.MathUtils.clamp(0.08 + intensity * 0.5, 0, 0.65);
          material.color.set(accent);
          material.color.lerp(new THREE.Color('#ffffff'), ratio * 0.3);
        });
        if (fadeOut >= 1) {
          disposeMarbleGhost(ghost);
          marbleGhosts.splice(i, 1);
        }
      }
    }

    function spawnHarvestParticles(x, y, accentColor) {
      if (!particleGroup) return;
      const count = 42;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const baseIndex = i * 3;
        positions[baseIndex] = (Math.random() - 0.5) * 0.4;
        positions[baseIndex + 1] = Math.random() * 0.4;
        positions[baseIndex + 2] = (Math.random() - 0.5) * 0.4;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.6 + Math.random() * 0.8;
        velocities[baseIndex] = Math.cos(angle) * speed;
        velocities[baseIndex + 1] = Math.random() * 1.2 + 0.6;
        velocities[baseIndex + 2] = Math.sin(angle) * speed;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const pointsMaterial = new THREE.PointsMaterial({
        size: 0.18,
        transparent: true,
        depthWrite: false,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        map: getParticleTexture(),
        color: new THREE.Color(accentColor ?? '#ffffff'),
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, pointsMaterial);
      const { x: sx, z: sz } = worldToScene(x, y);
      points.position.set(sx, tileSurfaceHeight(x, y) + 0.35, sz);
      particleGroup.add(points);
      particleSystems.push({
        points,
        positions,
        velocities,
        life: 0,
        maxLife: 1.35,
        count,
      });
    }

    function spawnBlockDustParticles(x, y, color) {
      if (!particleGroup) return;
      const count = 20;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        const baseIndex = i * 3;
        positions[baseIndex] = (Math.random() - 0.5) * 0.28;
        positions[baseIndex + 1] = Math.random() * 0.22 + 0.08;
        positions[baseIndex + 2] = (Math.random() - 0.5) * 0.28;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.7 + Math.random() * 0.6;
        velocities[baseIndex] = Math.cos(angle) * speed;
        velocities[baseIndex + 1] = Math.random() * 1.2 + 0.5;
        velocities[baseIndex + 2] = Math.sin(angle) * speed;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        size: 0.16,
        transparent: true,
        depthWrite: false,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        map: getParticleTexture(),
        color: new THREE.Color(color ?? '#f4c766'),
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, material);
      const { x: sx, z: sz } = worldToScene(x, y);
      points.position.set(sx, tileSurfaceHeight(x, y) + 0.38, sz);
      particleGroup.add(points);
      particleSystems.push({
        points,
        positions,
        velocities,
        life: 0,
        maxLife: 0.85,
        count,
        gravityScale: 0.55,
        swirlStrength: 0,
        fadePower: 1.4,
      });
    }

    function spawnRailCrumbleParticles(x, y, accentColor) {
      if (!particleGroup) return;
      const count = 34;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const baseIndex = i * 3;
        positions[baseIndex] = (Math.random() - 0.5) * 0.32;
        positions[baseIndex + 1] = Math.random() * 0.22;
        positions[baseIndex + 2] = (Math.random() - 0.5) * 0.32;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.35 + Math.random() * 0.55;
        velocities[baseIndex] = Math.cos(angle) * speed;
        velocities[baseIndex + 1] = Math.random() * 0.8 + 0.25;
        velocities[baseIndex + 2] = Math.sin(angle) * speed;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const pointsMaterial = new THREE.PointsMaterial({
        size: 0.12,
        transparent: true,
        depthWrite: false,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        map: getParticleTexture(),
        color: new THREE.Color(accentColor ?? '#ff7646'),
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, pointsMaterial);
      const { x: sx, z: sz } = worldToScene(x, y);
      points.position.set(sx, tileSurfaceHeight(x, y) + 0.28, sz);
      particleGroup.add(points);
      particleSystems.push({
        points,
        positions,
        velocities,
        life: 0,
        maxLife: 0.9,
        count,
        gravityScale: 0.48,
        swirlStrength: 0.14,
        swirlFrequency: 6.5,
        fadePower: 1.8,
      });
    }

    function advanceParticles(delta) {
      if (!particleSystems.length) return;
      for (let i = particleSystems.length - 1; i >= 0; i--) {
        const system = particleSystems[i];
        system.life += delta;
        const ratio = system.life / system.maxLife;
        const { positions, velocities, points, count } = system;
        for (let j = 0; j < count; j++) {
          const baseIndex = j * 3;
          const gravityScale = system.gravityScale ?? 0.35;
          velocities[baseIndex + 1] -= 9.81 * delta * gravityScale;
          const swirlFrequency = system.swirlFrequency ?? 9;
          const swirlStrength = system.swirlStrength ?? 0.25;
          if (swirlStrength !== 0) {
            const swirl = Math.sin((system.life + j) * swirlFrequency) * swirlStrength * delta;
            velocities[baseIndex] += swirl;
            velocities[baseIndex + 2] -= swirl;
          }
          positions[baseIndex] += velocities[baseIndex] * delta;
          positions[baseIndex + 1] += velocities[baseIndex + 1] * delta;
          positions[baseIndex + 2] += velocities[baseIndex + 2] * delta;
        }
        points.geometry.attributes.position.needsUpdate = true;
        points.geometry.computeBoundingSphere();
        if (points.material) {
          const fadePower = system.fadePower ?? 2;
          const fade = Math.max(0, 1 - Math.pow(ratio, fadePower));
          points.material.opacity = fade;
          points.material.needsUpdate = true;
        }
        if (ratio >= 1) {
          particleGroup.remove(points);
          points.geometry.dispose();
          points.material.dispose();
          particleSystems.splice(i, 1);
        }
      }
    }

    function updateMiningState(delta) {
      if (!miningState) return;
      const tile = getTile(miningState.tileX, miningState.tileY);
      if (!tile || tile.type === 'grass' || !tile.resource) {
        clearMiningState();
        return;
      }
      const now = performance?.now ? performance.now() : Date.now();
      const duration = miningState.duration || MINING_DURATION_MS;
      const elapsed = now - (miningState.startTime ?? now);
      const progress = duration > 0 ? Math.min(1, elapsed / duration) : 1;
      updateMiningOverlayVisual(miningState, progress);
      if (progress >= 1) {
        spawnBlockDustParticles(miningState.tileX, miningState.tileY, miningState.dustColor);
        harvestResource(tile, miningState.tileX, miningState.tileY, false, {
          skipParticles: true,
          skipAudio: false,
          skipAnimation: true,
        });
        clearMiningState();
      }
    }

    function updateLighting(delta) {
      if (!scene || !state || !hemiLight || !sunLight || !moonLight) return;
      const cycle = getDayNightMetrics();
      const ratio = cycle.ratio;
      const playerFacing = state.player?.facing ?? { x: 0, y: 1 };
      const playerScene = worldToScene(state.player?.x ?? 0, state.player?.y ?? 0);
      const playerHeight = tileSurfaceHeight(state.player?.x ?? 0, state.player?.y ?? 0) + 0.6;

      const sunAngle = cycle.isNight
        ? Math.PI + cycle.nightProgress * Math.PI
        : cycle.dayProgress * Math.PI;
      const sunElevation = Math.sin(sunAngle);
      const dayStrength = THREE.MathUtils.clamp((sunElevation + 1) / 2, 0, 1);
      lightingState.dayStrength = dayStrength;
      const sunRadius = 24;
      sunLight.position.set(
        playerScene.x + Math.cos(sunAngle) * sunRadius,
        playerHeight + 8 + Math.max(0, sunElevation * 14),
        playerScene.z + Math.sin(sunAngle) * sunRadius
      );
      sunLight.target.position.set(playerScene.x, playerHeight - 0.6, playerScene.z);
      sunLight.target.updateMatrixWorld();
      sunLight.intensity = 0.45 + dayStrength * 1.35;

      const moonAngle = sunAngle + Math.PI;
      const moonElevation = Math.sin(moonAngle);
      const nightStrength = THREE.MathUtils.clamp((moonElevation + 1) / 2, 0, 1);
      lightingState.nightStrength = nightStrength;
      const moonRadius = 22;
      moonLight.position.set(
        playerScene.x + Math.cos(moonAngle) * moonRadius,
        playerHeight + 6 + Math.max(0, moonElevation * 10),
        playerScene.z + Math.sin(moonAngle) * moonRadius
      );
      moonLight.target.position.copy(sunLight.target.position);
      moonLight.target.updateMatrixWorld();
      moonLight.intensity = 0.25 + nightStrength * 0.6;

      hemiLight.intensity = 0.65 + dayStrength * 0.45;
      hemiLight.color.lerpColors(lightingState.nightSky, lightingState.daySky, dayStrength);
      hemiLight.groundColor.lerpColors(lightingState.groundNight, lightingState.groundDay, dayStrength);

      if (ambientLight) {
        const ambientStrength = 0.38 + dayStrength * 0.35;
        ambientLight.intensity = ambientStrength;
        tmpColorB
          .copy(lightingState.nightSky)
          .lerp(lightingState.daySky, Math.min(1, dayStrength * 0.85 + 0.25));
        ambientLight.color.copy(tmpColorB);
      }

      if (rimLight) {
        const rimRadius = 18;
        const rimAngle = sunAngle + Math.PI * 0.65;
        rimLight.position.set(
          playerScene.x + Math.cos(rimAngle) * rimRadius,
          playerHeight + 9,
          playerScene.z + Math.sin(rimAngle) * rimRadius
        );
        rimLight.target.position.set(playerScene.x, playerHeight + 0.6, playerScene.z);
        rimLight.target.updateMatrixWorld();
        rimLight.intensity = 0.45 + dayStrength * 0.5;
        rimLight.color.lerpColors(rimLightColors.night, rimLightColors.day, Math.min(1, dayStrength + 0.1));
      }

      const dawnDistance = Math.min(
        Math.abs(ratio) / (cycle.dayPortion || 1),
        Math.abs(ratio - 1) / (cycle.dayPortion || 1)
      );
      const duskDistance = Math.abs(ratio - cycle.dayPortion) / (cycle.nightPortion || 1);
      const duskMix = Math.max(0, 0.22 - Math.min(dawnDistance, duskDistance)) / 0.22;
      tmpColorA.copy(lightingState.nightSky).lerp(lightingState.daySky, dayStrength);
      if (duskMix > 0) {
        tmpColorB.copy(lightingState.duskSky);
        tmpColorA.lerp(tmpColorB, duskMix * 0.6);
      }
      scene.fog.color.copy(tmpColorA);

      if (torchLight) {
        const selectedSlot = state.player?.inventory?.[state.player?.selectedSlot ?? 0];
        const holdingTorch = selectedSlot?.item === 'torch';
        const target = holdingTorch ? 3.4 : 0;
        const lerpAlpha = Math.min(1, delta * 6 + 0.12);
        const baseIntensity = THREE.MathUtils.lerp(torchLight.intensity ?? 0, target, lerpAlpha);
        const flicker = holdingTorch ? (Math.sin(state.elapsed * 22) + Math.sin(state.elapsed * 13.7)) * 0.18 : 0;
        torchLight.intensity = Math.max(0, baseIntensity + flicker);
        torchLight.distance = holdingTorch ? 7.5 : 4;
        torchLight.decay = 1.8;
        torchLight.visible = torchLight.intensity > 0.05;
        torchLight.castShadow = torchLight.visible;
        torchLight.position.set(
          playerScene.x + playerFacing.x * 0.45,
          playerHeight + 0.65,
          playerScene.z + playerFacing.y * 0.45
        );
      }
    }

    function applyFrustumCulling() {
      if (!voxelIslandAssets?.mesh) {
        return;
      }
      if (worldCullingState.islandRadius <= 0) {
        voxelIslandAssets.mesh.visible = true;
        return;
      }
      voxelIslandAssets.mesh.visible = isSceneSphereVisible(
        worldCullingState.islandCenter,
        worldCullingState.islandRadius
      );
    }

    function renderScene() {
      updateWorldMeshes();
      updateEntities();
      if (renderer && scene && camera) {
        if (rendererRecoveryFrames > 0) {
          rendererRecoveryFrames -= 1;
          return;
        }
        if (pendingUniformSanitizations > 0) {
          const sanitized = sanitizeSceneUniforms();
          pendingUniformSanitizations -= 1;
          if (sanitized) {
            rendererRecoveryFrames = Math.max(rendererRecoveryFrames, 1);
            return;
          }
        }
        if (ensureSceneUniformValuePresence()) {
          rendererRecoveryFrames = Math.max(rendererRecoveryFrames, 1);
          pendingUniformSanitizations = Math.max(pendingUniformSanitizations, 1);
          return;
        }
        if (pendingUniformSanitizations === 0 && sceneHasUniformIntegrityIssues()) {
          const sanitized = sanitizeSceneUniforms();
          rendererRecoveryFrames = Math.max(rendererRecoveryFrames, sanitized ? 1 : 2);
          pendingUniformSanitizations = Math.max(pendingUniformSanitizations, sanitized ? 1 : 2);
          if (!sanitized) {
            uniformSanitizationFailureStreak = Math.max(uniformSanitizationFailureStreak, 1);
          }
          return;
        }
        try {
          applyFrustumCulling();
          renderer.render(scene, camera);
          uniformSanitizationFailureStreak = 0;
        } catch (error) {
          if (error && typeof error === 'object') {
            error.__silentUniformRepair = true;
          }
          if (rebuildInvalidMaterialUniforms(error)) {
            pendingUniformSanitizations = Math.max(pendingUniformSanitizations, 2);
            return;
          }
          const uniformValueErrorMessage =
            typeof error?.message === 'string'
              ? error.message
              : typeof error === 'string'
              ? error
              : '';
          if (uniformValueErrorMessage.includes("Cannot read properties of undefined (reading 'value')")) {
            const sanitizedNow = sanitizeSceneUniforms();
            if (!sanitizedNow && attemptPortalShaderMaterialRecovery()) {
              rendererRecoveryFrames = Math.max(rendererRecoveryFrames, 2);
              pendingUniformSanitizations = Math.max(pendingUniformSanitizations, 3);
              uniformSanitizationFailureStreak = 0;
              return;
            }
            uniformSanitizationFailureStreak += 1;
            if (uniformSanitizationFailureStreak >= 3) {
              if (attemptPortalShaderMaterialRecovery()) {
                rendererRecoveryFrames = Math.max(rendererRecoveryFrames, 2);
                pendingUniformSanitizations = Math.max(pendingUniformSanitizations, 3);
                uniformSanitizationFailureStreak = 0;
                return;
              }
              const disabled = disablePortalSurfaceShaders(
                new Error(
                  'Renderer repeatedly encountered undefined shader uniforms despite sanitization attempts.'
                )
              );
              if (disabled) {
                rendererRecoveryFrames = Math.max(rendererRecoveryFrames, 2);
                pendingUniformSanitizations = Math.max(pendingUniformSanitizations, 3);
                uniformSanitizationFailureStreak = 0;
                return;
              }
            }
            rendererRecoveryFrames = Math.max(rendererRecoveryFrames, sanitizedNow ? 1 : 2);
            pendingUniformSanitizations = Math.max(pendingUniformSanitizations, sanitizedNow ? 1 : 2);
            return;
          }
          if (!disablePortalSurfaceShaders(error)) {
            console.error('Renderer encountered an unrecoverable error.', error);
            pendingUniformSanitizations = Math.max(pendingUniformSanitizations, 2);
            return;
          }
          rendererRecoveryFrames = Math.max(rendererRecoveryFrames, 2);
          pendingUniformSanitizations = Math.max(pendingUniformSanitizations, 3);
          return;
        }
      }
    }

    const TILE_TYPES = {
      grass: { base: '#1d934d', accent: '#91ffb7', walkable: true },
      water: { base: '#113060', accent: '#49f2ff', walkable: false },
      sand: { base: '#d3a65c', accent: '#f5d9a8', walkable: true },
      tree: { base: '#20633a', accent: '#49f25f', walkable: false, resource: 'wood' },
      stone: { base: '#6f7e8f', accent: '#d4ecff', walkable: true, resource: 'stone' },
      rock: { base: '#3f4c52', accent: '#cbd6de', walkable: true, resource: 'rock' },
      ore: { base: '#4c5b68', accent: '#49f2ff', walkable: true, resource: 'spark-crystal' },
      rail: { base: '#1c2435', accent: '#49f2ff', walkable: true },
      railVoid: { base: '#05080f', accent: '#151c2a', walkable: false },
      portalFrame: { base: '#3b4b7a', accent: '#9dc7ff', walkable: true },
      portalDormant: { base: '#1a1f39', accent: '#7b6bff', walkable: true },
      portal: { base: '#2e315b', accent: '#7b6bff', walkable: true },
      tar: { base: '#251c23', accent: '#5f374d', walkable: true, resource: 'tar' },
      marble: { base: '#f6f2ed', accent: '#f7b733', walkable: true, resource: 'marble' },
      marbleEcho: { base: '#d8d4ff', accent: '#f7b733', walkable: true },
      netherite: { base: '#402020', accent: '#ff8249', walkable: true, resource: 'netherite' },
      lava: { base: '#6f2211', accent: '#ff8249', walkable: false },
      canyon: { base: '#483c30', accent: '#b08d64', walkable: true, resource: 'rock' },
      crystal: { base: '#1d2e5c', accent: '#49f2ff', walkable: true, resource: 'pattern-crystal' },
      void: { base: '#010308', accent: '#0a101f', walkable: false },
      village: { base: '#275b6d', accent: '#79f2ff', walkable: true },
      chest: { base: '#3d2a14', accent: '#f7b733', walkable: false, resource: 'chest' },
    };

    const ITEM_DEFS = {
      wood: { name: 'Wood', stack: 99, description: 'Harvested from trees; fuels basic tools.' },
      stone: { name: 'Stone Chunk', stack: 99, description: 'Solid stone for early crafting.' },
      rock: { name: 'Heavy Rock', stack: 99, description: 'Dense rock for Rock portals.' },
      'spark-crystal': { name: 'Spark Crystal', stack: 99, description: 'Charges igniters and rails.' },
      tar: { name: 'Tar Sac', stack: 99, description: 'Sticky tar used for slowing traps.' },
      marble: { name: 'Marble Inlay', stack: 99, description: 'Refined marble for elegant tech.' },
      netherite: { name: 'Netherite Shard', stack: 99, description: 'Volatile shard from collapsing rails.' },
      stick: { name: 'Stick', stack: 99, description: 'Basic shaft for tools.' },
      torch: { name: 'Torch', stack: 20, description: 'Lights portals and wards zombies.' },
      'stone-pickaxe': { name: 'Stone Pickaxe', stack: 1, description: 'Required to mine dense nodes.' },
      'tar-blade': { name: 'Tar Blade', stack: 1, description: 'Slows enemies on hit.' },
      'marble-echo': { name: 'Echo Core', stack: 1, description: 'Stores reverberating actions.' },
      'portal-igniter': { name: 'Portal Igniter', stack: 1, description: 'Activates portal frames.' },
      'rail-key': { name: 'Rail Key', stack: 1, description: 'Unlocks sealed chests on rails.' },
      'heavy-plating': { name: 'Heavy Plating', stack: 10, description: 'Armor plating from rock golems.' },
      'pattern-crystal': { name: 'Pattern Crystal', stack: 99, description: 'Used to sync stone rails.' },
      'eternal-ingot': { name: 'Eternal Ingot', stack: 1, description: 'Victory relic from the Netherite dimension.' },
    };

    const RECIPES = [
      {
        id: 'stick',
        name: 'Stick',
        sequence: ['wood'],
        output: { item: 'stick', quantity: 2 },
        unlock: 'origin',
      },
      {
        id: 'stone-pickaxe',
        name: 'Stone Pickaxe',
        sequence: ['stick', 'stick', 'stone'],
        output: { item: 'stone-pickaxe', quantity: 1 },
        unlock: 'origin',
      },
      {
        id: 'torch',
        name: 'Torch',
        sequence: ['stick', 'tar'],
        output: { item: 'torch', quantity: 2 },
        unlock: 'rock',
      },
      {
        id: 'portal-igniter',
        name: 'Portal Igniter',
        sequence: ['tar', 'spark-crystal', 'stick'],
        output: { item: 'portal-igniter', quantity: 1 },
        unlock: 'stone',
      },
      {
        id: 'rail-key',
        name: 'Rail Key',
        sequence: ['pattern-crystal', 'stick', 'pattern-crystal'],
        output: { item: 'rail-key', quantity: 1 },
        unlock: 'stone',
      },
      {
        id: 'tar-blade',
        name: 'Tar Blade',
        sequence: ['tar', 'stone', 'tar'],
        output: { item: 'tar-blade', quantity: 1 },
        unlock: 'tar',
      },
      {
        id: 'marble-echo',
        name: 'Echo Core',
        sequence: ['marble', 'spark-crystal', 'marble'],
        output: { item: 'marble-echo', quantity: 1 },
        unlock: 'marble',
      },
      {
        id: 'heavy-plating',
        name: 'Heavy Plating',
        sequence: ['rock', 'stone', 'rock'],
        output: { item: 'heavy-plating', quantity: 1 },
        unlock: 'rock',
      },
    ];

    const DIMENSION_SEQUENCE = ['origin', 'rock', 'stone', 'tar', 'marble', 'netherite'];

    const DIMENSIONS = {
      origin: {
        id: 'origin',
        name: 'Grassland Threshold',
        description:
          'A peaceful island afloat in void. Gather wood and stone, craft tools, and prepare the first portal.',
        palette: ['#1d934d', '#49f2ff'],
        theme: {
          accent: '#49f2ff',
          accentStrong: '#f7b733',
          accentSoft: 'rgba(73, 242, 255, 0.3)',
          bgPrimary: '#050912',
          bgSecondary: '#0d182f',
          bgTertiary: 'rgba(21, 40, 72, 0.85)',
          pageBackground: `radial-gradient(circle at 20% 20%, rgba(73, 242, 255, 0.2), transparent 45%), radial-gradient(circle at 80% 10%, rgba(247, 183, 51, 0.2), transparent 55%), linear-gradient(160deg, #050912, #0b1230 60%, #05131f 100%)`,
          dimensionGlow: 'rgba(73, 242, 255, 0.45)',
          class: 'theme-grassland',
        },
        atmosphere: {
          daySky: '#bcd7ff',
          nightSky: '#0b1324',
          duskSky: '#f7b07b',
          groundDay: '#1c283f',
          groundNight: '#050912',
          fogColor: '#0b1324',
          fogDensity: 0.055,
        },
        rules: {
          moveDelay: DEFAULT_MOVE_DELAY_SECONDS,
        },
        generator: (state) => generateOriginIsland(state),
      },
      rock: {
        id: 'rock',
        name: 'Rock Dimension',
        description:
          'Gravity tugs harder. Slippery slopes will slide you downward. Mine heavy ore guarded by golems.',
        palette: ['#483c30', '#b08d64'],
        theme: {
          accent: '#f2b266',
          accentStrong: '#ff7b3d',
          accentSoft: 'rgba(242, 178, 102, 0.25)',
          bgPrimary: '#160f13',
          bgSecondary: '#22191b',
          bgTertiary: 'rgba(53, 38, 34, 0.78)',
          pageBackground: `radial-gradient(circle at 18% 22%, rgba(242, 178, 102, 0.18), transparent 45%), radial-gradient(circle at 80% 14%, rgba(79, 103, 132, 0.2), transparent 55%), linear-gradient(160deg, #141014, #27190f 55%, #180f1b 100%)`,
          dimensionGlow: 'rgba(242, 178, 102, 0.35)',
        },
        physics: {
          gravity: 1.5,
          shaderProfile: 'rock-grit',
        },
        atmosphere: {
          daySky: '#9c8b72',
          nightSky: '#1a1111',
          duskSky: '#e2b183',
          groundDay: '#2f1f19',
          groundNight: '#120909',
          fogColor: '#251611',
          fogDensity: 0.01,
        },
        rules: {
          moveDelay: DEFAULT_MOVE_DELAY_SECONDS * 1.2,
          onMove: (state, from, to, dir) => {
            if (to?.data?.slope && !state.player.isSliding) {
              state.player.isSliding = true;
              const slideDir = to.data.slope;
              setTimeout(() => {
                attemptMove(slideDir.dx, slideDir.dy, true);
                state.player.isSliding = false;
              }, 120);
            }
          },
        },
        generator: (state) => generateRockCanyon(state),
        rewards: [{ item: 'rock', quantity: 1 }, { item: 'heavy-plating', quantity: 0 }],
      },
      stone: {
        id: 'stone',
        name: 'Stone Dimension',
        description:
          'Rails materialize in rhythm. Time your crossings to harvest pattern crystals from glowing seams.',
        palette: ['#1c2435', '#49f2ff'],
        theme: {
          accent: '#7ad0ff',
          accentStrong: '#a998ff',
          accentSoft: 'rgba(122, 208, 255, 0.28)',
          bgPrimary: '#091224',
          bgSecondary: '#131b33',
          bgTertiary: 'rgba(24, 36, 66, 0.82)',
          pageBackground: `radial-gradient(circle at 18% 20%, rgba(122, 208, 255, 0.18), transparent 50%), radial-gradient(circle at 75% 18%, rgba(148, 135, 255, 0.18), transparent 60%), linear-gradient(160deg, #0a1324, #141b33 55%, #090d18 100%)`,
          dimensionGlow: 'rgba(122, 208, 255, 0.45)',
        },
        atmosphere: {
          daySky: '#8fb4ff',
          nightSky: '#0a1428',
          duskSky: '#8e7eff',
          groundDay: '#1b2d46',
          groundNight: '#080d19',
          fogColor: '#122036',
          fogDensity: 0.06,
        },
        rules: {
          moveDelay: DEFAULT_MOVE_DELAY_SECONDS * 1.07,
          update: (state, delta) => {
            state.railTimer += delta;
            if (state.railTimer >= 1.4) {
              state.railTimer = 0;
              state.railPhase = (state.railPhase + 1) % 2;
            }
          },
          isWalkable: (tile, state) => {
            if (tile?.type === 'rail') {
              return state.railPhase === tile.data.phase;
            }
            return undefined;
          },
        },
        generator: (state) => generateStonePattern(state),
      },
      tar: {
        id: 'tar',
        name: 'Tar Dimension',
        description:
          'Everything is heavy. Movement slows and tar slugs trail you. Harvest tar sacs carefully.',
        palette: ['#251c23', '#5f374d'],
        theme: {
          accent: '#bb86ff',
          accentStrong: '#ff6f91',
          accentSoft: 'rgba(187, 134, 255, 0.28)',
          bgPrimary: '#150b16',
          bgSecondary: '#1f1024',
          bgTertiary: 'rgba(53, 24, 55, 0.78)',
          pageBackground: `radial-gradient(circle at 16% 24%, rgba(187, 134, 255, 0.18), transparent 45%), radial-gradient(circle at 82% 18%, rgba(255, 111, 145, 0.16), transparent 60%), linear-gradient(160deg, #120918, #231126 55%, #16081f 100%)`,
          dimensionGlow: 'rgba(187, 134, 255, 0.42)',
        },
        atmosphere: {
          daySky: '#6b4c7b',
          nightSky: '#120912',
          duskSky: '#a45d92',
          groundDay: '#2b1531',
          groundNight: '#120718',
          fogColor: '#1c0d21',
          fogDensity: 0.088,
        },
        rules: {
          moveDelay: DEFAULT_MOVE_DELAY_SECONDS * 1.87,
          onMove: (state) => {
            state.player.tarStacks = Math.min((state.player.tarStacks || 0) + 1, 4);
            state.player.tarSlowTimer = 2.4;
          },
        },
        generator: (state) => generateTarBog(state),
      },
      marble: {
        id: 'marble',
        name: 'Marble Dimension',
        description:
          'Every action echoes. Five seconds later, your past self repeats it. Build portals with mirrored discipline.',
        palette: ['#f6f2ed', '#f7b733'],
        theme: {
          accent: '#f3d688',
          accentStrong: '#ffffff',
          accentSoft: 'rgba(243, 214, 136, 0.28)',
          bgPrimary: '#11131f',
          bgSecondary: '#1b1e30',
          bgTertiary: 'rgba(32, 36, 58, 0.82)',
          pageBackground: `radial-gradient(circle at 20% 25%, rgba(243, 214, 136, 0.2), transparent 45%), radial-gradient(circle at 80% 20%, rgba(154, 163, 255, 0.18), transparent 60%), linear-gradient(160deg, #101320, #1c1f30 55%, #0f111b 100%)`,
          dimensionGlow: 'rgba(243, 214, 136, 0.4)',
        },
        atmosphere: {
          daySky: '#f0ede4',
          nightSky: '#111522',
          duskSky: '#ffd9a1',
          groundDay: '#d9d7cf',
          groundNight: '#1a1d2c',
          fogColor: '#dfd8ce',
          fogDensity: 0.045,
        },
        rules: {
          moveDelay: DEFAULT_MOVE_DELAY_SECONDS * 1.2,
          onAction: (state, action) => {
            spawnMarbleEchoGhost();
            state.echoQueue.push({ at: state.elapsed + 5, action });
          },
          update: (state) => {
            if (!state.echoQueue.length) return;
            const now = state.elapsed;
            while (state.echoQueue.length && state.echoQueue[0].at <= now) {
              const echo = state.echoQueue.shift();
              echo.action(true);
              logEvent('Echo repeats your action.');
            }
          },
        },
        generator: (state) => generateMarbleGarden(state),
      },
      netherite: {
        id: 'netherite',
        name: 'Netherite Dimension',
        description:
          'Rails crumble behind you. Sprint ahead, align collapsing tracks, and claim the Eternal Ingot.',
        palette: ['#402020', '#ff8249'],
        theme: {
          accent: '#ff7646',
          accentStrong: '#ffd05f',
          accentSoft: 'rgba(255, 118, 70, 0.28)',
          bgPrimary: '#1b0d0d',
          bgSecondary: '#261011',
          bgTertiary: 'rgba(63, 22, 18, 0.82)',
          pageBackground: `radial-gradient(circle at 18% 22%, rgba(255, 118, 70, 0.18), transparent 45%), radial-gradient(circle at 80% 15%, rgba(255, 208, 95, 0.16), transparent 60%), linear-gradient(160deg, #180909, #2c1110 55%, #12070e 100%)`,
          dimensionGlow: 'rgba(255, 118, 70, 0.4)',
          class: 'theme-netherite',
        },
        atmosphere: {
          daySky: '#ff9d73',
          nightSky: '#290806',
          duskSky: '#ff6f5b',
          groundDay: '#4a1c12',
          groundNight: '#190606',
          fogColor: '#2b0d07',
          fogDensity: 0.075,
        },
        rules: {
          moveDelay: DEFAULT_MOVE_DELAY_SECONDS * 0.93,
          onMove: (state, from, to) => {
            if (!from) return;
            const tile = getTile(from.x, from.y);
            if (tile && tile.type !== 'void') {
              setTimeout(() => {
                if (state.dimension?.id !== 'netherite') return;
                const checkTile = getTile(from.x, from.y);
                if (!checkTile) return;
                if (checkTile.type === 'portal' || checkTile.type === 'portalFrame' || checkTile.type === 'railVoid') return;
                checkTile.type = 'railVoid';
                checkTile.hazard = false;
                checkTile.data = {};
                delete checkTile.resource;
                const accent =
                  state.dimension?.theme?.accentStrong ?? state.dimension?.theme?.accent ?? '#ff7646';
                spawnRailCrumbleParticles(from.x, from.y, accent);
              }, 400);
            }
          },
        },
        generator: (state) => generateNetheriteCollapse(state),
      },
    };

    const DIMENSION_THEME_CLASSES = Object.values(DIMENSIONS)
      .map((dimension) => dimension.theme?.class)
      .filter(Boolean);

    function applyDimensionTheme(dimension) {
      if (!dimension) return;
      const theme = { ...BASE_THEME, ...(dimension.theme ?? {}) };
      const style = rootElement.style;
      style.setProperty('--accent', theme.accent);
      style.setProperty('--accent-strong', theme.accentStrong);
      style.setProperty('--accent-soft', theme.accentSoft);
      style.setProperty('--bg-primary', theme.bgPrimary);
      style.setProperty('--bg-secondary', theme.bgSecondary);
      style.setProperty('--bg-tertiary', theme.bgTertiary);
      style.setProperty('--page-background', theme.pageBackground);
      style.setProperty('--dimension-glow', theme.dimensionGlow);
      document.body.dataset.dimension = dimension.id;
      DIMENSION_THEME_CLASSES.forEach((className) => {
        if (className) {
          document.body.classList.remove(className);
        }
      });
      if (dimension.theme?.class) {
        document.body.classList.add(dimension.theme.class);
      }
    }

    function applyDimensionAtmosphere(dimension) {
      const atmosphere = { ...BASE_ATMOSPHERE, ...(dimension?.atmosphere ?? {}) };
      lightingState.daySky.set(atmosphere.daySky);
      lightingState.nightSky.set(atmosphere.nightSky);
      lightingState.duskSky.set(atmosphere.duskSky);
      lightingState.groundDay.set(atmosphere.groundDay);
      lightingState.groundNight.set(atmosphere.groundNight);
      if (scene?.fog) {
        scene.fog.color.set(atmosphere.fogColor);
        scene.fog.density = atmosphere.fogDensity;
      }
    }

    const HEALTH_REGEN_IDLE_DELAY = 5;
    const HEALTH_REGEN_FULL_RESTORE_DURATION = 60;

    const state = {
      width: 16,
      height: 12,
      tileWidth: canvas.width / 16,
      tileHeight: canvas.height / 12,
      world: [],
      dimension: DIMENSIONS.origin,
      dimensionHistory: ['origin'],
      elapsed: 0,
      dayLength: DAY_NIGHT_CYCLE_SECONDS,
      dayCycle: {
        isNight: false,
        spawnTimer: 0,
        waveCount: 0,
      },
      physics: {
        gravity: 1,
        shaderProfile: 'default',
      },
      railPhase: 0,
      railTimer: 0,
      portals: [],
      zombies: [],
      ironGolems: [],
      lootables: [],
      chests: [],
      lastMoveAt: 0,
      moveDelay: DEFAULT_MOVE_DELAY_SECONDS,
      cameraPerspective: 'third',
      baseMoveDelay: DEFAULT_MOVE_DELAY_SECONDS,
      hooks: {
        onMove: [],
        onAction: [],
        update: [],
        isWalkable: [],
      },
      echoQueue: [],
      craftSequence: [],
      knownRecipes: new Set(['stick', 'stone-pickaxe']),
      unlockedDimensions: new Set(['origin']),
      simpleSummary: null,
      player: {
        x: 8,
        y: 6,
        facing: { x: 0, y: 1 },
        hearts: 10,
        maxHearts: 10,
        air: 10,
        maxAir: 10,
        selectedSlot: 0,
        inventory: Array.from({ length: 10 }, () => null),
        satchel: [],
        effects: {},
        hasIgniter: false,
        tarStacks: 0,
        tarSlowTimer: 0,
        zombieHits: 0,
        lastDamageAt: -Infinity,
        heartsAtLastDamage: null,
      },
      defaultKeyBindings: cloneKeyBindingMap(DEFAULT_KEY_BINDINGS),
      baseKeyBindings: cloneKeyBindingMap(DEFAULT_KEY_BINDINGS),
      keyBindings: cloneKeyBindingMap(DEFAULT_KEY_BINDINGS),
      pressedKeys: new Set(),
      joystickInput: { forward: 0, strafe: 0 },
      isRunning: false,
      victory: false,
      score: 0,
      scoreBreakdown: createScoreBreakdown(),
      scoreSubmitted: false,
      ui: {
        heartsValue: null,
        airValue: null,
        lastAirUnits: null,
        drowningFadeTimeout: null,
        lastDrowningCueAt: -Infinity,
        lastBubblePopAt: -Infinity,
        respawnActive: false,
        respawnCountdownTimeout: null,
        dimensionTransition: null,
        victoryCelebrationVisible: false,
        victoryCelebrationShown: false,
        inventorySortMode: 'default',
        hotbarExpanded: false,
        tarOverlayLevel: 0,
        movementHintDismissed: false,
        movementGlowHintShown: false,
        briefingAcknowledged: false,
        fallbackNoticeShown: false,
      },
      persistence: {
        autoSaveAccumulator: 0,
        lastSerialized: null,
        saving: false,
        pending: false,
        pendingReason: null,
      },
    };

    if (typeof window !== 'undefined') {
      window.__INFINITE_RAILS_STATE__ = state;
      window.InfiniteRails = window.InfiniteRails || {};
      window.InfiniteRails.getState = () => state;
      window.InfiniteRails.getKeyBindings = getKeyBindings;
      window.InfiniteRails.getDefaultKeyBindings = getDefaultKeyBindings;
      window.InfiniteRails.setKeyBinding = (action, keys, options) => setKeyBinding(action, keys, options);
      window.InfiniteRails.setKeyBindings = (overrides, options) => setKeyBindings(overrides, options);
      window.InfiniteRails.resetKeyBindings = (options) => resetKeyBindings(options);
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('infinite-rails:state-ready', { detail: { state } }));
        } catch (error) {
          console.debug('Failed to announce state readiness', error);
        }
      }
    }

    initializeKeyBindings();
    refreshKeyBindingDependentCopy();

    state.player.heartsAtLastDamage = state.player.hearts;

    resetStatusMeterMemory();
    resetTarOverlay();
    initRenderer();
    setupPreviewScene();
    updateScoreOverlay();

    function generateOriginIsland(state) {
      const grid = [];
      for (let y = 0; y < state.height; y++) {
        const row = [];
        for (let x = 0; x < state.width; x++) {
          const dist = Math.hypot(x - state.width / 2, y - state.height / 2);
          if (dist > state.width / 2.1) {
            row.push({ type: 'void', data: {} });
            continue;
          }
          if (Math.random() < 0.08) {
            row.push({ type: 'water', data: {} });
            continue;
          }
          const tile = { type: 'grass', data: {} };
          if (Math.random() < 0.12) {
            tile.type = 'tree';
            tile.resource = 'wood';
            tile.data = { yield: 3 };
          } else if (Math.random() < 0.06) {
            tile.type = 'stone';
            tile.resource = 'stone';
            tile.data = { yield: 2 };
          } else if (Math.random() < 0.04) {
            tile.type = 'rock';
            tile.resource = 'rock';
            tile.data = { yield: 1 };
          }
          row.push(tile);
        }
        grid.push(row);
      }
      placeStructure(grid, createRailLoop(state));
      return grid;
    }

    function generateRockCanyon(state) {
      const grid = [];
      for (let y = 0; y < state.height; y++) {
        const row = [];
        for (let x = 0; x < state.width; x++) {
          const tile = { type: 'canyon', data: {} };
          if (Math.random() < 0.14) {
            tile.type = 'stone';
            tile.resource = 'rock';
            tile.data = { yield: 2 };
          }
          if (Math.random() < 0.08) {
            tile.data.slope = choose([
              { dx: 1, dy: 0 },
              { dx: -1, dy: 0 },
              { dx: 0, dy: 1 },
            ]);
          }
          row.push(tile);
        }
        grid.push(row);
      }
      placeStructure(grid, createResourceCluster('ore', 3));
      return grid;
    }

    function generateStonePattern(state) {
      const grid = [];
      for (let y = 0; y < state.height; y++) {
        const row = [];
        for (let x = 0; x < state.width; x++) {
          const tile = { type: 'rail', data: { phase: (x + y) % 2 } };
          if (Math.random() < 0.1) {
            tile.type = 'crystal';
            tile.resource = 'pattern-crystal';
            tile.walkable = true;
          }
          row.push(tile);
        }
        grid.push(row);
      }
      return grid;
    }

    function generateTarBog(state) {
      const grid = [];
      for (let y = 0; y < state.height; y++) {
        const row = [];
        for (let x = 0; x < state.width; x++) {
          const tile = { type: 'tar', data: {} };
          if (Math.random() < 0.1) {
            tile.type = 'lava';
            tile.hazard = true;
          }
          if (Math.random() < 0.05) {
            tile.type = 'tar';
            tile.resource = 'tar';
            tile.data = { yield: 2 };
          }
          row.push(tile);
        }
        grid.push(row);
      }
      return grid;
    }

    function generateMarbleGarden(state) {
      const grid = [];
      for (let y = 0; y < state.height; y++) {
        const row = [];
        for (let x = 0; x < state.width; x++) {
          const tile = { type: 'marble', data: {} };
          if ((x + y) % 3 === 0) {
            tile.type = 'marbleEcho';
          }
          if (Math.random() < 0.08) {
            tile.resource = 'marble';
            tile.data = { yield: 1 };
          }
          row.push(tile);
        }
        grid.push(row);
      }
      return grid;
    }

    function generateNetheriteCollapse(state) {
      const grid = [];
      for (let y = 0; y < state.height; y++) {
        const row = [];
        for (let x = 0; x < state.width; x++) {
          const tile = { type: 'rail', data: { phase: 0 } };
          if (Math.random() < 0.12) {
            tile.type = 'netherite';
            tile.resource = 'netherite';
            tile.data = { yield: 1 };
          }
          if (Math.random() < 0.08) {
            tile.type = 'lava';
            tile.hazard = true;
          }
          row.push(tile);
        }
        grid.push(row);
      }
      const chestY = Math.floor(state.height / 2);
      const chestX = state.width - 3;
      if (grid[chestY]) {
        grid[chestY][chestX] = { type: 'chest', resource: 'chest', data: { loot: 'eternal-ingot', locked: false } };
        if (grid[chestY][chestX - 1]) grid[chestY][chestX - 1] = { type: 'rail', data: { phase: 0 } };
        if (grid[chestY][chestX - 2]) grid[chestY][chestX - 2] = { type: 'rail', data: { phase: 1 } };
      }
      return grid;
    }

    function placeStructure(grid, structure) {
      if (!structure) return;
      const { tiles, width, height } = structure;
      const maxX = grid[0].length - width - 1;
      const maxY = grid.length - height - 1;
      const startX = Math.floor(Math.random() * Math.max(maxX, 1));
      const startY = Math.floor(Math.random() * Math.max(maxY, 1));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tile = tiles[y][x];
          if (!tile) continue;
          grid[startY + y][startX + x] = tile;
        }
      }
    }

    function createRailLoop(state) {
      const width = 6;
      const height = 4;
      const tiles = Array.from({ length: height }, () => Array(width).fill(null));
      for (let x = 0; x < width; x++) {
        tiles[0][x] = { type: 'rail', data: { phase: x % 2 } };
        tiles[height - 1][x] = { type: 'rail', data: { phase: (x + 1) % 2 } };
      }
      for (let y = 0; y < height; y++) {
        tiles[y][0] = { type: 'rail', data: { phase: y % 2 } };
        tiles[y][width - 1] = { type: 'rail', data: { phase: (y + 1) % 2 } };
      }
      tiles[1][2] = { type: 'chest', resource: 'chest', data: { locked: true, required: 'rail-key' } };
      return { tiles, width, height };
    }

    function createResourceCluster(type, size = 4) {
      const tiles = [];
      const width = size + 2;
      const height = size + 2;
      for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
            row.push({ type: 'canyon', data: {} });
          } else {
            row.push({ type, resource: 'spark-crystal', data: { yield: 1 } });
          }
        }
        tiles.push(row);
      }
      return { tiles, width, height };
    }

    function choose(list) {
      return list[Math.floor(Math.random() * list.length)];
    }

    function clamp(val, min, max) {
      return Math.max(min, Math.min(max, val));
    }

    function createScoreBreakdown() {
      const breakdown = {
        recipes: new Set(),
        dimensions: new Set(),
      };
      scoreState.recipes = breakdown.recipes;
      scoreState.dimensions = breakdown.dimensions;
      scoreState.score = 0;
      return breakdown;
    }

    function resetScoreTracking(options = {}) {
      state.scoreBreakdown = createScoreBreakdown();
      state.score = 0;
      resetObjectiveProgress();
      updateScoreOverlay(options);
    }

    function ensureArrayOfStrings(value, { unique = true } = {}) {
      if (!Array.isArray(value)) return [];
      const seen = new Set();
      const output = [];
      value.forEach((entry) => {
        if (typeof entry !== 'string') return;
        const trimmed = entry.trim();
        if (!trimmed) return;
        if (unique) {
          if (seen.has(trimmed)) return;
          seen.add(trimmed);
        }
        output.push(trimmed);
      });
      return output;
    }

    function normalizeProgressSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') {
        return null;
      }
      const normalized = {
        version: Number.isInteger(snapshot.version) ? snapshot.version : 1,
        updatedAt: typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : new Date().toISOString(),
        score: {},
        recipes: {},
        dimensions: {},
        inventory: {},
        player: {},
      };

      const knownRecipes = ensureArrayOfStrings(snapshot.recipes?.known ?? []);
      if (!knownRecipes.includes('stick')) knownRecipes.push('stick');
      if (!knownRecipes.includes('stone-pickaxe')) knownRecipes.push('stone-pickaxe');
      normalized.recipes.known = knownRecipes;

      const masteredRecipes = ensureArrayOfStrings(snapshot.recipes?.mastered ?? []).filter((id) =>
        knownRecipes.includes(id)
      );
      normalized.recipes.mastered = masteredRecipes;

      const activeSequence = ensureArrayOfStrings(snapshot.recipes?.active ?? [], { unique: false });
      if (activeSequence.length) {
        normalized.recipes.active = activeSequence.slice(0, MAX_CRAFT_SLOTS);
      }

      const unlockedDimensions = ensureArrayOfStrings(snapshot.dimensions?.unlocked ?? []);
      if (!unlockedDimensions.includes('origin')) unlockedDimensions.push('origin');
      normalized.dimensions.unlocked = unlockedDimensions;

      const documentedDimensions = ensureArrayOfStrings(snapshot.dimensions?.documented ?? []).filter((id) =>
        unlockedDimensions.includes(id)
      );
      normalized.dimensions.documented = documentedDimensions;

      const history = ensureArrayOfStrings(snapshot.dimensions?.history ?? [], { unique: false });
      if (!history.length) history.push('origin');
      normalized.dimensions.history = history;

      const currentDimension = snapshot.dimensions?.current;
      normalized.dimensions.current = typeof currentDimension === 'string' && DIMENSIONS[currentDimension]
        ? currentDimension
        : 'origin';

      const slotCount = Array.isArray(state.player?.inventory) ? state.player.inventory.length : 10;
      const slots = Array.from({ length: slotCount }, (_, index) => {
        const slot = Array.isArray(snapshot.inventory?.slots) ? snapshot.inventory.slots[index] : null;
        if (!slot || typeof slot !== 'object') return null;
        const item = typeof slot.item === 'string' ? slot.item : null;
        const quantity = Number(slot.quantity);
        if (!item || !Number.isFinite(quantity) || quantity <= 0) return null;
        return { item, quantity: Math.max(1, Math.floor(quantity)) };
      });
      normalized.inventory.slots = slots;

      const satchel = Array.isArray(snapshot.inventory?.satchel) ? snapshot.inventory.satchel : [];
      normalized.inventory.satchel = satchel
        .map((bundle) => {
          if (!bundle || typeof bundle !== 'object') return null;
          const item = typeof bundle.item === 'string' ? bundle.item : null;
          const quantity = Number(bundle.quantity);
          if (!item || !Number.isFinite(quantity) || quantity <= 0) return null;
          return { item, quantity: Math.max(1, Math.floor(quantity)) };
        })
        .filter(Boolean);

      const selectedSlot = Number(snapshot.inventory?.selectedSlot);
      normalized.inventory.selectedSlot = Number.isInteger(selectedSlot) && selectedSlot >= 0 ? selectedSlot : 0;

      normalized.player.hasIgniter = Boolean(snapshot.player?.hasIgniter);

      const recipeScore = masteredRecipes.length * SCORE_POINTS.recipe;
      const dimensionScore = documentedDimensions.length * SCORE_POINTS.dimension;
      normalized.score = {
        recipes: recipeScore,
        dimensions: dimensionScore,
        total: recipeScore + dimensionScore,
      };

      return normalized;
    }

    function createProgressSnapshot() {
      const snapshot = {
        version: 1,
        updatedAt: new Date().toISOString(),
        recipes: {
          known: Array.from(state.knownRecipes ?? []),
          mastered: Array.from(state.scoreBreakdown?.recipes ?? []),
        },
        dimensions: {
          current: state.dimension?.id ?? 'origin',
          unlocked: Array.from(state.unlockedDimensions ?? []),
          history: Array.isArray(state.dimensionHistory) ? state.dimensionHistory.slice() : ['origin'],
          documented: Array.from(state.scoreBreakdown?.dimensions ?? []),
        },
        inventory: {
          slots: Array.isArray(state.player?.inventory)
            ? state.player.inventory.map((slot) => (slot ? { item: slot.item, quantity: slot.quantity } : null))
            : [],
          satchel: Array.isArray(state.player?.satchel)
            ? state.player.satchel
                .map((bundle) =>
                  bundle && bundle.item && Number.isFinite(bundle.quantity)
                    ? { item: bundle.item, quantity: bundle.quantity }
                    : null
                )
                .filter(Boolean)
            : [],
          selectedSlot: state.player?.selectedSlot ?? 0,
        },
        player: {
          hasIgniter: Boolean(state.player?.hasIgniter),
        },
      };
      const craftedCount = snapshot.recipes.mastered.length;
      const documentedCount = snapshot.dimensions.documented.length;
      snapshot.score = {
        recipes: craftedCount * SCORE_POINTS.recipe,
        dimensions: documentedCount * SCORE_POINTS.dimension,
        total: craftedCount * SCORE_POINTS.recipe + documentedCount * SCORE_POINTS.dimension,
      };
      if (Array.isArray(state.craftSequence) && state.craftSequence.length) {
        snapshot.recipes.active = state.craftSequence
          .slice(0, MAX_CRAFT_SLOTS)
          .map((item) => (typeof item === 'string' ? item : null))
          .filter(Boolean);
      }
      return snapshot;
    }

    function persistProgressLocally(serialized) {
      if (!window.localStorage) return;
      try {
        if (serialized) {
          localStorage.setItem(PROGRESS_STORAGE_KEY, serialized);
        }
      } catch (error) {
        console.warn('Unable to persist progress locally.', error);
      }
    }

    function readPersistedProgress() {
      if (!window.localStorage) return null;
      try {
        const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return { snapshot: normalizeProgressSnapshot(parsed), serialized: raw };
      } catch (error) {
        console.warn('Unable to load saved progress snapshot.', error);
        return null;
      }
    }

    function setPendingProgressSnapshot(snapshot, source = 'local') {
      const normalized = normalizeProgressSnapshot(snapshot);
      if (!normalized) return;
      pendingProgressSnapshot = normalized;
      pendingProgressSource = source;
    }

    function consumePendingProgressSnapshot() {
      if (!pendingProgressSnapshot) return null;
      const payload = {
        snapshot: pendingProgressSnapshot,
        source: pendingProgressSource || 'local',
      };
      pendingProgressSnapshot = null;
      pendingProgressSource = null;
      return payload;
    }

    function flagProgressDirty(reason = 'auto') {
      if (!state.persistence) return;
      state.persistence.pendingReason = reason;
      state.persistence.autoSaveAccumulator = PROGRESS_AUTOSAVE_INTERVAL_SECONDS;
    }

    function updateAutoSave(delta) {
      if (!state.persistence) return;
      state.persistence.autoSaveAccumulator = (state.persistence.autoSaveAccumulator ?? 0) + delta;
      if (state.persistence.autoSaveAccumulator >= PROGRESS_AUTOSAVE_INTERVAL_SECONDS) {
        state.persistence.autoSaveAccumulator = 0;
        const reason = state.persistence.pendingReason || 'auto';
        state.persistence.pendingReason = null;
        queueProgressSave(reason);
      }
    }

    function queueProgressSave(reason = 'auto') {
      if (!state.persistence) return;
      if (state.persistence.saving) {
        state.persistence.pending = true;
        state.persistence.pendingReason = reason;
        return;
      }
      state.persistence.saving = true;
      saveProgress(reason)
        .catch((error) => {
          console.warn('Failed to persist progress snapshot.', error);
        })
        .finally(() => {
          state.persistence.saving = false;
          if (state.persistence.pending) {
            const nextReason = state.persistence.pendingReason || 'auto';
            state.persistence.pending = false;
            state.persistence.pendingReason = null;
            queueProgressSave(nextReason);
          }
        });
    }

    async function saveProgress(reason = 'auto') {
      if (!state) return;
      const snapshot = createProgressSnapshot();
      const serialized = JSON.stringify(snapshot);
      if (serialized === state.persistence.lastSerialized) {
        return;
      }
      persistProgressLocally(serialized);
      state.persistence.lastSerialized = serialized;
      state.persistence.lastSaveReason = reason;
      if (identityState.googleProfile) {
        await syncUserMetadata({ includeProgress: true, progressSnapshot: snapshot, reason });
      }
    }

    function applyProgressSnapshotToState(snapshot, { source = 'local', announce = false } = {}) {
      const normalized = normalizeProgressSnapshot(snapshot);
      if (!normalized) return false;
      state.unlockedDimensions = new Set(normalized.dimensions.unlocked);
      state.dimensionHistory = normalized.dimensions.history.slice();
      state.scoreBreakdown.recipes.clear();
      normalized.recipes.mastered.forEach((id) => state.scoreBreakdown.recipes.add(id));
      state.scoreBreakdown.dimensions.clear();
      normalized.dimensions.documented.forEach((id) => state.scoreBreakdown.dimensions.add(id));
      scoreState.recipes = state.scoreBreakdown.recipes;
      scoreState.dimensions = state.scoreBreakdown.dimensions;
      scoreState.score = normalized.score.total ?? scoreState.score;
      state.score = scoreState.score;
      state.knownRecipes = new Set(normalized.recipes.known);
      state.craftSequence = Array.isArray(normalized.recipes.active)
        ? normalized.recipes.active.slice(0, MAX_CRAFT_SLOTS)
        : [];
      const slotCount = state.player.inventory.length;
      state.player.inventory = Array.from({ length: slotCount }, (_, index) => {
        const slot = normalized.inventory.slots[index];
        return slot ? { item: slot.item, quantity: slot.quantity } : null;
      });
      state.player.satchel = normalized.inventory.satchel.map((bundle) => ({
        item: bundle.item,
        quantity: bundle.quantity,
      }));
      const selectedSlot = normalized.inventory.selectedSlot;
      state.player.selectedSlot = Number.isInteger(selectedSlot)
        ? Math.min(Math.max(selectedSlot, 0), slotCount - 1)
        : 0;
      state.player.hasIgniter = Boolean(normalized.player.hasIgniter);
      updateInventoryUI();
      updateRecipesList();
      updateCraftSequenceDisplay();
      updateAutocompleteSuggestions();
      updateScoreOverlay();
      updatePortalProgress();
      updateDimensionOverlay();
      evaluateObjectiveProgress({ celebrate: false });
      if (announce) {
        logEvent(
          source === 'remote'
            ? 'Synced your cloud progress. Continue where you left off.'
            : 'Restored your saved progress.'
        );
      }
      return true;
    }

    function addItemToInventory(itemId, quantity = 1) {
      const def = ITEM_DEFS[itemId];
      if (!def) return false;
      let changed = false;
      for (let i = 0; i < state.player.inventory.length; i++) {
        const slot = state.player.inventory[i];
        if (slot && slot.item === itemId) {
          const addable = Math.min(quantity, def.stack - slot.quantity);
          if (addable > 0) {
            slot.quantity += addable;
            quantity -= addable;
            changed = true;
          }
        }
        if (quantity === 0) break;
      }
      for (let i = 0; i < state.player.inventory.length && quantity > 0; i++) {
        if (!state.player.inventory[i]) {
          const addable = Math.min(quantity, def.stack);
          state.player.inventory[i] = { item: itemId, quantity: addable };
          quantity -= addable;
          changed = true;
        }
      }
      if (quantity > 0) {
        state.player.satchel.push({ item: itemId, quantity });
        changed = true;
      }
      updateInventoryUI();
      if (changed) {
        flagProgressDirty('inventory');
      }
      return true;
    }

    function removeItem(itemId, quantity = 1) {
      let changed = false;
      for (let i = 0; i < state.player.inventory.length; i++) {
        const slot = state.player.inventory[i];
        if (!slot || slot.item !== itemId) continue;
        const removable = Math.min(quantity, slot.quantity);
        slot.quantity -= removable;
        quantity -= removable;
        if (slot.quantity <= 0) {
          state.player.inventory[i] = null;
        }
        if (removable > 0) {
          changed = true;
        }
        if (quantity === 0) break;
      }
      if (quantity === 0) {
        updateInventoryUI();
        if (changed) {
          flagProgressDirty('inventory');
        }
        return true;
      }
      for (let i = 0; i < state.player.satchel.length && quantity > 0; i++) {
        const bundle = state.player.satchel[i];
        if (bundle.item !== itemId) continue;
        const removable = Math.min(quantity, bundle.quantity);
        bundle.quantity -= removable;
        quantity -= removable;
        if (bundle.quantity <= 0) {
          state.player.satchel.splice(i, 1);
          i--;
        }
        if (removable > 0) {
          changed = true;
        }
      }
      updateInventoryUI();
      if (changed) {
        flagProgressDirty('inventory');
      }
      return quantity === 0;
    }

    function hasItem(itemId, quantity = 1) {
      let total = 0;
      for (const slot of state.player.inventory) {
        if (slot?.item === itemId) total += slot.quantity;
      }
      for (const bundle of state.player.satchel) {
        if (bundle.item === itemId) total += bundle.quantity;
      }
      return total >= quantity;
    }

    function getHotbarSlotIndexFromElement(element) {
      if (!(element instanceof HTMLElement)) return null;
      const raw = element.dataset?.hotbarSlot ?? element.dataset?.slotIndex ?? '-1';
      const index = Number.parseInt(raw, 10);
      if (!Number.isInteger(index) || index < 0 || index >= state.player.inventory.length) {
        return null;
      }
      return index;
    }

    function swapHotbarSlots(fromIndex, toIndex) {
      if (fromIndex === toIndex) return false;
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return false;
      if (fromIndex < 0 || toIndex < 0) return false;
      if (fromIndex >= state.player.inventory.length || toIndex >= state.player.inventory.length) return false;
      const slots = state.player.inventory;
      const fromSlot = slots[fromIndex] ?? null;
      const toSlot = slots[toIndex] ?? null;
      slots[fromIndex] = toSlot;
      slots[toIndex] = fromSlot;
      const selected = state.player.selectedSlot;
      if (selected === fromIndex) {
        state.player.selectedSlot = toIndex;
      } else if (selected === toIndex) {
        state.player.selectedSlot = fromIndex;
      }
      flagProgressDirty('inventory');
      updateInventoryUI();
      return true;
    }

    function clearHotbarDragIndicators() {
      if (!hotbarEl) return;
      hotbarEl
        .querySelectorAll('.inventory-slot.dragging, .inventory-slot.drag-over')
        .forEach((node) => node.classList.remove('dragging', 'drag-over'));
    }

    function handleHotbarDragStart(event) {
      const target = event.currentTarget;
      const index = getHotbarSlotIndexFromElement(target);
      if (index === null) {
        event.preventDefault();
        return;
      }
      const slot = state.player.inventory[index];
      if (!slot) {
        event.preventDefault();
        return;
      }
      activeHotbarDrag = { from: index };
      target.classList.add('dragging');
      if (event.dataTransfer) {
        try {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(index));
        } catch (error) {
          // Ignore data transfer issues on unsupported platforms.
        }
      }
    }

    function handleHotbarDragEnter(event) {
      if (!activeHotbarDrag) return;
      event.preventDefault();
      event.currentTarget.classList.add('drag-over');
    }

    function handleHotbarDragOver(event) {
      if (!activeHotbarDrag) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    }

    function handleHotbarDragLeave(event) {
      if (!activeHotbarDrag) return;
      const { currentTarget, relatedTarget } = event;
      if (relatedTarget instanceof HTMLElement && currentTarget.contains(relatedTarget)) {
        return;
      }
      currentTarget.classList.remove('drag-over');
    }

    function handleHotbarDragEnd(event) {
      event.currentTarget.classList.remove('dragging');
      clearHotbarDragIndicators();
      activeHotbarDrag = null;
    }

    function handleHotbarDrop(event) {
      if (!activeHotbarDrag) return;
      event.preventDefault();
      const targetIndex = getHotbarSlotIndexFromElement(event.currentTarget);
      let fromIndex = activeHotbarDrag.from;
      if (event.dataTransfer) {
        try {
          const raw = event.dataTransfer.getData('text/plain');
          const parsed = Number.parseInt(raw, 10);
          if (Number.isInteger(parsed)) {
            fromIndex = parsed;
          }
        } catch (error) {
          // Ignore unsupported data transfer operations.
        }
      }
      clearHotbarDragIndicators();
      activeHotbarDrag = null;
      if (fromIndex === null || targetIndex === null) {
        return;
      }
      swapHotbarSlots(fromIndex, targetIndex);
    }

    function updateHotbarExpansionUi() {
      if (!extendedInventoryEl) return;
      const expanded = Boolean(state.ui.hotbarExpanded);
      extendedInventoryEl.dataset.visible = expanded ? 'true' : 'false';
      extendedInventoryEl.setAttribute('aria-hidden', expanded ? 'false' : 'true');
      if (toggleExtendedBtn) {
        toggleExtendedBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        toggleExtendedBtn.textContent = expanded ? 'Collapse Inventory' : 'Expand Inventory';
      }
    }

    function toggleHotbarExpansion(forceValue) {
      if (simpleExperience && typeof simpleExperience.toggleHotbarExpansion === 'function') {
        simpleExperience.toggleHotbarExpansion(forceValue);
        return;
      }
      const nextState = typeof forceValue === 'boolean' ? forceValue : !state.ui.hotbarExpanded;
      state.ui.hotbarExpanded = nextState;
      updateHotbarExpansionUi();
    }

    function updateInventoryUI() {
      if (!hotbarEl) return;
      activeHotbarDrag = null;
      hotbarEl.innerHTML = '';
      state.player.inventory.forEach((slot, index) => {
        const el = document.createElement('div');
        el.className = 'inventory-slot';
        el.dataset.hotbarSlot = String(index);
        if (index === state.player.selectedSlot) el.classList.add('active');
        if (slot) {
          const label = ITEM_DEFS[slot.item]?.name ?? slot.item;
          el.innerHTML = `<span>${label}</span><span class="quantity">${slot.quantity}</span>`;
          el.setAttribute('draggable', 'true');
          el.addEventListener('dragstart', handleHotbarDragStart);
        } else {
          el.innerHTML = '<span>—</span>';
          el.setAttribute('draggable', 'false');
        }
        el.addEventListener('click', () => {
          state.player.selectedSlot = index;
          updateInventoryUI();
        });
        el.addEventListener('dragenter', handleHotbarDragEnter);
        el.addEventListener('dragover', handleHotbarDragOver);
        el.addEventListener('dragleave', handleHotbarDragLeave);
        el.addEventListener('drop', handleHotbarDrop);
        el.addEventListener('dragend', handleHotbarDragEnd);
        hotbarEl.appendChild(el);
      });

      const combined = getInventoryDisplayBundles();
      if (extendedInventoryEl) {
        extendedInventoryEl.innerHTML = '';
        combined.forEach((bundle) => {
          const el = document.createElement('div');
          el.className = 'inventory-slot';
          el.innerHTML = `<span>${ITEM_DEFS[bundle.item]?.name ?? bundle.item}</span><span class="quantity">${bundle.quantity}</span>`;
          el.addEventListener('click', () => addToCraftSequence(bundle.item));
          extendedInventoryEl.appendChild(el);
        });
      }
      updateHotbarExpansionUi();
      updateCraftingInventoryOverlay(combined);
      updateInventoryModalGrid(combined);
      updateInventorySortButtonState();
      updateHandOverlay();
    }

    function updateHandOverlay() {
      if (!handOverlayEl) return;
      const slot = state.player.inventory[state.player.selectedSlot];
      if (!slot) {
        handOverlayEl.dataset.item = 'fist';
        if (handOverlayIcon) {
          handOverlayIcon.setAttribute('data-item', 'fist');
        }
        if (handOverlayLabel) {
          handOverlayLabel.textContent = 'Fist';
        }
        return;
      }
      const itemId = slot.item;
      handOverlayEl.dataset.item = itemId;
      if (handOverlayIcon) {
        handOverlayIcon.setAttribute('data-item', itemId);
      }
      if (handOverlayLabel) {
        handOverlayLabel.textContent = ITEM_DEFS[itemId]?.name ?? itemId;
      }
    }

    function mergeInventory() {
      const map = new Map();
      [...state.player.inventory, ...state.player.satchel].forEach((entry) => {
        if (!entry) return;
        map.set(entry.item, (map.get(entry.item) ?? 0) + entry.quantity);
      });
      return Array.from(map.entries()).map(([item, quantity]) => ({ item, quantity }));
    }

    function getInventoryDisplayBundles() {
      const bundles = mergeInventory();
      if (state.ui.inventorySortMode === 'alpha') {
        bundles.sort((a, b) => {
          const nameA = ITEM_DEFS[a.item]?.name ?? a.item;
          const nameB = ITEM_DEFS[b.item]?.name ?? b.item;
          return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
        });
      }
      return bundles;
    }

    function updateInventoryModalGrid(fromCombined) {
      if (!inventoryGridEl) return;
      const combinedSource = Array.isArray(fromCombined) ? fromCombined : getInventoryDisplayBundles();
      const combined = combinedSource.slice();
      const overflow = Math.max(0, combined.length - 9);
      const bundles = combined.slice(0, 9);
      inventoryGridEl.innerHTML = '';
      bundles.forEach((bundle, index) => {
        if (!bundle) return;
        const { item, quantity } = bundle;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inventory-modal__slot';
        button.setAttribute('data-item-id', item);
        button.setAttribute('data-grid-index', String(index));
        button.setAttribute('role', 'gridcell');
        const name = ITEM_DEFS[item]?.name ?? item;
        button.setAttribute('aria-label', `${name} ×${quantity}`);
        button.innerHTML = `
          <span class="inventory-modal__item-name">${name}</span>
          <span class="inventory-modal__item-quantity">×${quantity}</span>
        `;
        button.addEventListener('pointerdown', (event) => beginInventoryDrag(event, item, quantity));
        button.addEventListener('click', () => {
          if (inventoryClickBypass.has(button)) {
            inventoryClickBypass.delete(button);
            return;
          }
          addToCraftSequence(item);
        });
        inventoryGridEl.appendChild(button);
      });
      for (let i = bundles.length; i < 9; i++) {
        const empty = document.createElement('div');
        empty.className = 'inventory-modal__slot inventory-modal__slot--empty';
        empty.setAttribute('role', 'gridcell');
        empty.setAttribute('aria-label', 'Empty slot');
        empty.innerHTML = '<span class="inventory-modal__item-name">Empty</span>';
        inventoryGridEl.appendChild(empty);
      }
      inventoryGridEl.setAttribute('data-empty', bundles.length === 0 ? 'true' : 'false');
      if (inventoryOverflowEl) {
        if (overflow > 0) {
          const bundleWord = overflow === 1 ? 'bundle' : 'bundles';
          inventoryOverflowEl.textContent = `+${overflow} more ${bundleWord} stored off-grid`;
          inventoryOverflowEl.hidden = false;
        } else {
          inventoryOverflowEl.textContent = '';
          inventoryOverflowEl.hidden = true;
        }
      }
    }

    function updateInventorySortButtonState() {
      if (!inventorySortButton) return;
      const sorted = state.ui.inventorySortMode === 'alpha';
      inventorySortButton.textContent = sorted ? 'Reset Order' : 'Sort (A→Z)';
      inventorySortButton.setAttribute('aria-pressed', sorted ? 'true' : 'false');
    }

    function toggleInventorySortMode() {
      state.ui.inventorySortMode = state.ui.inventorySortMode === 'alpha' ? 'default' : 'alpha';
      updateInventorySortButtonState();
      updateInventoryUI();
    }

    function updateCraftingInventoryOverlay(fromCombined) {
      if (!craftingInventoryEl) return;
      const combined = Array.isArray(fromCombined) ? fromCombined : mergeInventory();
      craftingInventoryEl.innerHTML = '';
      if (!combined.length) {
        const empty = document.createElement('p');
        empty.className = 'crafting-inventory__empty';
        empty.textContent = 'Gather resources to populate your satchel.';
        craftingInventoryEl.appendChild(empty);
        return;
      }
      combined.forEach((bundle) => {
        const { item, quantity } = bundle;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-inventory__item';
        button.setAttribute('data-item-id', item);
        button.innerHTML = `
          <span class="crafting-inventory__item-title">${ITEM_DEFS[item]?.name ?? item}</span>
          <span class="crafting-inventory__item-quantity">Available ×${quantity}</span>
        `;
        button.setAttribute('aria-label', `${ITEM_DEFS[item]?.name ?? item} available ×${quantity}. Drag to sequence or click to add.`);
        button.addEventListener('pointerdown', (event) => beginInventoryDrag(event, item, quantity));
        button.addEventListener('click', () => {
          if (inventoryClickBypass.has(button)) {
            inventoryClickBypass.delete(button);
            return;
          }
          addToCraftSequence(item);
        });
        craftingInventoryEl.appendChild(button);
      });
    }

    function resetStatusMeterMemory() {
      state.ui.heartsValue = state.player.hearts;
      state.ui.airValue = state.player.air;
      state.ui.lastAirUnits = Math.ceil(state.player.air);
    }

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const HEART_ICON_PATH =
      'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
    let heartClipIdCounter = 0;

    function createHeartIcon(fill, index) {
      const clampedFill = clamp(fill, 0, 1);
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('heart-icon');
      svg.style.setProperty('--heart-index', index.toString());

      const defs = document.createElementNS(SVG_NS, 'defs');
      const clipPath = document.createElementNS(SVG_NS, 'clipPath');
      const clipId = `heart-clip-${heartClipIdCounter++}`;
      clipPath.setAttribute('id', clipId);
      clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', (24 * clampedFill).toFixed(2));
      rect.setAttribute('height', '24');
      clipPath.appendChild(rect);
      defs.appendChild(clipPath);
      svg.appendChild(defs);

      const fillPath = document.createElementNS(SVG_NS, 'path');
      fillPath.setAttribute('class', 'heart-icon__fill');
      fillPath.setAttribute('d', HEART_ICON_PATH);
      fillPath.setAttribute('clip-path', `url(#${clipId})`);
      const fillOpacity = clampedFill <= 0 ? 0.2 : clampedFill >= 1 ? 1 : 0.35 + clampedFill * 0.65;
      fillPath.setAttribute('fill-opacity', fillOpacity.toFixed(2));
      svg.appendChild(fillPath);

      const outlinePath = document.createElementNS(SVG_NS, 'path');
      outlinePath.setAttribute('class', 'heart-icon__outline');
      outlinePath.setAttribute('d', HEART_ICON_PATH);
      svg.appendChild(outlinePath);

      if (clampedFill <= 0) {
        svg.classList.add('is-empty');
      } else if (clampedFill < 1) {
        svg.classList.add('is-partial');
      }

      return svg;
    }

    function resetTarOverlay() {
      state.ui.tarOverlayLevel = 0;
      if (!tarOverlayEl) return;
      tarOverlayEl.setAttribute('data-active', 'false');
      tarOverlayEl.style.setProperty('--tar-overlay-strength', '0');
    }

    function updateStatusBars() {
      if (!heartsEl || !bubblesEl || !timeEl) return;

      const previousHearts = state.ui.heartsValue ?? state.player.maxHearts;
      const previousAir = state.ui.airValue ?? state.player.maxAir;

      heartClipIdCounter = 0;

      heartsEl.innerHTML = '';
      heartsEl.classList.add('hud-hearts');
      heartsEl.setAttribute('data-max-hearts', state.player.maxHearts.toString());
      const heartDelta = state.player.hearts - previousHearts;
      heartsEl.classList.toggle('is-damaged', heartDelta < -0.01);
      heartsEl.classList.toggle('is-healing', heartDelta > 0.01);
      const heartCriticalThreshold = Math.max(2, state.player.maxHearts * 0.2);
      heartsEl.classList.toggle('is-critical', state.player.hearts <= heartCriticalThreshold);

      const heartsRow = document.createElement('div');
      heartsRow.className = 'hud-hearts__row';
      for (let i = 0; i < state.player.maxHearts; i++) {
        const fill = clamp(state.player.hearts - i, 0, 1);
        const heartIcon = createHeartIcon(fill, i);
        heartsRow.appendChild(heartIcon);
      }
      heartsEl.appendChild(heartsRow);
      const heartLabelValue = Math.max(0, state.player.hearts);
      const heartLabel = Number.isInteger(heartLabelValue)
        ? heartLabelValue.toString()
        : heartLabelValue.toFixed(1);
      heartsEl.setAttribute('aria-label', `${heartLabel} hearts remaining`);

      bubblesEl.innerHTML = '';
      bubblesEl.classList.add('hud-bubbles');
      bubblesEl.setAttribute('data-max-air', state.player.maxAir.toString());
      const airDelta = state.player.air - previousAir;
      bubblesEl.classList.toggle('is-losing', airDelta < -0.05);
      bubblesEl.classList.toggle('is-gaining', airDelta > 0.05);
      const airLowThreshold = Math.max(2, state.player.maxAir * 0.2);
      bubblesEl.classList.toggle('is-low', state.player.air <= airLowThreshold);
      bubblesEl.classList.toggle('is-drowning', state.player.air <= 0);

      const bubbleFrame = document.createElement('div');
      bubbleFrame.className = 'hud-bubbles__frame';
      const bubbleStack = document.createElement('div');
      bubbleStack.className = 'hud-bubbles__stack';
      for (let i = 0; i < state.player.maxAir; i++) {
        const fill = clamp(state.player.air - i, 0, 1);
        const bubble = document.createElement('span');
        bubble.className = 'bubble-indicator';
        bubble.style.setProperty('--bubble-index', i.toString());
        const opacityLevel = fill <= 0 ? 0.18 : fill >= 1 ? 1 : 0.3 + fill * 0.7;
        bubble.style.setProperty('--opacity-level', opacityLevel.toFixed(2));
        if (fill <= 0) {
          bubble.classList.add('is-empty');
        } else if (fill < 1) {
          bubble.classList.add('is-partial');
        }
        bubbleStack.appendChild(bubble);
      }
      bubbleFrame.appendChild(bubbleStack);
      bubblesEl.appendChild(bubbleFrame);
      const airRemaining = Math.max(0, Math.ceil(state.player.air));
      bubblesEl.setAttribute('aria-label', `${airRemaining} bubbles of air remaining`);

      const cycle = getDayNightMetrics();
      rootElement.style.setProperty('--time-phase', cycle.ratio.toFixed(3));
      const track = document.createElement('div');
      track.className = 'time-track';
      const label = document.createElement('span');
      const phasePercent = cycle.isNight
        ? Math.round(cycle.nightProgress * 100)
        : Math.round(cycle.dayProgress * 100);
      label.textContent = cycle.isNight
        ? `Nightfall ${phasePercent}%`
        : `Daylight ${phasePercent}%`;
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.setProperty('--progress', cycle.ratio.toFixed(3));
      track.append(label, bar);
      timeEl.innerHTML = '';
      timeEl.appendChild(track);

      state.ui.heartsValue = state.player.hearts;
      state.ui.airValue = state.player.air;
      state.ui.lastAirUnits = Math.ceil(state.player.air);
    }

    function updateScoreOverlay(options = {}) {
      if (!scoreTotalEl || !scoreRecipesEl || !scoreDimensionsEl) return;

      initializeScoreOverlayUI();

      let summary = null;
      if (typeof window !== 'undefined' && window.__INFINITE_RAILS_STATE__?.simpleSummary) {
        summary = window.__INFINITE_RAILS_STATE__.simpleSummary;
      }
      let recipeCount = scoreState.recipes.size;
      let dimensionCount = scoreState.dimensions.size;
      let recipePoints = recipeCount * SCORE_POINTS.recipe;
      let dimensionPoints = dimensionCount * SCORE_POINTS.dimension;
      let total = recipePoints + dimensionPoints;

      if (summary) {
        recipeCount = Number.isFinite(summary.recipeCount)
          ? Math.max(0, Math.round(summary.recipeCount))
          : Array.isArray(summary.recipes)
            ? summary.recipes.length
            : recipeCount;
        dimensionCount = Number.isFinite(summary.dimensionCount)
          ? Math.max(0, Math.round(summary.dimensionCount))
          : Array.isArray(summary.dimensions)
            ? summary.dimensions.length
            : dimensionCount;
        recipePoints = recipeCount * SCORE_POINTS.recipe;
        dimensionPoints = dimensionCount * SCORE_POINTS.dimension;
        total = Math.round(summary.score ?? recipePoints + dimensionPoints);
      } else {
        const recalculated = recalculateScoreState();
        recipePoints = recalculated.recipePoints;
        dimensionPoints = recalculated.dimensionPoints;
        total = recalculated.total;
        recipeCount = scoreState.recipes.size;
        dimensionCount = scoreState.dimensions.size;
      }

      animateScoreDigits(scoreTotalEl, total);
      animateMetricUpdate(scoreRecipesEl, `${recipeCount} (+${recipePoints} pts)`);
      animateMetricUpdate(scoreDimensionsEl, `${dimensionCount} (+${dimensionPoints} pts)`);
      if (scorePanelEl) {
        scorePanelEl.setAttribute('data-score', total.toString());
        if (options.triggerFlip) {
          scorePanelEl.classList.add('flip');
          if (scoreFlipTimeout) {
            window.clearTimeout(scoreFlipTimeout);
          }
          scoreFlipTimeout = window.setTimeout(() => {
            scorePanelEl.classList.remove('flip');
            scoreFlipTimeout = null;
          }, 500);
        } else if (!options.triggerFlip && !options.flash) {
          scorePanelEl.classList.remove('flip');
        }
        if (options.flash) {
          scorePanelEl.classList.remove('score-overlay--flash');
          void scorePanelEl.offsetWidth;
          scorePanelEl.classList.add('score-overlay--flash');
        } else {
          scorePanelEl.classList.remove('score-overlay--flash');
        }
      }
    }

    function updateDimensionOverlay() {
      const info = state.dimension;
      if (!info || !dimensionInfoEl) return null;
      const tasks = [];
      if (!state.unlockedDimensions.has('rock')) {
        tasks.push('Craft a Stone Pickaxe and harvest dense rock.');
      } else if (!state.unlockedDimensions.has('stone')) {
        tasks.push('Assemble a Rock portal frame and ignite it.');
      }
      switch (info.id) {
        case 'stone':
          tasks.push('Move with the rhythm – only lit rails are safe.');
          break;
        case 'tar':
          tasks.push('Shake off tar stacks by pausing between strides.');
          break;
        case 'marble':
          tasks.push('Plan ahead. Every action echoes back in five seconds.');
          break;
        case 'netherite':
          tasks.push('Plot a path before rails collapse into the void.');
          break;
        default:
          break;
      }
      if (info.id === 'netherite' && !state.victory) {
        tasks.push('Keep moving! Rails collapse moments after contact.');
      }
      if (state.player.effects.hasEternalIngot) {
        tasks.push('Find your way back to the Grassland Threshold to seal your run.');
      }
      dimensionOverlayState = { info, tasks };
      renderDimensionOverlay(dimensionOverlayState, { animate: true });
      renderGameBriefingSteps();
      const hintKey = `${info.id}:${tasks.join('|')}`;
      if (hintKey !== lastDimensionHintKey) {
        const summary = tasks[0] ?? info.description;
        showPlayerHint(`Now entering ${info.name}. ${summary}`);
        if (state.isRunning) {
          const shouldAutoHide = Boolean(state?.ui?.briefingAcknowledged);
          showGameBriefing({ autoHide: shouldAutoHide });
        }
        lastDimensionHintKey = hintKey;
      }
      return dimensionOverlayState;
    }

    function getCodexStatus(dimId) {
      if (!state.unlockedDimensions.has(dimId)) return 'Locked';
      if (dimId === 'origin' && state.victory) return 'Return';
      if (dimId === 'netherite' && state.player.effects.hasEternalIngot && !state.victory) return 'Ingot';
      if (state.dimension.id === dimId) return 'Active';
      if (state.dimensionHistory.includes(dimId)) return 'Cleared';
      return 'Ready';
    }

    function updateDimensionCodex() {
      if (!codexListEl) return;
      codexListEl.innerHTML = '';
      DIMENSION_SEQUENCE.forEach((dimId) => {
        const dim = DIMENSIONS[dimId];
        const item = document.createElement('li');
        item.className = 'codex-item';
        if (dimId === 'netherite') item.classList.add('final');
        if (!state.unlockedDimensions.has(dimId)) item.classList.add('locked');
        if (state.dimensionHistory.includes(dimId) && dimId !== state.dimension.id) item.classList.add('complete');
        if (state.dimension.id === dimId) item.classList.add('active');
        const label = document.createElement('strong');
        label.textContent = dim?.name ?? dimId;
        const status = document.createElement('span');
        status.textContent = getCodexStatus(dimId).toUpperCase();
        item.title = dim?.description ?? dimId;
        item.append(label, status);
        codexListEl.appendChild(item);
      });
    }

    function renderVictoryBanner() {
      if (!victoryBannerEl) return;
      if (state.victory && state.dimension?.id === 'origin' && hasItem('eternal-ingot')) {
        victoryBannerEl.innerHTML = `
          <h3>Victory Achieved</h3>
          <p>Share your triumph or continue charting the multiverse.</p>
        `;
        victoryBannerEl.classList.add('visible');
        return;
      }
      if (state.player.effects.hasEternalIngot) {
        victoryBannerEl.innerHTML = `
          <h3>Eternal Ingot Secured</h3>
          <p>Stabilise a return portal and step back to origin.</p>
        `;
        victoryBannerEl.classList.add('visible');
        return;
      }
      victoryBannerEl.classList.remove('visible');
      victoryBannerEl.innerHTML = '';
    }

    function shouldReduceMotion() {
      return Boolean(reduceMotionQuery?.matches);
    }

    function clearVictoryFireworkTimeouts() {
      victoryFireworkTimeouts.forEach((handle) => window.clearTimeout(handle));
      victoryFireworkTimeouts.clear();
    }

    function scheduleVictoryFireworkSpawn(delay = 0) {
      const handle = window.setTimeout(() => {
        spawnVictoryFirework();
        victoryFireworkTimeouts.delete(handle);
      }, delay);
      victoryFireworkTimeouts.add(handle);
    }

    function spawnVictoryFirework() {
      if (!victoryFireworksEl) return;
      const firework = document.createElement('span');
      firework.className = 'victory-firework';
      const hue = Math.floor(Math.random() * 360);
      const left = 18 + Math.random() * 64;
      const duration = 1.65 + Math.random() * 0.65;
      const delay = Math.random() * 0.35;
      const travel = -34 - Math.random() * 32;
      firework.style.setProperty('--hue', `${hue}`);
      firework.style.setProperty('--left', `${left}%`);
      firework.style.setProperty('--duration', `${duration}s`);
      firework.style.setProperty('--delay', `${delay}s`);
      firework.style.setProperty('--travel', `${travel}vh`);
      const burst = document.createElement('span');
      burst.className = 'victory-firework__burst';
      firework.appendChild(burst);
      victoryFireworksEl.appendChild(firework);
      const burstDelay = Math.max((delay + duration - 0.3) * 1000, 0);
      const removeDelay = (delay + duration + 1.8) * 1000;
      const burstHandle = window.setTimeout(() => {
        firework.classList.add('burst');
        victoryFireworkTimeouts.delete(burstHandle);
      }, burstDelay);
      const removeHandle = window.setTimeout(() => {
        firework.remove();
        victoryFireworkTimeouts.delete(removeHandle);
      }, removeDelay);
      victoryFireworkTimeouts.add(burstHandle);
      victoryFireworkTimeouts.add(removeHandle);
    }

    function startVictoryFireworks() {
      if (!victoryFireworksEl || shouldReduceMotion()) return;
      stopVictoryFireworks();
      for (let i = 0; i < 3; i++) {
        scheduleVictoryFireworkSpawn(i * 200);
      }
      victoryFireworksInterval = window.setInterval(() => {
        spawnVictoryFirework();
        scheduleVictoryFireworkSpawn(220 + Math.random() * 180);
      }, 1400);
    }

    function stopVictoryFireworks() {
      if (victoryFireworksInterval) {
        window.clearInterval(victoryFireworksInterval);
        victoryFireworksInterval = null;
      }
      clearVictoryFireworkTimeouts();
      if (victoryFireworksEl) {
        victoryFireworksEl.innerHTML = '';
      }
    }

    function stopVictoryCheerFallbacks() {
      if (victoryCheerFallbackInterval) {
        window.clearInterval(victoryCheerFallbackInterval);
        victoryCheerFallbackInterval = null;
      }
      victoryCheerFallbackTimeouts.forEach((handle) => window.clearTimeout(handle));
      victoryCheerFallbackTimeouts.clear();
    }

    function triggerVictoryCheerFallbackSequence() {
      playFallbackEffect({ startFreq: 680, endFreq: 980, duration: 0.45, type: 'sine', peak: 0.16 });
      const accentHandle = window.setTimeout(() => {
        playFallbackEffect({ startFreq: 820, endFreq: 620, duration: 0.42, type: 'triangle', peak: 0.14 });
        victoryCheerFallbackTimeouts.delete(accentHandle);
      }, 240);
      victoryCheerFallbackTimeouts.add(accentHandle);
    }

    function startVictoryCheer() {
      stopVictoryCheerFallbacks();
      if (audioState.effects?.victoryCheer) {
        try {
          const howl = audioState.effects.victoryCheer;
          if (window.Howler?.ctx?.state === 'suspended') {
            window.Howler.ctx.resume().catch(() => {});
          }
          if (!howl.playing()) {
            howl.play();
          }
        } catch (error) {
          console.warn('Unable to play victory cheer effect.', error);
        }
        return;
      }
      triggerVictoryCheerFallbackSequence();
      victoryCheerFallbackInterval = window.setInterval(triggerVictoryCheerFallbackSequence, 760);
    }

    function stopVictoryCheer() {
      if (audioState.effects?.victoryCheer) {
        try {
          audioState.effects.victoryCheer.stop();
        } catch (error) {
          console.warn('Unable to stop victory cheer effect.', error);
        }
      }
      stopVictoryCheerFallbacks();
    }

    function spawnVictoryConfettiBurst(count = 48) {
      if (!victoryConfettiEl) return;
      const colors = ['#49f2ff', '#f7b733', '#2bc26b', '#ff4976', '#d66bff', '#fff072'];
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < count; i++) {
        const piece = document.createElement('span');
        piece.className = 'victory-confetti__piece';
        const x = Math.random() * 100;
        const offset = (Math.random() * 60 - 30).toFixed(1);
        const duration = 2.3 + Math.random() * 1.5;
        const delay = Math.random() * 0.6;
        const rotation = Math.random() * 720 - 360;
        piece.style.setProperty('--x', `${x}%`);
        piece.style.setProperty('--offset-x', `${offset}vw`);
        piece.style.setProperty('--duration', `${duration}s`);
        piece.style.setProperty('--delay', `${delay}s`);
        piece.style.setProperty('--rotation', `${rotation}deg`);
        piece.style.setProperty('--color', colors[i % colors.length]);
        piece.addEventListener('animationend', () => {
          piece.remove();
        });
        fragment.appendChild(piece);
      }
      victoryConfettiEl.appendChild(fragment);
    }

    function startVictoryConfetti() {
      if (!victoryConfettiEl || shouldReduceMotion()) return;
      stopVictoryConfetti();
      spawnVictoryConfettiBurst();
      victoryConfettiInterval = window.setInterval(() => {
        spawnVictoryConfettiBurst(26 + Math.floor(Math.random() * 18));
      }, 1200);
    }

    function stopVictoryConfetti() {
      if (victoryConfettiInterval) {
        window.clearInterval(victoryConfettiInterval);
        victoryConfettiInterval = null;
      }
      if (victoryConfettiEl) {
        victoryConfettiEl.innerHTML = '';
      }
    }

    function formatOrdinal(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return String(value);
      }
      const rounded = Math.round(number);
      const mod100 = rounded % 100;
      if (mod100 >= 11 && mod100 <= 13) {
        return `${rounded}th`;
      }
      const mod10 = rounded % 10;
      switch (mod10) {
        case 1:
          return `${rounded}st`;
        case 2:
          return `${rounded}nd`;
        case 3:
          return `${rounded}rd`;
        default:
          return `${rounded}th`;
      }
    }

    function updateVictoryCelebrationStats(snapshot) {
      if (!victoryStatsEl) return;
      const runtimeLabel = formatRunTime(snapshot.runTimeSeconds);
      const displayRuntime = runtimeLabel === '—' ? '0s' : runtimeLabel;
      const inventoryWord = snapshot.inventoryCount === 1 ? 'artifact' : 'artifacts';
      const playerRankValue = Number.isFinite(identityState.playerRank) ? identityState.playerRank : null;
      const totalEntriesRaw = Number.isFinite(identityState.scoreboardTotal)
        ? identityState.scoreboardTotal
        : identityState.scoreboard.length;
      const totalEntries = Math.max(0, Number(totalEntriesRaw) || 0);
      let rankDisplay = null;
      if (playerRankValue) {
        const ordinal = formatOrdinal(playerRankValue);
        if (totalEntries && playerRankValue <= totalEntries) {
          rankDisplay = totalEntries ? `${ordinal} of ${totalEntries}` : ordinal;
        } else if (totalEntries) {
          const visibleCount = identityState.scoreboard?.length || Math.min(totalEntries, 10);
          rankDisplay = `${ordinal} (Top ${visibleCount} shown)`;
        } else {
          rankDisplay = ordinal;
        }
      } else if (identityState.googleProfile) {
        rankDisplay = identityState.loadingScores ? 'Syncing…' : 'Awaiting leaderboard sync';
      } else {
        rankDisplay = 'Sign in to publish';
      }
      victoryStatsEl.innerHTML = `
        <div>
          <dt>Final Score</dt>
          <dd>${formatScoreNumber(snapshot.score ?? 0)}</dd>
        </div>
        <div>
          <dt>Leaderboard Rank</dt>
          <dd>${rankDisplay}</dd>
        </div>
        <div>
          <dt>Dimensions Stabilised</dt>
          <dd>${snapshot.dimensionCount ?? 0}</dd>
        </div>
        <div>
          <dt>Run Time</dt>
          <dd>${displayRuntime}</dd>
        </div>
        <div>
          <dt>Artifacts Secured</dt>
          <dd>${snapshot.inventoryCount ?? 0} ${inventoryWord}</dd>
        </div>
      `;
    }

    function getVictoryShareDetails(snapshot) {
      const scoreLabel = formatScoreNumber(snapshot.score ?? 0);
      const dimensionWord = snapshot.dimensionCount === 1 ? 'dimension' : 'dimensions';
      const runtimeLabel = formatRunTime(snapshot.runTimeSeconds);
      const displayRuntime = runtimeLabel === '—' ? `${Math.max(0, Math.round(snapshot.runTimeSeconds ?? 0))}s` : runtimeLabel;
      const inventoryWord = snapshot.inventoryCount === 1 ? 'artifact' : 'artifacts';
      const playerName = identityState.displayName ?? 'Guest Explorer';
      const url = `${window.location.origin}${window.location.pathname}`;
      const text = `${playerName} returned with the Eternal Ingot in Infinite Dimension — ${scoreLabel} pts, ${snapshot.dimensionCount} ${dimensionWord}, ${displayRuntime}, ${snapshot.inventoryCount} ${inventoryWord}. Can you beat this run?`;
      return {
        title: 'Infinite Dimension Victory',
        text,
        url,
        fallbackText: `${text} ${url}`,
      };
    }

    function handleVictoryKeydown(event) {
      const code = normaliseEventCode(event.code || '', event.key);
      if (isKeyForAction('closeMenus', code)) {
        event.preventDefault();
        dismissVictoryCelebration();
      }
    }

    function openVictoryCelebration() {
      if (!victoryCelebrationEl) return;
      if (state.ui.victoryCelebrationVisible) return;
      if (victoryHideTimeout) {
        window.clearTimeout(victoryHideTimeout);
        victoryHideTimeout = null;
      }
      const snapshot = computeScoreSnapshot();
      updateVictoryCelebrationStats(snapshot);
      latestVictoryShareDetails = getVictoryShareDetails(snapshot);
      const signedIn = Boolean(identityState.googleProfile);
      if (victoryMessageEl) {
        victoryMessageEl.textContent = signedIn
          ? 'Your run has been archived on the multiverse scoreboard. Share the legend or dive back in for hidden secrets.'
          : 'Sign in to immortalise this run on the multiverse scoreboard, then share the legend or dive back in for hidden secrets.';
      }
      if (victoryShareStatusEl) {
        victoryShareStatusEl.textContent = signedIn
          ? 'Score synced to the multiverse ledger.'
          : 'Score not yet published—sign in to broadcast it to the multiverse leaderboard.';
      }
      if (victoryShareButton) {
        victoryShareButton.textContent = navigator.share ? 'Share your run' : 'Copy share message';
      }
      previousVictoryFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      victoryCelebrationEl.hidden = false;
      victoryCelebrationEl.setAttribute('aria-hidden', 'false');
      victoryCelebrationEl.classList.add('active');
      document.body?.classList.add('victory-celebration-active');
      startVictoryConfetti();
      startVictoryFireworks();
      startVictoryCheer();
      state.ui.victoryCelebrationVisible = true;
      state.ui.victoryCelebrationShown = true;
      document.addEventListener('keydown', handleVictoryKeydown, true);
      if (victoryShareButton) {
        window.setTimeout(() => {
          victoryShareButton.focus({ preventScroll: true });
        }, 90);
      }
    }

    function dismissVictoryCelebration(options = {}) {
      const { reset = false, immediate = false } = options;
      if (!victoryCelebrationEl) {
        if (reset) {
          state.ui.victoryCelebrationShown = false;
        }
        latestVictoryShareDetails = null;
        return;
      }
      if (!state.ui.victoryCelebrationVisible && !reset) {
        return;
      }
      document.removeEventListener('keydown', handleVictoryKeydown, true);
      state.ui.victoryCelebrationVisible = false;
      if (reset) {
        state.ui.victoryCelebrationShown = false;
      }
      stopVictoryConfetti();
      stopVictoryFireworks();
      stopVictoryCheer();
      document.body?.classList.remove('victory-celebration-active');
      victoryCelebrationEl.classList.remove('active');
      victoryCelebrationEl.setAttribute('aria-hidden', 'true');
      if (victoryShareStatusEl) {
        victoryShareStatusEl.textContent = '';
      }
      latestVictoryShareDetails = null;
      if (victoryHideTimeout) {
        window.clearTimeout(victoryHideTimeout);
        victoryHideTimeout = null;
      }
      if (immediate) {
        victoryCelebrationEl.hidden = true;
      } else {
        victoryHideTimeout = window.setTimeout(() => {
          if (!state.ui.victoryCelebrationVisible) {
            victoryCelebrationEl.hidden = true;
          }
          victoryHideTimeout = null;
        }, 320);
      }
      const focusTarget = previousVictoryFocus;
      previousVictoryFocus = null;
      if (focusTarget && typeof focusTarget.focus === 'function') {
        window.setTimeout(() => {
          try {
            focusTarget.focus({ preventScroll: true });
          } catch (error) {
            focusTarget.focus();
          }
        }, 150);
      }
    }

    async function copyVictoryShareText(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      let success = false;
      try {
        success = document.execCommand('copy');
      } catch (error) {
        success = false;
      }
      textarea.remove();
      return success;
    }

    async function handleVictoryShareClick() {
      if (!state.victory) {
        if (victoryShareStatusEl) {
          victoryShareStatusEl.textContent = 'Secure the Eternal Ingot and return home to share your run.';
        }
        return;
      }
      const snapshot = computeScoreSnapshot();
      latestVictoryShareDetails = getVictoryShareDetails(snapshot);
      const shareDetails = latestVictoryShareDetails;
      if (victoryShareStatusEl) {
        victoryShareStatusEl.textContent = 'Preparing share message...';
      }
      if (navigator.share) {
        try {
          await navigator.share({ title: shareDetails.title, text: shareDetails.text, url: shareDetails.url });
          if (victoryShareStatusEl) {
            victoryShareStatusEl.textContent = 'Shared! Challenge your crew to beat your run.';
          }
          return;
        } catch (error) {
          if (error?.name === 'AbortError') {
            if (victoryShareStatusEl) {
              victoryShareStatusEl.textContent = 'Share cancelled.';
            }
            return;
          }
          console.warn('Share failed.', error);
        }
      }
      try {
        const copied = await copyVictoryShareText(shareDetails.fallbackText);
        if (victoryShareStatusEl) {
          victoryShareStatusEl.textContent = copied
            ? 'Run details copied to your clipboard.'
            : `Share support unavailable. Copy this message manually: ${shareDetails.fallbackText}`;
        }
      } catch (error) {
        if (victoryShareStatusEl) {
          victoryShareStatusEl.textContent = `Share support unavailable. Copy this message manually: ${shareDetails.fallbackText}`;
        }
      }
    }

    function logEvent(message) {
      const li = document.createElement('li');
      li.textContent = message;
      eventLogEl.prepend(li);
      while (eventLogEl.children.length > 12) {
        eventLogEl.removeChild(eventLogEl.lastChild);
      }
      handleSubtitleFromLog(message);
    }

    function startGame() {
      if (state.isRunning) return;
      const pendingProgress = consumePendingProgressSnapshot();
      const progressSnapshot = pendingProgress?.snapshot ?? null;
      const progressSource = pendingProgress?.source ?? null;
      const startDimensionId =
        progressSnapshot?.dimensions?.current && DIMENSIONS[progressSnapshot.dimensions.current]
          ? progressSnapshot.dimensions.current
          : 'origin';
      const startingWithRestoredProgress = Boolean(progressSnapshot);
      if (!startingWithRestoredProgress) {
        const cycleRatio = THREE.MathUtils.clamp(DEFAULT_DAY_START_RATIO, 0, 0.99);
        state.elapsed = state.dayLength * cycleRatio;
      }
      renderClock.stop();
      renderClock.start();
      renderClock.getDelta();
      teardownPreviewScene();
      resetRendererUniformCaches();
      pendingUniformSanitizations = Math.max(pendingUniformSanitizations, 2);
      rendererRecoveryFrames = Math.max(rendererRecoveryFrames, 1);
      uniformSanitizationFailureStreak = 0;
      const context = ensureAudioContext();
      context?.resume?.().catch(() => {});
      if (window.Howler?.ctx?.state === 'suspended') {
        window.Howler.ctx.resume().catch(() => {});
      }
      setDimensionTransitionOverlay(false);
      state.ui.dimensionTransition = null;
      clearMarbleGhosts();
      if (introModal) {
        introModal.hidden = true;
        introModal.setAttribute('aria-hidden', 'true');
        introModal.style.display = 'none';
      }
      if (startButton) {
        startButton.disabled = true;
        startButton.setAttribute('aria-hidden', 'true');
        startButton.setAttribute('tabindex', '-1');
        startButton.blur();
      }
      hideGameBriefing({ immediate: true });
      canvas?.focus();
      document.body?.classList.add('game-active');
      resetHudInactivityTimer();
      updateLayoutMetrics();
      state.isRunning = true;
      if (state.ui) {
        state.ui.movementHintDismissed = false;
        state.ui.movementGlowHintShown = false;
      }
      state.player.effects = {};
      state.victory = false;
      state.scoreSubmitted = false;
      dismissVictoryCelebration({ reset: true, immediate: true });
      state.dimensionHistory = ['origin'];
      state.unlockedDimensions = new Set(['origin']);
      state.knownRecipes = new Set(['stick', 'stone-pickaxe']);
      resetScoreTracking();
      state.player.inventory = Array.from({ length: 10 }, () => null);
      state.player.satchel = [];
      state.player.selectedSlot = 0;
      state.craftSequence = [];
      ensurePlayerAvatarReady({ forceReload: true, resetAnimations: true });
      renderVictoryBanner();
      loadDimension(startDimensionId);
      if (!startingWithRestoredProgress && state.dayCycle) {
        state.dayCycle.isNight = false;
        state.dayCycle.spawnTimer = ZOMBIE_SPAWN_INTERVAL;
        state.dayCycle.waveCount = 0;
      }
      resetStatusMeterMemory();
      if (progressSnapshot) {
        applyProgressSnapshotToState(progressSnapshot, {
          source: progressSource || 'local',
          announce: progressSource === 'remote',
        });
      } else {
        updateInventoryUI();
        updateRecipesList();
        updateCraftSequenceDisplay();
        updateAutocompleteSuggestions();
        addItemToInventory('wood', 2);
        addItemToInventory('stone', 1);
      }
      updateStatusBars();
      updateDimensionOverlay();
      // Prime the world meshes and shader uniforms before the first frame render.
      try {
        updateWorldMeshes();
        sanitizeSceneUniforms();
        ensureSceneUniformValuePresence();
        preemptivelyRepairRendererUniforms();
      } catch (initializationError) {
        console.warn('Unable to pre-sanitise world uniforms before starting the run.', initializationError);
      }
      requestAnimationFrame(loop);
      if (!progressSnapshot) {
        logEvent('You awaken on a floating island.');
      }
      flagProgressDirty('start');
      queueProgressSave('start');
      promptForOptionalSync();
      window.setTimeout(() => {
        if (state.isRunning) {
          const preferredScheme = prefersTouchControls() ? 'touch' : 'desktop';
          showPlayerHint(null, {
            html: createControlsHintMarkup(preferredScheme),
            variant: 'controls',
            persist: true,
          });
        }
      }, 900);
    }

    function loadDimension(id, fromId = null) {
      const dim = DIMENSIONS[id];
      if (!dim) return;
      state.dimension = dim;
      state.unlockedDimensions.add(id);
      if (!state.dimensionHistory.includes(id)) {
        state.dimensionHistory.push(id);
      }
      if (id !== 'origin') {
        const newlyDocumented = updateScore('dimension', id);
        if (newlyDocumented) {
          logEvent(`${dim.name} documented as explored (+${SCORE_POINTS.dimension} pts).`);
          markObjectiveComplete('build-portal');
        }
      } else {
        updateScoreOverlay();
      }
      applyDimensionTheme(dim);
      applyDimensionAtmosphere(dim);
      document.title = `Infinite Dimension · ${dim.name}`;
      state.world = dim.generator(state);
      state.physics = {
        gravity: dim.physics?.gravity ?? 1,
        shaderProfile: dim.physics?.shaderProfile ?? 'default',
      };
      resetWorldMeshes();
      markAllTilesDirty();
      state.player.x = Math.floor(state.width / 2);
      state.player.y = Math.floor(state.height / 2);
      state.player.facing = { x: 0, y: 1 };
      state.portals = [];
      state.zombies = [];
      zombieIdCounter = 0;
      state.ironGolems = [];
      refreshGridPathfinder();
      if (state.dayCycle) {
        state.dayCycle.isNight = false;
        state.dayCycle.spawnTimer = 0;
        state.dayCycle.waveCount = 0;
      }
      clearMarbleGhosts();
      state.baseMoveDelay = dim.rules.moveDelay ?? DEFAULT_MOVE_DELAY_SECONDS;
      state.moveDelay = state.baseMoveDelay;
      state.hooks.onMove = [];
      state.hooks.update = [];
      state.hooks.onAction = [];
      state.hooks.isWalkable = [];
      if (dim.rules.onMove) state.hooks.onMove.push(dim.rules.onMove);
      if (dim.rules.update) state.hooks.update.push(dim.rules.update);
      if (dim.rules.onAction) state.hooks.onAction.push(dim.rules.onAction);
      if (dim.rules.isWalkable) state.hooks.isWalkable.push(dim.rules.isWalkable);
      if (id === 'stone') {
        state.railPhase = 0;
        state.railTimer = 0;
      }
      if (id === 'marble') {
        state.echoQueue = [];
      }
      state.player.tarStacks = 0;
      state.player.tarSlowTimer = 0;
      state.player.isSliding = false;
      state.player.zombieHits = 0;
      resetTarOverlay();
      syncCameraToPlayer({ idleBob: 0, walkBob: 0, movementStrength: 0, facing: state.player.facing });
      updateLighting(0);
      if (fromId && id !== 'origin' && id !== 'netherite') {
        spawnReturnPortal(fromId, id);
      }
      if (id === 'origin' && fromId && hasItem('eternal-ingot')) {
        state.victory = true;
        logEvent('Victory! You returned with the Eternal Ingot.');
        openVictoryCelebration();
        handleVictoryAchieved();
      }
      lastDimensionHintKey = null;
      updateDimensionOverlay();
      updateDimensionCodex();
      renderVictoryBanner();
      updateRecipesList();
      updateAutocompleteSuggestions();
      updatePortalProgress();
      deployIronGolems();
      if (!state.ui.respawnActive) {
        resetStatusMeterMemory();
      }
      updateStatusBars();
      flagProgressDirty('dimension');
      const formatRulesFn =
        (typeof window !== 'undefined' && window.PortalMechanics?.formatDimensionRules) || null;
      const ruleSummary =
        typeof formatRulesFn === 'function'
          ? formatRulesFn({
              name: dim.name,
              id: dim.id,
              rules: dim.rules?.descriptions ?? dim.rules?.list ?? dim.rules,
              physics: dim.physics,
              description: dim.description,
            })
          : dim.description ?? 'Adapt quickly to the realm\'s rules to survive.';
      logEvent(`Entering ${dim.name} — ${ruleSummary}`);
    }

    const TARGET_FRAME_TIME = 1 / 60;
    let frameAccumulator = 0;

    function loop() {
      frameCounter += 1;
      const delta = Math.min(renderClock.getDelta(), 0.12);
      frameAccumulator += delta;
      frameAccumulator = Math.min(frameAccumulator, TARGET_FRAME_TIME * 5);
      while (frameAccumulator >= TARGET_FRAME_TIME) {
        if (state.isRunning) {
          update(TARGET_FRAME_TIME);
        } else {
          state.elapsed += TARGET_FRAME_TIME;
          updateLighting(TARGET_FRAME_TIME);
        }
        frameAccumulator -= TARGET_FRAME_TIME;
      }
      if (state.isRunning) {
        draw();
      } else if (renderer && scene && camera && !previewState.active) {
        renderer.render(scene, camera);
      }
      requestAnimationFrame(loop);
    }

    function update(delta) {
      state.elapsed += delta;
      handleMovementInput();
      for (const hook of state.hooks.update) {
        hook(state, delta);
      }
      if (state.player.tarStacks > 0) {
        state.player.tarSlowTimer = Math.max((state.player.tarSlowTimer ?? 0) - delta, 0);
        if (state.player.tarSlowTimer === 0) {
          state.player.tarStacks = Math.max(0, state.player.tarStacks - 1);
          if (state.player.tarStacks > 0) {
            state.player.tarSlowTimer = 1.1;
          }
        }
      }
      const cycleMetrics = getDayNightMetrics();
      const cycleState = state.dayCycle;
      if (cycleState) {
        if (cycleMetrics.isNight && !cycleState.isNight) {
          cycleState.spawnTimer = 0;
          cycleState.waveCount = 0;
          deployIronGolems();
        } else if (!cycleMetrics.isNight && cycleState.isNight) {
          cycleState.spawnTimer = ZOMBIE_SPAWN_INTERVAL;
          cycleState.waveCount = 0;
          if (state.zombies.length) {
            state.zombies = [];
          }
        }
        if (cycleMetrics.isNight) {
          cycleState.spawnTimer -= delta;
          if (cycleState.spawnTimer <= 0) {
            const spawned = spawnZombieWave();
            if (spawned > 0) {
              cycleState.waveCount = (cycleState.waveCount ?? 0) + 1;
              cycleState.spawnTimer = ZOMBIE_SPAWN_INTERVAL;
            } else {
              cycleState.spawnTimer = Math.min(ZOMBIE_SPAWN_INTERVAL, cycleState.spawnTimer + 1);
            }
          }
        } else {
          cycleState.spawnTimer = Math.min(cycleState.spawnTimer + delta, ZOMBIE_SPAWN_INTERVAL);
        }
        cycleState.isNight = cycleMetrics.isNight;
      }
      updateIronGolems(delta);
      updateZombies(delta);
      handleAir(delta);
      handleHealthRegen(delta);
      processEchoQueue();
      updatePortalActivation();
      updateStatusBars();
      updatePortalProgress();
      updateMiningState(delta);
      updateLighting(delta);
      advanceParticles(delta);
      if (playerMixer) {
        playerMixer.update(delta);
      }
      updateTarOverlay(delta);
      updateDimensionTransition(delta);
      updateHoverHighlight();
      updateAutoSave(delta);
    }

    function processEchoQueue() {
      if (!state.echoQueue.length) return;
      if (state.dimension.id !== 'marble') {
        state.echoQueue.length = 0;
        return;
      }
      // queue handled in marble update hook
    }

    function updateTarOverlay(delta) {
      if (!tarOverlayEl) return;
      const isTarDimension = state.dimension?.id === 'tar';
      const stacks = state.player?.tarStacks ?? 0;
      const slowTimer = state.player?.tarSlowTimer ?? 0;
      let target = 0;
      if (isTarDimension && (stacks > 0 || slowTimer > 0)) {
        const stackRatio = THREE.MathUtils.clamp(stacks / 4, 0, 1);
        const timerRatio = THREE.MathUtils.clamp(slowTimer / 2.4, 0, 1);
        target = Math.min(1, 0.18 + stackRatio * 0.6 + timerRatio * 0.45);
      }
      const previous = state.ui.tarOverlayLevel ?? 0;
      const rampSpeed = target > previous ? 6 : 3.5;
      const lerpAlpha = Math.min(1, delta * rampSpeed);
      const next = THREE.MathUtils.lerp(previous, target, lerpAlpha);
      const intensity = THREE.MathUtils.clamp(next, 0, 1);
      state.ui.tarOverlayLevel = intensity;
      tarOverlayEl.style.setProperty('--tar-overlay-strength', intensity.toFixed(3));
      if (intensity <= 0.01) {
        tarOverlayEl.setAttribute('data-active', 'false');
      } else {
        tarOverlayEl.setAttribute('data-active', 'true');
      }
    }

    function handleAir(delta) {
      const tile = getTile(state.player.x, state.player.y);
      if (tile?.type === 'water') {
        const previousAir = state.player.air;
        const previousUnits = Math.ceil(previousAir);
        state.player.air = Math.max(0, state.player.air - delta * 2);
        const currentUnits = Math.ceil(state.player.air);
        if (currentUnits < previousUnits) {
          triggerDrowningCue();
        }
        if (state.player.air === 0) {
          if (state.elapsed - state.ui.lastDrowningCueAt > 0.9) {
            triggerDrowningCue();
          }
          applyDamage(0.5 * delta * 5);
        }
      } else {
        const previousAir = state.player.air;
        state.player.air = clamp(state.player.air + delta * 3, 0, state.player.maxAir);
        if (state.player.air > previousAir && drowningVignetteEl) {
          drowningVignetteEl.setAttribute('data-active', 'false');
          drowningVignetteEl.classList.remove('drowning-vignette--flash');
        }
      }
      state.ui.lastAirUnits = Math.ceil(state.player.air);
    }

    function handleHealthRegen(delta) {
      if (state.ui.respawnActive) return;
      const player = state.player;
      if (!player) return;
      if (player.hearts >= player.maxHearts) {
        player.hearts = player.maxHearts;
        player.heartsAtLastDamage = clamp(player.hearts, 0, player.maxHearts);
        return;
      }
      const lastDamageAt = Number.isFinite(player.lastDamageAt) ? player.lastDamageAt : -Infinity;
      const idleDuration = state.elapsed - lastDamageAt;
      if (idleDuration <= HEALTH_REGEN_IDLE_DELAY) {
        return;
      }
      const baseline = clamp(
        player.heartsAtLastDamage ?? player.hearts,
        0,
        player.maxHearts
      );
      if (baseline >= player.maxHearts) {
        player.heartsAtLastDamage = baseline;
        return;
      }
      const regenWindow = Math.max(
        HEALTH_REGEN_FULL_RESTORE_DURATION - HEALTH_REGEN_IDLE_DELAY,
        0.0001
      );
      const progress = clamp((idleDuration - HEALTH_REGEN_IDLE_DELAY) / regenWindow, 0, 1);
      const targetHearts = baseline + (player.maxHearts - baseline) * progress;
      if (targetHearts > player.hearts) {
        player.hearts = Math.min(targetHearts, player.maxHearts);
      }
    }

    function triggerDrowningCue() {
      state.ui.lastDrowningCueAt = state.elapsed;
      flashDrowningVignette();
      playBubblePop();
    }

    function flashDrowningVignette() {
      if (!drowningVignetteEl) return;
      drowningVignetteEl.setAttribute('data-active', 'true');
      drowningVignetteEl.classList.remove('drowning-vignette--flash');
      void drowningVignetteEl.offsetWidth;
      drowningVignetteEl.classList.add('drowning-vignette--flash');
      if (state.ui.drowningFadeTimeout) {
        window.clearTimeout(state.ui.drowningFadeTimeout);
      }
      state.ui.drowningFadeTimeout = window.setTimeout(() => {
        drowningVignetteEl?.setAttribute('data-active', 'false');
        drowningVignetteEl?.classList.remove('drowning-vignette--flash');
      }, 800);
    }

    function ensureAudioContext() {
      if (audioState.context) return audioState.context;
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return null;
      try {
        audioState.context = new AudioContextCtor();
      } catch (error) {
        console.warn('Unable to initialise audio context.', error);
        audioState.context = null;
      }
      return audioState.context;
    }

    function playBubblePop() {
      if (state.elapsed - state.ui.lastBubblePopAt < 0.45) return;
      state.ui.lastBubblePopAt = state.elapsed;
      if (audioState.effects?.bubble) {
        playHowlInstance(audioState.effects.bubble);
        return;
      }
      playFallbackEffect({ startFreq: 720, endFreq: 240, duration: 0.45, type: 'triangle', peak: 0.18 });
    }

    function deployIronGolems() {
      if (!state.ironGolems) state.ironGolems = [];
      state.ironGolems.length = 0;
      const desiredCount = 2;
      const origin = { x: state.player.x, y: state.player.y };
      const preferredOffsets = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: 2, y: 0 },
        { x: -2, y: 0 },
        { x: 0, y: 2 },
        { x: 0, y: -2 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: -1 },
      ];

      const placeGolemAt = (x, y) => {
        if (state.ironGolems.length >= desiredCount) return true;
        if (!isWalkable(x, y)) return false;
        if (x === origin.x && y === origin.y) return false;
        if (state.ironGolems.some((g) => g.x === x && g.y === y)) return false;
        state.ironGolems.push({
          x,
          y,
          cooldown: 0,
          facing: { x: 0, y: 1 },
          attackAnimation: null,
          path: [],
          pathTargetId: null,
          pathTarget: null,
          repathAt: 0,
        });
        return true;
      };

      for (const offset of preferredOffsets) {
        if (placeGolemAt(origin.x + offset.x, origin.y + offset.y)) continue;
        if (state.ironGolems.length >= desiredCount) break;
      }

      if (state.ironGolems.length < desiredCount) {
        const candidates = [];
        for (let y = 0; y < state.height; y++) {
          for (let x = 0; x < state.width; x++) {
            if (!isWalkable(x, y)) continue;
            if (x === origin.x && y === origin.y) continue;
            candidates.push({ x, y, dist: Math.abs(x - origin.x) + Math.abs(y - origin.y) });
          }
        }
        candidates.sort((a, b) => a.dist - b.dist);
        for (const candidate of candidates) {
          if (placeGolemAt(candidate.x, candidate.y)) {
            if (state.ironGolems.length >= desiredCount) break;
          }
        }
      }

      if (state.ironGolems.length === 0) {
        state.ironGolems.push({
          x: origin.x,
          y: origin.y,
          cooldown: 0,
          facing: { x: 0, y: 1 },
          attackAnimation: null,
          path: [],
          pathTargetId: null,
          pathTarget: null,
          repathAt: 0,
        });
      }
    }

    function findNearestZombie(origin) {
      if (!state.zombies.length) return null;
      let best = null;
      let bestDist = Infinity;
      state.zombies.forEach((zombie) => {
        const dist = Math.abs(zombie.x - origin.x) + Math.abs(zombie.y - origin.y);
        if (dist < bestDist) {
          best = zombie;
          bestDist = dist;
        }
      });
      return best;
    }

    function updateIronGolems(delta) {
      if (!state.ironGolems?.length) return;
      const now = state.elapsed;
      const golemPositions = new Set(state.ironGolems.map((g) => `${g.x},${g.y}`));

      for (let i = 0; i < state.ironGolems.length; i++) {
        const golem = state.ironGolems[i];
        golem.cooldown = (golem.cooldown ?? 0) - delta;
        if (golem.cooldown > 0) continue;

        const originKey = `${golem.x},${golem.y}`;
        golemPositions.delete(originKey);
        const target = findNearestZombie(golem);
        if (!target) {
          golem.path = [];
          golem.pathTargetId = null;
          golem.pathTarget = null;
          golem.cooldown = 0.45;
          golemPositions.add(originKey);
          continue;
        }

        let nextStep = null;
        if (gridPathfinder) {
          const needsRepath =
            !Array.isArray(golem.path) ||
            !golem.path.length ||
            (golem.pathTargetId ?? null) !== (target.id ?? null) ||
            !golem.pathTarget ||
            golem.pathTarget.x !== target.x ||
            golem.pathTarget.y !== target.y ||
            now >= (golem.repathAt ?? 0);
          if (needsRepath) {
            const path = gridPathfinder.findPath(
              { x: golem.x, y: golem.y },
              { x: target.x, y: target.y },
              { allowGoal: true }
            );
            golem.path = path;
            golem.pathTargetId = target.id ?? null;
            golem.pathTarget = { x: target.x, y: target.y };
            golem.repathAt = now + 0.5 + Math.random() * 0.4;
          }
          if (Array.isArray(golem.path) && golem.path.length) {
            const candidate = golem.path.shift();
            if (candidate) {
              const candidateKey = `${candidate.x},${candidate.y}`;
              const blockedByGolem = golemPositions.has(candidateKey);
              const blockedByTerrain =
                candidate.x !== target.x || candidate.y !== target.y ? !isWalkable(candidate.x, candidate.y) : false;
              if (!blockedByGolem && !blockedByTerrain) {
                nextStep = candidate;
              } else {
                golem.path = [];
              }
            }
          }
        }

        if (!nextStep) {
          const dx = Math.sign(target.x - golem.x);
          const dy = Math.sign(target.y - golem.y);
          const candidateOrder = Math.abs(dx) >= Math.abs(dy)
            ? [
                { x: golem.x + dx, y: golem.y, valid: dx !== 0 },
                { x: golem.x, y: golem.y + dy, valid: dy !== 0 },
              ]
            : [
                { x: golem.x, y: golem.y + dy, valid: dy !== 0 },
                { x: golem.x + dx, y: golem.y, valid: dx !== 0 },
              ];
          for (const option of candidateOrder) {
            if (!option.valid) continue;
            const key = `${option.x},${option.y}`;
            if (key !== `${target.x},${target.y}` && (!isWalkable(option.x, option.y) || golemPositions.has(key))) {
              continue;
            }
            nextStep = { x: option.x, y: option.y };
            break;
          }
        }

        if (nextStep) {
          golem.x = nextStep.x;
          golem.y = nextStep.y;
          golemPositions.add(`${golem.x},${golem.y}`);
          const lookX = Math.sign(target.x - golem.x);
          const lookY = Math.sign(target.y - golem.y);
          if (lookX !== 0 || lookY !== 0) {
            golem.facing = normalizeDirectionVector({ x: lookX, y: lookY });
          }
          golem.cooldown = 0.28;
        } else {
          golemPositions.add(originKey);
          const lookX = Math.sign(target.x - golem.x);
          const lookY = Math.sign(target.y - golem.y);
          if (lookX !== 0 || lookY !== 0) {
            golem.facing = normalizeDirectionVector({ x: lookX, y: lookY });
          }
          golem.cooldown = 0.35;
        }
      }

      const defeatedIndices = new Set();
      state.ironGolems.forEach((golem) => {
        let punched = false;
        state.zombies.forEach((zombie, index) => {
          const distance = Math.abs(zombie.x - golem.x) + Math.abs(zombie.y - golem.y);
          if (distance <= 1) {
            defeatedIndices.add(index);
            if (!punched) {
              const direction = {
                x: zombie.x - golem.x,
                y: zombie.y - golem.y,
              };
              if (direction.x === 0 && direction.y === 0 && golem.facing) {
                direction.x = golem.facing.x;
                direction.y = golem.facing.y;
              }
              golem.facing = normalizeDirectionVector(direction);
              triggerGolemPunchAnimation(golem, {
                direction,
                strength: THREE.MathUtils.clamp(1.15 - distance * 0.1, 0.5, 1.25),
              });
              punched = true;
            }
          }
        });
      });

      if (defeatedIndices.size) {
        const defeatedZombies = [];
        state.zombies = state.zombies.filter((zombie, index) => {
          if (defeatedIndices.has(index)) {
            defeatedZombies.push(zombie);
            return false;
          }
          return true;
        });
        defeatedZombies.forEach(() => logEvent('An iron golem smashes a Minecraft zombie to protect you.'));
      }
    }

    function spawnZombieWave() {
      if (!state?.player) return 0;
      const cycle = getDayNightMetrics();
      if (!cycle.isNight) return 0;
      const remainingCapacity = Math.max(0, MAX_CONCURRENT_ZOMBIES - state.zombies.length);
      const spawnTarget = combatUtils?.calculateZombieSpawnCount
        ? combatUtils.calculateZombieSpawnCount({
            width: state.width,
            height: state.height,
            perChunk: ZOMBIES_PER_CHUNK,
            chunkSize: ZOMBIE_CHUNK_SIZE,
          })
        : Math.max(
            ZOMBIES_PER_CHUNK,
            Math.ceil(state.width / ZOMBIE_CHUNK_SIZE) *
              Math.ceil(state.height / ZOMBIE_CHUNK_SIZE) *
              ZOMBIES_PER_CHUNK
          );
      const spawnCount = Math.min(spawnTarget, remainingCapacity);
      if (spawnCount <= 0) return 0;

      const playerX = state.player.x;
      const playerY = state.player.y;
      const occupied = new Set(state.zombies.map((z) => `${z.x},${z.y}`));
      const golemPositions = new Set((state.ironGolems ?? []).map((g) => `${g.x},${g.y}`));

      const primaryCandidates = [];
      const fallbackCandidates = [];

      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          const key = `${x},${y}`;
          if (occupied.has(key) || golemPositions.has(key)) continue;
          const tile = getTile(x, y);
          if (!tile || tile.type === 'void' || tile.type === 'railVoid') continue;
          if (!isWalkable(x, y)) continue;
          const distance = Math.abs(x - playerX) + Math.abs(y - playerY);
          if (distance === 0) continue;
          if (distance >= 4 && distance <= ZOMBIE_AGGRO_RANGE) {
            primaryCandidates.push({ x, y });
          } else if (distance <= ZOMBIE_AGGRO_RANGE + 2) {
            fallbackCandidates.push({ x, y });
          }
        }
      }

      const selections = [];
      const chooseFrom = (list) => {
        while (list.length && selections.length < spawnCount) {
          const index = Math.floor(Math.random() * list.length);
          const [choice] = list.splice(index, 1);
          if (!choice) continue;
          const key = `${choice.x},${choice.y}`;
          if (occupied.has(key)) continue;
          occupied.add(key);
          selections.push(choice);
        }
      };

      chooseFrom(primaryCandidates);
      if (selections.length < spawnCount) {
        chooseFrom(fallbackCandidates);
      }
      let safety = 0;
      while (selections.length < spawnCount && safety < spawnCount * 6) {
        safety += 1;
        const edge = {
          x: Math.floor(Math.random() * state.width),
          y: Math.random() < 0.5 ? 0 : state.height - 1,
        };
        const key = `${edge.x},${edge.y}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        selections.push(edge);
      }

      selections.forEach((spawn, index) => {
        zombieIdCounter += 1;
        state.zombies.push({
          id: zombieIdCounter,
          x: spawn.x,
          y: spawn.y,
          speed: 0.72 + Math.random() * 0.18,
          cooldown: Math.random() * 0.4,
          path: [],
          pathTarget: null,
          repathAt: 0,
        });
        if (index === 0) {
          logEvent('A horde of Minecraft zombies claws onto the rails.');
        }
      });
      if (selections.length) {
        playZombieGroan();
      }
      return selections.length;
    }

    function updateZombies(delta) {
      const cycle = getDayNightMetrics();
      const isNight = cycle.isNight;
      const now = state.elapsed;
      const golemPositions = new Set((state.ironGolems ?? []).map((g) => `${g.x},${g.y}`));
      const playerKey = `${state.player.x},${state.player.y}`;
      const zombiePositions = new Set(state.zombies.map((z) => `${z.x},${z.y}`));

      for (let i = 0; i < state.zombies.length; i++) {
        const zombie = state.zombies[i];
        zombie.cooldown -= delta;
        if (zombie.cooldown > 0) continue;
        const originKey = `${zombie.x},${zombie.y}`;
        zombiePositions.delete(originKey);
        const dist = Math.abs(zombie.x - state.player.x) + Math.abs(zombie.y - state.player.y);
        let moved = false;

        const tryMove = (nx, ny, { allowPlayer = false } = {}) => {
          const key = `${nx},${ny}`;
          const isPlayerTile = key === playerKey;
          if (!allowPlayer && isPlayerTile) {
            return false;
          }
          if (golemPositions.has(key)) return false;
          if (zombiePositions.has(key)) return false;
          if (!isPlayerTile && !isWalkable(nx, ny)) return false;
          zombie.x = nx;
          zombie.y = ny;
          zombiePositions.add(key);
          moved = true;
          return true;
        };

        if (isNight && dist <= ZOMBIE_AGGRO_RANGE && gridPathfinder) {
          const needsRepath =
            !Array.isArray(zombie.path) ||
            !zombie.path.length ||
            !zombie.pathTarget ||
            zombie.pathTarget.x !== state.player.x ||
            zombie.pathTarget.y !== state.player.y ||
            now >= (zombie.repathAt ?? 0);
          if (needsRepath) {
            const path = gridPathfinder.findPath(
              { x: zombie.x, y: zombie.y },
              { x: state.player.x, y: state.player.y },
              { allowGoal: true }
            );
            zombie.path = path;
            zombie.pathTarget = { x: state.player.x, y: state.player.y };
            zombie.repathAt = now + 0.9 + Math.random() * 0.5;
          }
          if (Array.isArray(zombie.path) && zombie.path.length) {
            const candidate = zombie.path.shift();
            if (!candidate || !tryMove(candidate.x, candidate.y, { allowPlayer: true })) {
              zombie.path = [];
            }
          }
        }

        if (!moved && isNight && dist <= ZOMBIE_AGGRO_RANGE) {
          const dx = Math.sign(state.player.x - zombie.x);
          const dy = Math.sign(state.player.y - zombie.y);
          if (Math.abs(dx) >= Math.abs(dy)) {
            moved =
              (dx !== 0 && tryMove(zombie.x + dx, zombie.y, { allowPlayer: true })) ||
              (dy !== 0 && tryMove(zombie.x, zombie.y + dy, { allowPlayer: true }));
          } else {
            moved =
              (dy !== 0 && tryMove(zombie.x, zombie.y + dy, { allowPlayer: true })) ||
              (dx !== 0 && tryMove(zombie.x + dx, zombie.y, { allowPlayer: true }));
          }
        } else if (!moved && isNight) {
          const directions = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
          ];
          const offset = Math.floor(Math.random() * directions.length);
          for (let j = 0; j < directions.length; j++) {
            const dir = directions[(offset + j) % directions.length];
            const nx = zombie.x + dir.x;
            const ny = zombie.y + dir.y;
            if (tryMove(nx, ny)) {
              break;
            }
          }
        }

        if (!isNight || dist > ZOMBIE_AGGRO_RANGE) {
          zombie.path = [];
          zombie.pathTarget = null;
        }

        if (!moved) {
          zombiePositions.add(originKey);
        }

        const baseCooldown = 0.55 + Math.random() * 0.2;
        const speedModifier = zombie.speed ? THREE.MathUtils.clamp(1.1 - zombie.speed * 0.35, 0.6, 1.35) : 1;
        zombie.cooldown = baseCooldown * speedModifier;
        if (!isNight) {
          zombie.cooldown += 0.25;
        }
        if (zombie.x === state.player.x && zombie.y === state.player.y) {
          handleZombieHit();
        }
      }
      state.zombies = state.zombies.filter((z) => {
        const tile = getTile(z.x, z.y);
        return tile && tile.type !== 'void' && tile.type !== 'railVoid';
      });
    }

    function handleZombieHit() {
      playZombieGroan();
      let outcome = null;
      if (combatUtils?.applyZombieStrike) {
        outcome = combatUtils.applyZombieStrike(state, {
          onStrike: (message) => logEvent(message),
          onDeath: (message) => logEvent(message),
        });
      }
      if (!outcome) {
        state.player.zombieHits = (state.player.zombieHits ?? 0) + 1;
        const hits = state.player.zombieHits;
        const heartsPerHit = state.player.maxHearts / 5;
        const remainingHearts = state.player.maxHearts - heartsPerHit * hits;
        state.player.hearts = clamp(remainingHearts, 0, state.player.maxHearts);
        if (hits >= 5) {
          logEvent('Death');
          outcome = { hits, remainingHearts: state.player.hearts, defeated: true };
        } else {
          const remainingHits = 5 - hits;
          logEvent(
            `Minecraft zombie strike! ${remainingHits} more hit${remainingHits === 1 ? '' : 's'} before defeat.`
          );
          outcome = { hits, remainingHearts: state.player.hearts, defeated: false };
        }
      }
      markPlayerDamaged();
      if (outcome?.defeated) {
        state.player.hearts = clamp(state.player.hearts, 0, state.player.maxHearts);
        markPlayerDamaged();
        updateStatusBars();
        handlePlayerDefeat('The Minecraft zombies overwhelm Steve. You respawn among the rails.');
        return;
      }
      updateStatusBars();
    }

    function handlePlayerDefeat(message, options = {}) {
      if (state.victory || state.ui.respawnActive) return;
      logEvent(message);
      state.isRunning = false;
      state.ui.respawnActive = true;
      const snapshot = captureInventorySnapshot();
      showDefeatOverlay({
        message,
        items: snapshot,
        countdown: options.countdown ?? 4,
      });
    }

    function captureInventorySnapshot(limit = 8) {
      try {
        const bundles = mergeInventory().filter((entry) => entry && entry.quantity > 0);
        bundles.sort((a, b) => b.quantity - a.quantity);
        return bundles.slice(0, limit);
      } catch (error) {
        console.warn('Unable to capture inventory snapshot.', error);
        return [];
      }
    }

    function getItemDisplayName(itemId) {
      return ITEM_DEFS[itemId]?.name ?? itemId.replace(/-/g, ' ');
    }

    function showDefeatOverlay({ message, items, countdown }) {
      const duration = Math.max(3, Math.floor(Number.isFinite(countdown) ? countdown : 4));
      if (!defeatOverlayEl) {
        state.ui.respawnCountdownTimeout = window.setTimeout(() => completeRespawn(), duration * 1000);
        return;
      }
      defeatOverlayEl.setAttribute('data-visible', 'true');
      defeatOverlayEl.setAttribute('aria-hidden', 'false');
      if (defeatMessageEl) {
        defeatMessageEl.textContent = message;
      }
      renderDefeatInventory(items);
      if (defeatCountdownEl) {
        defeatCountdownEl.textContent = '';
      }
      if (defeatRespawnButton) {
        defeatRespawnButton.disabled = false;
        defeatRespawnButton.textContent = 'Respawn Now';
      }
      window.clearTimeout(state.ui.respawnCountdownTimeout);
      window.requestAnimationFrame(() => {
        defeatOverlayEl?.focus({ preventScroll: true });
      });
      startRespawnCountdown(duration);
    }

    function renderDefeatInventory(items = []) {
      if (!defeatInventoryEl) return;
      defeatInventoryEl.innerHTML = '';
      if (!items.length) {
        defeatInventoryEl.dataset.empty = 'true';
        defeatInventoryEl.textContent = 'You drop nothing as the realm resets.';
        return;
      }
      delete defeatInventoryEl.dataset.empty;
      const label = document.createElement('p');
      label.className = 'defeat-overlay__inventory-label';
      label.textContent = 'Inventory Snapshot';
      const list = document.createElement('ul');
      list.className = 'defeat-overlay__inventory-list';
      items.forEach((entry) => {
        const li = document.createElement('li');
        li.className = 'defeat-overlay__inventory-item';
        const name = document.createElement('span');
        name.textContent = getItemDisplayName(entry.item);
        const qty = document.createElement('span');
        qty.textContent = `×${entry.quantity}`;
        li.append(name, qty);
        list.appendChild(li);
      });
      defeatInventoryEl.append(label, list);
    }

    function startRespawnCountdown(seconds) {
      const duration = Math.max(0, Math.floor(seconds));
      if (!defeatCountdownEl) {
        state.ui.respawnCountdownTimeout = window.setTimeout(() => completeRespawn(), duration * 1000);
        return;
      }
      let remaining = duration;
      const tick = () => {
        if (remaining > 0) {
          defeatCountdownEl.textContent = `Respawning in ${remaining}s`;
        } else {
          defeatCountdownEl.textContent = 'Respawning...';
        }
        if (remaining <= 0) {
          completeRespawn();
          return;
        }
        remaining -= 1;
        state.ui.respawnCountdownTimeout = window.setTimeout(tick, 1000);
      };
      tick();
    }

    function completeRespawn() {
      if (!state.ui.respawnActive) return;
      if (typeof console !== 'undefined') {
        console.log('Respawn triggered');
      }
      if (defeatRespawnButton) {
        defeatRespawnButton.disabled = true;
        defeatRespawnButton.textContent = 'Respawning...';
      }
      if (state.ui.respawnCountdownTimeout) {
        window.clearTimeout(state.ui.respawnCountdownTimeout);
        state.ui.respawnCountdownTimeout = null;
      }
      const inventorySnapshot = combatUtils?.snapshotInventory
        ? combatUtils.snapshotInventory(state.player)
        : {
            inventory: Array.isArray(state.player.inventory)
              ? state.player.inventory.map((slot) =>
                  slot && slot.item ? { item: slot.item, quantity: slot.quantity } : null
                )
              : [],
            satchel: Array.isArray(state.player.satchel)
              ? state.player.satchel.map((bundle) => ({ item: bundle.item, quantity: bundle.quantity }))
              : [],
            selectedSlot: state.player.selectedSlot ?? 0,
          };
      if (combatUtils?.completeRespawnState) {
        combatUtils.completeRespawnState(state);
      } else {
        state.player.hearts = state.player.maxHearts;
        state.player.air = state.player.maxAir;
        state.player.zombieHits = 0;
      }
      loadDimension('origin');
      ensurePlayerAvatarReady({ forceReload: true, resetAnimations: true });
      if (combatUtils?.restoreInventory) {
        combatUtils.restoreInventory(state.player, inventorySnapshot);
      } else {
        if (Array.isArray(inventorySnapshot.inventory)) {
          state.player.inventory = inventorySnapshot.inventory.map((slot) =>
            slot && slot.item ? { item: slot.item, quantity: slot.quantity } : null
          );
        }
        if (Array.isArray(inventorySnapshot.satchel)) {
          state.player.satchel = inventorySnapshot.satchel.map((bundle) => ({
            item: bundle.item,
            quantity: bundle.quantity,
          }));
        }
        if (Number.isInteger(inventorySnapshot.selectedSlot)) {
          state.player.selectedSlot = Math.min(
            Math.max(inventorySnapshot.selectedSlot, 0),
            state.player.inventory.length - 1
          );
        }
      }
      state.player.zombieHits = 0;
      updateInventoryUI();
      updateStatusBars();
      if (drowningVignetteEl) {
        drowningVignetteEl.setAttribute('data-active', 'false');
        drowningVignetteEl.classList.remove('drowning-vignette--flash');
      }
      if (state.ui.drowningFadeTimeout) {
        window.clearTimeout(state.ui.drowningFadeTimeout);
        state.ui.drowningFadeTimeout = null;
      }
      state.isRunning = true;
      state.ui.respawnActive = false;
      logEvent('You rematerialise at the Grassland Threshold.');
      window.setTimeout(() => hideDefeatOverlay(), 420);
    }

    function hideDefeatOverlay() {
      if (!defeatOverlayEl) return;
      defeatOverlayEl.setAttribute('data-visible', 'false');
      defeatOverlayEl.setAttribute('aria-hidden', 'true');
      defeatOverlayEl.blur();
      if (defeatMessageEl) defeatMessageEl.textContent = '';
      if (defeatCountdownEl) defeatCountdownEl.textContent = '';
      if (defeatInventoryEl) {
        defeatInventoryEl.innerHTML = '';
        delete defeatInventoryEl.dataset.empty;
      }
      if (defeatRespawnButton) {
        defeatRespawnButton.disabled = true;
        defeatRespawnButton.textContent = 'Respawn Now';
      }
    }

    function markPlayerDamaged() {
      state.player.lastDamageAt = state.elapsed;
      state.player.heartsAtLastDamage = clamp(state.player.hearts, 0, state.player.maxHearts);
    }

    function applyDamage(amount) {
      if (amount <= 0) return;
      state.player.hearts = clamp(state.player.hearts - amount, 0, state.player.maxHearts);
      markPlayerDamaged();
      if (state.player.hearts <= 0 && !state.victory) {
        handlePlayerDefeat('You collapse. Echoes rebuild the realm...');
      }
    }

    function getTile(x, y) {
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
      return state.world?.[y]?.[x] ?? null;
    }

    function isWalkable(x, y) {
      const tile = getTile(x, y);
      if (!tile) return false;
      for (const hook of state.hooks.isWalkable) {
        const result = hook(tile, state);
        if (typeof result === 'boolean') return result;
      }
      const def = TILE_TYPES[tile.type];
      if (tile.type === 'tree' || tile.type === 'chest') return false;
      if (tile.type === 'water' || tile.type === 'lava' || tile.type === 'void' || tile.type === 'railVoid') return false;
      if (tile.type === 'portalFrame') return true;
      if (tile.type === 'portal') return true;
      if (def?.walkable !== undefined) return def.walkable;
      return true;
    }

    function getCameraRelativeBasis() {
      if (camera?.isCamera) {
        tmpMovementForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        tmpMovementRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      } else if (cameraState?.lastFacing) {
        tmpMovementForward.copy(cameraState.lastFacing);
        tmpMovementRight.set(tmpMovementForward.z, 0, -tmpMovementForward.x);
      } else if (state?.player?.facing) {
        tmpMovementForward.set(state.player.facing.x, 0, state.player.facing.y);
        tmpMovementRight.set(tmpMovementForward.z, 0, -tmpMovementForward.x);
      } else {
        tmpMovementForward.set(0, 0, -1);
        tmpMovementRight.set(1, 0, 0);
      }
      tmpMovementForward.y = 0;
      tmpMovementRight.y = 0;
      if (tmpMovementForward.lengthSq() < 0.0001) {
        tmpMovementForward.set(0, 0, -1);
      }
      tmpMovementForward.normalize();
      if (tmpMovementRight.lengthSq() < 0.0001) {
        tmpMovementRight.set(tmpMovementForward.z, 0, -tmpMovementForward.x);
      }
      tmpMovementRight.normalize();
    }

    function snapDirectionToRail(dx, dy, moveVector, baseDot = null) {
      if (!state?.player) {
        return { dx, dy };
      }
      const { x, y } = state.player;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { dx, dy };
      }
      const currentOption = MOVEMENT_CARDINAL_DIRECTIONS.find(
        (option) => option.dx === dx && option.dy === dy,
      );
      const currentDot = baseDot ?? (currentOption ? moveVector.dot(currentOption.vector) : -Infinity);
      let bestRail = null;
      let bestRailDot = -Infinity;
      for (const option of MOVEMENT_CARDINAL_DIRECTIONS) {
        const tile = getTile(x + option.dx, y + option.dy);
        if (!tile || tile.type !== 'rail') continue;
        const dot = moveVector.dot(option.vector);
        if (dot > bestRailDot) {
          bestRailDot = dot;
          bestRail = option;
        }
      }
      if (!bestRail) {
        return { dx, dy };
      }
      const baseWalkable = isWalkable(x + dx, y + dy);
      if (!baseWalkable && bestRailDot >= 0.1) {
        return { dx: bestRail.dx, dy: bestRail.dy };
      }
      if (bestRailDot > currentDot + 0.15) {
        return { dx: bestRail.dx, dy: bestRail.dy };
      }
      return { dx, dy };
    }

    function resolveCameraRelativeDirection(forwardInput, strafeInput, options = {}) {
      const { snapToRails = false } = options;
      const forward = Number.isFinite(forwardInput) ? forwardInput : 0;
      const strafe = Number.isFinite(strafeInput) ? strafeInput : 0;
      if (Math.abs(forward) < 0.0001 && Math.abs(strafe) < 0.0001) {
        return null;
      }
      getCameraRelativeBasis();
      tmpMovementVector.set(0, 0, 0);
      if (Math.abs(forward) > 0.0001) {
        tmpMovementVector.addScaledVector(tmpMovementForward, forward);
      }
      if (Math.abs(strafe) > 0.0001) {
        tmpMovementVector.addScaledVector(tmpMovementRight, strafe);
      }
      if (tmpMovementVector.lengthSq() < 0.0001) {
        return null;
      }
      tmpMovementVector.normalize();
      let bestDirection = MOVEMENT_CARDINAL_DIRECTIONS[0];
      let bestDot = -Infinity;
      for (const option of MOVEMENT_CARDINAL_DIRECTIONS) {
        const dot = tmpMovementVector.dot(option.vector);
        if (dot > bestDot) {
          bestDot = dot;
          bestDirection = option;
        }
      }
      let { dx, dy } = bestDirection;
      if (snapToRails) {
        const snapped = snapDirectionToRail(dx, dy, tmpMovementVector, bestDot);
        dx = snapped.dx;
        dy = snapped.dy;
      }
      return { dx, dy };
    }

    function attemptCameraAlignedMove(forwardInput, strafeInput, options = {}) {
      if (!state?.isRunning) {
        return false;
      }
      const direction = resolveCameraRelativeDirection(forwardInput, strafeInput, options);
      if (!direction) {
        return false;
      }
      const { dx, dy } = direction;
      if (dx === 0 && dy === 0) {
        return false;
      }
      const previousMove = state.lastMoveAt;
      attemptMove(dx, dy);
      return state.lastMoveAt !== previousMove;
    }

    function handleMovementInput() {
      if (!state?.isRunning) {
        return;
      }
      const pressedKeys = state?.pressedKeys;
      const joystick = state?.joystickInput;
      const hasKeyboardInput = pressedKeys instanceof Set && pressedKeys.size > 0;
      const hasJoystickInput =
        joystick && (Math.abs(joystick.forward) > 0.0001 || Math.abs(joystick.strafe) > 0.0001);
      if (!hasKeyboardInput && !hasJoystickInput) {
        return;
      }
      let forwardInput = (pressedKeys?.has('forward') ? 1 : 0) - (pressedKeys?.has('backward') ? 1 : 0);
      let strafeInput = (pressedKeys?.has('right') ? 1 : 0) - (pressedKeys?.has('left') ? 1 : 0);
      if (joystick) {
        forwardInput += joystick.forward;
        strafeInput += joystick.strafe;
      }
      forwardInput = THREE.MathUtils.clamp(forwardInput, -1, 1);
      strafeInput = THREE.MathUtils.clamp(strafeInput, -1, 1);
      if (Math.abs(forwardInput) < 0.0001 && Math.abs(strafeInput) < 0.0001) {
        return;
      }
      attemptCameraAlignedMove(forwardInput, strafeInput, { snapToRails: true });
    }

    function attemptJump() {
      if (!state?.isRunning) {
        return false;
      }
      if (state.ui?.respawnActive || state.ui?.dimensionTransition) {
        return false;
      }
      let forwardInput =
        (state.pressedKeys?.has('forward') ? 1 : 0) - (state.pressedKeys?.has('backward') ? 1 : 0);
      let strafeInput =
        (state.pressedKeys?.has('right') ? 1 : 0) - (state.pressedKeys?.has('left') ? 1 : 0);
      if (state.joystickInput) {
        forwardInput += state.joystickInput.forward;
        strafeInput += state.joystickInput.strafe;
      }
      forwardInput = THREE.MathUtils.clamp(forwardInput, -1, 1);
      strafeInput = THREE.MathUtils.clamp(strafeInput, -1, 1);
      if (forwardInput === 0 && strafeInput === 0) {
        forwardInput = 1;
      }
      const direction = resolveCameraRelativeDirection(forwardInput, strafeInput, { snapToRails: false });
      if (!direction) {
        return false;
      }
      const { dx, dy } = direction;
      if (dx === 0 && dy === 0) {
        return false;
      }
      const now = performance?.now ? performance.now() : Date.now();
      const delay = getMovementDelay(dx, dy);
      if (now - state.lastMoveAt < delay * 1000) {
        return false;
      }
      const startX = state.player.x;
      const startY = state.player.y;
      const midX = startX + dx;
      const midY = startY + dy;
      const landingX = startX + dx * 2;
      const landingY = startY + dy * 2;
      if (!isWithinBounds(midX, midY) || !isWithinBounds(landingX, landingY)) {
        return false;
      }
      if (isWalkable(midX, midY)) {
        return false;
      }
      if (!isWalkable(landingX, landingY)) {
        return false;
      }
      state.player.x = landingX;
      state.player.y = landingY;
      state.player.facing = { x: dx, y: dy };
      state.lastMoveAt = now;
      playFootstepSound();
      const landingTile = getTile(landingX, landingY);
      if (landingTile?.hazard) {
        applyDamage(0.5);
        logEvent('Hazard burns you!');
      }
      const from = { x: startX, y: startY };
      for (const hook of state.hooks.onMove) {
        hook(state, from, { x: landingX, y: landingY }, { dx, dy });
      }
      dismissMovementHint();
      return true;
    }

    function getMovementDelay(dx = 0, dy = 0) {
      const baseDelay = state.baseMoveDelay ?? DEFAULT_MOVE_DELAY_SECONDS;
      const slowPenalty = (state.player?.tarStacks || 0) * 0.04;
      if (!state?.player) {
        return baseDelay + slowPenalty;
      }
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) {
        return baseDelay + slowPenalty;
      }
      const currentTile = getTile(state.player.x, state.player.y);
      const nextTile = getTile(state.player.x + dx, state.player.y + dy);
      if (currentTile?.type === 'rail' && nextTile?.type === 'rail') {
        return RAIL_MOVE_DELAY + slowPenalty;
      }
      return baseDelay + slowPenalty;
    }

    function attemptMove(dx, dy, ignoreCooldown = false) {
      if (state.ui.respawnActive) return;
      if (state.ui.dimensionTransition) return;
      const now = performance.now();
      const delay = getMovementDelay(dx, dy);
      if (!ignoreCooldown && now - state.lastMoveAt < delay * 1000) return;
      const nx = state.player.x + dx;
      const ny = state.player.y + dy;
      if (!isWalkable(nx, ny)) {
        state.player.facing = { x: dx, y: dy };
        return;
      }
      const from = { x: state.player.x, y: state.player.y };
      state.player.x = nx;
      state.player.y = ny;
      state.player.facing = { x: dx, y: dy };
      state.lastMoveAt = now;
      dismissMovementHint();
      playFootstepSound();
      const tile = getTile(nx, ny);
      if (tile?.hazard) {
        applyDamage(0.5);
        logEvent('Hazard burns you!');
      }
      for (const hook of state.hooks.onMove) {
        hook(state, from, { x: nx, y: ny }, { dx, dy });
      }
    }

    function createMiningOverlay(tileX, tileY) {
      const canvas = document.createElement('canvas');
      canvas.width = MINING_OVERLAY_SIZE;
      canvas.height = MINING_OVERLAY_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
      material.opacity = 0.92;
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(1.08, 1.08, 1);
      sprite.position.set(0, tileSurfaceHeight(tileX, tileY) + 0.9, 0);
      sprite.renderOrder = 5;
      const crackAngles = Array.from({ length: MINING_OVERLAY_CRACK_COUNT }, () => Math.random() * Math.PI * 2);
      return { sprite, texture, ctx, crackAngles, lastProgress: -1 };
    }

    function updateMiningOverlayVisual(state, progress) {
      if (!state?.overlay) return;
      const overlay = state.overlay;
      const { sprite, ctx, texture, crackAngles } = overlay;
      const size = MINING_OVERLAY_SIZE;
      const center = size / 2;
      overlay.lastProgress = progress;
      ctx.clearRect(0, 0, size, size);
      const baseAlpha = 0.22 + progress * 0.28;
      ctx.fillStyle = `rgba(18, 12, 8, ${baseAlpha})`;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = `rgba(34, 26, 20, ${0.45 + progress * 0.4})`;
      ctx.lineWidth = 2.2;
      crackAngles.forEach((angle, index) => {
        const length = center * (0.38 + progress * 0.48 + (index % 3) * 0.05);
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.lineTo(center + Math.cos(angle) * length, center + Math.sin(angle) * length);
        ctx.stroke();
      });
      ctx.strokeStyle = `rgba(255, 240, 210, ${0.16 + progress * 0.28})`;
      ctx.lineWidth = 1.1;
      crackAngles.forEach((angle, index) => {
        if (index % 2 !== 0) return;
        const length = center * (0.24 + progress * 0.35);
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.lineTo(center + Math.cos(angle + 0.18) * length, center + Math.sin(angle + 0.18) * length);
        ctx.stroke();
      });
      const barWidth = size * 0.62;
      const barHeight = size * 0.08;
      const barX = (size - barWidth) / 2;
      const barY = size * 0.82;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = 'rgba(255, 220, 160, 0.85)';
      ctx.fillRect(barX, barY, barWidth * THREE.MathUtils.clamp(progress, 0, 1), barHeight);
      texture.needsUpdate = true;
      sprite.position.y = tileSurfaceHeight(state.tileX, state.tileY) + 0.9;
    }

    function clearMiningState() {
      if (!miningState) return;
      const overlay = miningState.overlay;
      if (overlay?.sprite) {
        overlay.sprite.parent?.remove(overlay.sprite);
        overlay.sprite.material?.map?.dispose?.();
        overlay.sprite.material?.dispose?.();
      }
      miningState = null;
    }

    function beginMining(tile, tileX, tileY) {
      if (!tile?.resource) return;
      if (tile.data?.yield !== undefined && tile.data.yield <= 0) {
        logEvent('Resource depleted.');
        return;
      }
      if (tile.resource === 'stone' && !hasItem('stone-pickaxe')) {
        logEvent('You need a Stone Pickaxe.');
        return;
      }
      const now = performance?.now ? performance.now() : Date.now();
      const dustColor = tile.resource === 'wood' ? '#f6c766' : '#b7bbc4';
      if (!miningState || miningState.tileX !== tileX || miningState.tileY !== tileY) {
        clearMiningState();
        const renderInfo = tileRenderState?.[tileY]?.[tileX];
        if (!renderInfo?.group) return;
        const overlay = createMiningOverlay(tileX, tileY);
        renderInfo.group.add(overlay.sprite);
        miningState = {
          tileX,
          tileY,
          resource: tile.resource,
          overlay,
          startTime: now,
          duration: MINING_DURATION_MS,
          dustColor,
        };
      } else {
        miningState.startTime = now;
        miningState.overlay.lastProgress = -1;
        miningState.dustColor = dustColor;
      }
      spawnBlockDustParticles(tileX, tileY, dustColor);
      triggerPlayerActionAnimation('mine', {
        direction: state.player?.facing,
        strength: tile.resource === 'stone' ? 1.25 : 1,
      });
    }

    function interact(useAlt = false, echoed = false) {
      if (state.ui.respawnActive) return;
      if (state.ui.dimensionTransition) return;
      const facingX = state.player.x + state.player.facing.x;
      const facingY = state.player.y + state.player.facing.y;
      const frontTile = getTile(facingX, facingY);
      const currentTile = getTile(state.player.x, state.player.y);
      const tile = frontTile ?? currentTile;
      const tx = frontTile ? facingX : state.player.x;
      const ty = frontTile ? facingY : state.player.y;
      if (!tile) return;
      if (tile.type === 'portalDormant') {
        logEvent('The frame is inert. Ignite it to stabilise.');
        return;
      }
      if (tile.type === 'portal' && !state.victory) {
        enterPortalAt(tx, ty);
        return;
      }
      if (tile.type === 'portalFrame') {
        ignitePortal(tx, ty);
        return;
      }
      if (tile.type === 'chest') {
        openChest(tile, tx, ty);
        return;
      }
      if (tile.resource) {
        harvestResource(tile, tx, ty, echoed);
        return;
      }
      if (!echoed) {
        for (const hook of state.hooks.onAction) {
          hook(state, (fromEcho) => interact(useAlt, true));
        }
      }
    }

    function harvestResource(tile, x, y, echoed, options = {}) {
      const { skipParticles = false, skipAudio = false, skipAnimation = false } = options;
      if (tile.data?.yield === undefined) tile.data.yield = 1;
      if (tile.data.yield <= 0) {
        logEvent('Resource depleted.');
        return;
      }
      const originalType = tile.type;
      const itemId = tile.resource;
      if (itemId === 'chest') {
        openChest(tile, x, y);
        return;
      }
      if (itemId === 'stone' && !hasItem('stone-pickaxe')) {
        logEvent('You need a Stone Pickaxe.');
        return;
      }
      if (!skipAnimation) {
        triggerPlayerActionAnimation('mine', {
          direction: state.player?.facing,
          strength: itemId === 'stone' ? 1.25 : 1,
          audioResourceId: skipAudio ? null : itemId,
          skipAudio,
        });
      } else if (!skipAudio) {
        playHarvestAudio(itemId);
      }
      tile.data.yield -= 1;
      addItemToInventory(itemId, 1);
      logEvent(`Gathered ${ITEM_DEFS[itemId]?.name ?? itemId}.`);
      if (itemId === 'wood') {
        markObjectiveComplete('gather-wood');
      }
      const accentColor = TILE_TYPES[originalType]?.accent ?? '#ffffff';
      if (!skipParticles) {
        spawnHarvestParticles(x, y, accentColor);
      }
      if (tile.data.yield <= 0 && tile.type !== 'tar') {
        tile.type = 'grass';
        tile.resource = null;
      }
      markTileDirty(x, y);
      if (!echoed) {
        for (const hook of state.hooks.onAction) {
          hook(state, (fromEcho) => harvestResource(tile, x, y, true));
        }
      }
    }

    function ensurePortalState(tile) {
      if (!tile) return null;
      if (!tile.portalState) {
        tile.portalState = { activation: 0, transition: 0 };
      }
      return tile.portalState;
    }

    function setDimensionTransitionOverlay(active) {
      if (!dimensionTransitionEl) return;
      if (active) {
        dimensionTransitionEl.setAttribute('data-active', 'true');
      } else {
        dimensionTransitionEl.setAttribute('data-active', 'false');
        dimensionTransitionEl.style.setProperty('--build', '0');
        dimensionTransitionEl.style.setProperty('--fade', '0');
      }
    }

    function updateTransitionOverlay(build, fade) {
      if (!dimensionTransitionEl) return;
      const clampedBuild = Number.isFinite(build) ? THREE.MathUtils.clamp(build, 0, 1) : 0;
      const clampedFade = Number.isFinite(fade) ? THREE.MathUtils.clamp(fade, 0, 1) : 0;
      dimensionTransitionEl.style.setProperty('--build', clampedBuild.toFixed(3));
      dimensionTransitionEl.style.setProperty('--fade', clampedFade.toFixed(3));
    }

    function beginDimensionTransition(portal, fromId, toId) {
      if (!portal || !toId) return;
      if (state.ui.dimensionTransition) return;
      const portalTiles = portal.tiles
        .map(({ x, y }) => ({ x, y, tile: getTile(x, y) }))
        .filter((entry) => entry.tile);
      portalTiles.forEach(({ tile }) => {
        const portalState = ensurePortalState(tile);
        if (portalState) {
          portalState.transition = 0;
        }
      });
      state.ui.dimensionTransition = {
        portal,
        from: fromId,
        to: toId,
        stage: 'build',
        stageStart: state.elapsed,
        portalTiles,
        loaded: false,
      };
      setDimensionTransitionOverlay(true);
      updateTransitionOverlay(0, 0);
      logEvent(`Stabilising bridge to ${DIMENSIONS[toId]?.name ?? toId}...`);
    }

    function clearTransitionPortalTiles(transition) {
      if (!transition?.portalTiles) return;
      transition.portalTiles.forEach(({ tile }) => {
        const portalState = ensurePortalState(tile);
        if (portalState) {
          portalState.transition = 0;
        }
      });
      transition.portalTiles = [];
    }

    function enterPortalAt(x, y) {
      const portal = state.portals.find((p) =>
        p.tiles.some((t) => t.x === x && t.y === y)
      );
      if (!portal) {
        logEvent('Portal hums but is not linked.');
        return;
      }
      if (!portal.active) {
        const tile = getTile(x, y);
        const activation = tile?.portalState?.activation ?? 0;
        if (activation < 0.99) {
          logEvent('Portal is calibrating. Give it a moment to stabilise.');
        } else {
          logEvent('Portal is dormant. Ignite it first.');
        }
        return;
      }
      if (portal.destination === 'netherite' && state.dimension.id === 'netherite') {
        state.victory = true;
        addItemToInventory('eternal-ingot', 1);
        logEvent('You seize the Eternal Ingot! Return home victorious.');
        renderVictoryBanner();
        updateDimensionCodex();
        return;
      }
      if (state.ui.dimensionTransition) {
        return;
      }
      const currentId = state.dimension.id;
      let targetId = null;
      if (currentId === portal.origin && portal.destination) {
        targetId = portal.destination;
      } else if (currentId === portal.destination && portal.origin) {
        targetId = portal.origin;
      }
      if (targetId) {
        beginDimensionTransition(portal, currentId, targetId);
        return;
      }
    }

    function ignitePortal(x, y) {
      if (!hasItem('portal-igniter') && !hasItem('torch')) {
        logEvent('You need a Portal Igniter or Torch.');
        return;
      }
      const frame = state.portals.find((portal) => portal.frame.some((f) => f.x === x && f.y === y));
      if (!frame) {
        logEvent('Frame incomplete.');
        return;
      }
      if (frame.active) {
        logEvent('Portal already active.');
        return;
      }
      if (frame.activation) {
        logEvent('Portal is already igniting.');
        return;
      }
      frame.active = false;
      let activationMethod = 'igniter';
      if (hasItem('portal-igniter')) {
        removeItem('portal-igniter', 1);
      } else {
        activationMethod = 'torch';
        removeItem('torch', 1);
      }
      frame.activation = {
        start: state.elapsed,
        duration: PORTAL_ACTIVATION_DURATION,
        method: activationMethod,
        shaderPrimed: activationMethod === 'torch',
      };
      frame.announcedActive = false;
      frame.tiles.forEach(({ x: tx, y: ty }) => {
        const tile = getTile(tx, ty);
        if (tile) {
          tile.type = 'portal';
          const portalState = ensurePortalState(tile);
          if (portalState) {
            const primedActivation = activationMethod === 'torch' ? 0.35 : 0;
            portalState.activation = primedActivation;
            portalState.transition = 0;
            if (activationMethod === 'torch') {
              portalState.shaderActive = true;
            }
          }
          markTileDirty(tx, ty);
        }
      });
      if (activationMethod === 'torch') {
        logEvent(`${frame.label} drinks in the torchlight.`);
      } else {
        logEvent(`${frame.label} begins to awaken.`);
      }
      updatePortalProgress();
    }

    function buildPortal(material) {
      const itemId = material;
      const requirement = 12;
      if (!hasItem(itemId, requirement)) {
        logEvent(`Need ${requirement} ${ITEM_DEFS[itemId]?.name ?? itemId}.`);
        return;
      }
      const framePositions = computePortalFrame(state.player.x, state.player.y, state.player.facing);
      if (!framePositions) {
        logEvent('Not enough space for portal frame.');
        return;
      }
      const collisions = detectPortalCollisions(framePositions);
      if (collisions.length > 0) {
        logEvent('Portal frame obstructed. Clear the area first.');
        return;
      }
      removeItem(itemId, requirement);
      const portal = {
        material,
        frame: framePositions.frame,
        tiles: framePositions.portal,
        active: false,
        activation: null,
        announcedActive: false,
        label: `${DIMENSIONS[material]?.name ?? material} Portal`,
        origin: state.dimension.id,
        destination: material,
      };
      portal.frame.forEach(({ x, y }) => {
        const tile = getTile(x, y);
        if (tile) {
          tile.type = 'portalFrame';
          markTileDirty(x, y);
        }
      });
      portal.tiles.forEach(({ x, y }) => {
        const tile = getTile(x, y);
        if (tile) {
          tile.type = 'portalDormant';
          const portalState = ensurePortalState(tile);
          if (portalState) {
            portalState.activation = 0;
            portalState.transition = 0;
          }
          markTileDirty(x, y);
        }
      });
      state.portals.push(portal);
      state.unlockedDimensions.add(material);
      updateDimensionCodex();
      updatePortalProgress();
      logEvent(`Constructed ${portal.label}. Ignite to travel.`);
    }

    function spawnReturnPortal(targetDimension, currentDimension) {
      const cx = clamp(Math.floor(state.width / 2), 2, state.width - 3);
      const cy = clamp(Math.floor(state.height / 2), 2, state.height - 3);
      const footprint = computePortalFrame(cx, cy, { x: 0, y: 1 });
      if (!footprint) return;
      const { frame, portal } = footprint;
      frame.forEach(({ x, y }) => {
        const tile = getTile(x, y);
        if (tile) {
          tile.type = 'portalFrame';
          markTileDirty(x, y);
        }
      });
      portal.forEach(({ x, y }) => {
        const tile = getTile(x, y);
        if (tile) {
          tile.type = 'portal';
          const portalState = ensurePortalState(tile);
          if (portalState) {
            portalState.activation = 1;
            portalState.transition = 0;
          }
          markTileDirty(x, y);
        }
      });
      state.portals.push({
        material: targetDimension,
        frame,
        tiles: portal,
        active: true,
        activation: null,
        announcedActive: true,
        origin: currentDimension,
        destination: targetDimension,
        label: `Return to ${DIMENSIONS[targetDimension]?.name ?? targetDimension}`,
      });
      logEvent('A stabilised return gate anchors nearby.');
    }

    function computePortalFrame(px, py, facing) {
      const orientation = Math.abs(facing.x) > Math.abs(facing.y) ? 'vertical' : 'horizontal';
      const frame = [];
      const portal = [];
      const width = orientation === 'vertical' ? 3 : 4;
      const height = orientation === 'vertical' ? 4 : 3;
      const offsetX = Math.floor((width - 1) / 2);
      const offsetY = Math.floor((height - 1) / 2);
      const startX = px - offsetX;
      const startY = py - offsetY;
      for (let dy = 0; dy < height; dy += 1) {
        for (let dx = 0; dx < width; dx += 1) {
          const x = startX + dx;
          const y = startY + dy;
          if (!isWithinBounds(x, y)) {
            return null;
          }
          const isBorder = dx === 0 || dx === width - 1 || dy === 0 || dy === height - 1;
          if (isBorder) {
            frame.push({ x, y });
          } else {
            portal.push({ x, y });
          }
        }
      }
      return { frame, portal, dimensions: { width, height } };
    }

    function isPortalPlacementBlocked(tile) {
      if (!tile) return true;
      if (tile.type === 'portal' || tile.type === 'portalDormant' || tile.type === 'portalFrame') {
        return true;
      }
      if (tile.hazard) {
        return true;
      }
      const def = TILE_TYPES[tile.type];
      if (def?.walkable === false) {
        return true;
      }
      return false;
    }

    function detectPortalCollisions(footprint) {
      if (!footprint) return [{ reason: 'invalid' }];
      const collisions = [];
      const positions = [...(footprint.frame ?? []), ...(footprint.portal ?? [])];
      for (const { x, y } of positions) {
        const tile = getTile(x, y);
        if (!tile) {
          collisions.push({ x, y, reason: 'missing' });
          continue;
        }
        if (state.player && state.player.x === x && state.player.y === y) {
          collisions.push({ x, y, reason: 'player' });
          continue;
        }
        if (isPortalPlacementBlocked(tile)) {
          collisions.push({ x, y, reason: tile.type });
        }
      }
      return collisions;
    }

    function updatePortalActivation() {
      if (!state.portals.length) return;
      const now = state.elapsed;
      for (const portal of state.portals) {
        if (portal.activation) {
          const duration = portal.activation.duration ?? PORTAL_ACTIVATION_DURATION;
          const progress = duration > 0 ? THREE.MathUtils.clamp((now - portal.activation.start) / duration, 0, 1) : 1;
          portal.activation.progress = progress;
          const shaderPrimed = Boolean(portal.activation.shaderPrimed);
          portal.tiles.forEach(({ x, y }) => {
            const tile = getTile(x, y);
            if (!tile) return;
            const portalState = ensurePortalState(tile);
            if (portalState) {
              const activationLevel = shaderPrimed ? Math.max(progress, 0.35) : progress;
              portalState.activation = Math.max(portalState.activation ?? 0, activationLevel);
              if (shaderPrimed) {
                portalState.shaderActive = true;
              }
            }
            if (tile.type !== 'portal') {
              tile.type = 'portal';
              markTileDirty(x, y);
            }
          });
          if (progress >= 1) {
            portal.active = true;
            portal.activation = null;
            portal.tiles.forEach(({ x, y }) => {
              const tile = getTile(x, y);
              if (!tile) return;
              const portalState = ensurePortalState(tile);
              if (portalState) {
                portalState.activation = 1;
                if (shaderPrimed) {
                  portalState.shaderActive = true;
                }
              }
              markTileDirty(x, y);
            });
            if (!portal.announcedActive) {
              logEvent(`Portal active: ${portal.label}.`);
              portal.announcedActive = true;
            }
          }
        } else if (portal.active) {
          portal.tiles.forEach(({ x, y }) => {
            const tile = getTile(x, y);
            if (!tile) return;
            const portalState = ensurePortalState(tile);
            if (portalState) {
              portalState.activation = Math.max(portalState.activation ?? 1, 1);
            }
          });
        }
      }
    }

    function isWithinBounds(x, y) {
      return x >= 1 && y >= 1 && x < state.width - 1 && y < state.height - 1;
    }

    function updatePortalProgress() {
      if (!state.dimension) return;
      const totalStages = DIMENSION_SEQUENCE.length;
      const documentedCount = Math.min(scoreState.dimensions.size, totalStages - 1);
      const visitedCount = clamp(documentedCount + 1, 1, totalStages);
      const ratio = clamp(visitedCount / totalStages, 0, 1);
      if (!portalProgressEl || !portalProgressBar || !portalProgressLabel) {
        return;
      }
      portalProgressEl.classList.add('visible');
      portalProgressBar.style.setProperty('--progress', ratio.toFixed(3));
      const nextIndex = Math.min(visitedCount, totalStages - 1);
      const nextDim = DIMENSION_SEQUENCE[nextIndex];
      const nextName = visitedCount >= totalStages ? 'Multiverse Stabilised' : DIMENSIONS[nextDim]?.name ?? nextDim;
      portalProgressLabel.textContent = `${visitedCount}/${totalStages} - ${state.dimension.name.toUpperCase()}`;
      const progressPercent = Math.round(ratio * 100);
      portalProgressEl.setAttribute('aria-valuenow', progressPercent.toString());
      portalProgressEl.setAttribute(
        'aria-valuetext',
        visitedCount >= totalStages
          ? 'All dimensions stabilised. The multiverse is secure.'
          : `${progressPercent}% progress — next objective: ${nextName}.`,
      );
      portalProgressEl.title = visitedCount >= totalStages ? 'All portals secure.' : `Next: ${nextName}`;
    }

    function updateDimensionTransition(delta) {
      const transition = state.ui.dimensionTransition;
      if (!transition) return;
      const now = state.elapsed;
      if (transition.stage === 'build') {
        const progress = Math.min(1, (now - transition.stageStart) / PORTAL_TRANSITION_BUILDUP);
        transition.progress = progress;
        transition.portalTiles?.forEach(({ tile }) => {
          const portalState = ensurePortalState(tile);
          if (portalState) {
            portalState.transition = progress;
          }
        });
        updateTransitionOverlay(progress, 0);
        if (progress >= 1) {
          transition.stage = 'fade-out';
          transition.stageStart = now;
        }
        return;
      }
      if (transition.stage === 'fade-out') {
        const progress = Math.min(1, (now - transition.stageStart) / PORTAL_TRANSITION_FADE);
        updateTransitionOverlay(1, progress);
        if (progress >= 1 && !transition.loaded) {
          clearTransitionPortalTiles(transition);
          transition.loaded = true;
          const targetId = transition.to;
          const fromId = transition.from;
          loadDimension(targetId, fromId);
          transition.stage = 'fade-in';
          transition.stageStart = state.elapsed;
          updateTransitionOverlay(0, 1);
        }
        return;
      }
      if (transition.stage === 'fade-in') {
        const progress = Math.min(1, (now - transition.stageStart) / PORTAL_TRANSITION_FADE);
        updateTransitionOverlay(0, Math.max(0, 1 - progress));
        if (progress >= 1) {
          setDimensionTransitionOverlay(false);
          state.ui.dimensionTransition = null;
        }
      }
    }

    function ensureCraftingDragElements() {
      if (!craftingDragGhost) {
        craftingDragGhost = document.createElement('div');
        craftingDragGhost.className = 'crafting-drag-ghost';
        craftingDragGhost.setAttribute('aria-hidden', 'true');
        document.body.appendChild(craftingDragGhost);
      }
      if (!craftingDragTrailEl) {
        craftingDragTrailEl = document.createElement('div');
        craftingDragTrailEl.className = 'crafting-drag-trail';
        craftingDragTrailEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(craftingDragTrailEl);
      }
    }

    function showCraftingDragGhost(itemId, available, x, y) {
      ensureCraftingDragElements();
      if (!craftingDragGhost) return;
      const name = ITEM_DEFS[itemId]?.name ?? itemId;
      craftingDragGhost.innerHTML = '';
      const title = document.createElement('span');
      title.className = 'crafting-drag-ghost__title';
      title.textContent = name;
      const quantity = document.createElement('span');
      quantity.className = 'crafting-drag-ghost__quantity';
      quantity.textContent = `Available ×${available}`;
      craftingDragGhost.append(title, quantity);
      craftingDragGhost.dataset.visible = 'true';
      positionCraftingDragGhost(x, y);
    }

    function positionCraftingDragGhost(x, y) {
      if (!craftingDragGhost) return;
      craftingDragGhost.style.left = `${x}px`;
      craftingDragGhost.style.top = `${y}px`;
    }

    function spawnCraftingDragTrail(x, y) {
      if (!craftingDragTrailEl) return;
      const particle = document.createElement('span');
      particle.className = 'crafting-drag-trail__particle';
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      craftingDragTrailEl.appendChild(particle);
      window.setTimeout(() => {
        particle.remove();
      }, 420);
    }

    function clearCraftingDragElements() {
      craftingDragGhost?.removeAttribute('data-visible');
      craftingDragTrailEl?.replaceChildren();
      document.body.removeAttribute('data-crafting-drag');
    }

    function determineFallbackSlotIndex() {
      const emptyIndex = craftSlots.findIndex(({ button }) => button.classList.contains('empty'));
      if (emptyIndex !== -1) return emptyIndex;
      if (state.craftSequence.length > 0) {
        return Math.min(state.craftSequence.length - 1, MAX_CRAFT_SLOTS - 1);
      }
      return 0;
    }

    function updateCraftSlotDragHighlight(index) {
      craftSlots.forEach(({ button }) => button.classList.remove('craft-slot--target'));
      const resolvedIndex = typeof index === 'number' && !Number.isNaN(index) ? index : dragFallbackSlotIndex;
      if (typeof resolvedIndex === 'number' && resolvedIndex >= 0 && resolvedIndex < craftSlots.length) {
        craftSlots[resolvedIndex]?.button.classList.add('craft-slot--target');
      }
    }

    function clearCraftSlotDragHighlight() {
      craftSlots.forEach(({ button }) => button.classList.remove('craft-slot--target'));
      dragFallbackSlotIndex = null;
    }

    function beginInventoryDrag(event, itemId, availableQuantity) {
      if (!craftSequenceEl) return;
      ensureCraftingDragElements();
      activeInventoryDrag = {
        pointerId: event.pointerId,
        itemId,
        available: availableQuantity,
        sourceEl: event.currentTarget,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.dataset.active = 'true';
      }
      dragFallbackSlotIndex = determineFallbackSlotIndex();
      showCraftingDragGhost(itemId, availableQuantity, event.clientX, event.clientY);
      document.body.dataset.craftingDrag = 'true';
      updateCraftSlotDragHighlight(null);
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (error) {
          console.warn('Unable to set pointer capture for crafting drag.', error);
        }
      }
      window.addEventListener('pointermove', handleInventoryDragMove);
      window.addEventListener('pointerup', handleInventoryDragEnd);
      window.addEventListener('pointercancel', handleInventoryDragEnd);
    }

    function handleInventoryDragMove(event) {
      if (!activeInventoryDrag || event.pointerId !== activeInventoryDrag.pointerId) return;
      const dx = event.clientX - activeInventoryDrag.startX;
      const dy = event.clientY - activeInventoryDrag.startY;
      if (!activeInventoryDrag.moved && Math.hypot(dx, dy) > 6) {
        activeInventoryDrag.moved = true;
      }
      positionCraftingDragGhost(event.clientX, event.clientY);
      spawnCraftingDragTrail(event.clientX, event.clientY);
      const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
      const slotEl = hoveredElement?.closest('[data-craft-slot]');
      if (slotEl) {
        const slotIndex = Number(slotEl.dataset.craftSlot);
        if (!Number.isNaN(slotIndex)) {
          updateCraftSlotDragHighlight(slotIndex);
          return;
        }
      }
      if (hoveredElement?.closest('.crafting-sequence')) {
        updateCraftSlotDragHighlight(dragFallbackSlotIndex);
      } else {
        updateCraftSlotDragHighlight(null);
      }
    }

    function handleInventoryDragEnd(event) {
      if (!activeInventoryDrag || event.pointerId !== activeInventoryDrag.pointerId) return;
      const dragContext = activeInventoryDrag;
      activeInventoryDrag = null;
      window.removeEventListener('pointermove', handleInventoryDragMove);
      window.removeEventListener('pointerup', handleInventoryDragEnd);
      window.removeEventListener('pointercancel', handleInventoryDragEnd);
      if (dragContext.sourceEl && typeof dragContext.sourceEl.releasePointerCapture === 'function') {
        try {
          dragContext.sourceEl.releasePointerCapture(event.pointerId);
        } catch (error) {
          console.warn('Unable to release pointer capture for crafting drag.', error);
        }
      }
      if (dragContext.sourceEl instanceof HTMLElement) {
        dragContext.sourceEl.removeAttribute('data-active');
      }
      const dropElement = document.elementFromPoint(event.clientX, event.clientY);
      let dropIndex = null;
      const slotEl = dropElement?.closest('[data-craft-slot]');
      if (slotEl) {
        const slotIndex = Number(slotEl.dataset.craftSlot);
        if (!Number.isNaN(slotIndex)) {
          dropIndex = slotIndex;
        }
      } else if (dropElement?.closest('.crafting-sequence')) {
        dropIndex = dragFallbackSlotIndex;
      }
      let handled = false;
      if (typeof dropIndex === 'number' && dropIndex >= 0) {
        handled = placeItemInCraftSequence(dragContext.itemId, dropIndex);
      } else if (!dragContext.moved) {
        addToCraftSequence(dragContext.itemId);
        handled = true;
      }
      if (handled && dragContext.sourceEl) {
        inventoryClickBypass.add(dragContext.sourceEl);
      }
      clearCraftingDragElements();
      clearCraftSlotDragHighlight();
    }

    function clearCraftSequenceErrorState() {
      if (!craftSequenceEl) return;
      craftSequenceEl.classList.remove('crafting-sequence--error', 'crafting-sequence--shake');
      if (craftSequenceErrorTimeout) {
        window.clearTimeout(craftSequenceErrorTimeout);
        craftSequenceErrorTimeout = null;
      }
    }

    function triggerCraftSequenceError() {
      if (!craftSequenceEl) return;
      craftSequenceEl.classList.add('crafting-sequence--error', 'crafting-sequence--shake');
      if (craftSequenceErrorTimeout) {
        window.clearTimeout(craftSequenceErrorTimeout);
      }
      craftSequenceErrorTimeout = window.setTimeout(() => {
        craftSequenceEl.classList.remove('crafting-sequence--shake');
      }, 450);
    }

    function addToCraftSequence(itemId) {
      if (!craftSequenceEl) return;
      if (state.craftSequence.length >= MAX_CRAFT_SLOTS) {
        logEvent('Sequence is full. Craft or clear before adding more steps.');
        triggerCraftSequenceError();
        return;
      }
      clearCraftSequenceErrorState();
      state.craftSequence.push(itemId);
      updateCraftSequenceDisplay();
      flagProgressDirty('craft');
    }

    function placeItemInCraftSequence(itemId, slotIndex) {
      if (!craftSequenceEl) return false;
      if (slotIndex < 0 || slotIndex >= MAX_CRAFT_SLOTS) return false;
      clearCraftSequenceErrorState();
      if (slotIndex < state.craftSequence.length) {
        state.craftSequence[slotIndex] = itemId;
      } else {
        if (state.craftSequence.length >= MAX_CRAFT_SLOTS) {
          triggerCraftSequenceError();
          return false;
        }
        state.craftSequence.push(itemId);
      }
      updateCraftSequenceDisplay();
      flagProgressDirty('craft');
      return true;
    }

    function initializeCraftSlots() {
      if (!craftSequenceEl) return;
      craftSequenceEl.innerHTML = '';
      craftSlots.length = 0;
      const slotCount = Number(craftSequenceEl.dataset.slotCount) || MAX_CRAFT_SLOTS;
      for (let i = 0; i < Math.min(slotCount, MAX_CRAFT_SLOTS); i++) {
        const slotButton = document.createElement('button');
        slotButton.type = 'button';
        slotButton.className = 'craft-slot empty';
        slotButton.dataset.craftSlot = i.toString();
        const indexLabel = document.createElement('span');
        indexLabel.className = 'craft-slot__index';
        indexLabel.textContent = String(i + 1);
        const contentLabel = document.createElement('span');
        contentLabel.className = 'craft-slot__label';
        contentLabel.textContent = 'Empty';
        slotButton.append(indexLabel, contentLabel);
        slotButton.addEventListener('click', () => {
          if (state.craftSequence.length <= i) return;
          state.craftSequence.splice(i, 1);
          clearCraftSequenceErrorState();
          updateCraftSequenceDisplay();
          flagProgressDirty('craft');
        });
        craftSequenceEl.appendChild(slotButton);
        craftSlots.push({ button: slotButton, label: contentLabel });
      }
      updateCraftSequenceDisplay();
    }

    function updateCraftSequenceDisplay() {
      if (!craftSequenceEl || !craftSlots.length) return;
      const sequenceLength = state.craftSequence.length;
      craftSequenceEl.classList.remove('crafting-sequence--shake');
      craftSlots.forEach(({ button, label }, index) => {
        const itemId = state.craftSequence[index];
        if (itemId) {
          const itemName = ITEM_DEFS[itemId]?.name ?? itemId;
          button.classList.add('filled');
          button.classList.remove('empty');
          label.textContent = itemName;
          button.setAttribute('aria-label', `${itemName} in slot ${index + 1}. Click to remove.`);
        } else {
          button.classList.remove('filled');
          button.classList.add('empty');
          label.textContent = 'Empty';
          button.setAttribute('aria-label', `Empty slot ${index + 1}`);
        }
      });
      craftSequenceEl.classList.toggle('full', sequenceLength >= MAX_CRAFT_SLOTS);
      if (craftButton) {
        craftButton.disabled = sequenceLength === 0;
      }
      if (craftLauncherButton) {
        craftLauncherButton.setAttribute('data-sequence', sequenceLength > 0 ? 'active' : 'idle');
      }
      if (activeInventoryDrag) {
        dragFallbackSlotIndex = determineFallbackSlotIndex();
        updateCraftSlotDragHighlight(null);
      } else {
        clearCraftSlotDragHighlight();
      }
    }

    function attemptCraft() {
      if (!state.craftSequence.length) return;
      const recipe = RECIPES.find((r) =>
        r.sequence.length === state.craftSequence.length &&
        r.sequence.every((item, idx) => item === state.craftSequence[idx]) &&
        state.unlockedDimensions.has(r.unlock)
      );
      if (!recipe) {
        logEvent('Sequence fizzles. No recipe matched.');
        triggerCraftSequenceError();
        return;
      }
      const canCraft = recipe.sequence.every((itemId) => hasItem(itemId));
      if (!canCraft) {
        logEvent('Missing ingredients for this recipe.');
        triggerCraftSequenceError();
        return;
      }
      clearCraftSequenceErrorState();
      recipe.sequence.forEach((itemId) => removeItem(itemId, 1));
      addItemToInventory(recipe.output.item, recipe.output.quantity);
      const recipePreviouslyKnown = state.knownRecipes.has(recipe.id);
      state.knownRecipes.add(recipe.id);
      logEvent(`${recipe.name} crafted.`);
      playCraftSuccessChime();
      triggerCraftConfetti();
      const newlyMastered = updateScore('recipe', recipe.id);
      if (!recipePreviouslyKnown && newlyMastered) {
        logEvent(`Recipe mastery recorded (+${SCORE_POINTS.recipe} pts).`);
      }
      if (recipe.id === 'stone-pickaxe' && newlyMastered) {
        markObjectiveComplete('craft-pickaxe');
      }
      if (recipe.output.item === 'portal-igniter') {
        state.player.hasIgniter = true;
      }
      state.craftSequence = [];
      updateCraftSequenceDisplay();
      updateRecipesList();
      updateAutocompleteSuggestions();
      flagProgressDirty('craft');
    }

    function updateRecipesList() {
      if (!recipeListEl) return;
      recipeListEl.innerHTML = '';
      const query = recipeSearchEl?.value?.trim().toLowerCase() ?? '';
      const unlockedRecipes = RECIPES.filter((recipe) => state.unlockedDimensions.has(recipe.unlock));
      const filtered = unlockedRecipes.filter((recipe) => {
        if (!query) return true;
        const name = recipe.name.toLowerCase();
        const outputName = (ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item).toLowerCase();
        if (name.includes(query) || outputName.includes(query)) return true;
        return recipe.sequence.some((itemId) => (ITEM_DEFS[itemId]?.name ?? itemId).toLowerCase().includes(query));
      });
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'recipe-empty';
        empty.textContent = query
          ? 'No recipes match your search. Try another ingredient.'
          : 'Unlock new dimensions to discover more recipes.';
        recipeListEl.appendChild(empty);
        return;
      }
      filtered.forEach((recipe) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'recipe-card';
        if (state.knownRecipes.has(recipe.id)) {
          button.classList.add('known');
        }
        button.innerHTML = `
          <span class="recipe-card__name">${recipe.name}</span>
          <span class="recipe-card__sequence">${recipe.sequence
            .map((item) => ITEM_DEFS[item]?.name ?? item)
            .join(' → ')}</span>
          <span class="recipe-card__output">Creates ${
            ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item
          } ×${recipe.output.quantity}</span>
        `;
        button.addEventListener('click', () => {
          state.craftSequence = [...recipe.sequence];
          updateCraftSequenceDisplay();
        });
        recipeListEl.appendChild(button);
      });
    }

    function updateAutocompleteSuggestions() {
      if (!craftSuggestionsEl) return;
      const query = recipeSearchEl?.value?.trim().toLowerCase() ?? '';
      craftSuggestionsEl.innerHTML = '';
      if (!query) {
        craftSuggestionsEl.setAttribute('data-visible', 'false');
        if (craftingSearchPanel?.getAttribute('data-open') === 'true') {
          updateCraftingSearchPanelResults();
        }
        return;
      }
      const matches = RECIPES.filter((recipe) => {
        if (!state.unlockedDimensions.has(recipe.unlock)) return false;
        const name = recipe.name.toLowerCase();
        if (name.includes(query)) return true;
        const outputName = (ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item).toLowerCase();
        if (outputName.includes(query)) return true;
        return recipe.sequence.some((itemId) => (ITEM_DEFS[itemId]?.name ?? itemId).toLowerCase().includes(query));
      }).slice(0, 6);
      if (!matches.length) {
        craftSuggestionsEl.setAttribute('data-visible', 'false');
        return;
      }
      matches.forEach((recipe) => {
        const entry = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = recipe.name;
        button.addEventListener('click', () => {
          state.craftSequence = [...recipe.sequence];
          recipeSearchEl.value = recipe.name;
          updateCraftSequenceDisplay();
          updateRecipesList();
          updateAutocompleteSuggestions();
        });
        entry.appendChild(button);
        craftSuggestionsEl.appendChild(entry);
      });
      craftSuggestionsEl.setAttribute('data-visible', 'true');
      if (craftingSearchPanel?.getAttribute('data-open') === 'true') {
        updateCraftingSearchPanelResults();
      }
    }

    function openCraftingSearchPanel() {
      if (!craftingSearchPanel) return;
      craftingSearchPanel.hidden = false;
      craftingSearchPanel.setAttribute('data-open', 'true');
      craftingSearchPanel.setAttribute('aria-hidden', 'false');
      if (craftingSearchInput) {
        craftingSearchInput.value = recipeSearchEl?.value ?? '';
      }
      updateCraftingSearchPanelResults();
      window.setTimeout(() => craftingSearchInput?.focus(), 0);
    }

    function closeCraftingSearchPanel(shouldFocusTrigger = false) {
      if (!craftingSearchPanel) return;
      craftingSearchPanel.hidden = true;
      craftingSearchPanel.setAttribute('data-open', 'false');
      craftingSearchPanel.setAttribute('aria-hidden', 'true');
      if (shouldFocusTrigger) {
        openCraftingSearchButton?.focus();
      }
    }

    function updateCraftingSearchPanelResults() {
      if (!craftingSearchResultsEl) return;
      const query = craftingSearchInput?.value?.trim().toLowerCase() ?? '';
      craftingSearchResultsEl.innerHTML = '';
      const unlockedRecipes = RECIPES.filter((recipe) => state.unlockedDimensions.has(recipe.unlock));
      const matches = unlockedRecipes.filter((recipe) => {
        if (!query) return true;
        const name = recipe.name.toLowerCase();
        if (name.includes(query)) return true;
        const outputName = (ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item).toLowerCase();
        if (outputName.includes(query)) return true;
        return recipe.sequence.some((itemId) => (ITEM_DEFS[itemId]?.name ?? itemId).toLowerCase().includes(query));
      });
      if (!matches.length) {
        const empty = document.createElement('li');
        empty.className = 'crafting-search-panel__empty';
        empty.textContent = query
          ? 'No recipes match this search yet.'
          : 'Unlock more dimensions to expand your library.';
        craftingSearchResultsEl.appendChild(empty);
        return;
      }
      matches.slice(0, 12).forEach((recipe) => {
        const entry = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = `
          <span>${recipe.name}</span>
          <span class="crafting-search-panel__result-subtitle">${recipe.sequence
            .map((item) => ITEM_DEFS[item]?.name ?? item)
            .join(' → ')}</span>
          <span class="crafting-search-panel__result-output">Creates ${
            ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item
          } ×${recipe.output.quantity}</span>
        `;
        button.addEventListener('click', () => {
          state.craftSequence = [...recipe.sequence];
          if (recipeSearchEl) {
            recipeSearchEl.value = recipe.name;
          }
          clearCraftSequenceErrorState();
          updateCraftSequenceDisplay();
          updateRecipesList();
          updateAutocompleteSuggestions();
          closeCraftingSearchPanel(true);
        });
        entry.appendChild(button);
        craftingSearchResultsEl.appendChild(entry);
      });
    }

    function triggerCraftConfetti() {
      if (!craftConfettiEl) return;
      craftConfettiEl.classList.remove('active');
      craftConfettiEl.innerHTML = '';
      const colors = ['#49f2ff', '#f7b733', '#2bc26b', '#ff4976'];
      const pieces = 28;
      for (let i = 0; i < pieces; i++) {
        const piece = document.createElement('span');
        piece.className = 'crafting-confetti__piece';
        piece.style.background = colors[i % colors.length];
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.setProperty('--offset-x', `${(Math.random() * 80 - 40).toFixed(1)}%`);
        piece.style.setProperty('--spin', `${(Math.random() * 720 - 360).toFixed(0)}deg`);
        piece.style.animationDelay = `${Math.random() * 0.25}s`;
        craftConfettiEl.appendChild(piece);
      }
      void craftConfettiEl.offsetWidth;
      craftConfettiEl.classList.add('active');
      if (craftConfettiTimer) {
        clearTimeout(craftConfettiTimer);
      }
      craftConfettiTimer = window.setTimeout(() => {
        craftConfettiEl.classList.remove('active');
        craftConfettiEl.innerHTML = '';
      }, 1600);
    }

    function openChest(tile, x = null, y = null) {
      if (tile.data?.locked && !hasItem(tile.data.required)) {
        logEvent('Chest locked. Requires Rail Key.');
        return;
      }
      tile.type = 'grass';
      tile.resource = null;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        markTileDirty(x, y);
      }
      const lootTable = [
        { item: 'stick', qty: 2 },
        { item: 'spark-crystal', qty: 1 },
        { item: 'tar', qty: 1 },
        { item: 'pattern-crystal', qty: 1 },
        { item: 'rock', qty: 2 },
      ];
      const loot = tile.data?.loot
        ? { item: tile.data.loot, qty: tile.data.quantity ?? 1 }
        : choose(lootTable);
      addItemToInventory(loot.item, loot.qty);
      if (loot.item === 'eternal-ingot') {
        state.player.effects.hasEternalIngot = true;
        logEvent('The Eternal Ingot pulses with limitless energy! Return home.');
        renderVictoryBanner();
        updateDimensionCodex();
      } else {
        logEvent(`Chest yields ${ITEM_DEFS[loot.item]?.name ?? loot.item} ×${loot.qty}.`);
      }
      updateDimensionOverlay();
    }

    function draw() {
      renderScene();
    }

    function initializeKeyBindings(options = {}) {
      const { includeStored = true } = options ?? {};
      const { defaults, base, keyBindings } = buildKeyBindings({ includeStored });
      state.defaultKeyBindings = defaults;
      state.baseKeyBindings = base;
      state.keyBindings = keyBindings;
    }

    function applyKeyBinding(action, keys) {
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
      const fallback = state.baseKeyBindings?.[trimmedAction] ?? [];
      const nextKeys = filteredKeys.length ? filteredKeys : [...fallback];
      const current = state.keyBindings?.[trimmedAction] ?? [];
      if (areKeyListsEqual(current, nextKeys)) {
        return false;
      }
      if (!state.keyBindings) {
        state.keyBindings = {};
      }
      state.keyBindings[trimmedAction] = [...nextKeys];
      return true;
    }

    function persistKeyBindings() {
      persistKeyBindingsToStorage(state.baseKeyBindings ?? {}, state.keyBindings ?? {});
    }

    function setKeyBinding(action, keys, options = {}) {
      const { persist = true } = options ?? {};
      if (typeof action !== 'string' || !action.trim()) {
        return false;
      }
      const normalised = normaliseKeyBindingValue(keys);
      let nextKeys = normalised;
      if (!nextKeys.length) {
        const fallback = state.baseKeyBindings?.[action.trim()] ?? [];
        nextKeys = [...fallback];
      }
      const changed = applyKeyBinding(action.trim(), nextKeys);
      if (changed) {
        if (persist) {
          persistKeyBindings();
        }
        refreshKeyBindingDependentCopy();
      }
      return changed;
    }

    function setKeyBindings(overrides, options = {}) {
      const { persist = true } = options ?? {};
      const normalised = normaliseKeyBindingMap(overrides);
      if (!normalised) {
        return false;
      }
      let changed = false;
      Object.entries(normalised).forEach(([action, keys]) => {
        if (applyKeyBinding(action, [...keys])) {
          changed = true;
        }
      });
      if (changed) {
        if (persist) {
          persistKeyBindings();
        }
        refreshKeyBindingDependentCopy();
      }
      return changed;
    }

    function resetKeyBindings(options = {}) {
      const { persist = true } = options ?? {};
      state.keyBindings = mergeKeyBindingMaps(state.baseKeyBindings ?? {}, null);
      if (persist) {
        persistKeyBindings();
      }
      refreshKeyBindingDependentCopy();
      return cloneKeyBindingMap(state.keyBindings);
    }

    function getKeyBindings() {
      return cloneKeyBindingMap(state.keyBindings);
    }

    function getDefaultKeyBindings() {
      return cloneKeyBindingMap(state.defaultKeyBindings ?? DEFAULT_KEY_BINDINGS);
    }

    function getBindingsForAction(action, options = {}) {
      const { useDefaults = false } = options ?? {};
      const sourceMap = useDefaults
        ? state.defaultKeyBindings ?? DEFAULT_KEY_BINDINGS
        : state.keyBindings ?? DEFAULT_KEY_BINDINGS;
      const binding = sourceMap?.[action];
      if (Array.isArray(binding) && binding.length) {
        return [...binding];
      }
      if (!useDefaults) {
        const base = state.baseKeyBindings?.[action];
        if (Array.isArray(base) && base.length) {
          return [...base];
        }
      }
      const fallback = DEFAULT_KEY_BINDINGS?.[action];
      return Array.isArray(fallback) ? [...fallback] : [];
    }

    function getActionKeyLabels(action, options = {}) {
      const { limit = null, useDefaults = false } = options ?? {};
      const bindings = getBindingsForAction(action, { useDefaults });
      const seen = new Set();
      const labels = [];
      bindings.forEach((code) => {
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

    function collectActionLabels(actions = [], options = {}) {
      const { limitPerAction = null, useDefaults = false } = options ?? {};
      const labels = [];
      const seen = new Set();
      actions.forEach((action) => {
        if (!action) return;
        const actionLabels = getActionKeyLabels(action, { limit: limitPerAction, useDefaults });
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

    function getActionKeySummary(action, options = {}) {
      const { limit = null, fallback = '', useDefaults = false } = options ?? {};
      const labels = getActionKeyLabels(action, { limit, useDefaults });
      return joinKeyLabels(labels, { fallback });
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

    function getMovementKeySets() {
      const actions = ['moveForward', 'moveLeft', 'moveBackward', 'moveRight'];
      const primary = [];
      const secondary = [];
      let hasSecondary = true;
      actions.forEach((action) => {
        const labels = getActionKeyLabels(action);
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

    function getMovementKeySummary(options = {}) {
      const { joiner = ' / ', fallback = '' } = options ?? {};
      const { primary } = getMovementKeySets();
      const filtered = primary.filter((label) => typeof label === 'string' && label.trim());
      if (!filtered.length) {
        return fallback;
      }
      return filtered.join(joiner);
    }

    function escapeHtml(value) {
      if (value == null) {
        return '';
      }
      return `${value}`.replace(/[&<>"']/g, (char) => {
        switch (char) {
          case '&':
            return '&amp;';
          case '<':
            return '&lt;';
          case '>':
            return '&gt;';
          case '"':
            return '&quot;';
          case "'":
            return '&#39;';
          default:
            return char;
        }
      });
    }

    function formatKbdSequence(labels, options = {}) {
      const { joiner = ' / ', fallback = '' } = options ?? {};
      if (!Array.isArray(labels)) {
        return fallback;
      }
      const filtered = labels.filter((label) => typeof label === 'string' && label.trim());
      if (!filtered.length) {
        return fallback;
      }
      return filtered.map((label) => `<kbd>${escapeHtml(label)}</kbd>`).join(joiner);
    }

    function getHotbarRange(options = {}) {
      const { asMarkup = false } = options ?? {};
      const wrap = asMarkup ? (value) => `<kbd>${escapeHtml(value)}</kbd>` : (value) => value;
      const joiner = ' · ';
      const first = getActionKeyLabels('hotbar1', { limit: 1 })[0];
      const last = getActionKeyLabels(`hotbar${HOTBAR_SLOT_COUNT}`, { limit: 1 })[0];
      if (first && last) {
        return `${wrap(first)}–${wrap(last)}`;
      }
      const labels = [];
      for (let slot = 1; slot <= HOTBAR_SLOT_COUNT; slot += 1) {
        const label = getActionKeyLabels(`hotbar${slot}`, { limit: 1 })[0];
        if (!label) {
          continue;
        }
        labels.push(wrap(label));
        if (labels.length >= 3) {
          break;
        }
      }
      if (labels.length) {
        return labels.join(joiner);
      }
      return '';
    }

    function updatePrimerCopy() {
      if (primerHarvestJumpEl) {
        primerHarvestJumpEl.textContent = getActionKeySummary('jump', { fallback: 'Space' });
      }
      if (primerHarvestInteractEl) {
        primerHarvestInteractEl.textContent = getActionKeySummary('interact', { fallback: 'F' });
      }
      if (primerPlaceKeyEl) {
        primerPlaceKeyEl.textContent = getActionKeySummary('placeBlock', { fallback: 'Q' });
      }
      if (primerIgniteKeyEl) {
        primerIgniteKeyEl.textContent = getActionKeySummary('buildPortal', { fallback: 'R' });
      }
    }

    function updateGameBriefingControlsCopy() {
      if (briefingMovementKeysEl) {
        const movementSummary = getMovementKeySummary({ fallback: 'W / A / S / D' });
        briefingMovementKeysEl.textContent = movementSummary || '—';
      }
      if (briefingGatherKeysEl) {
        const gatherLabels = collectActionLabels(['jump', 'interact'], { limitPerAction: 2 });
        const parts = [];
        const keyboardSummary = joinKeyLabels(gatherLabels, { fallback: '' });
        if (keyboardSummary) {
          parts.push(keyboardSummary);
        }
        parts.push('Click');
        briefingGatherKeysEl.textContent = parts.join(' · ');
      }
      if (briefingPlaceKeysEl) {
        const placeLabel = getActionKeySummary('placeBlock', { fallback: 'Q' });
        const igniteLabel = getActionKeySummary('buildPortal', { fallback: 'R' });
        const parts = [];
        if (placeLabel) {
          parts.push(placeLabel);
        }
        if (igniteLabel) {
          parts.push(igniteLabel);
        }
        briefingPlaceKeysEl.textContent = parts.length ? parts.join(' · ') : '—';
      }
    }

    function updatePointerHintMessage() {
      if (!pointerHintEl) {
        return;
      }
      const movementSummary = getMovementKeySummary({ fallback: '' });
      const label = movementSummary
        ? `Click the viewport to capture your mouse, then use ${movementSummary} to move and left-click to mine.`
        : 'Click the viewport to capture your mouse, then use your movement keys to move and left-click to mine.';
      pointerHintEl.textContent = label;
    }

    function updateDesktopControlsSummary() {
      if (!desktopControlsSummaryEl) {
        return;
      }
      const segments = [];
      const movementSummary = getMovementKeySummary({ fallback: '' });
      if (movementSummary) {
        segments.push(`${movementSummary} move`);
      }
      const jumpSummary = getActionKeySummary('jump', { fallback: 'Space' });
      if (jumpSummary) {
        segments.push(`${jumpSummary} jump`);
      }
      const interactSummary = getActionKeySummary('interact', { fallback: 'F' });
      if (interactSummary) {
        segments.push(`${interactSummary} interact/use`);
      }
      const placeSummary = getActionKeySummary('placeBlock', { fallback: 'Q' });
      if (placeSummary) {
        segments.push(`${placeSummary} place block`);
      }
      const igniteSummary = getActionKeySummary('buildPortal', { fallback: 'R' });
      if (igniteSummary) {
        segments.push(`${igniteSummary} ignite portal`);
      }
      const craftingSummary = getActionKeySummary('toggleCrafting', { fallback: 'E' });
      if (craftingSummary) {
        segments.push(`${craftingSummary} crafting`);
      }
      const inventorySummary = getActionKeySummary('toggleInventory', { fallback: 'I' });
      if (inventorySummary) {
        segments.push(`${inventorySummary} inventory`);
      }
      const resetSummary = getActionKeySummary('resetPosition', { fallback: 'T' });
      if (resetSummary) {
        segments.push(`${resetSummary} reset position`);
      }
      const cameraSummary = getActionKeySummary('toggleCameraPerspective', { fallback: 'V' });
      if (cameraSummary) {
        segments.push(`${cameraSummary} toggle view`);
      }
      const closeMenusSummary = getActionKeySummary('closeMenus', { fallback: 'Esc' });
      if (closeMenusSummary) {
        segments.push(`${closeMenusSummary} close menus`);
      }
      const hotbarSummary = getHotbarRange({ asMarkup: false });
      if (hotbarSummary) {
        segments.push(`${hotbarSummary} hotbar`);
      }
      desktopControlsSummaryEl.textContent = segments.join(' · ');
    }

    function updateControlReferenceTable() {
      if (!controlReferenceCells) {
        return;
      }
      const { movement, jump, interact, toggleCrafting, toggleInventory, placeBlock, toggleCameraPerspective, resetPosition, hotbar } =
        controlReferenceCells;
      if (movement) {
        const { primary, secondary } = getMovementKeySets();
        const parts = [];
        if (primary.length) {
          parts.push(formatKbdSequence(primary));
        }
        if (secondary.length) {
          parts.push(`or ${formatKbdSequence(secondary)}`);
        }
        movement.innerHTML = parts.length ? parts.join(' ') : '—';
      }
      if (jump) {
        jump.innerHTML = formatKbdSequence(getActionKeyLabels('jump'), { fallback: '—' });
      }
      if (interact) {
        const keyboard = formatKbdSequence(getActionKeyLabels('interact'), { fallback: '' });
        const segments = [];
        if (keyboard) {
          segments.push(keyboard);
        }
        segments.push('Mouse click');
        interact.innerHTML = segments.join(' / ');
      }
      if (toggleCrafting) {
        toggleCrafting.innerHTML = formatKbdSequence(getActionKeyLabels('toggleCrafting'), { fallback: '—' });
      }
      if (toggleInventory) {
        toggleInventory.innerHTML = formatKbdSequence(getActionKeyLabels('toggleInventory'), { fallback: '—' });
      }
      if (placeBlock) {
        placeBlock.innerHTML = formatKbdSequence(getActionKeyLabels('placeBlock'), { fallback: '—' });
      }
      if (toggleCameraPerspective) {
        toggleCameraPerspective.innerHTML = formatKbdSequence(getActionKeyLabels('toggleCameraPerspective'), { fallback: '—' });
      }
      if (resetPosition) {
        resetPosition.innerHTML = formatKbdSequence(getActionKeyLabels('resetPosition'), { fallback: '—' });
      }
      if (hotbar) {
        const hotbarLabel = getHotbarRange({ asMarkup: true });
        hotbar.innerHTML = hotbarLabel ? `${hotbarLabel} hotbar` : 'Hotbar shortcuts';
      }
    }

    function refreshKeyBindingDependentCopy() {
      updatePrimerCopy();
      updateGameBriefingControlsCopy();
      updateDesktopControlsSummary();
      updateControlReferenceTable();
      updatePointerHintMessage();
      renderGameBriefingSteps();
    }

    function isKeyForAction(action, code) {
      if (!action || !code) {
        return false;
      }
      const binding = state.keyBindings?.[action];
      if (!binding || !binding.length) {
        return false;
      }
      return binding.includes(code);
    }

    function getHotbarSlotFromCode(code) {
      if (!code) {
        return null;
      }
      for (let slot = 1; slot <= HOTBAR_SLOT_COUNT; slot += 1) {
        if (isKeyForAction(`hotbar${slot}`, code)) {
          return slot - 1;
        }
      }
      return null;
    }

    function handleMovementKey(code, pressed, keyFallback = '') {
      const resolvedCode = normaliseEventCode(code, keyFallback);
      let direction = null;
      if (isKeyForAction('moveForward', resolvedCode)) {
        direction = 'forward';
      } else if (isKeyForAction('moveBackward', resolvedCode)) {
        direction = 'backward';
      } else if (isKeyForAction('moveLeft', resolvedCode)) {
        direction = 'left';
      } else if (isKeyForAction('moveRight', resolvedCode)) {
        direction = 'right';
      }
      if (!direction) {
        return false;
      }
      if (!state?.pressedKeys) {
        state.pressedKeys = new Set();
      }
      const wasPressed = state.pressedKeys.has(direction);
      if (pressed) {
        state.pressedKeys.add(direction);
        if (direction === 'forward' && !wasPressed && typeof console !== 'undefined') {
          console.log('Moving forward');
        }
      } else {
        state.pressedKeys.delete(direction);
      }
      return true;
    }

    function findNearestWalkableTile(seeds = []) {
      if (!Array.isArray(seeds) || !seeds.length) {
        return null;
      }
      const queue = [];
      const visited = new Set();
      const push = (x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const ix = Math.round(x);
        const iy = Math.round(y);
        if (!isWithinBounds(ix, iy)) return;
        const key = `${ix},${iy}`;
        if (visited.has(key)) return;
        visited.add(key);
        queue.push({ x: ix, y: iy });
      };
      seeds.forEach((seed) => {
        if (!seed) return;
        push(seed.x, seed.y);
      });
      let index = 0;
      const neighbors = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      while (index < queue.length) {
        const current = queue[index++];
        if (isWalkable(current.x, current.y)) {
          return current;
        }
        neighbors.forEach(([dx, dy]) => push(current.x + dx, current.y + dy));
      }
      return null;
    }

    function resetPlayerPosition(options = {}) {
      if (!state?.player) {
        return false;
      }
      const { log = true } = options ?? {};
      const seeds = [];
      if (Number.isFinite(state.player.x) && Number.isFinite(state.player.y)) {
        seeds.push({ x: state.player.x, y: state.player.y });
      }
      seeds.push({ x: Math.floor(state.width / 2), y: Math.floor(state.height / 2) });
      const safeTile = findNearestWalkableTile(seeds);
      if (!safeTile) {
        console.warn('Unable to locate a safe tile while resetting position.');
        return false;
      }
      state.player.x = safeTile.x;
      state.player.y = safeTile.y;
      state.player.facing = { x: 0, y: 1 };
      state.player.isSliding = false;
      state.player.tarStacks = 0;
      state.player.tarSlowTimer = 0;
      const now = performance?.now ? performance.now() : Date.now();
      state.lastMoveAt = now;
      if (camera) {
        syncCameraToPlayer({ idleBob: 0, walkBob: 0, movementStrength: 0, facing: state.player.facing });
      }
      if (log && typeof logEvent === 'function') {
        logEvent('Rail anchors recalibrated. Position reset.');
      }
      return true;
    }

    function handleKeyDown(event) {
      if (event.repeat) return;
      const rawKey = typeof event.key === 'string' ? event.key : '';
      const code = normaliseEventCode(event.code || '', rawKey);
      const target = event.target;
      if (!state.isRunning && previewState.active) {
        if (isKeyForAction('moveLeft', code) || isKeyForAction('moveRight', code)) {
          const delta = isKeyForAction('moveRight', code) ? PREVIEW_KEY_YAW_DELTA : -PREVIEW_KEY_YAW_DELTA;
          setPreviewYaw(previewState.yaw + delta);
          event.preventDefault();
          return;
        }
        if (code === 'ArrowUp' || code === 'ArrowDown') {
          const delta = code === 'ArrowUp' ? PREVIEW_KEY_YAW_DELTA * 0.5 : -PREVIEW_KEY_YAW_DELTA * 0.5;
          setPreviewPitch(previewState.pitch + delta);
          event.preventDefault();
          return;
        }
      }
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        const allowedInInput =
          isKeyForAction('toggleInventory', code) ||
          isKeyForAction('toggleCrafting', code) ||
          isKeyForAction('closeMenus', code);
        if (!allowedInInput) {
          return;
        }
      }
      if (isInventoryModalOpen()) {
        const allowed = isKeyForAction('toggleInventory', code) || isKeyForAction('closeMenus', code);
        if (!allowed) {
          event.preventDefault();
          return;
        }
      }
      if (state.isRunning && handleMovementKey(code, true, rawKey)) {
        event.preventDefault();
        return;
      }
      if (isKeyForAction('jump', code)) {
        console.log('Jump triggered');
        if (!attemptJump()) {
          interact();
        }
        event.preventDefault();
        return;
      }
      if (isKeyForAction('placeBlock', code)) {
        placeBlock();
        event.preventDefault();
        return;
      }
      if (isKeyForAction('toggleCrafting', code)) {
        toggleCraftingModal({ focusReturn: canvas });
        event.preventDefault();
        return;
      }
      if (isKeyForAction('toggleInventory', code)) {
        const opening = !isInventoryModalOpen();
        toggleInventoryModal({ focusFirstSlot: opening });
        if (!opening) {
          canvas?.focus();
        }
        event.preventDefault();
        return;
      }
      if (isKeyForAction('resetPosition', code)) {
        if (resetPlayerPosition()) {
          event.preventDefault();
        }
        return;
      }
      if (isKeyForAction('toggleCameraPerspective', code)) {
        if (toggleCameraPerspective()) {
          event.preventDefault();
        }
        return;
      }
      if (isKeyForAction('buildPortal', code)) {
        promptPortalBuild();
        event.preventDefault();
        return;
      }
      if (isKeyForAction('interact', code)) {
        interact();
        event.preventDefault();
        return;
      }
      const hotbarSlot = getHotbarSlotFromCode(code);
      if (hotbarSlot !== null) {
        state.player.selectedSlot = hotbarSlot;
        updateInventoryUI();
        event.preventDefault();
      }
    }

    function handleKeyUp(event) {
      const rawKey = typeof event.key === 'string' ? event.key : '';
      const code = normaliseEventCode(event.code || '', rawKey);
      handleMovementKey(code, false, rawKey);
    }

    function placeBlock(targetTile = null) {
      const slot = state.player.inventory[state.player.selectedSlot];
      if (!slot) {
        logEvent('Select a block to place.');
        return false;
      }
      const blockItems = ['wood', 'stone', 'rock', 'tar', 'marble', 'netherite'];
      if (!blockItems.includes(slot.item)) {
        logEvent('Cannot place this item.');
        return false;
      }
      const tx = targetTile?.x ?? state.player.x + state.player.facing.x;
      const ty = targetTile?.y ?? state.player.y + state.player.facing.y;
      if (!isWithinBounds(tx, ty)) return false;
      const tile = getTile(tx, ty);
      if (!tile || tile.type !== 'grass') {
        logEvent('Need an empty tile to place.');
        return false;
      }
      const distance = Math.max(Math.abs(tx - state.player.x), Math.abs(ty - state.player.y));
      if (distance > 1) {
        logEvent('Move closer to place that block.');
        return false;
      }
      tile.type = blockItems.includes(slot.item) ? slot.item : 'grass';
      tile.resource = null;
      if (!tile.data) tile.data = {};
      markTileDirty(tx, ty);
      removeItem(slot.item, 1);
      logEvent(`${ITEM_DEFS[slot.item].name} placed.`);
      return true;
    }

    function promptPortalBuild() {
      const available = ['rock', 'stone', 'tar', 'marble', 'netherite'].filter((material) =>
        hasItem(material, 12) && DIMENSIONS[material]
      );
      if (!available.length) {
        logEvent('Collect more block resources to build a portal.');
        return;
      }
      const material = available[0];
      buildPortal(material);
    }

    function isInventoryModalOpen() {
      return Boolean(inventoryModal && inventoryModal.hidden === false);
    }

    function openInventoryModal(shouldFocusFirstSlot = false) {
      if (!inventoryModal) return;
      if (!inventoryModal.hidden) return;
      inventoryModal.hidden = false;
      inventoryModal.setAttribute('aria-hidden', 'false');
      updateInventoryModalGrid();
      updateInventorySortButtonState();
      updateHotbarExpansionUi();
      if (shouldFocusFirstSlot) {
        window.setTimeout(() => {
          const focusTarget =
            inventoryGridEl?.querySelector('.inventory-modal__slot:not(.inventory-modal__slot--empty)') ||
            inventorySortButton ||
            closeInventoryButton ||
            null;
          focusTarget?.focus();
        }, 0);
      }
    }

    function closeInventoryModal(shouldFocusTrigger = false) {
      if (!inventoryModal) return;
      if (inventoryModal.hidden) return;
      inventoryModal.hidden = true;
      inventoryModal.setAttribute('aria-hidden', 'true');
      updateHotbarExpansionUi();
      if (shouldFocusTrigger) {
        toggleExtendedBtn?.focus();
      }
    }

    function toggleInventoryModal(options = {}) {
      const { focusTrigger = false, focusFirstSlot = false } = options;
      if (isInventoryModalOpen()) {
        closeInventoryModal(focusTrigger);
      } else {
        openInventoryModal(focusFirstSlot);
      }
    }

    function updateFromMobile(action) {
      switch (action) {
        case 'up':
          attemptCameraAlignedMove(1, 0, { snapToRails: true });
          break;
        case 'down':
          attemptCameraAlignedMove(-1, 0, { snapToRails: true });
          break;
        case 'left':
          attemptCameraAlignedMove(0, -1, { snapToRails: true });
          break;
        case 'right':
          attemptCameraAlignedMove(0, 1, { snapToRails: true });
          break;
        case 'action':
          interact();
          break;
        case 'portal':
          promptPortalBuild();
          break;
        default:
          break;
      }
    }

    function updateDimensionUnlocks() {
      state.unlockedDimensions.forEach((dim) => {
        const dimensionIndex = DIMENSION_SEQUENCE.indexOf(dim);
        const nextDim = DIMENSION_SEQUENCE[dimensionIndex + 1];
        if (nextDim) {
          state.unlockedDimensions.add(nextDim);
        }
      });
    }

    function handleVictory() {
      if (!state.victory) return;
      logEvent('Return through your portals to complete the run!');
    }

    function initEventListeners() {
      if (eventListenersBound) {
        return;
      }
      eventListenersBound = true;
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keyup', handleKeyUp);
      document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          if (!craftingModal?.hidden) {
            event.preventDefault();
            openCraftingSearchPanel();
          }
        }
      });
      craftButton?.addEventListener('click', attemptCraft);
      clearCraftButton?.addEventListener('click', () => {
        state.craftSequence = [];
        clearCraftSequenceErrorState();
        updateCraftSequenceDisplay();
        updateAutocompleteSuggestions();
        flagProgressDirty('craft');
      });
      recipeSearchEl?.addEventListener('focus', updateAutocompleteSuggestions);
      recipeSearchEl?.addEventListener('input', () => {
        updateAutocompleteSuggestions();
        updateRecipesList();
      });
      recipeSearchEl?.addEventListener('blur', () => {
        window.setTimeout(() => craftSuggestionsEl?.setAttribute('data-visible', 'false'), 140);
      });
      openCraftingSearchButton?.addEventListener('click', openCraftingSearchPanel);
      closeCraftingSearchButton?.addEventListener('click', () => closeCraftingSearchPanel(true));
      craftingSearchPanel?.addEventListener('click', (event) => {
        if (event.target === craftingSearchPanel) {
          closeCraftingSearchPanel(true);
        }
      });
      craftingSearchInput?.addEventListener('input', updateCraftingSearchPanelResults);
      craftLauncherButton?.addEventListener('click', openCraftingModal);
      toggleExtendedBtn?.addEventListener('click', () => toggleHotbarExpansion());
      inventorySortButton?.addEventListener('click', toggleInventorySortMode);
      initVirtualJoystick();
      if (mobileControls) {
        mobileControls.querySelectorAll('button').forEach((button) => {
          button.addEventListener('click', () => updateFromMobile(button.dataset.action));
        });
      }
      openGuideButton?.addEventListener('click', openGuideModal);
      landingGuideButton?.addEventListener('click', () => {
        openGuideModal();
      });
      openSettingsButton?.addEventListener('click', openSettingsModal);
      toggleSidebarButton?.addEventListener('click', toggleSidebar);
      sidePanelScrim?.addEventListener('click', () => closeSidebar(true));
      document.querySelectorAll('[data-close-sidebar]').forEach((button) => {
        button.addEventListener('click', () => closeSidebar(true));
      });
      window.addEventListener('keydown', (event) => {
        const code = normaliseEventCode(event.code || '', event.key);
        if (!isKeyForAction('closeMenus', code)) return;
        if (inventoryModal && !inventoryModal.hidden) {
          closeInventoryModal(true);
          event.preventDefault();
          return;
        }
        if (sidePanelEl?.classList.contains('open')) {
          closeSidebar(true);
          event.preventDefault();
          return;
        }
        if (settingsModal && !settingsModal.hidden) {
          closeSettingsModal(true);
          event.preventDefault();
          return;
        }
        if (leaderboardModal && !leaderboardModal.hidden) {
          closeLeaderboardModal(true);
          event.preventDefault();
          return;
        }
        if (playerHintEl?.classList.contains('visible')) {
          hidePlayerHint();
        }
        if (gameBriefingEl?.classList.contains('is-visible')) {
          hideGameBriefing();
        }
      });
    }

    function collectDeviceSnapshot() {
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screen: {
          width: window.screen?.width ?? null,
          height: window.screen?.height ?? null,
          pixelRatio: window.devicePixelRatio ?? 1,
        },
      };
    }

    function formatDeviceSnapshot(device) {
      if (!device) return 'Device details pending';
      const platform = device.platform || 'Unknown device';
      const width = device.screen?.width;
      const height = device.screen?.height;
      const ratio = device.screen?.pixelRatio;
      const size = width && height ? `${width}×${height}` : 'unknown size';
      const ratioText = ratio ? ` @${Number(ratio).toFixed(1)}x` : '';
      return `${platform} · ${size}${ratioText}`;
    }

    function formatLocationBadge(location) {
      if (!location) return 'Location unavailable';
      if (location.error) return `Location: ${location.error}`;
      if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
        return `Lat ${location.latitude.toFixed(2)}, Lon ${location.longitude.toFixed(2)}`;
      }
      if (location.label) return location.label;
      return 'Location hidden';
    }

    function formatLocationDetail(location) {
      if (!location) return 'Location unavailable';
      if (location.error) return `Location: ${location.error}`;
      if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
        const accuracy = location.accuracy ? ` · ±${Math.round(location.accuracy)}m` : '';
        return `Latitude ${location.latitude.toFixed(3)}, Longitude ${location.longitude.toFixed(3)}${accuracy}`;
      }
      if (location.label) return location.label;
      return 'Location hidden';
    }

    function ensureHudGoogleButton() {
      if (!appConfig.googleClientId) return null;
      if (!hudRootEl) return null;
      if (hudGoogleButton) return hudGoogleButton;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Sign in with Google - Optional';
      button.style.cssText =
        'position:absolute;top:10px;right:10px;background:blue;color:white;padding:8px 12px;border:none;border-radius:6px;font-weight:600;cursor:pointer;z-index:30;';
      button.addEventListener('click', () => {
        startGoogleSignInFlow();
      });
      hudRootEl.appendChild(button);
      hudGoogleButton = button;
      return hudGoogleButton;
    }

    function updateIdentityUI() {
      if (appConfig.googleClientId) {
        ensureHudGoogleButton();
      }
      if (headerUserNameEl) headerUserNameEl.textContent = identityState.displayName ?? 'Guest Explorer';
      if (userNameDisplayEl) userNameDisplayEl.textContent = identityState.displayName ?? 'Guest Explorer';
      if (headerUserLocationEl) headerUserLocationEl.textContent = formatLocationBadge(identityState.location);
      if (userLocationDisplayEl) userLocationDisplayEl.textContent = formatLocationDetail(identityState.location);
      if (userDeviceDisplayEl) userDeviceDisplayEl.textContent = formatDeviceSnapshot(identityState.device);

      const signedIn = Boolean(identityState.googleProfile);
      if (hudGoogleButton) {
        if (!appConfig.googleClientId || signedIn) {
          hudGoogleButton.hidden = true;
        } else {
          hudGoogleButton.hidden = false;
          const ready = identityState.googleInitialized;
          hudGoogleButton.disabled = !ready;
          hudGoogleButton.setAttribute('aria-disabled', ready ? 'false' : 'true');
          hudGoogleButton.textContent = ready
            ? 'Sign in with Google - Optional'
            : 'Preparing Google Sign-In…';
          hudGoogleButton.style.opacity = ready ? '1' : '0.6';
          hudGoogleButton.style.cursor = ready ? 'pointer' : 'not-allowed';
        }
      }
      googleSignOutButtons.forEach((button) => {
        button.hidden = !signedIn;
      });
      googleButtonContainers.forEach((container) => {
        container.hidden = true;
      });
      googleFallbackButtons.forEach((button) => {
        const showFallback = !signedIn;
        button.hidden = !showFallback;
        if (appConfig.googleClientId) {
          const ready = identityState.googleInitialized;
          button.disabled = !ready;
          button.textContent = ready ? 'Sign in with Google - Optional' : 'Preparing Google Sign-In…';
          button.title = ready
            ? 'Open the Google Sign-In popup to sync your progress across devices.'
            : 'Google services are still initialising. This will become clickable momentarily.';
        } else {
          button.disabled = false;
          button.textContent = 'Create local explorer profile';
          button.title = 'Skip Google Sign-In and save your progress locally on this device.';
        }
      });
      if (landingSignInPanel) {
        landingSignInPanel.hidden = signedIn;
        landingSignInPanel.setAttribute('aria-hidden', signedIn ? 'true' : 'false');
      }

      if (scoreboardStatusEl) {
        let statusText = '';
        if (identityState.scoreboardError) {
          statusText = identityState.scoreboardError;
        } else if (identityState.scoreboardMessage) {
          statusText = identityState.scoreboardMessage;
        } else if (identityState.loadingScores) {
          statusText = appConfig.apiBaseUrl
            ? 'Fetching the latest leaderboard entries…'
            : 'Loading saved leaderboard entries…';
        } else if (identityState.scoreboardSource === 'remote') {
          if (!identityState.scoreboard.length) {
            statusText = signedIn
              ? 'No scores recorded yet.'
              : 'No runs recorded yet. Be the first to chart the multiverse.';
          } else {
            statusText = signedIn
              ? 'Live multiverse leaderboard synced with DynamoDB.'
              : 'Live multiverse rankings. Sign in to submit your run.';
          }
        } else if (identityState.scoreboardSource === 'local') {
          statusText = 'Scores are saved locally on this device.';
        } else if (identityState.scoreboardSource === 'sample') {
          statusText = 'Showing sample data. Connect the API to DynamoDB for live scores.';
        } else if (!signedIn) {
          statusText = appConfig.apiBaseUrl
            ? 'Live rankings unavailable. Try refreshing.'
            : 'Sign in to publish your victories and see the live rankings.';
        } else if (!identityState.scoreboard.length) {
          statusText = 'No scores recorded yet.';
        }
        scoreboardStatusEl.textContent = statusText;
        scoreboardStatusEl.hidden = statusText === '';
      }

      if (refreshScoresButton) {
        const loading = identityState.loadingScores;
        const disabled = loading;
        refreshScoresButton.disabled = disabled;
        refreshScoresButton.setAttribute('data-loading', loading ? 'true' : 'false');
        refreshScoresButton.setAttribute('aria-busy', loading ? 'true' : 'false');
        refreshScoresButton.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }

      if (leaderboardEmptyMessage) {
        if (identityState.loadingScores) {
          leaderboardEmptyMessage.textContent = appConfig.apiBaseUrl
            ? 'Fetching the latest rankings…'
            : 'Loading saved leaderboard entries…';
        } else if (identityState.scoreboardError) {
          leaderboardEmptyMessage.textContent = identityState.scoreboardError;
        } else if (identityState.scoreboardMessage) {
          leaderboardEmptyMessage.textContent = identityState.scoreboardMessage;
        } else if (identityState.scoreboardSource === 'remote') {
          leaderboardEmptyMessage.textContent = signedIn
            ? 'No scores recorded yet. Be the first to complete a run!'
            : 'No runs recorded yet. Be the first to complete a run!';
        } else if (!signedIn) {
          leaderboardEmptyMessage.textContent = 'Sign in to publish your victories and see the live rankings.';
        } else {
          leaderboardEmptyMessage.textContent = 'No scores recorded yet. Be the first to complete a run!';
        }
      }

      renderScoreboard(identityState.scoreboard);
    }

    function getLeaderboardEntryKey(entry, fallbackIndex) {
      return (
        entry?.id ??
        entry?.googleId ??
        entry?.playerId ??
        (entry?.name && entry?.updatedAt ? `${entry.name}|${entry.updatedAt}` : null) ??
        (entry?.name
          ? `${entry.name}|${Number(entry.score ?? 0)}|${Number(entry.runTimeSeconds ?? 0)}`
          : null) ??
        `entry-${fallbackIndex}`
      );
    }

    function createLeaderboardSnapshotEntry(entry, locationLabel) {
      return {
        score: Number(entry.score ?? 0),
        runTimeSeconds: Number(entry.runTimeSeconds ?? 0),
        dimensionCount: Number(entry.dimensionCount ?? 0),
        inventoryCount: Number(entry.inventoryCount ?? 0),
        updatedAt: entry.updatedAt ?? null,
        name: entry.name ?? 'Explorer',
        rank: Number(entry.rank ?? 0),
        locationLabel,
        dimensionLabels: extractLeaderboardDimensionLabels(entry),
      };
    }

    function haveLeaderboardEntryChanges(previousEntry, nextEntry) {
      if (!previousEntry) return false;
      return (
        previousEntry.score !== nextEntry.score ||
        previousEntry.runTimeSeconds !== nextEntry.runTimeSeconds ||
        previousEntry.dimensionCount !== nextEntry.dimensionCount ||
        previousEntry.inventoryCount !== nextEntry.inventoryCount ||
        previousEntry.updatedAt !== nextEntry.updatedAt ||
        previousEntry.name !== nextEntry.name ||
        previousEntry.rank !== nextEntry.rank ||
        previousEntry.locationLabel !== nextEntry.locationLabel ||
        (previousEntry.dimensionLabels || []).join('|') !==
          (nextEntry.dimensionLabels || []).join('|')
      );
    }

    function triggerLeaderboardHighlight(row, status) {
      if (!(row instanceof HTMLElement)) return;
      const highlightClass = status === 'new' ? 'leaderboard-row--new' : 'leaderboard-row--updated';
      row.classList.add(highlightClass);
      const shouldAnimate = !(reduceMotionQuery?.matches ?? false);
      if (shouldAnimate) {
        const handleAnimationEnd = () => {
          row.classList.remove(highlightClass, 'leaderboard-row--animate');
        };
        row.addEventListener('animationend', handleAnimationEnd, { once: true });
        requestAnimationFrame(() => {
          row.classList.add('leaderboard-row--animate');
        });
      } else {
        setTimeout(() => {
          row.classList.remove(highlightClass);
        }, 1200);
      }
    }

    const DIMENSION_NAME_CACHE = new Map();
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

    function resolveDimensionDefinition(label) {
      if (typeof label !== 'string') {
        return null;
      }
      const trimmed = label.trim();
      if (!trimmed) {
        return null;
      }
      const lower = trimmed.toLowerCase();
      if (DIMENSION_NAME_CACHE.has(lower)) {
        return DIMENSION_NAME_CACHE.get(lower);
      }
      let definition = DIMENSIONS[lower] || null;
      if (!definition) {
        definition = Object.values(DIMENSIONS).find((dimension) =>
          typeof dimension?.name === 'string' ? dimension.name.toLowerCase() === lower : false
        );
      }
      DIMENSION_NAME_CACHE.set(lower, definition || null);
      return definition || null;
    }

    function formatDimensionLabel(label) {
      if (typeof label !== 'string') {
        return null;
      }
      const trimmed = label.trim();
      if (!trimmed) {
        return null;
      }
      const definition = resolveDimensionDefinition(trimmed);
      if (definition) {
        if (definition.id === 'origin') {
          const baseName = definition.name || trimmed;
          return /origin/i.test(baseName) ? baseName : `Origin – ${baseName}`;
        }
        return definition.name || trimmed;
      }
      if (/origin/i.test(trimmed)) {
        return trimmed;
      }
      return trimmed
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }

    function extractLeaderboardDimensionLabels(entry) {
      const sources = [];
      if (entry && typeof entry === 'object') {
        if (Array.isArray(entry.dimensionLabels)) {
          sources.push(entry.dimensionLabels);
        }
        if (Array.isArray(entry.dimensions)) {
          sources.push(entry.dimensions);
        }
        if (Array.isArray(entry.realms)) {
          sources.push(entry.realms);
        }
      }
      const formatted = [];
      const seen = new Set();
      sources.forEach((list) => {
        list.forEach((value) => {
          let label = null;
          if (typeof value === 'string') {
            label = formatDimensionLabel(value);
          } else if (value && typeof value === 'object') {
            label = formatDimensionLabel(value.name || value.label || value.id || '');
          }
          if (label && !seen.has(label)) {
            seen.add(label);
            formatted.push(label);
          }
        });
      });
      return formatted;
    }

    function getDimensionBadgeSymbol(label) {
      if (!label) {
        return DEFAULT_DIMENSION_BADGE_SYMBOL;
      }
      const definition = typeof label === 'string' ? resolveDimensionDefinition(label) : null;
      if (definition?.id && DIMENSION_BADGE_SYMBOLS[definition.id]) {
        return DIMENSION_BADGE_SYMBOLS[definition.id];
      }
      const normalized = String(label).trim().toLowerCase();
      if (!normalized) {
        return DEFAULT_DIMENSION_BADGE_SYMBOL;
      }
      for (const [key, synonyms] of Object.entries(DIMENSION_BADGE_SYNONYMS)) {
        if (synonyms.some((token) => normalized.includes(token))) {
          return DIMENSION_BADGE_SYMBOLS[key] ?? DEFAULT_DIMENSION_BADGE_SYMBOL;
        }
      }
      return DEFAULT_DIMENSION_BADGE_SYMBOL;
    }

    function renderScoreboard(entries) {
      if (!scoreboardListEl) return;
      const previousSnapshot = previousLeaderboardSnapshot;
      const nextSnapshot = new Map();
      const allowHighlights = leaderboardHasRenderedOnce;
      scoreboardListEl.innerHTML = '';
      const entriesToDisplay = Array.isArray(entries) ? entries.slice(0, 10) : [];
      const hasEntries = entriesToDisplay.length > 0;
      if (leaderboardTableContainer) {
        leaderboardTableContainer.dataset.empty = hasEntries ? 'false' : 'true';
      }
      if (!hasEntries) {
        previousLeaderboardSnapshot = nextSnapshot;
        leaderboardHasRenderedOnce = true;
        updateLeaderboardSortIndicators();
        return;
      }

      const rankMap = new Map();
      entriesToDisplay.forEach((entry, index) => {
        const rankValue = Number.isFinite(entry.rank) ? Number(entry.rank) : index + 1;
        rankMap.set(entry, rankValue);
      });

      const sortedEntries = entriesToDisplay.slice().sort((a, b) => {
        const { key, direction } = leaderboardSortState;
        const multiplier = direction === 'asc' ? 1 : -1;
        const aValue = getLeaderboardSortValue(a, key);
        const bValue = getLeaderboardSortValue(b, key);
        let comparison = 0;
        if (typeof aValue === 'string' || typeof bValue === 'string') {
          comparison = String(aValue).localeCompare(String(bValue));
        } else {
          comparison = Number(aValue) - Number(bValue);
        }
        if (comparison === 0) {
          comparison = Number(b.score ?? 0) - Number(a.score ?? 0);
        }
        if (comparison === 0) {
          comparison = String(a.name ?? '').localeCompare(String(b.name ?? ''));
        }
        return comparison * multiplier;
      });

      sortedEntries.forEach((entry, index) => {
        const entryKey = getLeaderboardEntryKey(entry, index);
        const row = document.createElement('tr');

        const rankCell = document.createElement('td');
        rankCell.className = 'leaderboard-col-rank';
        const rankValue = rankMap.get(entry) ?? index + 1;
        rankCell.textContent = rankValue.toString();
        row.appendChild(rankCell);

        const nameCell = document.createElement('td');
        const name = document.createElement('strong');
        name.textContent = entry.name ?? 'Explorer';
        nameCell.appendChild(name);
        row.appendChild(nameCell);

        const playerId = identityState.googleProfile?.sub ?? null;
        if (playerId && getScoreEntryId(entry) === playerId) {
          row.classList.add('leaderboard-row--player');
          row.dataset.playerRank = rankValue.toString();
        }

        const scoreCell = document.createElement('td');
        scoreCell.textContent = formatScoreNumber(entry.score);
        row.appendChild(scoreCell);

        const runTimeCell = document.createElement('td');
        runTimeCell.textContent = formatRunTime(entry.runTimeSeconds);
        row.appendChild(runTimeCell);

        const dimensionCell = document.createElement('td');
        dimensionCell.dataset.cell = 'dimensions';
        const countValue = Number(entry.dimensionCount ?? 0);
        const countSpan = document.createElement('span');
        countSpan.className = 'leaderboard-dimension-count';
        countSpan.textContent = countValue.toString();
        dimensionCell.appendChild(countSpan);
        const dimensionLabels = extractLeaderboardDimensionLabels(entry);
        const badgesList = document.createElement('ul');
        badgesList.className = 'leaderboard-dimension-badges';
        badgesList.setAttribute('aria-label', 'Dimensions unlocked');
        if (dimensionLabels.length) {
          dimensionLabels.forEach((label) => {
            const item = document.createElement('li');
            item.className = 'leaderboard-dimension-badges__item';
            const badge = document.createElement('span');
            badge.className = 'leaderboard-dimension-badge';
            const icon = document.createElement('span');
            icon.className = 'leaderboard-dimension-badge__icon';
            icon.textContent = getDimensionBadgeSymbol(label);
            icon.setAttribute('aria-hidden', 'true');
            const text = document.createElement('span');
            text.className = 'leaderboard-dimension-badge__label';
            text.textContent = label;
            badge.appendChild(icon);
            badge.appendChild(text);
            item.appendChild(badge);
            badgesList.appendChild(item);
          });
        } else {
          const item = document.createElement('li');
          item.className = 'leaderboard-dimension-badges__item leaderboard-dimension-badges__item--empty';
          const badge = document.createElement('span');
          badge.className = 'leaderboard-dimension-badge';
          badge.textContent = '—';
          item.appendChild(badge);
          badgesList.appendChild(item);
        }
        const srList = document.createElement('span');
        srList.className = 'leaderboard-dimension-list sr-only';
        srList.textContent = dimensionLabels.length
          ? dimensionLabels.join(', ')
          : 'No additional dimensions tracked';
        dimensionCell.appendChild(badgesList);
        dimensionCell.appendChild(srList);
        row.appendChild(dimensionCell);

        const inventoryCell = document.createElement('td');
        inventoryCell.textContent = String(entry.inventoryCount ?? 0);
        row.appendChild(inventoryCell);

        const locationCell = document.createElement('td');
        locationCell.dataset.cell = 'location';
        const locationLabel = formatLocationLabel(entry);
        locationCell.textContent = locationLabel;
        row.appendChild(locationCell);

        const updatedCell = document.createElement('td');
        updatedCell.dataset.cell = 'updated';
        if (entry.updatedAt) {
          try {
            updatedCell.textContent = new Date(entry.updatedAt).toLocaleString();
          } catch (error) {
            console.warn('Unable to parse updatedAt value.', error);
            updatedCell.textContent = entry.updatedAt;
          }
        } else {
          updatedCell.textContent = '—';
        }
        row.appendChild(updatedCell);

        scoreboardListEl.appendChild(row);

        const snapshotEntry = createLeaderboardSnapshotEntry(entry, locationLabel);
        const previousEntrySnapshot = previousSnapshot.get(entryKey);
        const isNewEntry = allowHighlights && !previousEntrySnapshot;
        const hasChanged = allowHighlights && haveLeaderboardEntryChanges(previousEntrySnapshot, snapshotEntry);
        if (isNewEntry || hasChanged) {
          triggerLeaderboardHighlight(row, isNewEntry ? 'new' : 'updated');
        }

        nextSnapshot.set(entryKey, snapshotEntry);
      });

      previousLeaderboardSnapshot = nextSnapshot;
      leaderboardHasRenderedOnce = true;
      updateLeaderboardSortIndicators();
    }

    function getLeaderboardSortValue(entry, key) {
      switch (key) {
        case 'score':
          return Number(entry.score ?? 0);
        case 'name':
          return String(entry.name ?? '').toLowerCase();
        case 'runTimeSeconds': {
          const value = Number(entry.runTimeSeconds);
          return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
        }
        case 'dimensionCount':
          return Number(entry.dimensionCount ?? 0);
        case 'inventoryCount':
          return Number(entry.inventoryCount ?? 0);
        case 'locationLabel':
          return String(formatLocationLabel(entry) ?? '').toLowerCase();
        case 'updatedAt': {
          const timestamp = entry.updatedAt ? Date.parse(entry.updatedAt) : 0;
          return Number.isNaN(timestamp) ? 0 : timestamp;
        }
        default:
          return entry[key] ?? 0;
      }
    }

    function updateLeaderboardSortIndicators() {
      leaderboardSortHeaders.forEach((header) => {
        const key = header.dataset.sortKey;
        if (!key) return;
        const direction = key === leaderboardSortState.key ? leaderboardSortState.direction : 'none';
        header.setAttribute('data-sort-direction', direction);
        if (direction === 'none') {
          header.setAttribute('aria-sort', 'none');
        } else {
          header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
        }
      });
    }

    function applyLeaderboardSort(key) {
      if (!key) return;
      if (leaderboardSortState.key === key) {
        leaderboardSortState = {
          key,
          direction: leaderboardSortState.direction === 'asc' ? 'desc' : 'asc',
        };
      } else {
        leaderboardSortState = {
          key,
          direction: leaderboardDefaultSortDirection[key] ?? 'desc',
        };
      }
      renderScoreboard(identityState.scoreboard);
    }

    function handleLeaderboardSort(event) {
      event.preventDefault();
      const target = event.currentTarget;
      if (!target) return;
      applyLeaderboardSort(target.dataset.sortKey);
    }

    function openLeaderboardModal() {
      if (!leaderboardModal) return;
      leaderboardModal.hidden = false;
      leaderboardModal.setAttribute('aria-hidden', 'false');
      openLeaderboardButton?.setAttribute('aria-expanded', 'true');
      if (leaderboardOverlayController?.isVisible?.()) {
        leaderboardOverlayController.focus?.();
      }
      const shouldRefreshLeaderboard =
        !identityState.loadingScores &&
        ((appConfig.apiBaseUrl && identityState.scoreboardSource !== 'remote') || !identityState.scoreboard.length);
      if (shouldRefreshLeaderboard) {
        loadScoreboard();
      }
      if (closeLeaderboardButton) {
        closeLeaderboardButton.focus();
      }
    }

    function closeLeaderboardModal(shouldFocusTrigger = false) {
      if (!leaderboardModal) return;
      leaderboardModal.hidden = true;
      leaderboardModal.setAttribute('aria-hidden', 'true');
      openLeaderboardButton?.setAttribute('aria-expanded', 'false');
      if (shouldFocusTrigger) {
        openLeaderboardButton?.focus();
      }
    }

    function setupLeaderboardModal() {
      if (!leaderboardModal || !openLeaderboardButton) return;

      openLeaderboardButton.addEventListener('click', () => {
        openLeaderboardModal();
      });

      closeLeaderboardButton?.addEventListener('click', () => {
        closeLeaderboardModal(true);
      });

      leaderboardModal.addEventListener('click', (event) => {
        if (event.target === leaderboardModal) {
          closeLeaderboardModal(true);
        }
      });

      leaderboardSortHeaders.forEach((header) => {
        header.addEventListener('click', handleLeaderboardSort);
        header.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault();
            applyLeaderboardSort(header.dataset.sortKey);
          }
        });
      });

      updateLeaderboardSortIndicators();
    }

    function ensureLocalProfileId() {
      let identifier = null;
      try {
        identifier = localStorage.getItem(LOCAL_PROFILE_ID_KEY);
      } catch (error) {
        console.warn('Unable to read cached local profile identifier.', error);
      }
      if (!identifier) {
        const randomId =
          (window.crypto?.randomUUID?.() && `local-${window.crypto.randomUUID()}`) ||
          `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        identifier = randomId;
        try {
          localStorage.setItem(LOCAL_PROFILE_ID_KEY, identifier);
        } catch (error) {
          console.warn('Unable to persist local profile identifier.', error);
        }
      }
      return identifier;
    }

    function promptDisplayName(defaultName) {
      const base = defaultName ?? 'Explorer';
      const response = window.prompt("What's your name?", base);
      const trimmed = response?.trim();
      return trimmed || base;
    }

    async function handleLocalProfileSignIn() {
      const preferredName = promptDisplayName(identityState.displayName ?? 'Explorer');
      const localId = ensureLocalProfileId();
      identityState.googleProfile = {
        sub: localId,
        email: null,
        picture: null,
        local: true,
      };
      identityState.displayName = preferredName;
      identityState.device = collectDeviceSnapshot();
      updateIdentityUI();
      if (!identityState.location) {
        identityState.location = await captureLocation();
        updateIdentityUI();
      }
      await syncUserMetadata({ includeProgress: true });
      await loadScoreboard();
    }

    async function finalizeSignIn(profile, preferredName) {
      const googleId =
        profile.sub ?? profile.user_id ?? profile.id ?? (profile.email ? `email:${profile.email}` : `guest:${Date.now()}`);
      identityState.googleProfile = {
        sub: googleId,
        email: profile.email ?? null,
        picture: profile.picture ?? null,
      };
      identityState.displayName = preferredName ?? profile.name ?? 'Explorer';
      identityState.device = collectDeviceSnapshot();
      updateIdentityUI();

      identityState.location = await captureLocation();
      updateIdentityUI();

      const syncedSnapshot = await loadFromDynamo(googleId);
      let snapshotForSync = syncedSnapshot;
      if (!snapshotForSync) {
        const localProgress = readPersistedProgress();
        snapshotForSync = localProgress?.snapshot ?? createProgressSnapshot();
      }
      await syncUserMetadata({ includeProgress: true, progressSnapshot: snapshotForSync });
      await loadScoreboard();
    }

    function ensureGapiScriptLoaded() {
      if (!appConfig.googleClientId) {
        return Promise.resolve(null);
      }
      if (!SUPPORTS_MODEL_ASSETS) {
        return Promise.resolve(null);
      }
      if (!gapiScriptPromise) {
        gapiScriptPromise = loadScript('https://apis.google.com/js/api.js').catch((error) => {
          console.warn('Failed to load Google API script.', error);
          gapiScriptPromise = null;
          throw error;
        });
      }
      return gapiScriptPromise;
    }

    async function ensureGoogleAuthReady() {
      if (!appConfig.googleClientId) {
        identityState.googleInitialized = false;
        updateIdentityUI();
        return null;
      }
      if (googleAuthInstance) {
        identityState.googleInitialized = true;
        updateIdentityUI();
        return googleAuthInstance;
      }
      if (googleAuthPromise) {
        return googleAuthPromise;
      }
      identityState.googleInitialized = false;
      updateIdentityUI();
      googleAuthPromise = ensureGapiScriptLoaded()
        .then(
          () =>
            new Promise((resolve, reject) => {
              if (!window.gapi?.load) {
                reject(new Error('Google API unavailable.'));
                return;
              }
              window.gapi.load('auth2', () => {
                try {
                  const instance =
                    window.gapi.auth2.getAuthInstance?.() ||
                    window.gapi.auth2.init({
                      client_id: appConfig.googleClientId,
                    });
                  instance
                    .then(() => {
                      googleAuthInstance = instance;
                      identityState.googleInitialized = true;
                      updateIdentityUI();
                      resolve(instance);
                    })
                    .catch((error) => {
                      identityState.googleInitialized = false;
                      updateIdentityUI();
                      reject(error);
                    });
                } catch (error) {
                  identityState.googleInitialized = false;
                  updateIdentityUI();
                  reject(error);
                }
              });
            })
        )
        .catch((error) => {
          console.warn('Failed to initialise Google auth.', error);
          throw error;
        })
        .finally(() => {
          googleAuthPromise = null;
        });
      return googleAuthPromise;
    }

    async function startGoogleSignInFlow() {
      if (!appConfig.googleClientId) {
        console.warn('Google client ID missing.');
        const overlay = getGlobalOverlayController();
        if (overlay) {
          overlay.show({
            mode: 'error',
            title: 'Google Sign-In unavailable',
            message: 'Google Sign-In is not configured for this deployment.',
            actions: [
              {
                id: 'dismiss',
                label: 'Dismiss',
                variant: 'accent',
                onClick: () => overlay.hide(),
                autoFocus: true,
              },
            ],
          });
        }
        return;
      }
      const overlay = getGlobalOverlayController();
      overlay?.show({
        mode: 'loading',
        title: 'Connecting to Google',
        message: 'Preparing secure sign-in…',
        actions: [],
      });
      try {
        const auth = await ensureGoogleAuthReady();
        if (!auth) {
          if (overlay) {
            overlay.show({
              mode: 'error',
              title: 'Google Sign-In unavailable',
              message: 'Please try again later.',
              actions: [
                {
                  id: 'dismiss',
                  label: 'Dismiss',
                  variant: 'accent',
                  onClick: () => overlay.hide(),
                  autoFocus: true,
                },
              ],
            });
          } else {
            alert('Google Sign-In is unavailable. Please try again later.');
          }
          return;
        }
        let googleUser = auth.currentUser?.get?.();
        if (!googleUser || !auth.isSignedIn?.get?.()) {
          googleUser = await auth.signIn();
        }
        await handleGoogleUserSignIn(googleUser);
        overlay?.hide();
      } catch (error) {
        console.warn('Google Sign-In failed.', error);
        if (overlay) {
          overlay.show({
            mode: 'error',
            title: 'Google Sign-In failed',
            message: 'Please try again later.',
            actions: [
              {
                id: 'dismiss',
                label: 'Dismiss',
                variant: 'accent',
                onClick: () => overlay.hide(),
                autoFocus: true,
              },
            ],
          });
        } else {
          alert('Google Sign-In failed. Please try again later.');
        }
      }
    }

    async function handleGoogleUserSignIn(googleUser) {
      if (!googleUser) return;
      const profile = googleUser.getBasicProfile?.();
      if (!profile) {
        console.warn('Google profile unavailable.');
        return;
      }
      const preferredName = profile.getName?.() || profile.getGivenName?.() || identityState.displayName || 'Explorer';
      await finalizeSignIn(
        {
          sub: profile.getId?.(),
          email: profile.getEmail?.() || null,
          picture: profile.getImageUrl?.() || null,
          name: profile.getName?.() || null,
        },
        preferredName
      );
    }

    function promptForOptionalSync() {
      if (!appConfig.googleClientId) return;
      if (identityState.googleProfile) return;
      try {
        const promptSeen = localStorage.getItem(SYNC_PROMPT_STORAGE_KEY);
        if (promptSeen) return;
        const wantsSync = window.confirm(
          'Sync progress across devices? Sign in optional.\n\nSelect OK to connect your Google account now or Cancel to sync later.'
        );
        localStorage.setItem(SYNC_PROMPT_STORAGE_KEY, 'dismissed');
        if (wantsSync) {
          startGoogleSignInFlow();
        }
      } catch (error) {
        console.warn('Unable to prompt for progress sync.', error);
      }
    }

    async function handleGoogleSignOut() {
      await saveProgress('sign-out');
      identityState.googleProfile = null;
      identityState.displayName = null;
      identityState.location = null;
      identityState.scoreboard = [];
      identityState.scoreboardSource = 'remote';
      identityState.scoreboardTotal = 0;
      identityState.playerRank = null;
      identityState.loadingScores = false;
      state.scoreSubmitted = false;
      try {
        const auth = googleAuthInstance ?? (await ensureGoogleAuthReady());
        await auth?.signOut?.();
      } catch (error) {
        console.warn('Unable to sign out from Google auth instance.', error);
      }
      primeOfflineScoreboard();
      updateIdentityUI();
      identityState.location = await captureLocation();
      updateIdentityUI();
      const storedProgress = readPersistedProgress();
      if (storedProgress?.snapshot) {
        setPendingProgressSnapshot(storedProgress.snapshot, 'local');
      }
    }

    async function syncUserMetadata(options = {}) {
      if (!identityState.googleProfile) return;
      const { includeProgress = false, progressSnapshot = null } = options ?? {};
      const payload = {
        googleId: identityState.googleProfile.sub,
        name: identityState.displayName,
        email: identityState.googleProfile.email,
        location: getGeolocation(),
        device: identityState.device,
        lastSeenAt: new Date().toISOString(),
      };
      if (includeProgress) {
        const normalizedSnapshot = normalizeProgressSnapshot(progressSnapshot ?? createProgressSnapshot());
        if (normalizedSnapshot) {
          payload.score = normalizedSnapshot.score;
          payload.recipes = normalizedSnapshot.recipes;
          payload.dimensions = normalizedSnapshot.dimensions;
          payload.inventory = normalizedSnapshot.inventory;
          payload.progressVersion = normalizedSnapshot.version;
          payload.progressUpdatedAt = normalizedSnapshot.updatedAt;
          try {
            payload.state = JSON.stringify(normalizedSnapshot);
          } catch (error) {
            console.warn('Failed to serialize progress snapshot for sync.', error);
          }
        }
      }
      try {
        localStorage.setItem(
          PROFILE_STORAGE_KEY,
          JSON.stringify({ name: payload.name, location: payload.location, lastSeenAt: payload.lastSeenAt })
        );
      } catch (error) {
        console.warn('Unable to persist profile preferences locally.', error);
      }
      if (!appConfig.apiBaseUrl) return;
      let abortController = null;
      let timeoutId = null;
      try {
        if (typeof AbortController !== 'undefined') {
          abortController = new AbortController();
          timeoutId = setTimeout(() => abortController?.abort(), 2000);
        }
        const requestOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        };
        if (abortController) {
          requestOptions.signal = abortController.signal;
        }
        const response = await fetch(`${appConfig.apiBaseUrl.replace(/\/$/, '')}/users`, requestOptions);
        if (!response.ok) {
          throw new Error(`User sync failed with status ${response.status}`);
        }
        console.log('State synced');
      } catch (error) {
        console.warn('Failed to sync user metadata with API.', error);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    async function loadFromDynamo(googleId) {
      if (!googleId) return null;
      return hydrateProgressForGoogleUser(googleId);
    }

    async function fetchRemoteUserProfile(googleId) {
      if (!appConfig.apiBaseUrl || !googleId) return null;
      try {
        const response = await fetch(
          `${appConfig.apiBaseUrl.replace(/\/$/, '')}/users?googleId=${encodeURIComponent(googleId)}`
        );
        if (response.status === 404) {
          return null;
        }
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload = await response.json();
        return payload?.item ?? payload ?? null;
      } catch (error) {
        console.warn('Unable to fetch remote user profile.', error);
        return null;
      }
    }

    async function hydrateProgressForGoogleUser(googleId) {
      const remoteProfile = await fetchRemoteUserProfile(googleId);
      let remoteSnapshot = remoteProfile?.progress ? normalizeProgressSnapshot(remoteProfile.progress) : null;
      if (!remoteSnapshot && remoteProfile?.state) {
        try {
          const parsedState =
            typeof remoteProfile.state === 'string' ? JSON.parse(remoteProfile.state) : remoteProfile.state;
          remoteSnapshot = normalizeProgressSnapshot(parsedState);
        } catch (error) {
          console.warn('Failed to parse remote state payload.', error);
        }
      }
      const localResult = readPersistedProgress();
      const localSnapshot = localResult?.snapshot ?? null;
      let chosenSnapshot = null;
      let chosenSource = null;
      if (remoteSnapshot && localSnapshot) {
        const remoteTime = Date.parse(remoteSnapshot.updatedAt ?? '') || 0;
        const localTime = Date.parse(localSnapshot.updatedAt ?? '') || 0;
        if (remoteTime > localTime) {
          chosenSnapshot = remoteSnapshot;
          chosenSource = 'remote';
        } else {
          chosenSnapshot = localSnapshot;
          chosenSource = 'local';
        }
      } else if (remoteSnapshot) {
        chosenSnapshot = remoteSnapshot;
        chosenSource = 'remote';
      } else if (localSnapshot) {
        chosenSnapshot = localSnapshot;
        chosenSource = 'local';
      }
      if (chosenSnapshot) {
        const serialized = JSON.stringify(chosenSnapshot);
        state.persistence.lastSerialized = serialized;
        persistProgressLocally(serialized);
        setPendingProgressSnapshot(chosenSnapshot, chosenSource);
        if (chosenSource === 'local' && identityState.googleProfile) {
          await syncUserMetadata({ includeProgress: true, progressSnapshot: chosenSnapshot });
        }
        if (chosenSource === 'remote' && state.isRunning) {
          logEvent('Remote progress synced. Respawn to continue from your last checkpoint.');
        }
      }
      return chosenSnapshot;
    }

    function loadLocalScores() {
      let storedEntries = null;
      try {
        const stored = localStorage.getItem(SCOREBOARD_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length) {
            storedEntries = parsed;
          }
        }
      } catch (error) {
        console.warn('Unable to load cached scores.', error);
      }
      if (storedEntries) {
        return { entries: storedEntries, source: 'local' };
      }
      return {
        entries: [
          {
            id: 'sample-aurora',
            name: 'Aurora',
            score: 2450,
            dimensionCount: 4,
            runTimeSeconds: 1420,
            inventoryCount: 36,
            locationLabel: 'Northern Citadel',
            updatedAt: new Date(Date.now() - 86400000).toISOString(),
            dimensionLabels: [
              'Origin – Grassland Threshold',
              'Rock Dimension',
              'Stone Dimension',
              'Tar Dimension',
            ],
          },
          {
            id: 'sample-zenith',
            name: 'Zenith',
            score: 1980,
            dimensionCount: 3,
            runTimeSeconds: 1185,
            inventoryCount: 28,
            locationLabel: 'Lunar Outpost',
            updatedAt: new Date(Date.now() - 172800000).toISOString(),
            dimensionLabels: ['Origin – Grassland Threshold', 'Rock Dimension', 'Stone Dimension'],
          },
          {
            id: 'sample-orbit',
            name: 'Orbit',
            score: 1675,
            dimensionCount: 3,
            runTimeSeconds: 960,
            inventoryCount: 24,
            locationLabel: 'Synthwave Reef',
            updatedAt: new Date(Date.now() - 259200000).toISOString(),
            dimensionLabels: ['Origin – Grassland Threshold', 'Rock Dimension', 'Tar Dimension'],
          },
        ],
        source: 'sample',
      };
    }

    function saveLocalScores(entries) {
      try {
        localStorage.setItem(SCOREBOARD_STORAGE_KEY, JSON.stringify(entries));
      } catch (error) {
        console.warn('Unable to cache scores locally.', error);
      }
    }

    function getScoreEntryId(entry) {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      if (entry.id) return entry.id;
      if (entry.googleId) return entry.googleId;
      if (entry.playerId) return entry.playerId;
      return null;
    }

    function storeScoreboardEntries(entries, source) {
      const normalized = normalizeScoreEntries(entries ?? []);
      identityState.scoreboardTotal = normalized.length;
      const annotated = normalized.map((entry, index) => ({ ...entry, rank: index + 1 }));
      const playerId = identityState.googleProfile?.sub ?? null;
      let playerIndex = -1;
      if (playerId) {
        playerIndex = annotated.findIndex((entry) => getScoreEntryId(entry) === playerId);
        identityState.playerRank = playerIndex >= 0 ? annotated[playerIndex].rank : null;
      } else {
        identityState.playerRank = null;
      }

      let displayed = annotated.slice(0, 10).map((entry) => ({ ...entry }));
      if (playerIndex >= 0) {
        const playerEntry = { ...annotated[playerIndex] };
        const existingIndex = displayed.findIndex((entry) => getScoreEntryId(entry) === playerId);
        if (existingIndex >= 0) {
          displayed[existingIndex] = playerEntry;
        } else if (playerIndex >= displayed.length) {
          if (displayed.length >= 10) {
            displayed[displayed.length - 1] = playerEntry;
          } else {
            displayed.push(playerEntry);
          }
        } else {
          displayed[playerIndex] = playerEntry;
        }
      }

      identityState.scoreboard = displayed;
      if (source) {
        identityState.scoreboardSource = source;
      }
      return { normalized: annotated, displayed };
    }

    function isLeaderboardModalVisible() {
      return Boolean(leaderboardModal && leaderboardModal.hidden === false);
    }

    const leaderboardOverlayController = createComposeOverlayController(
      {
        overlay: leaderboardOverlay,
        dialog: leaderboardOverlayDialog,
        title: leaderboardOverlayTitle,
        message: leaderboardOverlayMessage,
        spinner: leaderboardOverlaySpinner,
        actionsContainer: leaderboardOverlayActions,
      },
      {
        defaults: {
          loadingTitle: 'Syncing leaderboard',
          errorTitle: 'Leaderboard unavailable',
          idleTitle: '',
        },
        shouldAutoFocus: () => isLeaderboardModalVisible(),
        onStateChange: (overlayState) => {
          if (!leaderboardModal) return;
          const busy = overlayState.visible && overlayState.mode === 'loading';
          leaderboardModal.setAttribute('aria-busy', busy ? 'true' : 'false');
        },
      },
    );

    function hideLeaderboardOverlay({ resetMessage = false } = {}) {
      leaderboardOverlayController.hide();
      if (resetMessage) {
        identityState.scoreboardError = null;
        identityState.scoreboardMessage = '';
        updateIdentityUI();
      }
    }

    function presentLeaderboardLoading(message) {
      identityState.scoreboardError = null;
      identityState.scoreboardMessage = message;
      leaderboardOverlayController.show({
        mode: 'loading',
        message,
        actions: [],
      });
      updateIdentityUI();
    }

    function presentLeaderboardError(message) {
      identityState.scoreboardError = message;
      identityState.scoreboardMessage = '';
      identityState.loadingScores = false;
      const actions = [];
      if (appConfig.apiBaseUrl) {
        actions.push({
          id: 'retry',
          label: 'Retry',
          variant: 'accent',
          autoFocus: true,
          onClick: () => {
            if (identityState.loadingScores) {
              return;
            }
            loadScoreboard();
          },
        });
      }
      actions.push({
        id: 'dismiss',
        label: appConfig.apiBaseUrl ? 'Dismiss' : 'OK',
        variant: appConfig.apiBaseUrl ? 'ghost' : 'accent',
        autoFocus: !appConfig.apiBaseUrl,
        onClick: () => hideLeaderboardOverlay({ resetMessage: true }),
      });
      leaderboardOverlayController.show({
        mode: 'error',
        message,
        actions,
      });
      updateIdentityUI();
    }

    function primeOfflineScoreboard() {
      if (identityState.googleProfile) return;
      if (identityState.scoreboard.length) return;
      const localResult = loadLocalScores();
      storeScoreboardEntries(localResult.entries, localResult.source);
    }

    function refreshOfflineScoreboard() {
      identityState.loadingScores = true;
      presentLeaderboardLoading('Loading saved leaderboard entries…');
      const localResult = loadLocalScores();
      setTimeout(() => {
        storeScoreboardEntries(localResult.entries, localResult.source);
        identityState.loadingScores = false;
        hideLeaderboardOverlay({ resetMessage: true });
        updateIdentityUI();
      }, 600);
    }

    async function loadScoreboard() {
      const loadingMessage = appConfig.apiBaseUrl
        ? 'Fetching the latest leaderboard entries…'
        : 'Loading saved leaderboard entries…';
      identityState.loadingScores = true;
      presentLeaderboardLoading(loadingMessage);
      let remoteResult = null;
      let remoteErrorMessage = null;
      if (appConfig.apiBaseUrl) {
        try {
          const response = await fetch(`${appConfig.apiBaseUrl.replace(/\/$/, '')}/scores`);
          if (response.ok) {
            let payload = [];
            if (response.status !== 204) {
              payload = await response.json();
            }
            remoteResult = {
              entries: Array.isArray(payload) ? payload : payload?.items ?? [],
              source: 'remote',
            };
          } else if (response.status === 404) {
            remoteResult = { entries: [], source: 'remote' };
          } else {
            remoteErrorMessage = 'Unable to reach the live leaderboard. Showing cached scores.';
            console.warn(`Remote scoreboard returned status ${response.status}.`);
            presentLeaderboardError(remoteErrorMessage);
          }
        } catch (error) {
          remoteErrorMessage = 'Unable to reach the live leaderboard. Showing cached scores.';
          console.warn('Unable to load remote scoreboard.', error);
          presentLeaderboardError(remoteErrorMessage);
        }
      }
      const result = remoteResult ?? loadLocalScores();
      const { normalized } = storeScoreboardEntries(result.entries, result.source);
      if (result.source === 'remote') {
        saveLocalScores(normalized);
      }
      if (!remoteErrorMessage) {
        identityState.loadingScores = false;
        hideLeaderboardOverlay({ resetMessage: true });
        updateIdentityUI();
      } else {
        identityState.loadingScores = false;
        updateIdentityUI();
      }
    }

    async function recordScore(snapshot) {
      if (!identityState.googleProfile) return;
      const entry = {
        id: identityState.googleProfile.sub,
        name: identityState.displayName ?? 'Explorer',
        score: snapshot.score,
        dimensionCount: snapshot.dimensionCount,
        runTimeSeconds: snapshot.runTimeSeconds,
        inventoryCount: snapshot.inventoryCount,
        location: identityState.location && !identityState.location.error ? identityState.location : null,
        locationLabel: identityState.location?.label ?? null,
        updatedAt: new Date().toISOString(),
        dimensionLabels: Array.isArray(snapshot.dimensions) ? snapshot.dimensions : [],
      };
      const updatedEntries = upsertScoreEntry(identityState.scoreboard, entry);
      const source = appConfig.apiBaseUrl ? identityState.scoreboardSource : 'local';
      const { normalized } = storeScoreboardEntries(updatedEntries, source);
      if (!appConfig.apiBaseUrl) {
        identityState.scoreboardSource = 'local';
      }
      saveLocalScores(normalized);
      updateIdentityUI();
      if (appConfig.apiBaseUrl) {
        try {
          await fetch(`${appConfig.apiBaseUrl.replace(/\/$/, '')}/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...entry,
              googleId: identityState.googleProfile.sub,
              email: identityState.googleProfile.email,
              dimensions: Array.isArray(snapshot.dimensions) ? snapshot.dimensions : undefined,
            }),
          });
        } catch (error) {
          console.warn('Failed to sync score with API.', error);
        }
      }
      await syncUserMetadata({ includeProgress: true });
    }

    function computeScoreSnapshot() {
      if (state?.simpleSummary) {
        const summary = state.simpleSummary;
        const dimensionCount = Number.isFinite(summary.dimensionCount)
          ? Math.max(0, Math.round(summary.dimensionCount))
          : Array.isArray(summary.dimensions)
            ? summary.dimensions.length
            : 0;
        const runTimeSeconds = Number.isFinite(summary.runTimeSeconds)
          ? Math.max(0, Math.round(summary.runTimeSeconds))
          : 0;
        const inventoryCount = Number.isFinite(summary.inventoryCount)
          ? Math.max(0, Math.round(summary.inventoryCount))
          : 0;
        const scoreValue = Math.round(summary.score ?? 0);
        const dimensionLabels = [];
        const seen = new Set();
        ensureArrayOfStrings(summary.dimensions ?? [], { unique: false }).forEach((value) => {
          const label = formatDimensionLabel(value);
          if (label && !seen.has(label)) {
            seen.add(label);
            dimensionLabels.push(label);
          }
        });
        return {
          score: scoreValue,
          dimensionCount,
          runTimeSeconds,
          inventoryCount,
          dimensions: dimensionLabels,
        };
      }
      const dimensionCount = state.scoreBreakdown?.dimensions?.size ?? new Set(state.dimensionHistory ?? []).size;
      const recipeCount = state.scoreBreakdown?.recipes?.size ?? 0;
      const inventoryBundles = mergeInventory();
      const satchelCount = state.player.satchel?.reduce((sum, bundle) => sum + (bundle?.quantity ?? 0), 0) ?? 0;
      const inventoryCount = inventoryBundles.reduce((sum, bundle) => sum + bundle.quantity, 0) + satchelCount;
      const totalScore =
        state.score ?? recipeCount * SCORE_POINTS.recipe + dimensionCount * SCORE_POINTS.dimension;
      const dimensionLabels = [];
      const seen = new Set();
      const dimensionSources = [];
      if (state.scoreBreakdown?.dimensions instanceof Set) {
        dimensionSources.push(Array.from(state.scoreBreakdown.dimensions));
      }
      if (Array.isArray(state.dimensionHistory)) {
        dimensionSources.push(state.dimensionHistory);
      }
      dimensionSources.forEach((list) => {
        list.forEach((value) => {
          const label = formatDimensionLabel(value);
          if (label && !seen.has(label)) {
            seen.add(label);
            dimensionLabels.push(label);
          }
        });
      });
      return {
        score: Math.round(totalScore),
        dimensionCount,
        runTimeSeconds: Math.round(state.elapsed ?? 0),
        inventoryCount,
        dimensions: dimensionLabels,
      };
    }

    function handleVictoryAchieved() {
      if (state.scoreSubmitted) return;
      state.scoreSubmitted = true;
      if (!identityState.googleProfile) {
        logEvent('Sign in with Google to publish your victory on the multiverse scoreboard.');
        return;
      }
      const snapshot = computeScoreSnapshot();
      recordScore(snapshot);
    }

    async function captureLocation() {
      if (!('geolocation' in navigator)) {
        return { error: 'Geolocation unavailable' };
      }
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
            });
          },
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              resolve({ error: 'Permission denied' });
            } else {
              resolve({ error: error.message || 'Location unavailable' });
            }
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
        );
      });
    }

    function getGeolocation() {
      return identityState.location ?? null;
    }

    async function initializeIdentityLayer() {
      identityState.device = collectDeviceSnapshot();
      try {
        const cachedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
        if (cachedProfile) {
          const parsed = JSON.parse(cachedProfile);
          if (parsed?.name && !identityState.displayName) {
            identityState.displayName = parsed.name;
          }
          if (parsed?.location && !identityState.location) {
            identityState.location = parsed.location;
          }
        }
      } catch (error) {
        console.warn('Unable to hydrate cached profile.', error);
      }
      const storedProgress = readPersistedProgress();
      if (storedProgress?.snapshot) {
        setPendingProgressSnapshot(storedProgress.snapshot, 'local');
        state.persistence.lastSerialized = storedProgress.serialized;
      }
      primeOfflineScoreboard();
      updateIdentityUI();
      ensureGoogleAuthReady().catch(() => {});
      googleFallbackButtons.forEach((button) => {
        button.addEventListener('click', () => {
          if (appConfig.googleClientId) {
            startGoogleSignInFlow();
          } else {
            handleLocalProfileSignIn();
          }
        });
      });
      googleSignOutButtons.forEach((button) => {
        button.addEventListener('click', handleGoogleSignOut);
      });
      refreshScoresButton?.addEventListener('click', () => {
        if (identityState.loadingScores) {
          return;
        }
        if (!appConfig.apiBaseUrl && (identityState.scoreboardSource === 'sample' || identityState.scoreboardSource === 'local')) {
          refreshOfflineScoreboard();
          return;
        }
        loadScoreboard();
      });
      if (!identityState.location) {
        identityState.location = await captureLocation();
        updateIdentityUI();
      }
    }

    initializeCraftSlots();
    updateCraftSequenceDisplay();
    updateRecipesList();
    updateAutocompleteSuggestions();

    initializeAudioControls();
    initializeAccessibilityControls();

    startButton.addEventListener('click', startGame);
    initEventListeners();

    setupSettingsModal();
    setupKeyBindingPreferences();
    setupCraftingModal();
    setupInventoryModal();

    const GUIDE_SLIDES = [
      {
        id: 'rail-surfing',
        category: 'Movement',
        icon: '🛤️',
        iconLabel: 'Rail icon',
        title: 'Rail Surfing 101',
        description: 'Glide across energy rails to outrun the collapsing void and gather momentum bonuses.',
        desktopControls: [
          {
            keys: ['A', 'D'],
            description: 'Strafe between parallel rails to align with the glowing conduit.',
          },
          {
            keys: ['Space'],
            description: 'Hop short gaps or falling track segments before they disintegrate.',
          },
          {
            keys: ['Shift'],
            description: 'Feather your landing for precision alignment and combo preservation.',
          },
        ],
        mobileControls: [
          {
            keys: ['Swipe ⟷'],
            description: 'Swap to the adjacent rail instantly as the cadence lights change.',
          },
          {
            keys: ['Tap Jump'],
            description: 'Vault crumbled sections of track the moment the warning rune flashes.',
          },
        ],
        demoSequence: [
          {
            label: 'Align',
            keys: ['D'],
            caption: 'Lean into the highlighted rail before the void surge reaches it.',
          },
          {
            label: 'Leap',
            keys: ['Space'],
            caption: 'Tap jump to clear the missing section and keep your combo streak alive.',
          },
          {
            label: 'Stabilise',
            keys: ['Shift'],
            caption: 'Feather the landing so magnetised boots lock onto the rail.',
          },
        ],
        tip: 'Watch the blue cadence lights — they foreshadow which rail collapses next.',
      },
      {
        id: 'portal-forging',
        category: 'Construction',
        icon: '⧉',
        iconLabel: 'Portal glyph',
        title: 'Forge a Portal Frame',
        description: 'Sequence materials in the crafting circle, then place a perfect 4×3 gate.',
        desktopControls: [
          {
            keys: ['R'],
            description: 'Open the portal planner overlay to preview the frame footprint.',
          },
          {
            keys: ['Mouse Drag'],
            description: 'Trace each block of the frame in order until the lattice hums.',
          },
          {
            keys: ['F'],
            description: 'Ignite the core once the matrix stabilises and the runes align.',
          },
        ],
        mobileControls: [
          {
            keys: ['Portal Button'],
            description: 'Open the holographic build overlay for the selected material.',
          },
          {
            keys: ['Drag Blocks'],
            description: 'Place segments by tracing the glowing outline with your finger.',
          },
          {
            keys: ['Tap Ignite'],
            description: 'Stabilise the portal when the inner matrix shifts to azure.',
          },
        ],
        demoSequence: [
          {
            label: 'Plan',
            keys: ['R'],
            caption: 'Call up the blueprint to lock the frame dimensions.',
          },
          {
            label: 'Place',
            keys: ['Mouse Drag'],
            caption: 'Drag to set each block until the lattice sings in resonance.',
          },
          {
            label: 'Ignite',
            keys: ['F'],
            caption: 'Trigger the ignition rune to activate the gateway.',
          },
        ],
        tip: 'Mixed materials destabilise the portal — keep every segment identical.',
      },
      {
        id: 'survival-kit',
        category: 'Survival',
        icon: '🛡️',
        iconLabel: 'Shield icon',
        title: 'Emergency Toolkit',
        description: 'React fast when night raids hit the rails and villagers call for help.',
        desktopControls: [
          {
            keys: ['Q'],
            description: 'Quick-cycle the hotbar to grab barricades or traps.',
          },
          {
            keys: ['1', '2', '3'],
            description: 'Deploy beacons, barricades, and decoys instantly.',
          },
          {
            keys: ['Mouse Hold'],
            description: 'Channel repair beams to mend damaged rails in place.',
          },
        ],
        mobileControls: [
          {
            keys: ['Hotbar Tap'],
            description: 'Equip barricades or drones straight from the quick slots.',
          },
          {
            keys: ['Press & Hold'],
            description: 'Maintain pressure to flood the rail with stabilising energy.',
          },
        ],
        demoSequence: [
          {
            label: 'Select',
            keys: ['Q'],
            caption: 'Swap to your emergency slot with a quick-cycle.',
          },
          {
            label: 'Deploy',
            keys: ['1'],
            caption: 'Drop a barricade to slow the raid advance.',
          },
          {
            label: 'Repair',
            keys: ['Mouse Hold'],
            caption: 'Hold to flood the rail with stabilising energy.',
          },
        ],
        tip: 'Repair beams work fastest on glowing rails — lure mobs away with decoys first.',
      },
    ];

    const guideCarouselState = {
      currentIndex: 0,
      timeouts: [],
      cleanups: [],
      goToSlide: null,
    };

    const guideSectionDemoState = {
      initialized: false,
      activeDemos: new Map(),
    };

    setupGuideModal();
    setupLeaderboardModal();
    initializeIdentityLayer();
    window.addEventListener('beforeunload', () => {
      try {
        const snapshot = createProgressSnapshot();
        persistProgressLocally(JSON.stringify(snapshot));
      } catch (error) {
        console.warn('Unable to persist progress during unload.', error);
      }
    });
    updateLayoutMetrics();
    syncSidebarForViewport();

    function openSettingsModal() {
      if (!settingsModal) return;
      applyAudioSettingsToInputs();
      updateVolumeLabels();
      applyAccessibilitySettingsToInputs();
      updateAllKeyBindingButtons();
      settingsModal.hidden = false;
      settingsModal.setAttribute('aria-hidden', 'false');
      openSettingsButton?.setAttribute('aria-expanded', 'true');
      initializeAudioEngine();
      window.setTimeout(() => {
        const firstInput = settingsModal.querySelector('input[type="range"]');
        firstInput?.focus();
      }, 0);
    }

    function closeSettingsModal(shouldFocusTrigger = false) {
      if (!settingsModal) return;
      stopKeyBindingCapture({ shouldRender: false });
      settingsModal.hidden = true;
      settingsModal.setAttribute('aria-hidden', 'true');
      openSettingsButton?.setAttribute('aria-expanded', 'false');
      if (shouldFocusTrigger) {
        openSettingsButton?.focus();
      }
    }

    function setupSettingsModal() {
      if (!settingsModal) return;
      settingsModal.hidden = true;
      settingsModal.setAttribute('aria-hidden', 'true');
      openSettingsButton?.setAttribute('aria-expanded', 'false');
      settingsModal.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
          closeSettingsModal(true);
        }
      });
      closeSettingsButton?.addEventListener('click', () => closeSettingsModal(true));
    }

    function getActionLabel(action) {
      return KEY_BINDING_ACTION_LABELS.get(action) ?? action;
    }

    function getBaseBindings(action) {
      if (Array.isArray(state.baseKeyBindings?.[action]) && state.baseKeyBindings[action].length) {
        return [...state.baseKeyBindings[action]];
      }
      if (Array.isArray(state.defaultKeyBindings?.[action]) && state.defaultKeyBindings[action].length) {
        return [...state.defaultKeyBindings[action]];
      }
      if (Array.isArray(DEFAULT_KEY_BINDINGS?.[action])) {
        return [...DEFAULT_KEY_BINDINGS[action]];
      }
      return [];
    }

    function updateKeyBindingButton(action) {
      const button = keyBindingButtonMap.get(action);
      if (!button) return;
      const keysLabelEl = button.querySelector('.keybinding-row__keys');
      const ctaEl = button.querySelector('.keybinding-row__cta');
      const bindings = getBindingsForAction(action);
      const baseBindings = getBaseBindings(action);
      const labelParts = getActionKeyLabels(action);
      const labelText = labelParts.length ? labelParts.join(' / ') : 'Unassigned';
      if (keysLabelEl) {
        keysLabelEl.textContent = labelText;
      }
      if (ctaEl) {
        ctaEl.textContent = 'Change';
      }
      button.classList.remove('keybinding-row__button--listening');
      button.removeAttribute('data-listening');
      button.setAttribute(
        'aria-label',
        `Change ${getActionLabel(action)} binding (currently ${labelText || 'unassigned'})`,
      );
      const defaultLabel = keyBindingDefaultLabelMap.get(action);
      if (defaultLabel) {
        if (!areKeyListsEqual(bindings, baseBindings)) {
          const defaultLabels = baseBindings.map((code) => formatKeyLabel(code)).filter(Boolean);
          const defaultText = defaultLabels.length ? defaultLabels.join(' / ') : '—';
          defaultLabel.textContent = `Default: ${defaultText}`;
          defaultLabel.hidden = false;
        } else {
          defaultLabel.textContent = '';
          defaultLabel.hidden = true;
        }
      }
    }

    function updateAllKeyBindingButtons() {
      keyBindingButtonMap.forEach((_, action) => {
        updateKeyBindingButton(action);
      });
    }

    function stopKeyBindingCapture(options = {}) {
      const { shouldRender = true } = options ?? {};
      if (!activeKeyBindingCapture) {
        return;
      }
      window.removeEventListener('keydown', handleKeyBindingCaptureKeydown, true);
      window.removeEventListener('blur', cancelKeyBindingCaptureOnBlur);
      const { action } = activeKeyBindingCapture;
      activeKeyBindingCapture = null;
      if (shouldRender) {
        updateKeyBindingButton(action);
      }
    }

    function cancelKeyBindingCaptureOnBlur() {
      stopKeyBindingCapture({ shouldRender: true });
    }

    function handleKeyBindingCaptureKeydown(event) {
      if (!activeKeyBindingCapture) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const { action } = activeKeyBindingCapture;
      if (event.key === 'Escape' || event.key === 'Tab') {
        stopKeyBindingCapture({ shouldRender: true });
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        setKeyBinding(action, []);
        stopKeyBindingCapture({ shouldRender: true });
        return;
      }
      const resolved = normaliseEventCode(event.code || '', event.key);
      if (!resolved) {
        return;
      }
      setKeyBinding(action, [resolved]);
      stopKeyBindingCapture({ shouldRender: true });
    }

    function startKeyBindingCapture(action) {
      const button = keyBindingButtonMap.get(action);
      if (!button) {
        return;
      }
      stopKeyBindingCapture({ shouldRender: false });
      const keysLabelEl = button.querySelector('.keybinding-row__keys');
      const ctaEl = button.querySelector('.keybinding-row__cta');
      button.classList.add('keybinding-row__button--listening');
      button.setAttribute('data-listening', 'true');
      if (keysLabelEl) {
        keysLabelEl.textContent = 'Press a key…';
      }
      if (ctaEl) {
        ctaEl.textContent = 'Listening';
      }
      button.setAttribute(
        'aria-label',
        `Press a key to assign to ${getActionLabel(action)}. Press Escape to cancel or Backspace to restore the default.`,
      );
      activeKeyBindingCapture = { action };
      window.addEventListener('keydown', handleKeyBindingCaptureKeydown, true);
      window.addEventListener('blur', cancelKeyBindingCaptureOnBlur);
    }

    function buildKeyBindingRow(action) {
      const actionLabel = getActionLabel(action.id);
      const row = document.createElement('div');
      row.className = 'keybinding-row';
      const info = document.createElement('div');
      info.className = 'keybinding-row__info';
      const labelEl = document.createElement('span');
      labelEl.className = 'keybinding-row__label';
      labelEl.textContent = actionLabel;
      info.appendChild(labelEl);
      const defaultLabel = document.createElement('span');
      defaultLabel.className = 'keybinding-row__default';
      defaultLabel.hidden = true;
      info.appendChild(defaultLabel);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'keybinding-row__button';
      button.dataset.action = action.id;
      const keysLabel = document.createElement('span');
      keysLabel.className = 'keybinding-row__keys';
      button.appendChild(keysLabel);
      const cta = document.createElement('span');
      cta.className = 'keybinding-row__cta';
      cta.textContent = 'Change';
      button.appendChild(cta);
      button.addEventListener('click', () => {
        startKeyBindingCapture(action.id);
      });
      keyBindingButtonMap.set(action.id, button);
      keyBindingDefaultLabelMap.set(action.id, defaultLabel);
      row.appendChild(info);
      row.appendChild(button);
      updateKeyBindingButton(action.id);
      return row;
    }

    function buildKeyBindingGroup(group) {
      const container = document.createElement('section');
      container.className = 'keybinding-group';
      const title = document.createElement('h3');
      title.className = 'keybinding-group__title';
      title.textContent = group.title;
      container.appendChild(title);
      const list = document.createElement('div');
      list.className = 'keybinding-group__list';
      group.actions.forEach((action) => {
        list.appendChild(buildKeyBindingRow(action));
      });
      container.appendChild(list);
      return container;
    }

    function setupKeyBindingPreferences() {
      if (!settingsKeyBindingsList) {
        return;
      }
      settingsKeyBindingsList.innerHTML = '';
      keyBindingButtonMap.clear();
      keyBindingDefaultLabelMap.clear();
      KEY_BINDING_ACTION_GROUPS.forEach((group) => {
        settingsKeyBindingsList.appendChild(buildKeyBindingGroup(group));
      });
      updateAllKeyBindingButtons();
      resetKeyBindingsButton?.addEventListener('click', () => {
        stopKeyBindingCapture({ shouldRender: false });
        resetKeyBindings();
        updateAllKeyBindingButtons();
      });
    }

    function openCraftingModal() {
      if (!craftingModal) return;
      craftingModal.hidden = false;
      craftingModal.setAttribute('aria-hidden', 'false');
      craftLauncherButton?.setAttribute('aria-expanded', 'true');
      updateCraftSequenceDisplay();
      updateRecipesList();
      updateAutocompleteSuggestions();
      updateCraftingInventoryOverlay();
      recipeSearchEl?.focus();
    }

    function closeCraftingModal(options = {}) {
      if (!craftingModal) return;
      const { focusTrigger = true, focusTarget = null } = options ?? {};
      craftingModal.hidden = true;
      craftingModal.setAttribute('aria-hidden', 'true');
      craftSuggestionsEl?.setAttribute('data-visible', 'false');
      craftLauncherButton?.setAttribute('aria-expanded', 'false');
      closeCraftingSearchPanel();
      const target = focusTarget || (focusTrigger ? craftLauncherButton : null);
      target?.focus();
    }

    function toggleCraftingModal(options = {}) {
      if (!craftingModal) return;
      const { focusReturn = null } = options ?? {};
      if (craftingModal.hidden) {
        openCraftingModal();
      } else {
        closeCraftingModal({ focusTrigger: false, focusTarget: focusReturn });
      }
    }

    function setupCraftingModal() {
      if (!craftingModal) return;
      craftingModal.hidden = true;
      craftingModal.setAttribute('aria-hidden', 'true');
      craftLauncherButton?.setAttribute('aria-expanded', 'false');
      craftingModal.addEventListener('click', (event) => {
        if (event.target === craftingModal) {
          if (craftingSearchPanel?.getAttribute('data-open') === 'true') {
            closeCraftingSearchPanel(true);
            return;
          }
          closeCraftingModal();
        }
      });
      closeCraftingButton?.addEventListener('click', () => closeCraftingModal({ focusTrigger: true }));
      if (craftingSearchPanel) {
        craftingSearchPanel.hidden = true;
        craftingSearchPanel.setAttribute('data-open', 'false');
        craftingSearchPanel.setAttribute('aria-hidden', 'true');
      }
      document.addEventListener('keydown', (event) => {
        const code = normaliseEventCode(event.code || '', event.key);
        if (!isKeyForAction('closeMenus', code)) {
          return;
        }
        if (craftingSearchPanel?.getAttribute('data-open') === 'true') {
          event.preventDefault();
          closeCraftingSearchPanel(true);
          return;
        }
        if (!craftingModal.hidden) {
          closeCraftingModal();
        }
      });
    }

    function setupInventoryModal() {
      if (!inventoryModal) return;
      inventoryModal.hidden = true;
      inventoryModal.setAttribute('aria-hidden', 'true');
      state.ui.hotbarExpanded = false;
      updateHotbarExpansionUi();
      inventoryModal.addEventListener('click', (event) => {
        if (event.target === inventoryModal) {
          closeInventoryModal(true);
        }
      });
      closeInventoryButton?.addEventListener('click', () => closeInventoryModal(true));
      updateInventorySortButtonState();
      if (inventoryOverflowEl) {
        inventoryOverflowEl.hidden = true;
        inventoryOverflowEl.textContent = '';
      }
    }

    function openGuideModal() {
      if (!guideModal) return;
      const activeElement = document.activeElement;
      if (activeElement && typeof activeElement.focus === 'function') {
        lastFocusedBeforeGuide = activeElement;
      } else {
        lastFocusedBeforeGuide = openGuideButton ?? null;
      }
      guideModal.hidden = false;
      guideModal.setAttribute('data-open', 'true');
      guideModal.setAttribute('aria-hidden', 'false');
      const scrollHost = guideModal.querySelector('[data-guide-scroll]');
      if (scrollHost) {
        scrollHost.scrollTop = 0;
      }
      initializeGuideSectionDemos();
      const closeButton = guideModal.querySelector('[data-close-guide]');
      closeButton?.focus();
      guideCarouselState.goToSlide?.(0, { forceRender: true });
    }

    function runGuideDemoCleanups() {
      guideCarouselState.cleanups.forEach((cleanup) => {
        try {
          cleanup?.();
        } catch (error) {
          console.error('Failed to clean up guide demo', error);
        }
      });
      guideCarouselState.cleanups.length = 0;
    }

    function initializeGuideSectionDemos() {
      if (!guideModal || guideSectionDemoState.initialized) {
        return;
      }
      const movementSection = guideModal.querySelector('#movement');
      if (movementSection) {
        setupMovementSection(movementSection);
      }
      const craftingSection = guideModal.querySelector('#crafting');
      if (craftingSection) {
        setupCraftingSection(craftingSection);
      }
      guideSectionDemoState.initialized = true;
    }

    function setupMovementSection(section) {
      if (section.dataset.demoReady === 'true') {
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost small';
      button.textContent = 'Play Demo';
      button.setAttribute('data-demo-button', 'movement');
      const container = document.createElement('div');
      container.className = 'guide-section__demo';
      container.setAttribute('data-demo-container', 'movement');
      container.hidden = true;
      container.setAttribute('aria-live', 'polite');
      button.addEventListener('click', () => {
        startMovementDemo(container);
        button.textContent = 'Restart Demo';
      });
      section.appendChild(button);
      section.appendChild(container);
      section.dataset.demoReady = 'true';
    }

    function setupCraftingSection(section) {
      if (section.dataset.demoReady === 'true') {
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost small';
      button.textContent = 'Play Demo';
      button.setAttribute('data-demo-button', 'crafting');
      const container = document.createElement('div');
      container.className = 'guide-section__demo';
      container.setAttribute('data-demo-container', 'crafting');
      container.hidden = true;
      container.setAttribute('aria-live', 'polite');
      button.addEventListener('click', () => {
        startCraftingDemo(container);
        button.textContent = 'Restart Demo';
      });
      section.appendChild(button);
      section.appendChild(container);
      section.dataset.demoReady = 'true';
    }

    function registerGuideSectionDemoCleanup(type, cleanup) {
      const existingCleanup = guideSectionDemoState.activeDemos.get(type);
      if (existingCleanup) {
        try {
          existingCleanup();
        } catch (error) {
          console.error('Failed to clean up guide section demo', error);
        }
        guideSectionDemoState.activeDemos.delete(type);
      }
      if (typeof cleanup === 'function') {
        guideSectionDemoState.activeDemos.set(type, cleanup);
      }
    }

    function cleanupGuideSectionDemos() {
      guideSectionDemoState.activeDemos.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.error('Failed to clean up guide section demo', error);
        }
      });
      guideSectionDemoState.activeDemos.clear();
    }

    function startMovementDemo(container) {
      if (!container) {
        return;
      }
      registerGuideSectionDemoCleanup('movement');
      container.hidden = false;
      container.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'guide-section__demo-surface';
      wrapper.setAttribute('data-demo-type', 'movement');
      const canvas = document.createElement('canvas');
      canvas.width = 250;
      canvas.height = 250;
      canvas.className = 'guide-demo-surface';
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Movement demo canvas showing a small explorer sprite.');
      wrapper.appendChild(canvas);
      container.appendChild(wrapper);
      const caption = document.createElement('p');
      caption.className = 'guide-demo-caption';
      caption.textContent = 'Use WASD or the arrow keys to move the explorer.';
      container.appendChild(caption);

      const ctx = canvas.getContext('2d');
      const pressedKeys = new Set();
      const explorer = { x: 115, y: 115, size: 22, speed: 2.6 };
      let animationId = null;

      function drawBackground() {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#051126');
        gradient.addColorStop(1, '#0a223f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(73, 242, 255, 0.12)';
        for (let i = 0; i <= canvas.width; i += 25) {
          ctx.fillRect(i, 0, 1, canvas.height);
        }
        for (let j = 0; j <= canvas.height; j += 25) {
          ctx.fillRect(0, j, canvas.width, 1);
        }
      }

      function drawExplorer() {
        ctx.fillStyle = '#49f2ff';
        ctx.fillRect(explorer.x, explorer.y, explorer.size, explorer.size);
        ctx.fillStyle = '#071225';
        ctx.fillRect(explorer.x + 4, explorer.y + 5, 4, 4);
        ctx.fillRect(explorer.x + explorer.size - 8, explorer.y + 5, 4, 4);
        ctx.fillStyle = '#f7b733';
        ctx.fillRect(explorer.x + 6, explorer.y + explorer.size - 6, explorer.size - 12, 4);
      }

      function updateExplorerPosition() {
        let dx = 0;
        let dy = 0;
        if (pressedKeys.has('w') || pressedKeys.has('arrowup')) {
          dy -= explorer.speed;
        }
        if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) {
          dy += explorer.speed;
        }
        if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) {
          dx -= explorer.speed;
        }
        if (pressedKeys.has('d') || pressedKeys.has('arrowright')) {
          dx += explorer.speed;
        }
        explorer.x = Math.max(8, Math.min(explorer.x + dx, canvas.width - explorer.size - 8));
        explorer.y = Math.max(8, Math.min(explorer.y + dy, canvas.height - explorer.size - 8));
      }

      function render() {
        updateExplorerPosition();
        drawBackground();
        drawExplorer();
        animationId = window.requestAnimationFrame(render);
      }

      function handleKeyDown(event) {
        const key = event.key?.toLowerCase();
        if (!key) return;
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
          event.preventDefault();
          pressedKeys.add(key);
        }
      }

      function handleKeyUp(event) {
        const key = event.key?.toLowerCase();
        if (!key) return;
        if (pressedKeys.has(key)) {
          event.preventDefault();
          pressedKeys.delete(key);
        }
      }

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      render();
      try {
        canvas.focus({ preventScroll: true });
      } catch (error) {
        try {
          canvas.focus();
        } catch (focusError) {
          console.warn('Unable to focus movement demo canvas', focusError);
        }
      }

      registerGuideSectionDemoCleanup('movement', () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        if (animationId !== null) {
          window.cancelAnimationFrame(animationId);
        }
        pressedKeys.clear();
        container.innerHTML = '';
        container.hidden = true;
      });
    }

    function startCraftingDemo(container) {
      if (!container) {
        return;
      }
      registerGuideSectionDemoCleanup('crafting');
      container.hidden = false;
      container.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'guide-section__demo-surface';
      wrapper.setAttribute('data-demo-type', 'crafting');
      const canvas = document.createElement('canvas');
      canvas.width = 250;
      canvas.height = 250;
      canvas.className = 'guide-demo-surface';
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Crafting demo canvas with draggable components.');
      wrapper.appendChild(canvas);
      container.appendChild(wrapper);
      const caption = document.createElement('p');
      caption.className = 'guide-demo-caption';
      caption.textContent = 'Drag the tokens into the slots in order: Wood → Stone → Spark.';
      container.appendChild(caption);
      const toast = document.createElement('div');
      toast.className = 'guide-demo-toast';
      toast.setAttribute('role', 'status');
      toast.textContent = 'Success! Sequence stored.';
      toast.hidden = true;
      container.appendChild(toast);

      const ctx = canvas.getContext('2d');
      const slots = [
        { id: 'wood', label: 'Slot 1', x: 60, y: 180, width: 60, height: 36, filled: false },
        { id: 'stone', label: 'Slot 2', x: 125, y: 180, width: 60, height: 36, filled: false },
        { id: 'spark', label: 'Slot 3', x: 190, y: 180, width: 60, height: 36, filled: false },
      ];
      const items = [
        {
          id: 'wood',
          label: 'Wood',
          color: '#c58f52',
          x: 60,
          y: 70,
          radius: 18,
          order: 0,
          startX: 60,
          startY: 70,
          placed: false,
        },
        {
          id: 'stone',
          label: 'Stone',
          color: '#95a8c4',
          x: 125,
          y: 70,
          radius: 18,
          order: 1,
          startX: 125,
          startY: 70,
          placed: false,
        },
        {
          id: 'spark',
          label: 'Spark',
          color: '#f7b733',
          x: 190,
          y: 70,
          radius: 18,
          order: 2,
          startX: 190,
          startY: 70,
          placed: false,
        },
      ];
      let draggingItem = null;
      let pointerOffset = { x: 0, y: 0 };
      let nextSlotIndex = 0;

      function drawBackground() {
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#051126');
        gradient.addColorStop(1, '#0a233f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      function drawSlots() {
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.font = '10px "Chakra Petch", sans-serif';
        slots.forEach((slot, index) => {
          const isNext = index === nextSlotIndex;
          const left = slot.x - slot.width / 2;
          const top = slot.y - slot.height / 2;
          ctx.strokeStyle = slot.filled ? 'rgba(73, 242, 255, 0.7)' : isNext ? '#49f2ff' : 'rgba(73, 242, 255, 0.3)';
          ctx.fillStyle = slot.filled ? 'rgba(73, 242, 255, 0.12)' : 'rgba(8, 18, 38, 0.5)';
          ctx.fillRect(left, top, slot.width, slot.height);
          ctx.strokeRect(left, top, slot.width, slot.height);
          ctx.fillStyle = 'rgba(206, 227, 255, 0.85)';
          ctx.fillText(slot.label, slot.x, slot.y + slot.height / 2 + 14);
        });
      }

      function drawItems() {
        ctx.font = '11px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        items.forEach((item) => {
          ctx.fillStyle = item.color;
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#071225';
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius - 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(73, 242, 255, 0.8)';
          ctx.font = '10px "Chakra Petch", sans-serif';
          ctx.fillText(item.label, item.x, item.y + item.radius + 14);
        });
      }

      function renderCraftingDemo() {
        drawBackground();
        drawSlots();
        drawItems();
      }

      function getPointerPosition(event) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }

      function findItemAtPosition(pos) {
        for (let index = items.length - 1; index >= 0; index -= 1) {
          const item = items[index];
          if (item.placed) {
            continue;
          }
          const distance = Math.hypot(pos.x - item.x, pos.y - item.y);
          if (distance <= item.radius) {
            return item;
          }
        }
        return null;
      }

      function findSlotAtPosition(pos) {
        return slots.find((slot) => {
          return (
            pos.x >= slot.x - slot.width / 2 &&
            pos.x <= slot.x + slot.width / 2 &&
            pos.y >= slot.y - slot.height / 2 &&
            pos.y <= slot.y + slot.height / 2
          );
        });
      }

      function resetItemPosition(item) {
        item.x = item.startX;
        item.y = item.startY;
        item.placed = false;
      }

      function updateCaption() {
        const igniteKey = joinKeyLabels(getActionKeyLabels('interact', { limit: 1 }), {
          fallback: 'your ignite key',
        });
        if (nextSlotIndex >= slots.length) {
          caption.textContent = `Sequence complete! Press ${igniteKey} to craft the portal key.`;
          toast.hidden = false;
          return;
        }
        const nextItem = items.find((item) => item.order === nextSlotIndex);
        if (nextItem) {
          caption.textContent = `Next: drag ${nextItem.label} into slot ${nextSlotIndex + 1}.`;
        }
      }

      function handlePointerDown(event) {
        const pos = getPointerPosition(event);
        const item = findItemAtPosition(pos);
        if (!item) {
          return;
        }
        if (item.placed) {
          return;
        }
        draggingItem = item;
        pointerOffset = { x: pos.x - item.x, y: pos.y - item.y };
        toast.hidden = true;
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
      }

      function handlePointerMove(event) {
        if (!draggingItem) {
          return;
        }
        const pos = getPointerPosition(event);
        const nextX = pos.x - pointerOffset.x;
        const nextY = pos.y - pointerOffset.y;
        draggingItem.x = Math.max(draggingItem.radius, Math.min(nextX, canvas.width - draggingItem.radius));
        draggingItem.y = Math.max(draggingItem.radius, Math.min(nextY, canvas.height - draggingItem.radius));
        renderCraftingDemo();
      }

      function handlePointerUp(event) {
        if (!draggingItem) {
          return;
        }
        const pos = getPointerPosition(event);
        const slot = findSlotAtPosition(pos);
        if (slot && !slot.filled && draggingItem.order === nextSlotIndex && slot.id === draggingItem.id) {
          draggingItem.x = slot.x;
          draggingItem.y = slot.y;
          draggingItem.placed = true;
          slot.filled = true;
          nextSlotIndex += 1;
          updateCaption();
        } else {
          resetItemPosition(draggingItem);
        }
        draggingItem = null;
        pointerOffset = { x: 0, y: 0 };
        if (canvas.hasPointerCapture?.(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        renderCraftingDemo();
      }

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointercancel', handlePointerUp);
      renderCraftingDemo();
      try {
        canvas.focus({ preventScroll: true });
      } catch (error) {
        try {
          canvas.focus();
        } catch (focusError) {
          console.warn('Unable to focus crafting demo canvas', focusError);
        }
      }
      updateCaption();

      registerGuideSectionDemoCleanup('crafting', () => {
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('pointercancel', handlePointerUp);
        draggingItem = null;
        container.innerHTML = '';
        container.hidden = true;
      });
    }

    function closeGuideModal() {
      if (!guideModal) return;
      const activeElement = document.activeElement;
      if (activeElement && guideModal.contains(activeElement) && typeof activeElement.blur === 'function') {
        activeElement.blur();
      }
      guideModal.hidden = true;
      guideModal.setAttribute('data-open', 'false');
      guideModal.setAttribute('aria-hidden', 'true');
      clearGuideDemoTimers();
      runGuideDemoCleanups();
      cleanupGuideSectionDemos();
      guideModal.querySelectorAll('.guide-card__step').forEach((step) => {
        step.classList.remove('is-animating');
      });
      const fallbackFocusTarget = openGuideButton ?? null;
      const focusTarget =
        lastFocusedBeforeGuide && typeof lastFocusedBeforeGuide.focus === 'function'
          ? lastFocusedBeforeGuide
          : fallbackFocusTarget;
      lastFocusedBeforeGuide = null;
      if (focusTarget && typeof focusTarget.focus === 'function') {
        requestAnimationFrame(() => {
          try {
            focusTarget.focus({ preventScroll: true });
          } catch (error) {
            try {
              focusTarget.focus();
            } catch (focusError) {
              console.warn('Unable to restore focus after closing guide modal', focusError);
            }
          }
        });
      }
    }

    function setupGuideModal() {
      if (!guideModal) return;
      guideModal.setAttribute('data-open', 'false');
      guideModal.setAttribute('aria-hidden', 'true');
      guideModal.addEventListener('click', (event) => {
        if (event.target === guideModal) {
          closeGuideModal();
        }
      });
      guideModal.querySelectorAll('[data-close-guide]').forEach((button) => {
        button.addEventListener('click', closeGuideModal);
      });
      document.addEventListener('keydown', (event) => {
        const code = normaliseEventCode(event.code || '', event.key);
        if (isKeyForAction('closeMenus', code) && !guideModal.hidden) {
          closeGuideModal();
        }
      });
      initializeGuideCarousel();
    }

    function clearGuideDemoTimers() {
      guideCarouselState.timeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      guideCarouselState.timeouts.length = 0;
    }

    function registerGuideDemoCleanup(cleanup) {
      if (typeof cleanup === 'function') {
        guideCarouselState.cleanups.push(cleanup);
      }
    }

    function renderGuideControlsColumn(label, controls = []) {
      if (!controls.length) {
        return '';
      }
      const itemsMarkup = controls
        .map((control) => {
          const keysMarkup = (control.keys ?? [])
            .map((key) => `<kbd>${key}</kbd>`)
            .join('');
          return `
            <li>
              <div class="guide-card__control">
                <div class="guide-card__control-keys">${keysMarkup}</div>
                <p>${control.description}</p>
              </div>
            </li>
          `;
        })
        .join('');
      return `
        <div class="guide-card__list">
          <h4>${label}</h4>
          <ul>
            ${itemsMarkup}
          </ul>
        </div>
      `;
    }

    function createGuideCardMarkup(slide) {
      const captionId = `guideDemoCaption-${slide.id}`;
      const stepsMarkup = (slide.demoSequence ?? [])
        .map((step, index) => {
          const keysMarkup = (step.keys ?? [])
            .map((key) => `<kbd>${key}</kbd>`)
            .join('');
          return `
            <button type="button" class="guide-card__step" data-demo-step="${index}">
              <span class="guide-card__step-label">${step.label}</span>
              <span class="guide-card__step-keys">${keysMarkup}</span>
            </button>
          `;
        })
        .join('');
      const desktopColumn = renderGuideControlsColumn('Desktop', slide.desktopControls);
      const mobileColumn = renderGuideControlsColumn('Mobile', slide.mobileControls);
      const columnsMarkup = [desktopColumn, mobileColumn].filter(Boolean).join('');
      return `
        <header class="guide-card__header">
          <div class="guide-card__icon" role="img" aria-label="${slide.iconLabel}">
            <span aria-hidden="true">${slide.icon}</span>
          </div>
          <p class="guide-card__label">${slide.category}</p>
          <h3 class="guide-card__title">${slide.title}</h3>
          <p class="guide-card__description">${slide.description}</p>
        </header>
        <div class="guide-card__demo" data-guide-demo>
          <div class="guide-card__steps" data-guide-steps>
            ${stepsMarkup}
          </div>
          <button type="button" class="guide-card__play" data-guide-play aria-describedby="${captionId}">
            Play Demo
          </button>
          <p class="guide-card__caption" id="${captionId}" data-demo-caption>
            ${(slide.demoSequence && slide.demoSequence[0]?.caption) || ''}
          </p>
        </div>
        <div class="guide-card__columns">
          ${columnsMarkup}
        </div>
        <p class="guide-card__tip">${slide.tip}</p>
      `;
    }

    function animateGuideDemoSequence(stepButtons, captionEl, slide) {
      if (!stepButtons.length) return;
      clearGuideDemoTimers();
      (slide.demoSequence ?? []).forEach((step, index) => {
        const timeoutId = window.setTimeout(() => {
          stepButtons.forEach((button, buttonIndex) => {
            const isTarget = buttonIndex === index;
            button.classList.toggle('is-active', isTarget);
            if (isTarget) {
              button.classList.add('is-animating');
              captionEl.textContent = step.caption;
              const animationTimeout = window.setTimeout(() => {
                button.classList.remove('is-animating');
              }, 620);
              guideCarouselState.timeouts.push(animationTimeout);
            } else {
              button.classList.remove('is-animating');
            }
          });
        }, index * 900);
        guideCarouselState.timeouts.push(timeoutId);
      });
      const resetTimeout = window.setTimeout(() => {
        captionEl.textContent = slide.tip;
      }, (slide.demoSequence?.length ?? 0) * 900 + 720);
      guideCarouselState.timeouts.push(resetTimeout);
    }

    function startGuideInteractiveDemo(slide, demoContainer, captionEl, stepButtons, activateStep) {
      if (!demoContainer) {
        return;
      }
      demoContainer.dataset.active = 'true';
      demoContainer.innerHTML = '';
      runGuideDemoCleanups();
      let cleanup;
      const context = { captionEl, stepButtons, activateStep };
      switch (slide.id) {
        case 'rail-surfing':
          cleanup = createRailSurfingDemo(demoContainer, context);
          break;
        case 'portal-forging':
          cleanup = createPortalForgingDemo(demoContainer, context);
          break;
        case 'survival-kit':
          cleanup = createSurvivalKitDemo(demoContainer, context);
          break;
        default:
          demoContainer.textContent = 'Interactive demo coming soon for this guide card.';
      }
      registerGuideDemoCleanup(cleanup);
    }

    function attachGuideDemoHandlers(cardEl, slide) {
      const demoHost = cardEl.querySelector('[data-guide-demo]');
      if (!demoHost) return;
      const captionEl = demoHost.querySelector('[data-demo-caption]');
      const stepButtons = Array.from(demoHost.querySelectorAll('[data-demo-step]'));
      const playButton = demoHost.querySelector('[data-guide-play]');
      let demoContainer = demoHost.querySelector('[data-demo-canvas-container]');
      if (!demoContainer) {
        demoContainer = document.createElement('div');
        demoContainer.className = 'guide-card__canvas';
        demoContainer.setAttribute('data-demo-canvas-container', 'true');
        demoContainer.setAttribute('aria-live', 'polite');
        demoHost.appendChild(demoContainer);
      }
      if (!captionEl || !stepButtons.length) {
        return;
      }

      playButton?.setAttribute('aria-expanded', demoContainer?.dataset.active === 'true' ? 'true' : 'false');

      function activateStep(stepIndex, { animate = false, captionOverride } = {}) {
        clearGuideDemoTimers();
        stepButtons.forEach((button, index) => {
          const isActive = index === stepIndex;
          button.classList.toggle('is-active', isActive);
          button.classList.remove('is-animating');
        });
        const step = slide.demoSequence?.[stepIndex];
        if (!step) return;
        captionEl.textContent = captionOverride ?? step.caption;
        if (animate) {
          const target = stepButtons[stepIndex];
          target.classList.add('is-animating');
          const timeoutId = window.setTimeout(() => {
            target.classList.remove('is-animating');
          }, 420);
          guideCarouselState.timeouts.push(timeoutId);
        }
      }

      stepButtons.forEach((button) => {
        const index = Number.parseInt(button.getAttribute('data-demo-step') || '0', 10);
        button.addEventListener('click', () => activateStep(index, { animate: true }));
        button.addEventListener('mouseenter', () => activateStep(index));
        button.addEventListener('focus', () => activateStep(index));
      });

      playButton?.addEventListener('click', () => {
        playButton.setAttribute('aria-expanded', 'true');
        startGuideInteractiveDemo(slide, demoContainer, captionEl, stepButtons, activateStep);
        animateGuideDemoSequence(stepButtons, captionEl, slide);
      });

      activateStep(0);
    }

    function createGuideCanvas(container) {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      canvas.className = 'guide-demo-surface';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Interactive guide demonstration area');
      canvas.tabIndex = 0;
      container.appendChild(canvas);
      window.setTimeout(() => {
        try {
          canvas.focus();
        } catch (error) {
          console.warn('Unable to focus guide canvas', error);
        }
      }, 0);
      return canvas;
    }

    function createRailSurfingDemo(container, { captionEl, activateStep }) {
      const canvas = createGuideCanvas(container);
      const ctx = canvas.getContext('2d');
      const railsY = [60, 100, 140];
      const character = { x: 96, y: railsY[1], size: 18, vx: 0, vy: 0, jumpTimer: 0 };
      const keys = new Set();
      let rafId = null;

      captionEl.textContent = 'Use WASD or the arrow keys to move, Space to jump, Shift to stabilise.';
      activateStep(0, { animate: true, captionOverride: 'Lean into the highlighted rail before the void surge reaches it.' });

      function drawRails() {
        ctx.strokeStyle = 'rgba(73, 242, 255, 0.4)';
        ctx.lineWidth = 4;
        railsY.forEach((y) => {
          ctx.beginPath();
          ctx.moveTo(20, y);
          ctx.lineTo(180, y);
          ctx.stroke();
        });
      }

      function drawCharacter() {
        const bounce = character.jumpTimer > 0 ? Math.sin((character.jumpTimer / 18) * Math.PI) * 16 : 0;
        const y = character.y - bounce;
        ctx.fillStyle = '#49f2ff';
        ctx.fillRect(character.x - character.size / 2, y - character.size / 2, character.size, character.size);
        ctx.fillStyle = '#081226';
        ctx.fillRect(character.x - 6, y - 4, 4, 4);
        ctx.fillRect(character.x + 2, y - 4, 4, 4);
      }

      function drawBackdrop() {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#050d1e');
        gradient.addColorStop(1, '#0a213f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const hasActionActive = (action) => {
        for (const code of keys) {
          if (isKeyForAction(action, code)) {
            return true;
          }
        }
        return false;
      };

      function updateCharacterPosition() {
        const speed = 2.5;
        character.vx = 0;
        character.vy = 0;
        if (hasActionActive('moveLeft')) {
          character.vx -= speed;
        }
        if (hasActionActive('moveRight')) {
          character.vx += speed;
        }
        if (hasActionActive('moveForward')) {
          character.vy -= speed;
        }
        if (hasActionActive('moveBackward')) {
          character.vy += speed;
        }
        character.x = Math.min(Math.max(character.x + character.vx, 26), 174);
        character.y = Math.min(Math.max(character.y + character.vy, 40), 160);
        if (character.jumpTimer > 0) {
          character.jumpTimer -= 1;
        }
      }

      function render() {
        updateCharacterPosition();
        drawBackdrop();
        drawRails();
        drawCharacter();
        rafId = window.requestAnimationFrame(render);
      }

      function handleKeyDown(event) {
        const code = normaliseEventCode(event.code || '', event.key);
        if (!code) {
          return;
        }
        keys.add(code);
        if (isKeyForAction('jump', code)) {
          character.jumpTimer = 18;
          activateStep(1, { animate: true });
          captionEl.textContent = 'Tap jump to clear the missing section and keep your combo streak alive.';
        }
        if (event.key.toLowerCase() === 'shift') {
          activateStep(2, { animate: true });
          captionEl.textContent = 'Feather the landing so magnetised boots lock onto the rail.';
        }
        if (isKeyForAction('moveRight', code)) {
          activateStep(0, { animate: true });
        }
      }

      function handleKeyUp(event) {
        const code = normaliseEventCode(event.code || '', event.key);
        if (!code) {
          return;
        }
        keys.delete(code);
      }

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      render();

      return () => {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }

    function createPortalForgingDemo(container, { captionEl, activateStep }) {
      const canvas = createGuideCanvas(container);
      const ctx = canvas.getContext('2d');
      const slots = [
        { x: 60, y: 40, width: 30, height: 30, id: 'focus-crystal', filled: false },
        { x: 100, y: 40, width: 30, height: 30, id: 'frame-segment', filled: false },
        { x: 140, y: 40, width: 30, height: 30, id: 'igniter', filled: false },
      ];
      const items = [
        { id: 'focus-crystal', color: '#49f2ff', x: 50, y: 150, radius: 14, grabbed: false },
        { id: 'frame-segment', color: '#f7b733', x: 100, y: 150, radius: 14, grabbed: false },
        { id: 'igniter', color: '#ff4e50', x: 150, y: 150, radius: 14, grabbed: false },
      ];
      let draggingItem = null;
      let pointerOffset = { x: 0, y: 0 };
      let blueprintVisible = true;
      let igniteReady = false;
      let rafId = null;
      let confettiPieces = [];

      const getPortalIgniteKeyLabel = () =>
        joinKeyLabels(getActionKeyLabels('interact', { limit: 1 }), {
          fallback: 'your ignite key',
        }) || 'your ignite key';
      captionEl.textContent = `Drag the glowing components into the sequence slots, then press ${getPortalIgniteKeyLabel()} to ignite.`;
      activateStep(0, { animate: true, captionOverride: 'Call up the blueprint to lock the frame dimensions.' });

      function drawBackground() {
        ctx.fillStyle = '#081226';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      function drawPortalFrame() {
        ctx.strokeStyle = 'rgba(73, 242, 255, 0.55)';
        ctx.lineWidth = 4;
        ctx.strokeRect(40, 80, 120, 90);
        ctx.strokeStyle = 'rgba(73, 242, 255, 0.25)';
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(46, 86, 108, 78);
        ctx.setLineDash([]);
      }

      function drawSlots() {
        slots.forEach((slot) => {
          ctx.strokeStyle = slot.filled ? '#49f2ff' : 'rgba(73, 242, 255, 0.35)';
          ctx.lineWidth = 2;
          ctx.strokeRect(slot.x - slot.width / 2, slot.y - slot.height / 2, slot.width, slot.height);
        });
      }

      function drawItems() {
        items.forEach((item) => {
          ctx.fillStyle = item.color;
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(8, 18, 38, 0.6)';
          ctx.font = '10px "Chakra Petch", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(item.id === 'focus-crystal' ? 'Focus' : item.id === 'frame-segment' ? 'Frame' : 'Ignite', item.x, item.y + 24);
        });
      }

      function drawBlueprintGlow() {
        if (!blueprintVisible) return;
        ctx.fillStyle = 'rgba(73, 242, 255, 0.1)';
        ctx.fillRect(36, 36, 128, 56);
      }

      function drawConfetti() {
        confettiPieces.forEach((piece) => {
          piece.x += piece.vx;
          piece.y += piece.vy;
          piece.vy += 0.1;
          ctx.fillStyle = piece.color;
          ctx.fillRect(piece.x, piece.y, piece.size, piece.size);
        });
        confettiPieces = confettiPieces.filter((piece) => piece.y < canvas.height + 10);
      }

      function render() {
        drawBackground();
        drawBlueprintGlow();
        drawPortalFrame();
        drawSlots();
        drawItems();
        drawConfetti();
        rafId = window.requestAnimationFrame(render);
      }

      function pointerPosition(event) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }

      function findItemAtPosition(pos) {
        return items.find((item) => {
          const distance = Math.hypot(item.x - pos.x, item.y - pos.y);
          return distance <= item.radius + 4;
        });
      }

      function findSlotForItem(item, pos) {
        return slots.find((slot) => {
          if (slot.id !== item.id || slot.filled) {
            return false;
          }
          return (
            pos.x >= slot.x - slot.width / 2 &&
            pos.x <= slot.x + slot.width / 2 &&
            pos.y >= slot.y - slot.height / 2 &&
            pos.y <= slot.y + slot.height / 2
          );
        });
      }

      function handlePointerDown(event) {
        const pos = pointerPosition(event);
        const targetItem = findItemAtPosition(pos);
        if (!targetItem) return;
        draggingItem = targetItem;
        draggingItem.grabbed = true;
        pointerOffset = { x: pos.x - targetItem.x, y: pos.y - targetItem.y };
        blueprintVisible = false;
        activateStep(1, { animate: true, captionOverride: 'Drag to set each block until the lattice sings in resonance.' });
        canvas.setPointerCapture(event.pointerId);
      }

      function handlePointerMove(event) {
        if (!draggingItem) return;
        const pos = pointerPosition(event);
        draggingItem.x = pos.x - pointerOffset.x;
        draggingItem.y = pos.y - pointerOffset.y;
      }

      function handlePointerUp(event) {
        if (!draggingItem) return;
        const pos = pointerPosition(event);
        const slot = findSlotForItem(draggingItem, pos);
        if (slot) {
          draggingItem.x = slot.x;
          draggingItem.y = slot.y;
          slot.filled = true;
        }
        draggingItem.grabbed = false;
        draggingItem = null;
        if (canvas.hasPointerCapture?.(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        igniteReady = slots.every((slot) => slot.filled);
        if (igniteReady) {
          captionEl.textContent = `Press ${getPortalIgniteKeyLabel()} to ignite the portal matrix.`;
        }
      }

      function handleKeyDown(event) {
        const code = normaliseEventCode(event.code || '', event.key);
        if (igniteReady && isKeyForAction('interact', code)) {
          activateStep(2, { animate: true });
          captionEl.textContent = 'Gateway stabilised! Sequence stored in your crafting circle.';
          igniteReady = false;
          confettiPieces = Array.from({ length: 18 }).map(() => ({
            x: canvas.width / 2,
            y: 84,
            vx: (Math.random() - 0.5) * 2.2,
            vy: -Math.random() * 2.8 - 1.5,
            size: Math.random() * 4 + 2,
            color: Math.random() > 0.5 ? '#49f2ff' : '#f7b733',
          }));
        }
      }

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointerleave', handlePointerUp);
      window.addEventListener('keydown', handleKeyDown);
      render();

      return () => {
        window.cancelAnimationFrame(rafId);
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('pointerleave', handlePointerUp);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }

    function createSurvivalKitDemo(container, { captionEl, activateStep }) {
      const canvas = createGuideCanvas(container);
      const ctx = canvas.getContext('2d');
      let rafId = null;
      let barricadePlaced = false;
      let repairProgress = 0;
      let repairing = false;
      let hazardX = 0;
      let hotbarIndex = 0;

      captionEl.textContent = 'Cycle your hotbar, deploy a barricade, then hold to repair damaged rails.';
      activateStep(0, { animate: true, captionOverride: 'Swap to your emergency slot with a quick-cycle.' });

      function drawBackground() {
        ctx.fillStyle = '#061428';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#112f4f';
        ctx.fillRect(20, 120, 160, 12);
      }

      function drawHazard() {
        ctx.fillStyle = '#ff4e50';
        ctx.beginPath();
        ctx.arc(hazardX, 126, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      function drawBarricade() {
        if (!barricadePlaced) return;
        ctx.fillStyle = '#f7b733';
        ctx.fillRect(110, 114, 16, 24);
      }

      function drawRepairBeam() {
        if (!repairing) return;
        ctx.fillStyle = 'rgba(73, 242, 255, 0.45)';
        ctx.fillRect(90, 90, 4, 40 + repairProgress * 0.25);
      }

      function drawHotbar() {
        const slotWidth = 34;
        for (let index = 0; index < 3; index += 1) {
          ctx.strokeStyle = index === hotbarIndex ? '#49f2ff' : 'rgba(73, 242, 255, 0.25)';
          ctx.strokeRect(32 + index * (slotWidth + 6), 160, slotWidth, 22);
        }
      }

      function drawRepairProgress() {
        ctx.strokeStyle = 'rgba(73, 242, 255, 0.25)';
        ctx.strokeRect(60, 40, 80, 12);
        ctx.fillStyle = '#49f2ff';
        ctx.fillRect(60, 40, repairProgress, 12);
      }

      function render() {
        drawBackground();
        drawHazard();
        drawBarricade();
        drawRepairBeam();
        drawHotbar();
        drawRepairProgress();
        hazardX += 0.6;
        if (hazardX > 200) {
          hazardX = -20;
        }
        if (repairing) {
          repairProgress = Math.min(repairProgress + 1.5, 80);
          if (repairProgress >= 80) {
            activateStep(2, { animate: true });
            captionEl.textContent = 'Rails restabilised — you are ready for the next raid.';
            repairing = false;
          }
        }
        rafId = window.requestAnimationFrame(render);
      }

      function handleKeyDown(event) {
        const code = normaliseEventCode(event.code || '', event.key);
        if (isKeyForAction('placeBlock', code)) {
          hotbarIndex = (hotbarIndex + 1) % 3;
          activateStep(0, { animate: true });
          captionEl.textContent = 'Emergency slot armed. Deploy a barricade next!';
        }
        const hotbarSlot = getHotbarSlotFromCode(code);
        if (hotbarSlot !== null && hotbarSlot < 3) {
          hotbarIndex = hotbarSlot;
          barricadePlaced = true;
          activateStep(1, { animate: true });
          captionEl.textContent = 'Barricade deployed. Hold to channel repairs.';
        }
      }

      function handlePointerDown() {
        if (!barricadePlaced) {
          captionEl.textContent = 'Drop a barricade before repairing to slow the raid.';
          return;
        }
        repairing = true;
        activateStep(2, { animate: true });
      }

      function handlePointerUp() {
        repairing = false;
      }

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointerleave', handlePointerUp);
      window.addEventListener('keydown', handleKeyDown);
      render();

      return () => {
        window.cancelAnimationFrame(rafId);
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('pointerleave', handlePointerUp);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }

    function initializeGuideCarousel() {
      if (!guideModal || guideModal.dataset.carouselInitialized === 'true') {
        return;
      }
      const carouselEl = guideModal.querySelector('[data-guide-carousel]');
      if (!carouselEl) return;
      const cardEl = carouselEl.querySelector('[data-guide-card]');
      const prevButton = carouselEl.querySelector('[data-guide-prev]');
      const nextButton = carouselEl.querySelector('[data-guide-next]');
      const dotsContainer = carouselEl.querySelector('[data-guide-dots]');
      if (!cardEl || !prevButton || !nextButton || !dotsContainer) {
        return;
      }

      prevButton.setAttribute('aria-controls', 'guideCarouselCard');
      nextButton.setAttribute('aria-controls', 'guideCarouselCard');

      function updateDots() {
        const dots = dotsContainer.querySelectorAll('button');
        dots.forEach((dot, index) => {
          const isActive = index === guideCarouselState.currentIndex;
          dot.dataset.active = isActive ? 'true' : 'false';
          dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
      }

      function renderSlide() {
        const slide = GUIDE_SLIDES[guideCarouselState.currentIndex];
        if (!slide) return;
        cardEl.setAttribute('data-current-slide', slide.id);
        cardEl.innerHTML = createGuideCardMarkup(slide);
        attachGuideDemoHandlers(cardEl, slide);
      }

      function goToSlide(index, { focusDot = false, forceRender = false } = {}) {
        if (!GUIDE_SLIDES.length) return;
        const total = GUIDE_SLIDES.length;
        const targetIndex = ((index % total) + total) % total;
        const didChange = guideCarouselState.currentIndex !== targetIndex;
        guideCarouselState.currentIndex = targetIndex;
        clearGuideDemoTimers();
        runGuideDemoCleanups();
        if (didChange || forceRender || !cardEl.childElementCount) {
          renderSlide();
        } else {
          const slide = GUIDE_SLIDES[targetIndex];
          attachGuideDemoHandlers(cardEl, slide);
        }
        updateDots();
        if (focusDot) {
          const activeDot = dotsContainer.querySelector("button[data-active='true']");
          activeDot?.focus();
        }
      }

      dotsContainer.innerHTML = '';
      GUIDE_SLIDES.forEach((slide, index) => {
        const dotButton = document.createElement('button');
        dotButton.type = 'button';
        dotButton.className = 'guide-carousel__dot';
        dotButton.dataset.index = String(index);
        dotButton.setAttribute('aria-label', `Show ${slide.title}`);
        dotButton.setAttribute('aria-controls', 'guideCarouselCard');
        dotButton.addEventListener('click', () => goToSlide(index, { focusDot: true }));
        dotsContainer.appendChild(dotButton);
      });

      carouselEl.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goToSlide(guideCarouselState.currentIndex - 1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          goToSlide(guideCarouselState.currentIndex + 1);
        }
      });

      prevButton.addEventListener('click', () => {
        goToSlide(guideCarouselState.currentIndex - 1);
      });
      nextButton.addEventListener('click', () => {
        goToSlide(guideCarouselState.currentIndex + 1);
      });

      guideCarouselState.goToSlide = (index, options = {}) => {
        goToSlide(index, { ...options, forceRender: options.forceRender ?? false });
      };

      goToSlide(guideCarouselState.currentIndex, { forceRender: true });
      guideModal.dataset.carouselInitialized = 'true';
    }

  }

  function ensureThree() {
    const scope =
      typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : typeof global !== 'undefined'
            ? global
            : {};
    const existing = scope.THREE_GLOBAL || scope.THREE;
    if (existing) {
      scope.THREE_GLOBAL = existing;
      scope.THREE = existing;
      return Promise.resolve(existing);
    }

    if (threeLoaderPromise) {
      return threeLoaderPromise;
    }

    let startIndex = 0;
    if (typeof document !== 'undefined') {
      const attemptedFallbacks = Array.from(
        document.querySelectorAll('script[data-three-fallback-index]')
      )
        .map((script) => Number.parseInt(script.getAttribute('data-three-fallback-index') || '', 10))
        .filter((value) => Number.isFinite(value) && value >= 0);
      if (attemptedFallbacks.length > 0) {
        startIndex = Math.min(THREE_CDN_URLS.length, Math.max(...attemptedFallbacks) + 1);
      }
    }

    const tryLoad = (index = startIndex, lastError = null) => {
      if (index >= THREE_CDN_URLS.length) {
        const error = new Error('Three.js failed to load after attempting CDN fallbacks.');
        if (lastError) {
          error.cause = lastError;
        }
        return Promise.reject(error);
      }

      const url = THREE_CDN_URLS[index];
      return loadScript(url, {
        'data-three-fallback': 'true',
        'data-three-fallback-index': String(index),
      })
        .then(() => {
          const instance = scope.THREE_GLOBAL || scope.THREE;
          if (!instance) {
            throw new Error('Three.js script loaded but did not expose THREE.');
          }
          scope.THREE_GLOBAL = instance;
          scope.THREE = instance;
          return instance;
        })
        .catch((error) => {
          if (typeof document !== 'undefined') {
            const fallbackElement = document.querySelector(
              `script[data-three-fallback-index="${index}"]`
            );
            if (fallbackElement) {
              fallbackElement.setAttribute('data-three-fallback-error', 'true');
            }
          }
          return tryLoad(index + 1, error);
        });
    };

    threeLoaderPromise = tryLoad().catch((error) => {
      threeLoaderPromise = null;
      return Promise.reject(error);
    });

    return threeLoaderPromise;
  }

  function ensureGLTFLoader(THREE) {
    if (THREE?.GLTFLoader) {
      return Promise.resolve(THREE.GLTFLoader);
    }

    if (gltfLoaderPromise) {
      return gltfLoaderPromise;
    }

    const scope =
      typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : typeof global !== 'undefined'
            ? global
            : {};

    const resolveLoader = () => {
      if (!THREE.GLTFLoader && scope.GLTFLoaderModule?.GLTFLoader) {
        THREE.GLTFLoader = scope.GLTFLoaderModule.GLTFLoader;
        try {
          delete scope.GLTFLoaderModule;
        } catch (error) {
          scope.GLTFLoaderModule = undefined;
        }
      }
      return THREE.GLTFLoader || null;
    };

    const tryLoad = (index = 0, lastError = null) => {
      if (resolveLoader()) {
        return Promise.resolve(THREE.GLTFLoader);
      }
      if (index >= GLTF_SCRIPT_URLS.length) {
        const error = new Error('Failed to load GLTFLoader script.');
        if (lastError) {
          error.cause = lastError;
        }
        throw error;
      }

      const url = GLTF_SCRIPT_URLS[index];
      return loadScript(url, { 'data-gltf-loader': index === 0 ? 'local' : 'cdn' })
        .then(() => {
          const loader = resolveLoader();
          if (!loader) {
            throw new Error('GLTFLoader script loaded but did not register the loader.');
          }
          return loader;
        })
        .catch((error) => tryLoad(index + 1, error));
    };

    gltfLoaderPromise = tryLoad().catch((error) => {
      gltfLoaderPromise = null;
      throw error;
    });

    return gltfLoaderPromise;
  }

  ensureThree()
    .then(() => {
      bootstrap();
    })
    .catch((error) => {
      showDependencyError(
        'We could not initialise the 3D renderer. Please refresh the page after checking your connection.',
        error
      );
    });
})();
