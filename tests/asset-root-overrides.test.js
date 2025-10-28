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

  it('falls back to the production CDN when no overrides apply', () => {
    const { sandbox, windowStub } = createBootstrapSandbox({});

    evaluateBootstrapScript(sandbox);

    expect(windowStub.APP_CONFIG.assetRoot).toBe('https://d3gj6x3ityfh5o.cloudfront.net/');
    expect(windowStub.APP_CONFIG.assetBaseUrl).toBe('https://d3gj6x3ityfh5o.cloudfront.net/');
  });
});
