    message = 'An unexpected error occurred. Open Diagnostics → Recovery to run “Safe Restart”.',
      userMessage: 'The game failed to initialise. Open Diagnostics → Recovery and run “Safe Restart”.',
      diagnosticMessage: 'Bootstrap sequence failed. Run Safe Restart from Diagnostics.',
      logMessage: 'Bootstrap sequence failed. Run Safe Restart from Diagnostics.',
      userMessage: 'Failed to initialise the renderer. Open Diagnostics → Recovery and run “Safe Restart”.',
      diagnosticMessage: 'Failed to initialise the renderer. Safe Restart required.',
      logMessage: 'Failed to initialise the renderer. Safe Restart required.',
      userMessage: 'We hit a snag while starting the expedition. Open Diagnostics → Recovery and run “Safe Restart”.',
      diagnosticMessage: 'Gameplay start failed. Safe Restart required.',
      logMessage: 'Gameplay start failed. Safe Restart required.',
      userMessage: 'The tutorial overlay failed to open. Open Diagnostics → Recovery and run “Safe Restart”.',
      diagnosticMessage: 'Tutorial overlay failed to open. Safe Restart recommended.',
      logMessage: 'Tutorial overlay failed to open. Safe Restart recommended.',
      userMessage: 'An unexpected error occurred. Open Diagnostics → Recovery to run “Safe Restart”.',
      diagnosticMessage: 'Unexpected runtime error detected. Safe Restart recommended.',
      logMessage: 'Unexpected runtime error detected. Safe Restart recommended.',
  const CRITICAL_FAILURE_GUIDANCE = Object.freeze({
    renderer:
      'Open Diagnostics → Recovery and run “Safe Restart” to relaunch the renderer without reloading the page.',
    assets:
      'Open Diagnostics → Assets and choose “Retry missing assets” to fetch the missing files or promote a Safe Restart.',
    models:
      'Open Diagnostics → Assets and run “Retry missing models” to rebuild the scene, or follow up with Safe Restart.',
    input:
      'Open Diagnostics → Recovery and use “Safe Restart” to rebuild the control bindings before trying again.',
    default:
      'Open Diagnostics → Recovery for Safe Restart options or contact support if the issue continues.',
  });

  const CRITICAL_FAILURE_CIRCUIT_SCOPES = new Set(['renderer', 'assets', 'models', 'input']);

  function normaliseFailureScope(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed.length) {
      return null;
    }
    const lower = trimmed.toLowerCase();
    if (CRITICAL_FAILURE_GUIDANCE[lower]) {
      return lower;
    }
    if (lower.includes('render')) {
      return 'renderer';
    }
    if (lower.includes('model') || lower.includes('gltf') || lower.includes('mesh')) {
      return 'models';
    }
    if (lower.includes('asset') || lower.includes('texture')) {
      return 'assets';
    }
    if (lower.includes('input') || lower.includes('control') || lower.includes('pointer')) {
      return 'input';
    }
    return lower;
  }

  function resolveCriticalFailureScope(detail, fallback = 'default') {
    const candidates = [];
    if (detail && typeof detail === 'object') {
      candidates.push(detail.scope, detail.diagnosticScope, detail.kind, detail.category, detail.stage, detail.reason);
    }
    candidates.push(fallback);
    for (const candidate of candidates) {
      const scope = normaliseFailureScope(candidate);
      if (scope && (CRITICAL_FAILURE_GUIDANCE[scope] || CRITICAL_FAILURE_CIRCUIT_SCOPES.has(scope))) {
        return scope;
      }
    }
    return 'default';
  }

  function buildActionableFailureMessage(message, scope = 'default') {
    const baseRaw = typeof message === 'string' ? message : '';
    const base = baseRaw.trim() ? baseRaw : '';
    const resolvedScope = normaliseFailureScope(scope) || 'default';
    const guidance =
      CRITICAL_FAILURE_GUIDANCE[resolvedScope] ||
      (resolvedScope.includes('asset') ? CRITICAL_FAILURE_GUIDANCE.assets : CRITICAL_FAILURE_GUIDANCE.default);
    if (!guidance) {
      return base;
    }
    if (base.includes(guidance)) {
      return base;
    }
    if (!base) {
      return guidance;
    }
    const trimmedBase = base.replace(/\s+$/, '');
    if (trimmedBase.includes('\n')) {
      return `${trimmedBase}\n\n${guidance}`;
    }
    const separator = /[.!?]\s*$/.test(trimmedBase) ? ' ' : '. ';
    return `${trimmedBase}${separator}${guidance}`;
  }

  function shouldTripCriticalFailureCircuit(scope) {
    const resolved = normaliseFailureScope(scope);
    return resolved ? CRITICAL_FAILURE_CIRCUIT_SCOPES.has(resolved) : false;
  }

  const criticalFailureCircuitState = { tripped: false, reason: null, timestamp: 0 };

  function triggerCriticalFailureCircuitBreaker(reason, detail = {}, scope = null) {
    const normalizedReason =
      typeof reason === 'string' && reason.trim().length ? reason.trim() : 'unknown-critical-failure';
    if (
      criticalFailureCircuitState.tripped &&
      criticalFailureCircuitState.reason === normalizedReason &&
      Date.now() - criticalFailureCircuitState.timestamp < 500
    ) {
      return false;
    }
    criticalFailureCircuitState.tripped = true;
    criticalFailureCircuitState.reason = normalizedReason;
    criticalFailureCircuitState.timestamp = Date.now();
    const resolvedScope = scope ? normaliseFailureScope(scope) : resolveCriticalFailureScope(detail, null);
    const consoleRef = globalScope?.console || (typeof console !== 'undefined' ? console : null);
    if (consoleRef?.warn) {
      try {
        consoleRef.warn('Critical failure detected; halting game loop.', {
          reason: normalizedReason,
          scope: resolvedScope || null,
        });
      } catch (warnError) {
        globalScope?.console?.debug?.('Failed to emit critical failure warning.', warnError);
      }
    }
    let halted = false;
    const instance = activeExperienceInstance;
    if (instance && typeof instance === 'object') {
      if (typeof instance.rendererUnavailable === 'boolean') {
        instance.rendererUnavailable = true;
      }
      if (typeof instance.started === 'boolean') {
        instance.started = false;
      }
      if (typeof instance.stop === 'function') {
        try {
          const stopResult = instance.stop({
            reason: `critical-error:${normalizedReason}`,
            scope: resolvedScope || undefined,
          });
          halted = true;
          if (stopResult && typeof stopResult.catch === 'function') {
            stopResult.catch((error) => {
              globalScope?.console?.debug?.('Critical failure stop promise rejected.', error);
            });
          }
        } catch (stopError) {
          globalScope?.console?.debug?.('Failed to stop active experience after critical failure.', stopError);
          try {
            instance.stop();
            halted = true;
          } catch (secondaryStopError) {
            globalScope?.console?.debug?.(
              'Fallback stop invocation failed after critical failure.',
              secondaryStopError,
            );
          }
        }
      }
    }
    if (!halted && typeof performEmergencyShutdown === 'function') {
      try {
        const shutdownResult = performEmergencyShutdown({
          source: 'critical-error-circuit',
          reason: `critical-error:${normalizedReason}`,
          mode: detail?.mode ?? detail?.rendererMode ?? undefined,
          showHud: false,
        });
        halted = true;
        if (shutdownResult && typeof shutdownResult.catch === 'function') {
          shutdownResult.catch((error) => {
            globalScope?.console?.debug?.('Emergency shutdown failed for critical failure circuit.', error);
          });
        }
      } catch (shutdownError) {
        globalScope?.console?.debug?.('Failed to trigger emergency shutdown after critical failure.', shutdownError);
      }
    }
    return halted;
  }

        : 'Renderer unavailable — diagnostics required.';
      const combined = stage ? `${baseMessage} (${stage})` : baseMessage;
      return buildActionableFailureMessage(combined, 'renderer');
    const debugMessage = extras.length ? `${baseMessage}\n\n${extras.join('\n')}` : baseMessage;
    return buildActionableFailureMessage(debugMessage, 'renderer');
        detail.message = 'Renderer unavailable — diagnostics required.';
      const failureScope = resolveCriticalFailureScope(detail, 'renderer');
      detail.failureScope = failureScope;
      if (shouldTripCriticalFailureCircuit(failureScope)) {
        triggerCriticalFailureCircuitBreaker('renderer-failure', { ...detail }, failureScope);
      }
      const failureScope = resolveCriticalFailureScope(detail, 'assets');
      detail.failureScope = failureScope;
      const actionableDecorated = buildActionableFailureMessage(decoratedFriendly, failureScope);
      const actionableOverlay = buildActionableFailureMessage(overlayBase, failureScope);
        message: actionableDecorated,
      const overlayMessage = networkCircuitBreaker.prefixOfflineMessage(actionableOverlay);
      const diagnosticMessage = networkCircuitBreaker.prefixOfflineMessage(actionableDecorated);
      if (shouldTripCriticalFailureCircuit(failureScope)) {
        const circuitReason = failureScope === 'models' ? 'model-failure' : 'asset-failure';
        triggerCriticalFailureCircuitBreaker(circuitReason, { ...detail }, failureScope);
      }
      const failureScope = resolveCriticalFailureScope({ ...detail, stage }, 'renderer');
      detail.failureScope = failureScope;
      const actionableDiagnostic = buildActionableFailureMessage(diagnosticMessage, failureScope);
      const actionableOverlay = buildActionableFailureMessage(overlayMessage, failureScope);
        message: actionableOverlay,
        diagnosticMessage: actionableDiagnostic,
        message: actionableOverlay,
        diagnosticMessage: actionableDiagnostic,
        logMessage: actionableDiagnostic,
      if (shouldTripCriticalFailureCircuit(failureScope)) {
        const circuitReason =
          failureScope === 'models' ? 'model-start-error' : failureScope === 'input' ? 'input-start-error' : 'renderer-start-error';
        triggerCriticalFailureCircuitBreaker(circuitReason, { ...detail, stage }, failureScope);
      }
      const failureScope = resolveCriticalFailureScope({ ...detail, stage }, 'renderer');
      detail.failureScope = failureScope;
      const actionableDiagnostic = buildActionableFailureMessage(diagnosticMessage, failureScope);
      const actionableOverlay = buildActionableFailureMessage(overlayMessage, failureScope);
        message: actionableOverlay,
        diagnosticMessage: actionableDiagnostic,
        message: actionableOverlay,
        diagnosticMessage: actionableDiagnostic,
        logMessage: actionableDiagnostic,
      if (shouldTripCriticalFailureCircuit(failureScope)) {
        const circuitReason =
          failureScope === 'models'
            ? 'model-initialisation-error'
            : failureScope === 'input'
              ? 'input-initialisation-error'
              : 'renderer-initialisation-error';
        triggerCriticalFailureCircuitBreaker(circuitReason, { ...detail, stage }, failureScope);
      }
      message: 'Unable to load the 3D renderer. Open Diagnostics → Recovery and run “Safe Restart”.',
      diagnosticMessage: 'Three.js failed to load. Run Safe Restart from Diagnostics.',
          message: 'Unable to load the 3D renderer. Open Diagnostics → Recovery and run “Safe Restart”.',
          message: 'Three.js failed to load. Run Safe Restart from Diagnostics.',
      message: 'Unable to load the 3D renderer. Open Diagnostics → Recovery and run “Safe Restart”.',
              : 'Critical assets failed to preload. Open Diagnostics → Assets to retry missing assets or run “Safe Restart”.';
            message:
              'Critical assets failed to preload. Open Diagnostics → Assets to retry missing assets or run “Safe Restart”.',
            diagnosticMessage:
              'Critical assets failed to preload. Open Diagnostics → Assets to retry missing assets or run “Safe Restart”.',
            logMessage:
              'Critical assets failed to preload. Open Diagnostics → Assets to retry missing assets or run “Safe Restart”.',
          markBootPhaseError(
            'assets',
            'Critical assets failed to preload. Open Diagnostics → Assets to retry missing assets or run “Safe Restart”.',
          );
        userMessage: 'Fallback renderer failed to start. Open Diagnostics → Recovery and run “Safe Restart”.',
          userMessage:
            'Renderer entrypoint is missing from the build output. Open Diagnostics → Recovery and run “Safe Restart”, then contact support.',
