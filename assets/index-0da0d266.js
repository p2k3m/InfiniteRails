/* Legacy hashed entrypoint: delegate to the stable alias bundle. */
(function loadHashedAlias(globalScope) {
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
  var scriptElement = documentRef.createElement('script');
  scriptElement.src = './index-latest.js?v=cf083b4e740b.98a515a8178f';
  scriptElement.async = false;
  scriptElement.defer = false;
  var insertionPoint = documentRef.currentScript && documentRef.currentScript.parentNode
    ? documentRef.currentScript.parentNode
    : documentRef.head || documentRef.body || documentRef.documentElement || documentRef;
  if (insertionPoint && typeof insertionPoint.insertBefore === 'function' && documentRef.currentScript) {
    insertionPoint.insertBefore(scriptElement, documentRef.currentScript);
  } else if (insertionPoint && typeof insertionPoint.appendChild === 'function') {
    insertionPoint.appendChild(scriptElement);
  }
})(typeof globalThis !== 'undefined' ? globalThis : undefined);
