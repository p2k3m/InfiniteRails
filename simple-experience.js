  function createDefaultTerrainProfileOverrides() {
    return {
      origin: {
        minHeight: 1,
        maxHeight: 5,
        baseHeight: 1.15,
        falloffStrength: 2.4,
        falloffRadius: 0.7,
        noiseFrequency: 0.32,
        noiseAmplitude: 1.9,
        secondaryFrequency: 0.2,
        secondaryAmplitude: 0.65,
        centerHeightBias: 0.45,
        seedMultiplier: 41,
      },
      rock: {
        minHeight: 2,
        maxHeight: 6,
        baseHeight: 1.35,
        falloffStrength: 3.2,
        falloffRadius: 0.62,
        falloffExponent: 1.15,
        noiseFrequency: 0.44,
        noiseAmplitude: 2.35,
        secondaryFrequency: 0.26,
        secondaryAmplitude: 1.05,
        ridgeFrequency: 0.18,
        ridgeAmplitude: 0.7,
        rimHeightBias: 0.35,
        centerHeightBias: 0.25,
        voxelBudgetMultiplier: 1.1,
        seedMultiplier: 59,
      },
      stone: {
        minHeight: 3,
        maxHeight: 6,
        baseHeight: 1.5,
        falloffStrength: 3.4,
        falloffRadius: 0.64,
        falloffExponent: 1.25,
        noiseFrequency: 0.36,
        noiseAmplitude: 2.1,
        secondaryFrequency: 0.22,
        secondaryAmplitude: 0.95,
        ridgeFrequency: 0.21,
        ridgeAmplitude: 0.55,
        centerHeightBias: 0.6,
        voxelBudgetMultiplier: 1.05,
        seedMultiplier: 67,
      },
      tar: {
        minHeight: 1,
        maxHeight: 5,
        baseHeight: 0.9,
        falloffStrength: 2.15,
        falloffRadius: 0.74,
        falloffExponent: 0.85,
        noiseFrequency: 0.28,
        noiseAmplitude: 1.45,
        secondaryFrequency: 0.24,
        secondaryAmplitude: 1.3,
        ridgeFrequency: 0.16,
        ridgeAmplitude: 0.4,
        rimHeightBias: -0.2,
        centerHeightBias: 0.2,
        voxelBudgetMultiplier: 0.95,
        seedMultiplier: 47,
      },
      marble: {
        minHeight: 2,
        maxHeight: 6,
        baseHeight: 1.1,
        falloffStrength: 2.9,
        falloffRadius: 0.66,
        falloffExponent: 0.9,
        noiseFrequency: 0.33,
        noiseAmplitude: 1.7,
        secondaryFrequency: 0.19,
        secondaryAmplitude: 0.75,
        ridgeFrequency: 0.2,
        ridgeAmplitude: 0.6,
        centerHeightBias: 0.8,
        voxelBudgetMultiplier: 1.08,
        seedMultiplier: 73,
      },
      netherite: {
        minHeight: 2,
        maxHeight: 6,
        baseHeight: 1.45,
        falloffStrength: 3.6,
        falloffRadius: 0.6,
        falloffExponent: 1.32,
        noiseFrequency: 0.46,
        noiseAmplitude: 2.55,
        secondaryFrequency: 0.27,
        secondaryAmplitude: 1.25,
        ridgeFrequency: 0.22,
        ridgeAmplitude: 0.75,
        rimHeightBias: 0.5,
        centerHeightBias: 0.35,
        voxelBudgetMultiplier: 1.12,
        seedMultiplier: 89,
      },
    };
  }

  function normalizeTerrainProfiles(profiles) {
    if (!profiles || typeof profiles !== 'object') {
      return {};
    }
    const entries = {};
    Object.entries(profiles).forEach(([key, value]) => {
      const id = typeof key === 'string' ? key.trim() : '';
      if (!id || !value || typeof value !== 'object') {
        return;
      }
      entries[id] = buildTerrainProfile(value);
    });
    return entries;
  }

  function getDefaultTerrainProfiles() {
    return normalizeTerrainProfiles(createDefaultTerrainProfileOverrides());
  }

  const DIMENSION_TERRAIN_PROFILES = {};

  function replaceDimensionTerrainProfiles(profiles) {
    const normalized = normalizeTerrainProfiles(profiles);
    const resolved = Object.keys(normalized).length > 0 ? normalized : getDefaultTerrainProfiles();
    Object.keys(DIMENSION_TERRAIN_PROFILES).forEach((key) => {
      try {
        delete DIMENSION_TERRAIN_PROFILES[key];
      } catch (error) {
        DIMENSION_TERRAIN_PROFILES[key] = undefined;
        delete DIMENSION_TERRAIN_PROFILES[key];
      }
    });
    Object.entries(resolved).forEach(([key, value]) => {
      Object.defineProperty(DIMENSION_TERRAIN_PROFILES, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: false,
      });
    });
    return DIMENSION_TERRAIN_PROFILES;
  }

  replaceDimensionTerrainProfiles(getDefaultTerrainProfiles());
  function createDefaultDimensionManifestEntries() {
    return {
      origin: buildDimensionManifestEntry({ id: 'origin', name: 'Origin Grassland' }),
      rock: buildDimensionManifestEntry({
        id: 'rock',
        name: 'Rock Frontier',
        inheritsFrom: 'origin',
      }),
      stone: buildDimensionManifestEntry({
        id: 'stone',
        name: 'Stone Bastion',
        inheritsFrom: 'rock',
        objects: [...BASE_OBJECT_REFERENCES, 'bastion-rampart'],
      }),
      tar: buildDimensionManifestEntry({
        id: 'tar',
        name: 'Tar Marsh',
        inheritsFrom: 'stone',
        terrain: [...BASE_TERRAIN_REFERENCES, 'tar-pool'],
        mobs: [...BASE_MOB_REFERENCES, 'swamp-phantom'],
      }),
      marble: buildDimensionManifestEntry({
        id: 'marble',
        name: 'Marble Heights',
        inheritsFrom: 'tar',
        objects: [...BASE_OBJECT_REFERENCES, 'marble-bridge'],
      }),
      netherite: buildDimensionManifestEntry({
        id: 'netherite',
        name: 'Netherite Terminus',
        inheritsFrom: 'marble',
        objects: [...BASE_OBJECT_REFERENCES, 'eternal-ingot-pedestal'],
      }),
    };
  }

  function normalizeAssetManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') {
      return {};
    }
    const entries = {};
    Object.entries(manifest).forEach(([key, value]) => {
      const id = typeof key === 'string' ? key.trim() : '';
      if (!id || !value || typeof value !== 'object') {
        return;
      }
      const entry = { ...value };
      entry.id = typeof entry.id === 'string' && entry.id.trim().length ? entry.id.trim() : id;
      if (Array.isArray(entry.terrain)) {
        entry.terrain = entry.terrain
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0);
      }
      if (Array.isArray(entry.mobs)) {
        entry.mobs = entry.mobs
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0);
      }
      if (Array.isArray(entry.objects)) {
        entry.objects = entry.objects
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0);
      }
      if (entry.assets && typeof entry.assets === 'object') {
        const assets = entry.assets;
        entry.assets = {
          textures: {
            ...(assets.textures && typeof assets.textures === 'object' ? assets.textures : {}),
          },
          models: {
            ...(assets.models && typeof assets.models === 'object' ? assets.models : {}),
          },
        };
      }
      entry.inheritsFrom =
        typeof entry.inheritsFrom === 'string' && entry.inheritsFrom.trim().length
          ? entry.inheritsFrom.trim()
          : entry.inheritsFrom ?? null;
      entry.name =
        typeof entry.name === 'string' && entry.name.trim().length ? entry.name.trim() : entry.id;
      entries[id] = deepFreeze(entry);
    });
    return entries;
  }

  function getDefaultDimensionAssetManifest() {
    return normalizeAssetManifest(createDefaultDimensionManifestEntries());
  }

  const DIMENSION_ASSET_MANIFEST = {};

  function replaceDimensionAssetManifest(manifest) {
    const normalized = normalizeAssetManifest(manifest);
    const resolved = Object.keys(normalized).length > 0 ? normalized : getDefaultDimensionAssetManifest();
    Object.keys(DIMENSION_ASSET_MANIFEST).forEach((key) => {
      try {
        delete DIMENSION_ASSET_MANIFEST[key];
      } catch (error) {
        DIMENSION_ASSET_MANIFEST[key] = undefined;
        delete DIMENSION_ASSET_MANIFEST[key];
      }
    });
    Object.entries(resolved).forEach(([key, value]) => {
      Object.defineProperty(DIMENSION_ASSET_MANIFEST, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: false,
      });
    });
    return DIMENSION_ASSET_MANIFEST;
  }

  replaceDimensionAssetManifest(getDefaultDimensionAssetManifest());
    if (source.assetManifest) {
      replaceDimensionAssetManifest(source.assetManifest);
    } else {
      replaceDimensionAssetManifest(getDefaultDimensionAssetManifest());
    }
    if (source.terrainProfiles) {
      replaceDimensionTerrainProfiles(source.terrainProfiles);
    } else {
      replaceDimensionTerrainProfiles(getDefaultTerrainProfiles());
    }
              assetManifest: DIMENSION_ASSET_MANIFEST,
              terrainProfiles: DIMENSION_TERRAIN_PROFILES,
      assetManifest: getDefaultDimensionAssetManifest(),
      terrainProfiles: getDefaultTerrainProfiles(),
