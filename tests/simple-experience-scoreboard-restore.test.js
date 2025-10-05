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

  it('flushes queued offline runs to the backend once login succeeds', async () => {
    const scoreboardStorageKey = 'vitest-scoreboard-sync';
    const scoreSyncQueueKey = 'vitest-scoreboard-sync-queue';
    const { experience } = createExperience({ scoreboardStorageKey, scoreSyncQueueKey });

    experience.apiBaseUrl = 'https://api.example.com';
    experience.score = 4096;
    experience.elapsed = 256;

    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network down'));
    globalThis.fetch = fetchMock;

    try {
      experience.scheduleScoreSync('offline-run');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(experience.hasQueuedScoreSyncEntries()).toBe(true);
      const [queued] = experience.scoreSyncQueue;
      expect(queued).toBeDefined();
      expect(queued.entry.googleId).toBeNull();
      const sessionIdentifier = experience.getScoreEntryIdentifier({ id: experience.sessionId });
      const entryIdentifier = experience.getScoreEntryIdentifier(queued.entry);
      expect([queued.identifier, entryIdentifier]).toContain(sessionIdentifier);

      fetchMock.mockReset();
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      });

      experience.setIdentity({ name: 'Cloud Hero', googleId: 'user-123' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchMock).toHaveBeenCalled();
      const [, requestInit] = fetchMock.mock.calls[0];
      const payload = JSON.parse(requestInit.body);
      expect(payload.googleId).toBe('user-123');
      expect(payload.playerId).toBe('user-123');
      expect(payload.id).toBe('user-123');
      expect(payload.name).toBe('Cloud Hero');

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(experience.hasQueuedScoreSyncEntries()).toBe(false);
    } finally {
      if (originalFetch) {
        globalThis.fetch = originalFetch;
      } else {
        delete globalThis.fetch;
      }
    }
  });
});

