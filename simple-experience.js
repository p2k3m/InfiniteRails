      this.performanceMetrics = {
        boot: {
          startedAt: null,
          startedAtEpoch: null,
          completedAt: null,
          completedAtEpoch: null,
          durationMs: null,
          success: null,
          phase: null,
          error: null,
        },
        worldGen: {
          lastStartedAt: null,
          lastStartedAtEpoch: null,
          completedAt: null,
          completedAtEpoch: null,
          durationMs: null,
          voxels: null,
          voxelsPerSecond: null,
          columns: WORLD_SIZE * WORLD_SIZE,
          chunkCount: null,
          integrityValid: null,
          heightmapSource: null,
          fallbackReason: null,
          reason: null,
        },
        input: {
          pending: [],
          samples: 0,
          totalLatencyMs: 0,
          maxLatencyMs: 0,
          lastLatencyMs: 0,
          lastSource: null,
          lastProcessedAt: null,
          lastReportTimestamp: 0,
        },
        scheduledReports: new Set(),
        lastSnapshot: null,
      };
      const metrics = this.performanceMetrics || null;
      if (metrics?.boot) {
        const startedAt =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
        metrics.boot.startedAt = startedAt;
        metrics.boot.startedAtEpoch = Date.now();
        metrics.boot.completedAt = null;
        metrics.boot.completedAtEpoch = null;
        metrics.boot.durationMs = null;
        metrics.boot.success = null;
        metrics.boot.phase = 'start';
        metrics.boot.error = null;
      }
      if (metrics?.input) {
        metrics.input.pending.length = 0;
        metrics.input.samples = 0;
        metrics.input.totalLatencyMs = 0;
        metrics.input.maxLatencyMs = 0;
        metrics.input.lastLatencyMs = 0;
        metrics.input.lastSource = null;
        metrics.input.lastProcessedAt = null;
        metrics.input.lastReportTimestamp = 0;
      }
      if (metrics?.worldGen) {
        metrics.worldGen.voxels = null;
        metrics.worldGen.voxelsPerSecond = null;
        metrics.worldGen.chunkCount = null;
        metrics.worldGen.integrityValid = null;
        metrics.worldGen.heightmapSource = null;
        metrics.worldGen.fallbackReason = null;
        metrics.worldGen.durationMs = null;
        metrics.worldGen.completedAt = null;
        metrics.worldGen.completedAtEpoch = null;
      }
      this.clearPerformanceMetricsReports();
        if (metrics?.boot) {
          const completedAt =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now();
          metrics.boot.completedAt = completedAt;
          metrics.boot.completedAtEpoch = Date.now();
          metrics.boot.durationMs =
            Number.isFinite(metrics.boot.startedAt) ? completedAt - metrics.boot.startedAt : null;
          metrics.boot.success = true;
        }
        this.queuePerformanceMetricsReport('boot-complete', 0);
        this.queuePerformanceMetricsReport('post-boot-sample', 1500);
        if (metrics?.boot) {
          const failedAt =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now();
          metrics.boot.completedAt = failedAt;
          metrics.boot.completedAtEpoch = Date.now();
          metrics.boot.durationMs =
            Number.isFinite(metrics.boot.startedAt) ? failedAt - metrics.boot.startedAt : null;
          metrics.boot.success = false;
          metrics.boot.error = normaliseLiveDiagnosticError(error) ?? { message: errorMessage };
        }
        this.queuePerformanceMetricsReport('boot-failed', 0, { extra: { message: errorMessage } });
      this.clearPerformanceMetricsReports();
      if (this.performanceMetrics?.input) {
        const input = this.performanceMetrics.input;
        input.pending.length = 0;
        input.samples = 0;
        input.totalLatencyMs = 0;
        input.maxLatencyMs = 0;
        input.lastLatencyMs = 0;
        input.lastSource = null;
        input.lastProcessedAt = null;
        input.lastReportTimestamp = 0;
      }
      this.recordInputLatencySample('virtual-joystick', event);
      this.recordInputLatencySample('touch-button', event);
      this.recordInputLatencySample('touch-portal', event);
      this.recordInputLatencySample('touch-look', event);
    clearPerformanceMetricsReports() {
      const metrics = this.performanceMetrics;
      if (!metrics || !metrics.scheduledReports) {
        return;
      }
      const handles = Array.from(metrics.scheduledReports);
      metrics.scheduledReports.clear();
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      handles.forEach((handle) => {
        if (!handle) {
          return;
        }
        const clearFn = scope && typeof scope.clearTimeout === 'function' ? scope.clearTimeout : clearTimeout;
        if (typeof clearFn === 'function') {
          try {
            clearFn(handle);
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Failed to clear performance metrics timer.', error);
            }
          }
        }
      });
    }

    queuePerformanceMetricsReport(eventLabel, delayMs = 0, context = {}) {
      const metrics = this.performanceMetrics;
      if (!metrics || !metrics.scheduledReports) {
        return null;
      }
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const scheduleFn =
        scope && typeof scope.setTimeout === 'function'
          ? scope.setTimeout.bind(scope)
          : typeof setTimeout === 'function'
            ? setTimeout
            : null;
      if (!scheduleFn) {
        try {
          this.reportPerformanceMetrics(eventLabel, context);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Performance metrics immediate report failed.', error);
          }
        }
        return null;
      }
      const timeout = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
      const handle = scheduleFn(() => {
        metrics.scheduledReports.delete(handle);
        try {
          this.reportPerformanceMetrics(eventLabel, context);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Performance metrics report failed.', error);
          }
        }
      }, timeout);
      metrics.scheduledReports.add(handle);
      return handle;
    }

    reportPerformanceMetrics(eventLabel, context = {}) {
      const snapshot = this.createPerformanceMetricsSnapshot({ ...context, event: eventLabel });
      if (!snapshot) {
        return;
      }
      if (!snapshot.event && typeof eventLabel === 'string' && eventLabel.trim().length) {
        snapshot.event = eventLabel.trim();
      }
      this.performanceMetrics.lastSnapshot = snapshot;
      const label = snapshot.event || eventLabel || 'sample';
      if (typeof console !== 'undefined' && typeof console.info === 'function') {
        console.info(`[Performance] ${label}`, snapshot);
      }
      try {
        const diagnostics = runtimeScope?.InfiniteRails?.diagnostics;
        if (diagnostics && typeof diagnostics.record === 'function') {
          diagnostics.record('performance', `[Performance] ${label}`, snapshot, {
            level: 'info',
            analytics: 'performance',
          });
        }
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to record performance metrics via diagnostics API.', error);
        }
      }
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      if (scope && typeof scope.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        try {
          scope.dispatchEvent(
            new CustomEvent('infinite-rails:performance-metrics', {
              detail: { event: label, metrics: snapshot, timestamp: Date.now() },
            }),
          );
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to dispatch performance metrics event.', error);
          }
        }
      }
    }

    createPerformanceMetricsSnapshot(context = {}) {
      const metrics = this.performanceMetrics || null;
      if (!metrics) {
        return null;
      }
      const boot = metrics.boot || {};
      const world = metrics.worldGen || {};
      const input = metrics.input || {};
      const fpsValue = Number.isFinite(this.frameStats?.fps) ? this.frameStats.fps : null;
      const averageLatency =
        input.samples > 0 && Number.isFinite(input.totalLatencyMs)
          ? input.totalLatencyMs / input.samples
          : null;
      const snapshot = {
        event: typeof context.event === 'string' && context.event.trim().length ? context.event.trim() : null,
        timestamp: new Date().toISOString(),
        rendererMode: 'simple',
        boot: {
          durationMs: Number.isFinite(boot.durationMs) ? Number(boot.durationMs.toFixed(2)) : null,
          success: typeof boot.success === 'boolean' ? boot.success : null,
          phase: boot.phase ?? null,
          startedAtEpoch: boot.startedAtEpoch ?? null,
          completedAtEpoch: boot.completedAtEpoch ?? null,
          error: boot.error ?? null,
        },
        fps: Number.isFinite(fpsValue) ? Number(fpsValue.toFixed(2)) : null,
        worldGeneration: {
          durationMs: Number.isFinite(world.durationMs) ? Number(world.durationMs.toFixed(2)) : null,
          voxels: Number.isFinite(world.voxels) ? Math.round(world.voxels) : null,
          voxelsPerSecond: Number.isFinite(world.voxelsPerSecond)
            ? Number(world.voxelsPerSecond.toFixed(2))
            : null,
          columns: Number.isFinite(world.columns) ? Math.round(world.columns) : WORLD_SIZE * WORLD_SIZE,
          chunkCount: Number.isFinite(world.chunkCount) ? Math.round(world.chunkCount) : null,
          integrityValid: typeof world.integrityValid === 'boolean' ? world.integrityValid : null,
          heightmapSource: world.heightmapSource ?? null,
          fallbackReason: world.fallbackReason ?? null,
          reason: world.reason ?? null,
        },
        inputLatency: {
          samples: Number.isFinite(input.samples) ? input.samples : 0,
          averageMs: Number.isFinite(averageLatency) ? Number(averageLatency.toFixed(2)) : null,
          maxMs: Number.isFinite(input.maxLatencyMs) ? Number(input.maxLatencyMs.toFixed(2)) : null,
          lastMs: Number.isFinite(input.lastLatencyMs) ? Number(input.lastLatencyMs.toFixed(2)) : null,
          lastSource: input.lastSource ?? null,
        },
      };
      if (context.extra && typeof context.extra === 'object') {
        snapshot.extra = { ...context.extra };
      }
      return snapshot;
    }

    normaliseEventTimestamp(event) {
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      if (!event || typeof event.timeStamp !== 'number') {
        return now;
      }
      const stamp = event.timeStamp;
      if (!Number.isFinite(stamp)) {
        return now;
      }
      if (stamp > 1_000_000_000_000) {
        const origin =
          typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin)
            ? performance.timeOrigin
            : Date.now() - now;
        return stamp - origin;
      }
      if (stamp < 0) {
        return now;
      }
      if (stamp > now + 1000) {
        return now;
      }
      return stamp;
    }

    recordInputLatencySample(source, event) {
      const metrics = this.performanceMetrics;
      if (!metrics || !metrics.input || !Array.isArray(metrics.input.pending)) {
        return;
      }
      const stats = metrics.input;
      const timestamp = this.normaliseEventTimestamp(event);
      const current =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      stats.pending.push({
        eventTimestamp: timestamp,
        source: typeof source === 'string' && source.trim().length ? source.trim() : 'input',
        enqueuedAt: current,
      });
      const maxQueue = 120;
      if (stats.pending.length > maxQueue) {
        stats.pending.splice(0, stats.pending.length - maxQueue);
      }
    }

    processInputLatencySamples(frameTimestamp) {
      const metrics = this.performanceMetrics;
      if (!metrics || !metrics.input || !Array.isArray(metrics.input.pending) || !metrics.input.pending.length) {
        return;
      }
      const stats = metrics.input;
      const now = Number.isFinite(frameTimestamp)
        ? frameTimestamp
        : typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      while (stats.pending.length) {
        const sample = stats.pending.shift();
        if (!sample) {
          continue;
        }
        const latency = Math.max(0, now - (Number.isFinite(sample.eventTimestamp) ? sample.eventTimestamp : now));
        if (!Number.isFinite(stats.samples)) {
          stats.samples = 0;
        }
        if (!Number.isFinite(stats.totalLatencyMs)) {
          stats.totalLatencyMs = 0;
        }
        if (!Number.isFinite(stats.maxLatencyMs)) {
          stats.maxLatencyMs = 0;
        }
        stats.samples += 1;
        stats.totalLatencyMs += latency;
        stats.maxLatencyMs = Math.max(stats.maxLatencyMs, latency);
        stats.lastLatencyMs = latency;
        stats.lastSource = sample.source ?? stats.lastSource ?? null;
      }
      stats.lastProcessedAt = Date.now();
      const reportInterval = 2000;
      const lastReport = Number.isFinite(stats.lastReportTimestamp) ? stats.lastReportTimestamp : 0;
      if (now - lastReport >= reportInterval) {
        stats.lastReportTimestamp = now;
        this.reportPerformanceMetrics('input-latency');
      }
    }

      const metrics = this.performanceMetrics || null;
      const worldMetrics = metrics?.worldGen ?? null;
      const worldGenStartedAt =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      const worldGenStartedEpoch = Date.now();
      if (worldMetrics) {
        worldMetrics.lastStartedAt = worldGenStartedAt;
        worldMetrics.lastStartedAtEpoch = worldGenStartedEpoch;
        worldMetrics.reason = buildReason;
      }
      if (worldMetrics) {
        const worldGenCompletedAt =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
        worldMetrics.completedAt = worldGenCompletedAt;
        worldMetrics.completedAtEpoch = Date.now();
        worldMetrics.durationMs =
          Number.isFinite(worldMetrics.lastStartedAt)
            ? worldGenCompletedAt - worldMetrics.lastStartedAt
            : null;
        const summaryStats = summary && typeof summary === 'object' ? summary.summary : null;
        const voxelsUsed = summaryStats?.voxelsUsed ?? summaryStats?.voxelCount ?? null;
        worldMetrics.voxels = Number.isFinite(voxelsUsed) ? voxelsUsed : null;
        worldMetrics.chunkCount = Number.isFinite(summaryStats?.chunkCount) ? summaryStats.chunkCount : null;
        worldMetrics.integrityValid =
          summaryStats?.integrity && typeof summaryStats.integrity.valid === 'boolean'
            ? summaryStats.integrity.valid
            : null;
        worldMetrics.heightmapSource = summaryStats?.heightmapSource ?? null;
        worldMetrics.fallbackReason = summaryStats?.fallbackReason ?? null;
        worldMetrics.columns = Number.isFinite(worldMetrics.columns) ? worldMetrics.columns : WORLD_SIZE * WORLD_SIZE;
        if (
          Number.isFinite(worldMetrics.durationMs) &&
          worldMetrics.durationMs > 0 &&
          Number.isFinite(worldMetrics.voxels)
        ) {
          worldMetrics.voxelsPerSecond = (worldMetrics.voxels * 1000) / worldMetrics.durationMs;
        } else {
          worldMetrics.voxelsPerSecond = null;
        }
      }
      this.reportPerformanceMetrics('world-generation', { extra: { reason: buildReason } });
      this.recordInputLatencySample('keyboard', event);
      this.recordInputLatencySample('mouse', event);
      this.processInputLatencySamples(timestamp);
