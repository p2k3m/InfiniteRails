'use strict';

let cachedSdk = null;
let cachedClient = null;

function resolveAwsSdk() {
  if (cachedSdk) {
    return cachedSdk;
  }

  if (typeof globalThis !== 'undefined' && globalThis.__INFINITERAILS_AWS_SDK__) {
    cachedSdk = globalThis.__INFINITERAILS_AWS_SDK__;
    return cachedSdk;
  }

  try {
    // eslint-disable-next-line global-require
    cachedSdk = require('aws-sdk');
    return cachedSdk;
  } catch (error) {
    cachedSdk = {
      DynamoDB: {
        // eslint-disable-next-line no-shadow
        DocumentClient: function DocumentClient() {
          throw new Error(
            'aws-sdk module is unavailable. Provide a DynamoDB.DocumentClient via globalThis.__INFINITERAILS_AWS_SDK__.',
          );
        },
      },
    };
    return cachedSdk;
  }
}

function getDocumentClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const sdk = resolveAwsSdk();
  const documentClientFactory = sdk?.DynamoDB?.DocumentClient;

  if (typeof documentClientFactory !== 'function') {
    throw new Error('aws-sdk DynamoDB.DocumentClient constructor is not available.');
  }

  cachedClient = new documentClientFactory();
  return cachedClient;
}

function __resetDocumentClient() {
  cachedClient = null;
}

module.exports = {
  resolveAwsSdk,
  getDocumentClient,
  __resetDocumentClient,
};
