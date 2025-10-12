  function parseRetryAfterSeconds(value, now = Date.now()) {
    if (value === undefined || value === null) {
      return null;
    }
    const stringValue = typeof value === 'string' ? value : String(value);
    const trimmed = stringValue.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric < 0 ? 0 : numeric;
    }
    const parsedDate = Date.parse(trimmed);
    if (Number.isFinite(parsedDate)) {
      const nowMs = Number.isFinite(now) ? now : Date.now();
      const deltaMs = parsedDate - nowMs;
      if (deltaMs <= 0) {
        return 0;
      }
      return deltaMs / 1000;
    }
    return null;
  }

    applyApiRateLimitPenalty(scopeKey, options = {}) {
      if (!scopeKey) {
        return { ok: false, skipped: true };
      }
      if (!this.apiRateLimiter || typeof this.apiRateLimiter.applyPenalty !== 'function') {
        return { ok: false, skipped: true };
      }
      const identity = this.getRateLimitIdentity();
      const key = `${scopeKey}:${identity}`;
      return this.apiRateLimiter.applyPenalty(key, options);
    }

        if (response && response.status === 429) {
          const retryAfterHeader = typeof response.headers?.get === 'function'
            ? response.headers.get('Retry-After')
            : null;
          const retryAfterSeconds = parseRetryAfterSeconds(retryAfterHeader);
          const penalty = this.applyApiRateLimitPenalty('scores:get', {
            limit: this.scoreFetchRateLimit,
            windowMs: this.scoreFetchWindowSeconds * 1000,
            retryAfterSeconds,
          });
          const penaltyMs = Number.isFinite(penalty?.retryAfterMs) ? penalty.retryAfterMs : 0;
          const headerMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0;
          const windowMs = this.scoreFetchWindowSeconds * 1000;
          const waitMs = Math.max(penaltyMs, headerMs, windowMs, 0);
          const waitSeconds = Math.max(1, Math.ceil(waitMs / 1000));
          const statusMessage = `Leaderboard refresh cooling down — retrying in ${waitSeconds}s.`;
          this.setScoreboardStatus(statusMessage, { offline: false });
          this.scheduleScoreboardRateLimitRetry(waitMs);
          this.scoreboardPollTimer = 0;
          return;
        }
        if (response && response.status === 429) {
          const retryAfterHeader = typeof response.headers?.get === 'function'
            ? response.headers.get('Retry-After')
            : null;
          const retryAfterSeconds = parseRetryAfterSeconds(retryAfterHeader);
          const penalty = this.applyApiRateLimitPenalty('scores:post', {
            limit: this.scoreSyncRateLimit,
            windowMs: this.scoreSyncWindowSeconds * 1000,
            retryAfterSeconds,
          });
          const penaltyMs = Number.isFinite(penalty?.retryAfterMs) ? penalty.retryAfterMs : 0;
          const headerMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0;
          const windowMs = this.scoreSyncWindowSeconds * 1000;
          const waitMs = Math.max(penaltyMs, headerMs, windowMs, 0);
          const waitSeconds = Math.max(1, Math.ceil(waitMs / 1000));
          this.pendingScoreSyncReason = reason;
          if (!usingQueuedEntry) {
            this.enqueueScoreSyncEntry(entry, { reason });
            queueRecord = this.peekScoreSyncQueue();
            usingQueuedEntry = Boolean(queueRecord);
          } else if (queueRecord) {
            queueRecord.reason = reason;
            queueRecord.queuedAt = Date.now();
            this.persistScoreSyncQueue();
          }
          const statusMessage = `Sync cooling down — retrying in ${waitSeconds}s.`;
          this.setScoreboardStatus(statusMessage, { offline: false });
          this.showScoreSyncWarning(statusMessage);
          this.emitGameEvent('score-sync-throttled', {
            source: 'sync',
            reason,
            retryAfterSeconds: waitSeconds,
          });
          this.scheduleScoreSyncRetry(waitMs);
          return;
        }
