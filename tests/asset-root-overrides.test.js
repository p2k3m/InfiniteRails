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

  it('falls back to the bundled asset root when no overrides apply', () => {
    const { sandbox, windowStub } = createBootstrapSandbox({});

    evaluateBootstrapScript(sandbox);

    expect(windowStub.APP_CONFIG.assetRoot).toBe('/');
    expect(windowStub.APP_CONFIG.assetBaseUrl).toBe('/');
  });
});
