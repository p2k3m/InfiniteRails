      this.dimensionPrefetchPromises = new Map();
      this.lastDimensionPrefetchSummary = null;
      generateProceduralHeightmap(options) {
        const profile = options?.profile || DEFAULT_TERRAIN_PROFILE;
        const minColumnHeight = Math.max(1, Math.floor(options?.minColumnHeight ?? MIN_COLUMN_HEIGHT));
        const maxColumnHeight = Math.max(minColumnHeight, Math.floor(options?.maxColumnHeight ?? MAX_COLUMN_HEIGHT));
        const voxelBudget = Math.max(0, Math.floor(options?.voxelBudget ?? DEFAULT_TERRAIN_VOXEL_CAP));
        const dimensionIndex = Number.isFinite(options?.dimensionIndex) ? options.dimensionIndex : 0;
        return {
          matrix,
          meta: {
            voxelCount,
            cappedColumns,
            remainingVoxels,
          },
        };
      }
      prefetchDimensionWorldData(theme, options = {}) {
        if (!theme || typeof theme !== 'object') {
          return null;
        }
        const dimensionId =
          typeof theme.id === 'string' && theme.id.trim().length ? theme.id.trim() : null;
        const fallbackKey = Number.isFinite(options.dimensionIndex)
          ? `dimension-${Math.floor(options.dimensionIndex)}`
          : null;
        const cacheKey = dimensionId || fallbackKey;
        if (!(this.seededHeightmapCache instanceof Map)) {
          this.seededHeightmapCache = new Map();
        }
        if (cacheKey && options.force !== true && this.seededHeightmapCache.has(cacheKey)) {
          return {
            status: 'cached',
            dimensionId,
            cacheKey,
            meta: null,
            minColumnHeight: null,
            maxColumnHeight: null,
            voxelBudget: null,
          };
        }
        const profile = theme?.terrainProfile || DEFAULT_TERRAIN_PROFILE;
        const baseConfig =
          this.baseTerrainConfig && typeof this.baseTerrainConfig === 'object'
            ? this.baseTerrainConfig
            : {
                minColumnHeight: MIN_COLUMN_HEIGHT,
                maxColumnHeight: MAX_COLUMN_HEIGHT,
                voxelBudget: DEFAULT_TERRAIN_VOXEL_CAP,
              };
        const baseMin = Math.max(1, Math.floor(baseConfig.minColumnHeight ?? MIN_COLUMN_HEIGHT));
        const baseMax = Math.max(baseMin, Math.floor(baseConfig.maxColumnHeight ?? MAX_COLUMN_HEIGHT));
        const baseBudget = Math.max(
          WORLD_SIZE * WORLD_SIZE * baseMin,
          Math.floor(baseConfig.voxelBudget ?? DEFAULT_TERRAIN_VOXEL_CAP),
        );
        const minOverride = Number.isFinite(profile?.minHeight)
          ? Math.max(1, Math.floor(profile.minHeight))
          : baseMin;
        const maxOverride = Number.isFinite(profile?.maxHeight)
          ? Math.max(minOverride, Math.floor(profile.maxHeight))
          : baseMax;
        const budgetMultiplier = Number.isFinite(profile?.voxelBudgetMultiplier)
          ? Math.max(0.1, profile.voxelBudgetMultiplier)
          : 1;
        const budgetOffset = Number.isFinite(profile?.voxelBudgetOffset)
          ? Math.floor(profile.voxelBudgetOffset)
          : 0;
        const requestedBudget = Math.max(0, Math.floor(baseBudget * budgetMultiplier + budgetOffset));
        const minBudgetRequirement = WORLD_SIZE * WORLD_SIZE * minOverride;
        const maxTerrainCap = Math.min(MAX_TERRAIN_VOXELS, DEFAULT_TERRAIN_VOXEL_CAP);
        const voxelBudget = Math.max(minBudgetRequirement, Math.min(requestedBudget, maxTerrainCap));
        const dimensionIndex = Number.isFinite(options.dimensionIndex)
          ? Math.floor(options.dimensionIndex)
          : Number.isFinite(this.currentDimensionIndex)
            ? this.currentDimensionIndex + 1
            : 0;
        try {
          const generated = this.generateProceduralHeightmap({
            profile,
            minColumnHeight: minOverride,
            maxColumnHeight: maxOverride,
            voxelBudget,
            dimensionIndex,
          });
          if (generated?.matrix && cacheKey) {
            this.seededHeightmapCache.set(cacheKey, cloneHeightmapMatrix(generated.matrix));
          }
          return {
            status: generated?.matrix ? 'generated' : 'skipped',
            dimensionId,
            cacheKey,
            meta: generated?.meta ?? null,
            minColumnHeight: minOverride,
            maxColumnHeight: maxOverride,
            voxelBudget,
          };
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Dimension world prefetch failed.', { dimensionId, error });
          }
          return null;
        }
      }

      prefetchNextDimensionAssets(options = {}) {
        const currentIndex = Number.isFinite(this.currentDimensionIndex)
          ? this.currentDimensionIndex
          : 0;
        const requestedIndex = Number.isFinite(options.index)
          ? Math.max(0, Math.floor(options.index))
          : currentIndex + 1;
        if (!Array.isArray(DIMENSION_THEME) || requestedIndex >= DIMENSION_THEME.length) {
          return Promise.resolve(null);
        }
        const theme = DIMENSION_THEME[requestedIndex];
        if (!theme) {
          return Promise.resolve(null);
        }
        const dimensionId =
          typeof theme.id === 'string' && theme.id.trim().length
            ? theme.id.trim()
            : `dimension-${requestedIndex}`;
        if (!(this.dimensionPrefetchPromises instanceof Map)) {
          this.dimensionPrefetchPromises = new Map();
        }
        if (options.force === true && this.dimensionPrefetchPromises.has(dimensionId)) {
          this.dimensionPrefetchPromises.delete(dimensionId);
        } else if (this.dimensionPrefetchPromises.has(dimensionId)) {
          return this.dimensionPrefetchPromises.get(dimensionId);
        }
        const manifest =
          theme.assetManifest && typeof theme.assetManifest === 'object'
            ? theme.assetManifest
            : dimensionAssetManifest?.[dimensionId] || null;
        const textureManifest =
          manifest?.assets && typeof manifest.assets === 'object'
            ? manifest.assets.textures
            : null;
        const modelManifest =
          manifest?.assets && typeof manifest.assets === 'object'
            ? manifest.assets.models
            : null;
        const textureKeys = new Set();
        if (textureManifest && typeof textureManifest === 'object') {
          Object.keys(textureManifest)
            .map((key) => (typeof key === 'string' ? key.trim() : ''))
            .filter(Boolean)
            .forEach((key) => textureKeys.add(key));
        } else {
          Object.keys(BASE_TEXTURE_REFERENCES).forEach((key) => textureKeys.add(key));
        }
        const modelEntries = [];
        if (modelManifest && typeof modelManifest === 'object') {
          Object.entries(modelManifest).forEach(([modelKey, reference]) => {
            const trimmedKey = typeof modelKey === 'string' ? modelKey.trim() : '';
            if (!trimmedKey) {
              return;
            }
            const trimmedReference =
              typeof reference === 'string' && reference.trim().length ? reference.trim() : null;
            modelEntries.push({ key: trimmedKey, url: trimmedReference });
          });
        } else {
          Object.entries(MODEL_URLS).forEach(([modelKey, url]) => {
            modelEntries.push({ key: modelKey, url });
          });
        }
        const summary = {
          dimensionId,
          index: requestedIndex,
          reason: options.reason || 'portal-ready',
          textures: Array.from(textureKeys),
          models: modelEntries.map((entry) => entry.key),
          world: null,
          warnings: [],
        };
        const textureTasks = summary.textures.map((key) =>
          this.loadExternalVoxelTexture(key).catch((error) => {
            summary.warnings.push({
              kind: 'texture',
              key,
              message: error?.message || 'prefetch-failed',
            });
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug(`Texture prefetch failed for ${key}.`, error);
            }
            return null;
          }),
        );
        const modelTasks = modelEntries.map((entry) => {
          const { key, url } = entry;
          const overrideUrl =
            typeof url === 'string' && url.trim().length ? url.trim() : MODEL_URLS[key] || null;
          if (this.loadedModels instanceof Map && this.loadedModels.has(key) && !overrideUrl) {
            return Promise.resolve(this.loadedModels.get(key));
          }
          return this.loadModel(key, overrideUrl || undefined).catch((error) => {
            summary.warnings.push({
              kind: 'model',
              key,
              message: error?.message || 'prefetch-failed',
            });
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug(`Model prefetch failed for ${key}.`, error);
            }
            return null;
          });
        });
        const worldSummary = this.prefetchDimensionWorldData(theme, {
          dimensionIndex: requestedIndex,
          force: options.force === true,
        });
        if (!worldSummary) {
          summary.warnings.push({ kind: 'world', message: 'world-prefetch-skipped' });
        } else {
          summary.world = worldSummary;
        }
        const tasks = [...textureTasks, ...modelTasks];
        const promise = Promise.all(tasks)
          .then(() => {
            if (typeof console !== 'undefined' && typeof console.info === 'function') {
              console.info(
                `Next dimension prefetch scheduled for ${dimensionId} — ${summary.textures.length} texture(s), ${summary.models.length} model(s).`,
              );
            }
            this.lastDimensionPrefetchSummary = summary;
            return summary;
          })
          .catch((error) => {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Dimension asset prefetch encountered an error.', error);
            }
            this.lastDimensionPrefetchSummary = summary;
            return summary;
          });
        this.dimensionPrefetchPromises.set(dimensionId, promise);
        return promise;

      normaliseWorkerWorldResult(result, options = {}) {
        if (!result || typeof result !== 'object') {
          return null;
        }
      this.prefetchNextDimensionAssets({ reason: 'portal-ready' }).catch((error) => {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Next dimension prefetch failed after portal ready.', error);
        }
      });
