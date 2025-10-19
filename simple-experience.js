      const respawnPlanSnapshot = (() => {
        const plan = this.lastAutoRespawnPlan;
        if (!plan || typeof plan !== 'object') {
          return null;
        }
        const reason = typeof plan.reason === 'string' && plan.reason.trim().length ? plan.reason.trim() : null;
        const source = typeof plan.source === 'string' && plan.source.trim().length ? plan.source.trim() : null;
        const columnKey = typeof plan.columnKey === 'string' && plan.columnKey.trim().length ? plan.columnKey.trim() : null;
        let target = null;
        if (plan.target && typeof plan.target === 'object') {
          const gridX = Number.isFinite(plan.target.gridX) ? Math.round(plan.target.gridX) : null;
          const gridZ = Number.isFinite(plan.target.gridZ) ? Math.round(plan.target.gridZ) : null;
          let worldPosition = null;
          if (plan.target.worldPosition && typeof plan.target.worldPosition === 'object') {
            const wp = plan.target.worldPosition;
            const x = Number.isFinite(wp.x) ? wp.x : null;
            const y = Number.isFinite(wp.y) ? wp.y : null;
            const z = Number.isFinite(wp.z) ? wp.z : null;
            if (x !== null || y !== null || z !== null) {
              worldPosition = { x, y, z };
            }
          }
          if (gridX !== null || gridZ !== null || worldPosition) {
            target = { gridX, gridZ, worldPosition };
          }
        }
        if (!reason && !source && !columnKey && !target) {
          return null;
        }
        return { reason, source, columnKey, target };
      })();
      const inventoryRestored = Boolean(this.restoreRespawnInventorySnapshot());
      const respawnSource = (() => {
        if (respawnPlanSnapshot?.source) {
          return respawnPlanSnapshot.source;
        }
        const safeReason =
          typeof this.safeSpawnBoxGroup?.userData?.reason === 'string' && this.safeSpawnBoxGroup.userData.reason.trim().length
            ? this.safeSpawnBoxGroup.userData.reason.trim()
            : null;
        return safeReason || 'spawn-column';
      })();
      const inventoryCount = Math.max(0, this.getTotalInventoryCount());
      const summary = typeof this.createRunSummary === 'function' ? this.createRunSummary('respawn') : null;
      this.emitGameEvent('player-defeated', {
        respawnSource,
        respawnPlan: respawnPlanSnapshot,
        inventoryRestored,
        inventoryCount,
        scorePenalty: penalty,
        summary,
      });
