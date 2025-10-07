import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

function runTimer(timers, id) {
  const handler = timers.get(id);
  expect(typeof handler).toBe('function');
  timers.delete(id);
  handler();
}

describe('bootstrap inactivity monitor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prompts after inactivity and dismisses when activity resumes', () => {
    const { sandbox, windowStub, documentStub, timers } = createBootstrapSandbox();
    windowStub.__INFINITE_RAILS_TEST_SKIP_BOOTSTRAP__ = true;
    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    hooks.setupInactivityOverlay();
    hooks.configureInactivityMonitor({ idleThresholdMs: 1000, refreshCountdownMs: 5000, checkIntervalMs: 200 });

    const overlay = documentStub.getElementById('inactivityOverlay');
    expect(overlay).toBeTruthy();
    expect(overlay.hidden).toBe(true);

    hooks.setInactivityLastActivity(Date.now() - 1100);
    let state = hooks.getInactivityMonitorState();
    if (state.checkHandle) {
      runTimer(timers, state.checkHandle);
      state = hooks.getInactivityMonitorState();
    }

    expect(overlay.hidden).toBe(false);
    expect(overlay.getAttribute('data-mode')).toBe('prompt');
    expect(documentStub.body.classList.add).toHaveBeenCalledWith('hud-inactive');

    const countdown = documentStub.getElementById('inactivityOverlayCountdown');
    expect(countdown.textContent).toBe('5');

    const stayButton = documentStub.getElementById('inactivityStayButton');
    const stayCall = stayButton.addEventListener.mock.calls.find(([type]) => type === 'click');
    expect(stayCall).toBeDefined();
    const stayHandler = stayCall[1];
    stayHandler({ preventDefault: vi.fn() });

    expect(overlay.hidden).toBe(true);
    expect(documentStub.body.classList.remove).toHaveBeenCalledWith('hud-inactive');

    // run any pending timers to ensure they are cleared
    state = hooks.getInactivityMonitorState();
    if (state.countdownHandle) {
      timers.delete(state.countdownHandle);
    }
  });

  it('refreshes the renderer when the inactivity countdown elapses', () => {
    const { sandbox, windowStub, documentStub, timers } = createBootstrapSandbox();
    windowStub.__INFINITE_RAILS_TEST_SKIP_BOOTSTRAP__ = true;
    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    hooks.setupInactivityOverlay();
    const reloadSpy = vi
      .spyOn(windowStub.InfiniteRails.renderers, 'reloadActive')
      .mockResolvedValue(undefined);

    hooks.configureInactivityMonitor({
      idleThresholdMs: 1500,
      refreshCountdownMs: 1000,
      checkIntervalMs: 200,
    });
    hooks.setInactivityLastActivity(Date.now() - 5000);
    let state = hooks.getInactivityMonitorState();
    if (state.checkHandle) {
      runTimer(timers, state.checkHandle);
      state = hooks.getInactivityMonitorState();
    }

    const overlay = documentStub.getElementById('inactivityOverlay');
    expect(overlay.hidden).toBe(false);
    expect(state.countdownHandle).toBeTruthy();

    const previousActivity = state.lastActivityAt;
    hooks.forceInactivityRefresh('test');

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledWith({ reason: 'inactivity-test' });
    expect(overlay.hidden).toBe(true);
    expect(documentStub.body.classList.remove).toHaveBeenCalledWith('hud-inactive');
    const finalState = hooks.getInactivityMonitorState();
    expect(finalState.promptVisible).toBe(false);
    expect(finalState.lastActivityAt).toBeGreaterThan(previousActivity);
  });
});
