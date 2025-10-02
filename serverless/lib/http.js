'use strict';

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
};

function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: body ? JSON.stringify(body) : '',
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

function handleOptions() {
  return {
    statusCode: 204,
    headers: DEFAULT_HEADERS,
    body: '',
  };
}

module.exports = {
  createResponse,
  parseJsonBody,
  handleOptions,
  DEFAULT_HEADERS,
};
