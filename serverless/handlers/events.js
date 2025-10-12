'use strict';

const AWS = require('aws-sdk');
const crypto = require('crypto');
const { createResponse, parseJsonBody, handleOptions } = require('../lib/http');
const { createTraceContext, createTraceLogger } = require('../lib/trace');
const { enforceRateLimit, deriveRateLimitIdentity } = require('../lib/rate-limit');

const dynamo = new AWS.DynamoDB.DocumentClient();
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const RATE_LIMITS_TABLE = process.env.RATE_LIMITS_TABLE;

const MAX_BATCH_WRITE = 25;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 25;

function resolveSourceIp(event) {
  const ipCandidate = event?.requestContext?.identity?.sourceIp;
  if (typeof ipCandidate === 'string') {
    const trimmed = ipCandidate.trim();
    return trimmed || null;
  }
  return null;
}

async function applyRateLimit(event, trace, logger, {
  scope,
  googleId = null,
  sessionIdOverride = null,
  limit = 120,
  windowSeconds = 60,
}) {
  if (!RATE_LIMITS_TABLE) {
    return { ok: true, skipped: true };
  }

  const identity = deriveRateLimitIdentity({
    googleId,
    sessionId: sessionIdOverride || trace?.sessionId || null,
    sourceIp: resolveSourceIp(event),
    headers: event?.headers,
    multiValueHeaders: event?.multiValueHeaders,
  });

  return enforceRateLimit({
    dynamo,
    tableName: RATE_LIMITS_TABLE,
    identity,
    scope,
    limit,
    windowSeconds,
    logger,
  });
}

function createRateLimitResponse(trace, message, retryAfterSeconds) {
  const headers = {};
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    headers['Retry-After'] = String(Math.max(1, Math.round(retryAfterSeconds)));
  }
  return createResponse(429, { message }, { trace, headers });
}

function sanitiseString(value, { maxLength = 256, allowEmpty = false } = {}) {
  if (value === undefined || value === null) {
    return null;
  }
  const stringValue = typeof value === 'string' ? value : String(value);
  const trimmed = stringValue.trim();
  if (!trimmed && !allowEmpty) {
    return null;
  }
  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

function sanitiseNumber(value, { fallback = null, min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  let finalValue = numeric;
  if (typeof min === 'number' && finalValue < min) {
    finalValue = min;
  }
  if (typeof max === 'number' && finalValue > max) {
    finalValue = max;
  }
  return finalValue;
}

function sanitiseBoolean(value) {
  if (value === undefined || value === null) {
    return null;
  }
  return Boolean(value);
}

function sanitiseTraceInfo(trace) {
  if (!trace || typeof trace !== 'object') {
    return null;
  }
  const traceId = sanitiseString(trace.traceId, { maxLength: 256 });
  const sessionId = sanitiseString(trace.sessionId, { maxLength: 256 });
  const label = sanitiseString(trace.label, { maxLength: 128 });
  const source = sanitiseString(trace.source, { maxLength: 64 });
  const reason = sanitiseString(trace.reason, { maxLength: 128 });
  const output = {};
  if (traceId) output.traceId = traceId;
  if (sessionId) output.sessionId = sessionId;
  if (label) output.label = label;
  if (source) output.source = source;
  if (reason) output.reason = reason;
  return Object.keys(output).length ? output : null;
}

function sanitiseLocation(location) {
  if (!location || typeof location !== 'object') {
    return null;
  }
  const output = {};
  if (typeof location.latitude === 'number' && Number.isFinite(location.latitude)) {
    output.latitude = location.latitude;
  }
  if (typeof location.longitude === 'number' && Number.isFinite(location.longitude)) {
    output.longitude = location.longitude;
  }
  if (typeof location.accuracy === 'number' && Number.isFinite(location.accuracy)) {
    output.accuracy = location.accuracy;
  }
  const label = sanitiseString(location.label, { maxLength: 120 });
  if (label) {
    output.label = label;
  }
  if (typeof location.timestamp === 'string' && location.timestamp.trim()) {
    output.timestamp = location.timestamp.trim();
  }
  if (Object.keys(output).length === 0) {
    return null;
  }
  return output;
}

function sanitiseStringList(value, { maxLength = 16, entryLength = 120 } = {}) {
  if (!Array.isArray(value)) {
    return [];
  }
  const limited = value.slice(0, maxLength);
  const result = [];
  for (const entry of limited) {
    const normalised = sanitiseString(entry, { maxLength: entryLength });
    if (normalised) {
      result.push(normalised);
    }
  }
  return result;
}

function sanitiseBreakdown(breakdown) {
  if (!breakdown || typeof breakdown !== 'object') {
    return null;
  }
  const output = {};
  for (const [key, value] of Object.entries(breakdown)) {
    if (typeof key !== 'string') {
      continue;
    }
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    output[trimmedKey] = numeric;
  }
  return Object.keys(output).length ? output : null;
}

function sanitiseIdentity(identity) {
  if (!identity || typeof identity !== 'object') {
    return null;
  }
  const output = {};
  const googleId = sanitiseString(identity.googleId, { maxLength: 128 });
  const name = sanitiseString(identity.name, { maxLength: 120 });
  const email = sanitiseString(identity.email, { maxLength: 160 });
  const locationLabel = sanitiseString(identity.locationLabel, { maxLength: 160 });
  if (googleId) output.googleId = googleId;
  if (name) output.name = name;
  if (email) output.email = email;
  if (locationLabel) output.locationLabel = locationLabel;
  const location = sanitiseLocation(identity.location);
  if (location) output.location = location;
  return Object.keys(output).length ? output : null;
}

function sanitiseEventSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return null;
  }
  const output = {};
  const id = sanitiseString(summary.id, { maxLength: 160 });
  const googleId = sanitiseString(summary.googleId, { maxLength: 128 });
  const playerId = sanitiseString(summary.playerId, { maxLength: 160 });
  const name = sanitiseString(summary.name, { maxLength: 120 });
  const dimensionLabel = sanitiseString(summary.dimensionLabel, { maxLength: 160 });
  const device = sanitiseString(summary.device, { maxLength: 160 });
  const locationLabel = sanitiseString(summary.locationLabel, { maxLength: 160 });
  const updatedAt = sanitiseString(summary.updatedAt, { maxLength: 64 });
  const reason = sanitiseString(summary.reason, { maxLength: 120 });
  const eternalIngot = sanitiseBoolean(summary.eternalIngot);
  const score = sanitiseNumber(summary.score, { fallback: null });
  const dimensionCount = sanitiseNumber(summary.dimensionCount, { fallback: null, min: 0 });
  const dimensionTotal = sanitiseNumber(summary.dimensionTotal, { fallback: null, min: 0 });
  const runTimeSeconds = sanitiseNumber(summary.runTimeSeconds, { fallback: null, min: 0 });
  const inventoryCount = sanitiseNumber(summary.inventoryCount, { fallback: null, min: 0 });
  const recipeCount = sanitiseNumber(summary.recipeCount, { fallback: null, min: 0 });
  const portalEvents = sanitiseNumber(summary.portalEvents, { fallback: null, min: 0 });
  const portalPoints = sanitiseNumber(summary.portalPoints, { fallback: null });
  const combatEvents = sanitiseNumber(summary.combatEvents, { fallback: null, min: 0 });
  const combatPoints = sanitiseNumber(summary.combatPoints, { fallback: null });
  const lootEvents = sanitiseNumber(summary.lootEvents, { fallback: null, min: 0 });
  const lootPoints = sanitiseNumber(summary.lootPoints, { fallback: null });
  const craftingEvents = sanitiseNumber(summary.craftingEvents, { fallback: null, min: 0 });
  const dimensionEvents = sanitiseNumber(summary.dimensionEvents, { fallback: null, min: 0 });
  if (id) output.id = id;
  if (googleId) output.googleId = googleId;
  if (playerId) output.playerId = playerId;
  if (name) output.name = name;
  if (dimensionLabel) output.dimensionLabel = dimensionLabel;
  if (device) output.device = device;
  if (locationLabel) output.locationLabel = locationLabel;
  if (updatedAt) output.updatedAt = updatedAt;
  if (reason) output.reason = reason;
  if (eternalIngot !== null) output.eternalIngot = eternalIngot;
  if (score !== null) output.score = score;
  if (dimensionCount !== null) output.dimensionCount = dimensionCount;
  if (dimensionTotal !== null) output.dimensionTotal = dimensionTotal;
  if (runTimeSeconds !== null) output.runTimeSeconds = runTimeSeconds;
  if (inventoryCount !== null) output.inventoryCount = inventoryCount;
  if (recipeCount !== null) output.recipeCount = recipeCount;
  if (portalEvents !== null) output.portalEvents = portalEvents;
  if (portalPoints !== null) output.portalPoints = portalPoints;
  if (combatEvents !== null) output.combatEvents = combatEvents;
  if (combatPoints !== null) output.combatPoints = combatPoints;
  if (lootEvents !== null) output.lootEvents = lootEvents;
  if (lootPoints !== null) output.lootPoints = lootPoints;
  if (craftingEvents !== null) output.craftingEvents = craftingEvents;
  if (dimensionEvents !== null) output.dimensionEvents = dimensionEvents;
  const dimensions = sanitiseStringList(summary.dimensions, { maxLength: 24, entryLength: 160 });
  if (dimensions.length) {
    output.dimensions = dimensions;
  }
  const recipes = sanitiseStringList(summary.recipes, { maxLength: 32, entryLength: 160 });
  if (recipes.length) {
    output.recipes = recipes;
  }
  const breakdown = sanitiseBreakdown(summary.breakdown);
  if (breakdown) {
    output.breakdown = breakdown;
  }
  const location = sanitiseLocation(summary.location);
  if (location) {
    output.location = location;
  }
  const trace = sanitiseTraceInfo(summary.trace);
  if (trace) {
    output.trace = trace;
  }
  return Object.keys(output).length ? output : null;
}

function sanitiseEventDetail(detail) {
  if (!detail || typeof detail !== 'object') {
    return null;
  }
  const output = {};
  const knownKeys = [
    'message',
    'reason',
    'stage',
    'source',
    'statusText',
    'endpoint',
    'method',
    'summary',
    'dimension',
    'device',
    'portalStatus',
  ];
  knownKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(detail, key)) {
      const value = detail[key];
      if (typeof value === 'string') {
        const normalised = sanitiseString(value, { maxLength: 512 });
        if (normalised) {
          output[key] = normalised;
        }
      }
    }
  });
  const status = sanitiseNumber(detail.status, { fallback: null });
  if (status !== null) {
    output.status = status;
  }
  const elapsedMs = sanitiseNumber(detail.elapsedMs, { fallback: null, min: 0 });
  if (elapsedMs !== null) {
    output.elapsedMs = elapsedMs;
  }
  if (typeof detail.offline === 'boolean') {
    output.offline = detail.offline;
  }
  const trace = sanitiseTraceInfo(detail.trace);
  if (trace) {
    output.trace = trace;
  }
  return Object.keys(output).length ? output : null;
}

function buildEventId(timestamp) {
  const millis = Math.max(0, Math.floor(Number(timestamp) || Date.now()));
  const paddedTime = millis.toString().padStart(20, '0');
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  return `${paddedTime}#${randomSuffix}`;
}

function sanitiseEventInput(raw = {}) {
  const type = sanitiseString(raw.type, { maxLength: 64 });
  if (!type) {
    return null;
  }
  const timestamp = sanitiseNumber(raw.timestamp, { fallback: Date.now(), min: 0 });
  const summary = sanitiseEventSummary(raw.summary);
  const detail = sanitiseEventDetail(raw.detail);
  const identity = sanitiseIdentity(raw.identity);
  const trace = sanitiseTraceInfo(raw.trace) || (summary ? sanitiseTraceInfo(summary.trace) : null);
  let sessionId = sanitiseString(raw.sessionId, { maxLength: 256 });
  if (!sessionId && trace?.sessionId) {
    sessionId = trace.sessionId;
  }
  const traceId = sanitiseString(raw.traceId, { maxLength: 256 }) || (trace ? trace.traceId ?? null : null);
  const googleId = sanitiseString(raw.googleId, { maxLength: 128 }) || (summary ? summary.googleId ?? null : null);
  const playerName =
    sanitiseString(raw.playerName, { maxLength: 120 }) || (summary ? summary.name ?? null : null) || null;
  if (!sessionId) {
    sessionId = traceId || 'anonymous';
  }
  return {
    type,
    timestamp,
    sessionId,
    traceId: traceId || null,
    googleId: googleId || null,
    playerName,
    summary,
    detail,
    identity,
    trace: trace,
  };
}

function stripEmptyFields(item) {
  const output = {};
  Object.entries(item).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (Array.isArray(value) && value.length === 0) {
      return;
    }
    if (typeof value === 'object' && Object.keys(value).length === 0) {
      return;
    }
    output[key] = value;
  });
  return output;
}

function buildEventItems(events = []) {
  return events.map((event) => {
    const baseItem = {
      sessionId: event.sessionId,
      eventId: buildEventId(event.timestamp),
      eventType: event.type,
      eventTimestamp: event.timestamp,
      createdAt: new Date().toISOString(),
      traceId: event.traceId,
      googleId: event.googleId,
      playerName: event.playerName,
      summary: event.summary,
      detail: event.detail,
      identity: event.identity,
      trace: event.trace,
    };
    return stripEmptyFields(baseItem);
  });
}

function chunk(array, size) {
  const result = [];
  for (let index = 0; index < array.length; index += size) {
    result.push(array.slice(index, index + size));
  }
  return result;
}

async function writeEventItems(items, logger) {
  if (!EVENTS_TABLE) {
    const error = new Error('EVENTS_TABLE environment variable is not configured.');
    error.code = 'TABLE_NOT_CONFIGURED';
    throw error;
  }
  const batches = chunk(items, MAX_BATCH_WRITE);
  for (const batch of batches) {
    let requestItems = batch.map((item) => ({ PutRequest: { Item: item } }));
    let attempt = 0;
    while (requestItems.length && attempt < MAX_RETRY_ATTEMPTS) {
      const params = {
        RequestItems: {
          [EVENTS_TABLE]: requestItems,
        },
      };
      try {
        const result = await dynamo.batchWrite(params).promise();
        const unprocessed = result.UnprocessedItems?.[EVENTS_TABLE] ?? [];
        requestItems = unprocessed;
        if (requestItems.length) {
          attempt += 1;
          const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1), 500);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        logger.error('Failed to write event batch to DynamoDB.', error);
        throw error;
      }
    }
    if (requestItems.length) {
      const error = new Error('Failed to persist gameplay events.');
      error.code = 'BATCH_WRITE_INCOMPLETE';
      throw error;
    }
  }
}

function encodeNextToken(key) {
  if (!key) {
    return null;
  }
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64');
}

function decodeNextToken(token) {
  if (!token) {
    return null;
  }
  try {
    const json = Buffer.from(token, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (error) {
    const err = new Error('Invalid nextToken value');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
}

async function ingestEvents(event, trace, logger) {
  if (!EVENTS_TABLE) {
    logger.error('EVENTS_TABLE environment variable is not configured.');
    return createResponse(500, { message: 'EVENTS_TABLE environment variable is not configured.' }, { trace });
  }

  let payload;
  try {
    payload = parseJsonBody(event) || {};
  } catch (error) {
    logger.warn('Received invalid JSON payload while recording events.', { error });
    return createResponse(400, { message: error.message }, { trace });
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const sanitised = events
    .map((entry) => {
      const normalised = sanitiseEventInput(entry);
      if (!normalised) {
        logger.warn('Discarding event with invalid structure.', { entry });
      }
      return normalised;
    })
    .filter(Boolean);

  if (!sanitised.length) {
    return createResponse(400, { message: 'No valid events provided.' }, { trace });
  }

  const representativeGoogleId = sanitised.find((entry) => entry.googleId)?.googleId || null;

  let rateLimitResult;
  try {
    rateLimitResult = await applyRateLimit(event, trace, logger, {
      scope: 'events:post',
      googleId: representativeGoogleId,
      limit: 180,
      windowSeconds: 60,
    });
  } catch (error) {
    logger.error('Failed to evaluate events POST rate limit.', error);
    return createResponse(500, { message: 'Unable to evaluate request quota.' }, { trace });
  }

  if (rateLimitResult?.ok === false) {
    return createRateLimitResponse(
      trace,
      'Too many gameplay event batches. Please retry later.',
      rateLimitResult.retryAfterSeconds,
    );
  }

  const items = buildEventItems(sanitised);

  try {
    await writeEventItems(items, logger);
  } catch (error) {
    logger.error('Failed to persist gameplay events.', error);
    return createResponse(500, { message: 'Failed to persist gameplay events.' }, { trace });
  }

  return createResponse(202, { message: 'Events recorded.', count: sanitised.length }, { trace });
}

async function queryEvents(event, trace, logger) {
  if (!EVENTS_TABLE) {
    logger.error('EVENTS_TABLE environment variable is not configured.');
    return createResponse(500, { message: 'EVENTS_TABLE environment variable is not configured.' }, { trace });
  }

  const sessionId = sanitiseString(event?.queryStringParameters?.sessionId, { maxLength: 256 });
  if (!sessionId) {
    return createResponse(400, { message: 'sessionId query parameter is required.' }, { trace });
  }

  let rateLimitResult;
  try {
    rateLimitResult = await applyRateLimit(event, trace, logger, {
      scope: 'events:get',
      sessionIdOverride: sessionId,
      limit: 60,
      windowSeconds: 60,
    });
  } catch (error) {
    logger.error('Failed to evaluate events GET rate limit.', error);
    return createResponse(500, { message: 'Unable to evaluate request quota.' }, { trace });
  }

  if (rateLimitResult?.ok === false) {
    return createRateLimitResponse(
      trace,
      'Too many gameplay event queries. Please retry later.',
      rateLimitResult.retryAfterSeconds,
    );
  }

  const limitParam = event?.queryStringParameters?.limit;
  const limit = Math.min(Math.max(sanitiseNumber(limitParam, { fallback: 50, min: 1 }), 1), 200);
  const tokenParam = event?.queryStringParameters?.nextToken;
  let exclusiveStartKey;
  try {
    exclusiveStartKey = decodeNextToken(tokenParam);
  } catch (error) {
    logger.warn('Invalid pagination token provided for events query.', { error });
    return createResponse(400, { message: error.message }, { trace });
  }

  const params = {
    TableName: EVENTS_TABLE,
    KeyConditionExpression: '#session = :session',
    ExpressionAttributeNames: {
      '#session': 'sessionId',
    },
    ExpressionAttributeValues: {
      ':session': sessionId,
    },
    ScanIndexForward: true,
    Limit: limit,
  };

  if (exclusiveStartKey) {
    params.ExclusiveStartKey = exclusiveStartKey;
  }

  let result;
  try {
    result = await dynamo.query(params).promise();
  } catch (error) {
    logger.error('Failed to load gameplay events.', error);
    return createResponse(500, { message: 'Failed to load gameplay events.' }, { trace });
  }

  const responseBody = {
    items: result.Items ?? [],
  };

  if (result.LastEvaluatedKey) {
    responseBody.nextToken = encodeNextToken(result.LastEvaluatedKey);
  }

  return createResponse(200, responseBody, { trace });
}

exports.handler = async (event, awsContext = {}) => {
  const trace = createTraceContext(event, awsContext);
  const logger = createTraceLogger(trace);

  if (event?.httpMethod === 'OPTIONS') {
    return handleOptions({ trace });
  }

  if (event?.httpMethod === 'POST') {
    return ingestEvents(event, trace, logger);
  }

  if (event?.httpMethod === 'GET') {
    return queryEvents(event, trace, logger);
  }

  logger.warn('Events handler received unsupported method.', { method: event?.httpMethod });
  return createResponse(405, { message: 'Method Not Allowed' }, { trace });
};
