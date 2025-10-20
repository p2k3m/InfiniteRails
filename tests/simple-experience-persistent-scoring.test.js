import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExperience,
  ensureSimpleExperienceLoaded,
  getWindowStub,
} from './helpers/simple-experience-test-utils.js';

describe('simple experience persistent scoring checkpoints', () => {
  let storage;
  let localStorageStub;

  beforeEach(() => {
    ensureSimpleExperienceLoaded();
    storage = new Map();
    localStorageStub = {
      getItem: vi.fn((key) => (storage.has(key) ? storage.get(key) : null)),
      setItem: vi.fn((key, value) => {
        storage.set(key, String(value));
      }),
      removeItem: vi.fn((key) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      }),
    };
    globalThis.localStorage = localStorageStub;
    const windowStub = getWindowStub();
    windowStub.localStorage = localStorageStub;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.localStorage;
    const windowStub = getWindowStub();
    delete windowStub.localStorage;
    if (windowStub.InfiniteRails?.crashRecovery) {
      delete windowStub.InfiniteRails.crashRecovery;
    }
  });

  function setupCrashRecoveryCaptureMock() {
    const windowStub = getWindowStub();
    windowStub.InfiniteRails = windowStub.InfiniteRails || {};
    const captureMock = vi.fn();
    windowStub.InfiniteRails.crashRecovery = { capture: captureMock };
    return captureMock;
  }

  it('captures a crash recovery checkpoint for loot score events', () => {
    const captureMock = setupCrashRecoveryCaptureMock();
    const { experience } = createExperience({ scoreboardStorageKey: 'persist-loot' });

    experience.score = 240;
    experience.scoreBreakdown = { loot: 16 };
    experience.elapsed = 75;

    experience.notifyScoreEvent('loot', 16);

    expect(captureMock).toHaveBeenCalledTimes(1);
    const payload = captureMock.mock.calls[0][0];
    expect(payload.reason).toBe('score-loot');
    expect(payload.stage).toBe('gameplay');
    expect(payload.detail.category).toBe('loot');
    expect(payload.detail.amount).toBe(16);
    expect(payload.detail.score.total).toBe(Math.round(experience.score));
  });

  it('captures a crash recovery checkpoint for crafting score events', () => {
    const captureMock = setupCrashRecoveryCaptureMock();
    const { experience } = createExperience({ scoreboardStorageKey: 'persist-recipes' });

    experience.score = 512;
    experience.scoreBreakdown = { recipes: 24 };
    experience.elapsed = 128;

    experience.notifyScoreEvent('recipes', 24);

    expect(captureMock).toHaveBeenCalledTimes(1);
    const payload = captureMock.mock.calls[0][0];
    expect(payload.reason).toBe('score-recipes');
    expect(payload.detail.category).toBe('recipes');
    expect(payload.detail.score.total).toBe(Math.round(experience.score));
  });

  it('captures a crash recovery checkpoint for combat score events', () => {
    const captureMock = setupCrashRecoveryCaptureMock();
    const { experience } = createExperience({ scoreboardStorageKey: 'persist-combat' });

    experience.score = 384;
    experience.scoreBreakdown = { combat: 9 };
    experience.elapsed = 90;

    experience.notifyScoreEvent('combat', 9);

    expect(captureMock).toHaveBeenCalledTimes(1);
    const payload = captureMock.mock.calls[0][0];
    expect(payload.reason).toBe('score-combat');
    expect(payload.detail.category).toBe('combat');
    expect(payload.detail.amount).toBe(9);
    expect(payload.detail.score.total).toBe(Math.round(experience.score));
  });
});

