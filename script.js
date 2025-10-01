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
    const originalApiBaseUrl = globalAppConfig?.apiBaseUrl ?? null;
    const sanitisedApiBaseUrl = normaliseApiBaseUrl(originalApiBaseUrl);
    if (globalAppConfig && typeof globalAppConfig === 'object') {
      globalAppConfig.apiBaseUrl = sanitisedApiBaseUrl;
    }
          apiBaseUrl: normaliseApiBaseUrl(window.APP_CONFIG?.apiBaseUrl ?? null),
      apiBaseUrl: sanitisedApiBaseUrl,
    if (originalApiBaseUrl && !sanitisedApiBaseUrl) {
      identityState.scoreboardMessage =
        'Configured API endpoint is invalid. Using local leaderboard entries until it is updated.';
    }
