import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

describe('identity storage quarantine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('quarantines corrupted identity snapshots and restores defaults', () => {
    const { sandbox, windowStub } = createBootstrapSandbox();
    const storage = {
      getItem: vi.fn((key) => (key === 'infinite-rails-simple-identity' ? '{"displayName":"Explorer"' : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    windowStub.localStorage = storage;
    windowStub.dispatchEvent = vi.fn();

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    expect(storage.removeItem).toHaveBeenCalledWith('infinite-rails-simple-identity');

    const identityState = hooks.getIdentityState();
    expect(identityState.identity?.googleId).toBeNull();
    expect(identityState.identity?.name).toBe('Guest Explorer');

    const warnCall = windowStub.console.warn.mock.calls.find(([message]) =>
      typeof message === 'string' && message.includes('"infinite-rails-simple-identity"'),
    );
    expect(warnCall).toBeDefined();
    expect(warnCall[1]).toBeTruthy();
    expect(warnCall[1].name).toBe('SyntaxError');

    const quarantineEventCall = windowStub.dispatchEvent.mock.calls.find(
      ([event]) => event?.type === 'infinite-rails:storage-quarantine-requested',
    );
    expect(quarantineEventCall).toBeDefined();
    expect(quarantineEventCall[0].detail.storageKey).toBe('infinite-rails-simple-identity');
    expect(quarantineEventCall[0].detail.context).toBe('identity snapshot');
  });

  it('requests a storage quarantine when identity snapshot access throws', () => {
    const { sandbox, windowStub } = createBootstrapSandbox();
    const accessError = new Error('storage access denied');
    const storage = {
      getItem: vi.fn(() => {
        throw accessError;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    windowStub.localStorage = storage;
    windowStub.dispatchEvent = vi.fn();

    evaluateBootstrapScript(sandbox);

    expect(storage.removeItem).toHaveBeenCalledWith('infinite-rails-simple-identity');

    const eventCall = windowStub.dispatchEvent.mock.calls.find(
      ([event]) => event?.type === 'infinite-rails:storage-quarantine-requested',
    );
    expect(eventCall).toBeDefined();
    expect(eventCall[0].detail.storageKey).toBe('infinite-rails-simple-identity');
    expect(eventCall[0].detail.context).toBe('identity snapshot');
    expect(eventCall[0].detail.error).toBe(accessError);
  });
});
