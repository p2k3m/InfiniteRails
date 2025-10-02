import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExperience,
  ensureSimpleExperienceLoaded,
  getWindowStub,
} from './helpers/simple-experience-test-utils.js';

describe('simple experience scoreboard restore', () => {
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
  });

  it('merges restored offline runs with the signed-in identity on login', () => {
    const scoreboardStorageKey = 'vitest-scoreboard-restore';
    const { experience: offlineExperience } = createExperience({ scoreboardStorageKey });

    offlineExperience.score = 5120;
    offlineExperience.elapsed = 128;
    offlineExperience.updateLocalScoreEntry('offline-progress');

    const storedSnapshot = JSON.parse(localStorageStub.getItem(scoreboardStorageKey));
    expect(Array.isArray(storedSnapshot)).toBe(true);
    expect(storedSnapshot.length).toBeGreaterThan(0);

    const offlineEntry = offlineExperience.scoreEntries[0];
    const offlineIdentifier = offlineExperience.getScoreEntryIdentifier(offlineEntry);
    expect(offlineIdentifier).toBeTruthy();

    const { experience: restoredExperience } = createExperience({ scoreboardStorageKey });
    const restoredIdentifiers = restoredExperience.scoreEntries.map((entry) =>
      restoredExperience.getScoreEntryIdentifier(entry),
    );
    expect(restoredIdentifiers).toContain(offlineIdentifier);

    restoredExperience.setIdentity({ name: 'Cloud Hero', googleId: 'user-123' });

    const playerIdentifier = restoredExperience.getScoreEntryIdentifier({ id: 'user-123' });
    const mergedIdentifiers = restoredExperience.scoreEntries.map((entry) =>
      restoredExperience.getScoreEntryIdentifier(entry),
    );

    expect(mergedIdentifiers).toContain(playerIdentifier);
    expect(mergedIdentifiers).not.toContain(offlineIdentifier);

    const playerEntry = restoredExperience.scoreEntries.find(
      (entry) => restoredExperience.getScoreEntryIdentifier(entry) === playerIdentifier,
    );

    expect(playerEntry).toBeDefined();
    expect(playerEntry.googleId).toBe('user-123');
    expect(playerEntry.playerId).toBe('user-123');

    const persistedSnapshot = JSON.parse(localStorageStub.getItem(scoreboardStorageKey));
    const persistedIdentifiers = persistedSnapshot.map((entry) => entry.googleId ?? entry.id ?? null);
    expect(persistedIdentifiers).toContain('user-123');
  });
});

