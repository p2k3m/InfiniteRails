    requestStorageQuarantine(storageKeyOrKeys, options = {}) {
      const keys = [];
      const addKey = (value) => {
        if (typeof value !== 'string') {
          return;
        }
        const trimmed = value.trim();
        if (!trimmed || keys.includes(trimmed)) {
          return;
        }
        keys.push(trimmed);
      };
      if (Array.isArray(storageKeyOrKeys)) {
        storageKeyOrKeys.forEach(addKey);
      } else {
        addKey(storageKeyOrKeys);
      }
      if (Array.isArray(options.storageKeys)) {
        options.storageKeys.forEach(addKey);
      } else {
        addKey(options.storageKey);
      }
      if (!keys.length) {
        return false;
      }
      const consoleRef = typeof console !== 'undefined' ? console : null;
      if (typeof localStorage !== 'undefined') {
        keys.forEach((key) => {
          try {
            localStorage.removeItem(key);
          } catch (removeError) {
            consoleRef?.warn?.(`Failed to remove localStorage key "${key}" during quarantine request.`, removeError);
          }
        });
      }
      const contextLabel =
        typeof options.context === 'string' && options.context.trim().length
          ? options.context.trim()
          : 'game state';
      const reasonLabel =
        typeof options.reason === 'string' && options.reason.trim().length
          ? options.reason.trim()
          : 'Reload the page to continue with a fresh session.';
      const messageLabel =
        typeof options.message === 'string' && options.message.trim().length
          ? options.message.trim()
          : `Corrupted ${contextLabel} removed. Reload the page to continue with a fresh session.`;
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const EventCtor = scope?.CustomEvent || (typeof CustomEvent === 'function' ? CustomEvent : null);
      if (!scope || typeof scope.dispatchEvent !== 'function' || typeof EventCtor !== 'function') {
        return false;
      }
      const detail = {
        storageKey: keys[0],
        storageKeys: keys.slice(),
        context: contextLabel,
        reason: reasonLabel,
        message: messageLabel,
      };
      if (options.reload === 'page' || options.reload === 'renderer' || options.reload === false) {
        detail.reload = options.reload;
      }
      if (typeof options.reloadReason === 'string' && options.reloadReason.trim().length) {
        detail.reloadReason = options.reloadReason.trim();
      }
      if (options.autoReload === true) {
        detail.autoReload = true;
      }
      if (options.ensurePlugins !== undefined) {
        detail.ensurePlugins = options.ensurePlugins;
      }
      if (options.mode !== undefined) {
        detail.mode = options.mode;
      }
      if (options.restart !== undefined) {
        detail.restart = options.restart;
      }
      if (options.error instanceof Error) {
        detail.error = options.error;
      }
      try {
        scope.dispatchEvent(new EventCtor('infinite-rails:storage-quarantine-requested', { detail }));
        return true;
      } catch (dispatchError) {
        consoleRef?.debug?.('Failed to dispatch storage quarantine request.', dispatchError);
        return false;
      }
    }

      let raw;
        raw = localStorage.getItem(this.scoreboardStorageKey);
        this.requestStorageQuarantine(this.scoreboardStorageKey, {
          context: 'leaderboard cache',
          message: 'Corrupted leaderboard cache removed. Reload to refresh scores.',
          error,
        });
        return emptySnapshot;
      }
      if (!raw) {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        console.warn('Unable to parse cached scoreboard snapshot', error);
        this.requestStorageQuarantine(this.scoreboardStorageKey, {
          context: 'leaderboard cache',
          message: 'Corrupted leaderboard cache removed. Reload to refresh scores.',
          error,
        });
        return emptySnapshot;
      }
      if (Array.isArray(parsed)) {
        return { entries: parsed, expired: false, updatedAt: 0, legacy: true };
      }
      if (!parsed || typeof parsed !== 'object') {
        this.requestStorageQuarantine(this.scoreboardStorageKey, {
          context: 'leaderboard cache',
          message: 'Invalid leaderboard cache removed. Reload to refresh scores.',
        });
        return emptySnapshot;
      }
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      const updatedAt = Number(parsed.updatedAt) || 0;
      if (entries.length && updatedAt) {
        const age = Date.now() - updatedAt;
        if (age > SCOREBOARD_CACHE_MAX_AGE_MS) {
          try {
            localStorage.removeItem(this.scoreboardStorageKey);
          } catch (error) {
            console.warn('Unable to clear expired scoreboard snapshot', error);
            this.requestStorageQuarantine(this.scoreboardStorageKey, {
              context: 'leaderboard cache',
              message: 'Expired leaderboard cache removed. Reload to refresh scores.',
              error,
            });
          }
          return { entries: [], expired: true, updatedAt, legacy: false };
        }
      }
      return { entries, expired: false, updatedAt, legacy: false };
      let raw;
        raw = localStorage.getItem(this.scoreSyncQueueKey);
        this.requestStorageQuarantine(this.scoreSyncQueueKey, {
          context: 'leaderboard sync queue',
          message: 'Corrupted leaderboard sync queue removed. Reload to continue syncing scores.',
          error,
        });
      if (!raw) {
        return [];
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        console.warn('Unable to parse queued leaderboard sync entries', error);
        this.requestStorageQuarantine(this.scoreSyncQueueKey, {
          context: 'leaderboard sync queue',
          message: 'Corrupted leaderboard sync queue removed. Reload to continue syncing scores.',
          error,
        });
        return [];
      }
      if (!Array.isArray(parsed)) {
        this.requestStorageQuarantine(this.scoreSyncQueueKey, {
          context: 'leaderboard sync queue',
          message: 'Invalid leaderboard sync queue removed. Reload to continue syncing scores.',
        });
        return [];
      }
      const records = parsed
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const entry = item.entry && typeof item.entry === 'object' ? item.entry : null;
          if (!entry) {
            return null;
          }
          const clonedEntry = this.cloneScoreSyncEntry(entry);
          if (!clonedEntry) {
            return null;
          }
          const reason =
            typeof item.reason === 'string' && item.reason.trim().length ? item.reason.trim() : null;
          this.ensureScoreTraceMetadata(clonedEntry, reason || 'queued');
          const identifier =
            typeof item.identifier === 'string' && item.identifier.trim().length
              ? item.identifier.trim().toLowerCase()
              : this.getScoreEntryIdentifier(clonedEntry);
          const queuedAt = Number.isFinite(item.queuedAt) ? item.queuedAt : Date.now();
          return {
            entry: clonedEntry,
            reason,
            identifier,
            queuedAt,
          };
        })
        .filter(Boolean);
      return records;
      let raw;
      try {
        raw = localStorage.getItem(RECIPE_UNLOCK_STORAGE_KEY);
      } catch (error) {
        console.warn('Failed to load stored recipe unlocks', error);
        this.requestStorageQuarantine(RECIPE_UNLOCK_STORAGE_KEY, {
          context: 'recipe unlocks',
          message: 'Corrupted recipe unlocks removed. Reload to rebuild crafting progress.',
          error,
        });
        return;
      }
      if (!raw) {
        return;
      }
        this.requestStorageQuarantine(RECIPE_UNLOCK_STORAGE_KEY, {
          context: 'recipe unlocks',
          message: 'Corrupted recipe unlocks removed. Reload to rebuild crafting progress.',
          error,
        });
        return;
      }
      if (!payload || typeof payload !== 'object') {
        this.requestStorageQuarantine(RECIPE_UNLOCK_STORAGE_KEY, {
          context: 'recipe unlocks',
          message: 'Invalid recipe unlocks removed. Reload to rebuild crafting progress.',
        });
        let raw;
        try {
          raw = localStorage.getItem(this.identityStorageKey);
        } catch (error) {
          console.warn('Failed to restore identity snapshot from localStorage', error);
          this.requestStorageQuarantine(this.identityStorageKey, {
            context: 'identity snapshot',
            message: 'Corrupted identity snapshot removed. Reload to continue with a fresh session.',
            error,
          });
          return;
        }
          this.requestStorageQuarantine(this.identityStorageKey, {
            context: 'identity snapshot',
            message: 'Corrupted identity snapshot removed. Reload to continue with a fresh session.',
            error,
          });
          this.requestStorageQuarantine(this.identityStorageKey, {
            context: 'identity snapshot',
            message: 'Invalid identity snapshot removed. Reload to continue with a fresh session.',
          });
