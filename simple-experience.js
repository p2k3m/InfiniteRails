    cleanupDimensionEnvironment(options = {}) {
      const reasonRaw = typeof options.reason === 'string' ? options.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'dimension-transition-cleanup';
      const logCleanupError = (label, error) => {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug(`Failed to ${label} during dimension cleanup.`, { reason, error });
        }
      };
      if (typeof this.clearZombies === 'function') {
        try {
          this.clearZombies();
        } catch (error) {
          logCleanupError('clear zombies', error);
        }
      }
      if (typeof this.clearGolems === 'function') {
        try {
          this.clearGolems();
        } catch (error) {
          logCleanupError('clear golems', error);
        }
      }
      if (typeof this.clearChests === 'function') {
        try {
          this.clearChests();
        } catch (error) {
          logCleanupError('clear chests', error);
        }
      }
      if (typeof this.resetNetheriteChallenge === 'function') {
        try {
          this.resetNetheriteChallenge();
        } catch (error) {
          logCleanupError('reset netherite challenge', error);
        }
      }
      if (typeof this.refreshPortalState === 'function') {
        try {
          this.refreshPortalState();
        } catch (error) {
          logCleanupError('reset portal state', error);
        }
      } else if (typeof this.deactivatePortal === 'function') {
        try {
          this.deactivatePortal();
        } catch (error) {
          logCleanupError('deactivate portal', error);
        }
      }
      if (this.portalGroup && typeof this.portalGroup.clear === 'function') {
        try {
          this.portalGroup.clear();
        } catch (error) {
          logCleanupError('clear portal group', error);
        }
      }
      if (this.railsGroup && typeof this.railsGroup.clear === 'function') {
        try {
          this.railsGroup.clear();
        } catch (error) {
          logCleanupError('clear rail group', error);
        }
      }
      if (Array.isArray(this.railSegments)) {
        this.railSegments.length = 0;
      }
    }

    reinitializeDimensionEnvironment(options = {}) {
      const reasonRaw = typeof options.reason === 'string' ? options.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'dimension-transition';
      const navmeshReasonRaw = typeof options.navmeshReason === 'string' ? options.navmeshReason.trim() : '';
      const navmeshReason = navmeshReasonRaw.length ? navmeshReasonRaw : reason;
      const spawnOptions = typeof options.spawn === 'object' && options.spawn !== null ? options.spawn : null;
      const mobOptions = typeof options.mobs === 'object' && options.mobs !== null ? options.mobs : {};
      this.buildTerrain({ reason, navmeshReason });
      this.populateSceneAfterTerrain({
        reason,
        buildReason: reason,
        spawn: spawnOptions,
        mobs: mobOptions,
      });
      this.buildRails();
      this.refreshPortalState();
      return { reason, navmeshReason };
    }

    refreshDimensionEnvironment(options = {}) {
      const reasonRaw = typeof options.reason === 'string' ? options.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'dimension-transition';
      const navmeshReasonRaw = typeof options.navmeshReason === 'string' ? options.navmeshReason.trim() : '';
      const navmeshReason = navmeshReasonRaw.length ? navmeshReasonRaw : reason;
      const spawnOptions = typeof options.spawn === 'object' && options.spawn !== null ? options.spawn : null;
      const mobOptions = typeof options.mobs === 'object' && options.mobs !== null ? options.mobs : {};
      this.cleanupDimensionEnvironment({ reason });
      return this.reinitializeDimensionEnvironment({
        reason,
        navmeshReason,
        spawn: spawnOptions,
        mobs: mobOptions,
      });
    }

      this.refreshDimensionEnvironment({
        reason,
        navmeshReason,
        spawn: spawnOptions,
        mobs: mobOptions,
      });
      const reasonRaw = typeof context.reason === 'string' ? context.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'dimension-exit';
      this.cleanupDimensionEnvironment({ reason });
          this.refreshDimensionEnvironment({
            reason: guardReason,
            navmeshReason: guardReason,
          });
      this.refreshDimensionEnvironment({
        reason: 'dimension-transition',
        navmeshReason: 'dimension-transition',
      });
