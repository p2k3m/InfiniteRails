  function resolveBootstrapOverlayApi() {
    return (
      runtimeScope?.bootstrapOverlay ||
      runtimeScope?.InfiniteRails?.bootstrapOverlay ||
      runtimeScope?.__INFINITE_RAILS_BOOTSTRAP_OVERLAY__ ||
      null
    );
  }

  function resolveBootStatusApi(overlay) {
    if (overlay?.bootStatus && typeof overlay.bootStatus.update === 'function') {
      return overlay.bootStatus;
    }
    const directBootStatus = runtimeScope?.__infiniteRailsBootStatus;
    if (directBootStatus && typeof directBootStatus.update === 'function') {
      return directBootStatus;
    }
    const fallbackBootStatus = runtimeScope?.__infiniteRailsBootstrapFallback?.bootStatus;
    if (fallbackBootStatus && typeof fallbackBootStatus.update === 'function') {
      return fallbackBootStatus;
    }
    return null;
  }

  function logGltfOverlayFailure(message, detail = {}) {
    const overlay = resolveBootstrapOverlayApi();
    const normalisedMessage =
      typeof message === 'string' && message.trim().length
        ? message.trim()
        : 'Model assets failed to load — placeholder visuals active until assets recover.';

    const bootStatus = resolveBootStatusApi(overlay);
    if (bootStatus && typeof bootStatus.update === 'function') {
      try {
        bootStatus.update('gltf', { status: 'error', message: normalisedMessage });
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to update GLTF boot status overlay.', error);
        }
      }
    }

    if (overlay) {
      const diagnosticPayload = { status: 'error', message: normalisedMessage };
      if (detail && typeof detail === 'object' && Object.keys(detail).length > 0) {
        diagnosticPayload.detail = detail;
      }
      let diagnosticApplied = false;
      if (typeof overlay.setDiagnostic === 'function') {
        try {
          overlay.setDiagnostic('gltf', diagnosticPayload);
          diagnosticApplied = true;
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to update GLTF diagnostic overlay.', error);
          }
        }
      }
      if (!diagnosticApplied && typeof overlay.setDiagnostic === 'function') {
        try {
          overlay.setDiagnostic('assets', diagnosticPayload);
          diagnosticApplied = true;
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to update asset diagnostic overlay.', error);
          }
        }
      }
      if (typeof overlay.logEvent === 'function') {
        try {
          overlay.logEvent('gltf', normalisedMessage, { level: 'error', detail });
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to record GLTF overlay event.', error);
          }
        }
      }
    }

    return normalisedMessage;
  }

          this.handleAssetLoadFailure('steve', error, {
            fallbackMessage:
              'Explorer avatar failed to initialise — using placeholder rig until detailed models return.',
          });
          const fallbackOptions = {
            attempts: attemptsTried,
            url,
            loaderUnavailable,
          };
          if (loaderUnavailable) {
            fallbackOptions.fallbackMessage = this.buildModelLoaderFallbackMessage(key);
          }
    logModelOverlayFailure(key, message, context = {}) {
      const trimmedMessage = typeof message === 'string' ? message.trim() : '';
      if (!trimmedMessage) {
        return;
      }
      const summary =
        context.summary && typeof context.summary === 'object'
          ? context.summary
          : null;
      const options = context.options && typeof context.options === 'object' ? context.options : {};
      const overlayDetail = {};
      if (typeof key === 'string' && key.trim().length) {
        overlayDetail.key = key.trim();
      } else if (summary?.key) {
        overlayDetail.key = summary.key;
      }
      if (summary?.friendlyName) {
        overlayDetail.label = summary.friendlyName;
      } else if (typeof key === 'string' && key.trim().length) {
        overlayDetail.label = this.describeAssetKey(key);
      }
      if (summary?.debugLabel) {
        overlayDetail.assetLabel = summary.debugLabel;
      }
      if (summary?.fileName) {
        overlayDetail.fileName = summary.fileName;
      }
      if (summary?.primarySourceLabel) {
        overlayDetail.primarySourceLabel = summary.primarySourceLabel;
      }
      const primarySource =
        (typeof options.url === 'string' && options.url.trim().length
          ? options.url.trim()
          : null) || summary?.primarySource || null;
      if (primarySource) {
        overlayDetail.primarySource = primarySource;
      }
      if (Array.isArray(summary?.sources) && summary.sources.length) {
        overlayDetail.sources = summary.sources.slice(0, 5);
      }
      if (options?.loaderUnavailable === true) {
        overlayDetail.loaderUnavailable = true;
      }
      if (Number.isFinite(options?.attempts)) {
        overlayDetail.attempts = Math.max(1, Math.floor(options.attempts));
      }
      if (context.error) {
        overlayDetail.error = normaliseLiveDiagnosticError(context.error);
      }
      overlayDetail.fallbackMessage = trimmedMessage;
      logGltfOverlayFailure(trimmedMessage, overlayDetail);
    }

      this.logModelOverlayFailure(key, fallbackMessage, { error, summary, options });
