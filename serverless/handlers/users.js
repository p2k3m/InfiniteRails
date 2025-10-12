'use strict';

const AWS = require('aws-sdk');
const { createResponse, parseJsonBody, handleOptions } = require('../lib/http');
const { createTraceContext, createTraceLogger } = require('../lib/trace');
const { enforceRateLimit, deriveRateLimitIdentity } = require('../lib/rate-limit');

const dynamo = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE;
const RATE_LIMITS_TABLE = process.env.RATE_LIMITS_TABLE;

function resolveSourceIp(event) {
  const ipCandidate = event?.requestContext?.identity?.sourceIp;
  if (typeof ipCandidate === 'string') {
    const trimmed = ipCandidate.trim();
    return trimmed || null;
  }
  return null;
}

async function applyRateLimit(event, trace, logger, { scope, googleId = null, limit = 30, windowSeconds = 60 }) {
  if (!RATE_LIMITS_TABLE) {
    return { ok: true, skipped: true };
  }

  const identity = deriveRateLimitIdentity({
    googleId,
    sessionId: trace?.sessionId || null,
    sourceIp: resolveSourceIp(event),
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

function sanitizeDevice(device) {
  if (!device || typeof device !== 'object') {
    return null;
  }
  const allowedKeys = ['userAgent', 'platform', 'language', 'screen'];
  const snapshot = allowedKeys.reduce((acc, key) => {
    if (device[key] !== undefined) {
      acc[key] = device[key];
    }
    return acc;
  }, {});
  return Object.keys(snapshot).length ? snapshot : null;
}

function sanitizeLocation(location) {
  if (!location || typeof location !== 'object') {
    return null;
  }
  const output = {};
  if (typeof location.latitude === 'number') {
    output.latitude = location.latitude;
  }
  if (typeof location.longitude === 'number') {
    output.longitude = location.longitude;
  }
  if (typeof location.accuracy === 'number') {
    output.accuracy = location.accuracy;
  }
  if (location.error) {
    output.error = String(location.error);
  }
  if (location.label) {
    output.label = String(location.label);
  }
  if (location.timestamp) {
    output.timestamp = location.timestamp;
  }
  return Object.keys(output).length ? output : null;
}

function sanitizeStringArray(value, { unique = true } = {}) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    if (unique) {
      if (seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
    }
    result.push(trimmed);
  }
  return result;
}

function sanitizeInventorySlots(slots, { maxLength = 32, allowNull = true } = {}) {
  if (!Array.isArray(slots)) {
    return [];
  }
  const limited = slots.slice(0, maxLength);
  return limited.map((slot) => {
    if (!slot || typeof slot !== 'object') {
      return allowNull ? null : null;
    }
    const item = typeof slot.item === 'string' ? slot.item.trim() : '';
    const quantity = Number(slot.quantity);
    if (!item || !Number.isFinite(quantity) || quantity <= 0) {
      return allowNull ? null : null;
    }
    return { item, quantity: Math.max(1, Math.floor(quantity)) };
  });
}

function sanitizeInventory(inventory) {
  if (!inventory || typeof inventory !== 'object') {
    return null;
  }
  const output = {};
  const slots = sanitizeInventorySlots(inventory.slots, { maxLength: 32, allowNull: true });
  if (slots.length) {
    output.slots = slots;
  }
  const satchel = sanitizeInventorySlots(inventory.satchel, { maxLength: 64, allowNull: false }).filter(Boolean);
  if (satchel.length) {
    output.satchel = satchel;
  }
  const selectedSlot = Number(inventory.selectedSlot);
  if (Number.isInteger(selectedSlot) && selectedSlot >= 0) {
    output.selectedSlot = selectedSlot;
  }
  return Object.keys(output).length ? output : null;
}

function sanitizeRecipes(recipes) {
  if (!recipes || typeof recipes !== 'object') {
    return null;
  }
  const output = {};
  const known = sanitizeStringArray(recipes.known);
  if (known.length) {
    output.known = known;
  }
  const mastered = sanitizeStringArray(recipes.mastered);
  if (mastered.length) {
    output.mastered = mastered;
  }
  if (Array.isArray(recipes.active)) {
    const active = recipes.active
      .map((entry) => (typeof entry === 'string' ? entry.trim() : null))
      .filter((entry) => entry);
    if (active.length) {
      output.active = active;
    }
  }
  return Object.keys(output).length ? output : null;
}

function sanitizeDimensions(dimensions) {
  if (!dimensions || typeof dimensions !== 'object') {
    return null;
  }
  const output = {};
  if (typeof dimensions.current === 'string' && dimensions.current.trim()) {
    output.current = dimensions.current.trim();
  }
  const unlocked = sanitizeStringArray(dimensions.unlocked);
  if (unlocked.length) {
    output.unlocked = unlocked;
  }
  const history = sanitizeStringArray(dimensions.history, { unique: false });
  if (history.length) {
    output.history = history;
  }
  const documented = sanitizeStringArray(dimensions.documented);
  if (documented.length) {
    output.documented = documented;
  }
  return Object.keys(output).length ? output : null;
}

function sanitizePlayer(player) {
  if (!player || typeof player !== 'object') {
    return null;
  }
  const output = {};
  if (player.hasOwnProperty('hasIgniter')) {
    output.hasIgniter = Boolean(player.hasIgniter);
  }
  return Object.keys(output).length ? output : null;
}

function sanitizeScore(scorePayload) {
  if (scorePayload === undefined || scorePayload === null) {
    return null;
  }
  const score = {};
  if (typeof scorePayload === 'number') {
    if (Number.isFinite(scorePayload)) {
      score.total = scorePayload;
    }
  } else if (typeof scorePayload === 'object') {
    if (typeof scorePayload.total === 'number' && Number.isFinite(scorePayload.total)) {
      score.total = scorePayload.total;
    }
    if (typeof scorePayload.recipes === 'number' && Number.isFinite(scorePayload.recipes)) {
      score.recipes = scorePayload.recipes;
    }
    if (typeof scorePayload.dimensions === 'number' && Number.isFinite(scorePayload.dimensions)) {
      score.dimensions = scorePayload.dimensions;
    }
  }
  return Object.keys(score).length ? score : null;
}

function sanitizeProgress(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const progress = {};
  const score = sanitizeScore(payload.score);
  if (score) {
    progress.score = score;
  }
  const recipes = sanitizeRecipes(payload.recipes);
  if (recipes) {
    progress.recipes = recipes;
  }
  const dimensions = sanitizeDimensions(payload.dimensions);
  if (dimensions) {
    progress.dimensions = dimensions;
  }
  const inventory = sanitizeInventory(payload.inventory);
  if (inventory) {
    progress.inventory = inventory;
  }
  const player = sanitizePlayer(payload.player);
  if (player) {
    progress.player = player;
  }
  if (!Object.keys(progress).length) {
    return null;
  }
  progress.updatedAt = typeof payload.progressUpdatedAt === 'string' ? payload.progressUpdatedAt : new Date().toISOString();
  progress.version = Number.isInteger(payload.progressVersion) ? payload.progressVersion : 1;
  return progress;
}

exports.handler = async (event, awsContext = {}) => {
  const trace = createTraceContext(event, awsContext);
  const logger = createTraceLogger(trace);

  if (event?.httpMethod === 'OPTIONS') {
    return handleOptions({ trace });
  }

  if (!USERS_TABLE) {
    logger.error('USERS_TABLE environment variable is not configured.');
    return createResponse(500, { message: 'USERS_TABLE environment variable is not configured.' }, { trace });
  }

  if (event?.httpMethod === 'GET') {
    const param =
      event?.queryStringParameters?.googleId ??
      event?.queryStringParameters?.GoogleId ??
      event?.multiValueQueryStringParameters?.googleId?.[0];
    const googleId = typeof param === 'string' ? param.trim() : '';
    if (!googleId) {
      logger.warn('User profile fetch missing googleId parameter.');
      return createResponse(400, { message: 'googleId query parameter is required.' }, { trace });
    }

    let rateLimitResult;
    try {
      rateLimitResult = await applyRateLimit(event, trace, logger, {
        scope: 'users:get',
        googleId,
        limit: 30,
        windowSeconds: 60,
      });
    } catch (error) {
      logger.error('Failed to evaluate user GET rate limit.', error);
      return createResponse(500, { message: 'Unable to evaluate request quota.' }, { trace });
    }

    if (rateLimitResult?.ok === false) {
      return createRateLimitResponse(
        trace,
        'Too many profile lookups. Please try again later.',
        rateLimitResult.retryAfterSeconds,
      );
    }

    try {
      const result = await dynamo
        .get({
          TableName: USERS_TABLE,
          Key: { googleId },
        })
        .promise();
      if (!result.Item) {
        logger.warn('User record not found for provided googleId.', { googleId });
        return createResponse(404, { message: 'User not found.' }, { trace });
      }
      const { sourceIp, ...item } = result.Item;
      return createResponse(200, { item }, { trace });
    } catch (error) {
      logger.error('Failed to load user record.', error);
      return createResponse(500, { message: 'Failed to load user record.' }, { trace });
    }
  }

  if (event?.httpMethod !== 'POST') {
    logger.warn('User handler received unsupported method.', { method: event?.httpMethod });
    return createResponse(405, { message: 'Method Not Allowed' }, { trace });
  }

  let payload;
  try {
    payload = parseJsonBody(event) || {};
  } catch (error) {
    logger.warn('Received invalid JSON payload while updating user.', { error });
    return createResponse(400, { message: error.message }, { trace });
  }

  const googleId = typeof payload.googleId === 'string' ? payload.googleId.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';

  if (!googleId || !name) {
    logger.warn('User profile update missing required identity fields.', { hasGoogleId: Boolean(googleId), hasName: Boolean(name) });
    return createResponse(400, { message: 'googleId and name are required fields.' }, { trace });
  }

  let rateLimitResult;
  try {
    rateLimitResult = await applyRateLimit(event, trace, logger, {
      scope: 'users:post',
      googleId,
      limit: 30,
      windowSeconds: 60,
    });
  } catch (error) {
    logger.error('Failed to evaluate user POST rate limit.', error);
    return createResponse(500, { message: 'Unable to evaluate request quota.' }, { trace });
  }

  if (rateLimitResult?.ok === false) {
    return createRateLimitResponse(
      trace,
      'Too many profile updates. Please retry later.',
      rateLimitResult.retryAfterSeconds,
    );
  }

  const timestamp = new Date().toISOString();
  const item = {
    googleId,
    name,
    email: payload.email && typeof payload.email === 'string' ? payload.email.trim() : null,
    device: sanitizeDevice(payload.device),
    location: sanitizeLocation(payload.location),
    lastSeenAt: payload.lastSeenAt || timestamp,
    updatedAt: timestamp,
  };

  const progress = sanitizeProgress(payload);
  if (progress) {
    item.progress = progress;
    item.progressUpdatedAt = progress.updatedAt;
  }

  if (event?.requestContext?.identity?.sourceIp) {
    item.sourceIp = event.requestContext.identity.sourceIp;
  }

  try {
    await dynamo
      .put({
        TableName: USERS_TABLE,
        Item: item,
      })
      .promise();
  } catch (error) {
    logger.error('Failed to persist user record.', error);
    return createResponse(500, { message: 'Failed to persist user record.' }, { trace });
  }

  return createResponse(
    200,
    {
      message: 'User profile synchronised.',
      item,
    },
    { trace },
  );
};
