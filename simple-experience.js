  function createSessionRateLimiter({
    defaultLimit = 60,
    defaultWindowMs = 60_000,
    channelName = 'infinite-rails:rate-limit',
    storageKeyPrefix = 'infinite-rails.rate-limit',
    scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null,
  } = {}) {
    const runtimeScope = scope || (typeof globalThis !== 'undefined' ? globalThis : null);
    const memoryBuckets = new Map();
    const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const storage = (() => {
      const store = runtimeScope?.localStorage || null;
      if (!store) {
        return null;
      }
      try {
        const testKey = `${storageKeyPrefix}::__test__`;
        store.setItem(testKey, '1');
        store.removeItem(testKey);
        return store;
      } catch (error) {
        return null;
      }
    })();

    const broadcastChannel = (() => {
      if (!runtimeScope || typeof runtimeScope.BroadcastChannel !== 'function') {
        return null;
      }
      try {
        return new runtimeScope.BroadcastChannel(channelName);
      } catch (error) {
        return null;
      }
    })();

    const storageEventTarget =
      runtimeScope && typeof runtimeScope.addEventListener === 'function' ? runtimeScope : null;

    function buildStorageKey(key) {
      return `${storageKeyPrefix}:${key}`;
    }

    function normaliseBucketState(state, { limit, windowMs, now }) {
      if (!state || typeof state !== 'object') {
        return null;
      }
      const count = Number(state.count);
      const resetAt = Number(state.resetAt);
      if (!Number.isFinite(count) || count < 0 || !Number.isFinite(resetAt)) {
        return null;
      }
      const normalisedCount = Math.max(0, Math.floor(count));
      const normalisedResetAt = resetAt;
      if (now >= normalisedResetAt) {
        return { count: 0, resetAt: now + windowMs };
      }
      return { count: normalisedCount, resetAt: normalisedResetAt };
    }

    function loadBucketFromStorage(key, { limit, windowMs, now }) {
      if (!storage) {
        return null;
      }
      const storageKey = buildStorageKey(key);
      let rawValue = null;
      try {
        rawValue = storage.getItem(storageKey);
      } catch (error) {
        return null;
      }
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        return null;
      }
      let parsed;
      try {
        parsed = JSON.parse(rawValue);
      } catch (error) {
        try {
          storage.removeItem(storageKey);
        } catch (removeError) {}
        return null;
      }
      const bucket = normaliseBucketState(parsed, { limit, windowMs, now });
      if (!bucket) {
        try {
          storage.removeItem(storageKey);
        } catch (removeError) {}
        return null;
      }
      return bucket;
    }

    function persistBucketState(key, bucket, { limit, windowMs, now }) {
      memoryBuckets.set(key, bucket);
      const payload = {
        count: bucket.count,
        resetAt: bucket.resetAt,
        limit,
        windowMs,
        updatedAt: now,
        sourceId: instanceId,
      };
      if (storage) {
        try {
          storage.setItem(buildStorageKey(key), JSON.stringify(payload));
        } catch (error) {}
      }
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'rate-limit:update',
            key,
            bucket: payload,
            sourceId: instanceId,
          });
        } catch (error) {}
      }
    }

    function removeBucketState(key, { broadcast = true } = {}) {
      memoryBuckets.delete(key);
      if (storage) {
        try {
          storage.removeItem(buildStorageKey(key));
        } catch (error) {}
      }
      if (broadcast && broadcastChannel) {
        try {
          broadcastChannel.postMessage({ type: 'rate-limit:reset', key, sourceId: instanceId });
        } catch (error) {}
      }
    }

    function handleExternalBucket(key, payload) {
      if (!key) {
        return;
      }
      const now = Date.now();
      const limit = Number.isFinite(payload?.limit) && payload.limit > 0
        ? Math.floor(payload.limit)
        : defaultLimit;
      const windowMs = Number.isFinite(payload?.windowMs) && payload.windowMs > 0
        ? Math.floor(payload.windowMs)
        : defaultWindowMs;
      const bucket = normaliseBucketState(payload, { limit, windowMs, now });
      if (!bucket) {
        memoryBuckets.delete(key);
        return;
      }
      memoryBuckets.set(key, bucket);
    }

    if (broadcastChannel) {
      broadcastChannel.addEventListener('message', (event) => {
        const data = event?.data;
        if (!data || data.sourceId === instanceId) {
          return;
        }
        if (data.type === 'rate-limit:update' && data.key) {
          handleExternalBucket(data.key, data.bucket);
        } else if (data.type === 'rate-limit:reset' && data.key) {
          memoryBuckets.delete(data.key);
        }
      });
    }

    if (storage && storageEventTarget) {
      storageEventTarget.addEventListener('storage', (event) => {
        if (!event || typeof event.key !== 'string') {
          return;
        }
        if (!event.key.startsWith(`${storageKeyPrefix}:`)) {
          return;
        }
        const key = event.key.slice(storageKeyPrefix.length + 1);
        if (!key) {
          return;
        }
        if (event.newValue === null) {
          memoryBuckets.delete(key);
          return;
        }
        let payload;
        try {
          payload = JSON.parse(event.newValue);
        } catch (error) {
          memoryBuckets.delete(key);
          return;
        }
        handleExternalBucket(key, payload);
      });
    }

    function consume(key, options = {}) {
      if (!key) {
        return { ok: true, skipped: true };
      }
      const limit = Math.max(1, Math.floor(options.limit ?? defaultLimit));
      const windowMs = Math.max(1, Math.floor(options.windowMs ?? defaultWindowMs));
      const now = Date.now();
      let bucket = memoryBuckets.get(key);
      if (!bucket) {
        bucket = loadBucketFromStorage(key, { limit, windowMs, now });
      }
      if (!bucket) {
        bucket = { count: 0, resetAt: now + windowMs };
      }
      if (now >= bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + windowMs;
      }
      if (bucket.count >= limit) {
        persistBucketState(key, bucket, { limit, windowMs, now });
        const retryAfterMs = Math.max(0, bucket.resetAt - now);
        return {
          ok: false,
          retryAfterMs,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
          remaining: 0,
          limit,
          windowMs,
        };
      }
      bucket.count += 1;
      persistBucketState(key, bucket, { limit, windowMs, now });
      return {
        ok: true,
        remaining: Math.max(0, limit - bucket.count),
        limit,
        windowMs,
      };
    }

    function reset(key) {
      if (!key) {
        return;
      }
      removeBucketState(key);
    }

    return { consume, reset };
  }

      this.apiRateLimiter = createSessionRateLimiter();
      this.scoreFetchRateLimit = Number.isFinite(options.scoreFetchRateLimit)
        ? Math.max(1, Math.floor(options.scoreFetchRateLimit))
        : 8;
      this.scoreFetchWindowSeconds = Number.isFinite(options.scoreFetchWindowSeconds)
        ? Math.max(10, Math.floor(options.scoreFetchWindowSeconds))
        : 60;
      this.scoreSyncRateLimit = Number.isFinite(options.scoreSyncRateLimit)
        ? Math.max(1, Math.floor(options.scoreSyncRateLimit))
        : 6;
      this.scoreSyncWindowSeconds = Number.isFinite(options.scoreSyncWindowSeconds)
        ? Math.max(10, Math.floor(options.scoreSyncWindowSeconds))
        : 60;
      this.scoreboardRateLimitTimer = null;
      this.scoreSyncRateLimitTimer = null;
    getRateLimitIdentity() {
      if (typeof this.playerGoogleId === 'string' && this.playerGoogleId.trim().length) {
        return `user:${this.playerGoogleId.trim()}`;
      }
      if (typeof this.sessionId === 'string' && this.sessionId.trim().length) {
        return `session:${this.sessionId.trim()}`;
      }
      return 'session:anonymous';
    }

    consumeApiRateLimit(scope, options = {}) {
      if (!this.apiRateLimiter || typeof this.apiRateLimiter.consume !== 'function') {
        return { ok: true, skipped: true };
      }
      const identity = this.getRateLimitIdentity();
      const key = `${scope}:${identity}`;
      return this.apiRateLimiter.consume(key, options);
    }

    scheduleScoreboardRateLimitRetry(delayMs) {
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const setFn =
        typeof scope?.setTimeout === 'function'
          ? scope.setTimeout.bind(scope)
          : typeof setTimeout === 'function'
            ? setTimeout
            : null;
      const clearFn =
        typeof scope?.clearTimeout === 'function'
          ? scope.clearTimeout.bind(scope)
          : typeof clearTimeout === 'function'
            ? clearTimeout
            : null;
      if (!setFn) {
        return;
      }
      if (this.scoreboardRateLimitTimer && clearFn) {
        try {
          clearFn(this.scoreboardRateLimitTimer);
        } catch (error) {}
        this.scoreboardRateLimitTimer = null;
      }
      const delay = Math.max(0, Number(delayMs) || 0);
      this.scoreboardRateLimitTimer = setFn(() => {
        this.scoreboardRateLimitTimer = null;
        if (this.apiBaseUrl) {
          this.loadScoreboard({ force: true });
        }
      }, delay);
    }

    scheduleScoreSyncRetry(delayMs) {
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const setFn =
        typeof scope?.setTimeout === 'function'
          ? scope.setTimeout.bind(scope)
          : typeof setTimeout === 'function'
            ? setTimeout
            : null;
      const clearFn =
        typeof scope?.clearTimeout === 'function'
          ? scope.clearTimeout.bind(scope)
          : typeof clearTimeout === 'function'
            ? clearTimeout
            : null;
      if (!setFn) {
        return;
      }
      if (this.scoreSyncRateLimitTimer && clearFn) {
        try {
          clearFn(this.scoreSyncRateLimitTimer);
        } catch (error) {}
        this.scoreSyncRateLimitTimer = null;
      }
      const delay = Math.max(0, Number(delayMs) || 0);
      this.scoreSyncRateLimitTimer = setFn(() => {
        this.scoreSyncRateLimitTimer = null;
        if (!this.scoreSyncInFlight) {
          this.flushScoreSync(true);
        }
      }, delay);
    }

    clearApiRateLimitTimers() {
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const clearFn =
        typeof scope?.clearTimeout === 'function'
          ? scope.clearTimeout.bind(scope)
          : typeof clearTimeout === 'function'
            ? clearTimeout
            : null;
      if (clearFn) {
        if (this.scoreboardRateLimitTimer) {
          try {
            clearFn(this.scoreboardRateLimitTimer);
          } catch (error) {}
        }
        if (this.scoreSyncRateLimitTimer) {
          try {
            clearFn(this.scoreSyncRateLimitTimer);
          } catch (error) {}
        }
      }
      this.scoreboardRateLimitTimer = null;
      this.scoreSyncRateLimitTimer = null;
    }

      const rateResult = this.consumeApiRateLimit('scores:get', {
        limit: this.scoreFetchRateLimit,
        windowMs: this.scoreFetchWindowSeconds * 1000,
      });
      if (!rateResult.ok) {
        const waitSeconds = Math.max(1, rateResult.retryAfterSeconds ?? 1);
        const statusMessage = `Leaderboard refresh cooling down — retrying in ${waitSeconds}s.`;
        this.setScoreboardStatus(statusMessage, { offline: false });
        this.scheduleScoreboardRateLimitRetry(waitSeconds * 1000);
        this.scoreboardPollTimer = 0;
        return;
      }
        this.lastScoreboardFetch = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const rateResult = this.consumeApiRateLimit('scores:post', {
        limit: this.scoreSyncRateLimit,
        windowMs: this.scoreSyncWindowSeconds * 1000,
      });
      if (!rateResult.ok) {
        const waitSeconds = Math.max(1, rateResult.retryAfterSeconds ?? 1);
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
        this.scheduleScoreSyncRetry(waitSeconds * 1000);
        return;
      }
      this.clearApiRateLimitTimers();
