'use strict';

const { createResponse, handleOptions } = require('../lib/http');
const { createTraceContext, createTraceLogger } = require('../lib/trace');
const { getDocumentClient } = require('../lib/aws.js');

const DEFAULT_CONFIG_KEY = 'feature-flags';

const HEALTH_DEGRADED_STATUSES = new Set([
  'degraded',
  'degraded-performance',
  'partial-outage',
  'partial-outages',
  'major-outage',
  'major-outages',
  'major-incident',
  'critical',
  'outage',
  'outages',
  'maintenance',
  'maintenance-mode',
  'incident',
  'incidents',
  'suspended',
]);

function resolveConfigTable() {
  const rawValue = process.env.CONFIG_TABLE;
  if (typeof rawValue !== 'string') {
    return null;
  }
  const trimmed = rawValue.trim();
  return trimmed.length ? trimmed : null;
}

function normaliseBoolean(value) {
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }
    if (['true', '1', 'yes', 'on', 'enable', 'enabled'].includes(trimmed)) {
      return true;
    }
    if (['false', '0', 'no', 'off', 'disable', 'disabled'].includes(trimmed)) {
      return false;
    }
    return null;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return null;
    }
    if (value === 0) {
      return false;
    }
    if (value === 1) {
      return true;
    }
  }
  return null;
}

function normaliseString(value, { maxLength = 512 } = {}) {
  if (value === undefined || value === null) {
    return null;
  }
  const stringValue = typeof value === 'string' ? value : String(value);
  const trimmed = stringValue.trim();
  if (!trimmed) {
    return null;
  }
  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

function normaliseTimestamp(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const stringValue = String(value);
  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normaliseStatus(value, { maxLength = 64 } = {}) {
  const raw = normaliseString(value, { maxLength });
  if (!raw) {
    return { raw: null, normalised: null };
  }
  const normalised = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return { raw, normalised: normalised || raw.toLowerCase() };
}

function resolveHealthOverrides(source = {}) {
  const health = source && typeof source === 'object' ? source : {};
  const { raw: rawStatus, normalised: status } = normaliseStatus(
    health.status ?? health.state ?? health.level ?? health.condition,
  );
  const degraded = Boolean(status && HEALTH_DEGRADED_STATUSES.has(status));

  const healthFeatures =
    health.features && typeof health.features === 'object' ? health.features : {};

  const safeModeCandidate = normaliseBoolean(
    health.safeMode ?? health.forceSafeMode ?? health.enableSafeMode,
  );
  const safeMode =
    safeModeCandidate === null ? (degraded ? true : null) : safeModeCandidate;

  const forceSimpleRenderer = normaliseBoolean(
    healthFeatures.forceSimpleRenderer ??
      healthFeatures.forceSimpleMode ??
      health.forceSimpleRenderer ??
      health.forceSimpleMode,
  );

  const disableScoreSync = normaliseBoolean(
    healthFeatures.disableScoreSync ??
      healthFeatures.suspendLiveFeatures ??
      healthFeatures.disableLeaderboard ??
      health.disableScoreSync ??
      health.suspendLiveFeatures,
  );

  const message =
    normaliseString(
      health.message ??
        health.scoreboardMessage ??
        health.leaderboardMessage ??
        healthFeatures.message,
    ) ?? null;

  const updatedAt = normaliseTimestamp(health.updatedAt ?? health.timestamp);

  const metadata = {
    status: status ?? null,
    rawStatus: rawStatus ?? null,
    degraded,
  };
  if (updatedAt) {
    metadata.updatedAt = updatedAt;
  }
  if (message) {
    metadata.message = message;
  }

  return {
    safeMode,
    forceSimpleRenderer,
    disableScoreSync,
    message,
    metadata,
  };
}

function applySafeDefaults(entry = {}) {
  const flags = entry.features && typeof entry.features === 'object' ? entry.features : {};
  const messages = entry.messages && typeof entry.messages === 'object' ? entry.messages : {};

  const forceSimpleRenderer = normaliseBoolean(flags.forceSimpleRenderer);
  const disableScoreSync = normaliseBoolean(flags.disableScoreSync ?? flags.suspendLiveFeatures);
  const safeMode = normaliseBoolean(flags.safeMode);

  const health = resolveHealthOverrides(entry.health);

  const effectiveForceSimple =
    safeMode === true || health.safeMode === true
      ? true
      : health.forceSimpleRenderer === true
        ? true
        : health.forceSimpleRenderer === false
          ? false
          : forceSimpleRenderer === null
            ? false
            : forceSimpleRenderer;
  const effectiveDisableSync =
    safeMode === true || health.safeMode === true
      ? true
      : health.disableScoreSync === true
        ? true
        : health.disableScoreSync === false
          ? false
          : disableScoreSync === null
            ? false
            : disableScoreSync;

  const scoreboardMessage =
    normaliseString(messages.scoreboard ?? messages.leaderboard ?? flags.scoreboardMessage) ??
    ((effectiveDisableSync || health.message)
      ? health.message ??
        'Leaderboard maintenance in progress — runs stay local until service resumes.'
      : null);

  const healthMetadata = {
    ...health.metadata,
    degraded:
      Boolean(health.metadata.degraded) || effectiveDisableSync === true || effectiveForceSimple === true,
  };
  if (!healthMetadata.message && (health.message || scoreboardMessage)) {
    healthMetadata.message = health.message ?? scoreboardMessage ?? null;
  }

  if (!healthMetadata.status && healthMetadata.rawStatus) {
    const { normalised } = normaliseStatus(healthMetadata.rawStatus);
    if (normalised) {
      healthMetadata.status = normalised;
    }
  }

  delete healthMetadata.rawStatus;
  if (!healthMetadata.status) {
    delete healthMetadata.status;
  }
  if (!healthMetadata.message) {
    delete healthMetadata.message;
  }
  if (!healthMetadata.updatedAt) {
    delete healthMetadata.updatedAt;
  }
  if (!healthMetadata.degraded) {
    healthMetadata.degraded = false;
  }

  return {
    version: normaliseString(entry.version, { maxLength: 64 }) ?? null,
    updatedAt: normaliseTimestamp(entry.updatedAt) ?? normaliseTimestamp(entry.timestamp),
    fetchedAt: new Date().toISOString(),
    features: {
      forceSimpleRenderer: effectiveForceSimple,
      disableScoreSync: effectiveDisableSync,
    },
    messages: {
      scoreboard: scoreboardMessage,
    },
    health: healthMetadata,
  };
}

async function loadRemoteConfig({ trace, logger }) {
  const tableName = resolveConfigTable();
  if (!tableName) {
    logger.warn('CONFIG_TABLE environment variable is not configured; returning defaults.');
    return applySafeDefaults({});
  }

  let dynamo;
  try {
    dynamo = getDocumentClient();
  } catch (error) {
    logger.error('Failed to initialise DynamoDB client for feature flag configuration.', error);
    return applySafeDefaults({});
  }

  const params = {
    TableName: tableName,
    Key: { configKey: DEFAULT_CONFIG_KEY },
    ConsistentRead: true,
  };

  let result;
  try {
    result = await dynamo.get(params).promise();
  } catch (error) {
    logger.error('Failed to read remote feature flag configuration.', error);
    return applySafeDefaults({});
  }

  if (!result || !result.Item) {
    logger.warn('Feature flag configuration record missing; falling back to defaults.', {
      configKey: DEFAULT_CONFIG_KEY,
    });
    return applySafeDefaults({});
  }

  return applySafeDefaults(result.Item);
}

/**
 * Lambda handler for the configuration endpoint used by the web client.
 *
 * @param {object} [event]
 * @param {object} [context]
 * @returns {Promise<import('../lib/http').ApiResponse>}
 */
exports.handler = async (event = {}, context = {}) => {
  const trace = createTraceContext(event, context);
  const logger = createTraceLogger(trace);

  if (event?.httpMethod === 'OPTIONS') {
    return handleOptions({ trace });
  }

  if (event?.httpMethod && event.httpMethod !== 'GET') {
    return createResponse(
      405,
      { message: 'Method Not Allowed' },
      { trace, headers: { Allow: 'GET,OPTIONS' } },
    );
  }

  try {
    const config = await loadRemoteConfig({ trace, logger });
    return createResponse(200, { config }, { trace });
  } catch (error) {
    logger.error('Unhandled error while resolving feature flag configuration.', error);
    return createResponse(500, { message: 'Failed to resolve configuration.' }, { trace });
  }
};
