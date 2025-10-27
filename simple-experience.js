    resetWorldForDimensionChange(options = {}) {
      const reasonRaw = typeof options.reason === 'string' ? options.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'dimension-transition';
      const navmeshReasonRaw = typeof options.navmeshReason === 'string' ? options.navmeshReason.trim() : '';
      const navmeshReason = navmeshReasonRaw.length ? navmeshReasonRaw : reason;
      const hasSpawn = Object.prototype.hasOwnProperty.call(options, 'spawn');
      const hasMobs = Object.prototype.hasOwnProperty.call(options, 'mobs');
      const spawnOptions = hasSpawn ? options.spawn : undefined;
      const mobOptions = hasMobs ? options.mobs : undefined;
      const cleanup = options.cleanup !== false;

      if (cleanup) {
        if (typeof this.clearZombies === 'function') {
          this.clearZombies();
        }
        if (typeof this.clearGolems === 'function') {
          this.clearGolems();
        }
        if (typeof this.clearChests === 'function') {
          this.clearChests();
        }
      }

      if (options.skipPrePortalReset !== true && typeof this.refreshPortalState === 'function') {
        this.refreshPortalState();
      }

      this.buildTerrain({ reason, navmeshReason });

      const populateOptions =
        options.populate && typeof options.populate === 'object'
          ? { ...options.populate }
          : {};

      if (!populateOptions.reason) {
        populateOptions.reason = reason;
      }
      if (hasSpawn) {
        populateOptions.spawn = spawnOptions;
      }
      if (hasMobs) {
        populateOptions.mobs = mobOptions;
      }

      this.populateSceneAfterTerrain(populateOptions);
      this.buildRails();

      if (options.skipPostPortalReset !== true && typeof this.refreshPortalState === 'function') {
        this.refreshPortalState();
      }
    }

      this.resetWorldForDimensionChange({
        reason,
        navmeshReason,
        spawn: spawnOptions,
        mobs: mobOptions,
        populate: { buildReason: reason },
      });
          this.resetWorldForDimensionChange({
            reason: guardReason,
            navmeshReason: guardReason,
          });
      this.resetWorldForDimensionChange({
        reason: 'dimension-transition',
        navmeshReason: 'dimension-transition',
      });
