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

  function formatCircuitBreakerMessage(message, scope = 'default') {
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

        const failureMessage =
          this.rendererFailureMessage || 'Critical assets failed to load.';
        this.presentRendererFailure(failureMessage, { stage: 'asset-load', scope: 'assets' });
          scope: 'renderer',
          const fallbackMessage = `Texture "${key}" failed to load — open Diagnostics → Assets to retry the download.`;
        const abortMessage = `Texture "${key}" failed to load.`;
                    fallbackMessage: `Texture "${key}" failed to load — open Diagnostics → Assets to retry the download.`,
                  this.abortDueToAssetFailure(`Texture "${key}" failed to load.`, {
        : 'Critical assets failed to load.';
          scope: 'assets',
        this.presentRendererFailure('Renderer recovery failed.', {
          scope: 'renderer',
      const message = `Rendering paused — a fatal error occurred while ${label}.`;
      this.presentRendererFailure(message, { error, stage, scope: 'renderer' });
          'WebGL output appears blocked. Enable hardware acceleration or disable extensions that prevent WebGL.',
          { stage: 'blank-frame', scope: 'renderer' },
      const scopeLabel =
        typeof details?.scope === 'string' && details.scope.trim().length
          ? details.scope.trim().toLowerCase()
          : 'renderer';
      const decoratedMessage = formatCircuitBreakerMessage(message, scopeLabel);
        console.error(decoratedMessage, details.error);
        console.error(decoratedMessage);
      this.rendererFailureMessage = decoratedMessage;
        this.playerHintEl.textContent = decoratedMessage;
        this.footerStatusEl.textContent = decoratedMessage;
      const failureDetail = {
        message: typeof decoratedMessage === 'string' ? decoratedMessage : 'Renderer unavailable',
        scope: scopeLabel,
      };
      this.presentRendererFailure('Rendering paused — WebGL context lost.', { scope: 'renderer' });
        `${capitalised} AI offline — AI scripts could not attach ${friendly} actors to the world.`;
      this.presentRendererFailure(message, { ...failureDetails, scope: 'models' });
        `Critical input error detected while ${label}.`,
        { error, stage: `event:${label}`, scope: 'input' }
          (friendly
            ? `Critical asset ${friendly} failed to load.`
            : 'Critical assets failed to load.');
        return 'Critical assets failed to load after multiple attempts. Use “Retry Assets” or open Diagnostics → Assets for guided recovery.';
      let message = `${capitalised} failed to load after multiple attempts. Use “Retry Assets” or open Diagnostics → Assets for guided recovery.`;
      this.showHint('Use “Retry Assets” or open Diagnostics → Assets to restore missing files.');
