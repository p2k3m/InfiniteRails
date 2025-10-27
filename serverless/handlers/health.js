'use strict';

const os = require('os');
const { createResponse, handleOptions } = require('../lib/http');
const { createTraceContext, createTraceLogger } = require('../lib/trace');

const BOOT_TIME_MS = Date.now();
const BOOT_TIME_ISO = new Date(BOOT_TIME_MS).toISOString();

function sanitiseString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

function resolveEnvironment() {
  return (
    sanitiseString(process.env.APP_ENVIRONMENT) ||
    sanitiseString(process.env.NODE_ENV) ||
    null
  );
}

function resolveComponentStatus() {
  const configTableConfigured = sanitiseString(process.env.CONFIG_TABLE) !== null;
  const incidentsTableConfigured = sanitiseString(process.env.INCIDENTS_TABLE) !== null;
  const rateLimitsTableConfigured = sanitiseString(process.env.RATE_LIMITS_TABLE) !== null;
  const usersTableConfigured = sanitiseString(process.env.USERS_TABLE) !== null;
  const scoresTableConfigured = sanitiseString(process.env.SCORES_TABLE) !== null;
  const eventsTableConfigured = sanitiseString(process.env.EVENTS_TABLE) !== null;
  const incidentTopicConfigured =
    sanitiseString(process.env.INCIDENT_NOTIFICATION_TOPIC_ARN) !== null;

  return {
    config: {
      status: configTableConfigured ? 'configured' : 'missing',
    },
    rateLimits: {
      status: rateLimitsTableConfigured ? 'configured' : 'missing',
    },
    incidents: {
      status: incidentsTableConfigured ? 'configured' : 'missing',
    },
    incidentNotifications: {
      status: incidentTopicConfigured ? 'configured' : 'missing',
    },
    users: {
      status: usersTableConfigured ? 'configured' : 'missing',
    },
    scores: {
      status: scoresTableConfigured ? 'configured' : 'missing',
    },
    events: {
      status: eventsTableConfigured ? 'configured' : 'missing',
    },
  };
}

function buildHealthPayload() {
  const nowMs = Date.now();
  const uptimeSeconds = Math.max(0, (nowMs - BOOT_TIME_MS) / 1000);

  return {
    status: 'ok',
    timestamp: new Date(nowMs).toISOString(),
    uptime: {
      seconds: Number(uptimeSeconds.toFixed(3)),
      since: BOOT_TIME_ISO,
    },
    environment: resolveEnvironment(),
    region: sanitiseString(process.env.AWS_REGION),
    function: {
      name: sanitiseString(process.env.AWS_LAMBDA_FUNCTION_NAME),
      version: sanitiseString(process.env.AWS_LAMBDA_FUNCTION_VERSION),
      memoryMb: Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || 0) || null,
      architecture: sanitiseString(process.env.AWS_EXECUTION_ENV),
    },
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
    },
    components: resolveComponentStatus(),
  };
}

exports.handler = async (event = {}, context = {}) => {
  const trace = createTraceContext(event, context);
  const logger = createTraceLogger(trace);

  const method = (event?.httpMethod || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return handleOptions({ trace });
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return createResponse(
      405,
      { message: 'Method Not Allowed' },
      { trace, headers: { Allow: 'GET,HEAD,OPTIONS' } },
    );
  }

  try {
    const payload = buildHealthPayload();

    if (method === 'HEAD') {
      return createResponse(200, null, { trace });
    }

    return createResponse(200, payload, { trace });
  } catch (error) {
    logger.error('Failed to build health payload.', error);
    return createResponse(500, { status: 'error', message: 'Health check failed.' }, { trace });
  }
};
