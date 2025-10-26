    const scope =
      globalScope ||
      (typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
    const automationActive = typeof isAutomationContext === 'function' ? isAutomationContext(scope) : false;
    const locationProtocol = typeof scope?.location?.protocol === 'string' ? scope.location.protocol.toLowerCase() : '';
    const treatAsWarning = automationActive || locationProtocol === 'file:';
    const logLevel = treatAsWarning ? 'warn' : 'error';
    if (consoleRef?.[logLevel]) {
      consoleRef[logLevel]('Welcome audio playback test failed.', { detail: failureDetail });
      logDiagnosticsEvent('audio', normalizedMessage, {
        level: treatAsWarning ? 'warning' : 'error',
        detail: failureDetail,
        timestamp,
      });
    if (!treatAsWarning && typeof presentCriticalErrorOverlay === 'function') {
        bootstrapOverlay.setDiagnostic('audio', {
          status: treatAsWarning ? 'warning' : 'error',
          message: normalizedMessage,
        });
