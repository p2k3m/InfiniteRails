  const essentialPanelFallbackState = {
    active: false,
    cleanupFns: [],
    modals: new Map(),
    triggers: new Map(),
    lastTriggers: new Map(),
    toggleModal: null,
  };

  function ensureEssentialPanelFallback(ui = {}) {
    const doc =
      ui?.settingsForm?.ownerDocument ||
      ui?.guideModal?.ownerDocument ||
      documentRef ||
      globalScope?.document ||
      (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      return false;
    }
    const state = essentialPanelFallbackState;
    if (state.active) {
      return true;
    }
    const modalEntries = [
      {
        key: 'settings',
        modal: doc.getElementById('settingsModal'),
        triggers: [doc.getElementById('openSettings')],
        closeButtons: [doc.getElementById('closeSettings')],
      },
      {
        key: 'leaderboard',
        modal: doc.getElementById('leaderboardModal'),
        triggers: [doc.getElementById('openLeaderboard')],
        closeButtons: [doc.getElementById('closeLeaderboard')],
      },
      {
        key: 'guide',
        modal: doc.getElementById('guideModal'),
        triggers: [doc.getElementById('openGuide'), doc.getElementById('landingGuideButton')],
        closeButtons: Array.from(doc.querySelectorAll('[data-close-guide]')),
      },
    ];
    const available = modalEntries.filter(
      (entry) =>
        entry.modal &&
        Array.isArray(entry.triggers) &&
        entry.triggers.some((trigger) => Boolean(trigger)),
    );
    if (!available.length) {
      return false;
    }

    state.active = true;
    state.cleanupFns = [];
    state.modals = new Map();
    state.triggers = new Map();
    state.lastTriggers = new Map();

    const registerCleanup = (fn) => {
      if (typeof fn === 'function') {
        state.cleanupFns.push(fn);
      }
    };

    const computeDefaultFocus = (entry) => {
      const closeCandidate = Array.isArray(entry.closeButtons)
        ? entry.closeButtons.find((button) => Boolean(button))
        : null;
      if (closeCandidate) {
        return closeCandidate;
      }
      const modal = entry.modal;
      if (!modal || typeof modal.querySelector !== 'function') {
        return modal ?? null;
      }
      const focusable = modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable) {
        return focusable;
      }
      if (typeof modal.setAttribute === 'function' && !modal.hasAttribute('tabindex')) {
        try {
          modal.setAttribute('tabindex', '-1');
          registerCleanup(() => {
            try {
              if (modal.getAttribute('tabindex') === '-1') {
                modal.removeAttribute('tabindex');
              }
            } catch (error) {}
          });
        } catch (error) {}
      }
      return modal;
    };

    available.forEach((entry) => {
      const closeButtons = Array.isArray(entry.closeButtons)
        ? entry.closeButtons.filter(Boolean)
        : [];
      const defaultFocus = computeDefaultFocus(entry);
      state.modals.set(entry.key, {
        modal: entry.modal,
        defaultFocus,
        closeButtons,
      });
    });

    const toggleModal = (key, open, options = {}) => {
      const entryState = state.modals.get(key);
      if (!entryState || !entryState.modal) {
        return false;
      }
      const modal = entryState.modal;
      const next = Boolean(open);
      const currentlyOpen = modal.dataset?.bootstrapFallbackOpen === 'true';
      if (next === currentlyOpen && !options.force) {
        return currentlyOpen;
      }
      if (next) {
        setElementHidden(modal, false);
        setAriaHidden(modal, false);
        toggleBooleanAttribute(modal, 'inert', false);
        if (modal.dataset) {
          modal.dataset.bootstrapFallbackOpen = 'true';
        }
        const focusTarget = options.focusTarget || entryState.defaultFocus || null;
        if (focusTarget && typeof focusTarget.focus === 'function') {
          try {
            focusTarget.focus({ preventScroll: true });
          } catch (error) {}
        } else if (typeof modal.focus === 'function') {
          try {
            modal.focus({ preventScroll: true });
          } catch (error) {}
        }
      } else {
        setAriaHidden(modal, true);
        toggleBooleanAttribute(modal, 'inert', true);
        setElementHidden(modal, true);
        if (modal.dataset && modal.dataset.bootstrapFallbackOpen) {
          delete modal.dataset.bootstrapFallbackOpen;
        }
        const trigger = state.lastTriggers.get(key) || null;
        if (!options.suppressFocusRestore && trigger && typeof trigger.focus === 'function') {
          try {
            trigger.focus({ preventScroll: true });
          } catch (error) {}
        }
        if (options.clearTrigger !== false) {
          state.lastTriggers.delete(key);
        }
      }
      const triggers = state.triggers.get(key);
      if (triggers) {
        triggers.forEach((trigger) => {
          if (!trigger || typeof trigger.setAttribute !== 'function') {
            return;
          }
          try {
            trigger.setAttribute('aria-expanded', next ? 'true' : 'false');
          } catch (error) {}
        });
      }
      return next;
    };

    state.toggleModal = toggleModal;

    available.forEach((entry) => {
      const triggerSet = new Set();
      (Array.isArray(entry.triggers) ? entry.triggers : []).forEach((trigger) => {
        if (!trigger || typeof trigger.addEventListener !== 'function') {
          return;
        }
        triggerSet.add(trigger);
        const handleOpen = (event) => {
          if (event?.preventDefault) {
            event.preventDefault();
          }
          state.lastTriggers.set(entry.key, trigger);
          toggleModal(entry.key, true);
        };
        trigger.addEventListener('click', handleOpen);
        registerCleanup(() => {
          try {
            trigger.removeEventListener('click', handleOpen);
          } catch (error) {}
        });
      });
      if (triggerSet.size) {
        state.triggers.set(entry.key, triggerSet);
      }
      const closeButtons = Array.isArray(entry.closeButtons)
        ? entry.closeButtons.filter(Boolean)
        : [];
      closeButtons.forEach((button) => {
        if (typeof button.addEventListener !== 'function') {
          return;
        }
        const handleClose = (event) => {
          if (event?.preventDefault) {
            event.preventDefault();
          }
          toggleModal(entry.key, false);
        };
        button.addEventListener('click', handleClose);
        registerCleanup(() => {
          try {
            button.removeEventListener('click', handleClose);
          } catch (error) {}
        });
      });
      const modal = entry.modal;
      if (modal && typeof modal.addEventListener === 'function') {
        const handleKeyDown = (event) => {
          const keyLabel = event?.key || event?.code || '';
          if (keyLabel === 'Escape' || keyLabel === 'Esc') {
            if (event?.preventDefault) {
              event.preventDefault();
            }
            toggleModal(entry.key, false);
          }
        };
        modal.addEventListener('keydown', handleKeyDown);
        registerCleanup(() => {
          try {
            modal.removeEventListener('keydown', handleKeyDown);
          } catch (error) {}
        });
        const handleBackdropClick = (event) => {
          if (event?.target === modal) {
            toggleModal(entry.key, false);
          }
        };
        modal.addEventListener('click', handleBackdropClick);
        registerCleanup(() => {
          try {
            modal.removeEventListener('click', handleBackdropClick);
          } catch (error) {}
        });
      }
    });

    return true;
  }

  function releaseEssentialPanelFallback(options = {}) {
    const state = essentialPanelFallbackState;
    if (!state.active) {
      return false;
    }
    const toggleModal = typeof state.toggleModal === 'function' ? state.toggleModal : null;
    const closeOpenModals = Boolean(options?.closeOpenModals);
    if (closeOpenModals && toggleModal) {
      Array.from(state.modals.keys()).forEach((key) => {
        toggleModal(key, false, { suppressFocusRestore: true, clearTrigger: true, force: true });
      });
    }
    state.cleanupFns.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {}
    });
    state.modals.forEach((entry) => {
      const modal = entry?.modal ?? null;
      if (modal?.dataset?.bootstrapFallbackOpen) {
        delete modal.dataset.bootstrapFallbackOpen;
      }
    });
    state.active = false;
    state.cleanupFns = [];
    state.modals = new Map();
    state.triggers = new Map();
    state.lastTriggers = new Map();
    state.toggleModal = null;
    return true;
  }

    ensureEssentialPanelFallback(ui);
      releaseEssentialPanelFallback();
