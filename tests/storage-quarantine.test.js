import { describe, expect, it, vi } from 'vitest';
import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

describe('storage quarantine', () => {
  it('quarantines storage keys and surfaces reload guidance', () => {
    const { sandbox, windowStub } = createBootstrapSandbox();
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    windowStub.localStorage = storage;
    evaluateBootstrapScript(sandbox);

    const [, handler] = windowStub.addEventListener.mock.calls.find(
      ([eventName]) => eventName === 'infinite-rails:storage-quarantine-requested',
    ) ?? [null, null];

    expect(handler).toBeTypeOf('function');

    windowStub.console.warn.mockClear();

    handler({
      detail: {
        storageKey: 'infinite-rails:save-state',
        context: 'save snapshot',
      },
    });

    expect(storage.removeItem).toHaveBeenCalledWith('infinite-rails:save-state');
    const warnMessages = windowStub.console.warn.mock.calls.map(([message]) => message || '');
    expect(
      warnMessages.some(
        (message) =>
          typeof message === 'string' &&
          message.includes('infinite-rails:save-state') &&
          message.toLowerCase().includes('reload the page'),
      ),
    ).toBe(true);
  });
});
