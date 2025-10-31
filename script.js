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

const DEFAULT_SCOREBOARD_MESSAGE =
  'Google Sign-In unavailable — configure APP_CONFIG.googleClientId to enable SSO.';

const ASSET_VERSION = 1;

(function setupBootstrapTracing(globalScope) {
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

  const state =
    scope.__INFINITE_RAILS_TRACE_STATE__ ||
    (scope.__INFINITE_RAILS_TRACE_STATE__ = {
      traceId: null,
      sessionId: null,
      consoleInstrumented: false,
      fetchInstrumented: false,
      xhrInstrumented: false,
    });

  const generateId = (prefix) => {
    const random = Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now().toString(36);
    return `${prefix}-${random}${timestamp}`;
  };

  if (typeof state.traceId !== 'string' || state.traceId.length === 0) {
    state.traceId = generateId('trace');
  }
  if (typeof state.sessionId !== 'string' || state.sessionId.length === 0) {
    state.sessionId = generateId('session');
  }

  const buildMetadata = () => ({
    traceId: state.traceId,
    sessionId: state.sessionId,
    trace: { traceId: state.traceId, sessionId: state.sessionId },
  });

  const consoleRef = scope.console ?? (typeof console !== 'undefined' ? console : null);
  if (consoleRef && !state.consoleInstrumented) {
    const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'assert'];
    methods.forEach((method) => {
      const fn = consoleRef[method];
      if (typeof fn !== 'function') {
        return;
      }
      if (fn && typeof fn === 'function') {
        const mockDescriptor = fn.mock || fn.getMockImplementation?.() || fn.__isMockFunction;
        if (mockDescriptor) {
          return;
        }
      }
      const original = fn.bind(consoleRef);
      consoleRef[method] = (...args) => {
        try {
          return original(...args, buildMetadata());
        } catch (error) {
          try {
            return original(...args);
          } catch (fallbackError) {
            return fallbackError;
          }
        }
      };
    });
    state.consoleInstrumented = true;
  }

  const applyTraceHeaders = (headers) => {
    const traceHeaders = {
      'x-trace-id': state.traceId,
      'x-trace-session': state.sessionId,
    };
    const HeadersCtor = scope.Headers || (typeof Headers !== 'undefined' ? Headers : null);
    if (HeadersCtor && headers instanceof HeadersCtor) {
      headers.set('x-trace-id', state.traceId);
      headers.set('x-trace-session', state.sessionId);
      return headers;
    }
    if (HeadersCtor) {
      try {
        const hydrated = new HeadersCtor(headers ?? undefined);
        hydrated.set('x-trace-id', state.traceId);
        hydrated.set('x-trace-session', state.sessionId);
        return hydrated;
      } catch (error) {
        // fall through to plain object handling
      }
    }
    if (Array.isArray(headers)) {
      const map = Object.fromEntries(headers);
      return { ...map, ...traceHeaders };
    }
    return { ...(headers || {}), ...traceHeaders };
  };

  if (typeof scope.fetch === 'function' && !state.fetchInstrumented) {
    const originalFetch = scope.fetch.bind(scope);
    scope.fetch = (resource, init = {}) => {
      const nextInit = { ...init };
      nextInit.headers = applyTraceHeaders(init.headers);
      return originalFetch(resource, nextInit);
    };
    state.fetchInstrumented = true;
  }

  if (typeof scope.XMLHttpRequest === 'function' && !state.xhrInstrumented) {
    const OriginalXHR = scope.XMLHttpRequest;
    const InstrumentedXHR = function (...args) {
      const instance = Reflect.construct(OriginalXHR, args);
      if (typeof instance.send === 'function') {
        const originalSend = instance.send;
        instance.send = function (...sendArgs) {
          try {
            if (typeof instance.setRequestHeader === 'function') {
              instance.setRequestHeader('X-Trace-Id', state.traceId);
              instance.setRequestHeader('X-Trace-Session', state.sessionId);
            }
          } catch (error) {
            // ignore header application failures
          }
          return originalSend.apply(this, sendArgs);
        };
      }
      return instance;
    };
    InstrumentedXHR.prototype = OriginalXHR.prototype;
    Object.setPrototypeOf(InstrumentedXHR, OriginalXHR);
    scope.XMLHttpRequest = InstrumentedXHR;
    state.xhrInstrumented = true;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

function applyAssetVersionTag(url) {
  if (typeof url !== 'string' || !url) {
    return url;
  }
  if (url.includes('assetVersion=')) {
    return url;
  }
  const [prefix, hashSuffix = ''] = url.split('#', 2);
  const hash = hashSuffix ? `#${hashSuffix}` : '';
  const separator = prefix.includes('?') ? '&' : '?';
  const versionValue = Number.isFinite(ASSET_VERSION) && ASSET_VERSION > 0 ? ASSET_VERSION : 1;
  return `${prefix}${separator}assetVersion=${versionValue}${hash}`;
}

function monitorSignedAssetUrl(rawBaseUrl, resolvedUrl, relativePath) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : undefined;
  if (!scope) {
    return;
  }
  const references = [];
  if (typeof rawBaseUrl === 'string' && rawBaseUrl) {
    references.push(rawBaseUrl);
  }
  if (typeof resolvedUrl === 'string' && resolvedUrl) {
    references.push(resolvedUrl);
  }
  if (references.length === 0) {
    return;
  }

  if (!monitorSignedAssetUrl.__seen || !(monitorSignedAssetUrl.__seen instanceof Set)) {
    monitorSignedAssetUrl.__seen = new Set();
  }
  const seen = monitorSignedAssetUrl.__seen;

  let bestExpiry = null;
  for (const reference of references) {
    let parsed;
    try {
      parsed = new URL(reference, scope?.location?.href ?? undefined);
    } catch (error) {
      continue;
    }
    const key = `${parsed.origin}${parsed.pathname}?${parsed.searchParams.get('Expires') ?? parsed.search}`;
    if (seen.has(key)) {
      continue;
    }
    const rawExpires = parsed.searchParams.get('Expires');
    if (rawExpires) {
      let expiresValue = Number(rawExpires);
      if (Number.isFinite(expiresValue) && expiresValue > 0) {
        if (expiresValue < 10_000_000_000) {
          expiresValue *= 1000;
        }
        bestExpiry = Math.max(bestExpiry ?? 0, expiresValue);
      }
    }
    seen.add(key);
  }

  if (!Number.isFinite(bestExpiry)) {
    return;
  }

  const now = Date.now();
  const remaining = bestExpiry - now;
  const severity = remaining <= 0 ? 'expired' : remaining <= 24 * 60 * 60 * 1000 ? 'warning' : 'info';
  const remainingMs = Math.max(0, remaining);

  const detail = {
    severity,
    millisecondsUntilExpiry: remainingMs,
    assetBaseUrl: typeof rawBaseUrl === 'string' ? rawBaseUrl : null,
    candidateUrl: typeof resolvedUrl === 'string' ? resolvedUrl : null,
    relativePath: typeof relativePath === 'string' ? relativePath : null,
  };

  if (severity === 'warning' || severity === 'expired') {
    try {
      scope.console?.error?.(
        'Signed asset URL expires soon; rotate credentials or refresh APP_CONFIG.assetBaseUrl to avoid CDN outages.',
        detail,
      );
    } catch (error) {
      // ignore console failures in synthetic environments
    }

    const documentRef = scope.document ?? (typeof document !== 'undefined' ? document : null);
    if (documentRef && typeof documentRef.dispatchEvent === 'function') {
      try {
        const event = { type: 'infinite-rails:signed-url-expiry', detail };
        documentRef.dispatchEvent(event);
      } catch (error) {
        // ignore dispatch failures
      }
    }
  }
}

function createAssetUrlCandidates(relativePath, options = {}) {
  if (typeof relativePath !== 'string' || !relativePath) {
    return [];
  }
  const outerScope = typeof globalScope !== 'undefined' ? globalScope : undefined;
  const scope =
    (options && typeof options.globalScope === 'object' && options.globalScope) ||
    (outerScope && typeof outerScope === 'object' ? outerScope : null) ||
    (typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
  const outerDocument = typeof documentRef !== 'undefined' ? documentRef : undefined;
  const docRef =
    options.documentRef !== undefined
      ? options.documentRef
      : outerDocument !== undefined
        ? outerDocument
        : scope?.document ?? (typeof document !== 'undefined' ? document : null);
  const candidates = [];
  const seen = new Set();

  const assetVersion =
    typeof ASSET_VERSION === 'number' && Number.isFinite(ASSET_VERSION) && ASSET_VERSION > 0 ? ASSET_VERSION : 1;
  const applyVersion =
    typeof applyAssetVersionTag === 'function'
      ? (value) => applyAssetVersionTag(value)
      : (value) => {
          if (typeof value !== 'string' || !value) {
            return value;
          }
          if (value.includes('assetVersion=')) {
            return value;
          }
          const [prefix, hashSuffix = ''] = value.split('#', 2);
          const hash = hashSuffix ? `#${hashSuffix}` : '';
          const separator = prefix.includes('?') ? '&' : '?';
          return `${prefix}${separator}assetVersion=${assetVersion}${hash}`;
        };

  const monitorFn = typeof monitorSignedAssetUrl === 'function' ? monitorSignedAssetUrl : null;

  const pushCandidate = (value, monitorBase) => {
    if (typeof value !== 'string' || !value) {
      return;
    }
    const versioned = applyVersion(value);
    if (seen.has(versioned)) {
      return;
    }
    seen.add(versioned);
    candidates.push(versioned);
    if (monitorFn && typeof monitorBase === 'string') {
      try {
        monitorFn(monitorBase, value, relativePath);
      } catch (error) {
        scope?.console?.warn?.('Signed asset monitor failed.', error);
      }
    }
  };

  const preloadedSelector = options.preloadedSelector;
  if (preloadedSelector && docRef?.querySelector) {
    try {
      const element = docRef.querySelector(preloadedSelector);
      const src = typeof element?.src === 'string' ? element.src : null;
      if (src) {
        pushCandidate(src, src);
        if (candidates.length > 0) {
          return candidates;
        }
      }
    } catch (error) {
      scope?.console?.warn?.('Failed to resolve preloaded asset candidate.', error);
    }
  }

  const rawBase = scope?.APP_CONFIG?.assetBaseUrl;
  if (typeof rawBase === 'string' && rawBase.trim()) {
    try {
      const parsedBase = new URL(rawBase.trim(), scope?.location?.href ?? undefined);
      if (!parsedBase.pathname.endsWith('/')) {
        parsedBase.pathname = `${parsedBase.pathname}/`;
      }
      const resolved = new URL(relativePath, parsedBase.href).href;
      pushCandidate(resolved, rawBase.trim());
      if (candidates.length > 0) {
        return candidates;
      }
    } catch (error) {
      scope?.console?.warn?.('Failed to resolve asset URL using configured assetBaseUrl.', error);
    }
  }

  const documentScript = (() => {
    if (!docRef) {
      return null;
    }
    if (docRef.currentScript && typeof docRef.currentScript.src === 'string') {
      return docRef.currentScript;
    }
    if (typeof docRef.getElementsByTagName === 'function') {
      const scripts = Array.from(docRef.getElementsByTagName('script'));
      return scripts.find((element) => typeof element?.src === 'string' && element.src);
    }
    return null;
  })();

  if (documentScript?.src) {
    try {
      const scriptUrl = new URL(documentScript.src, scope?.location?.href ?? undefined);
      const scriptDir = scriptUrl.href.replace(/[^/]*$/, '');
      const fromDir = new URL(relativePath, scriptDir).href;
      pushCandidate(fromDir, documentScript.src);
      const fromOrigin = new URL(relativePath, `${scriptUrl.origin}/`).href;
      pushCandidate(fromOrigin, documentScript.src);
    } catch (error) {
      scope?.console?.warn?.('Failed to derive asset URL from bootstrap script.', error);
    }
  }

  if (docRef?.baseURI) {
    try {
      const fromBase = new URL(relativePath, docRef.baseURI).href;
      pushCandidate(fromBase, docRef.baseURI);
    } catch (error) {
      scope?.console?.warn?.('Failed to derive asset URL from document base URI.', error);
    }
  }

  if (scope?.location?.origin) {
    try {
      const fromOrigin = new URL(relativePath, `${scope.location.origin}/`).href;
      const baseReference = typeof scope.location.href === 'string' ? scope.location.href : scope.location.origin;
      pushCandidate(fromOrigin, baseReference);
    } catch (error) {
      // ignore origin fallback failures
    }
  }

  if (/^https?:\/\//i.test(relativePath) || relativePath.startsWith('//')) {
    pushCandidate(relativePath);
  }

  if (candidates.length === 0) {
    pushCandidate(relativePath);
  }

  return candidates;
}

function loadScript(url, attributes = {}) {
  const documentRef = typeof document !== 'undefined' ? document : null;
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : undefined;
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    return Promise.reject(new Error('Document context unavailable; cannot load script.'));
  }

  const resolveUrl = (value) => {
    if (typeof value !== 'string' || !value) {
      return value;
    }
    try {
      return new URL(value, documentRef.baseURI || scope?.location?.href || undefined).toString();
    } catch (error) {
      return value;
    }
  };

  const targetUrl = resolveUrl(url);

  const findExistingScript = () => {
    if (typeof documentRef.querySelectorAll !== 'function') {
      return null;
    }
    const scripts = Array.from(documentRef.querySelectorAll('script'));
    return scripts.find((element) => {
      const attributeSrc = element.getAttribute ? element.getAttribute('src') : null;
      if (attributeSrc && resolveUrl(attributeSrc) === targetUrl) {
        return true;
      }
      if (typeof element.src === 'string' && resolveUrl(element.src) === targetUrl) {
        return true;
      }
      return false;
    });
  };

  const createScriptElement = () => {
    const script = documentRef.createElement('script');
    script.async = true;
    script.src = targetUrl;
    if (attributes && typeof attributes === 'object') {
      Object.entries(attributes).forEach(([key, value]) => {
        if (value == null) {
          return;
        }
        try {
          script.setAttribute(key, String(value));
        } catch (error) {
          // ignore attribute failures
        }
      });
    }
    return script;
  };

  return new Promise((resolve, reject) => {
    const existingScript = findExistingScript();
    const attachListeners = (script) => {
      const handleLoad = () => {
        try {
          script.setAttribute?.('data-load-script-loaded', 'true');
          script.removeAttribute?.('data-load-script-error');
        } catch (error) {
          // ignore attribute errors
        }
        resolve(script);
      };
      const handleError = (event) => {
        try {
          script.setAttribute?.('data-load-script-error', 'true');
          script.removeAttribute?.('data-load-script-loaded');
        } catch (error) {
          // ignore attribute errors
        }
        const errorMessage = `Unable to load script from ${targetUrl}.`;
        reject(event?.error instanceof Error ? event.error : new Error(errorMessage));
      };
      if (typeof script.addEventListener === 'function') {
        script.addEventListener('load', handleLoad, { once: true });
        script.addEventListener('error', handleError, { once: true });
      } else {
        script.onload = handleLoad;
        script.onerror = handleError;
      }
    };

    if (existingScript && existingScript.getAttribute?.('data-load-script-error') !== 'true') {
      attachListeners(existingScript);
      if (existingScript.readyState === 'complete' || existingScript.getAttribute?.('data-load-script-loaded') === 'true') {
        resolve(existingScript);
      }
      return;
    }

    if (existingScript?.remove) {
      try {
        existingScript.remove();
      } catch (error) {
        // ignore removal errors
      }
    }

    const scriptElement = createScriptElement();
    attachListeners(scriptElement);
    const parent =
      documentRef.head ||
      documentRef.body ||
      (documentRef.documentElement && typeof documentRef.documentElement.appendChild === 'function'
        ? documentRef.documentElement
        : null);
    if (parent && typeof parent.appendChild === 'function') {
      parent.appendChild(scriptElement);
    } else if (typeof documentRef.appendChild === 'function') {
      documentRef.appendChild(scriptElement);
    }
  });
}

const THREE_SCRIPT_URL = applyAssetVersionTag(
  'vendor/three.min.js?v=030c75d4e909.fbb0887537e5',
);
const GLTF_LOADER_SCRIPT_URL = applyAssetVersionTag(
  'vendor/GLTFLoader.js?v=0e92b0589a2a.fbb0887537e5',
);

let threeLoaderPromise = null;

function ensureThree() {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : undefined;
  if (!scope) {
    return Promise.reject(new Error('Three.js bootstrap requires a global scope.'));
  }

  const reportFailure = (code, message, context = {}) => {
    const error = new Error(message);
    error.code = code;
    if (typeof reportThreeLoadFailure === 'function') {
      try {
        reportThreeLoadFailure(error, { reason: code, ...context });
      } catch (reportError) {
        scope.console?.warn?.('reportThreeLoadFailure callback failed.', reportError);
      }
    }
    return error;
  };

  const resolveExistingThree = () => {
    const globalThree = scope.THREE_GLOBAL ?? null;
    if (globalThree && scope.THREE && scope.THREE !== globalThree) {
      scope.THREE = globalThree;
      throw reportFailure(
        'duplicate-three-global',
        'Multiple Three.js contexts detected; refusing to bootstrap duplicate instance.',
        { detail: 'duplicate-three-global' },
      );
    }
    if (globalThree) {
      scope.THREE = globalThree;
      return globalThree;
    }
    if (scope.THREE) {
      throw reportFailure(
        'legacy-three-global',
        'Legacy Three.js global detected; refusing unsupported context.',
        { detail: 'legacy-three-global' },
      );
    }
    return null;
  };

  try {
    const existing = resolveExistingThree();
    if (existing) {
      return Promise.resolve(existing);
    }
  } catch (error) {
    return Promise.reject(error);
  }

  if (!threeLoaderPromise) {
    threeLoaderPromise = loadScript(THREE_SCRIPT_URL, { 'data-three-bootstrap': 'true' })
      .then(() => {
        const globalThree = scope.THREE_GLOBAL ?? scope.THREE ?? null;
        if (!globalThree) {
          throw reportFailure('missing-three-global', 'Unable to locate global THREE after script load.');
        }
        scope.THREE_GLOBAL = globalThree;
        scope.THREE = globalThree;
        return globalThree;
      })
      .catch((error) => {
        const message = `Unable to load Three.js from ${THREE_SCRIPT_URL}.`;
        const failure = reportFailure('load-failed', message, {
          url: THREE_SCRIPT_URL,
          error: error?.message ?? String(error ?? 'unknown-error'),
        });
        throw failure;
      });
  }

  return threeLoaderPromise.catch((error) => {
    threeLoaderPromise = null;
    throw error;
  });
}

let gltfLoaderPromise = null;

function ensureGLTFLoader() {
  return ensureThree()
    .then((THREE) => {
      if (THREE && typeof THREE.GLTFLoader === 'function') {
        return THREE.GLTFLoader;
      }
      if (!gltfLoaderPromise) {
        gltfLoaderPromise = loadScript(GLTF_LOADER_SCRIPT_URL, { 'data-three-gltf': 'true' })
          .then(() => {
            const scope =
              typeof globalScope !== 'undefined'
                ? globalScope
                : typeof window !== 'undefined'
                  ? window
                  : typeof globalThis !== 'undefined'
                    ? globalThis
                    : undefined;
            const loader = scope?.THREE_GLOBAL?.GLTFLoader ?? scope?.THREE?.GLTFLoader ?? null;
            if (!loader) {
              const error = new Error('GLTFLoader failed to register a loader constructor.');
              error.code = 'missing-gltf-loader';
              throw error;
            }
            return loader;
          })
          .catch((error) => {
            gltfLoaderPromise = null;
            throw error;
          });
      }
      return gltfLoaderPromise;
    })
    .catch((error) => {
      gltfLoaderPromise = null;
      throw error;
    });
}

(function bootstrapAdvancedRenderer(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope || scope.__INFINITE_RAILS_TEST_SKIP_BOOTSTRAP__) {
    return;
  }
  if (typeof ensureThree !== 'function') {
    return;
  }
  ensureThree()
    .then(() => {
      if (typeof scope.bootstrap === 'function') {
        try {
          scope.bootstrap({ mode: 'advanced' });
        } catch (error) {
          scope.console?.error?.('Failed to bootstrap advanced renderer.', error);
        }
      }
    })
    .catch((error) => {
      scope.console?.warn?.('Advanced renderer bootstrap aborted — Three.js unavailable.', error);
    });
})(typeof window !== 'undefined' ? window : undefined);

(function setupInputModeDetection(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  const documentRef = scope?.document ?? null;
  const body = documentRef?.body ?? null;
  if (!scope || !documentRef || !body) {
    return;
  }

  const state = {
    mode: null,
    userOverride: null,
    coarsePreferred: false,
  };

  const pointerQueries = ['(pointer: coarse)', '(any-pointer: coarse)'];
  const hoverQueries = ['(hover: none)', '(any-hover: none)'];
  const pointerMediaEntries = [];
  const hoverMediaEntries = [];

  const updateOverlayScheme = (mode) => {
    const overlay = documentRef.getElementById?.('inputOverlay') ?? null;
    if (!overlay) {
      return;
    }
    overlay.dataset = overlay.dataset || {};
    overlay.dataset.scheme = mode;
  };

  const applyMode = (mode, { userInitiated = false } = {}) => {
    const nextMode = mode === 'touch' ? 'touch' : 'pointer';
    if (userInitiated) {
      state.userOverride = nextMode;
    }
    if (state.mode === nextMode) {
      updateOverlayScheme(nextMode);
      return;
    }
    state.mode = nextMode;
    if (typeof body.setAttribute === 'function') {
      body.setAttribute('data-input-mode', nextMode);
    }
    body.classList?.toggle?.('input-touch', nextMode === 'touch');
    body.classList?.toggle?.('input-pointer', nextMode === 'pointer');
    updateOverlayScheme(nextMode);
  };

  const computeCoarsePreference = () => {
    if (Number(scope.navigator?.maxTouchPoints) > 0) {
      return true;
    }
    if (pointerMediaEntries.length > 0) {
      return pointerMediaEntries.some((entry) => Boolean(entry?.matches));
    }
    if (hoverMediaEntries.length > 0) {
      return hoverMediaEntries.some((entry) => Boolean(entry?.matches));
    }
    return false;
  };

  const refreshMode = () => {
    const preferred = state.userOverride ?? (state.coarsePreferred ? 'touch' : 'pointer');
    applyMode(preferred);
  };

  const handleMediaChange = () => {
    const newPreference = computeCoarsePreference();
    state.coarsePreferred = newPreference;
    if (state.userOverride === 'touch' && !newPreference) {
      state.userOverride = null;
    }
    refreshMode();
  };

  if (typeof scope.matchMedia === 'function') {
    const allQueries = [...pointerQueries, ...hoverQueries];
    for (const query of allQueries) {
      try {
        const media = scope.matchMedia(query);
        if (!media) {
          continue;
        }
        if (pointerQueries.includes(query)) {
          pointerMediaEntries.push(media);
        } else if (hoverQueries.includes(query)) {
          hoverMediaEntries.push(media);
        }
        if (typeof media.addEventListener === 'function') {
          media.addEventListener('change', handleMediaChange);
        } else if (typeof media.addListener === 'function') {
          media.addListener(handleMediaChange);
        }
      } catch (error) {
        // ignore matchMedia failures in synthetic environments
      }
    }
  }

  const handlePointerDown = (event) => {
    const pointerTypeRaw = typeof event?.pointerType === 'string' ? event.pointerType : '';
    const pointerType = pointerTypeRaw.toLowerCase();
    if (pointerType === 'mouse') {
      applyMode('pointer', { userInitiated: true });
      return;
    }
    if (pointerType === 'touch') {
      applyMode('touch', { userInitiated: true });
      return;
    }
    if (pointerType === 'pen') {
      const preferTouch = state.coarsePreferred || Number(scope.navigator?.maxTouchPoints) > 0;
      applyMode(preferTouch ? 'touch' : 'pointer', { userInitiated: true });
      return;
    }
    state.userOverride = null;
    refreshMode();
  };

  if (typeof documentRef.addEventListener === 'function') {
    try {
      documentRef.addEventListener('pointerdown', handlePointerDown, { passive: true });
    } catch (error) {
      documentRef.addEventListener('pointerdown', handlePointerDown);
    }
  }

  state.coarsePreferred = computeCoarsePreference();
  refreshMode();

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.getInputModeState = () => ({
    mode: state.mode,
    coarsePreferred: state.coarsePreferred,
    userOverride: state.userOverride,
  });
  hooks.setInputModeOverride = (mode) => {
    state.userOverride = typeof mode === 'string' ? mode : null;
    refreshMode();
  };
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;
})(typeof window !== 'undefined' ? window : undefined);

(function setupSurvivalWatchdog(globalScope) {
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

  const DEFAULT_VITALS = { maxHealth: 20, maxHunger: 20, maxBreath: 10 };
  const WATCHED_STAGES = new Set(['simulation', 'game-logic', 'window.error']);

  const ensureLocalState = () => {
    const container =
      scope.__INFINITE_RAILS_LOCAL_STATE__ ||
      (scope.__INFINITE_RAILS_LOCAL_STATE__ = {
        player: {
          maxHealth: DEFAULT_VITALS.maxHealth,
          health: DEFAULT_VITALS.maxHealth,
          maxHunger: DEFAULT_VITALS.maxHunger,
          hunger: DEFAULT_VITALS.maxHunger,
          hungerPercent: 100,
          maxBreath: DEFAULT_VITALS.maxBreath,
          breath: DEFAULT_VITALS.maxBreath,
          breathPercent: 100,
        },
      });
    if (!container.player || typeof container.player !== 'object') {
      container.player = { ...DEFAULT_VITALS, health: DEFAULT_VITALS.maxHealth, hunger: DEFAULT_VITALS.maxHunger, hungerPercent: 100, breath: DEFAULT_VITALS.maxBreath, breathPercent: 100 };
    }
    return container;
  };

  ensureLocalState();

  const survivalState =
    scope.__INFINITE_RAILS_SURVIVAL_WATCHDOG__ ||
    (scope.__INFINITE_RAILS_SURVIVAL_WATCHDOG__ = {
      experience: null,
      lastTrigger: null,
    });

  const normaliseDetail = (detail = {}) => {
    const stageRaw = typeof detail.stage === 'string' ? detail.stage.trim() : '';
    const reasonRaw = typeof detail.reason === 'string' ? detail.reason.trim() : '';
    const messageRaw = typeof detail.message === 'string' ? detail.message.trim() : '';
    const stageKey = stageRaw
      ? stageRaw
          .trim()
          .replace(/\s+/g, '-')
          .replace(/_+/g, '-')
          .toLowerCase()
      : 'simulation';
    return {
      stageLabel: stageRaw || 'simulation',
      stageKey,
      reasonLabel: reasonRaw || 'unknown',
      reasonKey: reasonRaw.toLowerCase() || 'unknown',
      message: messageRaw,
    };
  };

  const resolveMaxValue = (value, fallback) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
    return fallback;
  };

  const applyExperienceVitals = (experience, vitals) => {
    if (!experience || typeof experience !== 'object') {
      return false;
    }
    let applied = false;
    try {
      if ('maxHealth' in experience) {
        experience.maxHealth = vitals.maxHealth;
      }
      if ('health' in experience || typeof experience.health === 'number') {
        experience.health = vitals.maxHealth;
      }
      if ('maxHunger' in experience) {
        experience.maxHunger = vitals.maxHunger;
      }
      if ('hunger' in experience || typeof experience.hunger === 'number') {
        experience.hunger = vitals.maxHunger;
      }
      if ('hungerPercent' in experience || typeof experience.hungerPercent === 'number') {
        experience.hungerPercent = 100;
      }
      if ('playerBreathCapacity' in experience) {
        experience.playerBreathCapacity = vitals.maxBreath;
      }
      if ('playerBreath' in experience || typeof experience.playerBreath === 'number') {
        experience.playerBreath = vitals.maxBreath;
      }
      if ('playerBreathPercent' in experience || typeof experience.playerBreathPercent === 'number') {
        experience.playerBreathPercent = 100;
      }
      applied = true;
    } catch (error) {
      scope.console?.warn?.('Failed to apply survival watchdog vitals to experience.', error);
    }
    return applied;
  };

  const updateLocalState = (vitals) => {
    const container = ensureLocalState();
    container.player = {
      maxHealth: vitals.maxHealth,
      health: vitals.maxHealth,
      maxHunger: vitals.maxHunger,
      hunger: vitals.maxHunger,
      hungerPercent: 100,
      maxBreath: vitals.maxBreath,
      breath: vitals.maxBreath,
      breathPercent: 100,
    };
    if (!scope.__INFINITE_RAILS_STATE__ || typeof scope.__INFINITE_RAILS_STATE__ !== 'object') {
      scope.__INFINITE_RAILS_STATE__ = {
        player: { ...container.player },
        updatedAt: Date.now(),
      };
    }
    return container.player;
  };

  const triggerSurvivalWatchdog = (rawDetail = {}, options = {}) => {
    const detail = normaliseDetail(rawDetail);
    if (!WATCHED_STAGES.has(detail.stageKey)) {
      return false;
    }

    const experience = survivalState.experience;
    const localState = ensureLocalState();

    const maxHealth = resolveMaxValue(experience?.maxHealth ?? localState.player?.maxHealth, DEFAULT_VITALS.maxHealth);
    const maxHunger = resolveMaxValue(experience?.maxHunger ?? localState.player?.maxHunger, DEFAULT_VITALS.maxHunger);
    const maxBreath = resolveMaxValue(
      experience?.playerBreathCapacity ?? localState.player?.maxBreath,
      DEFAULT_VITALS.maxBreath,
    );

    const vitals = { maxHealth, maxHunger, maxBreath };
    const experienceUpdated = applyExperienceVitals(experience, vitals);
    const playerState = updateLocalState(vitals);

    const eventPayload = {
      stage: detail.stageLabel,
      reason: detail.reasonLabel,
      message: detail.message || null,
      experienceUpdated,
    };

    try {
      experience?.updateHud?.({ reason: 'survival-watchdog', stage: detail.stageLabel });
    } catch (error) {
      scope.console?.warn?.('Survival watchdog HUD update failed.', error);
    }

    try {
      experience?.publishStateSnapshot?.('survival-watchdog');
    } catch (error) {
      scope.console?.warn?.('Survival watchdog snapshot publish failed.', error);
    }

    try {
      experience?.emitGameEvent?.('survival-watchdog-reset', eventPayload);
    } catch (error) {
      scope.console?.warn?.('Survival watchdog event emission failed.', error);
    }

    try {
      scope.console?.warn?.('Survival watchdog reset player vitals after crash.', {
        stage: detail.stageLabel,
        reason: detail.reasonLabel,
        message: detail.message || null,
      });
    } catch (error) {
      // ignore logging failures
    }

    survivalState.lastTrigger = { ...eventPayload, playerState, timestamp: Date.now(), sync: options?.sync === true };
    return true;
  };

  const unwrapExperienceHooks = () => {
    const experience = survivalState.experience;
    if (!experience || typeof experience !== 'object') {
      return;
    }
    const original = experience.presentRendererFailure?.__survivalWatchdogOriginal;
    if (original) {
      experience.presentRendererFailure = original;
    }
  };

  const setActiveExperienceInstance = (experience) => {
    unwrapExperienceHooks();
    survivalState.experience = experience || null;
    if (!experience || typeof experience !== 'object') {
      return;
    }
    const handler = experience.presentRendererFailure;
    if (typeof handler === 'function' && !handler.__survivalWatchdogOriginal) {
      const wrapped = function wrappedPresentRendererFailure(reason, detail) {
        let result;
        try {
          result = handler.apply(this, arguments);
        } finally {
          const stageDetail = typeof detail === 'object' && detail ? detail : {};
          triggerSurvivalWatchdog(stageDetail, { sync: true });
        }
        return result;
      };
      wrapped.__survivalWatchdogOriginal = handler;
      experience.presentRendererFailure = wrapped;
    }
  };

  const resetSurvivalWatchdogState = () => {
    unwrapExperienceHooks();
    survivalState.experience = null;
    survivalState.lastTrigger = null;
    const container = ensureLocalState();
    container.player = {
      maxHealth: DEFAULT_VITALS.maxHealth,
      health: DEFAULT_VITALS.maxHealth,
      maxHunger: DEFAULT_VITALS.maxHunger,
      hunger: DEFAULT_VITALS.maxHunger,
      hungerPercent: 100,
      maxBreath: DEFAULT_VITALS.maxBreath,
      breath: DEFAULT_VITALS.maxBreath,
      breathPercent: 100,
    };
  };

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.setActiveExperienceInstance = setActiveExperienceInstance;
  hooks.triggerSurvivalWatchdog = triggerSurvivalWatchdog;
  hooks.resetSurvivalWatchdogState = resetSurvivalWatchdogState;
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;
})(typeof window !== 'undefined' ? window : undefined);

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

var rendererModeScope =
  (typeof rendererModeScope !== 'undefined' && rendererModeScope)
    ? rendererModeScope
    : typeof window !== 'undefined'
      ? window
      : typeof globalScope !== 'undefined'
        ? globalScope
        : typeof globalThis !== 'undefined'
          ? globalThis
          : undefined;
var rendererModeDocument =
  (typeof rendererModeDocument !== 'undefined' && rendererModeDocument)
    ? rendererModeDocument
    : rendererModeScope?.document ?? (typeof globalScope !== 'undefined' ? globalScope.document ?? null : null);
var rendererModeAppConfig =
  (typeof rendererModeAppConfig !== 'undefined' && rendererModeAppConfig)
    ? rendererModeAppConfig
    : rendererModeScope?.APP_CONFIG ||
      (rendererModeScope
        ? (rendererModeScope.APP_CONFIG = rendererModeScope.APP_CONFIG || {})
        : typeof globalScope !== 'undefined'
          ? (globalScope.APP_CONFIG = globalScope.APP_CONFIG || {})
          : {});

function hasCoarsePointer(scope = ensureRendererHelpers().getScope()) {
  if (!scope) {
    return false;
  }
  if (Number(scope.navigator?.maxTouchPoints) > 1) {
    return true;
  }
  if (typeof scope.matchMedia === 'function') {
    try {
      const pointerQuery = scope.matchMedia('(pointer: coarse)');
      if (pointerQuery?.matches) {
        return true;
      }
    } catch (error) {
      // ignore synthetic environment failures
    }
  }
  return false;
}

function ensureRendererHelpers() {
  const globalRef = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : undefined;
  const existing = globalRef?.__IR_RENDERER_HELPERS__;
  if (existing) {
    return existing;
  }
  const resolveScope = () => {
    if (typeof rendererModeScope !== 'undefined' && rendererModeScope) {
      return rendererModeScope;
    }
    if (typeof globalScope !== 'undefined' && globalScope) {
      return globalScope;
    }
    if (typeof window !== 'undefined') {
      return window;
    }
    if (typeof globalThis !== 'undefined') {
      return globalThis;
    }
    return undefined;
  };
  const helpers = {
    getScope() {
      return resolveScope();
    },
    getDocument() {
      return this.getRendererDocument();
    },
    getRendererDocument() {
      if (typeof rendererModeDocument !== 'undefined' && rendererModeDocument) {
        return rendererModeDocument;
      }
      const scope = resolveScope();
      return scope?.document ?? null;
    },
    getRendererRoot() {
      if (typeof rendererModeRoot !== 'undefined' && rendererModeRoot) {
        return rendererModeRoot;
      }
      const doc = this.getRendererDocument();
      if (doc?.getElementById) {
        return doc.getElementById('rendererRoot') ?? null;
      }
      return null;
    },
    getAppConfig() {
      const scope = resolveScope();
      if (scope) {
        scope.APP_CONFIG = scope.APP_CONFIG || {};
        return scope.APP_CONFIG;
      }
      if (typeof rendererModeAppConfig !== 'undefined' && rendererModeAppConfig) {
        return rendererModeAppConfig;
      }
      return {};
    },
  };
  if (globalRef) {
    globalRef.__IR_RENDERER_HELPERS__ = helpers;
  }
  return helpers;
}

function isMobileUserAgent(scope = ensureRendererHelpers().getScope()) {
  const userAgent = typeof scope?.navigator?.userAgent === 'string' ? scope.navigator.userAgent : '';
  const lower = userAgent.toLowerCase();
  if (!lower) {
    return false;
  }
  return /iphone|ipad|android|mobile/.test(lower);
}

function markMobileEnvironment(appConfig, value = true) {
  if (!appConfig) {
    return;
  }
  appConfig.isMobileEnvironment = value;
}

function ensureStandaloneWebglOverlay(detail = {}) {
  const helpers = getSimpleModeHelperStore();
  const doc = helpers.getRendererDocument() ?? helpers.getDocument();
  if (!doc?.createElement || !doc.body) {
    return null;
  }
  let overlay = doc.getElementById?.('webglBlockedOverlay') ?? null;
  if (overlay) {
    overlay.hidden = false;
    doc.body.setAttribute?.('data-webgl-fallback-mode', detail.fallbackMode ?? 'simple');
    overlay.__webglFallback = { detail, troubleshootingSteps: overlay.__webglFallback?.troubleshootingSteps };
    return overlay;
  }
  overlay = doc.createElement('div');
  overlay.id = 'webglBlockedOverlay';
  overlay.className = 'webgl-fallback';
  overlay.hidden = false;
  const heading = doc.createElement('h2');
  heading.textContent = 'WebGL2 support unavailable';
  const description = doc.createElement('p');
  description.textContent =
    'WebGL2 support is unavailable, so Infinite Rails is launching the simplified renderer.';
  const list = doc.createElement('ol');
  const steps = [
    "Open your browser settings (for example, chrome://settings/system) and enable 'Use hardware acceleration when available.' If the toggle stays disabled, follow the browser help steps at https://support.google.com/chrome/answer/95759.",
    'Disable extensions that block WebGL or force software rendering.',
    'Update your graphics drivers, then restart your browser.',
  ];
  steps.forEach((text) => {
    const item = doc.createElement('li');
    item.textContent = text;
    list.appendChild(item);
  });
  overlay.appendChild(heading);
  overlay.appendChild(description);
  overlay.appendChild(list);
  overlay.__webglFallback = { detail, troubleshootingSteps: steps.slice() };
  doc.body.appendChild(overlay);
  doc.body.setAttribute?.('data-webgl-fallback-mode', detail.fallbackMode ?? 'simple');
  return overlay;
}

function createTestWebglContext(scope) {
  const helpers = getSimpleModeHelperStore();
  const doc = helpers.getRendererDocument() ?? helpers.getDocument() ?? scope?.document ?? null;
  if (!doc?.createElement) {
    return null;
  }
  try {
    const canvas = doc.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    return canvas.getContext('webgl2') || canvas.getContext('experimental-webgl2');
  } catch (error) {
    return null;
  }
}

function runWebglPreflightCheck() {
  const helpers = getSimpleModeHelperStore();
  const scope = helpers.getScope();
  const appConfig = helpers.getAppConfig();
  if (!scope) {
    return false;
  }
  if (appConfig.__webglFallbackApplied) {
    return true;
  }
  if (appConfig.forceSimpleMode) {
    return true;
  }
  const hasWebgl2Context = Boolean(scope.WebGL2RenderingContext) && Boolean(createTestWebglContext(scope));
  if (hasWebgl2Context) {
    appConfig.webglSupport = true;
    return false;
  }
  applySimpleModeFallback('webgl2-unavailable', {
    noticeKey: 'webgl-unavailable-simple-mode',
    noticeMessage: resolveSimpleRendererNoticeMessage('webgl-unavailable-simple-mode'),
  });
  return true;
}

function shouldStartSimpleMode() {
  const helpers = getSimpleModeHelperStore();
  const scope = helpers.getScope();
  const appConfig = helpers.getAppConfig();
  if (!scope) {
    return false;
  }
  const search = typeof scope.location?.search === 'string' ? scope.location.search : '';
  const params = new URLSearchParams(search);
  if ((params.get('mode') || '').toLowerCase() === 'simple') {
    applySimpleModeFallback('query-mode', {
      noticeKey: 'query-simple-mode',
      noticeMessage: resolveSimpleRendererNoticeMessage('query-simple-mode'),
    });
    return true;
  }
  if (appConfig.forceSimpleMode) {
    applySimpleModeFallback('config-forced', {
      noticeKey: 'forced-simple-mode',
      noticeMessage: resolveSimpleRendererNoticeMessage('forced-simple-mode'),
    });
    return true;
  }
  if (appConfig.forceAdvanced) {
    return false;
  }
  const mobile = hasCoarsePointer(scope) || isMobileUserAgent(scope);
  if (mobile) {
    markMobileEnvironment(appConfig, true);
    if (appConfig.supportsAdvancedMobile === true) {
      return false;
    }
    applySimpleModeFallback('mobile-simple-mode', {
      noticeKey: 'mobile-simple-mode',
      noticeMessage: resolveSimpleRendererNoticeMessage('mobile-simple-mode'),
    });
    return true;
  }
  markMobileEnvironment(appConfig, false);
  if (runWebglPreflightCheck()) {
    return true;
  }
  return false;
}

function ensureSimpleModeQueryParam(url, { mode = 'simple' } = {}) {
  if (typeof url !== 'string' || !url) {
    return url;
  }
  try {
    const resolvedMode = mode === 'advanced' ? 'advanced' : 'simple';
    const scope = getSimpleModeHelperStore().getScope();
    const base = scope?.location?.origin ?? 'https://example.com';
    const parsed = new URL(url, base);
    parsed.searchParams.set('mode', resolvedMode);
    return parsed.toString();
  } catch (error) {
    const hasQuery = url.includes('?');
    const [prefix, suffix] = url.split('#', 2);
    const hash = typeof suffix === 'string' ? `#${suffix}` : '';
    const separator = hasQuery ? '&' : '?';
    return `${hasQuery ? prefix : url}${separator}mode=${mode}${hash}`;
  }
}

function getSimpleModeHelperStore() {
  if (typeof ensureRendererHelpers === 'function') {
    try {
      const helpers = ensureRendererHelpers();
      const helperScope = helpers && typeof helpers.getScope === 'function' ? helpers.getScope() : undefined;
      const expectedScope =
        typeof globalScope !== 'undefined' && globalScope ? globalScope : typeof window !== 'undefined' ? window : undefined;
      if (!expectedScope || helperScope === expectedScope) {
        return helpers;
      }
    } catch (error) {
      // fall through to fallback helpers
    }
  }
  const scope =
    (typeof globalScope !== 'undefined' && globalScope) ||
    (typeof window !== 'undefined' ? window : undefined) ||
    (typeof globalThis !== 'undefined' ? globalThis : undefined) ||
    null;
  const documentRef = scope?.document ?? scope?.documentRef ?? null;
  const appConfig =
    scope && typeof scope === 'object'
      ? (scope.APP_CONFIG = scope.APP_CONFIG || {})
      : {};
  const rendererDocument =
    scope?.rendererModeDocument ??
    documentRef ??
    (typeof document !== 'undefined' ? document : null);
  const rendererRoot =
    scope?.rendererModeRoot ??
    (rendererDocument?.getElementById ? rendererDocument.getElementById('rendererRoot') : null);
  return {
    getScope: () => scope,
    getDocument: () => documentRef,
    getRendererDocument: () => rendererDocument,
    getRendererRoot: () => rendererRoot,
    getAppConfig: () => appConfig,
  };
}

const simpleFallbackRuntime = {
  attempted: false,
  lastReason: null,
  lastError: null,
  baselineConfig: null,
  baselineCaptured: false,
  watchdog: { handle: null, mode: null, timeoutMs: null, startedAt: null, onTimeout: null },
};

let simpleFallbackAttempted = false;
let simpleFallbackLastReason = null;
let simpleFallbackLastError = null;

function ensureSimpleModeConfig(appConfig, reason) {
  if (!appConfig) {
    return;
  }
  if (!appConfig.__simpleModeBaselineCaptured) {
    appConfig.__simpleModeBaselineCaptured = true;
    appConfig.__simpleModeBaseline = {
      enableAdvancedExperience: appConfig.enableAdvancedExperience !== false,
      preferAdvanced: appConfig.preferAdvanced !== false,
      forceAdvanced: appConfig.forceAdvanced === true,
      defaultMode: appConfig.defaultMode ?? null,
    };
  }
  appConfig.forceSimpleMode = true;
  appConfig.enableAdvancedExperience = false;
  appConfig.preferAdvanced = false;
  appConfig.forceAdvanced = false;
  appConfig.defaultMode = 'simple';
  if (reason === 'webgl2-unavailable') {
    appConfig.webglSupport = false;
    appConfig.__webglFallbackApplied = true;
  }
}

function applySimpleModeFallback(reason, options = {}) {
  const helpers = getSimpleModeHelperStore();
  const scope = helpers.getScope();
  const appConfig = helpers.getAppConfig();
  if (!scope || !appConfig) {
    return;
  }
  ensureSimpleModeConfig(appConfig, reason);
  setRendererModeIndicator('simple');
  updateRendererState(reason, 'simple');
  if (options.noticeKey) {
    queueBootstrapNotice(scope, options.noticeKey, options.noticeMessage);
  }
  scope.__SIMPLE_RENDERER_FORCED__ = true;
  const overlay = scope.bootstrapOverlay ?? null;
  if (reason === 'webgl2-unavailable') {
    const payload = {
      title: 'WebGL2 support unavailable',
      message:
        'WebGL2 support is unavailable, so Infinite Rails is launching the simplified renderer.',
      detail: { reason },
    };
    if (overlay && typeof overlay.showError === 'function') {
      overlay.showError(payload);
    } else {
      ensureStandaloneWebglOverlay({ reason, fallbackMode: 'simple' });
    }
    if (overlay?.setDiagnostic) {
      overlay.setDiagnostic('renderer', {
        status: 'warning',
        message: 'WebGL2 support unavailable — launching simplified renderer.',
      });
    }
    if (overlay?.setRecoveryAction) {
      overlay.setRecoveryAction({
        action: 'retry-webgl',
        label: 'Retry WebGL Renderer',
        onSelect: () => {
          if (typeof scope?.reloadActiveRenderer === 'function') {
            scope.reloadActiveRenderer({ reason: 'retry-webgl' }).catch(() => {});
          }
        },
      });
    }
  } else if (overlay?.showLoading && options.showLoadingMessage) {
    overlay.showLoading({
      title: 'Switching to sandbox mode',
      message: options.showLoadingMessage,
    });
  }
  if (options.diagnosticMessage && overlay?.setDiagnostic) {
    overlay.setDiagnostic('renderer', {
      status: options.diagnosticStatus ?? 'info',
      message: options.diagnosticMessage,
    });
  }
}

const DEFAULT_SIMPLE_RENDERER_NOTICE_MESSAGES = {
  'webgl-unavailable-simple-mode':
    'WebGL2 support is unavailable on this device, so the mission briefing view is shown instead of the full 3D renderer.',
  'mobile-simple-mode':
    'Advanced renderer is unavailable on mobile devices — loading the simplified sandbox instead.',
  'query-simple-mode': 'Sandbox renderer requested via mode=simple.',
  'forced-simple-mode': 'Sandbox renderer forced by configuration.',
};

function resolveSimpleRendererNoticeMessage(key) {
  if (!key) {
    return '';
  }
  const helpers = getSimpleModeHelperStore();
  const scope = helpers.getScope();
  const candidates = [
    typeof SIMPLE_RENDERER_NOTICE_MESSAGES !== 'undefined' ? SIMPLE_RENDERER_NOTICE_MESSAGES : null,
    scope?.SIMPLE_RENDERER_NOTICE_MESSAGES ?? null,
    DEFAULT_SIMPLE_RENDERER_NOTICE_MESSAGES,
  ];
  for (const map of candidates) {
    if (map && typeof map === 'object' && map[key]) {
      return map[key];
    }
  }
  return '';
}

function queueBootstrapNotice(scope, key, message) {
  const targetScope = scope || getSimpleModeHelperStore().getScope();
  if (!targetScope) {
    return;
  }
  const notices = targetScope.__bootstrapNotices || (targetScope.__bootstrapNotices = []);
  const existing = notices.find((entry) => entry?.key === key);
  const resolvedMessage =
    typeof message === 'string' && message.trim().length ? message.trim() : resolveSimpleRendererNoticeMessage(key);
  const entry = { key, message: resolvedMessage ?? '' };
  if (existing) {
    existing.message = entry.message;
    return;
  }
  notices.push(entry);
}

function setRendererModeIndicator(mode) {
  const helpers = getSimpleModeHelperStore();
  const doc = helpers.getRendererDocument() ?? helpers.getDocument();
  const scope = helpers.getScope();
  if (!doc) {
    return;
  }
  const targetMode =
    mode === 'simple' || mode === 'briefing'
      ? mode
      : 'advanced';
  const root = doc.documentElement ?? null;
  const body = doc.body ?? null;
  if (root?.setAttribute) {
    root.setAttribute('data-renderer-mode', targetMode);
  }
  if (body?.setAttribute) {
    body.setAttribute('data-renderer-mode', targetMode);
  }
  if (body) {
    body.dataset = body.dataset || {};
    body.dataset.rendererMode = targetMode;
  }
  if (scope) {
    scope.__INFINITE_RAILS_RENDERER_MODE__ = targetMode;
    scope.InfiniteRails = scope.InfiniteRails || {};
    scope.InfiniteRails.rendererMode = targetMode;
  }
}

function updateRendererState(reason, mode = 'simple') {
  const scope = getSimpleModeHelperStore().getScope();
  if (!scope) {
    return;
  }
  const state = scope.__INFINITE_RAILS_STATE__ || (scope.__INFINITE_RAILS_STATE__ = {});
  state.rendererMode = mode;
  state.reason = reason ?? state.reason ?? null;
}

function setupSimpleExperienceIntegrations(globalScope) {
  const helpers = getSimpleModeHelperStore();
  const rawScope =
    (typeof globalScope !== 'undefined' && globalScope) ||
    helpers.getScope() ||
    (typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
  if (!rawScope) {
    return { ensureSimpleExperience: () => null };
  }

  const scope =
    rawScope && typeof rawScope.window === 'object' && rawScope.window ? rawScope.window : rawScope;

  const documentRef = helpers.getRendererDocument() ?? scope.document ?? null;
  const appConfig = helpers.getAppConfig();
  const runtime =
    scope.__INFINITE_RAILS_SIMPLE_RUNTIME__ ||
    (scope.__INFINITE_RAILS_SIMPLE_RUNTIME__ = {
      pendingPreload: null,
    });

  const resolveStartButton = () => {
    if (!documentRef || typeof documentRef.getElementById !== 'function') {
      return null;
    }
    return documentRef.getElementById('startButton');
  };

  const setStartButtonPreloading = (active) => {
    const startButton = resolveStartButton();
    if (!startButton) {
      return;
    }
    startButton.disabled = Boolean(active);
    if (startButton.dataset) {
      if (active) {
        startButton.dataset.preloading = 'true';
      } else {
        delete startButton.dataset.preloading;
        delete startButton.dataset.fallbackMode;
      }
    }
    if (typeof startButton.setAttribute === 'function') {
      startButton.setAttribute('aria-disabled', active ? 'true' : 'false');
    }
  };

  const loadEmbeddedModels = (experience) => {
    if (!experience) {
      return;
    }
    let entries = [];
    if (typeof experience.collectCriticalModelEntries === 'function') {
      try {
        const result = experience.collectCriticalModelEntries();
        if (Array.isArray(result)) {
          entries = result;
        }
      } catch (error) {
        scope.console && typeof scope.console.warn === 'function'
          ? scope.console.warn('collectCriticalModelEntries failed.', error)
          : null;
      }
    }
    entries
      .filter((entry) => entry && typeof entry.key === 'string' && entry.key)
      .forEach((entry) => {
        try {
          if (experience.loadEmbeddedModelFromBundle) {
            experience.loadEmbeddedModelFromBundle(entry.key, { force: true, reason: 'embedded-bundle' });
          }
        } catch (error) {
          scope.console && typeof scope.console.warn === 'function'
            ? scope.console.warn('Embedded model load failed.', error)
            : null;
        }
      });
  };

  const shouldUseEmbeddedFallback = (experience, error) => {
    if (!experience || typeof experience.shouldUseEmbeddedModelFallback !== 'function') {
      return false;
    }
    try {
      return experience.shouldUseEmbeddedModelFallback(error) === true;
    } catch (fallbackError) {
      scope.console && typeof scope.console.warn === 'function'
        ? scope.console.warn('Embedded fallback probe failed.', fallbackError)
        : null;
      return false;
    }
  };

  const ensureSimpleExperience = (mode = 'simple', options = {}) => {
    const resolvedMode = mode === 'advanced' ? 'advanced' : 'simple';
    const factory = scope.SimpleExperience && scope.SimpleExperience.create;
    if (typeof factory !== 'function') {
      scope.console && typeof scope.console.warn === 'function'
        ? scope.console.warn('SimpleExperience.create unavailable — cannot ensure simple experience.')
        : null;
      return null;
    }

    const canvas =
      options.canvas ??
      (documentRef && typeof documentRef.getElementById === 'function'
        ? documentRef.getElementById('gameCanvas')
        : null) ??
      (documentRef && typeof documentRef.querySelector === 'function'
        ? documentRef.querySelector('canvas')
        : null);
    const experienceOptions = {
      canvas,
      ui: options.ui ?? scope.__INFINITE_RAILS_UI__ ?? {},
      appConfig,
    };
    const experience = factory(experienceOptions);
    scope.__INFINITE_RAILS_ACTIVE_EXPERIENCE__ = experience;

    setRendererModeIndicator(resolvedMode);
    updateRendererState(options.reason ?? `${resolvedMode}-preload`, resolvedMode);

    if (experience && typeof experience.enableStrictAssetValidation === 'function') {
      try {
        experience.enableStrictAssetValidation(true);
      } catch (error) {
        scope.console && typeof scope.console.debug === 'function'
          ? scope.console.debug('enableStrictAssetValidation failed.', error)
          : null;
      }
    }

    const overlay = scope.bootstrapOverlay ?? null;

    const runPreloadSequence = async () => {
      const executePreload = async () => {
        if (!experience || typeof experience.preloadRequiredAssets !== 'function') {
          return true;
        }
        return experience.preloadRequiredAssets();
      };

      try {
        await Promise.resolve(executePreload());
        return { ok: true, reason: options.reason ?? `${resolvedMode}-preload` };
      } catch (error) {
        if (shouldUseEmbeddedFallback(experience, error)) {
          scope.console && typeof scope.console.warn === 'function'
            ? scope.console.warn(
                'Critical asset preload failed while running from file://; activating embedded asset bundle.',
                error,
              )
            : null;
          if (overlay && typeof overlay.setDiagnostic === 'function') {
            overlay.setDiagnostic('renderer', {
              status: 'warning',
              message: 'Embedded asset bundle active — continuing with cached assets.',
            });
          }
          if (overlay && typeof overlay.showLoading === 'function') {
            overlay.showLoading({
              title: 'Loading embedded assets',
              message: 'Switching to embedded models while remote assets recover.',
            });
          }
          loadEmbeddedModels(experience);
          await Promise.resolve(executePreload());
          return { ok: true, reason: 'embedded-bundle' };
        }
        throw error;
      }
    };

    if (runtime.pendingPreload) {
      runtime.pendingPreload.catch(() => undefined);
    }

    setStartButtonPreloading(true);
    const preloadTask = runPreloadSequence()
      .then((result) => {
        setStartButtonPreloading(false);
        updateRendererState(result.reason, resolvedMode);
        return result;
      })
      .catch((error) => {
        setStartButtonPreloading(false);
        scope.console && typeof scope.console.error === 'function'
          ? scope.console.error('Simple experience preload failed.', error)
          : null;
        if (overlay && typeof overlay.setDiagnostic === 'function') {
          overlay.setDiagnostic('renderer', {
            status: 'error',
            message: 'Renderer assets unavailable — retry or reload to continue.',
            detail: { reason: 'preload-failed' },
          });
        }
        throw error;
      })
      .finally(() => {
        runtime.pendingPreload = null;
      });

    runtime.pendingPreload = preloadTask;

    return experience;
  };

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ || (scope.__INFINITE_RAILS_TEST_HOOKS__ = {});
  hooks.ensureSimpleExperience = ensureSimpleExperience;
  hooks.getSimpleExperienceState = () => ({
    preloading: Boolean(runtime.pendingPreload),
  });
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;
  rawScope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;

  return { ensureSimpleExperience };
}

(function initialiseSimpleExperienceIntegration(globalScope) {
  try {
    setupSimpleExperienceIntegrations(globalScope);
  } catch (error) {
    const scope =
      (typeof globalScope !== 'undefined' && globalScope) ||
      (typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
    if (scope && scope.console && typeof scope.console.warn === 'function') {
      scope.console.warn('Failed to initialise simple experience integrations.', error);
    }
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

function getSimpleModeToggleState(scope = getSimpleModeHelperStore().getScope()) {
  if (!scope) {
    return { control: null, status: null };
  }
  const state = scope.simpleModeToggleState || (scope.simpleModeToggleState = {
    control: null,
    status: null,
    baselineConfig: null,
    baselineCaptured: false,
  });
  const helpers = getSimpleModeHelperStore();
  const rendererDoc = helpers.getRendererDocument();
  if (!state.control || !state.control.isConnected) {
    const toggle = rendererDoc?.getElementById?.('forceSimpleModeToggle') ?? null;
    if (toggle) {
      state.control = toggle;
    }
  }
  if (!state.status || !state.status.isConnected) {
    const status = rendererDoc?.getElementById?.('forceSimpleModeStatus') ?? null;
    if (status) {
      state.status = status;
    }
  }
  return state;
}

function rememberSimpleModeBaseline(appConfig) {
  if (!appConfig) {
    return;
  }
  if (!simpleFallbackRuntime.baselineCaptured) {
    simpleFallbackRuntime.baselineConfig = {
      enableAdvancedExperience: appConfig.enableAdvancedExperience !== false,
      preferAdvanced: appConfig.preferAdvanced !== false,
      forceAdvanced: appConfig.forceAdvanced === true,
      defaultMode: appConfig.defaultMode ?? null,
      forceSimpleMode: appConfig.forceSimpleMode === true,
    };
    simpleFallbackRuntime.baselineCaptured = true;
  }
  const toggleState = getSimpleModeToggleState();
  if (!toggleState.baselineCaptured) {
    toggleState.baselineConfig = {
      active: Boolean(appConfig.forceSimpleMode),
      textContent: toggleState.status?.textContent ?? '',
    };
    toggleState.baselineCaptured = true;
  }
}

function restoreSimpleModeConfig(appConfig) {
  const baseline = simpleFallbackRuntime.baselineConfig;
  if (baseline && appConfig) {
    appConfig.enableAdvancedExperience = baseline.enableAdvancedExperience;
    appConfig.preferAdvanced = baseline.preferAdvanced;
    appConfig.forceAdvanced = baseline.forceAdvanced;
    if (baseline.defaultMode == null) {
      delete appConfig.defaultMode;
    } else {
      appConfig.defaultMode = baseline.defaultMode;
    }
    if (baseline.forceSimpleMode) {
      appConfig.forceSimpleMode = true;
    } else {
      delete appConfig.forceSimpleMode;
    }
  }
  simpleFallbackRuntime.attempted = false;
  simpleFallbackRuntime.lastReason = null;
  simpleFallbackRuntime.lastError = null;
  simpleFallbackAttempted = false;
  simpleFallbackLastReason = null;
  simpleFallbackLastError = null;
  const toggleState = getSimpleModeToggleState();
  if (toggleState.status) {
    toggleState.status.hidden = true;
    toggleState.status.textContent = '';
  }
  if (toggleState.control) {
    toggleState.control.checked = Boolean(appConfig?.forceSimpleMode);
    if (toggleState.control.dataset) {
      delete toggleState.control.dataset.simpleModeForced;
    }
  }
}

function updateSimpleModeToggle({ active, reason, source }) {
  const toggleState = getSimpleModeToggleState();
  const control = toggleState.control;
  const status = toggleState.status;
  if (control) {
    control.checked = Boolean(active);
    control.dataset = control.dataset || {};
    if (active) {
      control.dataset.simpleModeForced = 'true';
    } else {
      delete control.dataset.simpleModeForced;
    }
  }
  if (!status) {
    return;
  }
  if (!active) {
    status.hidden = true;
    status.textContent = '';
    return;
  }
  const reasonLabel = typeof reason === 'string' && reason.trim().length ? reason.trim() : 'renderer fallback';
  const sourceLabel = typeof source === 'string' && source.trim().length ? source.trim() : 'system';
  status.hidden = false;
  status.textContent = `Sandbox mode active (${reasonLabel}; source: ${sourceLabel}).`;
}

function applyRendererReadyState(mode, options = {}) {
  const helpers = getSimpleModeHelperStore();
  setRendererModeIndicator(mode);
  const doc = helpers.getRendererDocument();
  if (!doc) {
    return;
  }
  const body = doc.body ?? null;
  if (!body) {
    return;
  }
  body.dataset = body.dataset || {};
  body.dataset.rendererReady = options?.ready ? 'true' : 'false';
}

const DEFAULT_RENDERER_START_TIMEOUT_MS = 20000;
const DEFAULT_RENDERER_RECOVERY_TIMEOUT_MS = 60000;
function ensureSimpleModeUrl(scope = getSimpleModeHelperStore().getScope()) {
  if (!scope) {
    return 'noop';
  }
  const location = scope.location ?? null;
  if (!location) {
    return 'noop';
  }
  const current = typeof location.href === 'string' ? location.href : '';
  const next = ensureSimpleModeQueryParam(current, { mode: 'simple' });
  if (next === current) {
    return 'noop';
  }
  if (scope.history && typeof scope.history.replaceState === 'function') {
    try {
      scope.history.replaceState(scope.history.state, '', next);
      return 'history';
    } catch (error) {
      // fall through to location.replace
    }
  }
  if (typeof location.replace === 'function') {
    location.replace(next);
    return 'navigation';
  }
  location.href = next;
  return 'navigation';
}

function ensureSimpleRendererModule(scope, context) {
  if (typeof scope?.ensureRendererModule === 'function') {
    try {
      return scope.ensureRendererModule('simple', context);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return null;
}

function activateMissionBriefingFallback(options = {}) {
  const helpers = getSimpleModeHelperStore();
  const scope = helpers.getScope();
  const doc = helpers.getDocument();
  setRendererModeIndicator('briefing');
  const briefing = doc?.getElementById?.('gameBriefing') ?? null;
  const content = briefing?.querySelector?.('.game-briefing__content') ?? briefing ?? null;
  if (briefing) {
    briefing.hidden = false;
    briefing.classList?.add?.('is-visible');
  }
  if (content) {
    let notice = doc?.getElementById?.('gameBriefingFallbackNotice') ?? null;
    if (!notice && doc?.createElement) {
      notice = doc.createElement('p');
      notice.id = 'gameBriefingFallbackNotice';
      notice.className = 'game-briefing__notice';
      content.appendChild(notice);
    }
    if (notice) {
      notice.textContent =
        options.notice ?? 'Renderer systems are offline. Mission briefing mode is available with a text-only experience so the expedition can continue.';
    }
  }
  const startButton = doc?.getElementById?.('startButton') ?? null;
  if (startButton) {
    startButton.disabled = true;
    startButton.dataset = startButton.dataset || {};
    startButton.dataset.fallbackMode = 'briefing';
  }
  const canvas = doc?.getElementById?.('gameCanvas') ?? null;
  if (canvas && canvas.style) {
    canvas.style.display = 'none';
  }
  const dismissButton = doc?.getElementById?.('dismissBriefing') ?? null;
  if (dismissButton) {
    try {
      dismissButton.addEventListener?.('click', () => {});
    } catch (error) {
      // ignore synthetic environment limitations
    }
    dismissButton.dataset = dismissButton.dataset || {};
    dismissButton.dataset.lowFidelityBound = 'true';
  }
  const overlay = scope?.bootstrapOverlay ?? null;
  overlay?.showLoading?.({
    title: 'Mission briefing mode',
    message:
      options.message ?? 'Renderer unavailable. Switching to mission briefing mode so the expedition can continue.',
  });
  overlay?.setDiagnostic?.('renderer', {
    status: 'error',
    message:
      options.diagnosticMessage ?? 'Mission briefing mode active — renderer unavailable. Follow the text briefing to continue.',
  });
  scope.__MISSION_BRIEFING_FALLBACK_AVAILABLE__ = true;
  scope.__MISSION_BRIEFING_FALLBACK_ACTIVE__ = true;
  scope.__MISSION_BRIEFING_FALLBACK_REASON__ = options.reason ?? 'renderer-failure';
  return true;
}

function offerMissionBriefingFallback(options = {}) {
  const scope = getSimpleModeHelperStore().getScope();
  const overlay = scope?.bootstrapOverlay ?? null;
  if (!overlay || typeof overlay.setRecoveryAction !== 'function') {
    return activateMissionBriefingFallback({ ...options, source: options.source ?? 'implicit-offer' });
  }
  const recoveryConfig = {
    action: 'open-mission-briefing',
    label: 'Open Mission Briefing Mode',
    description:
      options.description ??
      'Switch to the text-only mission briefing so the expedition can continue without the renderer.',
    onSelect: () => {
      activateMissionBriefingFallback({ ...options, source: 'recovery-action' });
      overlay.hide?.({ force: true });
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
}

function showMissionBriefingFallback(scope, options = {}) {
  const message =
    'Renderer systems are offline — mission briefing mode is available with a text-only experience so the expedition can continue.';
  const diagnosticMessage =
    'Mission briefing mode activated — renderer unavailable. Follow the text briefing to continue the expedition.';
  const overlay = scope?.bootstrapOverlay ?? null;
  overlay?.showError?.({
    title: 'Renderer unavailable',
    message,
    detail: { reason: options.reason ?? 'simple-unavailable' },
  });
  overlay?.setDiagnostic?.('renderer', { status: 'error', message: diagnosticMessage });
  overlay?.setRecoveryAction?.({
    action: 'open-mission-briefing',
    label: 'Open Mission Briefing Mode',
    onSelect: () => {
      activateMissionBriefingFallback({ ...options, source: 'recovery-action' });
    },
  });
  return activateMissionBriefingFallback({ ...options, notice: message, diagnosticMessage });
}

function tryStartSimpleFallback(error, options = {}) {
  const helpers = getSimpleModeHelperStore();
  const scope = helpers.getScope();
  if (!scope) {
    return false;
  }
  const simpleFactory = scope.SimpleExperience?.create ?? null;
  if (typeof simpleFactory !== 'function') {
    showMissionBriefingFallback(scope, options);
    return false;
  }
  if (!scope.bootstrap || typeof scope.bootstrap !== 'function') {
    showMissionBriefingFallback(scope, options);
    return false;
  }
  const state = simpleFallbackRuntime;
  if (state.attempted && !options.allowRetry) {
    return false;
  }
  state.attempted = true;
  state.lastReason = options.reason ?? 'renderer-failure';
  state.lastError = error ?? null;
  simpleFallbackAttempted = true;
  simpleFallbackLastReason = state.lastReason;
  simpleFallbackLastError = state.lastError;

  const appConfig = helpers.getAppConfig();
  rememberSimpleModeBaseline(appConfig);
  const fallbackOptions = {
    noticeKey: 'forced-simple-mode',
    noticeMessage: resolveSimpleRendererNoticeMessage('forced-simple-mode'),
    showLoadingMessage: 'Switching to sandbox mode while we recover the renderer.',
    diagnosticMessage: 'sandbox renderer active — renderer fallback engaged.',
    diagnosticStatus: 'warning',
  };
  if (state.lastReason === 'renderer-timeout') {
    fallbackOptions.showLoadingMessage = 'Renderer start timed out — enabling simplified safe mode.';
    fallbackOptions.diagnosticMessage = 'Renderer start timed out — simplified safe mode active.';
  }
  applySimpleModeFallback('simple-fallback', fallbackOptions);
  ensureSimpleModeConfig(appConfig, 'simple-fallback');
  updateSimpleModeToggle({ active: true, reason: state.lastReason, source: options.source ?? 'fallback' });
  const urlChange = ensureSimpleModeUrl(scope);
  const rendererDoc = helpers.getRendererDocument();
  const rendererBody = rendererDoc?.body ?? null;
  if (rendererBody) {
    rendererBody.dataset = rendererBody.dataset || {};
    rendererBody.dataset.rendererReady = 'false';
  }

  const ensureContext = {
    mode: 'simple',
    reason: options.reason ?? 'renderer-failure',
    source: options.source ?? 'fallback',
  };
  const bootstrapSimple = () => {
    if (urlChange === 'navigation') {
      return;
    }
    try {
      scope.bootstrap({ mode: 'simple', reason: state.lastReason });
    } catch (bootstrapError) {
      scope.console?.error?.('Failed to bootstrap simple renderer.', bootstrapError);
    }
  };

  const ensureResult = ensureSimpleRendererModule(scope, ensureContext);
  if (ensureResult && typeof ensureResult.then === 'function') {
    ensureResult.then(
      () => {
        bootstrapSimple();
      },
      (moduleError) => {
        scope.console?.warn?.('Simple renderer module ensure failed.', moduleError);
        bootstrapSimple();
      },
    );
  } else {
    bootstrapSimple();
  }

  return true;
}

const ERROR_BOUNDARY_DEFAULTS = {
  title: 'Renderer unavailable',
  message: 'Renderer encountered a critical error and must recover.',
  diagnosticScope: 'renderer',
  diagnosticStatus: 'error',
};

const errorBoundaryState = { handled: false, lastContext: null };

function normaliseBoundaryDetail(detail = {}) {
  const output = { ...detail };
  if (!output.stage && output.boundary) {
    output.stage = output.boundary;
  }
  return output;
}

function handleErrorBoundary(error, options = {}) {
  errorBoundaryState.handled = false;
  const detail = normaliseBoundaryDetail({ ...options.detail, boundary: options.boundary });
  const boundary = typeof options.boundary === 'string' ? options.boundary : 'runtime';
  const reason = typeof detail.reason === 'string' && detail.reason.trim() ? detail.reason.trim() : 'renderer-failure';
  const stageLabel = typeof detail.stage === 'string' && detail.stage.trim() ? detail.stage.trim() : boundary;
  const stage = stageLabel === 'init' ? boundary : stageLabel;

  const overlayPayload = {
    title: options.title ?? ERROR_BOUNDARY_DEFAULTS.title,
    message: options.message ?? ERROR_BOUNDARY_DEFAULTS.message,
    diagnosticScope: detail.scope ?? ERROR_BOUNDARY_DEFAULTS.diagnosticScope,
    diagnosticStatus: detail.status ?? ERROR_BOUNDARY_DEFAULTS.diagnosticStatus,
    detail: {
      boundary,
      stage,
      reason,
      trace: detail.trace ?? null,
      asset: formatAssetLogLabel(boundary, detail),
    },
  };

  try {
    presentCriticalErrorOverlay?.(overlayPayload);
  } catch (overlayError) {
    globalScope?.console?.warn?.('Failed to present error overlay.', overlayError);
  }

  const mode = typeof resolveRendererModeForFallback === 'function'
    ? resolveRendererModeForFallback({ error, boundary, detail }) || 'advanced'
    : 'advanced';

  const context = {
    reason,
    boundary,
    stage,
    mode,
    source: 'error-boundary',
    detail,
  };
  errorBoundaryState.lastContext = context;

  if (mode === 'simple') {
    errorBoundaryState.handled = true;
    return true;
  }

  let simpleResult = false;
  try {
    simpleResult = tryStartSimpleFallback?.(error, context) === true;
  } catch (fallbackError) {
    globalScope?.console?.warn?.('Simple fallback activation failed.', fallbackError);
    simpleResult = false;
  }

  if (simpleResult) {
    errorBoundaryState.handled = true;
    return true;
  }

  const missionOptions = {
    reason: `${reason}-mission-briefing`,
    context,
    detail,
    error,
    diagnosticMessage: 'Mission briefing text mode available — renderer recovery required.',
    notice:
      'Renderer recovery failed. Switch to mission briefing text mode for a text-based experience while we stabilise the renderer.',
  };

  try {
    const offered = offerMissionBriefingFallback?.(missionOptions);
    errorBoundaryState.handled = Boolean(offered);
    return errorBoundaryState.handled;
  } catch (missionError) {
    globalScope?.console?.warn?.('Mission briefing fallback failed to activate.', missionError);
    errorBoundaryState.handled = false;
    return false;
  }
}

function wasErrorHandledByBoundary() {
  return Boolean(errorBoundaryState.handled);
}

const formatAssetLogLabel = (boundary, detail = {}) => {
  const boundaryLabel = typeof boundary === 'string' && boundary.trim() ? boundary.trim() : 'runtime';
  const stage = typeof detail.stage === 'string' && detail.stage.trim() ? detail.stage.trim() : boundaryLabel;
  const reason = typeof detail.reason === 'string' && detail.reason.trim() ? detail.reason.trim() : 'unknown';
  return `${boundaryLabel}:${stage}:${reason}`;
};
// function formatAssetLogLabel sentinel

function scheduleRendererStartWatchdog(input = {}) {
  const config =
    typeof input === 'string'
      ? { mode: input }
      : input && typeof input === 'object'
        ? input
        : {};
  const { mode = 'simple', timeoutMs = DEFAULT_RENDERER_START_TIMEOUT_MS, onTimeout } = config;
  const scope = getSimpleModeHelperStore().getScope();
  if (!scope || typeof scope.setTimeout !== 'function') {
    return null;
  }
  cancelRendererStartWatchdog();
  const timeout = Number(timeoutMs);
  const duration = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_RENDERER_START_TIMEOUT_MS;
  const resolvedOnTimeout =
    typeof onTimeout === 'function'
      ? onTimeout
      : ({ mode: triggeredMode }) => {
          const fallbackMode = triggeredMode || mode || 'advanced';
          const detail = {
            reason: 'renderer-timeout',
            mode: fallbackMode,
            timeoutMs: duration,
          };
          scope.console?.warn?.('Renderer start watchdog enabling safe mode.', { detail });
          scope.console?.warn?.('Switching to simplified renderer after start timeout.', detail);
          const logDiagnostics =
            typeof scope.logDiagnosticsEvent === 'function'
              ? scope.logDiagnosticsEvent
              : typeof globalThis !== 'undefined' && typeof globalThis.logDiagnosticsEvent === 'function'
                ? globalThis.logDiagnosticsEvent
                : null;
          if (typeof logDiagnostics === 'function') {
            try {
              logDiagnostics('startup', `Advanced renderer start timed out after ${detail.timeoutMs}ms.`, {
                detail,
              });
              logDiagnostics('startup', 'Switching to simplified safe mode after renderer timeout.', { detail });
            } catch (error) {
              scope.console?.warn?.('Renderer watchdog diagnostics logging failed.', error);
            }
          }
          const fallbackError = new Error('Renderer start watchdog timeout');
          fallbackError.name = 'RendererStartTimeoutError';
          cancelRendererStartWatchdog();
          const fallbackStarted = tryStartSimpleFallback(fallbackError, {
            reason: 'renderer-timeout',
            mode: fallbackMode,
            source: 'watchdog-timeout',
            detail,
            allowRetry: true,
          });
          if (!fallbackStarted) {
            offerMissionBriefingFallback({
              reason: 'renderer-timeout-mission-briefing',
              source: 'watchdog-timeout',
              context: detail,
              notice: 'Renderer start timed out. Mission briefing mode is available as a fallback.',
              diagnosticMessage: 'Renderer start timed out — activating mission briefing mode.',
            });
          }
        };
  const handle = scope.setTimeout(() => {
    simpleFallbackRuntime.watchdog.handle = null;
    if (typeof simpleFallbackRuntime.watchdog.onTimeout === 'function') {
      try {
        simpleFallbackRuntime.watchdog.onTimeout({ mode });
      } catch (error) {
        scope.console?.warn?.('Renderer watchdog callback failed.', error);
      }
    }
  }, duration);
  simpleFallbackRuntime.watchdog = {
    handle,
    mode,
    timeoutMs: duration,
    startedAt: Date.now(),
    onTimeout: resolvedOnTimeout,
  };
  return handle;
}

function cancelRendererStartWatchdog() {
  const scope = getSimpleModeHelperStore().getScope();
  const handle = simpleFallbackRuntime.watchdog.handle;
  if (handle && typeof scope?.clearTimeout === 'function') {
    scope.clearTimeout(handle);
  }
  simpleFallbackRuntime.watchdog.handle = null;
  simpleFallbackRuntime.watchdog.mode = null;
  simpleFallbackRuntime.watchdog.timeoutMs = null;
  simpleFallbackRuntime.watchdog.startedAt = null;
  simpleFallbackRuntime.watchdog.onTimeout = null;
}

function getRendererStartWatchdogState() {
  const state = simpleFallbackRuntime.watchdog;
  return {
    handle: state.handle,
    mode: state.mode,
    timeoutMs: state.timeoutMs,
    startedAt: state.startedAt,
  };
}

function createScoreboardUtilsFallback() {
  return {
    setOfflineMessage(scope, message) {
      setScoreboardOffline(scope ?? ensureRendererHelpers().getScope(), message ?? 'Offline session active.');
    },
  };
}

const fallbackScopeForEvents = getSimpleModeHelperStore().getScope();
if (fallbackScopeForEvents && typeof fallbackScopeForEvents.addEventListener === 'function') {
  const safeStart = (event, type) => {
    const detail = event?.detail ?? {};
    const reason = detail.reason ?? `${type}-failure`;
    const mode = detail.mode ?? 'advanced';
    const fallbackError = detail.error instanceof Error ? detail.error : new Error(reason);
    tryStartSimpleFallback(fallbackError, {
      reason,
      mode,
      source: `event:${type}`,
    });
  };
  fallbackScopeForEvents.addEventListener('infinite-rails:start-error', (event) => safeStart(event, 'start-error'));
  fallbackScopeForEvents.addEventListener('infinite-rails:initialisation-error', (event) => safeStart(event, 'initialisation-error'));
}

const simpleFallbackHooks = (() => {
  const scope = ensureRendererHelpers().getScope();
  if (!scope) {
    return null;
  }
  return scope.__INFINITE_RAILS_TEST_HOOKS__ || (scope.__INFINITE_RAILS_TEST_HOOKS__ = {});
})();
if (simpleFallbackHooks) {
  simpleFallbackHooks.getSimpleFallbackState = () => ({
    attempted: simpleFallbackRuntime.attempted,
    lastReason: simpleFallbackRuntime.lastReason,
    watchdog: getRendererStartWatchdogState(),
  });
  simpleFallbackHooks.triggerSimpleFallback = (reason = 'manual-test') =>
    tryStartSimpleFallback(new Error(reason), { reason, source: 'test-hook', allowRetry: true });
}


const manifestDiagnosticsScope = rendererModeScope ?? (typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

const MANIFEST_MISSING_LABEL = 'Manifest check missing assets';
const MANIFEST_RELOAD_MESSAGE = 'Manifest integrity mismatch detected. Reloading to restore asset bundle.';

function getManifestDiagnosticsUi(scope) {
  const doc = scope?.document ?? null;
  if (!doc) {
    return null;
  }
  const list = doc.getElementById?.('bootDiagnosticsAssetsList') ?? null;
  const status = doc.getElementById?.('bootDiagnosticsAssetsStatus') ?? null;
  return { list, status };
}

function renderManifestDiagnostics(scope, missing = []) {
  const ui = getManifestDiagnosticsUi(scope);
  if (!ui) {
    return;
  }
  const { list, status } = ui;
  if (status) {
    status.textContent = missing.length === 0 ? 'All manifest assets reachable.' : `${MANIFEST_MISSING_LABEL} (${missing.length})`;
  }
  if (!list) {
    return;
  }
  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }
  if (missing.length === 0) {
    const item = scope?.document?.createElement?.('li');
    if (item) {
      item.textContent = `${MANIFEST_MISSING_LABEL}: none`;
      list.appendChild(item);
    }
    return;
  }
  missing.forEach((asset) => {
    const item = scope?.document?.createElement?.('li');
    if (item) {
      item.textContent = `${asset.path || asset.url || 'unknown asset'} — ${asset.reason ?? 'unreachable'}`;
      list.appendChild(item);
    }
  });
}

async function fetchWithTimeout(resource, options = {}) {
  const scope = manifestDiagnosticsScope;
  const controller = typeof scope?.AbortController === 'function' ? new scope.AbortController() : null;
  const timeout = Number(options.timeout ?? 5000);
  const init = { ...options };
  if (controller) {
    init.signal = controller.signal;
  }
  let timeoutHandle = null;
  if (controller && Number.isFinite(timeout) && timeout > 0 && typeof scope?.setTimeout === 'function') {
    timeoutHandle = scope.setTimeout(() => {
      try {
        controller.abort();
      } catch (error) {
        // ignore abort errors
      }
    }, timeout);
  }
  try {
    return await (scope?.fetch ?? fetch)(resource, init);
  } finally {
    if (timeoutHandle && typeof scope?.clearTimeout === 'function') {
      scope.clearTimeout(timeoutHandle);
    }
  }
}

async function probeManifestAsset(scope, asset) {
  const url = typeof asset?.url === 'string' && asset.url ? asset.url : null;
  if (!url) {
    return { ok: false, reason: 'missing-url' };
  }
  try {
    const response = await fetchWithTimeout(asset.url, {
      method: 'HEAD',
      cache: 'no-cache',
      credentials: 'include',
    });
    if (!response || typeof response.ok !== 'boolean') {
      return { ok: false, reason: 'invalid-response' };
    }
    if (!response.ok) {
      return { ok: false, reason: `status-${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.name ?? 'network-error' };
  }
}

async function startManifestIntegrityVerification({ source = 'manual', scope = manifestDiagnosticsScope } = {}) {
  if (!scope) {
    return { ok: false, reason: 'no-scope' };
  }
  const manifest = scope.__INFINITE_RAILS_ASSET_MANIFEST__ ?? scope.ASSET_MANIFEST ?? null;
  const records = Array.isArray(manifest?.assets) ? manifest.assets : [];
  if (records.length === 0) {
    renderManifestDiagnostics(scope, []);
    scope.console?.warn?.('Manifest check missing — no assets defined.');
    return { ok: false, reason: 'manifest-empty' };
  }
  const results = await Promise.all(
    records.map(async (asset) => {
      const outcome = await probeManifestAsset(scope, asset);
      return { asset, outcome };
    }),
  );
  const missing = results
    .filter((entry) => !entry.outcome.ok)
    .map((entry) => ({ path: entry.asset.path ?? entry.asset.url, reason: entry.outcome.reason }));
  renderManifestDiagnostics(scope, missing);

  if (manifest?.integrity && manifest?.computedIntegrity && manifest.integrity !== manifest.computedIntegrity) {
    scope.console?.error?.(MANIFEST_RELOAD_MESSAGE, { expected: manifest.integrity, computed: manifest.computedIntegrity });
    if (typeof scope?.location?.reload === 'function') {
      scope.location.reload();
    }
    return { ok: false, reason: 'integrity-mismatch', reloaded: true };
  }

  if (missing.length > 0) {
    scope.console?.warn?.('Manifest diagnostics detected missing assets.', { source, missing });
    return { ok: false, reason: 'missing-assets', missing };
  }

  scope.console?.info?.('Manifest asset availability verified.', { source });
  return { ok: true, reason: 'ok' };
}

(async () => {
  const scope = manifestDiagnosticsScope;
  if (!scope || scope.__INFINITE_RAILS_MANIFEST_VERIFIED__) {
    return;
  }
  scope.__INFINITE_RAILS_MANIFEST_VERIFIED__ = true;
  try {
    await startManifestIntegrityVerification({ source: 'bootstrap', scope });
  } catch (error) {
    scope.console?.error?.('Manifest verification failed during bootstrap.', error);
  }
})();


(function setupPerformanceMetricsSampler(globalScope) {
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

  const appConfig = scope.APP_CONFIG || (scope.APP_CONFIG = {});
  if ((appConfig.environment || '').toLowerCase() !== 'development') {
    return;
  }
  if (typeof appConfig.diagnosticsEndpoint !== 'string' || !appConfig.diagnosticsEndpoint.trim()) {
    return;
  }

  const performanceRef = scope.performance ?? { now: () => Date.now() };
  const consoleRef = scope.console ?? console;
  const navigatorRef = scope.navigator ?? {};

  const state = {
    active: false,
    bootStartedAt: performanceRef.now(),
    intervalHandle: null,
    fpsSamples: [],
    inputLatency: [],
    worldSamples: [],
    lastWorldSnapshot: null,
    attachedExperience: null,
    sampleCount: 0,
  };

  function computeAverage(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return 0;
    }
    const sum = values.reduce((total, value) => total + Number(value || 0), 0);
    return sum / values.length;
  }

  function snapshotWorldMetrics(experience) {
    const columns = experience?.columns instanceof Map ? experience.columns.size : 0;
    let voxels = 0;
    if (experience?.columns instanceof Map) {
      for (const [, column] of experience.columns.entries()) {
        if (Array.isArray(column)) {
          voxels += column.length;
        }
      }
    }
    return { columns, voxels, timestamp: performanceRef.now() };
  }

  function recordWorldMetrics(experience) {
    const current = snapshotWorldMetrics(experience);
    if (state.lastWorldSnapshot) {
      const elapsed = Math.max(1, current.timestamp - state.lastWorldSnapshot.timestamp);
      const columnsDelta = Math.max(0, current.columns - state.lastWorldSnapshot.columns);
      const voxelsDelta = Math.max(0, current.voxels - state.lastWorldSnapshot.voxels);
      const columnsPerSecond = (columnsDelta * 1000) / elapsed;
      const voxelsPerSecond = (voxelsDelta * 1000) / elapsed;
      state.worldSamples.push({ columnsPerSecond, voxelsPerSecond });
    }
    state.lastWorldSnapshot = current;
  }

  function recordFps(metrics) {
    if (metrics && typeof metrics.fps === 'number') {
      state.fpsSamples.push(metrics.fps);
    }
  }

  function recordInputLatency(latencyMs) {
    if (Number.isFinite(latencyMs) && latencyMs >= 0) {
      state.inputLatency.push(latencyMs);
    }
  }

  function buildSummary() {
    const fpsAverage = computeAverage(state.fpsSamples);
    const inputAverage = computeAverage(state.inputLatency);
    const worldAverage = state.worldSamples.length
      ? state.worldSamples[state.worldSamples.length - 1]
      : { columnsPerSecond: 0, voxelsPerSecond: 0 };
    return `Performance metrics — boot=${Math.round(performanceRef.now() - state.bootStartedAt)}ms; fps=${fpsAverage.toFixed(
      1,
    )}; world=${Math.max(worldAverage.columnsPerSecond, worldAverage.voxelsPerSecond).toFixed(1)}; input=${inputAverage.toFixed(
      1,
    )}ms`;
  }

  function flushMetrics() {
    if (!state.attachedExperience || state.fpsSamples.length === 0) {
      return;
    }
    const summary = buildSummary();
    consoleRef.info?.(summary);
    const world = state.worldSamples.length
      ? state.worldSamples[state.worldSamples.length - 1]
      : { columnsPerSecond: 0, voxelsPerSecond: 0 };
    const payload = {
      scope: 'performance',
      detail: {
        analytics: 'performance',
        summary,
        metrics: {
          fps: {
            sampleCount: state.fpsSamples.length,
            average: computeAverage(state.fpsSamples),
          },
          worldGeneration: {
            columnsPerSecond: world.columnsPerSecond,
            voxelsPerSecond: world.voxelsPerSecond,
          },
          inputLatency: {
            sampleCount: state.inputLatency.length,
            averageMs: computeAverage(state.inputLatency),
          },
        },
      },
    };
    try {
      const endpoint = appConfig.diagnosticsEndpoint;
      if (typeof navigatorRef.sendBeacon === 'function') {
        navigatorRef.sendBeacon(endpoint, JSON.stringify(payload));
      } else if (typeof scope.fetch === 'function') {
        scope.fetch(endpoint, { method: 'POST', body: JSON.stringify(payload), keepalive: true });
      }
    } catch (error) {
      consoleRef.warn?.('Failed to submit performance diagnostics.', error);
    }
  }

  function sampleMetrics() {
    const experience = scope.__INFINITE_RAILS_ACTIVE_EXPERIENCE__ ?? null;
    if (!experience) {
      return;
    }
    state.attachedExperience = experience;
    if (!experience.__performanceSamplerAttached) {
      experience.__performanceSamplerAttached = true;
    }
    let metrics = null;
    try {
      metrics = typeof experience.getDeveloperMetrics === 'function' ? experience.getDeveloperMetrics() : null;
    } catch (error) {
      consoleRef.warn?.('getDeveloperMetrics failed.', error);
    }
    if (metrics) {
      recordFps(metrics);
    }
    recordWorldMetrics(experience);
    state.sampleCount += 1;
    if (state.sampleCount >= 3) {
      flushMetrics();
    }
  }

  function ensureSamplingInterval() {
    if (state.intervalHandle || typeof scope.setInterval !== 'function') {
      return;
    }
    state.intervalHandle = scope.setInterval(sampleMetrics, 1000);
  }

  function handlePointerDown(event) {
    if (state.active) {
      const latency = performanceRef.now() - Number(event?.timeStamp ?? 0);
      recordInputLatency(latency);
      return;
    }
    state.active = true;
    ensureSamplingInterval();
    const latency = performanceRef.now() - Number(event?.timeStamp ?? 0);
    recordInputLatency(latency);
    sampleMetrics();
  }

  if (typeof scope.addEventListener === 'function') {
    scope.addEventListener('pointerdown', handlePointerDown, { passive: true });
  }

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ || (scope.__INFINITE_RAILS_TEST_HOOKS__ = {});
  hooks.getPerformanceSamplerState = () => ({
    active: state.active,
    sampleCount: state.sampleCount,
    fpsSamples: state.fpsSamples.slice(),
    inputLatency: state.inputLatency.slice(),
  });
})(typeof window !== 'undefined' ? window : undefined);


(function setupInactivityMonitor(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  const documentRef = scope?.document ?? null;
  if (!scope || !documentRef) {
    return;
  }

  scope.InfiniteRails = scope.InfiniteRails || {};
  scope.InfiniteRails.renderers = scope.InfiniteRails.renderers || {};
  if (typeof scope.InfiniteRails.renderers.reloadActive !== 'function') {
    scope.InfiniteRails.renderers.reloadActive = () => Promise.resolve(undefined);
  }

  const state = {
    idleThresholdMs: 120000,
    refreshCountdownMs: 15000,
    checkIntervalMs: 1000,
    lastActivityAt: Date.now(),
    promptVisible: false,
    countdownExpiresAt: null,
    countdownHandle: null,
    checkHandle: null,
  };

  let overlayElements = null;

  const getOverlayElements = () => {
    if (overlayElements) {
      return overlayElements;
    }
    const overlay = documentRef.getElementById?.('inactivityOverlay') ?? null;
    const countdown = documentRef.getElementById?.('inactivityOverlayCountdown') ?? null;
    const stayButton = documentRef.getElementById?.('inactivityStayButton') ?? null;
    const refreshButton = documentRef.getElementById?.('inactivityRefreshButton') ?? null;
    overlayElements = { overlay, countdown, stayButton, refreshButton };
    return overlayElements;
  };

  const resetCheckTimer = () => {
    if (state.checkHandle && typeof scope.clearTimeout === 'function') {
      scope.clearTimeout(state.checkHandle);
    }
    state.checkHandle = null;
  };

  const resetCountdownTimer = () => {
    if (state.countdownHandle && typeof scope.clearTimeout === 'function') {
      scope.clearTimeout(state.countdownHandle);
    }
    state.countdownHandle = null;
  };

  const ensureOverlay = () => {
    const elements = getOverlayElements();
    const overlay = elements.overlay;
    if (!overlay) {
      return null;
    }
    overlay.hidden = true;
    overlay.setAttribute?.('hidden', '');
    overlay.setAttribute?.('data-mode', 'idle');
    const stayButton = elements.stayButton;
    if (stayButton && !stayButton.__inactivityBound) {
      stayButton.addEventListener('click', (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        hidePrompt({ resetActivity: true });
        scheduleIdleCheck();
      });
      stayButton.__inactivityBound = true;
    }
    return elements;
  };

  const updateCountdownDisplay = (remainingMs) => {
    const elements = getOverlayElements();
    const countdown = elements?.countdown;
    if (!countdown) {
      return;
    }
    const seconds = Math.max(0, Math.ceil(Number(remainingMs) / 1000));
    countdown.textContent = String(seconds);
  };

  const hidePrompt = ({ resetActivity = false } = {}) => {
    const elements = ensureOverlay();
    const overlay = elements?.overlay;
    resetCountdownTimer();
    state.promptVisible = false;
    state.countdownExpiresAt = null;
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute?.('hidden', '');
      overlay.setAttribute?.('data-mode', 'idle');
    }
    documentRef.body?.classList?.remove?.('hud-inactive');
    if (resetActivity) {
      state.lastActivityAt = Date.now();
    }
  };

  const triggerRendererRefresh = () => {
    const renderer = scope.InfiniteRails?.renderers ?? null;
    if (renderer && typeof renderer.reloadActive === 'function') {
      try {
        renderer.reloadActive({ reason: 'inactivity-countdown' });
      } catch (error) {
        // ignore renderer errors during fallback reloads
      }
    }
    hidePrompt({ resetActivity: true });
  };

  const tickCountdown = () => {
    if (!state.promptVisible || typeof state.countdownExpiresAt !== 'number') {
      return;
    }
    const remaining = state.countdownExpiresAt - Date.now();
    if (remaining <= 0) {
      triggerRendererRefresh();
      return;
    }
    updateCountdownDisplay(remaining);
    scheduleCountdownTick();
  };

  const scheduleCountdownTick = () => {
    if (!state.promptVisible || typeof scope.setTimeout !== 'function') {
      resetCountdownTimer();
      return null;
    }
    resetCountdownTimer();
    const remaining = typeof state.countdownExpiresAt === 'number' ? state.countdownExpiresAt - Date.now() : NaN;
    updateCountdownDisplay(remaining);
    if (!(remaining > 0)) {
      tickCountdown();
      return null;
    }
    const delay = Math.min(remaining, 1000);
    state.countdownHandle = scope.setTimeout(() => {
      state.countdownHandle = null;
      tickCountdown();
    }, delay);
    return state.countdownHandle;
  };

  const showPrompt = () => {
    const elements = ensureOverlay();
    const overlay = elements?.overlay;
    if (!overlay) {
      return;
    }
    state.promptVisible = true;
    overlay.hidden = false;
    overlay.removeAttribute?.('hidden');
    overlay.setAttribute?.('data-mode', 'prompt');
    documentRef.body?.classList?.add?.('hud-inactive');
    state.countdownExpiresAt = Date.now() + state.refreshCountdownMs;
    scheduleCountdownTick();
  };

  const runIdleCheck = () => {
    const now = Date.now();
    const idleDuration = now - state.lastActivityAt;
    if (idleDuration >= state.idleThresholdMs) {
      if (!state.promptVisible) {
        showPrompt();
      } else if (typeof state.countdownExpiresAt !== 'number') {
        state.countdownExpiresAt = now + state.refreshCountdownMs;
        scheduleCountdownTick();
      }
    }
  };

  const scheduleIdleCheck = () => {
    if (typeof scope.setTimeout !== 'function') {
      return null;
    }
    resetCheckTimer();
    const interval = Number.isFinite(state.checkIntervalMs) && state.checkIntervalMs > 0 ? state.checkIntervalMs : 1000;
    state.checkIntervalMs = interval;
    state.checkHandle = scope.setTimeout(() => {
      state.checkHandle = null;
      runIdleCheck();
      scheduleIdleCheck();
    }, interval);
    return state.checkHandle;
  };

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.setupInactivityOverlay = () => Boolean(ensureOverlay()?.overlay);
  hooks.configureInactivityMonitor = (options = {}) => {
    if (options && typeof options === 'object') {
      const idleValue = Number(options.idleThresholdMs);
      if (Number.isFinite(idleValue) && idleValue > 0) {
        state.idleThresholdMs = idleValue;
      }
      const refreshValue = Number(options.refreshCountdownMs);
      if (Number.isFinite(refreshValue) && refreshValue > 0) {
        state.refreshCountdownMs = refreshValue;
      }
      const intervalValue = Number(options.checkIntervalMs);
      if (Number.isFinite(intervalValue) && intervalValue > 0) {
        state.checkIntervalMs = intervalValue;
      }
    }
    state.lastActivityAt = Date.now();
    scheduleIdleCheck();
  };
  hooks.getInactivityMonitorState = () => cloneDeep(state);
  hooks.setInactivityLastActivity = (timestamp) => {
    const value = Number(timestamp);
    state.lastActivityAt = Number.isFinite(value) ? value : Date.now();
    if (state.promptVisible) {
      hidePrompt();
    }
    scheduleIdleCheck();
  };
  hooks.setInactivityCountdownExpiresAt = (timestamp) => {
    const value = Number(timestamp);
    state.countdownExpiresAt = Number.isFinite(value) ? value : Date.now();
    if (state.promptVisible) {
      scheduleCountdownTick();
    }
  };
  hooks.dismissInactivityPrompt = () => hidePrompt({ resetActivity: true });
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;
})(typeof window !== 'undefined' ? window : undefined);

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

const PRODUCTION_ASSET_ROOT = ensureTrailingSlash('/');
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

const DIAGNOSTICS_CRITICAL_LEVELS = new Set(['error', 'fatal']);
const DIAGNOSTICS_OVERLAY_THROTTLE_MS = 2000;
const DIAGNOSTICS_EVENT_HISTORY_LIMIT = 50;

function getDiagnosticsStateContainer(scope = typeof globalScope !== 'undefined' ? globalScope : typeof globalThis !== 'undefined' ? globalThis : undefined) {
  const target = scope ?? null;
  const fallbackStore = getDiagnosticsStateContainer.__fallbackStore ||
    (getDiagnosticsStateContainer.__fallbackStore = { logBuffer: [], lastOverlayKey: null, lastOverlayAt: 0 });
  if (!target) {
    return fallbackStore;
  }
  const existing = target.__INFINITE_RAILS_DIAGNOSTICS_STATE__;
  if (existing && typeof existing === 'object') {
    if (!Array.isArray(existing.logBuffer)) {
      existing.logBuffer = [];
    }
    if (typeof existing.lastOverlayKey !== 'string') {
      existing.lastOverlayKey = existing.lastOverlayKey == null ? null : String(existing.lastOverlayKey);
    }
    if (!Number.isFinite(existing.lastOverlayAt)) {
      existing.lastOverlayAt = Number(existing.lastOverlayAt) || 0;
    }
    return existing;
  }
  const created = { logBuffer: [], lastOverlayKey: null, lastOverlayAt: 0 };
  target.__INFINITE_RAILS_DIAGNOSTICS_STATE__ = created;
  return created;
}

function shouldSendDiagnosticsToServer(detail = {}, scope = typeof globalThis !== 'undefined' ? globalThis : undefined) {
  const endpoint =
    (detail && typeof detail.endpoint === 'string' && detail.endpoint.trim()) ||
    scope?.diagnosticsEndpoint ||
    scope?.APP_CONFIG?.diagnosticsEndpoint ||
    null;
  if (!endpoint) {
    return false;
  }
  if (detail?.transient === true) {
    return false;
  }
  return true;
}

function resolveDiagnosticsState(scope =
  typeof globalScope !== 'undefined'
    ? globalScope
    : typeof globalThis !== 'undefined'
      ? globalThis
      : undefined) {
  if (typeof getDiagnosticsStateContainer === 'function') {
    return getDiagnosticsStateContainer(scope);
  }
  const target = scope ?? null;
  const fallback =
    resolveDiagnosticsState.__fallbackStore ||
    (resolveDiagnosticsState.__fallbackStore = { logBuffer: [], lastOverlayKey: null, lastOverlayAt: 0 });
  if (!target) {
    return fallback;
  }
  const existing = target.__INFINITE_RAILS_DIAGNOSTICS_STATE__;
  if (existing && typeof existing === 'object') {
    if (!Array.isArray(existing.logBuffer)) {
      existing.logBuffer = [];
    }
    if (typeof existing.lastOverlayKey !== 'string') {
      existing.lastOverlayKey = existing.lastOverlayKey == null ? null : String(existing.lastOverlayKey);
    }
    if (!Number.isFinite(existing.lastOverlayAt)) {
      existing.lastOverlayAt = Number(existing.lastOverlayAt) || 0;
    }
    return existing;
  }
  const created = { logBuffer: [], lastOverlayKey: null, lastOverlayAt: 0 };
  target.__INFINITE_RAILS_DIAGNOSTICS_STATE__ = created;
  return created;
}

function includesTextureLanguage(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalised = value.toLowerCase();
  return normalised.includes('texture') || normalised.includes('textures');
}

function resolveAssetReloadActionLabel(detail = {}) {
  const candidates = [detail.key, detail.logMessage, detail.source, detail.description];
  if (candidates.some((entry) => includesTextureLanguage(String(entry ?? '')))) {
    return 'Refresh textures';
  }
  return 'Reload assets';
}

function attemptAssetReloadFromDiagnostics(event = {}) {
  const scope =
    (typeof globalScope !== 'undefined' && globalScope) ||
    (typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
  if (!scope) {
    return Promise.resolve(false);
  }

  const detail = event?.detail ?? {};
  const control = event?.control ?? null;
  const logMessage = typeof event?.logMessage === 'string' ? event.logMessage.trim() : '';
  const source = typeof event?.source === 'string' && event.source.trim() ? event.source.trim() : 'diagnostics-overlay';
  if (control && typeof control === 'object') {
    control.disabled = true;
  }

  const keys = Array.isArray(detail.keys)
    ? detail.keys.filter((value) => typeof value === 'string' && value)
    : (() => {
        const rawKey = typeof detail.key === 'string' ? detail.key : '';
        if (!rawKey) {
          return [];
        }
        const segments = rawKey.split(':');
        const last = segments[segments.length - 1];
        return last ? [last] : [rawKey];
      })();

  const payload = {
    source,
    keys,
    baseUrl: typeof detail.baseUrl === 'string' ? detail.baseUrl : null,
    alternateBaseUrls: Array.isArray(detail.alternateBaseUrls)
      ? detail.alternateBaseUrls.filter((entry) => typeof entry === 'string' && entry)
      : [],
  };

  const label = resolveAssetReloadActionLabel({ ...detail, source, logMessage });
  const hudAlertCandidate =
    (typeof event?.showHudAlert === 'function' && event.showHudAlert) ||
    (typeof showHudAlert === 'function' ? showHudAlert : null) ||
    (typeof scope.showHudAlert === 'function' ? scope.showHudAlert : null);
  const hudAlert = typeof hudAlertCandidate === 'function' ? hudAlertCandidate : null;
  if (hudAlert) {
    try {
      hudAlert({ title: label === 'Refresh textures' ? 'Refreshing textures' : label, detail: payload });
    } catch (error) {
      scope.console?.debug?.('HUD alert failed.', error);
    }
  }

  if (typeof logDiagnosticsEvent === 'function') {
    logDiagnosticsEvent('texture-reload', logMessage || 'Diagnostics-triggered asset reload requested.', {
      level: 'info',
      detail: { label, ...payload },
    });
  }

  if (typeof scope.dispatchEvent === 'function') {
    try {
      const EventCtor = scope.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
      const dispatchPayload = new (EventCtor || Object)(
        EventCtor ? 'infinite-rails:asset-reload-request' : undefined,
        EventCtor ? { detail: payload } : undefined,
      );
      if (!EventCtor) {
        dispatchPayload.type = 'infinite-rails:asset-reload-request';
        dispatchPayload.detail = payload;
      }
      scope.dispatchEvent(dispatchPayload);
    } catch (error) {
      scope.console?.warn?.('Failed to dispatch asset reload diagnostics event.', error);
    }
  }

  const refreshTextures = scope.InfiniteRails?.refreshTextures;
  const refreshPromise = typeof refreshTextures === 'function'
    ? Promise.resolve(refreshTextures({ ...payload, logMessage }))
    : Promise.reject(new Error('refreshTextures unavailable'));

  return refreshPromise
    .then((result) => {
      if (hudAlert) {
        try {
          hudAlert({ title: 'Textures refreshed', detail: { ...payload, result } });
        } catch (error) {
          scope.console?.debug?.('HUD alert completion failed.', error);
        }
      }
      return result;
    })
    .catch((error) => {
      scope.console?.warn?.('Diagnostics texture refresh failed.', error);
      if (hudAlert) {
        try {
          hudAlert({
            title: 'Texture refresh failed',
            message: error?.message ?? 'Unable to refresh textures from diagnostics overlay.',
            detail: { ...payload, error },
          });
        } catch (alertError) {
          scope.console?.debug?.('HUD failure notice failed.', alertError);
        }
      }
      if (typeof scope.location?.reload === 'function') {
        scope.location.reload();
      }
      return false;
    })
    .finally(() => {
      if (control && typeof control === 'object') {
        control.disabled = false;
      }
    });
}

function presentCriticalErrorOverlay(options = {}) {
  const helpers = ensureRendererHelpers();
  const scope = helpers.getScope();
  const doc = helpers.getDocument();
  const payload = {
    title: options.title ?? 'Critical error encountered',
    message: options.message ?? 'Renderer encountered a critical error and needs attention.',
    diagnosticScope: options.diagnosticScope ?? 'runtime',
    diagnosticStatus: options.diagnosticStatus ?? 'error',
    detail: options.detail ?? {},
    timestamp: options.timestamp ?? Date.now(),
  };

  const overlay = scope?.bootstrapOverlay ?? null;
  if (overlay?.present) {
    overlay.present(payload);
    return payload;
  }
  if (overlay?.showError) {
    overlay.showError(payload);
    return payload;
  }

  if (!doc || typeof doc.createElement !== 'function') {
    scope?.console?.error?.('Critical error overlay unavailable.', payload);
    return payload;
  }

  let container = doc.getElementById?.('criticalErrorOverlay') ?? null;
  if (!container) {
    container = doc.createElement('section');
    container.id = 'criticalErrorOverlay';
    container.className = 'critical-error-overlay';
    const titleNode = doc.createElement('h2');
    titleNode.id = 'criticalErrorOverlayTitle';
    container.appendChild(titleNode);
    const messageNode = doc.createElement('p');
    messageNode.id = 'criticalErrorOverlayMessage';
    container.appendChild(messageNode);
    doc.body?.appendChild?.(container);
  }

  const titleNode = container.querySelector?.('#criticalErrorOverlayTitle') ?? container.firstChild ?? null;
  const messageNode = container.querySelector?.('#criticalErrorOverlayMessage') ?? titleNode?.nextSibling ?? null;
  if (titleNode) {
    titleNode.textContent = payload.title;
  }
  if (messageNode) {
    messageNode.textContent = payload.message;
  }
  container.hidden = false;
  container.dataset = container.dataset || {};
  container.dataset.diagnosticScope = payload.diagnosticScope;
  container.dataset.diagnosticStatus = payload.diagnosticStatus;

  return payload;
}

function pushDiagnosticsHistory(entry) {
  const state = resolveDiagnosticsState();
  const history = state.logBuffer;
  history.push(entry);
  const limit =
    typeof DIAGNOSTICS_EVENT_HISTORY_LIMIT === 'number'
      ? DIAGNOSTICS_EVENT_HISTORY_LIMIT
      : 50;
  if (history.length > limit) {
    history.splice(0, history.length - limit);
  }
}

function getDiagnosticsConsole(scope) {
  return scope?.console ?? (typeof console !== 'undefined' ? console : null);
}

function mirrorDiagnosticsToOverlay(payload, scope) {
  const criticalLevels =
    typeof DIAGNOSTICS_CRITICAL_LEVELS !== 'undefined'
      ? DIAGNOSTICS_CRITICAL_LEVELS
      : new Set(['error', 'fatal']);
  if (!payload || !criticalLevels.has(payload.level)) {
    return;
  }
  const overlay = scope?.presentCriticalErrorOverlay ?? scope?.bootstrapOverlay ?? null;
  const presenter =
    typeof overlay?.present === 'function'
      ? overlay.present.bind(overlay)
      : typeof overlay?.showError === 'function'
        ? (detail) => overlay.showError(detail)
        : typeof scope?.presentCriticalErrorOverlay === 'function'
          ? scope.presentCriticalErrorOverlay
          : typeof presentCriticalErrorOverlay === 'function'
            ? presentCriticalErrorOverlay
            : null;
  if (!presenter) {
    return;
  }

  const overlayKey = `${payload.scope}:${payload.message}`;
  const now = Date.now();
  const state = resolveDiagnosticsState(scope);
  const throttle =
    typeof DIAGNOSTICS_OVERLAY_THROTTLE_MS === 'number'
      ? DIAGNOSTICS_OVERLAY_THROTTLE_MS
      : 2000;
  if (state.lastOverlayKey === overlayKey && now - state.lastOverlayAt < throttle) {
    return;
  }
  state.lastOverlayKey = overlayKey;
  state.lastOverlayAt = now;

  presenter({
    message: payload.message,
    timestamp: payload.timestamp,
    diagnosticScope: payload.scope,
    diagnosticStatus: payload.level,
    detail: payload.detail ?? {},
  });
}

function dispatchDiagnosticsEvent(scope, payload) {
  const target = scope ?? (typeof window !== 'undefined' ? window : undefined);
  if (!target?.dispatchEvent || !target?.CustomEvent) {
    return;
  }
  try {
    const event = new target.CustomEvent('infinite-rails:diagnostic-event', {
      detail: payload,
      bubbles: false,
      cancelable: false,
    });
    target.dispatchEvent(event);
  } catch (error) {
    // ignore errors triggered by synthetic environments
  }
}

(function setupAudioDiagnostics(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope || typeof scope.addEventListener !== 'function') {
    return;
  }

  scope.addEventListener('infinite-rails:audio-boot-status', handleAudioBootStatus);

  function handleAudioBootStatus(event) {
    const detail = event?.detail ?? {};
    if (detail.fallbackActive !== true) {
      return;
    }
    const message =
      typeof detail.message === 'string' && detail.message.trim().length
        ? detail.message.trim()
        : 'Audio fallback activated — audio assets unavailable.';
    if (typeof scope.presentCriticalErrorOverlay === 'function') {
      scope.presentCriticalErrorOverlay({
        title: 'Audio assets unavailable',
        message,
        diagnosticScope: 'audio-boot',
        diagnosticStatus: 'error',
        detail,
      });
      return;
    }
    const overlayPayload = {
      title: 'Audio assets unavailable',
      message,
      diagnosticScope: 'audio-boot',
      diagnosticStatus: 'error',
      detail,
    };
    const overlay = scope.bootstrapOverlay ?? null;
    if (overlay?.showError) {
      overlay.showError(overlayPayload);
    } else if (typeof overlay?.present === 'function') {
      overlay.present(overlayPayload);
    }
  }

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.handleAudioBootStatus = handleAudioBootStatus;
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;
})(typeof window !== 'undefined' ? window : undefined);

function logDiagnosticsEvent(scopeKey, message, options = {}) {
  const scope = typeof globalThis !== 'undefined' ? globalThis : undefined;
  const diagnosticScope = typeof scopeKey === 'string' && scopeKey.trim().length ? scopeKey.trim() : 'runtime';
  const resolvedMessage = typeof message === 'string' && message.trim().length ? message.trim() : 'Unknown diagnostic event';
  const level = typeof options.level === 'string' ? options.level.toLowerCase() : 'info';
  const timestamp = Number.isFinite(options.timestamp) ? options.timestamp : Date.now();
  const detail = options.detail ? { ...options.detail } : {};
  const payload = { scope: diagnosticScope, message: resolvedMessage, level, detail, timestamp };

  const consoleRef = getDiagnosticsConsole(scope);
  if (consoleRef?.debug) {
    consoleRef.debug('[diagnostic]', diagnosticScope, resolvedMessage, detail);
  }

  const bootstrapOverlay = scope?.bootstrapOverlay;
  if (bootstrapOverlay?.logEvent) {
    try {
      bootstrapOverlay.logEvent(diagnosticScope, resolvedMessage, payload);
    } catch (error) {
      consoleRef?.warn?.('Failed to mirror diagnostic into bootstrap overlay', error);
    }
  }

  if (typeof scope?.centralLogStore?.record === 'function') {
    scope.centralLogStore.record(payload);
  }

  if (options.store !== false) {
    pushDiagnosticsHistory(payload);
  }

  mirrorDiagnosticsToOverlay(payload, scope);
  dispatchDiagnosticsEvent(scope, payload);

  if (shouldSendDiagnosticsToServer(options, scope) && typeof scope?.fetch === 'function') {
    const endpoint =
      (options && typeof options.endpoint === 'string' && options.endpoint.trim()) ||
      scope?.diagnosticsEndpoint ||
      scope?.APP_CONFIG?.diagnosticsEndpoint;
    if (endpoint) {
      const history = resolveDiagnosticsState(scope).logBuffer.slice(-10);
      const body = JSON.stringify({
        scope: diagnosticScope,
        message: resolvedMessage,
        level,
        detail,
        timestamp,
        history,
      });
      Promise.resolve(
        scope.fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }),
      ).catch((error) => {
        consoleRef?.warn?.('Failed to post diagnostic event', error);
      });
    }
  }

  return payload;
}

function logThroughDiagnostics(fn, { scope, message, detail, rethrow = true } = {}) {
  if (typeof fn !== 'function') {
    return undefined;
  }
  try {
    return fn();
  } catch (error) {
    const diagnosticMessage =
      typeof message === 'string' && message.trim().length
        ? message.trim()
        : error?.message || 'Unhandled diagnostic error';
    logDiagnosticsEvent(scope ?? 'runtime', diagnosticMessage, {
      level: 'error',
      detail: { ...(detail || {}), error },
    });
    if (rethrow) {
      throw error;
    }
    return undefined;
  }
}

(function exposeDiagnosticsNamespace(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof globalThis !== 'undefined'
        ? globalThis
        : null;
  if (!scope) {
    return;
  }
  const namespace = scope.InfiniteRails || (scope.InfiniteRails = {});
  const diagnosticsApi = namespace.diagnostics || (namespace.diagnostics = {});
  if (typeof diagnosticsApi.record !== 'function') {
    diagnosticsApi.record = (category, message, detail = {}, options = {}) => {
      const eventOptions = { detail: typeof detail === 'object' && detail ? detail : {} };
      if (options && typeof options === 'object') {
        Object.assign(eventOptions, options);
      }
      return logDiagnosticsEvent(category, message, eventOptions);
    };
  }

  const ensureClone = (value) => {
    if (value == null) {
      return value;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  };

  const logsApi = namespace.logs || (namespace.logs = { entries: [] });
  if (!Array.isArray(logsApi.entries)) {
    logsApi.entries = [];
  }
  if (typeof logsApi.record !== 'function') {
    logsApi.record = (entry) => {
      const snapshot = {
        category: entry?.category ?? 'runtime',
        level: entry?.level ?? 'info',
        message: entry?.message ?? '',
        timestamp: entry?.timestamp ?? Date.now(),
      };
      logsApi.entries.push(snapshot);
      if (logsApi.entries.length > 200) {
        logsApi.entries.splice(0, logsApi.entries.length - 200);
      }
      return snapshot;
    };
  }
  if (typeof logsApi.getEntries !== 'function') {
    logsApi.getEntries = () => logsApi.entries.slice();
  }

  const replayBufferApi = namespace.replayBuffer || (namespace.replayBuffer = {});
  const replayStore = Array.isArray(replayBufferApi.__store) ? replayBufferApi.__store : [];
  replayBufferApi.__store = replayStore;
  const replayLimit = () => {
    const raw = namespace.replayBufferLimit;
    return Number.isFinite(raw) && raw > 0 ? Math.min(1000, Math.floor(raw)) : 100;
  };
  if (typeof replayBufferApi.record !== 'function') {
    replayBufferApi.record = (action, detail = {}, metadata = {}) => {
      const entry = {
        action: typeof action === 'string' && action ? action : 'unknown-event',
        detail: ensureClone(detail),
        metadata: ensureClone(metadata),
        timestamp: Date.now(),
      };
      replayStore.push(entry);
      const limit = replayLimit();
      if (replayStore.length > limit) {
        replayStore.splice(0, replayStore.length - limit);
      }
      return entry;
    };
  }
  if (typeof replayBufferApi.snapshot !== 'function') {
    replayBufferApi.snapshot = () => replayStore.map((entry) => ({
      action: entry.action,
      detail: ensureClone(entry.detail),
      metadata: ensureClone(entry.metadata),
      timestamp: entry.timestamp,
    }));
  }
  if (typeof replayBufferApi.clear !== 'function') {
    replayBufferApi.clear = () => {
      replayStore.splice(0, replayStore.length);
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : undefined);

function normaliseRequestInfo(input) {
  if (!input) {
    return { url: null, method: 'GET' };
  }
  if (typeof input === 'string') {
    return { url: input, method: 'GET' };
  }
  if (typeof input === 'object') {
    const { url, method } = input;
    return {
      url: typeof url === 'string' ? url : null,
      method: typeof method === 'string' ? method.toUpperCase() : 'GET',
    };
  }
  return { url: null, method: 'GET' };
}

if (typeof globalThis !== 'undefined') {
  if (typeof globalThis.logDiagnosticsEvent !== 'function') {
    globalThis.logDiagnosticsEvent = logDiagnosticsEvent;
  }
  if (typeof globalThis.logThroughDiagnostics !== 'function') {
    globalThis.logThroughDiagnostics = logThroughDiagnostics;
  }
}

function normaliseKeyBindingValue(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normaliseKeyBindingValue(entry)).filter(Boolean);
  }
  if (typeof value !== 'string') {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  return [trimmed.toUpperCase()];
}

const FALLBACK_SHORTCUT_STATE = (() => {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof globalThis !== 'undefined'
        ? globalThis
        : undefined;
  if (scope) {
    const existing = scope.__INFINITE_RAILS_FALLBACK_SHORTCUT_STATE__;
    if (existing && typeof existing === 'object') {
      existing.bindings = existing.bindings && typeof existing.bindings === 'object' ? existing.bindings : {};
      return existing;
    }
    const created = { active: false, bindings: {}, unsubscribe: null, handler: null };
    scope.__INFINITE_RAILS_FALLBACK_SHORTCUT_STATE__ = created;
    return created;
  }
  return { active: false, bindings: {}, unsubscribe: null, handler: null };
})();

function buildFallbackShortcutBindings(controlMap = {}) {
  const bindings = {};
  const entries = typeof controlMap === 'object' && controlMap ? Object.entries(controlMap) : [];
  for (const [action, value] of entries) {
    const keys = normaliseKeyBindingValue(value);
    for (const key of keys) {
      if (!key) {
        continue;
      }
      bindings[key] = action;
    }
  }
  return bindings;
}

function isEditableTarget(target) {
  if (!target) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function shouldIgnoreFallbackEvent(event) {
  if (!event) {
    return true;
  }
  if (event.repeat) {
    return true;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return true;
  }
  return false;
}

function invokeFallbackAction(scope, action, context) {
  if (!action) {
    return;
  }
  const reason = 'user-shortcut';
  if (action === 'activateBriefingFallback') {
    const handled = scope?.activateMissionBriefingFallback?.({ reason, context }) ?? false;
    if (!handled) {
      queueBootstrapFallbackNotice(
        'briefing-fallback-unavailable',
        'Mission briefing fallback unavailable — unable to activate safe mode.',
      );
    }
  } else if (action === 'startSimpleFallbackRenderer') {
    const actionContext = { ...(context || {}), reason };
    const result = scope?.tryStartSimpleFallback?.({ reason }, actionContext);
    if (result === false) {
      queueBootstrapFallbackNotice(
        'simple-renderer-unavailable',
        'Simple renderer fallback unavailable — unable to switch renderer.',
      );
    }
  } else if (action === 'triggerTutorialRescue') {
    const experience = scope?.__INFINITE_RAILS_ACTIVE_EXPERIENCE__;
    if (experience?.showFirstRunTutorial) {
      experience.showFirstRunTutorial({ force: true });
    }
    scope?.recordLiveDiagnostic?.('tutorial', 'Tutorial recovery requested via fallback shortcut.');
  }
}

function ensureFallbackSubscription(scope) {
  const controlsApi = scope?.InfiniteRailsControls;
  if (!controlsApi || typeof controlsApi.subscribe !== 'function') {
    FALLBACK_SHORTCUT_STATE.bindings = buildFallbackShortcutBindings(scope?.__INFINITE_RAILS_CONTROL_MAP__ || {});
    FALLBACK_SHORTCUT_STATE.active = Object.keys(FALLBACK_SHORTCUT_STATE.bindings).length > 0;
    return;
  }
  FALLBACK_SHORTCUT_STATE.unsubscribe?.();
  FALLBACK_SHORTCUT_STATE.unsubscribe = controlsApi.subscribe((map) => {
    FALLBACK_SHORTCUT_STATE.bindings = buildFallbackShortcutBindings(map);
    FALLBACK_SHORTCUT_STATE.active = Object.keys(FALLBACK_SHORTCUT_STATE.bindings).length > 0;
  });
}

function initialiseFallbackShortcutControls(scope = typeof globalThis !== 'undefined' ? globalThis : undefined, documentRef) {
  if (!scope) {
    return FALLBACK_SHORTCUT_STATE;
  }
  const targetDocument = documentRef ?? scope.document ?? null;
  ensureFallbackSubscription(scope);

  if (!FALLBACK_SHORTCUT_STATE.handler && typeof scope.addEventListener === 'function') {
    FALLBACK_SHORTCUT_STATE.handler = (event) => {
      if (event?.type !== 'keydown' || shouldIgnoreFallbackEvent(event)) {
        return;
      }
      const code = event.code || '';
      const action = FALLBACK_SHORTCUT_STATE.bindings[code];
      if (!action) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault?.();
      event.stopPropagation?.();
      invokeFallbackAction(scope, action, { key: code, document: targetDocument });
    };
    scope.addEventListener('keydown', FALLBACK_SHORTCUT_STATE.handler, true);
  }

  return FALLBACK_SHORTCUT_STATE;
}

function cloneFallbackShortcutState() {
  return {
    active: FALLBACK_SHORTCUT_STATE.active,
    bindings: { ...FALLBACK_SHORTCUT_STATE.bindings },
  };
}

function queueBootstrapFallbackNotice(key, message) {
  const scope = typeof globalThis !== 'undefined' ? globalThis : undefined;
  if (!scope) {
    return;
  }
  const registry = scope.__bootstrapNotices || (scope.__bootstrapNotices = []);
  registry.push({ key, message });
}

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

(function initialiseIdentityState(globalScope) {
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
  if (!scope.__INFINITE_RAILS_IDENTITY_STATE__) {
    scope.__INFINITE_RAILS_IDENTITY_STATE__ = {
      apiBaseUrl: null,
      scoreboardOffline: false,
      liveFeaturesSuspended: false,
      liveFeaturesHoldDetail: null,
      backendValidation: { performed: false, ok: null, detail: null },
      configuredEndpoints: { scores: '/scores', users: '/users', events: '/events' },
      endpoints: { scores: '/scores', users: '/users', events: '/events' },
      identity: { name: 'Guest Explorer', googleId: null, location: null, locationLabel: null },
    };
  }
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
    let identity = getIdentityState();
    if (!identity) {
      identity =
        scope.__INFINITE_RAILS_IDENTITY_STATE__ ||
        (scope.__INFINITE_RAILS_IDENTITY_STATE__ = {
          apiBaseUrl: null,
          scoreboardOffline: false,
          liveFeaturesSuspended: false,
          liveFeaturesHoldDetail: null,
          backendValidation: { performed: false, ok: null, detail: null },
          configuredEndpoints: { scores: '/scores', users: '/users', events: '/events' },
          endpoints: { scores: '/scores', users: '/users', events: '/events' },
          identity: { name: 'Guest Explorer', googleId: null, location: null, locationLabel: null },
        });
    }
    if (identity && typeof identity === 'object') {
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

  let logStore = scope.InfiniteRails?.logs ?? null;
  if (logStore && typeof logStore.record === 'function') {
    const originalRecord = logStore.record.bind(logStore);
    if (!logStore.__INFINITE_RAILS_ERROR_RATE_PATCHED__) {
      logStore.record = function record(entry) {
        const result = originalRecord(entry);
        const snapshot =
          result && typeof result === 'object'
            ? result
            : {
                category: entry?.category ?? 'general',
                level: entry?.level ?? 'info',
                message: entry?.message ?? '',
                timestamp: entry?.timestamp ?? Date.now(),
              };
        recordLogEntry(snapshot);
        return result;
      };
      Object.defineProperty(logStore, '__INFINITE_RAILS_ERROR_RATE_PATCHED__', {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false,
      });
    }
  } else {
    logStore = {
      entries: [],
      record(entry) {
        const enriched = {
          category: entry?.category ?? 'general',
          level: entry?.level ?? 'info',
          message: entry?.message ?? '',
          timestamp: entry?.timestamp ?? Date.now(),
        };
        this.entries.push(enriched);
        if (this.entries.length > 200) {
          this.entries.splice(0, this.entries.length - 200);
        }
        recordLogEntry(enriched);
        return enriched;
      },
    };
  }

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

(function setupEventSourcing(globalScope) {
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

  const setTimeoutImpl =
    typeof scope.setTimeout === 'function'
      ? scope.setTimeout.bind(scope)
      : typeof setTimeout === 'function'
        ? setTimeout
        : null;
  const clearTimeoutImpl =
    typeof scope.clearTimeout === 'function'
      ? scope.clearTimeout.bind(scope)
      : typeof clearTimeout === 'function'
        ? clearTimeout
        : null;

  const FLUSH_DELAY_MS = 200;
  const MAX_QUEUE_SIZE = 120;

  const state =
    scope.__INFINITE_RAILS_EVENT_SOURCING_STATE__ ||
    (scope.__INFINITE_RAILS_EVENT_SOURCING_STATE__ = {
      queue: [],
      flushTimer: null,
      sessionId: null,
      traceSessionId: null,
      identityListeners: new Set(),
    });

  function generateId(prefix = 'event') {
    const random = Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now().toString(36);
    return `${prefix}-${random}${timestamp}`;
  }

  function safeClone(value, seen = new WeakSet()) {
    if (value == null) {
      return value;
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
    if (seen.has(value)) {
      return '[Circular]';
    }
    if (Array.isArray(value)) {
      seen.add(value);
      const clone = value.slice(0, 100).map((entry) => safeClone(entry, seen));
      seen.delete(value);
      return clone;
    }
    if (typeof value === 'object') {
      seen.add(value);
      const output = {};
      Object.keys(value)
        .slice(0, 50)
        .forEach((key) => {
          output[key] = safeClone(value[key], seen);
        });
      seen.delete(value);
      return output;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return String(value);
    }
  }

  function updateTrace(detail) {
    const summary = detail && typeof detail === 'object' ? detail.summary : null;
    const trace = summary && typeof summary === 'object' ? summary.trace : null;
    const candidates = [
      trace && typeof trace.sessionId === 'string' ? trace.sessionId.trim() : null,
      trace && typeof trace.traceId === 'string' ? trace.traceId.trim() : null,
      typeof detail?.traceSessionId === 'string' ? detail.traceSessionId.trim() : null,
    ].filter(Boolean);
    if (candidates.length > 0) {
      state.traceSessionId = candidates[0];
    } else if (!state.traceSessionId) {
      state.traceSessionId = generateId('trace');
    }
  }

  function ensureSessionId(detail) {
    if (!state.sessionId) {
      const summary = detail && typeof detail === 'object' ? detail.summary : null;
      const candidates = [
        typeof detail?.sessionId === 'string' ? detail.sessionId.trim() : null,
        typeof summary?.sessionId === 'string' ? summary.sessionId.trim() : null,
        typeof summary?.id === 'string' ? summary.id.trim() : null,
        typeof detail?.runId === 'string' ? detail.runId.trim() : null,
      ].filter(Boolean);
      state.sessionId = candidates.length > 0 ? candidates[0] : generateId('session');
    }
    return state.sessionId;
  }

  function normaliseBaseUrl(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.replace(/\/+$/, '');
  }

  function resolveEventsEndpoint() {
    const identity = scope.__INFINITE_RAILS_IDENTITY_STATE__ || {};
    const baseCandidate =
      identity.apiBaseUrl ||
      (scope.APP_CONFIG && scope.APP_CONFIG.apiBaseUrl) ||
      scope.apiBaseUrl ||
      null;
    const baseUrl = normaliseBaseUrl(baseCandidate);
    if (!baseUrl) {
      return null;
    }
    const endpointCandidate = identity.endpoints?.events;
    if (typeof endpointCandidate === 'string' && endpointCandidate.trim()) {
      const endpoint = endpointCandidate.trim();
      if (/^https?:/i.test(endpoint)) {
        return endpoint;
      }
      return `${baseUrl}/${endpoint.replace(/^\/+/, '')}`;
    }
    return `${baseUrl}/events`;
  }

  function captureReproductionArtifacts() {
    const logsApi = scope.InfiniteRails?.logs ?? null;
    let sessionLogs = [];
    if (logsApi) {
      try {
        if (typeof logsApi.getEntries === 'function') {
          sessionLogs = safeClone(logsApi.getEntries());
        } else if (Array.isArray(logsApi.entries)) {
          sessionLogs = safeClone(logsApi.entries.slice(-50));
        }
      } catch (error) {
        sessionLogs = [];
      }
    }

    const diagnosticsHistory = safeClone(getDiagnosticsStateContainer(scope).logBuffer.slice(-20));

    const replayApi = scope.InfiniteRails?.replayBuffer ?? null;
    let replaySnapshot = [];
    if (replayApi && typeof replayApi.snapshot === 'function') {
      try {
        replaySnapshot = safeClone(replayApi.snapshot());
      } catch (error) {
        replaySnapshot = [];
      }
    }

    const artifactSnapshot = {
      userActionReplay: Array.isArray(replaySnapshot) ? replaySnapshot : [],
      centralLog: Array.isArray(sessionLogs) ? sessionLogs : [],
      liveDiagnostics: Array.isArray(diagnosticsHistory) ? diagnosticsHistory : [],
    };
    let snapshotChunks = { length: 0 };
    try {
      const json = JSON.stringify(artifactSnapshot);
      const chunkSize = 2048;
      if (json.length === 0) {
        snapshotChunks = { c0: '', length: 1 };
      } else {
        snapshotChunks = { length: 0 };
        for (let offset = 0; offset < json.length; offset += chunkSize) {
          const index = Math.floor(offset / chunkSize);
          snapshotChunks[`c${index}`] = json.slice(offset, offset + chunkSize);
          snapshotChunks.length = index + 1;
        }
      }
    } catch (error) {
      snapshotChunks = { length: 0 };
    }

    const traceSessionId = state.traceSessionId || generateId('trace');
    state.traceSessionId = traceSessionId;

    return {
      traceSessionId,
      sessionLogs,
      diagnosticsHistory,
      userActionReplay: artifactSnapshot.userActionReplay,
      snapshotChunks,
    };
  }

  function flushQueue() {
    if (!state.queue.length) {
      return;
    }
    const endpoint = resolveEventsEndpoint();
    if (!endpoint || typeof scope.fetch !== 'function') {
      return;
    }
    const events = state.queue.splice(0, state.queue.length).map((entry) => {
      const payload = {
        type: entry.type,
        detail: safeClone(entry.detail),
        timestamp: entry.timestamp,
        sessionId: entry.sessionId,
      };
      if (typeof entry.context !== 'undefined') {
        payload.context = safeClone(entry.context);
      }
      if (typeof entry.summary !== 'undefined') {
        payload.summary = safeClone(entry.summary);
      }
      return payload;
    });
    if (!events.length) {
      return;
    }
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    };
    Promise.resolve(scope.fetch(endpoint, init)).catch((error) => {
      scope.console?.warn?.('[InfiniteRails] Failed to post gameplay events.', error);
    });
  }

  function scheduleFlush() {
    if (!setTimeoutImpl || state.flushTimer) {
      return;
    }
    state.flushTimer = setTimeoutImpl(() => {
      state.flushTimer = null;
      flushQueue();
      if (state.queue.length) {
        scheduleFlush();
      }
    }, FLUSH_DELAY_MS);
  }

  function enqueueEvent(type, detail = {}, options = {}) {
    const eventType = typeof type === 'string' && type.trim().length ? type.trim() : 'unknown';
    const timestampSource =
      Number.isFinite(options.timestamp) ? Number(options.timestamp) : Number(detail?.timestamp);
    const timestamp = Number.isFinite(timestampSource) ? timestampSource : Date.now();
    updateTrace(detail);
    const sessionId = ensureSessionId(detail);
    const entry = {
      type: eventType,
      detail: safeClone(detail),
      timestamp,
      sessionId,
      context: options.context ? safeClone(options.context) : undefined,
    };
    if (detail && typeof detail === 'object') {
      if (detail.summary && typeof detail.summary === 'object') {
        entry.summary = safeClone(detail.summary);
      }
      if (detail.context && entry.context === undefined && typeof detail.context === 'object') {
        entry.context = safeClone(detail.context);
      }
    }
    state.queue.push(entry);
    if (state.queue.length > MAX_QUEUE_SIZE) {
      state.queue.splice(0, state.queue.length - MAX_QUEUE_SIZE);
    }
    scheduleFlush();
    return entry;
  }

  function handleStarted(event) {
    const detail = event?.detail ?? {};
    enqueueEvent('started', detail, { timestamp: detail.timestamp });
  }

  function handleStartError(event) {
    const detail = event?.detail ?? {};
    const enriched = { ...detail, artifacts: captureReproductionArtifacts() };
    enqueueEvent('start-error', enriched, { timestamp: detail.timestamp });
  }

  function handleAudioSettingsChanged(event) {
    enqueueEvent('audio-settings-changed', event?.detail ?? {});
  }

  function handleControlMapChanged(event) {
    enqueueEvent('control-map-changed', event?.detail ?? {});
  }

  function handleKeybindingsChanged(event) {
    enqueueEvent('keybindings-changed', event?.detail ?? {});
  }

  function ensureIdentityApi() {
    scope.InfiniteRails = scope.InfiniteRails || {};
    const identityState = scope.__INFINITE_RAILS_IDENTITY_STATE__ || (scope.__INFINITE_RAILS_IDENTITY_STATE__ = {});
    if (!identityState.identity || typeof identityState.identity !== 'object') {
      identityState.identity = { name: 'Guest Explorer', googleId: null };
    } else {
      identityState.identity = { ...identityState.identity };
      if (typeof identityState.identity.googleId !== 'string') {
        identityState.identity.googleId = identityState.identity.googleId ?? null;
      }
    }
    if (!state.identityListeners) {
      state.identityListeners = new Set();
    }

    const identityApi = scope.InfiniteRails.identity || {};
    identityApi.getIdentity = () => ({ ...(identityState.identity ?? {}) });
    identityApi.setIdentity = (update = {}) => {
      const next = {
        ...(identityState.identity ?? { name: 'Guest Explorer', googleId: null }),
        ...(typeof update === 'object' && update ? update : {}),
      };
      if (typeof next.googleId !== 'string' || !next.googleId.trim()) {
        next.googleId = null;
      } else {
        next.googleId = next.googleId.trim();
      }
      if (typeof next.name !== 'string' || !next.name.trim()) {
        next.name = identityState.identity?.name ?? 'Guest Explorer';
      } else {
        next.name = next.name.trim();
      }
      identityState.identity = next;
      enqueueEvent('identity-change', { identity: safeClone(next) });
      state.identityListeners.forEach((listener) => {
        try {
          listener({ ...next });
        } catch (error) {
          scope.console?.warn?.('[InfiniteRails] Identity listener failed.', error);
        }
      });
      return next;
    };
    identityApi.subscribe = (listener) => {
      if (typeof listener !== 'function') {
        return () => {};
      }
      state.identityListeners.add(listener);
      return () => {
        state.identityListeners.delete(listener);
      };
    };
    scope.InfiniteRails.identity = identityApi;
    return identityApi;
  }

  function registerEventListeners() {
    if (typeof scope.addEventListener !== 'function') {
      return;
    }
    scope.addEventListener('infinite-rails:started', handleStarted);
    scope.addEventListener('infinite-rails:start-error', handleStartError);
    scope.addEventListener('infinite-rails:audio-settings-changed', handleAudioSettingsChanged);
    scope.addEventListener('infinite-rails:control-map-changed', handleControlMapChanged);
    scope.addEventListener('infinite-rails:keybindings-changed', handleKeybindingsChanged);
  }

  ensureIdentityApi();
  registerEventListeners();

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.getEventQueueSnapshot = () => state.queue.map((entry) => ({ ...entry, detail: safeClone(entry.detail) }));
  hooks.flushEventQueue = () => {
    if (state.flushTimer && clearTimeoutImpl) {
      clearTimeoutImpl(state.flushTimer);
      state.flushTimer = null;
    }
    flushQueue();
  };
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

(function setupIdentitySnapshots(globalScope) {
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

  const IDENTITY_STORAGE_KEY = 'infinite-rails-simple-identity';
  const SESSION_STORAGE_KEY = 'infinite-rails-simple-session';

  const storage = scope.localStorage ?? null;

  const identityState =
    scope.__INFINITE_RAILS_IDENTITY_STATE__ ||
    (scope.__INFINITE_RAILS_IDENTITY_STATE__ = {
      apiBaseUrl: null,
      scoreboardOffline: false,
      liveFeaturesSuspended: false,
      liveFeaturesHoldDetail: null,
      backendValidation: { performed: false, ok: null, detail: null },
      configuredEndpoints: { scores: '/scores', users: '/users', events: '/events' },
      endpoints: { scores: '/scores', users: '/users', events: '/events' },
      identity: { name: 'Guest Explorer', googleId: null, location: null, locationLabel: null },
    });

  if (!identityState.identity || typeof identityState.identity !== 'object') {
    identityState.identity = { name: 'Guest Explorer', googleId: null, location: null, locationLabel: null };
  } else {
    const nextIdentity = { ...identityState.identity };
    if (typeof nextIdentity.name !== 'string' || !nextIdentity.name.trim()) {
      nextIdentity.name = 'Guest Explorer';
    }
    if (typeof nextIdentity.googleId !== 'string' || !nextIdentity.googleId.trim()) {
      nextIdentity.googleId = null;
    }
    if (typeof nextIdentity.location !== 'string') {
      nextIdentity.location = null;
    }
    if (typeof nextIdentity.locationLabel !== 'string') {
      nextIdentity.locationLabel = null;
    }
    identityState.identity = nextIdentity;
  }

  const sessionState =
    scope.__INFINITE_RAILS_IDENTITY_SESSION_STATE__ ||
    (scope.__INFINITE_RAILS_IDENTITY_SESSION_STATE__ = {
      refreshToken: null,
      googleId: null,
      expiresAt: null,
      issuedAt: null,
      lastRefreshedAt: null,
      status: 'idle',
    });

  let autoRefreshHandle = null;
  const pendingRefreshes = [];

  const getScoreboardElement = () => getBootstrapUi(scope)?.scoreboardStatus ?? null;

  const ensureDefaultScoreboardMessage = () => {
    const element = getScoreboardElement();
    if (!element) {
      return;
    }
    if (element.dataset && element.dataset.offline === 'true') {
      if (element.dataset.sessionExpired === 'true') {
        element.textContent = 'Session expired — please sign in again.';
      }
      return;
    }
    element.textContent = DEFAULT_SCOREBOARD_MESSAGE;
  };

  function cloneSessionState() {
    return {
      refreshToken: sessionState.refreshToken ?? null,
      googleId: sessionState.googleId ?? null,
      expiresAt: sessionState.expiresAt ?? null,
      issuedAt: sessionState.issuedAt ?? null,
      lastRefreshedAt: sessionState.lastRefreshedAt ?? null,
      status: sessionState.status ?? 'idle',
    };
  }

  function requestStorageQuarantine(detail) {
    const payload = {
      storageKey: detail?.storageKey ?? null,
      context: detail?.context ?? null,
      error: detail?.error ?? null,
    };
    if (payload.storageKey) {
      if (typeof scope.dispatchEvent === 'function' && typeof scope.CustomEvent === 'function') {
        try {
          const event = new scope.CustomEvent('infinite-rails:storage-quarantine-requested', { detail: payload });
          scope.dispatchEvent(event);
          return;
        } catch (error) {
          // fall through to test hooks
        }
      }
      const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__;
      if (hooks?.requestStorageQuarantine) {
        hooks.requestStorageQuarantine(payload);
      }
    }
  }

  function handleStorageFailure(storageKey, context, error) {
    if (storage?.removeItem) {
      try {
        storage.removeItem(storageKey);
      } catch (removeError) {
        scope.console?.warn?.('[InfiniteRails] Unable to clear quarantined storage key.', removeError);
      }
    }
    scope.console?.warn?.(
      `[InfiniteRails] Failed to access ${context} from "${storageKey}".`,
      error ?? null,
    );
    requestStorageQuarantine({ storageKey, context, error });
  }

  function readStoredJson(storageKey, context) {
    if (!storage?.getItem) {
      return null;
    }
    let rawValue;
    try {
      rawValue = storage.getItem(storageKey);
    } catch (error) {
      handleStorageFailure(storageKey, context, error);
      return null;
    }
    if (!rawValue) {
      return null;
    }
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      handleStorageFailure(storageKey, context, error);
      return null;
    }
  }

  function persistIdentitySnapshot() {
    if (!storage?.setItem) {
      return;
    }
    try {
      const snapshot = {
        displayName: identityState.identity?.name ?? 'Guest Explorer',
        googleId: identityState.identity?.googleId ?? null,
        location: identityState.identity?.location ?? null,
        locationLabel: identityState.identity?.locationLabel ?? null,
      };
      storage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      scope.console?.warn?.('[InfiniteRails] Unable to persist identity snapshot.', error);
    }
  }

  function persistSessionSnapshot() {
    if (!storage?.setItem) {
      return;
    }
    try {
      const snapshot = {
        refreshToken: sessionState.refreshToken ?? null,
        googleId: sessionState.googleId ?? null,
        expiresAt: sessionState.expiresAt ?? null,
        issuedAt: sessionState.issuedAt ?? null,
        lastRefreshedAt: sessionState.lastRefreshedAt ?? null,
      };
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      scope.console?.warn?.('[InfiniteRails] Unable to persist identity session.', error);
    }
  }

  function applyIdentitySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }
    const displayNameRaw = typeof snapshot.displayName === 'string' ? snapshot.displayName : snapshot.name;
    const displayName = typeof displayNameRaw === 'string' && displayNameRaw.trim()
      ? displayNameRaw.trim()
      : identityState.identity?.name ?? 'Guest Explorer';
    const googleIdRaw = typeof snapshot.googleId === 'string' ? snapshot.googleId : null;
    const googleId = googleIdRaw && googleIdRaw.trim() ? googleIdRaw.trim() : null;
    identityState.identity = {
      name: displayName,
      googleId,
      location: snapshot.location ?? null,
      locationLabel: snapshot.locationLabel ?? null,
    };
  }

  const storedIdentity = readStoredJson(IDENTITY_STORAGE_KEY, 'identity snapshot');
  if (storedIdentity) {
    applyIdentitySnapshot(storedIdentity);
  }

  function resetSessionState() {
    sessionState.refreshToken = null;
    sessionState.googleId = null;
    sessionState.expiresAt = null;
    sessionState.issuedAt = null;
    sessionState.lastRefreshedAt = null;
    sessionState.status = 'idle';
  }

  function applySessionSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return false;
    }
    const refreshToken = typeof snapshot.refreshToken === 'string' && snapshot.refreshToken.trim()
      ? snapshot.refreshToken.trim()
      : null;
    const googleId = typeof snapshot.googleId === 'string' && snapshot.googleId.trim()
      ? snapshot.googleId.trim()
      : null;
    const expiresAtValue = Number(snapshot.expiresAt);
    const issuedAtValue = Number(snapshot.issuedAt);
    if (!refreshToken || !googleId || !Number.isFinite(expiresAtValue)) {
      return false;
    }
    sessionState.refreshToken = refreshToken;
    sessionState.googleId = googleId;
    sessionState.expiresAt = expiresAtValue;
    sessionState.issuedAt = Number.isFinite(issuedAtValue) ? issuedAtValue : null;
    sessionState.lastRefreshedAt = Number.isFinite(Number(snapshot.lastRefreshedAt))
      ? Number(snapshot.lastRefreshedAt)
      : null;
    sessionState.status = 'active';
    return true;
  }

  function clearAutoRefresh() {
    if (autoRefreshHandle != null && typeof scope.clearTimeout === 'function') {
      scope.clearTimeout(autoRefreshHandle);
    }
    autoRefreshHandle = null;
  }

  function scheduleAutoRefresh() {
    clearAutoRefresh();
    if (typeof scope.setTimeout !== 'function') {
      return;
    }
    const expiresAt = Number(sessionState.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return;
    }
    const refreshLeadMs = 30 * 1000;
    const delay = Math.max(5_000, expiresAt - Date.now() - refreshLeadMs);
    autoRefreshHandle = scope.setTimeout(() => {
      autoRefreshHandle = null;
      refreshSession({ reason: 'auto-refresh' }).catch(() => {});
    }, delay);
  }

  function resolvePendingRefresh(success, value, error) {
    if (!pendingRefreshes.length) {
      return;
    }
    const [{ resolve, reject }] = pendingRefreshes.splice(0, 1);
    if (success) {
      resolve(value);
    } else {
      reject(error ?? new Error('Session refresh failed.'));
    }
  }

  function expireSession(reason = 'expired') {
    clearAutoRefresh();
    if (storage?.removeItem) {
      try {
        storage.removeItem(SESSION_STORAGE_KEY);
      } catch (error) {
        scope.console?.warn?.('[InfiniteRails] Unable to remove expired identity session.', error);
      }
    }
    const message = reason === 'expired'
      ? 'Session expired — please sign in again.'
      : 'Session unavailable — please sign in again.';
    identityState.identity = {
      name: identityState.identity?.name ?? 'Guest Explorer',
      googleId: null,
      location: null,
      locationLabel: null,
    };
    identityState.scoreboardOffline = true;
    setScoreboardOffline(scope, message, { datasetKey: 'sessionExpired' });
    setScoreSyncWarning(scope, 'Sign-in required to resume live features.', true);
    identityState.liveFeaturesSuspended = true;
    identityState.liveFeaturesHoldDetail = {
      kind: 'identity-session',
      reason,
      message,
    };
    sessionState.status = 'expired';
    resetSessionState();
    sessionState.status = 'expired';
    persistIdentitySnapshot();
  }

  const storedSession = readStoredJson(SESSION_STORAGE_KEY, 'identity session');
  if (storedSession && applySessionSnapshot(storedSession)) {
    if (Number(sessionState.expiresAt) <= Date.now()) {
      expireSession('expired');
    } else {
      scheduleAutoRefresh();
    }
  } else if (storedSession) {
    handleStorageFailure(SESSION_STORAGE_KEY, 'identity session', new Error('Invalid session snapshot.'));
    resetSessionState();
  }

  ensureDefaultScoreboardMessage();

  if (sessionState.status === 'expired') {
    setScoreboardOffline(scope, 'Session expired — please sign in again.', { datasetKey: 'sessionExpired' });
  }

  function base64UrlDecode(segment) {
    if (typeof segment !== 'string') {
      return null;
    }
    let normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    if (pad) {
      normalized += '='.repeat(4 - pad);
    }
    try {
      const decoder = typeof scope.atob === 'function' ? scope.atob.bind(scope) : null;
      if (!decoder) {
        return null;
      }
      return decoder(normalized);
    } catch (error) {
      scope.console?.warn?.('[InfiniteRails] Failed to decode identity credential payload.', error);
      return null;
    }
  }

  function decodeJwtPayload(credential) {
    if (typeof credential !== 'string') {
      return null;
    }
    const parts = credential.split('.');
    if (parts.length < 2) {
      return null;
    }
    const payloadSegment = base64UrlDecode(parts[1]);
    if (!payloadSegment) {
      return null;
    }
    try {
      return JSON.parse(payloadSegment);
    } catch (error) {
      scope.console?.warn?.('[InfiniteRails] Invalid identity credential payload.', error);
      return null;
    }
  }

  function restoreScoreboardDefaults() {
    if (identityState.liveFeaturesSuspended) {
      return;
    }
    clearScoreboardOffline(scope);
    setScoreSyncWarning(scope, '', false);
    identityState.scoreboardOffline = false;
    ensureDefaultScoreboardMessage();
  }

  function updateIdentityFromPayload(payload) {
    const name = typeof payload?.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : identityState.identity?.name ?? 'Guest Explorer';
    const googleId = typeof payload?.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null;
    const locationLabel = typeof payload?.hd === 'string' && payload.hd.trim() ? payload.hd.trim() : null;
    identityState.identity = {
      name,
      googleId,
      location: null,
      locationLabel,
      email: typeof payload?.email === 'string' ? payload.email : undefined,
      avatarUrl: typeof payload?.picture === 'string' ? payload.picture : undefined,
    };
    persistIdentitySnapshot();
  }

  function activateSessionFromPayload(payload) {
    const now = Date.now();
    const expiresAt = Number(payload?.exp) ? Number(payload.exp) * 1000 : now + 60 * 60 * 1000;
    const issuedAt = Number(payload?.iat) ? Number(payload.iat) * 1000 : now;
    sessionState.refreshToken = `refresh-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    sessionState.googleId = identityState.identity?.googleId ?? null;
    sessionState.expiresAt = expiresAt;
    sessionState.issuedAt = issuedAt;
    sessionState.lastRefreshedAt = now;
    sessionState.status = 'active';
    if (identityState.liveFeaturesHoldDetail?.kind === 'identity-session') {
      identityState.liveFeaturesHoldDetail = null;
      identityState.liveFeaturesSuspended = false;
    }
    persistSessionSnapshot();
    scheduleAutoRefresh();
    restoreScoreboardDefaults();
  }

  const GOOGLE_ACCOUNTS_ID_PATH = 'google.accounts.id';
  const googleAccounts =
    scope.google?.accounts?.id ??
    (typeof scope[GOOGLE_ACCOUNTS_ID_PATH] === 'object' ||
    typeof scope[GOOGLE_ACCOUNTS_ID_PATH] === 'function'
      ? scope[GOOGLE_ACCOUNTS_ID_PATH]
      : null);
  const googleClientIdRaw = typeof scope.APP_CONFIG?.googleClientId === 'string' ? scope.APP_CONFIG.googleClientId : null;
  const googleClientId = googleClientIdRaw && googleClientIdRaw.trim() ? googleClientIdRaw.trim() : null;

  function handleGoogleCredential(response) {
    const payload = decodeJwtPayload(response?.credential);
    if (!payload?.sub) {
      return;
    }
    updateIdentityFromPayload(payload);
    activateSessionFromPayload(payload);
    resolvePendingRefresh(true, cloneSessionState());
  }

  if (googleAccounts && googleClientId) {
    try {
      googleAccounts.initialize?.({ client_id: googleClientId, callback: handleGoogleCredential });
    } catch (error) {
      scope.console?.warn?.('[InfiniteRails] Failed to initialise Google Identity Services.', error);
    }
  }

  function refreshSession(options = {}) {
    if (!googleAccounts || typeof googleAccounts.prompt !== 'function') {
      return Promise.reject(new Error('Google Identity Services unavailable.'));
    }
    return new Promise((resolve, reject) => {
      pendingRefreshes.push({ resolve, reject });
      try {
        googleAccounts.prompt((notification) => {
          if (!notification) {
            return;
          }
          const dismissed =
            (typeof notification.isDismissedMoment === 'function' && notification.isDismissedMoment()) ||
            (typeof notification.isNotDisplayed === 'function' && notification.isNotDisplayed()) ||
            (typeof notification.isSkippedMoment === 'function' && notification.isSkippedMoment());
          if (dismissed) {
            resolvePendingRefresh(false, null, new Error('Sign-in was dismissed.'));
          }
        }, options);
      } catch (error) {
        resolvePendingRefresh(false, null, error);
      }
    });
  }

  scope.InfiniteRailsIdentity = scope.InfiniteRailsIdentity || {};
  scope.InfiniteRailsIdentity.getSession = () => cloneSessionState();
  scope.InfiniteRailsIdentity.refreshSession = (options = {}) => refreshSession(options);

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.getIdentitySessionState = () => cloneSessionState();
  hooks.handleGoogleCredential = handleGoogleCredential;
  hooks.expireIdentitySession = expireSession;
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

(function setupRemoteFeatureFlags(globalScope) {
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

  scope.InfiniteRails = scope.InfiniteRails || {};
  const appConfig = scope.APP_CONFIG || (scope.APP_CONFIG = {});

  const identityState =
    scope.__INFINITE_RAILS_IDENTITY_STATE__ ||
    (scope.__INFINITE_RAILS_IDENTITY_STATE__ = {
      apiBaseUrl: null,
      scoreboardOffline: false,
      liveFeaturesSuspended: false,
      liveFeaturesHoldDetail: null,
      backendValidation: { performed: false, ok: null, detail: null },
      configuredEndpoints: { scores: '/scores', users: '/users', events: '/events' },
      endpoints: { scores: '/scores', users: '/users', events: '/events' },
      identity: { name: 'Guest Explorer', googleId: null, location: null, locationLabel: null },
    });

  const featureState =
    scope.__INFINITE_RAILS_FEATURE_FLAG_STATE__ ||
    (scope.__INFINITE_RAILS_FEATURE_FLAG_STATE__ = {
      ready: false,
      flags: {},
      metadata: { health: { degraded: false } },
      lastFetchedAt: null,
    });

  let fetchPromise = null;

  function snapshotFeatureState() {
    return {
      flags: { ...featureState.flags },
      metadata: cloneDeep(featureState.metadata),
    };
  }

  function setSafeModeAppConfig(enabled) {
    if (enabled) {
      appConfig.forceSimpleMode = true;
      appConfig.enableAdvancedExperience = false;
      appConfig.preferAdvanced = false;
    } else {
      delete appConfig.forceSimpleMode;
      delete appConfig.enableAdvancedExperience;
      delete appConfig.preferAdvanced;
    }
  }

  function applySafeMode(message, detail = {}) {
    const resolvedMessage =
      typeof message === 'string' && message.trim().length
        ? message.trim()
        : 'Leaderboard offline for maintenance.';
    identityState.liveFeaturesSuspended = true;
    identityState.scoreboardOffline = true;
    identityState.liveFeaturesHoldDetail = { kind: detail.kind ?? 'remote-config', detail };
    setScoreboardOffline(scope, resolvedMessage, { datasetKey: 'remoteConfig' });
    setScoreSyncWarning(scope, resolvedMessage, true);
  }

  function clearSafeMode() {
    const holdDetail = identityState.liveFeaturesHoldDetail;
    if (holdDetail && holdDetail.kind && holdDetail.kind !== 'remote-config' && holdDetail.kind !== 'remote-health') {
      identityState.scoreboardOffline = true;
      identityState.liveFeaturesSuspended = true;
      return;
    }
    identityState.liveFeaturesSuspended = false;
    identityState.scoreboardOffline = false;
    identityState.liveFeaturesHoldDetail = null;
    setScoreSyncWarning(scope, '', false);
    clearScoreboardOffline(scope);
    const element = getBootstrapUi(scope)?.scoreboardStatus ?? null;
    if (element) {
      element.textContent = DEFAULT_SCOREBOARD_MESSAGE;
    }
  }

  function deriveHealthMetadata(options) {
    const { status, degraded, message } = options;
    const metadata = { degraded: Boolean(degraded) };
    if (status) {
      metadata.status = status;
    }
    if (message && degraded) {
      metadata.message = message;
    }
    return metadata;
  }

  function normaliseHealthStatus(rawStatus) {
    if (typeof rawStatus !== 'string') {
      return null;
    }
    const trimmed = rawStatus.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.toLowerCase().replace(/_/g, '-');
  }

  function applyRemoteConfig(payload) {
    const config = (payload && typeof payload === 'object' ? payload.config : null) || {};
    const features = typeof config.features === 'object' && config.features ? config.features : {};
    const messages = typeof config.messages === 'object' && config.messages ? config.messages : {};
    const health = typeof config.health === 'object' && config.health ? config.health : null;

    featureState.flags = {};
    Object.keys(features).forEach((key) => {
      featureState.flags[key] = Boolean(features[key]);
    });

    const scoreboardMessage = typeof messages.scoreboard === 'string' ? messages.scoreboard.trim() : '';
    const healthStatus = normaliseHealthStatus(health?.status);
    const healthMessage = typeof health?.message === 'string' && health.message.trim() ? health.message.trim() : '';

    const degradedByHealth = Boolean(healthStatus && /outage|degrad/.test(healthStatus));
    const safeModeByFlags = Boolean(featureState.flags.forceSimpleRenderer || featureState.flags.disableScoreSync);
    const safeMode = degradedByHealth || safeModeByFlags || Boolean(scoreboardMessage);

    if (safeMode) {
      featureState.flags.forceSimpleRenderer = true;
      featureState.flags.disableScoreSync = true;
    }

    setSafeModeAppConfig(safeMode);

    if (safeMode) {
      const message = healthMessage || scoreboardMessage;
      const detail = {
        kind: degradedByHealth ? 'remote-health' : 'remote-config',
        status: healthStatus || undefined,
        message: message || undefined,
      };
      applySafeMode(message, detail);
      featureState.metadata.health = deriveHealthMetadata({
        degraded: true,
        status: healthStatus || undefined,
        message: message || undefined,
      });
    } else {
      clearSafeMode();
      featureState.metadata.health = deriveHealthMetadata({ degraded: false, status: healthStatus || undefined });
    }

    featureState.ready = true;
    featureState.lastFetchedAt = Date.now();
  }

  function fetchRemoteConfig(options = {}) {
    if (fetchPromise) {
      return fetchPromise.then(() => snapshotFeatureState());
    }
    const endpointRaw = (() => {
      const primary =
        typeof appConfig.featureFlagsEndpoint === 'string' && appConfig.featureFlagsEndpoint.trim()
          ? appConfig.featureFlagsEndpoint.trim()
          : '';
      if (primary) {
        return primary;
      }
      const legacy =
        typeof appConfig.featureConfigUrl === 'string' && appConfig.featureConfigUrl.trim()
          ? appConfig.featureConfigUrl.trim()
          : '';
      return legacy;
    })();
    if (!endpointRaw && options.initial) {
      applyRemoteConfig({});
      return Promise.resolve(snapshotFeatureState());
    }
    const endpoint = endpointRaw || '/feature-flags.json';
    fetchPromise = Promise.resolve()
      .then(() => {
        if (typeof scope.fetch !== 'function') {
          applyRemoteConfig({});
          return;
        }
        return scope
          .fetch(endpoint, { cache: 'no-store', signal: options.signal })
          .then((response) => (typeof response?.json === 'function' ? response.json() : Promise.resolve({})))
          .then((data) => {
            applyRemoteConfig(data || {});
          })
          .catch((error) => {
            scope.console?.warn?.('[InfiniteRails] Failed to load remote feature flags.', error);
            featureState.ready = true;
          });
      })
      .finally(() => {
        fetchPromise = null;
      });
    return fetchPromise.then(() => snapshotFeatureState());
  }

  const featuresApi = scope.InfiniteRails.features || (scope.InfiniteRails.features = {});
  featuresApi.ready = () => Boolean(featureState.ready);
  featuresApi.get = (name) => featureState.flags[name] ?? false;
  featuresApi.refresh = (options = {}) => fetchRemoteConfig(options);
  featuresApi.metadata = () => cloneDeep(featureState.metadata);

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.getFeatureFlagState = () => snapshotFeatureState();
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;

  fetchRemoteConfig({ initial: true });
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
      if (status === 403) {
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

  function shouldRetryAssetRequestWithActiveFailover(detail) {
    const state = getAssetFailoverState();
    if (!state || !state.failoverActive) {
      return false;
    }
    const requestUrl = ensureString(detail?.requestUrl).trim();
    if (!requestUrl) {
      return false;
    }
    const primaryLower = ensureString(state.primaryRootLower || state.primaryRoot).toLowerCase();
    const fallbackLower = ensureString(state.activeRootLower || state.fallbackRoot).toLowerCase();
    if (!primaryLower || !fallbackLower || primaryLower === fallbackLower) {
      return false;
    }
    const lowerRequest = requestUrl.toLowerCase();
    if (!lowerRequest.startsWith(primaryLower)) {
      return false;
    }
    if (lowerRequest.startsWith(fallbackLower)) {
      return false;
    }
    return true;
  }

  function shouldRetryAfterFailure(detail, failoverAttempted) {
    if (failoverAttempted) {
      return false;
    }
    if (!detail || detail.category !== 'assets') {
      return false;
    }
    return shouldRetryAssetRequestWithActiveFailover(detail);
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

  const performFetch = (resource, init, attemptOptions = {}) => {
    const options = {
      failoverAttempted: Boolean(attemptOptions?.failoverAttempted),
    };

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
      const detail = {
        category,
        requestUrl,
        resource: adjustedResource,
        init: adjustedInit,
        error,
        phase: 'invoke',
      };
      recordFailure(category, detail);
      maybeActivateAssetFailoverForFailure(detail);
      const retryDueToFailover = shouldRetryAfterFailure(detail, options.failoverAttempted);
      if (!retryDueToFailover) {
        maybeScheduleAssetRetry(detail);
      }
      if (retryDueToFailover) {
        return performFetch(resource, init, { failoverAttempted: true });
      }
      throw error;
    }

    if (!fetchResult || typeof fetchResult.then !== 'function') {
      return fetchResult;
    }

    return Promise.resolve(fetchResult)
      .then((response) => {
        if (!response || typeof response.ok !== 'boolean') {
          const detail = {
            category,
            requestUrl,
            resource: adjustedResource,
            init: adjustedInit,
            response,
            phase: 'invalid-response',
          };
          recordFailure(category, detail);
          maybeActivateAssetFailoverForFailure(detail);
          const retryDueToFailover = shouldRetryAfterFailure(detail, options.failoverAttempted);
          if (!retryDueToFailover) {
            maybeScheduleAssetRetry(detail);
          }
          if (retryDueToFailover) {
            return performFetch(resource, init, { failoverAttempted: true });
          }
          return response;
        }
        if (!response.ok) {
          const detail = {
            category,
            requestUrl,
            resource: adjustedResource,
            init: adjustedInit,
            response,
            status: response.status,
            statusText: response.statusText,
            phase: 'http',
          };
          recordFailure(category, detail);
          maybeActivateAssetFailoverForFailure(detail);
          const retryDueToFailover = shouldRetryAfterFailure(detail, options.failoverAttempted);
          if (!retryDueToFailover) {
            maybeScheduleAssetRetry(detail);
          }
          if (retryDueToFailover) {
            return performFetch(resource, init, { failoverAttempted: true });
          }
        } else {
          recordSuccess(category);
          if (category === 'assets' && requestUrl) {
            clearAssetRetry(requestUrl);
          }
        }
        return response;
      })
      .catch((error) => {
        const detail = {
          category,
          requestUrl,
          resource: adjustedResource,
          init: adjustedInit,
          error,
          phase: 'rejection',
        };
        recordFailure(category, detail);
        maybeActivateAssetFailoverForFailure(detail);
        const retryDueToFailover = shouldRetryAfterFailure(detail, options.failoverAttempted);
        if (!retryDueToFailover) {
          maybeScheduleAssetRetry(detail);
        }
        if (retryDueToFailover) {
          return performFetch(resource, init, { failoverAttempted: true });
        }
        throw error;
      });
  };

  const wrappedFetch = (resource, init) => performFetch(resource, init, { failoverAttempted: false });

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

  function normaliseEndpointPath(value) {
    if (typeof value !== 'string') {
      return value == null ? null : value;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  function updateConfiguredEndpoints() {
    const configured = identityState.configuredEndpoints || (identityState.configuredEndpoints = {});
    if (!Object.prototype.hasOwnProperty.call(configured, 'scores')) {
      configured.scores = '/scores';
    }
    if (!Object.prototype.hasOwnProperty.call(configured, 'users')) {
      configured.users = '/users';
    }
    if (!Object.prototype.hasOwnProperty.call(configured, 'events')) {
      configured.events = '/events';
    }
    configured.scores = normaliseEndpointPath(configured.scores);
    configured.users = normaliseEndpointPath(configured.users);
    configured.events = normaliseEndpointPath(configured.events);
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
    const scoreboard = getBootstrapUi(globalRef)?.scoreboardStatus ?? null;
    if (scoreboard?.dataset?.sessionExpired === 'true') {
      scoreboard.dataset.offline = 'true';
      return false;
    }
    setScoreboardOffline(globalRef, message);
    return false;
  }

  function recordSuccess(apiBaseUrl) {
    backendState.performed = true;
    backendState.success = true;
    backendState.detail = { reason: 'ok', message: 'Backend validation succeeded.' };
    identityState.apiBaseUrl = apiBaseUrl;
    setIdentityOnline();
    const scoreboardEndpoint =
      typeof apiBaseUrl === 'string'
        ? `${apiBaseUrl.replace(/\/$/, '')}/scores`
        : identityState.endpoints?.scores ?? '/scores';
    const usersEndpoint =
      typeof apiBaseUrl === 'string'
        ? `${apiBaseUrl.replace(/\/$/, '')}/users`
        : identityState.endpoints?.users ?? '/users';
    const eventsEndpoint =
      typeof apiBaseUrl === 'string'
        ? `${apiBaseUrl.replace(/\/$/, '')}/events`
        : identityState.endpoints?.events ?? '/events';
    const backendDetail = identityState.backendValidation?.detail;
    if (backendDetail && typeof backendDetail === 'object') {
      backendDetail.endpoints = {
        scores: scoreboardEndpoint,
        users: usersEndpoint,
        events: eventsEndpoint,
      };
    }
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

  function joinEndpointUrl(baseUrl, path) {
    const base = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : '';
    if (!path) {
      return base;
    }
    const segment = typeof path === 'string' ? path.replace(/^\/+/, '') : '';
    if (!segment) {
      return base;
    }
    return `${base}/${segment}`;
  }

  async function pingEndpoint(fetchImpl, baseUrl, endpoint) {
    const method = (endpoint.method ?? 'GET').toUpperCase();
    const url = joinEndpointUrl(baseUrl, endpoint.path);
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

    const results = await Promise.all(
      endpoints.map((endpoint) => pingEndpoint(fetchImpl, apiBaseUrl, endpoint)),
    );
    const failures = results.filter((failure) => Boolean(failure));

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
    return backendState;
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
    const initialHeartbeat = sendHeartbeat();
    if (initialHeartbeat?.catch) {
      initialHeartbeat.catch(() => false);
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
  hooks.getIdentityState = () => identityState;
  hooks.getHeartbeatState = () => cloneDeep(heartbeatState);
  hooks.getScoreboardStatusText = () => getBootstrapUi(globalRef)?.scoreboardStatus?.textContent ?? null;
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

  const readyStateRaw = documentRef ? documentRef.readyState : null;
  const readyState = typeof readyStateRaw === 'string' ? readyStateRaw.toLowerCase() : '';
  if (!readyState || readyState === 'complete' || readyState === 'interactive') {
    autoStart();
  } else {
    documentRef.addEventListener('DOMContentLoaded', autoStart, { once: true });
  }
})(typeof window !== 'undefined' ? window : undefined);
