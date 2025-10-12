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

    function applyPenalty(key, options = {}) {
      if (!key) {
        return { ok: false, skipped: true };
      }
      const limit = Math.max(1, Math.floor(options.limit ?? defaultLimit));
      const windowMs = Math.max(1, Math.floor(options.windowMs ?? defaultWindowMs));
      const now = Date.now();
      let bucket = memoryBuckets.get(key);
      if (!bucket) {
        bucket = loadBucketFromStorage(key, { limit, windowMs, now });
      }
      const existingRemainingMs = bucket ? Math.max(0, bucket.resetAt - now) : 0;
      const retryAfterMs = (() => {
        const providedMs = Number.isFinite(options.retryAfterMs)
          ? Math.max(0, Math.floor(options.retryAfterMs))
          : 0;
        const providedSeconds = Number.isFinite(options.retryAfterSeconds)
          ? Math.max(0, Math.floor(options.retryAfterSeconds * 1000))
          : 0;
        const candidate = Math.max(providedMs, providedSeconds, existingRemainingMs);
        if (candidate > 0) {
          return candidate;
        }
        return windowMs;
      })();
      const resetAt = now + retryAfterMs;
      const penalisedBucket = { count: limit, resetAt };
      persistBucketState(key, penalisedBucket, { limit, windowMs, now });
      const finalRetryAfterMs = Math.max(0, resetAt - now);
      return {
        ok: false,
        remaining: 0,
        limit,
        windowMs,
        retryAfterMs: finalRetryAfterMs,
        retryAfterSeconds: finalRetryAfterMs > 0 ? Math.max(1, Math.ceil(finalRetryAfterMs / 1000)) : 0,
      };
    }

    return { consume, reset, applyPenalty };
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

        const retryAfterHeader = typeof response?.headers?.get === 'function' ? response.headers.get('Retry-After') : null;
        const retryAfterSeconds = parseRetryAfterSeconds(retryAfterHeader);
        if (response.status === 429) {
          const penalty = this.applyApiRateLimitPenalty('scores:get', {
            limit: this.scoreFetchRateLimit,
            windowMs: this.scoreFetchWindowSeconds * 1000,
            retryAfterSeconds,
          });
          const penaltySeconds = Number.isFinite(penalty?.retryAfterMs)
            ? penalty.retryAfterMs / 1000
            : Number.isFinite(penalty?.retryAfterSeconds)
              ? penalty.retryAfterSeconds
              : null;
          const waitSeconds = Math.max(
            1,
            Math.ceil(
              Math.max(
                0,
                penaltySeconds ?? 0,
                Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 0,
                this.scoreFetchWindowSeconds,
              ),
            ),
          );
          const statusMessage = `Leaderboard refresh cooling down — retrying in ${waitSeconds}s.`;
          this.setScoreboardStatus(statusMessage, { offline: false });
          this.scheduleScoreboardRateLimitRetry(waitSeconds * 1000);
          this.scoreboardPollTimer = 0;
          return;
        }
        const retryAfterHeader = typeof response?.headers?.get === 'function' ? response.headers.get('Retry-After') : null;
        const retryAfterSeconds = parseRetryAfterSeconds(retryAfterHeader);
        if (response.status === 429) {
          this.pendingScoreSyncReason = reason;
          if (!usingQueuedEntry) {
            this.enqueueScoreSyncEntry(entry, { reason });
            queueRecord = this.peekScoreSyncQueue();
            usingQueuedEntry = true;
          } else if (queueRecord) {
            queueRecord.reason = reason;
            queueRecord.queuedAt = Date.now();
            this.persistScoreSyncQueue();
          }
          const penalty = this.applyApiRateLimitPenalty('scores:post', {
            limit: this.scoreSyncRateLimit,
            windowMs: this.scoreSyncWindowSeconds * 1000,
            retryAfterSeconds,
          });
          const penaltySeconds = Number.isFinite(penalty?.retryAfterMs)
            ? penalty.retryAfterMs / 1000
            : Number.isFinite(penalty?.retryAfterSeconds)
              ? penalty.retryAfterSeconds
              : null;
          const waitSeconds = Math.max(
            1,
            Math.ceil(
              Math.max(
                0,
                penaltySeconds ?? 0,
                Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 0,
                this.scoreSyncWindowSeconds,
              ),
            ),
          );
          const statusMessage = `Sync cooling down — retrying in ${waitSeconds}s.`;
          this.setScoreboardStatus(statusMessage, { offline: false });
          this.showScoreSyncWarning(statusMessage);
          this.emitGameEvent('score-sync-throttled', {
            source: 'sync',
            reason,
            retryAfterSeconds: waitSeconds,
          });
          this.scheduleScoreSyncRetry(waitSeconds * 1000);
          return;
        }
