      this.dimensionPrefetchState = new Map();
    collectDimensionTextureKeys(manifest) {
      const keys = new Set();
      if (!manifest || typeof manifest !== 'object') {
        return [];
      }
      const register = (value) => {
        if (typeof value !== 'string') {
          return;
        }
        const trimmed = value.trim();
        if (!trimmed) {
          return;
        }
        const withoutPrefix = trimmed.startsWith('texture:') ? trimmed.slice('texture:'.length) : trimmed;
        if (!withoutPrefix || /[/.]/.test(withoutPrefix)) {
          return;
        }
        keys.add(withoutPrefix);
      };
      const textures = manifest?.assets && typeof manifest.assets.textures === 'object' ? manifest.assets.textures : null;
      if (textures) {
        Object.keys(textures).forEach(register);
        Object.values(textures).forEach((value) => {
          if (Array.isArray(value)) {
            value.forEach(register);
            return;
          }
          register(value);
        });
      }
      return Array.from(keys);
    }

    collectDimensionModelEntries(manifest) {
      const entries = [];
      if (!manifest || typeof manifest !== 'object') {
        return entries;
      }
      const seen = new Set();
      const addEntry = (key, url = null) => {
        if (typeof key !== 'string') {
          return;
        }
        const trimmedKey = key.trim();
        if (!trimmedKey || seen.has(trimmedKey)) {
          return;
        }
        seen.add(trimmedKey);
        entries.push({ key: trimmedKey, url: url || MODEL_URLS[trimmedKey] || null });
      };
      const models = manifest?.assets && typeof manifest.assets.models === 'object' ? manifest.assets.models : null;
      if (!models) {
        return entries;
      }
      Object.entries(models).forEach(([manifestKey, reference]) => {
        const manifestKeyTrimmed = typeof manifestKey === 'string' ? manifestKey.trim() : '';
        const value = typeof reference === 'string' ? reference.trim() : '';
        const knownKey = value ? MODEL_URL_LOOKUP.byUrl(value) : null;
        if (knownKey) {
          addEntry(knownKey, MODEL_URLS[knownKey]);
        } else if (manifestKeyTrimmed) {
          addEntry(manifestKeyTrimmed, value || null);
        }
      });
      return entries;
    }

    prefetchAssetsForDimension(theme, options = {}) {
      if (!theme || typeof theme !== 'object') {
        return null;
      }
      const dimensionIdRaw = options.dimensionId || theme.id || null;
      const dimensionId =
        typeof dimensionIdRaw === 'string' && dimensionIdRaw.trim().length
          ? dimensionIdRaw.trim()
          : Number.isFinite(options.index)
            ? `index-${Math.max(0, Math.floor(options.index))}`
            : null;
      if (!dimensionId) {
        return null;
      }
      if (!this.dimensionPrefetchState) {
        this.dimensionPrefetchState = new Map();
      }
      const existing = this.dimensionPrefetchState.get(dimensionId);
      if (existing && existing.promise) {
        return existing.promise;
      }
      const manifest = theme.assetManifest && typeof theme.assetManifest === 'object' ? theme.assetManifest : null;
      const tasks = [];
      if (manifest) {
        const textureKeys = this.collectDimensionTextureKeys(manifest);
        textureKeys.forEach((key) => {
          try {
            const loadPromise = this.loadExternalVoxelTexture(key);
            if (loadPromise && typeof loadPromise.then === 'function') {
              tasks.push(loadPromise.catch((error) => {
                this.handleAssetLoadFailure(`texture:${key}`, error);
              }));
            }
          } catch (error) {
            this.handleAssetLoadFailure(`texture:${key}`, error);
          }
        });
        const modelEntries = this.collectDimensionModelEntries(manifest);
        modelEntries.forEach(({ key, url }) => {
          try {
            const promise = this.loadModel(key, url);
            if (promise && typeof promise.then === 'function') {
              tasks.push(promise.catch((error) => {
                this.handleAssetLoadFailure(key, error);
              }));
            }
          } catch (error) {
            this.handleAssetLoadFailure(key, error);
          }
        });
      }
      if (typeof this.prefetchWorldDataForDimension === 'function') {
        try {
          const worldPromise = this.prefetchWorldDataForDimension({
            index: options.index,
            theme,
            reason: options.reason || 'dimension-prefetch',
          });
          if (worldPromise && typeof worldPromise.then === 'function') {
            tasks.push(worldPromise.catch((error) => {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Failed to prefetch world data for dimension.', error);
              }
            }));
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to schedule world data prefetch for dimension.', error);
          }
        }
      }
      const promise = tasks.length > 0
        ? Promise.allSettled(tasks).then(() => true)
        : Promise.resolve(true);
      this.dimensionPrefetchState.set(dimensionId, { promise, startedAt: Date.now() });
      promise.catch(() => {
        this.dimensionPrefetchState.delete(dimensionId);
      });
      return promise;
    }

    prefetchNextDimensionAssets(options = {}) {
      const nextIndex = Number.isFinite(options.index)
        ? Math.max(0, Math.floor(options.index))
        : Number.isFinite(this.currentDimensionIndex)
          ? this.currentDimensionIndex + 1
          : 1;
      if (nextIndex < 0 || nextIndex >= DIMENSION_THEME.length) {
        return null;
      }
      const theme = DIMENSION_THEME[nextIndex] || null;
      if (!theme) {
        return null;
      }
      return this.prefetchAssetsForDimension(theme, {
        index: nextIndex,
        reason: options.reason || 'portal-ready',
      });
    }

    calculateTerrainCapsForProfile(profile) {
      return {
        minColumnHeight: minOverride,
        maxColumnHeight: Math.min(Math.max(minOverride, maxOverride), MAX_COLUMN_HEIGHT),
        maxTerrainVoxels: Math.max(minBudgetRequirement, safeBudget),
      };
    }

    applyTerrainProfileToCaps(profile) {
      const caps = this.calculateTerrainCapsForProfile(profile);
      this.minColumnHeight = caps.minColumnHeight;
      this.maxColumnHeight = caps.maxColumnHeight;
      this.maxTerrainVoxels = caps.maxTerrainVoxels;
      try {
        this.prefetchNextDimensionAssets({ reason: 'portal-ready' });
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to prefetch next dimension assets after portal readiness.', error);
        }
      }
