import { describe, expect, it, vi } from 'vitest';

import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

function createResponse({ ok, status, statusText = 'STATUS' }) {
  return {
    ok,
    status,
    statusText,
    headers: {
      get() {
        return null;
      },
    },
  };
}

describe('asset CDN failover', () => {
  it('falls back to the local asset bundle when CDN responses return 403', async () => {
    const { sandbox, windowStub } = createBootstrapSandbox({
      appConfig: { assetRoot: 'https://d3gj6x3ityfh5o.cloudfront.net/' },
    });

    sandbox.localStorage.setItem('infiniteRails.assetRootOverride', 'https://d3gj6x3ityfh5o.cloudfront.net/');
    sandbox.localStorage.setItem('InfiniteRails.assetRootOverride', 'https://d3gj6x3ityfh5o.cloudfront.net/');
    sandbox.localStorage.setItem('InfiniteRails.assetRoot', 'https://d3gj6x3ityfh5o.cloudfront.net/');

    const requests = [];
    const fetchResponses = [
      createResponse({ ok: false, status: 403, statusText: 'Forbidden' }),
      createResponse({ ok: true, status: 200, statusText: 'OK' }),
      createResponse({ ok: true, status: 200, statusText: 'OK' }),
    ];

    const fetchMock = vi.fn((input) => {
      const url = typeof input === 'string' ? input : input?.url ?? '';
      requests.push(url);
      return Promise.resolve(fetchResponses.shift() ?? createResponse({ ok: true, status: 200 }));
    });

    sandbox.fetch = fetchMock;
    sandbox.window.fetch = fetchMock;
    windowStub.fetch = fetchMock;

    evaluateBootstrapScript(sandbox);

    const wrappedFetch = windowStub.fetch;
    expect(wrappedFetch).not.toBe(fetchMock);
    expect(windowStub.APP_CONFIG.assetRoot).toBe('https://d3gj6x3ityfh5o.cloudfront.net/');

    const cdnAssetUrl = 'https://d3gj6x3ityfh5o.cloudfront.net/asset-manifest.json?assetVersion=1';

    const firstResponse = await wrappedFetch(cdnAssetUrl);
    expect(firstResponse.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requests[0]).toBe(cdnAssetUrl);
    expect(requests[1]).toBe('https://example.com/asset-manifest.json?assetVersion=1');

    const failoverState = windowStub.__INFINITE_RAILS_TEST_HOOKS__?.getAssetFailoverState?.();
    expect(failoverState?.failoverActive).toBe(true);
    expect(failoverState?.fallbackRoot).toBe('https://example.com/');
    expect(windowStub.APP_CONFIG.assetRoot).toBe('https://example.com/');

    const removedKeys = sandbox.localStorage.removeItem.mock.calls.map((call) => call[0]);
    expect(removedKeys).toEqual(
      expect.arrayContaining([
        'infiniteRails.assetRootOverride',
        'InfiniteRails.assetRootOverride',
        'InfiniteRails.assetRoot',
      ]),
    );

    const secondResponse = await wrappedFetch(cdnAssetUrl);
    expect(secondResponse.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requests[2]).toBe('https://example.com/asset-manifest.json?assetVersion=1');
  });

  it('activates failover when manifest diagnostics encounter HTTP 403 responses', async () => {
    const { sandbox, windowStub } = createBootstrapSandbox({
      appConfig: { assetRoot: 'https://d3gj6x3ityfh5o.cloudfront.net/' },
    });

    const manifestElement = windowStub.document.createElement('script');
    manifestElement.setAttribute('id', 'assetManifest');
    manifestElement.type = 'application/json';
    manifestElement.textContent = JSON.stringify({
      version: 1,
      assetBaseUrl: 'https://d3gj6x3ityfh5o.cloudfront.net/',
      assets: ['scripts/cdn-guard.js'],
    });
    windowStub.document.body.appendChild(manifestElement);

    evaluateBootstrapScript(sandbox);

    const manifestBefore = windowStub.__INFINITE_RAILS_ASSET_MANIFEST__;
    expect(manifestBefore?.resolvedAssetBaseUrl).toBe('https://d3gj6x3ityfh5o.cloudfront.net/');

    windowStub.location.href = 'http://localhost:3000/index.html';
    windowStub.location.origin = 'http://localhost:3000';
    windowStub.location.protocol = 'http:';
    windowStub.location.host = 'localhost:3000';
    windowStub.location.hostname = 'localhost';

    sandbox.applyManifestFailoverOverride(windowStub, {
      type: 'http',
      status: 403,
      url: 'https://d3gj6x3ityfh5o.cloudfront.net/scripts/cdn-guard.js',
    });

    expect(windowStub.APP_CONFIG.assetRoot).toBe('http://localhost:3000/');

    const manifestAfter = windowStub.__INFINITE_RAILS_ASSET_MANIFEST__;
    expect(manifestAfter?.resolvedAssetBaseUrl).toBe('http://localhost:3000/');
    expect(manifestAfter?.assets?.[0]?.url).toBe('http://localhost:3000/scripts/cdn-guard.js');

    const removedKeys = sandbox.localStorage.removeItem.mock.calls.map((call) => call[0]);
    expect(removedKeys).toEqual(
      expect.arrayContaining([
        'infiniteRails.assetRootOverride',
        'InfiniteRails.assetRootOverride',
        'InfiniteRails.assetRoot',
      ]),
    );
  });
});
