  function collectHandlerCandidates(candidate) {
    const handlers = [];
    if (!candidate) {
      return handlers;
    }
    if (typeof candidate === 'function') {
      handlers.push(candidate);
      return handlers;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => {
        if (typeof entry === 'function') {
          handlers.push(entry);
        } else if (entry && typeof entry === 'object') {
          if (typeof entry.handler === 'function') {
            handlers.push(entry.handler);
          }
          if (typeof entry.fn === 'function') {
            handlers.push(entry.fn);
          }
          if (typeof entry.callback === 'function') {
            handlers.push(entry.callback);
          }
        }
      });
      return handlers;
    }
    if (candidate instanceof Set || candidate instanceof Map) {
      candidate.forEach((entry) => {
        if (typeof entry === 'function') {
          handlers.push(entry);
        } else if (entry && typeof entry === 'object' && typeof entry.handler === 'function') {
          handlers.push(entry.handler);
        }
      });
      return handlers;
    }
    if (candidate && typeof candidate === 'object') {
      if (typeof candidate.handler === 'function') {
        handlers.push(candidate.handler);
      }
      if (typeof candidate.fn === 'function') {
        handlers.push(candidate.fn);
      }
      if (typeof candidate.callback === 'function') {
        handlers.push(candidate.callback);
      }
    }
    return handlers;
  }

  function normaliseDimensionLifecycleHooks(source) {
    const normalized = { enter: [], exit: [], ready: [] };
    if (!source) {
      return normalized;
    }
    if (typeof source === 'function' || Array.isArray(source)) {
      normalized.enter.push(...collectHandlerCandidates(source));
      return normalized;
    }
    if (typeof source !== 'object') {
      return normalized;
    }
    const common = collectHandlerCandidates(source.all ?? source.any ?? source.common);
    const enterHandlers = collectHandlerCandidates(source.enter ?? source.onEnter);
    const exitHandlers = collectHandlerCandidates(source.exit ?? source.onExit ?? source.leave);
    const readyHandlers = collectHandlerCandidates(source.ready ?? source.onReady ?? source.afterEnter);
    normalized.enter.push(...enterHandlers, ...common);
    normalized.exit.push(...exitHandlers, ...common);
    normalized.ready.push(...readyHandlers, ...common);
    return normalized;
  }

  function cloneDimensionLifecycleHooks(hooks) {
    return {
      enter: Array.isArray(hooks?.enter) ? hooks.enter.slice() : [],
      exit: Array.isArray(hooks?.exit) ? hooks.exit.slice() : [],
      ready: Array.isArray(hooks?.ready) ? hooks.ready.slice() : [],
    };
  }

  function normaliseDimensionAugmentations(source) {
    const augmentations = [];
    const visit = (candidate) => {
      if (!candidate) {
        return;
      }
      if (typeof candidate === 'function') {
        augmentations.push(candidate);
        return;
      }
      if (Array.isArray(candidate)) {
        candidate.forEach(visit);
        return;
      }
      if (candidate instanceof Set || candidate instanceof Map) {
        candidate.forEach((entry) => visit(entry));
        return;
      }
      if (typeof candidate === 'object') {
        if (typeof candidate.apply === 'function') {
          augmentations.push((context) => candidate.apply(context));
          return;
        }
        if (typeof candidate.run === 'function') {
          augmentations.push((context) => candidate.run(context));
          return;
        }
        if (typeof candidate.setup === 'function') {
          augmentations.push((context) => candidate.setup(context));
          return;
        }
        if (typeof candidate.handler === 'function') {
          augmentations.push(candidate.handler);
        } else if (typeof candidate.fn === 'function') {
          augmentations.push(candidate.fn);
        } else if (typeof candidate.callback === 'function') {
          augmentations.push(candidate.callback);
        }
      }
    };
    visit(source);
    return augmentations;
  }

  function cloneDimensionAugmentations(list) {
    return Array.isArray(list) ? list.slice() : [];
  }

  function normaliseCleanupCallback(result) {
    if (!result) {
      return null;
    }
    if (typeof result === 'function') {
      return result;
    }
    if (Array.isArray(result)) {
      const cleanups = result
        .map((entry) => normaliseCleanupCallback(entry))
        .filter((entry) => typeof entry === 'function');
      if (cleanups.length === 0) {
        return null;
      }
      return () => {
        cleanups.forEach((cleanup) => {
          try {
            cleanup();
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Failed to invoke aggregated plugin augmentation cleanup.', error);
            }
          }
        });
      };
    }
    if (typeof result !== 'object') {
      return null;
    }
    const candidates = ['dispose', 'destroy', 'teardown', 'remove', 'cancel', 'unsubscribe', 'off'];
    for (const method of candidates) {
      if (typeof result[method] === 'function') {
        return () => {
          try {
            result[method]();
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Failed to invoke plugin augmentation cleanup.', error);
            }
          }
        };
      }
    }
    return null;
  }

  function flushCleanupList(cleanups) {
    if (!Array.isArray(cleanups) || cleanups.length === 0) {
      return;
    }
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      if (typeof cleanup !== 'function') {
        continue;
      }
      try {
        cleanup();
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Dimension plugin cleanup callback failed.', error);
        }
      }
    }
  }

    lifecycleHooks: { enter: [], exit: [], ready: [] },
    experienceAugmentations: [],
    const lifecycleHooks = normaliseDimensionLifecycleHooks(
      source.lifecycleHooks ?? source.dimensionLifecycleHooks ?? source.lifecycle,
    );
    const augmentations = normaliseDimensionAugmentations(
      source.experienceAugmentations ?? source.augmentations ?? source.logicModules,
    );

    dimensionPluginState.lifecycleHooks = lifecycleHooks;
    dimensionPluginState.experienceAugmentations = augmentations;
      plugin: detail?.plugin || null,
              lifecycleHooks: cloneDimensionLifecycleHooks(lifecycleHooks),
              augmentations: cloneDimensionAugmentations(augmentations),
      this.dimensionPluginBridge = {
        lifecycleCleanups: [],
        augmentationCleanups: [],
      };
      const lifecycleHooks = normaliseDimensionLifecycleHooks(resources.lifecycleHooks);
      const augmentations = normaliseDimensionAugmentations(resources.augmentations);
        this.applyDimensionPluginLifecycleHooks(lifecycleHooks, detail, resources);
        this.applyDimensionPluginAugmentations(augmentations, detail, resources);
      this.applyDimensionPluginLifecycleHooks(lifecycleHooks, detail, resources);
      this.applyDimensionPluginAugmentations(augmentations, detail, resources);
    }

    ensureDimensionPluginBridge() {
      if (!this.dimensionPluginBridge || typeof this.dimensionPluginBridge !== 'object') {
        this.dimensionPluginBridge = { lifecycleCleanups: [], augmentationCleanups: [] };
      } else {
        this.dimensionPluginBridge.lifecycleCleanups = Array.isArray(
          this.dimensionPluginBridge.lifecycleCleanups,
        )
          ? this.dimensionPluginBridge.lifecycleCleanups
          : [];
        this.dimensionPluginBridge.augmentationCleanups = Array.isArray(
          this.dimensionPluginBridge.augmentationCleanups,
        )
          ? this.dimensionPluginBridge.augmentationCleanups
          : [];
      }
      return this.dimensionPluginBridge;
    }

    applyDimensionPluginLifecycleHooks(hooks = {}, detail = {}, resources = {}) {
      const bridge = this.ensureDimensionPluginBridge();
      flushCleanupList(bridge.lifecycleCleanups);
      bridge.lifecycleCleanups.length = 0;
      const normalized = normaliseDimensionLifecycleHooks(hooks);
      const phases = [
        ['enter', normalized.enter],
        ['exit', normalized.exit],
        ['ready', normalized.ready],
      ];
      phases.forEach(([phase, handlers]) => {
        if (!Array.isArray(handlers)) {
          return;
        }
        handlers.forEach((handler) => {
          if (typeof handler !== 'function') {
            return;
          }
          try {
            const removal = this.registerDimensionLifecycleHook(phase, (payload) =>
              handler(payload, {
                phase,
                detail,
                resources,
                experience: this,
                pluginState: dimensionPluginState,
              }),
            );
            if (typeof removal === 'function') {
              bridge.lifecycleCleanups.push(removal);
            }
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') {
              console.warn('Failed to apply plugin-provided dimension lifecycle hook.', error);
            }
          }
        });
      });
    }

    applyDimensionPluginAugmentations(augmentationsInput = [], detail = {}, resources = {}) {
      const bridge = this.ensureDimensionPluginBridge();
      flushCleanupList(bridge.augmentationCleanups);
      bridge.augmentationCleanups.length = 0;
      const augmentations = normaliseDimensionAugmentations(augmentationsInput);
      if (!Array.isArray(augmentations) || augmentations.length === 0) {
        return;
      }
      const registerCleanup = (cleanup) => {
        if (typeof cleanup === 'function') {
          bridge.augmentationCleanups.push(cleanup);
        }
      };
      augmentations.forEach((augmentation) => {
        if (typeof augmentation !== 'function') {
          return;
        }
        try {
          const context = {
            experience: this,
            detail,
            resources,
            pluginState: dimensionPluginState,
            registerLifecycleHook: (phase, handler) => {
              const removal = this.registerDimensionLifecycleHook(phase, handler);
              if (typeof removal === 'function') {
                registerCleanup(removal);
              }
              return removal;
            },
            addCleanup: (cleanup) => {
              registerCleanup(cleanup);
              return cleanup;
            },
          };
          const result = augmentation(context);
          const cleanup = normaliseCleanupCallback(result);
          registerCleanup(cleanup);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Dimension plugin augmentation failed to apply.', error);
          }
        }
      });
    }

    teardownDimensionPluginBridge() {
      if (!this.dimensionPluginBridge) {
        return;
      }
      flushCleanupList(this.dimensionPluginBridge.lifecycleCleanups);
      flushCleanupList(this.dimensionPluginBridge.augmentationCleanups);
      this.dimensionPluginBridge.lifecycleCleanups = [];
      this.dimensionPluginBridge.augmentationCleanups = [];
        try {
          experience.teardownDimensionPluginBridge?.();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to teardown dimension plugin bridge during destroy.', error);
          }
        }
    if (typeof experience?.handleDimensionPluginUpdate === 'function') {
      try {
        const pluginDetail = dimensionPluginState.lastApplied
          ? {
              plugin: dimensionPluginState.lastApplied.plugin || null,
              reason: 'hydrate',
              context: { stage: 'hydrate', appliedAt: dimensionPluginState.lastApplied.appliedAt },
            }
          : { reason: 'hydrate' };
        experience.handleDimensionPluginUpdate(
          {
            themes: DIMENSION_THEME,
            badgeSymbols: DIMENSION_BADGE_SYMBOLS,
            badgeSynonyms: DIMENSION_BADGE_SYNONYMS,
            lootTables: DIMENSION_LOOT_TABLES,
            lifecycleHooks: cloneDimensionLifecycleHooks(dimensionPluginState.lifecycleHooks),
            augmentations: cloneDimensionAugmentations(dimensionPluginState.experienceAugmentations),
          },
          pluginDetail,
        );
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to hydrate dimension plugin bridge for new SimpleExperience.', error);
        }
      }
    }
