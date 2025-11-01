import { describe, expect, it } from 'vitest';

import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

describe('asset root overrides', () => {
  it('respects explicit query string overrides', () => {
    const { sandbox, windowStub } = createBootstrapSandbox({});
    windowStub.location.search = '?assetRoot=./assets-test/';

    evaluateBootstrapScript(sandbox);

    expect(windowStub.APP_CONFIG.assetRoot).toBe('./assets-test/');
    expect(windowStub.localStorage.setItem).toHaveBeenCalledWith(
      'infiniteRails.assetRootOverride',
      './assets-test/',
    );
  });

  it('infers a localhost asset root when running from loopback hosts', () => {
    const { sandbox, windowStub } = createBootstrapSandbox({});
    windowStub.location.href = 'http://localhost:3000/index.html';
    windowStub.location.protocol = 'http:';
    windowStub.location.host = 'localhost:3000';
    windowStub.location.hostname = 'localhost';
    windowStub.location.origin = 'http://localhost:3000';
    windowStub.location.pathname = '/index.html';
    windowStub.location.search = '';

    evaluateBootstrapScript(sandbox);

    expect(windowStub.APP_CONFIG.assetRoot).toBe('http://localhost:3000/');
    expect(windowStub.APP_CONFIG.assetBaseUrl).toBe('http://localhost:3000/');
  });

  it('treats private network hosts as local asset roots', () => {
    const { sandbox, windowStub } = createBootstrapSandbox({});
    windowStub.location.href = 'http://192.168.1.15:4173/index.html';
    windowStub.location.protocol = 'http:';
    windowStub.location.host = '192.168.1.15:4173';
    windowStub.location.hostname = '192.168.1.15';
    windowStub.location.origin = 'http://192.168.1.15:4173';
    windowStub.location.pathname = '/index.html';
    windowStub.location.search = '';

    evaluateBootstrapScript(sandbox);

    expect(windowStub.APP_CONFIG.assetRoot).toBe('http://192.168.1.15:4173/');
    expect(windowStub.APP_CONFIG.assetBaseUrl).toBe('http://192.168.1.15:4173/');
  });

  it('ignores persisted CDN overrides when running on localhost', () => {
    const { sandbox, windowStub } = createBootstrapSandbox({});
    windowStub.location.href = 'http://localhost:4173/index.html';
    windowStub.location.protocol = 'http:';
    windowStub.location.host = 'localhost:4173';
    windowStub.location.hostname = 'localhost';
    windowStub.location.origin = 'http://localhost:4173';
    windowStub.location.pathname = '/index.html';
    windowStub.location.search = '';

    const cdnRoot = 'https://d3gj6x3ityfh5o.cloudfront.net/';
    windowStub.localStorage.setItem('infiniteRails.assetRootOverride', cdnRoot);
    windowStub.localStorage.setItem('InfiniteRails.assetRootOverride', cdnRoot);
    windowStub.localStorage.setItem('InfiniteRails.assetRoot', cdnRoot);

    evaluateBootstrapScript(sandbox);

    expect(windowStub.APP_CONFIG.assetRoot).toBe('http://localhost:4173/');
    expect(windowStub.APP_CONFIG.assetBaseUrl).toBe('http://localhost:4173/');

    const removedKeys = windowStub.localStorage.removeItem.mock.calls.map((call) => call[0]);
    expect(removedKeys).toEqual(
      expect.arrayContaining([
        'infiniteRails.assetRootOverride',
        'InfiniteRails.assetRootOverride',
        'InfiniteRails.assetRoot',
      ]),
    );
  });

  it('ignores preconfigured CDN asset roots when running on localhost', () => {
    const cdnRoot = 'https://d3gj6x3ityfh5o.cloudfront.net/';
    const { sandbox, windowStub } = createBootstrapSandbox({
      appConfig: { assetRoot: cdnRoot },
    });

    windowStub.location.href = 'http://localhost:4173/index.html';
    windowStub.location.protocol = 'http:';
    windowStub.location.host = 'localhost:4173';
    windowStub.location.hostname = 'localhost';
    windowStub.location.origin = 'http://localhost:4173';
    windowStub.location.pathname = '/index.html';
    windowStub.location.search = '';

    evaluateBootstrapScript(sandbox);

    expect(windowStub.APP_CONFIG.assetRoot).toBe('http://localhost:4173/');
    expect(windowStub.APP_CONFIG.assetBaseUrl).toBe('http://localhost:4173/');
  });

  it('falls back to the bundled asset root when no overrides apply', () => {
    const { sandbox, windowStub } = createBootstrapSandbox({});

    evaluateBootstrapScript(sandbox);

    expect(windowStub.APP_CONFIG.assetRoot).toBe('/');
    expect(windowStub.APP_CONFIG.assetBaseUrl).toBe('/');
  });
});
