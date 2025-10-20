      this.lastPrefetchedDimensionKey = null;
      this.pendingDimensionPrefetchPromise = null;
      this.lastPrefetchedDimensionKey = null;
      this.pendingDimensionPrefetchPromise = null;
      try {
        this.prefetchNextDimensionAssets();
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to prefetch next dimension assets when portal became ready.', error);
        }
      }
      this.portalHintShown = true;
      this.portalIgnitionLog = [];
      this.addScoreBreakdown('portal', 1);
      this.score += 1;
      this.updateHud();
      this.showHint('Portal frame complete — press F to ignite your torch.');
    prefetchNextDimensionAssets(options = {}) {
      const themeCount = DIMENSION_THEME.length;
      if (themeCount === 0) {
        return Promise.resolve(null);
      }
      const requestedIndex = Number.isFinite(options.index)
        ? Math.max(0, Math.min(themeCount - 1, Math.floor(options.index)))
        : this.currentDimensionIndex + 1;
      if (!Number.isFinite(requestedIndex) || requestedIndex < 0 || requestedIndex >= themeCount) {
        return Promise.resolve(null);
      }
      const nextTheme = options.theme || DIMENSION_THEME[requestedIndex] || null;
      if (!nextTheme) {
        return Promise.resolve(null);
      }
      const dimensionId =
        typeof nextTheme.id === 'string' && nextTheme.id.trim().length
          ? nextTheme.id.trim()
          : `dimension-${requestedIndex}`;
      if (this.lastPrefetchedDimensionKey === dimensionId) {
        return this.pendingDimensionPrefetchPromise || Promise.resolve(null);
      }
      this.lastPrefetchedDimensionKey = dimensionId;

      const manifestEntry = nextTheme.assetManifest || dimensionAssetManifest?.[dimensionId] || null;
      if (manifestEntry && typeof manifestEntry === 'object' && manifestEntry.assets) {
        const { textures, models } = manifestEntry.assets;
        if (textures && typeof textures === 'object' && typeof this.loadExternalVoxelTexture === 'function') {
          Object.keys(textures).forEach((key) => {
            const normalised = typeof key === 'string' ? key.trim() : '';
            if (!normalised) {
              return;
            }
            try {
              const result = this.loadExternalVoxelTexture(normalised);
              if (result && typeof result.catch === 'function') {
                result.catch((error) => {
                  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                    console.debug(`Texture prefetch failed for "${normalised}" in dimension ${dimensionId}.`, error);
                  }
                });
              }
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug(
                  `Failed to schedule texture prefetch for "${normalised}" in dimension ${dimensionId}.`,
                  error,
                );
              }
            }
          });
        }
        if (models && typeof models === 'object' && typeof this.enqueueLazyModelWarmup === 'function') {
          const warmupKeys = new Set();
          Object.entries(models).forEach(([modelKey, reference]) => {
            const trimmedKey = typeof modelKey === 'string' ? modelKey.trim() : '';
            if (trimmedKey) {
              warmupKeys.add(trimmedKey);
            }
            const referenceKey =
              typeof reference === 'string' && reference.trim().length
                ? MODEL_URL_LOOKUP.byUrl(reference.trim())
                : null;
            if (referenceKey) {
              warmupKeys.add(referenceKey);
            }
          });
          if (warmupKeys.size > 0) {
            try {
              this.enqueueLazyModelWarmup(Array.from(warmupKeys));
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Failed to enqueue model warmup during dimension prefetch.', error);
              }
            }
          }
        }
      }

      if (typeof this.prefetchWorldDataForDimension !== 'function') {
        this.pendingDimensionPrefetchPromise = null;
        return Promise.resolve(null);
      }
      let promise;
      try {
        promise = Promise.resolve(
          this.prefetchWorldDataForDimension({
            dimensionId,
            index: requestedIndex,
            theme: nextTheme,
          }),
        );
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Dimension world prefetch failed to start.', error);
        }
        this.lastPrefetchedDimensionKey = null;
        this.pendingDimensionPrefetchPromise = null;
        return Promise.reject(error);
      }

      this.pendingDimensionPrefetchPromise = promise
        .catch((error) => {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug(`Prefetch for dimension ${dimensionId} failed.`, error);
          }
          if (this.lastPrefetchedDimensionKey === dimensionId) {
            this.lastPrefetchedDimensionKey = null;
          }
          throw error;
        })
        .finally(() => {
          if (this.lastPrefetchedDimensionKey === dimensionId) {
            this.pendingDimensionPrefetchPromise = null;
          }
        });

      return this.pendingDimensionPrefetchPromise;
    }

