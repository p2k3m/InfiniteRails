'use strict';

const { applyTraceHeaders, embedTraceInBody } = require('./trace');

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "connect-src 'self'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const DEFAULT_HEADERS = {
  ...SECURITY_HEADERS,
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
};

function mergeHeaders(base, extra) {
  if (!extra || typeof extra !== 'object') {
    return base;
  }
  return { ...base, ...extra };
}

function createResponse(statusCode, body, { headers: extraHeaders = {}, trace = null } = {}) {
  const headersWithCors = mergeHeaders(DEFAULT_HEADERS, extraHeaders);
  const headers = applyTraceHeaders(headersWithCors, trace);
  let responseBody = '';
  if (body) {
    const enrichedBody = embedTraceInBody(body, trace);
    responseBody = JSON.stringify(enrichedBody);
  }
  return {
    statusCode,
    headers,
    body: responseBody,
  };
}

function parseJsonBody(event) {
  if (!event || event.body === undefined || event.body === null || event.body === '') {
    return null;
  }
  if (typeof event.body === 'object' && !Buffer.isBuffer(event.body)) {
    return event.body;
  }

  let raw = event.body;
  if (Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  }

  if (event.isBase64Encoded) {
    try {
      raw = Buffer.from(String(raw), 'base64').toString('utf8');
    } catch (error) {
      const err = new Error('Invalid JSON payload');
      err.code = 'INVALID_JSON';
      throw err;
    }
  }

  try {
    return JSON.parse(typeof raw === 'string' ? raw : String(raw));
  } catch (error) {
    const err = new Error('Invalid JSON payload');
    err.code = 'INVALID_JSON';
    throw err;
  }
}

function handleOptions({ headers: extraHeaders = {}, trace = null } = {}) {
  const headersWithCors = mergeHeaders(DEFAULT_HEADERS, extraHeaders);
  const headers = applyTraceHeaders(headersWithCors, trace);
  return {
    statusCode: 204,
    headers,
    body: '',
  };
}

module.exports = {
  createResponse,
  parseJsonBody,
  handleOptions,
  DEFAULT_HEADERS,
  SECURITY_HEADERS,
  CONTENT_SECURITY_POLICY,
};
