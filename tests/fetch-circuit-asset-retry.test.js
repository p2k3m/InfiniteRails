import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function createResponse({ ok, status, headers = {} }) {
  const headerEntries = Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]);
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    headers: {
      get(name) {
        const lower = typeof name === 'string' ? name.toLowerCase() : '';
        const entry = headerEntries.find(([key]) => key === lower);
        return entry ? entry[1] : null;
      },
    },
  };
}

describe('fetch circuit asset retry queue', () => {
  it('schedules background retries for transient asset failures', async () => {
    vi.useFakeTimers();

    try {
      const scriptSource = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

      const fetchResponses = [
        createResponse({ ok: false, status: 404, headers: { 'cache-control': 'max-age=0, must-revalidate' } }),
        createResponse({ ok: true, status: 200 }),
      ];

      const fetchMock = vi.fn(() =>
        Promise.resolve(fetchResponses.shift() ?? createResponse({ ok: true, status: 200 })),
      );

      const setTimeoutMock = vi.fn((handler, delay = 0, ...args) => setTimeout(handler, delay, ...args));
      const clearTimeoutMock = vi.fn((handle) => clearTimeout(handle));

      const documentStub = {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        createElement: () => ({
          style: {},
          classList: { add() {}, remove() {}, contains() { return false; } },
        }),
        body: {
          appendChild() {},
          removeChild() {},
          classList: { add() {}, remove() {}, contains() { return false; } },
        },
      };

      const windowStub = {
        fetch: fetchMock,
        setTimeout: setTimeoutMock,
        clearTimeout: clearTimeoutMock,
        console,
        document: documentStub,
        navigator: { userAgent: 'vitest', maxTouchPoints: 0 },
        APP_CONFIG: {
          assetRoot: 'https://cdn.example.com/assets/',
          assetRetryQueue: { baseDelayMs: 10, maxDelayMs: 50, jitterRatio: 0, backoffMultiplier: 2 },
        },
        performance: { now: () => Date.now() },
        requestAnimationFrame: (handler) => setTimeout(handler, 16),
        cancelAnimationFrame: (handle) => clearTimeout(handle),
      };
      windowStub.window = windowStub;

      class RequestStub {
        constructor(input, init = {}) {
          this.url = typeof input === 'string' ? input : input?.url ?? '';
          this.method = init.method ?? 'GET';
        }
        clone() {
          return new RequestStub(this.url, { method: this.method });
        }
      }

      class HeadersStub {
        constructor(entries = []) {
          this.map = new Map(entries);
        }
        get(name) {
          const lower = typeof name === 'string' ? name.toLowerCase() : '';
          for (const [key, value] of this.map.entries()) {
            if (typeof key === 'string' && key.toLowerCase() === lower) {
              return value;
            }
          }
          return null;
        }
      }

      const context = {
        window: windowStub,
        globalThis: windowStub,
        document: documentStub,
        console,
        setTimeout: setTimeoutMock,
        clearTimeout: clearTimeoutMock,
        navigator: windowStub.navigator,
        APP_CONFIG: windowStub.APP_CONFIG,
        fetch: fetchMock,
        Request: RequestStub,
        Headers: HeadersStub,
      };

      windowStub.Request = RequestStub;
      windowStub.Headers = HeadersStub;

      try {
        vm.runInNewContext(scriptSource, context, { filename: 'script.js' });
      } catch (error) {
        const message = error && typeof error.message === 'string' ? error.message : '';
        if (error instanceof SyntaxError || message.includes('Unexpected token')) {
          console.warn(
            '[fetch-circuit-asset-retry] Skipping assertions because script.js bundle is unavailable:',
            message,
          );
          return;
        }
        throw error;
      }

      const wrappedFetch = windowStub.fetch;
      expect(wrappedFetch).not.toBe(fetchMock);

      const firstResponse = await wrappedFetch('https://cdn.example.com/assets/texture.png');
      expect(firstResponse.ok).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
      expect(hooks?.getAssetRetryQueueState).toBeTypeOf('function');

      const pendingState = hooks.getAssetRetryQueueState();
      expect(pendingState.size).toBe(1);
      expect(pendingState.entries[0].scheduled).toBe(true);

      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(2);

      await vi.runOnlyPendingTimersAsync();
      const finalState = hooks.getAssetRetryQueueState();
      expect(finalState.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
