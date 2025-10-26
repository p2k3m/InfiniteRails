    collectCriticalAudioSampleNames() {
      const names = new Set();
      const register = (value) => {
        if (typeof value !== 'string') {
          return;
        }
        const trimmed = value.trim();
        if (!trimmed) {
          return;
        }
        names.add(trimmed);
      };
      const aliasSources = [runtimeScope?.INFINITE_RAILS_AUDIO_ALIASES, scope?.INFINITE_RAILS_AUDIO_ALIASES];
      aliasSources.forEach((aliases) => {
        if (!aliases || typeof aliases !== 'object') {
          return;
        }
        Object.entries(aliases).forEach(([aliasName, mapped]) => {
          register(aliasName);
          if (Array.isArray(mapped)) {
            mapped.forEach(register);
          } else {
            register(mapped);
          }
        });
      });
      const captionSources = [runtimeScope?.INFINITE_RAILS_AUDIO_CAPTIONS, scope?.INFINITE_RAILS_AUDIO_CAPTIONS];
      captionSources.forEach((captions) => {
        if (!captions || typeof captions !== 'object') {
          return;
        }
        Object.keys(captions).forEach(register);
      });
      const embeddedSources = [
        runtimeScope?.INFINITE_RAILS_EMBEDDED_ASSETS?.audioSamples,
        scope?.INFINITE_RAILS_EMBEDDED_ASSETS?.audioSamples,
      ];
      embeddedSources.forEach((samples) => {
        if (!samples || typeof samples !== 'object') {
          return;
        }
        Object.keys(samples).forEach(register);
      });
      ['bubble', 'victoryCheer', 'miningA', 'miningB', 'crunch'].forEach(register);
      return Array.from(names);
    }

        const audioSamples = this.collectCriticalAudioSampleNames();
        audioSamples.forEach((sampleName) => {
          if (typeof sampleName !== 'string') {
            return;
          }
          const normalisedName = sampleName.trim();
          if (!normalisedName) {
            return;
          }
          const assetKey = `audio:${normalisedName}`;
          const sources = this.resolveAssetSourceCandidates(assetKey);
          const candidates = normaliseAssetAvailabilityCandidates(sources);
          assets.push({
            key: assetKey,
            type: 'audio',
            label: this.describeAssetKey(assetKey),
            candidates,
          });
        });
          const missingAudio = Array.isArray(summary.missing)
            ? summary.missing.filter((entry) => typeof entry === 'string' && entry.startsWith('audio:'))
            : [];
          if (missingAudio.length) {
            const audioPreview = missingAudio
              .slice(0, 3)
              .map((entry) => entry.replace(/^audio:/, ''))
              .join(', ');
            const audioSuffix = missingAudio.length > 3 ? `, +${missingAudio.length - 3} more` : '';
            const audioDetails = audioPreview ? ` (${audioPreview}${audioSuffix})` : '';
            const audioMessage = `Audio availability check detected missing samples${audioDetails}.`;
            consoleRef.warn(audioMessage, baseDetail);
          }
    observeInputBindings(options = {}) {
      const reason =
        typeof options?.reason === 'string' && options.reason.trim().length
          ? options.reason.trim()
          : 'input-bindings-observation';
      const bindingFailures = [];
      if (Array.isArray(this.eventBindingFailures)) {
        this.eventBindingFailures.forEach((failure) => {
          if (failure && typeof failure === 'object') {
            bindingFailures.push({ ...failure });
          }
        });
      }
      if (!this.eventsBound && typeof this.bindEvents === 'function') {
        try {
          this.bindEvents();
        } catch (error) {
          bindingFailures.push({
            reason: 'bind-events-error',
            errorMessage: error?.message ?? String(error),
            errorStack: typeof error?.stack === 'string' ? error.stack : null,
            timestamp: Date.now(),
          });
        }
      }
      const records = Array.isArray(this.boundEventRecords) ? this.boundEventRecords.slice() : [];
      const coverage = { keyboard: false, mouse: false, touch: false };
      records.forEach((record) => {
        const eventName = typeof record?.eventName === 'string' ? record.eventName : '';
        if (/^key(down|up)$/i.test(eventName)) {
          coverage.keyboard = true;
        }
        if (/^(?:mouse|wheel|click)/i.test(eventName)) {
          coverage.mouse = true;
        }
        if (/^(?:pointer|touch)/i.test(eventName)) {
          coverage.touch = true;
        }
      });
      if (this.canvas && typeof this.canvas.addEventListener === 'function') {
        coverage.mouse = coverage.mouse || Boolean(this.canvas);
        coverage.touch = coverage.touch || Boolean(this.canvas);
      }
      const propagation = {
        keydown: { handled: false, prevented: false, flagged: false, effects: { place: false } },
        click: {
          handled: false,
          prevented: false,
          effects: { pointerLock: false, mine: false, place: false },
        },
        touch: { handled: coverage.touch, prevented: false },
      };

      const diagnostics = this.movementBindingDiagnostics || null;
      const diagnosticsSnapshot = diagnostics
        ? {
            pending: diagnostics.pending,
            triggeredAt: diagnostics.triggeredAt,
            key: diagnostics.key,
            source: diagnostics.source,
            initialPosition: diagnostics.initialPosition,
            avatarProbe: diagnostics.avatarProbe,
            anchorProbe: diagnostics.anchorProbe,
          }
        : null;
      const keysSnapshot = this.keys instanceof Set ? new Set(this.keys) : null;

      const binding =
        Array.isArray(this.keyBindings?.placeBlock) && this.keyBindings.placeBlock.length
          ? this.keyBindings.placeBlock[0]
          : 'KeyQ';
      const fallbackKey =
        typeof binding === 'string' && /^Key[A-Z]$/.test(binding) ? binding.slice(3).toLowerCase() : binding;

      const originalPlaceBlockForKeydown = typeof this.placeBlock === 'function' ? this.placeBlock : null;
      let keydownPlaceInvoked = false;
      if (originalPlaceBlockForKeydown) {
        this.placeBlock = (...args) => {
          keydownPlaceInvoked = true;
          return originalPlaceBlockForKeydown.apply(this, args);
        };
      }
      let keydownPrevented = false;
      try {
        if (typeof this.handleKeyDown === 'function') {
          const keydownEvent = {
            code: binding,
            key: fallbackKey,
            repeat: false,
            preventDefault: () => {
              keydownPrevented = true;
            },
          };
          this.handleKeyDown(keydownEvent);
          const diagPendingAfter = diagnostics ? Boolean(diagnostics.pending) : false;
          propagation.keydown.prevented = keydownPrevented;
          propagation.keydown.effects.place = keydownPlaceInvoked;
          const keysIncreased = this.keys instanceof Set && keysSnapshot && this.keys.size > keysSnapshot.size;
          propagation.keydown.handled = keydownPrevented || keydownPlaceInvoked || keysIncreased;
          const diagnosticsChanged =
            diagnostics && diagPendingAfter && (!diagnosticsSnapshot || diagnosticsSnapshot.pending !== diagPendingAfter);
          propagation.keydown.flagged = Boolean(diagnosticsChanged || keydownPrevented || keydownPlaceInvoked);
        } else {
          bindingFailures.push({
            reason: 'missing-keydown-handler',
            eventName: 'keydown',
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        bindingFailures.push({
          reason: 'keydown-simulation-failed',
          eventName: 'keydown',
          errorMessage: error?.message ?? String(error),
          errorStack: typeof error?.stack === 'string' ? error.stack : null,
          timestamp: Date.now(),
        });
      } finally {
        if (typeof this.handleKeyUp === 'function') {
          try {
            this.handleKeyUp({ code: binding });
          } catch (error) {}
        }
        if (this.keys instanceof Set && keysSnapshot) {
          this.keys.clear();
          keysSnapshot.forEach((value) => this.keys.add(value));
        }
        if (diagnostics && diagnosticsSnapshot) {
          diagnostics.pending = diagnosticsSnapshot.pending;
          diagnostics.triggeredAt = diagnosticsSnapshot.triggeredAt;
          diagnostics.key = diagnosticsSnapshot.key;
          diagnostics.source = diagnosticsSnapshot.source;
          diagnostics.initialPosition = diagnosticsSnapshot.initialPosition;
          diagnostics.avatarProbe = diagnosticsSnapshot.avatarProbe;
          diagnostics.anchorProbe = diagnosticsSnapshot.anchorProbe;
        }
        if (originalPlaceBlockForKeydown) {
          this.placeBlock = originalPlaceBlockForKeydown;
        }
      }

      const originalMineBlock = typeof this.mineBlock === 'function' ? this.mineBlock : null;
      let mineInvoked = false;
      if (originalMineBlock) {
        this.mineBlock = (...args) => {
          mineInvoked = true;
          return originalMineBlock.apply(this, args);
        };
      }
      const originalPlaceBlockForClick = typeof this.placeBlock === 'function' ? this.placeBlock : null;
      let placeInvoked = false;
      if (originalPlaceBlockForClick) {
        this.placeBlock = (...args) => {
          placeInvoked = true;
          return originalPlaceBlockForClick.apply(this, args);
        };
      }
      const originalAttemptPointerLock = typeof this.attemptPointerLock === 'function' ? this.attemptPointerLock : null;
      let pointerLockInvoked = false;
      if (originalAttemptPointerLock) {
        this.attemptPointerLock = (...args) => {
          pointerLockInvoked = true;
          return originalAttemptPointerLock.apply(this, args);
        };
      }
      const pointerLockBefore = Boolean(this.pointerLocked);
      let clickPrevented = false;
      try {
        if (typeof this.handleMouseDown === 'function') {
          const clickEvent = {
            button: 0,
            target: this.canvas ?? null,
            preventDefault: () => {
              clickPrevented = true;
            },
          };
          this.handleMouseDown(clickEvent);
          const pointerLockAfter = Boolean(this.pointerLocked);
          propagation.click.prevented = clickPrevented;
          propagation.click.effects.mine = mineInvoked;
          propagation.click.effects.place = placeInvoked;
          propagation.click.effects.pointerLock = pointerLockInvoked || pointerLockAfter !== pointerLockBefore;
          propagation.click.handled =
            clickPrevented || mineInvoked || placeInvoked || pointerLockInvoked || pointerLockAfter !== pointerLockBefore;
        } else {
          bindingFailures.push({
            reason: 'missing-mouse-handler',
            eventName: 'mousedown',
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        bindingFailures.push({
          reason: 'click-simulation-failed',
          eventName: 'mousedown',
          errorMessage: error?.message ?? String(error),
          errorStack: typeof error?.stack === 'string' ? error.stack : null,
          timestamp: Date.now(),
        });
      } finally {
        this.pointerLocked = pointerLockBefore;
        if (originalMineBlock) {
          this.mineBlock = originalMineBlock;
        }
        if (originalPlaceBlockForClick) {
          this.placeBlock = originalPlaceBlockForClick;
        }
        if (originalAttemptPointerLock) {
          this.attemptPointerLock = originalAttemptPointerLock;
        }
      }

      const observation = {
        reason,
        bound: Boolean(coverage.keyboard || coverage.mouse || coverage.touch || this.eventsBound),
        coverage,
        propagation,
        bindingFailures,
        timestamp: Date.now(),
      };
      this.lastInputBindingObservation = Object.freeze({
        ...observation,
        coverage: Object.freeze({ ...coverage }),
        propagation: Object.freeze({
          keydown: Object.freeze({
            ...propagation.keydown,
            effects: Object.freeze({ ...propagation.keydown.effects }),
          }),
          click: Object.freeze({
            ...propagation.click,
            effects: Object.freeze({ ...propagation.click.effects }),
          }),
          touch: Object.freeze({ ...propagation.touch }),
        }),
        bindingFailures: Object.freeze(bindingFailures.map((entry) => ({ ...entry }))),
      });
      return this.lastInputBindingObservation;
    }

      if (normalisedKey.startsWith('audio:')) {
        const sampleKey = normalisedKey.slice('audio:'.length);
        const friendly = sampleKey.replace(/[-_]+/g, ' ').trim();
        const capitalised = friendly ? friendly.charAt(0).toUpperCase() + friendly.slice(1) : 'Audio';
        return `${capitalised} audio sample`;
      }
      if (normalised.startsWith('audio:')) {
        const sampleKey = normalised.slice('audio:'.length);
        return this.resolveAudioSampleSourceCandidates(sampleKey);
      }
    resolveAudioSampleSourceCandidates(sampleKey) {
      if (typeof sampleKey !== 'string') {
        return [];
      }
      const trimmedKey = sampleKey.trim();
      if (!trimmedKey) {
        return [];
      }
      const candidates = [];
      const seen = new Set();
      const register = (value) => {
        if (typeof value !== 'string') {
          return;
        }
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) {
          return;
        }
        seen.add(trimmed);
        candidates.push(trimmed);
      };
      const registerSampleSources = (name) => {
        if (typeof name !== 'string') {
          return;
        }
        const normalised = name.trim();
        if (!normalised) {
          return;
        }
        register(`audio/${normalised}.mp3`);
        register(`audio/${normalised}.ogg`);
        const embeddedCollections = [
          runtimeScope?.INFINITE_RAILS_EMBEDDED_ASSETS?.audioSamples,
          scope?.INFINITE_RAILS_EMBEDDED_ASSETS?.audioSamples,
        ];
        embeddedCollections.forEach((collection) => {
          if (!collection || typeof collection !== 'object') {
            return;
          }
          const payload = collection[normalised];
          if (typeof payload === 'string' && payload.trim().length) {
            const trimmedPayload = payload.trim();
            if (/^(data:|blob:)/i.test(trimmedPayload)) {
              register(trimmedPayload);
            } else {
              register(`data:audio/wav;base64,${trimmedPayload}`);
            }
          }
        });
      };
      registerSampleSources(trimmedKey);
      const aliasSources = [runtimeScope?.INFINITE_RAILS_AUDIO_ALIASES, scope?.INFINITE_RAILS_AUDIO_ALIASES];
      aliasSources.forEach((aliases) => {
        if (!aliases || typeof aliases !== 'object') {
          return;
        }
        const mapped = aliases[trimmedKey];
        if (!mapped) {
          return;
        }
        const values = Array.isArray(mapped) ? mapped : [mapped];
        values.forEach((value) => registerSampleSources(value));
      });
      if (this.audio && typeof this.audio._resolve === 'function') {
        try {
          const resolved = this.audio._resolve(trimmedKey);
          if (typeof resolved === 'string' && resolved.trim().length) {
            registerSampleSources(resolved.trim());
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Audio sample resolution failed for availability probe.', error);
          }
        }
      }
      return candidates;
    }

