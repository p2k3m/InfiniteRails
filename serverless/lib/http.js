'use strict';

const { applyTraceHeaders, embedTraceInBody } = require('./trace');

/**
 * Strict Content-Security-Policy applied to all serverless HTTP responses.
 * @type {string}
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "connect-src 'self'",
].join('; ');

/**
 * Security-centric HTTP headers shared by all responses.
 * @type {Record<string, string>}
 */
const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

/**
 * Default HTTP headers for API Gateway responses including CORS values.
 * @type {Record<string, string>}
 */
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

/**
 * Creates a JSON API Gateway response while applying trace metadata.
 *
 * @param {number} statusCode
 * @param {object | null} body
 * @param {{ headers?: Record<string, string>, trace?: ReturnType<typeof import('./trace').createTraceContext> }} [options]
 * @returns {{ statusCode: number, headers: Record<string, string>, body: string }}
 */
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

/**
 * Safely parses an API Gateway event body as JSON.
 *
 * @param {object} event
 * @returns {any}
 */
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

/**
 * Generates a standard 204 OPTIONS response with correct headers.
 *
 * @param {{ headers?: Record<string, string>, trace?: ReturnType<typeof import('./trace').createTraceContext> }} [options]
 * @returns {{ statusCode: number, headers: Record<string, string>, body: string }}
 */
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
