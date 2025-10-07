      this.inputOverlayEl = this.ui.inputOverlay || null;
      this.inputOverlayDismissButton = this.ui.inputOverlayDismissButton || null;
      this.inputOverlayPointerMoveEl = this.ui.inputOverlayPointerMove || null;
      this.inputOverlayPointerInteractEl = this.ui.inputOverlayPointerInteract || null;
      this.inputOverlayPointerPlaceEl = this.ui.inputOverlayPointerPlace || null;
      this.inputOverlayPointerCraftEl = this.ui.inputOverlayPointerCraft || null;
      this.inputOverlayActive = false;
      this.inputOverlayHideTimer = null;
      this.inputOverlayAutoHideTimer = null;
      this.onDismissInputOverlay = this.handleInputOverlayDismiss.bind(this);
      this.refreshInputOverlayContent();
        this.showInputOverlay({ reason: 'start' });
    refreshInputOverlayContent() {
      const overlay = this.inputOverlayEl;
      if (!overlay) {
        return;
      }
      const prefersTouch = this.detectTouchPreferred();
      const scheme = prefersTouch ? 'touch' : 'pointer';
      if (typeof overlay.setAttribute === 'function') {
        try {
          overlay.setAttribute('data-scheme', scheme);
        } catch (error) {}
        try {
          overlay.setAttribute('data-mode', scheme);
        } catch (error) {}
      }
      if (overlay.dataset) {
        overlay.dataset.scheme = scheme;
        overlay.dataset.mode = scheme;
        overlay.dataset.controlScheme = scheme;
        overlay.dataset.touchPreferred = prefersTouch ? 'true' : 'false';
      }
      if (!prefersTouch) {
        if (this.inputOverlayPointerMoveEl) {
          this.inputOverlayPointerMoveEl.textContent = this.getMovementKeySummary({
            joiner: ' · ',
            fallback: 'W · A · S · D',
          });
        }
        if (this.inputOverlayPointerInteractEl) {
          const interact = formatKeyListForSentence(this.getActionKeyLabels('interact', { limit: 2 }), {
            fallback: 'F',
          });
          this.inputOverlayPointerInteractEl.textContent = interact;
        }
        if (this.inputOverlayPointerPlaceEl) {
          const place = formatKeyListForSentence(this.getActionKeyLabels('placeBlock', { limit: 2 }), {
            fallback: 'Q',
          });
          this.inputOverlayPointerPlaceEl.textContent = place;
        }
        if (this.inputOverlayPointerCraftEl) {
          const craft = formatKeyListForSentence(this.getActionKeyLabels('toggleCrafting', { limit: 2 }), {
            fallback: 'E',
          });
          this.inputOverlayPointerCraftEl.textContent = craft;
        }
      }
    }

    cancelInputOverlayHide() {
      if (!this.inputOverlayHideTimer) {
        return;
      }
      const scope = typeof window !== 'undefined' ? window : globalThis;
      scope.clearTimeout(this.inputOverlayHideTimer);
      this.inputOverlayHideTimer = null;
    }

    cancelInputOverlayAutoHide() {
      if (!this.inputOverlayAutoHideTimer) {
        return;
      }
      const scope = typeof window !== 'undefined' ? window : globalThis;
      scope.clearTimeout(this.inputOverlayAutoHideTimer);
      this.inputOverlayAutoHideTimer = null;
    }

    scheduleInputOverlayAutoHide(seconds = 6) {
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return;
      }
      const scope = typeof window !== 'undefined' ? window : globalThis;
      this.cancelInputOverlayAutoHide();
      this.inputOverlayAutoHideTimer = scope.setTimeout(() => {
        this.inputOverlayAutoHideTimer = null;
        this.hideInputOverlay();
      }, seconds * 1000);
    }

    showInputOverlay(options = {}) {
      const overlay = this.inputOverlayEl;
      if (!overlay) {
        return;
      }
      this.refreshInputOverlayContent();
      this.cancelInputOverlayHide();
      this.cancelInputOverlayAutoHide();
      overlay.hidden = false;
      overlay.classList.add('is-visible');
      overlay.dataset.visible = 'true';
      safelySetAriaHidden(overlay, false);
      this.inputOverlayActive = true;
      const autoHideSeconds = Number.isFinite(options.autoHideSeconds)
        ? options.autoHideSeconds
        : this.detectTouchPreferred()
          ? 7
          : 5;
      this.scheduleInputOverlayAutoHide(autoHideSeconds);
    }

    hideInputOverlay(immediate = false) {
      const overlay = this.inputOverlayEl;
      if (!overlay) {
        return;
      }
      this.cancelInputOverlayAutoHide();
      this.cancelInputOverlayHide();
      const finalize = () => {
        overlay.classList.remove('is-visible');
        overlay.hidden = true;
        overlay.dataset.visible = 'false';
        safelySetAriaHidden(overlay, true);
        this.inputOverlayHideTimer = null;
      };
      if (!this.inputOverlayActive && !immediate) {
        return;
      }
      this.inputOverlayActive = false;
      if (immediate) {
        finalize();
        return;
      }
      overlay.classList.remove('is-visible');
      overlay.addEventListener('transitionend', finalize, { once: true });
      const scope = typeof window !== 'undefined' ? window : globalThis;
      this.inputOverlayHideTimer = scope.setTimeout(finalize, 320);
    }

    handleInputOverlayDismiss(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      if (event?.stopPropagation) {
        event.stopPropagation();
      }
      this.markInteraction();
      this.hideInputOverlay(true);
    }

      this.hideInputOverlay(true);
      this.cancelInputOverlayAutoHide();
      this.cancelInputOverlayHide();
        this.refreshInputOverlayContent();
      this.refreshInputOverlayContent();
        this.refreshInputOverlayContent();
      this.refreshInputOverlayContent();
      this.refreshInputOverlayContent();
      this.hideInputOverlay();
      this.refreshInputOverlayContent();
      if (this.inputOverlayDismissButton) {
        add(this.inputOverlayDismissButton, 'click', this.onDismissInputOverlay, 'dismissing input overlay');
      }
      this.cancelInputOverlayAutoHide();
      this.cancelInputOverlayHide();
      this.hideInputOverlay(true);
        this.hideInputOverlay(true);
