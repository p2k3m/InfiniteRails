(function () {
  const scope =
    (typeof window !== 'undefined' && window) ||
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof global !== 'undefined' && global) ||
    {};

  if (scope.InfiniteRailsAssetResolver) {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = scope.InfiniteRailsAssetResolver;
    }
    return;
  }

  const assetWarningDeduper = new Set();

  const DEFAULT_ASSET_VERSION_TAG = '1';

  function normaliseAssetVersionTag(value) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : '';
    }
    if (typeof value?.toString === 'function') {
      const stringified = String(value).trim();
      return stringified.length > 0 ? stringified : '';
    }
    return '';
  }

  function resolveAssetVersionTag() {
    const config = scope?.APP_CONFIG && typeof scope.APP_CONFIG === 'object' ? scope.APP_CONFIG : null;
    const configured = normaliseAssetVersionTag(config?.assetVersionTag);
    if (configured) {
      scope.INFINITE_RAILS_ASSET_VERSION_TAG = configured;
      return configured;
    }

    const ambient = normaliseAssetVersionTag(scope?.INFINITE_RAILS_ASSET_VERSION_TAG);
    if (ambient) {
      if (config) {
        config.assetVersionTag = ambient;
      }
      return ambient;
    }

    if (config) {
      config.assetVersionTag = DEFAULT_ASSET_VERSION_TAG;
    }
    if (scope) {
      scope.INFINITE_RAILS_ASSET_VERSION_TAG = DEFAULT_ASSET_VERSION_TAG;
    }
    return DEFAULT_ASSET_VERSION_TAG;
  }

  function applyAssetVersionTag(url) {
    if (typeof url !== 'string' || url.length === 0) {
      return url;
    }
    if (/^(?:data|blob):/i.test(url)) {
      return url;
    }

    const versionTag = resolveAssetVersionTag();
    if (!versionTag) {
      return url;
    }

    const [base, hash = ''] = url.split('#', 2);
    if (/(?:^|[?&])assetVersion=/.test(base)) {
      return url;
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(base)) {
      try {
        const parsed = new URL(url);
        if (!parsed.searchParams.has('assetVersion')) {
          parsed.searchParams.set('assetVersion', versionTag);
        }
        return parsed.toString();
      } catch (error) {
        // Fall through to manual fallback when URL construction fails (e.g. relative paths).
      }
    }

    const separator = base.includes('?') ? '&' : '?';
    const tagged = `${base}${separator}assetVersion=${encodeURIComponent(versionTag)}`;
    return hash ? `${tagged}#${hash}` : tagged;
  }

  resolveAssetVersionTag();

  function logAssetIssue(message, error, context = {}) {
    const consoleRef = scope.console || (typeof console !== 'undefined' ? console : null);
    if (!consoleRef) {
      return;
    }
    const sortedKeys = Object.keys(context).sort();
    const dedupeKey = `${message}|${sortedKeys.map((key) => `${key}:${context[key]}`).join(',')}`;
    if (assetWarningDeduper.has(dedupeKey)) {
      return;
    }
    assetWarningDeduper.add(dedupeKey);
    const details = { ...context };
    if (error) {
      details.error = error;
    }
    if (typeof consoleRef.error === 'function') {
      consoleRef.error(message, details);
    } else if (typeof consoleRef.warn === 'function') {
      consoleRef.warn(message, details);
    }
  }

  function normaliseAssetBase(base) {
    if (!base || typeof base !== 'string') {
      return null;
    }
    try {
      const resolved = new URL(base, scope?.location?.href ?? undefined);
      if (!resolved) return null;
      let href = resolved.href;
      if (!href.endsWith('/')) {
        href += '/';
      }
      return href;
    } catch (error) {
      logAssetIssue(
        'Invalid asset base URL encountered; ignoring configuration value. Update APP_CONFIG.assetBaseUrl to a fully-qualified directory URL (ending with a slash) so CDN assets can be resolved.',
        error,
        { base },
      );
      return null;
    }
  }

  function pushCandidate(list, seen, value) {
    if (!value || seen.has(value)) {
      return;
    }
    const versioned = applyAssetVersionTag(value);
    if (!versioned || seen.has(versioned)) {
      return;
    }
    seen.add(versioned);
    list.push(versioned);
  }

  function createAssetUrlCandidates(relativePath) {
    if (!relativePath || typeof relativePath !== 'string') {
      return [];
    }
    const candidates = [];
    const seen = new Set();

    const configBase = normaliseAssetBase(scope.APP_CONFIG?.assetBaseUrl ?? null);
    if (configBase) {
      try {
        pushCandidate(candidates, seen, new URL(relativePath, configBase).href);
      } catch (error) {
        logAssetIssue(
          'Failed to resolve asset URL using configured base; falling back to defaults. Verify APP_CONFIG.assetBaseUrl points to an accessible asset root or remove the override to use built-in paths.',
          error,
          { base: scope.APP_CONFIG?.assetBaseUrl ?? null, relativePath }
        );
      }
    }

    const documentRef = typeof document !== 'undefined' ? document : null;
    const windowRef = typeof window !== 'undefined' ? window : null;

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
          const scriptUrl = new URL(currentScript.src, windowRef?.location?.href);
          const scriptDir = scriptUrl.href.replace(/[^/]*$/, '');
          pushCandidate(candidates, seen, new URL(relativePath, scriptDir).href);
          pushCandidate(candidates, seen, new URL(relativePath, `${scriptUrl.origin}/`).href);
        } catch (error) {
          logAssetIssue(
            'Unable to derive asset URL from current script location; trying alternative fallbacks. Ensure script.js is served from the asset bundle root or configure APP_CONFIG.assetBaseUrl explicitly.',
            error,
            { scriptSrc: currentScript?.src ?? null, relativePath }
          );
        }
      }

      if (documentRef.baseURI) {
        try {
          pushCandidate(candidates, seen, new URL(relativePath, documentRef.baseURI).href);
        } catch (error) {
          logAssetIssue(
            'Document base URI produced an invalid asset URL; continuing with other fallbacks. Review the <base href> element so it references the directory that hosts your Infinite Rails assets.',
            error,
            { baseURI: documentRef.baseURI, relativePath }
          );
        }
      }
    }

    if (windowRef?.location) {
      try {
        pushCandidate(candidates, seen, new URL(relativePath, `${windowRef.location.origin}/`).href);
      } catch (error) {
        logAssetIssue(
          'Window origin fallback failed while resolving asset URL; relying on relative paths. Confirm window.location.origin is reachable or configure APP_CONFIG.assetBaseUrl to bypass this fallback.',
          error,
          { origin: windowRef?.location?.origin ?? null, relativePath }
        );
      }
    }

    pushCandidate(candidates, seen, relativePath);

    return candidates;
  }

  function resolveAssetUrl(relativePath) {
    const candidates = createAssetUrlCandidates(relativePath);
    return candidates.length ? candidates[0] : relativePath;
  }

  const resolver = {
    normaliseAssetBase,
    createAssetUrlCandidates,
    resolveAssetUrl,
    applyAssetVersionTag,
  };

  scope.InfiniteRailsAssetResolver = resolver;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = resolver;
    if (typeof Object.defineProperty === 'function') {
      Object.defineProperty(module.exports, 'default', {
        value: resolver,
        enumerable: false,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(module.exports, '__esModule', {
        value: true,
        enumerable: false,
        configurable: true,
      });
    } else {
      module.exports.default = resolver;
      module.exports.__esModule = true;
    }
  }
})();
