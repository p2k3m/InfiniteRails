(function initialiseCdnRecovery(globalScope) {
  const scope =
    globalScope && typeof globalScope === 'object'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope || scope.__INFINITE_RAILS_CDN_GUARD__) {
    return;
  }
  scope.__INFINITE_RAILS_CDN_GUARD__ = true;

  const CDN_HOST_PATTERN = /d3gj6x3ityfh5o\.cloudfront\.net/i;
  const STORAGE_KEYS = [
    'infiniteRails.assetRootOverride',
    'InfiniteRails.assetRootOverride',
    'InfiniteRails.assetRoot',
  ];
  const FAILOVER_STORAGE_KEY = 'InfiniteRails.assetRootFailoverBlock';
  const FAILOVER_BLOCK_DURATION_MS = 30 * 60 * 1000;
  const PRIVATE_IPV4_PATTERNS = [
    /^10(?:\.\d{1,3}){3}$/,
    /^192\.168(?:\.\d{1,3}){2}$/,
    /^172\.(?:1[6-9]|2[0-9]|3[0-1])(?:\.\d{1,3}){2}$/,
    /^169\.254(?:\.\d{1,3}){2}$/,
  ];

  const now = () => Date.now();

  const normaliseString = (value) => (typeof value === 'string' ? value : '');

  const toLowerCase = (value) => normaliseString(value).trim().toLowerCase();

  const isLocalHostname = (hostname) => {
    const value = toLowerCase(hostname);
    if (!value) {
      return false;
    }
    if (value === 'localhost' || value === '127.0.0.1' || value === '0.0.0.0' || value === '::1') {
      return true;
    }
    if (value.endsWith('.localhost') || value.endsWith('.local')) {
      return true;
    }
    return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(value));
  };

  const hasPendingCdnScripts = () => {
    const documentRef = scope.document || null;
    if (!documentRef || typeof documentRef.querySelectorAll !== 'function') {
      return false;
    }
    const scripts = documentRef.querySelectorAll('script[data-local-src]');
    if (!scripts || typeof scripts.forEach !== 'function') {
      return false;
    }
    let detected = false;
    scripts.forEach((script) => {
      if (detected || !script) {
        return;
      }
      const attributeValue = typeof script.getAttribute === 'function' ? script.getAttribute('src') : '';
      const explicitSrc = normaliseString(attributeValue);
      const absoluteSrc = normaliseString(script.src);
      const candidate = explicitSrc || absoluteSrc;
      if (!candidate) {
        return;
      }
      try {
        const parsed = new URL(candidate, scope.location?.href || undefined);
        const host = parsed.host || parsed.hostname || '';
        if (host && CDN_HOST_PATTERN.test(host)) {
          detected = true;
        }
      } catch (error) {
        if (CDN_HOST_PATTERN.test(candidate)) {
          detected = true;
        }
      }
    });
    return detected;
  };

  const clearStoredOverrides = () => {
    const storage = scope.localStorage || null;
    if (!storage || typeof storage.removeItem !== 'function') {
      return;
    }
    STORAGE_KEYS.forEach((key) => {
      try {
        storage.removeItem(key);
      } catch (error) {
        /* no-op */
      }
    });
  };

  const ensureAppConfig = () => {
    const appConfig = scope.APP_CONFIG || (scope.APP_CONFIG = {});
    if (typeof appConfig.assetRoot !== 'string' || !appConfig.assetRoot.trim()) {
      appConfig.assetRoot = './';
    }
    if (typeof appConfig.assetBaseUrl !== 'string' || !appConfig.assetBaseUrl.trim()) {
      appConfig.assetBaseUrl = appConfig.assetRoot;
    }
  };

  const extractLocalSrcFromAbsolute = (value) => {
    try {
      const parsed = new URL(value, scope.location?.href ?? undefined);
      if (!CDN_HOST_PATTERN.test(parsed.host || parsed.hostname || '')) {
        return null;
      }
      const path = (parsed.pathname || '').replace(/^\/+/, '');
      const query = parsed.search || '';
      if (!path) {
        return null;
      }
      return `${path}${query}`;
    } catch (error) {
      return null;
    }
  };
  const parseFailoverEntries = () => {
    const storage = scope.localStorage || null;
    if (!storage || typeof storage.getItem !== 'function') {
      return [];
    }
    let rawValue;
    try {
      rawValue = storage.getItem(FAILOVER_STORAGE_KEY);
    } catch (error) {
      return [];
    }
    if (!rawValue) {
      return [];
    }
    let parsed;
    try {
      parsed = JSON.parse(rawValue);
    } catch (error) {
      try {
        storage.removeItem(FAILOVER_STORAGE_KEY);
      } catch (_) {
        /* ignore removal errors */
      }
      return [];
    }
    if (!Array.isArray(parsed)) {
      try {
        storage.removeItem(FAILOVER_STORAGE_KEY);
      } catch (_) {
        /* ignore removal errors */
      }
      return [];
    }
    const nowTs = now();
    const entries = [];
    let mutated = false;
    for (let i = 0; i < parsed.length; i += 1) {
      const entry = parsed[i];
      if (!entry || typeof entry !== 'object') {
        mutated = true;
        continue;
      }
      const root = normaliseString(entry.root);
      const expiresAt = Number(entry.expiresAt);
      if (!root || !Number.isFinite(expiresAt) || expiresAt <= nowTs) {
        mutated = true;
        continue;
      }
      entries.push({
        root,
        lower: root.toLowerCase(),
        expiresAt,
        reason: typeof entry.reason === 'number' ? entry.reason : null,
      });
    }
    if (mutated) {
      try {
        storage.setItem(
          FAILOVER_STORAGE_KEY,
          JSON.stringify(entries.map(({ root, expiresAt, reason }) => ({ root, expiresAt, reason }))),
        );
      } catch (_) {
        /* ignore persistence failures */
      }
    }
    return entries;
  };

  const writeFailoverEntries = (entries) => {
    const storage = scope.localStorage || null;
    if (!storage || typeof storage.setItem !== 'function') {
      return;
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      try {
        storage.removeItem(FAILOVER_STORAGE_KEY);
      } catch (_) {
        /* ignore */
      }
      return;
    }
    try {
      storage.setItem(
        FAILOVER_STORAGE_KEY,
        JSON.stringify(entries.map(({ root, expiresAt, reason }) => ({ root, expiresAt, reason }))),
      );
    } catch (_) {
      /* ignore */
    }
  };

  const registerFailoverBlock = (absoluteUrl, context = {}) => {
    if (!absoluteUrl) {
      return null;
    }
    let candidate = '';
    try {
      const parsed = new URL(absoluteUrl, scope.location?.href || undefined);
      if (!CDN_HOST_PATTERN.test(parsed.host || parsed.hostname || '')) {
        return null;
      }
      candidate = `${parsed.origin}/`;
    } catch (error) {
      return null;
    }
    const normalised = normaliseString(candidate);
    if (!normalised) {
      return null;
    }
    const lower = normalised.toLowerCase();
    const nowTs = now();
    const expiresAt = nowTs + FAILOVER_BLOCK_DURATION_MS;
    const reason = typeof context.status === 'number' ? context.status : null;
    const existing = parseFailoverEntries().filter((entry) => entry.lower !== lower);
    const entry = { root: normalised, lower, expiresAt, reason };
    existing.push(entry);
    writeFailoverEntries(existing);
    return entry;
  };

  const parseFailoverBlocks = () => {
    return parseFailoverEntries().map(({ root, expiresAt }) => ({ root, expiresAt }));
  };

  const isCdnRootBlocked = () => parseFailoverBlocks().some((entry) => CDN_HOST_PATTERN.test(entry.root));

  const shouldForceLocalAssets = () => {
    const appConfig = scope.APP_CONFIG || {};
    const probeMode = normaliseString(appConfig.assetProbeMode).toLowerCase();
    if (probeMode === 'local-only') {
      return true;
    }
    const configuredRoot = normaliseString(appConfig.assetRoot);
    if (configuredRoot && !CDN_HOST_PATTERN.test(configuredRoot)) {
      return true;
    }
    const query = normaliseString(scope.location?.search);
    if (query.includes('localAssets=1') || /[?&]useLocalAssets(?:=1)?/i.test(query)) {
      return true;
    }
    if (isCdnRootBlocked()) {
      return true;
    }

    const locationRef = scope.location || {};
    const hostname = toLowerCase(locationRef.hostname);
    const protocol = toLowerCase(locationRef.protocol);
    if (protocol === 'file:') {
      return true;
    }

    const pendingCdnScripts = hasPendingCdnScripts();
    if (!pendingCdnScripts) {
      return false;
    }

    if (!hostname) {
      return true;
    }

    if (isLocalHostname(hostname)) {
      return true;
    }

    if (!CDN_HOST_PATTERN.test(hostname)) {
      return true;
    }

    return false;
  };

  const rewritePendingScriptsToLocal = () => {
    const documentRef = scope.document || null;
    if (!documentRef || typeof documentRef.querySelectorAll !== 'function') {
      return;
    }
    const current = documentRef.currentScript || null;
    const scripts = documentRef.querySelectorAll('script[src]') || [];
    scripts.forEach((script) => {
      if (!script || script === current) {
        return;
      }
      const absoluteSrc = normaliseString(script.src);
      if (!CDN_HOST_PATTERN.test(absoluteSrc)) {
        return;
      }
      const localSrc = resolveOriginalSrc(script);
      if (!localSrc) {
        return;
      }
      script.dataset = script.dataset || {};
      script.dataset.cdnRecoveryApplied = 'true';
      if (!script.dataset.localSrc) {
        script.dataset.localSrc = localSrc;
      }
      script.src = localSrc;
    });
  };

  if (shouldForceLocalAssets()) {
    clearStoredOverrides();
    ensureAppConfig();
    rewritePendingScriptsToLocal();
  }

  const resolveOriginalSrc = (element) => {
    if (!element || typeof element.getAttribute !== 'function') {
      return null;
    }
    const datasetSrc = element.dataset?.localSrc;
    if (typeof datasetSrc === 'string' && datasetSrc.trim()) {
      return datasetSrc.trim();
    }
    const attributeValue = element.getAttribute('src');
    if (!attributeValue) {
      return null;
    }
    if (!/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(attributeValue)) {
      return attributeValue;
    }
    return extractLocalSrcFromAbsolute(attributeValue);
  };

  const cloneAttributes = (source, target) => {
    if (!source || !target) {
      return;
    }
    if (source.type) {
      target.type = source.type;
    }
    if (source.noModule) {
      target.noModule = true;
    }
    if (source.crossOrigin) {
      target.crossOrigin = source.crossOrigin;
    }
    if (source.referrerPolicy) {
      target.referrerPolicy = source.referrerPolicy;
    }
    if (source.integrity) {
      target.integrity = source.integrity;
    }
    if (source.async) {
      target.async = true;
    }
    if (source.defer) {
      target.defer = true;
    }
  };

  const recoverFromScriptFailure = (event) => {
    const target = event?.target;
    if (!target || target.tagName !== 'SCRIPT') {
      return;
    }
    const absoluteSrc = normaliseString(target.src);
    if (!CDN_HOST_PATTERN.test(absoluteSrc)) {
      return;
    }
    if (target.dataset?.cdnRecoveryApplied === 'true') {
      return;
    }
    const localSrc = resolveOriginalSrc(target);
    if (!localSrc) {
      return;
    }

    clearStoredOverrides();
    ensureAppConfig();

    const replacement = scope.document?.createElement?.('script');
    const parent = target.parentNode || scope.document?.head || scope.document?.body || null;
    if (!replacement || !parent) {
      return;
    }

    cloneAttributes(target, replacement);
    replacement.dataset = replacement.dataset || {};
    replacement.dataset.cdnRecoveryApplied = 'true';
    if (!replacement.dataset.localSrc && target.dataset?.localSrc) {
      replacement.dataset.localSrc = target.dataset.localSrc;
    }
    replacement.src = localSrc;

    const blockEntry = registerFailoverBlock(absoluteSrc, { status: 403 });

    const logContext = { original: absoluteSrc, fallback: localSrc };
    if (blockEntry) {
      logContext.blockExpiresAt = blockEntry.expiresAt;
      if (typeof blockEntry.reason === 'number') {
        logContext.blockStatus = blockEntry.reason;
      }
    }
    try {
      scope.console?.warn?.('[InfiniteRails] CDN asset blocked — retrying with local bundle.', logContext);
    } catch (error) {
      /* ignore console failures */
    }

    try {
      rewritePendingScriptsToLocal();
    } catch (error) {
      /* ignore rewrite failures triggered during recovery */
    }

    parent.insertBefore(replacement, target.nextSibling || null);
    if (typeof parent.removeChild === 'function') {
      try {
        parent.removeChild(target);
      } catch (error) {
        /* ignore removal failures */
      }
    }
  };

  scope.addEventListener?.('error', recoverFromScriptFailure, true);
})(typeof window !== 'undefined' ? window : this);
