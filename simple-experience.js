      this.defeatOverlayEl = this.ui.defeatOverlay || null;
      this.defeatMessageEl = this.ui.defeatMessageEl || null;
      this.defeatInventoryEl = this.ui.defeatInventoryEl || null;
      this.defeatCountdownEl = this.ui.defeatCountdownEl || null;
      this.defeatRespawnButton = this.ui.defeatRespawnButton || null;
      this.defeatOverlayControlsBound = false;
      this.defeatOverlayVisible = false;
      this.defeatOverlayHideHandle = null;
      this.onDefeatRespawnClick = this.handleDefeatRespawnClick.bind(this);
      this.dismissDefeatOverlay({ reason: 'start', restoreFocus: false });
      this.dismissDefeatOverlay({ reason: 'stop', restoreFocus: false });
      this.defeatOverlayControlsBound = false;
      this.bindDefeatOverlayControls();
      this.defeatOverlayControlsBound = false;
      const overlaySnapshot = this.cloneRespawnSnapshotForOverlay();
      this.presentDefeatOverlay({ snapshot: overlaySnapshot, reason: 'respawn' });
    }

    cloneRespawnSnapshotForOverlay() {
      const snapshot = this.respawnInventorySnapshot;
      if (!snapshot) {
        return null;
      }
      const clone = {
        hotbar: Array.isArray(snapshot.hotbar)
          ? snapshot.hotbar.map((slot = {}) => ({
              item: typeof slot?.item === 'string' ? slot.item : slot?.item ?? null,
              quantity: Number.isFinite(slot?.quantity) ? Math.max(0, slot.quantity) : 0,
            }))
          : [],
        satchel: Array.isArray(snapshot.satchel)
          ? snapshot.satchel
              .map(([item, quantity]) => [
                typeof item === 'string' ? item : null,
                Number.isFinite(quantity) ? Math.max(0, quantity) : 0,
              ])
              .filter(([item, quantity]) => item && quantity > 0)
          : [],
        selectedHotbarIndex: Number.isInteger(snapshot.selectedHotbarIndex)
          ? snapshot.selectedHotbarIndex
          : 0,
      };
      return clone;
    }

    buildRespawnInventorySummary(snapshot) {
      if (!snapshot) {
        return [];
      }
      const counts = new Map();
      const add = (item, quantity) => {
        const normalizedItem = typeof item === 'string' ? item.trim() : '';
        const amount = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
        if (!normalizedItem || amount <= 0) {
          return;
        }
        const current = counts.get(normalizedItem) || 0;
        counts.set(normalizedItem, current + amount);
      };
      if (Array.isArray(snapshot.hotbar)) {
        snapshot.hotbar.forEach((slot = {}) => add(slot.item ?? null, slot.quantity));
      }
      if (Array.isArray(snapshot.satchel)) {
        snapshot.satchel.forEach(([item, quantity]) => add(item, quantity));
      }
      return Array.from(counts.entries())
        .map(([item, quantity]) => ({
          item,
          quantity,
          label: formatInventoryLabel(item, quantity),
        }))
        .sort((a, b) => {
          if (b.quantity !== a.quantity) {
            return b.quantity - a.quantity;
          }
          return safeLocaleCompareString(a.label, b.label);
        });
    }

    renderDefeatOverlayInventory(entries, options = {}) {
      if (!this.defeatInventoryEl) {
        return;
      }
      const container = this.defeatInventoryEl;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      const summary = Array.isArray(entries) ? entries : [];
      if (!summary.length) {
        container.dataset.empty = 'true';
        const fallbackMessage =
          typeof options.emptyMessage === 'string' && options.emptyMessage.trim().length
            ? options.emptyMessage.trim()
            : 'Respawn ready — recover world cache will rebuild on landing.';
        container.textContent = fallbackMessage;
        return;
      }
      container.dataset.empty = 'false';
      const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
      if (!doc) {
        const summaryText = summary
          .map((entry) => formatInventoryLabel(entry.item, entry.quantity))
          .join(' • ');
        container.textContent = `Recover world cache: ${summaryText}`;
        return;
      }
      const labelEl = doc.createElement('div');
      labelEl.className = 'defeat-overlay__inventory-label';
      labelEl.textContent = 'Recover World Cache';
      container.appendChild(labelEl);
      const listEl = doc.createElement('ul');
      listEl.className = 'defeat-overlay__inventory-list';
      summary.forEach((entry) => {
        const { item, quantity } = entry;
        const definition = getItemDefinition(item);
        const listItem = doc.createElement('li');
        listItem.className = 'defeat-overlay__inventory-item';
        const nameSpan = doc.createElement('span');
        nameSpan.textContent = `${definition.icon} ${definition.label}`;
        const quantitySpan = doc.createElement('span');
        quantitySpan.textContent = `×${Math.max(1, quantity)}`;
        listItem.appendChild(nameSpan);
        listItem.appendChild(quantitySpan);
        listEl.appendChild(listItem);
      });
      container.appendChild(listEl);
    }

    presentDefeatOverlay(options = {}) {
      if (!this.defeatOverlayEl) {
        return false;
      }
      const overlay = this.defeatOverlayEl;
      const snapshot = options.snapshot || this.cloneRespawnSnapshotForOverlay();
      const summary = this.buildRespawnInventorySummary(snapshot);
      const hasInventory = summary.length > 0;
      const defaultMessage = hasInventory
        ? 'Recover world cache restored — respawn to continue the run.'
        : 'Respawn ready — recover world cache will rebuild on landing.';
      const defaultCountdown = hasInventory
        ? 'Respawn executed — recover world sync complete.'
        : 'Respawn executed — recover world idle.';
      const message =
        typeof options.message === 'string' && options.message.trim().length
          ? options.message.trim()
          : defaultMessage;
      const countdownMessage =
        typeof options.countdownMessage === 'string' && options.countdownMessage.trim().length
          ? options.countdownMessage.trim()
          : defaultCountdown;
      if (this.defeatMessageEl) {
        this.defeatMessageEl.textContent = message;
      }
      const emptyMessage = hasInventory
        ? 'Recover world cache ready — respawn to regain your gear.'
        : 'Respawn ready — recover world cache will rebuild on landing.';
      this.renderDefeatOverlayInventory(summary, { emptyMessage });
      if (this.defeatCountdownEl) {
        this.defeatCountdownEl.textContent = countdownMessage;
      }
      if (this.defeatRespawnButton) {
        this.defeatRespawnButton.disabled = false;
      }
      overlay.setAttribute('data-visible', 'true');
      setElementHidden(overlay, false);
      setInertState(overlay, false);
      activateOverlayIsolation(overlay);
      this.defeatOverlayVisible = true;
      const focusTarget = this.defeatRespawnButton || overlay;
      focusElementSilently(focusTarget);
      if (this.defeatOverlayHideHandle) {
        clearTimeout(this.defeatOverlayHideHandle);
        this.defeatOverlayHideHandle = null;
      }
      const autoHideMs = Number.isFinite(options.autoHideMs) ? options.autoHideMs : 5200;
      if (autoHideMs > 0) {
        const scope = typeof window !== 'undefined' ? window : globalThis;
        if (scope && typeof scope.setTimeout === 'function') {
          this.defeatOverlayHideHandle = scope.setTimeout(() => {
            this.defeatOverlayHideHandle = null;
            this.dismissDefeatOverlay({ reason: 'auto-hide', restoreFocus: false });
          }, autoHideMs);
        }
      }
      return true;
    }

    dismissDefeatOverlay(options = {}) {
      if (!this.defeatOverlayEl || !this.defeatOverlayVisible) {
        return false;
      }
      if (this.defeatOverlayHideHandle) {
        clearTimeout(this.defeatOverlayHideHandle);
        this.defeatOverlayHideHandle = null;
      }
      const overlay = this.defeatOverlayEl;
      overlay.removeAttribute('data-visible');
      setInertState(overlay, true);
      releaseOverlayIsolation(overlay);
      this.defeatOverlayVisible = false;
      if (options.restoreFocus !== false) {
        focusElementSilently(this.canvas);
      }
      return true;
    }

    handleDefeatRespawnClick(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      this.dismissDefeatOverlay({ reason: 'player', restoreFocus: true });
    bindDefeatOverlayControls() {
      if (this.defeatOverlayControlsBound || !this.defeatOverlayEl) {
        return;
      }
      if (this.defeatRespawnButton) {
        this.addSafeEventListener(this.defeatRespawnButton, 'click', this.onDefeatRespawnClick, {
          context: 'acknowledging respawn overlay',
        });
      }
      this.defeatOverlayControlsBound = true;
    }

