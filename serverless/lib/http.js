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
  if (!event?.body) {
    return null;
  }
  if (typeof event.body === 'object') {
    return event.body;
  }
  try {
    return JSON.parse(event.body);
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
