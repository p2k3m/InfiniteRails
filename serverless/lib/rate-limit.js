'use strict';

/**
 * Default rate-limit window duration in seconds when no override is provided.
 * @type {number}
 */
const DEFAULT_WINDOW_SECONDS = 60;
/**
 * Default maximum number of requests allowed within the rate-limit window.
 * @type {number}
 */
const DEFAULT_MAX_REQUESTS = 60;
/**
 * HTTP header used to communicate the Google identity involved in rate limiting.
 * @type {string}
 */
const RATE_LIMIT_HEADER_GOOGLE_ID = 'x-rate-limit-google-id';

function safeString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }
  const stringValue = typeof value === 'string' ? value : String(value);
  const trimmed = stringValue.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.length > 256 ? trimmed.slice(0, 256) : trimmed;
}

function computeWindowInfo(nowMs, windowSeconds) {
  const windowMs = Math.max(1, Math.floor(windowSeconds) * 1000);
  const timestamp = Number.isFinite(nowMs) ? nowMs : Date.now();
  const windowId = Math.floor(timestamp / windowMs);
  const windowStartMs = windowId * windowMs;
  const windowEndMs = windowStartMs + windowMs;
  return {
    windowId,
    windowMs,
    windowStartMs,
    windowEndMs,
  };
}

function buildBucketKey(scope, identity, windowId) {
  const safeScope = safeString(scope, 'global');
  const safeIdentity = safeString(identity, 'anonymous');
  return `${safeScope}#${safeIdentity}#${windowId}`;
}

function normaliseHeaderValue(headers, name) {
  if (!headers || typeof headers !== 'object') {
    return '';
  }
  const target = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!target) {
    return '';
  }

  const entries = Array.isArray(headers)
    ? headers
    : headers instanceof Map
      ? Array.from(headers.entries())
      : Object.entries(headers);

  for (const [key, value] of entries) {
    if (typeof key !== 'string') {
      continue;
    }
    if (key.trim().toLowerCase() !== target) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === undefined || entry === null) {
          continue;
        }
        const candidate = typeof entry === 'string' ? entry.trim() : String(entry).trim();
        if (candidate) {
          return candidate;
        }
      }
      continue;
    }
    if (value === undefined || value === null) {
      continue;
    }
    const stringValue = typeof value === 'string' ? value : String(value);
    const trimmed = stringValue.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return '';
}

/**
 * Applies a distributed rate limit using DynamoDB for the provided identity.
 *
 * @param {{
 *   dynamo?: { update: Function },
 *   tableName?: string,
 *   identity?: string,
 *   scope?: string,
 *   limit?: number,
 *   windowSeconds?: number,
 *   now?: number,
 *   logger?: Console
 * }} [options]
 * @returns {Promise<object>}
 */
async function enforceRateLimit({
  dynamo,
  tableName,
  identity,
  scope,
  limit = DEFAULT_MAX_REQUESTS,
  windowSeconds = DEFAULT_WINDOW_SECONDS,
  now = Date.now(),
  logger = console,
} = {}) {
  if (!dynamo || typeof dynamo.update !== 'function' || !tableName) {
    return { ok: true, skipped: true };
  }

  const maxRequests = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_MAX_REQUESTS;
  const windowIntervalSeconds = Number.isFinite(windowSeconds) && windowSeconds > 0
    ? Math.floor(windowSeconds)
    : DEFAULT_WINDOW_SECONDS;

  const windowInfo = computeWindowInfo(now, windowIntervalSeconds);
  const bucketKey = buildBucketKey(scope, identity, windowInfo.windowId);
  const ttlSeconds = Math.ceil(windowInfo.windowEndMs / 1000);
  const expiresAtIso = new Date(windowInfo.windowEndMs).toISOString();

  const params = {
    TableName: tableName,
    Key: { bucket: bucketKey },
    UpdateExpression:
      'SET #count = if_not_exists(#count, :zero) + :inc, #ttl = :ttl, #scope = if_not_exists(#scope, :scope), #identity = if_not_exists(#identity, :identity), #window = :window, #expiresAt = :expiresAt',
    ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
    ExpressionAttributeNames: {
      '#count': 'count',
      '#ttl': 'ttl',
      '#scope': 'scope',
      '#identity': 'identity',
      '#window': 'windowId',
      '#expiresAt': 'expiresAt',
    },
    ExpressionAttributeValues: {
      ':zero': 0,
      ':inc': 1,
      ':limit': maxRequests,
      ':ttl': ttlSeconds,
      ':scope': safeString(scope, 'global'),
      ':identity': safeString(identity, 'anonymous'),
      ':window': String(windowInfo.windowId),
      ':expiresAt': expiresAtIso,
    },
    ReturnValues: 'UPDATED_NEW',
  };

  try {
    const result = await dynamo.update(params).promise();
    const count = Number(result?.Attributes?.count) || 0;
    return {
      ok: true,
      count,
      remaining: Math.max(0, maxRequests - count),
      limit: maxRequests,
      windowSeconds: windowIntervalSeconds,
      windowEndsAt: expiresAtIso,
      bucket: bucketKey,
    };
  } catch (error) {
    if (error && error.code === 'ConditionalCheckFailedException') {
      const retryAfterMs = Math.max(0, windowInfo.windowEndMs - (Number.isFinite(now) ? now : Date.now()));
      return {
        ok: false,
        reason: 'rate-limit',
        retryAfterMs,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        limit: maxRequests,
        windowSeconds: windowIntervalSeconds,
      };
    }
    if (logger && typeof logger.error === 'function') {
      logger.error('Rate limit enforcement failed.', error);
    }
    throw error;
  }
}

/**
 * Derives a stable rate-limit identity from authentication or request metadata.
 *
 * @param {{ googleId?: string, sessionId?: string, sourceIp?: string, headers?: object, multiValueHeaders?: object }} [event]
 * @returns {{ identity: string, googleId: string | null, sessionId: string | null, sourceIp: string | null }}
 */
function deriveRateLimitIdentity({ googleId, sessionId, sourceIp, headers, multiValueHeaders } = {}) {
  const headerGoogleId =
    normaliseHeaderValue(headers, RATE_LIMIT_HEADER_GOOGLE_ID) ||
    normaliseHeaderValue(multiValueHeaders, RATE_LIMIT_HEADER_GOOGLE_ID);
  const trimmedGoogleId = safeString(headerGoogleId || googleId);
  if (trimmedGoogleId) {
    return `user:${trimmedGoogleId}`;
  }
  const trimmedSessionId = safeString(sessionId);
  if (trimmedSessionId) {
    return `session:${trimmedSessionId}`;
  }
  const trimmedIp = safeString(sourceIp);
  if (trimmedIp) {
    return `ip:${trimmedIp}`;
  }
  return 'anonymous';
}

module.exports = {
  enforceRateLimit,
  deriveRateLimitIdentity,
  DEFAULT_WINDOW_SECONDS,
  DEFAULT_MAX_REQUESTS,
  RATE_LIMIT_HEADER_GOOGLE_ID,
};
