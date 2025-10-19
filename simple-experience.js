    computeKeyBindingOverrides() {
      const overrides = {};
      const base = this.baseKeyBindings || this.defaultKeyBindings || {};
      Object.entries(this.keyBindings || {}).forEach(([action, keys]) => {
        if (!Array.isArray(keys)) {
          return;
        }
        const baseline = Array.isArray(base[action]) ? base[action] : [];
        if (!this.areKeyListsEqual(keys, baseline)) {
          overrides[action] = [...keys];
        }
      });
      return overrides;
    }

    dispatchKeyBindingChange(detail = {}) {
      const scope =
        typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const dispatcher = scope?.dispatchEvent;
      const EventCtor =
        typeof scope?.CustomEvent === 'function'
          ? scope.CustomEvent
          : typeof CustomEvent === 'function'
            ? CustomEvent
            : null;
      if (typeof dispatcher !== 'function' || !EventCtor) {
        return;
      }
      const overrides = detail.overrides || this.computeKeyBindingOverrides();
      const formatKeys = (value) =>
        Array.isArray(value)
          ? value
              .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
              .filter((entry) => entry.length > 0)
          : undefined;
      const payload = {
        overrides,
        action:
          typeof detail.action === 'string' && detail.action.trim().length ? detail.action.trim() : undefined,
        keys: formatKeys(detail.keys),
        reason:
          typeof detail.reason === 'string' && detail.reason.trim().length ? detail.reason.trim() : 'update',
        source:
          typeof detail.source === 'string' && detail.source.trim().length ? detail.source.trim() : 'experience',
        persist: detail.persist !== false,
        timestamp: Date.now(),
      };
      try {
        dispatcher.call(scope, new EventCtor('infinite-rails:keybindings-changed', { detail: payload }));
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to dispatch keybinding change event.', error);
        }
      }
    }

        const overrides = this.computeKeyBindingOverrides();
        this.dispatchKeyBindingChange({
          action: action.trim(),
          keys: [...nextKeys],
          persist,
          reason: typeof options.reason === 'string' ? options.reason : 'set-key-binding',
          source: options.source,
        });
        this.dispatchKeyBindingChange({
          persist,
          reason: typeof options.reason === 'string' ? options.reason : 'set-key-bindings',
          source: options.source,
        });
      this.dispatchKeyBindingChange({
        persist,
        reason: typeof options.reason === 'string' ? options.reason : 'reset-key-bindings',
        source: options.source,
      });
