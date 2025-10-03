import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createExperience, ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

beforeAll(() => {
  ensureSimpleExperienceLoaded();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createBindingHarness() {
  const { experience } = createExperience();
  experience.eventBindingFailures = [];
  if (experience.eventBindingFailureNotices?.clear) {
    experience.eventBindingFailureNotices.clear();
  }
  return experience;
}

describe('SimpleExperience event binding safeguards', () => {
  it('rejects and logs missing event targets', () => {
    const experience = createBindingHarness();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = experience.addSafeEventListener(null, 'click', () => {});

    expect(result).toBe(false);
    expect(experience.eventBindingFailures).toHaveLength(1);
    const failure = experience.eventBindingFailures[0];
    expect(failure.reason).toBe('missing-target');
    expect(failure.eventName).toBe('click');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects handlers that are not functions', () => {
    const experience = createBindingHarness();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };

    const result = experience.addSafeEventListener(target, 'pointerdown', null);

    expect(result).toBe(false);
    expect(target.addEventListener).not.toHaveBeenCalled();
    expect(experience.eventBindingFailures).toHaveLength(1);
    const failure = experience.eventBindingFailures[0];
    expect(failure.reason).toBe('invalid-handler');
    expect(failure.eventName).toBe('pointerdown');
    expect(failure.meta).toEqual({ handlerType: 'object' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('captures errors thrown during binding attempts', () => {
    const experience = createBindingHarness();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bindError = new Error('bind failure');
    const target = {
      addEventListener: vi.fn(() => {
        throw bindError;
      }),
      removeEventListener: vi.fn(),
    };
    function bindingHandler() {}

    const result = experience.addSafeEventListener(target, 'pointerup', bindingHandler);

    expect(result).toBe(false);
    expect(target.addEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function), undefined);
    expect(experience.eventBindingFailures).toHaveLength(1);
    const failure = experience.eventBindingFailures[0];
    expect(failure.reason).toBe('bind-error');
    expect(failure.errorMessage).toBe('bind failure');
    expect(failure.handler).toBe('bindingHandler');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
