'use strict';

const AWS = require('aws-sdk');
const crypto = require('crypto');
const {
  createResponse,
  parseJsonBody,
  handleOptions,
} = require('../lib/http');
const { createTraceContext, createTraceLogger } = require('../lib/trace');

const dynamo = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE;
const INCIDENT_TOPIC_ARN = process.env.INCIDENT_NOTIFICATION_TOPIC_ARN || null;
const INCIDENT_THRESHOLD = Number(process.env.INCIDENT_NOTIFICATION_THRESHOLD || 5);
const INCIDENT_WINDOW_SECONDS = Number(process.env.INCIDENT_NOTIFICATION_WINDOW_SECONDS || 900);
const INCIDENT_COOLDOWN_SECONDS = Number(process.env.INCIDENT_NOTIFICATION_COOLDOWN_SECONDS || 1800);

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

function sanitiseDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return null;
  }
  const output = {};
  const keys = Object.keys(detail).slice(0, 20);
  keys.forEach((key) => {
    if (typeof key !== 'string') {
      return;
    }
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return;
    }
    const value = detail[key];
    if (typeof value === 'string') {
      const normalised = sanitiseString(value, { maxLength: 512, allowEmpty: true });
      if (normalised !== null) {
        output[trimmedKey] = normalised;
      }
      return;
    }
    if (typeof value === 'number') {
      const numeric = sanitiseNumber(value, { fallback: null });
      if (numeric !== null) {
        output[trimmedKey] = numeric;
      }
      return;
    }
    if (typeof value === 'boolean') {
      output[trimmedKey] = value;
    }
  });
  return Object.keys(output).length ? output : null;
}

function sanitiseDiagnosticInput(raw = {}) {
  const scope = sanitiseString(raw.scope, { maxLength: 64 });
  const level = sanitiseString(raw.level, { maxLength: 24 });
  const message = sanitiseString(raw.message, { maxLength: 1024 });
  const sessionId =
    sanitiseString(raw.sessionId, { maxLength: 256 }) || sanitiseString(raw.traceId, { maxLength: 256 });
  const traceId = sanitiseString(raw.traceId, { maxLength: 256 });
  const rendererMode = sanitiseString(raw.rendererMode, { maxLength: 64 });
  const timestamp = sanitiseNumber(raw.timestamp, { fallback: Date.now(), min: 0 });
  const detail = sanitiseDetail(raw.detail);
  if (!scope || !level || !message) {
    return null;
  }
  return {
    scope,
    level,
    message,
    sessionId,
    traceId,
    rendererMode,
    timestamp,
    detail,
  };
}

function normaliseIncidentScope(scope) {
  if (typeof scope !== 'string') {
    return null;
  }
  const trimmed = scope.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes('asset')) {
    return 'assets';
  }
  if (trimmed.includes('startup') || trimmed.includes('boot')) {
    return 'startup';
  }
  return null;
}

function isCriticalLevel(level) {
  if (typeof level !== 'string') {
    return false;
  }
  const value = level.trim().toLowerCase();
  return value === 'error' || value === 'critical' || value === 'fatal';
}

function hashIdentifier(identifier) {
  const input = typeof identifier === 'string' ? identifier.trim() : '';
  if (!input) {
    return null;
  }
  return crypto.createHash('sha256').update(input).digest('hex');
}

function ensurePositiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

async function recordIncident(incidentKey, sessionHash, entry, logger) {
  if (!INCIDENTS_TABLE) {
    const error = new Error('INCIDENTS_TABLE environment variable is not configured.');
    error.code = 'INCIDENTS_TABLE_MISSING';
    throw error;
  }

  const nowMs = typeof entry.timestamp === 'number' ? entry.timestamp : Date.now();
  const windowSeconds = ensurePositiveNumber(INCIDENT_WINDOW_SECONDS, 900);
  const ttlSeconds = Math.floor(nowMs / 1000) + windowSeconds;

  const latestEntry = {
    message: entry.message,
    scope: entry.scope,
    level: entry.level,
    traceId: entry.traceId || null,
    rendererMode: entry.rendererMode || null,
    timestamp: nowMs,
  };

  const updateParams = {
    TableName: INCIDENTS_TABLE,
    Key: { incidentKey },
    UpdateExpression:
      'ADD #sessions :sessionSet SET #lastSeenAt = :lastSeenAt, #ttl = :ttl, #latest = :latest, #firstSeenAt = if_not_exists(#firstSeenAt, :lastSeenAt)',
    ExpressionAttributeNames: {
      '#sessions': 'sessions',
      '#lastSeenAt': 'lastSeenAt',
      '#ttl': 'ttl',
      '#latest': 'latestEntry',
      '#firstSeenAt': 'firstSeenAt',
    },
    ExpressionAttributeValues: {
      ':sessionSet': dynamo.createSet([sessionHash]),
      ':lastSeenAt': nowMs,
      ':ttl': ttlSeconds,
      ':latest': latestEntry,
    },
    ReturnValues: 'ALL_NEW',
  };

  let result;
  try {
    result = await dynamo.update(updateParams).promise();
  } catch (error) {
    logger.error('Failed to update incident counter.', error);
    throw error;
  }

  const sessionsAttribute = result.Attributes?.sessions;
  let sessionCount = 0;
  if (sessionsAttribute && typeof sessionsAttribute === 'object') {
    if (Array.isArray(sessionsAttribute.values)) {
      sessionCount = sessionsAttribute.values.length;
    } else if (typeof sessionsAttribute.size === 'number') {
      sessionCount = sessionsAttribute.size;
    }
  }

  return {
    sessionCount,
    attributes: result.Attributes || {},
    timestamp: nowMs,
    latestEntry,
  };
}

async function markIncidentNotified(incidentKey, timestamp, logger) {
  const cooldownSeconds = ensurePositiveNumber(INCIDENT_COOLDOWN_SECONDS, 1800);
  const cutoff = timestamp - cooldownSeconds * 1000;

  const params = {
    TableName: INCIDENTS_TABLE,
    Key: { incidentKey },
    UpdateExpression: 'SET #notifiedAt = :timestamp',
    ConditionExpression: 'attribute_not_exists(#notifiedAt) OR #notifiedAt < :cutoff',
    ExpressionAttributeNames: {
      '#notifiedAt': 'notifiedAt',
    },
    ExpressionAttributeValues: {
      ':timestamp': timestamp,
      ':cutoff': cutoff,
    },
  };

  try {
    await dynamo.update(params).promise();
    return true;
  } catch (error) {
    if (error && error.code === 'ConditionalCheckFailedException') {
      logger.debug('Incident notification suppressed due to active cooldown.', {
        incidentKey,
      });
      return false;
    }
    logger.error('Failed to mark incident notification.', error);
    throw error;
  }
}

async function publishIncidentNotification({ incidentKey, sessionCount, latestEntry }, logger) {
  if (!INCIDENT_TOPIC_ARN) {
    logger.warn('Incident notification topic is not configured; skipping publish.', { incidentKey });
    return false;
  }

  const scopeLabel = incidentKey === 'assets' ? 'asset loading' : 'startup';
  const subject = `Critical ${scopeLabel} failures detected`;
  const windowMinutes = Math.max(1, Math.round(ensurePositiveNumber(INCIDENT_WINDOW_SECONDS, 900) / 60));
  const lines = [
    `Critical ${scopeLabel} errors have been reported by ${sessionCount} unique session${
      sessionCount === 1 ? '' : 's'
    } within the last ${windowMinutes} minute${windowMinutes === 1 ? '' : 's'}.`,
    '',
    `Most recent diagnostic: ${latestEntry.message}`,
    `Scope: ${latestEntry.scope}`,
    `Level: ${latestEntry.level}`,
  ];
  if (latestEntry.traceId) {
    lines.push(`Trace ID: ${latestEntry.traceId}`);
  }
  if (latestEntry.rendererMode) {
    lines.push(`Renderer mode: ${latestEntry.rendererMode}`);
  }
  lines.push('', 'Investigate the diagnostics pipeline for additional context and player impact.');

  try {
    await sns
      .publish({
        TopicArn: INCIDENT_TOPIC_ARN,
        Subject: subject,
        Message: lines.join('\n'),
      })
      .promise();
    return true;
  } catch (error) {
    logger.error('Failed to publish incident notification.', error);
    throw error;
  }
}

async function processCriticalIncident(entry, logger) {
  const incidentScope = normaliseIncidentScope(entry.scope);
  if (!incidentScope) {
    return { recorded: false, notified: false };
  }
  if (!isCriticalLevel(entry.level)) {
    return { recorded: false, notified: false };
  }
  const sessionHash = hashIdentifier(entry.sessionId);
  if (!sessionHash) {
    logger.debug('Discarding incident candidate without a session identifier.', {
      scope: entry.scope,
      level: entry.level,
    });
    return { recorded: false, notified: false };
  }

  const record = await recordIncident(incidentScope, sessionHash, entry, logger);
  if (record.sessionCount < ensurePositiveNumber(INCIDENT_THRESHOLD, 5)) {
    return { recorded: true, notified: false, sessionCount: record.sessionCount };
  }

  const shouldNotify = await markIncidentNotified(incidentScope, record.timestamp, logger);
  if (!shouldNotify) {
    return { recorded: true, notified: false, sessionCount: record.sessionCount };
  }

  await publishIncidentNotification(
    {
      incidentKey: incidentScope,
      sessionCount: record.sessionCount,
      latestEntry: record.latestEntry,
    },
    logger,
  );

  return { recorded: true, notified: true, sessionCount: record.sessionCount };
}

async function ingestDiagnostics(event, trace, logger) {
  if (!INCIDENTS_TABLE) {
    logger.error('INCIDENTS_TABLE environment variable is not configured.');
    return createResponse(500, { message: 'Diagnostics incident tracking is not configured.' }, { trace });
  }

  let payload;
  try {
    payload = parseJsonBody(event) ?? {};
  } catch (error) {
    logger.warn('Received invalid JSON payload for diagnostics ingestion.', { error });
    return createResponse(400, { message: error.message }, { trace });
  }

  const inputs = Array.isArray(payload) ? payload : [payload];
  const diagnostics = inputs
    .map((entry) => {
      const sanitised = sanitiseDiagnosticInput(entry);
      if (!sanitised) {
        logger.warn('Discarding diagnostics entry with invalid structure.', { entry });
      }
      return sanitised;
    })
    .filter(Boolean);

  if (!diagnostics.length) {
    return createResponse(400, { message: 'No valid diagnostics entries provided.' }, { trace });
  }

  const results = [];
  for (const entry of diagnostics) {
    try {
      const outcome = await processCriticalIncident(entry, logger);
      if (outcome.recorded) {
        results.push({
          scope: entry.scope,
          level: entry.level,
          notified: outcome.notified,
          sessionCount: outcome.sessionCount,
        });
      }
    } catch (error) {
      logger.error('Failed to process diagnostics entry.', error);
      return createResponse(500, { message: 'Failed to process diagnostics entry.' }, { trace });
    }
  }

  return createResponse(202, { message: 'Diagnostics recorded.', results }, { trace });
}

/**
 * Lambda handler that records client-side diagnostics and raises incidents.
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

  if (event?.httpMethod === 'POST') {
    return ingestDiagnostics(event, trace, logger);
  }

  logger.warn('Diagnostics handler received unsupported method.', { method: event?.httpMethod });
  return createResponse(405, { message: 'Method Not Allowed' }, { trace });
};
