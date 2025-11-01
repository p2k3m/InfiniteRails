import { describe, expect, it, vi } from 'vitest';

import {
  createBootstrapSandbox,
  evaluateBootstrapScript,
  flushMicrotasks,
} from './helpers/bootstrap-test-utils.js';

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
    expect(requests[1]).toBe('./asset-manifest.json?assetVersion=1');

    const failoverState = windowStub.__INFINITE_RAILS_TEST_HOOKS__?.getAssetFailoverState?.();
    expect(failoverState?.failoverActive).toBe(true);
    expect(failoverState?.fallbackRoot).toBe('./');
    expect(windowStub.APP_CONFIG.assetRoot).toBe('./');

    const removedKeys = sandbox.localStorage.removeItem.mock.calls.map((call) => call[0]);
    expect(removedKeys).toEqual(
      expect.arrayContaining([
        'infiniteRails.assetRootOverride',
        'InfiniteRails.assetRootOverride',
        'InfiniteRails.assetRoot',
      ]),
    );

    const failoverBlockCall = sandbox.localStorage.setItem.mock.calls.find(
      ([key]) => key === 'InfiniteRails.assetRootFailoverBlock',
    );
    expect(failoverBlockCall).toBeDefined();
    const recordedBlocks = JSON.parse(failoverBlockCall[1]);
    expect(Array.isArray(recordedBlocks)).toBe(true);
    expect(recordedBlocks[0].root).toBe('https://d3gj6x3ityfh5o.cloudfront.net/');
    expect(recordedBlocks[0].reason).toBe(403);

    const secondResponse = await wrappedFetch(cdnAssetUrl);
    expect(secondResponse.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requests[2]).toBe('./asset-manifest.json?assetVersion=1');
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

  it('does not report missing assets after CDN 403 failover', async () => {
    const { sandbox, windowStub, consoleStub } = createBootstrapSandbox({
      appConfig: { assetRoot: 'https://d3gj6x3ityfh5o.cloudfront.net/' },
    });

    windowStub.location.href = 'http://localhost:3000/index.html';
    windowStub.location.origin = 'http://localhost:3000';
    windowStub.location.protocol = 'http:';
    windowStub.location.host = 'localhost:3000';
    windowStub.location.hostname = 'localhost';

    const manifestElement = windowStub.document.createElement('script');
    manifestElement.setAttribute('id', 'assetManifest');
    manifestElement.type = 'application/json';
    manifestElement.textContent = JSON.stringify({
      version: 1,
      assetBaseUrl: 'https://d3gj6x3ityfh5o.cloudfront.net/',
      assets: ['scripts/cdn-guard.js'],
    });
    windowStub.document.body.appendChild(manifestElement);

    const fetchMock = vi.fn((resource, init = {}) => {
      const url = typeof resource === 'string' ? resource : resource?.url ?? '';
      const method = typeof init?.method === 'string' ? init.method.toUpperCase() : 'GET';
      if (url.startsWith('http://localhost:3000')) {
        return Promise.resolve(createResponse({ ok: true, status: 200, statusText: 'OK' }));
      }
      if (method === 'HEAD' || method === 'GET') {
        return Promise.resolve(
          createResponse({ ok: false, status: 403, statusText: 'Forbidden' }),
        );
      }
      return Promise.resolve(createResponse({ ok: true, status: 200, statusText: 'OK' }));
    });

    sandbox.fetch = fetchMock;
    sandbox.window.fetch = fetchMock;
    windowStub.fetch = fetchMock;

    evaluateBootstrapScript(sandbox);
    await flushMicrotasks(5);

    const verificationResult = await sandbox.startManifestIntegrityVerification({
      source: 'test',
      scope: windowStub,
    });
    expect(verificationResult?.ok).toBe(true);
    expect(windowStub.APP_CONFIG.assetRoot).toBe('http://localhost:3000/');

    const missingAssetWarning = consoleStub.warn.mock.calls.find(
      (call) => call[0] === 'Manifest diagnostics detected missing assets.',
    );
    expect(missingAssetWarning).toBeUndefined();
  });

  it('avoids GET retries when manifest probes encounter CDN 403 responses', async () => {
    const { sandbox, windowStub } = createBootstrapSandbox();

    windowStub.__INFINITE_RAILS_MANIFEST_VERIFIED__ = true;
    sandbox.__INFINITE_RAILS_MANIFEST_VERIFIED__ = true;

    const manifestElement = windowStub.document.createElement('script');
    manifestElement.setAttribute('id', 'assetManifest');
    manifestElement.type = 'application/json';
    manifestElement.textContent = JSON.stringify({
      version: 1,
      assetBaseUrl: 'https://d3gj6x3ityfh5o.cloudfront.net/',
      assets: ['downlevel-polyfills.js'],
    });
    windowStub.document.body.appendChild(manifestElement);

    const fetchMock = vi.fn((resource, init = {}) => {
      const url = typeof resource === 'string' ? resource : resource?.url ?? '';
      if (url.includes('d3gj6x3ityfh5o.cloudfront.net')) {
        return Promise.resolve(createResponse({ ok: false, status: 403, statusText: 'Forbidden' }));
      }
      return Promise.resolve(createResponse({ ok: true, status: 200, statusText: 'OK' }));
    });

    sandbox.fetch = fetchMock;
    sandbox.window.fetch = fetchMock;
    windowStub.fetch = fetchMock;

    evaluateBootstrapScript(sandbox);

    const result = await sandbox.startManifestIntegrityVerification({
      source: 'test',
      scope: windowStub,
    });

    expect(result?.ok).toBe(true);

    const cdnCalls = fetchMock.mock.calls.filter(([resource]) => {
      const url = typeof resource === 'string' ? resource : resource?.url ?? '';
      return url === 'https://d3gj6x3ityfh5o.cloudfront.net/downlevel-polyfills.js';
    });
    expect(cdnCalls).toHaveLength(1);
    const [cdnResource, cdnInit = {}] = cdnCalls[0];
    expect(typeof cdnResource === 'string' ? cdnResource : cdnResource?.url ?? '').toBe(
      'https://d3gj6x3ityfh5o.cloudfront.net/downlevel-polyfills.js',
    );
    expect((cdnInit.method ?? 'GET').toUpperCase()).toBe('HEAD');
  });

  it('ignores blocked CDN asset roots during bootstrap', () => {
    const { sandbox, windowStub } = createBootstrapSandbox({
      appConfig: { assetRoot: 'https://d3gj6x3ityfh5o.cloudfront.net/' },
    });

    const blockRecords = [
      {
        root: 'https://d3gj6x3ityfh5o.cloudfront.net/',
        expiresAt: Date.now() + 30 * 60 * 1000,
        reason: 403,
      },
    ];

    sandbox.localStorage.setItem(
      'InfiniteRails.assetRootOverride',
      'https://d3gj6x3ityfh5o.cloudfront.net/',
    );
    sandbox.localStorage.setItem(
      'InfiniteRails.assetRootFailoverBlock',
      JSON.stringify(blockRecords),
    );

    evaluateBootstrapScript(sandbox);

    expect(windowStub.APP_CONFIG.assetRoot).toBe('/');

    const storedBlock = sandbox.localStorage.getItem('InfiniteRails.assetRootFailoverBlock');
    expect(storedBlock).toBeTruthy();
    const parsedBlock = JSON.parse(storedBlock);
    expect(parsedBlock).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          root: 'https://d3gj6x3ityfh5o.cloudfront.net/',
          reason: 403,
        }),
      ]),
    );
  });
});
