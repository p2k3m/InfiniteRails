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
  });

  it('warns when signed asset base URLs approach expiry', async () => {
    const now = Date.now();
    const thirtyMinutesFromNowSeconds = Math.floor((now + 30 * 60 * 1000) / 1000);
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
  });
});
