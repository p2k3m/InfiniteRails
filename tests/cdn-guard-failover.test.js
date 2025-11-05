import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cdnGuardSource = fs.readFileSync(path.join(repoRoot, 'scripts/cdn-guard.js'), 'utf8');

function runCdnGuard(windowStub) {
  const executor = new Function(
    'window',
    'globalThis',
    'self',
    "'use strict';" + cdnGuardSource,
  );
  executor(windowStub, windowStub, windowStub);
}

describe('CDN guard manifest failover integration', () => {
  it('rewrites CDN script elements when the asset failover event is dispatched', () => {
    const listeners = new Map();
    const storage = new Map();
    const localStorageStub = {
      getItem: vi.fn((key) => (storage.has(key) ? storage.get(key) : null)),
      setItem: vi.fn((key, value) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key) => {
        storage.delete(key);
      }),
    };

    const scriptElement = {
      _src: 'https://d3gj6x3ityfh5o.cloudfront.net/script.js',
      _attributes: new Map([['src', 'https://d3gj6x3ityfh5o.cloudfront.net/script.js']]),
      dataset: { localSrc: 'script.js' },
      parentNode: { insertBefore: vi.fn(), removeChild: vi.fn() },
      set src(value) {
        this._src = value;
        this._attributes.set('src', value);
      },
      get src() {
        return this._src;
      },
      setAttribute(name, value) {
        this._attributes.set(name, value);
        if (name === 'src') {
          this.src = value;
        }
      },
      getAttribute(name) {
        return this._attributes.get(name) ?? null;
      },
    };

    const documentStub = {
      head: {},
      body: {},
      currentScript: null,
      querySelectorAll(selector) {
        if (selector === 'script[data-local-src]' || selector === 'script[src]') {
          return [scriptElement];
        }
        return [];
      },
      createElement: vi.fn(() => ({
        dataset: {},
        setAttribute: vi.fn(),
      })),
    };

    const windowStub = {
      document: documentStub,
      location: {
        href: 'https://d3gj6x3ityfh5o.cloudfront.net/index.html',
        protocol: 'https:',
        host: 'd3gj6x3ityfh5o.cloudfront.net',
        hostname: 'd3gj6x3ityfh5o.cloudfront.net',
        origin: 'https://d3gj6x3ityfh5o.cloudfront.net',
        search: '',
      },
      localStorage: localStorageStub,
      APP_CONFIG: {},
      console: { debug: vi.fn() },
      addEventListener(type, listener) {
        const eventType = String(type);
        if (!listeners.has(eventType)) {
          listeners.set(eventType, new Set());
        }
        listeners.get(eventType).add(listener);
      },
      removeEventListener(type, listener) {
        const eventType = String(type);
        const existing = listeners.get(eventType);
        if (!existing) {
          return;
        }
        existing.delete(listener);
      },
      dispatchEvent(event) {
        const handlers = listeners.get(event.type);
        if (!handlers) {
          return true;
        }
        handlers.forEach((handler) => handler.call(windowStub, event));
        return true;
      },
    };

    runCdnGuard(windowStub);

    const failoverHandlers = listeners.get('infinite-rails:asset-failover-activated');
    expect(failoverHandlers?.size ?? 0).toBeGreaterThan(0);

    const event = {
      type: 'infinite-rails:asset-failover-activated',
      detail: {
        fallbackAssetRoot: './',
        previousAssetRoot: 'https://d3gj6x3ityfh5o.cloudfront.net/',
        status: 403,
      },
    };

    failoverHandlers.forEach((handler) => handler.call(windowStub, event));

    expect(scriptElement.src).toBe('script.js');
    expect(scriptElement.dataset.cdnRecoveryApplied).toBe('true');
    expect(localStorageStub.setItem).toHaveBeenCalledWith(
      'InfiniteRails.assetRootFailoverBlock',
      expect.stringContaining('d3gj6x3ityfh5o.cloudfront.net'),
    );
  });
});
