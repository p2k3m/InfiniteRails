(function () {
  const globalScope =
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof window !== 'undefined' && window) ||
    (typeof self !== 'undefined' && self) ||
    this ||
    {};

  const consoleRef = globalScope.console || console;

  function createListenerSet() {
    return {
      listeners: new Set(),
      notify(event) {
        this.listeners.forEach((listener) => {
          try {
            listener(event);
          } catch (error) {
            if (consoleRef && typeof consoleRef.error === 'function') {
              consoleRef.error('Game plugin listener failure.', error);
            }
          }
        });
      },
      add(listener) {
        if (typeof listener === 'function') {
          this.listeners.add(listener);
        }
        return () => {
          this.listeners.delete(listener);
        };
      },
      delete(listener) {
        this.listeners.delete(listener);
      },
    };
  }

  function createGamePluginRegistry() {
    const pluginDefinitions = new Map();
    const slots = new Map();

    function ensureSlot(slotId, metadata = {}) {
      const id = typeof slotId === 'string' && slotId.trim().length ? slotId.trim() : 'default';
      if (!slots.has(id)) {
        slots.set(id, {
          id,
          metadata: { ...(typeof metadata === 'object' && metadata ? metadata : {}) },
          listeners: createListenerSet(),
          active: null,
          resources: {},
        });
      } else if (metadata && typeof metadata === 'object') {
        const slot = slots.get(id);
        slot.metadata = { ...slot.metadata, ...metadata };
      }
      return slots.get(id);
    }

    function normalisePluginDescriptor(descriptor, fallbackSlot) {
      if (!descriptor || typeof descriptor !== 'object') {
        throw new TypeError('Plugin descriptor must be an object.');
      }
      const idRaw = typeof descriptor.id === 'string' ? descriptor.id.trim() : '';
      const id = idRaw.length ? idRaw : `plugin:${Math.random().toString(36).slice(2)}`;
      const slotRaw =
        typeof descriptor.slot === 'string' && descriptor.slot.trim().length
          ? descriptor.slot.trim()
          : fallbackSlot;
      const slot = slotRaw || 'default';
      const version = typeof descriptor.version === 'string' ? descriptor.version.trim() : '0.0.0';
      const label =
        typeof descriptor.label === 'string' && descriptor.label.trim().length
          ? descriptor.label.trim()
          : id;
      const metadata = descriptor.metadata && typeof descriptor.metadata === 'object' ? { ...descriptor.metadata } : {};
      const resources = descriptor.resources;
      const resolveResources =
        typeof descriptor.resolveResources === 'function'
          ? descriptor.resolveResources
          : typeof resources === 'function'
          ? resources
          : () => resources;
      const activateHook = typeof descriptor.activate === 'function' ? descriptor.activate : null;
      const deactivateHook = typeof descriptor.deactivate === 'function' ? descriptor.deactivate : null;

      return {
        id,
        slot,
        version,
        label,
        metadata,
        resolveResources,
        activateHook,
        deactivateHook,
        definition: descriptor,
      };
    }

    function notifySlot(slot, payload) {
      if (!slot) {
        return;
      }
      slot.listeners.notify({
        slot: slot.id,
        metadata: { ...slot.metadata },
        resources: slot.resources,
        plugin: slot.active ? slot.active.definition : null,
        previousPlugin: payload.previousPlugin || null,
        reason: payload.reason || 'update',
      });
    }

    const registryApi = {
      createSlot(slotId, metadata = {}) {
        ensureSlot(slotId, metadata);
      },
      listSlots() {
        return Array.from(slots.keys());
      },
      register(descriptor, options = {}) {
        const plugin = normalisePluginDescriptor(descriptor, options.slot);
        const slot = ensureSlot(plugin.slot, options.slotMetadata);
        pluginDefinitions.set(plugin.id, plugin);
        if (options.activate !== false) {
          registryApi.activate(plugin.id, {
            reason: options.reason || 'register',
            context: options.context,
          });
        }
        return plugin;
      },
      activate(pluginId, options = {}) {
        const id = typeof pluginId === 'string' ? pluginId.trim() : '';
        const plugin = pluginDefinitions.get(id);
        if (!plugin) {
          throw new Error(`Plugin not registered: ${id}`);
        }
        const slot = ensureSlot(plugin.slot);
        const previous = slot.active;
        const isSamePluginInstance =
          previous && previous.definition === plugin && previous.id === plugin.id;
        if (isSamePluginInstance && options.force !== true) {
          return slot.resources;
        }
        let resources = {};
        try {
          resources = plugin.resolveResources({
            registry: registryApi,
            slot: plugin.slot,
            reason: options.reason || 'activate',
            context: options.context,
            previousResources: slot.resources,
            previousPlugin: previous ? previous.definition : null,
          });
        } catch (error) {
          if (consoleRef && typeof consoleRef.error === 'function') {
            consoleRef.error(`Plugin resource resolution failed for ${plugin.id}.`, error);
          }
          throw error;
        }
        slot.active = { id: plugin.id, definition: plugin };
        slot.resources = resources || {};
        if (typeof plugin.activateHook === 'function') {
          try {
            plugin.activateHook({
              registry: registryApi,
              slot: plugin.slot,
              resources: slot.resources,
              reason: options.reason || 'activate',
              context: options.context,
              previousPlugin: previous ? previous.definition : null,
            });
          } catch (error) {
            if (consoleRef && typeof consoleRef.error === 'function') {
              consoleRef.error(`Plugin activate hook failed for ${plugin.id}.`, error);
            }
          }
        }
        notifySlot(slot, {
          previousPlugin: previous ? previous.definition : null,
          reason: options.reason || 'activate',
        });
        if (previous && typeof previous.definition.deactivateHook === 'function') {
          try {
            previous.definition.deactivateHook({
              registry: registryApi,
              slot: plugin.slot,
              reason: 'deactivate',
              nextPlugin: plugin,
              context: options.context,
            });
          } catch (error) {
            if (consoleRef && typeof consoleRef.error === 'function') {
              consoleRef.error(`Plugin deactivate hook failed for ${previous.id}.`, error);
            }
          }
        }
        return slot.resources;
      },
      hotSwap(slotId, descriptor, options = {}) {
        const plugin = normalisePluginDescriptor(descriptor, slotId);
        pluginDefinitions.set(plugin.id, plugin);
        const reason = options.reason || 'hot-swap';
        return registryApi.activate(plugin.id, { reason, context: options.context, force: true });
      },
      subscribe(slotId, listener) {
        const slot = ensureSlot(slotId);
        return slot.listeners.add(listener);
      },
      unsubscribe(slotId, listener) {
        const slot = ensureSlot(slotId);
        slot.listeners.delete(listener);
      },
      getActivePlugin(slotId) {
        const slot = ensureSlot(slotId);
        return slot.active ? slot.active.definition : null;
      },
      getResources(slotId) {
        const slot = ensureSlot(slotId);
        return slot.resources;
      },
      listPlugins(slotId) {
        const target = slotId ? String(slotId).trim() : null;
        return Array.from(pluginDefinitions.values()).filter((plugin) =>
          target ? plugin.slot === target : true,
        );
      },
      getSlotState(slotId) {
        const slot = ensureSlot(slotId);
        return {
          id: slot.id,
          metadata: { ...slot.metadata },
          activePlugin: slot.active ? slot.active.definition : null,
          resources: slot.resources,
        };
      },
    };

    return registryApi;
  }

  if (
    globalScope.InfiniteRailsPluginSystem &&
    typeof globalScope.InfiniteRailsPluginSystem.register === 'function'
  ) {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = globalScope.InfiniteRailsPluginSystem;
      module.exports.createGamePluginRegistry = createGamePluginRegistry;
    }
    return;
  }

  const registry = createGamePluginRegistry();
  registry.version = '1.0.0';

  globalScope.InfiniteRailsPluginSystem = registry;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry;
    module.exports.createGamePluginRegistry = createGamePluginRegistry;
  }
})();
