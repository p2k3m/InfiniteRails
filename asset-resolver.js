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
    if (typeof consoleRef.warn === 'function') {
      consoleRef.warn(message, details);
    } else if (typeof consoleRef.error === 'function') {
      consoleRef.error(message, details);
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
    seen.add(value);
    list.push(value);
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
  };

  scope.InfiniteRailsAssetResolver = resolver;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = resolver;
  }
})();
