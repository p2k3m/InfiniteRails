      if (normalizedKey === 'loot' || normalizedKey === 'recipes' || normalizedKey === 'combat') {
        this.captureScoreRecoveryCheckpoint(normalizedKey, amount);
      }
    captureScoreRecoveryCheckpoint(category, amount) {
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const crashRecoveryApi = scope?.InfiniteRails?.crashRecovery;
      if (!crashRecoveryApi || typeof crashRecoveryApi.capture !== 'function') {
        return false;
      }
      const normalizedCategory = typeof category === 'string' ? category.trim().toLowerCase() : '';
      const reason = normalizedCategory ? `score-${normalizedCategory}` : 'score-event';
      const detail = { experience: 'simple' };
      if (normalizedCategory) {
        detail.category = normalizedCategory;
      }
      const numericAmount = Number(amount);
      if (Number.isFinite(numericAmount) && numericAmount !== 0) {
        detail.amount = numericAmount;
      }
      if (this.sessionId) {
        detail.sessionId = this.sessionId;
      }
      if (typeof this.getScoreSnapshot === 'function') {
        try {
          const scoreSnapshot = this.getScoreSnapshot();
          if (scoreSnapshot && typeof scoreSnapshot === 'object') {
            try {
              detail.score = JSON.parse(JSON.stringify(scoreSnapshot));
            } catch (cloneError) {
              detail.score = { ...scoreSnapshot };
            }
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to snapshot score for crash recovery checkpoint.', error);
          }
        }
      }
      if (Number.isFinite(this.elapsed)) {
        detail.elapsedSeconds = Math.max(0, Math.round(this.elapsed));
      }
      if (Number.isFinite(this.currentDimensionIndex)) {
        detail.dimensionIndex = this.currentDimensionIndex;
      }
      try {
        crashRecoveryApi.capture({
          reason,
          stage: 'gameplay',
          detail,
          message: 'Gameplay checkpoint captured.',
          diagnosticMessage: 'Persisted score event checkpoint for crash recovery.',
        });
        return true;
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to persist crash recovery checkpoint for score event.', error);
        }
        return false;
      }
    }

