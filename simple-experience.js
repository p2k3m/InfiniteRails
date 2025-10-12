  const TRACE_HEADER_TRACE_ID = 'X-Trace-Id';
  const TRACE_HEADER_SESSION_ID = 'X-Trace-Session';
    assignHeader(TRACE_HEADER_TRACE_ID, context.traceId);
    assignHeader(TRACE_HEADER_SESSION_ID, context.sessionId);
  function installXmlHttpRequestTraceHooksForScope(scopeRef, traceManager) {
    const targetScope = scopeRef || (typeof globalThis !== 'undefined' ? globalThis : null);
    const XhrCtor = targetScope?.XMLHttpRequest;
    const prototype = XhrCtor?.prototype || null;
    if (!XhrCtor || !prototype) {
      return;
    }
    if (XhrCtor.__infiniteRailsTraceWrapped || prototype.__infiniteRailsTraceWrapped) {
      return;
    }
    const originalOpen = prototype.open;
    const originalSend = prototype.send;
    if (typeof originalOpen !== 'function' || typeof originalSend !== 'function') {
      return;
    }

    const tracedOpen = function tracedXmlHttpRequestOpen(method, url, async, user, password) {
      const label =
        typeof method === 'string' && method.trim().length
          ? `xhr-${method.trim().toLowerCase()}`
          : 'xhr';
      try {
        const context = traceManager.buildContext(null, label);
        this.__infiniteRailsTraceContext = context;
        this.__infiniteRailsTraceLabel = label;
      } catch (error) {
        this.__infiniteRailsTraceContext = null;
        this.__infiniteRailsTraceLabel = 'xhr';
        targetScope?.console?.debug?.('Failed to build trace context for XMLHttpRequest.', error);
      }
      return Reflect.apply(originalOpen, this, [method, url, async, user, password]);
    };

    const tracedSend = function tracedXmlHttpRequestSend(body) {
      const label = typeof this.__infiniteRailsTraceLabel === 'string' ? this.__infiniteRailsTraceLabel : 'xhr';
      let context = this.__infiniteRailsTraceContext;
      if (!context || typeof context.traceId !== 'string') {
        try {
          context = traceManager.buildContext(null, label);
        } catch (error) {
          context = null;
          targetScope?.console?.debug?.('Failed to generate XMLHttpRequest trace context during send.', error);
        }
      }
      if (context && typeof this.setRequestHeader === 'function') {
        try {
          this.setRequestHeader(TRACE_HEADER_TRACE_ID, context.traceId);
          this.setRequestHeader(TRACE_HEADER_SESSION_ID, context.sessionId);
        } catch (error) {
          targetScope?.console?.debug?.('Failed to attach trace headers to XMLHttpRequest.', error);
        }
      }
      try {
        return Reflect.apply(originalSend, this, [body]);
      } finally {
        this.__infiniteRailsTraceContext = null;
        this.__infiniteRailsTraceLabel = null;
      }
    };

    tracedOpen.__infiniteRailsTraceOriginal = originalOpen;
    tracedSend.__infiniteRailsTraceOriginal = originalSend;

    prototype.open = tracedOpen;
    prototype.send = tracedSend;

    try {
      Object.defineProperty(prototype, '__infiniteRailsTraceWrapped', {
        value: true,
        configurable: true,
      });
    } catch (error) {
      prototype.__infiniteRailsTraceWrapped = true;
    }

    try {
      Object.defineProperty(XhrCtor, '__infiniteRailsTraceWrapped', {
        value: true,
        configurable: true,
      });
    } catch (error) {
      XhrCtor.__infiniteRailsTraceWrapped = true;
    }
  }

    installXmlHttpRequestTraceHooksForScope(targetScope, manager);
