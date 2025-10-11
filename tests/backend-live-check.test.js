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
});
