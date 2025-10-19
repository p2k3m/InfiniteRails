'use strict';

const crypto = require('crypto');

/**
 * HTTP header containing the distributed trace identifier for requests.
 * @type {string}
 */
const TRACE_HEADER_TRACE_ID = 'X-Trace-Id';
/**
 * HTTP header containing the client session identifier.
 * @type {string}
 */
const TRACE_HEADER_SESSION_ID = 'X-Trace-Session';
/**
 * HTTP header containing the API Gateway request identifier.
 * @type {string}
 */
const TRACE_HEADER_REQUEST_ID = 'X-Request-Id';

function safeTrim(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = safeTrim(entry);
      if (result) {
        return result;
      }
    }
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value).trim();
}

function createFallbackUUID() {
  const buffer = crypto.randomBytes(16);
  buffer[6] = (buffer[6] & 0x0f) | 0x40;
  buffer[8] = (buffer[8] & 0x3f) | 0x80;
  const hex = buffer.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generateTraceIdentifier() {
  if (typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (error) {
      // Ignore and fall back to manual generation below.
    }
  }
  return createFallbackUUID();
}

function normaliseHeaders(headers) {
  const map = new Map();
  if (!headers || typeof headers !== 'object') {
    return map;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== 'string') {
      continue;
    }
    const normalisedKey = key.trim().toLowerCase();
    if (!normalisedKey) {
      continue;
    }
    if (!map.has(normalisedKey)) {
      map.set(normalisedKey, value);
    }
  }
  return map;
}

function resolveHeader(map, name) {
  if (!map || !name) {
    return '';
  }
  const value = map.get(name.trim().toLowerCase());
  return safeTrim(value);
}

function buildTraceHeaders(traceId, sessionId, requestId) {
  const headers = {};
  if (traceId) {
    headers[TRACE_HEADER_TRACE_ID] = traceId;
  }
  if (sessionId) {
    headers[TRACE_HEADER_SESSION_ID] = sessionId;
  }
  if (requestId) {
    headers[TRACE_HEADER_REQUEST_ID] = requestId;
  }
  return headers;
}

/**
 * Builds a trace context from API Gateway event metadata and AWS context values.
 *
 * @param {object} [event]
 * @param {object} [awsContext]
 * @returns {{ traceId: string, sessionId: string, requestId: string | null, headers: Record<string, string> }}
 */
function createTraceContext(event = {}, awsContext = {}) {
  const headerMap = normaliseHeaders(event?.headers);

  const providedTraceId = safeTrim(
    resolveHeader(headerMap, TRACE_HEADER_TRACE_ID) ||
      event?.traceId ||
      event?.headers?.traceId ||
      event?.headers?.TraceId,
  );
  const providedSessionId = safeTrim(
    resolveHeader(headerMap, TRACE_HEADER_SESSION_ID) ||
      event?.sessionId ||
      event?.headers?.sessionId ||
      event?.headers?.SessionId,
  );
  const providedRequestId = safeTrim(
    resolveHeader(headerMap, TRACE_HEADER_REQUEST_ID) ||
      awsContext?.awsRequestId ||
      awsContext?.requestId ||
      event?.requestContext?.requestId,
  );

  const traceId = providedTraceId || generateTraceIdentifier();
  const sessionId = providedSessionId || generateTraceIdentifier();
  const requestId = providedRequestId || '';

  return {
    traceId,
    sessionId,
    requestId: requestId || null,
    headers: buildTraceHeaders(traceId, sessionId, requestId || null),
  };
}

function formatTracePrefix(trace) {
  if (!trace || typeof trace !== 'object') {
    return '';
  }
  const parts = [];
  if (trace.traceId) {
    parts.push(`traceId=${trace.traceId}`);
  }
  if (trace.sessionId) {
    parts.push(`sessionId=${trace.sessionId}`);
  }
  if (trace.requestId) {
    parts.push(`requestId=${trace.requestId}`);
  }
  return parts.length ? `[${parts.join(' ')}]` : '';
}

/**
 * Wraps a logger with trace metadata injection for each log call.
 *
 * @param {{ traceId?: string, sessionId?: string, requestId?: string | null }} trace
 * @param {Console} [baseLogger]
 * @returns {{ trace: object, log: Function, info: Function, warn: Function, error: Function, debug: Function }}
 */
function createTraceLogger(trace, baseLogger = console) {
  const target = baseLogger && typeof baseLogger === 'object' ? baseLogger : console;
  const prefix = formatTracePrefix(trace);
  const invoke = (method) => {
    const fallback = typeof target.log === 'function' ? target.log.bind(target) : () => {};
    const handler = typeof target[method] === 'function' ? target[method].bind(target) : fallback;
    return (...args) => {
      const metadata = {
        traceId: trace?.traceId ?? null,
        sessionId: trace?.sessionId ?? null,
        requestId: trace?.requestId ?? null,
        trace: {
          traceId: trace?.traceId ?? null,
          sessionId: trace?.sessionId ?? null,
          requestId: trace?.requestId ?? null,
          source: 'serverless',
        },
      };
      if (prefix) {
        handler(prefix, ...args, metadata);
      } else {
        handler(...args, metadata);
      }
    };
  };
  return {
    trace,
    log: invoke('log'),
    info: invoke('info'),
    warn: invoke('warn'),
    error: invoke('error'),
    debug: invoke('debug'),
  };
}

/**
 * Adds trace identifiers to HTTP response headers when available.
 *
 * @param {Record<string, string>} [headers]
 * @param {{ traceId?: string, sessionId?: string, requestId?: string | null }} [trace]
 * @returns {Record<string, string>}
 */
function applyTraceHeaders(headers = {}, trace) {
  const base = { ...(headers || {}) };
  if (!trace || typeof trace !== 'object') {
    return base;
  }
  const traceHeaders = buildTraceHeaders(trace.traceId, trace.sessionId, trace.requestId);
  return { ...base, ...traceHeaders };
}

/**
 * Embeds trace identifiers into JSON response bodies where appropriate.
 *
 * @param {any} body
 * @param {{ traceId?: string, sessionId?: string, requestId?: string | null }} [trace]
 * @returns {any}
 */
function embedTraceInBody(body, trace) {
  if (!trace || typeof trace !== 'object' || !body || typeof body !== 'object') {
    return body;
  }
  if (Array.isArray(body) || Buffer.isBuffer(body)) {
    return body;
  }
  const existingTrace =
    body.trace && typeof body.trace === 'object' && !Array.isArray(body.trace) ? { ...body.trace } : {};
  if (trace.traceId && !existingTrace.traceId) {
    existingTrace.traceId = trace.traceId;
  }
  if (trace.sessionId && !existingTrace.sessionId) {
    existingTrace.sessionId = trace.sessionId;
  }
  if (trace.requestId && !existingTrace.requestId) {
    existingTrace.requestId = trace.requestId;
  }
  if (!Object.keys(existingTrace).length) {
    return body;
  }
  return { ...body, trace: existingTrace };
}

module.exports = {
  TRACE_HEADER_TRACE_ID,
  TRACE_HEADER_SESSION_ID,
  TRACE_HEADER_REQUEST_ID,
  createTraceContext,
  createTraceLogger,
  applyTraceHeaders,
  embedTraceInBody,
};
