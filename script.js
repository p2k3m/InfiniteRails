function ensureTrailingSlash(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

const PRODUCTION_ASSET_ROOT = ensureTrailingSlash('https://d3gj6x3ityfh5o.cloudfront.net/');

      probeBackendEndpoint({
        url: configuredUsersUrl,
        method: 'GET',
        label: 'GET /users',
        allowStatuses: new Set(),
      }),
