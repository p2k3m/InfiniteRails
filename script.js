function ensureTrailingSlash(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

const PRODUCTION_ASSET_ROOT = ensureTrailingSlash('https://d3gj6x3ityfh5o.cloudfront.net/');

(function setupErrorConsoleOverlay(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope || scope.__INFINITE_RAILS_ERROR_CONSOLE__) {
    return;
  }

  const documentRef = scope.document;
  if (!documentRef || typeof documentRef.getElementById !== 'function') {
    return;
  }

  const overlay = documentRef.getElementById('errorConsole');
  if (!overlay) {
    return;
  }

  const list = overlay.querySelector('[data-error-console-list]');
  if (!list) {
    return;
  }

  const countRef = overlay.querySelector('[data-error-count]');
  const dismissButton = overlay.querySelector('[data-error-dismiss]');
  const downloadButton = overlay.querySelector('[data-error-download]');
  const MAX_ERROR_HISTORY = 200;
  const MAX_ACTION_HISTORY = 240;
  const MAX_DIAGNOSTIC_HISTORY = 200;

  const sessionState = {
    errors: [],
    actions: [],
    diagnostics: [],
    lastDownload: null,
  };

  const DEFAULT_REPLAY_LIMIT = 100;

  const createReplayBuffer = (limit = DEFAULT_REPLAY_LIMIT) => {
    const capacity = (() => {
      const numericLimit = Number(limit);
      if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
        return DEFAULT_REPLAY_LIMIT;
      }
      if (numericLimit > 1000) {
        return 1000;
      }
      return Math.floor(numericLimit);
    })();

    const entries = new Array(capacity);
    let writeIndex = 0;
    let entryCount = 0;
    let sequence = 0;

    const toStoredEntry = (action, detail, metadata) => ({
      id: ++sequence,
      action: ensureString(action) || 'unknown-event',
      detail: cloneForSnapshot(detail),
      metadata: cloneForSnapshot(metadata),
      timestamp: new Date(),
    });

    const toSnapshotEntry = (entry) => ({
      id: entry.id,
      action: entry.action,
      detail: cloneForSnapshot(entry.detail),
      metadata: cloneForSnapshot(entry.metadata),
      timestamp:
        entry.timestamp instanceof Date ? entry.timestamp.toISOString() : toIsoString(entry.timestamp),
    });

    const record = (action, detail = {}, metadata = {}) => {
      const entry = toStoredEntry(action, detail, metadata);
      entries[writeIndex] = entry;
      writeIndex = (writeIndex + 1) % capacity;
      if (entryCount < capacity) {
        entryCount += 1;
      }
      return entry;
    };

    const snapshot = () => {
      if (entryCount === 0) {
        return [];
      }
      const result = [];
      for (let offset = entryCount - 1; offset >= 0; offset -= 1) {
        const index = (writeIndex - offset - 1 + capacity) % capacity;
        const entry = entries[index];
        if (!entry) {
          continue;
        }
        result.push(toSnapshotEntry(entry));
      }
      return result;
    };

    const clear = () => {
      for (let index = 0; index < entries.length; index += 1) {
        entries[index] = undefined;
      }
      writeIndex = 0;
      entryCount = 0;
      sequence = 0;
    };

    const size = () => entryCount;

    return {
      record,
      snapshot,
      clear,
      size,
      get limit() {
        return capacity;
      },
    };
  };

  const describeEventTarget = (target) => {
    if (!target || typeof target !== 'object') {
      return null;
    }
    const descriptor = {};
    try {
      if (typeof target.id === 'string' && target.id.trim().length) {
        descriptor.id = target.id.trim();
      }
    } catch (error) {
      // ignore lookup failures
    }
    try {
      if (typeof target.tagName === 'string' && target.tagName.trim().length) {
        descriptor.tag = target.tagName.trim().toLowerCase();
      }
    } catch (error) {
      // ignore lookup failures
    }
    try {
      if (typeof target.nodeName === 'string' && target.nodeName.trim().length) {
        descriptor.node = target.nodeName.trim().toLowerCase();
      }
    } catch (error) {
      // ignore lookup failures
    }
    try {
      if (typeof target.dataset === 'object' && target.dataset) {
        const dataset = {};
        const keys = Object.keys(target.dataset).slice(0, 6);
        keys.forEach((key) => {
          const value = target.dataset[key];
          if (typeof value === 'string' && value.trim().length) {
            dataset[key] = value.trim();
          }
        });
        if (Object.keys(dataset).length) {
          descriptor.dataset = dataset;
        }
      }
    } catch (error) {
      // ignore lookup failures
    }
    return Object.keys(descriptor).length ? descriptor : null;
  };

  const replayBufferInternal = createReplayBuffer(DEFAULT_REPLAY_LIMIT);

  const replayBufferApi = {
    record(action, detail = {}, metadata = {}) {
      return replayBufferInternal.record(action, detail, metadata);
    },
    snapshot() {
      return replayBufferInternal.snapshot();
    },
    clear() {
      replayBufferInternal.clear();
    },
    size() {
      return replayBufferInternal.size();
    },
    get limit() {
      return replayBufferInternal.limit;
    },
  };

  const patchDispatchEvent = (target, origin) => {
    if (!target || typeof target.dispatchEvent !== 'function') {
      return;
    }
    const original = target.dispatchEvent;
    if (original && original.__INFINITE_RAILS_REPLAY_PATCHED__) {
      return;
    }
    const patched = function patchedDispatchEvent(event) {
      if (event && typeof event.type === 'string' && event.type.startsWith('infinite-rails:')) {
        try {
          const detail = typeof event.detail === 'undefined' ? null : event.detail;
          const metadata = {
            origin,
            bubbles: Boolean(event.bubbles),
            cancelable: Boolean(event.cancelable),
            composed: Boolean(event.composed),
            defaultPrevented: Boolean(event.defaultPrevented),
            timeStamp: Number.isFinite(event.timeStamp) ? event.timeStamp : null,
            target: describeEventTarget(this),
          };
          replayBufferInternal.record(event.type, detail, metadata);
        } catch (error) {
          if (scope.console && typeof scope.console.debug === 'function') {
            scope.console.debug('Failed to record replay buffer event.', error);
          }
        }
      }
      return original.apply(this, arguments);
    };
    patched.__INFINITE_RAILS_REPLAY_PATCHED__ = true;
    target.dispatchEvent = patched;
  };

  patchDispatchEvent(scope, 'window');
  patchDispatchEvent(documentRef, 'document');

  const namespace =
    scope.InfiniteRails && typeof scope.InfiniteRails === 'object'
      ? scope.InfiniteRails
      : (scope.InfiniteRails = {});
  const logsApi =
    namespace.logs && typeof namespace.logs === 'object' ? namespace.logs : {};

  const pushWithLimit = (collection, entry, limit) => {
    if (!Array.isArray(collection)) {
      return;
    }
    collection.push(entry);
    if (collection.length > limit) {
      collection.splice(0, collection.length - limit);
    }
  };

  const toIsoString = (value) => {
    try {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value).toISOString();
      }
      if (typeof value === 'string' && value.trim().length) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
      return new Date().toISOString();
    } catch (error) {
      try {
        return new Date().toISOString();
      } catch (secondaryError) {
        return String(value);
      }
    }
  };

  function cloneForSnapshot(value, depth = 0, seen = new WeakSet()) {
    if (value == null) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: typeof value.stack === 'string' ? value.stack : undefined,
      };
    }
    if (typeof value === 'function') {
      return `[Function ${value.name || 'anonymous'}]`;
    }
    if (depth > 4) {
      return Object.prototype.toString.call(value);
    }
    if (Array.isArray(value)) {
      return value.slice(0, 100).map((item) => cloneForSnapshot(item, depth + 1, seen));
    }
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
      const output = {};
      for (const key of Object.keys(value)) {
        output[key] = cloneForSnapshot(value[key], depth + 1, seen);
      }
      seen.delete(value);
      return output;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return String(value);
    }
  }

  const maxEntries = 20;
  let totalCount = 0;
  let dismissedUntilNextError = false;

  const ensureString = (value) => {
    if (value == null) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (value instanceof Error) {
      return value.message || value.name || 'Error';
    }
    if (typeof value === 'object') {
      if (typeof value.message === 'string') {
        return value.message;
      }
      try {
        return JSON.stringify(value);
      } catch (error) {
        return Object.prototype.toString.call(value);
      }
    }
    return String(value);
  };

  const extractStack = (value) => {
    if (!value) {
      return '';
    }
    if (value instanceof Error && typeof value.stack === 'string') {
      return value.stack;
    }
    if (typeof value.stack === 'string') {
      return value.stack;
    }
    return '';
  };

  const trimDetail = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    if (value.length > 6000) {
      return `${value.slice(0, 6000)}…`;
    }
    return value;
  };

  const storeSessionError = (entry) => {
    const snapshot = {
      source: ensureString(entry.source) || 'Console',
      message: ensureString(entry.message) || 'An unknown error occurred.',
      detail: trimDetail(entry.detail || ''),
      timestamp: entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp ?? Date.now()),
    };
    pushWithLimit(sessionState.errors, snapshot, MAX_ERROR_HISTORY);
    return snapshot;
  };

  const storeSessionAction = (action, detail = {}, metadata = {}) => {
    const snapshot = {
      action: ensureString(action) || 'unknown-action',
      detail: cloneForSnapshot(detail),
      metadata: cloneForSnapshot(metadata),
      timestamp: new Date(),
    };
    pushWithLimit(sessionState.actions, snapshot, MAX_ACTION_HISTORY);
    return snapshot;
  };

  const storeSessionDiagnostic = (category, message, detail = {}) => {
    const snapshot = {
      category: ensureString(category) || 'general',
      message: ensureString(message) || 'Diagnostic update recorded.',
      detail: cloneForSnapshot(detail),
      timestamp: new Date(),
    };
    pushWithLimit(sessionState.diagnostics, snapshot, MAX_DIAGNOSTIC_HISTORY);
    return snapshot;
  };

  const snapshotErrors = () =>
    sessionState.errors.map((entry) => ({
      source: entry.source,
      message: entry.message,
      detail: entry.detail,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : toIsoString(entry.timestamp),
    }));

  const snapshotActions = () =>
    sessionState.actions.map((entry) => ({
      action: entry.action,
      detail: cloneForSnapshot(entry.detail),
      metadata: cloneForSnapshot(entry.metadata),
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : toIsoString(entry.timestamp),
    }));

  const snapshotDiagnostics = () =>
    sessionState.diagnostics.map((entry) => ({
      category: entry.category,
      message: entry.message,
      detail: cloneForSnapshot(entry.detail),
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : toIsoString(entry.timestamp),
    }));

  const buildSessionMetadata = () => ({
    url: typeof scope.location?.href === 'string' ? scope.location.href : null,
    userAgent: typeof scope.navigator?.userAgent === 'string' ? scope.navigator.userAgent : null,
    errorCount: sessionState.errors.length,
    actionCount: sessionState.actions.length,
    diagnosticCount: sessionState.diagnostics.length,
  });

  const exportSessionLog = (options = {}) => {
    const generatedAt = new Date();
    const includeDiagnostics = options.includeDiagnostics !== false;
    const snapshot = {
      version: 1,
      generatedAt: generatedAt.toISOString(),
      metadata: buildSessionMetadata(),
      errors: snapshotErrors(),
      actions: snapshotActions(),
      diagnostics: includeDiagnostics ? snapshotDiagnostics() : [],
      userActionReplay: replayBufferApi.snapshot(),
    };
    return snapshot;
  };

  const triggerSessionLogDownload = (options = {}) => {
    const result = exportSessionLog(options);
    const json = JSON.stringify(result, null, 2);
    const timestampLabel = result.generatedAt.replace(/[:.]/g, '-');
    const filename =
      typeof options.filename === 'string' && options.filename.trim().length
        ? options.filename.trim()
        : `infinite-rails-session-log-${timestampLabel}.json`;

    let href = null;
    let revoke = null;

    if (typeof Blob === 'function' && scope.URL && typeof scope.URL.createObjectURL === 'function') {
      try {
        const blob = new Blob([json], { type: 'application/json' });
        href = scope.URL.createObjectURL(blob);
        revoke = () => {
          try {
            scope.URL.revokeObjectURL(href);
          } catch (error) {
            if (scope.console && typeof scope.console.debug === 'function') {
              scope.console.debug('Failed to revoke session log object URL.', error);
            }
          }
        };
      } catch (error) {
        if (scope.console && typeof scope.console.debug === 'function') {
          scope.console.debug('Falling back to data URI for session log.', error);
        }
      }
    }

    if (!href) {
      href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    }

    if (documentRef && typeof documentRef.createElement === 'function') {
      const anchor = documentRef.createElement('a');
      if (anchor) {
        try {
          if (typeof anchor.setAttribute === 'function') {
            anchor.setAttribute('href', href);
            anchor.setAttribute('download', filename);
          } else {
            anchor.href = href;
            anchor.download = filename;
          }
          if (typeof anchor.click === 'function') {
            anchor.click();
          } else if (anchor.dispatchEvent) {
            try {
              const MouseEventCtor = scope.MouseEvent || scope.Event;
              if (typeof MouseEventCtor === 'function') {
                anchor.dispatchEvent(new MouseEventCtor('click', { bubbles: true, cancelable: true }));
              } else {
                anchor.dispatchEvent({ type: 'click' });
              }
            } catch (error) {
              anchor.dispatchEvent({ type: 'click' });
            }
          }
        } catch (error) {
          if (scope.console && typeof scope.console.error === 'function') {
            scope.console.error('Failed to trigger session log download.', error);
          }
        }
      }
    }

    if (revoke) {
      const schedule = typeof scope.setTimeout === 'function' ? scope.setTimeout.bind(scope) : null;
      if (schedule) {
        schedule(revoke, 2000);
      } else {
        revoke();
      }
    }

    sessionState.lastDownload = {
      snapshot: result,
      json,
      href,
      filename,
    };

    return { snapshot: result, json, href, filename };
  };

  const timeFormatter =
    typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
      ? new Intl.DateTimeFormat(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : null;

  const formatTimestamp = (timestamp) => {
    try {
      return timeFormatter ? timeFormatter.format(timestamp) : timestamp.toISOString();
    } catch (error) {
      return new Date(timestamp).toISOString();
    }
  };

  const updateCount = () => {
    if (countRef) {
      countRef.textContent = String(totalCount);
    }
  };

  const showOverlay = (force = false) => {
    if (!force && dismissedUntilNextError) {
      return;
    }
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    dismissedUntilNextError = false;
  };

  const hideOverlay = () => {
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
  };

  dismissButton?.addEventListener('click', () => {
    dismissedUntilNextError = true;
    hideOverlay();
  });

  if (typeof scope.addEventListener === 'function') {
    scope.addEventListener('keydown', (event) => {
      if (!event) {
        return;
      }
      if (event.key === 'Escape' && overlay.getAttribute('aria-hidden') === 'false') {
        dismissedUntilNextError = true;
        hideOverlay();
      }
    });
  }

  const createEntryElement = (entry) => {
    const item = documentRef.createElement('li');
    item.className = 'error-console__entry error-console__entry--new';

    const header = documentRef.createElement('div');
    header.className = 'error-console__entry-header';

    const source = documentRef.createElement('span');
    source.className = 'error-console__source';
    source.textContent = entry.source;

    const timeElement = documentRef.createElement('time');
    timeElement.className = 'error-console__time';
    timeElement.setAttribute('datetime', entry.timestamp.toISOString());
    timeElement.textContent = formatTimestamp(entry.timestamp);

    header.append(source, timeElement);

    const message = documentRef.createElement('p');
    message.className = 'error-console__message';
    message.textContent = entry.message;

    item.append(header, message);

    if (entry.detail) {
      const details = documentRef.createElement('details');
      details.className = 'error-console__details';

      const summary = documentRef.createElement('summary');
      summary.textContent = 'View stack trace';

      const pre = documentRef.createElement('pre');
      pre.className = 'error-console__stack';
      pre.textContent = entry.detail;

      details.append(summary, pre);
      item.append(details);
    }

    scope.setTimeout(() => {
      item.classList.remove('error-console__entry--new');
    }, 1200);

    return item;
  };

  const appendEntry = (entry) => {
    totalCount += 1;
    updateCount();

    const element = createEntryElement(entry);
    if (list.firstChild) {
      list.insertBefore(element, list.firstChild);
    } else {
      list.appendChild(element);
    }

    while (list.children.length > maxEntries) {
      list.removeChild(list.lastChild);
    }

    showOverlay(true);
  };

  const recordEntry = ({ source, message, detail }) => {
    const normalisedMessage = message ? message.trim() : '';
    const entry = {
      source: source || 'Console',
      message: normalisedMessage || 'An unknown error occurred.',
      detail: trimDetail(detail || ''),
      timestamp: new Date(),
    };
    storeSessionError(entry);
    appendEntry(entry);
  };

  const captureConsoleError = (args) => {
    const parts = [];
    let stack = '';

    for (const argument of args) {
      const text = ensureString(argument);
      if (text) {
        parts.push(text);
      }
      if (!stack) {
        stack = extractStack(argument);
      }
    }

    const message = parts.join(' ').trim();
    recordEntry({
      source: 'Console',
      message: message || 'Console error logged.',
      detail: stack,
    });
  };

  const captureRuntimeError = (event) => {
    if (!event) {
      return;
    }
    const message = ensureString(event.message) || 'Uncaught runtime error.';
    let detail = extractStack(event.error);
    if (!detail) {
      const location = [event.filename, event.lineno, event.colno].filter(Boolean).join(':');
      if (location) {
        detail = location;
      }
    }
    recordEntry({
      source: 'Runtime',
      message,
      detail,
    });
  };

  const captureUnhandledRejection = (event) => {
    if (!event) {
      return;
    }
    const reason = typeof event.reason !== 'undefined' ? event.reason : null;
    const message = ensureString(reason) || 'Unhandled promise rejection.';
    const detail = extractStack(reason);
    recordEntry({
      source: 'Promise',
      message,
      detail,
    });
  };

  const consoleRef = scope.console ?? {};
  const originalConsoleError =
    consoleRef && typeof consoleRef.error === 'function' ? consoleRef.error.bind(consoleRef) : null;

  if (consoleRef && typeof consoleRef === 'object') {
    consoleRef.error = function errorInterceptor(...args) {
      try {
        captureConsoleError(args);
      } catch (error) {
        originalConsoleError?.('Failed to mirror console error:', error);
      }
      if (originalConsoleError) {
        return originalConsoleError.apply(this, args);
      }
      return undefined;
    };
  }

  if (typeof scope.addEventListener === 'function') {
    scope.addEventListener('error', captureRuntimeError);
    scope.addEventListener('unhandledrejection', captureUnhandledRejection);
  }

  logsApi.getEntries = () => snapshotErrors();
  logsApi.getActions = () => snapshotActions();
  logsApi.getDiagnostics = () => snapshotDiagnostics();
  logsApi.recordAction = (action, detail = {}, metadata = {}) => {
    return storeSessionAction(action, detail, metadata);
  };
  logsApi.recordDiagnostic = (category, message, detail = {}) => {
    return storeSessionDiagnostic(category, message, detail);
  };
  logsApi.recordError = (message, options = {}) => {
    recordEntry({
      source: ensureString(options.source) || 'Manual',
      message: ensureString(message),
      detail: ensureString(options.detail),
    });
  };
  logsApi.record = logsApi.recordError;
  logsApi.exportSessionLog = (options = {}) => exportSessionLog(options);
  logsApi.downloadSessionLog = (options = {}) => triggerSessionLogDownload(options);
  logsApi.getLastDownloadMetadata = () => {
    if (!sessionState.lastDownload) {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(sessionState.lastDownload));
    } catch (error) {
      return {
        filename: sessionState.lastDownload.filename,
        href: sessionState.lastDownload.href,
        snapshot: sessionState.lastDownload.snapshot,
        json: sessionState.lastDownload.json,
      };
    }
  };

  namespace.logs = logsApi;
  namespace.replayBuffer = replayBufferApi;

  const handleDownloadClick = (event) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    try {
      showOverlay(true);
      logsApi.downloadSessionLog();
    } catch (error) {
      if (scope.console && typeof scope.console.error === 'function') {
        scope.console.error('Failed to download session log.', error);
      }
    }
  };

  if (downloadButton && typeof downloadButton.addEventListener === 'function') {
    downloadButton.addEventListener('click', handleDownloadClick);
  }

  const testHooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  testHooks.getErrorConsoleEntries = snapshotErrors;
  testHooks.getSessionLogSnapshot = (options) => exportSessionLog(options);
  testHooks.triggerSessionLogDownload = (options) => triggerSessionLogDownload(options);
  scope.__INFINITE_RAILS_TEST_HOOKS__ = testHooks;

  scope.__INFINITE_RAILS_ERROR_CONSOLE__ = {
    record: (message, options = {}) => {
      logsApi.recordError(message, options);
    },
    exportSessionLog: (options = {}) => exportSessionLog(options),
    downloadSessionLog: (options = {}) => triggerSessionLogDownload(options),
    getEntries: () => snapshotErrors(),
  };
})(typeof window !== 'undefined' ? window : undefined);

(function setupFetchCircuitBreaker(globalScope) {
  const scope =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!scope) {
    return;
  }

  if (scope.__INFINITE_RAILS_FETCH_CIRCUIT__) {
    return;
  }

  const nativeFetch =
    typeof scope.fetch === 'function'
      ? scope.fetch
      : typeof scope.window?.fetch === 'function'
        ? scope.window.fetch
        : null;
  if (typeof nativeFetch !== 'function') {
    return;
  }

  const appConfig = scope.APP_CONFIG ?? {};
  const circuitConfig = appConfig.fetchCircuitBreaker ?? {};

  const normalisePositiveInteger = (value, fallback) => {
    if (Number.isFinite(value)) {
      const numeric = Number(value);
      if (numeric >= 0) {
        return Math.floor(numeric);
      }
    }
    return fallback;
  };

  const failureThreshold = Math.max(1, normalisePositiveInteger(circuitConfig.threshold, 3));
  const failureWindowMs = Math.max(1000, normalisePositiveInteger(circuitConfig.windowMs, 15000));

  const state = {
    threshold: failureThreshold,
    windowMs: failureWindowMs,
    failureLog: new Map(),
    trippedCategories: new Set(),
    lastFailureAt: null,
    trippedAt: null,
    lastFailureDetail: new Map(),
  };

  const toLowerCase = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

  const assetRoot = typeof appConfig.assetRoot === 'string' ? appConfig.assetRoot : null;
  const apiBaseUrl = typeof appConfig.apiBaseUrl === 'string' ? appConfig.apiBaseUrl : null;

  const toAbsoluteUrl = (resource) => {
    if (typeof resource === 'string') {
      return resource;
    }
    if (resource && typeof resource.url === 'string') {
      return resource.url;
    }
    return '';
  };

  const getHeaderValue = (headers, name) => {
    if (!headers) {
      return null;
    }
    const lowerName = name.toLowerCase();
    if (typeof headers.get === 'function') {
      const value = headers.get(name);
      return typeof value === 'string' ? value : null;
    }
    if (Array.isArray(headers)) {
      for (const entry of headers) {
        if (!entry) {
          continue;
        }
        if (Array.isArray(entry)) {
          const [key, value] = entry;
          if (typeof key === 'string' && key.toLowerCase() === lowerName) {
            return typeof value === 'string' ? value : String(value ?? '');
          }
        } else if (typeof entry === 'object') {
          const key = Object.keys(entry)[0];
          if (typeof key === 'string' && key.toLowerCase() === lowerName) {
            return typeof entry[key] === 'string' ? entry[key] : String(entry[key] ?? '');
          }
        }
      }
      return null;
    }
    const normalised = typeof headers === 'object' ? headers : {};
    for (const [key, value] of Object.entries(normalised)) {
      if (typeof key === 'string' && key.toLowerCase() === lowerName) {
        return typeof value === 'string' ? value : String(value ?? '');
      }
    }
    return null;
  };

  const normaliseCategory = (value) => {
    const label = toLowerCase(value).trim();
    if (!label) {
      return null;
    }
    if (label === 'asset' || label === 'assets') {
      return 'assets';
    }
    if (label === 'api' || label === 'apis') {
      return 'api';
    }
    if (label === 'model' || label === 'models') {
      return 'models';
    }
    return null;
  };

  const inferCategory = (resource, init) => {
    const override = (() => {
      const direct = normaliseCategory(init?.infiniteRailsScope ?? init?.scope);
      if (direct) {
        return direct;
      }
      const headerOverride = normaliseCategory(
        getHeaderValue(init?.headers, 'X-Infinite-Rails-Fetch-Scope') ??
          getHeaderValue(init?.headers, 'X-Fetch-Scope'),
      );
      if (headerOverride) {
        return headerOverride;
      }
      if (resource && typeof resource === 'object') {
        const requestScope = normaliseCategory(resource.infiniteRailsScope ?? resource.scope);
        if (requestScope) {
          return requestScope;
        }
        if (typeof resource.headers === 'object') {
          const headerScope = normaliseCategory(
            getHeaderValue(resource.headers, 'X-Infinite-Rails-Fetch-Scope') ??
              getHeaderValue(resource.headers, 'X-Fetch-Scope'),
          );
          if (headerScope) {
            return headerScope;
          }
        }
      }
      return null;
    })();
    if (override) {
      return override;
    }

    const absoluteUrl = toAbsoluteUrl(resource);
    if (!absoluteUrl) {
      return 'api';
    }

    const lowerUrl = absoluteUrl.toLowerCase();
    if (assetRoot && lowerUrl.startsWith(assetRoot.toLowerCase())) {
      return 'assets';
    }
    if (apiBaseUrl && lowerUrl.startsWith(apiBaseUrl.toLowerCase())) {
      return 'api';
    }
    if (/(?:^|\/)api\//.test(lowerUrl)) {
      return 'api';
    }
    if (/\.glb(?:[?#]|$)|\.gltf(?:[?#]|$)/.test(lowerUrl)) {
      return 'models';
    }
    if (/\.(?:png|jpe?g|gif|webp|mp3|ogg|wav|m4a|json|js|css|wasm)(?:[?#]|$)/.test(lowerUrl)) {
      return 'assets';
    }
    return 'api';
  };

  const shouldBypassCircuit = (category, init) => {
    if (!init) {
      return false;
    }
    if (init.infiniteRailsBypassCircuit === true || init.bypassCircuit === true) {
      return true;
    }
    const headerValue = getHeaderValue(init.headers, 'X-Infinite-Rails-Circuit-Bypass');
    if (headerValue && headerValue.toLowerCase() === 'true') {
      return true;
    }
    if (Array.isArray(init.tags) && init.tags.includes('allow-fetch-circuit-bypass')) {
      return true;
    }
    return false;
  };

  const pruneFailures = (category, now) => {
    const bucket = state.failureLog.get(category);
    if (!bucket) {
      return;
    }
    const cutoff = now - state.windowMs;
    while (bucket.length && bucket[0].timestamp < cutoff) {
      bucket.shift();
    }
    if (bucket.length === 0) {
      state.failureLog.delete(category);
    }
  };

  const markCircuitBodyState = (category) => {
    const body = scope.document?.body ?? null;
    if (!body) {
      return;
    }
    if (!body.dataset) {
      body.dataset = {};
    }
    body.dataset.fetchCircuit = 'true';
    body.dataset.fetchCircuitCategory = category;
    if (typeof body.setAttribute === 'function') {
      body.setAttribute('data-fetch-circuit', 'true');
      body.setAttribute('data-fetch-circuit-category', category);
    }
  };

  const clearCircuitBodyState = () => {
    const body = scope.document?.body ?? null;
    if (!body) {
      return;
    }
    if (body.dataset) {
      delete body.dataset.fetchCircuit;
      delete body.dataset.fetchCircuitCategory;
    }
    if (typeof body.removeAttribute === 'function') {
      body.removeAttribute('data-fetch-circuit');
      body.removeAttribute('data-fetch-circuit-category');
    }
  };

  const dispatchCircuitEvent = (type, detail) => {
    const eventDetail = { detail };
    const CustomEventCtor = scope.CustomEvent ?? (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
    if (CustomEventCtor) {
      try {
        const eventInstance = new CustomEventCtor(type, { detail, bubbles: false, cancelable: false });
        if (scope.document && typeof scope.document.dispatchEvent === 'function') {
          scope.document.dispatchEvent(eventInstance);
          return;
        }
        if (typeof scope.dispatchEvent === 'function') {
          scope.dispatchEvent(eventInstance);
          return;
        }
      } catch (error) {
        if (scope.console && typeof scope.console.debug === 'function') {
          scope.console.debug(
            `dispatchCircuitEvent: CustomEvent dispatch failed for "${type}" — falling back to synthetic event dispatch.`,
            error,
          );
        }
      }
    }
    if (scope.document && typeof scope.document.dispatchEvent === 'function') {
      try {
        scope.document.dispatchEvent({ type, ...eventDetail });
      } catch (error) {
        if (scope.console && typeof scope.console.debug === 'function') {
          scope.console.debug(
            `dispatchCircuitEvent: Synthetic dispatch failed for "${type}" in fetch circuit telemetry handler.`,
            error,
          );
        }
      }
    }
  };

  const tripCircuit = (category, info) => {
    if (state.trippedCategories.has(category)) {
      return;
    }
    state.trippedCategories.add(category);
    state.trippedAt = Date.now();
    state.lastFailureDetail.set(category, info);
    markCircuitBodyState(category);
    if (scope.console && typeof scope.console.warn === 'function') {
      scope.console.warn(`Fetch circuit breaker tripped for ${category} requests.`, info?.error ?? info?.response ?? info);
    }
    dispatchCircuitEvent('infinite-rails:fetch-circuit-tripped', {
      category,
      info,
      threshold: state.threshold,
      windowMs: state.windowMs,
    });
  };

  const recordFailure = (category, info) => {
    const now = Date.now();
    const bucket = state.failureLog.get(category) ?? [];
    bucket.push({ timestamp: now, info });
    if (bucket.length > state.threshold + 5) {
      bucket.splice(0, bucket.length - (state.threshold + 5));
    }
    state.failureLog.set(category, bucket);
    state.lastFailureAt = now;
    state.lastFailureDetail.set(category, info);
    pruneFailures(category, now);
    if (bucket.length > state.threshold) {
      tripCircuit(category, info);
    }
  };

  const recordSuccess = (category) => {
    pruneFailures(category, Date.now());
  };

  const wrappedFetch = (resource, init) => {
    const category = inferCategory(resource, init);
    const bypass = shouldBypassCircuit(category, init);
    if (!bypass && state.trippedCategories.has(category)) {
      const error = new Error(`Fetch circuit breaker tripped for ${category} requests.`);
      error.name = 'FetchCircuitTrippedError';
      error.circuitCategory = category;
      error.fetchResource = resource;
      error.fetchInit = init;
      return Promise.reject(error);
    }

    let fetchResult;
    try {
      fetchResult = nativeFetch.call(scope, resource, init);
    } catch (error) {
      recordFailure(category, { error, phase: 'invoke', resource, init });
      throw error;
    }

    if (!fetchResult || typeof fetchResult.then !== 'function') {
      return fetchResult;
    }

    return Promise.resolve(fetchResult)
      .then((response) => {
        if (!response || typeof response.ok !== 'boolean') {
          recordFailure(category, { response, phase: 'invalid-response', resource, init });
          return response;
        }
        if (!response.ok) {
          recordFailure(category, {
            response,
            status: response.status,
            statusText: response.statusText,
            phase: 'http',
            resource,
            init,
          });
        } else {
          recordSuccess(category);
        }
        return response;
      })
      .catch((error) => {
        recordFailure(category, { error, phase: 'rejection', resource, init });
        throw error;
      });
  };

  const resetCircuit = () => {
    state.failureLog.clear();
    state.trippedCategories.clear();
    state.lastFailureAt = null;
    state.trippedAt = null;
    state.lastFailureDetail.clear();
    clearCircuitBodyState();
  };

  const hooks = scope.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.getFetchCircuitState = () => ({
    threshold: state.threshold,
    windowMs: state.windowMs,
    tripped: state.trippedCategories.size > 0,
    trippedCategories: Array.from(state.trippedCategories),
    lastFailureAt: state.lastFailureAt,
    trippedAt: state.trippedAt,
    failureCounts: Object.fromEntries(Array.from(state.failureLog.entries(), ([key, entries]) => [key, entries.length])),
  });
  hooks.isFetchCircuitTripped = (category) => state.trippedCategories.has(normaliseCategory(category) ?? category);
  hooks.resetFetchCircuitBreaker = () => {
    resetCircuit();
  };
  hooks.tripFetchCircuit = (category) => {
    const resolved = normaliseCategory(category) ?? 'api';
    tripCircuit(resolved, { phase: 'manual' });
  };
  scope.__INFINITE_RAILS_TEST_HOOKS__ = hooks;

  scope.__INFINITE_RAILS_FETCH_CIRCUIT__ = {
    originalFetch: nativeFetch,
    state,
    reset: resetCircuit,
  };

  try {
    Object.defineProperty(wrappedFetch, 'name', { value: 'fetch', configurable: true });
  } catch (error) {
    if (scope.console && typeof scope.console.debug === 'function') {
      scope.console.debug(
        'wrapFetch: Unable to redefine wrapped fetch function name for fetch circuit diagnostics.',
        error,
      );
    }
  }

  if (typeof scope.fetch === 'function') {
    scope.fetch = wrappedFetch;
  }
  if (scope.window && typeof scope.window.fetch === 'function') {
    scope.window.fetch = wrappedFetch;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

(function applyProductionAssetRoot(globalScope) {
  if (!globalScope || typeof globalScope !== 'object') {
    return;
  }

  try {
    Object.defineProperty(globalScope, 'PRODUCTION_ASSET_ROOT', {
      value: PRODUCTION_ASSET_ROOT,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  } catch (error) {
    globalScope.PRODUCTION_ASSET_ROOT = PRODUCTION_ASSET_ROOT;
  }

  const appConfig = globalScope.APP_CONFIG || (globalScope.APP_CONFIG = {});
  if (typeof appConfig.assetRoot !== 'string' || !appConfig.assetRoot.trim()) {
    appConfig.assetRoot = PRODUCTION_ASSET_ROOT;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);

      message: 'Open Diagnostics → Assets to restore missing files, or reload manually if prompted.',
    message = 'An unexpected error occurred. Open Diagnostics for recovery steps before restarting.',
      userMessage: 'The game failed to initialise. Open Diagnostics → Renderer for recovery steps before restarting.',
      diagnosticMessage: 'Bootstrap sequence failed. Review Diagnostics → Renderer before restarting.',
      logMessage: 'Bootstrap sequence failed. Player prompted to follow Diagnostics → Renderer recovery steps.',
      userMessage: 'Failed to initialise the renderer. Open Diagnostics → Renderer for recovery guidance before restarting.',
      diagnosticMessage: 'Failed to initialise the renderer. Review Diagnostics → Renderer for recovery guidance.',
      logMessage: 'Failed to initialise the renderer. Player prompted to follow Diagnostics → Renderer recovery guidance.',
      userMessage: 'We hit a snag while starting the expedition. Open Diagnostics → Renderer for recovery steps before restarting.',
      userMessage: 'The tutorial overlay failed to open. Open Diagnostics → Renderer for recovery steps before restarting.',
      userMessage: 'An unexpected error occurred. Open Diagnostics for recovery steps before restarting.',
  const CIRCUIT_BREAKER_GUIDANCE = Object.freeze({
    renderer:
      'Open Diagnostics → Renderer to review the error details and follow the recovery steps before restarting.',
    assets:
      'Open Diagnostics → Assets to retry the missing downloads or activate the offline pack before restarting.',
    models:
      'Open Diagnostics → Models to retry the missing downloads or contact support with the listed files before restarting.',
    input:
      'Open Diagnostics → Renderer to review the input error and follow the recovery steps before restarting.',
    default:
      'Open Diagnostics to review the issue and follow the recovery steps before restarting.',
  });

  function appendCircuitBreakerGuidance(message, scope = 'default') {
    const trimmed = typeof message === 'string' ? message.trim() : '';
    const scopeKey = typeof scope === 'string' && scope.trim().length ? scope.trim().toLowerCase() : 'default';
    const guidance = CIRCUIT_BREAKER_GUIDANCE[scopeKey] || CIRCUIT_BREAKER_GUIDANCE.default;
    if (!trimmed) {
      return guidance;
    }
    const normalised = trimmed.toLowerCase();
    if (normalised.includes('diagnostic') || normalised.includes('support.infiniterails.app')) {
      return trimmed;
    }
    const separator = trimmed.endsWith('.') ? ' ' : '. ';
    return `${trimmed}${separator}${guidance}`;
  }

    const scope =
      typeof detail?.scope === 'string' && detail.scope.trim().length
        ? detail.scope.trim().toLowerCase()
        : 'renderer';
        : 'Renderer unavailable';
      let message = baseMessage;
      if (stage && !message.includes(`(${stage})`)) {
        message = `${message} (${stage})`;
      }
      return appendCircuitBreakerGuidance(message, scope);
    const debugMessage = extras.length ? `${baseMessage}\n\n${extras.join('\n')}` : baseMessage;
    return appendCircuitBreakerGuidance(debugMessage, scope);
      const scopeLabel =
        typeof detail.scope === 'string' && detail.scope.trim().length
          ? detail.scope.trim().toLowerCase()
          : 'renderer';
      if (typeof detail.message === 'string' && detail.message.trim().length) {
        detail.message = appendCircuitBreakerGuidance(detail.message, scopeLabel);
      } else {
        detail.message = appendCircuitBreakerGuidance('Renderer unavailable', scopeLabel);
    const rendererMessage = appendCircuitBreakerGuidance('Unable to load the 3D renderer.', 'renderer');
    const diagnosticMessage = appendCircuitBreakerGuidance('Three.js failed to load.', 'renderer');
      message: rendererMessage,
      diagnosticMessage,
          message: rendererMessage,
          message: diagnosticMessage,
      message: rendererMessage,
              : 'Critical assets failed to preload.';
          const actionableMessage = appendCircuitBreakerGuidance(errorMessage, 'assets');
            message: actionableMessage,
            diagnosticMessage: actionableMessage,
            logMessage: actionableMessage,
          markBootPhaseError('assets', actionableMessage);
          markBootPhaseError('gltf', appendCircuitBreakerGuidance('Critical models unavailable — cannot continue.', 'models'));
          markBootPhaseError('controls', appendCircuitBreakerGuidance('Controls disabled until assets load.', 'assets'));
              message: actionableMessage,
        userMessage: 'Fallback renderer failed to start. Open Diagnostics → Renderer for recovery steps before restarting.',
          userMessage: 'Renderer entrypoint is missing from the build output. Open Diagnostics → Renderer for recovery steps before restarting.',

(function setupBackendHealthMonitor(globalScope) {
  const globalRef =
    typeof globalScope !== 'undefined'
      ? globalScope
      : typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
  if (!globalRef) {
    return;
  }

  const documentRef = globalRef.document ?? null;
  const state = {
    performed: false,
    success: null,
    detail: null,
    promise: null,
  };

  let cachedScoreboardEl = null;

  function getScoreboardStatusElement() {
    if (cachedScoreboardEl && cachedScoreboardEl.isConnected !== false) {
      return cachedScoreboardEl;
    }
    if (!documentRef || typeof documentRef.getElementById !== 'function') {
      return null;
    }
    const element = documentRef.getElementById('scoreboardStatus');
    if (!element) {
      return null;
    }
    element.dataset = element.dataset || {};
    cachedScoreboardEl = element;
    return element;
  }

  function setOfflineScoreboardMessage(message) {
    const element = getScoreboardStatusElement();
    if (!element) {
      return;
    }
    element.dataset = element.dataset || {};
    element.dataset.offline = 'true';
    if (typeof element.setAttribute === 'function') {
      element.setAttribute('data-offline', 'true');
    }
    const resolved = typeof message === 'string' && message.trim().length ? message.trim() : 'Offline session active — backend validation failed.';
    element.textContent = resolved;
  }

  function clearOfflineScoreboardState() {
    const element = getScoreboardStatusElement();
    if (!element) {
      return;
    }
    if (element.dataset) {
      delete element.dataset.offline;
    }
    if (typeof element.removeAttribute === 'function') {
      element.removeAttribute('data-offline');
    }
  }

  function normaliseApiBaseUrl(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const url = new URL(trimmed, trimmed.startsWith('http') ? undefined : 'https://example.com');
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }
      const normalised = `${url.origin}${url.pathname}`.replace(/\/+$/, '');
      return normalised || null;
    } catch (error) {
      return null;
    }
  }

  function buildOfflineMessage(reasons) {
    const base = 'Offline session active';
    if (!Array.isArray(reasons) || reasons.length === 0) {
      return `${base} — backend validation failed.`;
    }
    return `${base} — ${reasons.join('; ')}`;
  }

  function recordFailure(reason, detail = {}) {
    const detailReason = typeof reason === 'string' ? reason : 'unknown';
    const detailMessage =
      typeof detail.message === 'string' && detail.message.trim().length
        ? detail.message.trim()
        : 'Offline session active — backend validation failed.';
    state.performed = true;
    state.success = false;
    state.detail = { ...detail, reason: detailReason, message: detailMessage };
    setOfflineScoreboardMessage(state.detail.message);
    return false;
  }

  async function pingEndpoint(fetchImpl, baseUrl, endpoint) {
    const method = endpoint.method ?? 'GET';
    const url = `${baseUrl}${endpoint.path}`;
    try {
      const response = await fetchImpl(url, { method, credentials: 'include', cache: 'no-store' });
      if (!response || typeof response.ok !== 'boolean') {
        throw new Error('invalid-response');
      }
      if (!response.ok) {
        const status = Number.isFinite(response.status) ? response.status : '???';
        const statusText = typeof response.statusText === 'string' && response.statusText.trim().length ? ` ${response.statusText.trim()}` : '';
        const error = new Error(`${method.toUpperCase()} ${endpoint.path} returned ${status}${statusText}`);
        error.name = 'EndpointStatusError';
        error.status = status;
        error.endpoint = endpoint.path;
        throw error;
      }
      return null;
    } catch (error) {
      if (error && error.name === 'EndpointStatusError') {
        return error.message;
      }
      const message = `${method.toUpperCase()} ${endpoint.path} unreachable`;
      return message;
    }
  }

  async function performBackendValidation() {
    const fetchImpl = globalRef.fetch ?? null;
    if (typeof fetchImpl !== 'function') {
      return recordFailure('fetch-unavailable', {
        message: 'Offline session active — fetch API unavailable on this platform.',
        detail: { reason: 'fetch-unavailable' },
      });
    }

    const appConfig = globalRef.APP_CONFIG ?? {};
    const apiBaseUrl = normaliseApiBaseUrl(appConfig.apiBaseUrl);
    if (!apiBaseUrl) {
      return recordFailure('api-base-url-missing', {
        message: 'Offline session active — backend configuration missing.',
      });
    }

    const endpoints = [
      { path: '/scores', method: 'GET' },
      { path: '/scores', method: 'POST' },
      { path: '/users', method: 'GET' },
      { path: '/users', method: 'POST' },
      { path: '/events', method: 'POST' },
    ];

    const failures = [];
    for (const endpoint of endpoints) {
      const failure = await pingEndpoint(fetchImpl, apiBaseUrl, endpoint);
      if (failure) {
        failures.push(failure);
      }
    }

    if (failures.length) {
      const message = buildOfflineMessage(failures);
      return recordFailure('endpoint-failure', {
        message,
        failures,
      });
    }

    state.performed = true;
    state.success = true;
    state.detail = {
      reason: 'ok',
      message: 'Backend validation succeeded.',
    };
    clearOfflineScoreboardState();
    return true;
  }

  function ensureBackendLiveCheck() {
    if (state.promise) {
      return state.promise;
    }
    const task = async () => {
      const result = await performBackendValidation();
      return Boolean(result);
    };
    state.promise = task().catch((error) => {
      const message = 'Offline session active — backend validation failed.';
      recordFailure('unexpected-error', {
        message,
        error,
      });
      return false;
    });
    return state.promise;
  }

  function getBackendLiveCheckState() {
    return { ...state };
  }

  const hooks = globalRef.__INFINITE_RAILS_TEST_HOOKS__ ?? {};
  hooks.ensureBackendLiveCheck = ensureBackendLiveCheck;
  hooks.getBackendLiveCheckState = getBackendLiveCheckState;
  globalRef.__INFINITE_RAILS_TEST_HOOKS__ = hooks;

  const autoStart = () => {
    try {
      ensureBackendLiveCheck();
    } catch (error) {
      recordFailure('unexpected-error', {
        message: 'Offline session active — backend validation failed.',
        error,
      });
    }
  };

  if (!documentRef || typeof documentRef.addEventListener !== 'function') {
    autoStart();
    return;
  }

  const readyState = String(documentRef.readyState || '').toLowerCase();
  if (readyState === 'complete' || readyState === 'interactive') {
    Promise.resolve().then(autoStart);
  } else {
    documentRef.addEventListener('DOMContentLoaded', autoStart, { once: true });
  }
})(typeof window !== 'undefined' ? window : undefined);
