      message: 'Open Diagnostics → Assets to restore missing files, or reload manually if prompted.',
    message = 'An unexpected error occurred. Open Diagnostics for recovery steps before restarting.',
      userMessage: 'The game failed to initialise. Open Diagnostics → Renderer for recovery steps before restarting.',
      diagnosticMessage: 'Bootstrap sequence failed. Review Diagnostics → Renderer before restarting.',
      logMessage: 'Bootstrap sequence failed. Player prompted to follow Diagnostics → Renderer recovery steps.',
      userMessage: 'Failed to initialise the renderer. Open Diagnostics → Renderer for recovery guidance before restarting.',
      diagnosticMessage: 'Failed to initialise the renderer. Review Diagnostics → Renderer for recovery guidance.',
      logMessage: 'Failed to initialise the renderer. Player prompted to follow Diagnostics → Renderer recovery guidance.',
      userMessage: 'We hit a snag while starting the expedition. Open Diagnostics → Renderer for recovery steps before restarting.',
      userMessage: 'The tutorial overlay failed to open. Open Diagnostics → Renderer for recovery steps before restarting.',
      userMessage: 'An unexpected error occurred. Open Diagnostics for recovery steps before restarting.',
  const CIRCUIT_BREAKER_GUIDANCE = Object.freeze({
    renderer:
      'Open Diagnostics → Renderer to review the error details and follow the recovery steps before restarting.',
    assets:
      'Open Diagnostics → Assets to retry the missing downloads or activate the offline pack before restarting.',
    models:
      'Open Diagnostics → Models to retry the missing downloads or contact support with the listed files before restarting.',
    input:
      'Open Diagnostics → Renderer to review the input error and follow the recovery steps before restarting.',
    default:
      'Open Diagnostics to review the issue and follow the recovery steps before restarting.',
  });

  function appendCircuitBreakerGuidance(message, scope = 'default') {
    const trimmed = typeof message === 'string' ? message.trim() : '';
    const scopeKey = typeof scope === 'string' && scope.trim().length ? scope.trim().toLowerCase() : 'default';
    const guidance = CIRCUIT_BREAKER_GUIDANCE[scopeKey] || CIRCUIT_BREAKER_GUIDANCE.default;
    if (!trimmed) {
      return guidance;
    }
    const normalised = trimmed.toLowerCase();
    if (normalised.includes('diagnostic') || normalised.includes('support.infiniterails.app')) {
      return trimmed;
    }
    const separator = trimmed.endsWith('.') ? ' ' : '. ';
    return `${trimmed}${separator}${guidance}`;
  }

    const scope =
      typeof detail?.scope === 'string' && detail.scope.trim().length
        ? detail.scope.trim().toLowerCase()
        : 'renderer';
        : 'Renderer unavailable';
      let message = baseMessage;
      if (stage && !message.includes(`(${stage})`)) {
        message = `${message} (${stage})`;
      }
      return appendCircuitBreakerGuidance(message, scope);
    const debugMessage = extras.length ? `${baseMessage}\n\n${extras.join('\n')}` : baseMessage;
    return appendCircuitBreakerGuidance(debugMessage, scope);
      const scopeLabel =
        typeof detail.scope === 'string' && detail.scope.trim().length
          ? detail.scope.trim().toLowerCase()
          : 'renderer';
      if (typeof detail.message === 'string' && detail.message.trim().length) {
        detail.message = appendCircuitBreakerGuidance(detail.message, scopeLabel);
      } else {
        detail.message = appendCircuitBreakerGuidance('Renderer unavailable', scopeLabel);
    const rendererMessage = appendCircuitBreakerGuidance('Unable to load the 3D renderer.', 'renderer');
    const diagnosticMessage = appendCircuitBreakerGuidance('Three.js failed to load.', 'renderer');
      message: rendererMessage,
      diagnosticMessage,
          message: rendererMessage,
          message: diagnosticMessage,
      message: rendererMessage,
              : 'Critical assets failed to preload.';
          const actionableMessage = appendCircuitBreakerGuidance(errorMessage, 'assets');
            message: actionableMessage,
            diagnosticMessage: actionableMessage,
            logMessage: actionableMessage,
          markBootPhaseError('assets', actionableMessage);
          markBootPhaseError('gltf', appendCircuitBreakerGuidance('Critical models unavailable — cannot continue.', 'models'));
          markBootPhaseError('controls', appendCircuitBreakerGuidance('Controls disabled until assets load.', 'assets'));
              message: actionableMessage,
        userMessage: 'Fallback renderer failed to start. Open Diagnostics → Renderer for recovery steps before restarting.',
          userMessage: 'Renderer entrypoint is missing from the build output. Open Diagnostics → Renderer for recovery steps before restarting.',
