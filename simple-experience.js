      let welcomeAvailable = true;
          welcomeAvailable = Boolean(audio.has('welcome'));
          welcomeAvailable = true;
        const errorDetail = {};
        if (typeof error?.name === 'string' && error.name.trim().length) {
          errorDetail.errorName = error.name.trim();
        }
        if (typeof error?.message === 'string' && error.message.trim().length) {
          errorDetail.errorMessage = error.message.trim();
        }
        this.reportWelcomeAudioProblem('Unable to play welcome audio cue.', {
          code: 'welcome-playback-error',
          fallbackActive: true,
          ...errorDetail,
        });
        return;
      }
      if (!welcomeAvailable) {
        const resolvedName =
          typeof audio?._resolve === 'function' ? audio._resolve('welcome') || null : null;
        const message = resolvedName
          ? `Audio sample "welcome" unavailable — falling back to "${resolvedName}".`
          : 'Audio sample "welcome" is unavailable. Playing fallback alert tone instead.';
        this.reportWelcomeAudioProblem(
          message,
          {
            resolvedName,
            code: 'missing-sample',
            missingSample: true,
            fallbackActive: true,
          }
        );
      }
    }

    reportWelcomeAudioProblem(message, detail = {}, options = {}) {
      const normalizedMessage =
        typeof message === 'string' && message.trim().length
          ? message.trim()
          : 'Welcome audio playback issue detected.';
      const payload = {
        message: normalizedMessage,
        requestedName: 'welcome',
        resolvedName: null,
        code: 'welcome-audio-failure',
        stage: 'boot',
        timestamp: Date.now(),
        fallbackActive: false,
      };
      if (detail && typeof detail === 'object') {
        Object.entries(detail).forEach(([key, value]) => {
          if (typeof key === 'string' && key.length) {
            payload[key] = value;
          }
        });
      }
      payload.message = normalizedMessage;
      if (!Number.isFinite(payload.timestamp)) {
        payload.timestamp = Date.now();
      }
      if (typeof notifyLiveDiagnostics === 'function') {
        try {
          notifyLiveDiagnostics('audio', normalizedMessage, payload, {
            level: typeof options?.level === 'string' ? options.level : 'error',
          });
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Unable to record welcome audio diagnostic.', error);
          }
        }
      }
      if (options?.emitEvent === false) {
        return;
      }
      const scope =
        (typeof window !== 'undefined' && window) ||
        (typeof globalThis !== 'undefined' && globalThis) ||
        null;
      if (!scope || typeof scope.dispatchEvent !== 'function') {
        return;
      }
      const EventCtor =
        (typeof scope.CustomEvent === 'function' && scope.CustomEvent) ||
        (typeof CustomEvent === 'function' ? CustomEvent : null);
      if (!EventCtor) {
        return;
      }
      try {
        scope.dispatchEvent(new EventCtor('infinite-rails:audio-error', { detail: payload }));
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Unable to dispatch welcome audio failure event.', error);
        }
