import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadResolver() {
  const module = await import('../asset-resolver.js');
  return module.default ?? module;
}

describe('signed asset URL monitoring', () => {
  let originalConsole;
  let originalCustomEvent;
  let originalDocument;
  let originalDispatchEvent;
  let originalLocation;
  let documentDispatch;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-18T12:00:00Z'));

    originalConsole = global.console;
    global.console = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      debug: vi.fn(),
    };

    originalCustomEvent = global.CustomEvent;
    global.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };

    documentDispatch = vi.fn();
    originalDocument = global.document;
    global.document = {
      dispatchEvent: documentDispatch,
      getElementsByTagName: vi.fn(() => []),
      currentScript: null,
      baseURI: 'https://game.example.com/index.html',
    };

    originalDispatchEvent = global.dispatchEvent;
    global.dispatchEvent = vi.fn();

    originalLocation = global.location;
    global.location = { href: 'https://game.example.com/index.html' };

    global.APP_CONFIG = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();

    delete global.APP_CONFIG;

    if (originalConsole) {
      global.console = originalConsole;
    } else {
      delete global.console;
    }

    if (originalCustomEvent) {
      global.CustomEvent = originalCustomEvent;
    } else {
      delete global.CustomEvent;
    }

    if (originalDocument) {
      global.document = originalDocument;
    } else {
      delete global.document;
    }

    if (originalDispatchEvent) {
      global.dispatchEvent = originalDispatchEvent;
    } else {
      delete global.dispatchEvent;
    }

    if (originalLocation) {
      global.location = originalLocation;
    } else {
      delete global.location;
    }
  });

  it('reports expired signed asset base URLs', async () => {
    global.APP_CONFIG.assetBaseUrl =
      'https://cdn.example.com/assets/?Expires=1700000000&Signature=legacy-token';

    const resolver = await loadResolver();
    resolver.resolveAssetUrl('textures/portal-core.png');

    expect(global.console.error).toHaveBeenCalledWith(
      expect.stringContaining('Signed asset URL has expired'),
      expect.objectContaining({
        assetBaseUrl: 'https://cdn.example.com/assets/?Expires=1700000000&Signature=legacy-token',
        severity: 'expired',
      }),
    );

    expect(documentDispatch).toHaveBeenCalledTimes(1);
    const event = documentDispatch.mock.calls[0][0];
    expect(event.type).toBe('infinite-rails:signed-url-expiry');
    expect(event.detail.severity).toBe('expired');
    expect(event.detail.warningWindowMs).toBe(24 * 60 * 60 * 1000);
    expect(event.detail.expiresAtEpochMs).toBe(1_700_000_000_000);
  });

  it('alerts when signed asset expiry cannot be determined', async () => {
    global.APP_CONFIG.assetBaseUrl =
      'https://cdn.example.com/assets/?X-Amz-Expires=900&Signature=missing-start-time';

    const resolver = await loadResolver();
    resolver.resolveAssetUrl('textures/portal-core.png');

    expect(global.console.error).toHaveBeenCalledWith(
      expect.stringContaining('Signed asset URL detected but expiry could not be determined'),
      expect.objectContaining({
        assetBaseUrl: expect.stringContaining('missing-start-time'),
        reason: 'missing-signed-start-time',
        severity: 'indeterminate',
      }),
    );

    expect(documentDispatch).toHaveBeenCalledTimes(1);
    const event = documentDispatch.mock.calls[0][0];
    expect(event.type).toBe('infinite-rails:signed-url-expiry');
    expect(event.detail.severity).toBe('indeterminate');
    expect(event.detail.reason).toBe('missing-signed-start-time');
    expect(event.detail.assetBaseUrl).toBe(
      'https://cdn.example.com/assets/?X-Amz-Expires=900&Signature=missing-start-time',
    );
    expect(event.detail.expiresAtEpochMs).toBeNull();
  });

  it('warns when signed asset base URLs approach expiry', async () => {
    const now = Date.now();
    const thirtyMinutesFromNowSeconds = Math.floor((now + 30 * 60 * 1000) / 1000);
    const expectedExpiry = thirtyMinutesFromNowSeconds * 1000;
    global.APP_CONFIG.assetBaseUrl = `https://cdn.example.com/assets/?Expires=${thirtyMinutesFromNowSeconds}&Signature=rotating-token`;

    const resolver = await loadResolver();
    resolver.resolveAssetUrl('textures/portal-core.png');

    expect(global.console.error).toHaveBeenCalledWith(
      expect.stringContaining('Signed asset URL expires soon'),
      expect.objectContaining({
        assetBaseUrl: expect.stringContaining('rotating-token'),
        severity: 'warning',
      }),
    );

    expect(documentDispatch).toHaveBeenCalledTimes(1);
    const event = documentDispatch.mock.calls[0][0];
    expect(event.type).toBe('infinite-rails:signed-url-expiry');
    expect(event.detail.severity).toBe('warning');
    expect(event.detail.millisecondsUntilExpiry).toBeLessThanOrEqual(30 * 60 * 1000);
    expect(event.detail.millisecondsUntilExpiry).toBeGreaterThan(0);
    expect(event.detail.warningWindowMs).toBe(24 * 60 * 60 * 1000);
    expect(event.detail.expiresAtEpochMs).toBe(expectedExpiry);
  });

  it('monitors signed bootstrap script URLs when resolving assets', async () => {
    const now = Date.now();
    const warningWindowSeconds = Math.floor((now + 45 * 60 * 1000) / 1000);
    const expectedExpiry = warningWindowSeconds * 1000;
    const signedScriptSrc = `https://cdn.example.com/build/script.js?Expires=${warningWindowSeconds}&Signature=bootstrap-token`;
    global.document.currentScript = { src: signedScriptSrc };

    const resolver = await loadResolver();
    resolver.resolveAssetUrl('textures/portal-core.png');

    expect(global.console.error).toHaveBeenCalledWith(
      expect.stringContaining('Signed asset URL expires soon'),
      expect.objectContaining({
        assetBaseUrl: signedScriptSrc,
        severity: 'warning',
      }),
    );

    expect(documentDispatch).toHaveBeenCalledTimes(1);
    const event = documentDispatch.mock.calls[0][0];
    expect(event.type).toBe('infinite-rails:signed-url-expiry');
    expect(event.detail.assetBaseUrl).toBe(signedScriptSrc);
    expect(event.detail.relativePath).toBe('textures/portal-core.png');
    expect(event.detail.severity).toBe('warning');
    expect(event.detail.warningWindowMs).toBe(24 * 60 * 60 * 1000);
    expect(event.detail.expiresAtEpochMs).toBe(expectedExpiry);
  });

  it('respects custom signed URL warning window overrides', async () => {
    const now = Date.now();
    const warningWindowMs = 5 * 60 * 1000;
    const imminentExpirySeconds = Math.floor((now + 4 * 60 * 1000) / 1000);

    global.APP_CONFIG.assetBaseUrl = `https://cdn.example.com/assets/?Expires=${imminentExpirySeconds}&Signature=custom-window`;
    global.APP_CONFIG.signedUrlWarningWindowMs = warningWindowMs;

    const resolver = await loadResolver();
    resolver.resolveAssetUrl('textures/portal-core.png');

    expect(global.console.error).toHaveBeenCalledWith(
      expect.stringContaining('Signed asset URL expires soon'),
      expect.objectContaining({
        assetBaseUrl: expect.stringContaining('custom-window'),
        severity: 'warning',
      }),
    );

    expect(documentDispatch).toHaveBeenCalledTimes(1);
    const event = documentDispatch.mock.calls[0][0];
    expect(event.type).toBe('infinite-rails:signed-url-expiry');
    expect(event.detail.warningWindowMs).toBe(warningWindowMs);
    expect(event.detail.expiresAtEpochMs).toBe(imminentExpirySeconds * 1000);
    expect(event.detail.millisecondsUntilExpiry).toBeLessThanOrEqual(4 * 60 * 1000);
    expect(event.detail.millisecondsUntilExpiry).toBeGreaterThan(0);
  });
});
