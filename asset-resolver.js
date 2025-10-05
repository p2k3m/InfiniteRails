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
  const signedUrlExpiryChecks = new Set();

  const SIGNED_URL_IMMINENT_EXPIRY_WINDOW_MS = 24 * 60 * 60 * 1000;
  const SIGNED_URL_ALERT_EVENT = 'infinite-rails:signed-url-expiry';

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

  function getSearchParamEntries(searchParams) {
    if (!searchParams || typeof searchParams.entries !== 'function') {
      return [];
    }
    const entries = [];
    for (const [key, value] of searchParams.entries()) {
      entries.push({
        key,
        value,
        lowerKey: typeof key === 'string' ? key.toLowerCase() : String(key ?? '').toLowerCase(),
      });
    }
    return entries;
  }

  function findParam(entries, target) {
    const lowerTarget = target.toLowerCase();
    return entries.find((entry) => entry.lowerKey === lowerTarget) ?? null;
  }

  function parseAwsIsoTimestamp(value) {
    if (typeof value !== 'string' || !/^[0-9]{8}T[0-9]{6}Z$/.test(value)) {
      return Number.NaN;
    }
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(
      11,
      13,
    )}:${value.slice(13, 15)}Z`;
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function parseIntegerSeconds(value) {
    if (typeof value !== 'string') {
      return Number.NaN;
    }
    const trimmed = value.trim();
    if (!/^-?[0-9]+$/.test(trimmed)) {
      return Number.NaN;
    }
    const numeric = Number.parseInt(trimmed, 10);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  }

  function parseUnixTimestamp(value) {
    const seconds = parseIntegerSeconds(value);
    if (!Number.isFinite(seconds)) {
      return Number.NaN;
    }
    if (Math.abs(seconds) < 1_000_000_000_000) {
      return seconds * 1000;
    }
    return seconds;
  }

  function analyseSignedUrl(parsedUrl) {
    if (!parsedUrl || typeof parsedUrl.searchParams !== 'object') {
      return { isSigned: false };
    }
    const entries = getSearchParamEntries(parsedUrl.searchParams);
    if (entries.length === 0) {
      return { isSigned: false };
    }

    const awsExpires = findParam(entries, 'X-Amz-Expires');
    const awsDate = findParam(entries, 'X-Amz-Date');
    const gcsExpires = findParam(entries, 'X-Goog-Expires');
    const gcsDate = findParam(entries, 'X-Goog-Date');
    const genericExpires = findParam(entries, 'Expires');
    const azureExpiry = findParam(entries, 'se');

    const isSigned = Boolean(awsExpires || gcsExpires || genericExpires || azureExpiry);
    if (!isSigned) {
      return { isSigned: false };
    }

    if (awsExpires) {
      const durationSeconds = parseIntegerSeconds(awsExpires.value);
      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        const startTime = parseAwsIsoTimestamp(awsDate?.value ?? '');
        if (Number.isFinite(startTime)) {
          return {
            isSigned: true,
            expiresAt: startTime + durationSeconds * 1000,
            expirySource: 'aws',
          };
        }
        return {
          isSigned: true,
          expiresAt: Number.NaN,
          expirySource: 'aws',
          failure: 'missing-signed-start-time',
        };
      }
      return {
        isSigned: true,
        expiresAt: Number.NaN,
        expirySource: 'aws',
        failure: 'invalid-expiry-duration',
      };
    }

    if (gcsExpires) {
      const durationSeconds = parseIntegerSeconds(gcsExpires.value);
      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        const startTime = parseAwsIsoTimestamp(gcsDate?.value ?? '');
        if (Number.isFinite(startTime)) {
          return {
            isSigned: true,
            expiresAt: startTime + durationSeconds * 1000,
            expirySource: 'gcs',
          };
        }
        return {
          isSigned: true,
          expiresAt: Number.NaN,
          expirySource: 'gcs',
          failure: 'missing-signed-start-time',
        };
      }
      return {
        isSigned: true,
        expiresAt: Number.NaN,
        expirySource: 'gcs',
        failure: 'invalid-expiry-duration',
      };
    }

    if (genericExpires) {
      const timestamp = parseUnixTimestamp(genericExpires.value);
      if (Number.isFinite(timestamp)) {
        return {
          isSigned: true,
          expiresAt: timestamp,
          expirySource: 'generic-expires',
        };
      }
      return {
        isSigned: true,
        expiresAt: Number.NaN,
        expirySource: 'generic-expires',
        failure: 'invalid-unix-expiry',
      };
    }

    if (azureExpiry) {
      const parsed = Date.parse(azureExpiry.value);
      if (Number.isFinite(parsed)) {
        return {
          isSigned: true,
          expiresAt: parsed,
          expirySource: 'azure',
        };
      }
      return {
        isSigned: true,
        expiresAt: Number.NaN,
        expirySource: 'azure',
        failure: 'invalid-iso-expiry',
      };
    }

    return { isSigned: true, expiresAt: Number.NaN, expirySource: null, failure: 'unrecognised-signed-url' };
  }

  function dispatchSignedUrlAlert(detail) {
    if (!detail || typeof detail !== 'object') {
      return;
    }
    const target =
      (scope.document && typeof scope.document.dispatchEvent === 'function' && scope.document) ||
      (typeof scope.dispatchEvent === 'function' ? scope : null);
    if (!target) {
      return;
    }
    const payload = { ...detail };
    const eventType = SIGNED_URL_ALERT_EVENT;
    try {
      if (typeof scope.CustomEvent === 'function') {
        target.dispatchEvent(new scope.CustomEvent(eventType, { detail: payload }));
        return;
      }
      if (typeof scope.Event === 'function') {
        const event = new scope.Event(eventType);
        event.detail = payload;
        target.dispatchEvent(event);
      }
    } catch (error) {
      logAssetIssue(
        'Failed to dispatch signed URL expiry alert event. Downstream monitors may miss impending CDN credential rotation.',
        error,
        payload,
      );
    }
  }

  function monitorSignedAssetUrl(rawBaseUrl, resolvedUrl, relativePath) {
    const referenceStrings = [];
    if (typeof rawBaseUrl === 'string') {
      referenceStrings.push(rawBaseUrl);
    }
    if (typeof resolvedUrl === 'string') {
      referenceStrings.push(resolvedUrl);
    }
    if (!referenceStrings.length) {
      return;
    }

    let parsed = null;
    for (const value of referenceStrings) {
      try {
        parsed = new URL(value, scope?.location?.href ?? undefined);
        break;
      } catch (error) {
        // Continue trying other representations.
      }
    }

    if (!parsed) {
      return;
    }

    const dedupeKey = typeof rawBaseUrl === 'string' ? rawBaseUrl : `${parsed.origin}|${parsed.search}`;
    if (signedUrlExpiryChecks.has(dedupeKey)) {
      return;
    }
    signedUrlExpiryChecks.add(dedupeKey);

    const analysis = analyseSignedUrl(parsed);
    if (!analysis.isSigned) {
      return;
    }

    const context = {
      assetBaseUrl: typeof rawBaseUrl === 'string' ? rawBaseUrl : null,
      candidateUrl: typeof resolvedUrl === 'string' ? resolvedUrl : parsed.href,
      relativePath: relativePath ?? null,
      expiresAtIso: Number.isFinite(analysis.expiresAt) ? new Date(analysis.expiresAt).toISOString() : null,
      expirySource: analysis.expirySource,
    };

    if (!Number.isFinite(analysis.expiresAt)) {
      context.reason = analysis.failure ?? 'unknown-expiry-evaluation-failure';
      logAssetIssue(
        'Signed asset URL detected but expiry could not be determined. Rotate APP_CONFIG.assetBaseUrl proactively to avoid runtime 403s.',
        null,
        context,
      );
      return;
    }

    const now = Date.now();
    const remainingMs = analysis.expiresAt - now;
    context.millisecondsUntilExpiry = remainingMs;

    if (remainingMs <= 0) {
      context.severity = 'expired';
      logAssetIssue(
        'Signed asset URL has expired; asset requests will fail until credentials are refreshed. Update APP_CONFIG.assetBaseUrl immediately.',
        null,
        context,
      );
      dispatchSignedUrlAlert(context);
      return;
    }

    if (remainingMs <= SIGNED_URL_IMMINENT_EXPIRY_WINDOW_MS) {
      context.severity = 'warning';
      logAssetIssue(
        'Signed asset URL expires soon; rotate credentials or refresh APP_CONFIG.assetBaseUrl to avoid CDN outages.',
        null,
        context,
      );
      dispatchSignedUrlAlert(context);
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

    const rawConfiguredBase = scope.APP_CONFIG?.assetBaseUrl ?? null;
    const configBase = normaliseAssetBase(rawConfiguredBase);
    if (configBase) {
      try {
        const resolved = new URL(relativePath, configBase).href;
        monitorSignedAssetUrl(rawConfiguredBase, resolved, relativePath);
        pushCandidate(candidates, seen, resolved);
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
          const fromScriptDir = new URL(relativePath, scriptDir).href;
          monitorSignedAssetUrl(currentScript.src, fromScriptDir, relativePath);
          pushCandidate(candidates, seen, fromScriptDir);

          const fromScriptOrigin = new URL(relativePath, `${scriptUrl.origin}/`).href;
          monitorSignedAssetUrl(currentScript.src, fromScriptOrigin, relativePath);
          pushCandidate(candidates, seen, fromScriptOrigin);
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
          const fromBaseUri = new URL(relativePath, documentRef.baseURI).href;
          monitorSignedAssetUrl(documentRef.baseURI, fromBaseUri, relativePath);
          pushCandidate(candidates, seen, fromBaseUri);
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
        const fromWindowOrigin = new URL(relativePath, `${windowRef.location.origin}/`).href;
        const rawLocationBase =
          typeof windowRef.location.href === 'string'
            ? windowRef.location.href
            : typeof windowRef.location.origin === 'string'
              ? `${windowRef.location.origin}/`
              : null;
        monitorSignedAssetUrl(rawLocationBase, fromWindowOrigin, relativePath);
        pushCandidate(candidates, seen, fromWindowOrigin);
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
