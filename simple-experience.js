    cleanupEntitiesForDimensionTransition() {
      const tasks = [
        { method: 'clearZombies', label: 'zombies' },
        { method: 'clearGolems', label: 'golems' },
        { method: 'clearChests', label: 'chests' },
      ];
      tasks.forEach(({ method, label }) => {
        const handler = typeof this[method] === 'function' ? this[method] : null;
        if (!handler) {
          return;
        }
        try {
          handler.call(this);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug(`Failed to clear ${label} during dimension cleanup.`, error);
          }
        }
      });
    }

    cleanupPortalAssetsForDimensionTransition(options = {}) {
      const reasonRaw = typeof options.reason === 'string' ? options.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'dimension-transition';
      const logDebug = (message, error) => {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug(message, error);
        }
      };
      if (typeof this.deactivatePortal === 'function') {
        try {
          this.deactivatePortal();
        } catch (error) {
          logDebug(`Failed to deactivate portal during ${reason} cleanup.`, error);
        }
      }
      const portalGroup = this.portalGroup;
      if (portalGroup) {
        const children = Array.isArray(portalGroup.children) ? portalGroup.children.slice() : [];
        children.forEach((child) => {
          if (!child) return;
          if (typeof portalGroup.remove === 'function') {
            try {
              portalGroup.remove(child);
            } catch (error) {
              logDebug(`Failed to detach portal child during ${reason} cleanup.`, error);
            }
          }
          try {
            disposeObject3D(child);
          } catch (error) {
            logDebug(`Failed to dispose portal child during ${reason} cleanup.`, error);
          }
        });
        if (typeof portalGroup.clear === 'function') {
          try {
            portalGroup.clear();
          } catch (error) {
            logDebug(`Failed to clear portal group during ${reason} cleanup.`, error);
          }
        }
      }
      if (this.portalGhostMeshes instanceof Map) {
        this.portalGhostMeshes.forEach((mesh) => {
          if (!mesh) return;
          if (mesh.parent && typeof mesh.parent.remove === 'function') {
            try {
              mesh.parent.remove(mesh);
            } catch (error) {
              logDebug(`Failed to detach portal ghost mesh during ${reason} cleanup.`, error);
            }
          }
          try {
            disposeObject3D(mesh);
          } catch (error) {
            logDebug(`Failed to dispose portal ghost mesh during ${reason} cleanup.`, error);
          }
        });
        this.portalGhostMeshes.clear();
      }
      if (typeof this.clearPortalFrameHighlights === 'function') {
        try {
          this.clearPortalFrameHighlights();
        } catch (error) {
          logDebug(`Failed to clear portal frame highlights during ${reason} cleanup.`, error);
        }
      }
      if (Array.isArray(this.portalHiddenInterior)) {
        this.portalHiddenInterior = [];
      }
      this.portalPreviewSummary = { totalSlots: 0, missingFrameSlots: 0 };
      if (!(this.portalFrameSlots instanceof Map)) {
        this.portalFrameSlots = new Map();
      } else {
        this.portalFrameSlots.clear();
      }
      this.portalFrameRequiredCount = 0;
      this.portalBlocksPlaced = 0;
    }

      this.cleanupEntitiesForDimensionTransition();
          const restoredDimension = this.dimensionSettings ?? previousSettings ?? null;
          await this.reinitialiseDimensionWorld({
            reason: guardReason,
            navmeshReason: guardReason,
            previousDimension: nextSettings ?? transitionResult?.nextDimension ?? null,
            nextDimension: restoredDimension,
            transition: transitionResult,
            rulesSummary: this.buildDimensionRuleSummary(restoredDimension),
          });
    async reinitialiseDimensionWorld(context = {}) {
      const reasonRaw = typeof context.reason === 'string' ? context.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'dimension-transition';
      const navmeshRaw = typeof context.navmeshReason === 'string' ? context.navmeshReason.trim() : '';
      const navmeshReason = navmeshRaw.length ? navmeshRaw : reason;
      this.cleanupEntitiesForDimensionTransition();
      this.cleanupPortalAssetsForDimensionTransition({ reason });
      this.buildTerrain({ reason, navmeshReason });
      const populationOptions = { reason };
      if (Object.prototype.hasOwnProperty.call(context, 'mobs')) {
        populationOptions.mobs = context.mobs;
      }
      if (Object.prototype.hasOwnProperty.call(context, 'spawn')) {
        populationOptions.spawn = context.spawn;
      }
      this.populateSceneAfterTerrain(populationOptions);
      this.buildRails();
      this.refreshPortalState();
      const effectiveNext = this.dimensionSettings ?? context.nextDimension ?? null;
      const arrivalRules =
        typeof context.arrivalRules === 'string' && context.arrivalRules.trim().length
          ? context.arrivalRules.trim()
          : this.buildDimensionRuleSummary(
              effectiveNext,
              context.transition?.dimensionRules ?? context.rulesSummary ?? '',
            );
      await this.handleDimensionPostInit({
        ...context,
        previousDimension: context.previousDimension ?? null,
        nextDimension: effectiveNext,
        transition: context.transition ?? null,
        arrivalRules,
      });
      return this.verifyDimensionAssetsAfterTransition({
        previousDimension: context.previousDimension ?? null,
        nextDimension: effectiveNext,
        transition: context.transition ?? null,
        reason,
        errors: this.lastScenePopulationSummaryContext?.errors ?? [],
      });
    }

      return this.reinitialiseDimensionWorld({
        ...context,
        nextDimension: plannedNext,
        rulesSummary: fallbackRules,
        navmeshReason: 'dimension-transition',
