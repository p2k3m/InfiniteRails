(function injectAutomationDriver(globalScope) {
  const scope =
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

  const navigatorRef = typeof scope.navigator !== 'undefined' ? scope.navigator : null;
  let isAutomation = false;
  try {
    isAutomation = Boolean(navigatorRef && navigatorRef.webdriver);
  } catch (error) {
    isAutomation = false;
  }

  if (!isAutomation) {
    return;
  }

  try {
    const doc = scope.document;
    if (!doc || typeof doc.createElement !== 'function') {
      return;
    }
    const script = doc.createElement('script');
    script.src = 'test-driver.js';
    script.async = false;
    script.defer = false;
    script.dataset = script.dataset || {};
    script.dataset.injected = 'automation';
    doc.head?.appendChild(script);
  } catch (injectionError) {
    try {
      scope.console?.warn?.('[Automation] Failed to inject test driver.', injectionError);
    } catch (consoleError) {
      // ignore console failures
    }
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
