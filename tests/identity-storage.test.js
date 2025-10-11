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
  });
});
