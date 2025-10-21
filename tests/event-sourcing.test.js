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

  it('captures settings and identity events for sourcing', async () => {
    const { sandbox, windowStub, timers } = createBootstrapSandbox({
      appConfig: { apiBaseUrl },
    });

    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    sandbox.window.fetch = fetchSpy;
    sandbox.fetch = fetchSpy;

    evaluateBootstrapScript(sandbox);

    await flushMicrotasks();
    await flushMicrotasks();

    const audioApi = windowStub.InfiniteRails.audio;
    audioApi.setMuted(true);

    const identityApi = windowStub.InfiniteRails.identity;
    identityApi.setIdentity({ name: 'Cloud Sync', googleId: 'cloud-test-1' });

    windowStub.dispatchEvent(
      new windowStub.CustomEvent('infinite-rails:control-map-changed', {
        detail: { map: { jump: ['KeyJ'] } },
      }),
    );

    windowStub.dispatchEvent(
      new windowStub.CustomEvent('infinite-rails:keybindings-changed', {
        detail: { action: 'jump', keys: ['KeyJ'], overrides: { jump: ['KeyJ'] } },
      }),
    );

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

    const recordedTypes = new Set();
    eventCalls.forEach(([, init]) => {
      if (!init?.body) {
        return;
      }
      const payload = JSON.parse(init.body);
      if (!Array.isArray(payload?.events)) {
        return;
      }
      payload.events.forEach((entry) => {
        if (entry?.type) {
          recordedTypes.add(entry.type);
        }
      });
    });

    expect(recordedTypes.has('audio-settings-changed')).toBe(true);
    expect(recordedTypes.has('identity-change')).toBe(true);
    expect(recordedTypes.has('control-map-changed')).toBe(true);
    expect(recordedTypes.has('keybindings-changed')).toBe(true);
  });

  it('attaches reproduction artifacts to error events', async () => {
    const { sandbox, windowStub, timers } = createBootstrapSandbox({
      appConfig: { apiBaseUrl },
    });

    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    sandbox.window.fetch = fetchSpy;
    sandbox.fetch = fetchSpy;

    evaluateBootstrapScript(sandbox);

    await flushMicrotasks();
    await flushMicrotasks();

    windowStub.InfiniteRails.logs.record({ category: 'runtime', message: 'Pre-error log entry' });
    windowStub.InfiniteRails.diagnostics.record('system', 'Test diagnostic entry', {
      issue: 'pre-error-check',
    });
    windowStub.InfiniteRails.replayBuffer.record(
      'dom:click',
      { target: { id: 'startButton' } },
      { timestamp: Date.now() },
    );

    const replaySnapshot = windowStub.InfiniteRails.replayBuffer.snapshot();
    expect(Array.isArray(replaySnapshot)).toBe(true);
    expect(replaySnapshot.length).toBeGreaterThan(0);
    windowStub.dispatchEvent(
      new windowStub.CustomEvent('infinite-rails:started', {
        detail: { summary: { id: 'run-1', name: 'Explorer One' }, timestamp: Date.now() },
      }),
    );

    windowStub.dispatchEvent(
      new windowStub.CustomEvent('infinite-rails:start-error', {
        detail: { message: 'Renderer initialisation failed.' },
      }),
    );

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
    runAllTimers();
    await flushMicrotasks();
    await flushMicrotasks();

    const eventsEndpoint = `${apiBaseUrl}/events`;
    const eventCalls = fetchSpy.mock.calls.filter(([url]) => url === eventsEndpoint);
    expect(eventCalls.length).toBeGreaterThan(0);

    const [, init] = eventCalls[eventCalls.length - 1];
    const payload = JSON.parse(init.body);
    const recorded = payload.events.find((entry) => entry.type === 'start-error');
    expect(recorded).toBeTruthy();
    const artifacts = recorded.detail?.artifacts;
    expect(artifacts).toBeTruthy();
    expect(typeof artifacts.traceSessionId).toBe('string');
    expect(artifacts.snapshotChunks && typeof artifacts.snapshotChunks === 'object').toBe(true);
    const chunkCount = Number(artifacts.snapshotChunks.length) || 0;
    expect(chunkCount).toBeGreaterThan(0);
    const reconstructed = Array.from({ length: chunkCount }, (_, index) => artifacts.snapshotChunks[`c${index}`] || '').join('');
    const snapshot = JSON.parse(reconstructed);
    expect(Array.isArray(snapshot.userActionReplay)).toBe(true);
    expect(snapshot.userActionReplay.length).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.centralLog)).toBe(true);
    expect(snapshot.centralLog.length).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.liveDiagnostics)).toBe(true);
    expect(snapshot.liveDiagnostics.length).toBeGreaterThan(0);
  });
});
