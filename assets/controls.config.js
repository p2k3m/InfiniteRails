(function initialiseDeclarativeControlMap(scope) {
  const CONTROL_MAP_GLOBAL_KEY = '__INFINITE_RAILS_CONTROL_MAP__';
  const CONTROL_MAP_READY_EVENT = 'infinite-rails:control-map-ready';
  const CONTROL_MAP_CHANGED_EVENT = 'infinite-rails:control-map-changed';

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

  function dispatchControlMapEvent(type, map) {
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
      scope.dispatchEvent(new EventCtor(type, { detail: { map: cloneControlMap(map) } }));
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

  const existing =
    normaliseControlMap(scope[CONTROL_MAP_GLOBAL_KEY]) ||
    normaliseControlMap(scope.APP_CONFIG && scope.APP_CONFIG.controlMap) ||
    normaliseControlMap(scope.APP_CONFIG && scope.APP_CONFIG.keyBindings);

  const initialMap = cloneControlMap(existing || createDefaultControlMap());
  scope[CONTROL_MAP_GLOBAL_KEY] = initialMap;
  const appConfig = ensureAppConfig(scope);
  if (appConfig) {
    appConfig.controlMap = initialMap;
  }

  notifyControlMapListeners(initialMap);
  dispatchControlMapEvent(CONTROL_MAP_READY_EVENT, initialMap);

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
    notifyControlMapListeners(base);
    if (notify) {
      dispatchControlMapEvent(CONTROL_MAP_CHANGED_EVENT, base);
    }
    return cloneControlMap(base);
  }

  const api = {
    get: () => cloneControlMap(scope[CONTROL_MAP_GLOBAL_KEY] || initialMap),
    apply: (map, options) => applyControlMap(map, options),
    reset: (options = {}) => applyControlMap(createDefaultControlMap(), { ...options, merge: false }),
    defaults: () => cloneControlMap(createDefaultControlMap()),
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
