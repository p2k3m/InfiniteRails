/* Legacy CDN entrypoint shim: loads the canonical game bundle. */
(function loadLegacyIndex(globalScope, defaultSrc) {
  var scope =
    typeof globalScope === 'object' && globalScope !== null
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope) {
    return;
  }
  var documentRef = scope.document || null;
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    return;
  }

  var markerAttribute = 'data-infinite-rails-legacy-index-loader';
  var existingMarker = documentRef.querySelector('script[' + markerAttribute + ']');
  if (existingMarker) {
    return;
  }

  var configuredSrc = null;
  var config = scope.APP_CONFIG && typeof scope.APP_CONFIG === 'object' ? scope.APP_CONFIG : null;
  if (config && typeof config.legacyIndexScript === 'string') {
    var trimmed = config.legacyIndexScript.trim();
    if (trimmed) {
      configuredSrc = trimmed;
    }
  }
  if (!configuredSrc && config && typeof config.assetRoot === 'string' && config.assetRoot.trim()) {
    configuredSrc = config.assetRoot.replace(/\/*$/, '/') + 'script.js?v=d1a4cc7cfcdd.fbb0887537e5';
  }
  var targetSrc = configuredSrc || defaultSrc;
  if (!targetSrc) {
    return;
  }

  var normaliseUrl = function (value) {
    if (typeof value !== 'string' || !value) {
      return '';
    }
    try {
      return new URL(value, documentRef.baseURI || scope.location && scope.location.href || undefined).toString();
    } catch (error) {
      return value;
    }
  };

  var resolvedTarget = normaliseUrl(targetSrc);
  var scripts = Array.isArray(documentRef.scripts)
    ? Array.from(documentRef.scripts)
    : Array.from(documentRef.getElementsByTagName('script') || []);
  for (var i = 0; i < scripts.length; i += 1) {
    var candidate = scripts[i];
    var src = candidate.getAttribute ? candidate.getAttribute('src') : candidate.src;
    if (!src) {
      continue;
    }
    if (normaliseUrl(src) === resolvedTarget) {
      return;
    }
  }

  var scriptElement = documentRef.createElement('script');
  scriptElement.src = targetSrc;
  scriptElement.async = false;
  scriptElement.defer = false;
  try {
    scriptElement.setAttribute(markerAttribute, 'true');
  } catch (error) {
    // ignore attribute failures
  }

  var insertionPoint = documentRef.currentScript && documentRef.currentScript.parentNode
    ? documentRef.currentScript.parentNode
    : documentRef.head || documentRef.body || documentRef.documentElement || documentRef;
  if (insertionPoint && typeof insertionPoint.insertBefore === 'function' && documentRef.currentScript) {
    insertionPoint.insertBefore(scriptElement, documentRef.currentScript);
  } else if (insertionPoint && typeof insertionPoint.appendChild === 'function') {
    insertionPoint.appendChild(scriptElement);
  }
})(typeof globalThis !== 'undefined' ? globalThis : undefined, '../script.js?v=d1a4cc7cfcdd.fbb0887537e5');
