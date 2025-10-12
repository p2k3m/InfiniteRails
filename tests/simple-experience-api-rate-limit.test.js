import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createExperience,
  ensureSimpleExperienceLoaded,
} from './helpers/simple-experience-test-utils.js';

describe('simple experience API rate limiting', () => {
  let originalFetch;

  beforeEach(() => {
    ensureSimpleExperienceLoaded();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete globalThis.fetch;
    }
  });

  it('derives rate limit identities from google ids or sessions', () => {
    const { experience } = createExperience();

    experience.playerGoogleId = 'user-xyz';
    expect(experience.getRateLimitIdentity()).toBe('user:user-xyz');

    experience.playerGoogleId = '';
    experience.sessionId = 'session-123';
    expect(experience.getRateLimitIdentity()).toBe('session:session-123');

    experience.sessionId = '  ';
    expect(experience.getRateLimitIdentity()).toBe('anonymous');
  });

  it('applies penalties that block consumption until the retry window elapses', () => {
    const { experience } = createExperience();
    const limiter = experience.apiRateLimiter;
    const key = 'test:identity';

    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const first = limiter.consume(key, { limit: 2, windowMs: 10_000 });
    expect(first.ok).toBe(true);

    const penalty = limiter.applyPenalty(key, { limit: 2, windowMs: 10_000, retryAfterSeconds: 5 });
    expect(penalty.ok).toBe(false);
    expect(penalty.retryAfterSeconds).toBeGreaterThanOrEqual(5);

    const blocked = limiter.consume(key, { limit: 2, windowMs: 10_000 });
    expect(blocked.ok).toBe(false);

    const waitMs = penalty.retryAfterMs ?? penalty.retryAfterSeconds * 1000;
    vi.advanceTimersByTime(waitMs + 1);

    const afterCooldown = limiter.consume(key, { limit: 2, windowMs: 10_000 });
    expect(afterCooldown.ok).toBe(true);

    vi.useRealTimers();
  });

  it('penalises the local limiter when the leaderboard GET is rate limited', async () => {
    const { experience } = createExperience();
    experience.apiBaseUrl = 'https://api.example.com';
    experience.scoreFetchRateLimit = 3;
    experience.scoreFetchWindowSeconds = 5;
    experience.playerGoogleId = 'user-123';
    experience.scoreboardHydrated = true;

    const applyPenaltySpy = vi
      .spyOn(experience.apiRateLimiter, 'applyPenalty')
      .mockReturnValue({ ok: false, retryAfterMs: 2_000, retryAfterSeconds: 2 });
    const retrySpy = vi.spyOn(experience, 'scheduleScoreboardRateLimitRetry').mockImplementation(() => {});
    const statusSpy = vi.spyOn(experience, 'setScoreboardStatus');

    const headers = new Map([
      ['Retry-After', '4'],
    ]);
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 429, ok: false, headers });

    await experience.loadScoreboard({ force: true });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(applyPenaltySpy).toHaveBeenCalledWith('scores:get:user:user-123', {
      limit: experience.scoreFetchRateLimit,
      windowMs: experience.scoreFetchWindowSeconds * 1000,
      retryAfterSeconds: 4,
    });
    expect(retrySpy).toHaveBeenCalled();
    const [delayMs] = retrySpy.mock.calls[0];
    expect(delayMs).toBeGreaterThanOrEqual(experience.scoreFetchWindowSeconds * 1000);
    expect(statusSpy).toHaveBeenCalledWith(
      expect.stringMatching(/cooling down/i),
      expect.objectContaining({ offline: false }),
    );
  });

  it('penalises the local limiter when score sync POST receives a rate limit', async () => {
    const { experience } = createExperience();
    experience.apiBaseUrl = 'https://api.example.com';
    experience.scoreSyncRateLimit = 2;
    experience.scoreSyncWindowSeconds = 6;
    experience.playerGoogleId = 'user-456';
    experience.pendingScoreSyncReason = 'auto';

    const applyPenaltySpy = vi
      .spyOn(experience.apiRateLimiter, 'applyPenalty')
      .mockReturnValue({ ok: false, retryAfterMs: 3_000, retryAfterSeconds: 3 });
    const retrySpy = vi.spyOn(experience, 'scheduleScoreSyncRetry').mockImplementation(() => {});
    const warningSpy = vi.spyOn(experience, 'showScoreSyncWarning');
    const eventSpy = vi.spyOn(experience, 'emitGameEvent');

    const headers = new Map([
      ['Retry-After', '7'],
    ]);
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 429, ok: false, headers });

    await experience.flushScoreSync(true);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(applyPenaltySpy).toHaveBeenCalledWith('scores:post:user:user-456', {
      limit: experience.scoreSyncRateLimit,
      windowMs: experience.scoreSyncWindowSeconds * 1000,
      retryAfterSeconds: 7,
    });
    expect(retrySpy).toHaveBeenCalled();
    const [delayMs] = retrySpy.mock.calls[0];
    expect(delayMs).toBeGreaterThanOrEqual(experience.scoreSyncWindowSeconds * 1000);
    expect(warningSpy).toHaveBeenCalled();
    const throttledCall = eventSpy.mock.calls.find(([event]) => event === 'score-sync-throttled');
    expect(throttledCall).toBeDefined();
    expect(experience.hasQueuedScoreSyncEntries()).toBe(true);
    expect(experience.pendingScoreSyncReason).toBe('auto');
  });
});
