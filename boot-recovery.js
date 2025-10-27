(function setupBootRecoveryPrompts(globalScope) {
  const scope = globalScope || (typeof window !== 'undefined' ? window : globalThis);
  const documentRef = scope?.document ?? null;
  if (!documentRef) {
    return;
  }


  const overlayActions = documentRef.getElementById('globalOverlayActions');
  const overlayButton = documentRef.getElementById('globalOverlayRecoveryButton');
  const overlayRecoveryLabel = 'Reload & Diagnostics';
  if (overlayButton) {
    overlayButton.textContent = overlayRecoveryLabel;
  }

  const briefingActions = documentRef.getElementById('gameBriefingSupportActions');
  const briefingButton = documentRef.getElementById('gameBriefingRecoveryButton');
  if (briefingButton) {
    briefingButton.textContent = overlayRecoveryLabel;
  }

  const leaderboardOverlay = documentRef.getElementById('leaderboardOverlay');
  const leaderboardActions = documentRef.getElementById('leaderboardOverlayActions');
  const leaderboardReloadButton = documentRef.getElementById('leaderboardOverlayReload');
  const assetOverlayReloadButton = documentRef.getElementById('assetRecoveryReload');

  function refreshOverlayActionsVisibility() {
    if (!overlayActions) {
      return;
    }
    const hasVisibleChild = Array.from(overlayActions.children || []).some((child) => child.hidden !== true);
    const shouldHide = !hasVisibleChild;
    if (overlayActions.hidden !== shouldHide) {
      overlayActions.hidden = shouldHide;
    }
  }

  function refreshLeaderboardActionsVisibility() {
    if (!leaderboardActions) {
      return;
    }
    const hasVisibleChild = Array.from(leaderboardActions.children || []).some((child) => child.hidden !== true);
    const shouldHide = !hasVisibleChild;
    if (leaderboardActions.hidden !== shouldHide) {
      leaderboardActions.hidden = shouldHide;
    }
  }

  function setOverlayRecoveryVisibility(visible) {
    if (!overlayButton || !overlayActions) {
      return;
    }
    overlayButton.hidden = !visible;
    refreshOverlayActionsVisibility();
  }

  function setLeaderboardRecoveryVisibility(visible) {
    if (!leaderboardReloadButton || !leaderboardActions) {
      return;
    }
    leaderboardReloadButton.hidden = !visible;
    refreshLeaderboardActionsVisibility();
  }

  function setBriefingRecoveryVisibility(visible) {
    if (!briefingActions || !briefingButton) {
      return;
    }
    briefingActions.hidden = !visible;
    briefingButton.hidden = !visible;
  }

  let briefingEvaluationScheduled = false;

  function scheduleBriefingRecoveryEvaluation() {
    if (briefingEvaluationScheduled) {
      return;
    }
    briefingEvaluationScheduled = true;
    const scheduler =
      typeof scope?.requestAnimationFrame === 'function'
        ? (callback) => scope.requestAnimationFrame(callback)
        : typeof scope?.setTimeout === 'function'
          ? (callback) => scope.setTimeout(callback, 0)
          : (callback) => callback();
    scheduler(() => {
      briefingEvaluationScheduled = false;
      evaluateBriefingRecoveryVisibility();
    });
  }

  function normaliseMessage(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/\u2026/g, '...').toLowerCase();
  }

  function triggerBootReload(reason) {
    const source = typeof reason === 'string' && reason.trim().length ? reason.trim() : 'boot-recovery';
    const overlay = scope?.bootstrapOverlay ?? null;
    if (overlay && typeof overlay.showLoading === 'function') {
      try {
        overlay.showLoading({
          title: 'Reloading experience…',
          message: 'Attempting to recover the renderer interface.',
          reason: source,
        });
      } catch (error) {
        if (scope?.console && typeof scope.console.debug === 'function') {
          scope.console.debug('Failed to show boot recovery loading state.', error);
        }
      }
    }

    const renderers = scope?.InfiniteRails?.renderers ?? null;
    if (renderers && typeof renderers.reloadActive === 'function') {
      try {
        renderers.reloadActive({ reason: source });
        return;
      } catch (error) {
        if (scope?.console && typeof scope.console.debug === 'function') {
          scope.console.debug('Active renderer reload failed — falling back to location reload.', error);
        }
      }
    }

    if (scope?.location && typeof scope.location.reload === 'function') {
      try {
        scope.location.reload();
      } catch (error) {
        if (scope?.console && typeof scope.console.error === 'function') {
          scope.console.error('Boot recovery reload failed.', error);
        }
      }
    }
  }

  function evaluateOverlayRecoveryVisibility() {
    const overlay = documentRef.getElementById('globalOverlay');
    const overlayVisible = Boolean(overlay && overlay.hidden !== true && overlay.getAttribute('data-mode') === 'loading');
    const uiStatusElement = documentRef.getElementById('bootstrapStatusUi');
    const uiStatusMessage = normaliseMessage(uiStatusElement?.textContent || '');
    const uiStatusItem = documentRef.querySelector('[data-phase="ui"]');
    const phaseStatus = uiStatusItem?.getAttribute('data-status') || '';
    const uiWaiting = /preparing\s+interface/.test(uiStatusMessage);
    const shouldShow = overlayVisible && (uiWaiting || phaseStatus === 'error' || phaseStatus === 'warning');
    setOverlayRecoveryVisibility(shouldShow);
  }

  function evaluateBriefingRecoveryVisibility() {
    const briefing = documentRef.getElementById('gameBriefing');
    if (!briefing) {
      setBriefingRecoveryVisibility(false);
      return;
    }
    const fallbackNotice = briefing.querySelector('.game-briefing__fallback');
    const isVisible = briefing.hidden === false && (!briefing.classList || briefing.classList.contains('is-visible'));
    const shouldShow = Boolean(fallbackNotice && isVisible);
    setBriefingRecoveryVisibility(shouldShow);
  }

  function evaluateLeaderboardRecoveryVisibility() {
    if (!leaderboardOverlay || !leaderboardReloadButton) {
      setLeaderboardRecoveryVisibility(false);
      return;
    }
    const overlayVisible = leaderboardOverlay.hidden !== true;
    const mode = String(leaderboardOverlay.getAttribute('data-mode') || '').trim().toLowerCase();
    const fallbackActive = String(leaderboardOverlay.getAttribute('data-fallback-active') || '').trim().toLowerCase();
    const modeIndicatesProblem = /error|offline|fail|warn|degrad|recover/.test(mode);
    const fallbackIndicatesProblem = fallbackActive === 'true' || fallbackActive === '1' || fallbackActive === 'active';
    const shouldShow = overlayVisible && (modeIndicatesProblem || fallbackIndicatesProblem);
    setLeaderboardRecoveryVisibility(shouldShow);
  }

  if (overlayButton) {
    overlayButton.addEventListener('click', (event) => {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      triggerBootReload('overlay-recovery');
    });
  }

  if (assetOverlayReloadButton) {
    assetOverlayReloadButton.addEventListener('click', (event) => {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      triggerBootReload('asset-recovery');
    });
  }

  if (briefingButton) {
    briefingButton.addEventListener('click', (event) => {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      triggerBootReload('mission-briefing-recovery');
    });
  }

  if (leaderboardReloadButton) {
    leaderboardReloadButton.addEventListener('click', (event) => {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      triggerBootReload('leaderboard-recovery');
    });
  }

  const overlay = documentRef.getElementById('globalOverlay');
  if (overlay) {
    const observer = new MutationObserver(evaluateOverlayRecoveryVisibility);
    observer.observe(overlay, { attributes: true, attributeFilter: ['hidden', 'data-mode', 'data-fallback-active'] });
  }
  const uiStatusElement = documentRef.getElementById('bootstrapStatusUi');
  if (uiStatusElement) {
    const observer = new MutationObserver(evaluateOverlayRecoveryVisibility);
    observer.observe(uiStatusElement, { characterData: true, subtree: true, childList: true });
  }
  const uiStatusItem = documentRef.querySelector('[data-phase="ui"]');
  if (uiStatusItem) {
    const observer = new MutationObserver(evaluateOverlayRecoveryVisibility);
    observer.observe(uiStatusItem, { attributes: true, attributeFilter: ['data-status'] });
  }

  if (leaderboardOverlay) {
    const observer = new MutationObserver(evaluateLeaderboardRecoveryVisibility);
    observer.observe(leaderboardOverlay, { attributes: true, attributeFilter: ['hidden', 'data-mode'] });
  }

  if (leaderboardActions) {
    const observer = new MutationObserver(refreshLeaderboardActionsVisibility);
    observer.observe(leaderboardActions, {
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden'],
      childList: true,
      subtree: true,
    });
  }

  const briefing = documentRef.getElementById('gameBriefing');
  if (briefing) {
    const observer = new MutationObserver(scheduleBriefingRecoveryEvaluation);
    observer.observe(briefing, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true, subtree: true });
  }

  evaluateOverlayRecoveryVisibility();
  evaluateBriefingRecoveryVisibility();
  evaluateLeaderboardRecoveryVisibility();

  scope.__INFINITE_RAILS_BOOT_RECOVERY__ = {
    evaluateOverlayRecoveryVisibility,
    evaluateBriefingRecoveryVisibility,
    setOverlayRecoveryVisibility,
    setBriefingRecoveryVisibility,
    evaluateLeaderboardRecoveryVisibility,
    setLeaderboardRecoveryVisibility,
    triggerBootReload,
  };
})(this);

(function installDefaultAudioFallback(globalScope) {
  const scope =
    globalScope ||
    (typeof window !== 'undefined'
      ? window
      : typeof globalThis !== 'undefined'
        ? globalThis
        : null);
  if (!scope || scope.__INFINITE_RAILS_AUDIO_FALLBACK__) {
    return;
  }

  scope.__INFINITE_RAILS_AUDIO_FALLBACK__ = true;

  const consoleRef = scope.console || (typeof console !== 'undefined' ? console : null);
  const locationProtocol = typeof scope?.location?.protocol === 'string' ? scope.location.protocol.toLowerCase() : '';
  const automationActive = typeof scope?.navigator?.webdriver === 'boolean' ? scope.navigator.webdriver : false;
  const treatAudioFallbackAsWarning = automationActive || locationProtocol === 'file:';
  const eventTarget =
    typeof scope.addEventListener === 'function'
      ? scope
      : typeof scope.document?.addEventListener === 'function'
        ? scope.document
        : null;

  if (!eventTarget) {
    return;
  }

  function createBeepDataUri() {
    const sampleRate = 8000;
    const samples = 1200;
    const frequency = 880;
    const amplitude = 0.6;
    const headerSize = 44;
    const dataSize = samples * 2;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, text) => {
      for (let index = 0; index < text.length; index += 1) {
        view.setUint8(offset + index, text.charCodeAt(index));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, headerSize + dataSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const dataView = new DataView(buffer, headerSize);
    for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
      const rawSample = Math.sin((2 * Math.PI * frequency * sampleIndex) / sampleRate);
      const bounded = Math.max(-1, Math.min(1, rawSample * amplitude));
      dataView.setInt16(sampleIndex * 2, bounded * 0x7fff, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const slice = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...slice);
    }

    if (typeof btoa === 'function') {
      return `data:audio/wav;base64,${btoa(binary)}`;
    }

    if (typeof Buffer !== 'undefined') {
      return `data:audio/wav;base64,${Buffer.from(bytes).toString('base64')}`;
    }

    return 'data:audio/wav;base64,';
  }

  const beepDataUri = createBeepDataUri();
  const audioCtor = scope.Audio;
  const fallbackPool = [];

  const acquireFallbackAudio = () => {
    if (typeof audioCtor !== 'function') {
      return null;
    }

    const reusable = fallbackPool.find((entry) => entry && typeof entry.pause === 'function' && entry.paused !== false);
    if (reusable) {
      return reusable;
    }

    try {
      const element = new audioCtor(beepDataUri);
      element.preload = 'auto';
      element.loop = false;
      element.volume = 0.6;
      if (element.dataset) {
        element.dataset.infiniteRailsAudioFallback = 'beep';
      }
      const resetPlayback = () => {
        try {
          element.currentTime = 0;
        } catch (error) {
          if (consoleRef && typeof consoleRef.debug === 'function') {
            consoleRef.debug('Failed to reset fallback beep playback position.', error);
          }
        }
      };
      element.addEventListener('ended', resetPlayback);
      element.addEventListener('error', resetPlayback);
      fallbackPool.push(element);
      return element;
    } catch (error) {
      if (consoleRef && typeof consoleRef.debug === 'function') {
        consoleRef.debug('Unable to create fallback Audio element.', error);
      }
    }

    return null;
  };

  const playFallbackBeep = (detail = {}) => {
    const element = acquireFallbackAudio();
    if (!element) {
      return false;
    }

    const normalisedVolume = Math.max(0, Math.min(1, Number(detail.volume)));
    if (Number.isFinite(normalisedVolume)) {
      element.volume = normalisedVolume;
    }

    try {
      element.currentTime = 0;
    } catch (error) {}

    const result = typeof element.play === 'function' ? element.play() : null;
    if (result && typeof result.catch === 'function') {
      result.catch((error) => {
        if (consoleRef && typeof consoleRef.debug === 'function') {
          consoleRef.debug('Fallback beep playback failed.', error);
        }
      });
    }
    return true;
  };

  const normaliseName = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : '';
  };

  const buildDetailSummary = (detail, message) => {
    const summary = {
      code: typeof detail.code === 'string' ? detail.code : undefined,
      requestedName: normaliseName(detail.requestedName),
      resolvedName: normaliseName(detail.resolvedName),
      fallbackActive: true,
      missingSample: detail.missingSample === true,
      message,
    };
    if (detail.fallbackBeep && typeof detail.fallbackBeep === 'object') {
      summary.fallbackBeep = detail.fallbackBeep;
    }
    return summary;
  };

  const reportFallback = (detail, message) => {
    const summary = buildDetailSummary(detail, message);

    const logMethod =
      treatAudioFallbackAsWarning && consoleRef && typeof consoleRef.warn === 'function'
        ? consoleRef.warn.bind(consoleRef)
        : consoleRef && typeof consoleRef.error === 'function'
          ? consoleRef.error.bind(consoleRef)
          : null;
    if (logMethod) {
      const logMessage = 'Welcome audio playback test failed.';
      const payload = { detail: summary };
      try {
        logMethod(logMessage, payload);
      } catch (error) {
        logMethod(logMessage);
      }
    }

    const overlay = scope.bootstrapOverlay;
    if (!overlay) {
      return;
    }

    if (!treatAudioFallbackAsWarning && typeof overlay.showError === 'function') {
      try {
        overlay.showError({ title: 'Missing audio sample', message, detail: summary });
      } catch (error) {
        if (consoleRef && typeof consoleRef.debug === 'function') {
          consoleRef.debug('Failed to present audio fallback overlay error.', error);
        }
      }
    }

    if (typeof overlay.setDiagnostic === 'function') {
      try {
        overlay.setDiagnostic('audio', {
          status: treatAudioFallbackAsWarning ? 'warning' : 'error',
          message,
          detail: summary,
        });
      } catch (error) {
        if (consoleRef && typeof consoleRef.debug === 'function') {
          consoleRef.debug('Failed to set audio diagnostic entry.', error);
        }
      }
    }

    if (typeof overlay.logEvent === 'function') {
      try {
        overlay.logEvent('audio', message, {
          level: treatAudioFallbackAsWarning ? 'warning' : 'error',
          detail: summary,
        });
      } catch (error) {
        if (consoleRef && typeof consoleRef.debug === 'function') {
          consoleRef.debug('Failed to log audio fallback event.', error);
        }
      }
    }
  };

  const handleAudioError = (event) => {
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
    if (detail.__defaultAudioFallbackHandled) {
      return;
    }

    const code = typeof detail.code === 'string' ? detail.code : '';
    const missingSample = detail.missingSample === true || code === 'missing-sample';
    const playbackFailure = detail.loadFailed === true || code === 'playback-failed';
    if (!missingSample && !playbackFailure) {
      return;
    }

    detail.__defaultAudioFallbackHandled = true;
    detail.fallbackActive = true;
    if (missingSample) {
      detail.missingSample = true;
    }
    if (!detail.fallbackBeep || typeof detail.fallbackBeep !== 'object') {
      detail.fallbackBeep = { source: 'default', dataUri: beepDataUri };
    }

    const resolvedName = normaliseName(detail.resolvedName);
    const requestedName = normaliseName(detail.requestedName);
    const sampleName = resolvedName || requestedName || 'audio sample';
    const reason = missingSample ? 'is unavailable' : 'could not be loaded';
    const message = `Audio sample "${sampleName}" ${reason}. Playing fallback beep instead.`;
    detail.fallbackMessage = message;

    reportFallback(detail, message);
    playFallbackBeep(detail);
  };

  eventTarget.addEventListener('infinite-rails:audio-error', handleAudioError, { passive: true });

  const exposeFallbackApi = () => {
    const existing = scope.InfiniteRails && scope.InfiniteRails.audioFallback;
    const api = {
      getBeepDataUri: () => beepDataUri,
      playBeep: (options) => playFallbackBeep(options || {}),
      handleAudioError: (detail) => handleAudioError({ detail: detail || {} }),
    };

    if (!scope.InfiniteRails || typeof scope.InfiniteRails !== 'object') {
      scope.InfiniteRails = {};
    }

    if (existing && typeof existing === 'object') {
      existing.getBeepDataUri = api.getBeepDataUri;
      existing.playBeep = api.playBeep;
      existing.handleAudioError = api.handleAudioError;
    } else {
      scope.InfiniteRails.audioFallback = api;
    }
  };

  exposeFallbackApi();
})(this);
