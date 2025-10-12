    const SESSION_STORAGE_KEY = 'infinite-rails.session-id';
    function normaliseSessionId(value) {
      if (typeof value !== 'string') {
        return '';
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return '';
      }
      return trimmed.length > 256 ? trimmed.slice(0, 256) : trimmed;
    }

    function readStoredSessionId() {
      const storage = targetScope?.localStorage;
      if (!storage || typeof storage.getItem !== 'function') {
        return '';
      }
      try {
        const rawValue = storage.getItem(SESSION_STORAGE_KEY);
        return normaliseSessionId(typeof rawValue === 'string' ? rawValue : '');
      } catch (error) {
        return '';
      }
    }

    function persistSessionId(value) {
      const storage = targetScope?.localStorage;
      if (!storage || typeof storage.setItem !== 'function') {
        return;
      }
      try {
        storage.setItem(SESSION_STORAGE_KEY, value);
      } catch (error) {}
    }

    let sessionId = readStoredSessionId();
    if (!sessionId) {
      sessionId = generateRandomUUID();
      persistSessionId(sessionId);
    }
    function updateSessionId(nextId) {
      const normalised = normaliseSessionId(nextId);
      if (!normalised) {
        return sessionId;
      }
      if (normalised !== sessionId) {
        sessionId = normalised;
        persistSessionId(sessionId);
      }
      return sessionId;
    }

      get sessionId() {
        return sessionId;
      },
      set sessionId(value) {
        updateSessionId(value);
      },
      setSessionId(nextId) {
        return updateSessionId(nextId);
      },
      const normaliseSessionId = (value) => {
        if (typeof value !== 'string') {
          return '';
        }
        const trimmed = value.trim();
        if (!trimmed) {
          return '';
        }
        return trimmed.length > 256 ? trimmed.slice(0, 256) : trimmed;
      };
      const resolveStoredSessionId = () => {
        const storage = runtimeScope?.localStorage;
        if (!storage || typeof storage.getItem !== 'function') {
          return '';
        }
        try {
          const rawValue = storage.getItem('infinite-rails.session-id');
          return normaliseSessionId(typeof rawValue === 'string' ? rawValue : '');
        } catch (error) {
          return '';
        }
      };
      const traceSessionId = normaliseSessionId(traceUtilities?.sessionId ?? '');
      let resolvedSessionId = resolveStoredSessionId() || traceSessionId;
      if (!resolvedSessionId) {
        resolvedSessionId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? normaliseSessionId(crypto.randomUUID())
            : `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      }
      if (typeof traceUtilities?.setSessionId === 'function') {
        traceUtilities.setSessionId(resolvedSessionId);
      } else if (traceUtilities && typeof traceUtilities === 'object') {
        traceUtilities.sessionId = resolvedSessionId;
      }
      try {
        const storage = runtimeScope?.localStorage;
        if (storage && typeof storage.setItem === 'function') {
          storage.setItem('infinite-rails.session-id', resolvedSessionId);
        }
      } catch (error) {}
      this.sessionId = resolvedSessionId;
