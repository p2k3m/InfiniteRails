      const summaryContext = this.buildPerformanceMetricsSummary(snapshot);
      if (summaryContext) {
        if (Array.isArray(summaryContext.parts)) {
          snapshot.summaryParts = summaryContext.parts.slice();
        }
        if (typeof summaryContext.summary === 'string' && summaryContext.summary.trim().length) {
          snapshot.summary = summaryContext.summary.trim();
        }
      }
      const summaryLabel =
        typeof snapshot.summary === 'string' && snapshot.summary.trim().length
          ? ` — ${snapshot.summary.trim()}`
          : '';
        console.info(`[Performance] ${label}${summaryLabel}`, snapshot);
          diagnostics.record('performance', `[Performance] ${label}${summaryLabel}`, snapshot, {
    buildPerformanceMetricsSummary(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') {
        return null;
      }
      const parts = [];
      const toNumber = (value) => (Number.isFinite(value) ? value : null);
      const formatMs = (value, digits = 0) => {
        const numeric = toNumber(value);
        if (numeric === null) {
          return null;
        }
        if (digits > 0) {
          return `${numeric.toFixed(digits)}ms`;
        }
        return `${Math.round(numeric).toLocaleString(undefined)}ms`;
      };
      const formatCount = (value) => {
        const numeric = toNumber(value);
        if (numeric === null) {
          return null;
        }
        return Math.round(numeric).toLocaleString(undefined);
      };
      const formatRatePerSecond = (value) => {
        const numeric = toNumber(value);
        if (numeric === null || numeric <= 0) {
          return null;
        }
        if (numeric >= 1000) {
          return `${Math.round(numeric).toLocaleString(undefined)}/s`;
        }
        return `${numeric.toFixed(1)}/s`;
      };
      const formatFps = (value) => {
        const numeric = toNumber(value);
        if (numeric === null || numeric <= 0) {
          return null;
        }
        if (numeric >= 100) {
          return Math.round(numeric).toLocaleString(undefined);
        }
        return numeric.toFixed(1);
      };

      const bootDuration = formatMs(snapshot?.boot?.durationMs ?? null);
      parts.push(`boot ${bootDuration ?? '—'}`);

      const fpsLabel = formatFps(snapshot?.fps ?? null);
      parts.push(`fps ${fpsLabel ?? '—'}`);

      const world = snapshot?.worldGeneration || {};
      const rawWorldVoxels = toNumber(world.voxels);
      const rawWorldDuration = toNumber(world.durationMs);
      let voxelsPerSecond = toNumber(world.voxelsPerSecond);
      if (
        voxelsPerSecond === null &&
        rawWorldVoxels !== null &&
        rawWorldDuration !== null &&
        rawWorldDuration > 0
      ) {
        voxelsPerSecond = (rawWorldVoxels * 1000) / rawWorldDuration;
      }
      const worldVoxels = formatCount(rawWorldVoxels);
      const worldDuration = formatMs(rawWorldDuration);
      const worldRate = formatRatePerSecond(voxelsPerSecond);
      const worldColumns = formatCount(world.columns ?? null);
      const worldSegments = [];
      if (worldVoxels && worldRate) {
        worldSegments.push(`${worldVoxels} vox`);
        worldSegments.push(worldRate);
      } else if (worldVoxels) {
        worldSegments.push(`${worldVoxels} vox`);
      } else if (worldRate) {
        worldSegments.push(worldRate);
      }
      if (worldDuration) {
        worldSegments.push(worldDuration);
      }
      if (worldColumns) {
        worldSegments.push(`${worldColumns} cols`);
      }
      parts.push(`world ${worldSegments.length ? worldSegments.join(' · ') : '—'}`);

      const input = snapshot?.inputLatency || {};
      const inputAvg = formatMs(input.averageMs ?? null, 1);
      const inputMax = formatMs(input.maxMs ?? null, 1);
      const inputSamples = formatCount(input.samples ?? null);
      const inputLast = formatMs(input.lastMs ?? input.lastLatencyMs ?? null, 1);
      const inputLastSource = typeof input.lastSource === 'string' && input.lastSource.trim().length ? input.lastSource.trim() : null;
      const inputSegments = [];
      if (inputAvg) {
        inputSegments.push(`${inputAvg} avg`);
      }
      if (inputMax) {
        inputSegments.push(`${inputMax} max`);
      }
      if (inputSamples) {
        inputSegments.push(`${inputSamples} samples`);
      }
      if (inputLast) {
        inputSegments.push(inputLastSource ? `${inputLast} last (${inputLastSource})` : `${inputLast} last`);
      }
      parts.push(`input ${inputSegments.length ? inputSegments.join(' · ') : '—'}`);

      return { summary: parts.join(' | '), parts };
    }

