const globalScope =
  (typeof globalThis !== 'undefined' && globalThis) ||
  (typeof window !== 'undefined' && window) ||
  (typeof global !== 'undefined' && global) ||
  {};

const applyAssetVersionTag =
  typeof globalScope.applyAssetVersionTag === 'function'
    ? globalScope.applyAssetVersionTag
    : (url) => url;

if (typeof globalScope.applyAssetVersionTag !== 'function') {
  globalScope.applyAssetVersionTag = applyAssetVersionTag;
}

function ensureTrailingSlash(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

const PRODUCTION_ASSET_ROOT = ensureTrailingSlash('https://d3gj6x3ityfh5o.cloudfront.net/');

const THREE_SCRIPT_URL = applyAssetVersionTag(
  'vendor/three.min.js?v=030c75d4e909.2f7e817c4683-dirty',
);
