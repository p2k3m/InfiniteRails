      const previousScore = Number.isFinite(this.score) ? this.score : 0;
      const inventoryRestored = this.restoreRespawnInventorySnapshot();
      const penalty = Math.min(4, Math.max(0, previousScore));
      this.score = Math.max(0, previousScore - penalty);
      const inventoryCount = Math.max(0, this.getTotalInventoryCount?.() ?? 0);
      const respawnPlan = this.lastAutoRespawnPlan ? { ...this.lastAutoRespawnPlan } : null;
      const respawnSource =
        typeof respawnPlan?.source === 'string' && respawnPlan.source.trim().length
          ? respawnPlan.source.trim()
          : null;
      this.emitGameEvent('player-defeated', {
        reason: 'health-depleted',
        inventoryRestored: Boolean(inventoryRestored),
        inventoryCount,
        scorePenalty: penalty,
        scoreAfter: this.score,
        respawnPlan,
        respawnSource,
      });
