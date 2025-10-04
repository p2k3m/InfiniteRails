(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const documentRef = globalScope.document ?? null;

  const assetBaseConsistencyState = { mismatchLogged: false };

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
    if (
      configuredBase &&
      configuredBase !== expectedBase &&
      !assetBaseConsistencyState.mismatchLogged &&
      scope?.console &&
      typeof scope.console.warn === 'function'
    ) {
      assetBaseConsistencyState.mismatchLogged = true;
      scope.console.warn(
        'APP_CONFIG.assetBaseUrl mismatch detected; overriding to production asset root.',
        {
          configured: config.assetBaseUrl ?? null,
          normalisedConfigured: configuredBase,
          expected: expectedBase,
          production: PRODUCTION_ASSET_ROOT,
        },
      );
    }
    config.assetBaseUrl = expectedBase;
  }

  ensureProductionAssetBase(globalScope, documentRef);

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

  globalScope.InfiniteRails = globalScope.InfiniteRails || {};
  globalScope.InfiniteRails.bootDiagnostics = globalScope.InfiniteRails.bootDiagnostics || {};

  let activeExperienceInstance = null;

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
      const normalisedEntries = sortBootDiagnosticsEntries(
        prepareBootDiagnosticsEntries(snapshot?.sections?.[scope]),
      );
      const hasEntries = normalisedEntries.length > 0;
      let highestSeverity = 'pending';
      let errorCount = 0;
      normalisedEntries.forEach((entry) => {
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
      const entries = prepareBootDiagnosticsEntries(clone.sections?.[scope]);
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
        actions: doc.getElementById('globalOverlayActions'),
        recoveryButton: doc.getElementById('globalOverlayRecoveryButton'),
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

  const assetLoadingIndicatorState = {
    active: new Map(),
    overlayActive: false,
  };

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
    if (bootstrapOverlay && typeof bootstrapOverlay.logEvent === 'function') {
      bootstrapOverlay.logEvent(scope, message, payload);
    }
    sendDiagnosticsEventToServer(entry);
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
    if (typeof bootstrapOverlay?.setRecoveryAction === 'function') {
      if (diagnosticStatus === 'error') {
        const detailSnapshot = detail && typeof detail === 'object' ? { ...detail } : null;
        if (diagnosticScope === 'assets') {
          bootstrapOverlay.setRecoveryAction({
            label: 'Reload Assets',
            action: 'reload-assets',
            description: 'Reloads the experience and requests missing assets again.',
            onSelect: (event) => {
              if (event?.currentTarget) {
                event.currentTarget.disabled = true;
              }
              if (typeof logDiagnosticsEvent === 'function') {
                const recoveryDetail = detailSnapshot ? { ...detailSnapshot } : {};
                recoveryDetail.source = 'global-overlay';
                logDiagnosticsEvent('assets', 'Player initiated asset reload from diagnostics overlay.', {
                  level: 'warning',
                  detail: recoveryDetail,
                });
              }
              if (
                typeof globalScope?.dispatchEvent === 'function' &&
                typeof globalScope?.CustomEvent === 'function'
              ) {
                try {
                  const eventDetail = { source: 'global-overlay' };
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
              const locationTarget = globalScope?.location;
              if (locationTarget && typeof locationTarget.reload === 'function') {
                locationTarget.reload();
                return;
              }
              if (event?.currentTarget) {
                event.currentTarget.disabled = false;
              }
              showHudAlert({
                title: 'Reload unavailable',
                message: 'Reload the page manually to restore missing assets.',
                severity: 'warning',
                autoHideMs: 7000,
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
    });
    if (typeof tryStartSimpleFallback === 'function') {
      try {
        const activeMode =
          typeof resolveRendererModeForFallback === 'function' ? resolveRendererModeForFallback(detail) : null;
        if (activeMode !== 'simple') {
          const fallbackReason =
            typeof detail?.reason === 'string' && detail.reason.trim().length
              ? detail.reason.trim()
              : boundaryKey;
          const fallbackContext = {
            reason: fallbackReason,
            boundary: boundaryKey,
            stage,
            mode: activeMode || 'unknown',
            source: 'error-boundary',
          };
          const fallbackError = error instanceof Error ? error : new Error(normalised.message);
          tryStartSimpleFallback(fallbackError, fallbackContext);
        }
      } catch (fallbackError) {
        globalScope?.console?.debug?.('Failed to trigger simple renderer fallback after boundary error.', fallbackError);
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

  function hideHudAlert() {
    const binding = resolveHudAlertElements();
    if (!binding.element) {
      return;
    }
    if (binding.hideTimer) {
      clearTimeout(binding.hideTimer);
      binding.hideTimer = null;
    }
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

  function showHudAlert({
    title = '',
    message = '',
    severity = 'error',
    autoHideMs = null,
  } = {}) {
    const binding = resolveHudAlertElements();
    if (!binding.element) {
      return;
    }
    if (binding.hideTimer) {
      clearTimeout(binding.hideTimer);
      binding.hideTimer = null;
    }
    const safeTitle = typeof title === 'string' ? title.trim() : '';
    const safeMessage = typeof message === 'string' ? message.trim() : '';
    const severityKey = typeof severity === 'string' ? severity.trim().toLowerCase() : '';
    const allowedSeverities = new Set(['error', 'warning', 'success', 'info']);
    const appliedSeverity = allowedSeverities.has(severityKey) ? severityKey : 'info';
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
      bootstrapOverlay.showError({
        title: 'Renderer unavailable',
        message: failureMessage,
      });
      bootstrapOverlay.setDiagnostic('renderer', {
        status: 'error',
        message: failureMessage,
      });
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('startup', failureMessage, {
          level: 'error',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
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
    globalScope.addEventListener('infinite-rails:audio-boot-status', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const fallbackActive = Boolean(detail?.fallbackActive);
      const baseMessage =
        typeof detail?.message === 'string' && detail.message.trim().length
          ? detail.message.trim()
          : fallbackActive
            ? 'Audio fallback alert tone active until assets are restored.'
            : 'Audio initialised successfully.';
      if (typeof logDiagnosticsEvent === 'function') {
        logDiagnosticsEvent('audio', baseMessage, {
          level: fallbackActive ? 'error' : 'success',
          detail,
          timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
        });
      }
      if (typeof bootstrapOverlay?.setDiagnostic === 'function') {
        bootstrapOverlay.setDiagnostic('audio', {
          status: fallbackActive ? 'error' : 'ok',
          message: baseMessage,
        });
      }
    });

    globalScope.addEventListener('infinite-rails:audio-error', (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
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
        ? `${baseMessage} — ${extraParts.join(' — ')}`
        : baseMessage;
      presentCriticalErrorOverlay({
        title: 'Audio playback failed',
        message: overlayMessage,
        diagnosticScope: 'assets',
        diagnosticStatus: 'error',
        diagnosticMessage: baseMessage,
        logScope: 'assets',
        logMessage: baseMessage,
        detail,
        timestamp: Number.isFinite(detail?.timestamp) ? detail.timestamp : undefined,
      });
      if (typeof bootstrapOverlay?.setDiagnostic === 'function') {
        const status = detail?.code === 'boot-missing-sample' ? 'error' : 'warning';
        bootstrapOverlay.setDiagnostic('audio', {
          status,
          message: baseMessage,
        });
      }
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
    const bootDiagnosticsSnapshot = cloneBootDiagnosticsSnapshot(bootDiagnosticsState.lastSnapshot);
    const bootDiagnosticsErrors = summariseBootDiagnosticErrors(bootDiagnosticsState.lastSnapshot);
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
      liveDiagnostics: getLiveDiagnosticsEntriesSnapshot(),
      bootDiagnostics: bootDiagnosticsSnapshot,
      bootDiagnosticsErrors,
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
    ['fps', 'models', 'textures', 'audio'].forEach((key) => {
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
      return {
        fps: Number.isFinite(metrics.fps) ? metrics.fps : 0,
        models: Number.isFinite(metrics.models) ? metrics.models : 0,
        textures: Number.isFinite(metrics.textures) ? metrics.textures : 0,
        audio: Number.isFinite(metrics.audio) ? metrics.audio : 0,
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

  function createAssetUrlCandidates(relativePath, options = {}) {
    if (!relativePath || typeof relativePath !== 'string') {
      return [];
    }
    const urls = [];
    const normalisedPath = relativePath.replace(/^\.\//, '');
    const isHttpUrl = /^https?:/i.test(relativePath);

    if (options?.preloadedSelector && documentRef && typeof documentRef.querySelector === 'function') {
      try {
        const preloaded = documentRef.querySelector(options.preloadedSelector);
        if (preloaded?.src) {
          urls.push(preloaded.src);
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
          urls.push(new URL(normalisedPath, base).href);
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

    if (!urls.length) {
      urls.push(isHttpUrl ? relativePath : normalisedPath);
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
    const candidates = createAssetUrlCandidates('vendor/three.min.js', {
      preloadedSelector: 'script[data-preload-three]',
    });
    return candidates.length ? candidates[0] : null;
  })();
  const GLTF_LOADER_URL = (() => {
    const candidates = createAssetUrlCandidates('vendor/GLTFLoader.js');
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
    function resolveThreeFromScope() {
      const hasThree = scope && scope.THREE && typeof scope.THREE === 'object';
      const hasThreeGlobal = scope && scope.THREE_GLOBAL && typeof scope.THREE_GLOBAL === 'object';
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
      if (hasThree) {
        scope.THREE_GLOBAL = scope.THREE;
        return scope.THREE;
      }
      if (hasThreeGlobal) {
        scope.THREE = scope.THREE_GLOBAL;
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
        return Promise.resolve(existingThree);
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
            return resolvedThreeAfterLoad;
          }
          const exposureError = new Error('Three.js script loaded without exposing THREE.');
          reportThreeFailure(exposureError, { reason: 'no-global', url: THREE_SCRIPT_URL });
          throw exposureError;
        })
        .catch((error) => {
          if (error?.code === 'duplicate-three-global' || error?.message === 'Three.js script loaded without exposing THREE.') {
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
          return Promise.resolve(existingThree);
        }
      } catch (error) {
        return Promise.reject(error);
      }
      const readyState = script.readyState;
      if (readyState === 'loaded' || readyState === 'complete') {
        try {
          const resolvedThree = resolveThreeFromScope();
          if (resolvedThree) {
            return Promise.resolve(resolvedThree);
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
              resolve(resolvedThree);
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
        threeLoaderPromise = preloadPromise.catch(() => loadThreeScript());
        return threeLoaderPromise;
      }
    } catch (error) {
      threeLoaderPromise = Promise.reject(error);
      return threeLoaderPromise;
    }

    threeLoaderPromise = loadThreeScript();
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
      let fallback = 'Leaderboard connection restored.';
      if (identityState.apiBaseUrl) {
        const activeIdentity = identityState.identity ?? null;
        fallback = activeIdentity?.googleId
          ? `Signed in as ${activeIdentity.name}. Leaderboard sync active.`
          : 'Leaderboard connected — sign in to publish your run.';
      }
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
    applyIdentity(fallback, {
      reason: 'google-sign-in-failed',
      message,
      offline: true,
    });
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

  let webglSupportOverlayPresented = false;

  function renderStandaloneWebglFallbackOverlay({
    title,
    intro,
    troubleshootingSteps,
    detail = null,
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

    const supportHint = doc.createElement('span');
    supportHint.textContent = 'Need more help? Visit chrome://gpu to verify WebGL availability.';
    supportHint.style.fontSize = '0.85rem';
    supportHint.style.lineHeight = '1.4';
    supportHint.style.color = '#cbd5f5';
    actionRow.appendChild(supportHint);

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
    const overlayIntro = 'WebGL output is blocked, so Infinite Rails is launching the simplified renderer.';
    const overlayMessage = [
      overlayIntro,
      'To restore the full 3D experience, try:',
      ...troubleshootingSteps.map((step) => `• ${step}`),
    ].join('\n');
    let overlayRendered = false;
    if (overlayController && typeof overlayController.showError === 'function') {
      try {
        overlayController.showError({
          title: 'WebGL output blocked',
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
        message: 'WebGL blocked — launching simplified renderer.',
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
    const diagnosticDetail = { reason: 'webgl-unavailable', fallbackMode: 'simple' };
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
        title: 'WebGL output blocked',
        intro: overlayIntro,
        troubleshootingSteps,
        detail: diagnosticDetail,
      });
    }
    if (typeof logDiagnosticsEvent === 'function') {
      logDiagnosticsEvent('renderer', 'WebGL unavailable at bootstrap. Falling back to simplified renderer.', {
        level: 'error',
        detail: diagnosticDetail,
      });
    } else if (globalScope?.console?.warn) {
      globalScope.console.warn('WebGL unavailable at bootstrap. Falling back to simplified renderer.', diagnosticDetail);
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
    return Object.keys(detail).length ? detail : null;
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

  function updateRendererStateForWebglFallback() {
    const state = globalScope?.__INFINITE_RAILS_STATE__;
    if (!state || typeof state !== 'object') {
      ensureRendererFallbackIndicator();
      return;
    }
    try {
      state.rendererMode = 'simple';
      state.reason = 'webgl-unavailable';
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
    let fallbackDetail = existingDetail || normaliseWebglFallbackDetail(probeError);
    if (config) {
      config.webglSupport = false;
      if (!config.__webglFallbackApplied) {
        config.__webglFallbackApplied = true;
        if (fallbackDetail) {
          config.__webglFallbackDetail = fallbackDetail;
        }
        config.preferAdvanced = false;
        config.enableAdvancedExperience = false;
        config.forceAdvanced = false;
        config.defaultMode = 'simple';
        queueBootstrapFallbackNotice(
          'webgl-unavailable-simple-mode',
          'WebGL is unavailable on this device, so the mission briefing view is shown instead of the full 3D renderer.',
        );
      } else if (!existingDetail && fallbackDetail) {
        config.__webglFallbackDetail = fallbackDetail;
      }
    }
    presentWebglBlockedOverlay({ detail: fallbackDetail });
    updateRendererStateForWebglFallback();
    return fallbackDetail;
  }

  function probeWebglSupport(doc) {
    if (!doc || typeof doc.createElement !== 'function') {
      const probeError = new Error('Document unavailable for WebGL probe.');
      probeError.name = 'WebGLProbeUnavailable';
      return { supported: false, error: probeError };
    }
    try {
      const canvas = doc.createElement('canvas');
      const getContext = typeof canvas?.getContext === 'function' ? canvas.getContext.bind(canvas) : null;
      if (!getContext) {
        const error = new Error('Canvas does not provide a WebGL-capable context.');
        error.name = 'WebGLContextUnavailable';
        return { supported: false, error };
      }
      const context =
        getContext('webgl2') || getContext('webgl') || getContext('experimental-webgl') || null;
      if (!context) {
        const error = new Error('WebGL context request returned null.');
        error.name = 'WebGLUnavailableError';
        return { supported: false, error };
      }
      return { supported: true, error: null };
    } catch (error) {
      const probeError = error instanceof Error ? error : new Error('WebGL probe failed.');
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
    ensureHudDefaults(doc);
    const ui = collectSimpleExperienceUi(doc);
    ensureHudStateBinding(ui);
    bindDebugModeControls(ui);
    bindDeveloperStatsControls(ui);
    bindBootDiagnosticsUi(ui);
    bindLiveDiagnosticsControls(ui);
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
    let assetPreloadPromise = null;
    if (experience && typeof experience.enableStrictAssetValidation === 'function') {
      try {
        experience.enableStrictAssetValidation();
      } catch (error) {
        if (globalScope.console?.debug) {
          globalScope.console.debug('Failed to enable strict asset validation.', error);
        }
      }
    }
    if (experience && typeof experience.preloadRequiredAssets === 'function') {
      try {
        assetPreloadPromise = experience.preloadRequiredAssets();
      } catch (error) {
        assetPreloadPromise = Promise.reject(error);
        if (globalScope.console?.error) {
          globalScope.console.error('Critical asset preload failure detected.', error);
        }
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
    }
    if (assetPreloadPromise && typeof assetPreloadPromise.then === 'function') {
      if (ui.startButton) {
        ui.startButton.disabled = true;
        ui.startButton.setAttribute('data-preloading', 'true');
      }
      assetPreloadPromise
        .then(() => {
          if (ui.startButton) {
            ui.startButton.disabled = false;
            ui.startButton.removeAttribute('data-preloading');
          }
          if (overlayController?.setDiagnostic) {
            overlayController.setDiagnostic('assets', {
              status: 'ok',
              message: 'World assets ready.',
            });
          }
          hideBootstrapOverlay();
        })
        .catch((error) => {
          if (globalScope.console?.error) {
            globalScope.console.error('Critical asset preload failed.', error);
          }
          const errorMessage =
            typeof error?.message === 'string' && error.message.trim().length
              ? error.message.trim()
              : 'Critical assets failed to preload. Reload to try again.';
          const errorName = typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined;
          const errorStack = typeof error?.stack === 'string' && error.stack.trim().length ? error.stack.trim() : undefined;
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
          if (overlayController?.setDiagnostic) {
            overlayController.setDiagnostic('assets', {
              status: 'error',
              message: 'Failed to preload world assets.',
            });
          }
        });
    } else {
      hideBootstrapOverlay();
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
        const startAction = () => {
          try {
            const result = experience.start();
            if (result && typeof result.then === 'function') {
              return result.catch((error) => {
                if (globalScope.console?.error) {
                  globalScope.console.error('Failed to start gameplay session', error);
                }
                throw error;
              });
            }
            return result;
          } catch (error) {
            if (globalScope.console?.error) {
              globalScope.console.error('Failed to start gameplay session', error);
            }
            throw error;
          }
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

  const DEFAULT_RENDERER_START_TIMEOUT_MS = 12000;
  let simpleFallbackAttempted = false;
  let rendererStartWatchdogHandle = null;
  let rendererStartWatchdogMode = null;

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
        'Advanced renderer start timed out — switching to the simplified sandbox.';
      if (globalScope?.console?.warn) {
        globalScope.console.warn(warningMessage);
      }
      if (typeof tryStartSimpleFallback === 'function') {
        const timeoutError = new Error('Advanced renderer start timed out.');
        try {
          tryStartSimpleFallback(timeoutError, {
            reason: 'renderer-timeout',
            mode: 'advanced',
            source: 'watchdog',
            stage: 'startup.watchdog',
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

  function startSimpleFallbackBootstrap(scope, error, context) {
    simpleFallbackAttempted = true;
    const config = scope.APP_CONFIG || (scope.APP_CONFIG = {});
    applySimpleFallbackConfig(config);
    if (typeof queueBootstrapFallbackNotice === 'function') {
      const noticeReason =
        typeof context?.reason === 'string' && context.reason.trim().length
          ? `forced-simple-mode:${context.reason.trim()}`
          : 'forced-simple-mode';
      queueBootstrapFallbackNotice(
        noticeReason,
        'Falling back to the simple renderer after a bootstrap failure.',
      );
    }
    if (typeof logDiagnosticsEvent === 'function') {
      const detail = context && typeof context === 'object' ? { ...context } : undefined;
      if (detail && error instanceof Error && typeof detail.errorMessage !== 'string') {
        detail.errorMessage = error.message;
      }
      logDiagnosticsEvent('startup', 'Falling back to the simple renderer after a bootstrap failure.', {
        level: 'warning',
        detail,
      });
    }
    const navigationTriggered = ensureSimpleModeQueryParam(scope);
    if (navigationTriggered) {
      return true;
    }
    try {
      if (typeof scope.bootstrap === 'function') {
        scope.bootstrap();
      }
    } catch (bootstrapError) {
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
    }
    return true;
  }

  function tryStartSimpleFallback(error, context = {}) {
    cancelRendererStartWatchdog();
    if (simpleFallbackAttempted) {
      return false;
    }
    if (typeof bootstrapOverlay !== 'undefined') {
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
    if (context?.reason === 'ensureThree-failure' && scope.console?.warn) {
      scope.console.warn('Three.js failed to load. Switching to simplified renderer.', {
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
          message: 'Fallback renderer is unavailable. Check your extensions or reload the page.',
        });
        bootstrapOverlay.setDiagnostic('renderer', {
          status: 'error',
          message: 'Fallback renderer is unavailable. Check extensions or reload.',
        });
      }
      return false;
    }
    return startSimpleFallbackBootstrap(scope, error, context);
  }

  function createScoreboardUtilsFallback() {
    return internalCreateScoreboardUtilsFallback();
  }

  function bootstrap() {
    return invokeWithErrorBoundary(
      () => {
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
      return { fps: null, models: null, textures: null, audio: null };
    }
    return {
      fps: metrics.fps,
      models: metrics.models,
      textures: metrics.textures,
      audio: metrics.audio,
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
  globalScope.InfiniteRails.bootDiagnostics = bootDiagnosticsApi;

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

  const skipAdvancedBootstrap = runWebglPreflightCheck();

  if (skipAdvancedBootstrap) {
    bootstrap();
  } else {
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
  }
})();
