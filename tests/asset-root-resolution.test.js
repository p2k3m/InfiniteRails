import { describe, expect, it } from 'vitest';

import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

describe('asset root resolution', () => {
  it('defaults to same-origin assets when running outside the production CDN', () => {
    const { sandbox, windowStub, documentStub } = createBootstrapSandbox();

    windowStub.location.origin = 'https://staging.infiniterails.app';
    windowStub.location.href = 'https://staging.infiniterails.app/index.html';
    windowStub.location.host = 'staging.infiniterails.app';
    windowStub.location.hostname = 'staging.infiniterails.app';

    const scriptElement = { src: '/script.js' };
    documentStub.currentScript = scriptElement;
    if (documentStub.querySelectorAll?.mockImplementation) {
      documentStub.querySelectorAll.mockImplementation((selector) => {
        if (selector === 'script[src]') {
          return [scriptElement];
        }
        return [];
      });
    } else if (typeof documentStub.querySelectorAll === 'function') {
      documentStub.querySelectorAll = (selector) => {
        if (selector === 'script[src]') {
          return [scriptElement];
        }
        return [];
      };
    }

    evaluateBootstrapScript(sandbox);

    expect(windowStub.APP_CONFIG.assetRoot).toBe('https://staging.infiniterails.app/');
    expect(windowStub.APP_CONFIG.assetBaseUrl).toBe('https://staging.infiniterails.app/');
  });
});
