(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const documentRef = globalScope.document ?? null;

  const configWarningDeduper = new Set();

  function logConfigWarning(message, context = {}) {
    const consoleRef = typeof console !== 'undefined' ? console : globalScope.console;
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
      consoleRef.log(message, context);
    }
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
      resolved = new URL(trimmed, globalScope?.location?.href ?? undefined);
    } catch (error) {
      logConfigWarning('Invalid APP_CONFIG.apiBaseUrl detected; remote sync disabled.', {
        apiBaseUrl: base,
        error: error?.message ?? String(error),
      });
      return null;
    }
    const hasExplicitProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    if (!hasExplicitProtocol) {
      logConfigWarning('APP_CONFIG.apiBaseUrl must be an absolute URL including the protocol.', {
        apiBaseUrl: base,
        resolved: resolved.href,
      });
      return null;
    }
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      logConfigWarning('APP_CONFIG.apiBaseUrl must use HTTP or HTTPS.', {
        apiBaseUrl: base,
        protocol: resolved.protocol,
      });
      return null;
    }
    if (resolved.search || resolved.hash) {
      logConfigWarning('APP_CONFIG.apiBaseUrl should not include query strings or fragments; ignoring extras.', {
        apiBaseUrl: base,
        search: resolved.search,
        hash: resolved.hash,
      });
      resolved.search = '';
      resolved.hash = '';
    }
    return resolved.href.replace(/\/+$/, '');
  }

  function buildScoreboardUrl(apiBaseUrl) {
    if (!apiBaseUrl || typeof apiBaseUrl !== 'string') {
      return null;
    }
    return `${apiBaseUrl.replace(/\/$/, '')}/scores`;
  }

  function inferLocationLabel(location) {
    if (!location || typeof location !== 'object') {
      return 'Location hidden';
    }
    if (location.error) {
      return typeof location.error === 'string' && location.error.trim().length
        ? location.error.trim()
        : 'Location hidden';
    }
    if (typeof location.label === 'string' && location.label.trim().length) {
      return location.label.trim();
    }
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const latLabel = latitude.toFixed(1);
      const lonLabel = longitude.toFixed(1);
      return `Lat ${latLabel}\u00b0, Lon ${lonLabel}\u00b0`;
    }
    return 'Location hidden';
  }

  const globalAppConfig =
    globalScope.APP_CONFIG && typeof globalScope.APP_CONFIG === 'object'
      ? globalScope.APP_CONFIG
      : (globalScope.APP_CONFIG = {});
  const originalApiBaseUrl = globalAppConfig?.apiBaseUrl ?? null;
  const apiBaseUrl = normaliseApiBaseUrl(originalApiBaseUrl);
  if (globalAppConfig && typeof globalAppConfig === 'object') {
    globalAppConfig.apiBaseUrl = apiBaseUrl;
  }
  const apiBaseInvalid = Boolean(originalApiBaseUrl && !apiBaseUrl);

  const googleClientId =
    typeof globalAppConfig?.googleClientId === 'string' && globalAppConfig.googleClientId.trim().length > 0
      ? globalAppConfig.googleClientId.trim()
      : null;

  const identityState = {
    apiBaseUrl,
    googleClientId,
    googleInitialized: false,
    googleReady: false,
    googleButtonsRendered: false,
    googleError: null,
    identity: null,
    scoreboardMessage: '',
    endpoints: {
      scores: buildScoreboardUrl(apiBaseUrl),
      users: apiBaseUrl ? `${apiBaseUrl.replace(/\/$/, '')}/users` : null,
    },
  };

  const identityStorageKey = 'infinite-rails-simple-identity';
  const GOOGLE_ACCOUNTS_ID_NAMESPACE = 'google.accounts.id';
  const GOOGLE_IDENTITY_SCRIPT_URLS = (() => {
    const urls = [];
    const singleUrl =
      typeof globalAppConfig?.googleIdentityScriptUrl === 'string'
        ? globalAppConfig.googleIdentityScriptUrl.trim()
        : '';
    if (singleUrl) {
      urls.push(singleUrl);
    }
    const configuredList = Array.isArray(globalAppConfig?.googleIdentityScriptUrls)
      ? globalAppConfig.googleIdentityScriptUrls
      : [];
    configuredList.forEach((value) => {
      if (typeof value === 'string' && value.trim().length) {
        urls.push(value.trim());
      }
    });
    urls.push('https://accounts.google.com/gsi/client');
    return Array.from(new Set(urls));
  })();
  const HOTBAR_SLOT_COUNT = 10;

  const DEFAULT_KEY_BINDINGS = (() => {
    const bindings = {
      moveForward: ['KeyW', 'ArrowUp'],
      moveBackward: ['KeyS', 'ArrowDown'],
      moveLeft: ['KeyA', 'ArrowLeft'],
      moveRight: ['KeyD', 'ArrowRight'],
      jump: ['Space'],
      interact: ['KeyF'],
      placeBlock: ['KeyQ'],
      toggleCrafting: ['KeyE'],
      openGuide: ['F1'],
      openSettings: ['F2'],
      openLeaderboard: ['F3'],
      buildPortal: ['KeyR'],
    };
    for (let index = 1; index <= HOTBAR_SLOT_COUNT; index += 1) {
      const digit = index % 10;
      bindings[`hotbar${index}`] = [`Digit${digit}`, `Numpad${digit}`];
    }
    return bindings;
  })();

  function queueBootstrapFallbackNotice(key, message) {
    if (!globalScope) {
      return;
    }
    const notices = (globalScope.__bootstrapNotices = globalScope.__bootstrapNotices || []);
    notices.push({ key, message });
  }

  function createAssetUrlCandidates(relativePath) {
    const urls = [];
    const normalisedPath = relativePath.replace(/^\.\//, '');
    const assetBase = globalScope.APP_CONFIG?.assetBaseUrl;
    if (assetBase) {
      try {
        const base = assetBase.endsWith('/') ? assetBase : `${assetBase}/`;
        urls.push(new URL(normalisedPath, base).href);
      } catch (error) {
        if (globalScope.console?.warn) {
          globalScope.console.warn('Failed to resolve assetBaseUrl candidate', {
            assetBaseUrl: assetBase,
            asset: relativePath,
            error,
          });
        }
      }
    }
    if (/^https?:/i.test(relativePath)) {
      urls.push(relativePath);
    } else {
      urls.push(normalisedPath);
    }
    return Array.from(new Set(urls));
  }

  function loadScript(url, attributes = {}) {
    return new Promise((resolve, reject) => {
      const doc = typeof document !== 'undefined' ? document : documentRef;
      if (!doc || typeof doc.createElement !== 'function') {
        reject(new Error('Document unavailable for script injection.'));
        return;
      }
      const script = doc.createElement('script');
      script.src = url;
      script.async = false;
      Object.entries(attributes).forEach(([key, value]) => {
        try {
          script.setAttribute(key, value);
        } catch (error) {
          // Attribute assignment failure should not block loading.
        }
      });
      script.addEventListener('load', () => resolve(script), { once: true });
      script.addEventListener(
        'error',
        () => reject(new Error(`Failed to load script: ${url}`)),
        { once: true },
      );
      const parent = doc.head || doc.body || doc.documentElement;
      if (parent && typeof parent.appendChild === 'function') {
        parent.appendChild(script);
      } else {
        reject(new Error('Unable to append script element.'));
      }
    });
  }

  const THREE_CDN_URLS = [
    ...createAssetUrlCandidates('vendor/three.min.js'),
    'https://unpkg.com/three@0.161.0/build/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.min.js',
  ];
  const GLTF_LOADER_URLS = [
    ...createAssetUrlCandidates('vendor/GLTFLoader.js'),
    'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/js/loaders/GLTFLoader.js',
  ];

  let threeLoaderPromise = null;
  let gltfLoaderPromise = null;

  function ensureThree() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    if (scope.THREE && typeof scope.THREE === 'object') {
      scope.THREE_GLOBAL = scope.THREE;
      return Promise.resolve(scope.THREE);
    }
    if (threeLoaderPromise) {
      return threeLoaderPromise;
    }
    threeLoaderPromise = new Promise((resolve, reject) => {
      const attempt = (index) => {
        if (scope.THREE && typeof scope.THREE === 'object') {
          scope.THREE_GLOBAL = scope.THREE;
          resolve(scope.THREE);
          return;
        }
        if (index >= THREE_CDN_URLS.length) {
          reject(new Error('Unable to load Three.js from configured sources.'));
          return;
        }
        const url = THREE_CDN_URLS[index];
        const attrs = {
          'data-three-fallback': 'true',
          'data-three-fallback-index': String(index),
        };
        loadScript(url, attrs)
          .then(() => {
            if (scope.THREE && typeof scope.THREE === 'object') {
              scope.THREE_GLOBAL = scope.THREE;
              resolve(scope.THREE);
            } else {
              attempt(index + 1);
            }
          })
          .catch((error) => {
            const doc = typeof document !== 'undefined' ? document : scope.document || documentRef;
            const failingElement = doc?.querySelector?.(`script[src="${url}"]`);
            if (failingElement?.setAttribute) {
              failingElement.setAttribute('data-three-fallback-error', 'true');
            }
            if (scope.console?.warn) {
              scope.console.warn('Failed to load Three.js fallback', { url, error });
            }
            attempt(index + 1);
          });
      };
      attempt(0);
    });
    return threeLoaderPromise;
  }

  function ensureGLTFLoader() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    if (scope.THREE?.GLTFLoader) {
      return Promise.resolve(scope.THREE.GLTFLoader);
    }
    if (gltfLoaderPromise) {
      return gltfLoaderPromise;
    }
    gltfLoaderPromise = new Promise((resolve, reject) => {
      const attempt = (index) => {
        if (scope.THREE?.GLTFLoader) {
          resolve(scope.THREE.GLTFLoader);
          return;
        }
        if (index >= GLTF_LOADER_URLS.length) {
          reject(new Error('Unable to load GLTFLoader sources.'));
          return;
        }
        const url = GLTF_LOADER_URLS[index];
        loadScript(url, {
          'data-gltfloader-fallback': 'true',
          'data-gltfloader-index': String(index),
        })
          .then(() => {
            if (scope.THREE?.GLTFLoader) {
              resolve(scope.THREE.GLTFLoader);
            } else {
              attempt(index + 1);
            }
          })
          .catch(() => {
            attempt(index + 1);
          });
      };
      attempt(0);
    });
    return gltfLoaderPromise;
  }
  const nameDisplayEl = documentRef?.getElementById('userNameDisplay') ?? null;
  const locationDisplayEl = documentRef?.getElementById('userLocationDisplay') ?? null;
  const scoreboardStatusEl = documentRef?.getElementById('scoreboardStatus') ?? null;
  const googleButtonContainers = documentRef
    ? Array.from(documentRef.querySelectorAll('[data-google-button-container]'))
    : [];
  const fallbackSigninButtons = documentRef
    ? Array.from(documentRef.querySelectorAll('[data-google-fallback-signin]'))
    : [];
  const signOutButtons = documentRef ? Array.from(documentRef.querySelectorAll('[data-google-sign-out]')) : [];

  let googleInitPromise = null;
  let googleIdentityScriptPromise = null;

  function updateScoreboardStatus(message) {
    if (typeof message === 'string' && message.trim().length > 0) {
      identityState.scoreboardMessage = message.trim();
    }
    if (scoreboardStatusEl) {
      scoreboardStatusEl.textContent = identityState.scoreboardMessage;
    }
  }

  function createAnonymousIdentity(base) {
    const location = base?.location && typeof base.location === 'object' ? { ...base.location } : null;
    const locationLabel =
      typeof base?.locationLabel === 'string' && base.locationLabel.trim().length
        ? base.locationLabel.trim()
        : inferLocationLabel(location);
    return {
      name: 'Guest Explorer',
      googleId: null,
      email: null,
      avatar: null,
      location,
      locationLabel,
    };
  }

  function mapSnapshotToIdentity(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    const fallback = createAnonymousIdentity(null);
    const location = snapshot.location && typeof snapshot.location === 'object' ? { ...snapshot.location } : null;
    const locationLabel =
      typeof snapshot.locationLabel === 'string' && snapshot.locationLabel.trim().length
        ? snapshot.locationLabel.trim()
        : inferLocationLabel(location);
    return {
      name:
        typeof snapshot.displayName === 'string' && snapshot.displayName.trim().length
          ? snapshot.displayName.trim()
          : fallback.name,
      googleId:
        typeof snapshot.googleId === 'string' && snapshot.googleId.trim().length ? snapshot.googleId.trim() : null,
      email: typeof snapshot.email === 'string' && snapshot.email.trim().length ? snapshot.email.trim() : null,
      avatar: typeof snapshot.avatar === 'string' && snapshot.avatar.trim().length ? snapshot.avatar.trim() : null,
      location,
      locationLabel,
    };
  }

  function loadStoredIdentitySnapshot() {
    if (!globalScope.localStorage) {
      return null;
    }
    try {
      const raw = globalScope.localStorage.getItem(identityStorageKey);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw);
      return payload && typeof payload === 'object' ? payload : null;
    } catch (error) {
      console.warn('Failed to restore identity snapshot from localStorage', error);
      return null;
    }
  }

  function persistIdentitySnapshot(identity) {
    if (!identity || typeof identity !== 'object') {
      return;
    }
    if (!globalScope.localStorage) {
      return;
    }
    try {
      const snapshot = {
        displayName: identity.name ?? 'Guest Explorer',
        googleId: identity.googleId ?? null,
        location: identity.location ?? null,
        locationLabel: identity.locationLabel ?? null,
      };
      globalScope.localStorage.setItem(identityStorageKey, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('Failed to persist identity snapshot', error);
    }
  }

  function notifyIdentityConsumers(identity) {
    const payload = {
      name: identity.name,
      googleId: identity.googleId,
      email: identity.email ?? null,
      avatar: identity.avatar ?? null,
      location: identity.location ?? null,
      locationLabel: identity.locationLabel ?? null,
    };
    try {
      const activeExperience = globalScope.__INFINITE_RAILS_ACTIVE_EXPERIENCE__;
      if (activeExperience && typeof activeExperience.setIdentity === 'function') {
        activeExperience.setIdentity(payload);
      }
    } catch (error) {
      console.warn('Failed to apply identity to active experience', error);
    }
    try {
      if (globalScope.InfiniteRails && typeof globalScope.InfiniteRails.setIdentity === 'function') {
        globalScope.InfiniteRails.setIdentity(payload);
      }
    } catch (error) {
      console.warn('Failed to update InfiniteRails identity', error);
    }
    if (documentRef) {
      try {
        documentRef.dispatchEvent(
          new CustomEvent('infinite-rails:identity-change', {
            detail: payload,
          }),
        );
      } catch (error) {
        console.debug('Identity change event dispatch failed', error);
      }
    }
  }

  function applyIdentity(identity, options = {}) {
    const base = identityState.identity || null;
    const fallback = createAnonymousIdentity(base);
    const source = identity && typeof identity === 'object' ? identity : {};
    const merged = { ...fallback, ...source };

    merged.name =
      typeof merged.name === 'string' && merged.name.trim().length ? merged.name.trim() : fallback.name;
    merged.googleId =
      typeof merged.googleId === 'string' && merged.googleId.trim().length ? merged.googleId.trim() : null;
    merged.email =
      typeof merged.email === 'string' && merged.email.trim().length ? merged.email.trim() : null;
    merged.avatar =
      typeof merged.avatar === 'string' && merged.avatar.trim().length ? merged.avatar.trim() : null;
    const location = merged.location && typeof merged.location === 'object' ? { ...merged.location } : fallback.location;
    let locationLabel =
      typeof merged.locationLabel === 'string' && merged.locationLabel.trim().length
        ? merged.locationLabel.trim()
        : null;
    if (!locationLabel) {
      locationLabel = inferLocationLabel(location);
    }
    merged.location = location;
    merged.locationLabel = locationLabel;

    identityState.identity = merged;

    if (nameDisplayEl) {
      nameDisplayEl.textContent = merged.name;
    }
    if (locationDisplayEl) {
      locationDisplayEl.textContent = merged.locationLabel || 'Location hidden';
    }

    const signedIn = Boolean(merged.googleId);
    signOutButtons.forEach((btn) => {
      btn.hidden = !signedIn;
    });

    const fallbackShouldHide = identityState.googleReady && !identityState.googleError;
    fallbackSigninButtons.forEach((btn) => {
      btn.hidden = fallbackShouldHide ? true : false;
    });

    if (options.persist !== false) {
      persistIdentitySnapshot(merged);
    }

    notifyIdentityConsumers(merged);

    const reason = options.reason ?? null;
    let message = null;
    if (reason === 'google-sign-in') {
      if (identityState.apiBaseUrl && identityState.endpoints.users) {
        message = `Signing in as ${merged.name}\u2026`;
      } else {
        message = `Signed in as ${merged.name}. Offline mode — configure APP_CONFIG.apiBaseUrl to sync.`;
      }
    } else if (reason === 'sign-out') {
      message = `Signed out — continuing as ${merged.name}.`;
    } else if (reason === 'fallback-signin') {
      message = `Playing as ${merged.name}. Google Sign-In unavailable; storing locally.`;
    } else if (reason === 'external-set') {
      if (typeof options.message === 'string' && options.message.trim().length) {
        message = options.message.trim();
      }
    }

    if (message) {
      updateScoreboardStatus(message);
    } else if (!options.silent) {
      updateScoreboardStatus(identityState.scoreboardMessage);
    }

    if (reason === 'google-sign-in' && identityState.apiBaseUrl && identityState.endpoints.users) {
      syncIdentityToApi(merged);
    }

    return merged;
  }

  function handleFallbackSignin() {
    const promptFn = typeof globalScope.prompt === 'function' ? globalScope.prompt : null;
    if (!promptFn) {
      updateScoreboardStatus('Google Sign-In unavailable; continuing with current local profile.');
      return;
    }
    const currentName = identityState.identity?.name ?? 'Guest Explorer';
    const response = promptFn('Enter a display name for this device:', currentName);
    if (typeof response !== 'string') {
      return;
    }
    const trimmed = response.trim();
    if (!trimmed) {
      updateScoreboardStatus('Keeping previous local profile.');
      return;
    }
    const next = {
      name: trimmed,
      googleId: null,
      email: null,
      avatar: null,
      location: identityState.identity?.location ?? null,
      locationLabel: identityState.identity?.locationLabel ?? null,
    };
    applyIdentity(next, { reason: 'fallback-signin' });
  }

  function handleSignOut() {
    const googleAccounts = globalScope.google?.accounts?.id;
    if (googleAccounts && typeof googleAccounts.disableAutoSelect === 'function') {
      try {
        googleAccounts.disableAutoSelect();
      } catch (error) {
        console.debug('Failed to disable Google auto select', error);
      }
    }
    if (googleAccounts && typeof googleAccounts.cancel === 'function') {
      try {
        googleAccounts.cancel();
      } catch (error) {
        console.debug('Failed to cancel Google prompt', error);
      }
    }
    applyIdentity(createAnonymousIdentity(identityState.identity), { reason: 'sign-out' });
    if (identityState.googleReady && !identityState.googleError) {
      showGoogleSigninUi();
    } else {
      showFallbackSignin({ keepGoogleVisible: false });
    }
  }

  function decodeJwtPayload(token) {
    if (typeof token !== 'string') {
      return null;
    }
    const segments = token.split('.');
    if (segments.length < 2) {
      return null;
    }
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    let json = '';
    try {
      if (typeof globalScope.atob === 'function') {
        json = globalScope.atob(padded);
      } else if (typeof Buffer !== 'undefined') {
        json = Buffer.from(padded, 'base64').toString('utf8');
      } else {
        return null;
      }
    } catch (error) {
      console.debug('Failed to decode Google credential payload', error);
      return null;
    }
    try {
      return JSON.parse(json);
    } catch (error) {
      console.debug('Failed to parse Google credential payload', error);
      return null;
    }
  }

  function handleGoogleCredential(response) {
    try {
      const credential = response?.credential;
      if (!credential) {
        updateScoreboardStatus('Google Sign-In failed — missing credential response.');
        return;
      }
      const payload = decodeJwtPayload(credential);
      if (!payload) {
        updateScoreboardStatus('Google Sign-In failed — unable to parse credential.');
        return;
      }
      const fullName =
        typeof payload.name === 'string' && payload.name.trim().length
          ? payload.name.trim()
          : `${payload.given_name ?? ''} ${payload.family_name ?? ''}`.trim();
      const identity = {
        name: fullName || 'Explorer',
        googleId: payload.sub ?? null,
        email: payload.email ?? null,
        avatar: payload.picture ?? null,
        location: identityState.identity?.location ?? null,
        locationLabel: identityState.identity?.locationLabel ?? null,
      };
      if (!identity.googleId) {
        updateScoreboardStatus('Google Sign-In returned without an ID; continuing locally.');
        return;
      }
      applyIdentity(identity, { reason: 'google-sign-in' });
    } catch (error) {
      console.warn('Google Sign-In credential handling failed', error);
      updateScoreboardStatus('Google Sign-In failed — see console for details. Continuing with local profile.');
    }
  }

  function ensureGoogleIdentityScript() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    if (scope.google?.accounts?.id) {
      return Promise.resolve(scope.google.accounts.id);
    }
    if (googleIdentityScriptPromise) {
      return googleIdentityScriptPromise;
    }
    const doc = typeof document !== 'undefined' ? document : documentRef;
    if (!doc) {
      return Promise.reject(new Error('Document unavailable for Google Identity script.'));
    }
    if (scope.location?.protocol === 'file:') {
      return Promise.reject(new Error('Google Identity script disabled on file:// protocol.'));
    }
    googleIdentityScriptPromise = new Promise((resolve, reject) => {
      const attempt = (index) => {
        if (scope.google?.accounts?.id) {
          resolve(scope.google.accounts.id);
          return;
        }
        if (index >= GOOGLE_IDENTITY_SCRIPT_URLS.length) {
          reject(new Error('Unable to load Google Identity Services script.'));
          return;
        }
        const url = GOOGLE_IDENTITY_SCRIPT_URLS[index];
        loadScript(url, {
          'data-google-identity-script': 'true',
          'data-google-identity-index': String(index),
        })
          .then(() => {
            if (scope.google?.accounts?.id) {
              resolve(scope.google.accounts.id);
            } else {
              attempt(index + 1);
            }
          })
          .catch((error) => {
            if (scope.console?.warn) {
              scope.console.warn('Failed to load Google Identity script', { url, error });
            }
            attempt(index + 1);
          });
      };
      attempt(0);
    }).catch((error) => {
      googleIdentityScriptPromise = null;
      throw error;
    });
    return googleIdentityScriptPromise;
  }

  function waitForGoogleIdentityServices(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      function poll() {
        const googleAccounts = globalScope.google?.accounts?.id;
        if (
          googleAccounts &&
          typeof googleAccounts.initialize === 'function' &&
          typeof googleAccounts.renderButton === 'function'
        ) {
          resolve(googleAccounts);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`${GOOGLE_ACCOUNTS_ID_NAMESPACE} failed to load.`));
          return;
        }
        globalScope.setTimeout(poll, 50);
      }
      poll();
    });
  }

  function renderGoogleButtons(gis) {
    if (!documentRef) {
      return;
    }
    googleButtonContainers.forEach((container) => {
      if (!container) {
        return;
      }
      container.hidden = false;
      container.innerHTML = '';
      try {
        gis.renderButton(container, {
          type: 'standard',
          theme: 'filled_blue',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          logo_alignment: 'left',
          width: container.dataset.width ? Number(container.dataset.width) || 0 : 280,
        });
      } catch (error) {
        console.warn('Failed to render Google Sign-In button', error);
      }
    });
    identityState.googleButtonsRendered = googleButtonContainers.length > 0;
    showGoogleSigninUi();
  }

  function showGoogleSigninUi() {
    identityState.googleReady = true;
    googleButtonContainers.forEach((container) => {
      container.hidden = false;
    });
    fallbackSigninButtons.forEach((btn) => {
      btn.hidden = true;
    });
    const signedIn = Boolean(identityState.identity?.googleId);
    signOutButtons.forEach((btn) => {
      btn.hidden = !signedIn;
    });
  }

  function showFallbackSignin(options = {}) {
    if (!options.keepGoogleVisible) {
      identityState.googleReady = false;
      googleButtonContainers.forEach((container) => {
        container.hidden = true;
      });
      identityState.googleButtonsRendered = false;
    }
    fallbackSigninButtons.forEach((btn) => {
      btn.hidden = false;
    });
  }

  function initialiseGoogleSignIn() {
    if (!documentRef) {
      return null;
    }
    if (identityState.googleInitialized || identityState.googleError) {
      return googleInitPromise;
    }
    if (!identityState.googleClientId) {
      updateScoreboardStatus('Google Sign-In unavailable — configure APP_CONFIG.googleClientId to enable SSO.');
      showFallbackSignin({ keepGoogleVisible: false });
      return null;
    }
    if (googleInitPromise) {
      return googleInitPromise;
    }
    googleInitPromise = ensureGoogleIdentityScript()
      .then(() => waitForGoogleIdentityServices(8000))
      .then((googleAccounts) => {
        identityState.googleInitialized = true;
        try {
          googleAccounts.initialize({
            client_id: identityState.googleClientId,
            callback: handleGoogleCredential,
            auto_select: false,
            cancel_on_tap_outside: true,
          });
        } catch (error) {
          throw error;
        }
        renderGoogleButtons(googleAccounts);
        if (!identityState.identity?.googleId) {
          if (identityState.apiBaseUrl && !apiBaseInvalid) {
            updateScoreboardStatus('Google Sign-In ready — authenticate to sync your run.');
          } else {
            updateScoreboardStatus('Google Sign-In ready — runs stay local until an API endpoint is configured.');
          }
        }
        try {
          googleAccounts.prompt();
        } catch (error) {
          console.debug('Google Sign-In prompt failed', error);
        }
        return googleAccounts;
      })
      .catch((error) => {
        identityState.googleError = error;
        identityState.googleReady = false;
        googleInitPromise = null;
        googleIdentityScriptPromise = null;
        console.warn('Google Sign-In initialisation failed', error);
        updateScoreboardStatus('Google Sign-In unavailable — continuing with local profile.');
        showFallbackSignin({ keepGoogleVisible: false });
        throw error;
      });
    return googleInitPromise;
  }

  async function syncIdentityToApi(identity) {
    if (!identity || typeof identity !== 'object') {
      return;
    }
    if (!identity.googleId || !identityState.apiBaseUrl || !identityState.endpoints.users) {
      return;
    }
    if (typeof globalScope.fetch !== 'function') {
      return;
    }
    const url = identityState.endpoints.users;
    const payload = buildIdentityPayload(identity);
    try {
      const response = await globalScope.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      updateScoreboardStatus(`Signed in as ${identity.name}. Leaderboard sync active.`);
    } catch (error) {
      console.warn('Failed to sync identity with leaderboard', error);
      updateScoreboardStatus(`Signed in as ${identity.name}. Sync failed — storing locally.`);
    }
  }

  function buildIdentityPayload(identity) {
    const payload = {
      googleId: identity.googleId,
      name: identity.name,
    };
    if (identity.email) {
      payload.email = identity.email;
    }
    if (identity.avatar) {
      payload.avatar = identity.avatar;
    }
    if (identity.location && typeof identity.location === 'object') {
      payload.location = { ...identity.location };
    }
    if (identity.locationLabel) {
      payload.locationLabel = identity.locationLabel;
    }
    return payload;
  }

  function shouldStartSimpleMode() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    const config = scope.APP_CONFIG || (scope.APP_CONFIG = {});
    const search = scope.location?.search || '';
    const params = new URLSearchParams(search);
    const queryMode = params.get('mode');
    if (queryMode === 'simple') {
      return true;
    }
    if (queryMode === 'advanced') {
      return false;
    }
    if (config.forceSimpleMode) {
      return true;
    }
    if (config.forceAdvanced) {
      return false;
    }
    if (config.enableAdvancedExperience === false) {
      return true;
    }
    const doc = typeof document !== 'undefined' ? document : documentRef;
    let webglSupported = false;
    if (doc && typeof doc.createElement === 'function') {
      try {
        const canvas = doc.createElement('canvas');
        const getContext = canvas?.getContext?.bind(canvas);
        if (typeof getContext === 'function') {
          const gl =
            getContext('webgl2') || getContext('webgl') || getContext('experimental-webgl') || null;
          webglSupported = Boolean(gl);
        }
      } catch (error) {
        webglSupported = false;
      }
    }
    config.webglSupport = webglSupported;
    if (!webglSupported) {
      config.preferAdvanced = false;
      queueBootstrapFallbackNotice(
        'webgl-unavailable-simple-mode',
        'WebGL is unavailable on this device, so the mission briefing view is shown instead of the full 3D renderer.',
      );
      return true;
    }
    return !config.preferAdvanced;
  }

  let simpleFallbackAttempted = false;

  function tryStartSimpleFallback(error, context = {}) {
    if (simpleFallbackAttempted) {
      return false;
    }
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    const hasSimpleExperience = Boolean(scope.SimpleExperience?.create);
    if (!hasSimpleExperience) {
      if (scope.console?.error) {
        scope.console.error('Simple experience unavailable; cannot start fallback renderer.', {
          error,
          context,
        });
      }
      return false;
    }
    simpleFallbackAttempted = true;
    const config = scope.APP_CONFIG || (scope.APP_CONFIG = {});
    config.forceSimpleMode = true;
    config.enableAdvancedExperience = false;
    config.preferAdvanced = false;
    config.defaultMode = 'simple';
    if (typeof queueBootstrapFallbackNotice === 'function') {
      queueBootstrapFallbackNotice(
        'forced-simple-mode',
        'Falling back to the simple renderer after a bootstrap failure.',
      );
    }
    try {
      if (typeof scope.bootstrap === 'function') {
        scope.bootstrap();
      }
    } catch (bootstrapError) {
      if (scope.console?.error) {
        scope.console.error('Simple fallback bootstrap failed.', bootstrapError);
      }
    }
    return true;
  }

  function createScoreboardUtilsFallback() {
    return {
      hydrate() {
        return [];
      },
      normalise(entries = []) {
        return Array.isArray(entries) ? entries.slice() : [];
      },
    };
  }

  function bootstrap() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    const startSimple = shouldStartSimpleMode();
    scope.InfiniteRails = scope.InfiniteRails || {};
    scope.InfiniteRails.rendererMode = startSimple ? 'simple' : 'advanced';
    if (startSimple && scope.SimpleExperience?.create) {
      try {
        scope.SimpleExperience.create({ canvas: null, ui: {} });
      } catch (error) {
        if (scope.console?.warn) {
          scope.console.warn('Failed to bootstrap SimpleExperience', error);
        }
      }
    }
  }

  function setupSimpleExperienceIntegrations() {
    return {
      identity: { ...identityState.identity },
      applyIdentity,
    };
  }

  const storedSnapshot = loadStoredIdentitySnapshot();
  const initialIdentity = storedSnapshot ? mapSnapshotToIdentity(storedSnapshot) : createAnonymousIdentity(null);
  identityState.identity = initialIdentity;

  const initialScoreboardMessage = (() => {
    if (apiBaseInvalid) {
      return 'Configured API endpoint is invalid. Using local leaderboard entries until it is updated.';
    }
    if (apiBaseUrl && initialIdentity?.googleId) {
      return `Signed in as ${initialIdentity.name}. Leaderboard sync active.`;
    }
    if (!apiBaseUrl && initialIdentity?.googleId) {
      return `Signed in as ${initialIdentity.name}. Offline mode — storing runs locally.`;
    }
    if (apiBaseUrl) {
      return 'Leaderboard connected — sign in to publish your run.';
    }
    return 'Offline mode active — storing scores locally.';
  })();
  updateScoreboardStatus(initialScoreboardMessage);
  applyIdentity(initialIdentity, { persist: false, silent: true });

  fallbackSigninButtons.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      handleFallbackSignin();
    });
  });

  signOutButtons.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      handleSignOut();
    });
  });

  if (documentRef) {
    documentRef.addEventListener('visibilitychange', () => {
      if (documentRef.visibilityState === 'hidden') {
        persistIdentitySnapshot(identityState.identity);
      }
    });
  }

  if (typeof globalScope.addEventListener === 'function') {
    globalScope.addEventListener('beforeunload', () => {
      persistIdentitySnapshot(identityState.identity);
    });
  }

  initialiseGoogleSignIn();
  if (typeof globalScope.addEventListener === 'function') {
    globalScope.addEventListener('load', () => {
      if (!identityState.googleInitialized && !identityState.googleError) {
        initialiseGoogleSignIn();
      }
    });
  }

  const identityApi = {
    get state() {
      return identityState;
    },
    getIdentity() {
      return { ...identityState.identity };
    },
    setIdentity(value, options = {}) {
      applyIdentity(value || {}, { ...options, reason: options.reason ?? 'external-set' });
    },
    clearIdentity() {
      applyIdentity(createAnonymousIdentity(identityState.identity), { reason: 'sign-out' });
    },
    refreshGoogleSignIn() {
      identityState.googleError = null;
      identityState.googleInitialized = false;
      identityState.googleReady = false;
      googleButtonContainers.forEach((container) => {
        container.innerHTML = '';
        container.hidden = true;
      });
      fallbackSigninButtons.forEach((btn) => {
        btn.hidden = false;
      });
      googleInitPromise = null;
      initialiseGoogleSignIn();
    },
  };

  globalScope.InfiniteRailsIdentity = identityApi;
  if (!globalScope.InfiniteRails) {
    globalScope.InfiniteRails = {};
  }
  if (!globalScope.InfiniteRails.identity) {
    globalScope.InfiniteRails.identity = identityApi;
  }

  globalScope.bootstrap = bootstrap;

  ensureThree()
    .then(() => {
      bootstrap();
    })
    .catch((error) => {
      if (!simpleFallbackAttempted) {
        tryStartSimpleFallback(error, { reason: 'ensureThree-failure' });
      }
    });
})();
