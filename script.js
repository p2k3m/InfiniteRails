function ensureTrailingSlash(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function cloneDeep(value) {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneDeep(item));
  }
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = cloneDeep(entry);
  }
  return result;
}

function getBootstrapUi(scope) {
  if (!scope || typeof scope !== 'object') {
    return null;
  }
  const existing = scope.__INFINITE_RAILS_BOOTSTRAP_UI__;
  if (existing && existing.document === scope.document) {
    return existing;
  }
  const documentRef = scope.document ?? null;
  const ui = {
    document: documentRef,
    scoreboardStatus: documentRef?.getElementById?.('scoreboardStatus') ?? null,
    refreshScoresButton: documentRef?.getElementById?.('refreshScores') ?? null,
    leaderboardTable: documentRef?.getElementById?.('leaderboardTable') ?? null,
    leaderboardEmptyMessage: documentRef?.getElementById?.('leaderboardEmptyMessage') ?? null,
    scoreSyncWarning: documentRef?.getElementById?.('scoreSyncWarning') ?? null,
    scoreSyncWarningMessage:
      documentRef?.querySelector?.('#scoreSyncWarning .score-sync-warning__message') ?? null,
    documentBody: documentRef?.body ?? null,
  };
  scope.__INFINITE_RAILS_BOOTSTRAP_UI__ = ui;
  return ui;
}

function setScoreboardOffline(scope, message, options = {}) {
  const ui = getBootstrapUi(scope);
  const element = ui?.scoreboardStatus;
  if (!element) {
    return;
  }
  const resolvedMessage =
    typeof message === 'string' && message.trim().length
      ? message.trim()
      : 'Offline session active — backend validation failed.';
  element.textContent = resolvedMessage;
  element.dataset = element.dataset || {};
  element.dataset.offline = 'true';
  if (typeof element.setAttribute === 'function') {
    element.setAttribute('data-offline', 'true');
  }
  if (options.datasetKey && element.dataset) {
    element.dataset[options.datasetKey] = 'true';
  }
}

function clearScoreboardOffline(scope) {
  const ui = getBootstrapUi(scope);
  const element = ui?.scoreboardStatus;
  if (!element) {
    return;
  }
  if (element.dataset) {
    delete element.dataset.offline;
    delete element.dataset.errorRateLocked;
  }
  if (typeof element.removeAttribute === 'function') {
    element.removeAttribute('data-offline');
  }
}

function setLeaderboardLock(scope, locked, options = {}) {
  const ui = getBootstrapUi(scope);
  if (!ui) {
    return;
  }
  const { refreshScoresButton, leaderboardTable, leaderboardEmptyMessage } = ui;
  const reasonMessage = options.message ?? 'Offline session active — leaderboard locked.';
  if (locked) {
    if (refreshScoresButton) {
      refreshScoresButton.disabled = true;
      refreshScoresButton.dataset = refreshScoresButton.dataset || {};
      refreshScoresButton.dataset.errorRateLocked = 'true';
    }
    if (leaderboardTable) {
      leaderboardTable.hidden = true;
      leaderboardTable.dataset = leaderboardTable.dataset || {};
      leaderboardTable.dataset.errorRateLocked = 'true';
    }
    if (leaderboardEmptyMessage) {
      leaderboardEmptyMessage.hidden = false;
      leaderboardEmptyMessage.textContent = reasonMessage;
    }
  } else {
    if (refreshScoresButton?.dataset) {
      delete refreshScoresButton.dataset.errorRateLocked;
    }
    if (leaderboardTable?.dataset) {
      delete leaderboardTable.dataset.errorRateLocked;
      leaderboardTable.hidden = false;
    }
    if (leaderboardEmptyMessage) {
      leaderboardEmptyMessage.hidden = true;
    }
    if (refreshScoresButton) {
      refreshScoresButton.disabled = false;
    }
  }
}

function setScoreSyncWarning(scope, message, visible) {
  const ui = getBootstrapUi(scope);
  if (!ui?.scoreSyncWarning) {
    return;
  }
  const { scoreSyncWarning, scoreSyncWarningMessage } = ui;
  if (visible) {
    scoreSyncWarning.hidden = false;
    if (scoreSyncWarningMessage) {
      scoreSyncWarningMessage.textContent = message;
    }
  } else {
    scoreSyncWarning.hidden = true;
    if (scoreSyncWarningMessage) {
      scoreSyncWarningMessage.textContent = '';
    }
  }
}

function enforceAssetBaseConsistency(scope, resolvedRoot) {
  if (!scope || typeof scope !== 'object') {
    return;
  }
  const appConfig = scope.APP_CONFIG || (scope.APP_CONFIG = {});
  const provided = typeof appConfig.assetBaseUrl === 'string' ? appConfig.assetBaseUrl.trim() : '';
  if (!provided) {
    if (resolvedRoot) {
      appConfig.assetBaseUrl = ensureTrailingSlash(resolvedRoot);
    }
    return;
  }
  const normalisedProvided = ensureTrailingSlash(provided);
  const allowed = new Set();
  if (resolvedRoot) {
    allowed.add(ensureTrailingSlash(resolvedRoot));
  }
  if (typeof scope.location?.origin === 'string' && scope.location.origin.trim().length) {
    allowed.add(ensureTrailingSlash(scope.location.origin));
  }
  if (typeof PRODUCTION_ASSET_ROOT === 'string') {
    allowed.add(ensureTrailingSlash(PRODUCTION_ASSET_ROOT));
  }
  if (typeof appConfig.assetRoot === 'string' && appConfig.assetRoot.trim().length) {
    allowed.add(ensureTrailingSlash(appConfig.assetRoot));
  }
  if (!Array.from(allowed).some((candidate) => candidate === normalisedProvided)) {
    const error = new Error(
      'APP_CONFIG.assetBaseUrl mismatch detected between bundle metadata, asset-manifest.json, and the active deployment.',
    );
    error.name = 'AssetBaseUrlMismatchError';
    error.detail = {
      provided: normalisedProvided,
      expected: Array.from(allowed),
    };
    throw error;
  }
  appConfig.assetBaseUrl = normalisedProvided;
}

const PRODUCTION_ASSET_ROOT = ensureTrailingSlash('https://d3gj6x3ityfh5o.cloudfront.net/');
const DEFAULT_LOCAL_ASSET_ROOT = ensureTrailingSlash('./');

const HOTBAR_SLOT_COUNT = 10;

const DEFAULT_KEY_BINDINGS = (() => {
  const map = {
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
    activateBriefingFallback: ['F9'],
    startSimpleFallbackRenderer: ['F10'],
    triggerTutorialRescue: ['F7'],
    openGuide: [],
    toggleTutorial: ['F1', 'Slash'],
    toggleDeveloperOverlay: ['Backquote', 'F8'],
    openSettings: ['F2'],
    openLeaderboard: ['F3'],
    closeMenus: ['Escape'],
    buildPortal: ['KeyR'],
  };
  for (let index = 1; index <= HOTBAR_SLOT_COUNT; index += 1) {
    map[`hotbar${index}`] = [`Digit${index % 10}`, `Numpad${index % 10}`];
  }
  return map;
})();

function ensureEventLogListeners(register) {
  if (typeof register !== 'function') {
    return;
  }
  [
    'world-generation-start',
    'world-generation-complete',
    'world-generation-failed',
    'ai-attachment-failed',
  ].forEach(register);
}

const EVENT_SOURCING_CAPTURE_TYPES = (() => {
  const capture = new Set([
    'world-generation-start',
    'world-generation-complete',
    'world-generation-failed',
    'ai-attachment-failed',
  ]);
  return capture;
})();

function describeEventLogEntry(type, detail = {}) {
  switch (type) {
    case 'world-generation-start':
      return 'World generation started — calibrating terrain seed.';
    case 'world-generation-complete':
      return 'World generation complete — terrain and actors online.';
    case 'world-generation-failed':
      return 'World generation failed — restoring safe defaults.';
    case 'ai-attachment-failed':
      return 'AI attachment failed — reverting to offline heuristics.';
    default:
      return detail?.message || 'Unknown gameplay event.';
  }
}


const ASSET_ROOT_STORAGE_KEYS = Object.freeze([
  'infiniteRails.assetRootOverride',
  'InfiniteRails.assetRootOverride',
  'InfiniteRails.assetRoot',
]);

const LOCAL_ASSET_ROOT_TOKENS = Object.freeze(new Set(['local', 'offline', 'self']));

function getBootstrapLocation(scope) {
  if (!scope || typeof scope !== 'object') {
    return null;
  }
  const candidate =
    scope.location && typeof scope.location === 'object'
      ? scope.location
      : scope.window && typeof scope.window.location === 'object'
        ? scope.window.location
        : null;
  if (!candidate) {
    return null;
  }
  return candidate;
}

function ensureString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  return String(value);
}

function normaliseAssetRootCandidate(rawValue, scope) {
  const candidate = ensureString(rawValue).trim();
  if (!candidate) {
    return null;
  }
  if (candidate === '.' || candidate === './') {
    return ensureTrailingSlash('./');
  }
  if (LOCAL_ASSET_ROOT_TOKENS.has(candidate.toLowerCase())) {
    return ensureTrailingSlash('./');
  }
  const location = getBootstrapLocation(scope);
  if (candidate.startsWith('//')) {
    const protocol = ensureString(location?.protocol).trim();
    const resolvedProtocol = protocol ? protocol : 'https:';
    return ensureTrailingSlash(`${resolvedProtocol}${candidate}`);
  }
  if (candidate.startsWith('/')) {
    const origin = ensureString(location?.origin).trim();
    if (origin) {
      return ensureTrailingSlash(`${origin}${candidate}`);
    }
  }
  try {
    if (/^[a-z]+:/i.test(candidate)) {
      return ensureTrailingSlash(new URL(candidate).toString());
    }
  } catch (error) {
    return null;
  }
  return ensureTrailingSlash(candidate);
}

function readAssetRootFromQuery(scope) {
  const location = getBootstrapLocation(scope);
  const search = ensureString(location?.search);
  if (!search) {
    return null;
  }
  let params;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  } catch (error) {
    return null;
  }
  const explicitOverride =
    params.get('assetRoot') ?? params.get('asset_root') ?? params.get('asset-root');
  if (explicitOverride) {
    return normaliseAssetRootCandidate(explicitOverride, scope);
  }
  if (params.has('useLocalAssets') || params.get('localAssets') === '1') {
    return ensureTrailingSlash('./');
  }
  return null;
}

function getBootstrapStorage(scope) {
  const storage =
    scope.localStorage && typeof scope.localStorage === 'object'
      ? scope.localStorage
      : scope.window && typeof scope.window.localStorage === 'object'
        ? scope.window.localStorage
        : null;
  if (!storage) {
    return null;
  }
  if (typeof storage.getItem !== 'function') {
    return null;
  }
  return storage;
}

function readAssetRootFromStorage(scope) {
  const storage = getBootstrapStorage(scope);
  if (!storage) {
    return null;
  }
  for (const key of ASSET_ROOT_STORAGE_KEYS) {
    let stored;
    try {
      stored = storage.getItem(key);
    } catch (error) {
      return null;
    }
    const normalised = normaliseAssetRootCandidate(stored, scope);
    if (normalised) {
      return normalised;
    }
  }
  return null;
}

function persistAssetRootOverride(scope, assetRoot) {
  const storage = getBootstrapStorage(scope);
  if (!storage || typeof storage.setItem !== 'function') {
    return;
  }
  for (const key of ASSET_ROOT_STORAGE_KEYS) {
    try {
      storage.setItem(key, assetRoot);
    } catch (error) {
      break;
    }
  }
}

function inferLocalAssetRoot(scope) {
  const location = getBootstrapLocation(scope);
  if (!location) {
    return null;
  }
  const protocol = ensureString(location.protocol).toLowerCase();
  const hostname = ensureString(location.hostname).toLowerCase();
  if (protocol === 'file:') {
    return ensureTrailingSlash('./');
  }
  const isLoopbackHost =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1';
  const PRIVATE_IPV4_PATTERNS = [
    /^10(?:\.\d{1,3}){3}$/,
    /^192\.168(?:\.\d{1,3}){2}$/,
    /^172\.(?:1[6-9]|2[0-9]|3[0-1])(?:\.\d{1,3}){2}$/,
    /^169\.254(?:\.\d{1,3}){2}$/,
  ];
  const isPrivateNetworkHost = PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname));
  const isMdnsHost = hostname.endsWith('.local');
  const shouldTreatAsLocal = isLoopbackHost || isPrivateNetworkHost || isMdnsHost;
  if (!shouldTreatAsLocal) {
    return null;
  }
  const origin = ensureString(location.origin);
  if (origin) {
    return ensureTrailingSlash(`${origin}/`);
  }
  const host = ensureString(location.host);
  if (host && protocol) {
    return ensureTrailingSlash(`${protocol}//${host}/`);
  }
  return ensureTrailingSlash('./');
}

function detectSameOriginAssetRoot(scope) {
  const location = getBootstrapLocation(scope);
  if (!location) {
    return null;
  }
  const origin = ensureString(location.origin).trim();
  if (!origin) {
    return null;
  }
  const normalisedOrigin = ensureTrailingSlash(origin);
  if (normalisedOrigin.toLowerCase() === PRODUCTION_ASSET_ROOT.toLowerCase()) {
    return null;
  }
  const protocol = ensureString(location.protocol).toLowerCase();
  if (!protocol.startsWith('http')) {
    return null;
  }
  const documentRef = scope.document ?? null;
  if (!documentRef) {
    return null;
  }
  const scriptSources = [];
  const currentScriptSrc = ensureString(documentRef.currentScript?.src);
  if (currentScriptSrc) {
    scriptSources.push(currentScriptSrc);
  }
  if (typeof documentRef.querySelectorAll === 'function') {
    try {
      const scripts = documentRef.querySelectorAll('script[src]') || [];
      for (const script of scripts) {
        const src = ensureString(script?.src);
        if (src) {
          scriptSources.push(src);
        }
      }
    } catch (error) {
      // ignore DOM query errors and fall back to any currentScript detection
    }
  }
  if (scriptSources.length === 0) {
    return null;
  }
  const baseUrl = ensureString(location.href) || normalisedOrigin;
  for (const source of scriptSources) {
    try {
      const resolved = new URL(source, baseUrl);
      if (resolved.origin === origin) {
        return normalisedOrigin;
      }
    } catch (error) {
      // ignore URL parsing issues and continue checking other candidates
    }
  }
  return null;
}

function resolveLocalAssetFallback(scope) {
  const appConfig = scope.APP_CONFIG || (scope.APP_CONFIG = {});
  const configured = normaliseAssetRootCandidate(appConfig.localAssetRoot, scope);
  if (configured) {
    return configured;
  }
  const location = getBootstrapLocation(scope);
  const href = ensureString(location?.href);
  if (href) {
    try {
      const baseUrl = new URL('.', href);
      return ensureTrailingSlash(baseUrl.toString());
    } catch (error) {
      // ignore URL resolution failures and fall back to relative paths
    }
  }
  return DEFAULT_LOCAL_ASSET_ROOT;
}

function getOrCreateAssetFailoverState(scope) {
  if (!scope || typeof scope !== 'object') {
    return null;
  }
  const existing = scope.__INFINITE_RAILS_ASSET_FAILOVER__;
  if (existing && typeof existing === 'object') {
    if (typeof existing.fallbackRoot !== 'string' || !existing.fallbackRoot.trim()) {
      const resolvedFallback = resolveLocalAssetFallback(scope);
      existing.fallbackRoot = resolvedFallback;
      existing.fallbackRootLower = typeof resolvedFallback === 'string' ? resolvedFallback.toLowerCase() : null;
    }
    return existing;
  }
  const fallbackRoot = resolveLocalAssetFallback(scope);
  const state = {
    primaryRoot: null,
    primaryRootLower: null,
    fallbackRoot,
    fallbackRootLower: typeof fallbackRoot === 'string' ? fallbackRoot.toLowerCase() : null,
    activeRoot: null,
    activeRootLower: null,
    failoverActive: false,
    triggeredAt: null,
    reason: null,
  };
  scope.__INFINITE_RAILS_ASSET_FAILOVER__ = state;
  return state;
}

function initialiseAssetFailover(scope, resolvedRoot) {
  const state = getOrCreateAssetFailoverState(scope);
  if (!state) {
    return null;
  }
  const normalisedPrimary = normaliseAssetRootCandidate(resolvedRoot, scope);
  state.primaryRoot = normalisedPrimary;
  state.primaryRootLower = typeof normalisedPrimary === 'string' ? normalisedPrimary.toLowerCase() : null;
  const fallbackRoot = normaliseAssetRootCandidate(state.fallbackRoot, scope) ?? resolveLocalAssetFallback(scope);
  state.fallbackRoot = fallbackRoot;
  state.fallbackRootLower = typeof fallbackRoot === 'string' ? fallbackRoot.toLowerCase() : null;
  const initialActive = normalisedPrimary || fallbackRoot;
  state.activeRoot = initialActive;
  state.activeRootLower = typeof initialActive === 'string' ? initialActive.toLowerCase() : null;
  if (state.failoverActive && initialActive === normalisedPrimary) {
    state.failoverActive = false;
    state.triggeredAt = null;
    state.reason = null;
  }
  return state;
}

function activateAssetFailover(scope, reason = {}) {
  if (!scope || typeof scope !== 'object') {
    return false;
  }
  const state = getOrCreateAssetFailoverState(scope);
  if (!state || state.failoverActive) {
    return false;
  }
  const fallbackRoot = normaliseAssetRootCandidate(state.fallbackRoot, scope) ?? resolveLocalAssetFallback(scope);
  if (!fallbackRoot || !fallbackRoot.trim()) {
    return false;
  }
  const appConfig = scope.APP_CONFIG || (scope.APP_CONFIG = {});
  state.failoverActive = true;
  state.activeRoot = fallbackRoot;
  state.activeRootLower = fallbackRoot.toLowerCase();
  state.triggeredAt = Date.now();
  state.reason = {
    type: reason?.type ?? null,
    status: typeof reason?.status === 'number' ? reason.status : null,
    code: reason?.code ?? null,
    message: reason?.message ?? null,
    url: reason?.url ?? null,
  };
  appConfig.assetRoot = fallbackRoot;
  if (
    typeof appConfig.assetBaseUrl !== 'string' ||
    !appConfig.assetBaseUrl.trim() ||
    (state.primaryRoot && appConfig.assetBaseUrl === state.primaryRoot)
  ) {
    appConfig.assetBaseUrl = fallbackRoot;
  }
  if (scope.console && typeof scope.console.info === 'function') {
    scope.console.info('[InfiniteRails] Asset CDN unavailable. Falling back to local bundle.', {
      fallbackAssetRoot: fallbackRoot,
      trigger: state.reason,
    });
  }
  return true;
}

function resolveBootstrapAssetRoot(scope) {
  const appConfig = scope.APP_CONFIG || (scope.APP_CONFIG = {});
  const preconfigured = normaliseAssetRootCandidate(appConfig.assetRoot, scope);
  if (preconfigured) {
    appConfig.assetRoot = preconfigured;
    if (typeof appConfig.assetBaseUrl !== 'string' || !appConfig.assetBaseUrl.trim()) {
      appConfig.assetBaseUrl = preconfigured;
    }
    return preconfigured;
  }
  const queryOverride = readAssetRootFromQuery(scope);
  if (queryOverride) {
    appConfig.assetRoot = queryOverride;
    if (typeof appConfig.assetBaseUrl !== 'string' || !appConfig.assetBaseUrl.trim()) {
      appConfig.assetBaseUrl = queryOverride;
    }
    persistAssetRootOverride(scope, queryOverride);
    return queryOverride;
  }
  const storedOverride = readAssetRootFromStorage(scope);
  if (storedOverride) {
    appConfig.assetRoot = storedOverride;
    if (typeof appConfig.assetBaseUrl !== 'string' || !appConfig.assetBaseUrl.trim()) {
      appConfig.assetBaseUrl = storedOverride;
    }
    return storedOverride;
  }
  const sameOriginRoot = detectSameOriginAssetRoot(scope);
  if (sameOriginRoot) {
    appConfig.assetRoot = sameOriginRoot;
    if (typeof appConfig.assetBaseUrl !== 'string' || !appConfig.assetBaseUrl.trim()) {
      appConfig.assetBaseUrl = sameOriginRoot;
    }
    return sameOriginRoot;
  }
  const inferredLocal = inferLocalAssetRoot(scope);
  if (inferredLocal) {
    appConfig.assetRoot = inferredLocal;
    if (typeof appConfig.assetBaseUrl !== 'string' || !appConfig.assetBaseUrl.trim()) {
      appConfig.assetBaseUrl = inferredLocal;
    }
    return inferredLocal;
  }
  appConfig.assetRoot = PRODUCTION_ASSET_ROOT;
  if (typeof appConfig.assetBaseUrl !== 'string' || !appConfig.assetBaseUrl.trim()) {
    appConfig.assetBaseUrl = PRODUCTION_ASSET_ROOT;
  }
  return PRODUCTION_ASSET_ROOT;
}

(function setupErrorConsoleOverlay(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope || scope.__INFINITE_RAILS_ERROR_CONSOLE__) {
    return;
  }

  const documentRef = scope.document;
  if (!documentRef || typeof documentRef.getElementById !== 'function') {
    return;
  }

  const overlay = documentRef.getElementById('errorConsole');
  if (!overlay) {
    return;
  }

  const list = overlay.querySelector('[data-error-console-list]');
  if (!list) {
    return;
  }

  const countRef = overlay.querySelector('[data-error-count]');
  const dismissButton = overlay.querySelector('[data-error-dismiss]');
  const downloadButton = overlay.querySelector('[data-error-download]');
  const MAX_ERROR_HISTORY = 200;
  const MAX_ACTION_HISTORY = 240;
  const MAX_DIAGNOSTIC_HISTORY = 200;

  const sessionState = {
    errors: [],
    actions: [],
    diagnostics: [],
    lastDownload: null,
  };

  const DEFAULT_REPLAY_LIMIT = 100;

  const createReplayBuffer = (limit = DEFAULT_REPLAY_LIMIT) => {
    const capacity = (() => {
      const numericLimit = Number(limit);
      if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
        return DEFAULT_REPLAY_LIMIT;
      }
      if (numericLimit > 1000) {
        return 1000;
      }
      return Math.floor(numericLimit);
    })();

    const entries = new Array(capacity);
    let writeIndex = 0;
    let entryCount = 0;
    let sequence = 0;

    const toStoredEntry = (action, detail, metadata) => ({
      id: ++sequence,
      action: ensureString(action) || 'unknown-event',
      detail: cloneForSnapshot(detail),
      metadata: cloneForSnapshot(metadata),
      timestamp: new Date(),
    });

    const toSnapshotEntry = (entry) => ({
      id: entry.id,
      action: entry.action,
      detail: cloneForSnapshot(entry.detail),
      metadata: cloneForSnapshot(entry.metadata),
      timestamp:
        entry.timestamp instanceof Date ? entry.timestamp.toISOString() : toIsoString(entry.timestamp),
    });

    const record = (action, detail = {}, metadata = {}) => {
      const entry = toStoredEntry(action, detail, metadata);
      entries[writeIndex] = entry;
      writeIndex = (writeIndex + 1) % capacity;
      if (entryCount < capacity) {
        entryCount += 1;
      }
      return entry;
    };

    const snapshot = () => {
      if (entryCount === 0) {
        return [];
      }
      const result = [];
      for (let offset = entryCount - 1; offset >= 0; offset -= 1) {
        const index = (writeIndex - offset - 1 + capacity) % capacity;
        const entry = entries[index];
        if (!entry) {
          continue;
        }
        result.push(toSnapshotEntry(entry));
      }
      return result;
    };

    const clear = () => {
      for (let index = 0; index < entries.length; index += 1) {
        entries[index] = undefined;
      }
      writeIndex = 0;
      entryCount = 0;
      sequence = 0;
    };

    const size = () => entryCount;

    return {
      record,
      snapshot,
      clear,
      size,
      get limit() {
        return capacity;
      },
    };
  };

  const describeEventTarget = (target) => {
    if (!target || typeof target !== 'object') {
      return null;
    }
    const descriptor = {};
    try {
      if (typeof target.id === 'string' && target.id.trim().length) {
        descriptor.id = target.id.trim();
      }
    } catch (error) {
      // ignore lookup failures
    }
    try {
      if (typeof target.tagName === 'string' && target.tagName.trim().length) {
        descriptor.tag = target.tagName.trim().toLowerCase();
      }
    } catch (error) {
      // ignore lookup failures
    }
    try {
      if (typeof target.nodeName === 'string' && target.nodeName.trim().length) {
        descriptor.node = target.nodeName.trim().toLowerCase();
      }
    } catch (error) {
      // ignore lookup failures
    }
    try {
      if (typeof target.dataset === 'object' && target.dataset) {
        const dataset = {};
        const keys = Object.keys(target.dataset).slice(0, 6);
        keys.forEach((key) => {
          const value = target.dataset[key];
          if (typeof value === 'string' && value.trim().length) {
            dataset[key] = value.trim();
          }
        });
        if (Object.keys(dataset).length) {
          descriptor.dataset = dataset;
        }
      }
    } catch (error) {
      // ignore lookup failures
    }
    return Object.keys(descriptor).length ? descriptor : null;
  };

  const replayBufferInternal = createReplayBuffer(DEFAULT_REPLAY_LIMIT);

  const replayBufferApi = {
    record(action, detail = {}, metadata = {}) {
      return replayBufferInternal.record(action, detail, metadata);
    },
    snapshot() {
      return replayBufferInternal.snapshot();
    },
    clear() {
      replayBufferInternal.clear();
    },
    size() {
      return replayBufferInternal.size();
    },
    get limit() {
      return replayBufferInternal.limit;
    },
  };

  const patchDispatchEvent = (target, origin) => {
    if (!target || typeof target.dispatchEvent !== 'function') {
      return;
    }
    const original = target.dispatchEvent;
    if (original && original.__INFINITE_RAILS_REPLAY_PATCHED__) {
      return;
    }
    const patched = function patchedDispatchEvent(event) {
      if (event && typeof event.type === 'string' && event.type.startsWith('infinite-rails:')) {
        try {
          const detail = typeof event.detail === 'undefined' ? null : event.detail;
          const metadata = {
            origin,
            bubbles: Boolean(event.bubbles),
            cancelable: Boolean(event.cancelable),
            composed: Boolean(event.composed),
            defaultPrevented: Boolean(event.defaultPrevented),
            timeStamp: Number.isFinite(event.timeStamp) ? event.timeStamp : null,
            target: describeEventTarget(this),
          };
          replayBufferInternal.record(event.type, detail, metadata);
        } catch (error) {
          if (scope.console && typeof scope.console.debug === 'function') {
            scope.console.debug('Failed to record replay buffer event.', error);
          }
        }
      }
      return original.apply(this, arguments);
    };
    patched.__INFINITE_RAILS_REPLAY_PATCHED__ = true;
    target.dispatchEvent = patched;
  };

  patchDispatchEvent(scope, 'window');
  patchDispatchEvent(documentRef, 'document');

  const namespace =
    scope.InfiniteRails && typeof scope.InfiniteRails === 'object'
      ? scope.InfiniteRails
      : (scope.InfiniteRails = {});
  const logsApi =
    namespace.logs && typeof namespace.logs === 'object' ? namespace.logs : {};

  const pushWithLimit = (collection, entry, limit) => {
    if (!Array.isArray(collection)) {
      return;
    }
    collection.push(entry);
    if (collection.length > limit) {
      collection.splice(0, collection.length - limit);
    }
  };

  const toIsoString = (value) => {
    try {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value).toISOString();
      }
      if (typeof value === 'string' && value.trim().length) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
      return new Date().toISOString();
    } catch (error) {
      try {
        return new Date().toISOString();
      } catch (secondaryError) {
        return String(value);
      }
    }
  };

  function cloneForSnapshot(value, depth = 0, seen = new WeakSet()) {
    if (value == null) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: typeof value.stack === 'string' ? value.stack : undefined,
      };
    }
    if (typeof value === 'function') {
      return `[Function ${value.name || 'anonymous'}]`;
    }
    if (depth > 4) {
      return Object.prototype.toString.call(value);
    }
    if (Array.isArray(value)) {
      return value.slice(0, 100).map((item) => cloneForSnapshot(item, depth + 1, seen));
    }
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
      const output = {};
      for (const key of Object.keys(value)) {
        output[key] = cloneForSnapshot(value[key], depth + 1, seen);
      }
      seen.delete(value);
      return output;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return String(value);
    }
  }

  const maxEntries = 20;
  let totalCount = 0;
  let dismissedUntilNextError = false;

  const ensureString = (value) => {
    if (value == null) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (value instanceof Error) {
      return value.message || value.name || 'Error';
    }
    if (typeof value === 'object') {
      if (typeof value.message === 'string') {
        return value.message;
      }
      try {
        return JSON.stringify(value);
      } catch (error) {
        return Object.prototype.toString.call(value);
      }
    }
    return String(value);
  };

  const extractStack = (value) => {
    if (!value) {
      return '';
    }
    if (value instanceof Error && typeof value.stack === 'string') {
      return value.stack;
    }
    if (typeof value.stack === 'string') {
      return value.stack;
    }
    return '';
  };

  const trimDetail = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    if (value.length > 6000) {
      return `${value.slice(0, 6000)}…`;
    }
    return value;
  };

  const storeSessionError = (entry) => {
    const snapshot = {
      source: ensureString(entry.source) || 'Console',
      message: ensureString(entry.message) || 'An unknown error occurred.',
      detail: trimDetail(entry.detail || ''),
      timestamp: entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp ?? Date.now()),
    };
    pushWithLimit(sessionState.errors, snapshot, MAX_ERROR_HISTORY);
    return snapshot;
  };

  const storeSessionAction = (action, detail = {}, metadata = {}) => {
    const snapshot = {
      action: ensureString(action) || 'unknown-action',
      detail: cloneForSnapshot(detail),
      metadata: cloneForSnapshot(metadata),
      timestamp: new Date(),
    };
    pushWithLimit(sessionState.actions, snapshot, MAX_ACTION_HISTORY);
    return snapshot;
  };

  const storeSessionDiagnostic = (category, message, detail = {}) => {
    const snapshot = {
      category: ensureString(category) || 'general',
      message: ensureString(message) || 'Diagnostic update recorded.',
      detail: cloneForSnapshot(detail),
      timestamp: new Date(),
    };
    pushWithLimit(sessionState.diagnostics, snapshot, MAX_DIAGNOSTIC_HISTORY);
    return snapshot;
  };

  const snapshotErrors = () =>
    sessionState.errors.map((entry) => ({
      source: entry.source,
      message: entry.message,
      detail: entry.detail,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : toIsoString(entry.timestamp),
    }));

  const snapshotActions = () =>
    sessionState.actions.map((entry) => ({
      action: entry.action,
      detail: cloneForSnapshot(entry.detail),
      metadata: cloneForSnapshot(entry.metadata),
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : toIsoString(entry.timestamp),
    }));

  const snapshotDiagnostics = () =>
    sessionState.diagnostics.map((entry) => ({
      category: entry.category,
      message: entry.message,
      detail: cloneForSnapshot(entry.detail),
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : toIsoString(entry.timestamp),
    }));

  const buildSessionMetadata = () => ({
    url: typeof scope.location?.href === 'string' ? scope.location.href : null,
    userAgent: typeof scope.navigator?.userAgent === 'string' ? scope.navigator.userAgent : null,
    errorCount: sessionState.errors.length,
    actionCount: sessionState.actions.length,
    diagnosticCount: sessionState.diagnostics.length,
  });

  const exportSessionLog = (options = {}) => {
    const generatedAt = new Date();
    const includeDiagnostics = options.includeDiagnostics !== false;
    const snapshot = {
      version: 1,
      generatedAt: generatedAt.toISOString(),
      metadata: buildSessionMetadata(),
      errors: snapshotErrors(),
      actions: snapshotActions(),
      diagnostics: includeDiagnostics ? snapshotDiagnostics() : [],
      userActionReplay: replayBufferApi.snapshot(),
    };
    return snapshot;
  };

  const triggerSessionLogDownload = (options = {}) => {
    const result = exportSessionLog(options);
    const json = JSON.stringify(result, null, 2);
    const timestampLabel = result.generatedAt.replace(/[:.]/g, '-');
    const filename =
      typeof options.filename === 'string' && options.filename.trim().length
        ? options.filename.trim()
        : `infinite-rails-session-log-${timestampLabel}.json`;

    let href = null;
    let revoke = null;

    if (typeof Blob === 'function' && scope.URL && typeof scope.URL.createObjectURL === 'function') {
      try {
        const blob = new Blob([json], { type: 'application/json' });
        href = scope.URL.createObjectURL(blob);
        revoke = () => {
          try {
            scope.URL.revokeObjectURL(href);
          } catch (error) {
            if (scope.console && typeof scope.console.debug === 'function') {
              scope.console.debug('Failed to revoke session log object URL.', error);
            }
          }
        };
      } catch (error) {
        if (scope.console && typeof scope.console.debug === 'function') {
          scope.console.debug('Falling back to data URI for session log.', error);
        }
      }
    }

    if (!href) {
      href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    }

    if (documentRef && typeof documentRef.createElement === 'function') {
      const anchor = documentRef.createElement('a');
      if (anchor) {
        try {
          if (typeof anchor.setAttribute === 'function') {
            anchor.setAttribute('href', href);
            anchor.setAttribute('download', filename);
          } else {
            anchor.href = href;
            anchor.download = filename;
          }
          if (typeof anchor.click === 'function') {
            anchor.click();
          } else if (anchor.dispatchEvent) {
            try {
              const MouseEventCtor = scope.MouseEvent || scope.Event;
              if (typeof MouseEventCtor === 'function') {
                anchor.dispatchEvent(new MouseEventCtor('click', { bubbles: true, cancelable: true }));
              } else {
                anchor.dispatchEvent({ type: 'click' });
              }
            } catch (error) {
              anchor.dispatchEvent({ type: 'click' });
            }
          }
        } catch (error) {
          if (scope.console && typeof scope.console.error === 'function') {
            scope.console.error('Failed to trigger session log download.', error);
          }
        }
      }
    }

    if (revoke) {
      const schedule = typeof scope.setTimeout === 'function' ? scope.setTimeout.bind(scope) : null;
      if (schedule) {
        schedule(revoke, 2000);
      } else {
        revoke();
      }
    }

    sessionState.lastDownload = {
      snapshot: result,
      json,
      href,
      filename,
    };

    return { snapshot: result, json, href, filename };
  };

  const timeFormatter =
    typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
      ? new Intl.DateTimeFormat(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : null;

  const formatTimestamp = (timestamp) => {
    try {
      return timeFormatter ? timeFormatter.format(timestamp) : timestamp.toISOString();
    } catch (error) {
      return new Date(timestamp).toISOString();
    }
  };

  const updateCount = () => {
    if (countRef) {
      countRef.textContent = String(totalCount);
    }
  };

  const showOverlay = (force = false) => {
    if (!force && dismissedUntilNextError) {
      return;
    }
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    dismissedUntilNextError = false;
  };

  const hideOverlay = () => {
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
  };

  dismissButton?.addEventListener('click', () => {
    dismissedUntilNextError = true;
    hideOverlay();
  });

  if (typeof scope.addEventListener === 'function') {
    scope.addEventListener('keydown', (event) => {
      if (!event) {
        return;
      }
      if (event.key === 'Escape' && overlay.getAttribute('aria-hidden') === 'false') {
        dismissedUntilNextError = true;
        hideOverlay();
      }
    });
  }

  const createEntryElement = (entry) => {
    const item = documentRef.createElement('li');
    item.className = 'error-console__entry error-console__entry--new';

    const header = documentRef.createElement('div');
    header.className = 'error-console__entry-header';

    const source = documentRef.createElement('span');
    source.className = 'error-console__source';
    source.textContent = entry.source;

    const timeElement = documentRef.createElement('time');
    timeElement.className = 'error-console__time';
    timeElement.setAttribute('datetime', entry.timestamp.toISOString());
    timeElement.textContent = formatTimestamp(entry.timestamp);

    header.append(source, timeElement);

    const message = documentRef.createElement('p');
    message.className = 'error-console__message';
    message.textContent = entry.message;

    item.append(header, message);

    if (entry.detail) {
      const details = documentRef.createElement('details');
      details.className = 'error-console__details';

      const summary = documentRef.createElement('summary');
      summary.textContent = 'View stack trace';

      const pre = documentRef.createElement('pre');
      pre.className = 'error-console__stack';
      pre.textContent = entry.detail;

      details.append(summary, pre);
      item.append(details);
    }

    scope.setTimeout(() => {
      item.classList.remove('error-console__entry--new');
    }, 1200);

    return item;
  };

  const appendEntry = (entry) => {
    totalCount += 1;
    updateCount();

    const element = createEntryElement(entry);
    if (list.firstChild) {
      list.insertBefore(element, list.firstChild);
    } else {
      list.appendChild(element);
    }

    while (list.children.length > maxEntries) {
      list.removeChild(list.lastChild);
    }

    showOverlay(true);
  };

  const recordEntry = ({ source, message, detail }) => {
    const normalisedMessage = message ? message.trim() : '';
    const entry = {
      source: source || 'Console',
      message: normalisedMessage || 'An unknown error occurred.',
      detail: trimDetail(detail || ''),
      timestamp: new Date(),
    };
    storeSessionError(entry);
    appendEntry(entry);
  };

  const captureConsoleError = (args) => {
    const parts = [];
    let stack = '';

    for (const argument of args) {
      const text = ensureString(argument);
      if (text) {
        parts.push(text);
      }
      if (!stack) {
        stack = extractStack(argument);
      }
    }

    const message = parts.join(' ').trim();
    recordEntry({
      source: 'Console',
      message: message || 'Console error logged.',
      detail: stack,
    });
  };

  const captureRuntimeError = (event) => {
    if (!event) {
      return;
    }
    const message = ensureString(event.message) || 'Uncaught runtime error.';
    let detail = extractStack(event.error);
    if (!detail) {
      const location = [event.filename, event.lineno, event.colno].filter(Boolean).join(':');
      if (location) {
        detail = location;
      }
    }
    recordEntry({
      source: 'Runtime',
      message,
      detail,
    });
  };

  const captureUnhandledRejection = (event) => {
    if (!event) {
      return;
    }
    const reason = typeof event.reason !== 'undefined' ? event.reason : null;
    const message = ensureString(reason) || 'Unhandled promise rejection.';
    const detail = extractStack(reason);
    recordEntry({
      source: 'Promise',
      message,
      detail,
    });
  };

  const consoleRef = scope.console ?? {};
  const originalConsoleError =
    consoleRef && typeof consoleRef.error === 'function' ? consoleRef.error.bind(consoleRef) : null;

  if (consoleRef && typeof consoleRef === 'object') {
    consoleRef.error = function errorInterceptor(...args) {
      try {
        captureConsoleError(args);
      } catch (error) {
        originalConsoleError?.('Failed to mirror console error:', error);
      }
      if (originalConsoleError) {
        return originalConsoleError.apply(this, args);
      }
      return undefined;
    };
  }

  if (typeof scope.addEventListener === 'function') {
    scope.addEventListener('error', captureRuntimeError);
    scope.addEventListener('unhandledrejection', captureUnhandledRejection);
  }

  logsApi.getEntries = () => snapshotErrors();
  logsApi.getActions = () => snapshotActions();
  logsApi.getDiagnostics = () => snapshotDiagnostics();
  logsApi.recordAction = (action, detail = {}, metadata = {}) => {
    return storeSessionAction(action, detail, metadata);
  };
  logsApi.recordDiagnostic = (category, message, detail = {}) => {
    return storeSessionDiagnostic(category, message, detail);
  };
  logsApi.recordError = (message, options = {}) => {
    recordEntry({
      source: ensureString(options.source) || 'Manual',
      message: ensureString(message),
      detail: ensureString(options.detail),
    });
  };
  logsApi.record = logsApi.recordError;
  logsApi.exportSessionLog = (options = {}) => exportSessionLog(options);
  logsApi.downloadSessionLog = (options = {}) => triggerSessionLogDownload(options);
  logsApi.getLastDownloadMetadata = () => {
    if (!sessionState.lastDownload) {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(sessionState.lastDownload));
    } catch (error) {
      return {
        filename: sessionState.lastDownload.filename,
        href: sessionState.lastDownload.href,
        snapshot: sessionState.lastDownload.snapshot,
        json: sessionState.lastDownload.json,
      };
    }
  };

  namespace.logs = logsApi;
  namespace.replayBuffer = replayBufferApi;

  const handleDownloadClick = (event) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    try {
      showOverlay(true);
      logsApi.downloadSessionLog();
    } catch (error) {
      if (scope.console && typeof scope.console.error === 'function') {
        scope.console.error('Failed to download session log.', error);
      }
    }
  };

  if (downloadButton && typeof downloadButton.addEventListener === 'function') {
    downloadButton.addEventListener('click', handleDownloadClick);
  }

  const testHooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  testHooks.getErrorConsoleEntries = snapshotErrors;
  testHooks.getSessionLogSnapshot = (options) => exportSessionLog(options);
  testHooks.triggerSessionLogDownload = (options) => triggerSessionLogDownload(options);
  scope.__INFINITE_RAILS_TEST_HOOKS__ = testHooks;

  scope.__INFINITE_RAILS_ERROR_CONSOLE__ = {
    record: (message, options = {}) => {
      logsApi.recordError(message, options);
    },
    exportSessionLog: (options = {}) => exportSessionLog(options),
    downloadSessionLog: (options = {}) => triggerSessionLogDownload(options),
    getEntries: () => snapshotErrors(),
  };
})(typeof window !== 'undefined' ? window : undefined);

(function setupStorageQuarantine(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope || scope.__INFINITE_RAILS_STORAGE_QUARANTINE__) {
    return;
  }

  const handleStorageQuarantine = (event) => {
    const detail = event?.detail ?? {};
    const storageKey = typeof detail.storageKey === 'string' ? detail.storageKey : null;
    if (storageKey) {
      try {
        const storage = scope.localStorage ?? scope.sessionStorage ?? null;
        if (storage?.removeItem) {
          storage.removeItem(storageKey);
        }
      } catch (error) {
        scope.console?.warn?.('[InfiniteRails] Unable to quarantine storage key.', error);
      }
      scope.console?.warn?.(
        `[InfiniteRails] Storage quarantine activated for "${storageKey}". Please reload the page to continue safely.`,
        detail.error ?? null,
      );
    }
  };

  if (typeof scope.addEventListener === 'function') {
    scope.addEventListener('infinite-rails:storage-quarantine-requested', handleStorageQuarantine);
  }

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.requestStorageQuarantine = (detail) => {
    handleStorageQuarantine({ detail });
  };
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;
  scope.__INFINITE_RAILS_STORAGE_QUARANTINE__ = {
    handler: handleStorageQuarantine,
  };
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

(function setupErrorRateCircuitBreaker(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope) {
    return;
  }

  const THRESHOLDS = {
    api: { threshold: 5, windowMs: 60000 },
  };

  const circuitState = {
    trippedCategories: new Set(),
    failureWindows: new Map(),
  };

  function getIdentityState() {
    const identity = scope.__INFINITE_RAILS_IDENTITY_STATE__;
    if (identity && typeof identity === 'object') {
      return identity;
    }
    return null;
  }

  function snapshotCircuitState() {
    const counts = {};
    circuitState.failureWindows.forEach((timestamps, category) => {
      counts[category] = timestamps.length;
    });
    return {
      trippedCategories: Array.from(circuitState.trippedCategories),
      thresholds: JSON.parse(JSON.stringify(THRESHOLDS)),
      counts,
    };
  }

  function markCategoryTripped(category, detail) {
    if (circuitState.trippedCategories.has(category)) {
      return;
    }
    circuitState.trippedCategories.add(category);
    const message = 'Offline session active — elevated API error rate detected. Leaderboard locked.';
    setScoreboardOffline(scope, message, { datasetKey: 'errorRateLocked' });
    setLeaderboardLock(scope, true, { message });
    setScoreSyncWarning(scope, 'Score sync paused due to elevated API error rate.', true);
    const ui = getBootstrapUi(scope);
    if (ui?.documentBody?.dataset) {
      ui.documentBody.dataset.errorRateCircuit = 'true';
      ui.documentBody.dataset.errorRateCategory = category;
    }
    const identity = getIdentityState();
    if (identity) {
      identity.scoreboardOffline = true;
      identity.liveFeaturesSuspended = true;
      identity.liveFeaturesHoldDetail = {
        kind: 'error-rate',
        category,
        detail,
      };
    }
  }

  function purgeExpired(category, now) {
    const window = circuitState.failureWindows.get(category);
    if (!window || window.length === 0) {
      return [];
    }
    const { windowMs } = THRESHOLDS[category] ?? THRESHOLDS.api;
    const filtered = window.filter((timestamp) => now - timestamp <= windowMs);
    circuitState.failureWindows.set(category, filtered);
    return filtered;
  }

  function recordFailure(category, timestamp) {
    const { threshold } = THRESHOLDS[category] ?? THRESHOLDS.api;
    if (!circuitState.failureWindows.has(category)) {
      circuitState.failureWindows.set(category, []);
    }
    const window = circuitState.failureWindows.get(category);
    window.push(timestamp);
    const filtered = purgeExpired(category, timestamp);
    if (filtered.length >= threshold) {
      markCategoryTripped(category, { count: filtered.length, threshold });
    }
  }

  function recordLogEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const category = typeof entry.category === 'string' ? entry.category.toLowerCase() : 'unknown';
    if (entry.level !== 'error') {
      return;
    }
    if (!THRESHOLDS[category]) {
      return;
    }
    recordFailure(category, entry.timestamp ?? Date.now());
  }

  const logStore = scope.InfiniteRails?.logs || {
    entries: [],
    record(entry) {
      const enriched = {
        category: entry?.category ?? 'general',
        level: entry?.level ?? 'info',
        message: entry?.message ?? '',
        timestamp: entry?.timestamp ?? Date.now(),
      };
      this.entries.push(enriched);
      recordLogEntry(enriched);
    },
  };

  scope.InfiniteRails = scope.InfiniteRails || {};
  scope.InfiniteRails.logs = logStore;

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.getErrorRateCircuitState = () => snapshotCircuitState();
  hooks.isErrorRateCircuitTripped = (category) =>
    circuitState.trippedCategories.has((typeof category === 'string' ? category : '').toLowerCase());
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);


(function setupAudioSettings(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope) {
    return;
  }

  const CHANNELS = ['master', 'music', 'effects', 'ui'];
  const DEFAULTS = {
    muted: false,
    volumes: {
      master: 0.8,
      music: 0.6,
      effects: 0.85,
      ui: 0.7,
    },
  };
  const STORAGE_KEY = 'infinite-rails:audio-settings';

  const listeners = new Set();
  const uiBindings = {
    form: null,
    sliders: new Map(),
    labels: new Map(),
    muteToggle: null,
  };
  const boundExperiences = new WeakSet();

  function clampVolume(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const numeric = Number(value);
    if (numeric < 0) {
      return 0;
    }
    if (numeric > 1) {
      return 1;
    }
    return numeric;
  }

  function snapshotState(source) {
    return {
      muted: source.muted,
      volumes: { ...source.volumes },
    };
  }

  function readStoredState() {
    const storage = scope.localStorage ?? null;
    if (!storage?.getItem) {
      return null;
    }
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (error) {
      scope.console?.warn?.('[InfiniteRails] Unable to read stored audio settings.', error);
      return null;
    }
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      const muted = Boolean(parsed?.muted);
      const volumes = { ...DEFAULTS.volumes };
      if (parsed && typeof parsed === 'object') {
        const storedVolumes = parsed.volumes || {};
        for (const channel of CHANNELS) {
          if (typeof storedVolumes[channel] === 'number') {
            volumes[channel] = clampVolume(storedVolumes[channel]);
          }
        }
      }
      return { muted, volumes };
    } catch (error) {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch (removeError) {
        // ignore removal errors
      }
      scope.console?.warn?.(
        '[InfiniteRails] Failed to parse audio settings from "infinite-rails:audio-settings".',
        error,
      );
      return null;
    }
  }

  let state = readStoredState() ?? snapshotState(DEFAULTS);

  function persistState() {
    const storage = scope.localStorage ?? null;
    if (!storage?.setItem) {
      return;
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      scope.console?.warn?.('[InfiniteRails] Unable to persist audio settings.', error);
    }
  }

  function emitChange(reason, options = {}) {
    const snapshot = snapshotState(state);
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        scope.console?.error?.('[InfiniteRails] Audio settings listener failed.', error);
      }
    });
    if (typeof scope.dispatchEvent === 'function' && typeof scope.CustomEvent === 'function') {
      const event = new scope.CustomEvent('infinite-rails:audio-settings-changed', {
        detail: {
          snapshot,
          reason,
          persist: options.persist !== false,
        },
      });
      scope.dispatchEvent(event);
    }
  }

  function getChannelVolume(channel) {
    const key = typeof channel === 'string' ? channel : '';
    return state.volumes[key] ?? 1;
  }

  function updateLabels() {
    if (!uiBindings.form) {
      return;
    }
    const muted = state.muted;
    for (const channel of CHANNELS) {
      const label = uiBindings.labels.get(channel);
      if (!label) {
        continue;
      }
      if (muted) {
        label.textContent = 'Muted';
      } else {
        const percent = Math.round((state.volumes[channel] ?? 0) * 100);
        label.textContent = `${percent}%`;
      }
    }
    if (uiBindings.muteToggle) {
      uiBindings.muteToggle.checked = muted;
    }
  }

  function updateSliders() {
    for (const channel of CHANNELS) {
      const slider = uiBindings.sliders.get(channel);
      if (slider) {
        const percent = Math.round((state.volumes[channel] ?? 0) * 100);
        slider.value = String(percent);
      }
    }
  }

  function refreshUi() {
    updateSliders();
    updateLabels();
  }

  function setMuted(muted, options = {}) {
    const resolved = Boolean(muted);
    if (state.muted === resolved) {
      return;
    }
    state = { ...state, muted: resolved };
    if (options.persist !== false) {
      persistState();
    }
    refreshUi();
    emitChange('mute-change', options);
  }

  function setVolume(channel, value, options = {}) {
    const key = typeof channel === 'string' ? channel : '';
    if (!CHANNELS.includes(key)) {
      return;
    }
    const volume = clampVolume(value);
    if (state.volumes[key] === volume) {
      return;
    }
    state = {
      ...state,
      volumes: { ...state.volumes, [key]: volume },
    };
    if (options.persist !== false) {
      persistState();
    }
    refreshUi();
    emitChange('volume-change', options);
  }

  function toggleMuted(options = {}) {
    setMuted(!state.muted, options);
  }

  function onChange(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function inferChannelFromSound(id, options = {}) {
    if (typeof options.channel === 'string' && options.channel.trim().length) {
      return options.channel.trim();
    }
    if (typeof id === 'string') {
      const lower = id.toLowerCase();
      if (lower.includes('ambient') || lower.includes('theme') || lower.includes('music')) {
        return 'music';
      }
    }
    return 'effects';
  }

  function applyAudioSettingsToExperience(experience) {
    if (!experience || typeof experience !== 'object') {
      return false;
    }
    if (boundExperiences.has(experience)) {
      return true;
    }
    const audioController = experience.audio ?? null;
    if (!audioController || typeof audioController.play !== 'function') {
      return false;
    }
    const originalPlay = audioController.play.bind(audioController);
    audioController.play = (soundId, options = {}) => {
      const channel = inferChannelFromSound(soundId, options);
      const masterVolume = state.muted ? 0 : getChannelVolume('master');
      const channelVolume = state.muted ? 0 : getChannelVolume(channel);
      const baseVolume = Number.isFinite(options.volume) ? Number(options.volume) : 1;
      const finalVolume = state.muted ? 0 : baseVolume * masterVolume * channelVolume;
      const mergedOptions = { ...options, channel, volume: finalVolume };
      if (state.muted) {
        mergedOptions.muted = true;
      }
      return originalPlay(soundId, mergedOptions);
    };
    experience.getAudioChannelVolume = (channel) => getChannelVolume(channel);
    boundExperiences.add(experience);
    return true;
  }

  function bindAudioSettingsControls({ settingsForm } = {}) {
    const form = settingsForm || scope.document?.querySelector?.('[data-settings-form]') || null;
    if (!form) {
      return false;
    }
    uiBindings.form = form;
    form.dataset = form.dataset || {};
    form.dataset.audioSettingsBound = 'true';

    for (const channel of CHANNELS) {
      const slider = form.querySelector?.(`input[name="${channel}"]`) ?? null;
      if (slider) {
        uiBindings.sliders.set(channel, slider);
        if (!slider.__audioBound) {
          slider.addEventListener?.('input', (event) => {
            const target = event?.target ?? slider;
            const numeric = clampVolume(Number(target?.value ?? 0) / 100);
            setVolume(channel, numeric, { source: 'ui' });
          });
          slider.__audioBound = true;
        }
      }
      const label = form.querySelector?.(`[data-volume-label="${channel}"]`) ?? null;
      if (label) {
        uiBindings.labels.set(channel, label);
      }
    }

    const muteToggle = form.querySelector?.('[data-audio-mute]') ?? null;
    if (muteToggle) {
      uiBindings.muteToggle = muteToggle;
      if (!muteToggle.__audioBound) {
        muteToggle.addEventListener?.('change', (event) => {
          const checked = Boolean(event?.target?.checked);
          setMuted(checked, { source: 'ui' });
        });
        muteToggle.__audioBound = true;
      }
    }

    refreshUi();
    return true;
  }

  function getState() {
    return snapshotState(state);
  }

  const audioApi = {
    getState,
    setVolume,
    setMuted,
    toggleMuted,
    onChange,
  };

  scope.InfiniteRails = scope.InfiniteRails || {};
  scope.InfiniteRails.audio = audioApi;

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.applyAudioSettingsToExperience = applyAudioSettingsToExperience;
  hooks.bindAudioSettingsControls = bindAudioSettingsControls;
  hooks.getAudioSettingsState = getState;
  hooks.resetAudioSettings = () => {
    state = snapshotState(DEFAULTS);
    persistState();
    refreshUi();
    emitChange('reset');
  };
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;

  bindAudioSettingsControls({});
  emitChange('initialise', { persist: false });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

(function setupFetchCircuitBreaker(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope) {
    return;
  }

  if (scope.__INFINITE_RAILS_FETCH_CIRCUIT__) {
    return;
  }

  const nativeFetch =
    typeof scope.fetch === 'function'
      ? scope.fetch
      : typeof scope.window?.fetch === 'function'
        ? scope.window.fetch
        : null;
  if (typeof nativeFetch !== 'function') {
    return;
  }

  const appConfig = scope.APP_CONFIG ?? {};
  const circuitConfig = appConfig.fetchCircuitBreaker ?? {};

  const normalisePositiveInteger = (value, fallback) => {
    if (Number.isFinite(value)) {
      const numeric = Number(value);
      if (numeric >= 0) {
        return Math.floor(numeric);
      }
    }
    return fallback;
  };

  const normalisePositiveNumber = (value, fallback) => {
    if (Number.isFinite(value)) {
      const numeric = Number(value);
      if (numeric > 0) {
        return numeric;
      }
    }
    return fallback;
  };

  const failureThreshold = Math.max(1, normalisePositiveInteger(circuitConfig.threshold, 3));
  const failureWindowMs = Math.max(1000, normalisePositiveInteger(circuitConfig.windowMs, 15000));

  const state = {
    threshold: failureThreshold,
    windowMs: failureWindowMs,
    failureLog: new Map(),
    trippedCategories: new Set(),
    lastFailureAt: null,
    trippedAt: null,
    lastFailureDetail: new Map(),
  };

  const assetRetryOptions = appConfig.assetRetryQueue ?? {};
  const assetRetryBaseDelayMs = Math.max(1000, normalisePositiveInteger(assetRetryOptions.baseDelayMs, 5000));
  const assetRetryMaxDelayMs = Math.max(
    assetRetryBaseDelayMs,
    normalisePositiveInteger(assetRetryOptions.maxDelayMs, 60000),
  );
  const assetRetryBackoffMultiplier = normalisePositiveNumber(assetRetryOptions.backoffMultiplier, 2);
  const assetRetryJitterRatio = Math.max(
    0,
    Math.min(0.5, normalisePositiveNumber(assetRetryOptions.jitterRatio, 0.25)),
  );
  const assetRetryMaxAttempts = normalisePositiveInteger(assetRetryOptions.maxAttempts, 0);

  const setTimeoutRef =
    typeof scope.setTimeout === 'function'
      ? scope.setTimeout.bind(scope)
      : typeof setTimeout === 'function'
        ? setTimeout
        : null;
  const clearTimeoutRef =
    typeof scope.clearTimeout === 'function'
      ? scope.clearTimeout.bind(scope)
      : typeof clearTimeout === 'function'
        ? clearTimeout
        : null;
  const RequestCtor =
    typeof scope.Request === 'function'
      ? scope.Request
      : typeof scope.window?.Request === 'function'
        ? scope.window.Request
        : typeof Request === 'function'
          ? Request
          : null;

  const assetRetryQueue = ensureAssetRetryQueue();

  const toLowerCase = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

  const assetRoot = typeof appConfig.assetRoot === 'string' ? appConfig.assetRoot : null;
  const apiBaseUrl = typeof appConfig.apiBaseUrl === 'string' ? appConfig.apiBaseUrl : null;

  const toAbsoluteUrl = (resource) => {
    if (typeof resource === 'string') {
      return resource;
    }
    if (resource && typeof resource.url === 'string') {
      return resource.url;
    }
    return '';
  };

  const getAssetFailoverState = () => scope.__INFINITE_RAILS_ASSET_FAILOVER__ || null;

  const normaliseString = (value) => (typeof value === 'string' ? value : '');

  const rewriteAssetUrlIfNecessary = (url) => {
    const state = getAssetFailoverState();
    if (!state || !state.failoverActive) {
      return null;
    }
    const sourceUrl = ensureString(url).trim();
    if (!sourceUrl) {
      return null;
    }
    const primaryRoot = ensureString(state.primaryRoot).trim();
    const fallbackRoot = ensureString(state.activeRoot || state.fallbackRoot).trim();
    if (!primaryRoot || !fallbackRoot) {
      return null;
    }
    const lowerSource = sourceUrl.toLowerCase();
    const primaryLower = state.primaryRootLower || primaryRoot.toLowerCase();
    if (!lowerSource.startsWith(primaryLower)) {
      return null;
    }
    const fallbackLower = state.activeRootLower || fallbackRoot.toLowerCase();
    if (lowerSource.startsWith(fallbackLower)) {
      return null;
    }
    const suffix = sourceUrl.slice(primaryRoot.length);
    const fallbackWithSlash = ensureTrailingSlash(fallbackRoot);
    return `${fallbackWithSlash}${suffix}`;
  };

  const cloneRequestWithUrl = (request, url) => {
    if (!RequestCtor || !request || typeof request !== 'object' || typeof url !== 'string') {
      return null;
    }
    try {
      return new RequestCtor(url, {
        method: request.method,
        headers: request.headers,
        mode: request.mode,
        credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        integrity: request.integrity,
        keepalive: request.keepalive,
      });
    } catch (error) {
      return null;
    }
  };

  const maybeRewriteAssetRequest = (resource, init) => {
    const rewritten = rewriteAssetUrlIfNecessary(toAbsoluteUrl(resource));
    if (!rewritten) {
      return { resource, init };
    }
    if (RequestCtor && resource instanceof RequestCtor) {
      const clonedRequest = cloneRequestWithUrl(resource, rewritten);
      if (clonedRequest) {
        return { resource: clonedRequest, init };
      }
    }
    if (resource && typeof resource.url === 'string') {
      const nextInit = { ...(init || {}) };
      if (!nextInit.method && normaliseString(resource.method)) {
        nextInit.method = resource.method;
      }
      if (!nextInit.headers && resource.headers) {
        nextInit.headers = resource.headers;
      }
      if (!nextInit.credentials && resource.credentials) {
        nextInit.credentials = resource.credentials;
      }
      if (!nextInit.mode && resource.mode) {
        nextInit.mode = resource.mode;
      }
      if (!nextInit.cache && resource.cache) {
        nextInit.cache = resource.cache;
      }
      if (!nextInit.redirect && resource.redirect) {
        nextInit.redirect = resource.redirect;
      }
      if (!nextInit.referrer && resource.referrer) {
        nextInit.referrer = resource.referrer;
      }
      if (!nextInit.referrerPolicy && resource.referrerPolicy) {
        nextInit.referrerPolicy = resource.referrerPolicy;
      }
      if (!nextInit.integrity && resource.integrity) {
        nextInit.integrity = resource.integrity;
      }
      if (!nextInit.keepalive && resource.keepalive) {
        nextInit.keepalive = resource.keepalive;
      }
      return { resource: rewritten, init: nextInit };
    }
    return { resource: rewritten, init };
  };

  const getHeaderValue = (headers, name) => {
    if (!headers) {
      return null;
    }
    const lowerName = name.toLowerCase();
    if (typeof headers.get === 'function') {
      const value = headers.get(name);
      return typeof value === 'string' ? value : null;
    }
    if (Array.isArray(headers)) {
      for (const entry of headers) {
        if (!entry) {
          continue;
        }
        if (Array.isArray(entry)) {
          const [key, value] = entry;
          if (typeof key === 'string' && key.toLowerCase() === lowerName) {
            return typeof value === 'string' ? value : String(value ?? '');
          }
        } else if (typeof entry === 'object') {
          const key = Object.keys(entry)[0];
          if (typeof key === 'string' && key.toLowerCase() === lowerName) {
            return typeof entry[key] === 'string' ? entry[key] : String(entry[key] ?? '');
          }
        }
      }
      return null;
    }
    const normalised = typeof headers === 'object' ? headers : {};
    for (const [key, value] of Object.entries(normalised)) {
      if (typeof key === 'string' && key.toLowerCase() === lowerName) {
        return typeof value === 'string' ? value : String(value ?? '');
      }
    }
    return null;
  };

  function ensureAssetRetryQueue() {
    if (scope.__INFINITE_RAILS_ASSET_RETRY_QUEUE__) {
      return scope.__INFINITE_RAILS_ASSET_RETRY_QUEUE__;
    }
    if (!setTimeoutRef || !clearTimeoutRef) {
      return null;
    }
    const entries = new Map();
    const queueState = {
      entries,
      schedule(url, options = {}) {
        if (!url || typeof options.createRequest !== 'function') {
          return;
        }
        const existing = entries.get(url);
        const entry = existing ?? {
          attempts: 0,
          nextDelay: assetRetryBaseDelayMs,
          timerId: null,
          lastFailureAt: Date.now(),
          context: {},
        };
        entry.requestFactory = options.createRequest;
        entry.shouldRetryResponse = typeof options.shouldRetryResponse === 'function'
          ? options.shouldRetryResponse
          : null;
        entry.shouldRetryError = typeof options.shouldRetryError === 'function'
          ? options.shouldRetryError
          : null;
        entry.onSuccess = typeof options.onSuccess === 'function' ? options.onSuccess : null;
        entry.onGiveUp = typeof options.onGiveUp === 'function' ? options.onGiveUp : null;
        entry.context = {
          ...(entry.context || {}),
          ...(options.context || {}),
        };
        entry.lastFailureAt = Date.now();
        entries.set(url, entry);
        if (assetRetryMaxAttempts > 0 && entry.attempts >= assetRetryMaxAttempts) {
          return;
        }
        if (entry.timerId) {
          return;
        }
        const jitterOffset = assetRetryJitterRatio > 0
          ? Math.round(entry.nextDelay * assetRetryJitterRatio * Math.random())
          : 0;
        const delay = entry.nextDelay + jitterOffset;
        entry.timerId = setTimeoutRef(() => {
          entry.timerId = null;
          const attemptIndex = entry.attempts + 1;
          let result;
          try {
            result = entry.requestFactory();
          } catch (error) {
            entry.attempts = attemptIndex;
            entry.lastError = error;
            const shouldRetryError = entry.shouldRetryError ? entry.shouldRetryError(error) : false;
            if (shouldRetryError && (assetRetryMaxAttempts === 0 || entry.attempts < assetRetryMaxAttempts)) {
              entry.nextDelay = Math.min(
                assetRetryMaxDelayMs,
                Math.max(assetRetryBaseDelayMs, Math.round(entry.nextDelay * assetRetryBackoffMultiplier)),
              );
              queueState.schedule(url, options);
            } else {
              queueState.clear(url);
              if (entry.onGiveUp) {
                try {
                  entry.onGiveUp({ error });
                } catch (hookError) {
                  // ignore hook failures
                }
              }
            }
            return;
          }

          Promise.resolve(result)
            .then((response) => {
              entry.attempts = attemptIndex;
              entry.lastResponse = response;
              if (response && typeof response.ok === 'boolean' && response.ok) {
                queueState.clear(url);
                if (entry.onSuccess) {
                  try {
                    entry.onSuccess(response);
                  } catch (hookError) {
                    // ignore hook failures
                  }
                }
                return;
              }
              const shouldRetryResponse = entry.shouldRetryResponse
                ? entry.shouldRetryResponse(response)
                : false;
              if (shouldRetryResponse && (assetRetryMaxAttempts === 0 || entry.attempts < assetRetryMaxAttempts)) {
                entry.nextDelay = Math.min(
                  assetRetryMaxDelayMs,
                  Math.max(assetRetryBaseDelayMs, Math.round(entry.nextDelay * assetRetryBackoffMultiplier)),
                );
                queueState.schedule(url, options);
              } else {
                queueState.clear(url);
                if (entry.onGiveUp) {
                  try {
                    entry.onGiveUp({ response });
                  } catch (hookError) {
                    // ignore hook failures
                  }
                }
              }
            })
            .catch((error) => {
              entry.attempts = attemptIndex;
              entry.lastError = error;
              const shouldRetryError = entry.shouldRetryError ? entry.shouldRetryError(error) : false;
              if (shouldRetryError && (assetRetryMaxAttempts === 0 || entry.attempts < assetRetryMaxAttempts)) {
                entry.nextDelay = Math.min(
                  assetRetryMaxDelayMs,
                  Math.max(assetRetryBaseDelayMs, Math.round(entry.nextDelay * assetRetryBackoffMultiplier)),
                );
                queueState.schedule(url, options);
              } else {
                queueState.clear(url);
                if (entry.onGiveUp) {
                  try {
                    entry.onGiveUp({ error });
                  } catch (hookError) {
                    // ignore hook failures
                  }
                }
              }
            });
        }, delay);
      },
      clear(url) {
        if (!url) {
          return;
        }
        const entry = entries.get(url);
        if (!entry) {
          return;
        }
        if (entry.timerId && clearTimeoutRef) {
          clearTimeoutRef(entry.timerId);
        }
        entries.delete(url);
      },
      clearAll() {
        for (const url of Array.from(entries.keys())) {
          queueState.clear(url);
        }
      },
    };

    scope.__INFINITE_RAILS_ASSET_RETRY_QUEUE__ = queueState;
    return queueState;
  }

  function sanitiseRetryInit(init) {
    if (!init || typeof init !== 'object') {
      return undefined;
    }
    const clone = { ...init };
    if ('signal' in clone) {
      delete clone.signal;
    }
    if ('body' in clone) {
      delete clone.body;
    }
    return Object.keys(clone).length ? clone : undefined;
  }

  function createRetryRequestFactory(resource, init) {
    if (typeof nativeFetch !== 'function') {
      return null;
    }
    const safeInit = sanitiseRetryInit(init);
    return () => {
      const { resource: adjustedResource, init: adjustedInit } = maybeRewriteAssetRequest(resource, safeInit);
      if (RequestCtor && adjustedResource instanceof RequestCtor) {
        try {
          return nativeFetch.call(scope, adjustedResource.clone());
        } catch (cloneError) {
          try {
            return nativeFetch.call(scope, new RequestCtor(adjustedResource, adjustedInit));
          } catch (requestError) {
            return nativeFetch.call(scope, adjustedResource, adjustedInit);
          }
        }
      }
      if (adjustedResource && typeof adjustedResource.clone === 'function') {
        try {
          return nativeFetch.call(scope, adjustedResource.clone());
        } catch (cloneError) {
          return nativeFetch.call(scope, adjustedResource, adjustedInit);
        }
      }
      return nativeFetch.call(scope, adjustedResource, adjustedInit);
    };
  }

  function shouldRetryAssetResponse(response, url) {
    if (!response || typeof response.status !== 'number') {
      return false;
    }
    const status = Number(response.status);
    if (status !== 403 && status !== 404) {
      return false;
    }
    if (typeof url === 'string' && /assetVersion=/i.test(url)) {
      return true;
    }
    const cacheControl = getHeaderValue(response.headers, 'cache-control');
    if (cacheControl) {
      const lowered = cacheControl.toLowerCase();
      if (
        lowered.includes('must-revalidate') ||
        lowered.includes('stale-while-revalidate') ||
        lowered.includes('no-cache') ||
        lowered.includes('max-age=0')
      ) {
        return true;
      }
    }
    const edgeStatus =
      getHeaderValue(response.headers, 'x-cache') || getHeaderValue(response.headers, 'cf-cache-status');
    if (edgeStatus) {
      const loweredStatus = edgeStatus.toLowerCase();
      if (
        loweredStatus.includes('error') ||
        loweredStatus.includes('expired') ||
        loweredStatus.includes('updating') ||
        loweredStatus.includes('miss')
      ) {
        return true;
      }
    }
    if (!response.headers) {
      return true;
    }
    return false;
  }

  function shouldRetryAssetError(error) {
    if (!error) {
      return false;
    }
    const name = typeof error.name === 'string' ? error.name.toLowerCase() : '';
    const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
    const code = typeof error.code === 'string' ? String(error.code).toLowerCase() : '';
    if (name.includes('abort') || name.includes('timeout')) {
      return true;
    }
    if (code.includes('timeout') || code.includes('econnreset') || code.includes('etimedout')) {
      return true;
    }
    if (message.includes('timeout') || message.includes('network') || message.includes('failed to fetch')) {
      return true;
    }
    if (typeof error.status === 'number' && (error.status === 403 || error.status === 404)) {
      return true;
    }
    return false;
  }

  function shouldActivateAssetFailoverForRequest(url) {
    const state = getAssetFailoverState();
    if (!state || state.failoverActive) {
      return false;
    }
    const candidate = ensureString(url).trim();
    if (!candidate) {
      return false;
    }
    const primaryRoot = ensureString(state.primaryRoot).trim();
    if (!primaryRoot) {
      return false;
    }
    const primaryLower = state.primaryRootLower || primaryRoot.toLowerCase();
    return candidate.toLowerCase().startsWith(primaryLower);
  }

  function maybeActivateAssetFailoverForFailure(detail) {
    if (!detail || detail.category !== 'assets') {
      return false;
    }
    const requestUrl = detail.requestUrl;
    if (!shouldActivateAssetFailoverForRequest(requestUrl)) {
      return false;
    }
    if (detail.response && typeof detail.response.status === 'number') {
      const status = Number(detail.response.status);
      if (status === 403 || status === 404) {
        return activateAssetFailover(scope, {
          type: 'http',
          status,
          url: requestUrl,
          message: normaliseString(detail.response.statusText),
        });
      }
    }
    if (detail.error) {
      const fingerprint = `${normaliseString(detail.error.code)} ${normaliseString(detail.error.message)} ${normaliseString(detail.error.name)}`.toLowerCase();
      if (fingerprint.includes('403') || fingerprint.includes('forbidden') || fingerprint.includes('blocked')) {
        return activateAssetFailover(scope, {
          type: 'error',
          code: detail.error.code ?? null,
          message: detail.error.message ?? null,
          url: requestUrl,
        });
      }
    }
    return false;
  }

  function clearAssetRetry(url) {
    if (!assetRetryQueue || !url) {
      return;
    }
    assetRetryQueue.clear(url);
  }

  function maybeScheduleAssetRetry(detail) {
    if (!assetRetryQueue || !detail) {
      return;
    }
    if (detail.category !== 'assets') {
      return;
    }
    const requestUrl = detail.requestUrl;
    if (!requestUrl) {
      return;
    }
    maybeActivateAssetFailoverForFailure(detail);
    const requestFactory = createRetryRequestFactory(detail.resource, detail.init);
    if (!requestFactory) {
      return;
    }
    const context = {
      phase: detail.phase ?? null,
      status: detail.response?.status ?? null,
      errorName: detail.error?.name ?? null,
    };
    if (detail.response) {
      if (!shouldRetryAssetResponse(detail.response, requestUrl)) {
        clearAssetRetry(requestUrl);
        return;
      }
    } else if (detail.error) {
      if (!shouldRetryAssetError(detail.error)) {
        clearAssetRetry(requestUrl);
        return;
      }
    } else {
      return;
    }
    assetRetryQueue.schedule(requestUrl, {
      createRequest: requestFactory,
      context,
      shouldRetryResponse: (response) => shouldRetryAssetResponse(response, requestUrl),
      shouldRetryError: shouldRetryAssetError,
      onSuccess: () => {
        clearAssetRetry(requestUrl);
      },
      onGiveUp: () => {
        clearAssetRetry(requestUrl);
      },
    });
  }

  const normaliseCategory = (value) => {
    const label = toLowerCase(value).trim();
    if (!label) {
      return null;
    }
    if (label === 'asset' || label === 'assets') {
      return 'assets';
    }
    if (label === 'api' || label === 'apis') {
      return 'api';
    }
    if (label === 'model' || label === 'models') {
      return 'models';
    }
    return null;
  };

  const inferCategory = (resource, init) => {
    const override = (() => {
      const direct = normaliseCategory(init?.infiniteRailsScope ?? init?.scope);
      if (direct) {
        return direct;
      }
      const headerOverride = normaliseCategory(
        getHeaderValue(init?.headers, 'X-Infinite-Rails-Fetch-Scope') ??
          getHeaderValue(init?.headers, 'X-Fetch-Scope'),
      );
      if (headerOverride) {
        return headerOverride;
      }
      if (resource && typeof resource === 'object') {
        const requestScope = normaliseCategory(resource.infiniteRailsScope ?? resource.scope);
        if (requestScope) {
          return requestScope;
        }
        if (typeof resource.headers === 'object') {
          const headerScope = normaliseCategory(
            getHeaderValue(resource.headers, 'X-Infinite-Rails-Fetch-Scope') ??
              getHeaderValue(resource.headers, 'X-Fetch-Scope'),
          );
          if (headerScope) {
            return headerScope;
          }
        }
      }
      return null;
    })();
    if (override) {
      return override;
    }

    const absoluteUrl = toAbsoluteUrl(resource);
    if (!absoluteUrl) {
      return 'api';
    }

    const lowerUrl = absoluteUrl.toLowerCase();
    if (assetRoot && lowerUrl.startsWith(assetRoot.toLowerCase())) {
      return 'assets';
    }
    if (apiBaseUrl && lowerUrl.startsWith(apiBaseUrl.toLowerCase())) {
      return 'api';
    }
    if (/(?:^|\/)api\//.test(lowerUrl)) {
      return 'api';
    }
    if (/\.glb(?:[?#]|$)|\.gltf(?:[?#]|$)/.test(lowerUrl)) {
      return 'models';
    }
    if (/\.(?:png|jpe?g|gif|webp|mp3|ogg|wav|m4a|json|js|css|wasm)(?:[?#]|$)/.test(lowerUrl)) {
      return 'assets';
    }
    return 'api';
  };

  const shouldBypassCircuit = (category, init) => {
    if (!init) {
      return false;
    }
    if (init.infiniteRailsBypassCircuit === true || init.bypassCircuit === true) {
      return true;
    }
    const headerValue = getHeaderValue(init.headers, 'X-Infinite-Rails-Circuit-Bypass');
    if (headerValue && headerValue.toLowerCase() === 'true') {
      return true;
    }
    if (Array.isArray(init.tags) && init.tags.includes('allow-fetch-circuit-bypass')) {
      return true;
    }
    return false;
  };

  const pruneFailures = (category, now) => {
    const bucket = state.failureLog.get(category);
    if (!bucket) {
      return;
    }
    const cutoff = now - state.windowMs;
    while (bucket.length && bucket[0].timestamp < cutoff) {
      bucket.shift();
    }
    if (bucket.length === 0) {
      state.failureLog.delete(category);
    }
  };

  const markCircuitBodyState = (category) => {
    const body = scope.document?.body ?? null;
    if (!body) {
      return;
    }
    if (!body.dataset) {
      body.dataset = {};
    }
    body.dataset.fetchCircuit = 'true';
    body.dataset.fetchCircuitCategory = category;
    if (typeof body.setAttribute === 'function') {
      body.setAttribute('data-fetch-circuit', 'true');
      body.setAttribute('data-fetch-circuit-category', category);
    }
  };

  const clearCircuitBodyState = () => {
    const body = scope.document?.body ?? null;
    if (!body) {
      return;
    }
    if (body.dataset) {
      delete body.dataset.fetchCircuit;
      delete body.dataset.fetchCircuitCategory;
    }
    if (typeof body.removeAttribute === 'function') {
      body.removeAttribute('data-fetch-circuit');
      body.removeAttribute('data-fetch-circuit-category');
    }
  };

  const dispatchCircuitEvent = (type, detail) => {
    const eventDetail = { detail };
    const CustomEventCtor = scope.CustomEvent ?? (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
    if (CustomEventCtor) {
      try {
        const eventInstance = new CustomEventCtor(type, { detail, bubbles: false, cancelable: false });
        if (scope.document && typeof scope.document.dispatchEvent === 'function') {
          scope.document.dispatchEvent(eventInstance);
          return;
        }
        if (typeof scope.dispatchEvent === 'function') {
          scope.dispatchEvent(eventInstance);
          return;
        }
      } catch (error) {
        if (scope.console && typeof scope.console.debug === 'function') {
          scope.console.debug(
            `dispatchCircuitEvent: CustomEvent dispatch failed for "${type}" — falling back to synthetic event dispatch.`,
            error,
          );
        }
      }
    }
    if (scope.document && typeof scope.document.dispatchEvent === 'function') {
      try {
        scope.document.dispatchEvent({ type, ...eventDetail });
      } catch (error) {
        if (scope.console && typeof scope.console.debug === 'function') {
          scope.console.debug(
            `dispatchCircuitEvent: Synthetic dispatch failed for "${type}" in fetch circuit telemetry handler.`,
            error,
          );
        }
      }
    }
  };

  const tripCircuit = (category, info) => {
    if (state.trippedCategories.has(category)) {
      return;
    }
    state.trippedCategories.add(category);
    state.trippedAt = Date.now();
    state.lastFailureDetail.set(category, info);
    markCircuitBodyState(category);
    if (scope.console && typeof scope.console.warn === 'function') {
      scope.console.warn(`Fetch circuit breaker tripped for ${category} requests.`, info?.error ?? info?.response ?? info);
    }
    dispatchCircuitEvent('infinite-rails:fetch-circuit-tripped', {
      category,
      info,
      threshold: state.threshold,
      windowMs: state.windowMs,
    });
  };

  const recordFailure = (category, info) => {
    const now = Date.now();
    const bucket = state.failureLog.get(category) ?? [];
    bucket.push({ timestamp: now, info });
    if (bucket.length > state.threshold + 5) {
      bucket.splice(0, bucket.length - (state.threshold + 5));
    }
    state.failureLog.set(category, bucket);
    state.lastFailureAt = now;
    state.lastFailureDetail.set(category, info);
    pruneFailures(category, now);
    if (bucket.length > state.threshold) {
      tripCircuit(category, info);
    }
  };

  const recordSuccess = (category) => {
    pruneFailures(category, Date.now());
  };

  const wrappedFetch = (resource, init) => {
    let adjustedResource = resource;
    let adjustedInit = init;
    const rewritten = maybeRewriteAssetRequest(resource, init);
    if (rewritten) {
      adjustedResource = rewritten.resource;
      adjustedInit = rewritten.init;
    }
    const category = inferCategory(adjustedResource, adjustedInit);
    const bypass = shouldBypassCircuit(category, adjustedInit);
    if (!bypass && state.trippedCategories.has(category)) {
      const error = new Error(`Fetch circuit breaker tripped for ${category} requests.`);
      error.name = 'FetchCircuitTrippedError';
      error.circuitCategory = category;
      error.fetchResource = adjustedResource;
      error.fetchInit = adjustedInit;
      return Promise.reject(error);
    }

    let fetchResult;
    const requestUrl = toAbsoluteUrl(adjustedResource);
    try {
      fetchResult = nativeFetch.call(scope, adjustedResource, adjustedInit);
    } catch (error) {
      recordFailure(category, { error, phase: 'invoke', resource: adjustedResource, init: adjustedInit });
      maybeScheduleAssetRetry({
        category,
        requestUrl,
        resource: adjustedResource,
        init: adjustedInit,
        error,
        phase: 'invoke',
      });
      throw error;
    }

    if (!fetchResult || typeof fetchResult.then !== 'function') {
      return fetchResult;
    }

    return Promise.resolve(fetchResult)
      .then((response) => {
        if (!response || typeof response.ok !== 'boolean') {
          recordFailure(category, { response, phase: 'invalid-response', resource: adjustedResource, init: adjustedInit });
          return response;
        }
        if (!response.ok) {
          recordFailure(category, {
            response,
            status: response.status,
            statusText: response.statusText,
            phase: 'http',
            resource: adjustedResource,
            init: adjustedInit,
          });
          maybeScheduleAssetRetry({
            category,
            requestUrl,
            resource: adjustedResource,
            init: adjustedInit,
            response,
            phase: 'http',
          });
        } else {
          recordSuccess(category);
          if (category === 'assets' && requestUrl) {
            clearAssetRetry(requestUrl);
          }
        }
        return response;
      })
      .catch((error) => {
        recordFailure(category, { error, phase: 'rejection', resource: adjustedResource, init: adjustedInit });
        maybeScheduleAssetRetry({
          category,
          requestUrl,
          resource: adjustedResource,
          init: adjustedInit,
          error,
          phase: 'rejection',
        });
        throw error;
      });
  };

  const resetCircuit = () => {
    state.failureLog.clear();
    state.trippedCategories.clear();
    state.lastFailureAt = null;
    state.trippedAt = null;
    state.lastFailureDetail.clear();
    clearCircuitBodyState();
    if (assetRetryQueue) {
      assetRetryQueue.clearAll();
    }
  };

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.getFetchCircuitState = () => ({
    threshold: state.threshold,
    windowMs: state.windowMs,
    tripped: state.trippedCategories.size > 0,
    trippedCategories: Array.from(state.trippedCategories),
    lastFailureAt: state.lastFailureAt,
    trippedAt: state.trippedAt,
    failureCounts: Object.fromEntries(Array.from(state.failureLog.entries(), ([key, entries]) => [key, entries.length])),
  });
  hooks.isFetchCircuitTripped = (category) => state.trippedCategories.has(normaliseCategory(category) ?? category);
  hooks.resetFetchCircuitBreaker = () => {
    resetCircuit();
  };
  hooks.tripFetchCircuit = (category) => {
    const resolved = normaliseCategory(category) ?? 'api';
    tripCircuit(resolved, { phase: 'manual' });
  };
  hooks.getAssetFailoverState = () => {
    const state = getAssetFailoverState();
    if (!state) {
      return null;
    }
    return {
      primaryRoot: state.primaryRoot,
      fallbackRoot: state.fallbackRoot,
      activeRoot: state.activeRoot,
      failoverActive: state.failoverActive,
      triggeredAt: state.triggeredAt,
      reason: state.reason,
    };
  };
  hooks.getAssetRetryQueueState = () => {
    if (!assetRetryQueue) {
      return { size: 0, entries: [] };
    }
    return {
      size: assetRetryQueue.entries.size,
      entries: Array.from(assetRetryQueue.entries.entries(), ([url, entry]) => ({
        url,
        attempts: entry.attempts,
        nextDelayMs: entry.nextDelay,
        scheduled: Boolean(entry.timerId),
        lastFailureAt: entry.lastFailureAt,
        context: entry.context,
      })),
    };
  };
  hooks.clearAssetRetryQueue = () => {
    if (assetRetryQueue) {
      assetRetryQueue.clearAll();
    }
  };
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;

  scope.__INFINITE_RAILS_FETCH_CIRCUIT__ = {
    originalFetch: nativeFetch,
    state,
    reset: resetCircuit,
  };

  try {
    Object.defineProperty(wrappedFetch, 'name', { value: 'fetch', configurable: true });
  } catch (error) {
    if (scope.console && typeof scope.console.debug === 'function') {
      scope.console.debug(
        'wrapFetch: Unable to redefine wrapped fetch function name for fetch circuit diagnostics.',
        error,
      );
    }
  }

  if (typeof scope.fetch === 'function') {
    scope.fetch = wrappedFetch;
  }
  if (scope.window && typeof scope.window.fetch === 'function') {
    scope.window.fetch = wrappedFetch;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

(function applyProductionAssetRoot(globalScope) {
  if (!globalScope || typeof globalScope !== 'object') {
    return;
  }

  try {
    Object.defineProperty(globalScope, 'PRODUCTION_ASSET_ROOT', {
      value: PRODUCTION_ASSET_ROOT,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  } catch (error) {
    globalScope.PRODUCTION_ASSET_ROOT = PRODUCTION_ASSET_ROOT;
  }

  const resolvedAssetRoot = resolveBootstrapAssetRoot(globalScope);
  enforceAssetBaseConsistency(globalScope, resolvedAssetRoot);
  initialiseAssetFailover(globalScope, resolvedAssetRoot);
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

(function exposeBootstrapInternals(globalScope) {
  if (!globalScope || typeof globalScope !== 'object') {
    return;
  }
  try {
    const registry = globalScope.__INFINITE_RAILS_BOOTSTRAP__ || (globalScope.__INFINITE_RAILS_BOOTSTRAP__ = {});
    if (!Object.prototype.hasOwnProperty.call(registry, 'resolveBootstrapAssetRoot')) {
      Object.defineProperty(registry, 'resolveBootstrapAssetRoot', {
        value: resolveBootstrapAssetRoot,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    }
  } catch (error) {
    // ignore exposure failures; only used for tests and diagnostics
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : undefined);

const CIRCUIT_BREAKER_GUIDANCE = Object.freeze({
  renderer:
    'Open Diagnostics → Renderer to review the error details and follow the recovery steps before restarting.',
  assets:
    'Open Diagnostics → Assets to retry the missing downloads or activate the offline pack before restarting.',
  models:
    'Open Diagnostics → Models to retry the missing downloads or contact support with the listed files before restarting.',
  input: 'Open Diagnostics → Renderer to review the input error and follow the recovery steps before restarting.',
  default: 'Open Diagnostics to review the issue and follow the recovery steps before restarting.',
});

const RENDERER_FALLBACK_MESSAGES = Object.freeze({
  bootstrapFailure: {
    userMessage: 'The game failed to initialise. Open Diagnostics → Renderer for recovery steps before restarting.',
    diagnosticMessage: 'Bootstrap sequence failed. Review Diagnostics → Renderer before restarting.',
    logMessage: 'Bootstrap sequence failed. Player prompted to follow Diagnostics → Renderer recovery steps.',
  },
  startFailure: {
    userMessage: 'Failed to initialise the renderer. Open Diagnostics → Renderer for recovery guidance before restarting.',
    diagnosticMessage: 'Failed to initialise the renderer. Review Diagnostics → Renderer for recovery guidance.',
    logMessage: 'Failed to initialise the renderer. Player prompted to follow Diagnostics → Renderer recovery guidance.',
  },
  expeditionSnag: {
    userMessage: 'We hit a snag while starting the expedition. Open Diagnostics → Renderer for recovery steps before restarting.',
  },
  tutorialFailure: {
    userMessage: 'The tutorial overlay failed to open. Open Diagnostics → Renderer for recovery steps before restarting.',
  },
  generic: {
    userMessage: 'An unexpected error occurred. Open Diagnostics for recovery steps before restarting.',
  },
  missingAssets: {
    message: 'Open Diagnostics → Assets to restore missing files, or reload manually if prompted.',
  },
});

function normaliseCircuitScope(scope) {
  if (typeof scope === 'string' && scope.trim().length) {
    const normalised = scope.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(CIRCUIT_BREAKER_GUIDANCE, normalised)) {
      return normalised;
    }
  }
  return 'default';
}

function appendCircuitBreakerGuidance(message, scope = 'default') {
  const trimmed = typeof message === 'string' ? message.trim() : '';
  const scopeKey = normaliseCircuitScope(scope);
  const guidance = CIRCUIT_BREAKER_GUIDANCE[scopeKey] || CIRCUIT_BREAKER_GUIDANCE.default;
  if (!trimmed) {
    return guidance;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes('diagnostic') || lower.includes('support.infiniterails.app')) {
    return trimmed;
  }
  const separator = trimmed.endsWith('.') ? ' ' : '. ';
  return `${trimmed}${separator}${guidance}`;
}

function resolveRendererFallbackMessage(key, { stage = null, scope = 'renderer', extras = [] } = {}) {
  const template = RENDERER_FALLBACK_MESSAGES[key] || RENDERER_FALLBACK_MESSAGES.generic;
  const baseMessage = template.userMessage || template.message || RENDERER_FALLBACK_MESSAGES.generic.userMessage;
  const resolvedScope = normaliseCircuitScope(scope);
  let message = baseMessage;
  if (stage && typeof stage === 'string' && stage.trim().length && !message.includes(`(${stage})`)) {
    message = `${message} (${stage.trim()})`;
  }
  if (Array.isArray(extras) && extras.length) {
    const extended = `${message}\n\n${extras.join('\n')}`;
    return appendCircuitBreakerGuidance(extended, resolvedScope);
  }
  return appendCircuitBreakerGuidance(message, resolvedScope);
}

function decorateFallbackDetail(detail = {}) {
  const scopeKey = normaliseCircuitScope(detail.scope || 'renderer');
  if (typeof detail.message === 'string' && detail.message.trim().length) {
    detail.message = appendCircuitBreakerGuidance(detail.message, scopeKey);
  } else {
    detail.message = appendCircuitBreakerGuidance('Renderer unavailable', scopeKey);
  }
  return detail;
}

function markBootPhaseError(phase, message) {
  const scope = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null;
  if (!scope) {
    return;
  }
  const registry = scope.__INFINITE_RAILS_BOOT_PHASE_ERRORS__ || (scope.__INFINITE_RAILS_BOOT_PHASE_ERRORS__ = {});
  const key = typeof phase === 'string' && phase.trim().length ? phase.trim() : 'unknown';
  registry[key] = appendCircuitBreakerGuidance(message || 'Unknown bootstrap error', key === 'unknown' ? 'default' : key);
}

(function setupMissionBriefingFallback(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope || scope.__MISSION_BRIEFING_FALLBACK_API__) {
    return;
  }

  const documentRef = scope.document ?? scope.documentRef ?? null;
  if (!documentRef) {
    return;
  }

  const getElement = (id) => {
    if (!id || typeof documentRef.getElementById !== 'function') {
      return null;
    }
    return documentRef.getElementById(id);
  };

  const ensureClassList = (element) => {
    if (!element) {
      return null;
    }
    if (!element.classList) {
      const classes = new Set();
      element.classList = {
        add: (...tokens) => {
          tokens.forEach((token) => {
            if (token) {
              classes.add(String(token));
            }
          });
          element.className = Array.from(classes).join(' ');
        },
        remove: (...tokens) => {
          tokens.forEach((token) => {
            classes.delete(String(token));
          });
          element.className = Array.from(classes).join(' ');
        },
        contains: (token) => classes.has(String(token)),
      };
    }
    return element.classList;
  };

  const setRendererModeIndicator = (mode) => {
    const resolved = typeof mode === 'string' && mode.trim().length ? mode.trim() : '';
    const root = documentRef.documentElement ?? null;
    const body = documentRef.body ?? null;
    if (root?.setAttribute) {
      root.setAttribute('data-renderer-mode', resolved);
    }
    if (body?.setAttribute) {
      body.setAttribute('data-renderer-mode', resolved);
    }
    scope.__INFINITE_RAILS_RENDERER_MODE__ = resolved;
    scope.InfiniteRails = scope.InfiniteRails || {};
    scope.InfiniteRails.rendererMode = resolved;
  };

  const ensureFallbackNotice = (container) => {
    if (!container) {
      return null;
    }
    let notice = getElement('gameBriefingFallbackNotice');
    if (notice) {
      return notice;
    }
    if (typeof documentRef.createElement !== 'function') {
      return null;
    }
    notice = documentRef.createElement('p');
    notice.id = 'gameBriefingFallbackNotice';
    notice.className = 'game-briefing__fallback-notice';
    notice.textContent =
      'Renderer systems are offline. Launch mission briefing mode or reload the page to retry.';
    if (typeof container.insertBefore === 'function') {
      container.insertBefore(notice, container.firstChild ?? null);
    } else if (typeof container.appendChild === 'function') {
      container.appendChild(notice);
    }
    return notice;
  };

  const revealBriefing = (briefing) => {
    if (!briefing) {
      return;
    }
    briefing.hidden = false;
    ensureClassList(briefing)?.add?.('is-visible');
    if (typeof briefing.removeAttribute === 'function') {
      briefing.removeAttribute('aria-hidden');
    }
  };

  const configureDismissButton = (options = {}) => {
    const dismissButton = getElement('dismissBriefing');
    if (!dismissButton) {
      return;
    }
    if (dismissButton.disabled) {
      dismissButton.disabled = false;
    }
    if (dismissButton.dataset) {
      dismissButton.dataset.lowFidelityBound = 'true';
    }
    if (typeof dismissButton.addEventListener === 'function' && !dismissButton.__missionBriefingBound) {
      const handler = (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        const canvas = getElement('gameCanvas');
        if (canvas) {
          canvas.style.display = '';
        }
        ensureClassList(getElement('gameBriefing'))?.remove?.('is-visible');
      };
      dismissButton.addEventListener('click', handler);
      dismissButton.__missionBriefingBound = true;
    }
  };

  const disableStartButton = () => {
    const startButton = getElement('startButton');
    if (!startButton) {
      return;
    }
    startButton.disabled = true;
    if (startButton.dataset) {
      startButton.dataset.fallbackMode = 'briefing';
      delete startButton.dataset.preloading;
    }
    if (typeof startButton.setAttribute === 'function') {
      startButton.setAttribute('aria-disabled', 'true');
    }
  };

  const hideCanvas = () => {
    const canvas = getElement('gameCanvas');
    if (canvas && canvas.style) {
      canvas.style.display = 'none';
    }
  };

  const updateSupportActions = (options = {}) => {
    const supportContainer = getElement('gameBriefingSupportActions');
    if (!supportContainer) {
      return;
    }
    const recoveryButton = getElement('gameBriefingRecoveryButton');
    if (!recoveryButton) {
      supportContainer.hidden = true;
      return;
    }
    recoveryButton.hidden = false;
    supportContainer.hidden = false;
    if (typeof recoveryButton.addEventListener === 'function' && !recoveryButton.__missionBriefingBound) {
      recoveryButton.addEventListener('click', (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        if (scope.location?.reload) {
          scope.location.reload();
        }
      });
      recoveryButton.__missionBriefingBound = true;
    }
    if (recoveryButton.dataset) {
      recoveryButton.dataset.fallbackReason = options.reason ?? 'renderer-failure';
    }
  };

  const activateMissionBriefingFallback = (options = {}) => {
    if (!documentRef) {
      return false;
    }
    const briefing = getElement('gameBriefing');
    const content = briefing?.querySelector?.('.game-briefing__content') ?? briefing;
    ensureFallbackNotice(content);
    revealBriefing(briefing);
    configureDismissButton(options);
    disableStartButton();
    hideCanvas();
    updateSupportActions(options);
    setRendererModeIndicator('briefing');
    scope.__MISSION_BRIEFING_FALLBACK_AVAILABLE__ = true;
    scope.__MISSION_BRIEFING_FALLBACK_ACTIVE__ = true;
    scope.__MISSION_BRIEFING_FALLBACK_REASON__ = options.reason ?? 'renderer-failure';
    return true;
  };

  const offerMissionBriefingFallback = (options = {}) => {
    const overlay = scope.bootstrapOverlay ?? null;
    if (!overlay || typeof overlay.setRecoveryAction !== 'function') {
      return activateMissionBriefingFallback({ ...options, source: 'implicit-offer' });
    }
    const recoveryConfig = {
      action: 'open-mission-briefing',
      label: 'Open Mission Briefing Mode',
      description:
        'Switch to the text-only mission briefing so the expedition can continue without the renderer.',
      onSelect: () => {
        activateMissionBriefingFallback({ ...options, source: 'recovery-action' });
        if (typeof overlay.hide === 'function') {
          overlay.hide({ force: true });
        }
      },
    };
    try {
      overlay.setRecoveryAction(recoveryConfig);
      scope.__MISSION_BRIEFING_FALLBACK_AVAILABLE__ = true;
      return true;
    } catch (error) {
      scope.console?.warn?.('Failed to register mission briefing fallback.', error);
      return activateMissionBriefingFallback({ ...options, source: 'recovery-action-error', error });
    }
  };

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.activateMissionBriefingFallback = activateMissionBriefingFallback;
  hooks.offerMissionBriefingFallback = offerMissionBriefingFallback;
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;

  scope.activateMissionBriefingFallback = activateMissionBriefingFallback;
  scope.offerMissionBriefingFallback = offerMissionBriefingFallback;
  scope.__MISSION_BRIEFING_FALLBACK_API__ = {
    activateMissionBriefingFallback,
    offerMissionBriefingFallback,
  };
})(typeof window !== 'undefined' ? window : undefined);

(function setupBackendHealthMonitor(globalScope) {
  const globalRef =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!globalRef) {
    return;
  }

  const documentRef = globalRef.document ?? null;
  const appConfig = globalRef.APP_CONFIG || (globalRef.APP_CONFIG = {});
  const identityState =
    globalRef.__INFINITE_RAILS_IDENTITY_STATE__ ||
    (globalRef.__INFINITE_RAILS_IDENTITY_STATE__ = {
      apiBaseUrl: null,
      scoreboardOffline: false,
      liveFeaturesSuspended: false,
      liveFeaturesHoldDetail: null,
      backendValidation: { performed: false, ok: null, detail: null },
      configuredEndpoints: {
        scores: '/scores',
        users: '/users',
        events: '/events',
      },
      endpoints: {
        scores: '/scores',
        users: '/users',
        events: '/events',
      },
    });

  const backendState = {
    performed: false,
    success: null,
    detail: null,
    promise: null,
  };

  const heartbeatState =
    globalRef.__INFINITE_RAILS_HEARTBEAT_STATE__ ||
    (globalRef.__INFINITE_RAILS_HEARTBEAT_STATE__ = {
      endpoint: null,
      intervalMs: null,
      timerId: null,
      online: true,
      sequence: 0,
      lastPayload: null,
    });

  const networkFailureCounts = new Map();
  const NETWORK_FAILURE_THRESHOLD = 3;

  function updateConfiguredEndpoints() {
    const configured = identityState.configuredEndpoints || (identityState.configuredEndpoints = {});
    configured.scores = configured.scores || '/scores';
    configured.users = configured.users || '/users';
    configured.events = configured.events || '/events';
    const endpoints = identityState.endpoints || (identityState.endpoints = {});
    endpoints.scores = configured.scores;
    endpoints.users = configured.users;
    endpoints.events = configured.events;
  }

  updateConfiguredEndpoints();

  function setIdentityOffline(detail) {
    identityState.scoreboardOffline = true;
    identityState.backendValidation = {
      performed: true,
      ok: false,
      detail,
    };
  }

  function setIdentityOnline() {
    identityState.scoreboardOffline = false;
    identityState.backendValidation = {
      performed: true,
      ok: true,
      detail: { reason: 'ok', message: 'Backend validation succeeded.' },
    };
  }

  function normaliseApiBaseUrl(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const fallbackBase = typeof globalRef.location?.origin === 'string' ? globalRef.location.origin : 'https://example.com';
      const url = new URL(trimmed, trimmed.startsWith('http') ? undefined : fallbackBase);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }
      const normalised = `${url.origin}${url.pathname}`.replace(/\/+$/, '/');
      return ensureTrailingSlash(normalised);
    } catch (error) {
      return null;
    }
  }

  function buildOfflineMessage(reasons) {
    const base = 'Offline session active';
    if (!Array.isArray(reasons) || reasons.length === 0) {
      return `${base} — backend validation failed.`;
    }
    return `${base} — ${reasons.join('; ')}`;
  }

  function recordFailure(reason, detail = {}) {
    const message =
      typeof detail.message === 'string' && detail.message.trim().length
        ? detail.message.trim()
        : 'Offline session active — backend validation failed.';
    backendState.performed = true;
    backendState.success = false;
    backendState.detail = { ...detail, reason };
    setIdentityOffline({ reason, message, detail });
    setScoreboardOffline(globalRef, message);
    return false;
  }

  function recordSuccess(apiBaseUrl) {
    backendState.performed = true;
    backendState.success = true;
    backendState.detail = { reason: 'ok', message: 'Backend validation succeeded.' };
    identityState.apiBaseUrl = apiBaseUrl;
    setIdentityOnline();
    clearScoreboardOffline(globalRef);
    return true;
  }

  function validateConfiguredEndpoints() {
    const configured = identityState.configuredEndpoints || {};
    const endpoints = identityState.endpoints || {};
    const failures = [];
    if (!configured.scores || !endpoints.scores) {
      failures.push('Scores endpoint not configured');
    }
    if (!configured.users || !endpoints.users) {
      failures.push('Users endpoint not configured');
    }
    if (!configured.events || !endpoints.events) {
      failures.push('Events endpoint not configured');
    }
    if (failures.length > 0) {
      const message = buildOfflineMessage(failures);
      recordFailure('endpoint-missing', { message, failures });
      return false;
    }
    return true;
  }

  async function pingEndpoint(fetchImpl, baseUrl, endpoint) {
    const method = (endpoint.method ?? 'GET').toUpperCase();
    const url = `${baseUrl}${endpoint.path}`;
    try {
      const response = await fetchImpl(url, { method, credentials: 'include', cache: 'no-store' });
      if (!response || typeof response.ok !== 'boolean') {
        throw new Error('invalid-response');
      }
      if (!response.ok) {
        const status = Number.isFinite(response.status) ? response.status : '???';
        const statusText =
          typeof response.statusText === 'string' && response.statusText.trim().length
            ? ` ${response.statusText.trim()}`
            : '';
        const error = new Error(`${method} ${endpoint.path} returned ${status}${statusText}`);
        error.name = 'EndpointStatusError';
        error.status = status;
        error.endpoint = endpoint.path;
        throw error;
      }
      return null;
    } catch (error) {
      if (error && error.name === 'EndpointStatusError') {
        return error.message;
      }
      return `${method} ${endpoint.path} unreachable`;
    }
  }

  async function performBackendValidation() {
    const fetchImpl = globalRef.fetch ?? null;
    if (typeof fetchImpl !== 'function') {
      identityState.apiBaseUrl = null;
      return recordFailure('fetch-unavailable', {
        message: 'Offline session active — fetch API unavailable on this platform.',
      });
    }

    const apiBaseUrl = normaliseApiBaseUrl(appConfig.apiBaseUrl);
    if (!apiBaseUrl) {
      identityState.apiBaseUrl = null;
      return recordFailure('api-base-url-missing', {
        message: 'Offline session active — backend configuration missing.',
      });
    }

    identityState.apiBaseUrl = apiBaseUrl;
    updateConfiguredEndpoints();

    const endpoints = [
      { path: identityState.endpoints.scores, method: 'GET' },
      { path: identityState.endpoints.scores, method: 'POST' },
      { path: identityState.endpoints.users, method: 'GET' },
      { path: identityState.endpoints.users, method: 'POST' },
      { path: identityState.endpoints.events, method: 'POST' },
    ];

    const failures = [];
    for (const endpoint of endpoints) {
      const failure = await pingEndpoint(fetchImpl, apiBaseUrl, endpoint);
      if (failure) {
        failures.push(failure);
      }
    }

    if (failures.length > 0) {
      const message = buildOfflineMessage(failures);
      return recordFailure('endpoint-failure', { message, failures });
    }

    if (!validateConfiguredEndpoints()) {
      return false;
    }

    return recordSuccess(apiBaseUrl);
  }

  function ensureBackendLiveCheck() {
    if (backendState.promise) {
      return backendState.promise;
    }
    const task = async () => {
      const result = await performBackendValidation();
      if (result) {
        configureHeartbeat();
      }
      return Boolean(result);
    };
    backendState.promise = task().catch((error) => {
      recordFailure('unexpected-error', {
        message: 'Offline session active — backend validation failed.',
        error,
      });
      return false;
    });
    return backendState.promise;
  }

  function getBackendLiveCheckState() {
    return {
      performed: backendState.performed,
      success: backendState.success,
      detail: backendState.detail,
      promise: backendState.promise,
    };
  }

  function stopHeartbeat() {
    if (heartbeatState.timerId && typeof globalRef.clearTimeout === 'function') {
      globalRef.clearTimeout(heartbeatState.timerId);
    }
    heartbeatState.timerId = null;
  }

  function buildHeartbeatPayload() {
    heartbeatState.sequence = (heartbeatState.sequence ?? 0) + 1;
    const payload = {
      mode: 'heartbeat',
      intervalMs: heartbeatState.intervalMs,
      sequence: heartbeatState.sequence,
      status: {
        scoreboard: { offline: Boolean(identityState.scoreboardOffline) },
        gameClient: {
          running: false,
          available: typeof globalRef.InfiniteRails !== 'undefined',
        },
      },
    };
    heartbeatState.lastPayload = payload;
    return payload;
  }

  function sendHeartbeat() {
    if (!heartbeatState.endpoint || typeof globalRef.fetch !== 'function') {
      return Promise.resolve(false);
    }
    const payload = buildHeartbeatPayload();
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    };
    return Promise.resolve(globalRef.fetch(heartbeatState.endpoint, init)).then(() => payload);
  }

  function scheduleHeartbeat() {
    if (!heartbeatState.endpoint || !Number.isFinite(heartbeatState.intervalMs)) {
      return null;
    }
    stopHeartbeat();
    if (typeof globalRef.setTimeout !== 'function') {
      return null;
    }
    const timerId = globalRef.setTimeout(() => {
      heartbeatState.timerId = null;
      if (!heartbeatState.online) {
        return;
      }
      sendHeartbeat()
        .catch(() => false)
        .finally(() => {
          if (heartbeatState.online) {
            heartbeatState.timerId = scheduleHeartbeat();
          }
        });
    }, heartbeatState.intervalMs);
    heartbeatState.timerId = timerId;
    return timerId;
  }

  function configureHeartbeat() {
    const endpoint = typeof appConfig.healthEndpoint === 'string' ? appConfig.healthEndpoint.trim() : '';
    if (!endpoint) {
      heartbeatState.endpoint = null;
      stopHeartbeat();
      return;
    }
    heartbeatState.endpoint = endpoint;
    const intervalValue = Number(appConfig.healthHeartbeatIntervalMs);
    heartbeatState.intervalMs = Number.isFinite(intervalValue) && intervalValue > 0 ? intervalValue : 60000;
    heartbeatState.online = true;
    if (!heartbeatState.timerId) {
      scheduleHeartbeat();
    }
  }

  function handleScoreSyncOffline(event) {
    const detail = event?.detail ?? {};
    heartbeatState.online = false;
    stopHeartbeat();
    setScoreboardOffline(globalRef, 'Offline session active — score synchronisation unavailable.', {
      datasetKey: 'scoreSyncOffline',
    });
    setScoreSyncWarning(globalRef, 'Score sync offline — waiting for recovery.', true);
    identityState.scoreboardOffline = true;
    identityState.liveFeaturesHoldDetail = {
      kind: 'score-sync-offline',
      detail,
    };
  }

  function handleScoreSyncRestored(event) {
    heartbeatState.online = true;
    setScoreSyncWarning(globalRef, '', false);
    identityState.scoreboardOffline = Boolean(identityState.liveFeaturesSuspended);
    if (heartbeatState.endpoint) {
      scheduleHeartbeat();
    }
  }

  const hooks = globalRef.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.ensureBackendLiveCheck = ensureBackendLiveCheck;
  hooks.getBackendLiveCheckState = getBackendLiveCheckState;
  hooks.getIdentityState = () => cloneDeep(identityState);
  hooks.getHeartbeatState = () => cloneDeep(heartbeatState);
  hooks.triggerHeartbeat = () => {
    if (!heartbeatState.endpoint || !heartbeatState.online) {
      return false;
    }
    return sendHeartbeat();
  };
  hooks.recordNetworkFailure = (category, detail = {}) => {
    const key = typeof category === 'string' && category.trim().length ? category.trim().toLowerCase() : 'unknown';
    const current = networkFailureCounts.get(key) ?? 0;
    const next = current + 1;
    networkFailureCounts.set(key, next);
    if (next >= NETWORK_FAILURE_THRESHOLD) {
      const message = 'Offline/Recovery Mode — repeated API failures detected.';
      setScoreboardOffline(globalRef, message, { datasetKey: 'networkFailure' });
      setLeaderboardLock(globalRef, true, { message });
      identityState.scoreboardOffline = true;
      identityState.liveFeaturesSuspended = true;
      identityState.liveFeaturesHoldDetail = { kind: 'network-failure', detail };
    }
  };
  globalRef.__INFINITE_RAILS_TEST_HOOKS__ = hooks;

  if (typeof globalRef.addEventListener === 'function') {
    globalRef.addEventListener('infinite-rails:score-sync-offline', handleScoreSyncOffline);
    globalRef.addEventListener('infinite-rails:score-sync-restored', handleScoreSyncRestored);
  }

  const autoStart = () => {
    try {
      ensureBackendLiveCheck();
    } catch (error) {
      recordFailure('unexpected-error', {
        message: 'Offline session active — backend validation failed.',
        error,
      });
    }
  };

  if (!documentRef || typeof documentRef.addEventListener !== 'function') {
    autoStart();
    return;
  }

  const readyState = String(documentRef.readyState || '').toLowerCase();
  if (readyState === 'complete' || readyState === 'interactive') {
    Promise.resolve().then(autoStart);
  } else {
    documentRef.addEventListener('DOMContentLoaded', autoStart, { once: true });
  }
})(typeof window !== 'undefined' ? window : undefined);
