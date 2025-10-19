'use strict';

const AWS = require('aws-sdk');
const { createResponse, parseJsonBody, handleOptions } = require('../lib/http');
const { createTraceContext, createTraceLogger } = require('../lib/trace');
const { enforceRateLimit, deriveRateLimitIdentity } = require('../lib/rate-limit');

const dynamo = new AWS.DynamoDB.DocumentClient();
const SCORES_TABLE = process.env.SCORES_TABLE;
const SCORE_INDEX = process.env.SCORES_INDEX_NAME || 'ScoreIndex';
const SCORE_BUCKET = 'all';
const RATE_LIMITS_TABLE = process.env.RATE_LIMITS_TABLE;

function resolveSourceIp(event) {
  const ipCandidate = event?.requestContext?.identity?.sourceIp;
  if (typeof ipCandidate === 'string') {
    const trimmed = ipCandidate.trim();
    return trimmed || null;
  }
  return null;
}

async function applyRateLimit(event, trace, logger, { scope, googleId = null, sessionIdOverride = null, limit = 60, windowSeconds = 60 }) {
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

function sanitizeNumber(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : defaultValue;
}

function sanitizeLocation(location) {
  if (location === null) {
    return null;
  }
  if (!location || typeof location !== 'object') {
    return undefined;
  }
  const clean = {};
  if (typeof location.latitude === 'number') clean.latitude = location.latitude;
  if (typeof location.longitude === 'number') clean.longitude = location.longitude;
  if (typeof location.accuracy === 'number') clean.accuracy = location.accuracy;
  if (location.error) clean.error = String(location.error);
  if (location.label) clean.label = String(location.label);
  if (location.timestamp) clean.timestamp = location.timestamp;
  return Object.keys(clean).length ? clean : null;
}

function encodeNextToken(key) {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64');
}

function decodeNextToken(token) {
  if (!token) return null;
  try {
    const json = Buffer.from(token, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (error) {
    const err = new Error('Invalid nextToken value');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
}

async function getScores(event, trace, logger) {
  if (!SCORES_TABLE) {
    logger.error('SCORES_TABLE environment variable is not configured.');
    return createResponse(500, { message: 'SCORES_TABLE environment variable is not configured.' }, { trace });
  }

  let rateLimitResult;
  try {
    rateLimitResult = await applyRateLimit(event, trace, logger, {
      scope: 'scores:get',
      limit: 60,
      windowSeconds: 60,
    });
  } catch (error) {
    logger.error('Failed to evaluate scoreboard GET rate limit.', error);
    return createResponse(500, { message: 'Unable to evaluate request quota.' }, { trace });
  }

  if (rateLimitResult?.ok === false) {
    return createRateLimitResponse(
      trace,
      'Too many leaderboard requests. Please try again shortly.',
      rateLimitResult.retryAfterSeconds,
    );
  }

  const limitParam = event?.queryStringParameters?.limit;
  const limit = Math.min(Math.max(sanitizeNumber(limitParam, 25), 1), 100);
  const tokenParam = event?.queryStringParameters?.nextToken;

  let exclusiveStartKey;
  try {
    exclusiveStartKey = decodeNextToken(tokenParam);
  } catch (error) {
    logger.warn('Invalid pagination token provided for scoreboard query.', { error });
    return createResponse(400, { message: error.message }, { trace });
  }

  const params = {
    TableName: SCORES_TABLE,
    IndexName: SCORE_INDEX,
    KeyConditionExpression: '#bucket = :bucket',
    ExpressionAttributeNames: {
      '#bucket': 'scoreBucket',
      '#name': 'name',
      '#gid': 'googleId',
    },
    ExpressionAttributeValues: {
      ':bucket': SCORE_BUCKET,
    },
    ProjectionExpression:
      '#gid, #name, score, dimensionCount, runTimeSeconds, inventoryCount, location, locationLabel, updatedAt, bestScoreAt',
    Limit: limit,
    ScanIndexForward: true,
  };

  if (exclusiveStartKey) {
    params.ExclusiveStartKey = exclusiveStartKey;
  }

  let result;
  try {
    result = await dynamo.query(params).promise();
  } catch (error) {
    logger.error('Failed to load scoreboard entries.', error);
    return createResponse(500, { message: 'Failed to load scoreboard entries.' }, { trace });
  }

  const responseBody = {
    items: result.Items ?? [],
  };

  if (result.LastEvaluatedKey) {
    responseBody.nextToken = encodeNextToken(result.LastEvaluatedKey);
  }

  return createResponse(200, responseBody, { trace });
}

async function upsertScore(event, trace, logger) {
  if (!SCORES_TABLE) {
    logger.error('SCORES_TABLE environment variable is not configured.');
    return createResponse(500, { message: 'SCORES_TABLE environment variable is not configured.' }, { trace });
  }

  let payload;
  try {
    payload = parseJsonBody(event) || {};
  } catch (error) {
    logger.warn('Received invalid JSON payload while upserting score.', { error });
    return createResponse(400, { message: error.message }, { trace });
  }

  const googleId = typeof payload.googleId === 'string' ? payload.googleId.trim() : '';
  if (!googleId) {
    logger.warn('Score submission missing googleId.');
    return createResponse(400, { message: 'googleId is required.' }, { trace });
  }

  const submittedScore = sanitizeNumber(payload.score, undefined);
  if (submittedScore === undefined) {
    logger.warn('Score submission missing numeric score value.', { googleId });
    return createResponse(400, { message: 'score must be a number.' }, { trace });
  }

  let rateLimitResult;
  try {
    rateLimitResult = await applyRateLimit(event, trace, logger, {
      scope: 'scores:post',
      googleId,
      limit: 20,
      windowSeconds: 60,
    });
  } catch (error) {
    logger.error('Failed to evaluate scoreboard POST rate limit.', error);
    return createResponse(500, { message: 'Unable to evaluate request quota.' }, { trace });
  }

  if (rateLimitResult?.ok === false) {
    return createRateLimitResponse(
      trace,
      'Too many score submissions. Please retry later.',
      rateLimitResult.retryAfterSeconds,
    );
  }

  let existing;
  try {
    const current = await dynamo
      .get({
        TableName: SCORES_TABLE,
        Key: { googleId },
      })
      .promise();
    existing = current.Item || null;
  } catch (error) {
    logger.error('Failed to load existing score entry.', error);
    return createResponse(500, { message: 'Unable to load existing score entry.' }, { trace });
  }

  const now = new Date().toISOString();
  const previousScore = sanitizeNumber(existing?.score, 0);
  const finalScore = Math.max(previousScore, submittedScore);

  const dimensionCount = sanitizeNumber(payload.dimensionCount, existing?.dimensionCount ?? 0);
  const runTimeSeconds = sanitizeNumber(payload.runTimeSeconds, existing?.runTimeSeconds ?? 0);
  const inventoryCount = sanitizeNumber(payload.inventoryCount, existing?.inventoryCount ?? 0);

  const sanitizedLocation =
    payload.location !== undefined ? sanitizeLocation(payload.location) : existing?.location ?? null;
  const locationLabel =
    payload.locationLabel !== undefined
      ? payload.locationLabel && typeof payload.locationLabel === 'string'
        ? payload.locationLabel
        : null
      : existing?.locationLabel ?? null;

  const item = {
    googleId,
    name:
      (typeof payload.name === 'string' && payload.name.trim()) || existing?.name || 'Explorer',
    score: finalScore,
    scoreBucket: SCORE_BUCKET,
    scoreSort: -finalScore,
    dimensionCount,
    runTimeSeconds,
    inventoryCount,
    location: sanitizedLocation,
    locationLabel,
    updatedAt: now,
    lastSubmittedScore: submittedScore,
    attempts: sanitizeNumber(existing?.attempts, 0) + 1,
    bestScoreAt: finalScore > previousScore ? now : existing?.bestScoreAt || now,
  };

  if (item.location === undefined) {
    delete item.location;
  }

  try {
    await dynamo
      .put({
        TableName: SCORES_TABLE,
        Item: item,
      })
      .promise();
  } catch (error) {
    logger.error('Failed to persist score entry.', error);
    return createResponse(500, { message: 'Failed to persist score entry.' }, { trace });
  }

  return createResponse(
    200,
    {
      message: 'Score recorded.',
      item,
    },
    { trace },
  );
}

/**
 * Lambda handler that records and retrieves leaderboard scores.
 *
 * @param {object} event
 * @param {object} [awsContext]
 * @returns {Promise<import('../lib/http').ApiResponse>}
 */
exports.handler = async (event, awsContext = {}) => {
  const trace = createTraceContext(event, awsContext);
  const logger = createTraceLogger(trace);

  if (event?.httpMethod === 'OPTIONS') {
    return handleOptions({ trace });
  }

  if (event?.httpMethod === 'GET') {
    return getScores(event, trace, logger);
  }

  if (event?.httpMethod === 'POST') {
    return upsertScore(event, trace, logger);
  }

  logger.warn('Score handler received unsupported method.', { method: event?.httpMethod });
  return createResponse(405, { message: 'Method Not Allowed' }, { trace });
};
