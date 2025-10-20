import { describe, it, expect } from 'vitest';
import {
  createBootstrapSandbox,
  evaluateBootstrapScript,
  flushMicrotasks,
} from './helpers/bootstrap-test-utils.js';

describe('error rate circuit breaker', () => {
  it('suspends live features and locks the leaderboard after an API error spike', async () => {
    const {
      sandbox,
      windowStub,
      scoreboardStatus,
      refreshScoresButton,
      leaderboardTable,
      leaderboardEmptyMessage,
      scoreSyncWarning,
      scoreSyncWarningMessage,
    } = createBootstrapSandbox({
      appConfig: { apiBaseUrl: 'https://api.example.invalid' },
    });

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const logStore = windowStub.InfiniteRails?.logs;
    expect(logStore).toBeTruthy();

    for (let index = 0; index < 5; index += 1) {
      logStore.record({
        category: 'api',
        level: 'error',
        message: `API failure ${index + 1}`,
        timestamp: Date.now() + index,
      });
    }

    await flushMicrotasks();

    const identityState = hooks.getIdentityState();
    expect(identityState.liveFeaturesSuspended).toBe(true);
    expect(identityState.liveFeaturesHoldDetail?.kind).toBe('error-rate');

    expect(scoreboardStatus.dataset.offline).toBe('true');
    expect(scoreboardStatus.textContent).toContain('elevated API error rate');

    expect(refreshScoresButton.disabled).toBe(true);
    expect(refreshScoresButton.dataset.errorRateLocked).toBe('true');

    expect(leaderboardTable.hidden).toBe(true);
    expect(leaderboardTable.dataset.errorRateLocked).toBe('true');

    expect(leaderboardEmptyMessage.hidden).toBe(false);
    expect(leaderboardEmptyMessage.textContent).toContain('elevated API error rate');

    expect(scoreSyncWarning.hidden).toBe(false);
    expect(scoreSyncWarningMessage.textContent).toContain('elevated API error rate');

    expect(windowStub.document.body.dataset.errorRateCircuit).toBe('true');
    expect(windowStub.document.body.dataset.errorRateCategory).toBe('api');

    const circuitState = hooks.getErrorRateCircuitState();
    expect(circuitState.trippedCategories).toContain('api');
    expect(hooks.isErrorRateCircuitTripped('api')).toBe(true);
  });
});
