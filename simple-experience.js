      this.lastWorkerAiSummary = null;
          workerSupport: { world: false, mesh: false, ai: false },
          workerAi: null,
        metrics.workerSupport = { world: false, mesh: false, ai: false };
        metrics.workerSupport.ai = false;
      metrics.workerAi = null;
      this.lastWorkerAiSummary = null;
        metrics.workerSupport = { world: false, mesh: false, ai: false };
      if (
        summaryStats?.workerSupport &&
        Object.prototype.hasOwnProperty.call(summaryStats.workerSupport, 'ai')
      ) {
        metrics.workerSupport.ai = Boolean(summaryStats.workerSupport.ai);
      }
      if (summaryStats && Object.prototype.hasOwnProperty.call(summaryStats, 'workerAi')) {
        metrics.workerAi = summaryStats.workerAi;
      }
    normaliseWorkerAiResult(result, options = {}) {
      if (!result || typeof result !== 'object') {
        return null;
      }
      const updateCount = Number.isFinite(result.count)
        ? Math.max(0, Math.floor(result.count))
        : Array.isArray(result.updates)
          ? result.updates.length
          : null;
      const deltaCandidate = Number.isFinite(result.delta) ? result.delta : options.delta;
      const delta = Number.isFinite(deltaCandidate) ? Number(deltaCandidate) : null;
      const methodLabel = typeof options.methodName === 'string' ? options.methodName.trim() : '';
      const entityType = methodLabel.length ? methodLabel : null;
      return {
        source: 'worker-simulated',
        updateCount,
        delta,
        workerGeneratedAt: Number.isFinite(result.generatedAt) ? result.generatedAt : null,
        entityType,
      };
    }

    applyWorkerAiResult(result, options = {}) {
      if (!result || typeof result !== 'object') {
        return null;
      }
      let summary = null;
      if (typeof this.normaliseWorkerAiResult === 'function') {
        try {
          summary = this.normaliseWorkerAiResult(result, options);
        } catch (error) {
          if (typeof console !== 'undefined' && console.debug) {
            console.debug('Failed to normalise worker AI result.', error);
          }
        }
      }
      if (!summary) {
        return null;
      }
      this.lastWorkerAiSummary = summary;
      const metrics = this?.performanceMetrics?.worldGen ?? null;
      if (metrics) {
        if (!metrics.workerSupport || typeof metrics.workerSupport !== 'object') {
          metrics.workerSupport = { world: false, mesh: false, ai: false };
        }
        if (typeof metrics.workerSupport.world !== 'boolean') {
          metrics.workerSupport.world = false;
        }
        if (typeof metrics.workerSupport.mesh !== 'boolean') {
          metrics.workerSupport.mesh = false;
        }
        metrics.workerSupport.ai = true;
        metrics.workerAi = {
          source: summary.source ?? 'worker-simulated',
          updateCount: Number.isFinite(summary.updateCount) ? summary.updateCount : null,
          delta:
            Number.isFinite(summary.delta)
              ? summary.delta
              : Number.isFinite(result.delta)
                ? result.delta
                : Number.isFinite(options.delta)
                  ? options.delta
                  : null,
          generatedAt:
            Number.isFinite(summary.workerGeneratedAt)
              ? summary.workerGeneratedAt
              : Number.isFinite(summary.generatedAt)
                ? summary.generatedAt
                : Number.isFinite(result.generatedAt)
                  ? result.generatedAt
                  : null,
          entityType: summary.entityType ?? options.methodName ?? null,
        };
      }
      return summary;
    }

      if (aiResult) {
        this.applyWorkerAiResult(aiResult, { methodName: 'updateZombies', delta });
      }
