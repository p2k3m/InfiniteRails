  const DEFAULT_OVERLAY_FOCUS_SELECTORS = [
    '[data-focus-default]',
    '[data-focus-target]',
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[role="button"]',
    '[role="menuitem"]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
  ];

  function focusWithinElement(root, options = {}) {
    const element = root || null;
    if (!element) {
      return false;
    }
    const { selectors = DEFAULT_OVERLAY_FOCUS_SELECTORS, preferredTarget = null, fallbackToRoot = true } =
      typeof options === 'object' && options
        ? options
        : {};

    if (preferredTarget && focusElementSilently(preferredTarget)) {
      return true;
    }

    if (typeof element.querySelectorAll === 'function') {
      for (const selector of Array.isArray(selectors) ? selectors : DEFAULT_OVERLAY_FOCUS_SELECTORS) {
        if (!selector) {
          continue;
        }
        let matches;
        try {
          matches = element.querySelectorAll(selector);
        } catch (error) {
          matches = null;
        }
        if (!matches) {
          continue;
        }
        for (const candidate of matches) {
          if (!candidate || candidate === element) {
            continue;
          }
          if (focusElementSilently(candidate)) {
            return true;
          }
        }
      }
    }

    if (fallbackToRoot && typeof element.focus === 'function') {
      if (typeof element.getAttribute === 'function' && element.getAttribute('tabindex') === null) {
        element.setAttribute('tabindex', '-1');
      }
      if (focusElementSilently(element)) {
        return true;
      }
    }

    return false;
  }

      this.lastCraftingTrigger = null;
      this.lastInventoryTrigger = null;
        const preferredIntroFocus = this.startButtonEl && typeof this.startButtonEl.focus === 'function'
          ? this.startButtonEl
          : this.introModalEl;
        focusWithinElement(this.introModalEl, { preferredTarget: preferredIntroFocus });
        const preferredFocus =
          (options?.focusTarget && typeof options.focusTarget.focus === 'function'
            ? options.focusTarget
            : this.guideCloseButtons?.[0] || this.guidePrevButton || this.guideCardEl) || this.guideModalEl;
        focusWithinElement(this.guideModalEl, { preferredTarget: preferredFocus });
      const trigger =
        event?.currentTarget && typeof event.currentTarget.focus === 'function'
          ? event.currentTarget
          : null;
      this.toggleCraftingModal(true, { trigger });
      this.toggleCraftingModal(false, { restoreFocus: this.lastCraftingTrigger || null });
      const trigger =
        event?.currentTarget && typeof event.currentTarget.focus === 'function'
          ? event.currentTarget
          : null;
      this.toggleInventoryModal(willOpen, { trigger });
    toggleCraftingModal(visible, options = {}) {
      const nextVisible = Boolean(visible);
      if (nextVisible) {
        const trigger = options?.trigger;
        if (trigger && typeof trigger.focus === 'function') {
          this.lastCraftingTrigger = trigger;
        } else if (!this.lastCraftingTrigger) {
          this.lastCraftingTrigger =
            (this.craftLauncherButton && typeof this.craftLauncherButton.focus === 'function'
              ? this.craftLauncherButton
              : this.canvas && typeof this.canvas.focus === 'function'
                ? this.canvas
                : null);
        }
        const preferredFocus =
          (options?.focusTarget && typeof options.focusTarget.focus === 'function'
            ? options.focusTarget
            : this.craftingModal) || this.craftingModal;
        focusWithinElement(this.craftingModal, { preferredTarget: preferredFocus });
        const restoreCandidate =
          options?.restoreFocus === false
            ? null
            : options?.restoreFocus || this.lastCraftingTrigger || this.craftLauncherButton || null;
        const restoreTarget =
          restoreCandidate &&
          typeof restoreCandidate.focus === 'function' &&
          !(typeof this.craftingModal.contains === 'function' && this.craftingModal.contains(restoreCandidate))
            ? restoreCandidate
            : null;
        let restored = false;
        if (restoreTarget) {
          restored = focusElementSilently(restoreTarget);
        }
        if (!restored) {
          this.focusGameViewport();
        }
        this.craftLauncherButton.setAttribute('aria-expanded', nextVisible ? 'true' : 'false');
    toggleInventoryModal(visible, options = {}) {
      const nextVisible = Boolean(visible);
      if (nextVisible) {
        const trigger = options?.trigger;
        if (trigger && typeof trigger.focus === 'function') {
          this.lastInventoryTrigger = trigger;
        } else {
          this.lastInventoryTrigger = this.getDefaultInventoryTrigger();
        }
        const preferredFocus =
          (options?.focusTarget && typeof options.focusTarget.focus === 'function'
            ? options.focusTarget
            : this.inventoryModal) || this.inventoryModal;
        focusWithinElement(this.inventoryModal, { preferredTarget: preferredFocus });
        const restoreCandidate =
          options?.restoreFocus === false
            ? null
            : options?.restoreFocus || this.lastInventoryTrigger || this.getDefaultInventoryTrigger();
        const restoreTarget =
          restoreCandidate &&
          typeof restoreCandidate.focus === 'function' &&
          !(typeof this.inventoryModal.contains === 'function' && this.inventoryModal.contains(restoreCandidate))
            ? restoreCandidate
            : null;
        let restored = false;
        if (restoreTarget) {
          restored = focusElementSilently(restoreTarget);
        }
        if (!restored) {
          this.focusGameViewport();
        }
        btn.setAttribute('aria-expanded', nextVisible ? 'true' : 'false');
          btn.textContent = nextVisible ? 'Close Inventory' : 'Open Inventory';
    getDefaultInventoryTrigger() {
      if (Array.isArray(this.openInventoryButtons)) {
        for (const candidate of this.openInventoryButtons) {
          if (candidate && typeof candidate.focus === 'function') {
            return candidate;
          }
        }
      }
      if (this.hotbarExpandButton && typeof this.hotbarExpandButton.focus === 'function') {
        return this.hotbarExpandButton;
      }
      if (this.hotbarEl && typeof this.hotbarEl.focus === 'function') {
        return this.hotbarEl;
      }
      return this.canvas && typeof this.canvas.focus === 'function' ? this.canvas : null;
    }

