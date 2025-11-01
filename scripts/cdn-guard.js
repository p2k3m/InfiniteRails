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

  const normaliseString = (value) => (typeof value === 'string' ? value : '');

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

    const logContext = { original: absoluteSrc, fallback: localSrc };
    try {
      scope.console?.warn?.('[InfiniteRails] CDN asset blocked — retrying with local bundle.', logContext);
    } catch (error) {
      /* ignore console failures */
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
