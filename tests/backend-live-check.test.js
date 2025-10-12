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
    expect(identityState.backendValidation?.detail?.message).toContain('Leaderboard offline');

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
    expect(scoreboardStatus.textContent).toContain('Leaderboard offline');
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
        `POST ${apiBaseUrl}/users`,
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
    expect(scoreboardStatus.textContent).toContain('Leaderboard offline');
    expect(scoreboardStatus.textContent).toContain('POST /users returned 500');
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
