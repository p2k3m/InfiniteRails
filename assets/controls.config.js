(function initialiseDeclarativeControlMap(scope) {
  const CONTROL_MAP_GLOBAL_KEY = '__INFINITE_RAILS_CONTROL_MAP__';
  const CONTROL_MAP_READY_EVENT = 'infinite-rails:control-map-ready';
  const CONTROL_MAP_CHANGED_EVENT = 'infinite-rails:control-map-changed';
  const KEY_BINDINGS_STORAGE_KEY = 'infinite-rails-keybindings';

  if (!scope) {
    return;
  }

  function createDefaultControlMap() {
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
      activateBriefingFallback: ['F9'],
      startSimpleFallbackRenderer: ['F10'],
      triggerTutorialRescue: ['F7'],
      openGuide: [],
      toggleTutorial: ['F1', 'Slash'],
      toggleDeveloperOverlay: ['Backquote', 'F8'],
      openSettings: ['F2'],
      openLeaderboard: ['F3'],
      closeMenus: ['Escape'],
    };
    for (let slot = 1; slot <= 10; slot += 1) {
      const digit = slot % 10;
      map[`hotbar${slot}`] = [`Digit${digit}`, `Numpad${digit}`];
    }
    return map;
  }

  function cloneControlMap(source = {}) {
    const clone = {};
    Object.entries(source).forEach(([action, keys]) => {
      if (!Array.isArray(keys)) {
        return;
      }
      clone[action] = keys.map((value) => (typeof value === 'string' ? value : String(value ?? '').trim()))
        .filter((value) => value && typeof value === 'string');
    });
    return clone;
  }

  function normaliseStoredOverrideValue(value) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }
    if (Array.isArray(value)) {
      const result = [];
      const seen = new Set();
      value.forEach((entry) => {
        if (typeof entry !== 'string') {
          return;
        }
        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed)) {
          return;
        }
        seen.add(trimmed);
        result.push(trimmed);
      });
      return result;
    }
    return [];
  }

  function normaliseStoredOverrides(source) {
    if (!source || typeof source !== 'object') {
      return null;
    }
    const result = {};
    Object.entries(source).forEach(([action, value]) => {
      if (typeof action !== 'string') {
        return;
      }
      const trimmedAction = action.trim();
      if (!trimmedAction) {
        return;
      }
      result[trimmedAction] = normaliseStoredOverrideValue(value);
    });
    return Object.keys(result).length ? result : null;
  }

  function areKeyArraysEqual(a = [], b = []) {
    if (a === b) {
      return true;
    }
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }
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

  function computeControlOverrides(map, defaults) {
    if (!map || typeof map !== 'object') {
      return null;
    }
    const overrides = {};
    const defaultMap = defaults && typeof defaults === 'object' ? defaults : {};
    const normalised = {};
    Object.entries(map).forEach(([action, value]) => {
      if (typeof action !== 'string') {
        return;
      }
      const trimmedAction = action.trim();
      if (!trimmedAction) {
        return;
      }
      normalised[trimmedAction] = normaliseStoredOverrideValue(value);
    });
    const actionKeys = new Set([...Object.keys(defaultMap), ...Object.keys(normalised)]);
    actionKeys.forEach((action) => {
      const keys = normalised[action] ?? [];
      const defaultKeys = Array.isArray(defaultMap[action]) ? defaultMap[action] : [];
      if (!areKeyArraysEqual(keys, defaultKeys)) {
        overrides[action] = [...keys];
      }
    });
    return Object.keys(overrides).length ? overrides : null;
  }

  function applyOverrides(base, overrides) {
    if (!overrides || typeof overrides !== 'object') {
      return cloneControlMap(base);
    }
    const result = cloneControlMap(base);
    Object.entries(overrides).forEach(([action, keys]) => {
      if (typeof action !== 'string') {
        return;
      }
      const trimmedAction = action.trim();
      if (!trimmedAction || !Array.isArray(keys)) {
        return;
      }
      result[trimmedAction] = [...keys];
    });
    return result;
  }

  function loadStoredOverrides(defaults) {
    if (!scope?.localStorage) {
      return null;
    }
    try {
      const raw = scope.localStorage.getItem(KEY_BINDINGS_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      const overrides = normaliseStoredOverrides(parsed);
      if (!overrides) {
        return null;
      }
      return overrides;
    } catch (error) {
      scope?.console?.debug?.('Failed to restore control map overrides from storage.', error);
      try {
        scope.localStorage.removeItem(KEY_BINDINGS_STORAGE_KEY);
      } catch (removeError) {
        scope?.console?.debug?.('Failed to clear corrupted control map overrides from storage.', removeError);
      }
      return null;
    }
  }

  function persistControlMap(map, defaults) {
    const key = KEY_BINDINGS_STORAGE_KEY;
    if (!scope?.localStorage) {
      return { stored: false, storage: null, key };
    }
    const baseline = defaults && typeof defaults === 'object' ? defaults : {};
    let overrides;
    try {
      overrides = computeControlOverrides(map, baseline);
    } catch (error) {
      scope?.console?.debug?.('Failed to compute control map overrides for persistence.', error);
      return { stored: false, storage: 'local', key, error };
    }
    try {
      if (overrides && Object.keys(overrides).length) {
        scope.localStorage.setItem(key, JSON.stringify(overrides));
        return { stored: true, storage: 'local', key };
      }
      scope.localStorage.removeItem(key);
      return { stored: false, storage: 'local', key };
    } catch (error) {
      scope?.console?.debug?.('Failed to persist control map overrides to storage.', error);
      return { stored: false, storage: 'local', key, error };
    }
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
        if (typeof entry !== 'string') {
          return;
        }
        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed)) {
          return;
        }
        seen.add(trimmed);
        result.push(trimmed);
      });
      return result;
    }
    return [];
  }

  function normaliseControlMap(source) {
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

  function ensureAppConfig(target) {
    if (!target) {
      return null;
    }
    if (target.APP_CONFIG && typeof target.APP_CONFIG === 'object') {
      return target.APP_CONFIG;
    }
    if (target.APP_CONFIG === undefined) {
      try {
        target.APP_CONFIG = {};
        return target.APP_CONFIG;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function dispatchControlMapEvent(type, map, options = {}) {
    if (typeof scope.dispatchEvent !== 'function') {
      return;
    }
    const EventCtor =
      typeof scope.CustomEvent === 'function'
        ? scope.CustomEvent
        : typeof CustomEvent === 'function'
          ? CustomEvent
          : null;
    if (!EventCtor) {
      return;
    }
    try {
      const detail = {
        map: cloneControlMap(map),
        timestamp: Date.now(),
      };
      if (options && typeof options === 'object') {
        if (Object.prototype.hasOwnProperty.call(options, 'persisted')) {
          detail.persisted = Boolean(options.persisted);
        }
        if (typeof options.storage === 'string' && options.storage.trim().length) {
          detail.storage = options.storage.trim();
        }
        if (typeof options.key === 'string' && options.key.trim().length) {
          detail.storageKey = options.key.trim();
        }
        if (typeof options.reason === 'string' && options.reason.trim().length) {
          detail.reason = options.reason.trim();
        }
        if (typeof options.source === 'string' && options.source.trim().length) {
          detail.source = options.source.trim();
        }
        if (options.error) {
          detail.error = options.error;
        }
        if (Object.prototype.hasOwnProperty.call(options, 'resumed')) {
          detail.resumed = Boolean(options.resumed);
        }
      }
      scope.dispatchEvent(new EventCtor(type, { detail }));
    } catch (error) {
      // Ignore dispatch failures in non-DOM environments.
    }
  }

  const controlMapListeners = new Set();

  function notifyControlMapListeners(map) {
    if (!controlMapListeners.size) {
      return;
    }
    const snapshot = cloneControlMap(map);
    controlMapListeners.forEach((listener) => {
      if (typeof listener !== 'function') {
        return;
      }
      try {
        listener(snapshot);
      } catch (error) {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('Control map listener failed.', error);
        }
      }
    });
  }

  const defaultControlMap = createDefaultControlMap();
  const storedOverrides = loadStoredOverrides(defaultControlMap);
  const existing =
    normaliseControlMap(scope[CONTROL_MAP_GLOBAL_KEY]) ||
    normaliseControlMap(scope.APP_CONFIG && scope.APP_CONFIG.controlMap) ||
    normaliseControlMap(scope.APP_CONFIG && scope.APP_CONFIG.keyBindings);

  const initialBase = cloneControlMap(existing || defaultControlMap);
  const initialMap = storedOverrides ? applyOverrides(initialBase, storedOverrides) : initialBase;
  scope[CONTROL_MAP_GLOBAL_KEY] = initialMap;
  const appConfig = ensureAppConfig(scope);
  if (appConfig) {
    appConfig.controlMap = initialMap;
  }

  const initialPersistResult = persistControlMap(initialMap, defaultControlMap);
  notifyControlMapListeners(initialMap);
  dispatchControlMapEvent(CONTROL_MAP_READY_EVENT, initialMap, {
    persisted: initialPersistResult?.stored,
    storage: initialPersistResult?.storage || (scope?.localStorage ? 'local' : null),
    key: initialPersistResult?.key,
    error: initialPersistResult?.error,
    resumed: Boolean(storedOverrides),
    reason: storedOverrides ? 'resume' : 'initialise',
  });

  function applyControlMap(update, options = {}) {
    const { merge = true, notify = true } = options ?? {};
    const normalised = normaliseControlMap(update);
    if (!normalised) {
      return null;
    }
    const base = merge ? cloneControlMap(scope[CONTROL_MAP_GLOBAL_KEY] || initialMap) : {};
    Object.entries(normalised).forEach(([action, keys]) => {
      base[action] = [...keys];
    });
    scope[CONTROL_MAP_GLOBAL_KEY] = base;
    if (appConfig) {
      appConfig.controlMap = base;
    }
    const persistResult = persistControlMap(base, defaultControlMap);
    notifyControlMapListeners(base);
    if (notify) {
      dispatchControlMapEvent(CONTROL_MAP_CHANGED_EVENT, base, {
        persisted: persistResult?.stored,
        storage: persistResult?.storage || (scope?.localStorage ? 'local' : null),
        key: persistResult?.key,
        error: persistResult?.error,
        reason: typeof options.reason === 'string' && options.reason.trim().length ? options.reason.trim() : 'update',
        source: typeof options.source === 'string' && options.source.trim().length ? options.source.trim() : 'declarative',
      });
    }
    return cloneControlMap(base);
  }

  const api = {
    get: () => cloneControlMap(scope[CONTROL_MAP_GLOBAL_KEY] || initialMap),
    apply: (map, options) => applyControlMap(map, options),
    reset: (options = {}) => applyControlMap(createDefaultControlMap(), { ...options, merge: false, reason: options.reason ?? 'reset' }),
    defaults: () => cloneControlMap(defaultControlMap),
    subscribe: (listener) => {
      if (typeof listener !== 'function') {
        return () => {};
      }
      controlMapListeners.add(listener);
      try {
        listener(cloneControlMap(scope[CONTROL_MAP_GLOBAL_KEY] || initialMap));
      } catch (error) {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('Control map listener failed during subscription.', error);
        }
      }
      return () => {
        controlMapListeners.delete(listener);
      };
    },
  };

  if (!scope.InfiniteRailsControls || typeof scope.InfiniteRailsControls !== 'object') {
    scope.InfiniteRailsControls = api;
  } else {
    Object.assign(scope.InfiniteRailsControls, api);
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
