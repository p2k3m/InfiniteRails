  function bindFallbackModalControls({
    doc,
    trigger,
    modal,
    closeButtons = [],
    focusSelector,
    resolveFocusTarget,
    closeOnBackdrop = false,
  } = {}) {
    if (!doc || !trigger || !modal) {
      return;
    }
    const ensureAriaExpandedSync = () => {
      if (trigger && typeof trigger.setAttribute === 'function') {
        const expanded = modal.hidden === false;
        trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }
    };
    if (modal.dataset.modalFallbackBound === 'true') {
      ensureAriaExpandedSync();
      return;
    }
    const closeElements = Array.from(closeButtons).filter(Boolean);
    let lastTrigger = null;
    const findFocusTarget = () => {
      if (typeof resolveFocusTarget === 'function') {
        try {
          const resolved = resolveFocusTarget();
          if (resolved) {
            return resolved;
          }
        } catch (error) {
          doc?.defaultView?.console?.debug?.('Fallback modal focus resolver failed.', error);
        }
      }
      if (focusSelector) {
        return modal.querySelector(focusSelector);
      }
      return modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
    };
    const setInertState = (element, inert) => {
      if (!element) {
        return;
      }
      if (inert) {
        if (typeof element.setAttribute === 'function') {
          element.setAttribute('inert', '');
        }
        if ('inert' in element) {
          try {
            element.inert = true;
          } catch (error) {
            // ignore inert assignment failures
          }
        }
      } else {
        if (typeof element.removeAttribute === 'function') {
          element.removeAttribute('inert');
        }
        if ('inert' in element) {
          try {
            element.inert = false;
          } catch (error) {
            // ignore inert assignment failures
          }
        }
      }
    };
    const restoreFocus = () => {
      if (lastTrigger && typeof lastTrigger.focus === 'function') {
        try {
          lastTrigger.focus({ preventScroll: true });
        } catch (error) {
          lastTrigger.focus();
        }
      }
    };
    const setModalState = (open, { suppressFocus = false, skipRestore = false } = {}) => {
      if (!modal) {
        return;
      }
      if (open) {
        modal.hidden = false;
        if (typeof modal.setAttribute === 'function') {
          modal.setAttribute('aria-hidden', 'false');
        }
        setInertState(modal, false);
        if (trigger && typeof trigger.setAttribute === 'function') {
          trigger.setAttribute('aria-expanded', 'true');
        }
        if (!suppressFocus) {
          const focusTarget = findFocusTarget();
          if (focusTarget && typeof focusTarget.focus === 'function') {
            try {
              focusTarget.focus({ preventScroll: true });
            } catch (error) {
              focusTarget.focus();
            }
          }
        }
      } else {
        modal.hidden = true;
        if (typeof modal.setAttribute === 'function') {
          modal.setAttribute('aria-hidden', 'true');
        }
        setInertState(modal, true);
        if (trigger && typeof trigger.setAttribute === 'function') {
          trigger.setAttribute('aria-expanded', 'false');
        }
        if (!skipRestore) {
          restoreFocus();
        }
      }
    };
    const handleTriggerClick = (event) => {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      lastTrigger = event?.currentTarget || trigger;
      const open = modal.hidden !== false;
      setModalState(open, { suppressFocus: false, skipRestore: true });
    };
    trigger.addEventListener('click', handleTriggerClick);
    closeElements.forEach((btn) => {
      if (!btn.dataset.modalFallbackCloseBound) {
        btn.addEventListener('click', (event) => {
          if (event?.preventDefault) {
            event.preventDefault();
          }
          setModalState(false);
        });
        btn.dataset.modalFallbackCloseBound = 'true';
      }
    });
    modal.addEventListener('keydown', (event) => {
      if (!event) {
        return;
      }
      const key = typeof event.key === 'string' ? event.key : null;
      if (key && (key === 'Escape' || key === 'Esc')) {
        event.preventDefault();
        setModalState(false);
      }
    });
    if (closeOnBackdrop) {
      modal.addEventListener('click', (event) => {
        if (event?.target === modal) {
          setModalState(false);
        }
      });
    }
    ensureAriaExpandedSync();
    if (modal.hidden !== false) {
      setModalState(false, { suppressFocus: true, skipRestore: true });
    }
    modal.dataset.modalFallbackBound = 'true';
  }

  function ensureEssentialPanelFallbacks({ doc, ui, reason, detail } = {}) {
    const resolvedDoc = doc || documentRef || globalScope.document || null;
    if (!resolvedDoc) {
      return;
    }
    const flagKey = '__INFINITE_RAILS_ESSENTIAL_PANELS_FALLBACK_BOUND__';
    if (resolvedDoc[flagKey]) {
      return;
    }
    const settingsTrigger = resolvedDoc.getElementById('openSettings');
    const settingsModal = resolvedDoc.getElementById('settingsModal');
    const settingsClose = resolvedDoc.getElementById('closeSettings');
    bindFallbackModalControls({
      doc: resolvedDoc,
      trigger: settingsTrigger,
      modal: settingsModal,
      closeButtons: [settingsClose],
      focusSelector: '[data-settings-form] button, [data-settings-form] input, [data-settings-form] select',
    });
    const leaderboardTrigger = resolvedDoc.getElementById('openLeaderboard');
    const leaderboardModal = resolvedDoc.getElementById('leaderboardModal');
    const leaderboardClose = resolvedDoc.getElementById('closeLeaderboard');
    bindFallbackModalControls({
      doc: resolvedDoc,
      trigger: leaderboardTrigger,
      modal: leaderboardModal,
      closeButtons: [leaderboardClose],
      focusSelector: '#closeLeaderboard, #refreshScores',
      closeOnBackdrop: true,
    });
    const guideTrigger = resolvedDoc.getElementById('openGuide');
    const guideModal = resolvedDoc.getElementById('guideModal');
    const guideCloses = guideModal
      ? Array.from(guideModal.querySelectorAll('[data-close-guide]'))
      : [];
    bindFallbackModalControls({
      doc: resolvedDoc,
      trigger: guideTrigger,
      modal: guideModal,
      closeButtons: guideCloses,
      focusSelector: '[data-close-guide]',
    });
    resolvedDoc[flagKey] = {
      bound: true,
      reason: reason || null,
      detail: detail || null,
      uiSnapshot: ui || null,
    };
  }

  function createRendererFailureStub({ ui, doc, mode, reason, error } = {}) {
    const stub = {
      mode: normaliseRendererModeInput(mode) ?? 'simple',
      rendererUnavailable: true,
      ui: ui || {},
      doc: doc || null,
      failureReason: reason || null,
      failureError: error || null,
      apiBaseUrl: identityState.apiBaseUrl ?? null,
      started: false,
      start() {
        return false;
      },
      stop() {
        return false;
      },
      teardown() {
        return Promise.resolve({ stopped: false, destroyed: false });
      },
      isRunning() {
        return false;
      },
      loadScoreboard() {
        return Promise.resolve(null);
      },
    };
    return stub;
  }

    const doc = documentRef || globalScope.document || null;
    const prepareUiFallback = (reason, detail = {}) => {
      const detailObject = detail && typeof detail === 'object' ? detail : {};
      const uiSnapshot = detailObject.uiSnapshot || collectSimpleExperienceUi(doc);
      ensureEssentialPanelFallbacks({ doc, ui: uiSnapshot, reason, detail: detailObject });
      const fallbackInstance = createRendererFailureStub({
        ui: uiSnapshot,
        doc,
        mode,
        reason,
        error: detailObject.error ?? null,
      });
      updateActiveExperienceInstance(fallbackInstance);
      resetAmbientMusicRecoveryState();
      return fallbackInstance;
    };
      const fallbackInstance = prepareUiFallback('missing-simple-experience');
      return fallbackInstance;
      const fallbackInstance = prepareUiFallback('missing-canvas');
      return fallbackInstance;
      const fallbackInstance = prepareUiFallback(
        automationActive ? 'automation-driver-load' : 'simple-experience-create',
        { error, uiSnapshot: ui },
      );
      return fallbackInstance;
