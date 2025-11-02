(function initialiseCdnGuardLoader(globalScope) {
  const scope =
    globalScope && typeof globalScope === 'object'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope) {
    return;
  }

  const documentRef = scope.document || null;
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    return;
  }

  const currentScript = documentRef.currentScript;
  const loaderScript =
    currentScript && currentScript.dataset && currentScript.dataset.scriptSrc
      ? currentScript
      : documentRef.querySelector('script[data-script-src]');
  if (!loaderScript) {
    return;
  }

  const readAttribute = (name) => {
    const value = loaderScript.getAttribute(name);
    return typeof value === 'string' ? value.trim() : '';
  };

  const scriptSrc =
    readAttribute('data-script-src') ||
    readAttribute('data-primary-src') ||
    readAttribute('data-local-src') ||
    'scripts/cdn-guard.js';
  const fallbackSrc = readAttribute('data-fallback-src') || readAttribute('data-local-src') || scriptSrc;

  const parent = loaderScript.parentNode || documentRef.head || documentRef.body || null;
  if (!parent || typeof parent.insertBefore !== 'function') {
    return;
  }

  const resolveUrl = (value) => {
    if (!value) {
      return '';
    }
    const base = loaderScript.src || scope.location?.href || undefined;
    try {
      return new URL(value, base).toString();
    } catch (error) {
      try {
        return new URL(value, scope.location?.href || undefined).toString();
      } catch (_) {
        return value;
      }
    }
  };

  const primaryUrl = resolveUrl(scriptSrc);
  const fallbackUrl = resolveUrl(fallbackSrc);
  const hasDistinctFallback = Boolean(fallbackSrc) && fallbackSrc !== scriptSrc;
  if (!primaryUrl) {
    return;
  }

  const guardScript = documentRef.createElement('script');
  guardScript.async = false;
  guardScript.dataset = guardScript.dataset || {};
  if (fallbackSrc) {
    guardScript.dataset.localSrc = fallbackSrc;
    guardScript.setAttribute('data-local-src', fallbackSrc);
  }

  let attemptedFallback = false;

  const handleError = () => {
    if (attemptedFallback || !fallbackUrl || (!hasDistinctFallback && fallbackUrl === guardScript.src)) {
      attemptedFallback = true;
      guardScript.removeEventListener('error', handleError);
      if (scope.console && typeof scope.console.error === 'function') {
        scope.console.error('[InfiniteRails] Failed to load CDN guard script.', {
          primary: primaryUrl,
          fallback: fallbackUrl || null,
        });
      }
      return;
    }
    attemptedFallback = true;
    guardScript.dataset.cdnRecoveryApplied = 'true';
    guardScript.src = fallbackSrc;
  };

  const handleLoad = () => {
    guardScript.removeEventListener('error', handleError);
  };

  guardScript.addEventListener('error', handleError);
  guardScript.addEventListener('load', handleLoad, { once: true });
  guardScript.src = scriptSrc;

  if (loaderScript.nextSibling) {
    parent.insertBefore(guardScript, loaderScript.nextSibling);
  } else {
    parent.appendChild(guardScript);
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
