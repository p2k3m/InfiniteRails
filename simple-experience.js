  const TRACE_METADATA_SYMBOL =
    typeof Symbol === 'function' ? Symbol.for('infiniteRails.traceMetadata') : '__infiniteRailsTraceMetadata__';

  function createTraceUtilitiesForScope(activeScope) {
    const targetScope = activeScope || (typeof globalThis !== 'undefined' ? globalThis : null);

    function generateRandomUUID() {
      const cryptoRef = targetScope?.crypto ?? (typeof crypto !== 'undefined' ? crypto : null);
      if (cryptoRef?.randomUUID) {
        try {
          return cryptoRef.randomUUID();
        } catch (error) {
          // fall through to manual implementation
        }
      }
      const buffer = new Uint8Array(16);
      if (cryptoRef?.getRandomValues) {
        cryptoRef.getRandomValues(buffer);
      } else {
        for (let index = 0; index < buffer.length; index += 1) {
          buffer[index] = Math.floor(Math.random() * 256);
        }
      }
      buffer[6] = (buffer[6] & 0x0f) | 0x40;
      buffer[8] = (buffer[8] & 0x3f) | 0x80;
      const hex = Array.from(buffer, (value) => value.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex
        .slice(8, 10)
        .join('')}-${hex.slice(10, 16).join('')}`;
    }

    const sessionId = generateRandomUUID();
    let counter = 0;

    function resolveTraceId(provided, label = 'trace') {
      if (typeof provided === 'string' && provided.trim().length) {
        return provided.trim();
      }
      counter += 1;
      const suffix = generateRandomUUID();
      return `${sessionId}-${label}-${counter}-${suffix}`;
    }

    function enrichDetail(detail, traceId, session = sessionId) {
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
        return detail;
      }
      const existingTrace = detail.trace && typeof detail.trace === 'object' ? detail.trace : {};
      return {
        ...detail,
        trace: {
          ...existingTrace,
          traceId: existingTrace.traceId ?? traceId,
          sessionId: existingTrace.sessionId ?? session,
        },
      };
    }

    const manager = {
      sessionId,
      resolveTraceId,
      createTraceId(label = 'trace') {
        return resolveTraceId(null, label);
      },
      buildContext(provided, label = 'trace') {
        const traceId = resolveTraceId(provided, label);
        return { traceId, sessionId };
      },
      enrichDetail,
    };

    if (targetScope) {
      try {
        targetScope.__INFINITE_RAILS_TRACE__ = manager;
        targetScope.InfiniteRails = targetScope.InfiniteRails || {};
        targetScope.InfiniteRails.trace = manager;
      } catch (error) {
        targetScope?.console?.debug?.('Failed to expose trace utilities from simple experience.', error);
      }
    }

    return manager;
  }

  function isMockFunction(fn) {
    if (!fn || typeof fn !== 'function') {
      return false;
    }
    if (typeof fn.getMockName === 'function') {
      return true;
    }
    if (typeof fn.mock === 'object' && fn.mock !== null) {
      return true;
    }
    return Boolean(fn._isMockFunction);
  }

  function createConsoleTraceMetadata(context) {
    const metadata = {
      traceId: context.traceId,
      sessionId: context.sessionId,
      trace: {
        traceId: context.traceId,
        sessionId: context.sessionId,
        source: 'console',
      },
    };
    if (TRACE_METADATA_SYMBOL && typeof Object.defineProperty === 'function') {
      try {
        Object.defineProperty(metadata, TRACE_METADATA_SYMBOL, {
          value: true,
          enumerable: false,
          configurable: true,
        });
      } catch (error) {
        // ignore metadata flag failures
      }
    }
    return metadata;
  }

  function applyTraceHeadersToFetchArgs(scopeRef, resource, init, context) {
    const activeScope = scopeRef || (typeof globalThis !== 'undefined' ? globalThis : null);
    const RequestCtor = activeScope?.Request || (typeof Request !== 'undefined' ? Request : null);
    const HeadersCtor = activeScope?.Headers || (typeof Headers !== 'undefined' ? Headers : null);
    const baseInit = init && typeof init === 'object' ? { ...init } : undefined;
    const headers = new Map();

    const assignHeader = (key, value) => {
      if (typeof key !== 'string') {
        return;
      }
      const trimmed = key.trim();
      if (!trimmed) {
        return;
      }
      if (typeof value === 'undefined' || value === null) {
        return;
      }
      const serialised = Array.isArray(value) ? value.map((item) => String(item)).join(', ') : String(value);
      headers.set(trimmed, serialised);
    };

    const mergeHeaders = (source) => {
      if (!source) {
        return;
      }
      if (typeof source.forEach === 'function') {
        try {
          source.forEach((value, key) => {
            assignHeader(key, value);
          });
          return;
        } catch (error) {
          // fall through to alternate strategies
        }
      }
      if (Array.isArray(source)) {
        source.forEach((entry) => {
          if (!entry) {
            return;
          }
          const [name, value] = entry;
          assignHeader(name, value);
        });
        return;
      }
      if (typeof source === 'object') {
        Object.keys(source).forEach((name) => {
          assignHeader(name, source[name]);
        });
      }
    };

    if (RequestCtor && resource instanceof RequestCtor) {
      mergeHeaders(resource.headers);
    }
    if (init && typeof init === 'object' && 'headers' in init) {
      mergeHeaders(init.headers);
    }

    assignHeader('x-trace-id', context.traceId);
    assignHeader('x-trace-session', context.sessionId);

    const buildHeaders = () => {
      if (HeadersCtor) {
        const headersInstance = new HeadersCtor();
        headers.forEach((value, key) => {
          headersInstance.set(key, value);
        });
        return headersInstance;
      }
      const headerObject = {};
      headers.forEach((value, key) => {
        headerObject[key] = value;
      });
      return headerObject;
    };

    if (RequestCtor && resource instanceof RequestCtor) {
      const requestInit = baseInit ? { ...baseInit } : {};
      if (requestInit && typeof requestInit === 'object') {
        if ('headers' in requestInit) {
          delete requestInit.headers;
        }
        if ('traceId' in requestInit) {
          delete requestInit.traceId;
        }
        if ('sessionId' in requestInit) {
          delete requestInit.sessionId;
        }
      }
      requestInit.headers = buildHeaders();
      return { resource: new RequestCtor(resource, requestInit), init: undefined };
    }

    const finalInit = baseInit ? { ...baseInit } : {};
    if (finalInit && typeof finalInit === 'object') {
      if ('headers' in finalInit) {
        delete finalInit.headers;
      }
      if ('traceId' in finalInit) {
        delete finalInit.traceId;
      }
      if ('sessionId' in finalInit) {
        delete finalInit.sessionId;
      }
    }
    finalInit.headers = buildHeaders();
    return { resource, init: finalInit };
  }

  function installConsoleTraceHooksForScope(scopeRef, traceManager) {
    const consoleRef = scopeRef?.console || (typeof console !== 'undefined' ? console : null);
    if (!consoleRef || consoleRef.__infiniteRailsTraceWrapped) {
      return;
    }
    const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'assert'];
    methods.forEach((method) => {
      const original = consoleRef[method];
      if (typeof original !== 'function' || original.__infiniteRailsTraceWrapped || isMockFunction(original)) {
        return;
      }
      const instrumented = function tracedConsole(...args) {
        const context = traceManager.buildContext(null, `console-${method}`);
        const metadata = createConsoleTraceMetadata(context);
        return Reflect.apply(original, consoleRef, [...args, metadata]);
      };
      instrumented.__infiniteRailsTraceWrapped = true;
      instrumented.__infiniteRailsTraceOriginal = original;
      consoleRef[method] = instrumented;
    });
    try {
      Object.defineProperty(consoleRef, '__infiniteRailsTraceWrapped', {
        value: true,
        configurable: true,
      });
    } catch (error) {
      consoleRef.__infiniteRailsTraceWrapped = true;
    }
    try {
      Object.defineProperty(consoleRef, '__infiniteRailsTraceSessionId', {
        value: traceManager.sessionId,
        configurable: true,
      });
    } catch (error) {
      consoleRef.__infiniteRailsTraceSessionId = traceManager.sessionId;
    }
    try {
      Object.defineProperty(consoleRef, '__infiniteRailsTraceMetadataSymbol', {
        value: TRACE_METADATA_SYMBOL,
        configurable: true,
      });
    } catch (error) {
      consoleRef.__infiniteRailsTraceMetadataSymbol = TRACE_METADATA_SYMBOL;
    }
  }

  function installFetchTraceHooksForScope(scopeRef, traceManager) {
    const targetScope = scopeRef || (typeof globalThis !== 'undefined' ? globalThis : null);
    const fetchRef = targetScope?.fetch || (typeof fetch === 'function' ? fetch : null);
    if (typeof fetchRef !== 'function') {
      return;
    }
    if (fetchRef.__infiniteRailsDiagnosticsWrapped) {
      return;
    }
    const underlyingFetch =
      typeof fetchRef.__infiniteRailsTraceOriginal === 'function' ? fetchRef.__infiniteRailsTraceOriginal : fetchRef;
    const boundFetch = underlyingFetch.bind(targetScope ?? underlyingFetch);
    const wrappedFetch = function tracedFetch(resource, init) {
      const context = traceManager.buildContext(init?.traceId ?? null, 'fetch');
      const traced = applyTraceHeadersToFetchArgs(targetScope, resource, init, context);
      const finalArgs = typeof traced.init === 'undefined' ? [traced.resource] : [traced.resource, traced.init];
      return boundFetch(...finalArgs);
    };
    wrappedFetch.__infiniteRailsTraceWrapped = true;
    wrappedFetch.__infiniteRailsTraceOriginal = underlyingFetch;
    targetScope.fetch = wrappedFetch;
    const globalRef = typeof globalThis !== 'undefined' ? globalThis : null;
    if (globalRef && globalRef !== targetScope && globalRef.fetch === fetchRef) {
      globalRef.fetch = wrappedFetch;
    }
  }

  const traceUtilities = (() => {
    const targetScope = runtimeScope || scope || (typeof globalThis !== 'undefined' ? globalThis : null);
    const existing =
      targetScope?.__INFINITE_RAILS_TRACE__ && typeof targetScope.__INFINITE_RAILS_TRACE__.buildContext === 'function'
        ? targetScope.__INFINITE_RAILS_TRACE__
        : null;
    const manager = existing || createTraceUtilitiesForScope(targetScope);
    installConsoleTraceHooksForScope(targetScope, manager);
    installFetchTraceHooksForScope(targetScope, manager);
    return manager;
  })();

