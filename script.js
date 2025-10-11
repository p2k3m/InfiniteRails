(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const documentRef = globalScope.document ?? null;

  const centralLogStore = (() => {
    const ENTRY_LIMIT = 500;
    const entries = [];
    const listeners = new Set();
    let counter = 0;

    const CATEGORY_ALIASES = new Map(
      Object.entries({
        asset: 'asset',
        assets: 'asset',
        gltf: 'asset',
        texture: 'asset',
        audio: 'asset',
        renderer: 'render',
        render: 'render',
        webgl: 'render',
        graphics: 'render',
        backend: 'api',
        api: 'api',
        network: 'api',
        http: 'api',
        request: 'api',
        script: 'script',
        runtime: 'script',
        logic: 'script',
        ui: 'ui',
        interface: 'ui',
        hud: 'ui',
        controls: 'ui',
        overlay: 'ui',
      }),
    );

    function sanitiseDetail(value, depth = 0) {
      if (value == null) {
        return null;
      }
      if (depth > 3) {
        if (typeof value === 'string') {
          return value.length > 2000 ? `${value.slice(0, 1997)}…` : value;
        }
        if (Array.isArray(value)) {
          return value.slice(0, 5).map((item) => sanitiseDetail(item, depth + 1));
        }
        if (typeof value === 'object') {
          const shallow = {};
          Object.keys(value)
            .slice(0, 5)
            .forEach((key) => {
              const next = value[key];
              if (typeof next === 'function' || typeof next === 'symbol') {
                return;
              }
              shallow[key] = typeof next === 'object' ? '[object]' : next;
            });
          return shallow;
        }
        return value;
      }
      if (Array.isArray(value)) {
        return value.slice(0, 20).map((item) => sanitiseDetail(item, depth + 1));
      }
      if (typeof value === 'object') {
        const clone = {};
        Object.keys(value)
          .slice(0, 20)
          .forEach((key) => {
            const next = value[key];
            if (typeof next === 'function' || typeof next === 'symbol') {
              return;
            }
            clone[key] = sanitiseDetail(next, depth + 1);
          });
        return clone;
      }
      if (typeof value === 'string') {
        return value.length > 2000 ? `${value.slice(0, 1997)}…` : value;
      }
      return value;
    }

    function normaliseCategory(value, fallback = 'general') {
      if (typeof value === 'string' && value.trim().length) {
        const raw = value.trim().toLowerCase();
        if (CATEGORY_ALIASES.has(raw)) {
          return CATEGORY_ALIASES.get(raw);
        }
        return raw;
      }
      return fallback;
    }

    function normaliseLevel(value) {
      if (typeof value !== 'string') {
        return 'info';
      }
      const trimmed = value.trim().toLowerCase();
      if (trimmed === 'error' || trimmed === 'warning' || trimmed === 'success') {
        return trimmed;
      }
      return 'info';
    }

    function notify(entry) {
      if (!listeners.size) {
        return;
      }
      const snapshot = getEntries();
      listeners.forEach((listener) => {
        try {
          listener(entry, snapshot);
        } catch (error) {
          if (globalScope?.console?.debug) {
            globalScope.console.debug('Central log listener error ignored.', error);
          }
        }
      });
    }

    function getEntries() {
      return entries.map((entry) => ({ ...entry, detail: entry.detail ? sanitiseDetail(entry.detail) : null }));
    }

    function record({
      category = 'general',
      scope = null,
      level = 'info',
      message = '',
      detail = null,
      origin = 'runtime',
      timestamp = null,
    } = {}) {
      const resolvedScope = typeof scope === 'string' && scope.trim().length ? scope.trim().toLowerCase() : category;
      const finalCategory = normaliseCategory(category || resolvedScope || 'general', resolvedScope || 'general');
      const trimmedMessage = typeof message === 'string' && message.trim().length ? message.trim() : String(message ?? '');
      if (!trimmedMessage) {
        return null;
      }
      const entry = {
        id: `central-${Date.now()}-${counter + 1}`,
        category: finalCategory,
        scope: resolvedScope || finalCategory,
        level: normaliseLevel(level),
        message: trimmedMessage,
        timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
        origin: typeof origin === 'string' && origin.trim().length ? origin.trim() : 'runtime',
        detail: detail ? sanitiseDetail(detail) : null,
      };
      counter += 1;
      entries.push(entry);
      if (entries.length > ENTRY_LIMIT) {
        entries.splice(0, entries.length - ENTRY_LIMIT);
      }
      notify(entry);
      return entry;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    function clear() {
      entries.splice(0, entries.length);
    }

    return {
      record,
      getEntries,
      subscribe,
      clear,
    };
  })();

  const centralLoggingState = {
    errorHandlersBound: false,
    apiInstrumentationApplied: false,
    renderHandlersBound: false,
  };

  if (globalScope) {
    try {
      globalScope.InfiniteRails = globalScope.InfiniteRails || {};
      globalScope.InfiniteRails.centralLogStore = centralLogStore;
      globalScope.InfiniteRails.logs = centralLogStore;
    } catch (logExposeError) {
      globalScope?.console?.debug?.('Failed to expose central log store on InfiniteRails namespace.', logExposeError);
    }
  }

  const BOOT_STATUS_DEFAULT_MESSAGES = {
    script: 'Initialising bootstrap script…',
    assets: 'Preparing asset pipelines…',
    ui: 'Preparing interface layout…',
    gltf: 'Waiting for model preload…',
    controls: 'Preparing control bindings…',
  };

  function resolveBootStatusController() {
    const scope = globalScope || (typeof window !== 'undefined' ? window : globalThis);
    if (!scope) {
      return null;
    }
    const primary = scope.__infiniteRailsBootStatus;
    if (primary && typeof primary.update === 'function') {
      return primary;
    }
    const legacy = scope.__INFINITE_RAILS_BOOT_STATUS__;
    if (legacy && typeof legacy.update === 'function' && legacy.update !== updateBootStatus) {
      return legacy;
    }
    const api = scope.InfiniteRails?.bootStatus;
    if (api && typeof api.update === 'function' && api.update !== updateBootStatus) {
      return api;
    }
    return null;
  }

  function updateBootStatus(phase, detail = {}) {
    if (!phase) {
      return;
    }
    const controller = resolveBootStatusController();
    if (!controller || typeof controller.update !== 'function') {
      return;
    }
    try {
      controller.update(phase, detail);
    } catch (error) {
      if (globalScope?.console?.debug) {
        globalScope.console.debug('Failed to update boot status HUD.', error);
      }
    }
  }

  function setBootPhaseStatus(phase, status, message, extra = {}) {
    if (!phase) {
      return;
    }
    const detail = { ...extra };
    if (status) {
      detail.status = status;
    }
    if (typeof message === 'string' && message.trim().length) {
      detail.message = message.trim();
    }
    updateBootStatus(phase, detail);
  }

  function markBootPhaseActive(phase, message, extra) {
    setBootPhaseStatus(phase, 'active', message ?? BOOT_STATUS_DEFAULT_MESSAGES[phase], extra);
  }

  function markBootPhaseOk(phase, message, extra) {
    setBootPhaseStatus(phase, 'ok', message ?? BOOT_STATUS_DEFAULT_MESSAGES[phase], extra);
  }

  function markBootPhaseWarning(phase, message, extra) {
    setBootPhaseStatus(phase, 'warning', message ?? BOOT_STATUS_DEFAULT_MESSAGES[phase], extra);
  }

  function markBootPhaseError(phase, message, extra) {
    setBootPhaseStatus(phase, 'error', message ?? BOOT_STATUS_DEFAULT_MESSAGES[phase], extra);
  }

  function initialiseBootStatusDefaults() {
    Object.keys(BOOT_STATUS_DEFAULT_MESSAGES).forEach((phase) => {
      updateBootStatus(phase, { status: 'pending', message: BOOT_STATUS_DEFAULT_MESSAGES[phase] });
    });
    markBootPhaseActive('script', BOOT_STATUS_DEFAULT_MESSAGES.script);
  }

  initialiseBootStatusDefaults();

  if (globalScope) {
    try {
      globalScope.__INFINITE_RAILS_UPDATE_BOOT_STATUS__ = updateBootStatus;
    } catch (bootStatusExposeError) {
      globalScope?.console?.debug?.('Failed to expose boot status bridge.', bootStatusExposeError);
    }
  }

  const assetBaseConsistencyState = { mismatchLogged: false, enforcementError: null };

  const DEFAULT_ASSET_VERSION_TAG = '1';

  const SIGNED_URL_ALERT_EVENT = 'infinite-rails:signed-url-expiry';
  const DEFAULT_SIGNED_URL_WARNING_WINDOW_MS = 24 * 60 * 60 * 1000;
  const AUDIO_FALLBACK_BEEP_SRC =
    'data:audio/wav;base64,UklGRuQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YcADAACAmKWhjnRfWmV9lqSikHZhWWR7lKSjknhiWWJ4kq' +
    'OklHtkWWF2kKKkln1lWl90jqGlmH9nWl5xi6ClmoJpW11viZ6mm4RrW1xth52mnYdtXFtrhJumnolvXVtpgpqloItxXlpngJiloY50X1plfZakopB2YVlke5' +
    'Sko5J4YllieJKjpJR7ZFlhdpCipJZ9ZVpfdI6hpZiAZ1pecYugpZqCaVtdb4meppuEa1tcbYedpp2HbVxba4Sbpp6Jb11baYKapaCLcV5aZ4CYpaGOdF9aZX' +
    '2WpKKQdmFZZHuUpKOSeGJZYniSo6SUe2RZYXaQoqSWfWVaX3SOoaWYf2daXnGLoKWagmlbXW+JnqabhGtbXG2Hnaadh21cW2uEm6aeiW9dW2mCmqWgi3FeWm' +
    'd/mKWhjnRfWmV9lqSikHZhWWR7lKSjknhiWWJ4kqOklHtkWWF2kKKkln1lWl90jqGlmH9nWl5xi6ClmoJpW11viZ6mm4RrW1xth52mnYdtXFtrhJumnolvXV' +
    'tpgpqloItxXlpngJiloY50X1plfZakopB2YVlke5Sko5J4YllieJKjpJR7ZFlhdpCipJZ9ZVpfdI6hpZh/Z1pecYugpZqCaVtdb4meppuEa1tcbYedpp2HbV' +
    'xba4Sbpp6Jb11baYKapaCLcV5aZ4CYpaGOdF9aZX2WpKKQdmFZZHuUpKOSeGJZYniSo6SUe2RZYXaQoqSWfWVaX3SOoaWYf2daXnGLoKWagmlbXW+JnqabhG' +
    'tbXG2Hnaadh21cW2uEm6aeiW9dW2mCmqWgi3FeWmd/mKWhjnRfWmV9lqSikHZhWWR7lKSjknhiWWJ4kqOklHtkWWF2kKKkln1lWl90jqGlmIBnWl5xi6Clmo' +
    'JpW11viZ6mm4RrW1xth52mnYdtXFtrhJumnolvXVtpgpqloItxXlpngJiloY50X1plfZakopB2YVlke5Sko5J4YllieJKjpJR7ZFlhdpCipJZ9ZVpfdI6hpZ' +
    'h/Z1pecYugpZqCaVtdb4meppuEa1tcbYedpp2HbVxba4Sbpp6Jb11baYKapaCLcV5aZ4CYpaGOdF9aZX2WpKKQdmFZZHuUpKOSeGJZYniSo6SUe2RZYXaQoq' +
    'SWfWVaX3SOoaWYf2daXnGLoKWagmlbXW+JnqabhGtbXG2Hnaadh21cW2uEm6aeiW9dW2mCmqWgi3FeWmeAmKWhjnRfWmV9lqSikHZhWWR7lKSjknhiWWJ4kq' +
    'OklHtkWWF2kKKkln1lWl90jqGlmH9nWl5xi6ClmoI=';
  const AUDIO_FALLBACK_BEEP_MIN_INTERVAL_MS = 1500;
  const AUDIO_MISSING_SAMPLE_CODES = new Set(['missing-sample', 'boot-missing-sample']);
  const AUDIO_FALLBACK_WARNING_SUFFIX = 'Fallback beep active until audio assets are restored.';
  const AMBIENT_MUSIC_FALLBACK_ORDER = Object.freeze(['ambientOverworld', 'ambientDefault']);
  const ambientMusicRecoveryState = {
    attempted: new Set(),
    pendingHandle: null,
  };
  let activeExperienceInstance = null;
  let audioFallbackBeepContext = null;
  let lastAudioFallbackBeepTimestamp = 0;
  const signedUrlExpiryChecks = new Set();
  let invalidSignedUrlWarningWindowLogged = false;

  function getConsoleRef() {
    if (globalScope?.console) {
      return globalScope.console;
    }
    if (typeof console !== 'undefined') {
      return console;
    }
    return null;
  }

  function logSignedUrlIssue(message, detail, error = null) {
    const consoleRef = getConsoleRef();
    if (!consoleRef) {
      return;
    }
    const payload = detail ? { ...detail } : {};
    if (error) {
      payload.error = error;
    }
    if (typeof consoleRef.error === 'function') {
      consoleRef.error(message, payload);
      return;
    }
    if (typeof consoleRef.warn === 'function') {
      consoleRef.warn(message, payload);
      return;
    }
    if (typeof consoleRef.log === 'function') {
      consoleRef.log(message, payload);
    }
  }

  function ensureAudioFallbackWarningMessage(message) {
    const trimmed = typeof message === 'string' ? message.trim() : '';
    if (!trimmed) {
      return AUDIO_FALLBACK_WARNING_SUFFIX;
    }
    if (/(fallback (alert )?tone|fallback beep)/i.test(trimmed)) {
      return trimmed;
    }
    if (/fallback/i.test(trimmed) && /(audio|tone|beep)/i.test(trimmed)) {
      return trimmed;
    }
    if (/[.!?]$/.test(trimmed)) {
      return `${trimmed} ${AUDIO_FALLBACK_WARNING_SUFFIX}`;
    }
    return `${trimmed}. ${AUDIO_FALLBACK_WARNING_SUFFIX}`;
  }

  function playAudioFallbackBeep() {
    if (!globalScope) {
      return;
    }
    const now = Date.now();
    if (now - lastAudioFallbackBeepTimestamp < AUDIO_FALLBACK_BEEP_MIN_INTERVAL_MS) {
      return;
    }
    lastAudioFallbackBeepTimestamp = now;
    try {
      if (typeof globalScope.Audio === 'function') {
        const element = new globalScope.Audio(AUDIO_FALLBACK_BEEP_SRC);
        element.volume = 0.6;
        const playResult = typeof element.play === 'function' ? element.play() : null;
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(() => {});
        }
        return;
      }
    } catch (elementError) {
      globalScope?.console?.debug?.('Fallback beep playback failed via <audio>.', elementError);
    }
    try {
      const AudioContextCtor = globalScope.AudioContext || globalScope.webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }
      if (!audioFallbackBeepContext) {
        audioFallbackBeepContext = new AudioContextCtor();
      }
      const context = audioFallbackBeepContext;
      if (context.state === 'suspended' && typeof context.resume === 'function') {
        context.resume().catch(() => {});
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.25);
    } catch (contextError) {
      globalScope?.console?.debug?.('Fallback beep playback failed via AudioContext.', contextError);
    }
  }

  function resetAmbientMusicRecoveryState() {
    ambientMusicRecoveryState.attempted.clear();
    if (ambientMusicRecoveryState.pendingHandle !== null) {
      const cancel =
        (typeof globalScope?.clearTimeout === 'function' && globalScope.clearTimeout.bind(globalScope)) ||
        (typeof clearTimeout === 'function' ? clearTimeout : null);
      if (cancel) {
        try {
          cancel(ambientMusicRecoveryState.pendingHandle);
        } catch (error) {
          globalScope?.console?.debug?.('Failed to cancel pending ambient music recovery handle.', error);
        }
      }
      ambientMusicRecoveryState.pendingHandle = null;
    }
  }

  function normaliseAudioSampleName(name) {
    if (typeof name !== 'string') {
      return '';
    }
    const trimmed = name.trim();
    return trimmed.length ? trimmed : '';
  }

  function shouldAttemptAmbientMusicRecovery(sampleName) {
    const normalized = normaliseAudioSampleName(sampleName);
    if (!normalized) {
      return false;
    }
    const lower = normalized.toLowerCase();
    if (lower === 'welcome') {
      return false;
    }
    if (lower.startsWith('ambient')) {
      return true;
    }
    if (lower.includes('theme')) {
      return true;
    }
    return false;
  }

  function collectAmbientMusicFallbackCandidates(experience, failedName, detail = {}) {
    const candidates = [];
    const seen = new Set();
    const baseFailed = normaliseAudioSampleName(failedName);

    const addCandidate = (value, options = {}) => {
      let candidate = '';
      if (typeof value === 'string') {
        candidate = value;
      } else if (value && typeof value.id === 'string') {
        candidate = value.id;
      } else if (value && typeof value.name === 'string') {
        candidate = value.name;
      }
      const normalized = normaliseAudioSampleName(candidate);
      if (!normalized || normalized === baseFailed || seen.has(normalized)) {
        return;
      }
      if (normalized === '__fallback_beep__') {
        return;
      }
      if (options?.allowNonAmbient !== true && !shouldAttemptAmbientMusicRecovery(normalized)) {
        return;
      }
      seen.add(normalized);
      candidates.push(normalized);
    };

    if (Array.isArray(detail?.fallbackCandidates)) {
      detail.fallbackCandidates.forEach((value) => addCandidate(value, { allowNonAmbient: true }));
    }
    if (Array.isArray(detail?.aliasCandidates)) {
      detail.aliasCandidates.forEach((value) => addCandidate(value, { allowNonAmbient: true }));
    }

    const dimensionTracks = experience?.dimensionSettings?.ambientTracks;
    if (Array.isArray(dimensionTracks)) {
      dimensionTracks.forEach(addCandidate);
    }

    const ambientSources = [
      experience?.activeAmbientTrack,
      experience?.defaultAmbientTrack,
      experience?.defaultAmbientTracks,
      experience?.ambientTracks,
      experience?.ambientTrackOrder,
      experience?.availableAmbientTracks,
      experience?.audio?.ambientPlaylist,
      experience?.audio?.ambientTracks,
      experience?.audio?.availableTracks,
    ];

    for (const source of ambientSources) {
      if (Array.isArray(source)) {
        source.forEach(addCandidate);
      } else if (source) {
        addCandidate(source);
      }
    }

    AMBIENT_MUSIC_FALLBACK_ORDER.forEach(addCandidate);

    return candidates;
  }

  function resolveAmbientFallbackPlaybackOptions(experience, candidate, detail = {}) {
    const options = {
      loop: true,
      channel: 'music',
      allowDuplicates: false,
      reason: 'ambient-music-recovery',
    };

    const volumeResolvers = [
      () => (typeof experience?.getAudioChannelVolume === 'function' ? experience.getAudioChannelVolume('music') : null),
      () => (typeof experience?.getMusicVolume === 'function' ? experience.getMusicVolume() : null),
      () => (typeof experience?.audio?.getChannelVolume === 'function' ? experience.audio.getChannelVolume('music') : null),
      () => (typeof experience?.audio?.getVolume === 'function' ? experience.audio.getVolume('music') : null),
      () => experience?.audio?.settings?.music,
      () => experience?.audioSettings?.music,
      () => experience?.settings?.audio?.music,
      () => experience?.musicVolume,
    ];

    for (const resolve of volumeResolvers) {
      let value;
      try {
        value = resolve();
      } catch (error) {
        continue;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        const clamped = Math.min(Math.max(value, 0), 1);
        options.volume = clamped;
        return options;
      }
    }

    options.volume = 0.6;
    return options;
  }

  function recordAmbientMusicRecoveryAttempt(failedName, candidate, detail = {}) {
    const consoleRef = getConsoleRef();
    const message = `Ambient music fallback activated: "${failedName}" → "${candidate}".`;
    const payload = {
      failedTrack: failedName,
      fallbackTrack: candidate,
      code: typeof detail?.code === 'string' ? detail.code : null,
      errorName: detail?.errorName ?? null,
      errorMessage: detail?.errorMessage ?? null,
      missingSample: detail?.missingSample === true,
    };
    if (consoleRef?.warn) {
      consoleRef.warn(message, payload);
    } else if (consoleRef?.log) {
      consoleRef?.log?.(message, payload);
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('audio', message, { level: 'warning', detail: payload });
    }
  }

  function recordAmbientMusicRecoveryFailure(failedName, candidate, error, detail = {}) {
    const consoleRef = getConsoleRef();
    const baseMessage = `Ambient music fallback "${candidate}" failed to play.`;
    const errorMessage = typeof error?.message === 'string' ? error.message : String(error ?? 'Unknown audio error');
    const payload = {
      failedTrack: failedName,
      fallbackTrack: candidate,
      code: typeof detail?.code === 'string' ? detail.code : null,
      errorName: error?.name ?? detail?.errorName ?? null,
      errorMessage,
      missingSample: detail?.missingSample === true,
    };
    if (consoleRef?.error) {
      consoleRef.error(baseMessage, { ...payload, error });
    } else if (consoleRef?.warn) {
      consoleRef.warn(baseMessage, { ...payload, error });
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('audio', baseMessage, { level: 'error', detail: payload });
    }
  }

  function recordAmbientMusicRecoveryExhausted(failedName, detail = {}) {
    const consoleRef = getConsoleRef();
    const message = `Ambient music fallback exhausted for "${failedName}".`;
    const payload = {
      failedTrack: failedName,
      code: typeof detail?.code === 'string' ? detail.code : null,
      missingSample: detail?.missingSample === true,
    };
    if (consoleRef?.warn) {
      consoleRef.warn(message, payload);
    } else if (consoleRef?.log) {
      consoleRef?.log?.(message, payload);
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('audio', message, { level: 'error', detail: payload });
    }
  }

  function attemptAmbientMusicRecovery(detail = {}) {
    const experience = activeExperienceInstance;
    if (!experience) {
      return false;
    }
    const audio = experience.audio;
    if (!audio || typeof audio.play !== 'function') {
      return false;
    }
    const failedName = normaliseAudioSampleName(detail?.resolvedName) || normaliseAudioSampleName(detail?.requestedName);
    if (!shouldAttemptAmbientMusicRecovery(failedName)) {
      return false;
    }

    if (!ambientMusicRecoveryState.attempted) {
      ambientMusicRecoveryState.attempted = new Set();
    }
    ambientMusicRecoveryState.attempted.add(failedName);

    const candidates = collectAmbientMusicFallbackCandidates(experience, failedName, detail);
    if (!candidates.length) {
      recordAmbientMusicRecoveryExhausted(failedName, detail);
      return false;
    }

    for (const candidate of candidates) {
      if (!candidate || ambientMusicRecoveryState.attempted.has(candidate)) {
        continue;
      }
      ambientMusicRecoveryState.attempted.add(candidate);
      let hasCandidate = true;
      if (typeof audio.has === 'function') {
        try {
          hasCandidate = audio.has(candidate);
        } catch (error) {
          getConsoleRef()?.debug?.('Ambient music availability probe failed.', error);
          hasCandidate = true;
        }
      }
      if (!hasCandidate) {
        continue;
      }

      recordAmbientMusicRecoveryAttempt(failedName, candidate, detail);
      const playbackOptions = resolveAmbientFallbackPlaybackOptions(experience, candidate, detail);
      let playResult;
      try {
        playResult = audio.play(candidate, playbackOptions);
      } catch (error) {
        recordAmbientMusicRecoveryFailure(failedName, candidate, error, detail);
        continue;
      }

      try {
        experience.activeAmbientTrack = candidate;
      } catch (stateError) {
        getConsoleRef()?.debug?.('Failed to update active ambient track after recovery.', stateError);
      }

      if (playResult && typeof playResult.then === 'function') {
        playResult.catch((error) => {
          recordAmbientMusicRecoveryFailure(candidate, candidate, error, detail);
          scheduleAmbientMusicRecovery({
            ...detail,
            requestedName: candidate,
            resolvedName: candidate,
          });
        });
      }

      return true;
    }

    recordAmbientMusicRecoveryExhausted(failedName, detail);
    return false;
  }

  function scheduleAmbientMusicRecovery(detail = {}) {
    const failedName = normaliseAudioSampleName(detail?.resolvedName) || normaliseAudioSampleName(detail?.requestedName);
    if (!shouldAttemptAmbientMusicRecovery(failedName)) {
      return false;
    }
    const scheduler =
      (typeof globalScope?.setTimeout === 'function' && globalScope.setTimeout.bind(globalScope)) ||
      (typeof setTimeout === 'function' ? setTimeout : null);
    if (!scheduler) {
      return attemptAmbientMusicRecovery(detail);
    }
    if (ambientMusicRecoveryState.pendingHandle !== null) {
      return false;
    }
    try {
      ambientMusicRecoveryState.pendingHandle = scheduler(() => {
        ambientMusicRecoveryState.pendingHandle = null;
        attemptAmbientMusicRecovery(detail);
      }, 0);
      return true;
    } catch (error) {
      ambientMusicRecoveryState.pendingHandle = null;
      getConsoleRef()?.debug?.('Failed to schedule ambient music recovery.', error);
      return attemptAmbientMusicRecovery(detail);
    }
  }

  const AUDIO_SETTINGS_STORAGE_KEY = 'infinite-rails:audio-settings';
  const AUDIO_SETTINGS_CHANNELS = Object.freeze(['master', 'music', 'effects', 'ui']);
  const AUDIO_SETTINGS_DEFAULTS = Object.freeze({
    master: 0.8,
    music: 0.6,
    effects: 0.85,
    ui: 0.7,
  });
  const audioSettingsState = {
    volumes: {
      master: AUDIO_SETTINGS_DEFAULTS.master,
      music: AUDIO_SETTINGS_DEFAULTS.music,
      effects: AUDIO_SETTINGS_DEFAULTS.effects,
      ui: AUDIO_SETTINGS_DEFAULTS.ui,
    },
    muted: false,
    listeners: new Set(),
  };

  function clampAudioVolume(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    if (numeric <= 0) {
      return 0;
    }
    if (numeric >= 1) {
      return 1;
    }
    return numeric;
  }

  function normaliseAudioChannelName(input) {
    if (typeof input !== 'string') {
      return null;
    }
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }
    if (trimmed === 'master' || trimmed === 'master-volume' || trimmed === 'main') {
      return 'master';
    }
    if (
      trimmed === 'music' ||
      trimmed === 'ambient' ||
      trimmed === 'ambience' ||
      trimmed === 'theme' ||
      trimmed === 'bgm'
    ) {
      return 'music';
    }
    if (trimmed === 'ui' || trimmed === 'interface' || trimmed === 'hud' || trimmed === 'menu') {
      return 'ui';
    }
    if (
      trimmed === 'effects' ||
      trimmed === 'effect' ||
      trimmed === 'sfx' ||
      trimmed === 'fx' ||
      trimmed === 'gameplay'
    ) {
      return 'effects';
    }
    return null;
  }

  function loadStoredAudioSettings() {
    if (!globalScope?.localStorage) {
      return null;
    }
    try {
      const raw = globalScope.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const storedVolumes = {};
      const volumeSource = parsed.volumes && typeof parsed.volumes === 'object' ? parsed.volumes : {};
      AUDIO_SETTINGS_CHANNELS.forEach((channel) => {
        const value = volumeSource[channel];
        if (typeof value === 'number' && Number.isFinite(value)) {
          storedVolumes[channel] = clampAudioVolume(value);
        }
      });
      return {
        muted: parsed.muted === true,
        volumes: storedVolumes,
      };
    } catch (error) {
      globalScope?.console?.debug?.('Failed to load audio settings from storage.', error);
      return null;
    }
  }

  function computeChannelBaseVolume(channel, state = audioSettingsState) {
    const key = normaliseAudioChannelName(channel) ?? (channel === 'master' ? 'master' : null);
    if (key === 'master') {
      const value = state.volumes.master;
      return clampAudioVolume(typeof value === 'number' ? value : AUDIO_SETTINGS_DEFAULTS.master);
    }
    const targetKey = key || 'effects';
    const value = state.volumes[targetKey];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return clampAudioVolume(value);
    }
    const fallback = AUDIO_SETTINGS_DEFAULTS[targetKey];
    return clampAudioVolume(typeof fallback === 'number' ? fallback : 1);
  }

  function computeEffectiveChannelVolume(baseVolume, channel, state = audioSettingsState) {
    if (state.muted) {
      return 0;
    }
    const base = clampAudioVolume(baseVolume);
    const master = computeChannelBaseVolume('master', state);
    const key = normaliseAudioChannelName(channel);
    if (key === 'master') {
      return clampAudioVolume(base * master);
    }
    if (key === 'music') {
      return clampAudioVolume(base * master * computeChannelBaseVolume('music', state));
    }
    if (key === 'ui') {
      return clampAudioVolume(base * master * computeChannelBaseVolume('ui', state));
    }
    return clampAudioVolume(base * master * computeChannelBaseVolume('effects', state));
  }

  function createAudioSettingsSnapshot(state = audioSettingsState) {
    const volumes = {};
    AUDIO_SETTINGS_CHANNELS.forEach((channel) => {
      volumes[channel] = computeChannelBaseVolume(channel, state);
    });
    return {
      muted: state.muted === true,
      volumes,
      effective: {
        master: state.muted ? 0 : volumes.master,
        music: computeEffectiveChannelVolume(1, 'music', state),
        effects: computeEffectiveChannelVolume(1, 'effects', state),
        ui: computeEffectiveChannelVolume(1, 'ui', state),
      },
    };
  }

  function resolveAudioPlaybackChannel(name, options = {}) {
    const fromOptions = normaliseAudioChannelName(options?.channel);
    if (fromOptions) {
      return fromOptions;
    }
    const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (key.includes('ambient') || key.includes('theme') || key.includes('music') || key.includes('bgm')) {
      return 'music';
    }
    if (key.includes('ui') || key.includes('menu') || key.includes('toggle') || key.includes('click')) {
      return 'ui';
    }
    return 'effects';
  }

  function applyAudioSettingsToExperience(experience, options = {}) {
    if (!experience || typeof experience !== 'object') {
      return experience;
    }
    const audio = experience.audio;
    if (!audio || typeof audio !== 'object') {
      return experience;
    }
    const snapshot = createAudioSettingsSnapshot();
    const { volumes, muted, effective } = snapshot;

    if (typeof audio.setMuted === 'function') {
      try {
        audio.setMuted(muted);
      } catch (error) {
        globalScope?.console?.debug?.('Failed to apply audio mute state.', error);
      }
    } else if ('muted' in audio) {
      try {
        audio.muted = muted;
      } catch (error) {}
    }

    if (typeof audio.setMasterVolume === 'function') {
      try {
        audio.setMasterVolume(volumes.master);
      } catch (error) {
        globalScope?.console?.debug?.('Failed to apply master volume.', error);
      }
    } else if ('masterVolume' in audio) {
      try {
        audio.masterVolume = volumes.master;
      } catch (error) {}
    }

    const channelTargets = [
      ['music', volumes.music],
      ['effects', volumes.effects],
      ['ui', volumes.ui],
    ];
    channelTargets.forEach(([channel, value]) => {
      if (typeof audio.setChannelVolume === 'function') {
        try {
          audio.setChannelVolume(channel, value);
        } catch (error) {
          globalScope?.console?.debug?.(`Failed to apply ${channel} channel volume.`, error);
        }
      }
      if (typeof audio.setVolume === 'function') {
        try {
          audio.setVolume(channel, value);
        } catch (error) {}
      }
      const propertyName = `${channel}Volume`;
      if (Object.prototype.hasOwnProperty.call(audio, propertyName)) {
        try {
          audio[propertyName] = value;
        } catch (error) {}
      }
    });

    try {
      audio.settings = {
        master: volumes.master,
        music: volumes.music,
        effects: volumes.effects,
        ui: volumes.ui,
        muted,
        effective,
      };
    } catch (error) {
      globalScope?.console?.debug?.('Failed to synchronise audio settings snapshot.', error);
    }

    return experience;
  }

  function patchAudioController(audio) {
    if (!audio || typeof audio !== 'object' || audio.__infiniteRailsAudioPatched) {
      return audio;
    }
    const originalPlay = typeof audio.play === 'function' ? audio.play.bind(audio) : null;
    if (originalPlay) {
      audio.play = function patchedAudioPlay(name, options = {}) {
        const playbackOptions = options ? { ...options } : {};
        const channel = resolveAudioPlaybackChannel(name, playbackOptions);
        const baseVolume = typeof playbackOptions.volume === 'number' ? playbackOptions.volume : 1;
        playbackOptions.channel = channel;
        playbackOptions.volume = computeEffectiveChannelVolume(baseVolume, channel);
        if (audioSettingsState.muted) {
          playbackOptions.muted = true;
        } else if (playbackOptions.muted === true && playbackOptions.volume > 0) {
          playbackOptions.muted = false;
        }
        return originalPlay.call(audio, name, playbackOptions);
      };
    }
    audio.__infiniteRailsAudioPatched = true;
    return audio;
  }

  function attachAudioAccessors(experience) {
    if (!experience || typeof experience !== 'object') {
      return experience;
    }
    if (typeof experience.getAudioChannelVolume !== 'function') {
      experience.getAudioChannelVolume = (channel) => getAudioChannelVolume(channel);
    }
    if (typeof experience.getMusicVolume !== 'function') {
      experience.getMusicVolume = () => getAudioChannelVolume('music');
    }
    if (typeof experience.getUiVolume !== 'function') {
      experience.getUiVolume = () => getAudioChannelVolume('ui');
    }
    if (typeof experience.getEffectsVolume !== 'function') {
      experience.getEffectsVolume = () => getAudioChannelVolume('effects');
    }
    const audio = experience.audio;
    if (audio && typeof audio === 'object') {
      if (typeof audio.getChannelVolume !== 'function') {
        audio.getChannelVolume = (channel) => getAudioChannelVolume(channel);
      }
      if (typeof audio.getVolume !== 'function') {
        audio.getVolume = (channel) => getAudioChannelVolume(channel);
      }
      if (typeof audio.getEffectiveVolume !== 'function') {
        audio.getEffectiveVolume = (channel) => computeEffectiveChannelVolume(1, channel);
      }
    }
    return experience;
  }

  function integrateAudioSettingsWithExperience(experience, options = {}) {
    if (!experience || typeof experience !== 'object') {
      return experience;
    }
    if (experience.audio && typeof experience.audio === 'object') {
      patchAudioController(experience.audio);
    }
    attachAudioAccessors(experience);
    applyAudioSettingsToExperience(experience, options);
    return experience;
  }

  function persistAudioSettings(snapshot) {
    if (!globalScope?.localStorage) {
      return;
    }
    try {
      const target = snapshot ?? createAudioSettingsSnapshot();
      const payload = {
        muted: target.muted === true,
        volumes: {},
      };
      AUDIO_SETTINGS_CHANNELS.forEach((channel) => {
        payload.volumes[channel] = clampAudioVolume(target.volumes?.[channel]);
      });
      globalScope.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      globalScope?.console?.debug?.('Unable to persist audio settings.', error);
    }
  }

  function notifyAudioSettingsChange(detail = {}) {
    const snapshot = createAudioSettingsSnapshot();
    if (detail.persist !== false) {
      persistAudioSettings(snapshot);
    }
    if (activeExperienceInstance) {
      try {
        applyAudioSettingsToExperience(activeExperienceInstance, detail);
      } catch (error) {
        globalScope?.console?.debug?.('Failed to apply audio settings to active experience.', error);
      }
    }
    const listeners = Array.from(audioSettingsState.listeners);
    listeners.forEach((listener) => {
      try {
        listener(snapshot, detail);
      } catch (listenerError) {
        globalScope?.console?.debug?.('Audio settings listener error.', listenerError);
      }
    });
    return snapshot;
  }

  function addAudioSettingsListener(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    audioSettingsState.listeners.add(listener);
    try {
      listener(createAudioSettingsSnapshot(), { reason: 'initial' });
    } catch (error) {
      globalScope?.console?.debug?.('Audio settings listener error.', error);
    }
    return () => {
      audioSettingsState.listeners.delete(listener);
    };
  }

  function setAudioMuted(muted, options = {}) {
    const next = Boolean(muted);
    if (audioSettingsState.muted === next && options.force !== true) {
      return createAudioSettingsSnapshot();
    }
    audioSettingsState.muted = next;
    return notifyAudioSettingsChange({
      source: options.source,
      reason: options.reason ?? 'mute-change',
      channel: 'master',
      persist: options.persist !== false,
    });
  }

  function setAudioChannelVolume(channel, value, options = {}) {
    const key = normaliseAudioChannelName(channel) ?? (channel === 'master' ? 'master' : 'effects');
    const clamped = clampAudioVolume(value);
    if (key === 'master') {
      if (audioSettingsState.volumes.master === clamped && options.force !== true) {
        return createAudioSettingsSnapshot();
      }
      audioSettingsState.volumes.master = clamped;
    } else {
      if (audioSettingsState.volumes[key] === clamped && options.force !== true) {
        return createAudioSettingsSnapshot();
      }
      audioSettingsState.volumes[key] = clamped;
    }
    return notifyAudioSettingsChange({
      source: options.source,
      reason: options.reason ?? 'volume-change',
      channel: key,
      persist: options.persist !== false,
    });
  }

  function resetAudioSettings(options = {}) {
    AUDIO_SETTINGS_CHANNELS.forEach((channel) => {
      audioSettingsState.volumes[channel] = AUDIO_SETTINGS_DEFAULTS[channel];
    });
    audioSettingsState.muted = false;
    return notifyAudioSettingsChange({
      source: options.source,
      reason: options.reason ?? 'reset',
      persist: options.persist !== false,
    });
  }

  function getAudioChannelVolume(channel) {
    return computeChannelBaseVolume(channel);
  }

  const storedAudioSettings = loadStoredAudioSettings();
  if (storedAudioSettings) {
    AUDIO_SETTINGS_CHANNELS.forEach((channel) => {
      if (Object.prototype.hasOwnProperty.call(storedAudioSettings.volumes, channel)) {
        audioSettingsState.volumes[channel] = clampAudioVolume(storedAudioSettings.volumes[channel]);
      }
    });
    audioSettingsState.muted = storedAudioSettings.muted === true;
  }

  globalScope.InfiniteRails = globalScope.InfiniteRails || {};
  const audioSettingsApi = globalScope.InfiniteRails.audio || {};
  audioSettingsApi.getState = () => createAudioSettingsSnapshot();
  audioSettingsApi.getVolume = (channel) => getAudioChannelVolume(channel);
  audioSettingsApi.getEffectiveVolume = (channel) => computeEffectiveChannelVolume(1, channel);
  audioSettingsApi.setVolume = (channel, value, options = {}) =>
    setAudioChannelVolume(channel, value, { ...options, source: options.source ?? 'api' });
  audioSettingsApi.setMuted = (muted, options = {}) =>
    setAudioMuted(muted, { ...options, source: options.source ?? 'api' });
  audioSettingsApi.toggleMuted = (options = {}) =>
    setAudioMuted(!audioSettingsState.muted, { ...options, source: options.source ?? 'api' });
  audioSettingsApi.reset = (options = {}) => resetAudioSettings({ ...options, source: options.source ?? 'api' });
  audioSettingsApi.onChange = (listener) => addAudioSettingsListener(listener);
  audioSettingsApi.applyToExperience = (experience, options = {}) =>
    integrateAudioSettingsWithExperience(experience, { ...options, source: options.source ?? 'api' });
  globalScope.InfiniteRails.audio = audioSettingsApi;

  function getSearchParamEntries(searchParams) {
    if (!searchParams || typeof searchParams.entries !== 'function') {
      return [];
    }
    const entries = [];
    for (const [key, value] of searchParams.entries()) {
      entries.push({
        key,
        value,
        lowerKey: typeof key === 'string' ? key.toLowerCase() : String(key ?? '').toLowerCase(),
      });
    }
    return entries;
  }

  function findSearchParam(entries, target) {
    const lower = target.toLowerCase();
    return entries.find((entry) => entry.lowerKey === lower) ?? null;
  }

  function parseSignedIntegerSeconds(value) {
    if (typeof value !== 'string') {
      return Number.NaN;
    }
    const trimmed = value.trim();
    if (!/^-?[0-9]+$/.test(trimmed)) {
      return Number.NaN;
    }
    const numeric = Number.parseInt(trimmed, 10);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  }

  function parseAwsIsoTimestamp(value) {
    if (typeof value !== 'string' || !/^[0-9]{8}T[0-9]{6}Z$/.test(value)) {
      return Number.NaN;
    }
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(
      11,
      13,
    )}:${value.slice(13, 15)}Z`;
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function parseSignedUnixTimestamp(value) {
    const seconds = parseSignedIntegerSeconds(value);
    if (!Number.isFinite(seconds)) {
      return Number.NaN;
    }
    if (Math.abs(seconds) < 1_000_000_000_000) {
      return seconds * 1000;
    }
    return seconds;
  }

  function analyseSignedUrl(parsedUrl) {
    if (!parsedUrl || typeof parsedUrl.searchParams !== 'object') {
      return { isSigned: false };
    }
    const entries = getSearchParamEntries(parsedUrl.searchParams);
    if (entries.length === 0) {
      return { isSigned: false };
    }

    const awsExpires = findSearchParam(entries, 'X-Amz-Expires');
    const awsDate = findSearchParam(entries, 'X-Amz-Date');
    const gcsExpires = findSearchParam(entries, 'X-Goog-Expires');
    const gcsDate = findSearchParam(entries, 'X-Goog-Date');
    const genericExpires = findSearchParam(entries, 'Expires');
    const azureExpiry = findSearchParam(entries, 'se');

    const isSigned = Boolean(awsExpires || gcsExpires || genericExpires || azureExpiry);
    if (!isSigned) {
      return { isSigned: false };
    }

    if (awsExpires) {
      const durationSeconds = parseSignedIntegerSeconds(awsExpires.value);
      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        const startTime = parseAwsIsoTimestamp(awsDate?.value ?? '');
        if (Number.isFinite(startTime)) {
          return {
            isSigned: true,
            expiresAt: startTime + durationSeconds * 1000,
            expirySource: 'aws',
          };
        }
        return {
          isSigned: true,
          expiresAt: Number.NaN,
          expirySource: 'aws',
          failure: 'missing-signed-start-time',
        };
      }
      return {
        isSigned: true,
        expiresAt: Number.NaN,
        expirySource: 'aws',
        failure: 'invalid-expiry-duration',
      };
    }

    if (gcsExpires) {
      const durationSeconds = parseSignedIntegerSeconds(gcsExpires.value);
      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        const startTime = parseAwsIsoTimestamp(gcsDate?.value ?? '');
        if (Number.isFinite(startTime)) {
          return {
            isSigned: true,
            expiresAt: startTime + durationSeconds * 1000,
            expirySource: 'gcs',
          };
        }
        return {
          isSigned: true,
          expiresAt: Number.NaN,
          expirySource: 'gcs',
          failure: 'missing-signed-start-time',
        };
      }
      return {
        isSigned: true,
        expiresAt: Number.NaN,
        expirySource: 'gcs',
        failure: 'invalid-expiry-duration',
      };
    }

    if (genericExpires) {
      const timestamp = parseSignedUnixTimestamp(genericExpires.value);
      if (Number.isFinite(timestamp)) {
        return {
          isSigned: true,
          expiresAt: timestamp,
          expirySource: 'generic-expires',
        };
      }
      return {
        isSigned: true,
        expiresAt: Number.NaN,
        expirySource: 'generic-expires',
        failure: 'invalid-unix-expiry',
      };
    }

    if (azureExpiry) {
      const parsed = Date.parse(azureExpiry.value);
      if (Number.isFinite(parsed)) {
        return {
          isSigned: true,
          expiresAt: parsed,
          expirySource: 'azure',
        };
      }
      return {
        isSigned: true,
        expiresAt: Number.NaN,
        expirySource: 'azure',
        failure: 'invalid-iso-expiry',
      };
    }

    return { isSigned: true, expiresAt: Number.NaN, expirySource: null, failure: 'unrecognised-signed-url' };
  }

  function resolveSignedUrlWarningWindowMs() {
    const config = globalScope?.APP_CONFIG && typeof globalScope.APP_CONFIG === 'object' ? globalScope.APP_CONFIG : null;
    const rawValue = config ? config.signedUrlWarningWindowMs : undefined;
    if (rawValue === null || rawValue === undefined) {
      return DEFAULT_SIGNED_URL_WARNING_WINDOW_MS;
    }

    const numeric = Number(rawValue);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }

    if (!invalidSignedUrlWarningWindowLogged) {
      invalidSignedUrlWarningWindowLogged = true;
      logSignedUrlIssue(
        'Invalid signed URL warning window configuration; falling back to default (24h). Provide APP_CONFIG.signedUrlWarningWindowMs as a positive millisecond duration.',
        { configuredValue: rawValue },
      );
    }

    return DEFAULT_SIGNED_URL_WARNING_WINDOW_MS;
  }

  function dispatchSignedUrlAlert(detail) {
    if (!detail || typeof detail !== 'object') {
      return;
    }
    const target =
      (documentRef && typeof documentRef.dispatchEvent === 'function' && documentRef) ||
      (typeof globalScope?.dispatchEvent === 'function' ? globalScope : null);
    if (!target) {
      return;
    }
    const payload = { ...detail };
    try {
      if (typeof globalScope?.CustomEvent === 'function') {
        target.dispatchEvent(new globalScope.CustomEvent(SIGNED_URL_ALERT_EVENT, { detail: payload }));
        return;
      }
      if (typeof globalScope?.Event === 'function') {
        const event = new globalScope.Event(SIGNED_URL_ALERT_EVENT);
        event.detail = payload;
        target.dispatchEvent(event);
      }
    } catch (error) {
      logSignedUrlIssue(
        'Failed to dispatch signed URL expiry alert event. Downstream monitors may miss impending CDN credential rotation.',
        payload,
        error,
      );
    }
  }

  function monitorSignedAssetUrl(rawBaseUrl, resolvedUrl, relativePath) {
    const candidates = [];
    if (typeof rawBaseUrl === 'string') {
      candidates.push(rawBaseUrl);
    }
    if (typeof resolvedUrl === 'string') {
      candidates.push(resolvedUrl);
    }
    if (!candidates.length) {
      return;
    }

    let parsed = null;
    for (const value of candidates) {
      try {
        parsed = new URL(value, globalScope?.location?.href ?? undefined);
        break;
      } catch (error) {
        // Try the next candidate when URL construction fails.
      }
    }

    if (!parsed) {
      return;
    }

    const dedupeKey = typeof rawBaseUrl === 'string' ? rawBaseUrl : `${parsed.origin}|${parsed.search}`;
    if (signedUrlExpiryChecks.has(dedupeKey)) {
      return;
    }
    signedUrlExpiryChecks.add(dedupeKey);

    const analysis = analyseSignedUrl(parsed);
    if (!analysis.isSigned) {
      return;
    }

    const warningWindowMs = resolveSignedUrlWarningWindowMs();

    const context = {
      assetBaseUrl: typeof rawBaseUrl === 'string' ? rawBaseUrl : null,
      candidateUrl: typeof resolvedUrl === 'string' ? resolvedUrl : parsed.href,
      relativePath: relativePath ?? null,
      warningWindowMs,
      expiresAtIso: Number.isFinite(analysis.expiresAt) ? new Date(analysis.expiresAt).toISOString() : null,
      expiresAtEpochMs: Number.isFinite(analysis.expiresAt) ? analysis.expiresAt : null,
      expirySource: analysis.expirySource,
    };

    if (!Number.isFinite(analysis.expiresAt)) {
      context.reason = analysis.failure ?? 'unknown-expiry-evaluation-failure';
      context.severity = 'indeterminate';
      logSignedUrlIssue(
        'Signed asset URL detected but expiry could not be determined. Rotate APP_CONFIG.assetBaseUrl proactively to avoid runtime 403s.',
        context,
      );
      dispatchSignedUrlAlert(context);
      return;
    }

    const now = Date.now();
    const remainingMs = analysis.expiresAt - now;
    context.millisecondsUntilExpiry = remainingMs;

    if (remainingMs <= 0) {
      context.severity = 'expired';
      logSignedUrlIssue(
        'Signed asset URL has expired; asset requests will fail until credentials are refreshed. Update APP_CONFIG.assetBaseUrl immediately.',
        context,
      );
      dispatchSignedUrlAlert(context);
      return;
    }

    if (remainingMs <= warningWindowMs) {
      context.severity = 'warning';
      logSignedUrlIssue(
        'Signed asset URL expires soon; rotate credentials or refresh APP_CONFIG.assetBaseUrl to avoid CDN outages.',
        context,
      );
      dispatchSignedUrlAlert(context);
    }
  }

  function normaliseAssetVersionTag(value) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : '';
    }
    if (typeof value?.toString === 'function') {
      const stringified = String(value).trim();
      return stringified.length > 0 ? stringified : '';
    }
    return '';
  }

  function getAssetVersionTag() {
    const config =
      globalScope?.APP_CONFIG && typeof globalScope.APP_CONFIG === 'object'
        ? globalScope.APP_CONFIG
        : null;
    const configured = normaliseAssetVersionTag(config?.assetVersionTag);
    if (configured) {
      globalScope.INFINITE_RAILS_ASSET_VERSION_TAG = configured;
      return configured;
    }

    const ambient = normaliseAssetVersionTag(globalScope?.INFINITE_RAILS_ASSET_VERSION_TAG);
    if (ambient) {
      if (config) {
        config.assetVersionTag = ambient;
      }
      return ambient;
    }

    if (config) {
      config.assetVersionTag = DEFAULT_ASSET_VERSION_TAG;
    }
    if (globalScope) {
      globalScope.INFINITE_RAILS_ASSET_VERSION_TAG = DEFAULT_ASSET_VERSION_TAG;
    }
    return DEFAULT_ASSET_VERSION_TAG;
  }

  function applyAssetVersionTag(url) {
    if (typeof url !== 'string' || url.length === 0) {
      return url;
    }
    if (/^(?:data|blob):/i.test(url)) {
      return url;
    }

    const versionTag = getAssetVersionTag();
    if (!versionTag) {
      return url;
    }

    const [base, hash = ''] = url.split('#', 2);
    if (/(?:^|[?&])assetVersion=/.test(base)) {
      return url;
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(base)) {
      try {
        const parsed = new URL(url);
        if (!parsed.searchParams.has('assetVersion')) {
          parsed.searchParams.set('assetVersion', versionTag);
        }
        return parsed.toString();
      } catch (error) {
        // Ignore parse errors for relative paths and fall back to manual tagging.
      }
    }

    const separator = base.includes('?') ? '&' : '?';
    const tagged = `${base}${separator}assetVersion=${encodeURIComponent(versionTag)}`;
    return hash ? `${tagged}#${hash}` : tagged;
  }

  const PRODUCTION_ASSET_ROOT = ensureTrailingSlash(
    'https://d3gj6x3ityfh5o.cloudfront.net/',
  );

  function ensureTrailingSlash(value) {
    if (!value || typeof value !== 'string') {
      return value;
    }
    return value.endsWith('/') ? value : `${value}/`;
  }

  function parseUrlOrNull(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }
    try {
      return new URL(value);
    } catch (error) {
      return null;
    }
  }

  function resolveUrlWithBases(target, bases) {
    if (!target || typeof target !== 'string') {
      return null;
    }
    const candidates = Array.isArray(bases) ? bases.filter(Boolean) : [];
    candidates.push(undefined);
    for (const base of candidates) {
      try {
        return base ? new URL(target, base) : new URL(target);
      } catch (error) {}
    }
    return null;
  }

  function normaliseConfiguredAssetBase(value, bases) {
    const resolved = resolveUrlWithBases(value, bases);
    if (!resolved) {
      return null;
    }
    return ensureTrailingSlash(resolved.href);
  }

  function deriveDirectoryHref(value, bases) {
    const resolved = resolveUrlWithBases(value, bases);
    if (!resolved) {
      return null;
    }
    try {
      const directory = new URL('./', resolved);
      return ensureTrailingSlash(directory.href);
    } catch (error) {
      let href = resolved.href;
      if (!href.endsWith('/')) {
        href = href.replace(/[^/]*$/, '');
      }
      return ensureTrailingSlash(href);
    }
  }

  function findBootstrapScriptElement(doc) {
    if (!doc) {
      return null;
    }
    if (doc.currentScript) {
      return doc.currentScript;
    }
    if (typeof doc.getElementsByTagName !== 'function') {
      return null;
    }
    const scripts = doc.getElementsByTagName('script');
    for (let index = 0; index < scripts.length; index += 1) {
      const candidate = scripts[index];
      const source = candidate?.src || '';
      if (typeof source === 'string' && /\bscript\.js(?:[?#].*)?$/i.test(source)) {
        return candidate;
      }
    }
    return null;
  }

  function deriveProductionAssetRoot(scope, doc) {
    const baseCandidates = [doc?.baseURI, scope?.location?.href];
    const scriptElement = findBootstrapScriptElement(doc);
    const scriptDerived = deriveDirectoryHref(scriptElement?.src ?? null, baseCandidates);
    if (scriptDerived) {
      return scriptDerived;
    }
    if (scope?.location?.href) {
      const locationDerived = deriveDirectoryHref(scope.location.href, baseCandidates);
      if (locationDerived) {
        return locationDerived;
      }
    }
    return null;
  }

  function ensureProductionAssetBase(scope, doc) {
    if (!scope) {
      return;
    }
    const config =
      scope.APP_CONFIG && typeof scope.APP_CONFIG === 'object'
        ? scope.APP_CONFIG
        : (scope.APP_CONFIG = {});
    const baseCandidates = [doc?.baseURI, scope?.location?.href];
    const derivedBase = deriveProductionAssetRoot(scope, doc);
    const productionUrl = parseUrlOrNull(PRODUCTION_ASSET_ROOT);
    let expectedBase = derivedBase;

    if (productionUrl) {
      const derivedUrl = parseUrlOrNull(derivedBase);
      if (derivedUrl && derivedUrl.host === productionUrl.host) {
        expectedBase = productionUrl.href;
      } else if (!derivedUrl) {
        const locationUrl = parseUrlOrNull(scope?.location?.href ?? null);
        if (locationUrl && locationUrl.host === productionUrl.host) {
          expectedBase = productionUrl.href;
        }
      }
    }

    if (!expectedBase) {
      return;
    }
    const configuredBase = normaliseConfiguredAssetBase(config.assetBaseUrl ?? null, baseCandidates);
    if (configuredBase && configuredBase !== expectedBase) {
      if (!assetBaseConsistencyState.mismatchLogged) {
        assetBaseConsistencyState.mismatchLogged = true;
        const mismatchMessage =
          'APP_CONFIG.assetBaseUrl mismatch detected between bundle metadata, asset-manifest.json, and the active deployment.';
        const mismatchDetail = {
          configured: config.assetBaseUrl ?? null,
          normalisedConfigured: configuredBase,
          expected: expectedBase,
          production: PRODUCTION_ASSET_ROOT,
        };
        if (scope?.console && typeof scope.console.error === 'function') {
          scope.console.error(mismatchMessage, mismatchDetail);
        }
        assetBaseConsistencyState.enforcementError = new Error(
          `${mismatchMessage} Update APP_CONFIG.assetBaseUrl to "${expectedBase}" so runtime requests resolve correctly.`,
        );
      }
      throw assetBaseConsistencyState.enforcementError;
    }
    config.assetBaseUrl = expectedBase;
  }

  ensureProductionAssetBase(globalScope, documentRef);
  getAssetVersionTag();

  const responsiveUiState = {
    detachListeners: null,
  };

  function clampNumber(value, min, max) {
    let result = Number(value);
    if (!Number.isFinite(result)) {
      result = Number.isFinite(min) ? Number(min) : 0;
    }
    if (Number.isFinite(min)) {
      result = Math.max(result, Number(min));
    }
    if (Number.isFinite(max)) {
      result = Math.min(result, Number(max));
    }
    return result;
  }

  function getRootFontSize(doc) {
    if (!doc?.documentElement) {
      return 16;
    }
    const view = doc.defaultView || globalScope;
    if (view?.getComputedStyle) {
      try {
        const computed = view.getComputedStyle(doc.documentElement);
        const size = computed ? Number.parseFloat(computed.fontSize) : NaN;
        if (Number.isFinite(size) && size > 0) {
          return size;
        }
      } catch (error) {}
    }
    return 16;
  }

  function updateResponsiveUiVariables(scope, doc) {
    if (!doc?.documentElement || !doc.documentElement.style) {
      return;
    }
    const root = doc.documentElement;
    const viewport = scope?.visualViewport;
    const widthCandidate = viewport?.width ?? scope?.innerWidth ?? root.clientWidth ?? 0;
    const heightCandidate = viewport?.height ?? scope?.innerHeight ?? root.clientHeight ?? 0;
    const width = clampNumber(widthCandidate, 240, 8192);
    const height = clampNumber(heightCandidate, 240, 8192);
    if (!width || !height) {
      return;
    }
    const pointerCoarse = Boolean(scope?.matchMedia && scope.matchMedia('(pointer: coarse)').matches);
    const widthScale = width / 1440;
    const heightScale = height / 900;
    const hudScale = clampNumber(Math.min(widthScale, heightScale), pointerCoarse ? 0.8 : 0.66, pointerCoarse ? 1.05 : 1);
    const hudSpacing = clampNumber(0.55 + hudScale * (pointerCoarse ? 0.9 : 0.7), pointerCoarse ? 0.75 : 0.6, pointerCoarse ? 1.35 : 1.1);
    const hudMargin = clampNumber(0.78 + hudScale * (pointerCoarse ? 1.15 : 0.85), pointerCoarse ? 1 : 0.8, pointerCoarse ? 1.95 : 1.5);
    const hudBottomGap = clampNumber(0.45 + hudScale * (pointerCoarse ? 0.85 : 0.6), pointerCoarse ? 0.6 : 0.45, pointerCoarse ? 1.2 : 0.9);
    root.style.setProperty('--hud-scale', hudScale.toFixed(3));
    root.style.setProperty('--hud-spacing', `${hudSpacing.toFixed(3)}rem`);
    root.style.setProperty('--hud-margin', `${hudMargin.toFixed(3)}rem`);
    root.style.setProperty('--hud-bottom-gap', `${hudBottomGap.toFixed(3)}rem`);

    const baseFontSize = clampNumber(getRootFontSize(doc), 12, 24);
    const tutorialWidth = clampNumber(width * (pointerCoarse ? 0.9 : 0.88), 320, pointerCoarse ? 720 : 640);
    const tutorialHeight = clampNumber(height * (pointerCoarse ? 0.85 : 0.9), 420, pointerCoarse ? 700 : 720);
    const tutorialPadding = clampNumber(height * (pointerCoarse ? 0.035 : 0.03), pointerCoarse ? 22 : 18, pointerCoarse ? 46 : 40);
    const tutorialGap = clampNumber(0.72 + hudScale * (pointerCoarse ? 0.7 : 0.55), pointerCoarse ? 0.9 : 0.75, pointerCoarse ? 1.6 : 1.25);
    const tutorialCloseSize = clampNumber(tutorialPadding * 1.35, pointerCoarse ? 34 : 30, pointerCoarse ? 48 : 40);
    const tutorialCloseOffset = clampNumber(tutorialPadding * 0.55, 10, pointerCoarse ? 20 : 16);
    root.style.setProperty('--tutorial-panel-max-width', `${Math.round(tutorialWidth)}px`);
    root.style.setProperty('--tutorial-panel-max-height', `${Math.round(tutorialHeight)}px`);
    root.style.setProperty('--tutorial-panel-padding', `${tutorialPadding.toFixed(1)}px`);
    root.style.setProperty('--tutorial-panel-gap', `${tutorialGap.toFixed(3)}rem`);
    root.style.setProperty('--tutorial-close-size', `${tutorialCloseSize.toFixed(1)}px`);
    root.style.setProperty('--tutorial-close-offset', `${tutorialCloseOffset.toFixed(1)}px`);

    const stackTutorialActions = height < 620 || width < 540;
    const tutorialActionsGap = stackTutorialActions
      ? clampNumber(0.65 + hudScale * 0.55, pointerCoarse ? 0.75 : 0.6, pointerCoarse ? 1.25 : 0.95)
      : clampNumber(0.45 + hudScale * 0.35, pointerCoarse ? 0.6 : 0.45, pointerCoarse ? 0.95 : 0.75);
    root.style.setProperty('--tutorial-actions-direction', stackTutorialActions ? 'column' : 'row');
    root.style.setProperty('--tutorial-actions-justify', stackTutorialActions || pointerCoarse ? 'center' : 'flex-end');
    root.style.setProperty('--tutorial-actions-gap', `${tutorialActionsGap.toFixed(3)}rem`);
    root.style.setProperty('--tutorial-primary-width', stackTutorialActions ? '100%' : 'auto');

    const mobileControlsWidth = clampNumber(width * (pointerCoarse ? 0.95 : 0.92), 280, pointerCoarse ? 640 : 520);
    const mobileControlsGap = clampNumber(
      0.6 + hudScale * (pointerCoarse ? 0.65 : 0.5),
      pointerCoarse ? 0.75 : 0.6,
      pointerCoarse ? 1.3 : 1.1,
    );
    const mobileControlsPaddingY = clampNumber(height * (pointerCoarse ? 0.022 : 0.018), pointerCoarse ? 14 : 10, pointerCoarse ? 26 : 20);
    const mobileControlsPaddingX = clampNumber(width * (pointerCoarse ? 0.03 : 0.025), pointerCoarse ? 18 : 14, pointerCoarse ? 32 : 24);
    const dpadCell = clampNumber(Math.min(width, height) * 0.09, pointerCoarse ? 58 : 42, pointerCoarse ? 82 : 60);
    const mobileButtonSize = clampNumber(width * 0.09, pointerCoarse ? 60 : 48, pointerCoarse ? 82 : 64);
    const mobilePrimaryButtonSize = clampNumber(width * 0.11, pointerCoarse ? 68 : 56, pointerCoarse ? 94 : 72);
    const mobileButtonFont = clampNumber(mobileButtonSize * 0.28, pointerCoarse ? 18 : 16, pointerCoarse ? 26 : 22);
    const mobilePrimaryButtonFont = clampNumber(
      mobilePrimaryButtonSize * 0.3,
      pointerCoarse ? 20 : 18,
      pointerCoarse ? 30 : 24,
    );
    const mobileClusterGap = clampNumber(mobileControlsGap * 0.92, pointerCoarse ? 0.7 : 0.6, pointerCoarse ? 1.2 : 1.05);
    const mobileActionGap = clampNumber(mobileClusterGap * 0.95, pointerCoarse ? 0.7 : 0.6, pointerCoarse ? 1.15 : 1);

    root.style.setProperty('--mobile-controls-max-width', `${mobileControlsWidth.toFixed(1)}px`);
    root.style.setProperty('--mobile-controls-gap', `${mobileControlsGap.toFixed(3)}rem`);
    root.style.setProperty('--mobile-controls-padding-y', `${mobileControlsPaddingY.toFixed(1)}px`);
    root.style.setProperty('--mobile-controls-padding-x', `${mobileControlsPaddingX.toFixed(1)}px`);
    root.style.setProperty('--mobile-controls-dpad-cell', `${dpadCell.toFixed(1)}px`);
    root.style.setProperty('--mobile-controls-button-size', `${mobileButtonSize.toFixed(1)}px`);
    root.style.setProperty('--mobile-controls-button-primary-size', `${mobilePrimaryButtonSize.toFixed(1)}px`);
    root.style.setProperty('--mobile-controls-button-font', `${(mobileButtonFont / baseFontSize).toFixed(3)}rem`);
    root.style.setProperty(
      '--mobile-controls-button-primary-font',
      `${(mobilePrimaryButtonFont / baseFontSize).toFixed(3)}rem`,
    );
    root.style.setProperty('--mobile-controls-cluster-gap', `${mobileClusterGap.toFixed(3)}rem`);
    root.style.setProperty('--mobile-controls-action-gap', `${mobileActionGap.toFixed(3)}rem`);

    const stackMobileControls = width < 560 || height < 620;
    const controlsDirection = stackMobileControls ? 'column' : 'row';
    const controlsAlign = stackMobileControls ? 'stretch' : pointerCoarse ? 'center' : 'flex-end';
    const controlsJustify = stackMobileControls ? 'center' : pointerCoarse ? 'center' : 'space-between';
    root.style.setProperty('--mobile-controls-direction', controlsDirection);
    root.style.setProperty('--mobile-controls-align', controlsAlign);
    root.style.setProperty('--mobile-controls-justify', controlsJustify);
  }

  function setupResponsiveUi(scope, doc) {
    if (!scope || !doc) {
      return;
    }
    const update = () => updateResponsiveUiVariables(scope, doc);
    update();
    let updatePending = false;
    const scheduleUpdate = () => {
      if (updatePending) {
        return;
      }
      updatePending = true;
      const invoke = () => {
        updatePending = false;
        update();
      };
      if (typeof scope.requestAnimationFrame === 'function') {
        scope.requestAnimationFrame(invoke);
      } else if (typeof scope.setTimeout === 'function') {
        scope.setTimeout(invoke, 66);
      } else {
        invoke();
      }
    };

    const disposers = [];
    if (typeof scope.addEventListener === 'function') {
      const resizeHandler = () => scheduleUpdate();
      scope.addEventListener('resize', resizeHandler, { passive: true });
      disposers.push(() => scope.removeEventListener?.('resize', resizeHandler));
      const orientationHandler = () => scheduleUpdate();
      scope.addEventListener('orientationchange', orientationHandler, { passive: true });
      disposers.push(() => scope.removeEventListener?.('orientationchange', orientationHandler));
      const pageShowHandler = () => scheduleUpdate();
      scope.addEventListener('pageshow', pageShowHandler, { passive: true });
      disposers.push(() => scope.removeEventListener?.('pageshow', pageShowHandler));
    }

    if (scope?.visualViewport?.addEventListener) {
      const viewportResize = () => scheduleUpdate();
      scope.visualViewport.addEventListener('resize', viewportResize, { passive: true });
      scope.visualViewport.addEventListener('scroll', viewportResize, { passive: true });
      disposers.push(() => {
        scope.visualViewport.removeEventListener('resize', viewportResize);
        scope.visualViewport.removeEventListener('scroll', viewportResize);
      });
    }

    if (scope?.matchMedia) {
      try {
        const pointerMedia = scope.matchMedia('(pointer: coarse)');
        if (pointerMedia) {
          const pointerListener = () => scheduleUpdate();
          if (typeof pointerMedia.addEventListener === 'function') {
            pointerMedia.addEventListener('change', pointerListener);
            disposers.push(() => pointerMedia.removeEventListener('change', pointerListener));
          } else if (typeof pointerMedia.addListener === 'function') {
            pointerMedia.addListener(pointerListener);
            disposers.push(() => pointerMedia.removeListener(pointerListener));
          }
        }
      } catch (error) {}
    }

    responsiveUiState.detachListeners = () => {
      while (disposers.length) {
        const dispose = disposers.pop();
        try {
          dispose?.();
        } catch (error) {}
      }
    };
  }

  setupResponsiveUi(globalScope, documentRef);

  const inputModeState = {
    mode: null,
    source: null,
    doc: documentRef || (typeof document !== 'undefined' ? document : null),
    detachListeners: null,
    scheduledHandle: null,
    scheduledCancel: null,
    domReadyListenerAttached: false,
  };

  const inactivityMonitorState = {
    enabled: true,
    idleThresholdMs: 5 * 60 * 1000,
    refreshCountdownMs: 15000,
    checkIntervalMs: 1000,
    lastActivityAt: Date.now(),
    promptVisible: false,
    overlay: null,
    countdownEl: null,
    stayButton: null,
    refreshButton: null,
    doc: documentRef || (typeof document !== 'undefined' ? document : null),
    scope: globalScope || (typeof window !== 'undefined' ? window : globalThis),
    checkHandle: null,
    countdownHandle: null,
    countdownExpiresAt: null,
    waitingForDom: false,
    detachListeners: null,
    monitorRunning: false,
    hudInactiveApplied: false,
  };

  function dispatchInactivityEvent(type, detail = {}) {
    const scope = inactivityMonitorState.scope || globalScope || globalThis;
    const CustomEventCtor =
      (scope && typeof scope.CustomEvent === 'function'
        ? scope.CustomEvent
        : typeof globalScope?.CustomEvent === 'function'
          ? globalScope.CustomEvent
          : typeof CustomEvent === 'function'
            ? CustomEvent
            : null);
    if (!scope || typeof scope.dispatchEvent !== 'function' || !CustomEventCtor) {
      return;
    }
    const eventName = `infinite-rails:${type}`;
    try {
      scope.dispatchEvent(new CustomEventCtor(eventName, { detail }));
    } catch (error) {}
  }

  function applyHudInactiveClass(active) {
    const doc = inactivityMonitorState.doc || documentRef || globalScope?.document || null;
    const body = doc?.body ?? null;
    if (!body?.classList?.add) {
      inactivityMonitorState.hudInactiveApplied = false;
      return;
    }
    if (active) {
      if (!inactivityMonitorState.hudInactiveApplied) {
        try {
          body.classList.add('hud-inactive');
        } catch (error) {}
        inactivityMonitorState.hudInactiveApplied = true;
      }
      return;
    }
    if (!inactivityMonitorState.hudInactiveApplied) {
      return;
    }
    try {
      body.classList.remove('hud-inactive');
    } catch (error) {}
    inactivityMonitorState.hudInactiveApplied = false;
  }

  function updateInactivityCountdownDisplay(remainingMs) {
    const countdownEl = inactivityMonitorState.countdownEl;
    if (!countdownEl) {
      return;
    }
    const displayMs = Number.isFinite(remainingMs) && remainingMs > 0 ? remainingMs : 0;
    const seconds = Math.max(0, Math.ceil(displayMs / 1000));
    countdownEl.textContent = String(seconds);
  }

  function clearInactivityCountdownTimer() {
    const scope = inactivityMonitorState.scope || globalScope || globalThis;
    const clear =
      (scope && typeof scope.clearTimeout === 'function'
        ? scope.clearTimeout.bind(scope)
        : typeof clearTimeout === 'function'
          ? clearTimeout
          : null);
    if (inactivityMonitorState.countdownHandle !== null && clear) {
      try {
        clear(inactivityMonitorState.countdownHandle);
      } catch (error) {}
    }
    inactivityMonitorState.countdownHandle = null;
    inactivityMonitorState.countdownExpiresAt = null;
    updateInactivityCountdownDisplay(null);
  }

  function hideInactivityPrompt(options = {}) {
    if (!inactivityMonitorState.promptVisible) {
      return;
    }
    inactivityMonitorState.promptVisible = false;
    const overlay = inactivityMonitorState.overlay;
    if (overlay) {
      try {
        overlay.setAttribute('data-mode', 'idle');
        overlay.setAttribute('hidden', '');
      } catch (error) {}
      overlay.hidden = true;
      setInert(overlay, true);
    }
    applyHudInactiveClass(false);
    clearInactivityCountdownTimer();
    dispatchInactivityEvent('inactivity-dismissed', {
      reason: options.reason ?? 'dismissed',
      source: options.source ?? null,
    });
  }

  function triggerInactivityRefresh(reason = 'countdown') {
    hideInactivityPrompt({ reason: 'refresh', source: reason });
    inactivityMonitorState.lastActivityAt = Date.now();
    const messageDetail =
      reason === 'button'
        ? 'Refreshing world — reconnecting you to the rails.'
        : 'Refreshing idle session to rebuild the world.';
    showHudAlert({
      title: 'Refreshing world',
      message: messageDetail,
      severity: 'info',
      autoHideMs: 8000,
    });
    dispatchInactivityEvent('inactivity-refresh', { reason });
    const scope = inactivityMonitorState.scope || globalScope || globalThis;
    const reloadFn =
      typeof scope?.InfiniteRails?.renderers?.reloadActive === 'function'
        ? scope.InfiniteRails.renderers.reloadActive
        : typeof reloadActiveRenderer === 'function'
          ? reloadActiveRenderer
          : null;
    if (!reloadFn) {
      return;
    }
    const payload = { reason: `inactivity-${reason}` };
    try {
      const result = reloadFn(payload);
      if (result && typeof result.then === 'function') {
        result.catch((error) => {
          scope?.console?.warn?.('Idle refresh failed.', error);
        });
      }
    } catch (error) {
      scope?.console?.warn?.('Idle refresh failed.', error);
    }
  }

  function scheduleInactivityCountdownTick() {
    if (!inactivityMonitorState.promptVisible) {
      return;
    }
    const scope = inactivityMonitorState.scope || globalScope || globalThis;
    const scheduler =
      (scope && typeof scope.setTimeout === 'function'
        ? scope.setTimeout.bind(scope)
        : typeof setTimeout === 'function'
          ? setTimeout
          : null);
    if (!scheduler) {
      return;
    }
    const now = Date.now();
    const remaining = inactivityMonitorState.countdownExpiresAt
      ? inactivityMonitorState.countdownExpiresAt - now
      : 0;
    if (remaining <= 0) {
      updateInactivityCountdownDisplay(0);
      triggerInactivityRefresh('countdown');
      return;
    }
    const delay = Math.min(Math.max(remaining, 250), 1000);
    inactivityMonitorState.countdownHandle = scheduler(() => {
      inactivityMonitorState.countdownHandle = null;
      const nextRemaining = inactivityMonitorState.countdownExpiresAt
        ? inactivityMonitorState.countdownExpiresAt - Date.now()
        : 0;
      if (nextRemaining <= 0) {
        updateInactivityCountdownDisplay(0);
        triggerInactivityRefresh('countdown');
        return;
      }
      updateInactivityCountdownDisplay(nextRemaining);
      scheduleInactivityCountdownTick();
    }, delay);
  }

  function beginInactivityCountdown() {
    clearInactivityCountdownTimer();
    inactivityMonitorState.countdownExpiresAt = Date.now() + inactivityMonitorState.refreshCountdownMs;
    updateInactivityCountdownDisplay(inactivityMonitorState.refreshCountdownMs);
    scheduleInactivityCountdownTick();
  }

  function showInactivityPrompt(options = {}) {
    if (!inactivityMonitorState.enabled) {
      return;
    }
    if (inactivityMonitorState.promptVisible) {
      return;
    }
    const overlay = inactivityMonitorState.overlay;
    if (!overlay) {
      triggerInactivityRefresh('overlay-missing');
      return;
    }
    inactivityMonitorState.promptVisible = true;
    try {
      overlay.removeAttribute('hidden');
      overlay.setAttribute('data-mode', 'prompt');
    } catch (error) {}
    overlay.hidden = false;
    setInert(overlay, false);
    applyHudInactiveClass(true);
    beginInactivityCountdown();
    dispatchInactivityEvent('inactivity-prompt', {
      idleDurationMs: options.idleDurationMs ?? null,
    });
  }

  function evaluateInactivity(now = Date.now()) {
    if (!inactivityMonitorState.enabled) {
      return;
    }
    const idleFor = now - inactivityMonitorState.lastActivityAt;
    if (idleFor < inactivityMonitorState.idleThresholdMs) {
      return;
    }
    showInactivityPrompt({ idleDurationMs: idleFor });
  }

  function clearInactivityCheckTimer() {
    const scope = inactivityMonitorState.scope || globalScope || globalThis;
    const clear =
      (scope && typeof scope.clearTimeout === 'function'
        ? scope.clearTimeout.bind(scope)
        : typeof clearTimeout === 'function'
          ? clearTimeout
          : null);
    if (inactivityMonitorState.checkHandle !== null && clear) {
      try {
        clear(inactivityMonitorState.checkHandle);
      } catch (error) {}
    }
    inactivityMonitorState.checkHandle = null;
  }

  function scheduleInactivityCheck() {
    if (!inactivityMonitorState.enabled || !inactivityMonitorState.monitorRunning) {
      return;
    }
    if (inactivityMonitorState.checkHandle !== null) {
      return;
    }
    const scope = inactivityMonitorState.scope || globalScope || globalThis;
    const scheduler =
      (scope && typeof scope.setTimeout === 'function'
        ? scope.setTimeout.bind(scope)
        : typeof setTimeout === 'function'
          ? setTimeout
          : null);
    if (!scheduler) {
      return;
    }
    inactivityMonitorState.checkHandle = scheduler(() => {
      inactivityMonitorState.checkHandle = null;
      evaluateInactivity(Date.now());
      scheduleInactivityCheck();
    }, inactivityMonitorState.checkIntervalMs);
  }

  function stopInactivityMonitor() {
    inactivityMonitorState.monitorRunning = false;
    clearInactivityCheckTimer();
    clearInactivityCountdownTimer();
    applyHudInactiveClass(false);
    if (typeof inactivityMonitorState.detachListeners === 'function') {
      try {
        inactivityMonitorState.detachListeners();
      } catch (error) {}
    }
    inactivityMonitorState.detachListeners = null;
  }

  function startInactivityMonitor() {
    if (inactivityMonitorState.monitorRunning) {
      return;
    }
    inactivityMonitorState.monitorRunning = true;
    inactivityMonitorState.lastActivityAt = Date.now();
    scheduleInactivityCheck();
  }

  function setupInactivityOverlay(doc = null) {
    const targetDoc =
      doc || inactivityMonitorState.doc || documentRef || globalScope?.document || null;
    inactivityMonitorState.doc = targetDoc;
    if (!targetDoc || typeof targetDoc.getElementById !== 'function') {
      return;
    }
    const overlay = targetDoc.getElementById('inactivityOverlay');
    if (!overlay) {
      if (typeof targetDoc.addEventListener === 'function' && !inactivityMonitorState.waitingForDom) {
        inactivityMonitorState.waitingForDom = true;
        try {
          targetDoc.addEventListener(
            'DOMContentLoaded',
            () => {
              inactivityMonitorState.waitingForDom = false;
              setupInactivityOverlay(targetDoc);
            },
            { once: true },
          );
        } catch (error) {}
      }
      return;
    }
    inactivityMonitorState.overlay = overlay;
    inactivityMonitorState.countdownEl = targetDoc.getElementById('inactivityOverlayCountdown');
    inactivityMonitorState.stayButton = targetDoc.getElementById('inactivityStayButton');
    inactivityMonitorState.refreshButton = targetDoc.getElementById('inactivityRefreshButton');
    try {
      overlay.setAttribute('data-mode', 'idle');
      overlay.setAttribute('hidden', '');
    } catch (error) {}
    overlay.hidden = true;
    setInert(overlay, true);
    updateInactivityCountdownDisplay(null);
    const stayButton = inactivityMonitorState.stayButton;
    if (stayButton && !stayButton.dataset.inactivityBound) {
      stayButton.addEventListener('click', (event) => {
        event?.preventDefault?.();
        hideInactivityPrompt({ reason: 'resume', source: 'stay-button' });
        inactivityMonitorState.lastActivityAt = Date.now();
      });
      stayButton.dataset.inactivityBound = 'true';
    }
    const refreshButton = inactivityMonitorState.refreshButton;
    if (refreshButton && !refreshButton.dataset.inactivityBound) {
      refreshButton.addEventListener('click', (event) => {
        event?.preventDefault?.();
        triggerInactivityRefresh('button');
      });
      refreshButton.dataset.inactivityBound = 'true';
    }
  }

  function configureInactivityMonitor(options = {}) {
    if (!options || typeof options !== 'object') {
      return inactivityMonitorState;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'enabled')) {
      const enabled = Boolean(options.enabled);
      if (enabled !== inactivityMonitorState.enabled) {
        inactivityMonitorState.enabled = enabled;
        if (!enabled) {
          stopInactivityMonitor();
        } else {
          startInactivityMonitor();
        }
      }
    }
    if (Number.isFinite(options.idleThresholdMs) && options.idleThresholdMs > 0) {
      inactivityMonitorState.idleThresholdMs = Math.max(1000, Math.floor(options.idleThresholdMs));
    }
    if (Number.isFinite(options.refreshCountdownMs) && options.refreshCountdownMs > 0) {
      inactivityMonitorState.refreshCountdownMs = Math.max(
        1000,
        Math.floor(options.refreshCountdownMs),
      );
      if (inactivityMonitorState.promptVisible) {
        beginInactivityCountdown();
      }
    }
    if (Number.isFinite(options.checkIntervalMs) && options.checkIntervalMs > 0) {
      inactivityMonitorState.checkIntervalMs = Math.max(
        500,
        Math.floor(options.checkIntervalMs),
      );
      if (inactivityMonitorState.monitorRunning) {
        clearInactivityCheckTimer();
        scheduleInactivityCheck();
      }
    }
    if (Number.isFinite(options.lastActivityAt)) {
      inactivityMonitorState.lastActivityAt = Number(options.lastActivityAt);
    }
    return inactivityMonitorState;
  }

  function recordUserActivity(source = 'activity') {
    inactivityMonitorState.lastActivityAt = Date.now();
    if (inactivityMonitorState.promptVisible) {
      hideInactivityPrompt({ reason: 'activity', source });
    }
  }

  function setupInactivityMonitor(scope, doc) {
    inactivityMonitorState.scope = scope || inactivityMonitorState.scope || globalScope || globalThis;
    setupInactivityOverlay(doc || inactivityMonitorState.doc || scope?.document || null);
    startInactivityMonitor();
    if (typeof inactivityMonitorState.detachListeners === 'function') {
      try {
        inactivityMonitorState.detachListeners();
      } catch (error) {}
    }
    const disposers = [];
    const registerListener = (target, type, handler, options) => {
      if (!target?.addEventListener || typeof handler !== 'function') {
        return;
      }
      try {
        target.addEventListener(type, handler, options);
        disposers.push(() => {
          try {
            target.removeEventListener?.(type, handler, options);
          } catch (error) {}
        });
      } catch (error) {}
    };
    const targetDoc =
      doc || inactivityMonitorState.doc || documentRef || scope?.document || globalScope?.document;
    if (targetDoc?.addEventListener) {
      const visibilityListener = () => {
        if (!targetDoc || targetDoc.visibilityState === 'hidden') {
          return;
        }
        recordUserActivity('visibilitychange');
      };
      registerListener(targetDoc, 'visibilitychange', visibilityListener);

      const passiveEvents = new Set([
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'touchstart',
        'touchmove',
        'touchend',
        'mousedown',
        'mousemove',
        'mouseup',
        'wheel',
      ]);
      const docActivityEvents = [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'touchstart',
        'touchmove',
        'touchend',
        'mousedown',
        'mousemove',
        'mouseup',
        'wheel',
        'scroll',
      ];
      for (let index = 0; index < docActivityEvents.length; index += 1) {
        const eventName = docActivityEvents[index];
        const sourceLabel = `document:${eventName}`;
        const handler = (event) => {
          let reason = sourceLabel;
          if (event) {
            const pointerType =
              typeof event.pointerType === 'string' && event.pointerType ? event.pointerType : null;
            if (pointerType) {
              reason = `${sourceLabel}:${pointerType}`;
            } else if (typeof event.type === 'string' && event.type) {
              reason = `${sourceLabel}:${event.type}`;
            }
          }
          recordUserActivity(reason);
        };
        const options = passiveEvents.has(eventName) ? { passive: true } : undefined;
        registerListener(targetDoc, eventName, handler, options);
      }
    }
    if (scope?.addEventListener) {
      const focusListener = () => recordUserActivity('window-focus');
      registerListener(scope, 'focus', focusListener);
      const scopeActivityEvents = ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'mousedown', 'mousemove'];
      for (let index = 0; index < scopeActivityEvents.length; index += 1) {
        const eventName = scopeActivityEvents[index];
        const sourceLabel = `window:${eventName}`;
        const handler = (event) => {
          let reason = sourceLabel;
          if (event) {
            const pointerType =
              typeof event.pointerType === 'string' && event.pointerType ? event.pointerType : null;
            if (pointerType) {
              reason = `${sourceLabel}:${pointerType}`;
            } else if (typeof event.type === 'string' && event.type) {
              reason = `${sourceLabel}:${event.type}`;
            }
          }
          recordUserActivity(reason);
        };
        registerListener(scope, eventName, handler, { passive: true });
      }
    }
    inactivityMonitorState.detachListeners = () => {
      while (disposers.length) {
        const dispose = disposers.pop();
        try {
          dispose?.();
        } catch (error) {}
      }
    };
  }

  const inputModeListeners = new Set();

  function getInputModeSnapshot(detail = {}) {
    const mode = inputModeState.mode || 'pointer';
    const touchPreferred = mode === 'touch';
    const source = detail.source ?? inputModeState.source ?? null;
    return {
      mode,
      source,
      touchPreferred,
      touchActive: touchPreferred,
      controlScheme: touchPreferred ? 'touch' : 'pointer',
    };
  }

  function notifyInputModeListeners(detail = {}) {
    if (!inputModeListeners.size) {
      return;
    }
    const snapshot = Object.freeze({ ...getInputModeSnapshot(detail) });
    inputModeListeners.forEach((listener) => {
      if (typeof listener !== 'function') {
        return;
      }
      try {
        listener(snapshot);
      } catch (error) {
        if (globalScope?.console?.debug) {
          globalScope.console.debug('Input mode listener failed.', error);
        }
      }
    });
  }

  function subscribeToInputMode(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    inputModeListeners.add(listener);
    return () => {
      inputModeListeners.delete(listener);
    };
  }

  function normaliseInputMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!raw) {
      return 'pointer';
    }
    if (raw === 'touch' || raw === 'mobile' || raw === 'coarse') {
      return 'touch';
    }
    if (raw === 'pen' || raw === 'stylus') {
      return 'pointer';
    }
    return 'pointer';
  }

  function updateGlobalInputMode(mode) {
    if (!globalScope) {
      return;
    }
    try {
      globalScope.__INFINITE_RAILS_INPUT_MODE__ = mode;
      const mobileControlsActive = mode === 'touch';
      globalScope.__INFINITE_RAILS_MOBILE_CONTROLS_ACTIVE__ = mobileControlsActive;
    } catch (error) {}
    try {
      globalScope.InfiniteRails = globalScope.InfiniteRails || {};
      const touchPreferred = mode === 'touch';
      const controlScheme = touchPreferred ? 'touch' : 'pointer';
      globalScope.InfiniteRails.inputMode = mode;
      globalScope.InfiniteRails.controlScheme = controlScheme;
      globalScope.InfiniteRails.mobileControlsActive = touchPreferred;
      globalScope.InfiniteRails.touchPreferred = touchPreferred;
      globalScope.InfiniteRails.isTouchPreferred = touchPreferred;
      if (typeof globalScope.InfiniteRails.getInputMode !== 'function') {
        globalScope.InfiniteRails.getInputMode = () => inputModeState.mode;
      }
      if (typeof globalScope.InfiniteRails.setInputMode !== 'function') {
        globalScope.InfiniteRails.setInputMode = (value, detail = {}) => {
          scheduleInputMode(value, { ...detail, source: detail.source || 'api' });
        };
      }
      if (typeof globalScope.InfiniteRails.subscribeInputMode !== 'function') {
        globalScope.InfiniteRails.subscribeInputMode = (listener) => subscribeToInputMode(listener);
      }
      if (typeof globalScope.InfiniteRails.getInputModeSnapshot !== 'function') {
        globalScope.InfiniteRails.getInputModeSnapshot = () => getInputModeSnapshot({});
      }
    } catch (error) {}
    try {
      const scopeConfig =
        globalScope.APP_CONFIG && typeof globalScope.APP_CONFIG === 'object'
          ? globalScope.APP_CONFIG
          : (globalScope.APP_CONFIG = {});
      const touchPreferred = mode === 'touch';
      scopeConfig.inputMode = mode;
      scopeConfig.controlScheme = touchPreferred ? 'touch' : 'pointer';
      scopeConfig.touchPreferred = touchPreferred;
      scopeConfig.isTouchPreferred = touchPreferred;
      scopeConfig.mobileControlsActive = touchPreferred;
    } catch (error) {}
  }

  function dispatchInputModeChange(doc, mode, detail = {}) {
    if (!doc || typeof doc.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') {
      notifyInputModeListeners({ ...detail, mode });
      return;
    }
    const touchPreferred = mode === 'touch';
    const eventDetail = {
      mode,
      source: detail.source || null,
      touchActive: touchPreferred,
      touchPreferred,
      controlScheme: touchPreferred ? 'touch' : 'pointer',
    };
    try {
      const event = new CustomEvent('infinite-rails:input-mode-change', {
        bubbles: false,
        cancelable: false,
        detail: eventDetail,
      });
      doc.dispatchEvent(event);
    } catch (error) {}
    notifyInputModeListeners(eventDetail);
  }

  function toggleBooleanAttribute(element, attribute, enabled) {
    if (!element || !attribute) {
      return;
    }
    if (typeof element.toggleAttribute === 'function') {
      try {
        element.toggleAttribute(attribute, Boolean(enabled));
        return;
      } catch (error) {}
    }
    if (enabled) {
      if (typeof element.setAttribute === 'function') {
        try {
          element.setAttribute(attribute, '');
        } catch (error) {}
      }
    } else if (typeof element.removeAttribute === 'function') {
      try {
        element.removeAttribute(attribute);
      } catch (error) {}
    }
  }

  function setElementHidden(element, hidden) {
    if (!element) {
      return;
    }
    toggleBooleanAttribute(element, 'hidden', hidden);
    if ('hidden' in element) {
      try {
        element.hidden = Boolean(hidden);
      } catch (error) {}
    }
  }

  function setAriaHidden(element, hidden) {
    if (!element || typeof element.setAttribute !== 'function') {
      return;
    }
    try {
      element.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    } catch (error) {}
  }

  function applyInputMode(mode, detail = {}) {
    const nextMode = normaliseInputMode(mode);
    const force = Boolean(detail.force);
    const previous = inputModeState.mode;
    const changed = force || previous !== nextMode;
    inputModeState.mode = nextMode;
    inputModeState.source = detail.source || null;

    const doc = detail.doc || inputModeState.doc || documentRef || globalScope?.document || null;
    inputModeState.doc = doc;
    updateGlobalInputMode(nextMode);

    if (!doc) {
      return changed;
    }

    const readyState = typeof doc.readyState === 'string' ? doc.readyState : '';
    const root = doc.documentElement || null;
    const body = doc.body || null;

    if (!body && !/loaded|complete|interactive/i.test(readyState)) {
      if (!inputModeState.domReadyListenerAttached && typeof doc.addEventListener === 'function') {
        const domReadyHandler = () => {
          inputModeState.domReadyListenerAttached = false;
          applyInputMode(nextMode, { ...detail, doc, force: true });
        };
        try {
          doc.addEventListener('DOMContentLoaded', domReadyHandler, { once: true });
          inputModeState.domReadyListenerAttached = true;
        } catch (error) {}
      }
      return changed;
    }

    if (root?.setAttribute) {
      try {
        root.setAttribute('data-input-mode', nextMode);
      } catch (error) {}
    }

    if (body) {
      try {
        body.setAttribute('data-input-mode', nextMode);
      } catch (error) {}
      if (body.classList) {
        try {
          body.classList.toggle('input-touch', nextMode === 'touch');
          body.classList.toggle('input-pointer', nextMode !== 'touch');
        } catch (error) {}
      }
      if (body.dataset) {
        try {
          body.dataset.inputMode = nextMode;
        } catch (error) {}
        try {
          body.dataset.controlScheme = nextMode === 'touch' ? 'touch' : 'pointer';
        } catch (error) {}
        try {
          body.dataset.touchPreferred = nextMode === 'touch' ? 'true' : 'false';
        } catch (error) {}
        try {
          body.dataset.mobileControlsActive = nextMode === 'touch' ? 'true' : 'false';
        } catch (error) {}
      }
    }

    let mobileControls = null;
    if (typeof doc.getElementById === 'function') {
      try {
        mobileControls = doc.getElementById('mobileControls');
      } catch (error) {}
    }
    if (mobileControls) {
      const active = nextMode === 'touch';
      try {
        mobileControls.setAttribute('data-active', active ? 'true' : 'false');
      } catch (error) {}
      setElementHidden(mobileControls, !active);
      setAriaHidden(mobileControls, !active);
      toggleBooleanAttribute(mobileControls, 'inert', !active);
      if (mobileControls.dataset) {
        try {
          mobileControls.dataset.mode = nextMode;
        } catch (error) {}
        try {
          mobileControls.dataset.ready = 'true';
        } catch (error) {}
        try {
          mobileControls.dataset.active = active ? 'true' : 'false';
        } catch (error) {}
        try {
          mobileControls.dataset.controlScheme = active ? 'touch' : 'pointer';
        } catch (error) {}
      }
    }

    let inputOverlay = null;
    if (typeof doc.getElementById === 'function') {
      try {
        inputOverlay = doc.getElementById('inputOverlay');
      } catch (error) {}
    }
    if (inputOverlay) {
      const scheme = nextMode === 'touch' ? 'touch' : 'pointer';
      try {
        inputOverlay.setAttribute('data-scheme', scheme);
      } catch (error) {}
      try {
        inputOverlay.setAttribute('data-mode', nextMode);
      } catch (error) {}
      if (inputOverlay.dataset) {
        try {
          inputOverlay.dataset.scheme = scheme;
        } catch (error) {}
        try {
          inputOverlay.dataset.mode = nextMode;
        } catch (error) {}
        try {
          inputOverlay.dataset.controlScheme = scheme;
        } catch (error) {}
        try {
          inputOverlay.dataset.touchPreferred = scheme === 'touch' ? 'true' : 'false';
        } catch (error) {}
      }
    }

    if (changed) {
      dispatchInputModeChange(doc, nextMode, detail);
    }

    return changed;
  }

  function clearScheduledInputMode() {
    if (typeof inputModeState.scheduledCancel === 'function') {
      try {
        inputModeState.scheduledCancel();
      } catch (error) {}
    }
    inputModeState.scheduledCancel = null;
    inputModeState.scheduledHandle = null;
  }

  function scheduleInputMode(mode, detail = {}) {
    const nextMode = normaliseInputMode(mode);
    if (!nextMode) {
      return;
    }
    if (!detail.force && inputModeState.mode === nextMode && !detail.reset) {
      return;
    }
    clearScheduledInputMode();
    const scope = detail.scope || globalScope || (typeof window !== 'undefined' ? window : globalThis);
    const run = () => {
      clearScheduledInputMode();
      applyInputMode(nextMode, detail);
    };
    if (scope?.requestAnimationFrame) {
      const handle = scope.requestAnimationFrame(run);
      inputModeState.scheduledHandle = handle;
      inputModeState.scheduledCancel = () => scope.cancelAnimationFrame?.(handle);
      return;
    }
    if (scope?.setTimeout) {
      const handle = scope.setTimeout(run, 0);
      inputModeState.scheduledHandle = handle;
      inputModeState.scheduledCancel = () => scope.clearTimeout?.(handle);
      return;
    }
    run();
  }

  function teardownInputModeDetection() {
    clearScheduledInputMode();
    if (typeof inputModeState.detachListeners === 'function') {
      try {
        inputModeState.detachListeners();
      } catch (error) {}
    }
    inputModeState.detachListeners = null;
  }

  function setupInputModeDetection(scope, doc) {
    teardownInputModeDetection();
    const targetDoc = doc || documentRef || scope?.document || null;
    inputModeState.doc = targetDoc;

    const initialEnvironment = detectMobileEnvironment(scope);
    const initialMode = initialEnvironment.isMobile ? 'touch' : 'pointer';
    applyInputMode(initialMode, { doc: targetDoc, source: 'environment', force: true });

    const disposers = [];
    if (!targetDoc || typeof targetDoc.addEventListener !== 'function') {
      inputModeState.detachListeners = () => {};
      return;
    }

    const pointerListener = (event) => {
      if (!event) {
        return;
      }
      const pointerTypeRaw = typeof event.pointerType === 'string' ? event.pointerType.toLowerCase() : '';
      if (!pointerTypeRaw) {
        return;
      }
      if (pointerTypeRaw === 'touch') {
        recordUserActivity('pointer-touch');
        scheduleInputMode('touch', { scope, source: 'pointer-event:touch' });
      } else if (pointerTypeRaw === 'mouse' || pointerTypeRaw === 'pen') {
        recordUserActivity(`pointer-${pointerTypeRaw}`);
        scheduleInputMode('pointer', { scope, source: `pointer-event:${pointerTypeRaw}` });
      }
    };

    try {
      targetDoc.addEventListener('pointerdown', pointerListener, { passive: true });
      disposers.push(() => targetDoc.removeEventListener('pointerdown', pointerListener));
      targetDoc.addEventListener('pointermove', pointerListener, { passive: true });
      disposers.push(() => targetDoc.removeEventListener('pointermove', pointerListener));
    } catch (error) {}

    const touchListener = () => {
      recordUserActivity('touchstart');
      scheduleInputMode('touch', { scope, source: 'touchstart' });
    };
    const mouseListener = () => {
      recordUserActivity('mousedown');
      scheduleInputMode('pointer', { scope, source: 'mousedown' });
    };

    try {
      targetDoc.addEventListener('touchstart', touchListener, { passive: true });
      disposers.push(() => targetDoc.removeEventListener('touchstart', touchListener));
    } catch (error) {}

    try {
      targetDoc.addEventListener('mousedown', mouseListener, { passive: true });
      disposers.push(() => targetDoc.removeEventListener('mousedown', mouseListener));
    } catch (error) {}

    if (scope?.addEventListener) {
      const keyListener = (event) => {
        if (!event) {
          return;
        }
        if (event.metaKey || event.altKey || event.ctrlKey) {
          return;
        }
        recordUserActivity('keyboard');
        scheduleInputMode('pointer', { scope, source: 'keyboard' });
      };
      try {
        scope.addEventListener('keydown', keyListener, { passive: true });
        disposers.push(() => scope.removeEventListener('keydown', keyListener));
      } catch (error) {}
    }

    if (scope?.matchMedia) {
      const pointerQueries = ['(pointer: coarse)', '(any-pointer: coarse)', '(hover: none)', '(any-hover: none)'];
      for (let index = 0; index < pointerQueries.length; index += 1) {
        const query = pointerQueries[index];
        let mediaQuery = null;
        try {
          mediaQuery = scope.matchMedia(query);
        } catch (error) {
          mediaQuery = null;
        }
        if (!mediaQuery) {
          continue;
        }
        const mediaListener = (event) => {
          let matches = null;
          if (event && typeof event.matches === 'boolean') {
            matches = event.matches;
          } else if (typeof mediaQuery.matches === 'boolean') {
            matches = mediaQuery.matches;
          }
          const environment = detectMobileEnvironment(scope);
          let targetMode = environment.isMobile ? 'touch' : 'pointer';
          if (matches === true) {
            targetMode = 'touch';
          } else if (matches === false) {
            targetMode = 'pointer';
          }
          scheduleInputMode(targetMode, { scope, source: `media-query:${query}` });
        };
        if (typeof mediaQuery.addEventListener === 'function') {
          try {
            mediaQuery.addEventListener('change', mediaListener);
            disposers.push(() => mediaQuery.removeEventListener('change', mediaListener));
          } catch (error) {}
        } else if (typeof mediaQuery.addListener === 'function') {
          try {
            mediaQuery.addListener(mediaListener);
            disposers.push(() => mediaQuery.removeListener(mediaListener));
          } catch (error) {}
        }
      }
    }

    inputModeState.detachListeners = () => {
      while (disposers.length) {
        const dispose = disposers.pop();
        try {
          dispose?.();
        } catch (error) {}
      }
    };
  }

  setupInputModeDetection(globalScope, documentRef);
  setupInactivityMonitor(globalScope, documentRef);

  if (!globalScope.__INFINITE_RAILS_STATE__) {
    globalScope.__INFINITE_RAILS_STATE__ = {
      isRunning: false,
      world: [],
      updatedAt: Date.now(),
      reason: 'bootstrap',
    };
  }
  if (!Object.prototype.hasOwnProperty.call(globalScope, '__INFINITE_RAILS_RENDERER_MODE__')) {
    globalScope.__INFINITE_RAILS_RENDERER_MODE__ = null;
  }

  const debugModeState = {
    enabled: false,
    storageKey: 'infinite-rails-debug-mode',
    listeners: new Set(),
    toggleButton: null,
    statusElement: null,
  };

  const developerStatsState = {
    enabled: false,
    storageKey: 'infinite-rails-developer-stats',
    toggleButton: null,
    panel: null,
    fields: {
      fps: null,
      models: null,
      textures: null,
      audio: null,
      assets: null,
      scene: null,
    },
    updateHandle: null,
    updateMode: null,
    lastUpdateAt: 0,
    listeners: new Set(),
    metricsErrorLogged: false,
  };

  const LIVE_DIAGNOSTIC_CATEGORIES = Object.freeze({
    model: { label: 'Model', icon: '🧊' },
    texture: { label: 'Texture', icon: '🖼️' },
    ai: { label: 'AI', icon: '🤖' },
    ui: { label: 'UI', icon: '🪟' },
    scene: { label: 'Scene', icon: '🌌' },
    hotkey: { label: 'Hotkey', icon: '⌨️' },
    movement: { label: 'Movement', icon: '🏃' },
    system: { label: 'System', icon: '🛰️' },
  });

  const liveDiagnosticsState = {
    enabled: false,
    entries: [],
    limit: 80,
    counter: 0,
    toggleButton: null,
    panel: null,
    list: null,
    empty: null,
    clearButton: null,
    debugListenerCleanup: null,
  };

  const BOOT_DIAGNOSTIC_SCOPES = Object.freeze(['engine', 'assets', 'models', 'ui']);
  const BOOT_DIAGNOSTICS_SEVERITY_RANK = Object.freeze({ pending: 0, ok: 1, warning: 2, error: 3 });
  const BOOT_DIAGNOSTICS_DEFAULT_MESSAGE = 'Waiting for launch…';

  const bootDiagnosticsState = {
    panel: null,
    timestampEl: null,
    downloadButton: null,
    sections: {
      engine: { container: null, list: null, status: null },
      assets: { container: null, list: null, status: null },
      models: { container: null, list: null, status: null },
      ui: { container: null, list: null, status: null },
    },
    lastSnapshot: null,
    listeners: new Set(),
  };

  const MANIFEST_ASSET_CHECK_DISPLAY_LIMIT = 12;
  const MANIFEST_ASSET_CHECK_TIMEOUT_MS = 8000;
  const MANIFEST_ASSET_CHECK_CONCURRENCY = 6;

  const manifestAssetCheckState = {
    status: 'idle',
    promise: null,
    total: 0,
    missing: [],
    error: null,
    checkedAt: null,
    summary: null,
  };

  function cloneManifestAssetCheckState(source = manifestAssetCheckState) {
    if (!source) {
      return null;
    }
    const missingEntries = Array.isArray(source.missing)
      ? source.missing.map((entry) => ({ ...entry }))
      : [];
    const summary = source.summary
      ? {
          ...source.summary,
          missing: Array.isArray(source.summary.missing)
            ? source.summary.missing.map((entry) => ({ ...entry }))
            : [],
        }
      : null;
    const error = source.error ? { ...source.error } : null;
    return {
      status: source.status ?? null,
      total: Number.isFinite(source.total) ? Number(source.total) : null,
      checkedAt: source.checkedAt ?? null,
      missing: missingEntries,
      error,
      summary,
      pending: Boolean(source.promise),
    };
  }

  function markManifestAssetCheckSkipped(reason = 'offline-mode', options = {}) {
    if (manifestAssetCheckState.status !== 'idle' && options.force !== true) {
      return manifestAssetCheckState;
    }
    const skippedAt = new Date().toISOString();
    updateManifestAssetCheckState(
      {
        status: 'skipped',
        error: null,
        missing: [],
        total: 0,
        checkedAt: skippedAt,
        summary: {
          status: 'skipped',
          reason,
          missing: [],
          total: 0,
          reachable: 0,
          checkedAt: skippedAt,
          manifestUrl: null,
        },
      },
      { render: options.render !== false },
    );
    return manifestAssetCheckState;
  }

  globalScope.InfiniteRails = globalScope.InfiniteRails || {};
  globalScope.InfiniteRails.bootDiagnostics = globalScope.InfiniteRails.bootDiagnostics || {};
  const bootStatusApi = globalScope.InfiniteRails.bootStatus || {};
  bootStatusApi.update = (phase, detail) => updateBootStatus(phase, detail);
  bootStatusApi.set = (phase, status, message, extra) => setBootPhaseStatus(phase, status, message, extra);
  bootStatusApi.markActive = (phase, message, extra) => markBootPhaseActive(phase, message, extra);
  bootStatusApi.markOk = (phase, message, extra) => markBootPhaseOk(phase, message, extra);
  bootStatusApi.markWarning = (phase, message, extra) => markBootPhaseWarning(phase, message, extra);
  bootStatusApi.markError = (phase, message, extra) => markBootPhaseError(phase, message, extra);
  globalScope.InfiniteRails.bootStatus = bootStatusApi;

  function isDebugModeEnabled() {
    return debugModeState.enabled;
  }

  function loadInitialDebugModePreference() {
    if (!globalScope?.localStorage) {
      debugModeState.enabled = false;
      return;
    }
    try {
      const stored = globalScope.localStorage.getItem(debugModeState.storageKey);
      if (stored === '1' || stored === 'true') {
        debugModeState.enabled = true;
      } else if (stored === '0' || stored === 'false') {
        debugModeState.enabled = false;
      }
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Unable to load debug mode preference from storage.', error);
      }
      debugModeState.enabled = false;
    }
  }

  loadInitialDebugModePreference();

  function loadInitialDeveloperStatsPreference() {
    if (!globalScope?.localStorage) {
      developerStatsState.enabled = false;
      return;
    }
    try {
      const stored = globalScope.localStorage.getItem(developerStatsState.storageKey);
      if (stored === '1' || stored === 'true') {
        developerStatsState.enabled = true;
      } else if (stored === '0' || stored === 'false') {
        developerStatsState.enabled = false;
      }
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Unable to load developer stats preference from storage.', error);
      }
      developerStatsState.enabled = false;
    }
  }

  loadInitialDeveloperStatsPreference();

  function normaliseBootDiagnosticsSeverity(value, { allowPending = false } = {}) {
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === 'error' || trimmed === 'warning' || trimmed === 'ok') {
        return trimmed;
      }
      if (trimmed === 'success') {
        return 'ok';
      }
      if (allowPending && (trimmed === 'pending' || trimmed === 'info')) {
        return trimmed === 'pending' ? 'pending' : 'ok';
      }
    }
    return allowPending ? 'pending' : 'ok';
  }

  function formatManifestAssetStatusLabel(entry) {
    if (!entry) {
      return 'Unavailable';
    }
    const status = Number.isFinite(entry.status) ? Number(entry.status) : null;
    if (status === 403) {
      return '403 Forbidden';
    }
    if (status === 404) {
      return '404 Not Found';
    }
    if (status === 401) {
      return '401 Unauthorized';
    }
    if (status === 400) {
      return '400 Bad Request';
    }
    if (status === 410) {
      return '410 Gone';
    }
    if (status !== null) {
      return `${status}`;
    }
    const note = typeof entry.note === 'string' ? entry.note.trim() : '';
    if (note === 'timeout') {
      return 'Request timed out';
    }
    if (note === 'network-error') {
      return 'Network error';
    }
    if (note === 'unresolvable') {
      return 'Unresolvable path';
    }
    if (note) {
      return note;
    }
    return 'Unavailable';
  }

  function formatManifestAssetDetail(entry) {
    if (!entry) {
      return '';
    }
    const parts = [];
    if (entry.method && typeof entry.method === 'string') {
      parts.push(`Probe: ${entry.method.toUpperCase()}`);
    }
    if (entry.url && typeof entry.url === 'string') {
      parts.push(entry.url);
    }
    if (entry.note && typeof entry.note === 'string') {
      const trimmed = entry.note.trim();
      if (trimmed && !/^(?:timeout|network-error|unresolvable)$/i.test(trimmed)) {
        parts.push(trimmed);
      }
    }
    if (parts.length === 0) {
      return '';
    }
    return parts.join(' • ');
  }

  function getManifestAssetDiagnosticsEntries() {
    const state = manifestAssetCheckState;
    if (!state || typeof state.status !== 'string') {
      return [];
    }
    const status = state.status.trim().toLowerCase();
    if (!status || status === 'idle') {
      return [];
    }
    if (status === 'pending') {
      const totalLabel = Number.isFinite(state.total) && state.total > 0
        ? ` (${state.total})`
        : '';
      return [
        {
          severity: 'pending',
          message: `Checking manifest asset availability${totalLabel ? ` for ${state.total} item${state.total === 1 ? '' : 's'}` : '…'}`,
          detail: null,
        },
      ];
    }
    if (status === 'error') {
      const detailParts = [];
      const summary = state.summary || {};
      if (typeof state.error?.message === 'string' && state.error.message.trim().length) {
        detailParts.push(state.error.message.trim());
      }
      if (typeof state.error?.reason === 'string' && state.error.reason.trim().length) {
        detailParts.push(state.error.reason.trim());
      }
      if (typeof summary.manifestUrl === 'string' && summary.manifestUrl.trim().length) {
        detailParts.push(summary.manifestUrl.trim());
      }
      const detail = detailParts.length ? detailParts.join(' • ') : null;
      return [
        {
          severity: 'warning',
          message: 'Manifest asset availability check failed.',
          detail,
        },
      ];
    }
    if (status === 'skipped') {
      return [
        {
          severity: 'ok',
          message: 'Manifest asset availability check skipped in offline mode.',
          detail: null,
        },
      ];
    }
    const missingEntries = Array.isArray(state.missing) ? state.missing : [];
    if (status === 'missing' && missingEntries.length) {
      const entries = [];
      const preview = missingEntries.slice(0, MANIFEST_ASSET_CHECK_DISPLAY_LIMIT);
      const remaining = missingEntries.length - preview.length;
      entries.push({
        severity: 'warning',
        message: `Manifest check missing ${missingEntries.length} asset${missingEntries.length === 1 ? '' : 's'}.`,
        detail: remaining > 0 ? `Showing first ${preview.length} entries.` : null,
      });
      preview.forEach((entry) => {
        const message = `${formatManifestAssetStatusLabel(entry)} — ${
          typeof entry.path === 'string' && entry.path.trim().length ? entry.path.trim() : 'Unknown asset'
        }`;
        const detail = formatManifestAssetDetail(entry);
        entries.push({
          severity: 'error',
          message,
          detail: detail || null,
        });
      });
      if (remaining > 0) {
        entries.push({
          severity: 'warning',
          message: `+${remaining} additional manifest asset${remaining === 1 ? '' : 's'} unavailable.`,
          detail: null,
        });
      }
      return entries;
    }
    if (status === 'ok' || (status === 'missing' && missingEntries.length === 0)) {
      const total = Number.isFinite(state.total) ? state.total : null;
      const detailTimestamp = state.checkedAt ? formatBootDiagnosticsTimestamp(state.checkedAt) : null;
      const detail = detailTimestamp ? `Checked at ${detailTimestamp}` : null;
      return [
        {
          severity: 'ok',
          message:
            total && total > 0
              ? `Manifest assets responded (${total} checked).`
              : 'Manifest assets responded to availability probe.',
          detail,
        },
      ];
    }
    return [];
  }

  function formatBootDiagnosticsTimestamp(value) {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    try {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Failed to format boot diagnostics timestamp.', error);
      }
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }
  }

  function formatBootDiagnosticsDetail(detail) {
    if (detail === null || detail === undefined) {
      return '';
    }
    if (typeof detail === 'string') {
      return detail.trim();
    }
    if (typeof detail === 'number' || typeof detail === 'boolean') {
      return String(detail);
    }
    try {
      return JSON.stringify(detail);
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Failed to serialise boot diagnostics detail.', error);
      }
      return '';
    }
  }

  function prepareBootDiagnosticsEntries(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries
      .map((entry) => {
        const severity = normaliseBootDiagnosticsSeverity(entry?.severity, { allowPending: true });
        let message = '';
        if (typeof entry?.message === 'string' && entry.message.trim().length) {
          message = entry.message.trim();
        } else if (entry?.message !== undefined && entry?.message !== null) {
          message = String(entry.message);
        }
        let detail = null;
        if (entry?.detail !== undefined && entry?.detail !== null) {
          if (typeof entry.detail === 'string' || typeof entry.detail === 'number' || typeof entry.detail === 'boolean') {
            detail = entry.detail;
          } else {
            try {
              detail = JSON.parse(JSON.stringify(entry.detail));
            } catch (error) {
              detail = String(entry.detail);
            }
          }
        }
        return { severity, message, detail };
      })
      .filter((entry) => Boolean(entry.severity));
  }

  function sortBootDiagnosticsEntries(entries) {
    const rank = (value) => BOOT_DIAGNOSTICS_SEVERITY_RANK[value] ?? 0;
    return [...entries].sort((a, b) => {
      const rankDelta = rank(b.severity) - rank(a.severity);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      if (a.message !== b.message) {
        return a.message.localeCompare(b.message);
      }
      const detailA = formatBootDiagnosticsDetail(a.detail);
      const detailB = formatBootDiagnosticsDetail(b.detail);
      if (detailA !== detailB) {
        return detailA.localeCompare(detailB);
      }
      return 0;
    });
  }

  function setBootDiagnosticsSectionStatus(sectionState, severity) {
    if (!sectionState) {
      return;
    }
    const normalised = normaliseBootDiagnosticsSeverity(severity, { allowPending: true });
    const label =
      normalised === 'error'
        ? 'Error'
        : normalised === 'warning'
          ? 'Warning'
          : normalised === 'ok'
            ? 'OK'
            : 'Pending';
    if (sectionState.container) {
      sectionState.container.dataset.status = normalised;
    }
    if (sectionState.status) {
      sectionState.status.textContent = label;
    }
  }

  function renderBootDiagnostics(snapshot = bootDiagnosticsState.lastSnapshot) {
    const doc =
      bootDiagnosticsState.panel?.ownerDocument ||
      documentRef ||
      (typeof document !== 'undefined' ? document : null);
    if (bootDiagnosticsState.timestampEl) {
      const formatted = snapshot?.timestamp ? formatBootDiagnosticsTimestamp(snapshot.timestamp) : null;
      bootDiagnosticsState.timestampEl.textContent = formatted
        ? `Last updated ${formatted}`
        : 'Boot diagnostics will populate after launch.';
    }
    BOOT_DIAGNOSTIC_SCOPES.forEach((scope) => {
      const sectionState = bootDiagnosticsState.sections[scope];
      if (!sectionState) {
        return;
      }
      const list = sectionState.list || null;
      const listDoc = list?.ownerDocument || doc;
      if (list) {
        while (list.firstChild) {
          list.removeChild(list.firstChild);
        }
      }
      const baseEntries = sortBootDiagnosticsEntries(
        prepareBootDiagnosticsEntries(snapshot?.sections?.[scope]),
      );
      const manifestEntries = scope === 'assets' ? getManifestAssetDiagnosticsEntries() : [];
      const combinedEntries = scope === 'assets' ? [...baseEntries, ...manifestEntries] : baseEntries;
      const hasEntries = combinedEntries.length > 0;
      let highestSeverity = 'pending';
      let errorCount = 0;
      combinedEntries.forEach((entry) => {
        const severity = entry.severity;
        if (severity === 'error') {
          errorCount += 1;
        }
        if (BOOT_DIAGNOSTICS_SEVERITY_RANK[severity] > BOOT_DIAGNOSTICS_SEVERITY_RANK[highestSeverity]) {
          highestSeverity = severity;
        }
        if (!list || !listDoc) {
          return;
        }
        const item = listDoc.createElement('li');
        item.className = 'diagnostic-list__item boot-diagnostics__item';
        item.dataset.status = severity;
        const messageEl = listDoc.createElement('span');
        messageEl.className = 'boot-diagnostics__message';
        const messageText = entry.message && entry.message.length ? entry.message : 'No additional details.';
        messageEl.textContent = messageText;
        item.appendChild(messageEl);
        const detailText = formatBootDiagnosticsDetail(entry.detail);
        if (detailText) {
          const detailEl = listDoc.createElement('span');
          detailEl.className = 'boot-diagnostics__detail';
          detailEl.textContent = detailText;
          item.appendChild(detailEl);
        }
        list.appendChild(item);
      });
      if (!hasEntries && list && listDoc) {
        const item = listDoc.createElement('li');
        item.className = 'diagnostic-list__item boot-diagnostics__item';
        item.dataset.status = 'pending';
        const messageEl = listDoc.createElement('span');
        messageEl.className = 'boot-diagnostics__message';
        messageEl.textContent = BOOT_DIAGNOSTICS_DEFAULT_MESSAGE;
        item.appendChild(messageEl);
        list.appendChild(item);
        highestSeverity = 'pending';
      }
      if (sectionState.container?.dataset) {
        sectionState.container.dataset.hasErrors = errorCount > 0 ? 'true' : 'false';
        sectionState.container.dataset.errorCount = String(errorCount);
      }
      setBootDiagnosticsSectionStatus(sectionState, highestSeverity);
    });
  }

  function cloneBootDiagnosticsSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    let clone;
    try {
      clone = JSON.parse(JSON.stringify(snapshot));
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Failed to clone boot diagnostics snapshot.', error);
      }
      clone = {
        timestamp: snapshot.timestamp ?? null,
        status: snapshot.status ?? null,
        phase: snapshot.phase ?? null,
        sections: {},
      };
      BOOT_DIAGNOSTIC_SCOPES.forEach((scope) => {
        const entries = snapshot.sections?.[scope];
        if (Array.isArray(entries)) {
          clone.sections[scope] = entries.map((entry) => {
            const severity = normaliseBootDiagnosticsSeverity(entry?.severity, { allowPending: true });
            const message =
              typeof entry?.message === 'string'
                ? entry.message
                : entry?.message !== undefined && entry?.message !== null
                  ? String(entry.message)
                  : '';
            let detail = null;
            if (entry?.detail !== undefined && entry?.detail !== null) {
              if (typeof entry.detail === 'string') {
                detail = entry.detail;
              } else {
                try {
                  detail = JSON.parse(JSON.stringify(entry.detail));
                } catch (detailError) {
                  detail = String(entry.detail);
                }
              }
            }
            return { severity, message, detail };
          });
        } else {
          clone.sections[scope] = [];
        }
      });
    }
    clone.sections = clone.sections || {};
    BOOT_DIAGNOSTIC_SCOPES.forEach((scope) => {
      if (!Array.isArray(clone.sections[scope])) {
        clone.sections[scope] = [];
      }
    });
    const manifestEntries = getManifestAssetDiagnosticsEntries();
    if (Array.isArray(clone.sections.assets) && manifestEntries.length) {
      manifestEntries.forEach((entry) => {
        if (!entry) {
          return;
        }
        const severity = normaliseBootDiagnosticsSeverity(entry.severity, { allowPending: true });
        let message = '';
        if (typeof entry.message === 'string' && entry.message.trim().length) {
          message = entry.message.trim();
        } else if (entry.message !== undefined && entry.message !== null) {
          message = String(entry.message);
        }
        let detail = null;
        if (entry.detail !== undefined && entry.detail !== null) {
          if (typeof entry.detail === 'string') {
            detail = entry.detail;
          } else if (typeof entry.detail === 'number' || typeof entry.detail === 'boolean') {
            detail = String(entry.detail);
          } else {
            try {
              detail = JSON.parse(JSON.stringify(entry.detail));
            } catch (error) {
              detail = String(entry.detail);
            }
          }
        }
        clone.sections.assets.push({ severity, message, detail });
      });
    }
    return clone;
  }

  function summariseBootDiagnosticErrors(snapshot) {
    const clone = cloneBootDiagnosticsSnapshot(snapshot);
    if (!clone) {
      return null;
    }
    const summary = {
      timestamp: clone.timestamp ?? null,
      status: clone.status ?? null,
      phase: clone.phase ?? null,
      totalErrorCount: 0,
      sections: {},
    };
    BOOT_DIAGNOSTIC_SCOPES.forEach((scope) => {
      let entries = prepareBootDiagnosticsEntries(clone.sections?.[scope]);
      if (scope === 'assets') {
        const manifestEntries = getManifestAssetDiagnosticsEntries().map((entry) => ({
          severity: normaliseBootDiagnosticsSeverity(entry?.severity, { allowPending: true }),
          message:
            typeof entry?.message === 'string' && entry.message.trim().length
              ? entry.message.trim()
              : entry?.message !== undefined && entry?.message !== null
                ? String(entry.message)
                : '',
          detail: entry?.detail ?? null,
        }));
        entries = entries.concat(manifestEntries);
      }
      const errors = entries.filter((entry) => entry.severity === 'error').map((entry) => ({
        severity: 'error',
        message: entry.message && entry.message.length ? entry.message : 'No additional details.',
        detail: entry.detail ?? null,
      }));
      summary.sections[scope] = errors;
      summary.totalErrorCount += errors.length;
    });
    return summary;
  }

  function updateManifestAssetCheckState(patch = {}, { render = true } = {}) {
    if (!patch || typeof patch !== 'object') {
      return manifestAssetCheckState;
    }
    Object.assign(manifestAssetCheckState, patch);
    if (render) {
      try {
        renderBootDiagnostics();
      } catch (error) {
        if (globalScope?.console?.debug) {
          globalScope.console.debug('Failed to render boot diagnostics after manifest asset state update.', error);
        }
      }
    }
    return manifestAssetCheckState;
  }

  function resolveManifestAssetUrl(path, baseCandidates) {
    if (typeof path !== 'string') {
      return null;
    }
    const trimmed = path.trim();
    if (!trimmed) {
      return null;
    }
    if (/^(?:data|blob):/i.test(trimmed)) {
      return null;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      try {
        const absolute = new URL(trimmed);
        return applyAssetVersionTag(absolute.href);
      } catch (error) {
        return applyAssetVersionTag(trimmed);
      }
    }
    const bases = Array.isArray(baseCandidates) ? baseCandidates.filter(Boolean) : [];
    const resolved = resolveUrlWithBases(trimmed, bases);
    if (!resolved) {
      return null;
    }
    return applyAssetVersionTag(resolved.href);
  }

  function startManifestAssetAvailabilityCheck(options = {}) {
    if (manifestAssetCheckState.promise && options.force !== true) {
      return manifestAssetCheckState.promise;
    }
    const scope = typeof globalScope !== 'undefined' ? globalScope : globalThis;
    const fetchImpl =
      (typeof scope.fetch === 'function' && scope.fetch.bind(scope)) ||
      (typeof fetch === 'function' ? fetch : null);
    if (!fetchImpl) {
      const now = new Date().toISOString();
      const summary = {
        status: 'error',
        reason: 'fetch-unavailable',
        total: 0,
        reachable: 0,
        missing: [],
        checkedAt: now,
      };
      updateManifestAssetCheckState({
        status: 'error',
        error: { reason: 'fetch-unavailable', message: 'Fetch API unavailable; manifest assets cannot be probed.' },
        summary,
        checkedAt: now,
      });
      return Promise.resolve(summary);
    }

    updateManifestAssetCheckState({
      status: 'pending',
      error: null,
      summary: null,
      missing: [],
      checkedAt: null,
      total: 0,
    });

    const baseCandidates = [];
    const configuredBase = scope?.APP_CONFIG?.assetBaseUrl ?? null;
    if (configuredBase) {
      baseCandidates.push(configuredBase);
    }
    const derivedBase = deriveProductionAssetRoot(scope, documentRef);
    if (derivedBase) {
      baseCandidates.push(derivedBase);
    }
    if (documentRef?.baseURI) {
      baseCandidates.push(documentRef.baseURI);
    }
    if (scope?.location?.href) {
      baseCandidates.push(scope.location.href);
    }

    const manifestUrlCandidate = resolveUrlWithBases('asset-manifest.json', baseCandidates);
    const manifestUrl = manifestUrlCandidate ? manifestUrlCandidate.href : 'asset-manifest.json';
    const manifestRequestUrl = applyAssetVersionTag(manifestUrl);

    const fetchWithTimeout = async (url, init = {}) => {
      const optionsInit = {
        method: 'HEAD',
        cache: 'no-store',
        redirect: 'follow',
        mode: 'cors',
        ...init,
      };
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      if (controller) {
        optionsInit.signal = controller.signal;
      }
      let timeoutHandle = null;
      const timeoutMs = Number.isFinite(optionsInit.timeoutMs) ? optionsInit.timeoutMs : MANIFEST_ASSET_CHECK_TIMEOUT_MS;
      if (timeoutMs && timeoutMs > 0) {
        const setTimer = typeof scope.setTimeout === 'function' ? scope.setTimeout.bind(scope) : setTimeout;
        timeoutHandle = setTimer(() => {
          timeoutHandle = null;
          if (controller) {
            try {
              controller.abort();
            } catch (abortError) {}
          }
        }, timeoutMs);
      }
      try {
        const response = await fetchImpl(url, optionsInit);
        const ok = response.ok || response.type === 'opaque';
        return {
          ok,
          status: response.status ?? null,
          method: optionsInit.method || 'HEAD',
          note: null,
        };
      } catch (error) {
        const reason = error?.name === 'AbortError' ? 'timeout' : 'network-error';
        return {
          ok: false,
          status: null,
          method: optionsInit.method || 'HEAD',
          note: reason,
        };
      } finally {
        if (timeoutHandle !== null) {
          const clearTimer = typeof scope.clearTimeout === 'function' ? scope.clearTimeout.bind(scope) : clearTimeout;
          if (clearTimer) {
            try {
              clearTimer(timeoutHandle);
            } catch (clearError) {}
          }
        }
      }
    };

    const probeAsset = async (asset) => {
      const headResult = await fetchWithTimeout(asset.url, { method: 'HEAD' });
      if (headResult.ok) {
        return headResult;
      }
      if (headResult.status === 405 || headResult.status === 501) {
        const rangeResult = await fetchWithTimeout(asset.url, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
        });
        if (rangeResult.ok) {
          return rangeResult;
        }
        return rangeResult;
      }
      return headResult;
    };

    const promise = (async () => {
      const summary = {
        status: 'ok',
        total: 0,
        reachable: 0,
        missing: [],
        checkedAt: new Date().toISOString(),
        manifestUrl: manifestRequestUrl,
      };
      try {
        const response = await fetchImpl(manifestRequestUrl, {
          method: 'GET',
          cache: 'no-store',
          redirect: 'follow',
        });
        if (!response.ok) {
          summary.status = 'error';
          summary.reason = 'manifest-request-failed';
          summary.responseStatus = response.status ?? null;
          return summary;
        }
        let manifestJson;
        try {
          manifestJson = await response.json();
        } catch (parseError) {
          summary.status = 'error';
          summary.reason = 'manifest-parse-failed';
          summary.error = { message: parseError?.message ?? String(parseError) };
          return summary;
        }
        const assets = Array.isArray(manifestJson?.assets) ? manifestJson.assets : [];
        const seen = new Set();
        const paths = [];
        assets.forEach((asset) => {
          if (typeof asset !== 'string') {
            return;
          }
          const trimmed = asset.trim();
          if (!trimmed || seen.has(trimmed)) {
            return;
          }
          seen.add(trimmed);
          paths.push(trimmed);
        });
        summary.total = paths.length;
        updateManifestAssetCheckState({ total: paths.length });
        if (paths.length === 0) {
          summary.checkedAt = new Date().toISOString();
          return summary;
        }
        const assetsToProbe = paths.map((path) => ({
          path,
          url: resolveManifestAssetUrl(path, baseCandidates),
        }));
        const missing = [];
        let reachable = 0;
        assetsToProbe.forEach((asset) => {
          if (!asset.url) {
            missing.push({ path: asset.path, url: null, status: null, method: null, note: 'unresolvable' });
          }
        });
        const queue = assetsToProbe.filter((asset) => Boolean(asset.url));
        const workers = [];
        const concurrency = Math.max(1, Math.min(MANIFEST_ASSET_CHECK_CONCURRENCY, queue.length || 1));
        for (let index = 0; index < concurrency; index += 1) {
          workers.push(
            (async () => {
              while (queue.length) {
                const asset = queue.shift();
                if (!asset) {
                  break;
                }
                try {
                  // eslint-disable-next-line no-await-in-loop
                  const result = await probeAsset(asset);
                  if (result.ok) {
                    reachable += 1;
                  } else {
                    missing.push({
                      path: asset.path,
                      url: asset.url,
                      status: Number.isFinite(result.status) ? Number(result.status) : null,
                      method: typeof result.method === 'string' ? result.method : null,
                      note: result.note || null,
                    });
                  }
                } catch (probeError) {
                  missing.push({
                    path: asset.path,
                    url: asset.url,
                    status: null,
                    method: null,
                    note: 'network-error',
                  });
                  if (scope.console?.debug) {
                    scope.console.debug('Manifest asset probe failed.', probeError, { asset });
                  }
                }
              }
            })(),
          );
        }
        await Promise.all(workers);
        summary.reachable = reachable;
        summary.missing = missing;
        summary.status = missing.length ? 'missing' : 'ok';
        summary.checkedAt = new Date().toISOString();
        return summary;
      } catch (error) {
        summary.status = 'error';
        summary.reason = 'exception';
        summary.error = { message: error?.message ?? String(error) };
        return summary;
      }
    })();

    manifestAssetCheckState.promise = promise;

    return promise
      .then((summary) => {
        const status = summary.status === 'missing' ? 'missing' : summary.status === 'ok' ? 'ok' : summary.status || 'error';
        const missing = Array.isArray(summary.missing)
          ? summary.missing.map((entry) => ({
              path: typeof entry?.path === 'string' ? entry.path : null,
              url: typeof entry?.url === 'string' ? entry.url : null,
              status: Number.isFinite(entry?.status) ? Number(entry.status) : null,
              method: typeof entry?.method === 'string' ? entry.method : null,
              note:
                entry?.note !== undefined && entry?.note !== null
                  ? typeof entry.note === 'string'
                    ? entry.note
                    : String(entry.note)
                  : null,
            }))
          : [];
        const checkedAt = summary.checkedAt ?? new Date().toISOString();
        const summarySnapshot = {
          ...summary,
          missing: missing.map((entry) => ({ ...entry })),
          checkedAt,
        };
        updateManifestAssetCheckState(
          {
            status,
            missing,
            total: Number.isFinite(summary.total) ? Number(summary.total) : missing.length,
            checkedAt,
            error:
              status === 'error'
                ? {
                    ...(summary.error || {}),
                    reason: summary.reason ?? null,
                    status: summary.responseStatus ?? null,
                  }
                : null,
            summary: summarySnapshot,
          },
          { render: true },
        );
        manifestAssetCheckState.promise = null;
        if (status === 'missing') {
          scope.console?.warn?.('Manifest asset availability check detected missing assets.', summarySnapshot);
        } else if (status === 'error') {
          scope.console?.warn?.('Manifest asset availability check failed.', summarySnapshot);
        } else {
          scope.console?.info?.('Manifest asset availability check completed.', {
            total: summarySnapshot.total,
            reachable: summarySnapshot.reachable,
          });
        }
        return summarySnapshot;
      })
      .catch((error) => {
        manifestAssetCheckState.promise = null;
        const now = new Date().toISOString();
        updateManifestAssetCheckState({
          status: 'error',
          error: { message: error?.message ?? String(error) },
          checkedAt: now,
          summary: {
            status: 'error',
            reason: 'exception',
            missing: [],
            total: 0,
            reachable: 0,
            checkedAt: now,
            manifestUrl: manifestRequestUrl,
          },
        });
        if (scope.console?.warn) {
          scope.console.warn('Manifest asset availability check threw an error.', error);
        }
        return {
          status: 'error',
          reason: 'exception',
          error: { message: error?.message ?? String(error) },
          total: 0,
          reachable: 0,
          missing: [],
          checkedAt: now,
          manifestUrl: manifestRequestUrl,
        };
      });
  }

  function buildManifestAssetCheckReport() {
    const clone = cloneManifestAssetCheckState();
    if (!clone) {
      return null;
    }
    const { pending, ...report } = clone;
    return report;
  }

  function notifyBootDiagnosticsListeners(snapshot) {
    bootDiagnosticsState.listeners.forEach((listener) => {
      if (typeof listener !== 'function') {
        return;
      }
      try {
        listener(snapshot);
      } catch (error) {
        if (globalScope.console?.debug) {
          globalScope.console.debug('Boot diagnostics listener failed.', error);
        }
      }
    });
  }

  function updateBootDiagnosticsPanel(snapshot) {
    const stored = cloneBootDiagnosticsSnapshot(snapshot);
    bootDiagnosticsState.lastSnapshot = stored;
    renderBootDiagnostics(stored);
    notifyBootDiagnosticsListeners(stored);
    return stored;
  }

  function addBootDiagnosticsChangeListener(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    bootDiagnosticsState.listeners.add(listener);
    if (bootDiagnosticsState.lastSnapshot) {
      try {
        listener(cloneBootDiagnosticsSnapshot(bootDiagnosticsState.lastSnapshot));
      } catch (error) {
        if (globalScope.console?.debug) {
          globalScope.console.debug('Boot diagnostics listener dispatch failed.', error);
        }
      }
    }
    return () => {
      bootDiagnosticsState.listeners.delete(listener);
    };
  }

  function bindBootDiagnosticsUi(ui) {
    if (!ui) {
      return;
    }
    if (ui.bootDiagnosticsPanel) {
      bootDiagnosticsState.panel = ui.bootDiagnosticsPanel;
    }
    if (ui.bootDiagnosticsTimestamp) {
      bootDiagnosticsState.timestampEl = ui.bootDiagnosticsTimestamp;
    }
    const sectionRefs = [
      ['engine', ui.bootDiagnosticsEngineSection, ui.bootDiagnosticsEngineList, ui.bootDiagnosticsEngineStatus],
      ['assets', ui.bootDiagnosticsAssetsSection, ui.bootDiagnosticsAssetsList, ui.bootDiagnosticsAssetsStatus],
      ['models', ui.bootDiagnosticsModelsSection, ui.bootDiagnosticsModelsList, ui.bootDiagnosticsModelsStatus],
      ['ui', ui.bootDiagnosticsUiSection, ui.bootDiagnosticsUiList, ui.bootDiagnosticsUiStatus],
    ];
    sectionRefs.forEach(([scope, container, list, status]) => {
      if (!BOOT_DIAGNOSTIC_SCOPES.includes(scope)) {
        return;
      }
      const target = bootDiagnosticsState.sections[scope];
      if (!target) {
        return;
      }
      if (container) {
        target.container = container;
      }
      if (list) {
        target.list = list;
      }
      if (status) {
        target.status = status;
      }
    });
    if (ui.bootDiagnosticsDownloadButton) {
      bootDiagnosticsState.downloadButton = ui.bootDiagnosticsDownloadButton;
      if (!ui.bootDiagnosticsDownloadButton.dataset.bootDiagnosticsBound) {
        ui.bootDiagnosticsDownloadButton.addEventListener('click', (event) => {
          event?.preventDefault?.();
          downloadDiagnosticsReport();
        });
        ui.bootDiagnosticsDownloadButton.dataset.bootDiagnosticsBound = 'true';
      }
    }
    BOOT_DIAGNOSTIC_SCOPES.forEach((scope) => {
      const target = bootDiagnosticsState.sections[scope];
      if (target) {
        setBootDiagnosticsSectionStatus(target, 'pending');
      }
    });
    renderBootDiagnostics();
  }

  function setInert(element, shouldBeInert) {
    if (!element) {
      return;
    }
    if (typeof element.toggleAttribute === 'function') {
      element.toggleAttribute('inert', shouldBeInert);
    } else if (shouldBeInert) {
      element.setAttribute?.('inert', '');
    } else {
      element.removeAttribute?.('inert');
    }
  }

  function focusElementSilently(target) {
    if (!target || typeof target.focus !== 'function') {
      return false;
    }
    try {
      target.focus({ preventScroll: true });
      return true;
    } catch (error) {
      try {
        target.focus();
        return true;
      } catch (nestedError) {
        return false;
      }
    }
  }

  function moveFocusAwayFromElement(element, doc, fallbackFocus) {
    if (!element || !doc) {
      return true;
    }
    const contains = typeof element.contains === 'function' ? element.contains.bind(element) : null;
    if (!contains) {
      return true;
    }
    const active = doc.activeElement || null;
    if (!active || !contains(active)) {
      return true;
    }
    if (fallbackFocus) {
      let handled = false;
      if (typeof fallbackFocus === 'function') {
        try {
          const result = fallbackFocus();
          handled = result !== false;
        } catch (error) {
          handled = false;
        }
      } else {
        handled = focusElementSilently(fallbackFocus);
      }
      if (handled && !contains(doc.activeElement || null)) {
        return true;
      }
    }
    if (doc.body && doc.body !== active && focusElementSilently(doc.body) && !contains(doc.activeElement || null)) {
      return true;
    }
    if (typeof active.blur === 'function') {
      active.blur();
    }
    return !contains(doc.activeElement || null);
  }

  function safelySetAriaHidden(element, hidden, options = {}) {
    if (!element) {
      return false;
    }
    const doc = element.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!hidden) {
      if (options.toggleInert) {
        setInert(element, false);
      }
      if (typeof element.removeAttribute === 'function') {
        element.removeAttribute('aria-hidden');
      }
      return true;
    }
    const fallbackFocus = options.fallbackFocus || null;
    const cleared = moveFocusAwayFromElement(element, doc, fallbackFocus);
    if (!cleared) {
      return false;
    }
    if (options.toggleInert) {
      setInert(element, true);
    }
    if (typeof element.removeAttribute === 'function') {
      element.removeAttribute('aria-hidden');
    }
    return true;
  }

  const COLOR_MODE_STORAGE_KEY = 'infinite-rails-color-mode';
  const colorModeState = {
    preference: 'auto',
    controls: [],
    mediaQuery: null,
    mediaListener: null,
  };

  function normaliseColorMode(value) {
    if (value === 'light' || value === 'dark') {
      return value;
    }
    return 'auto';
  }

  function getBodyElement() {
    if (documentRef?.body) {
      return documentRef.body;
    }
    if (typeof document !== 'undefined' && document.body) {
      return document.body;
    }
    return null;
  }

  function loadStoredColorMode() {
    if (!globalScope?.localStorage) {
      return 'auto';
    }
    try {
      const stored = globalScope.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
      if (!stored) {
        return 'auto';
      }
      return normaliseColorMode(stored);
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Unable to load colour mode preference from storage.', error);
      }
      return 'auto';
    }
  }

  function saveColorMode(preference) {
    if (!globalScope?.localStorage) {
      return;
    }
    try {
      globalScope.localStorage.setItem(COLOR_MODE_STORAGE_KEY, preference);
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Unable to persist colour mode preference.', error);
      }
    }
  }

  function bindColorSchemeListener(onChange) {
    const changeHandler = typeof onChange === 'function' ? onChange : null;
    const attachListener = () => {
      if (!colorModeState.mediaQuery) {
        return;
      }
      const existing = colorModeState.mediaListener;
      if (existing) {
        if (typeof colorModeState.mediaQuery.removeEventListener === 'function') {
          colorModeState.mediaQuery.removeEventListener('change', existing);
        } else if (typeof colorModeState.mediaQuery.removeListener === 'function') {
          colorModeState.mediaQuery.removeListener(existing);
        }
      }
      const listener = (event) => {
        if (changeHandler) {
          changeHandler(event);
        }
      };
      colorModeState.mediaListener = listener;
      if (typeof colorModeState.mediaQuery.addEventListener === 'function') {
        colorModeState.mediaQuery.addEventListener('change', listener);
      } else if (typeof colorModeState.mediaQuery.addListener === 'function') {
        colorModeState.mediaQuery.addListener(listener);
      }
    };

    if (!colorModeState.mediaQuery) {
      if (typeof globalScope?.matchMedia !== 'function') {
        return;
      }
      try {
        colorModeState.mediaQuery = globalScope.matchMedia('(prefers-color-scheme: dark)');
      } catch (error) {
        colorModeState.mediaQuery = null;
        if (globalScope.console?.debug) {
          globalScope.console.debug('Unable to create prefers-color-scheme media query.', error);
        }
      }
    }

    if (!colorModeState.mediaQuery) {
      return;
    }

    attachListener();
  }

  function resolveEffectiveColorMode(preference) {
    if (preference !== 'auto') {
      return preference;
    }
    const query = colorModeState.mediaQuery;
    if (query) {
      return query.matches ? 'dark' : 'light';
    }
    return 'dark';
  }

  function updateColorModeControls() {
    const { controls, preference } = colorModeState;
    if (!controls || !controls.length) {
      return;
    }
    controls.forEach((input) => {
      if (!input) {
        return;
      }
      input.checked = input.value === preference;
    });
  }

  function applyColorMode(preference, { syncStorage = true } = {}) {
    const normalised = normaliseColorMode(preference);
    colorModeState.preference = normalised;
    if (normalised === 'auto') {
      bindColorSchemeListener((event) => {
        if (colorModeState.preference === 'auto') {
          applyColorMode('auto', { syncStorage: false, reason: 'media-change', event });
        }
      });
    }
    const body = getBodyElement();
    if (body) {
      body.setAttribute('data-color-mode-preference', normalised);
      const effective = resolveEffectiveColorMode(normalised);
      body.setAttribute('data-color-mode', effective);
    }
    updateColorModeControls();
    if (syncStorage) {
      saveColorMode(normalised);
    }
  }

  function initColorModeControls() {
    const body = getBodyElement();
    if (body) {
      const storedPreference = loadStoredColorMode();
      applyColorMode(storedPreference, { syncStorage: false });
    }
    if (!documentRef) {
      return;
    }
    const inputs = Array.from(documentRef.querySelectorAll('input[name="colorMode"]'));
    colorModeState.controls = inputs;
    if (!inputs.length) {
      return;
    }
    inputs.forEach((input) => {
      if (!input) {
        return;
      }
      input.checked = input.value === colorModeState.preference;
      input.addEventListener('change', (event) => {
        if (!event?.target?.value) {
          return;
        }
        applyColorMode(event.target.value);
      });
    });
  }

  const CAPTION_STORAGE_KEY = 'infinite-rails-subtitles-enabled';
  const captionState = {
    enabled: false,
    overlay: null,
    overlayText: null,
    srRegion: null,
    hideTimer: null,
  };

  function loadCaptionPreference() {
    if (!globalScope?.localStorage) {
      return false;
    }
    try {
      const stored = globalScope.localStorage.getItem(CAPTION_STORAGE_KEY);
      return stored === '1' || stored === 'true';
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Unable to load subtitle preference from storage.', error);
      }
      return false;
    }
  }

  function saveCaptionPreference(enabled) {
    if (!globalScope?.localStorage) {
      return;
    }
    try {
      globalScope.localStorage.setItem(CAPTION_STORAGE_KEY, enabled ? '1' : '0');
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Unable to persist subtitle preference.', error);
      }
    }
  }

  function ensureCaptionElements() {
    if (!documentRef) {
      return;
    }
    if (!captionState.overlay) {
      captionState.overlay = documentRef.getElementById('captionOverlay');
    }
    if (!captionState.overlayText && captionState.overlay) {
      captionState.overlayText = documentRef.getElementById('captionOverlayText');
    }
    if (!captionState.srRegion) {
      captionState.srRegion = documentRef.getElementById('captionLiveRegion');
    }
    if (captionState.overlay) {
      captionState.overlay.setAttribute('data-state', 'hidden');
      setInert(captionState.overlay, true);
    }
  }

  function hideCaptionOverlay() {
    if (captionState.hideTimer && typeof globalScope.clearTimeout === 'function') {
      globalScope.clearTimeout(captionState.hideTimer);
      captionState.hideTimer = null;
    }
    if (captionState.overlay) {
      captionState.overlay.setAttribute('data-state', 'hidden');
      setInert(captionState.overlay, true);
      captionState.overlay.hidden = !captionState.enabled;
    }
    if (captionState.overlayText) {
      captionState.overlayText.textContent = '';
    }
  }

  function applyCaptionPreference(enabled, { syncStorage = true } = {}) {
    captionState.enabled = Boolean(enabled);
    ensureCaptionElements();
    if (captionState.overlay) {
      if (captionState.enabled) {
        captionState.overlay.hidden = false;
        setInert(captionState.overlay, true);
        captionState.overlay.setAttribute('data-state', 'hidden');
      } else {
        hideCaptionOverlay();
      }
    }
    if (syncStorage) {
      saveCaptionPreference(captionState.enabled);
    }
    const toggle = documentRef?.getElementById('subtitleToggle');
    if (toggle) {
      toggle.checked = captionState.enabled;
    }
  }

  function showCaptionOverlay(text) {
    ensureCaptionElements();
    if (!captionState.overlay || !captionState.overlayText || !captionState.enabled) {
      return;
    }
    captionState.overlayText.textContent = text;
    captionState.overlay.hidden = false;
    captionState.overlay.setAttribute('data-state', 'visible');
    setInert(captionState.overlay, false);
    if (captionState.hideTimer && typeof globalScope.clearTimeout === 'function') {
      globalScope.clearTimeout(captionState.hideTimer);
    }
    captionState.hideTimer = globalScope.setTimeout(() => {
      captionState.hideTimer = null;
      if (captionState.overlay) {
        captionState.overlay.setAttribute('data-state', 'hidden');
        setInert(captionState.overlay, true);
      }
    }, 5200);
  }

  function handleAudioCaptionEvent(event) {
    const detail = event?.detail || {};
    const caption = typeof detail.caption === 'string' ? detail.caption.trim() : '';
    if (!caption) {
      return;
    }
    ensureCaptionElements();
    if (captionState.srRegion) {
      captionState.srRegion.textContent = caption;
    }
    showCaptionOverlay(caption);
  }

  function initCaptionControls() {
    ensureCaptionElements();
    const toggle = documentRef?.getElementById('subtitleToggle');
    if (toggle) {
      toggle.addEventListener('change', (event) => {
        applyCaptionPreference(Boolean(event?.target?.checked));
      });
    }
    if (typeof globalScope?.addEventListener === 'function') {
      globalScope.addEventListener('infinite-rails:audio-caption', handleAudioCaptionEvent);
    }
    const initial = loadCaptionPreference();
    applyCaptionPreference(initial, { syncStorage: false });
  }

  initColorModeControls();
  initCaptionControls();

  const configWarningDeduper = new Set();

  function logConfigWarning(message, context = {}) {
    const consoleRef = typeof console !== 'undefined' ? console : globalScope.console;
    if (!consoleRef) {
      return;
    }
    const sortedKeys = Object.keys(context).sort();
    const dedupeKey = `${message}|${sortedKeys.map((key) => `${key}:${context[key]}`).join(',')}`;
    if (configWarningDeduper.has(dedupeKey)) {
      return;
    }
    configWarningDeduper.add(dedupeKey);
    if (typeof consoleRef.warn === 'function') {
      consoleRef.warn(message, context);
    } else if (typeof consoleRef.error === 'function') {
      consoleRef.error(message, context);
    } else if (typeof consoleRef.log === 'function') {
      if (typeof consoleRef.error === 'function') {
        consoleRef.error(message, context);
      } else {
        consoleRef.log(message, context);
      }
    }
  }

  const bootstrapOverlay = (() => {
    const state = { mode: 'idle', visible: false };
    const diagnosticsState = {
      renderer: { status: 'pending', message: 'Initialising renderer…' },
      assets: { status: 'pending', message: 'Streaming core assets…' },
      audio: { status: 'pending', message: 'Initialising audio engine…' },
      backend: { status: 'pending', message: 'Checking leaderboard service…' },
    };
    const DIAGNOSTIC_TYPES = Object.keys(diagnosticsState);
    const diagnosticsLogState = {
      entries: [],
      limit: 60,
      counter: 0,
    };
    const recoveryActionState = { cleanup: null };
    const diagnosticActionState = { options: new Map() };

    function getDocument() {
      if (documentRef) {
        return documentRef;
      }
      if (typeof document !== 'undefined') {
        return document;
      }
      return globalScope?.document ?? null;
    }

    function getElements(doc) {
      if (!doc || typeof doc.getElementById !== 'function') {
        return null;
      }
      const overlay = doc.getElementById('globalOverlay');
      if (!overlay) {
        return null;
      }
      const diagnosticsRoot = doc.getElementById('globalOverlayDiagnostics');
      const logContainer = doc.getElementById('globalOverlayLog');
      const logList = doc.getElementById('globalOverlayLogList');
      const logEmpty = doc.getElementById('globalOverlayLogEmpty');
      const supportLink = doc.getElementById('globalOverlaySupportLink');
      const downloadButton = doc.getElementById('globalOverlayDownloadLogs');
      const diagnosticItems = DIAGNOSTIC_TYPES.reduce((acc, type) => {
        const container = diagnosticsRoot?.querySelector(`[data-diagnostic="${type}"]`) ?? null;
        const statusEl = doc.getElementById(
          `globalOverlay${type.charAt(0).toUpperCase()}${type.slice(1)}Status`,
        );
        const actionButton = container?.querySelector('[data-diagnostic-action]') ?? null;
        acc[type] = { container, statusEl, actionButton };
        return acc;
      }, {});
      const refs = {
        overlay,
        dialog: doc.getElementById('globalOverlayDialog'),
        spinner: doc.getElementById('globalOverlaySpinner'),
        title: doc.getElementById('globalOverlayTitle'),
        message: doc.getElementById('globalOverlayMessage'),
        diagnosticsRoot,
        diagnosticItems,
        logContainer,
        logList,
        logEmpty,
        supportLink,
        downloadButton,
        actions: doc.getElementById('globalOverlayActions'),
        recoveryButton: doc.getElementById('globalOverlayRecoveryButton'),
      };
      bindDiagnosticActionHandlers(refs);
      return refs;
    }

    function cancelFallbackTimer() {
      const scope =
        typeof globalScope !== 'undefined'
          ? globalScope
          : typeof window !== 'undefined'
            ? window
            : globalThis;
      const fallback = scope?.__infiniteRailsBootstrapFallback;
      if (fallback?.timer && typeof scope.clearTimeout === 'function') {
        scope.clearTimeout(fallback.timer);
        fallback.timer = null;
      }
    }

    function removeBasicFallback(doc) {
      if (!doc || typeof doc.getElementById !== 'function') {
        return;
      }
      const basicFallback = doc.getElementById('bootstrapFallbackMessage');
      if (basicFallback?.parentNode) {
        basicFallback.parentNode.removeChild(basicFallback);
      }
    }

    function handleDiagnosticActionClick(type, event) {
      const action = diagnosticActionState.options.get(type);
      if (!action) {
        return;
      }
      if (event?.preventDefault) {
        event.preventDefault();
      }
      if (typeof action.onSelect === 'function') {
        const context = {
          type,
          detail: action.detail ?? null,
          source: action.source || 'diagnostics',
          label: action.label,
          action: action.action ?? null,
        };
        action.onSelect(event, context);
      }
    }

    function bindDiagnosticActionHandlers(refs) {
      if (!refs?.diagnosticItems) {
        return;
      }
      DIAGNOSTIC_TYPES.forEach((type) => {
        const button = refs.diagnosticItems?.[type]?.actionButton || null;
        if (!button || button.dataset.diagnosticActionBound === 'true') {
          return;
        }
        button.addEventListener('click', (event) => {
          handleDiagnosticActionClick(type, event);
        });
        button.dataset.diagnosticActionBound = 'true';
      });
    }

    function shouldDisplayDiagnosticAction(action, status) {
      if (!action) {
        return false;
      }
      const statuses = Array.isArray(action.statuses) && action.statuses.length
        ? action.statuses
        : ['error'];
      if (!status) {
        return false;
      }
      return statuses.includes(status);
    }

    function applyDiagnosticActionState(button, action, status) {
      if (!button) {
        return;
      }
      if (!shouldDisplayDiagnosticAction(action, status)) {
        button.hidden = true;
        button.setAttribute('hidden', '');
        button.disabled = false;
        button.removeAttribute('aria-label');
        button.removeAttribute('title');
        return;
      }
      const label = action.label || 'Reload assets';
      button.hidden = false;
      button.removeAttribute('hidden');
      button.disabled = action.disabled === true;
      if (button.textContent !== label) {
        button.textContent = label;
      }
      if (typeof action.action === 'string' && action.action.trim().length) {
        button.dataset.diagnosticAction = action.action.trim();
      } else {
        button.removeAttribute('data-diagnostic-action');
      }
      if (typeof action.ariaLabel === 'string' && action.ariaLabel.trim().length) {
        button.setAttribute('aria-label', action.ariaLabel.trim());
      } else if (typeof action.description === 'string' && action.description.trim().length) {
        button.setAttribute('aria-label', `${label}. ${action.description.trim()}`);
      } else {
        button.removeAttribute('aria-label');
      }
      if (typeof action.description === 'string' && action.description.trim().length) {
        button.title = action.description.trim();
      } else {
        button.removeAttribute('title');
      }
    }

    function updateDiagnosticsElements(elements = null) {
      const doc = elements ? null : getDocument();
      const refs = elements || getElements(doc);
      if (!refs?.diagnosticsRoot) {
        return;
      }
      bindDiagnosticActionHandlers(refs);
      DIAGNOSTIC_TYPES.forEach((type) => {
        const current = diagnosticsState[type] || {};
        const container = refs.diagnosticItems?.[type]?.container || null;
        const statusEl = refs.diagnosticItems?.[type]?.statusEl || null;
        const statusValue =
          typeof current.status === 'string' && current.status.trim().length
            ? current.status.trim().toLowerCase()
            : 'pending';
        if (container) {
          container.setAttribute('data-status', statusValue);
        }
        if (statusEl) {
          statusEl.textContent = current.message || '';
        }
        const actionButton = refs.diagnosticItems?.[type]?.actionButton || null;
        const action = diagnosticActionState.options.get(type) || null;
        applyDiagnosticActionState(actionButton, action, statusValue);
      });
    }

    function normaliseLogScope(scope) {
      if (typeof scope === 'string' && scope.trim().length) {
        return scope.trim().toLowerCase();
      }
      return 'general';
    }

    function normaliseLogLevel(level) {
      if (typeof level !== 'string') {
        return 'info';
      }
      const trimmed = level.trim().toLowerCase();
      if (trimmed === 'warning' || trimmed === 'error' || trimmed === 'success') {
        return trimmed;
      }
      return 'info';
    }

    function formatLogScopeLabel(scope) {
      const value = typeof scope === 'string' ? scope.trim() : '';
      if (!value) {
        return 'General';
      }
      const cleaned = value.replace(/[-_]+/g, ' ');
      return cleaned.replace(/\b([a-z])/gi, (match) => match.toUpperCase());
    }

    function formatLogTimestamp(timestamp) {
      const time = Number.isFinite(timestamp) ? timestamp : Date.now();
      const date = new Date(time);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
      return `${hours}:${minutes}:${seconds}.${milliseconds}`;
    }

    function sanitiseLogDetail(detail) {
      if (!detail || typeof detail !== 'object') {
        return null;
      }
      try {
        return JSON.parse(JSON.stringify(detail));
      } catch (error) {
        const fallback = {};
        Object.keys(detail).forEach((key) => {
          const value = detail[key];
          if (typeof value === 'undefined') {
            return;
          }
          if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            fallback[key] = value;
            return;
          }
          if (value instanceof Date) {
            fallback[key] = value.toISOString();
            return;
          }
          try {
            fallback[key] = JSON.parse(JSON.stringify(value));
          } catch (nestedError) {
            if (typeof value?.toString === 'function') {
              fallback[key] = value.toString();
            }
          }
        });
        return Object.keys(fallback).length ? fallback : null;
      }
    }

    function updateLogElements(elements = null) {
      const doc = elements ? null : getDocument();
      const refs = elements || getElements(doc);
      if (!refs?.logList || !refs.logContainer) {
        return;
      }
      const logList = refs.logList;
      const entries = diagnosticsLogState.entries;
      while (logList.firstChild) {
        logList.removeChild(logList.firstChild);
      }
      const targetDoc = logList.ownerDocument || doc;
      if (!targetDoc) {
        return;
      }
      entries.forEach((entry) => {
        const item = targetDoc.createElement('li');
        item.className = 'compose-overlay__log-item';
        item.dataset.level = entry.level;
        item.dataset.scope = entry.scope;
        const timeEl = targetDoc.createElement('span');
        timeEl.className = 'compose-overlay__log-time';
        timeEl.textContent = formatLogTimestamp(entry.timestamp);
        const scopeEl = targetDoc.createElement('span');
        scopeEl.className = 'compose-overlay__log-scope';
        scopeEl.textContent = formatLogScopeLabel(entry.scope);
        const messageEl = targetDoc.createElement('span');
        messageEl.className = 'compose-overlay__log-message';
        messageEl.textContent = entry.message;
        item.appendChild(timeEl);
        item.appendChild(scopeEl);
        item.appendChild(messageEl);
        if (entry.detail) {
          try {
            item.dataset.detail = JSON.stringify(entry.detail);
          } catch (error) {
            item.dataset.detail = '';
          }
        } else {
          item.removeAttribute('data-detail');
        }
        logList.appendChild(item);
      });
      if (refs.logEmpty) {
        refs.logEmpty.hidden = entries.length > 0;
      }
      refs.logContainer.dataset.populated = entries.length ? 'true' : 'false';
      if (entries.length) {
        refs.logContainer.scrollTop = refs.logContainer.scrollHeight;
      }
    }

    function appendLogEntry(entry = {}) {
      if (typeof entry.message !== 'string' || !entry.message.trim().length) {
        return null;
      }
      const scope = normaliseLogScope(entry.scope);
      const level = normaliseLogLevel(entry.level);
      const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
      diagnosticsLogState.counter += 1;
      const normalised = {
        id: `log-${timestamp}-${diagnosticsLogState.counter}`,
        scope,
        level,
        message: entry.message.trim(),
        timestamp,
        detail: sanitiseLogDetail(entry.detail),
      };
      diagnosticsLogState.entries.push(normalised);
      if (diagnosticsLogState.entries.length > diagnosticsLogState.limit) {
        diagnosticsLogState.entries.splice(0, diagnosticsLogState.entries.length - diagnosticsLogState.limit);
      }
      updateLogElements();
      return normalised;
    }

    function clearLogEntries() {
      diagnosticsLogState.entries.splice(0, diagnosticsLogState.entries.length);
      updateLogElements();
    }

    function applyRecoveryAction(options = null, elements = null) {
      const doc = elements ? null : getDocument();
      const refs = elements || getElements(doc);
      if (!refs?.actions || !refs?.recoveryButton) {
        return;
      }
      const { actions: actionsContainer, recoveryButton } = refs;
      if (recoveryActionState.cleanup) {
        try {
          recoveryActionState.cleanup();
        } catch (cleanupError) {
          if (globalScope?.console?.debug) {
            globalScope.console.debug('Failed to clean up recovery action listener.', cleanupError);
          }
        }
        recoveryActionState.cleanup = null;
      }
      recoveryButton.disabled = false;
      recoveryButton.removeAttribute('aria-label');
      recoveryButton.removeAttribute('data-recovery-action');
      if (!options || typeof options.label !== 'string' || !options.label.trim().length) {
        actionsContainer.setAttribute('hidden', '');
        actionsContainer.hidden = true;
        recoveryButton.setAttribute('hidden', '');
        recoveryButton.hidden = true;
        return;
      }
      const label = options.label.trim();
      actionsContainer.hidden = false;
      actionsContainer.removeAttribute('hidden');
      recoveryButton.hidden = false;
      recoveryButton.removeAttribute('hidden');
      recoveryButton.textContent = label;
      if (typeof options.ariaLabel === 'string' && options.ariaLabel.trim().length) {
        recoveryButton.setAttribute('aria-label', options.ariaLabel.trim());
      } else if (typeof options.description === 'string' && options.description.trim().length) {
        recoveryButton.setAttribute('aria-label', `${label}. ${options.description.trim()}`);
      }
      if (typeof options.action === 'string' && options.action.trim().length) {
        recoveryButton.dataset.recoveryAction = options.action.trim();
      }
      const hasHandler = typeof options.onSelect === 'function';
      recoveryButton.disabled = !hasHandler;
      if (!hasHandler) {
        return;
      }
      const handler = (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        options.onSelect(event);
      };
      recoveryButton.addEventListener('click', handler);
      recoveryActionState.cleanup = () => {
        recoveryButton.removeEventListener('click', handler);
      };
    }

    function setDiagnosticActionForType(type, options = null) {
      if (!type || !DIAGNOSTIC_TYPES.includes(type)) {
        return;
      }
      if (!options || typeof options.label !== 'string' || !options.label.trim().length) {
        if (diagnosticActionState.options.delete(type)) {
          updateDiagnosticsElements();
        }
        return;
      }
      const label = options.label.trim();
      const statuses = Array.isArray(options.statuses) && options.statuses.length
        ? options.statuses
            .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
            .filter(Boolean)
        : ['error'];
      const entry = {
        label,
        description:
          typeof options.description === 'string' && options.description.trim().length
            ? options.description.trim()
            : null,
        action:
          typeof options.action === 'string' && options.action.trim().length
            ? options.action.trim()
            : null,
        ariaLabel:
          typeof options.ariaLabel === 'string' && options.ariaLabel.trim().length
            ? options.ariaLabel.trim()
            : null,
        statuses,
        detail: options.detail ?? null,
        source:
          typeof options.source === 'string' && options.source.trim().length
            ? options.source.trim()
            : 'diagnostics',
        onSelect: typeof options.onSelect === 'function' ? options.onSelect : null,
        disabled: options.disabled === true,
      };
      diagnosticActionState.options.set(type, entry);
      updateDiagnosticsElements();
    }

    function clearDiagnosticActionForType(type = null) {
      if (type && !DIAGNOSTIC_TYPES.includes(type)) {
        return;
      }
      if (type) {
        if (diagnosticActionState.options.delete(type)) {
          updateDiagnosticsElements();
        }
        return;
      }
      if (diagnosticActionState.options.size) {
        diagnosticActionState.options.clear();
        updateDiagnosticsElements();
      }
    }

    function setDiagnostic(type, update = {}) {
      if (!type || !DIAGNOSTIC_TYPES.includes(type)) {
        return diagnosticsState;
      }
      const existing = diagnosticsState[type] || {};
      const existingStatus =
        typeof existing.status === 'string' && existing.status.trim().length
          ? existing.status.trim().toLowerCase()
          : 'pending';
      const next = {
        status:
          typeof update.status === 'string' && update.status.trim().length
            ? update.status.trim().toLowerCase()
            : existingStatus,
        message:
          typeof update.message === 'string' && update.message.trim().length
            ? update.message.trim()
            : existing.message,
      };
      const nextStatus = next.status || 'pending';
      const action = diagnosticActionState.options.get(type) || null;
      if (action && !shouldDisplayDiagnosticAction(action, nextStatus)) {
        diagnosticActionState.options.delete(type);
      }
      diagnosticsState[type] = next;
      updateDiagnosticsElements();
      return next;
    }

    function show(mode, options = {}) {
      const doc = getDocument();
      const elements = getElements(doc);
      if (!elements) {
        return;
      }
      cancelFallbackTimer();
      removeBasicFallback(doc);
      const { overlay, dialog, spinner, title, message } = elements;
      overlay.hidden = false;
      overlay.removeAttribute('hidden');
      setInert(overlay, false);
      overlay.setAttribute('data-mode', mode === 'error' ? 'error' : 'loading');
      if (dialog) {
        if (mode === 'loading') {
          dialog.setAttribute('aria-busy', 'true');
        } else {
          dialog.removeAttribute('aria-busy');
        }
      }
      if (spinner) {
        if (mode === 'loading') {
          spinner.removeAttribute('aria-hidden');
        } else {
          spinner.setAttribute('aria-hidden', 'true');
        }
      }
      if (title && typeof options.title === 'string') {
        title.textContent = options.title;
      }
      if (message && typeof options.message === 'string') {
        message.textContent = options.message;
      }
      updateDiagnosticsElements(elements);
      updateLogElements(elements);
      applyRecoveryAction(null, elements);
      state.mode = mode;
      state.visible = true;
    }

    function hide({ force = false } = {}) {
      if (state.mode === 'error' && !force) {
        return;
      }
      const doc = getDocument();
      const elements = getElements(doc);
      if (!elements) {
        return;
      }
      cancelFallbackTimer();
      removeBasicFallback(doc);
      const { overlay, dialog, spinner } = elements;
      setInert(overlay, true);
      overlay.setAttribute('data-mode', 'idle');
      overlay.setAttribute('hidden', '');
      overlay.hidden = true;
      if (dialog) {
        dialog.removeAttribute('aria-busy');
      }
      if (spinner) {
        spinner.setAttribute('aria-hidden', 'true');
      }
      applyRecoveryAction(null, elements);
      state.mode = 'idle';
      state.visible = false;
    }

    return {
      showLoading(options = {}) {
        const defaults = {
          title: 'Preparing experience…',
          message: 'Loading world assets. Diagnostics will update below if anything stalls.',
        };
        show('loading', { ...defaults, ...options });
      },
      showError(options = {}) {
        const defaults = {
          title: 'Renderer unavailable',
          message: 'Unable to load the experience. Review the diagnostics below or download logs for support.',
        };
        show('error', { ...defaults, ...options });
      },
      hide,
      get state() {
        return { ...state };
      },
      setDiagnostic,
      setDiagnosticAction(type, options = null) {
        setDiagnosticActionForType(type, options);
      },
      clearDiagnosticAction(type = null) {
        clearDiagnosticActionForType(type);
      },
      setRecoveryAction(options = null) {
        applyRecoveryAction(options);
      },
      clearRecoveryAction() {
        applyRecoveryAction(null);
      },
      refreshDiagnostics() {
        updateDiagnosticsElements();
        updateLogElements();
      },
      get diagnostics() {
        return { ...diagnosticsState };
      },
      logEvent(scope, message, options = {}) {
        const entry = appendLogEntry({
          scope,
          message,
          level: options.level,
          detail: options.detail,
          timestamp: options.timestamp,
        });
        if (entry && typeof centralLogStore?.record === 'function') {
          centralLogStore.record({
            category: scope,
            scope,
            level: entry.level,
            message: entry.message,
            detail: entry.detail,
            origin: 'diagnostics-overlay',
            timestamp: entry.timestamp,
          });
        }
      },
      clearLog() {
        clearLogEntries();
      },
      getLogEntries() {
        return diagnosticsLogState.entries.map((entry) => ({
          scope: entry.scope,
          level: entry.level,
          message: entry.message,
          timestamp: entry.timestamp,
          detail: entry.detail ?? null,
        }));
      },
      get logEntries() {
        return this.getLogEntries();
      },
    };
  })();

  const assetLoadingIndicatorState = {
    active: new Map(),
    overlayActive: false,
    suppressed: false,
  };

  function suppressAssetLoadingIndicatorOverlay() {
    if (assetLoadingIndicatorState.suppressed) {
      return;
    }
    assetLoadingIndicatorState.suppressed = true;
    assetLoadingIndicatorState.active.clear();
    assetLoadingIndicatorState.overlayActive = false;
    if (
      typeof bootstrapOverlay !== 'undefined' &&
      bootstrapOverlay.state?.mode === 'loading'
    ) {
      bootstrapOverlay.hide({ force: true });
    }
  }

  function normaliseAssetIndicatorKey(value) {
    if (typeof value === 'string' && value.trim().length) {
      return value.trim().toLowerCase();
    }
    if (Number.isFinite(value)) {
      return String(value);
    }
    return 'asset';
  }

  function normaliseAssetIndicatorKind(value) {
    if (typeof value === 'string' && value.trim().length) {
      return value.trim().toLowerCase();
    }
    return 'asset';
  }

  function buildAssetIndicatorToken(kind, key) {
    return `${normaliseAssetIndicatorKind(kind)}:${normaliseAssetIndicatorKey(key)}`;
  }

  function updateAssetLoadingIndicatorOverlay() {
    if (typeof bootstrapOverlay === 'undefined') {
      return;
    }
    if (assetLoadingIndicatorState.suppressed) {
      if (assetLoadingIndicatorState.overlayActive && bootstrapOverlay.state?.mode === 'loading') {
        bootstrapOverlay.hide({ force: true });
      }
      assetLoadingIndicatorState.overlayActive = false;
      return;
    }
    const entries = Array.from(assetLoadingIndicatorState.active.values());
    if (!entries.length) {
      if (assetLoadingIndicatorState.overlayActive && bootstrapOverlay.state?.mode === 'loading') {
        bootstrapOverlay.hide();
      }
      assetLoadingIndicatorState.overlayActive = false;
      return;
    }
    if (bootstrapOverlay.state?.mode === 'error') {
      assetLoadingIndicatorState.overlayActive = false;
      return;
    }
    const primary = entries[0];
    const additional = entries.length - 1;
    let message = primary.message || 'Loading assets — this may take a moment.';
    if (additional > 0) {
      message += ` (${additional} more ${additional === 1 ? 'asset stream' : 'asset streams'} waiting.)`;
    }
    const title = primary.title || 'Loading assets…';
    bootstrapOverlay.showLoading({
      title,
      message,
    });
    assetLoadingIndicatorState.overlayActive = true;
  }

  function registerAssetLoadingIndicator(detail = {}) {
    if (assetLoadingIndicatorState.suppressed) {
      return;
    }
    const kind = normaliseAssetIndicatorKind(detail.kind ?? detail.assetKind);
    const key = normaliseAssetIndicatorKey(detail.key ?? detail.originalKey);
    const token = `${kind}:${key}`;
    const rawLabel =
      typeof detail.label === 'string' && detail.label.trim().length
        ? detail.label.trim()
        : key !== 'asset'
          ? `${kind} ${key}`
          : 'assets';
    const title =
      typeof detail.title === 'string' && detail.title.trim().length
        ? detail.title.trim()
        : `Loading ${rawLabel}`;
    const message =
      typeof detail.message === 'string' && detail.message.trim().length
        ? detail.message.trim()
        : `Loading ${rawLabel} — this may take a moment.`;
    assetLoadingIndicatorState.active.set(token, {
      key,
      kind,
      title,
      message,
    });
    updateAssetLoadingIndicatorOverlay();
  }

  function clearAssetLoadingIndicator(kind, key) {
    if (assetLoadingIndicatorState.suppressed) {
      return;
    }
    const token = buildAssetIndicatorToken(kind, key);
    if (!assetLoadingIndicatorState.active.delete(token)) {
      return;
    }
    if (!assetLoadingIndicatorState.active.size) {
      if (assetLoadingIndicatorState.overlayActive && bootstrapOverlay.state?.mode === 'loading') {
        bootstrapOverlay.hide();
      }
      assetLoadingIndicatorState.overlayActive = false;
      return;
    }
    updateAssetLoadingIndicatorOverlay();
  }

  function clearAssetLoadingIndicatorByKey(key) {
    if (assetLoadingIndicatorState.suppressed) {
      return;
    }
    const normalisedKey = normaliseAssetIndicatorKey(key);
    const tokens = [];
    assetLoadingIndicatorState.active.forEach((entry, token) => {
      if (entry.key === normalisedKey) {
        tokens.push(token);
      }
    });
    if (!tokens.length) {
      return;
    }
    tokens.forEach((token) => {
      assetLoadingIndicatorState.active.delete(token);
    });
    if (!assetLoadingIndicatorState.active.size) {
      if (assetLoadingIndicatorState.overlayActive && bootstrapOverlay.state?.mode === 'loading') {
        bootstrapOverlay.hide();
      }
      assetLoadingIndicatorState.overlayActive = false;
      return;
    }
    updateAssetLoadingIndicatorOverlay();
  }

  bootstrapOverlay.showLoading();

  function shouldSendDiagnosticsToServer(entry) {
    if (!diagnosticsEndpoint) {
      return false;
    }
    const level = typeof entry?.level === 'string' ? entry.level.toLowerCase() : '';
    return level === 'error' || level === 'critical' || level === 'fatal';
  }

  function sendDiagnosticsEventToServer(entry) {
    if (!shouldSendDiagnosticsToServer(entry)) {
      return;
    }
    const scope = typeof globalScope !== 'undefined' ? globalScope : globalThis;
    const timestamp = Number.isFinite(entry?.timestamp) ? entry.timestamp : Date.now();
    const payload = {
      scope: entry?.scope ?? null,
      message: entry?.message ?? null,
      level: entry?.level ?? 'info',
      detail: entry?.detail ?? null,
      timestamp,
      rendererMode: scope?.InfiniteRails?.rendererMode ?? null,
    };
    let body;
    try {
      body = JSON.stringify(payload);
    } catch (error) {
      scope?.console?.debug?.('Unable to serialise diagnostics payload for analytics endpoint.', error);
      return;
    }
    const navigatorRef = scope?.navigator ?? null;
    if (typeof navigatorRef?.sendBeacon === 'function') {
      try {
        const delivered = navigatorRef.sendBeacon(diagnosticsEndpoint, body);
        if (delivered) {
          return;
        }
      } catch (error) {
        scope?.console?.debug?.('Diagnostics beacon sendBeacon failed', error);
      }
    }
    const fetchFn =
      typeof scope?.fetch === 'function'
        ? scope.fetch.bind(scope)
        : typeof fetch === 'function'
          ? fetch
          : null;
    if (fetchFn) {
      fetchFn(diagnosticsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch((error) => {
        scope?.console?.debug?.('Diagnostics beacon fetch failed', error);
      });
    }
  }

  const CRITICAL_ERROR_SCOPE_TITLES = Object.freeze({
    assets: 'Asset load failure',
    asset: 'Asset load failure',
    api: 'Network error detected',
    backend: 'Service unavailable',
    render: 'Renderer unavailable',
    renderer: 'Renderer unavailable',
    script: 'Script error detected',
    ui: 'Interface error detected',
    interface: 'Interface error detected',
    runtime: 'Runtime error detected',
    startup: 'Startup error detected',
    diagnostics: 'Diagnostics alert',
    audio: 'Audio playback error',
  });

  const CRITICAL_ERROR_OVERLAY_COOLDOWN_MS = 2000;

  const criticalErrorOverlayState = {
    lastFingerprint: null,
    lastDisplayedAt: 0,
  };

  function shouldMirrorCriticalError(level) {
    if (typeof level !== 'string') {
      return false;
    }
    const normalised = level.trim().toLowerCase();
    return normalised === 'error' || normalised === 'critical' || normalised === 'fatal';
  }

  function resolveCriticalOverlayTitle(scope) {
    const key = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
    if (key && CRITICAL_ERROR_SCOPE_TITLES[key]) {
      return CRITICAL_ERROR_SCOPE_TITLES[key];
    }
    if (key.includes('asset')) {
      return CRITICAL_ERROR_SCOPE_TITLES.assets;
    }
    if (key.includes('render')) {
      return CRITICAL_ERROR_SCOPE_TITLES.render;
    }
    if (key.includes('audio')) {
      return CRITICAL_ERROR_SCOPE_TITLES.audio;
    }
    if (key.includes('api') || key.includes('network')) {
      return CRITICAL_ERROR_SCOPE_TITLES.api;
    }
    return 'System alert';
  }

  function mirrorCriticalErrorToOverlay(scope, message, options = {}) {
    if (typeof presentCriticalErrorOverlay !== 'function') {
      return;
    }
    const level = typeof options.level === 'string' ? options.level.trim().toLowerCase() : 'error';
    if (!shouldMirrorCriticalError(level)) {
      return;
    }
    const trimmedMessage =
      typeof message === 'string' && message.trim().length ? message.trim() : 'An unexpected error occurred.';
    const scopeLabel = typeof scope === 'string' && scope.trim().length ? scope.trim() : 'general';
    const fingerprint = `${scopeLabel.toLowerCase()}::${trimmedMessage}`;
    const now = Date.now();
    if (
      criticalErrorOverlayState.lastFingerprint === fingerprint &&
      now - criticalErrorOverlayState.lastDisplayedAt < CRITICAL_ERROR_OVERLAY_COOLDOWN_MS
    ) {
      return;
    }
    criticalErrorOverlayState.lastFingerprint = fingerprint;
    criticalErrorOverlayState.lastDisplayedAt = now;
    const detail =
      options.detail && typeof options.detail === 'object' ? { ...options.detail } : options.detail ?? null;
    const timestamp = Number.isFinite(options.timestamp) ? options.timestamp : null;
    presentCriticalErrorOverlay({
      title: resolveCriticalOverlayTitle(scopeLabel),
      message: trimmedMessage,
      diagnosticScope: scopeLabel,
      diagnosticStatus: 'error',
      diagnosticMessage: trimmedMessage,
      logScope: null,
      logMessage: trimmedMessage,
      logLevel: level || 'error',
      detail,
      timestamp,
      logToConsole: false,
    });
  }

  function logDiagnosticsEvent(scope, message, { level = 'info', detail = null, timestamp = null } = {}) {
    const payload = {};
    if (typeof level === 'string') {
      payload.level = level;
    }
    if (detail && typeof detail === 'object') {
      payload.detail = { ...detail };
    }
    if (Number.isFinite(timestamp)) {
      payload.timestamp = timestamp;
    }
    const entry = {
      scope,
      message,
      level: payload.level || 'info',
      detail: payload.detail ?? null,
      timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now(),
    };
    mirrorCriticalErrorToOverlay(scope, message, {
      level: entry.level,
      detail: entry.detail,
      timestamp: entry.timestamp,
    });
    if (bootstrapOverlay && typeof bootstrapOverlay.logEvent === 'function') {
      bootstrapOverlay.logEvent(scope, message, payload);
    }
    sendDiagnosticsEventToServer(entry);
  }

  function logThroughDiagnostics(scope, message, options = {}) {
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent(scope, message, options);
      return;
    }
    if (typeof centralLogStore?.record === 'function') {
      centralLogStore.record({
        category: scope,
        scope,
        level: options.level ?? 'info',
        message,
        detail: options.detail ?? null,
        origin: options.origin ?? 'runtime',
        timestamp: options.timestamp ?? Date.now(),
      });
    }
  }

  function normaliseRequestInfo(resource, init = {}) {
    let url = '';
    if (typeof resource === 'string') {
      url = resource;
    } else if (resource && typeof resource === 'object') {
      if (typeof resource.url === 'string') {
        url = resource.url;
      } else if (typeof resource.href === 'string') {
        url = resource.href;
      }
    }
    let method = null;
    if (typeof init?.method === 'string' && init.method.trim().length) {
      method = init.method.trim();
    } else if (resource && typeof resource.method === 'string' && resource.method.trim().length) {
      method = resource.method.trim();
    }
    if (!method) {
      method = 'GET';
    }
    return { url, method: method.toUpperCase() };
  }

  function registerCentralErrorChannels() {
    if (centralLoggingState.errorHandlersBound) {
      return;
    }
    const scope = typeof globalScope !== 'undefined' ? globalScope : globalThis;
    if (!scope?.addEventListener) {
      return;
    }
    const handleWindowError = (event) => {
      if (!event) {
        return;
      }
      const timestamp = Date.now();
      const target = event.target || event.srcElement || null;
      if (target && target !== scope && target !== scope.document) {
        const tagName = typeof target.tagName === 'string' ? target.tagName.toLowerCase() : 'resource';
        const url =
          target?.currentSrc ||
          target?.src ||
          target?.href ||
          (typeof target?.getAttribute === 'function' ? target.getAttribute('src') : null) ||
          null;
        const message = url
          ? `Failed to load ${tagName} asset: ${url}`
          : `Failed to load ${tagName} asset.`;
        const detail = {
          tagName,
          url,
          eventType: event.type,
        };
        if (typeof target.outerHTML === 'string') {
          detail.outerHTML = target.outerHTML.slice(0, 500);
        }
        logThroughDiagnostics('assets', message, {
          level: 'error',
          detail,
          timestamp,
          origin: 'resource-error',
        });
        return;
      }
      const message =
        typeof event?.message === 'string' && event.message.trim().length
          ? event.message.trim()
          : 'Unhandled script error detected.';
      const detail = {
        filename: event?.filename ?? null,
        lineno: Number.isFinite(event?.lineno) ? event.lineno : null,
        colno: Number.isFinite(event?.colno) ? event.colno : null,
        errorName: event?.error?.name ?? null,
        stack: typeof event?.error?.stack === 'string' ? event.error.stack : null,
      };
      logThroughDiagnostics('script', message, {
        level: 'error',
        detail,
        timestamp,
        origin: 'window-error',
      });
    };

    const handleUnhandledRejection = (event) => {
      const timestamp = Date.now();
      const reason = event?.reason;
      const detail = { origin: 'unhandled-rejection' };
      let message = 'Unhandled promise rejection detected.';
      if (reason && typeof reason === 'object') {
        if (typeof reason.message === 'string' && reason.message.trim().length) {
          message = reason.message.trim();
        }
        if (typeof reason.stack === 'string') {
          detail.stack = reason.stack;
        }
        if (typeof reason.name === 'string') {
          detail.errorName = reason.name;
        }
      } else if (typeof reason === 'string' && reason.trim().length) {
        message = reason.trim();
      }
      logThroughDiagnostics('ui', message, {
        level: 'error',
        detail,
        timestamp,
        origin: 'runtime',
      });
    };

    scope.addEventListener('error', handleWindowError, true);
    scope.addEventListener('unhandledrejection', handleUnhandledRejection);
    centralLoggingState.errorHandlersBound = true;
  }

  function installApiDiagnosticsHooks() {
    if (centralLoggingState.apiInstrumentationApplied) {
      return;
    }
    const scope = typeof globalScope !== 'undefined' ? globalScope : globalThis;
    const fetchRef = scope?.fetch;
    if (typeof fetchRef !== 'function') {
      return;
    }
    if (scope.fetch && scope.fetch.__infiniteRailsDiagnosticsWrapped) {
      centralLoggingState.apiInstrumentationApplied = true;
      return;
    }
    const originalFetch = fetchRef.bind(scope);
    const wrappedFetch = function (...args) {
      const [resource, init] = args;
      const info = normaliseRequestInfo(resource, init || {});
      const start = Date.now();
      return originalFetch(...args).then(
        (response) => {
          if (response && !response.ok) {
            const detail = {
              url: response.url || info.url,
              method: info.method,
              status: response.status,
              statusText: response.statusText,
              redirected: Boolean(response.redirected),
              type: response.type ?? null,
              elapsedMs: Date.now() - start,
            };
            const statusLabel = Number.isFinite(response.status) ? response.status : 'unknown status';
            const message = detail.url
              ? `API request failed: ${info.method} ${detail.url} → ${statusLabel}`
              : `API request failed with ${statusLabel}.`;
            logThroughDiagnostics('api', message, {
              level: 'error',
              detail,
              timestamp: Date.now(),
              origin: 'fetch-response',
            });
          }
          return response;
        },
        (error) => {
          const detail = {
            url: info.url || null,
            method: info.method,
            message: error?.message ?? String(error),
            errorName: error?.name ?? null,
            stack: typeof error?.stack === 'string' ? error.stack : null,
            elapsedMs: Date.now() - start,
          };
          const message = detail.url
            ? `API request error: ${info.method} ${detail.url}`
            : `API request error during ${info.method} request.`;
          logThroughDiagnostics('api', message, {
            level: 'error',
            detail,
            timestamp: Date.now(),
            origin: 'fetch-error',
          });
          throw error;
        },
      );
    };
    wrappedFetch.__infiniteRailsDiagnosticsWrapped = true;
    scope.fetch = wrappedFetch;
    centralLoggingState.apiInstrumentationApplied = true;
  }

  function installRenderDiagnosticsHooks() {
    if (centralLoggingState.renderHandlersBound) {
      return;
    }
    const scope = typeof globalScope !== 'undefined' ? globalScope : globalThis;
    const doc = documentRef || scope.document || null;
    if (!doc?.addEventListener) {
      return;
    }
    const handleContextLost = (event) => {
      const timestamp = Date.now();
      const target = event?.target || null;
      const detail = {
        canvasId: target?.id ?? null,
        tagName: typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : null,
        eventType: event?.type ?? 'webglcontextlost',
      };
      logThroughDiagnostics('render', 'WebGL context lost — renderer unavailable until reload.', {
        level: 'error',
        detail,
        timestamp,
        origin: 'webgl-context',
      });
    };
    const handleContextRestored = (event) => {
      const timestamp = Date.now();
      const target = event?.target || null;
      const detail = {
        canvasId: target?.id ?? null,
        tagName: typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : null,
        eventType: event?.type ?? 'webglcontextrestored',
      };
      logThroughDiagnostics('render', 'WebGL context restored.', {
        level: 'success',
        detail,
        timestamp,
        origin: 'webgl-context',
      });
    };
    doc.addEventListener('webglcontextlost', handleContextLost, true);
    doc.addEventListener('webglcontextrestored', handleContextRestored, true);
    centralLoggingState.renderHandlersBound = true;
  }

  function includesTextureLanguage(value) {
    if (typeof value !== 'string' || !value.trim().length) {
      return false;
    }
    return /texture|skin|material|albedo|diffuse/i.test(value);
  }

  function resolveAssetReloadActionLabel(detail = null) {
    const fallback = 'Reload assets';
    if (!detail || typeof detail !== 'object') {
      return fallback;
    }
    const overrideKeys = ['reloadLabel', 'reloadActionLabel', 'actionLabel', 'buttonLabel'];
    for (const key of overrideKeys) {
      const candidate = detail[key];
      if (typeof candidate === 'string' && candidate.trim().length) {
        return candidate.trim();
      }
    }
    const keyValue = typeof detail.key === 'string' ? detail.key.trim().toLowerCase() : '';
    if (keyValue.startsWith('texture:')) {
      return 'Refresh textures';
    }
    const extension = typeof detail.assetExtension === 'string' ? detail.assetExtension.trim().toLowerCase() : '';
    if (extension && ['png', 'jpg', 'jpeg', 'webp', 'ktx', 'ktx2', 'dds'].includes(extension)) {
      return 'Refresh textures';
    }
    const descriptors = [
      detail.assetFriendlyName,
      detail.assetLabel,
      detail.assetSourceLabel,
      detail.assetSummaryLabel,
    ];
    if (descriptors.some((value) => includesTextureLanguage(value))) {
      return 'Refresh textures';
    }
    return fallback;
  }

  function normaliseTextureReloadKey(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith('texture:')) {
      const key = trimmed.slice('texture:'.length).trim();
      return key || null;
    }
    if (/^textures?\//i.test(trimmed)) {
      const segments = trimmed.split(/[?#]/, 1)[0].split('/');
      const file = segments[segments.length - 1] || '';
      if (file) {
        const lower = file.toLowerCase();
        if (lower.endsWith('.png')) {
          return file.slice(0, -4) || null;
        }
        return file;
      }
    }
    if (trimmed.includes(':') || /\s/.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  function collectTextureReloadKeys(detail) {
    if (!detail || typeof detail !== 'object') {
      return [];
    }
    const keys = new Set();
    const add = (candidate) => {
      const normalised = normaliseTextureReloadKey(candidate);
      if (normalised) {
        keys.add(normalised);
      }
    };
    add(detail.key);
    add(detail.assetKey);
    add(detail.assetId);
    add(detail.assetName);
    if (Array.isArray(detail.keys)) {
      detail.keys.forEach(add);
    }
    if (Array.isArray(detail.missingKeys)) {
      detail.missingKeys.forEach(add);
    }
    if (Array.isArray(detail.textureKeys)) {
      detail.textureKeys.forEach(add);
    }
    if (Array.isArray(detail.requestKeys)) {
      detail.requestKeys.forEach(add);
    }
    return Array.from(keys);
  }

  function normaliseStringList(value) {
    if (value === undefined || value === null) {
      return [];
    }
    const values = Array.isArray(value) ? value : [value];
    const result = [];
    values.forEach((entry) => {
      if (typeof entry !== 'string') {
        return;
      }
      const trimmed = entry.trim();
      if (trimmed && !result.includes(trimmed)) {
        result.push(trimmed);
      }
    });
    return result;
  }

  function attemptAssetReloadFromDiagnostics({
    source = 'diagnostics-overlay',
    detail = null,
    control = null,
    logMessage = 'Player initiated asset reload from diagnostics overlay.',
    logLevel = 'warning',
  } = {}) {
    const controlElement = control && typeof control === 'object' ? control : null;
    if (controlElement) {
      try {
        controlElement.disabled = true;
      } catch (error) {
        if (globalScope?.console?.debug) {
          globalScope.console.debug('Unable to disable diagnostics action control.', error);
        }
      }
    }
    let detailSnapshot = null;
    if (detail && typeof detail === 'object') {
      try {
        detailSnapshot = JSON.parse(JSON.stringify(detail));
      } catch (error) {
        detailSnapshot = { ...detail };
      }
    }
    if (typeof logDiagnosticsEvent === 'function') {
      const recoveryDetail = detailSnapshot ? { ...detailSnapshot } : {};
      recoveryDetail.source = source;
      logDiagnosticsEvent('assets', logMessage, {
        level: logLevel,
        detail: recoveryDetail,
      });
    }
    if (typeof globalScope?.dispatchEvent === 'function' && typeof globalScope?.CustomEvent === 'function') {
      try {
        const eventDetail = { source };
        if (detailSnapshot) {
          eventDetail.context = detailSnapshot;
        }
        globalScope.dispatchEvent(
          new globalScope.CustomEvent('infinite-rails:asset-recovery-reload-requested', {
            detail: eventDetail,
          }),
        );
      } catch (dispatchError) {
        if (globalScope?.console?.debug) {
          globalScope.console.debug('Unable to dispatch asset recovery reload event.', dispatchError);
        }
      }
    }
    const actionLabel = resolveAssetReloadActionLabel(detailSnapshot);
    const refreshFn =
      typeof globalScope?.InfiniteRails?.refreshTextures === 'function'
        ? globalScope.InfiniteRails.refreshTextures
        : typeof globalScope?.InfiniteRails?.assets?.refreshTextures === 'function'
          ? globalScope.InfiniteRails.assets.refreshTextures
          : null;
    if (actionLabel === 'Refresh textures' && refreshFn) {
      const refreshKeys = collectTextureReloadKeys(detailSnapshot);
      const alternateBaseUrls = normaliseStringList(
        detailSnapshot?.alternateBaseUrls ??
          detailSnapshot?.baseUrls ??
          detailSnapshot?.fallbackBaseUrls ??
          detailSnapshot?.alternateBases,
      );
      const refreshOptions = {
        source,
        detail: detailSnapshot ? { ...detailSnapshot } : null,
      };
      if (refreshKeys.length) {
        refreshOptions.keys = refreshKeys;
      }
      if (typeof detailSnapshot?.baseUrl === 'string' && detailSnapshot.baseUrl.trim().length) {
        refreshOptions.baseUrl = detailSnapshot.baseUrl.trim();
      }
      if (alternateBaseUrls.length) {
        refreshOptions.alternateBaseUrls = alternateBaseUrls;
      }
      if (typeof showHudAlert === 'function') {
        showHudAlert({
          title: 'Refreshing textures',
          message: 'Refreshing texture pack from alternate CDN endpoints…',
          severity: 'info',
          autoHideMs: 6000,
        });
      }
      Promise.resolve()
        .then(() => refreshFn(refreshOptions))
        .then(() => {
          if (typeof showHudAlert === 'function') {
            showHudAlert({
              title: 'Textures refreshed',
              message: 'Texture streams restarted successfully.',
              severity: 'success',
              autoHideMs: 7000,
            });
          }
          if (typeof logDiagnosticsEvent === 'function') {
            logDiagnosticsEvent('assets', 'Texture refresh completed.', {
              level: 'success',
              detail: { source, keys: refreshKeys },
            });
          }
        })
        .catch((error) => {
          if (typeof showHudAlert === 'function') {
            showHudAlert({
              title: 'Refresh failed',
              message: 'Texture refresh failed — reload the page to restore assets.',
              severity: 'error',
              autoHideMs: 8000,
            });
          }
          if (typeof logDiagnosticsEvent === 'function') {
            logDiagnosticsEvent('assets', 'Texture refresh failed.', {
              level: 'error',
              detail: { source, keys: refreshKeys, error: error?.message || String(error) },
            });
          }
          if (globalScope?.console?.warn) {
            globalScope.console.warn('Texture refresh failed.', error);
          }
        })
        .finally(() => {
          if (controlElement) {
            try {
              controlElement.disabled = false;
            } catch (error) {
              if (globalScope?.console?.debug) {
                globalScope.console.debug('Unable to re-enable diagnostics action control.', error);
              }
            }
          }
        });
      return;
    }
    const locationTarget = globalScope?.location;
    if (locationTarget && typeof locationTarget.reload === 'function') {
      locationTarget.reload();
      return;
    }
    if (controlElement) {
      try {
        controlElement.disabled = false;
      } catch (error) {
        if (globalScope?.console?.debug) {
          globalScope.console.debug('Unable to re-enable diagnostics action control.', error);
        }
      }
    }
    showHudAlert({
      title: 'Reload unavailable',
      message: 'Reload the page manually to restore missing assets.',
      severity: 'warning',
      autoHideMs: 7000,
    });
  }

  function presentCriticalErrorOverlay({
    title = 'Something went wrong',
    message = 'An unexpected error occurred. Reload to try again.',
    diagnosticScope = 'renderer',
    diagnosticStatus = 'error',
    diagnosticMessage = message,
    logScope = diagnosticScope,
    logMessage = diagnosticMessage,
    logLevel = 'error',
    detail = null,
    timestamp = null,
    logToConsole = true,
  } = {}) {
    if (typeof bootstrapOverlay?.showError === 'function') {
      try {
        bootstrapOverlay.showError({ title, message });
      } catch (overlayError) {
        if (globalScope?.console?.warn) {
          globalScope.console.warn('Unable to display critical error overlay.', overlayError);
        }
      }
    }
    const severity =
      diagnosticStatus === 'error'
        ? 'error'
        : diagnosticStatus === 'warning'
          ? 'warning'
          : diagnosticStatus === 'ok'
            ? 'success'
            : 'info';
    const hudMessage =
      typeof message === 'string' && message.trim().length
        ? message.trim()
        : typeof diagnosticMessage === 'string' && diagnosticMessage.trim().length
          ? diagnosticMessage.trim()
          : 'An unexpected error occurred.';
    showHudAlert({
      title,
      message: hudMessage,
      severity,
      autoHideMs: severity === 'success' || severity === 'info' ? 6000 : null,
    });
    const detailSnapshot = detail && typeof detail === 'object' ? { ...detail } : null;
    if (typeof bootstrapOverlay?.setRecoveryAction === 'function') {
      if (diagnosticStatus === 'error') {
        if (diagnosticScope === 'assets') {
          const actionLabel = resolveAssetReloadActionLabel(detailSnapshot);
          const recoveryLogMessage =
            actionLabel === 'Refresh textures'
              ? 'Player initiated texture refresh from diagnostics overlay.'
              : 'Player initiated asset reload from diagnostics overlay.';
          bootstrapOverlay.setRecoveryAction({
            label: actionLabel,
            action: 'reload-assets',
            description: 'Reloads the experience and requests missing assets again.',
            onSelect: (event) => {
              attemptAssetReloadFromDiagnostics({
                source: 'global-overlay',
                detail: detailSnapshot,
                control: event?.currentTarget ?? null,
                logMessage: recoveryLogMessage,
              });
            },
          });
        } else {
          bootstrapOverlay.setRecoveryAction({
            label: 'Diagnostics Help',
            action: 'diagnostics-help',
            description: 'Open troubleshooting guidance in a new tab.',
            onSelect: () => {
              if (typeof logDiagnosticsEvent === 'function') {
                const helpScope = typeof logScope === 'string' && logScope.trim().length ? logScope : 'diagnostics';
                logDiagnosticsEvent(helpScope, 'Player opened diagnostics help from recovery overlay.', {
                  level: 'info',
                  detail: detailSnapshot ? { ...detailSnapshot, source: 'global-overlay' } : { source: 'global-overlay' },
                });
              }
              const docRef = typeof document !== 'undefined' ? document : globalScope?.document ?? null;
              const supportLink = docRef?.getElementById('globalOverlaySupportLink');
              if (supportLink && typeof supportLink.click === 'function') {
                supportLink.click();
                return;
              }
              const href = supportLink?.href || 'https://support.infiniterails.app/diagnostics';
              if (typeof globalScope?.open === 'function') {
                globalScope.open(href, '_blank', 'noopener');
              }
            },
          });
        }
      } else if (typeof bootstrapOverlay?.clearRecoveryAction === 'function') {
        bootstrapOverlay.clearRecoveryAction();
      } else {
        bootstrapOverlay.setRecoveryAction(null);
      }
    }
    if (
      diagnosticScope &&
      typeof bootstrapOverlay?.setDiagnostic === 'function'
    ) {
      try {
        bootstrapOverlay.setDiagnostic(diagnosticScope, {
          status: diagnosticStatus,
          message: diagnosticMessage,
        });
      } catch (diagnosticError) {
        if (globalScope?.console?.warn) {
          globalScope.console.warn('Unable to update diagnostic status for critical error.', diagnosticError);
        }
      }
    }
    if (typeof bootstrapOverlay?.setDiagnosticAction === 'function') {
      if (diagnosticScope === 'assets' && diagnosticStatus === 'error') {
        const actionLabel = resolveAssetReloadActionLabel(detailSnapshot);
        const statusLogMessage =
          actionLabel === 'Refresh textures'
            ? 'Player initiated texture refresh from diagnostics overlay status control.'
            : 'Player initiated asset reload from diagnostics overlay status control.';
        bootstrapOverlay.setDiagnosticAction('assets', {
          label: actionLabel,
          action: 'reload-assets',
          description: 'Reloads the experience and requests missing assets again.',
          detail: detailSnapshot ? { ...detailSnapshot } : null,
          source: 'global-overlay-diagnostics',
          statuses: ['error'],
          onSelect: (event) => {
            attemptAssetReloadFromDiagnostics({
              source: 'global-overlay-diagnostics',
              detail: detailSnapshot,
              control: event?.currentTarget ?? null,
              logMessage: statusLogMessage,
            });
          },
        });
      } else {
        bootstrapOverlay.clearDiagnosticAction('assets');
      }
    }
    if (logToConsole && typeof logCriticalErrorToConsole === 'function') {
      const stageLabel =
        typeof detail?.stage === 'string' && detail.stage.trim().length ? detail.stage.trim() : null;
      logCriticalErrorToConsole({
        message: logMessage,
        diagnosticMessage,
        playerMessage: message,
        level: logLevel,
        scope: logScope,
        status: diagnosticStatus,
        boundary: 'overlay',
        stage: stageLabel,
        detail,
        timestamp,
      });
    }
    if (logScope && typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent(logScope, logMessage, {
        level: logLevel,
        detail,
        timestamp: Number.isFinite(timestamp) ? timestamp : undefined,
      });
    }
  }

  const ERROR_BOUNDARY_DEFAULTS = {
    bootstrap: {
      title: 'Bootstrap failure',
      userMessage: 'The game failed to initialise. Reload to try again.',
      diagnosticScope: 'renderer',
      diagnosticMessage: 'Bootstrap sequence failed. Reload to try again.',
      logScope: 'startup',
      logMessage: 'Bootstrap sequence failed. Reload to try again.',
    },
    'simple-experience': {
      title: 'Renderer unavailable',
      userMessage: 'Failed to initialise the renderer. Check your connection and reload.',
      diagnosticScope: 'renderer',
      diagnosticMessage: 'Failed to initialise the renderer. Check your connection and reload.',
      logScope: 'startup',
      logMessage: 'Failed to initialise the renderer. Check your connection and reload.',
    },
    'experience-start': {
      title: 'Unable to start expedition',
      userMessage: 'We hit a snag while starting the expedition. Try again or reload the page.',
      diagnosticScope: 'renderer',
      diagnosticMessage: 'Gameplay start failed.',
      logScope: 'runtime',
      logMessage: 'Gameplay start failed.',
    },
    'experience-tutorial': {
      title: 'Tutorial unavailable',
      userMessage: 'The tutorial overlay failed to open. Try again or reload the page.',
      diagnosticScope: 'renderer',
      diagnosticMessage: 'Tutorial overlay failed to open.',
      logScope: 'runtime',
      logMessage: 'Tutorial overlay failed to open.',
    },
    runtime: {
      title: 'Unexpected error',
      userMessage: 'An unexpected error occurred. Reload to try again.',
      diagnosticScope: 'renderer',
      diagnosticMessage: 'Unexpected runtime error detected.',
      logScope: 'runtime',
      logMessage: 'Unexpected runtime error detected.',
    },
  };

  function normaliseErrorForBoundary(error) {
    if (error instanceof Error) {
      return {
        name: typeof error.name === 'string' && error.name.trim().length ? error.name.trim() : 'Error',
        message:
          typeof error.message === 'string' && error.message.trim().length
            ? error.message.trim()
            : 'An unexpected error occurred.',
        stack: typeof error.stack === 'string' && error.stack.trim().length ? error.stack.trim() : null,
      };
    }
    if (typeof error === 'string' && error.trim().length) {
      return { name: 'Error', message: error.trim(), stack: null };
    }
    return {
      name: 'Error',
      message: 'An unexpected error occurred.',
      stack: null,
    };
  }

  function sanitiseDetailForLogging(detail) {
    if (!detail || typeof detail !== 'object') {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(detail));
    } catch (error) {
      const fallback = {};
      Object.keys(detail).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(detail, key)) {
          return;
        }
        const value = detail[key];
        if (typeof value === 'undefined') {
          return;
        }
        if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          fallback[key] = value;
          return;
        }
        if (value instanceof Date) {
          fallback[key] = value.toISOString();
          return;
        }
        if (value instanceof Error) {
          fallback[key] = {
            name: typeof value.name === 'string' ? value.name : 'Error',
            message: typeof value.message === 'string' ? value.message : String(value),
            stack: typeof value.stack === 'string' ? value.stack : null,
          };
          return;
        }
        try {
          fallback[key] = JSON.parse(JSON.stringify(value));
        } catch (nestedError) {
          fallback[key] = typeof value?.toString === 'function' ? value.toString() : '[unserialisable]';
        }
      });
      return Object.keys(fallback).length ? fallback : null;
    }
  }

  function logCriticalErrorToConsole(context = {}) {
    const scopeRef =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    const consoleRef = typeof console !== 'undefined' ? console : scopeRef?.console ?? null;
    if (!consoleRef) {
      return;
    }
    const rawMessage =
      typeof context.message === 'string' && context.message.trim().length
        ? context.message.trim()
        : typeof context.diagnosticMessage === 'string' && context.diagnosticMessage.trim().length
          ? context.diagnosticMessage.trim()
          : typeof context.normalised?.message === 'string' && context.normalised.message.trim().length
            ? context.normalised.message.trim()
            : 'Critical runtime failure detected.';
    const baseMessage = `[InfiniteRails] ${rawMessage}`;
    const payload = {
      boundary: context.boundary ?? null,
      stage: context.stage ?? null,
      scope: context.scope ?? null,
      status: context.status ?? 'error',
      level: context.level ?? 'error',
      playerMessage: context.playerMessage ?? null,
      diagnosticMessage: context.diagnosticMessage ?? null,
      displayedToPlayer: true,
      detail: sanitiseDetailForLogging(context.detail) ?? null,
    };
    if (context.normalised?.stack && !payload.stack) {
      payload.stack = context.normalised.stack;
    }
    const errorInstance = context.error instanceof Error ? context.error : null;
    const groupStart =
      typeof consoleRef.groupCollapsed === 'function' ? consoleRef.groupCollapsed.bind(consoleRef) : null;
    const groupEnd = typeof consoleRef.groupEnd === 'function' ? consoleRef.groupEnd.bind(consoleRef) : null;
    const errorFn =
      typeof consoleRef.error === 'function'
        ? consoleRef.error.bind(consoleRef)
        : typeof consoleRef.warn === 'function'
          ? consoleRef.warn.bind(consoleRef)
          : typeof consoleRef.log === 'function'
            ? consoleRef.log.bind(consoleRef)
            : null;
    if (!errorFn) {
      return;
    }
    if (groupStart && groupEnd && typeof consoleRef.error === 'function') {
      groupStart(baseMessage);
      consoleRef.error('Diagnostics context:', payload);
      if (errorInstance) {
        consoleRef.error(errorInstance);
      } else if (context.normalised) {
        consoleRef.error(context.normalised);
      }
      groupEnd();
      return;
    }
    if (errorInstance) {
      errorFn(baseMessage, payload, errorInstance);
    } else if (context.normalised) {
      errorFn(baseMessage, payload, context.normalised);
    } else {
      errorFn(baseMessage, payload);
    }
  }

  function markErrorAsHandled(error) {
    if (!error || typeof error !== 'object') {
      return;
    }
    try {
      Object.defineProperty(error, '__infiniteRailsBoundaryHandled', {
        value: true,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    } catch (definitionError) {
      try {
        // eslint-disable-next-line no-param-reassign
        error.__infiniteRailsBoundaryHandled = true;
      } catch (assignmentError) {
        // Ignore if we cannot tag the error instance.
      }
    }
  }

  function wasErrorHandledByBoundary(error) {
    return Boolean(error && typeof error === 'object' && error.__infiniteRailsBoundaryHandled);
  }

  const SURVIVAL_WATCHDOG_DEFAULTS = Object.freeze({
    healthMax: 20,
    hungerMax: 20,
    breathMax: 10,
  });

  const survivalWatchdogState = {
    lastResetAt: 0,
    lastSignature: null,
  };

  const SURVIVAL_WATCHDOG_INSTANCE_MARKER =
    typeof Symbol === 'function'
      ? Symbol.for('infiniteRails.survivalWatchdog.instance')
      : '__infiniteRailsSurvivalWatchdogInstance__';
  const SURVIVAL_WATCHDOG_PRESENT_FAILURE_MARKER =
    typeof Symbol === 'function'
      ? Symbol.for('infiniteRails.survivalWatchdog.presentRendererFailure')
      : '__infiniteRailsSurvivalWatchdogPresentRendererFailure__';

  const SURVIVAL_WATCHDOG_STAGE_TOKENS = Object.freeze([
    'physics',
    'simulation',
    'logic',
    'game-logic',
    'gameplay',
    'body',
    'movement',
  ]);

  function normaliseSurvivalWatchdogKey(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed.length) {
      return '';
    }
    return trimmed.toLowerCase().replace(/[\s_]+/g, '-');
  }

  function normaliseSurvivalWatchdogDescriptor(detail, fallbackStage) {
    const descriptor = detail && typeof detail === 'object' ? detail : {};
    const fallbackStageRaw =
      typeof fallbackStage === 'string' && fallbackStage.trim().length ? fallbackStage.trim() : '';
    const stageRaw =
      typeof descriptor.stage === 'string' && descriptor.stage.trim().length
        ? descriptor.stage.trim()
        : typeof descriptor.failureStage === 'string' && descriptor.failureStage.trim().length
          ? descriptor.failureStage.trim()
          : fallbackStageRaw;
    const reasonRaw =
      typeof descriptor.reason === 'string' && descriptor.reason.trim().length
        ? descriptor.reason.trim()
        : typeof descriptor.failureReason === 'string' && descriptor.failureReason.trim().length
          ? descriptor.failureReason.trim()
          : '';
    const codeRaw =
      typeof descriptor.code === 'string' && descriptor.code.trim().length
        ? descriptor.code.trim()
        : typeof descriptor.errorCode === 'string' && descriptor.errorCode.trim().length
          ? descriptor.errorCode.trim()
          : '';
    const boundaryRaw =
      typeof descriptor.boundary === 'string' && descriptor.boundary.trim().length
        ? descriptor.boundary.trim()
        : typeof descriptor.scope === 'string' && descriptor.scope.trim().length
          ? descriptor.scope.trim()
          : '';
    const stageKey = normaliseSurvivalWatchdogKey(stageRaw);
    const reasonKey = normaliseSurvivalWatchdogKey(reasonRaw);
    const codeKey = normaliseSurvivalWatchdogKey(codeRaw);
    const boundaryKey = normaliseSurvivalWatchdogKey(boundaryRaw);
    const fallbackStageKey = normaliseSurvivalWatchdogKey(fallbackStageRaw);
    const candidateKeys = new Set();
    [stageKey, reasonKey, codeKey, boundaryKey, fallbackStageKey].forEach((key) => {
      if (key) {
        candidateKeys.add(key);
      }
    });
    const messageSources = [
      descriptor.message,
      descriptor.errorMessage,
      descriptor.diagnosticMessage,
      descriptor.userMessage,
      descriptor.detailMessage,
      descriptor.description,
      descriptor.errorName,
      descriptor.name,
      descriptor.phase,
      descriptor.status,
      descriptor.moduleId,
      descriptor.moduleName,
      descriptor.moduleLabel,
      descriptor.reasonDetail,
      descriptor.failureReason,
      descriptor.failureStage,
      descriptor.failureCode,
      descriptor.scope,
      descriptor.boundary,
    ];
    messageSources.forEach((value) => {
      const key = normaliseSurvivalWatchdogKey(value);
      if (key) {
        candidateKeys.add(key);
      }
    });
    if (Array.isArray(descriptor.tags)) {
      descriptor.tags.forEach((tag) => {
        const tagKey = normaliseSurvivalWatchdogKey(tag);
        if (tagKey) {
          candidateKeys.add(tagKey);
        }
      });
    }
    if (descriptor.error && typeof descriptor.error === 'object') {
      const errorNameKey = normaliseSurvivalWatchdogKey(descriptor.error.name);
      if (errorNameKey) {
        candidateKeys.add(errorNameKey);
      }
      const errorMessageKey = normaliseSurvivalWatchdogKey(descriptor.error.message);
      if (errorMessageKey) {
        candidateKeys.add(errorMessageKey);
      }
    }
    return {
      stage: stageRaw,
      reason: reasonRaw,
      code: codeRaw,
      boundary: boundaryRaw,
      fallbackStage: fallbackStageRaw,
      stageKey,
      reasonKey,
      codeKey,
      boundaryKey,
      fallbackStageKey,
      candidateKeys: Array.from(candidateKeys),
    };
  }

  function shouldTriggerSurvivalWatchdog(descriptor) {
    if (!descriptor) {
      return false;
    }
    let candidates = Array.isArray(descriptor.candidateKeys)
      ? descriptor.candidateKeys.filter(Boolean)
      : [];
    if (!candidates.length) {
      candidates = [descriptor.stageKey, descriptor.reasonKey, descriptor.codeKey].filter(Boolean);
    }
    if (!candidates.length) {
      return false;
    }
    return candidates.some((candidate) =>
      SURVIVAL_WATCHDOG_STAGE_TOKENS.some((token) => candidate.includes(token)),
    );
  }

  function resolveMaxValue(source, keys, fallback) {
    if (source && typeof source === 'object') {
      for (const key of keys) {
        if (typeof key !== 'string') {
          continue;
        }
        const value = source[key];
        if (Number.isFinite(value)) {
          return Number(value);
        }
      }
    }
    return Number.isFinite(fallback) ? Number(fallback) : null;
  }

  function resetMeter(target, valueKeys, maxKeys, fallbackMax, percentKeys = []) {
    if (!target || typeof target !== 'object') {
      return { changed: false, key: null, max: null };
    }
    const maxValue = resolveMaxValue(target, maxKeys, fallbackMax);
    if (!Number.isFinite(maxValue)) {
      return { changed: false, key: null, max: null };
    }
    let valueKey = valueKeys.find((candidate) => Number.isFinite(target[candidate]));
    if (!valueKey) {
      valueKey = valueKeys.find((candidate) => Object.prototype.hasOwnProperty.call(target, candidate));
    }
    if (!valueKey) {
      valueKey = valueKeys[0];
    }
    let changed = false;
    if (!Number.isFinite(target[valueKey]) || target[valueKey] !== maxValue) {
      target[valueKey] = maxValue;
      changed = true;
    }
    percentKeys.forEach((percentKey) => {
      if (!percentKey || !Object.prototype.hasOwnProperty.call(target, percentKey)) {
        return;
      }
      if (target[percentKey] !== 100) {
        target[percentKey] = 100;
        changed = true;
      }
    });
    return { changed, key: valueKey, max: maxValue };
  }

  function resetExperienceSurvivalVitals(instance, descriptor) {
    if (!instance || typeof instance !== 'object') {
      return false;
    }
    const healthReset = resetMeter(
      instance,
      ['health', 'playerHealth'],
      ['maxHealth', 'playerMaxHealth', 'healthCapacity'],
      20,
    );
    const hungerReset = resetMeter(
      instance,
      ['hunger', 'playerHunger', 'foodLevel', 'food', 'satiety', 'stamina'],
      ['maxHunger', 'playerMaxHunger', 'maxFood', 'maxFoodLevel', 'hungerCapacity', 'foodCapacity', 'maxSatiety', 'maxStamina'],
      20,
      ['hungerPercent', 'playerHungerPercent', 'foodLevelPercent', 'satietyPercent', 'staminaPercent'],
    );
    const breathReset = resetMeter(
      instance,
      ['playerBreath', 'breath'],
      ['playerBreathCapacity', 'maxBreath', 'breathCapacity'],
      10,
      ['playerBreathPercent', 'breathPercent'],
    );
    const changed = Boolean(healthReset.changed || hungerReset.changed || breathReset.changed);
    if (changed) {
      const hudContext = {
        reason: 'survival-watchdog',
        stage: descriptor?.stage || 'watchdog',
        failureReason: descriptor?.reason || null,
        failureCode: descriptor?.code || null,
      };
      if (typeof instance.updateHud === 'function') {
        try {
          instance.updateHud(hudContext);
        } catch (hudError) {
          globalScope?.console?.debug?.('Survival watchdog HUD update failed.', hudError);
        }
      }
      if (typeof instance.publishStateSnapshot === 'function') {
        try {
          instance.publishStateSnapshot('survival-watchdog');
        } catch (snapshotError) {
          globalScope?.console?.debug?.('Survival watchdog snapshot publish failed.', snapshotError);
        }
      }
    }
    return changed;
  }

  function resetGlobalSurvivalVitals(instance, descriptor) {
    let state = globalScope?.__INFINITE_RAILS_STATE__;
    if (!state || typeof state !== 'object') {
      if (!globalScope || typeof globalScope !== 'object') {
        return false;
      }
      state = { player: {} };
      try {
        globalScope.__INFINITE_RAILS_STATE__ = state;
      } catch (stateAssignmentError) {
        globalScope?.console?.debug?.(
          'Survival watchdog could not initialise global state container.',
          stateAssignmentError,
        );
        return false;
      }
    }
    const player =
      state.player && typeof state.player === 'object' ? state.player : (state.player = {});
    if (!Object.prototype.hasOwnProperty.call(player, 'breathPercent')) {
      player.breathPercent = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(player, 'hungerPercent')) {
      player.hungerPercent = 0;
    }
    const healthSource = { ...player };
    const breathSource = { ...player };
    const hungerSource = { ...player };
    if (instance && typeof instance === 'object') {
      ['maxHealth', 'playerMaxHealth', 'healthCapacity'].forEach((key) => {
        if (Number.isFinite(instance[key])) {
          healthSource[key] = Number(instance[key]);
        }
      });
      ['playerBreathCapacity', 'maxBreath', 'breathCapacity'].forEach((key) => {
        if (Number.isFinite(instance[key])) {
          breathSource[key] = Number(instance[key]);
        }
      });
      ['maxHunger', 'playerMaxHunger', 'maxFood', 'maxFoodLevel', 'hungerCapacity', 'foodCapacity', 'maxSatiety', 'maxStamina'].forEach(
        (key) => {
          if (Number.isFinite(instance[key])) {
            hungerSource[key] = Number(instance[key]);
          }
        },
      );
    }
    let healthMax = resolveMaxValue(
      healthSource,
      ['maxHealth', 'playerMaxHealth', 'healthCapacity'],
      player.maxHealth,
    );
    let breathMax = resolveMaxValue(
      breathSource,
      ['playerBreathCapacity', 'maxBreath', 'breathCapacity'],
      player.maxBreath,
    );
    let hungerMax = resolveMaxValue(
      hungerSource,
      ['maxHunger', 'playerMaxHunger', 'maxFood', 'maxFoodLevel', 'hungerCapacity', 'foodCapacity', 'maxSatiety', 'maxStamina'],
      player.maxHunger,
    );
    if (!Number.isFinite(healthMax)) {
      healthMax = SURVIVAL_WATCHDOG_DEFAULTS.healthMax;
    }
    if (!Number.isFinite(breathMax)) {
      breathMax = SURVIVAL_WATCHDOG_DEFAULTS.breathMax;
    }
    if (!Number.isFinite(hungerMax)) {
      hungerMax = SURVIVAL_WATCHDOG_DEFAULTS.hungerMax;
    }
    let changed = false;
    if (Number.isFinite(healthMax) && player.maxHealth !== healthMax) {
      player.maxHealth = healthMax;
      changed = true;
    }
    if (Number.isFinite(breathMax) && player.maxBreath !== breathMax) {
      player.maxBreath = breathMax;
      changed = true;
    }
    if (Number.isFinite(hungerMax) && player.maxHunger !== hungerMax) {
      player.maxHunger = hungerMax;
      changed = true;
    }
    const healthResult = resetMeter(
      player,
      ['health'],
      ['maxHealth'],
      healthMax,
    );
    const breathResult = resetMeter(
      player,
      ['breath'],
      ['maxBreath'],
      breathMax,
      ['breathPercent'],
    );
    const hungerResult = resetMeter(
      player,
      ['hunger'],
      ['maxHunger'],
      hungerMax,
      ['hungerPercent'],
    );
    changed = Boolean(healthResult.changed || breathResult.changed || hungerResult.changed || changed);
    if (changed) {
      state.updatedAt = Date.now();
      state.signature = `survival-watchdog:${state.updatedAt}`;
      state.reason = 'survival-watchdog';
      state.failureStage = descriptor?.stage || null;
      state.failureReason = descriptor?.reason || null;
    }
    return changed;
  }

  function attachSurvivalWatchdogHooksToExperience(experience) {
    if (!experience || typeof experience !== 'object') {
      return experience;
    }
    if (experience[SURVIVAL_WATCHDOG_INSTANCE_MARKER]) {
      return experience;
    }
    try {
      if (typeof experience.presentRendererFailure === 'function') {
        const originalPresentRendererFailure = experience.presentRendererFailure;
        if (!originalPresentRendererFailure[SURVIVAL_WATCHDOG_PRESENT_FAILURE_MARKER]) {
          const wrappedPresentRendererFailure = function survivalWatchdogRendererFailure(message, detail, ...args) {
            const invocationArgs = [message, detail, ...args];
            const failureDetail = detail && typeof detail === 'object' ? detail : {};
            const fallbackStage =
              (typeof failureDetail.stage === 'string' && failureDetail.stage.trim().length
                ? failureDetail.stage
                : typeof failureDetail.failureStage === 'string' && failureDetail.failureStage.trim().length
                  ? failureDetail.failureStage
                  : 'renderer-failure');
            try {
              return originalPresentRendererFailure.apply(this, invocationArgs);
            } finally {
              try {
                const descriptor = normaliseSurvivalWatchdogDescriptor(failureDetail, fallbackStage);
                if (shouldTriggerSurvivalWatchdog(descriptor)) {
                  applySurvivalWatchdog(descriptor, {
                    boundary: failureDetail.boundary || 'experience.presentRendererFailure',
                  });
                }
              } catch (watchdogError) {
                globalScope?.console?.debug?.(
                  'Survival watchdog hook failed to evaluate renderer failure.',
                  watchdogError,
                );
              }
            }
          };
          wrappedPresentRendererFailure[SURVIVAL_WATCHDOG_PRESENT_FAILURE_MARKER] = true;
          wrappedPresentRendererFailure.__survivalWatchdogOriginal = originalPresentRendererFailure;
          experience.presentRendererFailure = wrappedPresentRendererFailure;
        }
      }
    } catch (hookError) {
      globalScope?.console?.debug?.('Failed to attach survival watchdog hooks to experience.', hookError);
    }
    experience[SURVIVAL_WATCHDOG_INSTANCE_MARKER] = true;
    return experience;
  }

  function applySurvivalWatchdog(descriptor, context = {}) {
    if (!descriptor) {
      return false;
    }
    const signatureBase = `${descriptor.stageKey || 'stage'}|${descriptor.reasonKey || 'reason'}|${
      descriptor.codeKey || 'code'
    }`;
    const now = Date.now();
    if (survivalWatchdogState.lastSignature === signatureBase && now - survivalWatchdogState.lastResetAt < 200) {
      return false;
    }
    const experienceReset = resetExperienceSurvivalVitals(activeExperienceInstance, descriptor);
    const stateReset = resetGlobalSurvivalVitals(activeExperienceInstance, descriptor);
    if (!experienceReset && !stateReset) {
      return false;
    }
    survivalWatchdogState.lastSignature = signatureBase;
    survivalWatchdogState.lastResetAt = now;
    const payload = {
      stage: descriptor.stage || null,
      reason: descriptor.reason || null,
      code: descriptor.code || null,
      boundary: context.boundary || null,
      experienceUpdated: experienceReset,
      stateUpdated: stateReset,
    };
    if (activeExperienceInstance && typeof activeExperienceInstance.emitGameEvent === 'function') {
      try {
        activeExperienceInstance.emitGameEvent('survival-watchdog-reset', payload);
      } catch (eventError) {
        globalScope?.console?.debug?.('Survival watchdog event dispatch failed.', eventError);
      }
    }
    const logger = globalScope?.console?.warn || globalScope?.console?.info;
    if (logger) {
      logger('Survival watchdog reset player vitals after crash.', payload);
    }
    return true;
  }

  function handleErrorBoundary(error, options = {}) {
    if (!error) {
      error = new Error('Unknown runtime failure.');
    }
    if (wasErrorHandledByBoundary(error)) {
      return;
    }
    const boundaryKey =
      typeof options.boundary === 'string' && options.boundary.trim().length
        ? options.boundary.trim()
        : 'runtime';
    const defaults = ERROR_BOUNDARY_DEFAULTS[boundaryKey] || ERROR_BOUNDARY_DEFAULTS.runtime;
    const normalised = normaliseErrorForBoundary(error);
    const overlayTitle = options.title ?? defaults.title;
    const userMessage = options.userMessage ?? defaults.userMessage;
    const diagnosticScope = options.diagnosticScope ?? defaults.diagnosticScope ?? 'renderer';
    const diagnosticStatus = options.diagnosticStatus ?? defaults.diagnosticStatus ?? 'error';
    const stage = options.stage ?? boundaryKey;
    const detail = {
      ...(defaults.detail || {}),
      ...(options.detail || {}),
      stage,
      boundary: boundaryKey,
      errorName: normalised.name,
      errorMessage: normalised.message,
      stack: normalised.stack,
    };
    const diagnosticMessage =
      options.diagnosticMessage ??
      defaults.diagnosticMessage ??
      (stage ? `${stage} failure: ${normalised.message}` : normalised.message);
    const logScope = options.logScope ?? defaults.logScope ?? 'runtime';
    const logMessage = options.logMessage ?? defaults.logMessage ?? diagnosticMessage;
    const logLevel = options.logLevel ?? defaults.logLevel ?? 'error';
    presentCriticalErrorOverlay({
      title: overlayTitle,
      message: userMessage,
      diagnosticScope,
      diagnosticStatus,
      diagnosticMessage,
      logScope,
      logMessage,
      logLevel,
      detail,
      timestamp: options.timestamp,
      logToConsole: false,
    });
    logCriticalErrorToConsole({
      message: logMessage,
      diagnosticMessage,
      playerMessage: userMessage,
      level: logLevel,
      scope: logScope,
      status: diagnosticStatus,
      boundary: boundaryKey,
      stage,
      detail,
      error,
      normalised,
    });
    const watchdogDescriptor = normaliseSurvivalWatchdogDescriptor(detail, stage);
    if (shouldTriggerSurvivalWatchdog(watchdogDescriptor)) {
      applySurvivalWatchdog(watchdogDescriptor, { boundary: boundaryKey });
    }
    if (typeof tryStartSimpleFallback === 'function') {
      let activeMode = null;
      let fallbackActivated = false;
      let fallbackAttempted = false;
      let fallbackInvocationError = null;
      let fallbackContext = null;
      let fallbackError = null;
      try {
        try {
          activeMode =
            typeof resolveRendererModeForFallback === 'function' ? resolveRendererModeForFallback(detail) : null;
        } catch (resolveError) {
          fallbackInvocationError = resolveError;
          activeMode = null;
        }
        if (activeMode !== 'simple') {
          const fallbackReason =
            typeof detail?.reason === 'string' && detail.reason.trim().length
              ? detail.reason.trim()
              : boundaryKey;
          fallbackContext = {
            reason: fallbackReason,
            boundary: boundaryKey,
            stage,
            mode: activeMode || 'unknown',
            source: 'error-boundary',
          };
          fallbackError = error instanceof Error ? error : new Error(normalised.message);
          fallbackAttempted = true;
          try {
            fallbackActivated = tryStartSimpleFallback(fallbackError, fallbackContext) === true;
          } catch (invokeError) {
            fallbackInvocationError = invokeError;
          }
        }
      } catch (fallbackError) {
        fallbackInvocationError = fallbackError;
      }
      const missionFallbackActive = Boolean(globalScope?.__MISSION_BRIEFING_FALLBACK_ACTIVE__);
      if (
        fallbackAttempted &&
        !fallbackActivated &&
        !missionFallbackActive &&
        typeof offerMissionBriefingFallback === 'function'
      ) {
        try {
          const reasonBase =
            typeof fallbackContext?.reason === 'string' && fallbackContext.reason.trim().length
              ? fallbackContext.reason.trim()
              : boundaryKey;
          const missionReason = `${reasonBase}:mission-briefing`;
          const missionContext =
            fallbackContext && typeof fallbackContext === 'object'
              ? { ...fallbackContext }
              : { boundary: boundaryKey, stage };
          if (typeof missionContext.source !== 'string' || !missionContext.source.trim().length) {
            missionContext.source = 'error-boundary';
          }
          if (typeof missionContext.mode !== 'string' || !missionContext.mode.trim().length) {
            missionContext.mode = activeMode || 'unknown';
          }
          const diagnosticMessage =
            'Advanced renderer recovery failed — mission briefing text mode enabled automatically.';
          const notice =
            'Advanced renderer remains offline. Mission briefing text mode has been enabled automatically.';
          offerMissionBriefingFallback({
            reason: missionReason,
            context: missionContext,
            error: fallbackError,
            diagnosticMessage,
            notice,
          });
        } catch (missionFallbackError) {
          globalScope?.console?.debug?.(
            'Failed to activate mission briefing fallback after renderer failure.',
            missionFallbackError,
          );
        }
      }
      if (fallbackInvocationError) {
        globalScope?.console?.debug?.(
          'Failed to trigger simple renderer fallback after boundary error.',
          fallbackInvocationError,
        );
      }
    }
    markErrorAsHandled(error);
  }

  function invokeWithErrorBoundary(action, options = {}) {
    if (typeof action !== 'function') {
      return null;
    }
    const { rethrow = true } = options;
    try {
      const result = action();
      if (result && typeof result.then === 'function') {
        return result.catch((error) => {
          if (!wasErrorHandledByBoundary(error)) {
            handleErrorBoundary(error, options);
          }
          if (rethrow) {
            return Promise.reject(error);
          }
          return undefined;
        });
      }
      return result;
    } catch (error) {
      if (!wasErrorHandledByBoundary(error)) {
        handleErrorBoundary(error, options);
      }
      if (rethrow) {
        throw error;
      }
      return null;
    }
  }

  function createDynamicModuleLoader() {
    const modules = new Map();
    const listeners = new Set();

    function normaliseId(value) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (value && typeof value.toString === 'function') {
        const coerced = value.toString().trim();
        if (coerced) {
          return coerced;
        }
      }
      throw new Error('Module identifier is required.');
    }

    function cloneModuleState(state, descriptor) {
      if (!state) {
        return null;
      }
      return {
        id: state.id,
        label: descriptor?.label ?? state.id,
        type: descriptor?.type ?? 'module',
        status: state.status,
        error: state.error ? { name: state.error.name, message: state.error.message } : null,
        lastLoadedAt: state.lastLoadedAt ?? null,
        reloadCount: state.reloadCount ?? 0,
        pending: Boolean(state.promise),
      };
    }

    function notifyChange(id) {
      const entry = modules.get(id);
      if (!entry) {
        return;
      }
      const snapshot = cloneModuleState(entry.state, entry.descriptor);
      listeners.forEach((listener) => {
        try {
          listener(id, snapshot);
        } catch (error) {
          globalScope?.console?.debug?.('Module loader listener threw an error.', error);
        }
      });
    }

    function resolveGlobalExport(path) {
      if (!path) {
        return null;
      }
      const segments = String(path)
        .split('.')
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (!segments.length) {
        return null;
      }
      let cursor = globalScope;
      for (const segment of segments) {
        if (!cursor || typeof cursor !== 'object') {
          return null;
        }
        cursor = cursor[segment];
      }
      return cursor ?? null;
    }

    function normaliseScripts(input) {
      if (!input) {
        return [];
      }
      const values = Array.isArray(input) ? input : [input];
      return values
        .map((entry) => {
          if (!entry) {
            return null;
          }
          if (typeof entry === 'string') {
            return { path: entry };
          }
          if (typeof entry === 'object') {
            const descriptor = { ...entry };
            descriptor.path = typeof descriptor.path === 'string' ? descriptor.path.trim() : '';
            descriptor.attributes = descriptor.attributes && typeof descriptor.attributes === 'object' ? descriptor.attributes : {};
            descriptor.preloadedSelector =
              typeof descriptor.preloadedSelector === 'string' && descriptor.preloadedSelector.trim().length
                ? descriptor.preloadedSelector.trim()
                : null;
            return descriptor.path ? descriptor : null;
          }
          return null;
        })
        .filter(Boolean);
    }

    function prepareScriptAttributes(moduleId, attributes = {}) {
      const prepared = { 'data-module-id': moduleId };
      Object.entries(attributes).forEach(([key, value]) => {
        if (!key) {
          return;
        }
        if (value === null || typeof value === 'undefined') {
          prepared[key] = '';
        } else if (typeof value === 'string') {
          prepared[key] = value;
        } else {
          prepared[key] = String(value);
        }
      });
      return prepared;
    }

    async function loadScriptWithCandidates(moduleId, scriptDescriptor) {
      const candidates = createAssetUrlCandidates(scriptDescriptor.path, {
        preloadedSelector: scriptDescriptor.preloadedSelector,
      });
      if (!Array.isArray(candidates) || candidates.length === 0) {
        const missingError = new Error(`Unable to resolve asset URL candidates for module script: ${scriptDescriptor.path}`);
        missingError.code = 'module-script-missing';
        throw missingError;
      }
      let lastError = null;
      for (const candidate of candidates) {
        try {
          const attrs = prepareScriptAttributes(moduleId, scriptDescriptor.attributes);
          const element = await loadScript(candidate, attrs);
          return { element, url: candidate, source: scriptDescriptor.path };
        } catch (error) {
          lastError = error;
        }
      }
      const failure = new Error(`Failed to load module script: ${scriptDescriptor.path}`);
      failure.code = 'module-script-load-failure';
      failure.cause = lastError;
      throw failure;
    }

    function registerModule(descriptor) {
      const id = normaliseId(descriptor?.id);
      if (modules.has(id)) {
        throw new Error(`Module already registered: ${id}`);
      }
      const entry = {
        descriptor: {
          id,
          type: descriptor?.type ?? 'module',
          label: descriptor?.label ?? id,
          dependencies: Array.isArray(descriptor?.dependencies) ? descriptor.dependencies.map(normaliseId) : [],
          scripts: normaliseScripts(descriptor?.scripts),
          global: descriptor?.global ?? null,
          load: typeof descriptor?.load === 'function' ? descriptor.load : null,
          initialise: typeof descriptor?.initialise === 'function' ? descriptor.initialise : null,
          teardown: typeof descriptor?.teardown === 'function' ? descriptor.teardown : null,
          boundary: descriptor?.boundary ?? 'runtime',
          stage: descriptor?.stage ?? `${id}.load`,
          required: descriptor?.required !== false,
          onError: typeof descriptor?.onError === 'function' ? descriptor.onError : null,
        },
        state: {
          id,
          status: 'idle',
          instance: null,
          scriptHandles: [],
          error: null,
          promise: null,
          lastLoadedAt: null,
          reloadCount: 0,
        },
      };
      modules.set(id, entry);
      notifyChange(id);
      return id;
    }

    function getModuleEntry(id) {
      const normalised = normaliseId(id);
      const entry = modules.get(normalised);
      if (!entry) {
        throw new Error(`Unknown module: ${normalised}`);
      }
      return entry;
    }

    async function ensureDependencies(entry, options) {
      const deps = entry.descriptor.dependencies || [];
      for (const depId of deps) {
        await ensureModule(depId, { ...options, parent: entry.descriptor.id });
      }
    }

    async function loadModule(id, options = {}) {
      const entry = getModuleEntry(id);
      if (entry.state.status === 'loaded' && options.force !== true) {
        return entry.state.instance;
      }
      if (entry.state.promise) {
        return entry.state.promise;
      }
      const loadPromise = (async () => {
        entry.state.status = 'loading';
        entry.state.error = null;
        notifyChange(id);
        await ensureDependencies(entry, options);
        const scriptHandles = [];
        let lastAttempt = null;
        try {
          for (const scriptDescriptor of entry.descriptor.scripts) {
            lastAttempt = await loadScriptWithCandidates(id, scriptDescriptor);
            scriptHandles.push(lastAttempt);
          }
          entry.state.scriptHandles = scriptHandles;
          let instance = null;
          if (entry.descriptor.load) {
            instance = await entry.descriptor.load({
              globalScope,
              descriptor: entry.descriptor,
              options,
            });
          } else if (entry.descriptor.initialise) {
            instance = await entry.descriptor.initialise({
              globalScope,
              descriptor: entry.descriptor,
              options,
            });
          } else if (entry.descriptor.global) {
            instance = resolveGlobalExport(entry.descriptor.global);
            if (!instance && entry.descriptor.required) {
              throw new Error(`Module global "${entry.descriptor.global}" unavailable after load.`);
            }
          }
          entry.state.instance = instance ?? null;
          entry.state.status = 'loaded';
          entry.state.error = null;
          entry.state.lastLoadedAt = Date.now();
          entry.state.reloadCount += 1;
          notifyChange(id);
          if (typeof logDiagnosticsEvent === 'function') {
            try {
              logDiagnosticsEvent('modules', `Module loaded: ${entry.descriptor.label}`, {
                level: 'info',
                detail: {
                  id,
                  type: entry.descriptor.type,
                  script: lastAttempt?.source ?? null,
                  url: lastAttempt?.url ?? null,
                },
              });
            } catch (logError) {
              globalScope?.console?.debug?.('Failed to log module load event.', logError);
            }
          }
          return entry.state.instance;
        } catch (error) {
          entry.state.status = 'error';
          entry.state.instance = null;
          entry.state.error = error;
          notifyChange(id);
          const detail = {
            reason: 'module-load-failure',
            moduleId: id,
            moduleType: entry.descriptor.type,
            label: entry.descriptor.label,
            script: lastAttempt?.source ?? null,
            url: lastAttempt?.url ?? null,
            parent: options.parent ?? null,
          };
          if (entry.descriptor.onError) {
            try {
              entry.descriptor.onError(error, detail);
            } catch (hookError) {
              globalScope?.console?.debug?.('Module onError handler failed.', hookError);
            }
          }
          handleErrorBoundary(error, {
            boundary: entry.descriptor.boundary ?? 'runtime',
            stage: entry.descriptor.stage ?? `${id}.load`,
            detail,
            rethrow: false,
          });
          if (typeof logDiagnosticsEvent === 'function') {
            try {
              logDiagnosticsEvent('modules', `Module failed to load: ${entry.descriptor.label}`, {
                level: 'error',
                detail,
              });
            } catch (logError) {
              globalScope?.console?.debug?.('Failed to log module load failure.', logError);
            }
          }
          throw error;
        } finally {
          entry.state.promise = null;
        }
      })();
      entry.state.promise = loadPromise;
      return loadPromise;
    }

    function ensureModule(id, options = {}) {
      const entry = getModuleEntry(id);
      if (entry.state.status === 'loaded' && options.force !== true) {
        return Promise.resolve(entry.state.instance);
      }
      return loadModule(id, options);
    }

    async function unloadModule(id, options = {}) {
      const entry = getModuleEntry(id);
      if (entry.state.promise) {
        try {
          await entry.state.promise;
        } catch (error) {
          // Ignore load rejection during unload; state will already be marked as error.
        }
      }
      if (entry.state.scriptHandles && entry.state.scriptHandles.length) {
        entry.state.scriptHandles.forEach((handle) => {
          if (!handle || !handle.element) {
            return;
          }
          try {
            if (typeof handle.element.remove === 'function') {
              handle.element.remove();
            } else if (handle.element.parentNode && typeof handle.element.parentNode.removeChild === 'function') {
              handle.element.parentNode.removeChild(handle.element);
            }
          } catch (removeError) {
            globalScope?.console?.debug?.('Failed to remove module script element.', removeError);
          }
        });
      }
      entry.state.scriptHandles = [];
      if (entry.descriptor.teardown) {
        try {
          await entry.descriptor.teardown({
            globalScope,
            descriptor: entry.descriptor,
            options,
          });
        } catch (error) {
          globalScope?.console?.debug?.('Module teardown threw an error.', error);
        }
      }
      entry.state.instance = null;
      entry.state.status = 'idle';
      entry.state.error = null;
      notifyChange(id);
    }

    async function reloadModule(id, options = {}) {
      await unloadModule(id, options);
      return loadModule(id, { ...options, force: true });
    }

    function getModuleState(id) {
      if (typeof id === 'undefined') {
        const snapshots = [];
        modules.forEach((entry) => {
          snapshots.push(cloneModuleState(entry.state, entry.descriptor));
        });
        return snapshots;
      }
      const entry = getModuleEntry(id);
      return cloneModuleState(entry.state, entry.descriptor);
    }

    function hasModule(id) {
      try {
        const normalised = normaliseId(id);
        return modules.has(normalised);
      } catch (error) {
        return false;
      }
    }

    function onChange(listener) {
      if (typeof listener !== 'function') {
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    function offChange(listener) {
      listeners.delete(listener);
    }

    return {
      register: registerModule,
      load: loadModule,
      ensure: ensureModule,
      unload: unloadModule,
      reload: reloadModule,
      getState: getModuleState,
      has: hasModule,
      onChange,
      offChange,
    };
  }

  const dynamicModuleLoader = createDynamicModuleLoader();

  const MODULE_PLUGIN_DEPENDENCIES = Object.freeze([
    'plugin:asset-resolver',
    'plugin:audio-aliases',
    'plugin:audio-captions',
    'plugin:combat-utils',
    'plugin:crafting',
    'plugin:portal-mechanics',
    'plugin:scoreboard-utils',
  ]);

  dynamicModuleLoader.register({
    id: 'plugin:asset-resolver',
    type: 'plugin',
    label: 'Asset resolver',
    scripts: [{ path: 'asset-resolver.js', attributes: { 'data-module': 'asset-resolver' } }],
    global: 'InfiniteRailsAssetResolver',
    boundary: 'bootstrap',
    stage: 'modules.asset-resolver.load',
    teardown: () => {
      try {
        delete globalScope.InfiniteRailsAssetResolver;
      } catch (error) {
        globalScope?.console?.debug?.('Failed to tear down asset resolver module.', error);
      }
    },
  });

  dynamicModuleLoader.register({
    id: 'plugin:audio-aliases',
    type: 'plugin',
    label: 'Audio aliases',
    scripts: [{ path: 'audio-aliases.js', attributes: { 'data-module': 'audio-aliases' } }],
    global: 'INFINITE_RAILS_AUDIO_ALIASES',
    boundary: 'bootstrap',
    stage: 'modules.audio-aliases.load',
    teardown: () => {
      try {
        delete globalScope.INFINITE_RAILS_AUDIO_ALIASES;
      } catch (error) {
        globalScope?.console?.debug?.('Failed to tear down audio alias module.', error);
      }
    },
  });

  dynamicModuleLoader.register({
    id: 'plugin:audio-captions',
    type: 'plugin',
    label: 'Audio captions',
    scripts: [{ path: 'audio-captions.js', attributes: { 'data-module': 'audio-captions' } }],
    global: 'INFINITE_RAILS_AUDIO_CAPTIONS',
    boundary: 'bootstrap',
    stage: 'modules.audio-captions.load',
    teardown: () => {
      try {
        delete globalScope.INFINITE_RAILS_AUDIO_CAPTIONS;
      } catch (error) {
        globalScope?.console?.debug?.('Failed to tear down audio captions module.', error);
      }
    },
  });

  dynamicModuleLoader.register({
    id: 'plugin:combat-utils',
    type: 'plugin',
    label: 'Combat utilities',
    scripts: [{ path: 'combat-utils.js', attributes: { 'data-module': 'combat-utils' } }],
    global: 'CombatUtils',
    boundary: 'bootstrap',
    stage: 'modules.combat-utils.load',
    teardown: () => {
      try {
        delete globalScope.CombatUtils;
      } catch (error) {
        globalScope?.console?.debug?.('Failed to tear down combat utilities module.', error);
      }
    },
  });

  dynamicModuleLoader.register({
    id: 'plugin:crafting',
    type: 'plugin',
    label: 'Crafting utilities',
    scripts: [{ path: 'crafting.js', attributes: { 'data-module': 'crafting' } }],
    global: 'Crafting',
    boundary: 'bootstrap',
    stage: 'modules.crafting.load',
    teardown: () => {
      try {
        delete globalScope.Crafting;
      } catch (error) {
        globalScope?.console?.debug?.('Failed to tear down crafting module.', error);
      }
    },
  });

  dynamicModuleLoader.register({
    id: 'plugin:portal-mechanics',
    type: 'plugin',
    label: 'Portal mechanics',
    scripts: [{ path: 'portal-mechanics.js', attributes: { 'data-module': 'portal-mechanics' } }],
    global: 'PortalMechanics',
    boundary: 'bootstrap',
    stage: 'modules.portal-mechanics.load',
    teardown: () => {
      try {
        delete globalScope.PortalMechanics;
      } catch (error) {
        globalScope?.console?.debug?.('Failed to tear down portal mechanics module.', error);
      }
    },
  });

  dynamicModuleLoader.register({
    id: 'plugin:scoreboard-utils',
    type: 'plugin',
    label: 'Scoreboard utilities',
    scripts: [{ path: 'scoreboard-utils.js', attributes: { 'data-module': 'scoreboard-utils' } }],
    global: 'ScoreboardUtils',
    boundary: 'bootstrap',
    stage: 'modules.scoreboard-utils.load',
    teardown: () => {
      try {
        delete globalScope.ScoreboardUtils;
      } catch (error) {
        globalScope?.console?.debug?.('Failed to tear down scoreboard utilities module.', error);
      }
    },
  });

  dynamicModuleLoader.register({
    id: 'renderer:simple',
    type: 'renderer',
    label: 'Sandbox renderer',
    dependencies: MODULE_PLUGIN_DEPENDENCIES,
    scripts: [{ path: 'simple-experience.js', attributes: { 'data-module': 'simple-experience' } }],
    global: 'SimpleExperience',
    boundary: 'simple-experience',
    stage: 'modules.simple-experience.load',
    teardown: () => {
      try {
        delete globalScope.SimpleExperience;
      } catch (error) {
        globalScope?.console?.debug?.('Failed to tear down simple experience module.', error);
      }
    },
  });

  dynamicModuleLoader.register({
    id: 'renderer:advanced',
    type: 'renderer',
    label: 'Advanced renderer',
    dependencies: MODULE_PLUGIN_DEPENDENCIES,
    load: async () => ({ controller: globalScope.InfiniteRails ?? null }),
    boundary: 'bootstrap',
    stage: 'modules.advanced.load',
    required: false,
  });

  const moduleLoaderApi = {
    register: dynamicModuleLoader.register,
    load: dynamicModuleLoader.load,
    ensure: dynamicModuleLoader.ensure,
    unload: dynamicModuleLoader.unload,
    reload: dynamicModuleLoader.reload,
    getState: dynamicModuleLoader.getState,
    has: dynamicModuleLoader.has,
    onChange: dynamicModuleLoader.onChange,
    offChange: dynamicModuleLoader.offChange,
  };

  globalScope.__INFINITE_RAILS_MODULE_LOADER__ = moduleLoaderApi;
  globalScope.InfiniteRails = globalScope.InfiniteRails || {};
  globalScope.InfiniteRails.modules = moduleLoaderApi;

  const RENDERER_MODULE_IDS = Object.freeze({
    simple: 'renderer:simple',
    sandbox: 'renderer:simple',
    advanced: 'renderer:advanced',
  });
  const RENDERER_MODULE_SET = new Set([
    RENDERER_MODULE_IDS.simple,
    RENDERER_MODULE_IDS.advanced,
  ]);
  const RENDERER_PLUGIN_IDS = Object.freeze([...MODULE_PLUGIN_DEPENDENCIES]);
  const RENDERER_PLUGIN_SET = new Set(RENDERER_PLUGIN_IDS);

  function normaliseRendererModeInput(value) {
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === 'simple' || trimmed === 'sandbox') {
        return 'simple';
      }
      if (trimmed === 'advanced' || trimmed === 'default') {
        return 'advanced';
      }
    }
    return null;
  }

  function resolveRendererModuleId(mode) {
    const normalised = normaliseRendererModeInput(mode);
    if (!normalised) {
      throw new Error(`Unknown renderer mode: ${mode}`);
    }
    return RENDERER_MODULE_IDS[normalised];
  }

  function withRendererModuleBoundary(mode, operation, runner, options = {}) {
    if (typeof runner !== 'function') {
      return Promise.resolve(null);
    }
    let moduleId;
    let normalisedMode = null;
    try {
      moduleId = resolveRendererModuleId(mode);
      normalisedMode = normaliseRendererModeInput(mode);
    } catch (error) {
      return Promise.reject(error);
    }
    const reason =
      typeof options.reason === 'string' && options.reason.trim().length
        ? options.reason.trim()
        : 'renderer-module-operation';
    const detail = {
      reason,
      operation,
      moduleId,
      mode: normalisedMode,
      ...(options.detail && typeof options.detail === 'object' ? options.detail : {}),
    };
    const stage = `modules.renderers.${normalisedMode ?? 'unknown'}.${operation}`;
    return invokeWithErrorBoundary(() => runner(moduleId, detail), {
      boundary: options.boundary ?? 'modules',
      stage,
      detail,
      rethrow: options.rethrow ?? true,
    });
  }

  function ensureRendererModule(mode, options = {}) {
    return withRendererModuleBoundary(
      mode,
      'ensure',
      (moduleId) =>
        dynamicModuleLoader.ensure(moduleId, {
          ...options,
          mode: normaliseRendererModeInput(mode) ?? options.mode,
        }),
      options,
    );
  }

  function reloadRendererModule(mode, options = {}) {
    return withRendererModuleBoundary(
      mode,
      'reload',
      (moduleId) =>
        dynamicModuleLoader.reload(moduleId, {
          ...options,
          mode: normaliseRendererModeInput(mode) ?? options.mode,
        }),
      options,
    );
  }

  function unloadRendererModule(mode, options = {}) {
    return withRendererModuleBoundary(
      mode,
      'unload',
      (moduleId) =>
        dynamicModuleLoader.unload(moduleId, {
          ...options,
          mode: normaliseRendererModeInput(mode) ?? options.mode,
        }),
      { ...options, rethrow: options.rethrow ?? false },
    );
  }

  function ensureRendererPlugins(options = {}) {
    const reason =
      typeof options.reason === 'string' && options.reason.trim().length
        ? options.reason.trim()
        : 'renderer-plugin-operation';
    const detail = {
      reason,
      mode: normaliseRendererModeInput(options.mode) ?? null,
      operation: 'ensure-plugins',
    };
    return invokeWithErrorBoundary(
      async () => {
        for (const pluginId of RENDERER_PLUGIN_IDS) {
          await dynamicModuleLoader.ensure(pluginId, {
            ...options,
            parent: options.parent ?? 'renderers',
            mode: detail.mode,
          });
        }
        return true;
      },
      {
        boundary: 'modules',
        stage: `modules.renderers.${detail.mode ?? 'shared'}.plugins.ensure`,
        detail,
      },
    );
  }

  function reloadRendererPlugins(options = {}) {
    const reason =
      typeof options.reason === 'string' && options.reason.trim().length
        ? options.reason.trim()
        : 'renderer-plugin-reload';
    const detail = {
      reason,
      mode: normaliseRendererModeInput(options.mode) ?? null,
      operation: 'reload-plugins',
    };
    return invokeWithErrorBoundary(
      async () => {
        for (const pluginId of RENDERER_PLUGIN_IDS) {
          await dynamicModuleLoader.reload(pluginId, {
            ...options,
            parent: options.parent ?? 'renderers',
            mode: detail.mode,
          });
        }
        return true;
      },
      {
        boundary: 'modules',
        stage: `modules.renderers.${detail.mode ?? 'shared'}.plugins.reload`,
        detail,
      },
    );
  }

  function getRendererModuleState(mode, options = {}) {
    if (typeof mode === 'undefined') {
      return listRendererRelatedModuleStates({ includePlugins: options.includePlugins !== false });
    }
    try {
      const moduleId = resolveRendererModuleId(mode);
      return dynamicModuleLoader.getState(moduleId);
    } catch (error) {
      globalScope?.console?.debug?.('Failed to resolve renderer module state.', error);
      return null;
    }
  }

  function listRendererRelatedModuleStates({ includePlugins = true } = {}) {
    const snapshot = dynamicModuleLoader.getState();
    if (!Array.isArray(snapshot)) {
      return [];
    }
    return snapshot.filter((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      if (RENDERER_MODULE_SET.has(entry.id)) {
        return true;
      }
      if (includePlugins && RENDERER_PLUGIN_SET.has(entry.id)) {
        return true;
      }
      return false;
    });
  }

  function addRendererModuleChangeListener(listener, options = {}) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    const includePlugins = options.includePlugins === true;
    const targets = new Set(RENDERER_MODULE_SET);
    if (includePlugins) {
      RENDERER_PLUGIN_SET.forEach((id) => targets.add(id));
    }
    const handler = (id, state) => {
      if (!targets.has(id)) {
        return;
      }
      try {
        listener(id, state);
      } catch (error) {
        globalScope?.console?.debug?.('Renderer module listener threw an error.', error);
      }
    };
    dynamicModuleLoader.onChange(handler);
    return () => {
      dynamicModuleLoader.offChange(handler);
    };
  }

  const renderersApi = globalScope.InfiniteRails.renderers || {};
  renderersApi.moduleIds = Object.freeze({
    simple: RENDERER_MODULE_IDS.simple,
    sandbox: RENDERER_MODULE_IDS.simple,
    advanced: RENDERER_MODULE_IDS.advanced,
  });
  renderersApi.pluginIds = RENDERER_PLUGIN_IDS;
  renderersApi.ensure = ensureRendererModule;
  renderersApi.reload = reloadRendererModule;
  renderersApi.unload = unloadRendererModule;
  renderersApi.ensurePlugins = ensureRendererPlugins;
  renderersApi.reloadPlugins = reloadRendererPlugins;
  renderersApi.getState = getRendererModuleState;
  renderersApi.listStates = listRendererRelatedModuleStates;
  renderersApi.onChange = (listener, options = {}) => addRendererModuleChangeListener(listener, options);
  renderersApi.offChange = (unsubscribe) => {
    if (typeof unsubscribe === 'function') {
      try {
        unsubscribe();
      } catch (error) {
        globalScope?.console?.debug?.('Renderer module unsubscribe handler failed.', error);
      }
    }
  };
  globalScope.InfiniteRails.renderers = renderersApi;

  function formatAssetLogLabel(detail) {
    const kind = typeof detail?.kind === 'string' && detail.kind.trim().length ? detail.kind.trim() : 'asset';
    const key = typeof detail?.key === 'string' && detail.key.trim().length ? detail.key.trim() : null;
    return key ? `${kind}:${key}` : kind;
  }

  function capitaliseFirstWord(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  }

  function formatAssetRetrySubject(detail) {
    const rawKey = typeof detail?.key === 'string' && detail.key.trim().length ? detail.key.trim() : '';
    const key = rawKey.startsWith('texture:') ? rawKey.slice('texture:'.length) : rawKey;
    const kind = typeof detail?.kind === 'string' && detail.kind.trim().length ? detail.kind.trim() : '';
    if (key && key !== 'asset') {
      if (kind === 'models') {
        return `${key} models`;
      }
      if (kind === 'textures') {
        return `${key} textures`;
      }
      return `${key} assets`;
    }
    if (kind === 'models') {
      return 'model assets';
    }
    if (kind === 'textures') {
      return 'texture assets';
    }
    return 'critical assets';
  }

  function formatAssetRetryAttemptSummary(attempt, limit) {
    if (!Number.isFinite(attempt)) {
      return '';
    }
    const attemptNumber = Math.max(1, Math.floor(attempt));
    if (Number.isFinite(limit) && limit >= attemptNumber) {
      const maxAttempts = Math.max(attemptNumber, Math.floor(limit));
      return `attempt ${attemptNumber} of ${maxAttempts}`;
    }
    return `attempt ${attemptNumber}`;
  }

  function summariseAssetUrl(url) {
    if (typeof url !== 'string' || !url.trim().length) {
      return null;
    }
    const trimmed = url.trim();
    try {
      const parsed = new URL(trimmed, globalScope?.location?.href ?? undefined);
      if (parsed.origin && parsed.pathname) {
        const shortPath = parsed.pathname.replace(/\/+/, '/');
        return `${parsed.origin}${shortPath}`;
      }
      return parsed.href;
    } catch (error) {
      return trimmed;
    }
  }

  let lastRendererFailureDetail = null;

  function formatRendererFailureMessage(detail) {
    const baseMessage =
      typeof detail?.message === 'string' && detail.message.trim().length
        ? detail.message.trim()
        : 'Renderer unavailable. Reload to try again.';
    const stage =
      typeof detail?.stage === 'string' && detail.stage.trim().length ? detail.stage.trim() : null;
    if (!isDebugModeEnabled()) {
      return stage ? `${baseMessage} (${stage})` : baseMessage;
    }
    const extras = [];
    if (stage) {
      extras.push(`Stage: ${stage}`);
    }
    const errorName =
      typeof detail?.errorName === 'string' && detail.errorName.trim().length
        ? detail.errorName.trim()
        : null;
    const errorMessage =
      typeof detail?.error === 'string' && detail.error.trim().length ? detail.error.trim() : null;
    if (errorName && errorMessage) {
      extras.push(`${errorName}: ${errorMessage}`);
    } else if (errorMessage) {
      extras.push(`Error: ${errorMessage}`);
    }
    const stack =
      typeof detail?.stack === 'string' && detail.stack.trim().length ? detail.stack.trim() : null;
    if (stack) {
      extras.push(stack);
    }
    if (extras.length) {
      return `${baseMessage}\n\n${extras.join('\n')}`;
    }
    return baseMessage;
  }

  function ensureSimpleModeQueryParam(scope) {
    const loc = scope?.location;
    if (!loc || typeof loc.href !== 'string' || !loc.href) {
      return false;
    }
    const origin =
      typeof loc.origin === 'string' && loc.origin
        ? loc.origin
        : typeof loc.protocol === 'string' && typeof loc.host === 'string' && loc.host
          ? `${loc.protocol}//${loc.host}`
          : undefined;
    let url;
    try {
      url = origin ? new URL(loc.href, origin) : new URL(loc.href);
    } catch (error) {
      if (scope?.console?.debug) {
        scope.console.debug('Failed to parse current location when applying simple mode query.', error);
      }
      return false;
    }
    const previousMode = url.searchParams.get('mode');
    if (previousMode === 'simple') {
      return false;
    }
    url.searchParams.set('mode', 'simple');
    const newUrl = url.toString();
    const applyUrlToLocation = () => {
      try {
        loc.href = newUrl;
        loc.search = url.search;
        if (typeof url.pathname === 'string') {
          loc.pathname = url.pathname;
        }
        if (typeof url.hash === 'string') {
          loc.hash = url.hash;
        }
        if (typeof url.origin === 'string') {
          loc.origin = url.origin;
        }
        if (typeof url.protocol === 'string') {
          loc.protocol = url.protocol;
        }
        if (typeof url.host === 'string') {
          loc.host = url.host;
        }
        if (typeof url.hostname === 'string') {
          loc.hostname = url.hostname;
        }
      } catch (locationError) {
        if (scope?.console?.debug) {
          scope.console.debug('Failed to synchronise fallback URL on location object.', locationError);
        }
      }
    };
    if (scope?.history && typeof scope.history.replaceState === 'function') {
      try {
        scope.history.replaceState(scope.history.state ?? null, '', newUrl);
        applyUrlToLocation();
        return false;
      } catch (error) {
        if (scope?.console?.debug) {
          scope.console.debug('Failed to replaceState with simple mode fallback URL.', error);
        }
      }
    }
    if (typeof loc.replace === 'function') {
      try {
        loc.replace(newUrl);
        return true;
      } catch (error) {
        if (scope?.console?.debug) {
          scope.console.debug('Failed to replace() location with simple mode fallback URL.', error);
        }
      }
    }
    if (typeof loc.assign === 'function') {
      try {
        loc.assign(newUrl);
        return true;
      } catch (error) {
        if (scope?.console?.debug) {
          scope.console.debug('Failed to assign() location with simple mode fallback URL.', error);
        }
      }
    }
    applyUrlToLocation();
    return false;
  }

  function resolveRendererModeForFallback(detail) {
    const resolveValue = (value) =>
      typeof value === 'string' && value.trim().length ? value.trim() : null;
    const directDetail =
      resolveValue(detail?.mode) ||
      resolveValue(detail?.rendererMode) ||
      resolveValue(detail?.currentMode) ||
      resolveValue(detail?.detail?.mode);
    if (directDetail) {
      return directDetail;
    }
    const apiMode = resolveValue(globalScope?.InfiniteRails?.rendererMode);
    if (apiMode) {
      return apiMode;
    }
    const stateMode = resolveValue(globalScope?.__INFINITE_RAILS_RENDERER_MODE__);
    if (stateMode) {
      return stateMode;
    }
    const snapshotMode = resolveValue(globalScope?.__INFINITE_RAILS_STATE__?.rendererMode);
    if (snapshotMode) {
      return snapshotMode;
    }
    return null;
  }

  function applyRendererReadyState(detail = null, options = {}) {
    bootstrapOverlay.setDiagnostic('renderer', {
      status: 'ok',
      message: 'Renderer initialised successfully.',
    });
    bootstrapOverlay.setDiagnostic('assets', {
      status: 'ok',
      message: 'World assets loaded.',
    });
    bootstrapOverlay.hide({ force: true });
    hideHudAlert();
    if (typeof logDiagnosticsEvent === 'function' && options.log !== false) {
      const logMessage =
        typeof options.logMessage === 'string' && options.logMessage.trim().length
          ? options.logMessage.trim()
          : 'Renderer initialised successfully.';
      const logLevel =
        typeof options.logLevel === 'string' && options.logLevel.trim().length
          ? options.logLevel.trim()
          : 'success';
      const detailPayload = detail && typeof detail === 'object' ? { ...detail } : null;
      const logOptions = { level: logLevel };
      if (detailPayload) {
        logOptions.detail = detailPayload;
      }
      const timestamp = detail && typeof detail === 'object' ? detail.timestamp : undefined;
      if (Number.isFinite(timestamp)) {
        logOptions.timestamp = timestamp;
      }
      logDiagnosticsEvent('startup', logMessage, logOptions);
    }
  }

  function buildRendererDetailFromState(state) {
    if (!state || typeof state !== 'object') {
      return null;
    }
    const detail = {};
    if (typeof state.rendererMode === 'string' && state.rendererMode.trim().length) {
      detail.mode = state.rendererMode.trim();
    }
    if (typeof state.reason === 'string' && state.reason.trim().length) {
      detail.reason = state.reason.trim();
    }
    if (typeof state.isRunning === 'boolean') {
      detail.isRunning = state.isRunning;
    }
    if (Number.isFinite(state.updatedAt)) {
      detail.timestamp = state.updatedAt;
    }
    return Object.keys(detail).length ? detail : null;
  }

  function synchroniseBootstrapWithExistingState() {
    const state = globalScope?.__INFINITE_RAILS_STATE__;
    if (!state || typeof state !== 'object') {
      return;
    }
    if (state.isRunning) {
      const detail = buildRendererDetailFromState(state);
      applyRendererReadyState(detail, {
        logLevel: 'info',
        logMessage: 'Renderer already active — synchronised diagnostics state.',
      });
    }
  }

  function summariseAssetSourceValue(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^data:/i.test(trimmed)) {
      const mimeMatch = trimmed.match(/^data:([^;,]+)/i);
      return mimeMatch ? `data URI (${mimeMatch[1]})` : 'data URI';
    }
    let pathname = trimmed;
    try {
      const parsed = new URL(trimmed, globalScope?.location?.href ?? undefined);
      pathname = parsed.pathname || trimmed;
    } catch (error) {
      const queryIndex = pathname.indexOf('?');
      if (queryIndex >= 0) {
        pathname = pathname.slice(0, queryIndex);
      }
      const hashIndex = pathname.indexOf('#');
      if (hashIndex >= 0) {
        pathname = pathname.slice(0, hashIndex);
      }
    }
    const segments = pathname.split('/').filter(Boolean);
    const fileName = segments.length ? segments[segments.length - 1] : null;
    return fileName || trimmed;
  }

  const hudStateBinding = {
    listener: null,
    ui: null,
    lastSignature: null,
  };

  const hudAlertBinding = {
    element: null,
    titleEl: null,
    messageEl: null,
    hideTimer: null,
  };

  const hudAlertFallbackBinding = {
    container: null,
    titleEl: null,
    messageEl: null,
    hideTimer: null,
    warningLogged: false,
  };

  const HUD_ALERT_FALLBACK_SEVERITY_STYLES = {
    error: { background: '#7f1d1d', border: '#fca5a5', color: '#fef2f2' },
    warning: { background: '#78350f', border: '#fcd34d', color: '#fffbeb' },
    success: { background: '#065f46', border: '#6ee7b7', color: '#ecfdf5' },
    info: { background: '#1e3a8a', border: '#bfdbfe', color: '#eff6ff' },
  };

  function resolveHudAlertElements() {
    const doc = typeof document !== 'undefined' ? document : documentRef;
    if (!doc) {
      return hudAlertBinding;
    }
    const { element } = hudAlertBinding;
    if (element && element.isConnected) {
      return hudAlertBinding;
    }
    hudAlertBinding.element = doc.getElementById('hudAlert');
    hudAlertBinding.titleEl = doc.getElementById('hudAlertTitle');
    hudAlertBinding.messageEl = doc.getElementById('hudAlertMessage');
    return hudAlertBinding;
  }

  function ensureFallbackHudAlertBinding() {
    const doc = typeof document !== 'undefined' ? document : documentRef;
    if (!doc || typeof doc.createElement !== 'function') {
      return null;
    }
    const existing = hudAlertFallbackBinding.container;
    if (existing && existing.isConnected) {
      return hudAlertFallbackBinding;
    }
    const root = doc.body || doc.documentElement;
    if (!root || typeof root.appendChild !== 'function') {
      return null;
    }
    const container = doc.createElement('div');
    container.id = 'hudAlertFallback';
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'assertive');
    container.style.position = 'fixed';
    container.style.top = '16px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.zIndex = '2147483647';
    container.style.maxWidth = 'min(90vw, 480px)';
    container.style.padding = '16px 20px';
    container.style.borderRadius = '12px';
    container.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.35)';
    container.style.fontFamily =
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    container.style.fontSize = '16px';
    container.style.lineHeight = '1.5';
    container.style.textAlign = 'left';
    container.style.pointerEvents = 'none';
    container.style.display = 'none';
    container.setAttribute('aria-hidden', 'true');

    const titleEl = doc.createElement('div');
    titleEl.style.fontWeight = '600';
    titleEl.style.marginBottom = '4px';

    const messageEl = doc.createElement('div');

    container.appendChild(titleEl);
    container.appendChild(messageEl);
    root.appendChild(container);

    hudAlertFallbackBinding.container = container;
    hudAlertFallbackBinding.titleEl = titleEl;
    hudAlertFallbackBinding.messageEl = messageEl;
    hudAlertFallbackBinding.hideTimer = null;
    hudAlertFallbackBinding.warningLogged = false;
    return hudAlertFallbackBinding;
  }

  function hideFallbackHudAlert() {
    const binding = hudAlertFallbackBinding;
    if (binding.hideTimer) {
      clearTimeout(binding.hideTimer);
      binding.hideTimer = null;
    }
    if (binding.container) {
      binding.container.style.display = 'none';
      binding.container.removeAttribute('data-severity');
      binding.container.setAttribute('aria-hidden', 'true');
    }
    if (binding.titleEl) {
      binding.titleEl.textContent = '';
    }
    if (binding.messageEl) {
      binding.messageEl.textContent = '';
    }
  }

  function hideHudAlert() {
    const binding = resolveHudAlertElements();
    if (binding.hideTimer) {
      clearTimeout(binding.hideTimer);
      binding.hideTimer = null;
    }
    if (binding.element) {
      binding.element.hidden = true;
      safelySetAriaHidden(binding.element, true);
      if (typeof binding.element.removeAttribute === 'function') {
        binding.element.removeAttribute('data-severity');
      }
      if (binding.titleEl) {
        binding.titleEl.textContent = '';
        binding.titleEl.hidden = true;
      }
      if (binding.messageEl) {
        binding.messageEl.textContent = '';
        binding.messageEl.hidden = true;
      }
    }
    hideFallbackHudAlert();
  }

  function showHudAlert({
    title = '',
    message = '',
    severity = 'error',
    autoHideMs = null,
  } = {}) {
    const binding = resolveHudAlertElements();
    if (binding.hideTimer) {
      clearTimeout(binding.hideTimer);
      binding.hideTimer = null;
    }
    const safeTitle = typeof title === 'string' ? title.trim() : '';
    const safeMessage = typeof message === 'string' ? message.trim() : '';
    const severityKey = typeof severity === 'string' ? severity.trim().toLowerCase() : '';
    const allowedSeverities = new Set(['error', 'warning', 'success', 'info']);
    const appliedSeverity = allowedSeverities.has(severityKey) ? severityKey : 'info';
    if (binding.element) {
      binding.element.hidden = false;
      safelySetAriaHidden(binding.element, false);
      binding.element.setAttribute('data-severity', appliedSeverity);
      if (binding.titleEl) {
        binding.titleEl.textContent = safeTitle;
        binding.titleEl.hidden = !safeTitle;
      }
      if (binding.messageEl) {
        binding.messageEl.textContent = safeMessage;
        binding.messageEl.hidden = !safeMessage;
      }
      if (Number.isFinite(autoHideMs) && autoHideMs > 0) {
        binding.hideTimer = setTimeout(() => {
          binding.hideTimer = null;
          hideHudAlert();
        }, autoHideMs);
      }
      hideFallbackHudAlert();
      return;
    }

    const fallback = ensureFallbackHudAlertBinding();
    if (!fallback) {
      if (!hudAlertFallbackBinding.warningLogged && globalScope?.console?.error) {
        hudAlertFallbackBinding.warningLogged = true;
        globalScope.console.error('HUD alert container missing and fallback unavailable.', {
          title: safeTitle,
          message: safeMessage,
          severity: appliedSeverity,
        });
      }
      return;
    }

    if (!fallback.warningLogged && globalScope?.console?.warn) {
      fallback.warningLogged = true;
      globalScope.console.warn('HUD alert container missing; displaying emergency fallback alert.');
    }

    const palette = HUD_ALERT_FALLBACK_SEVERITY_STYLES[appliedSeverity] ||
      HUD_ALERT_FALLBACK_SEVERITY_STYLES.info;
    fallback.container.style.background = palette.background;
    fallback.container.style.border = `1px solid ${palette.border}`;
    fallback.container.style.color = palette.color;
    fallback.container.setAttribute('data-severity', appliedSeverity);
    fallback.container.style.display = 'block';
    fallback.container.setAttribute('aria-hidden', 'false');
    if (fallback.titleEl) {
      fallback.titleEl.textContent = safeTitle || 'Infinite Rails';
      fallback.titleEl.style.display = safeTitle ? 'block' : 'none';
    }
    if (fallback.messageEl) {
      const fallbackText = safeMessage || safeTitle || 'An unexpected error occurred.';
      fallback.messageEl.textContent = fallbackText;
    }
    if (fallback.hideTimer) {
      clearTimeout(fallback.hideTimer);
      fallback.hideTimer = null;
    }
    if (Number.isFinite(autoHideMs) && autoHideMs > 0) {
      fallback.hideTimer = setTimeout(() => {
        fallback.hideTimer = null;
        hideFallbackHudAlert();
      }, autoHideMs);
    }
  }

  const portalShaderFallbackState = {
    active: false,
    reason: null,
    lastMessage: '',
    overlayEl: null,
  };

  if (globalScope && !globalScope.__portalShaderFallbackState) {
    Object.defineProperty(globalScope, '__portalShaderFallbackState', {
      value: portalShaderFallbackState,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }

  function ensurePortalFallbackOverlayElement() {
    if (portalShaderFallbackState.overlayEl?.isConnected) {
      return portalShaderFallbackState.overlayEl;
    }
    const doc = typeof document !== 'undefined' ? document : documentRef;
    if (!doc?.createElement) {
      return null;
    }
    const container = doc.createElement('div');
    container.id = 'portalShaderFallbackOverlay';
    container.className = 'portal-fallback-overlay';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('hidden', '');
    container.hidden = true;

    const badge = doc.createElement('span');
    badge.className = 'portal-fallback-overlay__badge';
    badge.textContent = 'Portal warning';

    const titleEl = doc.createElement('span');
    titleEl.className = 'portal-fallback-overlay__title';
    titleEl.textContent = 'Portal shader offline';

    const messageEl = doc.createElement('p');
    messageEl.className = 'portal-fallback-overlay__message';
    messageEl.textContent = 'Portal using a plain flashing color until shaders recover.';

    container.appendChild(badge);
    container.appendChild(titleEl);
    container.appendChild(messageEl);

    const root = doc.body || doc.documentElement;
    if (root?.appendChild) {
      root.appendChild(container);
    }

    portalShaderFallbackState.overlayEl = container;
    return container;
  }

  function showPortalFallbackOverlay(message, options = {}) {
    const overlay = ensurePortalFallbackOverlayElement();
    if (!overlay) {
      return;
    }
    const title = typeof options.title === 'string' ? options.title.trim() : '';
    if (title) {
      const titleEl = overlay.querySelector('.portal-fallback-overlay__title');
      if (titleEl) {
        titleEl.textContent = title;
      }
    }
    const messageEl = overlay.querySelector('.portal-fallback-overlay__message');
    if (messageEl) {
      messageEl.textContent = message;
    }
    overlay.dataset.visible = 'true';
    overlay.removeAttribute('hidden');
    overlay.hidden = false;
  }

  function applyPortalFallbackDomState(contextMessage) {
    const doc = typeof document !== 'undefined' ? document : documentRef;
    if (!doc) {
      return;
    }
    const root = doc.body || doc.documentElement;
    if (root?.classList) {
      root.classList.add('portal-fallback-active');
    }
    const statusEl = doc.getElementById('portalStatus');
    if (statusEl) {
      statusEl.classList.add('portal-status--fallback');
      statusEl.setAttribute('data-state', 'fallback');
      const stateText = statusEl.querySelector('.portal-status__state');
      if (stateText) {
        stateText.textContent = 'Portal fallback';
      }
      const detailText = statusEl.querySelector('.portal-status__detail') ||
        statusEl.querySelector('.portal-status__text');
      if (detailText && typeof contextMessage === 'string') {
        detailText.textContent = contextMessage;
      }
    }
  }

  function announcePortalShaderFallback(context = {}) {
    const missingUniforms = Array.isArray(context.uniformsMissing)
      ? context.uniformsMissing
      : [];
    const messageParts = [];
    if (missingUniforms.length) {
      messageParts.push(`Missing uniforms: ${missingUniforms.join(', ')}`);
    }
    if (context.error?.message) {
      messageParts.push(`Error: ${context.error.message}`);
    }
    const fallbackExplanation =
      'Portal shader offline — plain flashing color active while shaders recover.';
    const overlayDetail =
      messageParts.length > 0
        ? `${fallbackExplanation} ${messageParts.join(' ')}`
        : `${fallbackExplanation} Shader initialisation failed.`;
    const overlayTitle =
      context.reason === 'missing-uniforms'
        ? 'Portal uniforms missing'
        : context.reason === 'construction-error'
          ? 'Portal shader error'
          : 'Portal shader offline';
    const overlayKey = `${overlayTitle}::${overlayDetail}`;

    const alreadyActive = portalShaderFallbackState.active;
    portalShaderFallbackState.active = true;
    portalShaderFallbackState.reason = context.reason ?? portalShaderFallbackState.reason ?? 'unknown';

    if (portalShaderFallbackState.lastMessage !== overlayKey) {
      portalShaderFallbackState.lastMessage = overlayKey;
      applyPortalFallbackDomState('Shader offline — plain flashing color active.');
      showPortalFallbackOverlay(overlayDetail, { title: overlayTitle });
      showHudAlert({
        title: 'Portal shader offline',
        message: overlayDetail,
        severity: 'warning',
        autoHideMs: null,
      });
    } else if (!alreadyActive) {
      applyPortalFallbackDomState('Shader offline — plain flashing color active.');
      showPortalFallbackOverlay(overlayDetail, { title: overlayTitle });
    }

    if (globalScope?.console?.warn) {
      const logContext = { ...context };
      if (logContext.error instanceof Error) {
        logContext.error = {
          message: logContext.error.message,
          stack: logContext.error.stack,
        };
      }
      globalScope.console.warn('Portal shader fallback activated.', logContext);
    }
  }

  function findMissingPortalUniforms(uniforms) {
    if (!uniforms || typeof uniforms !== 'object') {
      return [];
    }
    const missing = [];
    Object.entries(uniforms).forEach(([name, entry]) => {
      if (!entry || typeof entry !== 'object') {
        missing.push(name);
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
        missing.push(name);
        return;
      }
      const value = entry.value;
      if (value === null || value === undefined) {
        missing.push(name);
        return;
      }
      if (typeof value === 'number' && Number.isNaN(value)) {
        missing.push(name);
      }
    });
    return missing;
  }

  function createPortalFallbackMaterial(three, context = {}) {
    const baseColor = new three.Color(context.baseColor || '#7f5af0');
    const flashColor = baseColor.clone();
    const material = new three.MeshBasicMaterial({
      color: baseColor.clone(),
      transparent: true,
      opacity: 0.55,
      blending: three.AdditiveBlending,
      depthWrite: false,
      side: three.DoubleSide,
    });
    material.name = 'PortalShaderFallbackMaterial';
    material.userData = {
      ...material.userData,
      portalFallback: true,
      portalFallbackReason: context.reason ?? 'unknown',
      portalFallbackDetail: context.detail ?? null,
    };
    material.onBeforeRender = function portalFallbackPulse() {
      try {
        const now =
          (typeof globalScope !== 'undefined' && globalScope.performance?.now)
            ? globalScope.performance.now()
            : typeof performance !== 'undefined' && performance.now
              ? performance.now()
              : Date.now();
        const pulse = (Math.sin((now / 1000) * 2.8) + 1) / 2;
        flashColor.copy(baseColor);
        flashColor.offsetHSL(0, 0, (pulse - 0.5) * 0.25);
        this.color.lerp(flashColor, 0.6);
        this.opacity = 0.32 + pulse * 0.36;
      } catch (error) {
        this.color.copy(baseColor);
        this.opacity = 0.5;
      }
    };
    material.needsUpdate = true;
    return material;
  }

  function installPortalShaderFallback(three) {
    if (!three || three.__portalShaderFallbackInstalled) {
      return;
    }
    const { ShaderMaterial } = three;
    if (typeof ShaderMaterial !== 'function' || typeof three.MeshBasicMaterial !== 'function') {
      return;
    }
    const originalShaderMaterial = ShaderMaterial;
    const proxy = new Proxy(originalShaderMaterial, {
      construct(target, args, newTarget) {
        const params = Array.isArray(args) && args.length > 0 ? args[0] ?? {} : {};
        const missingUniforms = findMissingPortalUniforms(params.uniforms);
        if (missingUniforms.length > 0) {
          announcePortalShaderFallback({ reason: 'missing-uniforms', uniformsMissing: missingUniforms });
          return createPortalFallbackMaterial(three, {
            reason: 'missing-uniforms',
            detail: { uniformsMissing },
          });
        }
        try {
          return Reflect.construct(target, args, newTarget);
        } catch (error) {
          announcePortalShaderFallback({ reason: 'construction-error', error });
          return createPortalFallbackMaterial(three, {
            reason: 'construction-error',
            detail: { error },
          });
        }
      },
      apply(target, thisArg, args) {
        return proxy.construct(target, args, target);
      },
    });
    three.ShaderMaterial = proxy;
    three.__portalShaderFallbackInstalled = true;
  }

  function patchThreeInstance(three) {
    try {
      installPortalShaderFallback(three);
    } catch (error) {
      if (globalScope?.console?.debug) {
        globalScope.console.debug('Failed to install portal shader fallback hooks.', error);
      }
    }
    return three;
  }

  function createHeartMarkupFromHealth(health) {
    const numeric = Number.isFinite(health) ? Math.max(0, Math.round(health)) : 0;
    const fullHearts = Math.floor(numeric / 2);
    const halfHeart = numeric % 2;
    const pieces = [];
    for (let i = 0; i < 5; i += 1) {
      const index = i * 2;
      let glyph = '♡';
      if (index + 1 <= fullHearts) {
        glyph = '❤';
      } else if (index < fullHearts + halfHeart) {
        glyph = '❥';
      }
      pieces.push(`<span class="heart-icon" aria-hidden="true">${glyph}</span>`);
    }
    return `<span class="hud-hearts" role="img" aria-label="${numeric / 2} hearts remaining">${pieces.join('')}</span>`;
  }

  function formatHudPointValue(value) {
    const numeric = Math.max(0, Number(value) || 0);
    if (!Number.isFinite(numeric)) {
      return '0';
    }
    const maxFractionDigits = numeric < 1 ? 2 : numeric < 10 ? 1 : 0;
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFractionDigits,
    });
  }

  function formatHudMetric(count, singularLabel, pluralLabel, points) {
    const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
    const label = safeCount === 1 ? singularLabel : pluralLabel;
    const formattedPoints = formatHudPointValue(points);
    return `${safeCount} ${label} (+${formattedPoints} pts)`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function applyHudStateSnapshot(stateLike) {
    const ui = hudStateBinding.ui;
    if (!ui) {
      return;
    }
    const state = stateLike && typeof stateLike === 'object' ? stateLike : globalScope.__INFINITE_RAILS_STATE__;
    if (!state || typeof state !== 'object') {
      return;
    }
    const signature = typeof state.signature === 'string' ? state.signature : null;
    if (signature && hudStateBinding.lastSignature === signature) {
      return;
    }
    hudStateBinding.lastSignature = signature;
    const ensureNumber = (value, fallback = 0) =>
      Number.isFinite(value) ? Number(value) : fallback;
    const clamp01 = (value, fallback = 0) => {
      if (!Number.isFinite(value)) {
        return fallback;
      }
      if (value <= 0) {
        return 0;
      }
      if (value >= 1) {
        return 1;
      }
      return value;
    };
    const player = state.player && typeof state.player === 'object' ? state.player : {};
    if (ui.heartsEl) {
      const healthValue = ensureNumber(player.health, ensureNumber(player.maxHealth, 0));
      ui.heartsEl.innerHTML = createHeartMarkupFromHealth(healthValue);
      ui.heartsEl.setAttribute('data-hearts', String(Math.max(0, Math.round(healthValue / 2))));
    }
    if (ui.bubblesEl) {
      const maxBreath = Math.max(1, Math.round(ensureNumber(player.maxBreath, 10)));
      const breath = Math.min(maxBreath, Math.max(0, Math.round(ensureNumber(player.breath, maxBreath))));
      const percent = Math.max(0, Math.min(100, Math.round(ensureNumber(player.breathPercent, (breath / maxBreath) * 100))));
      const stateLabel = percent <= 0 ? 'empty' : percent < 35 ? 'low' : 'ok';
      ui.bubblesEl.textContent = `Air ${percent}%`;
      ui.bubblesEl.dataset.state = stateLabel;
      ui.bubblesEl.setAttribute('aria-label', `Air remaining: ${percent}%`);
    }
    const score = state.score || {};
    const breakdown = score.breakdown || {};
    if (ui.scoreTotalEl) {
      const totalScore = Math.max(0, Math.round(ensureNumber(score.total, 0)));
      ui.scoreTotalEl.textContent = totalScore.toLocaleString();
    }
    if (ui.scoreRecipesEl) {
      const recipePoints = ensureNumber(breakdown.recipes ?? breakdown.crafting, 0);
      const craftEvents = ensureNumber(score.craftingEvents, ensureNumber(score.recipes, 0));
      ui.scoreRecipesEl.textContent = formatHudMetric(craftEvents, 'craft', 'crafts', recipePoints);
    }
    if (ui.scoreDimensionsEl) {
      const dimensionCount = Math.max(1, Math.round(ensureNumber(score.dimensions, 1)));
      const dimensionPoints = ensureNumber(breakdown.dimensions, 0);
      const penaltyPoints = ensureNumber(breakdown.penalties, 0);
      let display = `${dimensionCount} (+${formatHudPointValue(dimensionPoints)} pts`;
      if (penaltyPoints > 0) {
        display += `, -${formatHudPointValue(penaltyPoints)} penalty`;
      }
      display += ')';
      ui.scoreDimensionsEl.textContent = display;
    }
    if (ui.scorePortalsEl) {
      const portalPoints = ensureNumber(breakdown.portal ?? breakdown.portals, 0);
      const portalEvents = ensureNumber(score.portalEvents, 0);
      ui.scorePortalsEl.textContent = formatHudMetric(portalEvents, 'event', 'events', portalPoints);
    }
    if (ui.scoreCombatEl) {
      const combatPoints = ensureNumber(breakdown.combat, 0);
      const combatEvents = ensureNumber(score.combatEvents, 0);
      ui.scoreCombatEl.textContent = formatHudMetric(combatEvents, 'victory', 'victories', combatPoints);
    }
    if (ui.scoreLootEl) {
      const lootPoints = ensureNumber(breakdown.loot, 0);
      const lootEvents = ensureNumber(score.lootEvents, 0);
      ui.scoreLootEl.textContent = formatHudMetric(lootEvents, 'find', 'finds', lootPoints);
    }
    const portal = state.portal || {};
    if (ui.portalProgressLabel) {
      const label =
        typeof portal.progressLabel === 'string' && portal.progressLabel.trim().length
          ? portal.progressLabel.trim()
          : `Portal frame ${Math.max(0, Math.round(ensureNumber(portal.progressPercent, ensureNumber(portal.progress, 0) * 100)))}%`;
      ui.portalProgressLabel.textContent = label;
    }
    if (ui.portalProgressBar) {
      if (Number.isFinite(portal.displayProgress)) {
        ui.portalProgressBar.style.setProperty('--progress', Number(portal.displayProgress).toFixed(2));
      } else {
        ui.portalProgressBar.style.removeProperty('--progress');
      }
    }
    if (ui.portalStatusEl) {
      const statusState =
        typeof portal.state === 'string' && portal.state.trim().length ? portal.state.trim() : 'inactive';
      const statusLabel =
        typeof portal.statusLabel === 'string' && portal.statusLabel.trim().length
          ? portal.statusLabel.trim()
          : 'Portal Dormant';
      const statusMessageBase =
        typeof portal.statusMessage === 'string' && portal.statusMessage.trim().length
          ? portal.statusMessage.trim()
          : null;
      const remainingBlocks = ensureNumber(portal.remainingBlocks, null);
      const statusMessage = statusMessageBase
        ? statusMessageBase
        : Number.isFinite(remainingBlocks) && remainingBlocks > 0
          ? `${remainingBlocks} frame block${remainingBlocks === 1 ? '' : 's'} required to stabilise.`
          : 'Awaiting ignition sequence.';
      ui.portalStatusEl.dataset.state = statusState;
      ui.portalStatusEl.setAttribute('aria-label', `Portal status: ${statusLabel}. ${statusMessage}`);
      if (ui.portalStatusStateText) {
        ui.portalStatusStateText.textContent = statusLabel;
      }
      if (ui.portalStatusDetailText) {
        ui.portalStatusDetailText.textContent = statusMessage;
      } else if (!ui.portalStatusStateText && ui.portalStatusText) {
        ui.portalStatusText.textContent = statusMessage;
      } else if (ui.portalStatusText && ui.portalStatusStateText && !ui.portalStatusDetailText) {
        ui.portalStatusText.textContent = `${statusLabel}: ${statusMessage}`;
      }
      if (ui.portalStatusIcon) {
        ui.portalStatusIcon.dataset.state = statusState;
      }
    }
    const dimension = state.dimension || {};
    if (ui.dimensionInfoEl && dimension) {
      const baseName =
        typeof dimension.name === 'string' && dimension.name.trim().length
          ? dimension.name.trim()
          : 'Unknown Realm';
      const baseDescription =
        typeof dimension.description === 'string' && dimension.description.trim().length
          ? dimension.description.trim()
          : 'Stabilise the rails, gather resources, and prepare the next portal.';
      const baseMeta =
        typeof dimension.meta === 'string' && dimension.meta.trim().length
          ? dimension.meta.trim()
          : 'Portal readiness pending.';
      if (dimension.victory && dimension.victoryDetails) {
        const victory = dimension.victoryDetails;
        const victoryTitle =
          typeof victory.title === 'string' && victory.title.trim().length
            ? victory.title.trim()
            : baseName;
        const victoryMessage =
          typeof victory.message === 'string' && victory.message.trim().length
            ? victory.message.trim()
            : 'Eternal Ingot secured — portal network stabilised.';
        const victoryMeta =
          typeof victory.meta === 'string' && victory.meta.trim().length
            ? victory.meta.trim()
            : baseMeta;
        const replayMarkup = victory.replayAvailable
          ? '<p><button type="button" class="victory-replay-button" data-action="replay-run">Replay Run</button></p>'
          : '';
        ui.dimensionInfoEl.innerHTML = `
          <h3>${escapeHtml(victoryTitle)}</h3>
          <p>${escapeHtml(victoryMessage)}</p>
          <p class="dimension-meta">${escapeHtml(victoryMeta)}</p>
          ${replayMarkup}
        `;
      } else {
        ui.dimensionInfoEl.innerHTML = `
          <h3>${escapeHtml(baseName)}</h3>
          <p>${escapeHtml(baseDescription)}</p>
          <p class="dimension-meta">${escapeHtml(baseMeta)}</p>
        `;
      }
    }
    if (ui.timeEl) {
      const daylight = clamp01(state.daylight, null);
      if (daylight !== null) {
        const percent = Math.round(daylight * 100);
        let label = 'Daylight';
        if (daylight < 0.16) {
          label = 'Nightfall (Midnight)';
        } else if (daylight < 0.32) {
          label = 'Nightfall';
        } else if (daylight < 0.52) {
          label = 'Dawn';
        } else if (daylight > 0.82) {
          label = 'High Sun';
        }
        ui.timeEl.textContent = `${label} ${percent}%`;
      } else if (!ui.timeEl.textContent) {
        ui.timeEl.textContent = 'Daylight 0%';
      }
    }

    const ensureOverlayCopy = (element, fallbackText, options = {}) => {
      if (!element || typeof fallbackText !== 'string' || !fallbackText.trim()) {
        return;
      }
      const hasElementChildren =
        typeof element.childElementCount === 'number'
          ? element.childElementCount > 0
          : Array.isArray(element.children) && element.children.length > 0;
      const currentText = typeof element.textContent === 'string' ? element.textContent.trim() : '';
      if (hasElementChildren || currentText.length > 0) {
        return;
      }
      element.textContent = fallbackText;
      const datasetUpdates = options.dataset;
      if (datasetUpdates && element.dataset) {
        Object.keys(datasetUpdates).forEach((key) => {
          const value = datasetUpdates[key];
          if (typeof value === 'string' && value.trim().length) {
            element.dataset[key] = value.trim();
          }
        });
      }
    };

    ensureOverlayCopy(
      ui.defeatMessageEl,
      'Respawn to recover your world snapshot and restore your gear.',
    );
    ensureOverlayCopy(ui.defeatInventoryEl, 'Recover world cache ready — inventory will be restored on respawn.', {
      dataset: { empty: 'true' },
    });
    ensureOverlayCopy(
      ui.defeatCountdownEl,
      'Recover world timer syncing…',
    );
    ensureOverlayCopy(ui.defeatRespawnButton, 'Respawn Now');
  }

  function ensureHudStateBinding(ui) {
    if (!ui || typeof globalScope?.addEventListener !== 'function') {
      return;
    }
    hudStateBinding.ui = ui;
    if (!hudStateBinding.listener) {
      hudStateBinding.listener = (event) => {
        applyHudStateSnapshot(event?.detail);
      };
      globalScope.addEventListener('infinite-rails:state', hudStateBinding.listener);
    }
    applyHudStateSnapshot(globalScope.__INFINITE_RAILS_STATE__);
  }

  function extractAssetSourceLabel(detail) {
    if (!detail || typeof detail !== 'object') {
      return null;
    }
    const directLabel =
      (typeof detail.assetSourceLabel === 'string' && detail.assetSourceLabel.trim()) ||
      (typeof detail.assetFileName === 'string' && detail.assetFileName.trim());
    if (directLabel) {
      return directLabel.trim();
    }
    const sources = Array.isArray(detail.assetSources) ? detail.assetSources : [];
    for (const value of sources) {
      const label = summariseAssetSourceValue(value);
      if (label) {
        return label;
      }
    }
    return null;
  }

  function formatAssetSummaryLabels(summaries = []) {
    const labels = [];
    summaries.forEach((entry) => {
      const label =
        (typeof entry?.sourceLabel === 'string' && entry.sourceLabel.trim()) ||
        (typeof entry?.fileName === 'string' && entry.fileName.trim());
      if (label) {
        const trimmed = label.trim();
        if (!labels.includes(trimmed)) {
          labels.push(trimmed);
        }
      }
    });
    if (!labels.length) {
      return null;
    }
    if (labels.length === 1) {
      return labels[0];
    }
    if (labels.length === 2) {
      return `${labels[0]} and ${labels[1]}`;
    }
    const head = labels.slice(0, -1).join(', ');
    return `${head}, and ${labels[labels.length - 1]}`;
  }

  if (typeof globalScope?.addEventListener === 'function') {
    globalScope.addEventListener('infinite-rails:started', (event) => {
      cancelRendererStartWatchdog();
      applyRendererReadyState(event?.detail && typeof event.detail === 'object' ? event.detail : null, {
        logLevel: 'success',
        logMessage: 'Renderer initialised successfully.',
      });
    });
    globalScope.addEventListener('infinite-rails:renderer-failure', (event) => {
      cancelRendererStartWatchdog();
      const detail =
        event?.detail && typeof event.detail === 'object' ? { ...event.detail } : {};
      if (typeof detail.message !== 'string' || !detail.message.trim().length) {
        detail.message = 'Renderer unavailable. Reload to try again.';
      }
      lastRendererFailureDetail = detail;
      const failureMessage = formatRendererFailureMessage(detail);
      presentCriticalErrorOverlay({
        title: 'Renderer unavailable',
        message: failureMessage,
        diagnosticScope: 'renderer',
        diagnosticStatus: 'error',
        diagnosticMessage: failureMessage,
        logScope: 'startup',
        logMessage: failureMessage,
        logLevel: 'error',
        detail,
        timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
      });
      const activeMode = resolveRendererModeForFallback(detail);
      if (activeMode !== 'simple') {
        const fallbackContext = {
          reason: 'renderer-failure',
          mode: activeMode || 'unknown',
        };
        if (typeof detail.stage === 'string' && detail.stage.trim().length) {
          fallbackContext.stage = detail.stage.trim();
        }
        tryStartSimpleFallback(
          detail.error instanceof Error ? detail.error : null,
          fallbackContext,
        );
      }
    });
    globalScope.addEventListener('infinite-rails:asset-fallback', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const message =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Asset fallback active — visual polish may be reduced.';
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'warning',
        message,
      });
      showHudAlert({
        title: 'Asset fallback active',
        message,
        severity: 'warning',
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', message, {
          level: 'warning',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-load-failure', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const keyLabel = typeof detail?.key === 'string' && detail.key.trim().length ? detail.key.trim() : null;
      const friendly =
        typeof detail?.fallbackMessage === 'string' && detail.fallbackMessage.trim().length
          ? detail.fallbackMessage.trim()
          : keyLabel
            ? `Asset load failure detected for ${keyLabel}.`
            : 'Critical asset failed to load.';
      const assetLabel =
        typeof detail?.assetLabel === 'string' && detail.assetLabel.trim().length
          ? detail.assetLabel.trim()
          : null;
      const sourceLabel = extractAssetSourceLabel(detail);
      let decoratedFriendly = friendly;
      if (assetLabel && !decoratedFriendly.includes(assetLabel)) {
        decoratedFriendly = `${decoratedFriendly} — ${assetLabel}`;
      }
      if (sourceLabel && !decoratedFriendly.includes(sourceLabel)) {
        decoratedFriendly = `${decoratedFriendly} (Missing: ${sourceLabel})`;
      }
      const failureCount = Number.isFinite(detail?.failureCount) ? detail.failureCount : null;
      const errorMessage =
        typeof detail?.errorMessage === 'string' && detail.errorMessage.trim().length
          ? detail.errorMessage.trim()
          : null;
      const extraParts = [];
      if (assetLabel && !decoratedFriendly.includes(assetLabel)) {
        extraParts.push(assetLabel);
      }
      if (sourceLabel && !decoratedFriendly.includes(sourceLabel)) {
        extraParts.push(`Missing: ${sourceLabel}`);
      }
      if (failureCount && failureCount > 1) {
        extraParts.push(`Attempts: ${failureCount}`);
      }
      if (errorMessage && errorMessage !== decoratedFriendly) {
        extraParts.push(errorMessage);
      }
      const overlayMessage = extraParts.length
        ? `${decoratedFriendly} — ${extraParts.join(' — ')}`
        : decoratedFriendly;
      presentCriticalErrorOverlay({
        title: 'Assets failed to load',
        message: overlayMessage,
        diagnosticScope: 'assets',
        diagnosticStatus: 'error',
        diagnosticMessage: decoratedFriendly,
        logScope: 'assets',
        logMessage: decoratedFriendly,
        detail,
        timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
      });
      clearAssetLoadingIndicatorByKey(detail?.key ?? detail?.originalKey);
    });
    globalScope.addEventListener('infinite-rails:asset-recovery-prompt', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const message =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Critical assets failed to load after multiple attempts. Reload or retry to continue.';
      const missingSummary = formatAssetSummaryLabels(Array.isArray(detail?.assetSummaries) ? detail.assetSummaries : []);
      const decoratedMessage =
        missingSummary && !/Missing files:/i.test(message)
          ? `${message}${message.trim().endsWith('.') ? '' : '.'} Missing files: ${missingSummary}.`
          : message;
      presentCriticalErrorOverlay({
        title: 'Restore missing assets',
        message: decoratedMessage,
        diagnosticScope: 'assets',
        diagnosticStatus: 'error',
        diagnosticMessage: decoratedMessage,
        logScope: 'assets',
        logMessage: decoratedMessage,
        detail,
        timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
      });
    });
    globalScope.addEventListener('infinite-rails:asset-recovery-prompt-update', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const message =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Retrying missing assets — results pending.';
      const missingSummary = formatAssetSummaryLabels(Array.isArray(detail?.assetSummaries) ? detail.assetSummaries : []);
      const decoratedMessage =
        missingSummary && !/Missing files:/i.test(message)
          ? `${message}${message.trim().endsWith('.') ? '' : '.'} Missing files: ${missingSummary}.`
          : message;
      presentCriticalErrorOverlay({
        title: 'Asset recovery in progress',
        message: decoratedMessage,
        diagnosticScope: 'assets',
        diagnosticStatus: 'error',
        diagnosticMessage: decoratedMessage,
        logScope: 'assets',
        logMessage: decoratedMessage,
        detail,
        timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
      });
    });
    globalScope.addEventListener('infinite-rails:asset-retry-requested', () => {
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'pending',
        message: 'Retrying missing assets…',
      });
      showHudAlert({
        title: 'Retrying missing assets',
        message: 'Retrying missing assets…',
        severity: 'info',
        autoHideMs: 7000,
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', 'Retrying missing assets…', {
          level: 'info',
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-retry-scheduled', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const subject = formatAssetRetrySubject(detail) || 'assets';
      const attemptSummary = formatAssetRetryAttemptSummary(detail?.attempt, detail?.limit);
      const delayMs = Number.isFinite(detail?.delayMs) ? Math.max(0, Math.floor(detail.delayMs)) : null;
      const delaySeconds = Number.isFinite(delayMs) ? Math.max(1, Math.round(delayMs / 1000)) : null;
      let message = delaySeconds
        ? `Retrying ${capitaliseFirstWord(subject)} in ${delaySeconds} second${delaySeconds === 1 ? '' : 's'}`
        : `Retrying ${capitaliseFirstWord(subject)} shortly`;
      if (attemptSummary) {
        message += ` (${attemptSummary}).`;
      } else {
        message += '.';
      }
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'pending',
        message,
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', message, {
          level: 'info',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-retry-attempt', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const subject = formatAssetRetrySubject(detail) || 'assets';
      const attemptSummary = formatAssetRetryAttemptSummary(detail?.attempt, detail?.limit);
      let message = `Retrying ${capitaliseFirstWord(subject)} now`;
      if (attemptSummary) {
        message += ` (${attemptSummary}).`;
      } else {
        message += '.';
      }
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'pending',
        message,
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', message, {
          level: 'info',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-retry-queued', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const keys = Array.isArray(detail?.keys) ? detail.keys : [];
      const label = keys.length ? keys.join(', ') : 'assets';
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'pending',
        message: `Retry queued for ${label}.`,
      });
      showHudAlert({
        title: 'Retry queued',
        message: `Retry queued for ${label}.`,
        severity: 'info',
        autoHideMs: 8000,
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', `Retry queued for ${label}.`, {
          level: 'info',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-retry-success', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const keyLabel = typeof detail?.key === 'string' && detail.key.trim().length ? detail.key.trim() : 'assets';
      const attempts = Number.isFinite(detail?.attempts) ? detail.attempts : null;
      const message = attempts && attempts > 1
        ? `Recovered ${keyLabel} after ${attempts} attempts.`
        : `Recovered ${keyLabel} successfully.`;
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'ok',
        message,
      });
      showHudAlert({
        title: 'Assets recovered',
        message,
        severity: 'success',
        autoHideMs: 7000,
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', message, {
          level: 'success',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-recovery-reload-requested', () => {
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'error',
        message: 'Reload requested to restore missing assets.',
      });
      showHudAlert({
        title: 'Reload required',
        message: 'Reload requested to restore missing assets.',
        severity: 'error',
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', 'Reload requested to restore missing assets.', {
          level: 'error',
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-load-delay-indicator', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      registerAssetLoadingIndicator(detail);
    });
    globalScope.addEventListener('infinite-rails:asset-fetch-start', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const label = formatAssetLogLabel(detail);
      const message = `Fetching ${label}…`;
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', message, {
          level: 'info',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-fetch-complete', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const label = formatAssetLogLabel(detail);
      const duration = Number.isFinite(detail?.duration) ? Math.round(detail.duration) : null;
      const status = detail?.status === 'fulfilled' ? 'fulfilled' : 'failed';
      const urlSummary = summariseAssetUrl(detail?.url);
      const suffix = duration ? (status === 'fulfilled' ? ` in ${duration}ms` : ` after ${duration}ms`) : '';
      let message = status === 'fulfilled'
        ? `Loaded ${label}${suffix}.`
        : `Failed to load ${label}${suffix}.`;
      if (urlSummary) {
        message += status === 'fulfilled' ? ` via ${urlSummary}` : ` (last URL ${urlSummary})`;
      }
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', message, {
          level: status === 'fulfilled' ? 'success' : 'error',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
      clearAssetLoadingIndicator(detail?.kind, detail?.key);
    });
    let audioFallbackOverlayShown = false;
    let audioFallbackAlertArmed = false;
    globalScope.addEventListener('infinite-rails:audio-boot-status', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const fallbackActive = Boolean(detail?.fallbackActive);
      const baseMessage =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : fallbackActive
            ? 'Audio assets unavailable. Playing fallback beep until assets are restored.'
            : 'Audio initialised successfully.';
      const normalizedMessage = fallbackActive ? ensureAudioFallbackWarningMessage(baseMessage) : baseMessage;
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('audio', normalizedMessage, {
          level: fallbackActive ? 'error' : 'success',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
      if (typeof bootstrapOverlay?.setDiagnostic === 'function') {
        bootstrapOverlay.setDiagnostic('audio', {
          status: fallbackActive ? 'error' : 'ok',
          message: normalizedMessage,
        });
      }
      if (fallbackActive) {
        if (!audioFallbackAlertArmed) {
          playAudioFallbackBeep();
          audioFallbackAlertArmed = true;
        }
        if (!audioFallbackOverlayShown) {
          audioFallbackOverlayShown = true;
          presentCriticalErrorOverlay({
            title: 'Audio assets unavailable',
            message: normalizedMessage,
            diagnosticScope: 'audio',
            diagnosticStatus: 'error',
            diagnosticMessage: normalizedMessage,
            logScope: 'audio',
            logMessage: normalizedMessage,
            logLevel: 'error',
            detail: {
              ...detail,
              fallbackActive: true,
              missingSample: detail?.missingSample === true || fallbackActive,
              message: normalizedMessage,
            },
            timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
          });
        }
      } else {
        audioFallbackOverlayShown = false;
        audioFallbackAlertArmed = false;
      }
    });

    globalScope.addEventListener('infinite-rails:audio-error', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      if (detail?.overlayPresented === true) {
        audioFallbackOverlayShown = true;
      }
      const fallbackName =
        typeof detail?.resolvedName === 'string' && detail.resolvedName.trim().length
          ? detail.resolvedName.trim()
          : typeof detail?.requestedName === 'string' && detail.requestedName.trim().length
            ? detail.requestedName.trim()
            : null;
      const fallbackMessage = fallbackName
        ? `Audio sample "${fallbackName}" failed to play.`
        : 'Audio playback issue detected.';
      const baseMessage =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : fallbackMessage;
      const errorName =
        typeof detail?.errorName === 'string' && detail.errorName.trim().length ? detail.errorName.trim() : null;
      const errorMessage =
        typeof detail?.errorMessage === 'string' && detail.errorMessage.trim().length
          ? detail.errorMessage.trim()
          : null;
      const errorCode = typeof detail?.code === 'string' && detail.code.trim().length ? detail.code.trim() : null;
      const missingSampleDetected =
        (errorCode && AUDIO_MISSING_SAMPLE_CODES.has(errorCode)) ||
        detail?.missingSample === true ||
        detail?.fallbackActive === true;
      const normalizedMessage = missingSampleDetected
        ? ensureAudioFallbackWarningMessage(baseMessage)
        : baseMessage;
      if (missingSampleDetected) {
        playAudioFallbackBeep();
      }
      const extraParts = [];
      if (errorName && errorMessage) {
        extraParts.push(`${errorName}: ${errorMessage}`);
      } else if (errorMessage) {
        extraParts.push(errorMessage);
      } else if (errorName) {
        extraParts.push(errorName);
      }
      if (errorCode) {
        extraParts.push(`Code: ${errorCode}`);
      }
      const overlayMessage = extraParts.length
        ? `${normalizedMessage} — ${extraParts.join(' — ')}`
        : normalizedMessage;
      const overlayTitle = missingSampleDetected ? 'Missing audio sample' : 'Audio playback failed';
      const diagnosticStatus = missingSampleDetected ? 'error' : 'warning';
      const overlayDetail = missingSampleDetected
        ? {
            ...detail,
            fallbackActive: true,
            missingSample: true,
            message: normalizedMessage,
          }
        : detail;
      if (!audioFallbackOverlayShown) {
        presentCriticalErrorOverlay({
          title: overlayTitle,
          message: overlayMessage,
          diagnosticScope: 'audio',
          diagnosticStatus,
          diagnosticMessage: normalizedMessage,
          logScope: 'audio',
          logMessage: normalizedMessage,
          detail: overlayDetail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
        audioFallbackOverlayShown = true;
      }
      if (typeof bootstrapOverlay?.setDiagnostic === 'function') {
        const status = missingSampleDetected ? 'error' : 'warning';
        bootstrapOverlay.setDiagnostic('audio', {
          status,
          message: normalizedMessage,
        });
      }
      scheduleAmbientMusicRecovery(detail);
    });
    globalScope.addEventListener('infinite-rails:start-error', (event) => {
      cancelRendererStartWatchdog();
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const stage = typeof detail?.stage === 'string' && detail.stage.trim().length ? detail.stage.trim() : null;
      const baseMessage =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Renderer initialisation failed.';
      const diagnosticMessage = stage && stage !== 'startup' ? `${baseMessage} (${stage})` : baseMessage;
      const errorName =
        typeof detail?.errorName === 'string' && detail.errorName.trim().length ? detail.errorName.trim() : null;
      const errorMessage =
        typeof detail?.errorMessage === 'string' && detail.errorMessage.trim().length
          ? detail.errorMessage.trim()
          : null;
      const extraParts = [];
      if (errorName && errorMessage) {
        extraParts.push(`${errorName}: ${errorMessage}`);
      } else if (errorMessage) {
        extraParts.push(errorMessage);
      }
      const overlayMessage = extraParts.length
        ? `${diagnosticMessage} — ${extraParts.join(' — ')}`
        : diagnosticMessage;
      presentCriticalErrorOverlay({
        title: 'Unable to start expedition',
        message: overlayMessage,
        diagnosticScope: 'renderer',
        diagnosticStatus: 'error',
        diagnosticMessage,
        logScope: 'startup',
        logMessage: diagnosticMessage,
        detail,
        timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
      });
      const activeMode = resolveRendererModeForFallback(detail);
      if (activeMode !== 'simple') {
        const fallbackContext = { reason: 'start-error', mode: activeMode || 'unknown' };
        if (stage) {
          fallbackContext.stage = stage;
        }
        let fallbackError = null;
        if (detail?.error instanceof Error) {
          fallbackError = detail.error;
        } else if (errorMessage) {
          const syntheticError = new Error(errorMessage);
          if (errorName) {
            syntheticError.name = errorName;
          }
          fallbackError = syntheticError;
        }
        tryStartSimpleFallback(fallbackError, fallbackContext);
      }
    });
    globalScope.addEventListener('infinite-rails:initialisation-error', (event) => {
      cancelRendererStartWatchdog();
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const stage = typeof detail?.stage === 'string' && detail.stage.trim().length ? detail.stage.trim() : null;
      const baseMessage =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Initialisation error encountered.';
      const diagnosticMessage = stage && stage !== 'startup' ? `${baseMessage} (${stage})` : baseMessage;
      const errorName =
        typeof detail?.errorName === 'string' && detail.errorName.trim().length ? detail.errorName.trim() : null;
      const reportedErrorMessage =
        typeof detail?.errorMessage === 'string' && detail.errorMessage.trim().length
          ? detail.errorMessage.trim()
          : typeof detail?.error === 'string' && detail.error.trim().length
            ? detail.error.trim()
            : null;
      const extraParts = [];
      if (errorName && reportedErrorMessage) {
        extraParts.push(`${errorName}: ${reportedErrorMessage}`);
      } else if (reportedErrorMessage) {
        extraParts.push(reportedErrorMessage);
      } else if (errorName) {
        extraParts.push(errorName);
      }
      const overlayMessage = extraParts.length
        ? `${diagnosticMessage} — ${extraParts.join(' — ')}`
        : diagnosticMessage;
      presentCriticalErrorOverlay({
        title: 'Initialisation error detected',
        message: overlayMessage,
        diagnosticScope: 'renderer',
        diagnosticStatus: 'error',
        diagnosticMessage,
        logScope: 'startup',
        logMessage: diagnosticMessage,
        detail,
        timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
      });
      const activeMode = resolveRendererModeForFallback(detail);
      if (activeMode !== 'simple') {
        const fallbackContext = { reason: 'initialisation-error', mode: activeMode || 'unknown' };
        if (stage) {
          fallbackContext.stage = stage;
        }
        let fallbackError = null;
        if (detail?.error instanceof Error) {
          fallbackError = detail.error;
        } else {
          const fallbackMessage =
            reportedErrorMessage ||
            (typeof detail?.message === 'string' && detail.message.trim().length ? detail.message.trim() : null) ||
            diagnosticMessage;
          if (fallbackMessage) {
            fallbackError = new Error(fallbackMessage);
            if (errorName) {
              fallbackError.name = errorName;
            }
          }
        }
        tryStartSimpleFallback(fallbackError, fallbackContext);
      }
    });
    globalScope.addEventListener('infinite-rails:score-sync-offline', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const message =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Leaderboard offline — progress saved locally.';
      bootstrapOverlay.setDiagnostic('backend', {
        status: 'error',
        message,
      });
    });
    globalScope.addEventListener('infinite-rails:score-sync-restored', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const message =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Leaderboard connection restored.';
      bootstrapOverlay.setDiagnostic('backend', {
        status: 'ok',
        message,
      });
    });
  }

  function normaliseDiagnosticsEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') {
      return null;
    }
    const trimmed = endpoint.trim();
    if (!trimmed) {
      return null;
    }
    let resolved;
    try {
      resolved = new URL(trimmed, globalScope?.location?.href ?? undefined);
    } catch (error) {
      logConfigWarning(
        'Invalid APP_CONFIG.diagnosticsEndpoint detected; analytics logging disabled. Update APP_CONFIG.diagnosticsEndpoint to a valid absolute HTTP(S) URL to capture diagnostics remotely.',
        {
          diagnosticsEndpoint: endpoint,
          error: error?.message ?? String(error),
        },
      );
      return null;
    }
    const hasExplicitProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    if (!hasExplicitProtocol) {
      logConfigWarning(
        'APP_CONFIG.diagnosticsEndpoint must be an absolute URL including the protocol. Update the configuration to point at an HTTP(S) analytics endpoint.',
        {
          diagnosticsEndpoint: endpoint,
          resolved: resolved.href,
        },
      );
      return null;
    }
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      logConfigWarning(
        'APP_CONFIG.diagnosticsEndpoint must use HTTP or HTTPS. Update the configuration so diagnostics can be sent to a reachable analytics service.',
        {
          diagnosticsEndpoint: endpoint,
          protocol: resolved.protocol,
        },
      );
      return null;
    }
    return resolved.href;
  }

  function normaliseApiBaseUrl(base) {
    if (!base || typeof base !== 'string') {
      return null;
    }
    const trimmed = base.trim();
    if (!trimmed) {
      return null;
    }
    let resolved;
    try {
      resolved = new URL(trimmed, globalScope?.location?.href ?? undefined);
    } catch (error) {
      logConfigWarning(
        'Invalid APP_CONFIG.apiBaseUrl detected; remote sync disabled. Update APP_CONFIG.apiBaseUrl to a valid absolute HTTP(S) URL in your configuration to restore remote synchronisation.',
        {
          apiBaseUrl: base,
          error: error?.message ?? String(error),
        },
      );
      return null;
    }
    const hasExplicitProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    if (!hasExplicitProtocol) {
      logConfigWarning(
        'APP_CONFIG.apiBaseUrl must be an absolute URL including the protocol. Set APP_CONFIG.apiBaseUrl to a fully-qualified HTTP(S) endpoint (for example, https://example.com/api).',
        {
          apiBaseUrl: base,
          resolved: resolved.href,
        },
      );
      return null;
    }
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      logConfigWarning(
        'APP_CONFIG.apiBaseUrl must use HTTP or HTTPS. Update the configuration to point at an HTTP(S) service that can accept leaderboard sync requests.',
        {
          apiBaseUrl: base,
          protocol: resolved.protocol,
        },
      );
      return null;
    }
    if (resolved.search || resolved.hash) {
      logConfigWarning(
        'APP_CONFIG.apiBaseUrl should not include query strings or fragments; ignoring extras. Remove trailing query parameters or hashes from APP_CONFIG.apiBaseUrl so requests reach the API root.',
        {
          apiBaseUrl: base,
          search: resolved.search,
          hash: resolved.hash,
        },
      );
      resolved.search = '';
      resolved.hash = '';
    }
    return resolved.href.replace(/\/+$/, '');
  }

  function buildScoreboardUrl(apiBaseUrl) {
    if (!apiBaseUrl || typeof apiBaseUrl !== 'string') {
      return null;
    }
    return `${apiBaseUrl.replace(/\/$/, '')}/scores`;
  }

  const audioAssetLiveTestState = {
    performed: false,
    success: null,
    detail: null,
    promise: null,
  };

  function resolveWelcomeLiveTestSample() {
    const scope =
      globalScope ||
      (typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
    const aliasSource = scope?.INFINITE_RAILS_AUDIO_ALIASES || null;
    const sampleSource = scope?.INFINITE_RAILS_EMBEDDED_ASSETS?.audioSamples || null;
    const candidates = new Set();
    const addCandidate = (value) => {
      if (typeof value !== 'string') {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed.length) {
        return;
      }
      candidates.add(trimmed);
    };
    if (aliasSource && typeof aliasSource === 'object') {
      const aliasValue = aliasSource.welcome;
      if (Array.isArray(aliasValue)) {
        aliasValue.forEach(addCandidate);
      } else {
        addCandidate(aliasValue);
      }
    }
    addCandidate('welcome');
    const orderedCandidates = Array.from(candidates);
    if (sampleSource && typeof sampleSource === 'object') {
      for (const candidate of orderedCandidates) {
        const payload = sampleSource[candidate];
        if (typeof payload === 'string' && payload.trim().length) {
          const trimmed = payload.trim();
          const src = trimmed.startsWith('data:') ? trimmed : `data:audio/wav;base64,${trimmed}`;
          return { sampleKey: candidate, src, payload: trimmed, missing: false, aliasCandidates: orderedCandidates };
        }
      }
    }
    return {
      sampleKey: orderedCandidates[0] || null,
      src: null,
      payload: null,
      missing: true,
      aliasCandidates: orderedCandidates,
    };
  }

  function dispatchAudioDiagnosticEvent(type, detail) {
    const scope =
      globalScope ||
      (typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
    if (!scope || typeof scope.dispatchEvent !== 'function') {
      return false;
    }
    const EventCtor =
      (typeof scope.CustomEvent === 'function' && scope.CustomEvent) ||
      (typeof CustomEvent === 'function' ? CustomEvent : null);
    if (!EventCtor) {
      return false;
    }
    try {
      scope.dispatchEvent(new EventCtor(type, { detail }));
      return true;
    } catch (error) {
      const consoleRef = getConsoleRef();
      consoleRef?.debug?.(`Failed to dispatch ${type} event.`, error);
    }
    return false;
  }

  function cleanupAudioElement(audio) {
    if (!audio || typeof audio !== 'object') {
      return;
    }
    try {
      if (typeof audio.pause === 'function') {
        audio.pause();
      }
    } catch (pauseError) {}
    try {
      if (typeof audio.currentTime === 'number') {
        audio.currentTime = 0;
      }
    } catch (resetError) {}
    try {
      if (typeof audio.removeAttribute === 'function') {
        audio.removeAttribute('src');
      }
    } catch (removeSrcError) {}
    try {
      if (typeof audio.load === 'function') {
        audio.load();
      }
    } catch (loadError) {}
    try {
      if (typeof audio.remove === 'function') {
        audio.remove();
      }
    } catch (removeError) {}
  }

  function recordAudioAssetLiveTestFailure(message, detail = {}) {
    const consoleRef = getConsoleRef();
    const timestamp = Number.isFinite(detail?.timestamp) ? detail.timestamp : Date.now();
    const normalizedMessage = ensureAudioFallbackWarningMessage(
      typeof message === 'string' && message.trim().length
        ? message.trim()
        : 'Unable to play welcome audio cue.',
    );
    const resolvedName =
      typeof detail?.resolvedName === 'string' && detail.resolvedName.trim().length
        ? detail.resolvedName.trim()
        : null;
    const failureDetail = {
      requestedName: 'welcome',
      resolvedName,
      code:
        typeof detail?.code === 'string' && detail.code.trim().length
          ? detail.code.trim()
          : detail?.missingSample
            ? 'missing-sample'
            : 'welcome-playback-error',
      fallbackActive: true,
      missingSample: detail?.missingSample === true || detail?.code === 'missing-sample',
      message: normalizedMessage,
      stage: 'boot',
      timestamp,
      success: false,
      source: detail?.source || 'audio-live-test',
    };
    if (typeof detail?.errorName === 'string' && detail.errorName.trim().length) {
      failureDetail.errorName = detail.errorName.trim();
    }
    if (typeof detail?.errorMessage === 'string' && detail.errorMessage.trim().length) {
      failureDetail.errorMessage = detail.errorMessage.trim();
    }
    if (typeof detail?.reason === 'string' && detail.reason.trim().length) {
      failureDetail.reason = detail.reason.trim();
    }
    audioAssetLiveTestState.performed = true;
    audioAssetLiveTestState.success = false;
    audioAssetLiveTestState.detail = failureDetail;
    if (consoleRef?.error) {
      consoleRef.error('Welcome audio playback test failed.', { detail: failureDetail });
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('audio', normalizedMessage, { level: 'error', detail: failureDetail, timestamp });
    }
    if (typeof presentCriticalErrorOverlay === 'function') {
      try {
        const missingSampleDetected =
          failureDetail.missingSample === true ||
          failureDetail.code === 'missing-sample' ||
          failureDetail.code === 'boot-missing-sample';
        const overlayTitle = missingSampleDetected ? 'Missing audio sample' : 'Audio playback failed';
        const overlayParts = [normalizedMessage];
        const errorName =
          typeof failureDetail.errorName === 'string' && failureDetail.errorName.trim().length
            ? failureDetail.errorName.trim()
            : null;
        const errorMessage =
          typeof failureDetail.errorMessage === 'string' && failureDetail.errorMessage.trim().length
            ? failureDetail.errorMessage.trim()
            : null;
        if (errorName && errorMessage) {
          overlayParts.push(`${errorName}: ${errorMessage}`);
        } else if (errorMessage) {
          overlayParts.push(errorMessage);
        } else if (errorName) {
          overlayParts.push(errorName);
        }
        const overlayCode =
          typeof failureDetail.code === 'string' && failureDetail.code.trim().length ? failureDetail.code.trim() : null;
        if (overlayCode) {
          overlayParts.push(`Code: ${overlayCode}`);
        }
        const overlayMessage = overlayParts.join(' — ');
        presentCriticalErrorOverlay({
          title: overlayTitle,
          message: overlayMessage,
          diagnosticScope: 'audio',
          diagnosticStatus: missingSampleDetected ? 'error' : 'warning',
          diagnosticMessage: normalizedMessage,
          logScope: 'audio',
          logMessage: normalizedMessage,
          logLevel: 'error',
          detail: failureDetail,
          timestamp,
        });
        failureDetail.overlayPresented = true;
      } catch (overlayError) {
        consoleRef?.debug?.('Unable to display audio live test overlay.', overlayError);
      }
    }
    if (typeof bootstrapOverlay?.setDiagnostic === 'function') {
      try {
        bootstrapOverlay.setDiagnostic('audio', { status: 'error', message: normalizedMessage });
      } catch (overlayError) {
        consoleRef?.debug?.('Failed to record audio live test diagnostic.', overlayError);
      }
    }
    dispatchAudioDiagnosticEvent('infinite-rails:audio-boot-status', {
      ...failureDetail,
      fallbackActive: true,
    });
    dispatchAudioDiagnosticEvent('infinite-rails:audio-error', failureDetail);
    return failureDetail;
  }

  function recordAudioAssetLiveTestSuccess(detail = {}) {
    const consoleRef = getConsoleRef();
    const timestamp = Number.isFinite(detail?.timestamp) ? detail.timestamp : Date.now();
    const resolvedName =
      typeof detail?.resolvedName === 'string' && detail.resolvedName.trim().length
        ? detail.resolvedName.trim()
        : null;
    const normalizedMessage =
      typeof detail?.message === 'string' && detail.message.trim().length
        ? detail.message.trim()
        : resolvedName
          ? `Welcome audio playback verified (${resolvedName}).`
          : 'Welcome audio playback verified.';
    const successDetail = {
      requestedName: 'welcome',
      resolvedName,
      message: normalizedMessage,
      stage: 'boot',
      timestamp,
      success: true,
      source: detail?.source || 'audio-live-test',
    };
    audioAssetLiveTestState.performed = true;
    audioAssetLiveTestState.success = true;
    audioAssetLiveTestState.detail = successDetail;
    if (consoleRef?.info) {
      consoleRef.info('Welcome audio playback test succeeded.', successDetail);
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('audio', normalizedMessage, { level: 'success', detail: successDetail, timestamp });
    }
    if (typeof bootstrapOverlay?.setDiagnostic === 'function') {
      try {
        bootstrapOverlay.setDiagnostic('audio', { status: 'ok', message: normalizedMessage });
      } catch (overlayError) {
        consoleRef?.debug?.('Failed to record audio live test success diagnostic.', overlayError);
      }
    }
    dispatchAudioDiagnosticEvent('infinite-rails:audio-boot-status', {
      ...successDetail,
      fallbackActive: false,
    });
    return successDetail;
  }

  async function performAudioAssetLiveTest(options = {}) {
    const timestamp = Date.now();
    const sampleInfo = resolveWelcomeLiveTestSample();
    const resolvedName = sampleInfo.sampleKey;
    if (!sampleInfo || sampleInfo.missing) {
      const message = resolvedName && resolvedName !== 'welcome'
        ? `Audio sample "welcome" unavailable — falling back to "${resolvedName}".`
        : 'Audio sample "welcome" is unavailable. Playing fallback beep instead.';
      recordAudioAssetLiveTestFailure(message, {
        resolvedName: resolvedName && resolvedName !== 'welcome' ? resolvedName : null,
        missingSample: true,
        code: 'missing-sample',
        stage: 'boot',
        timestamp,
      });
      return false;
    }
    const scope =
      globalScope ||
      (typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
    const AudioCtor = scope?.Audio || (typeof Audio !== 'undefined' ? Audio : null);
    if (typeof AudioCtor !== 'function') {
      recordAudioAssetLiveTestFailure('Unable to play welcome audio cue.', {
        resolvedName: resolvedName || null,
        code: 'welcome-playback-error',
        errorName: 'AudioUnavailableError',
        errorMessage: 'Audio constructor is unavailable.',
        stage: 'boot',
        timestamp,
      });
      return false;
    }
    let audio;
    try {
      audio = new AudioCtor();
    } catch (creationError) {
      recordAudioAssetLiveTestFailure('Unable to play welcome audio cue.', {
        resolvedName: resolvedName || null,
        code: 'welcome-playback-error',
        errorName:
          typeof creationError?.name === 'string' && creationError.name.trim().length
            ? creationError.name.trim()
            : 'AudioError',
        errorMessage:
          typeof creationError?.message === 'string' && creationError.message.trim().length
            ? creationError.message.trim()
            : 'Failed to instantiate audio element.',
        stage: 'boot',
        timestamp,
      });
      return false;
    }
    let assignedSource = false;
    try {
      audio.src = sampleInfo.src;
      assignedSource = true;
    } catch (assignError) {
      assignedSource = false;
      if (typeof audio.setAttribute === 'function') {
        try {
          audio.setAttribute('src', sampleInfo.src);
          assignedSource = true;
        } catch (setAttrError) {
          assignedSource = false;
        }
      }
      if (!assignedSource) {
        cleanupAudioElement(audio);
        recordAudioAssetLiveTestFailure('Unable to play welcome audio cue.', {
          resolvedName: resolvedName || null,
          code: 'welcome-playback-error',
          errorName:
            typeof assignError?.name === 'string' && assignError.name.trim().length
              ? assignError.name.trim()
              : 'AudioError',
          errorMessage:
            typeof assignError?.message === 'string' && assignError.message.trim().length
              ? assignError.message.trim()
              : 'Failed to assign audio source.',
          stage: 'boot',
          timestamp,
        });
        return false;
      }
    }
    try {
      if (typeof audio.setAttribute === 'function') {
        audio.setAttribute('preload', 'auto');
      }
    } catch (preloadError) {}
    try {
      audio.preload = 'auto';
    } catch (preloadAssignError) {}
    try {
      if ('defaultMuted' in audio) {
        audio.defaultMuted = false;
      }
    } catch (defaultMuteError) {}
    const playbackVolumeRaw = typeof options?.volume === 'number' ? options.volume : 0.6;
    const playbackVolume = Number.isFinite(playbackVolumeRaw)
      ? Math.min(Math.max(playbackVolumeRaw, 0), 1)
      : 0.6;
    try {
      audio.volume = playbackVolume;
    } catch (volumeError) {}
    try {
      audio.muted = false;
    } catch (muteError) {}
    if ('loop' in audio) {
      try {
        audio.loop = false;
      } catch (loopError) {}
    }
    const playAttempt = () => {
      try {
        const playResult = audio.play();
        if (playResult && typeof playResult.then === 'function') {
          return playResult;
        }
        return Promise.resolve();
      } catch (playError) {
        return Promise.reject(playError);
      }
    };
    try {
      await playAttempt();
      try {
        await waitForAudioPlaybackCompletion(audio, {
          timeoutMs:
            Number.isFinite(options?.playbackMonitorTimeoutMs) && options.playbackMonitorTimeoutMs > 0
              ? options.playbackMonitorTimeoutMs
              : 5000,
        });
      } catch (progressError) {
        cleanupAudioElement(audio);
        recordAudioAssetLiveTestFailure('Unable to play welcome audio cue.', {
          resolvedName: resolvedName || null,
          code: 'welcome-playback-error',
          errorName:
            typeof progressError?.name === 'string' && progressError.name.trim().length
              ? progressError.name.trim()
              : undefined,
          errorMessage:
            typeof progressError?.message === 'string' && progressError.message.trim().length
              ? progressError.message.trim()
              : undefined,
          reason: 'playback-monitor-error',
          stage: 'boot',
          timestamp,
        });
        return false;
      }
      cleanupAudioElement(audio);
      recordAudioAssetLiveTestSuccess({ resolvedName, timestamp });
      return true;
    } catch (playbackError) {
      cleanupAudioElement(audio);
      recordAudioAssetLiveTestFailure('Unable to play welcome audio cue.', {
        resolvedName: resolvedName || null,
        code: 'welcome-playback-error',
        errorName:
          typeof playbackError?.name === 'string' && playbackError.name.trim().length
            ? playbackError.name.trim()
            : undefined,
        errorMessage:
          typeof playbackError?.message === 'string' && playbackError.message.trim().length
            ? playbackError.message.trim()
            : undefined,
        stage: 'boot',
        timestamp,
      });
      return false;
    }
  }

  function waitForAudioPlaybackCompletion(audio, options = {}) {
    if (!audio || typeof audio !== 'object' || typeof audio.addEventListener !== 'function') {
      return Promise.resolve();
    }
    if (audio.ended === true) {
      return Promise.resolve();
    }
    const timeoutMs = Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 5000;
    const timersScope =
      (typeof globalScope !== 'undefined' && globalScope) ||
      (typeof globalThis !== 'undefined' ? globalThis : null);
    const scheduleTimeout =
      (timersScope && typeof timersScope.setTimeout === 'function'
        ? timersScope.setTimeout.bind(timersScope)
        : typeof setTimeout === 'function'
          ? setTimeout
          : null);
    const clearScheduledTimeout =
      (timersScope && typeof timersScope.clearTimeout === 'function'
        ? timersScope.clearTimeout.bind(timersScope)
        : typeof clearTimeout === 'function'
          ? clearTimeout
          : null);
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;
      const finalize = (handler) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId !== null && clearScheduledTimeout) {
          try {
            clearScheduledTimeout(timeoutId);
          } catch (clearError) {}
        }
        try {
          audio.removeEventListener('ended', handleEnded);
        } catch (removeEndedError) {}
        try {
          audio.removeEventListener('pause', handlePause);
        } catch (removePauseError) {}
        try {
          audio.removeEventListener('error', handleError);
        } catch (removeErrorError) {}
        handler();
      };
      const handleEnded = () => finalize(resolve);
      const handlePause = () => finalize(resolve);
      const handleError = (event) => {
        const errorDetail =
          event?.error ||
          event?.target?.error ||
          (typeof event === 'object' && 'message' in event ? event : null);
        finalize(() => {
          if (errorDetail instanceof Error) {
            reject(errorDetail);
            return;
          }
          if (errorDetail && typeof errorDetail === 'object') {
            const syntheticError = new Error(
              typeof errorDetail.message === 'string' && errorDetail.message.trim().length
                ? errorDetail.message.trim()
                : 'Audio playback error event triggered.',
            );
            if (typeof errorDetail.name === 'string' && errorDetail.name.trim().length) {
              syntheticError.name = errorDetail.name.trim();
            }
            if (errorDetail.code !== undefined) {
              try {
                syntheticError.code = errorDetail.code;
              } catch (assignError) {}
            }
            reject(syntheticError);
            return;
          }
          reject(new Error('Audio playback error event triggered.'));
        });
      };
      try {
        audio.addEventListener('ended', handleEnded, { once: true });
      } catch (addEndedError) {}
      try {
        audio.addEventListener('pause', handlePause, { once: true });
      } catch (addPauseError) {}
      try {
        audio.addEventListener('error', handleError, { once: true });
      } catch (addErrorError) {}
      if (scheduleTimeout) {
        try {
          timeoutId = scheduleTimeout(() => finalize(resolve), timeoutMs);
        } catch (scheduleError) {
          timeoutId = null;
        }
      }
    });
  }

  function ensureAudioAssetLiveTest(options = {}) {
    const force = options?.force === true;
    if (force) {
      audioAssetLiveTestState.promise = null;
      audioAssetLiveTestState.performed = false;
      audioAssetLiveTestState.success = null;
      audioAssetLiveTestState.detail = null;
    } else if (audioAssetLiveTestState.promise) {
      return audioAssetLiveTestState.promise;
    } else if (audioAssetLiveTestState.performed) {
      return Promise.resolve(audioAssetLiveTestState.success ?? false);
    }
    const runPromise = Promise.resolve().then(() => performAudioAssetLiveTest(options));
    audioAssetLiveTestState.promise = runPromise
      .then((result) => result)
      .catch((error) => {
        recordAudioAssetLiveTestFailure('Unable to play welcome audio cue.', {
          resolvedName: null,
          code: 'welcome-playback-error',
          errorName:
            typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined,
          errorMessage:
            typeof error?.message === 'string' && error.message.trim().length ? error.message.trim() : undefined,
          stage: 'boot',
          timestamp: Date.now(),
        });
        return false;
      })
      .finally(() => {
        if (audioAssetLiveTestState.promise === runPromise) {
          audioAssetLiveTestState.promise = Promise.resolve(audioAssetLiveTestState.success ?? false);
        }
      });
    return audioAssetLiveTestState.promise;
  }

  const BACKEND_LIVE_CHECK_TIMEOUT_MS = 8000;
  const BACKEND_LIVE_CHECK_ALLOWED_POST_STATUSES = new Set([400, 401, 403, 409, 422, 429]);
  const backendLiveCheckState = {
    promise: null,
    performed: false,
    success: null,
    detail: null,
  };

  function normaliseLiveCheckErrorDetail(error) {
    if (!error) {
      return null;
    }
    if (typeof error === 'string') {
      const trimmed = error.trim();
      return trimmed ? { name: 'Error', message: trimmed } : null;
    }
    if (typeof error !== 'object') {
      return { name: 'Error', message: String(error) };
    }
    const message =
      typeof error.message === 'string' && error.message.trim().length
        ? error.message.trim()
        : null;
    const detail = {
      name: typeof error.name === 'string' && error.name.trim().length ? error.name.trim() : 'Error',
    };
    if (message) {
      detail.message = message;
    }
    if (error.code !== undefined) {
      detail.code = error.code;
    }
    if (error.reason !== undefined) {
      detail.reason = error.reason;
    }
    return detail;
  }

  function simplifyBackendProbeResult(result) {
    if (!result || typeof result !== 'object') {
      return null;
    }
    const simplified = {};
    if (typeof result.label === 'string' && result.label.trim().length) {
      simplified.label = result.label.trim();
    }
    if (typeof result.url === 'string' && result.url.trim().length) {
      simplified.url = result.url.trim();
    }
    if (typeof result.method === 'string' && result.method.trim().length) {
      simplified.method = result.method.trim();
    }
    if (Number.isFinite(result.status)) {
      simplified.status = result.status;
    }
    if (result.reason) {
      simplified.reason = result.reason;
    }
    if (result.error) {
      simplified.error = normaliseLiveCheckErrorDetail(result.error);
    }
    return simplified;
  }

  function formatBackendProbeLabel(method, url, label) {
    if (label && typeof label === 'string' && label.trim().length) {
      return label.trim();
    }
    const methodLabel = typeof method === 'string' && method.trim().length ? method.trim().toUpperCase() : 'REQUEST';
    const urlLabel = typeof url === 'string' && url.trim().length ? url.trim() : 'unknown endpoint';
    return `${methodLabel} ${urlLabel}`;
  }

  function formatBackendProbeSummary(result) {
    if (!result || typeof result !== 'object') {
      return 'unknown backend probe failure';
    }
    const label = formatBackendProbeLabel(result.method, result.url, result.label);
    if (Number.isFinite(result.status)) {
      return `${label} returned ${result.status}`;
    }
    if (result.reason === 'fetch-unavailable') {
      return `${label} failed — fetch API unavailable`;
    }
    if (result.reason === 'missing-url') {
      return `${label} failed — endpoint missing`;
    }
    if (result.error) {
      const detail = normaliseLiveCheckErrorDetail(result.error);
      if (detail?.reason === 'timeout' || detail?.name === 'AbortError') {
        return `${label} timed out`;
      }
      const message =
        detail?.message && detail.message.trim().length ? detail.message.trim() : 'request failed';
      return `${label} failed — ${message}`;
    }
    return `${label} failed`;
  }

  function createBackendLiveCheckTimeout(timeoutMs) {
    const hasAbortController = typeof AbortController === 'function';
    const set =
      typeof globalScope?.setTimeout === 'function'
        ? globalScope.setTimeout
        : typeof setTimeout === 'function'
          ? setTimeout
          : null;
    const clear =
      typeof globalScope?.clearTimeout === 'function'
        ? globalScope.clearTimeout
        : typeof clearTimeout === 'function'
          ? clearTimeout
          : null;
    if (!hasAbortController || !set || !clear) {
      return { signal: undefined, dispose() {} };
    }
    const controller = new AbortController();
    const handle = set(() => {
      try {
        controller.abort();
      } catch (error) {}
    }, timeoutMs);
    const dispose = () => {
      try {
        clear(handle);
      } catch (error) {}
    };
    return { signal: controller.signal, dispose, controller };
  }

  async function probeBackendEndpoint({
    url,
    method = 'GET',
    label = null,
    allowStatuses = BACKEND_LIVE_CHECK_ALLOWED_POST_STATUSES,
    headers = null,
    body = undefined,
    timeout = BACKEND_LIVE_CHECK_TIMEOUT_MS,
  }) {
    if (!url || typeof url !== 'string') {
      return { ok: false, url, method, label, reason: 'missing-url' };
    }
    if (typeof fetch !== 'function') {
      return { ok: false, url, method, label, reason: 'fetch-unavailable' };
    }
    const requestInit = {
      method,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
    };
    if (headers && typeof headers === 'object') {
      requestInit.headers = headers;
    }
    if (body !== undefined) {
      requestInit.body = body;
    }
    const { signal, dispose } = createBackendLiveCheckTimeout(timeout);
    if (signal) {
      requestInit.signal = signal;
    }
    try {
      const response = await fetch(url, requestInit);
      dispose();
      const status = response.status;
      const ok = response.ok || (allowStatuses instanceof Set ? allowStatuses.has(status) : false);
      return { ok, status, url, method, label };
    } catch (error) {
      dispose();
      const detail = normaliseLiveCheckErrorDetail(error) || { name: 'Error', message: String(error) };
      if (detail && detail.name === 'AbortError' && !detail.reason) {
        detail.reason = 'timeout';
      }
      return { ok: false, error: detail, url, method, label };
    }
  }

  function markBackendLiveCheckSuccess(context = null) {
    backendLiveCheckState.performed = true;
    backendLiveCheckState.success = true;
    backendLiveCheckState.detail = context;
    const timestamp = new Date().toISOString();
    if (!identityState.backendValidation || typeof identityState.backendValidation !== 'object') {
      identityState.backendValidation = {};
    }
    identityState.backendValidation.performed = true;
    identityState.backendValidation.ok = true;
    identityState.backendValidation.checkedAt = timestamp;
    identityState.backendValidation.detail = context
      ? {
          results: Array.isArray(context.results)
            ? context.results.map((result) => simplifyBackendProbeResult(result)).filter(Boolean)
            : [],
        }
      : { results: [] };
    const configuredBase = identityState.configuredApiBaseUrl ?? null;
    if (configuredBase) {
      identityState.apiBaseUrl = configuredBase;
      identityState.endpoints = {
        scores: identityState.configuredEndpoints?.scores ?? null,
        users: identityState.configuredEndpoints?.users ?? null,
      };
      if (activeExperienceInstance) {
        activeExperienceInstance.apiBaseUrl = identityState.apiBaseUrl;
      }
    }
    if (typeof bootstrapOverlay?.setDiagnostic === 'function') {
      bootstrapOverlay.setDiagnostic('backend', {
        status: 'ok',
        message: 'Leaderboard service ready.',
      });
    }
    const currentMessage = typeof identityState.scoreboardMessage === 'string' ? identityState.scoreboardMessage.trim() : '';
    const lowerCurrent = currentMessage.toLowerCase();
    const indicatesValidation =
      lowerCurrent.includes('validating leaderboard service') ||
      lowerCurrent === 'connecting to the leaderboard service…'.toLowerCase() ||
      lowerCurrent === 'connecting to the leaderboard service...'.toLowerCase();
    const shouldReplaceMessage = !currentMessage || indicatesValidation;
    if (shouldReplaceMessage) {
      const nextMessage = deriveOnlineScoreboardMessage();
      updateScoreboardStatus(nextMessage, { offline: false });
    } else if (identityState.scoreboardOffline) {
      updateScoreboardStatus(identityState.scoreboardMessage, { offline: false });
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('startup', 'Backend live-check succeeded.', {
        level: 'success',
        detail: context,
      });
    }
  }

  function markBackendLiveCheckFailure(context = null) {
    backendLiveCheckState.performed = true;
    backendLiveCheckState.success = false;
    backendLiveCheckState.detail = context;
    const timestamp = new Date().toISOString();
    const summary =
      typeof context?.message === 'string' && context.message.trim().length ? context.message.trim() : '';
    const formattedSummary = summary.replace(/[。\uFF0E\.]+$/u, '');
    const message = formattedSummary
      ? `Leaderboard offline — ${formattedSummary}.`
      : 'Leaderboard offline — runs will remain on this device.';
    if (!identityState.backendValidation || typeof identityState.backendValidation !== 'object') {
      identityState.backendValidation = {};
    }
    identityState.backendValidation.performed = true;
    identityState.backendValidation.ok = false;
    identityState.backendValidation.checkedAt = timestamp;
    identityState.backendValidation.detail = {
      reason: context?.reason ?? 'unknown',
      message,
      summary,
      results: Array.isArray(context?.results)
        ? context.results.map((result) => simplifyBackendProbeResult(result)).filter(Boolean)
        : [],
      failures: Array.isArray(context?.failures)
        ? context.failures.map((result) => simplifyBackendProbeResult(result)).filter(Boolean)
        : [],
    };
    identityState.apiBaseUrl = null;
    identityState.endpoints = { scores: null, users: null };
    if (activeExperienceInstance) {
      activeExperienceInstance.apiBaseUrl = null;
    }
    updateScoreboardStatus(message, { offline: true });
    if (typeof bootstrapOverlay?.setDiagnostic === 'function') {
      bootstrapOverlay.setDiagnostic('backend', {
        status: 'error',
        message,
      });
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('startup', 'Backend live-check failed. Falling back to local mode.', {
        level: 'warning',
        detail: context,
      });
    }
    if (globalScope?.console?.warn) {
      globalScope.console.warn('Backend live-check failed; continuing in offline mode.', context);
    }
  }

  async function performBackendLiveCheck() {
    const configuredBase = identityState.configuredApiBaseUrl ?? null;
    const configuredEndpoints = identityState.configuredEndpoints ?? {};
    if (!configuredBase) {
      backendLiveCheckState.performed = true;
      backendLiveCheckState.success = false;
      backendLiveCheckState.detail = { reason: 'missing-backend' };
      return false;
    }
    if (typeof fetch !== 'function') {
      markBackendLiveCheckFailure({
        reason: 'fetch-unavailable',
        message: 'fetch API unavailable — cannot validate leaderboard endpoints',
      });
      return false;
    }
    if (typeof bootstrapOverlay?.setDiagnostic === 'function') {
      bootstrapOverlay.setDiagnostic('backend', {
        status: 'pending',
        message: 'Validating leaderboard service…',
      });
    }
    const probes = [];
    if (configuredEndpoints.scores) {
      probes.push(
        probeBackendEndpoint({
          url: configuredEndpoints.scores,
          method: 'GET',
          label: 'GET /scores',
          allowStatuses: new Set(),
        }),
      );
      probes.push(
        probeBackendEndpoint({
          url: configuredEndpoints.scores,
          method: 'POST',
          label: 'POST /scores',
          headers: {
            'Content-Type': 'application/json',
            'X-Infinite-Rails-Live-Check': '1',
          },
          body: JSON.stringify({ mode: 'live-check', timestamp: new Date().toISOString() }),
          allowStatuses: BACKEND_LIVE_CHECK_ALLOWED_POST_STATUSES,
        }),
      );
    }
    if (configuredEndpoints.users) {
      probes.push(
        probeBackendEndpoint({
          url: configuredEndpoints.users,
          method: 'POST',
          label: 'POST /users',
          headers: {
            'Content-Type': 'application/json',
            'X-Infinite-Rails-Live-Check': '1',
          },
          body: JSON.stringify({ mode: 'live-check', timestamp: new Date().toISOString() }),
          allowStatuses: BACKEND_LIVE_CHECK_ALLOWED_POST_STATUSES,
        }),
      );
    }
    if (!probes.length) {
      markBackendLiveCheckFailure({
        reason: 'missing-endpoints',
        message: 'no API endpoints configured for validation',
      });
      return false;
    }
    let results;
    try {
      results = await Promise.all(probes);
    } catch (error) {
      const detail = normaliseLiveCheckErrorDetail(error);
      const summaryMessage = detail?.message && detail.message.trim().length
        ? detail.message.trim()
        : 'Unexpected error during backend validation';
      const failureRecord = {
        label: 'Backend validation',
        method: 'VALIDATE',
        url: identityState.configuredApiBaseUrl ?? configuredBase ?? null,
        error,
      };
      markBackendLiveCheckFailure({
        reason: detail?.reason ?? detail?.code ?? 'probe-error',
        message: summaryMessage,
        results: [],
        failures: [failureRecord],
      });
      return false;
    }
    const failures = results.filter((result) => !result.ok);
    if (failures.length) {
      const summary = failures.map((result) => formatBackendProbeSummary(result)).join('; ');
      markBackendLiveCheckFailure({
        reason: 'endpoint-failure',
        message: summary,
        results,
        failures,
      });
      return false;
    }
    markBackendLiveCheckSuccess({ results });
    return true;
  }

  function ensureBackendLiveCheck() {
    if (backendLiveCheckState.promise) {
      return backendLiveCheckState.promise;
    }
    if (!identityState.configuredApiBaseUrl) {
      backendLiveCheckState.performed = true;
      backendLiveCheckState.success = false;
      backendLiveCheckState.detail = { reason: 'missing-backend' };
      return Promise.resolve(false);
    }
    const runPromise = performBackendLiveCheck()
      .then((result) => {
        backendLiveCheckState.performed = true;
        backendLiveCheckState.success = Boolean(result);
        return backendLiveCheckState.success;
      })
      .catch((error) => {
        backendLiveCheckState.performed = true;
        backendLiveCheckState.success = false;
        if (globalScope?.console?.error) {
          globalScope.console.error('Unexpected error during backend live-check.', error);
        }
        throw error;
      });
    backendLiveCheckState.promise = runPromise;
    runPromise.finally(() => {
      if (backendLiveCheckState.promise === runPromise) {
        backendLiveCheckState.promise = Promise.resolve(backendLiveCheckState.success ?? false);
      }
    });
    return backendLiveCheckState.promise;
  }

  function inferLocationLabel(location) {
    if (!location || typeof location !== 'object') {
      return 'Location hidden';
    }
    if (location.error) {
      return typeof location.error === 'string' && location.error.trim().length
        ? location.error.trim()
        : 'Location hidden';
    }
    if (typeof location.label === 'string' && location.label.trim().length) {
      return location.label.trim();
    }
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const latLabel = latitude.toFixed(1);
      const lonLabel = longitude.toFixed(1);
      return `Lat ${latLabel}\u00b0, Lon ${lonLabel}\u00b0`;
    }
    return 'Location hidden';
  }

  const globalAppConfig =
    globalScope.APP_CONFIG && typeof globalScope.APP_CONFIG === 'object'
      ? globalScope.APP_CONFIG
      : (globalScope.APP_CONFIG = {});
  const originalApiBaseUrl = globalAppConfig?.apiBaseUrl ?? null;
  const apiBaseUrl = normaliseApiBaseUrl(originalApiBaseUrl);
  if (globalAppConfig && typeof globalAppConfig === 'object') {
    globalAppConfig.apiBaseUrl = apiBaseUrl;
  }
  const apiBaseInvalid = Boolean(originalApiBaseUrl && !apiBaseUrl);

  const configuredEndpoints = {
    scores: buildScoreboardUrl(apiBaseUrl),
    users: apiBaseUrl ? `${apiBaseUrl.replace(/\/$/, '')}/users` : null,
  };

  const originalDiagnosticsEndpoint =
    globalAppConfig?.diagnosticsEndpoint ?? globalAppConfig?.logEndpoint ?? null;
  const diagnosticsEndpoint = normaliseDiagnosticsEndpoint(originalDiagnosticsEndpoint);
  if (globalAppConfig && typeof globalAppConfig === 'object') {
    globalAppConfig.diagnosticsEndpoint = diagnosticsEndpoint;
  }

  const googleClientId =
    typeof globalAppConfig?.googleClientId === 'string' && globalAppConfig.googleClientId.trim().length > 0
      ? globalAppConfig.googleClientId.trim()
      : null;

  const identityState = {
    originalApiBaseUrl,
    configuredApiBaseUrl: apiBaseUrl,
    apiBaseUrl: null,
    googleClientId,
    googleInitialized: false,
    googleReady: false,
    googleButtonsRendered: false,
    googleError: null,
    identity: null,
    scoreboardMessage: '',
    scoreboardOffline: false,
    discoverabilityOffline: false,
    configuredEndpoints,
    endpoints: {
      scores: null,
      users: null,
    },
    backendValidation: {
      performed: false,
      ok: null,
      checkedAt: null,
      detail: null,
    },
  };

  if (!identityState.configuredApiBaseUrl) {
    if (apiBaseInvalid) {
      bootstrapOverlay.setDiagnostic('backend', {
        status: 'error',
        message: 'Invalid backend configuration — update APP_CONFIG.apiBaseUrl to restore sync.',
      });
    } else {
      bootstrapOverlay.setDiagnostic('backend', {
        status: 'warning',
        message: 'No backend configured — runs will remain on this device.',
      });
    }
  } else {
    bootstrapOverlay.setDiagnostic('backend', {
      status: 'pending',
      message: 'Validating leaderboard service…',
    });
  }

  const identityStorageKey = 'infinite-rails-simple-identity';
  const GOOGLE_ACCOUNTS_ID_NAMESPACE = 'google.accounts.id';
  const GOOGLE_IDENTITY_SCRIPT_URLS = (() => {
    const urls = [];
    const singleUrl =
      typeof globalAppConfig?.googleIdentityScriptUrl === 'string'
        ? globalAppConfig.googleIdentityScriptUrl.trim()
        : '';
    if (singleUrl) {
      urls.push(singleUrl);
    }
    const configuredList = Array.isArray(globalAppConfig?.googleIdentityScriptUrls)
      ? globalAppConfig.googleIdentityScriptUrls
      : [];
    configuredList.forEach((value) => {
      if (typeof value === 'string' && value.trim().length) {
        urls.push(value.trim());
      }
    });
    urls.push('https://accounts.google.com/gsi/client');
    return Array.from(new Set(urls));
  })();
  const HOTBAR_SLOT_COUNT = 10;
  const CONTROL_MAP_GLOBAL_KEY = '__INFINITE_RAILS_CONTROL_MAP__';

  const eventLogState = {
    element: null,
    listenersBound: false,
    maxEntries: 40,
    history: [],
  };

  function getEventLogElement() {
    if (eventLogState.element && eventLogState.element.isConnected) {
      return eventLogState.element;
    }
    if (!documentRef || typeof documentRef.getElementById !== 'function') {
      return null;
    }
    const element = documentRef.getElementById('eventLog');
    if (element) {
      eventLogState.element = element;
    }
    return element;
  }

  function setEventLogElement(element) {
    if (!element) {
      return;
    }
    eventLogState.element = element;
  }

  function formatEventTimestamp(timestamp) {
    const fallback = Date.now();
    const millis = Number.isFinite(timestamp) ? timestamp : fallback;
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) {
      return new Date(fallback).toISOString();
    }
    if (typeof date.toLocaleTimeString === 'function') {
      try {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (error) {
        return date.toISOString();
      }
    }
    return date.toISOString();
  }

  function extractDimensionLabel(detail) {
    if (!detail || typeof detail !== 'object') {
      return null;
    }
    const summary = detail.summary && typeof detail.summary === 'object' ? detail.summary : null;
    const pickLabel = (value) => (typeof value === 'string' && value.trim().length ? value.trim() : null);
    if (summary) {
      const directLabel = pickLabel(summary.dimensionLabel) || pickLabel(summary.dimensionName);
      if (directLabel) {
        return directLabel;
      }
      if (Array.isArray(summary.dimensions) && summary.dimensions.length) {
        const last = pickLabel(summary.dimensions[summary.dimensions.length - 1]);
        if (last) {
          return last;
        }
      }
    }
    const detailLabel =
      pickLabel(detail.dimensionLabel) ||
      pickLabel(detail.dimensionName) ||
      pickLabel(typeof detail.dimension === 'string' ? detail.dimension : null);
    if (detailLabel) {
      return detailLabel;
    }
    if (detail.dimension && typeof detail.dimension === 'object') {
      return pickLabel(detail.dimension.name) || pickLabel(detail.dimension.label);
    }
    return null;
  }

  function serialiseEventDetail(detail) {
    if (!detail || typeof detail !== 'object') {
      return detail ?? null;
    }
    try {
      return JSON.parse(JSON.stringify(detail));
    } catch (error) {
      const copy = {};
      Object.keys(detail).forEach((key) => {
        const value = detail[key];
        if (typeof value === 'undefined') {
          return;
        }
        if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          copy[key] = value;
          return;
        }
        try {
          copy[key] = JSON.parse(JSON.stringify(value));
        } catch (nestedError) {
          copy[key] = String(value);
        }
      });
      return copy;
    }
  }

  function formatLootItemList(detail, options = {}) {
    if (!detail || typeof detail !== 'object') {
      return null;
    }
    const items = Array.isArray(detail.items) ? detail.items : [];
    if (!items.length) {
      return null;
    }
    const limit = Number.isFinite(options.limit) ? options.limit : 3;
    const parts = [];
    items.forEach((entry) => {
      if (!entry) {
        return;
      }
      const quantity = Number.isFinite(entry.quantity) ? entry.quantity : null;
      const label =
        typeof entry.label === 'string' && entry.label.trim().length
          ? entry.label.trim()
          : typeof entry.name === 'string' && entry.name.trim().length
            ? entry.name.trim()
            : typeof entry.id === 'string' && entry.id.trim().length
              ? entry.id.trim()
              : typeof entry.item === 'string' && entry.item.trim().length
                ? entry.item.trim()
                : null;
      if (!label) {
        return;
      }
      const part = quantity && quantity > 1 ? `${label} ×${quantity}` : label;
      parts.push(part);
    });
    if (!parts.length) {
      return null;
    }
    if (limit > 0 && parts.length > limit) {
      const truncated = parts.slice(0, limit);
      truncated.push('…');
      return truncated.join(', ');
    }
    return parts.join(', ');
  }

  function describeEventLogMessage(type, detail) {
    const summaryMessage = (text, fallback) => {
      if (typeof text === 'string' && text.trim().length) {
        return text.trim();
      }
      return fallback;
    };
    switch (type) {
      case 'started': {
        const label = extractDimensionLabel(detail) || 'Origin Dimension';
        return `Expedition launched in ${label}.`;
      }
      case 'start-error':
        return 'Renderer initialisation failed — review diagnostics.';
      case 'dimension-advanced': {
        const label = extractDimensionLabel(detail) || 'Unknown Dimension';
        return `Dimension secured — ${label} stabilised.`;
      }
      case 'portal-ready': {
        const placed = Number.isFinite(detail?.placed) ? detail.placed : null;
        const required = Number.isFinite(detail?.required) ? detail.required : null;
        if (placed !== null && required !== null) {
          return `Portal frame stabilised (${placed}/${required} blocks).`;
        }
        return 'Portal frame stabilised — ignite your torch when ready.';
      }
      case 'portal-activated': {
        const label = extractDimensionLabel(detail) || 'next dimension';
        return `Portal ignited — gateway to ${label} active.`;
      }
      case 'victory':
        return 'Eternal Ingot secured — mission accomplished!';
      case 'asset-fallback':
        return summaryMessage(detail?.message, 'Asset fallback engaged to keep the run active.');
      case 'asset-availability': {
        const missing = Array.isArray(detail?.missing) ? detail.missing.length : 0;
        const total = Number.isFinite(detail?.total) ? detail.total : null;
        if (detail?.status === 'skipped') {
          return 'Critical asset availability check skipped — probe unavailable.';
        }
        if (detail?.status === 'error') {
          return 'Critical asset availability check failed — probe error.';
        }
        if (missing > 0) {
          const preview = Array.isArray(detail?.missing) ? detail.missing.slice(0, 3).join(', ') : '';
          const suffix = missing > 3 ? `, +${missing - 3} more` : '';
          if (total !== null) {
            return `Critical asset availability check failed — ${missing}/${total} missing (${preview}${suffix}).`;
          }
          return `Critical asset availability check failed — ${missing} missing (${preview}${suffix}).`;
        }
        return 'Critical asset availability check passed — all assets reachable.';
      }
      case 'recipe-crafted':
        return summaryMessage(detail?.recipeLabel ? `Crafted ${detail.recipeLabel}.` : '', 'Recipe crafted.');
      case 'pointer-lock-fallback': {
        const reason = summaryMessage(
          typeof detail?.reason === 'string' ? detail.reason.replace(/[-_]+/g, ' ') : '',
          'unavailable',
        );
        return `Pointer lock fallback engaged (${reason}).`;
      }
      case 'score-sync-offline':
        return summaryMessage(detail?.message, 'Leaderboard offline — progress saved locally.');
      case 'score-sync-restored':
        return summaryMessage(detail?.message, 'Leaderboard connection restored.');
      case 'renderer-failure': {
        const reason = summaryMessage(
          detail?.message,
          'Renderer failure encountered — reload recommended.',
        );
        const stage =
          typeof detail?.stage === 'string' && detail.stage.trim().length ? detail.stage.trim() : null;
        if (stage) {
          return `${reason} (${stage})`;
        }
        return reason;
      }
      case 'audio-error': {
        const fallbackName =
          typeof detail?.resolvedName === 'string' && detail.resolvedName.trim().length
            ? detail.resolvedName.trim()
            : typeof detail?.requestedName === 'string' && detail.requestedName.trim().length
            ? detail.requestedName.trim()
            : null;
        const fallback = fallbackName
          ? `Audio sample "${fallbackName}" failed to play.`
          : 'Audio playback issue detected.';
        return summaryMessage(detail?.message, fallback);
      }
      case 'start-error':
        return summaryMessage(detail?.message, 'Renderer initialisation failed.');
      case 'initialisation-error': {
        const base = summaryMessage(detail?.message, 'Initialisation error encountered.');
        const stage = typeof detail?.stage === 'string' && detail.stage.trim().length ? detail.stage.trim() : null;
        return stage ? `${base} (${stage}).` : base;
      }
      case 'asset-fetch-start':
        return `Fetching ${formatAssetLogLabel(detail)}…`;
      case 'asset-fetch-complete': {
        const label = formatAssetLogLabel(detail);
        const duration = Number.isFinite(detail?.duration) ? Math.round(detail.duration) : null;
        const suffix = duration ? (detail?.status === 'fulfilled' ? ` in ${duration}ms` : ` after ${duration}ms`) : '';
        return detail?.status === 'fulfilled'
          ? `Loaded ${label}${suffix}.`
          : `Failed to load ${label}${suffix}.`;
      }
      case 'loot-collected': {
        const itemsSummary = formatLootItemList(detail);
        const score = Number.isFinite(detail?.score) ? detail.score : null;
        if (itemsSummary) {
          if (score && score !== 0) {
            const formattedScore =
              typeof score.toLocaleString === 'function' ? score.toLocaleString() : String(score);
            return `Loot secured — ${itemsSummary} (+${formattedScore} pts).`;
          }
          return `Loot secured — ${itemsSummary}.`;
        }
        const message = summaryMessage(detail?.message, 'Loot secured.');
        if (score && score !== 0) {
          const formattedScore = typeof score.toLocaleString === 'function' ? score.toLocaleString() : String(score);
          return `${message} (+${formattedScore} pts).`;
        }
        return message;
      }
      case 'debug-mode':
        return detail?.enabled
          ? 'Verbose debug mode enabled.'
          : 'Verbose debug mode disabled — standard diagnostics restored.';
      default:
        return null;
    }
  }

  function createDebugDetailString(detail) {
    if (!detail || typeof detail !== 'object') {
      return '';
    }
    const copy = {};
    Object.keys(detail).forEach((key) => {
      if (key === 'timestamp' || key === 'mode') {
        return;
      }
      const value = detail[key];
      if (typeof value === 'undefined') {
        return;
      }
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        copy[key] = value;
        return;
      }
      try {
        copy[key] = JSON.parse(JSON.stringify(value));
      } catch (error) {
        copy[key] = String(value);
      }
    });
    const keys = Object.keys(copy);
    if (!keys.length) {
      return '';
    }
    try {
      const payload = JSON.stringify(copy, null, 2);
      if (payload.length > 4000) {
        return `${payload.slice(0, 3997)}…`;
      }
      return payload;
    } catch (error) {
      return keys.map((key) => `${key}: ${String(copy[key])}`).join('\n');
    }
  }

  function updateEventLogItemDebugBlock(item, detailString) {
    if (!item) {
      return;
    }
    const detail = typeof detailString === 'string' ? detailString : item.dataset.debugDetail;
    const existing = item.querySelector?.('.event-log__debug') ?? null;
    if (isDebugModeEnabled() && detail) {
      const doc = item.ownerDocument || documentRef;
      const target = existing || doc?.createElement?.('pre');
      if (!target) {
        return;
      }
      target.className = 'event-log__debug';
      target.textContent = detail;
      if (!existing) {
        item.appendChild(target);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function appendEventLogEntry(type, detail = {}) {
    const message = describeEventLogMessage(type, detail);
    if (!message) {
      return;
    }
    const container = getEventLogElement();
    if (!container) {
      return;
    }
    if (type === 'started') {
      container.innerHTML = '';
    }
    const doc = container.ownerDocument || documentRef;
    const item = doc?.createElement?.('li');
    if (!item) {
      return;
    }
    const timestamp = Number.isFinite(detail?.timestamp) ? detail.timestamp : Date.now();
    const timeLabel = formatEventTimestamp(timestamp);
    const messageEl = doc?.createElement?.('div');
    if (!messageEl) {
      return;
    }
    messageEl.className = 'event-log__message';
    messageEl.textContent = `[${timeLabel}] ${message}`;
    item.appendChild(messageEl);
    item.dataset.eventType = type;
    item.dataset.eventTimestamp = String(timestamp);
    const debugDetail = createDebugDetailString(detail);
    if (debugDetail) {
      item.dataset.debugDetail = debugDetail;
      updateEventLogItemDebugBlock(item, debugDetail);
    }
    const serialisedDetail = serialiseEventDetail(detail);
    eventLogState.history.push({
      type,
      timestamp,
      message,
      detail: serialisedDetail,
    });
    while (eventLogState.history.length > eventLogState.maxEntries) {
      eventLogState.history.shift();
    }
    container.appendChild(item);
    while (container.children.length > eventLogState.maxEntries) {
      const first = container.firstElementChild || container.firstChild;
      if (!first) {
        break;
      }
      container.removeChild(first);
    }
  }

  function refreshEventLogDebugDetails() {
    const container = getEventLogElement();
    if (!container) {
      return;
    }
    const items = Array.from(container.children || []);
    items.forEach((item) => {
      updateEventLogItemDebugBlock(item);
    });
  }

  function ensureEventLogListeners() {
    if (eventLogState.listenersBound || typeof globalScope?.addEventListener !== 'function') {
      return;
    }
    const register = (type) => {
      globalScope.addEventListener(`infinite-rails:${type}`, (event) => {
        appendEventLogEntry(type, event?.detail ?? {});
      });
    };
    [
      'started',
      'start-error',
      'initialisation-error',
      'dimension-advanced',
      'portal-ready',
      'portal-activated',
      'victory',
      'asset-fallback',
      'asset-fetch-start',
      'asset-fetch-complete',
      'asset-availability',
      'loot-collected',
      'recipe-crafted',
      'pointer-lock-fallback',
      'score-sync-offline',
      'score-sync-restored',
      'renderer-failure',
      'audio-error',
    ].forEach(register);
    eventLogState.listenersBound = true;
  }

  function bindExperienceEventLog(ui) {
    if (ui?.eventLogEl) {
      setEventLogElement(ui.eventLogEl);
    }
    ensureEventLogListeners();
    refreshEventLogDebugDetails();
  }

  const eventOverlayState = {
    container: null,
    overlays: new Map(),
    order: [],
    listenersBound: false,
    defaultDuration: 6500,
    maxVisible: 4,
  };

  function getEventOverlayContainer() {
    const container = eventOverlayState.container;
    if (container && container.isConnected) {
      return container;
    }
    if (!documentRef || typeof documentRef.getElementById !== 'function') {
      return container || null;
    }
    const element = documentRef.getElementById('eventOverlayStack');
    if (element) {
      eventOverlayState.container = element;
      return element;
    }
    return container || null;
  }

  function updateEventOverlayContainerState() {
    const container = getEventOverlayContainer();
    if (!container) {
      return;
    }
    container.dataset.populated = container.childElementCount > 0 ? 'true' : 'false';
  }

  function setEventOverlayContainer(element) {
    if (!element) {
      return;
    }
    eventOverlayState.container = element;
    eventOverlayState.order.forEach((record) => {
      if (record?.element && record.element.parentNode !== element) {
        element.appendChild(record.element);
      }
    });
    updateEventOverlayContainerState();
  }

  function createEventOverlayRecord(doc) {
    if (!doc) {
      return null;
    }
    const element = doc.createElement('div');
    element.className = 'event-overlay';
    element.dataset.variant = 'info';
    element.dataset.state = 'initial';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    element.tabIndex = -1;

    const iconEl = doc.createElement('span');
    iconEl.className = 'event-overlay__icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = '✨';

    const contentEl = doc.createElement('div');
    contentEl.className = 'event-overlay__content';

    const titleEl = doc.createElement('p');
    titleEl.className = 'event-overlay__title';
    titleEl.hidden = true;

    const messageEl = doc.createElement('p');
    messageEl.className = 'event-overlay__message';
    messageEl.dataset.empty = 'true';

    contentEl.appendChild(titleEl);
    contentEl.appendChild(messageEl);
    element.appendChild(iconEl);
    element.appendChild(contentEl);

    return {
      key: null,
      element,
      iconEl,
      titleEl,
      messageEl,
      hideTimer: null,
      flashTimer: null,
      sticky: false,
    };
  }

  function applyEventOverlayOptions(record, options = {}) {
    if (!record?.element) {
      return;
    }
    const {
      icon,
      title,
      message,
      variant,
      duration,
      sticky,
      flash,
    } = options;

    if (typeof icon === 'string') {
      record.iconEl.textContent = icon.trim().length ? icon : '✨';
      record.iconEl.hidden = icon.trim().length === 0;
    } else if (icon === null) {
      record.iconEl.textContent = '';
      record.iconEl.hidden = true;
    }

    if (title !== undefined) {
      const text = typeof title === 'string' ? title.trim() : '';
      record.titleEl.textContent = text;
      record.titleEl.hidden = text.length === 0;
    }

    if (message !== undefined) {
      const text = typeof message === 'string' ? message.trim() : '';
      record.messageEl.textContent = text;
      record.messageEl.dataset.empty = text.length ? 'false' : 'true';
    }

    const variantKey = typeof variant === 'string' && variant.trim().length ? variant.trim().toLowerCase() : null;
    record.element.dataset.variant = variantKey || 'info';

    if (sticky !== undefined) {
      record.sticky = Boolean(sticky);
    }

    if (record.hideTimer) {
      clearTimeout(record.hideTimer);
      record.hideTimer = null;
    }

    let hideAfter = null;
    if (duration === undefined) {
      hideAfter = record.sticky ? null : eventOverlayState.defaultDuration;
    } else if (Number.isFinite(duration) && duration > 0) {
      hideAfter = duration;
    } else {
      hideAfter = null;
    }

    if (hideAfter && !record.sticky) {
      record.hideTimer = setTimeout(() => {
        dismissEventOverlay(record, 'timeout');
      }, hideAfter);
    }

    if (flash !== false) {
      if (record.flashTimer) {
        clearTimeout(record.flashTimer);
        record.flashTimer = null;
      }
      record.element.classList.remove('event-overlay--flash');
      void record.element.offsetWidth;
      record.element.classList.add('event-overlay--flash');
      record.flashTimer = setTimeout(() => {
        record.element.classList.remove('event-overlay--flash');
        record.flashTimer = null;
      }, 600);
    }
  }

  function dismissEventOverlay(target, reason = 'manual') {
    let record = target;
    if (!record || typeof record !== 'object') {
      const key = typeof target === 'string' && target.trim().length ? target.trim() : null;
      record = key ? eventOverlayState.overlays.get(key) : null;
    }
    if (!record?.element) {
      return false;
    }
    if (record.hideTimer) {
      clearTimeout(record.hideTimer);
      record.hideTimer = null;
    }
    if (record.flashTimer) {
      clearTimeout(record.flashTimer);
      record.flashTimer = null;
      record.element.classList.remove('event-overlay--flash');
    }
    const element = record.element;
    const removeRecord = () => {
      if (record.key) {
        eventOverlayState.overlays.delete(record.key);
      }
      eventOverlayState.order = eventOverlayState.order.filter((entry) => entry !== record);
      if (element?.parentNode) {
        element.parentNode.removeChild(element);
      }
      updateEventOverlayContainerState();
    };
    if (!element) {
      removeRecord();
      return true;
    }
    element.dataset.state = 'exit';
    let removed = false;
    const finalize = () => {
      if (removed) {
        return;
      }
      removed = true;
      element.removeEventListener('transitionend', finalize);
      removeRecord();
    };
    element.addEventListener('transitionend', finalize);
    setTimeout(finalize, 360);
    return true;
  }

  function enforceEventOverlayLimit() {
    const limit = eventOverlayState.maxVisible;
    if (!Number.isFinite(limit) || limit <= 0) {
      return;
    }
    let candidate = eventOverlayState.order.find((record) => !record?.sticky);
    while (candidate && eventOverlayState.order.length > limit) {
      dismissEventOverlay(candidate, 'limit');
      candidate = eventOverlayState.order.find((record) => !record?.sticky);
    }
  }

  function showEventOverlay(options = {}) {
    const container = getEventOverlayContainer();
    if (!container) {
      return null;
    }
    const key = typeof options.key === 'string' && options.key.trim().length ? options.key.trim() : null;
    let record = key ? eventOverlayState.overlays.get(key) : null;
    if (!record) {
      const doc = container.ownerDocument || documentRef || (typeof document !== 'undefined' ? document : null);
      const created = createEventOverlayRecord(doc);
      if (!created) {
        return null;
      }
      record = created;
      record.key = key;
      if (key) {
        eventOverlayState.overlays.set(key, record);
      }
      eventOverlayState.order.push(record);
      container.prepend(record.element);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          record.element.dataset.state = 'visible';
        });
      });
      applyEventOverlayOptions(record, { ...options, flash: false });
    } else {
      applyEventOverlayOptions(record, options);
    }
    enforceEventOverlayLimit();
    updateEventOverlayContainerState();
    return record;
  }

  function createAssetOverlayKey(kind, key) {
    const safeKind = typeof kind === 'string' && kind.trim().length ? kind.trim().toLowerCase() : null;
    const safeKey = typeof key === 'string' && key.trim().length ? key.trim().toLowerCase() : null;
    if (safeKind && safeKey) {
      return `asset:${safeKind}:${safeKey}`;
    }
    if (safeKey) {
      return `asset:${safeKey}`;
    }
    if (safeKind) {
      return `asset:${safeKind}`;
    }
    return null;
  }

  function handleDimensionAdvancedOverlay(detail = {}) {
    const label = extractDimensionLabel(detail) || 'New dimension';
    const assetsVerified = detail?.assetsVerified;
    let message = `${label} secured.`;
    let variant = 'success';
    let icon = '🌌';
    let duration;
    if (assetsVerified === true) {
      message = `${label} secured — all assets verified.`;
    } else if (assetsVerified === false) {
      message = `${label} secured — streaming missing assets.`;
      variant = 'warning';
      icon = '🛠️';
      duration = 9000;
    }
    showEventOverlay({
      title: 'Dimension unlocked',
      message,
      icon,
      variant,
      duration,
    });
  }

  function handlePortalReadyOverlay(detail = {}) {
    const placed = Number.isFinite(detail?.placed) ? detail.placed : null;
    const required = Number.isFinite(detail?.required) ? detail.required : null;
    const progressMessage =
      placed !== null && required !== null
        ? `${placed}/${required} obsidian aligned — ignite when ready.`
        : 'Frame complete — ignite your torch.';
    showEventOverlay({
      title: 'Portal built',
      message: progressMessage,
      icon: '🌀',
      variant: 'info',
      duration: 7000,
    });
  }

  function handlePortalActivatedOverlay(detail = {}) {
    const label = extractDimensionLabel(detail) || 'next dimension';
    showEventOverlay({
      title: 'Portal activated',
      message: `Gateway to ${label} stabilised.`,
      icon: '🚪',
      variant: 'success',
      duration: 6500,
    });
  }

  function handleLootCollectedOverlay(detail = {}) {
    const itemsSummary = formatLootItemList(detail);
    const score = Number.isFinite(detail?.score) ? detail.score : null;
    const parts = [];
    if (itemsSummary) {
      parts.push(itemsSummary);
    }
    const fallbackMessage = typeof detail?.message === 'string' && detail.message.trim().length ? detail.message.trim() : '';
    if (!parts.length && fallbackMessage) {
      parts.push(fallbackMessage);
    }
    let message = parts.length ? parts.join(' • ') : 'Resources added to your satchel.';
    if (score && score !== 0) {
      const formattedScore = typeof score.toLocaleString === 'function' ? score.toLocaleString() : String(score);
      message += ` (+${formattedScore} pts)`;
    }
    showEventOverlay({
      title: 'Loot found',
      message,
      icon: '💎',
      variant: 'success',
      duration: 8000,
    });
  }

  function handleAssetFetchStartOverlay(detail = {}) {
    const label = formatAssetLogLabel(detail);
    const key = createAssetOverlayKey(detail?.kind, detail?.key);
    showEventOverlay({
      key,
      title: 'Streaming asset',
      message: `Loading ${label}…`,
      icon: '⏳',
      variant: 'progress',
      duration: null,
      sticky: true,
      flash: false,
    });
  }

  function handleAssetFetchCompleteOverlay(detail = {}) {
    const label = formatAssetLogLabel(detail);
    const key = createAssetOverlayKey(detail?.kind, detail?.key);
    const duration = Number.isFinite(detail?.duration) ? Math.round(detail.duration) : null;
    const urlSummary = summariseAssetUrl(detail?.url);
    const fulfilled = detail?.status === 'fulfilled';
    let message = '';
    if (fulfilled) {
      message = duration ? `Loaded ${label} in ${duration}ms.` : `Loaded ${label}.`;
      if (urlSummary) {
        message += ` via ${urlSummary}.`;
      }
    } else {
      message = duration ? `Failed to load ${label} after ${duration}ms.` : `Failed to load ${label}.`;
      if (urlSummary) {
        message += ` (last URL ${urlSummary}).`;
      }
    }
    showEventOverlay({
      key,
      title: fulfilled ? 'Asset ready' : 'Asset failed',
      message,
      icon: fulfilled ? '✅' : '⚠️',
      variant: fulfilled ? 'success' : 'danger',
      duration: fulfilled ? 4000 : 9000,
      sticky: false,
    });
  }

  function handleAssetAvailabilityOverlay(detail = {}) {
    const missing = Array.isArray(detail?.missing) ? detail.missing.length : 0;
    const total = Number.isFinite(detail?.total) ? detail.total : null;
    if (detail?.status === 'skipped') {
      showEventOverlay({
        title: 'Asset availability skipped',
        message: 'Probe unavailable in this environment.',
        icon: 'ℹ️',
        variant: 'info',
        duration: 5000,
      });
      return;
    }
    if (detail?.status === 'error') {
      showEventOverlay({
        title: 'Asset availability failed',
        message: 'Probe encountered an error — review diagnostics.',
        icon: '⚠️',
        variant: 'danger',
        duration: 9000,
      });
      return;
    }
    if (missing > 0) {
      const preview = Array.isArray(detail?.missing) ? detail.missing.slice(0, 3).join(', ') : '';
      const suffix = missing > 3 ? `, +${missing - 3} more` : '';
      const message = total !== null
        ? `${missing}/${total} missing — ${preview}${suffix}`
        : `${missing} missing — ${preview}${suffix}`;
      showEventOverlay({
        title: 'Critical assets missing',
        message,
        icon: '🚨',
        variant: 'warning',
        duration: 10000,
      });
      return;
    }
    showEventOverlay({
      title: 'Assets verified',
      message: 'All critical assets reachable.',
      icon: '✅',
      variant: 'success',
      duration: 5000,
    });
  }

  function ensureEventOverlayListeners() {
    if (eventOverlayState.listenersBound || typeof globalScope?.addEventListener !== 'function') {
      return;
    }
    const register = (type, handler) => {
      globalScope.addEventListener(`infinite-rails:${type}`, (event) => {
        handler(event?.detail ?? {}, event);
      });
    };
    register('dimension-advanced', handleDimensionAdvancedOverlay);
    register('portal-ready', handlePortalReadyOverlay);
    register('portal-activated', handlePortalActivatedOverlay);
    register('loot-collected', handleLootCollectedOverlay);
    register('asset-fetch-start', handleAssetFetchStartOverlay);
    register('asset-fetch-complete', handleAssetFetchCompleteOverlay);
    register('asset-availability', handleAssetAvailabilityOverlay);
    eventOverlayState.listenersBound = true;
  }

  function bindExperienceEventOverlays(ui) {
    if (ui?.eventOverlayStack) {
      setEventOverlayContainer(ui.eventOverlayStack);
    }
    ensureEventOverlayListeners();
    updateEventOverlayContainerState();
  }

  function getEventLogHistorySnapshot() {
    return eventLogState.history.map((entry) => ({
      type: entry.type,
      timestamp: entry.timestamp,
      message: entry.message,
      detail: entry.detail ?? null,
    }));
  }

  function buildDiagnosticsReport() {
    const scope = typeof globalScope !== 'undefined' ? globalScope : globalThis;
    const diagnostics = typeof bootstrapOverlay?.diagnostics === 'object' ? bootstrapOverlay.diagnostics : {};
    const history = getEventLogHistorySnapshot();
    const lastFailure = lastRendererFailureDetail ? { ...lastRendererFailureDetail } : null;
    const bootDiagnosticsSnapshot = cloneBootDiagnosticsSnapshot(bootDiagnosticsState.lastSnapshot);
    const bootDiagnosticsErrors = summariseBootDiagnosticErrors(bootDiagnosticsState.lastSnapshot);
    const activeApiBase = identityState.apiBaseUrl ?? null;
    const configuredApiBase = identityState.configuredApiBaseUrl ?? null;
    const endpointsSnapshot =
      identityState.endpoints && typeof identityState.endpoints === 'object'
        ? {
            scores:
              typeof identityState.endpoints.scores === 'string'
                ? identityState.endpoints.scores
                : identityState.endpoints.scores ?? null,
            users:
              typeof identityState.endpoints.users === 'string'
                ? identityState.endpoints.users
                : identityState.endpoints.users ?? null,
          }
        : null;
    const configuredEndpointsSnapshot =
      identityState.configuredEndpoints && typeof identityState.configuredEndpoints === 'object'
        ? {
            scores:
              typeof identityState.configuredEndpoints.scores === 'string'
                ? identityState.configuredEndpoints.scores
                : identityState.configuredEndpoints.scores ?? null,
            users:
              typeof identityState.configuredEndpoints.users === 'string'
                ? identityState.configuredEndpoints.users
                : identityState.configuredEndpoints.users ?? null,
          }
        : null;
    const backendValidationSnapshot = identityState.backendValidation
      ? {
          performed: Boolean(identityState.backendValidation.performed),
          ok:
            typeof identityState.backendValidation.ok === 'boolean'
              ? identityState.backendValidation.ok
              : null,
          checkedAt:
            typeof identityState.backendValidation.checkedAt === 'string'
              ? identityState.backendValidation.checkedAt
              : identityState.backendValidation.checkedAt ?? null,
          detail:
            identityState.backendValidation.detail && typeof identityState.backendValidation.detail === 'object'
              ? { ...identityState.backendValidation.detail }
              : null,
        }
      : null;
    return {
      generatedAt: new Date().toISOString(),
      rendererMode: scope?.InfiniteRails?.rendererMode ?? null,
      diagnostics,
      lastRendererFailure: lastFailure,
      backend: {
        configured: Boolean(configuredApiBase),
        active: Boolean(activeApiBase),
        apiBaseUrl: activeApiBase,
        configuredApiBaseUrl: configuredApiBase,
        originalApiBaseUrl: identityState.originalApiBaseUrl ?? null,
        endpoints: endpointsSnapshot,
        configuredEndpoints: configuredEndpointsSnapshot,
        validation: backendValidationSnapshot,
      },
      debugMode: isDebugModeEnabled(),
      userAgent: scope?.navigator?.userAgent ?? null,
      eventLog: history,
      diagnosticLog:
        typeof bootstrapOverlay?.getLogEntries === 'function'
          ? bootstrapOverlay.getLogEntries()
          : [],
      structuredLog:
        typeof centralLogStore?.getEntries === 'function'
          ? centralLogStore.getEntries()
          : [],
      liveDiagnostics: getLiveDiagnosticsEntriesSnapshot(),
      bootDiagnostics: bootDiagnosticsSnapshot,
      bootDiagnosticsErrors,
      manifestAssets: buildManifestAssetCheckReport(),
    };
  }

  function downloadDiagnosticsReport() {
    const scope = typeof globalScope !== 'undefined' ? globalScope : globalThis;
    let payload;
    try {
      payload = JSON.stringify(buildDiagnosticsReport(), null, 2);
    } catch (error) {
      payload = JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          error: 'Failed to serialise diagnostics report',
          message: error?.message ?? String(error),
        },
        null,
        2,
      );
    }
    const timestampLabel = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `infinite-rails-diagnostics-${timestampLabel}.json`;
    const doc = documentRef || scope.document || null;
    const triggerDownload = (href, useBlob = false) => {
      const anchor = doc?.createElement?.('a');
      if (!anchor) {
        return false;
      }
      if (!doc?.body) {
        return false;
      }
      anchor.href = href;
      anchor.download = filename;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      doc.body.appendChild(anchor);
      try {
        anchor.click();
      } catch (clickError) {
        doc.body.removeChild(anchor);
        return false;
      }
      doc.body.removeChild(anchor);
      if (useBlob && scope?.URL?.revokeObjectURL) {
        scope.URL.revokeObjectURL(href);
      }
      return true;
    };
    if (typeof Blob !== 'undefined' && scope?.URL?.createObjectURL) {
      try {
        const blob = new Blob([payload], { type: 'application/json' });
        const url = scope.URL.createObjectURL(blob);
        if (triggerDownload(url, true)) {
          return true;
        }
        scope.URL.revokeObjectURL(url);
      } catch (error) {
        if (scope.console?.debug) {
          scope.console.debug('Falling back to data URL for diagnostics download.', error);
        }
      }
    }
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`;
    if (triggerDownload(dataUrl)) {
      return true;
    }
    if (scope?.navigator?.clipboard?.writeText) {
      scope.navigator.clipboard.writeText(payload).catch(() => {});
      return false;
    }
    if (scope.console?.warn) {
      scope.console.warn('Unable to trigger diagnostics download in this environment.');
    }
    return false;
  }

  function fallbackCopyDiagnosticsText(text) {
    const scope = typeof globalScope !== 'undefined' ? globalScope : globalThis;
    const doc = documentRef || scope.document || null;
    if (!doc?.body?.appendChild) {
      return false;
    }
    let textarea = null;
    try {
      textarea = doc.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      doc.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      if (typeof doc.execCommand === 'function') {
        return doc.execCommand('copy');
      }
      if (typeof globalScope?.document?.execCommand === 'function') {
        return globalScope.document.execCommand('copy');
      }
      return false;
    } catch (error) {
      scope?.console?.debug?.('Fallback clipboard copy failed.', error);
      return false;
    } finally {
      if (textarea && textarea.parentNode) {
        textarea.parentNode.removeChild(textarea);
      }
    }
  }

  async function reportDiagnosticsIssue() {
    const scope = typeof globalScope !== 'undefined' ? globalScope : globalThis;
    let payload;
    try {
      payload = JSON.stringify(buildDiagnosticsReport(), null, 2);
    } catch (error) {
      payload = JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          error: 'Failed to serialise diagnostics report',
          message: error?.message ?? String(error),
        },
        null,
        2,
      );
    }
    let copied = false;
    if (scope?.navigator?.clipboard?.writeText) {
      try {
        await scope.navigator.clipboard.writeText(payload);
        copied = true;
      } catch (error) {
        scope?.console?.debug?.('Navigator clipboard write failed; falling back.', error);
      }
    }
    if (!copied) {
      copied = fallbackCopyDiagnosticsText(payload);
    }
    const logDetail = { origin: 'report-action' };
    if (copied) {
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('ui', 'Diagnostics report copied to clipboard for support.', {
          level: 'success',
          detail: logDetail,
        });
      } else if (typeof centralLogStore?.record === 'function') {
        centralLogStore.record({
          category: 'ui',
          scope: 'ui',
          level: 'success',
          message: 'Diagnostics report copied to clipboard for support.',
          origin: 'report-action',
        });
      }
    } else {
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('ui', 'Clipboard unavailable. Triggered diagnostics download instead.', {
          level: 'warning',
          detail: logDetail,
        });
      } else if (typeof centralLogStore?.record === 'function') {
        centralLogStore.record({
          category: 'ui',
          scope: 'ui',
          level: 'warning',
          message: 'Clipboard unavailable. Triggered diagnostics download instead.',
          origin: 'report-action',
        });
      }
      downloadDiagnosticsReport();
    }
    const doc = documentRef || scope.document || null;
    const supportLink = doc?.getElementById?.('globalOverlaySupportLink');
    if (supportLink) {
      try {
        if (typeof supportLink.click === 'function') {
          supportLink.click();
        } else if (supportLink.href && typeof scope?.open === 'function') {
          scope.open(supportLink.href, '_blank', 'noopener');
        }
      } catch (error) {
        scope?.console?.debug?.('Support link trigger failed.', error);
      }
    }
    return copied;
  }

  function bindDiagnosticsActions() {
    const scope = typeof globalScope !== 'undefined' ? globalScope : globalThis;
    const doc = documentRef || scope.document || null;
    if (!doc) {
      return;
    }
    const downloadButton = doc.getElementById('globalOverlayDownloadLogs');
    if (downloadButton && !downloadButton.dataset.diagnosticsBound) {
      downloadButton.addEventListener('click', (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        downloadDiagnosticsReport();
      });
      downloadButton.dataset.diagnosticsBound = 'true';
    }
    const reportButton = doc.getElementById('globalOverlayReportIssue');
    if (reportButton && !reportButton.dataset.diagnosticsBound) {
      reportButton.addEventListener('click', (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        reportDiagnosticsIssue().catch((error) => {
          scope?.console?.debug?.('Diagnostics report action failed.', error);
          downloadDiagnosticsReport();
        });
      });
      reportButton.dataset.diagnosticsBound = 'true';
    }
  }

  bindDiagnosticsActions();
  registerCentralErrorChannels();
  installApiDiagnosticsHooks();
  installRenderDiagnosticsHooks();

  function persistDebugModePreference(enabled) {
    if (!globalScope?.localStorage) {
      return;
    }
    try {
      if (enabled) {
        globalScope.localStorage.setItem(debugModeState.storageKey, '1');
      } else {
        globalScope.localStorage.removeItem(debugModeState.storageKey);
      }
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Unable to persist debug mode preference.', error);
      }
    }
  }

  function addDebugModeChangeListener(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    debugModeState.listeners.add(listener);
    return () => {
      debugModeState.listeners.delete(listener);
    };
  }

  function refreshDebugModeUi() {
    const doc = documentRef || globalScope.document || null;
    const mode = isDebugModeEnabled() ? 'verbose' : 'standard';
    if (doc?.documentElement?.setAttribute) {
      doc.documentElement.setAttribute('data-debug-mode', mode);
    }
    if (doc?.body?.setAttribute) {
      doc.body.setAttribute('data-debug-mode', mode);
    }
    const button = debugModeState.toggleButton;
    if (button) {
      const enabled = isDebugModeEnabled();
      button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      const label = enabled ? 'Disable Debug Mode' : 'Enable Debug Mode';
      button.textContent = label;
      const hint = enabled ? 'Disable verbose diagnostics' : 'Enable verbose diagnostics';
      button.dataset.hint = hint;
      button.setAttribute('aria-label', hint);
    }
    const statusEl = debugModeState.statusElement;
    if (statusEl) {
      statusEl.textContent = isDebugModeEnabled()
        ? 'Verbose diagnostics enabled — event log entries now include detailed traces.'
        : 'Standard diagnostics active. Enable debug mode to reveal detailed error traces.';
      statusEl.dataset.state = isDebugModeEnabled() ? 'enabled' : 'disabled';
    }
  }

  function refreshRendererFailureOverlay() {
    if (!lastRendererFailureDetail) {
      return;
    }
    if (typeof bootstrapOverlay?.showError !== 'function') {
      return;
    }
    if (bootstrapOverlay.state?.mode !== 'error') {
      return;
    }
    bootstrapOverlay.showError({
      title: 'Renderer unavailable',
      message: formatRendererFailureMessage(lastRendererFailureDetail),
    });
    bootstrapOverlay.setDiagnostic('renderer', {
      status: 'error',
      message: formatRendererFailureMessage(lastRendererFailureDetail),
    });
  }

  function setDebugModeEnabled(enabled, options = {}) {
    const next = Boolean(enabled);
    const previous = debugModeState.enabled;
    if (previous === next) {
      if (options.forceRefresh) {
        refreshDebugModeUi();
        refreshEventLogDebugDetails();
        refreshRendererFailureOverlay();
      }
      return next;
    }
    debugModeState.enabled = next;
    if (options.persist !== false) {
      persistDebugModePreference(next);
    }
    refreshDebugModeUi();
    refreshEventLogDebugDetails();
    refreshRendererFailureOverlay();
    refreshLiveDiagnosticsUi();
    if (options.log !== false) {
      appendEventLogEntry('debug-mode', {
        enabled: next,
        source: options.source || 'unknown',
        timestamp: Date.now(),
      });
    }
    const listeners = Array.from(debugModeState.listeners);
    listeners.forEach((listener) => {
      try {
        listener(next);
      } catch (error) {
        if (globalScope.console?.debug) {
          globalScope.console.debug('Debug mode listener error', error);
        }
      }
    });
    return next;
  }

  function toggleDebugMode(options = {}) {
    return setDebugModeEnabled(!isDebugModeEnabled(), options);
  }

  function formatAudioVolumeLabel(channel, snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return '0%';
    }
    const volumes = snapshot.volumes || {};
    const base = Number.isFinite(volumes[channel]) ? volumes[channel] : 0;
    if (channel === 'master') {
      if (snapshot.muted || base === 0) {
        return 'Muted';
      }
      return `${Math.round(base * 100)}%`;
    }
    if (snapshot.muted || !Number.isFinite(volumes.master) || volumes.master === 0) {
      return 'Muted';
    }
    return `${Math.round(base * 100)}%`;
  }

  function bindAudioSettingsControls(ui) {
    const doc = documentRef || globalScope.document || null;
    const form = ui?.settingsForm ?? doc?.querySelector?.('[data-settings-form]') ?? null;
    if (!form || form.dataset.audioSettingsBound === 'true') {
      return;
    }

    const sliderInputs = new Map();
    AUDIO_SETTINGS_CHANNELS.forEach((channel) => {
      const input = form.querySelector(`input[name="${channel}"]`);
      if (input) {
        sliderInputs.set(channel, input);
      }
    });

    const labels = new Map();
    AUDIO_SETTINGS_CHANNELS.forEach((channel) => {
      const label = form.querySelector(`[data-volume-label="${channel}"]`);
      if (label) {
        labels.set(channel, label);
      }
    });

    const muteToggle = form.querySelector('[data-audio-mute]');

    const handleSliderInput = (channel) => (event) => {
      const rawValue = Number.parseFloat(event?.target?.value ?? sliderInputs.get(channel)?.value ?? '0');
      const percent = Number.isFinite(rawValue) ? rawValue : 0;
      const volume = clampAudioVolume(percent / 100);
      setAudioChannelVolume(channel, volume, { source: 'ui', persist: true, reason: 'ui-volume-change' });
    };

    sliderInputs.forEach((input, channel) => {
      const handler = handleSliderInput(channel);
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });

    if (muteToggle) {
      muteToggle.addEventListener('change', (event) => {
        setAudioMuted(Boolean(event?.target?.checked), {
          source: 'ui',
          persist: true,
          reason: 'ui-mute-toggle',
        });
      });
    }

    const updateUi = (snapshot = createAudioSettingsSnapshot()) => {
      AUDIO_SETTINGS_CHANNELS.forEach((channel) => {
        const input = sliderInputs.get(channel);
        if (input) {
          const sliderValue = Math.round((snapshot.volumes?.[channel] ?? 0) * 100);
          if (Number(input.value) !== sliderValue) {
            input.value = String(sliderValue);
          }
        }
        const label = labels.get(channel);
        if (label) {
          label.textContent = formatAudioVolumeLabel(channel, snapshot);
        }
      });
      if (muteToggle) {
        muteToggle.checked = snapshot.muted === true;
      }
    };

    addAudioSettingsListener((snapshot) => updateUi(snapshot));
    updateUi(createAudioSettingsSnapshot());

    form.dataset.audioSettingsBound = 'true';
  }

  function bindDebugModeControls(ui) {
    if (!ui) {
      return;
    }
    const toggle = ui.debugModeToggle;
    if (toggle) {
      debugModeState.toggleButton = toggle;
      if (!toggle.dataset.debugModeBound) {
        toggle.addEventListener('click', (event) => {
          if (event?.preventDefault) {
            event.preventDefault();
          }
          toggleDebugMode({ source: 'ui' });
        });
        toggle.dataset.debugModeBound = 'true';
      }
    }
    if (ui.debugModeStatus) {
      debugModeState.statusElement = ui.debugModeStatus;
    }
    setDebugModeEnabled(isDebugModeEnabled(), { persist: false, log: false, forceRefresh: true });
  }

  refreshDebugModeUi();

  function persistDeveloperStatsPreference(enabled) {
    if (!globalScope?.localStorage) {
      return;
    }
    try {
      if (enabled) {
        globalScope.localStorage.setItem(developerStatsState.storageKey, '1');
      } else {
        globalScope.localStorage.removeItem(developerStatsState.storageKey);
      }
    } catch (error) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Unable to persist developer stats preference.', error);
      }
    }
  }

  function addDeveloperStatsChangeListener(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    developerStatsState.listeners.add(listener);
    return () => {
      developerStatsState.listeners.delete(listener);
    };
  }

  function clearDeveloperStatsDisplay() {
    const { fields } = developerStatsState;
    if (!fields) {
      return;
    }
    ['fps', 'models', 'textures', 'audio', 'assets', 'scene'].forEach((key) => {
      const element = fields[key];
      if (element) {
        element.textContent = '—';
      }
    });
  }

  function formatDeveloperStatCount(value) {
    if (!Number.isFinite(value) || value < 0) {
      return '—';
    }
    return Math.round(value).toLocaleString(undefined);
  }

  function formatDeveloperStatFps(value) {
    if (!Number.isFinite(value) || value <= 0) {
      return '—';
    }
    const safe = Math.max(0, value);
    if (safe >= 100) {
      return Math.round(safe).toString();
    }
    return safe.toFixed(1);
  }

  function formatDeveloperStatAssetStatus(status) {
    if (!status || typeof status !== 'object') {
      return '—';
    }
    const pending = Number.isFinite(status.pending) ? Math.max(0, status.pending) : 0;
    const failures = Number.isFinite(status.failures) ? Math.max(0, status.failures) : 0;
    if (pending > 0 && failures > 0 && failures !== pending) {
      return `${pending.toLocaleString(undefined)} pending / ${failures.toLocaleString(undefined)} tracked`;
    }
    if (pending > 0) {
      return `${pending.toLocaleString(undefined)} pending`;
    }
    if (failures > 0) {
      return `${failures.toLocaleString(undefined)} tracked`;
    }
    return '0';
  }

  function formatDeveloperStatSceneStatus(status) {
    if (!status || typeof status !== 'object') {
      return '—';
    }
    const sceneChildren = Number.isFinite(status.sceneChildren) ? Math.max(0, status.sceneChildren) : null;
    const worldChildren = Number.isFinite(status.worldChildren) ? Math.max(0, status.worldChildren) : null;
    const terrainMeshes = Number.isFinite(status.terrainMeshes) ? Math.max(0, status.terrainMeshes) : null;
    const actorCount = Number.isFinite(status.actorCount) ? Math.max(0, status.actorCount) : null;
    const parts = [];
    if (sceneChildren !== null || worldChildren !== null) {
      const sceneLabel = sceneChildren !== null ? sceneChildren.toLocaleString(undefined) : '—';
      const worldLabel = worldChildren !== null ? worldChildren.toLocaleString(undefined) : '—';
      parts.push(`${sceneLabel} scene / ${worldLabel} world`);
    }
    if (terrainMeshes !== null) {
      parts.push(`${terrainMeshes.toLocaleString(undefined)} terrain`);
    }
    if (actorCount !== null) {
      parts.push(`${actorCount.toLocaleString(undefined)} actors`);
    }
    if (!parts.length) {
      return '—';
    }
    return parts.join(' · ');
  }

  function updateDeveloperStatsDisplay(metrics) {
    const { fields } = developerStatsState;
    if (!fields) {
      return;
    }
    if (fields.fps) {
      fields.fps.textContent = formatDeveloperStatFps(metrics?.fps);
    }
    if (fields.models) {
      fields.models.textContent = formatDeveloperStatCount(metrics?.models);
    }
    if (fields.textures) {
      fields.textures.textContent = formatDeveloperStatCount(metrics?.textures);
    }
    if (fields.audio) {
      fields.audio.textContent = formatDeveloperStatCount(metrics?.audio);
    }
    if (fields.assets) {
      fields.assets.textContent = formatDeveloperStatAssetStatus(metrics?.assets);
    }
    if (fields.scene) {
      fields.scene.textContent = formatDeveloperStatSceneStatus(metrics?.scene);
    }
  }

  function collectDeveloperMetrics() {
    const instance = activeExperienceInstance;
    if (!instance || typeof instance.getDeveloperMetrics !== 'function') {
      return null;
    }
    try {
      const metrics = instance.getDeveloperMetrics();
      if (!metrics || typeof metrics !== 'object') {
        return null;
      }
      developerStatsState.metricsErrorLogged = false;
      const normaliseAssets = (value) => {
        if (!value || typeof value !== 'object') {
          return { pending: 0, failures: 0 };
        }
        return {
          pending: Number.isFinite(value.pending) ? Math.max(0, value.pending) : 0,
          failures: Number.isFinite(value.failures) ? Math.max(0, value.failures) : 0,
        };
      };
      const normaliseScene = (value) => {
        if (!value || typeof value !== 'object') {
          return {
            sceneChildren: 0,
            worldChildren: 0,
            terrainMeshes: 0,
            actorCount: 0,
          };
        }
        return {
          sceneChildren: Number.isFinite(value.sceneChildren) ? Math.max(0, value.sceneChildren) : 0,
          worldChildren: Number.isFinite(value.worldChildren) ? Math.max(0, value.worldChildren) : 0,
          terrainMeshes: Number.isFinite(value.terrainMeshes) ? Math.max(0, value.terrainMeshes) : 0,
          actorCount: Number.isFinite(value.actorCount) ? Math.max(0, value.actorCount) : 0,
        };
      };
      return {
        fps: Number.isFinite(metrics.fps) ? metrics.fps : 0,
        models: Number.isFinite(metrics.models) ? metrics.models : 0,
        textures: Number.isFinite(metrics.textures) ? metrics.textures : 0,
        audio: Number.isFinite(metrics.audio) ? metrics.audio : 0,
        assets: normaliseAssets(metrics.assets),
        scene: normaliseScene(metrics.scene),
      };
    } catch (error) {
      if (!developerStatsState.metricsErrorLogged && globalScope.console?.debug) {
        globalScope.console.debug('Developer metrics retrieval failed.', error);
        developerStatsState.metricsErrorLogged = true;
      }
      return null;
    }
  }

  function cancelDeveloperStatsUpdate() {
    if (developerStatsState.updateHandle === null) {
      return;
    }
    const scope = globalScope;
    if (!scope) {
      developerStatsState.updateHandle = null;
      developerStatsState.updateMode = null;
      return;
    }
    if (developerStatsState.updateMode === 'raf' && typeof scope.cancelAnimationFrame === 'function') {
      scope.cancelAnimationFrame(developerStatsState.updateHandle);
    } else if (developerStatsState.updateMode === 'timeout' && typeof scope.clearTimeout === 'function') {
      scope.clearTimeout(developerStatsState.updateHandle);
    }
    developerStatsState.updateHandle = null;
    developerStatsState.updateMode = null;
  }

  function runDeveloperStatsUpdate(timestamp) {
    if (!developerStatsState.enabled) {
      return;
    }
    const now = Number.isFinite(timestamp) ? timestamp : Date.now();
    if (!developerStatsState.lastUpdateAt || now - developerStatsState.lastUpdateAt >= 250) {
      const metrics = collectDeveloperMetrics();
      if (metrics) {
        updateDeveloperStatsDisplay(metrics);
      } else {
        clearDeveloperStatsDisplay();
      }
      developerStatsState.lastUpdateAt = now;
    }
    scheduleDeveloperStatsUpdate();
  }

  function scheduleDeveloperStatsUpdate() {
    cancelDeveloperStatsUpdate();
    if (!developerStatsState.enabled) {
      return;
    }
    const scope = globalScope;
    if (!scope) {
      return;
    }
    const step = (timestamp) => {
      developerStatsState.updateHandle = null;
      runDeveloperStatsUpdate(typeof timestamp === 'number' ? timestamp : Date.now());
    };
    if (typeof scope.requestAnimationFrame === 'function') {
      developerStatsState.updateMode = 'raf';
      developerStatsState.updateHandle = scope.requestAnimationFrame(step);
    } else if (typeof scope.setTimeout === 'function') {
      developerStatsState.updateMode = 'timeout';
      developerStatsState.updateHandle = scope.setTimeout(() => step(Date.now()), 250);
    }
  }

  function refreshDeveloperStatsUi() {
    const button = developerStatsState.toggleButton;
    const panel = developerStatsState.panel;
    const enabled = developerStatsState.enabled;
    if (button) {
      button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      const label = enabled ? 'Hide Developer Stats' : 'Show Developer Stats';
      button.textContent = label;
      const hint = enabled
        ? 'Hide developer performance metrics'
        : 'Show developer performance metrics';
      button.dataset.hint = hint;
      button.setAttribute('aria-label', hint);
    }
    if (panel) {
      panel.hidden = !enabled;
      panel.dataset.state = enabled ? 'enabled' : 'disabled';
    }
    developerStatsState.lastUpdateAt = 0;
    if (enabled) {
      const metrics = collectDeveloperMetrics();
      if (metrics) {
        updateDeveloperStatsDisplay(metrics);
      } else {
        clearDeveloperStatsDisplay();
      }
      scheduleDeveloperStatsUpdate();
    } else {
      cancelDeveloperStatsUpdate();
      clearDeveloperStatsDisplay();
    }
  }

  function setDeveloperStatsEnabled(enabled, options = {}) {
    const next = Boolean(enabled);
    const previous = developerStatsState.enabled;
    if (previous === next && !options.forceRefresh) {
      return next;
    }
    developerStatsState.enabled = next;
    if (options.persist !== false) {
      persistDeveloperStatsPreference(next);
    }
    refreshDeveloperStatsUi();
    if (previous !== next || options.forceRefresh) {
      const listeners = Array.from(developerStatsState.listeners);
      listeners.forEach((listener) => {
        try {
          listener(next);
        } catch (error) {
          if (globalScope.console?.debug) {
            globalScope.console.debug('Developer stats listener error', error);
          }
        }
      });
    }
    return next;
  }

  function toggleDeveloperStats(options = {}) {
    return setDeveloperStatsEnabled(!developerStatsState.enabled, options);
  }

  function bindDeveloperStatsControls(ui) {
    if (!ui) {
      return;
    }
    const toggle = ui.developerStatsToggle;
    if (toggle) {
      developerStatsState.toggleButton = toggle;
      if (!toggle.dataset.developerStatsBound) {
        toggle.addEventListener('click', (event) => {
          if (event?.preventDefault) {
            event.preventDefault();
          }
          toggleDeveloperStats({ source: 'ui' });
        });
        toggle.dataset.developerStatsBound = 'true';
      }
    }
    if (ui.developerStatsPanel) {
      developerStatsState.panel = ui.developerStatsPanel;
      developerStatsState.fields = {
        fps: ui.developerStatsPanel.querySelector('[data-stat="fps"]') || null,
        models: ui.developerStatsPanel.querySelector('[data-stat="models"]') || null,
        textures: ui.developerStatsPanel.querySelector('[data-stat="textures"]') || null,
        audio: ui.developerStatsPanel.querySelector('[data-stat="audio"]') || null,
        assets: ui.developerStatsPanel.querySelector('[data-stat="assets"]') || null,
        scene: ui.developerStatsPanel.querySelector('[data-stat="scene"]') || null,
      };
    }
    setDeveloperStatsEnabled(developerStatsState.enabled, { persist: false, forceRefresh: true });
  }

  function normaliseLiveDiagnosticType(value) {
    if (typeof value !== 'string') {
      return 'system';
    }
    const key = value.trim().toLowerCase();
    return LIVE_DIAGNOSTIC_CATEGORIES[key] ? key : 'system';
  }

  function normaliseLiveDiagnosticLevel(level) {
    if (typeof level !== 'string') {
      return 'error';
    }
    const key = level.trim().toLowerCase();
    if (key === 'warning' || key === 'info') {
      return key;
    }
    if (key === 'success') {
      return 'info';
    }
    return 'error';
  }

  function serialiseLiveDiagnosticDetail(detail) {
    if (detail === null || typeof detail === 'undefined') {
      return null;
    }
    if (typeof detail === 'string' || typeof detail === 'number' || typeof detail === 'boolean') {
      return detail;
    }
    if (detail instanceof Error) {
      return {
        name: detail.name,
        message: detail.message,
        stack: typeof detail.stack === 'string' ? detail.stack : undefined,
      };
    }
    if (detail && typeof detail === 'object') {
      try {
        return JSON.parse(JSON.stringify(detail));
      } catch (error) {
        const copy = {};
        Object.keys(detail).forEach((key) => {
          const value = detail[key];
          if (typeof value === 'undefined') {
            return;
          }
          if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            copy[key] = value;
            return;
          }
          try {
            copy[key] = JSON.parse(JSON.stringify(value));
          } catch (nestedError) {
            copy[key] = String(value);
          }
        });
        return copy;
      }
    }
    return String(detail);
  }

  function formatLiveDiagnosticDetail(detail) {
    if (detail === null || typeof detail === 'undefined') {
      return null;
    }
    if (typeof detail === 'string') {
      return detail;
    }
    if (typeof detail === 'number' || typeof detail === 'boolean') {
      return String(detail);
    }
    try {
      return JSON.stringify(detail, null, 2);
    } catch (error) {
      return String(detail);
    }
  }

  function renderLiveDiagnosticsEntries({ scroll = false } = {}) {
    const doc = documentRef || globalScope.document || null;
    const list = liveDiagnosticsState.list;
    const empty = liveDiagnosticsState.empty;
    if (!doc || !list || !empty) {
      return;
    }
    list.innerHTML = '';
    const entries = liveDiagnosticsState.entries;
    entries.forEach((entry) => {
      const item = doc.createElement('li');
      item.className = `live-diagnostics__entry live-diagnostics__entry--${entry.type}`;
      item.dataset.level = entry.level;
      const meta = doc.createElement('div');
      meta.className = 'live-diagnostics__meta';
      const badge = doc.createElement('span');
      badge.className = 'live-diagnostics__badge';
      badge.textContent = `${entry.icon} ${entry.label}`;
      meta.appendChild(badge);
      const timestampEl = doc.createElement('time');
      timestampEl.className = 'live-diagnostics__timestamp';
      if (typeof timestampEl.setAttribute === 'function') {
        timestampEl.setAttribute('datetime', new Date(entry.timestamp).toISOString());
      }
      timestampEl.textContent = formatEventTimestamp(entry.timestamp);
      meta.appendChild(timestampEl);
      item.appendChild(meta);
      const messageEl = doc.createElement('p');
      messageEl.className = 'live-diagnostics__message';
      messageEl.textContent = entry.message;
      item.appendChild(messageEl);
      const detailText = formatLiveDiagnosticDetail(entry.detail);
      if (detailText) {
        const detailEl = doc.createElement('pre');
        detailEl.className = 'live-diagnostics__detail';
        detailEl.textContent = detailText;
        item.appendChild(detailEl);
      }
      list.appendChild(item);
    });
    const hasEntries = entries.length > 0;
    list.hidden = !hasEntries;
    empty.hidden = hasEntries;
    if (hasEntries && scroll) {
      list.scrollTop = list.scrollHeight;
    }
  }

  function refreshLiveDiagnosticsUi() {
    const debugEnabled = isDebugModeEnabled();
    const button = liveDiagnosticsState.toggleButton;
    if (button) {
      const enabled = debugEnabled && liveDiagnosticsState.enabled;
      button.disabled = !debugEnabled;
      button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      const label = enabled ? 'Hide Live Diagnostics' : 'Show Live Diagnostics';
      button.textContent = label;
      const hint = debugEnabled
        ? enabled
          ? 'Hide the live diagnostics panel'
          : 'Show live diagnostics captured during this session'
        : 'Enable debug mode to unlock live diagnostics';
      button.dataset.hint = hint;
      button.setAttribute('aria-label', hint);
    }
    const panel = liveDiagnosticsState.panel;
    if (panel) {
      const visible = debugEnabled && liveDiagnosticsState.enabled;
      panel.hidden = !visible;
      panel.dataset.state = visible ? 'visible' : 'hidden';
    }
    renderLiveDiagnosticsEntries({ scroll: false });
  }

  function setLiveDiagnosticsEnabled(enabled, options = {}) {
    const debugEnabled = isDebugModeEnabled();
    const next = Boolean(enabled) && debugEnabled;
    const previous = liveDiagnosticsState.enabled;
    liveDiagnosticsState.enabled = next;
    if (previous !== next || options.forceRefresh) {
      refreshLiveDiagnosticsUi();
      if (next) {
        renderLiveDiagnosticsEntries({ scroll: options.scroll !== false });
      }
    }
    return next;
  }

  function toggleLiveDiagnostics(options = {}) {
    return setLiveDiagnosticsEnabled(!liveDiagnosticsState.enabled, options);
  }

  function clearLiveDiagnosticsEntries() {
    liveDiagnosticsState.entries.splice(0, liveDiagnosticsState.entries.length);
    renderLiveDiagnosticsEntries({ scroll: false });
  }

  function bindLiveDiagnosticsControls(ui) {
    if (!ui) {
      return;
    }
    const toggle = ui.liveDiagnosticsToggle;
    if (toggle) {
      liveDiagnosticsState.toggleButton = toggle;
      if (!toggle.dataset.liveDiagnosticsBound) {
        toggle.addEventListener('click', (event) => {
          if (event?.preventDefault) {
            event.preventDefault();
          }
          toggleLiveDiagnostics({ source: 'ui' });
        });
        toggle.dataset.liveDiagnosticsBound = 'true';
      }
    }
    if (ui.liveDiagnosticsPanel) {
      liveDiagnosticsState.panel = ui.liveDiagnosticsPanel;
    }
    if (ui.liveDiagnosticsList) {
      liveDiagnosticsState.list = ui.liveDiagnosticsList;
    }
    if (ui.liveDiagnosticsEmpty) {
      liveDiagnosticsState.empty = ui.liveDiagnosticsEmpty;
    }
    if (ui.liveDiagnosticsClear) {
      liveDiagnosticsState.clearButton = ui.liveDiagnosticsClear;
      if (!ui.liveDiagnosticsClear.dataset.liveDiagnosticsBound) {
        ui.liveDiagnosticsClear.addEventListener('click', (event) => {
          if (event?.preventDefault) {
            event.preventDefault();
          }
          clearLiveDiagnosticsEntries();
        });
        ui.liveDiagnosticsClear.dataset.liveDiagnosticsBound = 'true';
      }
    }
    if (!liveDiagnosticsState.debugListenerCleanup && typeof addDebugModeChangeListener === 'function') {
      liveDiagnosticsState.debugListenerCleanup = addDebugModeChangeListener((enabled) => {
        if (!enabled && liveDiagnosticsState.enabled) {
          setLiveDiagnosticsEnabled(false, { forceRefresh: true, scroll: false });
        } else {
          refreshLiveDiagnosticsUi();
        }
      });
    }
    refreshLiveDiagnosticsUi();
  }

  function getLiveDiagnosticsEntriesSnapshot() {
    return liveDiagnosticsState.entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      label: entry.label,
      message: entry.message,
      detail: entry.detail,
      timestamp: entry.timestamp,
      level: entry.level,
    }));
  }

  function recordLiveDiagnostic(type, message, detail = null, options = {}) {
    const diagnosticType = normaliseLiveDiagnosticType(type);
    const descriptor = LIVE_DIAGNOSTIC_CATEGORIES[diagnosticType] || LIVE_DIAGNOSTIC_CATEGORIES.system;
    const timestamp = Number.isFinite(options.timestamp) ? options.timestamp : Date.now();
    const entry = {
      id: `live-diagnostic-${timestamp}-${(liveDiagnosticsState.counter += 1)}`,
      type: diagnosticType,
      label: descriptor.label,
      icon: descriptor.icon,
      message:
        typeof message === 'string' && message.trim().length
          ? message.trim()
          : `${descriptor.label} issue detected`,
      detail: serialiseLiveDiagnosticDetail(detail),
      timestamp,
      level: normaliseLiveDiagnosticLevel(options.level),
    };
    liveDiagnosticsState.entries.push(entry);
    if (liveDiagnosticsState.entries.length > liveDiagnosticsState.limit) {
      liveDiagnosticsState.entries.splice(
        0,
        liveDiagnosticsState.entries.length - liveDiagnosticsState.limit,
      );
    }
    renderLiveDiagnosticsEntries({ scroll: liveDiagnosticsState.enabled });
    return entry;
  }

  const DEFAULT_KEY_BINDINGS = (() => {
    const createFallbackMap = () => {
      const map = {
        moveForward: ['KeyW', 'ArrowUp'],
        moveBackward: ['KeyS', 'ArrowDown'],
        moveLeft: ['KeyA', 'ArrowLeft'],
        moveRight: ['KeyD', 'ArrowRight'],
        jump: ['Space'],
        interact: ['KeyF'],
        buildPortal: ['KeyR'],
        resetPosition: ['KeyT'],
        placeBlock: ['KeyQ'],
        toggleCameraPerspective: ['KeyV'],
        toggleCrafting: ['KeyE'],
        toggleInventory: ['KeyI'],
        openGuide: [],
        toggleTutorial: ['F1', 'Slash'],
        toggleDeveloperOverlay: ['Backquote', 'F8'],
        openSettings: ['F2'],
        openLeaderboard: ['F3'],
        closeMenus: ['Escape'],
      };
      for (let index = 1; index <= HOTBAR_SLOT_COUNT; index += 1) {
        const digit = index % 10;
        map[`hotbar${index}`] = [`Digit${digit}`, `Numpad${digit}`];
      }
      return map;
    };

    const cloneMap = (map) => {
      const clone = {};
      Object.entries(map || {}).forEach(([action, keys]) => {
        if (!Array.isArray(keys)) {
          return;
        }
        clone[action] = [...keys];
      });
      return clone;
    };

    const scope =
      typeof globalScope !== 'undefined' && globalScope
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : typeof globalThis !== 'undefined'
            ? globalThis
            : null;
    const controlApi = scope && scope.InfiniteRailsControls;
    if (controlApi && typeof controlApi.get === 'function') {
      try {
        const resolved = controlApi.get();
        if (resolved) {
          return cloneMap(resolved);
        }
      } catch (error) {
        // fall back when control API retrieval fails
      }
    }

    const ambientResolver =
      typeof readDeclarativeControlMap === 'function' && typeof normaliseKeyBindingMap === 'function'
        ? (target) => readDeclarativeControlMap(target)
        : null;

    let source = null;
    if (ambientResolver && scope) {
      try {
        source = ambientResolver(scope);
      } catch (error) {
        source = null;
      }
    }
    if (!source) {
      source = createFallbackMap();
      if (scope && !controlApi) {
        try {
          scope[CONTROL_MAP_GLOBAL_KEY] = source;
        } catch (error) {
          // ignore assignment failures when scope is sealed
        }
      }
    }
    return cloneMap(source);
  })();

  function normaliseKeyBindingValue(value) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }
    if (Array.isArray(value)) {
      const seen = new Set();
      const result = [];
      value.forEach((entry) => {
        if (typeof entry !== 'string') {
          return;
        }
        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed)) {
          return;
        }
        seen.add(trimmed);
        result.push(trimmed);
      });
      return result;
    }
    return [];
  }

  function normaliseKeyBindingMap(source) {
    if (!source || typeof source !== 'object') {
      return null;
    }
    const result = {};
    Object.entries(source).forEach(([action, value]) => {
      const keys = normaliseKeyBindingValue(value);
      if (keys.length) {
        result[action] = keys;
      }
    });
    return Object.keys(result).length ? result : null;
  }

  function createBuiltinControlMap() {
    const map = {
      moveForward: ['KeyW', 'ArrowUp'],
      moveBackward: ['KeyS', 'ArrowDown'],
      moveLeft: ['KeyA', 'ArrowLeft'],
      moveRight: ['KeyD', 'ArrowRight'],
      jump: ['Space'],
      interact: ['KeyF'],
      buildPortal: ['KeyR'],
      resetPosition: ['KeyT'],
      placeBlock: ['KeyQ'],
      toggleCameraPerspective: ['KeyV'],
      toggleCrafting: ['KeyE'],
      toggleInventory: ['KeyI'],
      openGuide: [],
      toggleTutorial: ['F1', 'Slash'],
      toggleDeveloperOverlay: ['Backquote', 'F8'],
      openSettings: ['F2'],
      openLeaderboard: ['F3'],
      closeMenus: ['Escape'],
    };
    for (let index = 1; index <= HOTBAR_SLOT_COUNT; index += 1) {
      const digit = index % 10;
      map[`hotbar${index}`] = [`Digit${digit}`, `Numpad${digit}`];
    }
    return map;
  }

  function readDeclarativeControlMap(scope) {
    if (!scope) {
      return null;
    }
    const ambient = normaliseKeyBindingMap(scope[CONTROL_MAP_GLOBAL_KEY]);
    if (ambient) {
      return ambient;
    }
    const config = scope.APP_CONFIG && typeof scope.APP_CONFIG === 'object' ? scope.APP_CONFIG : null;
    if (!config) {
      return null;
    }
    const declarative = normaliseKeyBindingMap(config.controlMap);
    if (declarative) {
      return declarative;
    }
    return normaliseKeyBindingMap(config.keyBindings);
  }

  function queueBootstrapFallbackNotice(key, message) {
    if (!globalScope) {
      return;
    }
    const notices = (globalScope.__bootstrapNotices = globalScope.__bootstrapNotices || []);
    notices.push({ key, message });
  }

  function createAssetUrlCandidates(relativePath, options = {}) {
    if (!relativePath || typeof relativePath !== 'string') {
      return [];
    }
    const urls = [];
    const seen = new Set();

    const fallbackNormaliseTag = (value) => {
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : '';
      }
      if (typeof value?.toString === 'function') {
        const stringified = String(value).trim();
        return stringified.length > 0 ? stringified : '';
      }
      return '';
    };

    const fallbackResolveVersionTag = () => {
      const config =
        globalScope?.APP_CONFIG && typeof globalScope.APP_CONFIG === 'object'
          ? globalScope.APP_CONFIG
          : null;
      const configured = fallbackNormaliseTag(config?.assetVersionTag);
      if (configured) {
        if (globalScope) {
          globalScope.INFINITE_RAILS_ASSET_VERSION_TAG = configured;
        }
        return configured;
      }
      const ambient = fallbackNormaliseTag(globalScope?.INFINITE_RAILS_ASSET_VERSION_TAG);
      if (ambient) {
        if (config) {
          config.assetVersionTag = ambient;
        }
        return ambient;
      }
      const defaultTag = typeof DEFAULT_ASSET_VERSION_TAG === 'string' ? DEFAULT_ASSET_VERSION_TAG : '1';
      if (config) {
        config.assetVersionTag = defaultTag;
      }
      if (globalScope) {
        globalScope.INFINITE_RAILS_ASSET_VERSION_TAG = defaultTag;
      }
      return defaultTag;
    };

    const fallbackApplyVersionTag = (value) => {
      if (typeof value !== 'string' || value.length === 0) {
        return value;
      }
      if (/^(?:data|blob):/i.test(value)) {
        return value;
      }
      const versionTag = fallbackResolveVersionTag();
      if (!versionTag) {
        return value;
      }
      const [base, hash = ''] = value.split('#', 2);
      if (/(?:^|[?&])assetVersion=/.test(base)) {
        return value;
      }
      const separator = base.includes('?') ? '&' : '?';
      const tagged = `${base}${separator}assetVersion=${encodeURIComponent(versionTag)}`;
      return hash ? `${tagged}#${hash}` : tagged;
    };

    const applyVersion =
      typeof applyAssetVersionTag === 'function' ? applyAssetVersionTag : fallbackApplyVersionTag;

    const registerCandidate = (value) => {
      if (typeof value !== 'string' || value.length === 0) {
        return;
      }
      const tagged = applyVersion(value);
      if (typeof tagged !== 'string' || tagged.length === 0 || seen.has(tagged)) {
        return;
      }
      seen.add(tagged);
      urls.push(tagged);
    };
    const normalisedPath = relativePath.replace(/^\.\//, '');
    const isHttpUrl = /^https?:/i.test(relativePath);

    if (options?.preloadedSelector && documentRef && typeof documentRef.querySelector === 'function') {
      try {
        const preloaded = documentRef.querySelector(options.preloadedSelector);
        if (preloaded?.src) {
          monitorSignedAssetUrl(preloaded.src, preloaded.src, normalisedPath);
          registerCandidate(preloaded.src);
        }
      } catch (error) {
        if (globalScope.console?.warn) {
          globalScope.console.warn('Failed to resolve preloaded asset URL candidate.', {
            selector: options.preloadedSelector,
            asset: relativePath,
            error,
          });
        }
      }
    }

    if (!urls.length) {
      const assetBase = globalScope.APP_CONFIG?.assetBaseUrl;
      if (assetBase) {
        try {
          const base = assetBase.endsWith('/') ? assetBase : `${assetBase}/`;
          const resolved = new URL(normalisedPath, base).href;
          monitorSignedAssetUrl(assetBase, resolved, normalisedPath);
          registerCandidate(resolved);
        } catch (error) {
          if (globalScope.console?.warn) {
            globalScope.console.warn('Failed to resolve assetBaseUrl candidate.', {
              assetBaseUrl: assetBase,
              asset: relativePath,
              error,
            });
          }
        }
      }
    }

    if (!urls.length && documentRef) {
      const findScriptElement = () => {
        if (documentRef.currentScript) {
          return documentRef.currentScript;
        }
        if (typeof documentRef.getElementsByTagName !== 'function') {
          return null;
        }
        try {
          const scripts = Array.from(documentRef.getElementsByTagName('script'));
          return scripts.find((element) =>
            typeof element?.src === 'string' && /\bscript\.js(?:[?#].*)?$/i.test(element.src || ''),
          );
        } catch (error) {
          logSignedUrlIssue(
            'Unable to enumerate script elements while resolving asset URLs; continuing with other fallbacks.',
            { asset: relativePath, error },
          );
          return null;
        }
      };

      const scriptElement = findScriptElement();
      if (scriptElement?.src) {
        try {
          const scriptUrl = new URL(scriptElement.src, globalScope?.location?.href);
          const scriptDir = scriptUrl.href.replace(/[^/]*$/, '');
          const fromScriptDir = new URL(normalisedPath, scriptDir).href;
          monitorSignedAssetUrl(scriptElement.src, fromScriptDir, normalisedPath);
          registerCandidate(fromScriptDir);
        } catch (error) {
          logSignedUrlIssue(
            'Unable to derive asset URL from current script location; trying alternative fallbacks. Ensure script.js is served from the asset bundle root or configure APP_CONFIG.assetBaseUrl explicitly.',
            { scriptSrc: scriptElement?.src ?? null, asset: relativePath, error },
          );
        }
      }

      if (!urls.length && documentRef.baseURI) {
        try {
          const fromBaseUri = new URL(normalisedPath, documentRef.baseURI).href;
          monitorSignedAssetUrl(documentRef.baseURI, fromBaseUri, normalisedPath);
          registerCandidate(fromBaseUri);
        } catch (error) {
          logSignedUrlIssue(
            'Document base URI produced an invalid asset URL; continuing with other fallbacks. Review the <base href> element so it references the directory that hosts your Infinite Rails assets.',
            { baseURI: documentRef.baseURI, asset: relativePath, error },
          );
        }
      }
    }

    if (!urls.length && globalScope?.location) {
      try {
        const origin = typeof globalScope.location.origin === 'string' ? globalScope.location.origin : null;
        const base = origin ? `${origin}/` : globalScope.location.href;
        const fromWindowOrigin = new URL(normalisedPath, base).href;
        const rawLocationBase =
          typeof globalScope.location.href === 'string'
            ? globalScope.location.href
            : origin
              ? `${origin}/`
              : null;
        monitorSignedAssetUrl(rawLocationBase, fromWindowOrigin, normalisedPath);
        registerCandidate(fromWindowOrigin);
      } catch (error) {
        logSignedUrlIssue(
          'Window origin fallback failed while resolving asset URL; relying on relative paths. Confirm window.location.origin is reachable or configure APP_CONFIG.assetBaseUrl to bypass this fallback.',
          { origin: globalScope?.location?.origin ?? null, asset: relativePath, error },
        );
      }
    }

    if (!urls.length) {
      registerCandidate(isHttpUrl ? relativePath : normalisedPath);
    }

    return urls;
  }

  function loadScript(url, attributes = {}) {
    return new Promise((resolve, reject) => {
      const doc = typeof document !== 'undefined' ? document : documentRef;
      if (!doc || typeof doc.createElement !== 'function') {
        reject(new Error('Document unavailable for script injection.'));
        return;
      }
      const normaliseForComparison = (value) => {
        if (!value) {
          return '';
        }
        try {
          const base =
            doc.baseURI ||
            (typeof globalScope?.location?.href === 'string' ? globalScope.location.href : undefined);
          return new URL(value, base).href;
        } catch (error) {
          return value;
        }
      };

      const getDataAttribute = (element, name) => {
        if (!element) {
          return null;
        }
        if (typeof element.getAttribute === 'function') {
          try {
            return element.getAttribute(name);
          } catch (error) {
            // Ignore attribute access errors and fall back to dataset if available.
          }
        }
        if (element.dataset) {
          const datasetKey = name
            .replace(/^data-/, '')
            .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
          return element.dataset[datasetKey] ?? null;
        }
        return null;
      };

      const markLoaded = (element) => {
        if (!element) {
          return;
        }
        try {
          element.setAttribute('data-load-script-loaded', 'true');
        } catch (error) {
          if (element.dataset) {
            element.dataset.loadScriptLoaded = 'true';
          }
        }
        try {
          element.removeAttribute('data-load-script-error');
        } catch (error) {
          if (element.dataset) {
            delete element.dataset.loadScriptError;
          }
        }
      };

      const markErrored = (element) => {
        if (!element) {
          return;
        }
        try {
          element.setAttribute('data-load-script-error', 'true');
        } catch (error) {
          if (element.dataset) {
            element.dataset.loadScriptError = 'true';
          }
        }
      };

      const removeElement = (element) => {
        if (!element) {
          return;
        }
        if (typeof element.remove === 'function') {
          element.remove();
        } else if (element.parentNode && typeof element.parentNode.removeChild === 'function') {
          element.parentNode.removeChild(element);
        }
      };

      const resolveWithExisting = (element) => {
        markLoaded(element);
        resolve(element);
      };

      const attachExistingListeners = (element) => {
        if (typeof element.addEventListener !== 'function') {
          return false;
        }
        element.addEventListener(
          'load',
          () => {
            resolveWithExisting(element);
          },
          { once: true },
        );
        element.addEventListener(
          'error',
          () => {
            markErrored(element);
            reject(new Error(`Failed to load script: ${url}`));
          },
          { once: true },
        );
        return true;
      };

      let existingScript = null;
      if (typeof doc.querySelectorAll === 'function') {
        try {
          const scripts = doc.querySelectorAll('script[src]');
          for (const candidate of scripts) {
            const src =
              typeof candidate.getAttribute === 'function' ? candidate.getAttribute('src') : candidate.src;
            if (!src) {
              continue;
            }
            if (normaliseForComparison(src) === normaliseForComparison(url)) {
              existingScript = candidate;
              break;
            }
          }
        } catch (error) {
          existingScript = null;
        }
      }

      if (existingScript) {
        const hadPreviousError = Boolean(getDataAttribute(existingScript, 'data-load-script-error'));
        if (hadPreviousError) {
          removeElement(existingScript);
          existingScript = null;
        } else {
          const readyState = existingScript.readyState;
          const alreadyLoaded =
            Boolean(getDataAttribute(existingScript, 'data-load-script-loaded')) ||
            readyState === 'loaded' ||
            readyState === 'complete';
          if (alreadyLoaded) {
            resolveWithExisting(existingScript);
            return;
          }
          if (attachExistingListeners(existingScript)) {
            return;
          }
        }
      }

      const script = doc.createElement('script');
      script.src = url;
      script.async = false;
      Object.entries(attributes).forEach(([key, value]) => {
        try {
          script.setAttribute(key, value);
        } catch (error) {
          // Attribute assignment failure should not block loading.
        }
      });
      if (typeof script.addEventListener === 'function') {
        script.addEventListener(
          'load',
          () => {
            markLoaded(script);
            resolve(script);
          },
          { once: true },
        );
        script.addEventListener(
          'error',
          () => {
            markErrored(script);
            removeElement(script);
            reject(new Error(`Failed to load script: ${url}`));
          },
          { once: true },
        );
      }
      const parent = doc.head || doc.body || doc.documentElement;
      if (parent && typeof parent.appendChild === 'function') {
        parent.appendChild(script);
      } else {
        markErrored(script);
        reject(new Error('Unable to append script element.'));
      }
    });
  }

  const THREE_SCRIPT_URL = (() => {
    const candidates = createAssetUrlCandidates('vendor/three.min.js?v=030c75d4e909', {
      preloadedSelector: 'script[data-preload-three]',
    });
    return candidates.length ? candidates[0] : null;
  })();
  const GLTF_LOADER_URL = (() => {
    const candidates = createAssetUrlCandidates('vendor/GLTFLoader.js?v=0e92b0589a2a');
    return candidates.length ? candidates[0] : null;
  })();

  let hasReportedThreeLoadFailure = false;

  function reportThreeLoadFailure(error, context = {}) {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    if (scope?.console?.error) {
      scope.console.error('Three.js failed to load.', { error, context });
    }
    if (typeof logDiagnosticsEvent === 'function') {
      try {
        logDiagnosticsEvent('startup', 'Three.js failed to load.', {
          level: 'error',
          detail: {
            ...context,
            message: error?.message,
          },
        });
      } catch (logError) {
        if (scope?.console?.warn) {
          scope.console.warn('Failed to log diagnostics event for Three.js failure.', logError);
        }
      }
    }
    if (!hasReportedThreeLoadFailure && typeof bootstrapOverlay !== 'undefined') {
      hasReportedThreeLoadFailure = true;
      try {
        bootstrapOverlay.showError({
          title: 'Renderer unavailable',
          message: 'Unable to load the 3D renderer. Reload the page to try again.',
        });
        bootstrapOverlay.setDiagnostic('renderer', {
          status: 'error',
          message: 'Three.js failed to load. Reload to try again.',
        });
      } catch (overlayError) {
        if (scope?.console?.warn) {
          scope.console.warn('Failed to display overlay message for Three.js failure.', overlayError);
        }
      }
    }
    showHudAlert({
      title: 'Renderer unavailable',
      message: 'Unable to load the 3D renderer. Reload the page to try again.',
      severity: 'error',
    });
  }

  let threeLoaderPromise = null;
  let gltfLoaderPromise = null;

  function ensureThree() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    const applyThreePatches =
      typeof patchThreeInstance === 'function'
        ? (value) => {
            try {
              return patchThreeInstance(value);
            } catch (error) {
              return value;
            }
          }
        : (value) => value;
    function resolveThreeFromScope() {
      const hasThree = scope && typeof scope.THREE === 'object';
      const hasThreeGlobal = scope && typeof scope.THREE_GLOBAL === 'object';
      if (hasThree && !hasThreeGlobal) {
        const legacyError = new Error('Legacy Three.js global detected; refusing unsupported context.');
        legacyError.code = 'legacy-three-global';
        try {
          if (typeof reportThreeLoadFailure === 'function') {
            reportThreeLoadFailure(legacyError, { reason: 'legacy-three-global' });
          }
        } catch (reportError) {
          if (scope?.console?.warn) {
            scope.console.warn('Failed to report legacy Three.js global usage.', reportError);
          }
        }
        throw legacyError;
      }
      if (hasThree && hasThreeGlobal && scope.THREE !== scope.THREE_GLOBAL) {
        const duplicateError = new Error('Multiple Three.js contexts detected; refusing to bootstrap duplicate instance.');
        duplicateError.code = 'duplicate-three-global';
        try {
          if (typeof reportThreeLoadFailure === 'function') {
            reportThreeLoadFailure(duplicateError, { reason: 'duplicate-three-global' });
          }
        } catch (reportError) {
          if (scope?.console?.warn) {
            scope.console.warn('Failed to report duplicate Three.js context.', reportError);
          }
        }
        scope.THREE = scope.THREE_GLOBAL;
        throw duplicateError;
      }
      if (hasThreeGlobal) {
        if (!hasThree || scope.THREE !== scope.THREE_GLOBAL) {
          scope.THREE = scope.THREE_GLOBAL;
        }
        return scope.THREE_GLOBAL;
      }
      return null;
    }

    function reportThreeFailure(error, context = {}) {
      try {
        if (typeof reportThreeLoadFailure === 'function') {
          reportThreeLoadFailure(error, context);
        }
      } catch (reportError) {
        if (scope?.console?.warn) {
          scope.console.warn('Failed to report Three.js load failure.', reportError);
        }
      }
    }

    try {
      const existingThree = resolveThreeFromScope();
      if (existingThree) {
        return Promise.resolve(applyThreePatches(existingThree));
      }
    } catch (error) {
      return Promise.reject(error);
    }
    if (threeLoaderPromise) {
      return threeLoaderPromise;
    }

    function getPreloadedThreeScript() {
      const doc = typeof document !== 'undefined' ? document : scope.document || documentRef;
      if (!doc?.querySelector) {
        return null;
      }
      try {
        return doc.querySelector('script[data-preload-three]');
      } catch (error) {
        return null;
      }
    }

    function loadThreeScript() {
      if (!THREE_SCRIPT_URL) {
        const missingUrlError = new Error('Three.js asset URL is not configured.');
        reportThreeFailure(missingUrlError, { reason: 'missing-url' });
        return Promise.reject(missingUrlError);
      }
      return loadScript(THREE_SCRIPT_URL, {
        'data-three-bootstrap': 'true',
      })
        .then(() => {
          let resolvedThreeAfterLoad = null;
          try {
            resolvedThreeAfterLoad = resolveThreeFromScope();
          } catch (error) {
            throw error;
          }
          if (resolvedThreeAfterLoad) {
            return applyThreePatches(resolvedThreeAfterLoad);
          }
          const exposureError = new Error('Three.js script loaded without exposing THREE.');
          reportThreeFailure(exposureError, { reason: 'no-global', url: THREE_SCRIPT_URL });
          throw exposureError;
        })
        .catch((error) => {
          if (
            error?.code === 'duplicate-three-global' ||
            error?.code === 'legacy-three-global' ||
            error?.message === 'Three.js script loaded without exposing THREE.'
          ) {
            throw error;
          }
          const failureError = new Error(`Unable to load Three.js from ${THREE_SCRIPT_URL}.`);
          if (error && failureError !== error) {
            failureError.cause = error;
          }
          const context = { reason: 'load-failed', url: THREE_SCRIPT_URL };
          if (error?.message && failureError !== error) {
            context.error = error.message;
          }
          reportThreeFailure(failureError, context);
          throw failureError;
        });
    }

    function waitForPreloadedThree() {
      const script = getPreloadedThreeScript();
      if (!script) {
        return null;
      }
      try {
        const existingThree = resolveThreeFromScope();
        if (existingThree) {
          return Promise.resolve(applyThreePatches(existingThree));
        }
      } catch (error) {
        return Promise.reject(error);
      }
      const readyState = script.readyState;
      if (readyState === 'loaded' || readyState === 'complete') {
        try {
          const resolvedThree = resolveThreeFromScope();
          if (resolvedThree) {
            return Promise.resolve(applyThreePatches(resolvedThree));
          }
        } catch (error) {
          return Promise.reject(error);
        }
        return Promise.reject(new Error('Preloaded Three.js script finished without exposing THREE.'));
      }
      return new Promise((resolve, reject) => {
        const handleLoad = () => {
          try {
            const resolvedThree = resolveThreeFromScope();
            if (resolvedThree) {
              resolve(applyThreePatches(resolvedThree));
            } else {
              reject(new Error('Preloaded Three.js script loaded without exposing THREE.'));
            }
          } catch (error) {
            reject(error);
          }
        };
        const handleError = (event) => {
          reject(event instanceof Error ? event : new Error('Preloaded Three.js script failed to load.'));
        };
        script.addEventListener('load', handleLoad, { once: true });
        script.addEventListener('error', handleError, { once: true });
      });
    }

    try {
      const preloadPromise = waitForPreloadedThree();
      if (preloadPromise) {
        threeLoaderPromise = preloadPromise
          .then(applyThreePatches)
          .catch(() => loadThreeScript().then(applyThreePatches));
        return threeLoaderPromise;
      }
    } catch (error) {
      threeLoaderPromise = Promise.reject(error);
      return threeLoaderPromise;
    }

    threeLoaderPromise = loadThreeScript().then(applyThreePatches);
    return threeLoaderPromise;
  }

  function ensureGLTFLoader() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    if (scope.THREE?.GLTFLoader) {
      return Promise.resolve(scope.THREE.GLTFLoader);
    }
    if (gltfLoaderPromise) {
      return gltfLoaderPromise;
    }
    if (!GLTF_LOADER_URL) {
      return Promise.reject(new Error('GLTFLoader asset URL is not configured.'));
    }
    gltfLoaderPromise = loadScript(GLTF_LOADER_URL, {
      'data-gltfloader': 'true',
    })
      .then(() => {
        if (scope.THREE?.GLTFLoader) {
          return scope.THREE.GLTFLoader;
        }
        throw new Error('GLTFLoader script loaded but did not register the loader.');
      })
      .catch((error) => {
        gltfLoaderPromise = null;
        if (error?.message === 'GLTFLoader script loaded but did not register the loader.') {
          throw error;
        }
        const failureError = new Error(`Unable to load GLTFLoader from ${GLTF_LOADER_URL}.`);
        if (error && failureError !== error) {
          failureError.cause = error;
        }
        throw failureError;
      });
    return gltfLoaderPromise;
  }
  const nameDisplayEl = documentRef?.getElementById('userNameDisplay') ?? null;
  const locationDisplayEl = documentRef?.getElementById('userLocationDisplay') ?? null;
  const scoreboardStatusEl = documentRef?.getElementById('scoreboardStatus') ?? null;
  const scoreSyncWarningEl = documentRef?.getElementById('scoreSyncWarning') ?? null;
  const scoreSyncWarningMessageEl = documentRef?.querySelector(
    '#scoreSyncWarning .score-sync-warning__message',
  ) ?? null;
  const googleButtonContainers = documentRef
    ? Array.from(documentRef.querySelectorAll('[data-google-button-container]'))
    : [];
  const fallbackSigninButtons = documentRef
    ? Array.from(documentRef.querySelectorAll('[data-google-fallback-signin]'))
    : [];
  const signOutButtons = documentRef ? Array.from(documentRef.querySelectorAll('[data-google-sign-out]')) : [];

  let googleInitPromise = null;
  let googleIdentityScriptPromise = null;

  function updateScoreboardStatus(message, options = {}) {
    if (typeof options.offline === 'boolean') {
      identityState.scoreboardOffline = options.offline;
      identityState.discoverabilityOffline = options.offline;
    }
    if (typeof message === 'string' && message.trim().length > 0) {
      identityState.scoreboardMessage = message.trim();
    }
    if (scoreboardStatusEl) {
      scoreboardStatusEl.textContent = identityState.scoreboardMessage;
      if (identityState.scoreboardOffline) {
        scoreboardStatusEl.dataset.offline = 'true';
      } else {
        delete scoreboardStatusEl.dataset.offline;
      }
    }
  }

  function deriveOnlineScoreboardMessage() {
    const identity = identityState.identity ?? null;
    if (identity?.googleId && identityState.configuredApiBaseUrl) {
      const name =
        typeof identity.name === 'string' && identity.name.trim().length
          ? identity.name.trim()
          : 'Explorer';
      return `Signed in as ${name}. Leaderboard sync active.`;
    }
    return 'Leaderboard connected — sign in to publish your run.';
  }

  function showGlobalScoreSyncWarning(message) {
    const instance = activeExperienceInstance;
    if (instance && typeof instance.showScoreSyncWarning === 'function') {
      instance.showScoreSyncWarning(message);
      return;
    }
    if (!scoreSyncWarningEl) {
      return;
    }
    const text =
      typeof message === 'string' && message.trim().length
        ? message.trim()
        : 'Leaderboard offline — runs stored locally until connection returns.';
    if (scoreSyncWarningMessageEl) {
      scoreSyncWarningMessageEl.textContent = text;
    } else {
      scoreSyncWarningEl.textContent = text;
    }
    scoreSyncWarningEl.hidden = false;
    scoreSyncWarningEl.setAttribute('data-visible', 'true');
  }

  function hideGlobalScoreSyncWarning(message) {
    const instance = activeExperienceInstance;
    if (instance && typeof instance.hideScoreSyncWarning === 'function') {
      instance.hideScoreSyncWarning(message);
      return;
    }
    if (!scoreSyncWarningEl) {
      return;
    }
    if (typeof message === 'string' && message.trim().length && scoreSyncWarningMessageEl) {
      scoreSyncWarningMessageEl.textContent = message.trim();
    }
    scoreSyncWarningEl.hidden = true;
    scoreSyncWarningEl.removeAttribute('data-visible');
  }

  function formatBackendEndpointSummary(context = {}) {
    if (context && typeof context.summary === 'string' && context.summary.trim().length) {
      return context.summary.trim();
    }
    const endpoint =
      context && typeof context.endpoint === 'string' && context.endpoint.trim().length
        ? context.endpoint.trim()
        : context && typeof context.url === 'string' && context.url.trim().length
          ? context.url.trim()
          : '';
    const method =
      context && typeof context.method === 'string' && context.method.trim().length
        ? context.method.trim().toUpperCase()
        : '';
    const status =
      context && Number.isFinite(context.status)
        ? context.status
        : undefined;
    const location = endpoint ? (method ? `${method} ${endpoint}` : endpoint) : '';
    if (location && status !== undefined) {
      return `${location} → status ${status}`;
    }
    if (location) {
      return location;
    }
    if (status !== undefined) {
      return `status ${status}`;
    }
    return '';
  }

  function deriveBackendMessageFromDetail(detail, fallbackMessage) {
    const fallback = typeof fallbackMessage === 'string' && fallbackMessage.trim().length ? fallbackMessage.trim() : '';
    if (detail && typeof detail.message === 'string' && detail.message.trim().length) {
      return detail.message.trim();
    }
    const summary = formatBackendEndpointSummary({
      summary: detail && typeof detail.summary === 'string' ? detail.summary : undefined,
      method: detail?.method,
      endpoint: detail?.endpoint,
      status: Number.isFinite(detail?.status) ? detail.status : undefined,
    });
    const errorText = detail && typeof detail.error === 'string' && detail.error.trim().length ? detail.error.trim() : '';
    const extras = [];
    if (summary) {
      extras.push(summary);
    }
    if (errorText && (!summary || errorText !== summary)) {
      extras.push(errorText);
    }
    if (!extras.length) {
      return fallback;
    }
    if (!fallback) {
      return extras.join(' — ');
    }
    return `${fallback} (${extras.join(' — ')})`;
  }

  function dispatchScoreSyncEvent(type, detail = {}) {
    if (typeof globalScope.dispatchEvent !== 'function') {
      return;
    }
    const eventName = `infinite-rails:${type}`;
    if (typeof globalScope.CustomEvent === 'function') {
      globalScope.dispatchEvent(new globalScope.CustomEvent(eventName, { detail }));
      return;
    }
    if (typeof globalScope.Event === 'function') {
      const event = new globalScope.Event(eventName);
      try {
        Object.defineProperty(event, 'detail', { value: detail, enumerable: true });
      } catch (error) {
        event.detail = detail; // eslint-disable-line no-param-reassign
      }
      globalScope.dispatchEvent(event);
    }
  }

  function buildIdentityPayload(identity) {
    const payload = {
      googleId: identity.googleId,
      name: identity.name,
    };
    if (identity.email) {
      payload.email = identity.email;
    }
    if (identity.avatar) {
      payload.avatar = identity.avatar;
    }
    if (identity.location && typeof identity.location === 'object') {
      payload.location = { ...identity.location };
    }
    if (identity.locationLabel) {
      payload.locationLabel = identity.locationLabel;
    }
    return payload;
  }

  async function syncIdentityToApi(identity) {
    if (!identity || typeof identity !== 'object') {
      return;
    }
    if (!identity.googleId || !identityState.apiBaseUrl || !identityState.endpoints.users) {
      return;
    }
    if (typeof globalScope.fetch !== 'function') {
      return;
    }
    const url = identityState.endpoints.users;
    const payload = buildIdentityPayload(identity);
    try {
      const response = await globalScope.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const failure = new Error(`Request failed with status ${response.status}`);
        failure.status = response.status;
        failure.endpoint = url;
        failure.method = 'POST';
        throw failure;
      }
      const successMessage = `Signed in as ${identity.name}. Leaderboard sync active.`;
      updateScoreboardStatus(successMessage, { offline: false });
      dispatchScoreSyncEvent('score-sync-restored', {
        source: 'identity',
        message: successMessage,
      });
    } catch (error) {
      console.warn('Failed to sync identity with leaderboard', error);
      const statusCode = Number.isFinite(error?.status) ? error.status : undefined;
      const endpoint = typeof error?.endpoint === 'string' && error.endpoint.trim().length ? error.endpoint.trim() : url;
      const method = typeof error?.method === 'string' && error.method.trim().length ? error.method.trim() : 'POST';
      const summary = formatBackendEndpointSummary({ method, endpoint, status: statusCode });
      const failureMessageBase = `Signed in as ${identity.name}. Leaderboard user sync failed`;
      const failureMessage = summary
        ? `${failureMessageBase} — ${summary}. Storing locally.`
        : `${failureMessageBase}. Storing locally.`;
      updateScoreboardStatus(failureMessage, { offline: true });
      dispatchScoreSyncEvent('score-sync-offline', {
        source: 'identity',
        reason: 'user-sync',
        message: failureMessage,
        method: method.toUpperCase(),
        endpoint,
        status: statusCode,
        error: typeof error?.message === 'string' ? error.message : undefined,
      });
    }
  }

  function showGoogleSigninUi() {
    identityState.googleReady = true;
    googleButtonContainers.forEach((container) => {
      container.hidden = false;
    });
    fallbackSigninButtons.forEach((btn) => {
      btn.hidden = true;
    });
    const signedIn = Boolean(identityState.identity?.googleId);
    signOutButtons.forEach((btn) => {
      btn.hidden = !signedIn;
    });
  }

  function showFallbackSignin(options = {}) {
    if (!options.keepGoogleVisible) {
      identityState.googleReady = false;
      googleButtonContainers.forEach((container) => {
        container.hidden = true;
      });
      identityState.googleButtonsRendered = false;
    }
    fallbackSigninButtons.forEach((btn) => {
      btn.hidden = false;
    });
  }

  if (typeof globalScope.addEventListener === 'function') {
    globalScope.addEventListener('infinite-rails:score-sync-offline', (event) => {
      const detail = event?.detail ?? {};
      const fallback = 'Leaderboard offline — runs stored locally until connection returns.';
      const message = deriveBackendMessageFromDetail(detail, fallback);
      updateScoreboardStatus(message, { offline: true });
      showGlobalScoreSyncWarning(message);
      bootstrapOverlay.setDiagnostic('backend', {
        status: 'error',
        message,
      });
    });

    globalScope.addEventListener('infinite-rails:score-sync-restored', (event) => {
      const detail = event?.detail ?? {};
      const fallback = identityState.apiBaseUrl
        ? deriveOnlineScoreboardMessage()
        : 'Leaderboard connection restored.';
      const message = deriveBackendMessageFromDetail(detail, fallback);
      updateScoreboardStatus(message, { offline: false });
      hideGlobalScoreSyncWarning(message);
      bootstrapOverlay.setDiagnostic('backend', {
        status: 'ok',
        message,
      });
    });
  }

  function createAnonymousIdentity(base) {
    const location = base?.location && typeof base.location === 'object' ? { ...base.location } : null;
    const locationLabel =
      typeof base?.locationLabel === 'string' && base.locationLabel.trim().length
        ? base.locationLabel.trim()
        : inferLocationLabel(location);
    return {
      name: 'Guest Explorer',
      googleId: null,
      email: null,
      avatar: null,
      location,
      locationLabel,
    };
  }

  function mapSnapshotToIdentity(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    const fallback = createAnonymousIdentity(null);
    const location = snapshot.location && typeof snapshot.location === 'object' ? { ...snapshot.location } : null;
    const locationLabel =
      typeof snapshot.locationLabel === 'string' && snapshot.locationLabel.trim().length
        ? snapshot.locationLabel.trim()
        : inferLocationLabel(location);
    return {
      name:
        typeof snapshot.displayName === 'string' && snapshot.displayName.trim().length
          ? snapshot.displayName.trim()
          : fallback.name,
      googleId:
        typeof snapshot.googleId === 'string' && snapshot.googleId.trim().length ? snapshot.googleId.trim() : null,
      email: typeof snapshot.email === 'string' && snapshot.email.trim().length ? snapshot.email.trim() : null,
      avatar: typeof snapshot.avatar === 'string' && snapshot.avatar.trim().length ? snapshot.avatar.trim() : null,
      location,
      locationLabel,
    };
  }

  function loadStoredIdentitySnapshot() {
    if (!globalScope.localStorage) {
      return null;
    }
    try {
      const raw = globalScope.localStorage.getItem(identityStorageKey);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw);
      return payload && typeof payload === 'object' ? payload : null;
    } catch (error) {
      console.warn('Failed to restore identity snapshot from localStorage', error);
      return null;
    }
  }

  function persistIdentitySnapshot(identity) {
    if (!identity || typeof identity !== 'object') {
      return;
    }
    if (!globalScope.localStorage) {
      return;
    }
    try {
      const snapshot = {
        displayName: identity.name ?? 'Guest Explorer',
        googleId: identity.googleId ?? null,
        location: identity.location ?? null,
        locationLabel: identity.locationLabel ?? null,
      };
      globalScope.localStorage.setItem(identityStorageKey, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('Failed to persist identity snapshot', error);
    }
  }

  function notifyIdentityConsumers(identity) {
    const payload = {
      name: identity.name,
      googleId: identity.googleId,
      email: identity.email ?? null,
      avatar: identity.avatar ?? null,
      location: identity.location ?? null,
      locationLabel: identity.locationLabel ?? null,
    };
    try {
      const activeExperience = globalScope.__INFINITE_RAILS_ACTIVE_EXPERIENCE__;
      if (activeExperience && typeof activeExperience.setIdentity === 'function') {
        activeExperience.setIdentity(payload);
      }
    } catch (error) {
      console.warn('Failed to apply identity to active experience', error);
    }
    try {
      if (globalScope.InfiniteRails && typeof globalScope.InfiniteRails.setIdentity === 'function') {
        globalScope.InfiniteRails.setIdentity(payload);
      }
    } catch (error) {
      console.warn('Failed to update InfiniteRails identity', error);
    }
    if (documentRef) {
      try {
        documentRef.dispatchEvent(
          new CustomEvent('infinite-rails:identity-change', {
            detail: payload,
          }),
        );
      } catch (error) {
        console.debug('Identity change event dispatch failed', error);
      }
    }
  }

  function applyIdentity(identity, options = {}) {
    const base = identityState.identity || null;
    const fallback = createAnonymousIdentity(base);
    const source = identity && typeof identity === 'object' ? identity : {};
    const merged = { ...fallback, ...source };

    merged.name =
      typeof merged.name === 'string' && merged.name.trim().length ? merged.name.trim() : fallback.name;
    merged.googleId =
      typeof merged.googleId === 'string' && merged.googleId.trim().length ? merged.googleId.trim() : null;
    merged.email =
      typeof merged.email === 'string' && merged.email.trim().length ? merged.email.trim() : null;
    merged.avatar =
      typeof merged.avatar === 'string' && merged.avatar.trim().length ? merged.avatar.trim() : null;
    const location = merged.location && typeof merged.location === 'object' ? { ...merged.location } : fallback.location;
    let locationLabel =
      typeof merged.locationLabel === 'string' && merged.locationLabel.trim().length
        ? merged.locationLabel.trim()
        : null;
    if (!locationLabel) {
      locationLabel = inferLocationLabel(location);
    }
    merged.location = location;
    merged.locationLabel = locationLabel;

    identityState.identity = merged;

    if (nameDisplayEl) {
      nameDisplayEl.textContent = merged.name;
    }
    if (locationDisplayEl) {
      locationDisplayEl.textContent = merged.locationLabel || 'Location hidden';
    }

    const signedIn = Boolean(merged.googleId);
    signOutButtons.forEach((btn) => {
      btn.hidden = !signedIn;
    });

    const fallbackShouldHide = identityState.googleReady && !identityState.googleError;
    fallbackSigninButtons.forEach((btn) => {
      btn.hidden = fallbackShouldHide ? true : false;
    });

    if (options.persist !== false) {
      persistIdentitySnapshot(merged);
    }

    notifyIdentityConsumers(merged);

    const reason = options.reason ?? null;
    let message = null;
    if (reason === 'google-sign-in') {
      if (identityState.apiBaseUrl && identityState.endpoints.users) {
        message = `Signing in as ${merged.name}\u2026`;
      } else if (identityState.configuredApiBaseUrl) {
        message = `Signed in as ${merged.name}. Validating leaderboard service…`;
      } else {
        message = `Signed in as ${merged.name}. Offline mode — configure APP_CONFIG.apiBaseUrl to sync.`;
      }
    } else if (reason === 'sign-out') {
      message = `Signed out — continuing as ${merged.name}.`;
    } else if (reason === 'fallback-signin') {
      message = `Playing as ${merged.name}. Google Sign-In unavailable; storing locally.`;
    } else if (reason === 'google-sign-in-failed') {
      if (typeof options.message === 'string' && options.message.trim().length) {
        message = options.message.trim();
      } else {
        message = `Google Sign-In failed — continuing as ${merged.name}. Scores stay on this device.`;
      }
    } else if (reason === 'external-set') {
      if (typeof options.message === 'string' && options.message.trim().length) {
        message = options.message.trim();
      }
    }

    const hasOfflineOption = Object.prototype.hasOwnProperty.call(options, 'offline');
    if (message) {
      if (hasOfflineOption) {
        updateScoreboardStatus(message, { offline: options.offline });
      } else {
        updateScoreboardStatus(message);
      }
    } else if (!options.silent) {
      if (hasOfflineOption) {
        updateScoreboardStatus(identityState.scoreboardMessage, { offline: options.offline });
      } else {
        updateScoreboardStatus(identityState.scoreboardMessage);
      }
    }

    if (reason === 'google-sign-in' && identityState.apiBaseUrl && identityState.endpoints.users) {
      syncIdentityToApi(merged);
    }

    return merged;
  }

  function handleFallbackSignin() {
    const promptFn = typeof globalScope.prompt === 'function' ? globalScope.prompt : null;
    if (!promptFn) {
      updateScoreboardStatus('Google Sign-In unavailable; continuing with current local profile.');
      return;
    }
    const currentName = identityState.identity?.name ?? 'Guest Explorer';
    const response = promptFn('Enter a display name for this device:', currentName);
    if (typeof response !== 'string') {
      return;
    }
    const trimmed = response.trim();
    if (!trimmed) {
      updateScoreboardStatus('Keeping previous local profile.');
      return;
    }
    const next = {
      name: trimmed,
      googleId: null,
      email: null,
      avatar: null,
      location: identityState.identity?.location ?? null,
      locationLabel: identityState.identity?.locationLabel ?? null,
    };
    applyIdentity(next, { reason: 'fallback-signin', offline: true });
  }

  function handleSignOut() {
    const googleAccounts = globalScope.google?.accounts?.id;
    if (googleAccounts && typeof googleAccounts.disableAutoSelect === 'function') {
      try {
        googleAccounts.disableAutoSelect();
      } catch (error) {
        console.debug('Failed to disable Google auto select', error);
      }
    }
    if (googleAccounts && typeof googleAccounts.cancel === 'function') {
      try {
        googleAccounts.cancel();
      } catch (error) {
        console.debug('Failed to cancel Google prompt', error);
      }
    }
    applyIdentity(createAnonymousIdentity(identityState.identity), { reason: 'sign-out', offline: true });
    if (identityState.googleReady && !identityState.googleError) {
      showGoogleSigninUi();
    } else {
      showFallbackSignin({ keepGoogleVisible: false });
    }
  }

  function decodeJwtPayload(token) {
    if (typeof token !== 'string') {
      return null;
    }
    const segments = token.split('.');
    if (segments.length < 2) {
      return null;
    }
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    let json = '';
    try {
      if (typeof globalScope.atob === 'function') {
        json = globalScope.atob(padded);
      } else if (typeof Buffer !== 'undefined') {
        json = Buffer.from(padded, 'base64').toString('utf8');
      } else {
        return null;
      }
    } catch (error) {
      console.debug('Failed to decode Google credential payload', error);
      return null;
    }
    try {
      return JSON.parse(json);
    } catch (error) {
      console.debug('Failed to parse Google credential payload', error);
      return null;
    }
  }

  function handleGoogleSignInFailure(message) {
    const fallback = createAnonymousIdentity(identityState.identity);
    const offlineNotice = 'Leaderboards offline; discoverability disabled.';
    const trimmedMessage = typeof message === 'string' && message.trim().length ? message.trim() : '';
    const messageHasNotice = trimmedMessage
      ? trimmedMessage.toLowerCase().includes(offlineNotice.toLowerCase())
      : false;
    const finalMessage = trimmedMessage
      ? messageHasNotice
        ? trimmedMessage
        : `${trimmedMessage} ${offlineNotice}`
      : `Google Sign-In failed — continuing as Guest Explorer. ${offlineNotice}`;
    applyIdentity(fallback, {
      reason: 'google-sign-in-failed',
      message: finalMessage,
      offline: true,
    });
    showFallbackSignin({ keepGoogleVisible: false });
  }

  function handleGoogleCredential(response) {
    try {
      const credential = response?.credential;
      if (!credential) {
        handleGoogleSignInFailure('Google Sign-In failed — missing credential response. Scores stay on this device.');
        return;
      }
      const payload = decodeJwtPayload(credential);
      if (!payload) {
        handleGoogleSignInFailure('Google Sign-In failed — unable to parse credential. Scores stay on this device.');
        return;
      }
      const fullName =
        typeof payload.name === 'string' && payload.name.trim().length
          ? payload.name.trim()
          : `${payload.given_name ?? ''} ${payload.family_name ?? ''}`.trim();
      const identity = {
        name: fullName || 'Explorer',
        googleId: payload.sub ?? null,
        email: payload.email ?? null,
        avatar: payload.picture ?? null,
        location: identityState.identity?.location ?? null,
        locationLabel: identityState.identity?.locationLabel ?? null,
      };
      if (!identity.googleId) {
        handleGoogleSignInFailure('Google Sign-In returned without an ID; continuing as Guest. Scores stay on this device.');
        return;
      }
      const canSyncIdentity = Boolean(identityState.apiBaseUrl && identityState.endpoints.users);
      applyIdentity(identity, { reason: 'google-sign-in', offline: !canSyncIdentity });
    } catch (error) {
      console.warn('Google Sign-In credential handling failed', error);
      handleGoogleSignInFailure('Google Sign-In failed — see console for details. Scores stay on this device.');
    }
  }

  function ensureGoogleIdentityScript() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    if (scope.google?.accounts?.id) {
      return Promise.resolve(scope.google.accounts.id);
    }
    if (googleIdentityScriptPromise) {
      return googleIdentityScriptPromise;
    }
    const doc = typeof document !== 'undefined' ? document : documentRef;
    if (!doc) {
      return Promise.reject(new Error('Document unavailable for Google Identity script.'));
    }
    if (scope.location?.protocol === 'file:') {
      return Promise.reject(new Error('Google Identity script disabled on file:// protocol.'));
    }
    googleIdentityScriptPromise = new Promise((resolve, reject) => {
      const attempt = (index) => {
        if (scope.google?.accounts?.id) {
          resolve(scope.google.accounts.id);
          return;
        }
        if (index >= GOOGLE_IDENTITY_SCRIPT_URLS.length) {
          reject(new Error('Unable to load Google Identity Services script.'));
          return;
        }
        const url = GOOGLE_IDENTITY_SCRIPT_URLS[index];
        loadScript(url, {
          'data-google-identity-script': 'true',
          'data-google-identity-index': String(index),
        })
          .then(() => {
            if (scope.google?.accounts?.id) {
              resolve(scope.google.accounts.id);
            } else {
              attempt(index + 1);
            }
          })
          .catch((error) => {
            if (scope.console?.warn) {
              scope.console.warn('Failed to load Google Identity script', { url, error });
            }
            attempt(index + 1);
          });
      };
      attempt(0);
    }).catch((error) => {
      googleIdentityScriptPromise = null;
      throw error;
    });
    return googleIdentityScriptPromise;
  }

  function waitForGoogleIdentityServices(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      function poll() {
        const googleAccounts = globalScope.google?.accounts?.id;
        if (
          googleAccounts &&
          typeof googleAccounts.initialize === 'function' &&
          typeof googleAccounts.renderButton === 'function'
        ) {
          resolve(googleAccounts);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`${GOOGLE_ACCOUNTS_ID_NAMESPACE} failed to load.`));
          return;
        }
        globalScope.setTimeout(poll, 50);
      }
      poll();
    });
  }

  function renderGoogleButtons(gis) {
    if (!documentRef) {
      return;
    }
    googleButtonContainers.forEach((container) => {
      if (!container) {
        return;
      }
      container.hidden = false;
      container.innerHTML = '';
      try {
        gis.renderButton(container, {
          type: 'standard',
          theme: 'filled_blue',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          logo_alignment: 'left',
          width: container.dataset.width ? Number(container.dataset.width) || 0 : 280,
        });
      } catch (error) {
        console.warn('Failed to render Google Sign-In button', error);
      }
    });
    identityState.googleButtonsRendered = googleButtonContainers.length > 0;
    showGoogleSigninUi();
  }

  function initialiseGoogleSignIn() {
    if (!documentRef) {
      return null;
    }
    if (identityState.googleInitialized || identityState.googleError) {
      return googleInitPromise;
    }
    if (!identityState.googleClientId) {
      updateScoreboardStatus('Google Sign-In unavailable — configure APP_CONFIG.googleClientId to enable SSO.');
      showFallbackSignin({ keepGoogleVisible: false });
      return null;
    }
    if (googleInitPromise) {
      return googleInitPromise;
    }
    googleInitPromise = ensureGoogleIdentityScript()
      .then(() => waitForGoogleIdentityServices(8000))
      .then((googleAccounts) => {
        identityState.googleInitialized = true;
        try {
          googleAccounts.initialize({
            client_id: identityState.googleClientId,
            callback: handleGoogleCredential,
            auto_select: false,
            cancel_on_tap_outside: true,
          });
        } catch (error) {
          throw error;
        }
        renderGoogleButtons(googleAccounts);
        if (!identityState.identity?.googleId) {
          if (identityState.apiBaseUrl && !apiBaseInvalid) {
            updateScoreboardStatus('Google Sign-In ready — authenticate to sync your run.');
          } else if (identityState.configuredApiBaseUrl && !apiBaseInvalid) {
            updateScoreboardStatus('Google Sign-In ready — validating leaderboard service…');
          } else {
            updateScoreboardStatus('Google Sign-In ready — runs stay local until an API endpoint is configured.');
          }
        }
        try {
          googleAccounts.prompt();
        } catch (error) {
          console.debug('Google Sign-In prompt failed', error);
        }
        return googleAccounts;
      })
      .catch((error) => {
        identityState.googleError = error;
        identityState.googleReady = false;
        googleInitPromise = null;
        googleIdentityScriptPromise = null;
        console.warn('Google Sign-In initialisation failed', error);
        updateScoreboardStatus('Google Sign-In unavailable — continuing with local profile.');
        showFallbackSignin({ keepGoogleVisible: false });
        throw error;
      });
    return googleInitPromise;
  }

  function hasCoarsePointer(scope) {
    if (typeof scope?.matchMedia === 'function') {
      const queries = ['(pointer: coarse)', '(any-pointer: coarse)'];
      for (let index = 0; index < queries.length; index += 1) {
        const query = queries[index];
        try {
          const result = scope.matchMedia(query);
          if (result && typeof result.matches === 'boolean' && result.matches) {
            return true;
          }
        } catch (error) {
          if (globalScope.console?.debug) {
            globalScope.console.debug('Failed to evaluate coarse pointer media query.', { query, error });
          }
        }
      }
    }
    const navigatorRef = scope?.navigator || globalScope?.navigator || null;
    if (navigatorRef && typeof navigatorRef.maxTouchPoints === 'number') {
      return navigatorRef.maxTouchPoints > 1;
    }
    return false;
  }

  function detectMobileEnvironment(scope) {
    const navigatorRef = scope?.navigator || globalScope?.navigator || null;
    const userAgent = typeof navigatorRef?.userAgent === 'string' ? navigatorRef.userAgent : '';
    const maxTouchPoints = typeof navigatorRef?.maxTouchPoints === 'number' ? navigatorRef.maxTouchPoints : 0;
    const coarsePointer = hasCoarsePointer(scope);
    const touchCapable = maxTouchPoints > 1;
    const userAgentDataMobile =
      typeof navigatorRef?.userAgentData?.mobile === 'boolean' ? navigatorRef.userAgentData.mobile : null;
    let hoverNone = false;
    let anyHoverNone = false;
    if (typeof scope?.matchMedia === 'function') {
      try {
        const result = scope.matchMedia('(hover: none)');
        if (result && typeof result.matches === 'boolean') {
          hoverNone = result.matches;
        }
      } catch (error) {
        if (globalScope.console?.debug) {
          globalScope.console.debug('Failed to evaluate hover media query.', error);
        }
      }
      try {
        const result = scope.matchMedia('(any-hover: none)');
        if (result && typeof result.matches === 'boolean') {
          anyHoverNone = result.matches;
        }
      } catch (error) {
        if (globalScope.console?.debug) {
          globalScope.console.debug('Failed to evaluate any-hover media query.', error);
        }
      }
    }
    const mobileRegex = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i;
    const userAgentMobile = mobileRegex.test(userAgent);
    const lacksHover = hoverNone || anyHoverNone;
    return {
      coarsePointer,
      touchCapable,
      userAgentMobile,
      userAgentDataMobile,
      hoverNone: lacksHover,
      isMobile: Boolean(coarsePointer || touchCapable || userAgentMobile || userAgentDataMobile || lacksHover),
    };
  }

  let webglSupportOverlayPresented = false;

  function renderStandaloneWebglFallbackOverlay({
    title,
    intro,
    troubleshootingSteps,
    detail = null,
    supportHint = 'Need more help? Visit chrome://gpu to verify WebGL availability.',
  }) {
    const doc = typeof document !== 'undefined' ? document : documentRef;
    if (!doc || typeof doc.createElement !== 'function') {
      return null;
    }
    const body =
      doc.body ||
      (typeof doc.getElementsByTagName === 'function'
        ? doc.getElementsByTagName('body')[0] || null
        : null);
    if (!body || typeof body.appendChild !== 'function') {
      return null;
    }
    let existingOverlay = null;
    if (typeof doc.getElementById === 'function') {
      try {
        existingOverlay = doc.getElementById('webglBlockedOverlay');
      } catch (error) {
        existingOverlay = null;
      }
    }
    if (existingOverlay) {
      if (typeof existingOverlay.remove === 'function') {
        existingOverlay.remove();
      } else if (
        existingOverlay.parentNode &&
        typeof existingOverlay.parentNode.removeChild === 'function'
      ) {
        existingOverlay.parentNode.removeChild(existingOverlay);
      }
    }

    const overlay = doc.createElement('div');
    overlay.id = 'webglBlockedOverlay';
    overlay.className = 'webgl-fallback-overlay';
    if (typeof overlay.setAttribute === 'function') {
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-live', 'assertive');
      overlay.setAttribute('aria-modal', 'true');
    }
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(10, 14, 23, 0.92)';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.padding = '24px';
    overlay.style.zIndex = '2147483647';
    overlay.style.color = '#f8fafc';

    const panel = doc.createElement('div');
    panel.className = 'webgl-fallback-overlay__panel';
    panel.style.background = '#0f172a';
    panel.style.borderRadius = '16px';
    panel.style.boxShadow = '0 20px 60px rgba(15, 23, 42, 0.45)';
    panel.style.maxWidth = '520px';
    panel.style.width = '100%';
    panel.style.padding = '32px';
    panel.style.fontFamily =
      "'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif";

    const heading = doc.createElement('h2');
    heading.textContent = title;
    heading.style.margin = '0 0 16px';
    heading.style.fontSize = '1.5rem';
    heading.style.lineHeight = '1.2';
    panel.appendChild(heading);

    const introParagraph = doc.createElement('p');
    introParagraph.textContent = intro;
    introParagraph.style.margin = '0 0 16px';
    introParagraph.style.fontSize = '1rem';
    introParagraph.style.lineHeight = '1.5';
    panel.appendChild(introParagraph);

    if (Array.isArray(troubleshootingSteps) && troubleshootingSteps.length > 0) {
      const stepsIntro = doc.createElement('p');
      stepsIntro.textContent = 'To restore the full 3D experience, try:';
      stepsIntro.style.margin = '0 0 8px';
      stepsIntro.style.fontSize = '1rem';
      stepsIntro.style.lineHeight = '1.5';
      panel.appendChild(stepsIntro);

      const list = doc.createElement('ul');
      list.style.margin = '0 0 20px 0';
      list.style.padding = '0 0 0 1.25rem';
      list.style.listStyle = 'disc';
      troubleshootingSteps.forEach((step) => {
        if (typeof step !== 'string' || !step) {
          return;
        }
        const item = doc.createElement('li');
        item.textContent = step;
        item.style.margin = '0 0 6px 0';
        item.style.fontSize = '0.95rem';
        item.style.lineHeight = '1.5';
        list.appendChild(item);
      });
      panel.appendChild(list);
    }

    const fallbackNote = doc.createElement('p');
    fallbackNote.textContent =
      'The simplified mission briefing has been launched automatically so you can keep playing.';
    fallbackNote.style.margin = '0 0 24px';
    fallbackNote.style.fontSize = '0.95rem';
    fallbackNote.style.lineHeight = '1.5';
    panel.appendChild(fallbackNote);

    const actionRow = doc.createElement('div');
    actionRow.style.display = 'flex';
    actionRow.style.flexWrap = 'wrap';
    actionRow.style.gap = '12px';
    actionRow.style.alignItems = 'center';
    panel.appendChild(actionRow);

    const retryButton = doc.createElement('button');
    retryButton.type = 'button';
    retryButton.textContent = 'Retry WebGL Renderer';
    retryButton.className = 'webgl-fallback-overlay__retry';
    retryButton.style.background = '#38bdf8';
    retryButton.style.color = '#0f172a';
    retryButton.style.border = '0';
    retryButton.style.borderRadius = '999px';
    retryButton.style.padding = '12px 20px';
    retryButton.style.fontWeight = '600';
    retryButton.style.cursor = 'pointer';
    retryButton.style.boxShadow = '0 8px 20px rgba(56, 189, 248, 0.35)';
    retryButton.setAttribute?.('data-action', 'retry-webgl');

    const handleRetry = () => {
      if (typeof logDiagnosticsEvent === 'function') {
        try {
          logDiagnosticsEvent('renderer', 'Player requested WebGL retry from standalone overlay.', {
            level: 'warning',
            detail: { source: 'standalone-overlay', reason: 'webgl-retry' },
          });
        } catch (error) {
          globalScope?.console?.debug?.('Failed to log WebGL retry request.', error);
        }
      }
      const locationRef = globalScope?.location ?? null;
      if (locationRef && typeof locationRef.reload === 'function') {
        try {
          locationRef.reload();
        } catch (reloadError) {
          globalScope?.console?.error?.('Failed to reload the page when retrying WebGL.', reloadError);
        }
      }
    };

    if (typeof retryButton.addEventListener === 'function') {
      retryButton.addEventListener('click', handleRetry);
    } else {
      retryButton.onclick = handleRetry;
    }

    actionRow.appendChild(retryButton);

    const supportHintEl = doc.createElement('span');
    const supportHintMessage =
      typeof supportHint === 'string' && supportHint
        ? supportHint
        : 'Need more help? Visit chrome://gpu to verify WebGL availability.';
    supportHintEl.textContent = supportHintMessage;
    supportHintEl.style.fontSize = '0.85rem';
    supportHintEl.style.lineHeight = '1.4';
    supportHintEl.style.color = '#cbd5f5';
    actionRow.appendChild(supportHintEl);

    overlay.appendChild(panel);
    body.appendChild(overlay);

    if (typeof body.setAttribute === 'function') {
      body.setAttribute('data-webgl-fallback-mode', 'simple');
    }

    overlay.__webglFallback = {
      troubleshootingSteps: Array.isArray(troubleshootingSteps)
        ? troubleshootingSteps.filter((step) => typeof step === 'string' && step)
        : [],
      detail: detail || null,
    };

    if (typeof focusElementSilently === 'function') {
      focusElementSilently(retryButton);
    } else if (typeof retryButton.focus === 'function') {
      retryButton.focus();
    }

    return overlay;
  }

  function presentWebglBlockedOverlay({ detail = null } = {}) {
    if (webglSupportOverlayPresented) {
      return;
    }
    webglSupportOverlayPresented = true;
    const overlayController =
      typeof bootstrapOverlay !== 'undefined'
        ? bootstrapOverlay
        : globalScope && typeof globalScope.bootstrapOverlay === 'object'
          ? globalScope.bootstrapOverlay
          : null;
    const troubleshootingSteps = [
      "Open your browser settings (for example, chrome://settings/system) and enable 'Use hardware acceleration when available.' If the toggle stays disabled, follow the browser help steps at https://support.google.com/chrome/answer/95759.",
      'Disable extensions that block WebGL or force software rendering.',
      'Update your graphics drivers, then restart your browser.',
    ];
    const messages = resolveWebglFallbackMessages(detail);
    const overlayIntro = messages.overlayIntro;
    const overlayMessage = [
      overlayIntro,
      'To restore the full 3D experience, try:',
      ...troubleshootingSteps.map((step) => `• ${step}`),
    ].join('\n');
    let overlayRendered = false;
    if (overlayController && typeof overlayController.showError === 'function') {
      try {
        overlayController.showError({
          title: messages.title,
          message: overlayMessage,
        });
        overlayRendered = true;
      } catch (overlayError) {
        globalScope?.console?.debug?.('Unable to display WebGL blocked overlay.', overlayError);
      }
    }
    if (overlayController && typeof overlayController.setDiagnostic === 'function') {
      overlayController.setDiagnostic('renderer', {
        status: 'warning',
        message: messages.diagnosticMessage,
      });
    }
    if (overlayController && typeof overlayController.setRecoveryAction === 'function') {
      overlayController.setRecoveryAction({
        label: 'Retry WebGL Renderer',
        description: 'Reloads the page and attempts to start the advanced renderer again.',
        action: 'retry-webgl',
        onSelect: () => {
          if (typeof logDiagnosticsEvent === 'function') {
            logDiagnosticsEvent('renderer', 'Player requested WebGL retry from diagnostics overlay.', {
              level: 'warning',
              detail: { source: 'global-overlay', reason: 'webgl-retry' },
            });
          }
          const locationRef = globalScope?.location ?? null;
          if (locationRef && typeof locationRef.reload === 'function') {
            try {
              locationRef.reload();
            } catch (reloadError) {
              globalScope?.console?.error?.('Failed to reload the page when retrying WebGL.', reloadError);
            }
          }
        },
      });
    }
    const diagnosticDetail = { reason: messages.stateReason, fallbackMode: 'simple' };
    if (detail && typeof detail === 'object') {
      Object.keys(detail).forEach((key) => {
        const value = detail[key];
        if (typeof value === 'undefined') {
          return;
        }
        diagnosticDetail[key] = value;
      });
    }
    if (!overlayRendered) {
      renderStandaloneWebglFallbackOverlay({
        title: messages.title,
        intro: overlayIntro,
        troubleshootingSteps,
        detail: diagnosticDetail,
        supportHint: messages.supportHint,
      });
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('renderer', messages.logMessage, {
        level: 'error',
        detail: diagnosticDetail,
      });
    } else if (globalScope?.console?.warn) {
      globalScope.console.warn(messages.logMessage, diagnosticDetail);
    }
  }

  function normaliseWebglFallbackDetail(error) {
    if (!error || typeof error !== 'object') {
      return null;
    }
    const detail = {};
    const name = typeof error.name === 'string' ? error.name.trim() : '';
    if (name) {
      detail.errorName = name;
    }
    const message = typeof error.message === 'string' ? error.message.trim() : '';
    if (message) {
      detail.errorMessage = message;
    }
    const reason = typeof error.reason === 'string' ? error.reason.trim() : '';
    if (reason) {
      detail.reason = reason;
    }
    const supportSummary =
      typeof error.supportSummary === 'string' ? error.supportSummary.trim() : '';
    if (supportSummary) {
      detail.supportSummary = supportSummary;
    }
    return Object.keys(detail).length ? detail : null;
  }

  function resolveWebglFallbackMessages(detail) {
    const detailObject = detail && typeof detail === 'object' ? detail : null;
    const reason =
      typeof detailObject?.reason === 'string' && detailObject.reason
        ? detailObject.reason
        : '';
    const errorName =
      typeof detailObject?.errorName === 'string' && detailObject.errorName
        ? detailObject.errorName
        : '';
    const webgl2Unavailable =
      reason === 'webgl2-unavailable' || errorName === 'WebGL2UnavailableError';
    if (webgl2Unavailable) {
      return {
        title: 'WebGL2 support unavailable',
        overlayIntro:
          'WebGL2 support is unavailable, so Infinite Rails is launching the simplified renderer.',
        noticeMessage:
          'WebGL2 support is unavailable on this device, so the mission briefing view is shown instead of the full 3D renderer.',
        diagnosticMessage: 'WebGL2 support unavailable — launching simplified renderer.',
        supportHint: 'Need more help? Visit chrome://gpu to verify WebGL2 availability.',
        stateReason: 'webgl2-unavailable',
        logMessage:
          'WebGL2 support unavailable at bootstrap. Falling back to simplified renderer.',
      };
    }
    return {
      title: 'WebGL output blocked',
      overlayIntro:
        'WebGL output is blocked, so Infinite Rails is launching the simplified renderer.',
      noticeMessage:
        'WebGL is unavailable on this device, so the mission briefing view is shown instead of the full 3D renderer.',
      diagnosticMessage: 'WebGL blocked — launching simplified renderer.',
      supportHint: 'Need more help? Visit chrome://gpu to verify WebGL availability.',
      stateReason: reason || 'webgl-unavailable',
      logMessage:
        'WebGL unavailable at bootstrap. Falling back to simplified renderer.',
    };
  }

  function ensureRendererFallbackIndicator() {
    try {
      if (typeof setRendererModeIndicator === 'function') {
        setRendererModeIndicator('simple');
      } else if (globalScope) {
        globalScope.__INFINITE_RAILS_RENDERER_MODE__ = 'simple';
        if (globalScope.InfiniteRails && typeof globalScope.InfiniteRails === 'object') {
          globalScope.InfiniteRails.rendererMode = 'simple';
        }
      }
    } catch (error) {
      globalScope?.console?.debug?.('Failed to update renderer indicator for WebGL fallback.', error);
    }
  }

  function updateRendererStateForWebglFallback(reason = 'webgl-unavailable') {
    const state = globalScope?.__INFINITE_RAILS_STATE__;
    if (!state || typeof state !== 'object') {
      ensureRendererFallbackIndicator();
      return;
    }
    try {
      state.rendererMode = 'simple';
      state.reason = typeof reason === 'string' && reason ? reason : 'webgl-unavailable';
      state.updatedAt = Date.now();
    } catch (error) {
      globalScope?.console?.debug?.('Failed to update renderer state for WebGL fallback.', error);
    }
    ensureRendererFallbackIndicator();
  }

  function applyWebglFallbackConfig(config, probeError) {
    const existingDetail =
      config && config.__webglFallbackDetail && typeof config.__webglFallbackDetail === 'object'
        ? config.__webglFallbackDetail
        : null;
    const derivedDetail = normaliseWebglFallbackDetail(probeError);
    let fallbackDetail =
      existingDetail && typeof existingDetail === 'object'
        ? { ...existingDetail }
        : derivedDetail && typeof derivedDetail === 'object'
          ? { ...derivedDetail }
          : {};
    if (!fallbackDetail.reason) {
      fallbackDetail.reason = derivedDetail?.reason || 'webgl-unavailable';
    }
    const messages = resolveWebglFallbackMessages(fallbackDetail);
    fallbackDetail.reason = messages.stateReason;
    if (config) {
      config.webglSupport = false;
      if (!config.__webglFallbackApplied) {
        config.__webglFallbackApplied = true;
        config.preferAdvanced = false;
        config.enableAdvancedExperience = false;
        config.forceAdvanced = false;
        config.defaultMode = 'simple';
        queueBootstrapFallbackNotice(
          'webgl-unavailable-simple-mode',
          messages.noticeMessage,
        );
      }
      if (fallbackDetail && Object.keys(fallbackDetail).length > 0) {
        config.__webglFallbackDetail = fallbackDetail;
      }
    }
    presentWebglBlockedOverlay({ detail: fallbackDetail });
    updateRendererStateForWebglFallback(messages.stateReason);
    return fallbackDetail;
  }

  function probeWebglSupport(doc) {
    const scopeCandidate =
      (doc && typeof doc.defaultView === 'object' && doc.defaultView) ||
      (typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis);
    if (!doc || typeof doc.createElement !== 'function') {
      const probeError = new Error('Document unavailable for WebGL probe.');
      probeError.name = 'WebGLProbeUnavailable';
      return { supported: false, error: probeError };
    }
    if (!scopeCandidate || typeof scopeCandidate.WebGL2RenderingContext === 'undefined') {
      const error = new Error('WebGL2 support is required but not available in this environment.');
      error.name = 'WebGL2UnavailableError';
      error.reason = 'webgl2-unavailable';
      error.supportSummary = 'WebGL2RenderingContext constructor missing.';
      return { supported: false, error };
    }
    try {
      const canvas = doc.createElement('canvas');
      const getContext = typeof canvas?.getContext === 'function' ? canvas.getContext.bind(canvas) : null;
      if (!getContext) {
        const error = new Error('Canvas does not provide a WebGL2-capable context.');
        error.name = 'WebGL2ContextUnavailable';
        error.reason = 'webgl2-unavailable';
        error.supportSummary = 'Canvas does not expose getContext for WebGL2.';
        return { supported: false, error };
      }
      const context = getContext('webgl2');
      if (!context) {
        const error = new Error('WebGL2 context request returned null.');
        error.name = 'WebGL2ContextUnavailable';
        error.reason = 'webgl2-unavailable';
        error.supportSummary = 'Canvas getContext("webgl2") returned null.';
        return { supported: false, error };
      }
      return { supported: true, error: null };
    } catch (error) {
      const probeError = error instanceof Error ? error : new Error('WebGL probe failed.');
      if (!probeError.reason) {
        probeError.reason = 'webgl2-unavailable';
      }
      return { supported: false, error: probeError };
    }
  }

  function shouldStartSimpleMode() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    const config = scope.APP_CONFIG || (scope.APP_CONFIG = {});
    const search = scope.location?.search || '';
    const params = new URLSearchParams(search);
    const queryMode = params.get('mode');
    if (config.__webglFallbackApplied) {
      applyWebglFallbackConfig(config, config.__webglFallbackDetail || null);
      return true;
    }
    if (queryMode === 'simple') {
      return true;
    }
    if (queryMode === 'advanced') {
      return false;
    }
    if (config.forceSimpleMode) {
      return true;
    }
    const mobileEnvironment = detectMobileEnvironment(scope);
    if (mobileEnvironment.isMobile) {
      config.isMobileEnvironment = true;
    }
    const mobileAdvancedSupported =
      config.supportsAdvancedMobile ?? config.allowAdvancedOnMobile ?? config.enableAdvancedOnMobile ?? false;
    if (mobileEnvironment.isMobile && !mobileAdvancedSupported) {
      config.forceAdvanced = false;
      config.enableAdvancedExperience = false;
      config.preferAdvanced = false;
      config.defaultMode = 'simple';
      queueBootstrapFallbackNotice(
        'mobile-simple-mode',
        'Advanced renderer is unavailable on mobile devices — loading the simplified sandbox instead.',
      );
      return true;
    }
    if (config.forceAdvanced) {
      return false;
    }
    if (config.enableAdvancedExperience === false) {
      return true;
    }
    const doc = typeof document !== 'undefined' ? document : documentRef;
    const { supported, error } = probeWebglSupport(doc);
    config.webglSupport = supported;
    if (!supported) {
      applyWebglFallbackConfig(config, error);
      return true;
    }
    return !config.preferAdvanced;
  }

  function runWebglPreflightCheck() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    const config = scope.APP_CONFIG || (scope.APP_CONFIG = {});
    const search = scope.location?.search || '';
    let queryMode = null;
    if (typeof URLSearchParams === 'function') {
      try {
        queryMode = new URLSearchParams(search).get('mode');
      } catch (error) {
        if (globalScope?.console?.debug) {
          globalScope.console.debug('Failed to parse query params for WebGL preflight.', error);
        }
      }
    }
    if (config.__webglFallbackApplied) {
      applyWebglFallbackConfig(config, config.__webglFallbackDetail || null);
      return true;
    }
    if (queryMode === 'simple') {
      return false;
    }
    if (config.forceSimpleMode || config.enableAdvancedExperience === false) {
      return false;
    }
    const doc = typeof document !== 'undefined' ? document : documentRef;
    const { supported, error } = probeWebglSupport(doc);
    config.webglSupport = supported;
    if (!supported) {
      applyWebglFallbackConfig(config, error);
      return true;
    }
    return false;
  }

  function internalCreateScoreboardUtilsFallback() {
    return {
      hydrate() {
        return [];
      },
      normalise(entries = []) {
        return Array.isArray(entries) ? entries.slice() : [];
      },
    };
  }

  function ensureHudDefaults(doc) {
    if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') {
      return;
    }

    const body = getBodyElement() || doc.body || null;
    let hudLayer = doc.getElementById('gameHud');
    if (!hudLayer) {
      hudLayer = doc.createElement('div');
      hudLayer.id = 'gameHud';
      hudLayer.className = 'hud-layer hud-autogenerated';
      if (body && typeof body.appendChild === 'function') {
        body.appendChild(hudLayer);
      }
    }
    if (!hudLayer) {
      return;
    }

    let hudAlert = doc.getElementById('hudAlert');
    if (!hudAlert) {
      hudAlert = doc.createElement('div');
      hudAlert.id = 'hudAlert';
      hudAlert.className = 'hud-alert hud-autogenerated';
      hudAlert.setAttribute('role', 'alert');
      hudAlert.setAttribute('aria-live', 'assertive');
      hudAlert.hidden = true;
      const icon = doc.createElement('span');
      icon.className = 'hud-alert__icon';
      icon.setAttribute('aria-hidden', 'true');
      const content = doc.createElement('div');
      content.className = 'hud-alert__content';
      const titleEl = doc.createElement('span');
      titleEl.className = 'hud-alert__title';
      titleEl.id = 'hudAlertTitle';
      titleEl.hidden = true;
      const messageEl = doc.createElement('span');
      messageEl.className = 'hud-alert__message';
      messageEl.id = 'hudAlertMessage';
      messageEl.hidden = true;
      content.appendChild(titleEl);
      content.appendChild(messageEl);
      hudAlert.appendChild(icon);
      hudAlert.appendChild(content);
      hudLayer.insertBefore(hudAlert, hudLayer.firstChild || null);
    } else {
      if (!hudAlert.classList.contains('hud-alert')) {
        hudAlert.classList.add('hud-alert');
      }
      if (!hudAlert.hasAttribute('role')) {
        hudAlert.setAttribute('role', 'alert');
      }
      if (!hudAlert.hasAttribute('aria-live')) {
        hudAlert.setAttribute('aria-live', 'assertive');
      }
      let icon = hudAlert.querySelector('.hud-alert__icon');
      if (!icon) {
        icon = doc.createElement('span');
        icon.className = 'hud-alert__icon';
        icon.setAttribute('aria-hidden', 'true');
        hudAlert.insertBefore(icon, hudAlert.firstChild || null);
      }
      let content = hudAlert.querySelector('.hud-alert__content');
      if (!content) {
        content = doc.createElement('div');
        content.className = 'hud-alert__content';
        hudAlert.appendChild(content);
      }
      let titleEl = doc.getElementById('hudAlertTitle');
      if (!titleEl) {
        titleEl = doc.createElement('span');
        titleEl.id = 'hudAlertTitle';
        titleEl.className = 'hud-alert__title';
        titleEl.hidden = true;
        content.insertBefore(titleEl, content.firstChild || null);
      }
      let messageEl = doc.getElementById('hudAlertMessage');
      if (!messageEl) {
        messageEl = doc.createElement('span');
        messageEl.id = 'hudAlertMessage';
        messageEl.className = 'hud-alert__message';
        messageEl.hidden = true;
        content.appendChild(messageEl);
      }
      hudAlert.hidden = hudAlert.hidden !== undefined ? hudAlert.hidden : true;
    }

    const ensureStatusGroup = () => {
      let statusCard = hudLayer.querySelector('.hud-card--status');
      if (!statusCard) {
        statusCard = doc.createElement('div');
        statusCard.className = 'hud-card hud-card--status hud-autogenerated';
        hudLayer.appendChild(statusCard);
      }
      let statusGroup = statusCard.querySelector('.hud-status');
      if (!statusGroup) {
        statusGroup = doc.createElement('div');
        statusGroup.className = 'hud-status';
        statusGroup.setAttribute('role', 'group');
        statusGroup.setAttribute('aria-label', 'Player vitals');
        statusCard.appendChild(statusGroup);
      }
      return statusGroup;
    };

    const statusGroup = ensureStatusGroup();
    const ensureStatusItem = (id, className, hint) => {
      const existing = doc.getElementById(id);
      if (existing) {
        return existing;
      }
      const item = doc.createElement('div');
      item.id = id;
      item.className = `status-item ${className}`;
      if (hint) {
        item.setAttribute('data-hint', hint);
      }
      statusGroup.appendChild(item);
      return item;
    };

    ensureStatusItem('hearts', 'hearts', 'Current health hearts.');
    ensureStatusItem('bubbles', 'bubbles', 'Breath remaining while underwater.');
    ensureStatusItem('timeOfDay', 'time', 'Local dimension time.');

    let scorePanel = doc.getElementById('scorePanel');
    if (!scorePanel) {
      scorePanel = doc.createElement('div');
      scorePanel.id = 'scorePanel';
      scorePanel.className = 'score-overlay hud-autogenerated';
      scorePanel.setAttribute('role', 'status');
      scorePanel.setAttribute('aria-live', 'polite');
      hudLayer.appendChild(scorePanel);
    }
    let scoreLabel = scorePanel.querySelector('.score-overlay__label');
    if (!scoreLabel) {
      scoreLabel = doc.createElement('span');
      scoreLabel.className = 'score-overlay__label';
      scoreLabel.textContent = 'Score';
      scorePanel.appendChild(scoreLabel);
    }
    let scoreTotalEl = doc.getElementById('scoreTotal');
    if (!scoreTotalEl) {
      scoreTotalEl = doc.createElement('span');
      scoreTotalEl.id = 'scoreTotal';
      scoreTotalEl.className = 'score-overlay__value';
      scoreTotalEl.textContent = '0';
      scorePanel.appendChild(scoreTotalEl);
    } else if (!scoreTotalEl.classList.contains('score-overlay__value')) {
      scoreTotalEl.classList.add('score-overlay__value');
    }
    let scoreBreakdown = scorePanel.querySelector('.score-overlay__breakdown');
    if (!scoreBreakdown) {
      scoreBreakdown = doc.createElement('ul');
      scoreBreakdown.className = 'score-overlay__breakdown';
      scorePanel.appendChild(scoreBreakdown);
    }
    const ensureScoreMetric = (id, labelText, defaultText) => {
      const existing = doc.getElementById(id);
      if (existing) {
        return existing;
      }
      const item = doc.createElement('li');
      const label = doc.createElement('span');
      label.className = 'score-overlay__metric-label';
      label.textContent = labelText;
      const value = doc.createElement('span');
      value.className = 'score-overlay__metric-value';
      value.id = id;
      value.textContent = defaultText;
      item.appendChild(label);
      item.appendChild(value);
      scoreBreakdown.appendChild(item);
      return value;
    };

    ensureScoreMetric('scoreRecipes', 'Crafting', '0 crafts (+0 pts)');
    ensureScoreMetric('scoreDimensions', 'Dimensions', '1 (+0 pts)');
    ensureScoreMetric('scorePortals', 'Portals', '0 events (+0 pts)');
    ensureScoreMetric('scoreCombat', 'Combat', '0 victories (+0 pts)');
    ensureScoreMetric('scoreLoot', 'Loot', '0 finds (+0 pts)');

    if (!doc.getElementById('hotbar')) {
      const hotbarEl = doc.createElement('div');
      hotbarEl.id = 'hotbar';
      hotbarEl.className = 'hotbar hud-autogenerated';
      const sidePanel = doc.getElementById('sidePanel');
      const inventoryPanel = sidePanel?.querySelector?.('.inventory-panel') || null;
      if (inventoryPanel && typeof inventoryPanel.insertBefore === 'function') {
        inventoryPanel.insertBefore(hotbarEl, inventoryPanel.firstChild || null);
      } else if (sidePanel && typeof sidePanel.appendChild === 'function') {
        sidePanel.appendChild(hotbarEl);
      } else if (hudLayer && typeof hudLayer.appendChild === 'function') {
        hudLayer.appendChild(hotbarEl);
      } else if (body && typeof body.appendChild === 'function') {
        body.appendChild(hotbarEl);
      }
    }
  }

  function collectSimpleExperienceUi(doc) {
    if (!doc) {
      return {};
    }
    const byId = (id) => doc.getElementById(id);
    const query = (selector) => doc.querySelector(selector);
    const portalStatusEl = byId('portalStatus');
    const virtualJoystick = byId('virtualJoystick');
    const openInventoryCandidates = new Set(
      doc.querySelectorAll('[data-open-inventory], [data-toggle-inventory], [data-inventory-toggle]'),
    );
    const hotbarToggle = byId('toggleExtended');
    if (hotbarToggle) {
      openInventoryCandidates.add(hotbarToggle);
    }
    return {
      victoryBanner: byId('victoryBanner'),
      victoryCelebration: byId('victoryCelebration'),
      victoryConfetti: byId('victoryConfetti'),
      victoryFireworks: byId('victoryFireworks'),
      victoryMessageEl: byId('victoryMessage'),
      victoryStatsEl: byId('victoryStats'),
      victoryShareButton: byId('victoryShareButton'),
      victoryCloseButton: byId('victoryCloseButton'),
      victoryShareStatusEl: byId('victoryShareStatus'),
      scoreboardListEl: byId('scoreboardList'),
      scoreboardStatusEl: byId('scoreboardStatus'),
      refreshScoresButton: byId('refreshScores'),
      scoreSyncWarningEl: byId('scoreSyncWarning'),
      scoreSyncWarningMessageEl: query('#scoreSyncWarning .score-sync-warning__message'),
      hotbarEl: byId('hotbar'),
      handOverlayEl: byId('handOverlay'),
      handOverlayIconEl: byId('handOverlayIcon'),
      handOverlayLabelEl: byId('handOverlayLabel'),
      playerHintEl: byId('playerHint'),
      pointerHintEl: byId('pointerHint'),
      inputOverlay: byId('inputOverlay'),
      inputOverlayDismissButton: byId('dismissInputOverlay'),
      inputOverlayPointerMove: byId('inputOverlayPointerMove'),
      inputOverlayPointerInteract: byId('inputOverlayPointerInteract'),
      inputOverlayPointerPlace: byId('inputOverlayPointerPlace'),
      inputOverlayPointerCraft: byId('inputOverlayPointerCraft'),
      footerEl: byId('siteFooter'),
      footerScoreEl: byId('footerScore'),
      footerDimensionEl: byId('footerDimension'),
      footerStatusEl: byId('footerStatus'),
      defeatOverlay: byId('defeatOverlay'),
      defeatMessageEl: byId('defeatMessage'),
      defeatInventoryEl: byId('defeatInventory'),
      defeatCountdownEl: byId('defeatCountdown'),
      defeatRespawnButton: byId('defeatRespawn'),
      assetRecoveryOverlay: byId('assetRecoveryOverlay'),
      assetRecoveryDialogEl: byId('assetRecoveryDialog'),
      assetRecoveryTitleEl: byId('assetRecoveryTitle'),
      assetRecoveryMessageEl: byId('assetRecoveryMessage'),
      assetRecoveryActionsEl: byId('assetRecoveryActions'),
      assetRecoveryRetryButton: byId('assetRecoveryRetry'),
      assetRecoveryReloadButton: byId('assetRecoveryReload'),
      startButton: byId('startButton'),
      landingGuideButton: byId('landingGuideButton'),
      openTutorialButton: byId('openTutorial'),
      openGuideButton: byId('openGuide'),
      guideModal: byId('guideModal'),
      guideCloseButtons: Array.from(doc.querySelectorAll('[data-close-guide]')),
      guideScrollContainer: doc.querySelector('[data-guide-scroll]'),
      guideCardEl: doc.querySelector('[data-guide-card]'),
      guidePrevButton: doc.querySelector('[data-guide-prev]'),
      guideNextButton: doc.querySelector('[data-guide-next]'),
      guideDotsContainer: doc.querySelector('[data-guide-dots]'),
      introModal: byId('introModal'),
      hudRootEl: byId('gameHud'),
      hudAlertEl: byId('hudAlert'),
      hudAlertTitleEl: byId('hudAlertTitle'),
      hudAlertMessageEl: byId('hudAlertMessage'),
      lostGuidanceBanner: byId('lostGuidanceBanner'),
      lostGuidanceDismissButton: byId('lostGuidanceDismiss'),
      lostGuidanceMoveKeys: byId('lostGuidanceMoveKeys'),
      lostGuidanceGatherKeys: byId('lostGuidanceGatherKeys'),
      lostGuidanceCraftKey: byId('lostGuidanceCraftKey'),
      lostGuidancePortalKeys: byId('lostGuidancePortalKeys'),
      gameBriefing: byId('gameBriefing'),
      dismissBriefingButton: byId('dismissBriefing'),
      firstRunTutorial: byId('firstRunTutorial'),
      firstRunTutorialBackdrop: byId('firstRunTutorialBackdrop'),
      firstRunTutorialCloseButton: byId('firstRunTutorialClose'),
      firstRunTutorialPrimaryButton: byId('firstRunTutorialBegin'),
      firstRunTutorialMoveDetail: byId('firstRunTutorialMoveDetail'),
      firstRunTutorialGatherDetail: byId('firstRunTutorialGatherDetail'),
      firstRunTutorialCraftDetail: byId('firstRunTutorialCraftDetail'),
      firstRunTutorialIssues: byId('firstRunTutorialIssues'),
      firstRunTutorialIssuesList: byId('firstRunTutorialIssuesList'),
      firstRunTutorialNote: byId('firstRunTutorialNote'),
      craftLauncherButton: byId('openCrafting'),
      craftingModal: byId('craftingModal'),
      craftSequenceEl: byId('craftSequence'),
      craftingInventoryEl: byId('craftingInventory'),
      craftSuggestionsEl: byId('craftSuggestions'),
      craftButton: byId('craftButton'),
      clearCraftButton: byId('clearCraft'),
      closeCraftingButton: byId('closeCrafting'),
      craftingHelperEl: byId('craftingHelper'),
      craftingHelperTitleEl: byId('craftingHelperTitle'),
      craftingHelperDescriptionEl: byId('craftingHelperDescription'),
      craftingHelperMatchesEl: byId('craftingHelperMatches'),
      openCraftingSearchButton: byId('openCraftingSearch'),
      closeCraftingSearchButton: byId('closeCraftingSearch'),
      craftingSearchPanel: byId('craftingSearchPanel'),
      craftingSearchInput: byId('craftingSearchInput'),
      craftingSearchResultsEl: byId('craftingSearchResults'),
      inventoryModal: byId('inventoryModal'),
      inventoryGridEl: byId('inventoryGrid'),
      inventorySortButton: byId('inventorySortButton'),
      inventoryOverflowEl: byId('inventoryOverflow'),
      closeInventoryButton: byId('closeInventory'),
      openInventoryButtons: Array.from(openInventoryCandidates),
      hotbarExpandButton: hotbarToggle,
      extendedInventoryEl: byId('extendedInventory'),
      dimensionInfoEl: byId('dimensionInfo'),
      dimensionIntroEl: byId('dimensionIntro'),
      dimensionIntroNameEl: byId('dimensionIntroName'),
      dimensionIntroRulesEl: byId('dimensionIntroRules'),
      heartsEl: byId('hearts'),
      bubblesEl: byId('bubbles'),
      timeEl: byId('timeOfDay'),
      scorePanelEl: byId('scorePanel'),
      scoreTotalEl: byId('scoreTotal'),
      scoreRecipesEl: byId('scoreRecipes'),
      scoreDimensionsEl: byId('scoreDimensions'),
      scorePortalsEl: byId('scorePortals'),
      scoreCombatEl: byId('scoreCombat'),
      scoreLootEl: byId('scoreLoot'),
      eventOverlayStack: byId('eventOverlayStack'),
      portalStatusEl,
      portalStatusText: portalStatusEl ? portalStatusEl.querySelector('.portal-status__text') : null,
      portalStatusStateText: portalStatusEl ? portalStatusEl.querySelector('.portal-status__state') : null,
      portalStatusDetailText: portalStatusEl ? portalStatusEl.querySelector('.portal-status__detail') : null,
      portalStatusIcon: portalStatusEl ? portalStatusEl.querySelector('.portal-status__icon') : null,
      portalProgressLabel: query('#portalProgress .label'),
      portalProgressBar: query('#portalProgress .bar'),
      eventLogEl: byId('eventLog'),
      developerStatsToggle: byId('developerStatsToggle'),
      developerStatsPanel: byId('developerStatsPanel'),
      bootDiagnosticsPanel: byId('bootDiagnosticsPanel'),
      bootDiagnosticsTimestamp: byId('bootDiagnosticsTimestamp'),
      bootDiagnosticsDownloadButton: byId('bootDiagnosticsDownload'),
      bootDiagnosticsEngineSection: byId('bootDiagnosticsEngineSection'),
      bootDiagnosticsEngineStatus: byId('bootDiagnosticsEngineStatus'),
      bootDiagnosticsEngineList: byId('bootDiagnosticsEngineList'),
      bootDiagnosticsAssetsSection: byId('bootDiagnosticsAssetsSection'),
      bootDiagnosticsAssetsStatus: byId('bootDiagnosticsAssetsStatus'),
      bootDiagnosticsAssetsList: byId('bootDiagnosticsAssetsList'),
      bootDiagnosticsModelsSection: byId('bootDiagnosticsModelsSection'),
      bootDiagnosticsModelsStatus: byId('bootDiagnosticsModelsStatus'),
      bootDiagnosticsModelsList: byId('bootDiagnosticsModelsList'),
      bootDiagnosticsUiSection: byId('bootDiagnosticsUiSection'),
      bootDiagnosticsUiStatus: byId('bootDiagnosticsUiStatus'),
      bootDiagnosticsUiList: byId('bootDiagnosticsUiList'),
      liveDiagnosticsToggle: byId('liveDiagnosticsToggle'),
      liveDiagnosticsPanel: byId('liveDiagnosticsPanel'),
      liveDiagnosticsList: byId('liveDiagnosticsList'),
      liveDiagnosticsEmpty: byId('liveDiagnosticsEmpty'),
      liveDiagnosticsClear: byId('liveDiagnosticsClear'),
      settingsForm: doc.querySelector('[data-settings-form]'),
      debugModeToggle: byId('debugModeToggle'),
      debugModeStatus: byId('debugModeStatus'),
      blockActionHud: byId('blockActionHud'),
      crosshairEl: byId('crosshair'),
      mobileControls: byId('mobileControls'),
      virtualJoystick,
      virtualJoystickThumb: virtualJoystick ? virtualJoystick.querySelector('.virtual-joystick__thumb') : null,
    };
  }

  function setRendererModeIndicator(mode) {
    const doc = documentRef || globalScope.document || null;
    if (doc?.documentElement?.setAttribute) {
      doc.documentElement.setAttribute('data-renderer-mode', mode);
    }
    if (doc?.body?.setAttribute) {
      doc.body.setAttribute('data-renderer-mode', mode);
    }
    globalScope.__INFINITE_RAILS_RENDERER_MODE__ = mode;
    globalScope.InfiniteRails = globalScope.InfiniteRails || {};
    globalScope.InfiniteRails.rendererMode = mode;
  }

  function getActiveRendererMode() {
    const direct = normaliseRendererModeInput(globalScope?.InfiniteRails?.rendererMode);
    if (direct) {
      return direct;
    }
    const stored = normaliseRendererModeInput(globalScope?.__INFINITE_RAILS_RENDERER_MODE__);
    if (stored) {
      return stored;
    }
    const configured = normaliseRendererModeInput(globalScope?.APP_CONFIG?.defaultMode);
    if (configured) {
      return configured;
    }
    return null;
  }

  async function teardownActiveExperience(options = {}) {
    const instance = activeExperienceInstance;
    if (!instance) {
      return { instance: null, stopped: false, destroyed: false };
    }
    const mode = normaliseRendererModeInput(options.mode) ?? getActiveRendererMode();
    const reason =
      typeof options.reason === 'string' && options.reason.trim().length
        ? options.reason.trim()
        : 'renderer-teardown';
    const stageBase = `modules.renderers.${mode ?? 'unknown'}.teardown`;
    const teardownDetail = {
      reason,
      mode,
    };

    async function runTeardownStep(label, fn) {
      if (typeof fn !== 'function') {
        return false;
      }
      await invokeWithErrorBoundary(
        () => fn.call(instance),
        {
          boundary: 'modules',
          stage: `${stageBase}.${label}`,
          detail: { ...teardownDetail, step: label },
          rethrow: false,
        },
      );
      return true;
    }

    const result = { instance, stopped: false, destroyed: false };
    if (await runTeardownStep('stop', instance.stop)) {
      result.stopped = true;
    }
    let cleanupApplied = false;
    const cleanupOrder = ['destroy', 'dispose', 'teardown', 'shutdown'];
    for (const methodName of cleanupOrder) {
      const method = instance[methodName];
      if (await runTeardownStep(methodName, method)) {
        cleanupApplied = true;
      }
    }
    result.destroyed = cleanupApplied;
    activeExperienceInstance = null;
    globalScope.__INFINITE_RAILS_ACTIVE_EXPERIENCE__ = null;
    resetAmbientMusicRecoveryState();
    return result;
  }

  async function reloadActiveRenderer(options = {}) {
    const requestedMode = normaliseRendererModeInput(options.mode);
    let mode = requestedMode;
    if (!mode) {
      mode = getActiveRendererMode();
    }
    if (!mode) {
      mode = shouldStartSimpleMode() ? 'simple' : 'advanced';
    }
    const reason =
      typeof options.reason === 'string' && options.reason.trim().length
        ? options.reason.trim()
        : 'renderer-reload';
    const pluginOptions = { ...options, mode, reason: `${reason}:plugins` };
    if (options.reloadPlugins === true) {
      await reloadRendererPlugins(pluginOptions);
    } else if (options.ensurePlugins !== false) {
      await ensureRendererPlugins(pluginOptions);
    }
    await teardownActiveExperience({ ...options, mode, reason: `${reason}:teardown` });
    await reloadRendererModule(mode, { ...options, mode, reason });
    if (options.restart === false) {
      return null;
    }
    return ensureSimpleExperience(mode);
  }

  if (typeof renderersApi !== 'undefined' && renderersApi) {
    renderersApi.getActiveMode = getActiveRendererMode;
    renderersApi.reloadActive = (options = {}) => reloadActiveRenderer(options);
    renderersApi.teardown = (options = {}) => teardownActiveExperience(options);
  }

  function ensureSimpleExperience(mode) {
    if (activeExperienceInstance) {
      activeExperienceInstance.apiBaseUrl = identityState.apiBaseUrl;
      return activeExperienceInstance;
    }
    if (!globalScope.SimpleExperience?.create) {
      presentCriticalErrorOverlay({
        title: 'Renderer unavailable',
        message: 'Simplified renderer is missing from the build output.',
        diagnosticScope: 'renderer',
        diagnosticStatus: 'error',
        diagnosticMessage: 'Simplified renderer is missing from the build output.',
        logScope: 'startup',
        logMessage: 'Simplified renderer is missing from the build output.',
        detail: {
          reason: 'missing-simple-experience',
        },
      });
      return null;
    }
    const doc = documentRef || globalScope.document || null;
    const canvas = doc?.getElementById?.('gameCanvas') ?? null;
    if (!canvas) {
      presentCriticalErrorOverlay({
        title: 'Renderer unavailable',
        message: 'Game canvas could not be located. Reload the page to retry.',
        diagnosticScope: 'renderer',
        diagnosticStatus: 'error',
        diagnosticMessage: 'Game canvas could not be located. Reload the page to retry.',
        logScope: 'startup',
        logMessage: 'Game canvas could not be located. Reload the page to retry.',
        detail: {
          reason: 'missing-canvas',
        },
      });
      return null;
    }
    markBootPhaseActive('ui', 'Binding renderer UI…');
    let ui;
    try {
      ensureHudDefaults(doc);
      ui = collectSimpleExperienceUi(doc);
      bindAudioSettingsControls(ui);
      ensureHudStateBinding(ui);
      bindDebugModeControls(ui);
      bindDeveloperStatsControls(ui);
      bindBootDiagnosticsUi(ui);
      bindLiveDiagnosticsControls(ui);
      bindExperienceEventLog(ui);
      bindExperienceEventOverlays(ui);
      markBootPhaseOk('ui', 'HUD interfaces ready.');
    } catch (uiBootstrapError) {
      markBootPhaseError('ui', 'Failed to prepare HUD interfaces.');
      throw uiBootstrapError;
    }
    let experience;
    try {
      experience = globalScope.SimpleExperience.create({
        canvas,
        ui,
        apiBaseUrl: identityState.apiBaseUrl,
        playerName: identityState.identity?.name ?? 'Explorer',
        identityStorageKey,
      });
      integrateAudioSettingsWithExperience(experience, { source: 'bootstrap' });
      attachSurvivalWatchdogHooksToExperience(experience);
    } catch (error) {
      markBootPhaseError('ui', 'Simplified renderer initialisation failed.');
      if (globalScope.console?.error) {
        globalScope.console.error('Failed to initialise simplified renderer.', error);
      }
      handleErrorBoundary(error, {
        boundary: 'simple-experience',
        stage: 'simple-experience.create',
        detail: {
          reason: 'simple-experience-create',
        },
      });
      throw error;
    }
    activeExperienceInstance = experience;
    globalScope.__INFINITE_RAILS_ACTIVE_EXPERIENCE__ = experience;
    attachSurvivalWatchdogHooksToExperience(experience);
    resetAmbientMusicRecoveryState();
    const scopeLocation = globalScope?.location || (typeof window !== 'undefined' ? window.location : null);
    const locationProtocol = typeof scopeLocation?.protocol === 'string' ? scopeLocation.protocol.toLowerCase() : '';
    const runningFromFileProtocol = locationProtocol === 'file:';
    const shouldEnforceStrictAssets = !runningFromFileProtocol;
    const shouldPreloadCriticalAssets = !runningFromFileProtocol;
    let assetPreloadPromise = null;
    let assetAvailabilityPromise = null;
    let manifestAssetCheckPromise = null;
    if (shouldEnforceStrictAssets && experience && typeof experience.enableStrictAssetValidation === 'function') {
      try {
        experience.enableStrictAssetValidation();
      } catch (error) {
        if (globalScope.console?.debug) {
          globalScope.console.debug('Failed to enable strict asset validation.', error);
        }
      }
    } else if (runningFromFileProtocol && globalScope.console?.info) {
      globalScope.console.info(
        'Skipping strict asset validation while running from the file:// protocol; placeholder assets will be allowed.',
      );
    }
    if (experience && typeof experience.verifyCriticalAssetAvailability === 'function') {
      try {
        markBootPhaseActive('assets', 'Verifying critical asset availability…');
        assetAvailabilityPromise = experience.verifyCriticalAssetAvailability();
        if (assetAvailabilityPromise && typeof assetAvailabilityPromise.then === 'function') {
          assetAvailabilityPromise
            .then(() => {
              markBootPhaseActive('assets', 'Critical assets verified.');
            })
            .catch((availabilityError) => {
              markBootPhaseWarning('assets', 'Asset availability check failed. Review diagnostics.');
              if (globalScope.console?.debug) {
                globalScope.console.debug('Critical asset availability check rejected.', availabilityError);
              }
            });
        }
      } catch (error) {
        if (globalScope.console?.debug) {
          globalScope.console.debug('Failed to initiate critical asset availability check.', error);
        }
        markBootPhaseWarning('assets', 'Critical asset availability check could not start.');
        assetAvailabilityPromise = null;
      }
    }
    if (shouldEnforceStrictAssets && typeof startManifestAssetAvailabilityCheck === 'function') {
      try {
        markBootPhaseActive('assets', 'Checking manifest asset availability…');
        manifestAssetCheckPromise = startManifestAssetAvailabilityCheck();
        if (manifestAssetCheckPromise && typeof manifestAssetCheckPromise.then === 'function') {
          manifestAssetCheckPromise.catch((manifestError) => {
            markBootPhaseWarning('assets', 'Manifest asset availability check failed.');
            if (globalScope.console?.debug) {
              globalScope.console.debug('Manifest asset availability check rejected.', manifestError);
            }
          });
        }
      } catch (error) {
        manifestAssetCheckPromise = null;
        markBootPhaseWarning('assets', 'Manifest asset availability check could not start.');
        if (globalScope.console?.debug) {
          globalScope.console.debug('Failed to initiate manifest asset availability check.', error);
        }
      }
    } else if (!shouldEnforceStrictAssets) {
      markManifestAssetCheckSkipped('offline-mode');
      markBootPhaseWarning('assets', 'Asset verification skipped in offline mode.');
    }
    if (shouldPreloadCriticalAssets && experience && typeof experience.preloadRequiredAssets === 'function') {
      try {
        markBootPhaseActive('assets', 'Preloading critical assets…');
        markBootPhaseActive('gltf', 'Preloading critical models…');
        assetPreloadPromise = experience.preloadRequiredAssets();
      } catch (error) {
        assetPreloadPromise = Promise.reject(error);
        markBootPhaseError('assets', 'Critical asset preload failed.');
        markBootPhaseError('gltf', 'Critical models failed to load.');
        if (globalScope.console?.error) {
          globalScope.console.error('Critical asset preload failure detected.', error);
        }
      }
    } else if (!shouldPreloadCriticalAssets) {
      markBootPhaseOk('assets', 'Assets will stream on demand.');
      markBootPhaseOk('gltf', 'Models will stream on demand.');
      if (globalScope.console?.info) {
        globalScope.console.info(
          'Critical asset preload skipped in offline mode; the experience will stream assets on demand.',
        );
      }
    }
    if (developerStatsState.enabled) {
      developerStatsState.lastUpdateAt = 0;
      const metrics = collectDeveloperMetrics();
      if (metrics) {
        updateDeveloperStatsDisplay(metrics);
      }
      scheduleDeveloperStatsUpdate();
    }
    if (typeof experience.setIdentity === 'function') {
      try {
        experience.setIdentity(identityState.identity);
      } catch (error) {
        console.debug('Initial identity sync failed', error);
      }
    }
    if (typeof experience.publishStateSnapshot === 'function') {
      experience.publishStateSnapshot('bootstrap');
    }
    const overlayController = typeof bootstrapOverlay !== 'undefined' ? bootstrapOverlay : null;
    const hideBootstrapOverlay = () => {
      if (!overlayController || typeof overlayController.hide !== 'function') {
        return;
      }
      const overlayState = overlayController.state ?? {};
      if (overlayState.mode !== 'error') {
        overlayController.hide({ force: true });
      }
    };
    if (overlayController && typeof overlayController.setDiagnostic === 'function') {
      overlayController.setDiagnostic('renderer', {
        status: 'ok',
        message: 'Renderer ready — press Start Expedition to begin.',
      });
      if (assetPreloadPromise && typeof assetPreloadPromise.then === 'function') {
        overlayController.setDiagnostic('assets', {
          status: 'pending',
          message: 'Preloading world assets…',
        });
      } else {
        overlayController.setDiagnostic('assets', {
          status: 'ok',
          message: 'World assets ready.',
        });
      }
      const updateAvailabilityOverlay = (summary) => {
        if (!summary || !overlayController?.setDiagnostic) {
          return;
        }
        const diagnosticsSnapshot = overlayController.diagnostics || {};
        const currentStatus = diagnosticsSnapshot.assets?.status;
        if (currentStatus === 'error') {
          return;
        }
        if (summary.status === 'error') {
          overlayController.setDiagnostic('assets', {
            status: 'warning',
            message: 'Asset availability check failed — review diagnostics.',
          });
          markBootPhaseWarning('assets', 'Asset availability check failed — review diagnostics.');
          return;
        }
        if (Array.isArray(summary.missing) && summary.missing.length > 0) {
          const preview = summary.missing.slice(0, 3).join(', ');
          const suffix = summary.missing.length > 3 ? `, +${summary.missing.length - 3} more` : '';
          overlayController.setDiagnostic('assets', {
            status: 'warning',
            message: `Availability check missing ${summary.missing.length} asset${summary.missing.length === 1 ? '' : 's'} (${preview}${suffix}).`,
          });
          markBootPhaseWarning(
            'assets',
            `Availability check missing ${summary.missing.length} asset${summary.missing.length === 1 ? '' : 's'} (${preview}${suffix}).`,
          );
          return;
        }
        if (!summary.missing || summary.missing.length === 0) {
          markBootPhaseActive('assets', 'Critical assets verified.');
        }
      };
      const updateManifestOverlay = (summary) => {
        if (!summary || !overlayController?.setDiagnostic) {
          return;
        }
        const diagnosticsSnapshot = overlayController.diagnostics || {};
        const currentStatus = diagnosticsSnapshot.assets?.status;
        if (currentStatus === 'error') {
          return;
        }
        if (summary.status === 'error') {
          overlayController.setDiagnostic('assets', {
            status: 'warning',
            message: 'Manifest asset availability check failed — review diagnostics.',
          });
          markBootPhaseWarning('assets', 'Manifest asset availability check failed — review diagnostics.');
          return;
        }
        if (summary.status === 'missing' && Array.isArray(summary.missing) && summary.missing.length > 0) {
          const previewEntries = summary.missing.slice(0, 3);
          const previewNames = previewEntries.map((entry) =>
            typeof entry?.path === 'string' && entry.path.trim().length ? entry.path.trim() : 'Unknown asset',
          );
          const remaining = summary.missing.length - previewNames.length;
          const suffix = remaining > 0 ? `, +${remaining} more` : '';
          const previewLabel = previewNames.join(', ');
          overlayController.setDiagnostic('assets', {
            status: 'warning',
            message: `Manifest check missing ${summary.missing.length} asset${summary.missing.length === 1 ? '' : 's'} (${previewLabel}${suffix}).`,
          });
          markBootPhaseWarning(
            'assets',
            `Manifest check missing ${summary.missing.length} asset${summary.missing.length === 1 ? '' : 's'} (${previewLabel}${suffix}).`,
          );
          return;
        }
        if (!summary.missing || summary.missing.length === 0) {
          markBootPhaseActive('assets', 'Manifest assets verified.');
        }
      };
      if (assetAvailabilityPromise && typeof assetAvailabilityPromise.then === 'function') {
        assetAvailabilityPromise
          .then(updateAvailabilityOverlay)
          .catch((error) => {
            const diagnosticsSnapshot = overlayController.diagnostics || {};
            const currentStatus = diagnosticsSnapshot.assets?.status;
            if (currentStatus === 'error') {
              return;
            }
            overlayController.setDiagnostic('assets', {
              status: 'warning',
              message: 'Asset availability check failed — review diagnostics.',
            });
            markBootPhaseWarning('assets', 'Asset availability check failed — review diagnostics.');
            if (globalScope.console?.debug) {
              globalScope.console.debug('Asset availability overlay update failed.', error);
            }
          });
      }
      if (manifestAssetCheckPromise && typeof manifestAssetCheckPromise.then === 'function') {
        manifestAssetCheckPromise
          .then(updateManifestOverlay)
          .catch((error) => {
            const diagnosticsSnapshot = overlayController.diagnostics || {};
            const currentStatus = diagnosticsSnapshot.assets?.status;
            if (currentStatus !== 'error') {
              overlayController.setDiagnostic('assets', {
                status: 'warning',
                message: 'Manifest asset availability check failed — review diagnostics.',
              });
              markBootPhaseWarning('assets', 'Manifest asset availability check failed — review diagnostics.');
            }
            if (globalScope.console?.debug) {
              globalScope.console.debug('Manifest asset availability overlay update failed.', error);
            }
          });
      }
    }
    const releaseStartButton = ({ delayed } = {}) => {
      if (!ui.startButton) {
        markBootPhaseWarning('controls', 'Start control unavailable. Use Enter/Space to begin.');
        return;
      }
      ui.startButton.disabled = false;
      if (delayed) {
        ui.startButton.removeAttribute('data-preloading');
        ui.startButton.dataset.preloadWarning = 'delayed';
        markBootPhaseWarning('controls', 'Controls ready. Assets are still streaming — visuals may pop in.');
      } else {
        ui.startButton.removeAttribute('data-preloading');
        if (ui.startButton.dataset.preloadWarning) {
          delete ui.startButton.dataset.preloadWarning;
        }
        markBootPhaseOk('controls', 'Controls ready. Press Start to enter the world.');
      }
      suppressAssetLoadingIndicatorOverlay();
      hideBootstrapOverlay();
    };
    if (assetPreloadPromise && typeof assetPreloadPromise.then === 'function') {
      let assetPreloadFallbackTimer = null;
      const clearAssetPreloadFallbackTimer = () => {
        if (assetPreloadFallbackTimer !== null) {
          const clearTimer = typeof globalScope?.clearTimeout === 'function'
            ? globalScope.clearTimeout.bind(globalScope)
            : typeof clearTimeout === 'function'
              ? clearTimeout
              : null;
          if (clearTimer) {
            clearTimer(assetPreloadFallbackTimer);
          }
          assetPreloadFallbackTimer = null;
        }
      };
      if (ui.startButton) {
        ui.startButton.disabled = true;
        ui.startButton.setAttribute('data-preloading', 'true');
      }
      const scheduleAssetPreloadFallback = () => {
        const setTimer = typeof globalScope?.setTimeout === 'function'
          ? globalScope.setTimeout.bind(globalScope)
          : typeof setTimeout === 'function'
            ? setTimeout
            : null;
        if (!setTimer) {
          return;
        }
        assetPreloadFallbackTimer = setTimer(() => {
          assetPreloadFallbackTimer = null;
          if (ui.startButton && ui.startButton.disabled) {
            releaseStartButton({ delayed: true });
            if (globalScope.console?.warn) {
              globalScope.console.warn(
                'Asset preload is taking longer than expected. Enabling Start Expedition early; some visuals may appear with placeholders until loading completes.',
              );
            }
            if (overlayController?.setDiagnostic) {
              overlayController.setDiagnostic('assets', {
                status: 'warning',
                message: 'Assets still loading. Starting now may show placeholder visuals.',
              });
            }
            markBootPhaseWarning('assets', 'Assets still loading. Starting now may show placeholder visuals.');
          }
        }, 7000);
      };
      scheduleAssetPreloadFallback();
      assetPreloadPromise
        .then(() => {
          clearAssetPreloadFallbackTimer();
          releaseStartButton({ delayed: false });
          markBootPhaseOk('assets', 'Critical assets ready.');
          markBootPhaseOk('gltf', 'Critical models ready.');
          if (overlayController?.setDiagnostic) {
            overlayController.setDiagnostic('assets', {
              status: 'ok',
              message: 'World assets ready.',
            });
          }
          hideBootstrapOverlay();
        })
        .catch(async (error) => {
          clearAssetPreloadFallbackTimer();
          if (globalScope.console?.error) {
            globalScope.console.error('Critical asset preload failed.', error);
          }
          markBootPhaseError('assets', 'Critical asset preload failed.');
          markBootPhaseError('gltf', 'Critical models failed to load.');
          const errorMessage =
            typeof error?.message === 'string' && error.message.trim().length
              ? error.message.trim()
              : 'Critical assets failed to preload. Reload to try again.';
          const errorName = typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined;
          const errorStack = typeof error?.stack === 'string' && error.stack.trim().length ? error.stack.trim() : undefined;
          const embeddedFallbackEligible = (() => {
            if (!experience) {
              return false;
            }
            try {
              if (typeof experience.shouldUseEmbeddedModelFallback === 'function') {
                const decision = experience.shouldUseEmbeddedModelFallback(error);
                if (decision) {
                  return true;
                }
              }
            } catch (fallbackDecisionError) {
              if (globalScope.console?.debug) {
                globalScope.console.debug('Embedded fallback decision failed; falling back to message heuristics.', fallbackDecisionError);
              }
            }
            const message = typeof error?.message === 'string' ? error.message : '';
            if (message && /URL scheme "file" is not supported/i.test(message)) {
              return true;
            }
            if (runningFromFileProtocol && message && /TypeError: Failed to fetch/i.test(message)) {
              return true;
            }
            if (message && /Access to XMLHttpRequest at 'file:/i.test(message)) {
              return true;
            }
            return false;
          })();
          if (embeddedFallbackEligible && experience && typeof experience.loadEmbeddedModelFromBundle === 'function') {
            let fallbackSucceeded = false;
            let retryError = null;
            try {
              if (globalScope.console?.warn) {
                globalScope.console.warn(
                  'Critical asset preload failed while running from file://; activating embedded asset bundle.',
                  error,
                );
              }
              if (overlayController?.setDiagnostic) {
                overlayController.setDiagnostic('assets', {
                  status: 'warning',
                  message: 'Network assets unavailable — loading embedded bundle.',
                });
              }
              if (typeof logDiagnosticsEvent === 'function') {
                logDiagnosticsEvent('assets', 'Critical preload failed from file://; using embedded asset bundle.', {
                  level: 'warning',
                  detail: { reason: 'embedded-bundle', message: errorMessage },
                });
              }
              const entries =
                typeof experience.collectCriticalModelEntries === 'function'
                  ? experience.collectCriticalModelEntries()
                  : [];
              const loadTasks = [];
              if (Array.isArray(entries) && entries.length) {
                for (const entry of entries) {
                  if (!entry || typeof entry.key !== 'string' || !entry.key.trim()) {
                    continue;
                  }
                  loadTasks.push(
                    experience
                      .loadEmbeddedModelFromBundle(entry.key.trim(), {
                        force: true,
                        url: typeof entry.url === 'string' ? entry.url : null,
                        error,
                      })
                      .catch((fallbackError) => {
                        if (globalScope.console?.debug) {
                          globalScope.console.debug(
                            `Embedded model preload failed for ${entry.key}.`,
                            fallbackError,
                          );
                        }
                        return null;
                      }),
                  );
                }
              } else {
                loadTasks.push(Promise.resolve(null));
              }
              await Promise.all(loadTasks);
              try {
                experience.criticalAssetPreloadPromise = null;
              } catch (stateResetError) {
                if (globalScope.console?.debug) {
                  globalScope.console.debug('Failed to reset critical preload promise state.', stateResetError);
                }
              }
              if (typeof experience.preloadRequiredAssets === 'function') {
                try {
                  const retryResult = experience.preloadRequiredAssets();
                  if (retryResult && typeof retryResult.then === 'function') {
                    await retryResult;
                  }
                  fallbackSucceeded = true;
                } catch (preloadRetryError) {
                  retryError = preloadRetryError;
                  fallbackSucceeded = false;
                }
              } else {
                fallbackSucceeded = true;
              }
            } catch (fallbackError) {
              retryError = fallbackError instanceof Error ? fallbackError : error;
              fallbackSucceeded = false;
            }
            if (fallbackSucceeded) {
              if (overlayController?.setDiagnostic) {
                overlayController.setDiagnostic('assets', {
                  status: 'ok',
                  message: 'Embedded asset bundle active — world assets loading locally.',
                });
              }
              if (typeof logDiagnosticsEvent === 'function') {
                logDiagnosticsEvent('assets', 'Embedded asset bundle activated; continuing offline.', {
                  level: 'info',
                  detail: { reason: 'embedded-bundle' },
                });
              }
              if (mode === 'advanced') {
                try {
                  setRendererModeIndicator?.('advanced');
                } catch (indicatorError) {
                  if (globalScope.console?.debug) {
                    globalScope.console.debug('Failed to update renderer mode indicator after embedded fallback.', indicatorError);
                  }
                }
                const state = globalScope?.__INFINITE_RAILS_STATE__;
                if (state && typeof state === 'object') {
                  try {
                    state.rendererMode = 'advanced';
                    state.reason = 'embedded-bundle';
                    state.updatedAt = Date.now();
                  } catch (stateError) {
                    if (globalScope.console?.debug) {
                      globalScope.console.debug('Failed to update renderer state for embedded bundle.', stateError);
                    }
                  }
                }
              }
              releaseStartButton({ delayed: false });
              hideBootstrapOverlay();
              return;
            }
            if (retryError && globalScope.console?.error) {
              globalScope.console.error('Embedded bundle recovery failed; renderer cannot continue.', retryError);
            }
          }
          presentCriticalErrorOverlay({
            title: 'Assets failed to load',
            message: 'Critical assets failed to preload. Reload to try again.',
            diagnosticScope: 'assets',
            diagnosticStatus: 'error',
            diagnosticMessage: 'Critical assets failed to preload. Reload to try again.',
            logScope: 'assets',
            logMessage: 'Critical assets failed to preload. Reload to try again.',
            detail: {
              reason: 'asset-preload',
              errorMessage,
              errorName,
              stack: errorStack,
            },
          });
          markBootPhaseError('assets', 'Critical assets failed to preload. Reload to try again.');
          markBootPhaseError('gltf', 'Critical models unavailable — cannot continue.');
          markBootPhaseError('controls', 'Controls disabled until assets load.');
          if (overlayController?.setDiagnostic) {
            overlayController.setDiagnostic('assets', {
              status: 'error',
              message: 'Failed to preload world assets.',
            });
          }
          if (ui.startButton) {
            ui.startButton.disabled = true;
            ui.startButton.setAttribute('data-preloading', 'error');
            if (ui.startButton.dataset.preloadWarning) {
              delete ui.startButton.dataset.preloadWarning;
            }
          }
        });
    } else {
      releaseStartButton({ delayed: false });
      hideBootstrapOverlay();
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('startup', 'Renderer initialised; awaiting player input.', {
        level: 'success',
      });
    }
    if (ui.startButton) {
      markBootPhaseActive('controls', 'Binding control listeners…');
    }
    if (ui.startButton && !ui.startButton.dataset.simpleExperienceBound) {
      ui.startButton.addEventListener('click', (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        const startAction = () => {
          const executeStart = async () => {
            let backendReady = false;
            try {
              backendReady = await ensureBackendLiveCheck();
            } catch (validationError) {
              backendReady = false;
              if (globalScope?.console?.debug) {
                globalScope.console.debug(
                  'Backend live-check rejected; continuing with current leaderboard mode.',
                  validationError,
                );
              }
            }
            experience.apiBaseUrl = backendReady ? identityState.apiBaseUrl : null;
            const result = experience.start();
            if (result && typeof result.then === 'function') {
              return result;
            }
            return result;
          };
          return executeStart().catch((error) => {
            if (globalScope.console?.error) {
              globalScope.console.error('Failed to start gameplay session', error);
            }
            throw error;
          });
        };
        invokeWithErrorBoundary(startAction, {
          boundary: 'experience-start',
          stage: 'experience.start',
          rethrow: false,
          detail: { reason: 'experience-start' },
        });
      });
      ui.startButton.dataset.simpleExperienceBound = 'true';
    }
    if (!ui.startButton) {
      markBootPhaseWarning('controls', 'Start control unavailable. Use Enter/Space to begin.');
    }
    if (ui.startButton) {
      const isAutomationContext = (() => {
        try {
          return Boolean(globalScope?.navigator?.webdriver);
        } catch (error) {
          if (globalScope?.console?.debug) {
            globalScope.console.debug('Failed to detect automation context.', error);
          }
          return false;
        }
      })();
      if (isAutomationContext) {
        const autoStartMarker = 'simpleExperienceAutoStart';
        const autoStartStates = {
          pending: 'pending',
          completed: 'true',
        };
        const markAutoStartPending = () => {
          try {
            if (ui.startButton.dataset[autoStartMarker] !== autoStartStates.completed) {
              ui.startButton.dataset[autoStartMarker] = autoStartStates.pending;
            }
          } catch (error) {
            if (globalScope?.console?.debug) {
              globalScope.console.debug('Failed to flag auto-start as pending.', error);
            }
          }
        };
        const markAutoStartAttempted = () => {
          ui.startButton.dataset[autoStartMarker] = autoStartStates.completed;
        };
        const hasAutoStartRun = () => ui.startButton.dataset[autoStartMarker] === autoStartStates.completed;
        markAutoStartPending();
        const tryTriggerAutoStart = ({ immediate = false } = {}) => {
          if (!immediate) {
            const scheduler =
              typeof globalScope?.setTimeout === 'function'
                ? globalScope.setTimeout.bind(globalScope)
                  : typeof setTimeout === 'function'
                    ? setTimeout
                    : null;
            if (scheduler) {
              scheduler(() => {
                tryTriggerAutoStart({ immediate: true });
              }, 160);
              return false;
            }
          }
          if (!ui.startButton || hasAutoStartRun()) {
            return true;
          }
          const preloadingState = ui.startButton.getAttribute('data-preloading');
          if (ui.startButton.disabled || preloadingState === 'true') {
            return false;
          }
          markAutoStartAttempted();
          try {
            if (typeof ui.startButton.click === 'function') {
              ui.startButton.click();
              return true;
            }
            if (typeof ui.startButton.dispatchEvent === 'function') {
              const clickEvent =
                typeof globalScope?.MouseEvent === 'function'
                  ? new globalScope.MouseEvent('click', { bubbles: true, cancelable: true })
                  : null;
              if (clickEvent) {
                ui.startButton.dispatchEvent(clickEvent);
                return true;
              }
            }
          } catch (error) {
            if (globalScope?.console?.debug) {
              globalScope.console.debug('Automated start trigger failed.', error);
            }
            markAutoStartPending();
            return false;
          }
          return false;
        };
        if (!hasAutoStartRun() && !tryTriggerAutoStart()) {
          let observer = null;
          const cleanupObserver = () => {
            if (observer) {
              try {
                observer.disconnect();
              } catch (error) {
                if (globalScope?.console?.debug) {
                  globalScope.console.debug('Failed to disconnect auto-start observer.', error);
                }
              }
              observer = null;
            }
          };
          const handleMutation = () => {
            if (tryTriggerAutoStart({ immediate: true })) {
              cleanupObserver();
            }
          };
          if (typeof globalScope?.MutationObserver === 'function') {
            observer = new globalScope.MutationObserver(handleMutation);
            try {
              observer.observe(ui.startButton, {
                attributes: true,
                attributeFilter: ['disabled', 'data-preloading'],
              });
            } catch (error) {
              cleanupObserver();
              if (globalScope?.console?.debug) {
                globalScope.console.debug('Failed to observe start button for automation.', error);
              }
            }
          }
          const readyCallbacks = [
            () => {
              if (typeof globalScope?.requestAnimationFrame === 'function') {
                globalScope.requestAnimationFrame(() => {
                  if (!tryTriggerAutoStart({ immediate: true })) {
                    handleMutation();
                  }
                });
              } else if (!tryTriggerAutoStart({ immediate: true })) {
                handleMutation();
              }
            },
            () => {
              const scheduler =
                typeof globalScope?.setTimeout === 'function'
                  ? globalScope.setTimeout.bind(globalScope)
                  : typeof setTimeout === 'function'
                    ? setTimeout
                    : null;
              if (!scheduler) {
                if (!tryTriggerAutoStart({ immediate: true })) {
                  handleMutation();
                }
                return;
              }
              scheduler(() => {
                if (!tryTriggerAutoStart({ immediate: true })) {
                  handleMutation();
                }
              }, 120);
            },
          ];
          readyCallbacks.forEach((callback) => {
            try {
              callback();
            } catch (error) {
              if (globalScope?.console?.debug) {
                globalScope.console.debug('Auto-start readiness callback failed.', error);
              }
            }
          });
        }
      }
    }
    if (ui.landingGuideButton && !ui.landingGuideButton.dataset.simpleExperienceGuideBound) {
      ui.landingGuideButton.addEventListener('click', (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        if (!experience || typeof experience.showFirstRunTutorial !== 'function') {
          return;
        }
        const tutorialAction = () => {
          try {
            const result = experience.showFirstRunTutorial({ markSeenOnDismiss: true, autoFocus: true });
            if (result && typeof result.then === 'function') {
              return result.catch((error) => {
                if (globalScope.console?.error) {
                  globalScope.console.error('Failed to display tutorial overlay', error);
                }
                throw error;
              });
            }
            return result;
          } catch (error) {
            if (globalScope.console?.error) {
              globalScope.console.error('Failed to display tutorial overlay', error);
            }
            throw error;
          }
        };
        invokeWithErrorBoundary(tutorialAction, {
          boundary: 'experience-tutorial',
          stage: 'experience.showFirstRunTutorial',
          rethrow: false,
          detail: { reason: 'experience-tutorial' },
        });
      });
      ui.landingGuideButton.dataset.simpleExperienceGuideBound = 'true';
    }
    if (typeof bootstrapOverlay !== 'undefined' && (!assetPreloadPromise || typeof assetPreloadPromise.then !== 'function')) {
      bootstrapOverlay.hide({ force: true });
    }
    return experience;
  }

  if (globalScope) {
    try {
      const hooks = globalScope.__INFINITE_RAILS_TEST_HOOKS__ || (globalScope.__INFINITE_RAILS_TEST_HOOKS__ = {});
      hooks.ensureSimpleExperience = ensureSimpleExperience;
      hooks.ensureBackendLiveCheck = ensureBackendLiveCheck;
      hooks.performBackendLiveCheck = performBackendLiveCheck;
      hooks.ensureAudioAssetLiveTest = ensureAudioAssetLiveTest;
      hooks.getAudioAssetLiveTestState = () => audioAssetLiveTestState;
      hooks.getAudioSettingsState = () => createAudioSettingsSnapshot();
      hooks.setAudioMuted = (value, options = {}) =>
        setAudioMuted(value, { ...options, source: options.source ?? 'test-hook', persist: options.persist });
      hooks.setAudioChannelVolume = (channel, value, options = {}) =>
        setAudioChannelVolume(channel, value, { ...options, source: options.source ?? 'test-hook', persist: options.persist });
      hooks.resetAudioSettings = (options = {}) =>
        resetAudioSettings({ ...options, source: options.source ?? 'test-hook', persist: options.persist });
      hooks.applyAudioSettingsToExperience = (experience, options = {}) =>
        integrateAudioSettingsWithExperience(experience, { ...options, source: options.source ?? 'test-hook' });
      hooks.bindAudioSettingsControls = (ui) => bindAudioSettingsControls(ui);
      hooks.getIdentityState = () => identityState;
      hooks.getBackendLiveCheckState = () => backendLiveCheckState;
      hooks.activateMissionBriefingFallback = activateMissionBriefingFallback;
      hooks.offerMissionBriefingFallback = offerMissionBriefingFallback;
      hooks.configureInactivityMonitor = (options) => configureInactivityMonitor(options || {});
      hooks.getInactivityMonitorState = () => ({
        enabled: inactivityMonitorState.enabled,
        idleThresholdMs: inactivityMonitorState.idleThresholdMs,
        refreshCountdownMs: inactivityMonitorState.refreshCountdownMs,
        checkIntervalMs: inactivityMonitorState.checkIntervalMs,
        lastActivityAt: inactivityMonitorState.lastActivityAt,
        promptVisible: inactivityMonitorState.promptVisible,
        countdownExpiresAt: inactivityMonitorState.countdownExpiresAt,
        checkHandle: inactivityMonitorState.checkHandle,
        countdownHandle: inactivityMonitorState.countdownHandle,
      });
      hooks.setInactivityLastActivity = (timestamp) => {
        if (Number.isFinite(timestamp)) {
          inactivityMonitorState.lastActivityAt = Number(timestamp);
        }
        return inactivityMonitorState.lastActivityAt;
      };
      hooks.setInactivityCountdownExpiresAt = (timestamp) => {
        if (timestamp === null) {
          inactivityMonitorState.countdownExpiresAt = null;
          return inactivityMonitorState.countdownExpiresAt;
        }
        if (Number.isFinite(timestamp)) {
          inactivityMonitorState.countdownExpiresAt = Number(timestamp);
        }
        return inactivityMonitorState.countdownExpiresAt;
      };
      hooks.runInactivityCheck = () => evaluateInactivity(Date.now());
      hooks.recordInactivityActivity = (source) => recordUserActivity(source);
      hooks.setupInactivityOverlay = () => setupInactivityOverlay(inactivityMonitorState.doc);
      hooks.forceInactivityRefresh = (reason) => triggerInactivityRefresh(reason || 'test');
      hooks.triggerSurvivalWatchdog = (detail = {}, options = {}) => {
        const descriptor = normaliseSurvivalWatchdogDescriptor(
          detail,
          options.stage || detail.stage || null,
        );
        if (options.force === true || shouldTriggerSurvivalWatchdog(descriptor)) {
          return applySurvivalWatchdog(descriptor, { boundary: options.boundary ?? 'test-hook' });
        }
        return false;
      };
      hooks.getSurvivalWatchdogState = () => ({ ...survivalWatchdogState });
      hooks.resetSurvivalWatchdogState = () => {
        survivalWatchdogState.lastResetAt = 0;
        survivalWatchdogState.lastSignature = null;
      };
      hooks.setActiveExperienceInstance = (instance) => {
        activeExperienceInstance = instance || null;
        globalScope.__INFINITE_RAILS_ACTIVE_EXPERIENCE__ = instance || null;
        if (activeExperienceInstance) {
          attachSurvivalWatchdogHooksToExperience(activeExperienceInstance);
        }
        return activeExperienceInstance;
      };
    } catch (hookError) {
      if (globalScope.console?.debug) {
        globalScope.console.debug('Failed to expose ensureSimpleExperience to test hooks.', hookError);
      }
    }
  }

  const DEFAULT_RENDERER_START_TIMEOUT_MS = 5000;
  let simpleFallbackAttempted = false;
  let rendererStartWatchdogHandle = null;
  let rendererStartWatchdogMode = null;
  let missionBriefingFallbackActivated = false;
  let missionBriefingFallbackDetail = null;
  let missionBriefingFallbackStartLabel = null;

  function resolveRendererStartTimeout(config) {
    if (config && typeof config === 'object') {
      const candidates = [
        config.rendererStartTimeoutMs,
        config.rendererStartTimeout,
        config.rendererWatchdogTimeoutMs,
      ];
      for (const candidate of candidates) {
        const parsed = Number.parseInt(candidate, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
    return DEFAULT_RENDERER_START_TIMEOUT_MS;
  }

  function cancelRendererStartWatchdog() {
    const clear =
      (typeof globalScope !== 'undefined' && typeof globalScope.clearTimeout === 'function'
        ? globalScope.clearTimeout
        : typeof clearTimeout === 'function'
          ? clearTimeout
          : null);
    if (rendererStartWatchdogHandle !== null && clear) {
      try {
        clear(rendererStartWatchdogHandle);
      } catch (error) {
        if (globalScope?.console?.debug) {
          globalScope.console.debug('Failed to clear renderer start watchdog timer.', error);
        }
      }
    }
    rendererStartWatchdogHandle = null;
    rendererStartWatchdogMode = null;
  }

  function activateMissionBriefingFallback(options = {}) {
    if (missionBriefingFallbackActivated) {
      return true;
    }
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    const doc = documentRef || scope.document || null;
    if (!doc || typeof doc.getElementById !== 'function') {
      scope.console?.error?.('Mission briefing fallback unavailable — document is not accessible.');
      return false;
    }
    const briefing = doc.getElementById('gameBriefing');
    if (!briefing) {
      scope.console?.error?.('Mission briefing fallback unavailable — #gameBriefing is missing.');
      return false;
    }
    const startButton = doc.getElementById('startButton') ?? null;
    const dismissButton = doc.getElementById('dismissBriefing') ?? null;
    const stepsList = doc.getElementById('gameBriefingSteps') ?? null;
    const briefingContent =
      typeof briefing.querySelector === 'function' ? briefing.querySelector('.game-briefing__content') : null;
    const briefingEyebrow =
      typeof briefing.querySelector === 'function' ? briefing.querySelector('.game-briefing__eyebrow') : null;
    const briefingTitle =
      typeof briefing.querySelector === 'function' ? briefing.querySelector('.game-briefing__title') : null;
    const diagnosticMessage =
      typeof options.diagnosticMessage === 'string' && options.diagnosticMessage.trim().length
        ? options.diagnosticMessage.trim()
        : 'Renderer offline — mission briefing mode is active.';
    const noticeMessage =
      typeof options.notice === 'string' && options.notice.trim().length
        ? options.notice.trim()
        : null;
    if (startButton) {
      if (missionBriefingFallbackStartLabel === null) {
        missionBriefingFallbackStartLabel =
          typeof startButton.textContent === 'string' && startButton.textContent.length
            ? startButton.textContent
            : null;
      }
      startButton.disabled = true;
      if (typeof startButton.setAttribute === 'function') {
        startButton.setAttribute('aria-disabled', 'true');
      }
      startButton.dataset = startButton.dataset || {};
      startButton.dataset.fallbackMode = 'briefing';
      startButton.textContent = 'Renderer offline — mission briefing mode active';
    }
    if (typeof briefing.removeAttribute === 'function') {
      briefing.removeAttribute('hidden');
    }
    briefing.hidden = false;
    briefing.dataset = briefing.dataset || {};
    briefing.dataset.fallbackMode = 'briefing';
    if (briefing.classList?.add) {
      briefing.classList.add('is-visible');
    }
    if (briefingEyebrow) {
      briefingEyebrow.textContent = 'Mission Briefing — Text Mode';
    }
    if (briefingTitle) {
      briefingTitle.textContent = 'Renderer Offline — Review Objectives';
    }
    if (briefingContent && typeof doc.createElement === 'function') {
      let fallbackNotice = doc.getElementById('gameBriefingFallbackNotice');
      if (!fallbackNotice) {
        fallbackNotice = doc.createElement('p');
        if (fallbackNotice) {
          fallbackNotice.id = 'gameBriefingFallbackNotice';
          fallbackNotice.className = 'game-briefing__fallback';
          if (briefingContent.firstChild) {
            briefingContent.insertBefore(fallbackNotice, briefingContent.firstChild);
          } else {
            briefingContent.appendChild(fallbackNotice);
          }
        }
      }
      if (fallbackNotice) {
        fallbackNotice.textContent =
          noticeMessage ??
          'Renderer systems are offline. Review the mission briefing and objectives while diagnostics continue.';
      }
    }
    if (stepsList && Array.isArray(options.additionalSteps) && options.additionalSteps.length) {
      try {
        while (stepsList.firstChild) {
          stepsList.removeChild(stepsList.firstChild);
        }
        options.additionalSteps.forEach((step) => {
          if (typeof step !== 'string' || !step.trim().length) {
            return;
          }
          if (typeof doc.createElement === 'function') {
            const item = doc.createElement('li');
            if (item) {
              item.textContent = step.trim();
              stepsList.appendChild(item);
            }
          }
        });
      } catch (error) {
        scope.console?.debug?.('Failed to update mission briefing fallback steps.', error);
      }
    }
    if (dismissButton) {
      dismissButton.textContent = 'Reload and Retry Renderer';
      dismissButton.dataset = dismissButton.dataset || {};
      if (!dismissButton.dataset.lowFidelityBound && typeof dismissButton.addEventListener === 'function') {
        dismissButton.addEventListener('click', (event) => {
          if (event?.preventDefault) {
            event.preventDefault();
          }
          const locationRef = scope?.location ?? null;
          if (locationRef && typeof locationRef.reload === 'function') {
            try {
              locationRef.reload();
            } catch (reloadError) {
              scope.console?.error?.('Failed to reload the page from mission briefing fallback.', reloadError);
            }
          }
        });
        dismissButton.dataset.lowFidelityBound = 'true';
      }
    }
    const canvas = doc.getElementById('gameCanvas');
    if (canvas) {
      if (typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('aria-hidden', 'true');
      }
      canvas.style = canvas.style || {};
      canvas.style.display = 'none';
    }
    if (doc.body?.setAttribute) {
      doc.body.setAttribute('data-renderer-mode', 'briefing');
      doc.body.setAttribute('data-low-fidelity-mode', 'briefing');
    }
    if (doc.documentElement?.setAttribute) {
      doc.documentElement.setAttribute('data-renderer-mode', 'briefing');
    }
    setRendererModeIndicator('briefing');
    const state = scope.__INFINITE_RAILS_STATE__ || (scope.__INFINITE_RAILS_STATE__ = {});
    try {
      state.rendererMode = 'briefing';
      state.isRunning = false;
      state.reason = options.reason || 'mission-briefing-fallback';
      state.updatedAt = Date.now();
    } catch (error) {
      scope.console?.debug?.('Failed to record mission briefing fallback state.', error);
    }
    scope.__MISSION_BRIEFING_FALLBACK_ACTIVE__ = true;
    missionBriefingFallbackActivated = true;
    missionBriefingFallbackDetail = {
      reason: options.reason || null,
      context:
        options.context && typeof options.context === 'object' ? { ...options.context } : undefined,
      diagnosticMessage,
      timestamp: Date.now(),
    };
    if (typeof bootstrapOverlay !== 'undefined') {
      try {
        if (typeof bootstrapOverlay.setDiagnostic === 'function') {
          bootstrapOverlay.setDiagnostic('renderer', {
            status: 'warning',
            message: diagnosticMessage,
          });
        }
        if (typeof bootstrapOverlay.setRecoveryAction === 'function') {
          bootstrapOverlay.setRecoveryAction(null);
        }
      } catch (overlayError) {
        scope.console?.debug?.('Failed to update bootstrap overlay for mission briefing fallback.', overlayError);
      }
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('startup', 'Mission briefing fallback activated.', {
        level: 'warning',
        detail: {
          reason: options.reason || 'mission-briefing-fallback',
          context:
            options.context && typeof options.context === 'object' ? { ...options.context } : undefined,
          diagnosticMessage,
        },
      });
    } else {
      scope.console?.warn?.('Mission briefing fallback activated.');
    }
    return true;
  }

  function offerMissionBriefingFallback(options = {}) {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    const overlay = typeof bootstrapOverlay !== 'undefined' ? bootstrapOverlay : null;
    const reason =
      typeof options.reason === 'string' && options.reason.trim().length
        ? options.reason.trim()
        : 'mission-briefing-fallback';
    const contextDetail =
      options.context && typeof options.context === 'object' ? { ...options.context } : undefined;
    const errorDetail = options.error instanceof Error ? options.error : null;
    const noticeMessage =
      typeof options.notice === 'string' && options.notice.trim().length
        ? options.notice.trim()
        : null;
    const diagnosticMessage =
      typeof options.diagnosticMessage === 'string' && options.diagnosticMessage.trim().length
        ? options.diagnosticMessage.trim()
        : 'Renderer unavailable — mission briefing mode is available.';
    const detail = {
      fallbackMode: 'briefing',
      reason,
    };
    if (contextDetail) {
      detail.context = contextDetail;
    }
    if (errorDetail) {
      detail.errorMessage = errorDetail.message;
      detail.errorName = errorDetail.name;
    }
    scope.__MISSION_BRIEFING_FALLBACK_AVAILABLE__ = true;
    let offered = false;
    if (overlay && typeof overlay.setRecoveryAction === 'function') {
      try {
        overlay.setRecoveryAction({
          label: 'Open Mission Briefing Mode',
          description: 'Displays the text-based mission briefing so you can continue without WebGL rendering.',
          action: 'open-mission-briefing',
          onSelect: () => {
            if (typeof logDiagnosticsEvent === 'function') {
              logDiagnosticsEvent('startup', 'Player launched mission briefing fallback.', {
                level: 'info',
                detail: { ...detail, trigger: 'player-selection' },
              });
            }
            const activated = activateMissionBriefingFallback({
              reason: `${reason}:selected`,
              context: contextDetail,
              notice: noticeMessage,
              diagnosticMessage,
            });
            if (activated && overlay && typeof overlay.hide === 'function') {
              try {
                overlay.hide({ force: true });
              } catch (hideError) {
                scope.console?.debug?.(
                  'Failed to hide bootstrap overlay after mission briefing fallback activation.',
                  hideError,
                );
              }
            }
          },
        });
        offered = true;
      } catch (overlayError) {
        scope.console?.debug?.('Failed to register mission briefing fallback recovery action.', overlayError);
      }
    }
    if (overlay && typeof overlay.setDiagnostic === 'function') {
      try {
        overlay.setDiagnostic('renderer', {
          status: 'warning',
          message: diagnosticMessage,
        });
      } catch (overlayError) {
        scope.console?.debug?.('Failed to update renderer diagnostic for mission briefing fallback.', overlayError);
      }
    }
    if (!offered) {
      offered = activateMissionBriefingFallback({
        reason: `${reason}:auto`,
        context: contextDetail,
        notice: noticeMessage,
        diagnosticMessage,
      });
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('startup', 'Offering mission briefing fallback.', {
        level: 'warning',
        detail: {
          ...detail,
          diagnosticMessage,
        },
      });
    } else {
      scope.console?.warn?.('Offering mission briefing fallback.', detail);
    }
    return offered;
  }

  function scheduleRendererStartWatchdog(mode) {
    if (mode !== 'advanced') {
      cancelRendererStartWatchdog();
      return;
    }
    const set =
      (typeof globalScope !== 'undefined' && typeof globalScope.setTimeout === 'function'
        ? globalScope.setTimeout
        : typeof setTimeout === 'function'
          ? setTimeout
          : null);
    if (!set) {
      return;
    }
    cancelRendererStartWatchdog();
    const config = globalScope.APP_CONFIG || (globalScope.APP_CONFIG = {});
    const timeout = resolveRendererStartTimeout(config);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return;
    }
    rendererStartWatchdogMode = mode;
    rendererStartWatchdogHandle = set(() => {
      rendererStartWatchdogHandle = null;
      rendererStartWatchdogMode = null;
      if (simpleFallbackAttempted) {
        return;
      }
      const warningMessage =
        'Advanced renderer start timed out — enabling safe mode (simplified sandbox).';
      const triggeredAt = Date.now();
      const fallbackDetail = {
        reason: 'renderer-timeout',
        mode: 'advanced',
        source: 'watchdog',
        stage: 'startup.watchdog',
        timeoutMs: timeout,
        timestamp: triggeredAt,
      };
      if (globalScope?.console?.warn) {
        globalScope.console.warn(warningMessage, { detail: fallbackDetail });
      }
      if (typeof logDiagnosticsEvent === 'function') {
        try {
          logDiagnosticsEvent('startup', warningMessage, {
            level: 'warning',
            detail: fallbackDetail,
            timestamp: triggeredAt,
          });
        } catch (loggingError) {
          globalScope?.console?.debug?.(
            'Renderer watchdog diagnostics logging failed.',
            loggingError,
          );
        }
      }
      const overlay = typeof bootstrapOverlay !== 'undefined' ? bootstrapOverlay : null;
      if (overlay && typeof overlay.setDiagnostic === 'function') {
        try {
          overlay.setDiagnostic('renderer', {
            status: 'warning',
            message: 'Advanced renderer timed out. Launching simplified safe mode.',
            detail: fallbackDetail,
          });
        } catch (overlayError) {
          globalScope?.console?.debug?.(
            'Failed to update renderer diagnostic after start timeout.',
            overlayError,
          );
        }
      }
      if (typeof tryStartSimpleFallback === 'function') {
        const timeoutError = new Error('Advanced renderer start timed out.');
        try {
          tryStartSimpleFallback(timeoutError, {
            ...fallbackDetail,
          });
        } catch (fallbackError) {
          if (globalScope?.console?.debug) {
            globalScope.console.debug('Renderer watchdog fallback failed to start.', fallbackError);
          }
        }
      }
    }, timeout);
  }

  function getRendererStartWatchdogState() {
    return {
      handle: rendererStartWatchdogHandle,
      mode: rendererStartWatchdogMode,
    };
  }

  function applySimpleFallbackConfig(config) {
    if (!config || typeof config !== 'object') {
      return;
    }
    config.forceSimpleMode = true;
    config.enableAdvancedExperience = false;
    config.preferAdvanced = false;
    config.forceAdvanced = false;
    config.defaultMode = 'simple';
  }

  function resolveSimpleFallbackMessaging(reason) {
    const normalised = typeof reason === 'string' ? reason.trim().toLowerCase() : '';
    const base = {
      loadingMessage: 'Attempting simplified renderer fallback…',
      noticeMessage: 'Falling back to the simple renderer after a bootstrap failure.',
      logMessage: 'Falling back to the simple renderer after a bootstrap failure.',
      diagnosticMessage: 'Simple renderer engaged after a bootstrap failure.',
    };
    switch (normalised) {
      case 'renderer-timeout':
        return {
          loadingMessage: 'Advanced renderer timed out. Booting simplified safe mode…',
          noticeMessage: 'Advanced renderer timed out — launching simplified safe mode.',
          logMessage: 'Advanced renderer start timed out — switched to sandbox simplified safe mode.',
          diagnosticMessage: 'Advanced renderer timed out, so sandbox mode is active.',
        };
      case 'renderer-failure':
        return {
          loadingMessage: 'Advanced renderer failed. Switching to sandbox mode…',
          noticeMessage: 'Advanced renderer failure detected — sandbox renderer engaged.',
          logMessage: 'Advanced renderer failure detected — switched to sandbox renderer.',
          diagnosticMessage: 'Advanced renderer failed, so sandbox renderer is active.',
        };
      case 'ensurethree-failure':
        return {
          loadingMessage: 'Renderer dependency failed. Switching to sandbox mode…',
          noticeMessage: 'Renderer dependency failed — sandbox renderer engaged.',
          logMessage: 'Renderer dependency failure detected — switched to sandbox renderer.',
          diagnosticMessage: 'Renderer dependency failed, so sandbox renderer is active.',
        };
      default:
        return base;
    }
  }

  function startSimpleFallbackBootstrap(scope, error, context) {
    simpleFallbackAttempted = true;
    const config = scope.APP_CONFIG || (scope.APP_CONFIG = {});
    applySimpleFallbackConfig(config);
    const fallbackReason =
      typeof context?.reason === 'string' && context.reason.trim().length
        ? context.reason.trim()
        : '';
    const fallbackMessages = resolveSimpleFallbackMessaging(fallbackReason);
    if (typeof queueBootstrapFallbackNotice === 'function') {
      const noticeReason =
        fallbackReason.length > 0 ? `forced-simple-mode:${fallbackReason}` : 'forced-simple-mode';
      queueBootstrapFallbackNotice(noticeReason, fallbackMessages.noticeMessage);
    }
    if (typeof bootstrapOverlay !== 'undefined' && typeof bootstrapOverlay.setDiagnostic === 'function') {
      try {
        bootstrapOverlay.setDiagnostic('renderer', {
          status: 'warning',
          message: fallbackMessages.diagnosticMessage,
        });
      } catch (overlayError) {
        scope.console?.debug?.('Failed to update bootstrap diagnostics for simple fallback.', overlayError);
      }
    }
    if (typeof logDiagnosticsEvent === 'function') {
      const detail = context && typeof context === 'object' ? { ...context } : undefined;
      if (detail && error instanceof Error && typeof detail.errorMessage !== 'string') {
        detail.errorMessage = error.message;
      }
      logDiagnosticsEvent('startup', fallbackMessages.logMessage, {
        level: 'warning',
        detail,
      });
    }
    const navigationTriggered = ensureSimpleModeQueryParam(scope);
    if (navigationTriggered) {
      return true;
    }
    const handleBootstrapFailure = (bootstrapError) => {
      if (scope.console?.error) {
        scope.console.error('Simple fallback bootstrap failed.', bootstrapError);
      }
      const fallbackFailureDetail = {
        errorMessage:
          typeof bootstrapError?.message === 'string' && bootstrapError.message.trim().length
            ? bootstrapError.message.trim()
            : undefined,
        errorName:
          typeof bootstrapError?.name === 'string' && bootstrapError.name.trim().length
            ? bootstrapError.name.trim()
            : undefined,
        reason: 'simple-fallback-bootstrap',
      };
      if (context && typeof context === 'object' && Object.keys(context).length) {
        fallbackFailureDetail.context = { ...context };
      }
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', 'Simple fallback bootstrap failed.', {
          level: 'error',
          detail: fallbackFailureDetail,
        });
      }
      handleErrorBoundary(bootstrapError, {
        boundary: 'bootstrap',
        stage: 'simple-fallback.bootstrap',
        title: 'Fallback bootstrap failed',
        userMessage: 'Fallback renderer failed to start. Reload to try again.',
        diagnosticMessage: 'Simple fallback bootstrap failed.',
        logMessage: 'Simple fallback bootstrap failed.',
        detail: fallbackFailureDetail,
        rethrow: false,
      });
      offerMissionBriefingFallback({
        reason: 'simple-fallback-bootstrap-failed',
        context: fallbackFailureDetail,
        error: bootstrapError,
      });
      return false;
    };
    try {
      if (typeof scope.bootstrap === 'function') {
        const bootstrapResult = scope.bootstrap();
        if (bootstrapResult && typeof bootstrapResult.then === 'function') {
          bootstrapResult.catch((bootstrapError) => {
            handleBootstrapFailure(bootstrapError);
          });
        }
      }
    } catch (bootstrapError) {
      return handleBootstrapFailure(bootstrapError);
    }
    return true;
  }

  function tryStartSimpleFallback(error, context = {}) {
    cancelRendererStartWatchdog();
    if (simpleFallbackAttempted) {
      return false;
    }
    if (typeof bootstrapOverlay !== 'undefined') {
      const fallbackReason =
        typeof context?.reason === 'string' && context.reason.trim().length
          ? context.reason.trim()
          : '';
      const fallbackMessages = resolveSimpleFallbackMessaging(fallbackReason);
      const loadingMessage = fallbackMessages.loadingMessage;
      bootstrapOverlay.showLoading({
        message: loadingMessage,
      });
    }
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    scope.__LAST_FALLBACK_CONTEXT__ = { error: error?.message ?? null, context };
    if (context?.reason === 'ensureThree-failure' && scope.console?.warn) {
      scope.console.warn('Three.js failed to load. Switching to simplified renderer.', {
        error,
        context,
      });
    } else if (context?.reason === 'renderer-timeout' && scope.console?.warn) {
      scope.console.warn('Advanced renderer start timed out. Switching to simplified renderer.', {
        error,
        context,
      });
    } else if (context?.reason === 'renderer-failure' && scope.console?.warn) {
      scope.console.warn('Advanced renderer failure detected. Switching to sandbox (simplified) renderer.', {
        error,
        context,
      });
    }
    const hasSimpleExperience = Boolean(scope.SimpleExperience?.create);
    if (!hasSimpleExperience) {
      if (scope.console?.error) {
        scope.console.error('Simple experience unavailable; cannot start fallback renderer.', {
          error,
          context,
        });
      }
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', 'Simple experience unavailable; cannot start fallback renderer.', {
          level: 'error',
          detail: context && typeof context === 'object' ? { ...context } : undefined,
        });
      }
      if (typeof bootstrapOverlay !== 'undefined') {
        bootstrapOverlay.showError({
          title: 'Renderer unavailable',
          message:
            'Fallback renderer is unavailable. Launch mission briefing mode or reload the page to retry.',
        });
        bootstrapOverlay.setDiagnostic('renderer', {
          status: 'error',
          message: 'Fallback renderer is unavailable. Mission briefing mode can continue without WebGL.',
        });
      }
      offerMissionBriefingFallback({
        reason: 'simple-experience-unavailable',
        context,
        error,
      });
      return false;
    }
    return startSimpleFallbackBootstrap(scope, error, context);
  }

  function createScoreboardUtilsFallback() {
    return internalCreateScoreboardUtilsFallback();
  }

  async function bootstrap() {
    return invokeWithErrorBoundary(
      async () => {
        const scope =
          typeof globalScope !== 'undefined'
            ? globalScope
            : typeof window !== 'undefined'
              ? window
              : globalThis;
        const startSimple = shouldStartSimpleMode();
        const mode = startSimple ? 'simple' : 'advanced';
        setRendererModeIndicator(mode);
        scheduleRendererStartWatchdog(mode);
        const locationProtocol = typeof scope?.location?.protocol === 'string' ? scope.location.protocol.toLowerCase() : '';
        const runningFromFileProtocol = locationProtocol === 'file:';
        if (runningFromFileProtocol) {
          markManifestAssetCheckSkipped('offline-mode');
        } else if (typeof startManifestAssetAvailabilityCheck === 'function') {
          try {
            startManifestAssetAvailabilityCheck();
          } catch (error) {
            if (scope.console?.debug) {
              scope.console.debug('Failed to initiate manifest asset availability check during bootstrap.', error);
            }
          }
        }
        if (startSimple) {
          try {
            await ensureRendererModule('simple', { mode: 'simple', reason: 'bootstrap' });
          } catch (error) {
            scope.console?.debug?.('Failed to load simple renderer module during bootstrap.', error);
          }
        } else {
          try {
            await ensureRendererModule('advanced', { mode: 'advanced', reason: 'bootstrap' });
          } catch (error) {
            scope.console?.debug?.('Failed to prepare advanced renderer module during bootstrap.', error);
          }
        }
        if (scope.SimpleExperience?.create) {
          return ensureSimpleExperience(mode);
        }
        const missingEntryError = new Error('SimpleExperience bootstrap entrypoint unavailable.');
        if (scope.console?.error) {
          scope.console.error('Simple experience entrypoint missing during bootstrap.', missingEntryError);
        }
        handleErrorBoundary(missingEntryError, {
          boundary: 'bootstrap',
          stage: 'bootstrap.simpleExperienceUnavailable',
          title: 'Renderer unavailable',
          userMessage: 'Renderer entrypoint is missing from the build output. Reload to try again.',
          diagnosticMessage: 'Renderer entrypoint unavailable during bootstrap.',
          logMessage: 'Renderer entrypoint unavailable during bootstrap.',
          detail: { reason: 'simple-experience-unavailable' },
          rethrow: false,
        });
        return null;
      },
      {
        boundary: 'bootstrap',
        stage: 'bootstrap',
      },
    );
  }

  function setupSimpleExperienceIntegrations() {
    return {
      identity: { ...identityState.identity },
      applyIdentity,
      input: {
        get mode() {
          return inputModeState.mode || 'pointer';
        },
        get touchPreferred() {
          return (inputModeState.mode || 'pointer') === 'touch';
        },
        get mobileControlsActive() {
          return (inputModeState.mode || 'pointer') === 'touch';
        },
        getSnapshot() {
          return getInputModeSnapshot({});
        },
        subscribe(listener) {
          return subscribeToInputMode(listener);
        },
      },
    };
  }

  const storedSnapshot = loadStoredIdentitySnapshot();
  const initialIdentity = storedSnapshot ? mapSnapshotToIdentity(storedSnapshot) : createAnonymousIdentity(null);
  identityState.identity = initialIdentity;

  const initialScoreboardMessage = (() => {
    if (apiBaseInvalid) {
      return 'Configured API endpoint is invalid. Using local leaderboard entries until it is updated.';
    }
    if (apiBaseUrl) {
      if (initialIdentity?.googleId) {
        const name =
          typeof initialIdentity.name === 'string' && initialIdentity.name.trim().length
            ? initialIdentity.name.trim()
            : 'Explorer';
        return `Signed in as ${name}. Validating leaderboard service…`;
      }
      return 'Validating leaderboard service…';
    }
    if (initialIdentity?.googleId) {
      return `Signed in as ${initialIdentity.name}. Offline mode — storing runs locally.`;
    }
    return 'Offline mode active — storing scores locally.';
  })();
  const skipBootstrapForTests = Boolean(globalScope?.__INFINITE_RAILS_TEST_SKIP_BOOTSTRAP__);
  if (skipBootstrapForTests) {
    globalScope.bootstrap = bootstrap;
    return;
  }
  updateScoreboardStatus(initialScoreboardMessage);
  applyIdentity(initialIdentity, { persist: false, silent: true });

  ensureAudioAssetLiveTest().catch((error) => {
    globalScope?.console?.debug?.('Audio asset live test promise rejected.', error);
  });

  if (identityState.configuredApiBaseUrl) {
    ensureBackendLiveCheck().catch((error) => {
      globalScope?.console?.debug?.('Backend live-check promise rejected.', error);
    });
  }

  fallbackSigninButtons.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      handleFallbackSignin();
    });
  });

  signOutButtons.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      handleSignOut();
    });
  });

  if (documentRef) {
    documentRef.addEventListener('visibilitychange', () => {
      if (documentRef.visibilityState === 'hidden') {
        persistIdentitySnapshot(identityState.identity);
      }
    });
  }

  if (typeof globalScope.addEventListener === 'function') {
    globalScope.addEventListener('beforeunload', () => {
      persistIdentitySnapshot(identityState.identity);
    });
  }

  initialiseGoogleSignIn();
  if (typeof globalScope.addEventListener === 'function') {
    globalScope.addEventListener('load', () => {
      if (!identityState.googleInitialized && !identityState.googleError) {
        initialiseGoogleSignIn();
      }
    });
  }

  const identityApi = {
    get state() {
      return identityState;
    },
    getIdentity() {
      return { ...identityState.identity };
    },
    setIdentity(value, options = {}) {
      applyIdentity(value || {}, { ...options, reason: options.reason ?? 'external-set' });
    },
    clearIdentity() {
      applyIdentity(createAnonymousIdentity(identityState.identity), { reason: 'sign-out' });
    },
    refreshGoogleSignIn() {
      identityState.googleError = null;
      identityState.googleInitialized = false;
      identityState.googleReady = false;
      googleButtonContainers.forEach((container) => {
        container.innerHTML = '';
        container.hidden = true;
      });
      fallbackSigninButtons.forEach((btn) => {
        btn.hidden = false;
      });
      googleInitPromise = null;
      initialiseGoogleSignIn();
    },
    setScoreboardStatus(message, options = {}) {
      updateScoreboardStatus(message, options);
    },
  };

  globalScope.InfiniteRailsIdentity = identityApi;
  if (!globalScope.InfiniteRails) {
    globalScope.InfiniteRails = {};
  }
  if (!globalScope.InfiniteRails.identity) {
    globalScope.InfiniteRails.identity = identityApi;
  }
  const debugApi = globalScope.InfiniteRails.debug || {};
  debugApi.isEnabled = () => isDebugModeEnabled();
  debugApi.setEnabled = (value, options = {}) =>
    setDebugModeEnabled(Boolean(value), { ...options, source: options.source ?? 'api' });
  debugApi.toggle = (options = {}) => toggleDebugMode({ ...options, source: options.source ?? 'api' });
  debugApi.onChange = addDebugModeChangeListener;
  debugApi.getState = () => ({ enabled: isDebugModeEnabled() });
  globalScope.InfiniteRails.debug = debugApi;

  const developerStatsApi = globalScope.InfiniteRails.developerStats || {};
  developerStatsApi.isEnabled = () => developerStatsState.enabled;
  developerStatsApi.setEnabled = (value, options = {}) =>
    setDeveloperStatsEnabled(Boolean(value), { ...options, source: options.source ?? 'api' });
  developerStatsApi.toggle = (options = {}) =>
    toggleDeveloperStats({ ...options, source: options.source ?? 'api' });
  developerStatsApi.getState = () => ({ enabled: developerStatsState.enabled });
  developerStatsApi.getMetrics = () => {
    const metrics = collectDeveloperMetrics();
    if (!metrics) {
      return {
        fps: null,
        models: null,
        textures: null,
        audio: null,
        assets: { pending: null, failures: null },
        scene: { sceneChildren: null, worldChildren: null, terrainMeshes: null, actorCount: null },
      };
    }
    return {
      fps: metrics.fps,
      models: metrics.models,
      textures: metrics.textures,
      audio: metrics.audio,
      assets: metrics.assets,
      scene: metrics.scene,
    };
  };
  developerStatsApi.onChange = addDeveloperStatsChangeListener;
  globalScope.InfiniteRails.developerStats = developerStatsApi;

  const diagnosticsApi = globalScope.InfiniteRails.diagnostics || {};
  diagnosticsApi.isEnabled = () => isDebugModeEnabled() && liveDiagnosticsState.enabled;
  diagnosticsApi.setEnabled = (value, options = {}) =>
    setLiveDiagnosticsEnabled(Boolean(value), { ...options, source: options.source ?? 'api' });
  diagnosticsApi.toggle = (options = {}) =>
    toggleLiveDiagnostics({ ...options, source: options.source ?? 'api' });
  diagnosticsApi.clear = () => clearLiveDiagnosticsEntries();
  diagnosticsApi.record = (type, message, detail, options = {}) =>
    recordLiveDiagnostic(type, message, detail, options);
  diagnosticsApi.getEntries = () => getLiveDiagnosticsEntriesSnapshot();
  globalScope.InfiniteRails.diagnostics = diagnosticsApi;

  const bootDiagnosticsApi = globalScope.InfiniteRails.bootDiagnostics || {};
  bootDiagnosticsApi.update = (snapshot) => updateBootDiagnosticsPanel(snapshot);
  bootDiagnosticsApi.getSnapshot = () => cloneBootDiagnosticsSnapshot(bootDiagnosticsState.lastSnapshot);
  bootDiagnosticsApi.onUpdate = (listener) => addBootDiagnosticsChangeListener(listener);
  bootDiagnosticsApi.downloadReport = () => downloadDiagnosticsReport();
  bootDiagnosticsApi.getErrorSummary = () => summariseBootDiagnosticErrors(bootDiagnosticsState.lastSnapshot);
  bootDiagnosticsApi.getManifestAssetCheckState = () => cloneManifestAssetCheckState();
  bootDiagnosticsApi.startManifestAssetAvailabilityCheck = (options = {}) =>
    startManifestAssetAvailabilityCheck(options);
  globalScope.InfiniteRails.bootDiagnostics = bootDiagnosticsApi;

  const assetsApi = globalScope.InfiniteRails.assets || {};
  assetsApi.refreshTextures = (options = {}) => {
    const instance = activeExperienceInstance;
    if (!instance || typeof instance.refreshTexturePack !== 'function') {
      const error = new Error('Texture refresh unavailable — renderer inactive.');
      if (globalScope.console?.warn) {
        globalScope.console.warn('Texture refresh unavailable — renderer inactive.', error);
      }
      return Promise.reject(error);
    }
    try {
      const payload = { ...options };
      if (!payload.source) {
        payload.source = 'api';
      }
      return Promise.resolve(instance.refreshTexturePack(payload));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  globalScope.InfiniteRails.assets = assetsApi;
  if (typeof globalScope.InfiniteRails.refreshTextures !== 'function') {
    globalScope.InfiniteRails.refreshTextures = (options = {}) => assetsApi.refreshTextures(options);
  }

  if (typeof globalScope.addEventListener === 'function') {
    globalScope.addEventListener(
      'error',
      (event) => {
        if (!event) {
          return;
        }
        const runtimeError =
          event.error instanceof Error
            ? event.error
            : new Error(
                typeof event.message === 'string' && event.message.trim().length
                  ? event.message.trim()
                  : 'Unhandled runtime error.',
              );
        const detail = {
          reason: 'global-error',
          message:
            typeof event.message === 'string' && event.message.trim().length
              ? event.message.trim()
              : undefined,
          filename:
            typeof event.filename === 'string' && event.filename.trim().length
              ? event.filename.trim()
              : undefined,
          lineno: Number.isFinite(event.lineno) ? event.lineno : undefined,
          colno: Number.isFinite(event.colno) ? event.colno : undefined,
        };
        handleErrorBoundary(runtimeError, {
          boundary: 'runtime',
          stage: 'window.error',
          detail,
          rethrow: false,
        });
      },
      { capture: true },
    );
    globalScope.addEventListener(
      'unhandledrejection',
      (event) => {
        if (!event) {
          return;
        }
        const reason = event.reason;
        let rejectionError = reason instanceof Error ? reason : null;
        if (!rejectionError) {
          const description =
            typeof reason === 'string' && reason.trim().length
              ? reason.trim()
              : 'Unhandled promise rejection occurred.';
          rejectionError = new Error(description);
        }
        const detail = { reason: 'unhandledrejection' };
        if (reason && typeof reason === 'object') {
          if (typeof reason.message === 'string' && reason.message.trim().length) {
            detail.message = reason.message.trim();
          }
          if (typeof reason.name === 'string' && reason.name.trim().length) {
            detail.name = reason.name.trim();
          }
          try {
            detail.serialised = JSON.parse(JSON.stringify(reason));
          } catch (serializationError) {
            detail.serialised = undefined;
          }
        } else if (typeof reason !== 'undefined') {
          detail.value = reason;
        }
        handleErrorBoundary(rejectionError, {
          boundary: 'runtime',
          stage: 'window.unhandledrejection',
          detail,
          rethrow: false,
        });
        if (typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
      },
      { capture: true },
    );
  }

  globalScope.bootstrap = bootstrap;

  synchroniseBootstrapWithExistingState();

  markBootPhaseOk('script', 'Bootstrap script ready.');

  const skipAdvancedBootstrap = runWebglPreflightCheck();

  function handleBootstrapResult(result) {
    if (result && typeof result.then === 'function') {
      result.catch((error) => {
        globalScope?.console?.debug?.('Bootstrap promise rejected.', error);
      });
    }
  }

  if (skipAdvancedBootstrap) {
    handleBootstrapResult(bootstrap());
  } else {
    ensureThree()
      .then(() => {
        handleBootstrapResult(bootstrap());
      })
      .catch((error) => {
        reportThreeLoadFailure(error, { reason: 'ensureThree-rejection' });
        if (!simpleFallbackAttempted) {
          tryStartSimpleFallback(error, { reason: 'ensureThree-failure' });
        }
      });
  }
})();
