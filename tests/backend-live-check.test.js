import { describe, expect, it, vi } from 'vitest';

import { createBootstrapSandbox, evaluateBootstrapScript, flushMicrotasks } from './helpers/bootstrap-test-utils.js';

describe('backend live-check', () => {
  it('falls back to local mode when the fetch API is unavailable', async () => {
    const { sandbox, windowStub, scoreboardStatus } = createBootstrapSandbox({
      appConfig: { apiBaseUrl: 'https://api.example.invalid' },
    });

    const overlay = {
      setDiagnostic: vi.fn(),
      hide: vi.fn(),
      showLoading: vi.fn(),
      showError: vi.fn(),
    };
    sandbox.window.bootstrapOverlay = overlay;

    delete sandbox.window.fetch;
    delete sandbox.fetch;

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const result = await hooks.ensureBackendLiveCheck();
    expect(result).toBe(false);

    await flushMicrotasks();

    const identityState = hooks.getIdentityState();
    expect(identityState.apiBaseUrl).toBeNull();
    expect(identityState.scoreboardOffline).toBe(true);
    expect(identityState.backendValidation?.performed).toBe(true);
    expect(identityState.backendValidation?.ok).toBe(false);
    expect(identityState.backendValidation?.detail?.reason).toBe('fetch-unavailable');
    expect(identityState.backendValidation?.detail?.message).toContain('Offline session active');

    expect(scoreboardStatus.dataset.offline).toBe('true');

    const backendState = hooks.getBackendLiveCheckState();
    expect(backendState.performed).toBe(true);
    expect(backendState.success).toBe(false);

  });

  it('performs the backend health check during bootstrap and surfaces offline mode on failure', async () => {
    const { sandbox, windowStub, scoreboardStatus } = createBootstrapSandbox({
      appConfig: { apiBaseUrl: 'https://api.example.invalid' },
    });

    const overlay = {
      setDiagnostic: vi.fn(),
      hide: vi.fn(),
      showLoading: vi.fn(),
      showError: vi.fn(),
    };
    sandbox.window.bootstrapOverlay = overlay;

    sandbox.window.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    sandbox.fetch = sandbox.window.fetch;

    evaluateBootstrapScript(sandbox);

    await flushMicrotasks();
    await flushMicrotasks();

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const backendState = hooks.getBackendLiveCheckState();
    expect(backendState.performed).toBe(true);
    expect(backendState.success).toBe(false);

    expect(scoreboardStatus.dataset.offline).toBe('true');
    expect(scoreboardStatus.textContent).toContain('Offline session active');
  });

  it('pings each required backend endpoint before boot and falls back to offline mode when any fail', async () => {
    const apiBaseUrl = 'https://api.example.invalid';
    const { sandbox, windowStub, scoreboardStatus } = createBootstrapSandbox({
      appConfig: { apiBaseUrl },
    });

    const overlay = {
      setDiagnostic: vi.fn(),
      hide: vi.fn(),
      showLoading: vi.fn(),
      showError: vi.fn(),
    };
    sandbox.window.bootstrapOverlay = overlay;

    const fetchSpy = vi.fn((url, init = {}) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === `${apiBaseUrl}/scores` && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200 });
      }
      if (url === `${apiBaseUrl}/scores` && method === 'POST') {
        return Promise.resolve({ ok: true, status: 200 });
      }
      if (url === `${apiBaseUrl}/users` && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200 });
      }
      if (url === `${apiBaseUrl}/users` && method === 'POST') {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({ ok: true, status: 200 });
    });
    sandbox.window.fetch = fetchSpy;
    sandbox.fetch = fetchSpy;

    evaluateBootstrapScript(sandbox);

    await flushMicrotasks();
    await flushMicrotasks();

    const callSignatures = fetchSpy.mock.calls.map(([url, init = {}]) => {
      const method = (init.method ?? 'GET').toUpperCase();
      return `${method} ${url}`;
    });

    expect(callSignatures).toEqual(
      expect.arrayContaining([
        `GET ${apiBaseUrl}/scores`,
        `POST ${apiBaseUrl}/scores`,
        `GET ${apiBaseUrl}/users`,
        `POST ${apiBaseUrl}/users`,
        `POST ${apiBaseUrl}/events`,
      ]),
    );

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const backendState = hooks.getBackendLiveCheckState();
    expect(backendState.performed).toBe(true);
    expect(backendState.success).toBe(false);

    const identityState = hooks.getIdentityState();
    expect(identityState.scoreboardOffline).toBe(true);

    expect(scoreboardStatus.dataset.offline).toBe('true');
    expect(scoreboardStatus.textContent).toContain('Offline session active');
    expect(scoreboardStatus.textContent).toContain('POST /users returned 500');
  });

  it('fails backend validation when required endpoints are missing', async () => {
    const apiBaseUrl = 'https://api.example.invalid';
    const { sandbox, windowStub, scoreboardStatus } = createBootstrapSandbox({
      appConfig: { apiBaseUrl },
    });

    const overlay = {
      setDiagnostic: vi.fn(),
      hide: vi.fn(),
      showLoading: vi.fn(),
      showError: vi.fn(),
    };
    sandbox.window.bootstrapOverlay = overlay;

    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    sandbox.window.fetch = fetchSpy;
    sandbox.fetch = fetchSpy;

    evaluateBootstrapScript(sandbox);

    await flushMicrotasks();
    await flushMicrotasks();

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const identityState = hooks.getIdentityState();
    identityState.configuredEndpoints.users = null;
    identityState.endpoints.users = null;

    const backendState = hooks.getBackendLiveCheckState();
    backendState.promise = null;
    backendState.performed = false;
    backendState.success = null;
    backendState.detail = null;

    const result = await hooks.ensureBackendLiveCheck();
    expect(result).toBe(false);

    expect(scoreboardStatus.dataset.offline).toBe('true');
    expect(scoreboardStatus.textContent).toContain('Offline session active');
    expect(scoreboardStatus.textContent).toContain('Users endpoint not configured');
  });

  it('schedules uptime heartbeats when the health endpoint is configured', async () => {
    const apiBaseUrl = 'https://api.example.invalid';
    const healthEndpoint = 'https://status.example.invalid/heartbeat';
    const { sandbox, windowStub, timers } = createBootstrapSandbox({
      appConfig: {
        apiBaseUrl,
        healthEndpoint,
        healthHeartbeatIntervalMs: 60000,
      },
    });

    const overlay = {
      setDiagnostic: vi.fn(),
      hide: vi.fn(),
      showLoading: vi.fn(),
      showError: vi.fn(),
    };
    sandbox.window.bootstrapOverlay = overlay;

    const fetchSpy = vi.fn((url, init = {}) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url === `${apiBaseUrl}/scores` && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200 });
      }
      if (url === `${apiBaseUrl}/scores` && method === 'POST') {
        return Promise.resolve({ ok: true, status: 200 });
      }
      if (url === `${apiBaseUrl}/users` && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200 });
      }
      if (url === `${apiBaseUrl}/users` && method === 'POST') {
        return Promise.resolve({ ok: true, status: 200 });
      }
      if (url === `${apiBaseUrl}/events` && method === 'POST') {
        return Promise.resolve({ ok: true, status: 200 });
      }
      if (url === healthEndpoint && method === 'POST') {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({ ok: true, status: 200 });
    });
    sandbox.window.fetch = fetchSpy;
    sandbox.fetch = fetchSpy;

    evaluateBootstrapScript(sandbox);

    await flushMicrotasks();
    await flushMicrotasks();

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const heartbeatState = hooks.getHeartbeatState();
    expect(heartbeatState.endpoint).toBe(healthEndpoint);
    expect(heartbeatState.intervalMs).toBe(60000);
    expect(heartbeatState.online).toBe(true);

    const heartbeatCalls = fetchSpy.mock.calls.filter(([url]) => url === healthEndpoint);
    expect(heartbeatCalls.length).toBeGreaterThan(0);
    const [, firstInit] = heartbeatCalls[0];
    expect(firstInit?.method).toBe('POST');
    expect(firstInit?.headers?.['Content-Type']).toBe('application/json');
    const initialPayload = JSON.parse(firstInit?.body ?? '{}');
    expect(initialPayload.mode).toBe('heartbeat');
    expect(initialPayload.intervalMs).toBe(60000);
    expect(initialPayload.status?.scoreboard?.offline).toBe(false);
    expect(initialPayload.status?.gameClient).toBeTruthy();
    expect(initialPayload.status.gameClient.running).toBe(false);
    expect(typeof initialPayload.status.gameClient.available).toBe('boolean');

    const scheduledTimerId = heartbeatState.timerId;
    expect(scheduledTimerId).not.toBeNull();
    expect(timers.has(scheduledTimerId)).toBe(true);

    windowStub.dispatchEvent(
      new windowStub.CustomEvent('infinite-rails:score-sync-offline', { detail: { source: 'test' } }),
    );

    const offlineState = hooks.getHeartbeatState();
    expect(offlineState.online).toBe(false);
    expect(offlineState.timerId).toBeNull();
    expect(timers.has(scheduledTimerId)).toBe(false);
    expect(hooks.triggerHeartbeat()).toBe(false);

    fetchSpy.mockClear();

    windowStub.dispatchEvent(
      new windowStub.CustomEvent('infinite-rails:score-sync-restored', { detail: { source: 'test' } }),
    );

    await flushMicrotasks();

    const restoredState = hooks.getHeartbeatState();
    expect(restoredState.online).toBe(true);
    expect(restoredState.timerId).not.toBeNull();
    const restoreTimerId = restoredState.timerId;
    expect(timers.has(restoreTimerId)).toBe(true);

    const resumePromise = hooks.triggerHeartbeat();
    expect(resumePromise).not.toBe(false);
    await resumePromise;
    await flushMicrotasks();

    const resumedCalls = fetchSpy.mock.calls.filter(([url]) => url === healthEndpoint);
    expect(resumedCalls.length).toBe(1);
    const [, resumedInit] = resumedCalls[0];
    const resumedPayload = JSON.parse(resumedInit?.body ?? '{}');
    expect(resumedPayload.sequence).toBeGreaterThan(initialPayload.sequence);
    expect(resumedPayload.status?.gameClient).toBeTruthy();
  });

  it('enters Offline/Recovery Mode after repeated API failures', async () => {
    const { sandbox, windowStub, scoreboardStatus } = createBootstrapSandbox({
      appConfig: { apiBaseUrl: 'https://api.example.invalid' },
    });

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    expect(scoreboardStatus.textContent).not.toContain('Offline/Recovery Mode');

    hooks.recordNetworkFailure('api', { source: 'test', message: 'Failure 1' });
    hooks.recordNetworkFailure('api', { source: 'test', message: 'Failure 2' });
    hooks.recordNetworkFailure('api', { source: 'test', message: 'Failure 3' });

    expect(scoreboardStatus.dataset.offline).toBe('true');
    expect(scoreboardStatus.textContent).toContain('Offline/Recovery Mode');
  });
});
