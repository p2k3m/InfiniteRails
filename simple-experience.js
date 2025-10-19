  const DEFAULT_DIMENSION_LOOT_TABLES = freezeDimensionLootTables(DIMENSION_LOOT_TABLE_SOURCE);
  const DIMENSION_LOOT_TABLES = {};

  const DEFAULT_DIMENSION_BADGE_SYMBOLS = {
  const DEFAULT_DIMENSION_BADGE_SYNONYMS = {
  const DIMENSION_BADGE_SYMBOLS = {};
  const DIMENSION_BADGE_SYNONYMS = {};
  const DIMENSION_THEME = [];

  const DEFAULT_DIMENSION_THEME_DEFINITIONS = [
  ];

  const DIMENSION_PLUGIN_SLOT_ID = 'dimension-pack';

  function resolveGamePluginRegistry() {
    const candidates = [];
    if (typeof globalThis !== 'undefined') {
      candidates.push(globalThis.InfiniteRailsPluginSystem);
    }
    if (typeof window !== 'undefined') {
      candidates.push(window.InfiniteRailsPluginSystem);
    }
    if (typeof self !== 'undefined') {
      candidates.push(self.InfiniteRailsPluginSystem);
    }
    for (const candidate of candidates) {
      if (candidate && typeof candidate.register === 'function' && typeof candidate.activate === 'function') {
        return candidate;
      }
    }

    const fallbackSlots = new Map();

    function ensureFallbackSlot(id) {
      const slotId = typeof id === 'string' && id.trim().length ? id.trim() : 'default';
      if (!fallbackSlots.has(slotId)) {
        fallbackSlots.set(slotId, {
          id: slotId,
          plugin: null,
          resources: {},
          listeners: new Set(),
        });
      }
      return fallbackSlots.get(slotId);
    }

    function notifyFallbackSlot(slot, payload) {
      slot.listeners.forEach((listener) => {
        try {
          listener({
            slot: slot.id,
            plugin: slot.plugin,
            resources: slot.resources,
            previousPlugin: payload?.previousPlugin || null,
            reason: payload?.reason || 'update',
          });
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.error === 'function') {
            console.error('Fallback plugin registry listener failure.', error);
          }
        }
      });
    }

    const fallbackRegistry = {
      createSlot(slotId) {
        ensureFallbackSlot(slotId);
      },
      register(descriptor, options = {}) {
        const slotId =
          (typeof descriptor?.slot === 'string' && descriptor.slot.trim().length
            ? descriptor.slot.trim()
            : typeof options.slot === 'string' && options.slot.trim().length
            ? options.slot.trim()
            : 'default');
        const slot = ensureFallbackSlot(slotId);
        const plugin = { ...(descriptor || {}), slot: slotId };
        const previous = slot.plugin;
        slot.plugin = plugin;
        if (options.activate !== false) {
          const resources =
            typeof plugin.resources === 'function'
              ? plugin.resources({ reason: options.reason || 'register' })
              : plugin.resources || {};
          slot.resources = resources || {};
          notifyFallbackSlot(slot, { previousPlugin: previous, reason: options.reason || 'register' });
        }
        return plugin;
      },
      activate(pluginId, options = {}) {
        const id = typeof pluginId === 'string' ? pluginId.trim() : '';
        for (const slot of fallbackSlots.values()) {
          if (slot.plugin && slot.plugin.id === id) {
            const resources =
              typeof slot.plugin.resources === 'function'
                ? slot.plugin.resources({ reason: options.reason || 'activate' })
                : slot.plugin.resources || {};
            const previous = slot.plugin;
            slot.resources = resources || {};
            notifyFallbackSlot(slot, { previousPlugin: previous, reason: options.reason || 'activate' });
            return slot.resources;
          }
        }
        throw new Error(`Plugin not registered: ${id}`);
      },
      hotSwap(slotId, descriptor, options = {}) {
        const slot = ensureFallbackSlot(slotId);
        const previous = slot.plugin;
        const plugin = { ...(descriptor || {}), slot: slotId };
        slot.plugin = plugin;
        const resources =
          typeof plugin.resources === 'function'
            ? plugin.resources({ reason: options.reason || 'hot-swap' })
            : plugin.resources || {};
        slot.resources = resources || {};
        notifyFallbackSlot(slot, { previousPlugin: previous, reason: options.reason || 'hot-swap' });
        return slot.resources;
      },
      subscribe(slotId, listener) {
        const slot = ensureFallbackSlot(slotId);
        if (typeof listener === 'function') {
          slot.listeners.add(listener);
          return () => {
            slot.listeners.delete(listener);
          };
        }
        return () => {};
      },
      unsubscribe(slotId, listener) {
        const slot = ensureFallbackSlot(slotId);
        slot.listeners.delete(listener);
      },
      getResources(slotId) {
        const slot = ensureFallbackSlot(slotId);
        return slot.resources;
      },
      getActivePlugin(slotId) {
        const slot = ensureFallbackSlot(slotId);
        return slot.plugin;
      },
      listPlugins(slotId) {
        const id = typeof slotId === 'string' ? slotId.trim() : null;
        if (id) {
          const slot = ensureFallbackSlot(id);
          return slot.plugin ? [slot.plugin] : [];
        }
        return Array.from(fallbackSlots.values())
          .map((slot) => slot.plugin)
          .filter(Boolean);
      },
    };

    if (typeof globalThis !== 'undefined') {
      globalThis.InfiniteRailsPluginSystem = fallbackRegistry;
    }
    return fallbackRegistry;
  }

  function replaceArrayContents(target, source) {
    if (!Array.isArray(target)) {
      return;
    }
    target.length = 0;
    if (!Array.isArray(source)) {
      return;
    }
    source.forEach((value) => {
      target.push(value);
    });
  }

  function normaliseDimensionTheme(theme) {
    if (!theme || typeof theme !== 'object') {
      return null;
    }
    const id = typeof theme.id === 'string' ? theme.id.trim() : '';
    if (!id) {
      return null;
    }
    const name =
      typeof theme.name === 'string' && theme.name.trim().length ? theme.name.trim() : `Dimension ${id}`;
    const label =
      typeof theme.label === 'string' && theme.label.trim().length ? theme.label.trim() : name;
    const palette = theme.palette && typeof theme.palette === 'object' ? { ...theme.palette } : {};
    const manifest =
      theme.assetManifest && typeof theme.assetManifest === 'object'
        ? theme.assetManifest
        : DIMENSION_ASSET_MANIFEST[id] || null;
    const terrainProfile =
      theme.terrainProfile && typeof theme.terrainProfile === 'object'
        ? theme.terrainProfile
        : DIMENSION_TERRAIN_PROFILES[id] || DEFAULT_TERRAIN_PROFILE;
    const normalized = {
      ...theme,
      id,
      name,
      label,
      palette,
      assetManifest: manifest,
      terrainProfile,
    };
    ensureDimensionThemeManifestCoverage(normalized);
    return Object.freeze(normalized);
  }

  function replaceDimensionThemes(themes) {
    const entries = Array.isArray(themes) ? themes : [];
    const normalized = entries
      .map((theme) => normaliseDimensionTheme(theme))
      .filter((theme) => theme !== null);
    replaceArrayContents(DIMENSION_THEME, normalized);
  }

  function replaceDimensionBadgeSymbols(symbols) {
    Object.keys(DIMENSION_BADGE_SYMBOLS).forEach((key) => {
      delete DIMENSION_BADGE_SYMBOLS[key];
    });
    const entries = symbols && typeof symbols === 'object' ? Object.entries(symbols) : [];
    entries.forEach(([key, value]) => {
      const normalizedKey = typeof key === 'string' ? key.trim() : '';
      if (!normalizedKey) {
        return;
      }
      const symbol =
        typeof value === 'string' && value.trim().length ? value.trim() : DEFAULT_DIMENSION_BADGE_SYMBOL;
      DIMENSION_BADGE_SYMBOLS[normalizedKey] = symbol;
    });
  }

  function replaceDimensionBadgeSynonyms(synonyms) {
    Object.keys(DIMENSION_BADGE_SYNONYMS).forEach((key) => {
      delete DIMENSION_BADGE_SYNONYMS[key];
    });
    const entries = synonyms && typeof synonyms === 'object' ? Object.entries(synonyms) : [];
    entries.forEach(([key, value]) => {
      const normalizedKey = typeof key === 'string' ? key.trim() : '';
      if (!normalizedKey) {
        return;
      }
      const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
      const filtered = list
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0);
      if (filtered.length === 0) {
        return;
      }
      DIMENSION_BADGE_SYNONYMS[normalizedKey] = filtered;
    });
  }

  function replaceDimensionLootTables(tables) {
    Object.keys(DIMENSION_LOOT_TABLES).forEach((key) => {
      try {
        delete DIMENSION_LOOT_TABLES[key];
      } catch (error) {
        DIMENSION_LOOT_TABLES[key] = undefined;
        delete DIMENSION_LOOT_TABLES[key];
      }
    });
    if (!tables || typeof tables !== 'object') {
      return;
    }
    const frozen = freezeDimensionLootTables(tables);
    Object.entries(frozen).forEach(([key, value]) => {
      Object.defineProperty(DIMENSION_LOOT_TABLES, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: false,
      });
    });
  }

  const dimensionPluginState = {
    lastApplied: null,
  };

  function applyDimensionPluginResources(resources, detail = {}) {
    const source = resources && typeof resources === 'object' ? resources : {};
    replaceDimensionThemes(source.themes);
    if (Array.isArray(DIMENSION_THEME) && DIMENSION_THEME.length === 0) {
      replaceDimensionThemes(DEFAULT_DIMENSION_THEME_DEFINITIONS);
    }
    replaceDimensionBadgeSymbols(source.badgeSymbols || {});
    if (Object.keys(DIMENSION_BADGE_SYMBOLS).length === 0) {
      replaceDimensionBadgeSymbols(DEFAULT_DIMENSION_BADGE_SYMBOLS);
    }
    replaceDimensionBadgeSynonyms(source.badgeSynonyms || {});
    if (Object.keys(DIMENSION_BADGE_SYNONYMS).length === 0) {
      replaceDimensionBadgeSynonyms(DEFAULT_DIMENSION_BADGE_SYNONYMS);
    }
    if (source.lootTables) {
      replaceDimensionLootTables(source.lootTables);
    } else {
      replaceDimensionLootTables(DEFAULT_DIMENSION_LOOT_TABLES);
    }
    dimensionPluginState.lastApplied = {
      pluginId: detail?.plugin?.id || null,
      version: detail?.plugin?.version || null,
      reason: detail?.reason || 'update',
      appliedAt: Date.now(),
    };
    activeSimpleExperiences.forEach((experience) => {
      if (typeof experience?.handleDimensionPluginUpdate === 'function') {
        try {
          experience.handleDimensionPluginUpdate(
            {
              themes: DIMENSION_THEME,
              badgeSymbols: DIMENSION_BADGE_SYMBOLS,
              badgeSynonyms: DIMENSION_BADGE_SYNONYMS,
              lootTables: DIMENSION_LOOT_TABLES,
            },
            detail,
          );
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Failed to propagate dimension plugin update to SimpleExperience instance.', error);
          }
        }
      }
    });
  }

  const gamePluginRegistry = resolveGamePluginRegistry();
  if (gamePluginRegistry && typeof gamePluginRegistry.createSlot === 'function') {
    try {
      gamePluginRegistry.createSlot(DIMENSION_PLUGIN_SLOT_ID, { label: 'Dimension content packs' });
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('Failed to register dimension plugin slot metadata.', error);
      }
    }
  }

  if (gamePluginRegistry && typeof gamePluginRegistry.subscribe === 'function') {
    try {
      gamePluginRegistry.subscribe(DIMENSION_PLUGIN_SLOT_ID, (event) => {
        applyDimensionPluginResources(event?.resources, {
          plugin: event?.plugin || null,
          reason: event?.reason || 'update',
        });
      });
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('Failed to subscribe to dimension plugin updates.', error);
      }
    }
  }

  const defaultDimensionPluginDefinition = {
    id: 'core-dimensions',
    slot: DIMENSION_PLUGIN_SLOT_ID,
    version: '1.0.0',
    label: 'Core sandbox dimension pack',
    resources: () => ({
      themes: DEFAULT_DIMENSION_THEME_DEFINITIONS.map((theme) => ({
        ...theme,
        palette: { ...(theme.palette || {}) },
      })),
      badgeSymbols: { ...DEFAULT_DIMENSION_BADGE_SYMBOLS },
      badgeSynonyms: { ...DEFAULT_DIMENSION_BADGE_SYNONYMS },
      lootTables: DIMENSION_LOOT_TABLE_SOURCE,
    }),
  };

  let initialResources = null;
  if (gamePluginRegistry && typeof gamePluginRegistry.getResources === 'function') {
    try {
      initialResources = gamePluginRegistry.getResources(DIMENSION_PLUGIN_SLOT_ID);
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('Failed to read initial dimension plugin resources.', error);
      }
    }
  }

  if (
    !initialResources ||
    !Array.isArray(initialResources.themes) ||
    initialResources.themes.length === 0
  ) {
    if (gamePluginRegistry && typeof gamePluginRegistry.register === 'function') {
      try {
        gamePluginRegistry.register(defaultDimensionPluginDefinition, {
          activate: true,
          reason: 'bootstrap',
        });
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('Failed to register default dimension plugin. Applying fallback resources.', error);
        }
        applyDimensionPluginResources(defaultDimensionPluginDefinition.resources(), {
          plugin: defaultDimensionPluginDefinition,
          reason: 'bootstrap-fallback',
        });
      }
    } else {
      applyDimensionPluginResources(defaultDimensionPluginDefinition.resources(), {
        plugin: defaultDimensionPluginDefinition,
        reason: 'bootstrap-no-registry',
      });
    }
  } else {
    applyDimensionPluginResources(initialResources, {
      plugin:
        gamePluginRegistry && typeof gamePluginRegistry.getActivePlugin === 'function'
          ? gamePluginRegistry.getActivePlugin(DIMENSION_PLUGIN_SLOT_ID)
          : null,
      reason: 'bootstrap-existing',
    });
  }

  if (DIMENSION_THEME.length === 0) {
    applyDimensionPluginResources(defaultDimensionPluginDefinition.resources(), {
      plugin: defaultDimensionPluginDefinition,
      reason: 'bootstrap-finalise',
    });
  }
    handleDimensionPluginUpdate(resources = {}, detail = {}) {
      try {
        this.ensureDimensionLootTablesLoaded();
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to refresh loot tables during plugin update.', error);
        }
      }
      const themeCount = DIMENSION_THEME.length;
      if (themeCount === 0) {
        this.dimensionSettings = null;
        this.dimensionTerrainProfile = DEFAULT_TERRAIN_PROFILE;
        this.applyTerrainProfileToCaps(this.dimensionTerrainProfile);
        this.currentSpeed = PLAYER_BASE_SPEED;
        this.gravityScale = 1;
        this.netheriteChallengePlanned = false;
        this.updateHud?.();
        return;
      }
      const currentId = typeof this.dimensionSettings?.id === 'string' ? this.dimensionSettings.id : null;
      let targetIndex = Number.isFinite(this.currentDimensionIndex) ? this.currentDimensionIndex : 0;
      if (currentId) {
        const matchedIndex = DIMENSION_THEME.findIndex((theme) => theme?.id === currentId);
        if (matchedIndex >= 0) {
          targetIndex = matchedIndex;
        } else if (targetIndex >= themeCount) {
          targetIndex = Math.max(0, themeCount - 1);
        }
      } else if (!Number.isFinite(targetIndex) || targetIndex >= themeCount) {
        targetIndex = Math.max(0, themeCount - 1);
      }
      try {
        this.applyDimensionSettings(targetIndex);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('Failed to apply dimension settings after plugin update.', error);
        }
      }
      try {
        this.updateHud?.();
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('HUD refresh failed after dimension plugin update.', error);
        }
      }
    }

      if (this.dimensionLootCache.size) {
        Array.from(this.dimensionLootCache.keys()).forEach((dimensionId) => {
          if (!dimensionIds.has(dimensionId)) {
            this.dimensionLootCache.delete(dimensionId);
            this.dimensionLootOrders.delete(dimensionId);
            this.dimensionLootOrderOffsets.delete(dimensionId);
          }
        });
      }
  const simpleExperienceExports = {
  if (typeof Object.defineProperties === 'function') {
    Object.defineProperties(simpleExperienceExports, {
      dimensionManifest: {
        get: () => DIMENSION_ASSET_MANIFEST,
        enumerable: true,
      },
      dimensionThemes: {
        get: () => DIMENSION_THEME,
        enumerable: true,
      },
      dimensionLootTables: {
        get: () => DIMENSION_LOOT_TABLES,
        enumerable: true,
      },
      terrainProfiles: {
        get: () => DIMENSION_TERRAIN_PROFILES,
        enumerable: true,
      },
      defaultTerrainProfile: {
        get: () => DEFAULT_TERRAIN_PROFILE,
        enumerable: true,
      },
      dimensionBadgeSymbols: {
        get: () => DIMENSION_BADGE_SYMBOLS,
        enumerable: false,
      },
      dimensionBadgeSynonyms: {
        get: () => DIMENSION_BADGE_SYNONYMS,
        enumerable: false,
      },
    });
  } else {
    simpleExperienceExports.dimensionManifest = DIMENSION_ASSET_MANIFEST;
    simpleExperienceExports.dimensionThemes = DIMENSION_THEME;
    simpleExperienceExports.dimensionLootTables = DIMENSION_LOOT_TABLES;
    simpleExperienceExports.terrainProfiles = DIMENSION_TERRAIN_PROFILES;
    simpleExperienceExports.defaultTerrainProfile = DEFAULT_TERRAIN_PROFILE;
    simpleExperienceExports.dimensionBadgeSymbols = DIMENSION_BADGE_SYMBOLS;
    simpleExperienceExports.dimensionBadgeSynonyms = DIMENSION_BADGE_SYNONYMS;
  }

  window.SimpleExperience = simpleExperienceExports;

