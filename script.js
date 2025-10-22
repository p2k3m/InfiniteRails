'use strict';

function ensureTrailingSlash(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

const PRODUCTION_ASSET_ROOT = ensureTrailingSlash('https://d3gj6x3ityfh5o.cloudfront.net/');

module.exports = {
  PRODUCTION_ASSET_ROOT,
  ensureTrailingSlash,
};
