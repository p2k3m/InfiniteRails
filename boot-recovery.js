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

  function refreshOverlayActionsVisibility() {
    if (!overlayActions) {
      return;
    }
    const hasVisibleChild = Array.from(overlayActions.children || []).some((child) => child.hidden !== true);
    overlayActions.hidden = !hasVisibleChild;
  }

  function setOverlayRecoveryVisibility(visible) {
    if (!overlayButton || !overlayActions) {
      return;
    }
    overlayButton.hidden = !visible;
    refreshOverlayActionsVisibility();
  }

  function setBriefingRecoveryVisibility(visible) {
    if (!briefingActions || !briefingButton) {
      return;
    }
    briefingActions.hidden = !visible;
    briefingButton.hidden = !visible;
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

  if (overlayButton) {
    overlayButton.addEventListener('click', (event) => {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      triggerBootReload('overlay-recovery');
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

  const briefing = documentRef.getElementById('gameBriefing');
  if (briefing) {
    const observer = new MutationObserver(evaluateBriefingRecoveryVisibility);
    observer.observe(briefing, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true, subtree: true });
  }

  evaluateOverlayRecoveryVisibility();
  evaluateBriefingRecoveryVisibility();

  scope.__INFINITE_RAILS_BOOT_RECOVERY__ = {
    evaluateOverlayRecoveryVisibility,
    evaluateBriefingRecoveryVisibility,
    setOverlayRecoveryVisibility,
    setBriefingRecoveryVisibility,
    triggerBootReload,
  };
})(this);
