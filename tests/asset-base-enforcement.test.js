import { describe, expect, it } from 'vitest';

import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

describe('asset base enforcement', () => {
  it('throws when APP_CONFIG.assetBaseUrl disagrees with the derived deployment root', () => {
    const { sandbox } = createBootstrapSandbox({
      appConfig: { assetBaseUrl: 'https://cdn.example.com/bundles/' },
    });

    expect(() => evaluateBootstrapScript(sandbox)).toThrowError(
      /APP_CONFIG\.assetBaseUrl mismatch detected between bundle metadata, asset-manifest\.json, and the active deployment/,
    );
  });

  it('accepts matching asset bases after normalisation', () => {
    const { sandbox, windowStub } = createBootstrapSandbox({
      appConfig: { assetBaseUrl: 'https://example.com' },
    });

    expect(() => evaluateBootstrapScript(sandbox)).not.toThrow();
    expect(windowStub.APP_CONFIG.assetBaseUrl).toBe('https://example.com/');
  });
});
