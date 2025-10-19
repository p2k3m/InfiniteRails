  const CORE_DIMENSION_PLUGIN_ID = 'core-dimensions';
  const CORE_DIMENSION_PLUGIN_VERSION = '1.0.0';

  function cloneBadgeSymbolMap(source) {
    const entries = source && typeof source === 'object' ? source : {};
    return Object.entries(entries).reduce((acc, [key, value]) => {
      const id = typeof key === 'string' ? key.trim() : '';
      if (!id) {
        return acc;
      }
      const symbol = typeof value === 'string' && value.trim().length ? value.trim() : DEFAULT_DIMENSION_BADGE_SYMBOL;
      acc[id] = symbol;
      return acc;
    }, {});
  }

  function cloneBadgeSynonymMap(source) {
    const entries = source && typeof source === 'object' ? source : {};
    return Object.entries(entries).reduce((acc, [key, value]) => {
      const id = typeof key === 'string' ? key.trim() : '';
      if (!id) {
        return acc;
      }
      const synonyms = Array.isArray(value)
        ? value
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter((entry) => entry.length > 0)
        : [];
      acc[id] = synonyms;
      return acc;
    }, {});
  }

  function cloneManifestEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const clone = { ...entry };
    clone.terrain = Array.isArray(entry.terrain) ? entry.terrain.slice() : [];
    clone.mobs = Array.isArray(entry.mobs) ? entry.mobs.slice() : [];
    clone.objects = Array.isArray(entry.objects) ? entry.objects.slice() : [];
    clone.assets = {
      textures:
        entry.assets && entry.assets.textures && typeof entry.assets.textures === 'object'
          ? { ...entry.assets.textures }
          : {},
      models:
        entry.assets && entry.assets.models && typeof entry.assets.models === 'object'
          ? { ...entry.assets.models }
          : {},
    };
    return clone;
  }

  function cloneTerrainProfileOverride(profile) {
    if (!profile || typeof profile !== 'object') {
      return null;
    }
    return { ...profile };
  }

  function cloneDimensionLootTables(source) {
    const entries = source && typeof source === 'object' ? source : {};
    return Object.entries(entries).reduce((acc, [key, value]) => {
      const id = typeof key === 'string' ? key.trim() : '';
      if (!id) {
        return acc;
      }
      const table = Array.isArray(value) ? value : [];
      acc[id] = table.map((entry) => ({
        ...entry,
        items: Array.isArray(entry.items)
          ? entry.items.map((item) => ({ ...item }))
          : [],
        score: Number.isFinite(entry.score) ? entry.score : 0,
        message: typeof entry.message === 'string' ? entry.message : '',
      }));
      return acc;
    }, {});
  }

  function createCoreDimensionPluginResources() {
    const manifest = createDefaultDimensionManifestEntries();
    const terrainProfiles = createDefaultTerrainProfileOverrides();
    const themes = DEFAULT_DIMENSION_THEME_DEFINITIONS.map((definition) => {
      if (!definition || typeof definition !== 'object') {
        return null;
      }
      const id = typeof definition.id === 'string' ? definition.id : '';
      if (!id) {
        return null;
      }
      const theme = {
        ...definition,
        palette: definition.palette && typeof definition.palette === 'object' ? { ...definition.palette } : {},
      };
      const manifestEntry = cloneManifestEntry(manifest[id]);
      if (manifestEntry) {
        theme.assetManifest = manifestEntry;
      }
      const terrainProfile = cloneTerrainProfileOverride(terrainProfiles[id]);
      if (terrainProfile) {
        theme.terrainProfile = terrainProfile;
      }
      return theme;
    }).filter(Boolean);

    return {
      themes,
      badgeSymbols: cloneBadgeSymbolMap(DEFAULT_DIMENSION_BADGE_SYMBOLS),
      badgeSynonyms: cloneBadgeSynonymMap(DEFAULT_DIMENSION_BADGE_SYNONYMS),
      lootTables: cloneDimensionLootTables(DIMENSION_LOOT_TABLE_SOURCE),
      assetManifest: Object.entries(manifest).reduce((acc, [key, value]) => {
        const id = typeof key === 'string' ? key.trim() : '';
        if (!id) {
          return acc;
        }
        const cloned = cloneManifestEntry(value);
        if (cloned) {
          acc[id] = cloned;
        }
        return acc;
      }, {}),
      terrainProfiles: Object.entries(terrainProfiles).reduce((acc, [key, value]) => {
        const id = typeof key === 'string' ? key.trim() : '';
        if (!id) {
          return acc;
        }
        const cloned = cloneTerrainProfileOverride(value);
        if (cloned) {
          acc[id] = cloned;
        }
        return acc;
      }, {}),
    };
  }

  function createCoreDimensionPluginDescriptor() {
    return {
      id: CORE_DIMENSION_PLUGIN_ID,
      slot: 'dimension-pack',
      version: CORE_DIMENSION_PLUGIN_VERSION,
      label: 'Core dimension pack',
      metadata: { builtin: true, description: 'Default Infinite Rails dimension content.' },
      resolveResources() {
        return createCoreDimensionPluginResources();
      },
    };
  }

  function ensureCoreDimensionPluginRegistered(pluginSystem) {
    if (!pluginSystem || typeof pluginSystem !== 'object') {
      return;
    }
    if (typeof pluginSystem.register !== 'function') {
      return;
    }
    const existingPlugins =
      typeof pluginSystem.listPlugins === 'function' ? pluginSystem.listPlugins('dimension-pack') : null;
    const alreadyRegistered = Array.isArray(existingPlugins)
      ? existingPlugins.some((plugin) => plugin && plugin.id === CORE_DIMENSION_PLUGIN_ID)
      : false;
    if (!alreadyRegistered) {
      try {
        pluginSystem.register(createCoreDimensionPluginDescriptor(), {
          slot: 'dimension-pack',
          reason: 'initialise',
        });
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('Failed to register core dimension plugin.', error);
        }
      }
      return;
    }
    if (typeof pluginSystem.activate === 'function') {
      try {
        pluginSystem.activate(CORE_DIMENSION_PLUGIN_ID, { reason: 'refresh' });
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to refresh core dimension plugin.', error);
        }
      }
    }
  }

    ensureCoreDimensionPluginRegistered(dimensionPluginSystem);
    coreDimensionPluginId: CORE_DIMENSION_PLUGIN_ID,
    coreDimensionPluginVersion: CORE_DIMENSION_PLUGIN_VERSION,
