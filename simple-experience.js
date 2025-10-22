  function getBootstrapOverlay() {
    return (
      null
    );
  }

  function displayAudioFallbackOverlay(message, detail = {}) {
    const overlay = getBootstrapOverlay();
  function logModelFailureToOverlay(key, message, detail = {}) {
    const overlay = getBootstrapOverlay();
    if (!overlay) {
      return false;
    }
    const normalisedKey = typeof key === 'string' && key.trim().length ? key.trim() : 'asset';
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const fallbackMessage = trimmedMessage || 'Model load failure — placeholder visuals active until assets recover.';
    const failureCount = Number.isFinite(detail.failureCount) ? Math.max(1, Math.floor(detail.failureCount)) : null;
    const overlayDetail = {
      key: normalisedKey,
      failureCount,
      fallbackActive: detail.fallbackActive !== false,
      reason: typeof detail.reason === 'string' && detail.reason.trim().length ? detail.reason.trim() : null,
      assetLabel: detail.assetSummary?.friendlyName ?? null,
      assetFileName: detail.assetSummary?.fileName ?? null,
      assetSource: detail.assetSummary?.primarySource ?? null,
      assetSourceLabel: detail.assetSummary?.primarySourceLabel ?? null,
      assetSources: Array.isArray(detail.assetSummary?.sources)
        ? detail.assetSummary.sources.slice(0, 6)
        : [],
      errorName: typeof detail.errorName === 'string' && detail.errorName.trim().length ? detail.errorName.trim() : null,
      errorMessage:
        typeof detail.errorMessage === 'string' && detail.errorMessage.trim().length
          ? detail.errorMessage.trim()
          : null,
    };
    let recorded = false;
    const diagnosticPayload = {
      status: 'error',
      key: normalisedKey,
      message: fallbackMessage,
      failureCount,
      fallbackActive: overlayDetail.fallbackActive,
      reason: overlayDetail.reason,
      assetLabel: overlayDetail.assetLabel,
      assetSource: overlayDetail.assetSource,
      assetSourceLabel: overlayDetail.assetSourceLabel,
    };
    try {
      if (typeof overlay.setDiagnostic === 'function') {
        overlay.setDiagnostic('models', diagnosticPayload);
        recorded = true;
      }
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('Unable to update model overlay diagnostic.', error);
      }
    }
    try {
      if (detail.showError === true && typeof overlay.showError === 'function') {
        overlay.showError({
          title:
            typeof detail.overlayTitle === 'string' && detail.overlayTitle.trim().length
              ? detail.overlayTitle.trim()
              : 'Model load failure',
          message: fallbackMessage,
          key: normalisedKey,
        });
        recorded = true;
      }
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('Unable to display model failure overlay message.', error);
      }
    }
    try {
      if (typeof overlay.logEvent === 'function') {
        overlay.logEvent('models', fallbackMessage, {
          level: detail.level || 'error',
          detail: overlayDetail,
        });
        recorded = true;
      }
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('Unable to record model failure overlay event.', error);
      }
    }
    return recorded;
  }

          if (!error?.__assetFailureHandled) {
            this.handleAssetLoadFailure('steve', error);
          }
          if (!error?.__assetFailureHandled) {
            this.handleAssetLoadFailure('zombie', error);
          }
          if (!error?.__assetFailureHandled) {
            this.handleAssetLoadFailure('golem', error);
          }
      if (error && typeof error === 'object') {
        try {
          error.__assetFailureHandled = true;
        } catch (flagError) {
          // Ignore setter issues on error objects without writable properties.
        }
      const normalisedKey = typeof key === 'string' && key.trim().length ? key.trim() : 'asset';
      const failureCount = this.assetFailureCounts.get(normalisedKey) || 1;
      logModelFailureToOverlay(normalisedKey, fallbackMessage, {
        failureCount,
        fallbackActive: true,
        reason: options.reason || null,
        assetSummary: summary,
        errorName: error?.name ?? null,
        errorMessage: error?.message ?? null,
      });
      const dedupeKey = `${normalisedKey}|${fallbackMessage}`;
