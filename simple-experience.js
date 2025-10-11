    ensureScoreTraceMetadata(entry, reason) {
      if (!entry || typeof entry !== 'object') {
        return { entry, trace: null };
      }
      if (!traceUtilities || typeof traceUtilities.buildContext !== 'function') {
        return { entry, trace: null };
      }
      const existingTrace =
        entry.trace && typeof entry.trace === 'object' && !Array.isArray(entry.trace)
          ? { ...entry.trace }
          : {};
      const rawReason = typeof reason === 'string' ? reason.trim() : '';
      const traceReason = rawReason.length > 0 ? rawReason : existingTrace.reason ?? null;
      const slug = traceReason
        ? traceReason.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        : '';
      const label = slug ? `score-${slug}` : 'score-update';
      let context;
      try {
        const providedTraceId = existingTrace.traceId ?? null;
        context = traceUtilities.buildContext(providedTraceId, label);
      } catch (error) {
        context = null;
        if (traceUtilities && typeof traceUtilities.createTraceId === 'function') {
          try {
            const traceId = traceUtilities.createTraceId(label);
            context = { traceId, sessionId: traceUtilities.sessionId };
          } catch (generationError) {
            context = null;
          }
        }
      }
      if (!context || typeof context.traceId !== 'string' || !context.traceId) {
        return { entry, trace: null };
      }
      const updatedTrace = {
        ...existingTrace,
        traceId: context.traceId,
        sessionId: context.sessionId,
        scope: existingTrace.scope || 'score',
        source: existingTrace.source || 'simple-experience',
        label,
      };
      if (traceReason) {
        updatedTrace.reason = traceReason;
      }
      entry.trace = updatedTrace;
      return { entry, trace: { ...context, label, reason: traceReason ?? null } };
    }

            this.ensureScoreTraceMetadata(clonedEntry, reason || 'queued');
      const summary = {
      this.ensureScoreTraceMetadata(summary, reason || 'update');
      return summary;
      const { trace } = this.ensureScoreTraceMetadata(entry, reason);
      const traceId = trace?.traceId ?? entry?.trace?.traceId ?? null;
      const traceSession = trace?.sessionId ?? entry?.trace?.sessionId ?? null;
      const requestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(entry),
        credentials: 'omit',
      };
      if (traceId) {
        requestInit.traceId = traceId;
      }
      if (traceSession) {
        requestInit.sessionId = traceSession;
      }
        const response = await fetch(url, requestInit);
      const { trace } = this.ensureScoreTraceMetadata(summary, 'unload');
          const traceId = trace?.traceId ?? summary?.trace?.traceId ?? null;
          const traceSession = trace?.sessionId ?? summary?.trace?.sessionId ?? null;
          const requestInit = {
          };
          if (traceId) {
            requestInit.traceId = traceId;
          }
          if (traceSession) {
            requestInit.sessionId = traceSession;
          }
          fetch(url, requestInit).catch(() => {});
