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

const PRODUCTION_ASSET_ROOT = ensureTrailingSlash('https://d3gj6x3ityfh5o.cloudfront.net/');

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
    const category = inferCategory(resource, init);
    const bypass = shouldBypassCircuit(category, init);
    if (!bypass && state.trippedCategories.has(category)) {
      const error = new Error(`Fetch circuit breaker tripped for ${category} requests.`);
      error.name = 'FetchCircuitTrippedError';
      error.circuitCategory = category;
      error.fetchResource = resource;
      error.fetchInit = init;
      return Promise.reject(error);
    }

    let fetchResult;
    try {
      fetchResult = nativeFetch.call(scope, resource, init);
    } catch (error) {
      recordFailure(category, { error, phase: 'invoke', resource, init });
      throw error;
    }

    if (!fetchResult || typeof fetchResult.then !== 'function') {
      return fetchResult;
    }

    return Promise.resolve(fetchResult)
      .then((response) => {
        if (!response || typeof response.ok !== 'boolean') {
          recordFailure(category, { response, phase: 'invalid-response', resource, init });
          return response;
        }
        if (!response.ok) {
          recordFailure(category, {
            response,
            status: response.status,
            statusText: response.statusText,
            phase: 'http',
            resource,
            init,
          });
        } else {
          recordSuccess(category);
        }
        return response;
      })
      .catch((error) => {
        recordFailure(category, { error, phase: 'rejection', resource, init });
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

  const appConfig = globalScope.APP_CONFIG || (globalScope.APP_CONFIG = {});
  if (typeof appConfig.assetRoot !== 'string' || !appConfig.assetRoot.trim()) {
    appConfig.assetRoot = PRODUCTION_ASSET_ROOT;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

      message: 'Open Diagnostics → Assets to restore missing files, or reload manually if prompted.',
    message = 'An unexpected error occurred. Open Diagnostics for recovery steps before restarting.',
      userMessage: 'The game failed to initialise. Open Diagnostics → Renderer for recovery steps before restarting.',
      diagnosticMessage: 'Bootstrap sequence failed. Review Diagnostics → Renderer before restarting.',
      logMessage: 'Bootstrap sequence failed. Player prompted to follow Diagnostics → Renderer recovery steps.',
      userMessage: 'Failed to initialise the renderer. Open Diagnostics → Renderer for recovery guidance before restarting.',
      diagnosticMessage: 'Failed to initialise the renderer. Review Diagnostics → Renderer for recovery guidance.',
      logMessage: 'Failed to initialise the renderer. Player prompted to follow Diagnostics → Renderer recovery guidance.',
      userMessage: 'We hit a snag while starting the expedition. Open Diagnostics → Renderer for recovery steps before restarting.',
      userMessage: 'The tutorial overlay failed to open. Open Diagnostics → Renderer for recovery steps before restarting.',
      userMessage: 'An unexpected error occurred. Open Diagnostics for recovery steps before restarting.',
  const CIRCUIT_BREAKER_GUIDANCE = Object.freeze({
    renderer:
      'Open Diagnostics → Renderer to review the error details and follow the recovery steps before restarting.',
    assets:
      'Open Diagnostics → Assets to retry the missing downloads or activate the offline pack before restarting.',
    models:
      'Open Diagnostics → Models to retry the missing downloads or contact support with the listed files before restarting.',
    input:
      'Open Diagnostics → Renderer to review the input error and follow the recovery steps before restarting.',
    default:
      'Open Diagnostics to review the issue and follow the recovery steps before restarting.',
  });

  function appendCircuitBreakerGuidance(message, scope = 'default') {
    const trimmed = typeof message === 'string' ? message.trim() : '';
    const scopeKey = typeof scope === 'string' && scope.trim().length ? scope.trim().toLowerCase() : 'default';
    const guidance = CIRCUIT_BREAKER_GUIDANCE[scopeKey] || CIRCUIT_BREAKER_GUIDANCE.default;
    if (!trimmed) {
      return guidance;
    }
    const normalised = trimmed.toLowerCase();
    if (normalised.includes('diagnostic') || normalised.includes('support.infiniterails.app')) {
      return trimmed;
    }
    const separator = trimmed.endsWith('.') ? ' ' : '. ';
    return `${trimmed}${separator}${guidance}`;
  }

    const scope =
      typeof detail?.scope === 'string' && detail.scope.trim().length
        ? detail.scope.trim().toLowerCase()
        : 'renderer';
        : 'Renderer unavailable';
      let message = baseMessage;
      if (stage && !message.includes(`(${stage})`)) {
        message = `${message} (${stage})`;
      }
      return appendCircuitBreakerGuidance(message, scope);
    const debugMessage = extras.length ? `${baseMessage}\n\n${extras.join('\n')}` : baseMessage;
    return appendCircuitBreakerGuidance(debugMessage, scope);
      const scopeLabel =
        typeof detail.scope === 'string' && detail.scope.trim().length
          ? detail.scope.trim().toLowerCase()
          : 'renderer';
      if (typeof detail.message === 'string' && detail.message.trim().length) {
        detail.message = appendCircuitBreakerGuidance(detail.message, scopeLabel);
      } else {
        detail.message = appendCircuitBreakerGuidance('Renderer unavailable', scopeLabel);
    const rendererMessage = appendCircuitBreakerGuidance('Unable to load the 3D renderer.', 'renderer');
    const diagnosticMessage = appendCircuitBreakerGuidance('Three.js failed to load.', 'renderer');
      message: rendererMessage,
      diagnosticMessage,
          message: rendererMessage,
          message: diagnosticMessage,
      message: rendererMessage,
              : 'Critical assets failed to preload.';
          const actionableMessage = appendCircuitBreakerGuidance(errorMessage, 'assets');
            message: actionableMessage,
            diagnosticMessage: actionableMessage,
            logMessage: actionableMessage,
          markBootPhaseError('assets', actionableMessage);
          markBootPhaseError('gltf', appendCircuitBreakerGuidance('Critical models unavailable — cannot continue.', 'models'));
          markBootPhaseError('controls', appendCircuitBreakerGuidance('Controls disabled until assets load.', 'assets'));
              message: actionableMessage,
        userMessage: 'Fallback renderer failed to start. Open Diagnostics → Renderer for recovery steps before restarting.',
          userMessage: 'Renderer entrypoint is missing from the build output. Open Diagnostics → Renderer for recovery steps before restarting.',

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
  const state = {
    performed: false,
    success: null,
    detail: null,
    promise: null,
  };

  let cachedScoreboardEl = null;

  function getScoreboardStatusElement() {
    if (cachedScoreboardEl && cachedScoreboardEl.isConnected !== false) {
      return cachedScoreboardEl;
    }
    if (!documentRef || typeof documentRef.getElementById !== 'function') {
      return null;
    }
    const element = documentRef.getElementById('scoreboardStatus');
    if (!element) {
      return null;
    }
    element.dataset = element.dataset || {};
    cachedScoreboardEl = element;
    return element;
  }

  function setOfflineScoreboardMessage(message) {
    const element = getScoreboardStatusElement();
    if (!element) {
      return;
    }
    element.dataset = element.dataset || {};
    element.dataset.offline = 'true';
    if (typeof element.setAttribute === 'function') {
      element.setAttribute('data-offline', 'true');
    }
    const resolved = typeof message === 'string' && message.trim().length ? message.trim() : 'Offline session active — backend validation failed.';
    element.textContent = resolved;
  }

  function clearOfflineScoreboardState() {
    const element = getScoreboardStatusElement();
    if (!element) {
      return;
    }
    if (element.dataset) {
      delete element.dataset.offline;
    }
    if (typeof element.removeAttribute === 'function') {
      element.removeAttribute('data-offline');
    }
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
      const url = new URL(trimmed, trimmed.startsWith('http') ? undefined : 'https://example.com');
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }
      const normalised = `${url.origin}${url.pathname}`.replace(/\/+$/, '');
      return normalised || null;
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
    const detailReason = typeof reason === 'string' ? reason : 'unknown';
    const detailMessage =
      typeof detail.message === 'string' && detail.message.trim().length
        ? detail.message.trim()
        : 'Offline session active — backend validation failed.';
    state.performed = true;
    state.success = false;
    state.detail = { ...detail, reason: detailReason, message: detailMessage };
    setOfflineScoreboardMessage(state.detail.message);
    return false;
  }

  async function pingEndpoint(fetchImpl, baseUrl, endpoint) {
    const method = endpoint.method ?? 'GET';
    const url = `${baseUrl}${endpoint.path}`;
    try {
      const response = await fetchImpl(url, { method, credentials: 'include', cache: 'no-store' });
      if (!response || typeof response.ok !== 'boolean') {
        throw new Error('invalid-response');
      }
      if (!response.ok) {
        const status = Number.isFinite(response.status) ? response.status : '???';
        const statusText = typeof response.statusText === 'string' && response.statusText.trim().length ? ` ${response.statusText.trim()}` : '';
        const error = new Error(`${method.toUpperCase()} ${endpoint.path} returned ${status}${statusText}`);
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
      const message = `${method.toUpperCase()} ${endpoint.path} unreachable`;
      return message;
    }
  }

  async function performBackendValidation() {
    const fetchImpl = globalRef.fetch ?? null;
    if (typeof fetchImpl !== 'function') {
      return recordFailure('fetch-unavailable', {
        message: 'Offline session active — fetch API unavailable on this platform.',
        detail: { reason: 'fetch-unavailable' },
      });
    }

    const appConfig = globalRef.APP_CONFIG ?? {};
    const apiBaseUrl = normaliseApiBaseUrl(appConfig.apiBaseUrl);
    if (!apiBaseUrl) {
      return recordFailure('api-base-url-missing', {
        message: 'Offline session active — backend configuration missing.',
      });
    }

    const endpoints = [
      { path: '/scores', method: 'GET' },
      { path: '/scores', method: 'POST' },
      { path: '/users', method: 'GET' },
      { path: '/users', method: 'POST' },
      { path: '/events', method: 'POST' },
    ];

    const failures = [];
    for (const endpoint of endpoints) {
      const failure = await pingEndpoint(fetchImpl, apiBaseUrl, endpoint);
      if (failure) {
        failures.push(failure);
      }
    }

    if (failures.length) {
      const message = buildOfflineMessage(failures);
      return recordFailure('endpoint-failure', {
        message,
        failures,
      });
    }

    state.performed = true;
    state.success = true;
    state.detail = {
      reason: 'ok',
      message: 'Backend validation succeeded.',
    };
    clearOfflineScoreboardState();
    return true;
  }

  function ensureBackendLiveCheck() {
    if (state.promise) {
      return state.promise;
    }
    const task = async () => {
      const result = await performBackendValidation();
      return Boolean(result);
    };
    state.promise = task().catch((error) => {
      const message = 'Offline session active — backend validation failed.';
      recordFailure('unexpected-error', {
        message,
        error,
      });
      return false;
    });
    return state.promise;
  }

  function getBackendLiveCheckState() {
    return { ...state };
  }

  const hooks = globalRef.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.ensureBackendLiveCheck = ensureBackendLiveCheck;
  hooks.getBackendLiveCheckState = getBackendLiveCheckState;
  globalRef.__INFINITE_RAILS_TEST_HOOKS__ = hooks;

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
