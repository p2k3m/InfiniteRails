'use strict';

const AWS = require('aws-sdk');
const { createResponse, parseJsonBody, handleOptions } = require('../lib/http');

const dynamo = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE;

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

exports.handler = async (event) => {
  if (event?.httpMethod === 'OPTIONS') {
    return handleOptions();
  }

  if (event?.httpMethod !== 'POST') {
    return createResponse(405, { message: 'Method Not Allowed' });
  }

  if (!USERS_TABLE) {
    return createResponse(500, { message: 'USERS_TABLE environment variable is not configured.' });
  }

  let payload;
  try {
    payload = parseJsonBody(event) || {};
  } catch (error) {
    return createResponse(400, { message: error.message });
  }

  const googleId = typeof payload.googleId === 'string' ? payload.googleId.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';

  if (!googleId || !name) {
    return createResponse(400, { message: 'googleId and name are required fields.' });
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
    console.error('Failed to persist user record.', error);
    return createResponse(500, { message: 'Failed to persist user record.' });
  }

  return createResponse(200, {
    message: 'User profile synchronised.',
    item,
  });
};
