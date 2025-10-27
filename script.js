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
