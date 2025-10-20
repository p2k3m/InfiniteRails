  const DIMENSION_LIFECYCLE_PHASES = ['exit', 'enter', 'ready'];

  function normaliseLifecycleHookList(list) {
    if (typeof list === 'function') {
      return [list];
    }
    if (!Array.isArray(list)) {
      return [];
    }
    return list.filter((entry) => typeof entry === 'function');
  }

  function normaliseDimensionLifecycleHooks(hooks) {
    const source = hooks && typeof hooks === 'object' ? hooks : {};
    return {
      exit: normaliseLifecycleHookList(source.exit),
      enter: normaliseLifecycleHookList(source.enter),
      ready: normaliseLifecycleHookList(source.ready),
    };
  }

  function normaliseExperienceAugmentations(augmentations) {
    if (typeof augmentations === 'function') {
      return [augmentations];
    }
    if (!Array.isArray(augmentations)) {
      return [];
    }
    return augmentations.filter((entry) => typeof entry === 'function');
  }

  function freezeLifecycleHookRegistry(registry) {
    return Object.freeze({
      exit: Object.freeze(registry.exit.slice()),
      enter: Object.freeze(registry.enter.slice()),
      ready: Object.freeze(registry.ready.slice()),
    });
  }

  function freezeAugmentations(list) {
    return Object.freeze(list.slice());
  }

  function normaliseCleanupToken(token) {
    if (typeof token === 'function') {
      return token;
    }
    if (!token || typeof token !== 'object') {
      return null;
    }
    const candidates = ['dispose', 'destroy', 'teardown', 'release', 'off', 'cancel', 'remove'];
    for (const key of candidates) {
      const handler = token[key];
      if (typeof handler === 'function') {
        return () => {
          handler.call(token);
        };
      }
    }
    return null;
  }

    lifecycleHooks: freezeLifecycleHookRegistry({ exit: [], enter: [], ready: [] }),
    experienceAugmentations: freezeAugmentations([]),
    rawResources: null,
    const lifecycleHooks = normaliseDimensionLifecycleHooks(source.lifecycleHooks);
    const frozenLifecycleHooks = freezeLifecycleHookRegistry(lifecycleHooks);
    const experienceAugmentations = normaliseExperienceAugmentations(source.experienceAugmentations);
    const frozenAugmentations = freezeAugmentations(experienceAugmentations);

      lifecycleHooks: {
        exit: frozenLifecycleHooks.exit.length,
        enter: frozenLifecycleHooks.enter.length,
        ready: frozenLifecycleHooks.ready.length,
      },
      experienceAugmentations: frozenAugmentations.length,
    };
    dimensionPluginState.lifecycleHooks = frozenLifecycleHooks;
    dimensionPluginState.experienceAugmentations = frozenAugmentations;
    dimensionPluginState.rawResources = source;

    const pluginPayloadForInstances = {
      themes: DIMENSION_THEME,
      badgeSymbols: DIMENSION_BADGE_SYMBOLS,
      badgeSynonyms: DIMENSION_BADGE_SYNONYMS,
      lootTables: DIMENSION_LOOT_TABLES,
      lifecycleHooks: frozenLifecycleHooks,
      experienceAugmentations: frozenAugmentations,
      rawResources: source,
          experience.handleDimensionPluginUpdate(pluginPayloadForInstances, detail);
      this.dimensionPluginRuntime = {
        cleanups: new Set(),
        detail: null,
        rawResources: null,
        resolvedResources: null,
      };
    teardownDimensionPluginRuntime() {
      const runtime = this.dimensionPluginRuntime;
      if (!runtime) {
        return;
      }
      const cleanups =
        runtime.cleanups instanceof Set
          ? Array.from(runtime.cleanups)
          : Array.isArray(runtime.cleanups)
            ? runtime.cleanups.slice()
            : [];
      if (runtime.cleanups instanceof Set) {
        runtime.cleanups.clear();
      } else if (Array.isArray(runtime.cleanups)) {
        runtime.cleanups.length = 0;
      }
      runtime.detail = null;
      runtime.rawResources = null;
      runtime.resolvedResources = null;
      cleanups.reverse();
      cleanups.forEach((cleanup) => {
        if (typeof cleanup !== 'function') {
          return;
        }
        try {
          cleanup();
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Dimension plugin cleanup handler failed during teardown.', error);
          }
        }
      });
    }

    applyDimensionPluginLogic(resources = {}, detail = {}) {
      if (!this.dimensionPluginRuntime) {
        this.dimensionPluginRuntime = {
          cleanups: new Set(),
          detail: null,
          rawResources: null,
          resolvedResources: null,
        };
      }
      this.teardownDimensionPluginRuntime();
      const runtime = this.dimensionPluginRuntime;
      if (!(runtime.cleanups instanceof Set)) {
        runtime.cleanups = new Set();
      }
      runtime.detail = detail || {};
      runtime.rawResources =
        resources && typeof resources.rawResources === 'object' ? resources.rawResources : {};
      runtime.resolvedResources = resources;
      const pluginContext = {
        experience: this,
        detail: runtime.detail,
        resources: runtime.rawResources,
        resolvedResources: runtime.resolvedResources,
      };

      const wrapCleanup = (fn, label) => {
        if (typeof fn !== 'function') {
          return () => {};
        }
        let called = false;
        const wrapped = () => {
          if (called) {
            return;
          }
          called = true;
          try {
            fn();
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug(`Failed to execute ${label || 'plugin'} cleanup handler.`, error);
            }
          } finally {
            if (runtime.cleanups instanceof Set) {
              runtime.cleanups.delete(wrapped);
            }
          }
        };
        try {
          Object.defineProperty(wrapped, '__dimensionPluginCleanup__', {
            value: true,
            enumerable: false,
            configurable: true,
          });
        } catch (error) {
          wrapped.__dimensionPluginCleanup__ = true;
        }
        return wrapped;
      };

      const registerLifecycleHook = (phase, handler) => {
        if (typeof handler !== 'function') {
          return () => {};
        }
        const key = phase === 'enter' ? 'enter' : phase === 'ready' ? 'ready' : 'exit';
        let disposer = null;
        try {
          const wrapped = (payload) => {
            try {
              return handler(payload, pluginContext);
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.warn === 'function') {
                console.warn('Dimension plugin lifecycle hook execution failed.', error);
              }
              throw error;
            }
          };
          disposer = this.registerDimensionLifecycleHook(key, wrapped);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Failed to register dimension lifecycle hook from plugin.', error);
          }
          return () => {};
        }
        const cleanup = wrapCleanup(disposer, 'dimension lifecycle hook');
        runtime.cleanups.add(cleanup);
        return cleanup;
      };

      const addCleanup = (token) => {
        const normalized = normaliseCleanupToken(token);
        if (!normalized) {
          return () => {};
        }
        if (runtime.cleanups instanceof Set && runtime.cleanups.has(normalized)) {
          return normalized;
        }
        const cleanup = wrapCleanup(normalized, 'dimension plugin cleanup');
        runtime.cleanups.add(cleanup);
        return cleanup;
      };

      const lifecycleRegistry =
        resources && typeof resources.lifecycleHooks === 'object'
          ? resources.lifecycleHooks
          : { exit: [], enter: [], ready: [] };

      DIMENSION_LIFECYCLE_PHASES.forEach((phase) => {
        const hooks = Array.isArray(lifecycleRegistry[phase]) ? lifecycleRegistry[phase] : [];
        hooks.forEach((hook) => {
          registerLifecycleHook(phase, hook);
        });
      });

      const augmentations = Array.isArray(resources?.experienceAugmentations)
        ? resources.experienceAugmentations
        : [];
      augmentations.forEach((augmentation) => {
        if (typeof augmentation !== 'function') {
          return;
        }
        try {
          const result = augmentation({
            experience: this,
            detail: pluginContext.detail,
            resources: pluginContext.resources,
            resolvedResources: pluginContext.resolvedResources,
            registerLifecycleHook,
            addCleanup,
          });
          const normalized = normaliseCleanupToken(result);
          if (normalized) {
            const cleanup = wrapCleanup(normalized, 'dimension plugin augmentation');
            runtime.cleanups.add(cleanup);
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Dimension plugin augmentation failed.', error);
          }
        }
      });
    }

      try {
        this.applyDimensionPluginLogic(resources, detail);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('Failed to apply dimension plugin logic to SimpleExperience instance.', error);
        }
      }
        if (typeof experience.teardownDimensionPluginRuntime === 'function') {
          try {
            experience.teardownDimensionPluginRuntime();
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Failed to teardown dimension plugin runtime during destroy.', error);
            }
          }
        }
