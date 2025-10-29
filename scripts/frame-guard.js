(function enforceTopLevelEmbedding(scope) {
  if (!scope || typeof scope !== 'object') {
    return;
  }
  const windowRef = scope.window || scope;
  try {
    if (windowRef.top && windowRef.top !== windowRef.self) {
      windowRef.top.location = windowRef.self.location;
    }
  } catch (error) {
    try {
      windowRef.location = windowRef.location.href;
    } catch (nestedError) {
      // ignore - some browsers disallow programmatic navigation when framed cross-origin
    }
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
