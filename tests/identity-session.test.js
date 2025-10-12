import { describe, expect, it, vi } from 'vitest';

import { createBootstrapSandbox, evaluateBootstrapScript, flushMicrotasks } from './helpers/bootstrap-test-utils.js';

function createIdentityStorage(identitySnapshot, sessionSnapshot) {
  return {
    getItem: vi.fn((key) => {
      if (key === 'infinite-rails-simple-identity') {
        return identitySnapshot ? JSON.stringify(identitySnapshot) : null;
      }
      if (key === 'infinite-rails-simple-session') {
        return sessionSnapshot ? JSON.stringify(sessionSnapshot) : null;
      }
      return null;
    }),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
}

function createGoogleIdentityStub() {
  const googleAccountsStub = {
    _callback: null,
    initialize: vi.fn((config) => {
      googleAccountsStub._callback = typeof config?.callback === 'function' ? config.callback : null;
    }),
    renderButton: vi.fn(),
    prompt: vi.fn(),
  };
  return { accounts: { id: googleAccountsStub } };
}

function ensureAtob(windowStub) {
  if (typeof windowStub.atob === 'function') {
    return windowStub.atob;
  }
  const decoder = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    return Buffer.from(value, 'base64').toString('binary');
  };
  windowStub.atob = decoder;
  return decoder;
}

function encodeJwtPayload(payload) {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json).toString('base64url');
  return `stub.${encoded}.sig`;
}

describe('identity session lifecycle', () => {
  it('restores stored session metadata and schedules auto refresh', () => {
    const { sandbox, windowStub, timers } = createBootstrapSandbox({
      appConfig: { googleClientId: 'client-123' },
    });
    ensureAtob(windowStub);
    const now = Date.now();
    const identitySnapshot = {
      displayName: 'Cloud Hero',
      googleId: 'user-123',
      location: null,
      locationLabel: null,
    };
    const sessionSnapshot = {
      refreshToken: 'refresh-abc',
      googleId: 'user-123',
      expiresAt: now + 5 * 60 * 1000,
      issuedAt: now - 60 * 1000,
      lastRefreshedAt: now - 15 * 1000,
    };
    windowStub.localStorage = createIdentityStorage(identitySnapshot, sessionSnapshot);
    windowStub.google = createGoogleIdentityStub();

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    const sessionState = hooks.getIdentitySessionState();

    expect(sessionState.refreshToken).toBe('refresh-abc');
    expect(sessionState.googleId).toBe('user-123');
    expect(Array.from(timers.values()).some((handler) => typeof handler === 'function')).toBe(true);
  });

  it('expires stale sessions during bootstrap', () => {
    const { sandbox, windowStub, scoreboardStatus } = createBootstrapSandbox({
      appConfig: { googleClientId: 'client-456' },
    });
    ensureAtob(windowStub);
    const now = Date.now();
    const identitySnapshot = { displayName: 'Explorer', googleId: 'user-456' };
    const expiredSession = {
      refreshToken: 'refresh-stale',
      googleId: 'user-456',
      expiresAt: now - 1_000,
      issuedAt: now - 10_000,
    };
    windowStub.localStorage = createIdentityStorage(identitySnapshot, expiredSession);
    windowStub.google = createGoogleIdentityStub();

    evaluateBootstrapScript(sandbox);

    expect(scoreboardStatus.textContent).toContain('Session expired');
    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks.getIdentityState().identity.googleId).toBeNull();
  });

  it('refreshes active sessions via refresh tokens', async () => {
    const { sandbox, windowStub } = createBootstrapSandbox({
      appConfig: { googleClientId: 'client-789' },
    });
    ensureAtob(windowStub);
    const now = Date.now();
    const identitySnapshot = { displayName: 'Cloud Hero', googleId: 'user-789' };
    const sessionSnapshot = {
      refreshToken: 'refresh-old',
      googleId: 'user-789',
      expiresAt: now + 30 * 1000,
      issuedAt: now - 60 * 1000,
    };
    windowStub.localStorage = createIdentityStorage(identitySnapshot, sessionSnapshot);
    const googleAccounts = createGoogleIdentityStub();
    const prompt = vi.fn((momentCallback) => {
      if (typeof momentCallback === 'function') {
        momentCallback({
          isDismissedMoment: () => false,
          isSkippedMoment: () => false,
          isNotDisplayed: () => false,
        });
      }
      const payload = {
        sub: 'user-789',
        name: 'Cloud Hero',
        email: 'hero@example.com',
        picture: 'https://example.com/avatar.png',
        exp: Math.floor((now + 3600 * 1000) / 1000),
        iat: Math.floor(now / 1000),
      };
      googleAccounts.accounts.id._callback?.({ credential: encodeJwtPayload(payload) });
    });
    googleAccounts.accounts.id.prompt = prompt;
    windowStub.google = googleAccounts;

    evaluateBootstrapScript(sandbox);
    await flushMicrotasks();
    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(typeof hooks?.handleGoogleCredential).toBe('function');

    googleAccounts.accounts.id._callback = hooks.handleGoogleCredential;

    const identityApi = windowStub.InfiniteRailsIdentity;
    const refreshPromise = identityApi.refreshSession({ reason: 'test' });
    await flushMicrotasks();
    const session = await refreshPromise;

    expect(prompt).toHaveBeenCalled();
    expect(session.googleId).toBe('user-789');
    expect(session.refreshToken).toBeTruthy();
    expect(identityApi.getSession().expiresAt).toBeGreaterThan(sessionSnapshot.expiresAt);
  });
});

