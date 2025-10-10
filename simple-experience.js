      if (typeof this.hotbarEl.querySelectorAll === 'function') {
        this.hotbarEl
          .querySelectorAll('.hotbar-slot.dragging, .hotbar-slot.drag-over')
          .forEach((node) => node.classList.remove('dragging', 'drag-over'));
        return;
      }
      if (Array.isArray(this.hotbarEl.children)) {
        this.hotbarEl.children.forEach((node) => {
          if (node && node.classList && typeof node.classList.remove === 'function') {
            node.classList.remove('dragging', 'drag-over');
          }
        });
      }
    }

    getHotbarSlotFallbackElement() {
      const root = this.hotbarEl;
      if (!root || typeof root !== 'object') {
        return null;
      }
      const selectors = [
        '.hotbar-slot.dragging',
        '.hotbar-slot.drag-over',
        '.hotbar-slot[data-active="true"]',
        '.hotbar-slot',
      ];
      if (typeof root.querySelector === 'function') {
        for (const selector of selectors) {
          const candidate = root.querySelector(selector);
          if (candidate) {
            return candidate;
          }
        }
      }
      if (Array.isArray(root.children)) {
        for (const child of root.children) {
          if (child && typeof child === 'object') {
            return child;
          }
        }
      }
      return null;
    }

    resolveHotbarDropTargetIndex(element) {
      const direct = this.getHotbarSlotIndexFromElement(element);
      if (direct !== null) {
        return direct;
      }
      const fallbackElement = this.getHotbarSlotFallbackElement();
      return this.getHotbarSlotIndexFromElement(fallbackElement);
    }

    resolveHotbarDragSourceIndex(event) {
      const length = Array.isArray(this.hotbar) ? this.hotbar.length : 0;
      if (!length) {
        return null;
      }
      const dataTransfer = event?.dataTransfer ?? null;
      if (dataTransfer && typeof dataTransfer.getData === 'function') {
        try {
          const raw = dataTransfer.getData('text/plain');
          const parsed = Number.parseInt(raw, 10);
          if (Number.isInteger(parsed) && parsed >= 0 && parsed < length) {
            return parsed;
          }
        } catch (error) {
          // Ignore unsupported drag data operations.
        }
      }
      const candidate = this.activeHotbarDrag?.from;
      if (Number.isInteger(candidate) && candidate >= 0 && candidate < length) {
        return candidate;
      }
      const fallbackElement = this.getHotbarSlotFallbackElement();
      return this.getHotbarSlotIndexFromElement(fallbackElement);
      if (!element || typeof element !== 'object') return null;
      if (!Array.isArray(this.hotbar)) return null;
      const raw = element.dataset?.hotbarSlot ?? element.attributes?.['data-hotbar-slot'] ?? '-1';
      const fromIndex = this.resolveHotbarDragSourceIndex(event);
      const targetIndex = this.resolveHotbarDropTargetIndex(event?.currentTarget ?? null);
      if (!Array.isArray(this.hotbar) || !this.hotbar.length) {
        this.updateInventoryUi();
        return;
      }
      if (!Number.isInteger(fromIndex) || !Number.isInteger(targetIndex)) {
        this.updateInventoryUi();
        return;
      }
      if (fromIndex < 0 || targetIndex < 0) {
        this.updateInventoryUi();
        return;
      }
      if (fromIndex >= this.hotbar.length || targetIndex >= this.hotbar.length) {
        this.updateInventoryUi();
        return;
      }
      if (fromIndex === targetIndex) {
        this.updateInventoryUi();
