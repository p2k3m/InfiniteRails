(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const documentRef = globalScope.document ?? null;

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
      backend: { status: 'pending', message: 'Checking leaderboard service…' },
    };
    const DIAGNOSTIC_TYPES = Object.keys(diagnosticsState);
    const diagnosticsLogState = {
      entries: [],
      limit: 60,
      counter: 0,
    };

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
        acc[type] = { container, statusEl };
        return acc;
      }, {});
      return {
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
      };
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

    function updateDiagnosticsElements(elements = null) {
      const doc = elements ? null : getDocument();
      const refs = elements || getElements(doc);
      if (!refs?.diagnosticsRoot) {
        return;
      }
      DIAGNOSTIC_TYPES.forEach((type) => {
        const current = diagnosticsState[type] || {};
        const container = refs.diagnosticItems?.[type]?.container || null;
        const statusEl = refs.diagnosticItems?.[type]?.statusEl || null;
        if (container) {
          container.setAttribute('data-status', current.status || 'pending');
        }
        if (statusEl) {
          statusEl.textContent = current.message || '';
        }
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

    function setDiagnostic(type, update = {}) {
      if (!type || !DIAGNOSTIC_TYPES.includes(type)) {
        return diagnosticsState;
      }
      const existing = diagnosticsState[type] || {};
      const next = {
        status: typeof update.status === 'string' && update.status.trim().length ? update.status.trim() : existing.status,
        message:
          typeof update.message === 'string' && update.message.trim().length
            ? update.message.trim()
            : existing.message,
      };
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
      refreshDiagnostics() {
        updateDiagnosticsElements();
        updateLogElements();
      },
      get diagnostics() {
        return { ...diagnosticsState };
      },
      logEvent(scope, message, options = {}) {
        appendLogEntry({
          scope,
          message,
          level: options.level,
          detail: options.detail,
          timestamp: options.timestamp,
        });
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

  bootstrapOverlay.showLoading();

  function logDiagnosticsEvent(scope, message, { level = 'info', detail = null, timestamp = null } = {}) {
    if (!bootstrapOverlay || typeof bootstrapOverlay.logEvent !== 'function') {
      return;
    }
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
    bootstrapOverlay.logEvent(scope, message, payload);
  }

  function formatAssetLogLabel(detail) {
    const kind = typeof detail?.kind === 'string' && detail.kind.trim().length ? detail.kind.trim() : 'asset';
    const key = typeof detail?.key === 'string' && detail.key.trim().length ? detail.key.trim() : null;
    return key ? `${kind}:${key}` : kind;
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

  if (typeof globalScope?.addEventListener === 'function') {
    globalScope.addEventListener('infinite-rails:started', (event) => {
      bootstrapOverlay.setDiagnostic('renderer', {
        status: 'ok',
        message: 'Renderer initialised successfully.',
      });
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'ok',
        message: 'World assets loaded.',
      });
      bootstrapOverlay.hide({ force: true });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', 'Renderer initialised successfully.', {
          level: 'success',
          detail: event?.detail && typeof event.detail === 'object' ? event.detail : null,
          timestamp: Number.isFinite(event?.detail?.timestamp) ? event.detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:renderer-failure', (event) => {
      const detail =
        event?.detail && typeof event.detail === 'object' ? { ...event.detail } : {};
      if (typeof detail.message !== 'string' || !detail.message.trim().length) {
        detail.message = 'Renderer unavailable. Reload to try again.';
      }
      lastRendererFailureDetail = detail;
      bootstrapOverlay.showError({
        title: 'Renderer unavailable',
        message: formatRendererFailureMessage(detail),
      });
      bootstrapOverlay.setDiagnostic('renderer', {
        status: 'error',
        message: formatRendererFailureMessage(detail),
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', formatRendererFailureMessage(detail), {
          level: 'error',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
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
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'warning',
        message: friendly,
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', friendly, {
          level: 'error',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-recovery-prompt', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const message =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Critical assets failed to load after multiple attempts. Reload or retry to continue.';
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'error',
        message,
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', message, {
          level: 'error',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-recovery-prompt-update', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const message =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Retrying missing assets — results pending.';
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'error',
        message,
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', message, {
          level: 'error',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:asset-retry-requested', () => {
      bootstrapOverlay.setDiagnostic('assets', {
        status: 'pending',
        message: 'Retrying missing assets…',
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', 'Retrying missing assets…', {
          level: 'info',
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
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('assets', 'Reload requested to restore missing assets.', {
          level: 'error',
        });
      }
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
    });
    globalScope.addEventListener('infinite-rails:start-error', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const message =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Renderer initialisation failed.';
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', message, {
          level: 'error',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
    });
    globalScope.addEventListener('infinite-rails:initialisation-error', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const stage = typeof detail?.stage === 'string' && detail.stage.trim().length ? detail.stage.trim() : 'startup';
      const baseMessage =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : 'Initialisation error encountered.';
      const message = stage && stage !== 'startup' ? `${baseMessage} (${stage}).` : baseMessage;
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', message, {
          level: 'error',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
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

  const googleClientId =
    typeof globalAppConfig?.googleClientId === 'string' && globalAppConfig.googleClientId.trim().length > 0
      ? globalAppConfig.googleClientId.trim()
      : null;

  const identityState = {
    apiBaseUrl,
    googleClientId,
    googleInitialized: false,
    googleReady: false,
    googleButtonsRendered: false,
    googleError: null,
    identity: null,
    scoreboardMessage: '',
    scoreboardOffline: false,
    endpoints: {
      scores: buildScoreboardUrl(apiBaseUrl),
      users: apiBaseUrl ? `${apiBaseUrl.replace(/\/$/, '')}/users` : null,
    },
  };

  if (!identityState.apiBaseUrl) {
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
      message: 'Connecting to the leaderboard service…',
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
    return {
      generatedAt: new Date().toISOString(),
      rendererMode: scope?.InfiniteRails?.rendererMode ?? null,
      diagnostics,
      lastRendererFailure: lastFailure,
      backend: {
        configured: Boolean(identityState.apiBaseUrl),
        apiBaseUrl: identityState.apiBaseUrl ?? null,
        endpoints: identityState.endpoints ?? null,
      },
      debugMode: isDebugModeEnabled(),
      userAgent: scope?.navigator?.userAgent ?? null,
      eventLog: history,
      diagnosticLog:
        typeof bootstrapOverlay?.getLogEntries === 'function'
          ? bootstrapOverlay.getLogEntries()
          : [],
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
  }

  bindDiagnosticsActions();

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

  const DEFAULT_KEY_BINDINGS = (() => {
    const bindings = {
      moveForward: ['KeyW', 'ArrowUp'],
      moveBackward: ['KeyS', 'ArrowDown'],
      moveLeft: ['KeyA', 'ArrowLeft'],
      moveRight: ['KeyD', 'ArrowRight'],
      jump: ['Space'],
      interact: ['KeyF'],
      placeBlock: ['KeyQ'],
      toggleCrafting: ['KeyE'],
      openGuide: ['F1'],
      openSettings: ['F2'],
      openLeaderboard: ['F3'],
      buildPortal: ['KeyR'],
    };
    for (let index = 1; index <= HOTBAR_SLOT_COUNT; index += 1) {
      const digit = index % 10;
      bindings[`hotbar${index}`] = [`Digit${digit}`, `Numpad${digit}`];
    }
    return bindings;
  })();

  function queueBootstrapFallbackNotice(key, message) {
    if (!globalScope) {
      return;
    }
    const notices = (globalScope.__bootstrapNotices = globalScope.__bootstrapNotices || []);
    notices.push({ key, message });
  }

  function createAssetUrlCandidates(relativePath) {
    const urls = [];
    const normalisedPath = relativePath.replace(/^\.\//, '');
    const assetBase = globalScope.APP_CONFIG?.assetBaseUrl;
    if (assetBase) {
      try {
        const base = assetBase.endsWith('/') ? assetBase : `${assetBase}/`;
        urls.push(new URL(normalisedPath, base).href);
      } catch (error) {
        if (globalScope.console?.warn) {
          globalScope.console.warn('Failed to resolve assetBaseUrl candidate', {
            assetBaseUrl: assetBase,
            asset: relativePath,
            error,
          });
        }
      }
    }
    if (/^https?:/i.test(relativePath)) {
      urls.push(relativePath);
    } else {
      urls.push(normalisedPath);
    }
    return Array.from(new Set(urls));
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

  const THREE_SCRIPT_URLS = [...createAssetUrlCandidates('vendor/three.min.js')];
  const GLTF_LOADER_URLS = [...createAssetUrlCandidates('vendor/GLTFLoader.js')];

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
    if (scope.THREE && typeof scope.THREE === 'object') {
      scope.THREE_GLOBAL = scope.THREE;
      return Promise.resolve(scope.THREE);
    }
    if (threeLoaderPromise) {
      return threeLoaderPromise;
    }

    function normaliseUrlForComparison(url) {
      if (!url) {
        return '';
      }
      try {
        const base = scope?.location?.href
          || (typeof document !== 'undefined' && document.baseURI)
          || documentRef?.baseURI
          || undefined;
        return new URL(url, base).href;
      } catch (error) {
        return url;
      }
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

    function loadThreeFromCandidates({ startIndex = 0, exclude = [] } = {}) {
      return new Promise((resolve, reject) => {
        const attemptedUrls = [];
        const encounteredErrors = [];
        const attempt = (index) => {
          if (scope.THREE && typeof scope.THREE === 'object') {
            scope.THREE_GLOBAL = scope.THREE;
            resolve(scope.THREE);
            return;
          }
          if (index >= THREE_SCRIPT_URLS.length) {
            const failureError = new Error('Unable to load Three.js from bundled sources.');
            if (encounteredErrors.length > 0) {
              failureError.cause = encounteredErrors[encounteredErrors.length - 1];
              failureError.errors = [...encounteredErrors];
            }
            failureError.attemptedUrls = [...attemptedUrls];
            reportThreeLoadFailure(failureError, {
              attemptedUrls: failureError.attemptedUrls,
              errors: encounteredErrors.map((err) => err?.message ?? String(err)),
            });
            reject(failureError);
            return;
          }
          const candidate = THREE_SCRIPT_URLS[index];
          const normalisedCandidate = normaliseUrlForComparison(candidate);
          if (exclude.includes(normalisedCandidate)) {
            attempt(index + 1);
            return;
          }
          attemptedUrls.push(normalisedCandidate);
          const attrs = {
            'data-three-fallback': 'true',
            'data-three-fallback-index': String(index),
          };
          loadScript(candidate, attrs)
            .then(() => {
              if (scope.THREE && typeof scope.THREE === 'object') {
                scope.THREE_GLOBAL = scope.THREE;
                resolve(scope.THREE);
              } else {
                const exposureError = new Error('Three.js script loaded without exposing THREE.');
                encounteredErrors.push(exposureError);
                attempt(index + 1);
              }
            })
            .catch((error) => {
              const doc = typeof document !== 'undefined' ? document : scope.document || documentRef;
              const failingElement = doc?.querySelector?.(`script[data-three-fallback-index="${index}"]`);
              if (failingElement?.setAttribute) {
                failingElement.setAttribute('data-three-fallback-error', 'true');
              }
              encounteredErrors.push(error);
              attempt(index + 1);
            });
        };
        attempt(startIndex);
      });
    }

    function waitForPreloadedThree() {
      const script = getPreloadedThreeScript();
      if (!script) {
        return null;
      }
      if (scope.THREE && typeof scope.THREE === 'object') {
        scope.THREE_GLOBAL = scope.THREE;
        return Promise.resolve(scope.THREE);
      }
      const readyState = script.readyState;
      if (readyState === 'loaded' || readyState === 'complete') {
        if (scope.THREE && typeof scope.THREE === 'object') {
          scope.THREE_GLOBAL = scope.THREE;
          return Promise.resolve(scope.THREE);
        }
        return Promise.reject(new Error('Preloaded Three.js script finished without exposing THREE.'));
      }
      return new Promise((resolve, reject) => {
        const handleLoad = () => {
          if (scope.THREE && typeof scope.THREE === 'object') {
            scope.THREE_GLOBAL = scope.THREE;
            resolve(scope.THREE);
          } else {
            reject(new Error('Preloaded Three.js script loaded without exposing THREE.'));
          }
        };
        const handleError = (event) => {
          reject(event instanceof Error ? event : new Error('Preloaded Three.js script failed to load.'));
        };
        script.addEventListener('load', handleLoad, { once: true });
        script.addEventListener('error', handleError, { once: true });
      });
    }

    const preloadPromise = waitForPreloadedThree();
    if (preloadPromise) {
      const excluded = [];
      const preloadedScript = getPreloadedThreeScript();
      if (preloadedScript?.src) {
        excluded.push(normaliseUrlForComparison(preloadedScript.src));
      }
      threeLoaderPromise = preloadPromise.catch(() => loadThreeFromCandidates({ startIndex: 0, exclude: excluded }));
      return threeLoaderPromise;
    }

    threeLoaderPromise = loadThreeFromCandidates();
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
    gltfLoaderPromise = new Promise((resolve, reject) => {
      const attempt = (index) => {
        if (scope.THREE?.GLTFLoader) {
          resolve(scope.THREE.GLTFLoader);
          return;
        }
        if (index >= GLTF_LOADER_URLS.length) {
          reject(new Error('Unable to load GLTFLoader sources.'));
          return;
        }
        const url = GLTF_LOADER_URLS[index];
        loadScript(url, {
          'data-gltfloader-fallback': 'true',
          'data-gltfloader-index': String(index),
        })
          .then(() => {
            if (scope.THREE?.GLTFLoader) {
              resolve(scope.THREE.GLTFLoader);
            } else {
              attempt(index + 1);
            }
          })
          .catch(() => {
            attempt(index + 1);
          });
      };
      attempt(0);
    });
    return gltfLoaderPromise;
  }
  const nameDisplayEl = documentRef?.getElementById('userNameDisplay') ?? null;
  const locationDisplayEl = documentRef?.getElementById('userLocationDisplay') ?? null;
  const scoreboardStatusEl = documentRef?.getElementById('scoreboardStatus') ?? null;
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
        throw new Error(`Request failed with status ${response.status}`);
      }
      updateScoreboardStatus(`Signed in as ${identity.name}. Leaderboard sync active.`);
    } catch (error) {
      console.warn('Failed to sync identity with leaderboard', error);
      updateScoreboardStatus(`Signed in as ${identity.name}. Sync failed — storing locally.`);
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
      const message =
        typeof detail.message === 'string' && detail.message.trim().length ? detail.message.trim() : fallback;
      updateScoreboardStatus(message);
    });

    globalScope.addEventListener('infinite-rails:score-sync-restored', (event) => {
      const detail = event?.detail ?? {};
      if (typeof detail.message === 'string' && detail.message.trim().length) {
        updateScoreboardStatus(detail.message.trim());
        return;
      }
      if (!identityState.apiBaseUrl) {
        return;
      }
      const activeIdentity = identityState.identity ?? null;
      if (activeIdentity?.googleId) {
        updateScoreboardStatus(`Signed in as ${activeIdentity.name}. Leaderboard sync active.`);
      } else {
        updateScoreboardStatus('Leaderboard connected — sign in to publish your run.');
      }
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
      } else {
        message = `Signed in as ${merged.name}. Offline mode — configure APP_CONFIG.apiBaseUrl to sync.`;
      }
    } else if (reason === 'sign-out') {
      message = `Signed out — continuing as ${merged.name}.`;
    } else if (reason === 'fallback-signin') {
      message = `Playing as ${merged.name}. Google Sign-In unavailable; storing locally.`;
    } else if (reason === 'external-set') {
      if (typeof options.message === 'string' && options.message.trim().length) {
        message = options.message.trim();
      }
    }

    if (message) {
      updateScoreboardStatus(message);
    } else if (!options.silent) {
      updateScoreboardStatus(identityState.scoreboardMessage);
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
    applyIdentity(next, { reason: 'fallback-signin' });
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
    applyIdentity(createAnonymousIdentity(identityState.identity), { reason: 'sign-out' });
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

  function handleGoogleCredential(response) {
    try {
      const credential = response?.credential;
      if (!credential) {
        updateScoreboardStatus('Google Sign-In failed — missing credential response.');
        return;
      }
      const payload = decodeJwtPayload(credential);
      if (!payload) {
        updateScoreboardStatus('Google Sign-In failed — unable to parse credential.');
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
        updateScoreboardStatus('Google Sign-In returned without an ID; continuing locally.');
        return;
      }
      applyIdentity(identity, { reason: 'google-sign-in' });
    } catch (error) {
      console.warn('Google Sign-In credential handling failed', error);
      updateScoreboardStatus('Google Sign-In failed — see console for details. Continuing with local profile.');
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
      try {
        const result = scope.matchMedia('(pointer: coarse)');
        if (result && typeof result.matches === 'boolean') {
          return result.matches;
        }
      } catch (error) {
        if (globalScope.console?.debug) {
          globalScope.console.debug('Failed to evaluate coarse pointer media query.', error);
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
    const mobileRegex = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i;
    const userAgentMobile = mobileRegex.test(userAgent);
    return {
      coarsePointer,
      touchCapable,
      userAgentMobile,
      isMobile: Boolean(coarsePointer || touchCapable || userAgentMobile),
    };
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
    let webglSupported = false;
    if (doc && typeof doc.createElement === 'function') {
      try {
        const canvas = doc.createElement('canvas');
        const getContext = canvas?.getContext?.bind(canvas);
        if (typeof getContext === 'function') {
          const gl =
            getContext('webgl2') || getContext('webgl') || getContext('experimental-webgl') || null;
          webglSupported = Boolean(gl);
        }
      } catch (error) {
        webglSupported = false;
      }
    }
    config.webglSupport = webglSupported;
    if (!webglSupported) {
      config.preferAdvanced = false;
      queueBootstrapFallbackNotice(
        'webgl-unavailable-simple-mode',
        'WebGL is unavailable on this device, so the mission briefing view is shown instead of the full 3D renderer.',
      );
      return true;
    }
    return !config.preferAdvanced;
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
      hotbarEl: byId('hotbar'),
      playerHintEl: byId('playerHint'),
      pointerHintEl: byId('pointerHint'),
      footerEl: byId('siteFooter'),
      footerScoreEl: byId('footerScore'),
      footerDimensionEl: byId('footerDimension'),
      footerStatusEl: byId('footerStatus'),
      assetRecoveryOverlay: byId('assetRecoveryOverlay'),
      assetRecoveryDialogEl: byId('assetRecoveryDialog'),
      assetRecoveryTitleEl: byId('assetRecoveryTitle'),
      assetRecoveryMessageEl: byId('assetRecoveryMessage'),
      assetRecoveryActionsEl: byId('assetRecoveryActions'),
      assetRecoveryRetryButton: byId('assetRecoveryRetry'),
      assetRecoveryReloadButton: byId('assetRecoveryReload'),
      startButton: byId('startButton'),
      landingGuideButton: byId('landingGuideButton'),
      introModal: byId('introModal'),
      hudRootEl: byId('gameHud'),
      gameBriefing: byId('gameBriefing'),
      dismissBriefingButton: byId('dismissBriefing'),
      firstRunTutorial: byId('firstRunTutorial'),
      firstRunTutorialBackdrop: byId('firstRunTutorialBackdrop'),
      firstRunTutorialCloseButton: byId('firstRunTutorialClose'),
      firstRunTutorialPrimaryButton: byId('firstRunTutorialBegin'),
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
      portalStatusEl,
      portalStatusText: portalStatusEl ? portalStatusEl.querySelector('.portal-status__text') : null,
      portalStatusStateText: portalStatusEl ? portalStatusEl.querySelector('.portal-status__state') : null,
      portalStatusDetailText: portalStatusEl ? portalStatusEl.querySelector('.portal-status__detail') : null,
      portalStatusIcon: portalStatusEl ? portalStatusEl.querySelector('.portal-status__icon') : null,
      portalProgressLabel: query('#portalProgress .label'),
      portalProgressBar: query('#portalProgress .bar'),
      eventLogEl: byId('eventLog'),
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

  let activeExperienceInstance = null;

  function ensureSimpleExperience(mode) {
    if (activeExperienceInstance) {
      activeExperienceInstance.apiBaseUrl = identityState.apiBaseUrl;
      return activeExperienceInstance;
    }
    if (!globalScope.SimpleExperience?.create) {
      if (typeof bootstrapOverlay !== 'undefined') {
        bootstrapOverlay.showError({
          title: 'Renderer unavailable',
          message: 'Simplified renderer is missing from the build output.',
        });
        bootstrapOverlay.setDiagnostic('renderer', {
          status: 'error',
          message: 'Simplified renderer is missing from the build output.',
        });
      }
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', 'Simplified renderer is missing from the build output.', {
          level: 'error',
        });
      }
      return null;
    }
    const doc = documentRef || globalScope.document || null;
    const canvas = doc?.getElementById?.('gameCanvas') ?? null;
    if (!canvas) {
      if (typeof bootstrapOverlay !== 'undefined') {
        bootstrapOverlay.showError({
          title: 'Renderer unavailable',
          message: 'Game canvas could not be located. Reload the page to retry.',
        });
        bootstrapOverlay.setDiagnostic('renderer', {
          status: 'error',
          message: 'Game canvas could not be located. Reload to retry.',
        });
      }
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', 'Game canvas could not be located. Reload the page to retry.', {
          level: 'error',
        });
      }
      return null;
    }
    ensureHudDefaults(doc);
    const ui = collectSimpleExperienceUi(doc);
    bindDebugModeControls(ui);
    bindExperienceEventLog(ui);
    let experience;
    try {
      experience = globalScope.SimpleExperience.create({
        canvas,
        ui,
        apiBaseUrl: identityState.apiBaseUrl,
        playerName: identityState.identity?.name ?? 'Explorer',
        identityStorageKey,
      });
    } catch (error) {
      if (globalScope.console?.error) {
        globalScope.console.error('Failed to initialise simplified renderer.', error);
      }
      if (typeof bootstrapOverlay !== 'undefined') {
        bootstrapOverlay.showError({
          title: 'Renderer unavailable',
          message: 'Failed to initialise the renderer. Check your connection and reload.',
        });
        bootstrapOverlay.setDiagnostic('renderer', {
          status: 'error',
          message: 'Failed to initialise the renderer. Check your connection and reload.',
        });
      }
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', 'Failed to initialise the renderer. Check your connection and reload.', {
          level: 'error',
          detail: {
            errorMessage:
              typeof error?.message === 'string' && error.message.trim().length
                ? error.message.trim()
                : undefined,
            errorName:
              typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined,
          },
        });
      }
      throw error;
    }
    activeExperienceInstance = experience;
    globalScope.__INFINITE_RAILS_ACTIVE_EXPERIENCE__ = experience;
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
    if (typeof bootstrapOverlay !== 'undefined') {
      if (typeof bootstrapOverlay.setDiagnostic === 'function') {
        bootstrapOverlay.setDiagnostic('renderer', {
          status: 'ok',
          message: 'Renderer ready — press Start Expedition to begin.',
        });
        bootstrapOverlay.setDiagnostic('assets', {
          status: 'pending',
          message: 'World assets will stream after launch.',
        });
      }
      if (typeof bootstrapOverlay.hide === 'function') {
        const overlayState = bootstrapOverlay.state ?? {};
        if (overlayState.mode !== 'error') {
          bootstrapOverlay.hide({ force: true });
        }
      }
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('startup', 'Renderer initialised; awaiting player input.', {
        level: 'success',
      });
    }
    if (ui.startButton && !ui.startButton.dataset.simpleExperienceBound) {
      ui.startButton.addEventListener('click', (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        try {
          experience.start();
        } catch (error) {
          console.error('Failed to start gameplay session', error);
        }
      });
      ui.startButton.dataset.simpleExperienceBound = 'true';
    }
    if (ui.landingGuideButton && !ui.landingGuideButton.dataset.simpleExperienceGuideBound) {
      ui.landingGuideButton.addEventListener('click', (event) => {
        if (event?.preventDefault) {
          event.preventDefault();
        }
        if (!experience || typeof experience.showFirstRunTutorial !== 'function') {
          return;
        }
        try {
          experience.showFirstRunTutorial({ markSeenOnDismiss: true, autoFocus: true });
        } catch (error) {
          console.error('Failed to display tutorial overlay', error);
        }
      });
      ui.landingGuideButton.dataset.simpleExperienceGuideBound = 'true';
    }
    if (typeof bootstrapOverlay !== 'undefined') {
      bootstrapOverlay.hide({ force: true });
    }
    return experience;
  }

  let simpleFallbackAttempted = false;

  function tryStartSimpleFallback(error, context = {}) {
    if (simpleFallbackAttempted) {
      return false;
    }
    if (typeof bootstrapOverlay !== 'undefined' && bootstrapOverlay.state.mode !== 'error') {
      bootstrapOverlay.showLoading({
        message: 'Attempting simplified renderer fallback…',
      });
    }
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    scope.__LAST_FALLBACK_CONTEXT__ = { error: error?.message ?? null, context };
    if (context?.reason === 'ensureThree-failure') {
      const config = scope.APP_CONFIG || (scope.APP_CONFIG = {});
      config.forceSimpleMode = false;
      config.enableAdvancedExperience = true;
      config.preferAdvanced = true;
      if (!scope.THREE && scope.THREE_GLOBAL) {
        scope.THREE = scope.THREE_GLOBAL;
      }
      try {
        setRendererModeIndicator('advanced');
        ensureSimpleExperience('advanced');
      } catch (recoverError) {
        if (scope.console?.error) {
          scope.console.error('Failed to recover Three.js bootstrap', recoverError);
        }
      }
      return false;
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
          message: 'Fallback renderer is unavailable. Check your extensions or reload the page.',
        });
        bootstrapOverlay.setDiagnostic('renderer', {
          status: 'error',
          message: 'Fallback renderer is unavailable. Check extensions or reload.',
        });
      }
      return false;
    }
    simpleFallbackAttempted = true;
    const config = scope.APP_CONFIG || (scope.APP_CONFIG = {});
    config.forceSimpleMode = true;
    config.enableAdvancedExperience = false;
    config.preferAdvanced = false;
    config.defaultMode = 'simple';
    if (typeof queueBootstrapFallbackNotice === 'function') {
      queueBootstrapFallbackNotice(
        'forced-simple-mode',
        'Falling back to the simple renderer after a bootstrap failure.',
      );
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('startup', 'Falling back to the simple renderer after a bootstrap failure.', {
        level: 'warning',
      });
    }
    try {
      if (typeof scope.bootstrap === 'function') {
        scope.bootstrap();
      }
    } catch (bootstrapError) {
      if (scope.console?.error) {
        scope.console.error('Simple fallback bootstrap failed.', bootstrapError);
      }
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', 'Simple fallback bootstrap failed.', {
          level: 'error',
          detail: {
            errorMessage:
              typeof bootstrapError?.message === 'string' && bootstrapError.message.trim().length
                ? bootstrapError.message.trim()
                : undefined,
            errorName:
              typeof bootstrapError?.name === 'string' && bootstrapError.name.trim().length
                ? bootstrapError.name.trim()
                : undefined,
          },
        });
      }
    }
    return true;
  }

  function createScoreboardUtilsFallback() {
    return internalCreateScoreboardUtilsFallback();
  }

  function bootstrap() {
    const scope =
      typeof globalScope !== 'undefined'
        ? globalScope
        : typeof window !== 'undefined'
          ? window
          : globalThis;
    const startSimple = shouldStartSimpleMode();
    const mode = startSimple ? 'simple' : 'advanced';
    setRendererModeIndicator(mode);
    if (scope.SimpleExperience?.create) {
      ensureSimpleExperience(mode);
    }
  }

  function setupSimpleExperienceIntegrations() {
    return {
      identity: { ...identityState.identity },
      applyIdentity,
    };
  }

  const storedSnapshot = loadStoredIdentitySnapshot();
  const initialIdentity = storedSnapshot ? mapSnapshotToIdentity(storedSnapshot) : createAnonymousIdentity(null);
  identityState.identity = initialIdentity;

  const initialScoreboardMessage = (() => {
    if (apiBaseInvalid) {
      return 'Configured API endpoint is invalid. Using local leaderboard entries until it is updated.';
    }
    if (apiBaseUrl && initialIdentity?.googleId) {
      return `Signed in as ${initialIdentity.name}. Leaderboard sync active.`;
    }
    if (!apiBaseUrl && initialIdentity?.googleId) {
      return `Signed in as ${initialIdentity.name}. Offline mode — storing runs locally.`;
    }
    if (apiBaseUrl) {
      return 'Leaderboard connected — sign in to publish your run.';
    }
    return 'Offline mode active — storing scores locally.';
  })();
  updateScoreboardStatus(initialScoreboardMessage);
  applyIdentity(initialIdentity, { persist: false, silent: true });

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

  globalScope.bootstrap = bootstrap;

  ensureThree()
    .then(() => {
      bootstrap();
    })
    .catch((error) => {
      reportThreeLoadFailure(error, { reason: 'ensureThree-rejection' });
      if (!simpleFallbackAttempted) {
        tryStartSimpleFallback(error, { reason: 'ensureThree-failure' });
      }
    });
})();
