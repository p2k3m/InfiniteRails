import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBootstrapSandbox, evaluateBootstrapScript, flushMicrotasks } from './helpers/bootstrap-test-utils.js';

const apiBaseUrl = 'https://api.example.invalid';

describe('event sourcing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queues gameplay events and posts them to the backend endpoint', async () => {
    const { sandbox, windowStub, timers } = createBootstrapSandbox({
      appConfig: { apiBaseUrl },
    });

    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    sandbox.window.fetch = fetchSpy;
    sandbox.fetch = fetchSpy;

    evaluateBootstrapScript(sandbox);

    await flushMicrotasks();
    await flushMicrotasks();

    const eventDetail = {
      timestamp: Date.now(),
      summary: {
        id: 'session-123',
        googleId: 'test-google',
        name: 'Test Explorer',
        score: 42,
        dimensionCount: 1,
        dimensionTotal: 5,
        dimensions: ['Overworld'],
        runTimeSeconds: 120,
        inventoryCount: 7,
        portalEvents: 1,
        trace: { traceId: 'trace-abc', sessionId: 'session-xyz' },
      },
    };

    const event = new windowStub.CustomEvent('infinite-rails:started', { detail: eventDetail });
    windowStub.dispatchEvent(event);

    const runAllTimers = () => {
      const handlers = Array.from(timers.values());
      timers.clear();
      handlers.forEach((handler) => {
        if (typeof handler === 'function') {
          handler();
        }
      });
    };

    runAllTimers();
    await flushMicrotasks();
    await flushMicrotasks();

    const eventsEndpoint = `${apiBaseUrl}/events`;
    const eventCalls = fetchSpy.mock.calls.filter(([url]) => url === eventsEndpoint);
    expect(eventCalls.length).toBeGreaterThan(0);
    const [, init] = eventCalls[eventCalls.length - 1];
    expect(init?.method).toBe('POST');
    expect(init?.headers?.['Content-Type']).toBe('application/json');

    const payload = JSON.parse(init.body);
    expect(Array.isArray(payload.events)).toBe(true);
    expect(payload.events.length).toBeGreaterThan(0);
    const recorded = payload.events.find((entry) => entry.type === 'started');
    expect(recorded).toBeTruthy();
    expect(recorded.summary?.name).toBe('Test Explorer');
    expect(recorded.sessionId).toBeTruthy();
  });
});
