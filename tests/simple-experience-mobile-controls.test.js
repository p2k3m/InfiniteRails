import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createCanvasStub,
  createExperience,
  ensureSimpleExperienceLoaded,
  getDocumentStub,
  getWindowStub,
} from './helpers/simple-experience-test-utils.js';

beforeAll(() => {
  ensureSimpleExperienceLoaded();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMobileControlsHarness() {
  const joystickThumb = { style: { transform: '' } };
  const joystickEl = {
    setAttribute: vi.fn(),
    toggleAttribute: vi.fn(),
    addEventListener: vi.fn((event, handler, options) => {
    }),
    removeEventListener: vi.fn(),
    querySelector: vi.fn(() => joystickThumb),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  };

  const makeButton = (action) => ({
    dataset: { action },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setPointerCapture: vi.fn(),
  });

  const buttonLeft = makeButton('left');
  const buttonRight = makeButton('right');
  const buttonUp = makeButton('up');
  const buttonDown = makeButton('down');
  const buttonAction = makeButton('action');
  const buttonPortal = makeButton('portal');

  const mobileControls = {
    dataset: {},
    hidden: true,
    setAttribute: vi.fn(),
    toggleAttribute: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelectorAll: vi.fn((selector) => {
      if (selector.includes('[data-action="up"')) {
        return [buttonUp, buttonDown, buttonLeft, buttonRight];
      }
      if (selector.includes('button[data-action]')) {
        return [buttonUp, buttonDown, buttonLeft, buttonRight, buttonAction, buttonPortal];
      }
      return [];
    }),
    querySelector: vi.fn((selector) => {
      if (selector === 'button[data-action="action"]') return buttonAction;
      if (selector === 'button[data-action="portal"]') return buttonPortal;
      if (selector === '.virtual-joystick__thumb') return joystickThumb;
      return null;
    }),
    contains: vi.fn(() => false),
  };

  const ui = {
    mobileControls,
    virtualJoystick: joystickEl,
    virtualJoystickThumb: joystickThumb,
  };

  const { experience } = createExperience({ ui });
  experience.virtualJoystickEl = joystickEl;
  experience.virtualJoystickThumb = joystickThumb;
  experience.mobileControlsRoot = mobileControls;
  experience.isTouchPreferred = true;

  return {
    experience,
    joystickEl,
    mobileControls,
    buttonAction,
    buttonPortal,
    directionButtons: [buttonUp, buttonDown, buttonLeft, buttonRight],
  };
}

describe('simple experience mobile controls', () => {
  it('activates mobile controls and verifies joystick elements when touch is preferred', () => {
    const {
      experience,
      joystickEl,
      mobileControls,
      directionButtons,
      buttonAction,
      buttonPortal,
    } = createMobileControlsHarness();

    experience.initializeMobileControls();

    expect(mobileControls.dataset.active).toBe('true');
    expect(mobileControls.dataset.ready).toBe('true');
    expect(mobileControls.toggleAttribute).toHaveBeenCalledWith('hidden', false);
    expect(mobileControls.hidden).toBe(false);
    expect(joystickEl.toggleAttribute).not.toHaveBeenCalled();

    directionButtons.forEach((button) => {
      expect(button.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), {
        passive: false,
      });
    });

    expect(buttonAction.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), {
      passive: false,
    });
    expect(buttonPortal.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), {
      passive: false,
    });
  });

  it('runs the control/UI sync check on mobile control activation and deactivation', () => {
    const { experience, mobileControls } = createMobileControlsHarness();
    const syncSpy = vi.spyOn(experience, 'runControlUiSyncCheck');

    experience.initializeMobileControls();

    expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'touch-controls-activated' }));

    syncSpy.mockClear();
    experience.isTouchPreferred = false;
    experience.initializeMobileControls();

    expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'touch-controls-deactivated' }));
    expect(mobileControls.dataset.active).toBe('false');
  });

  it('binds pointer handlers to the topmost visible canvas layer', () => {
    const { experience, canvas } = createExperience();
    const documentStub = getDocumentStub();
    const windowStub = getWindowStub();
    const topCanvas = createCanvasStub({ ownerDocument: documentStub });
    topCanvas.addEventListener = vi.fn();
    topCanvas.removeEventListener = vi.fn();

    const originalQuerySelectorAll = documentStub.querySelectorAll;
    documentStub.querySelectorAll = vi.fn(() => [canvas, topCanvas]);

    const originalGetComputedStyle = windowStub.getComputedStyle;
    windowStub.getComputedStyle = vi.fn((element) => {
      if (element === topCanvas) {
        return {
          zIndex: '40',
          pointerEvents: 'auto',
          display: 'block',
          visibility: 'visible',
          position: 'absolute',
        };
      }
      return {
        zIndex: '0',
        pointerEvents: 'auto',
        display: 'block',
        visibility: 'visible',
        position: 'relative',
      };
    });

    experience.bindEvents();

    expect(topCanvas.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), {
      passive: false,
    });
    const calls = topCanvas.addEventListener.mock.calls;
    expect(calls.some(([eventName]) => eventName === 'click')).toBe(true);
    expect(calls.some(([eventName]) => eventName === 'contextmenu')).toBe(true);

    experience.unbindEvents();

    documentStub.querySelectorAll = originalQuerySelectorAll;
    windowStub.getComputedStyle = originalGetComputedStyle;
  });
});

describe('control UI sync check', () => {
  it('detects mismatches between control map and HUD/settings', () => {
    const { experience } = createExperience();
    const recordSpy = vi.spyOn(experience, 'recordMajorIssue');
    const clearSpy = vi.spyOn(experience, 'clearMajorIssues');

    expect(experience.runControlUiSyncCheck({ reason: 'baseline' })).toBe(true);
    expect(recordSpy).not.toHaveBeenCalled();

    experience.keyBindings = experience.getKeyBindings();
    experience.keyBindings.interact = ['KeyX'];

    expect(experience.runControlUiSyncCheck({ reason: 'drift' })).toBe(false);
    expect(recordSpy).toHaveBeenCalledWith(
      'Input bindings desynchronised — HUD or settings showing stale controls.',
      expect.objectContaining({
        scope: 'input-binding-sync',
        code: 'control-ui-sync',
        reason: 'drift',
      }),
    );

    recordSpy.mockClear();
    experience.keyBindings = experience.buildKeyBindings({ includeStored: true });

    expect(experience.runControlUiSyncCheck({ reason: 'recovery' })).toBe(true);
    expect(clearSpy).toHaveBeenCalledWith('input-binding-sync');
  });

  it('runs the sync check when input mode changes', () => {
    const { experience } = createExperience();
    const syncSpy = vi.spyOn(experience, 'runControlUiSyncCheck');

    experience.isTouchPreferred = false;
    experience.mobileControlsActive = false;

    experience.handleInputModeChange({ detail: { mode: 'touch', source: 'detector' } });

    expect(experience.isTouchPreferred).toBe(true);
    expect(syncSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'input-mode-change:touch',
        mode: 'touch',
        source: 'detector',
      }),
    );
    expect(experience.lastControlUiSyncContext).toEqual(
      expect.objectContaining({
        reason: 'input-mode-change:touch',
        mode: 'touch',
        source: 'detector',
        touchPreferred: true,
      }),
    );
    expect(Object.isFrozen(experience.lastControlUiSyncSnapshots)).toBe(true);
    expect(Object.isFrozen(experience.lastControlUiSyncSnapshots.controls)).toBe(true);
    expect(Object.isFrozen(experience.lastControlUiSyncSnapshots.hud)).toBe(true);
    expect(experience.lastControlUiSyncSnapshots.controls.interact).toEqual(
      expect.arrayContaining(['KeyF']),
    );
    expect(experience.lastControlUiSyncSnapshots.hud.interact).toEqual(
      expect.arrayContaining(['KeyF']),
    );

    syncSpy.mockClear();
    experience.mobileControlsActive = false;

    experience.handleInputModeChange({ detail: { mode: 'pointer', source: 'detector' } });

    expect(experience.isTouchPreferred).toBe(false);
    expect(syncSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'input-mode-change:pointer',
        mode: 'pointer',
        source: 'detector',
      }),
    );
    expect(experience.lastControlUiSyncContext).toEqual(
      expect.objectContaining({
        reason: 'input-mode-change:pointer',
        mode: 'pointer',
        source: 'detector',
        touchPreferred: false,
      }),
    );
  });

  it('runs the sync check when pointer preference toggles', () => {
    const { experience } = createExperience();
    const syncSpy = vi.spyOn(experience, 'runControlUiSyncCheck');
    experience.isTouchPreferred = false;
    experience.mobileControlsActive = false;
    experience.initializeMobileControls = vi.fn(() => {
      experience.mobileControlsActive = experience.isTouchPreferred;
    });

    experience.handlePointerPreferenceChange({ matches: true });

    expect(experience.initializeMobileControls).toHaveBeenCalled();
    expect(syncSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'pointer-preference-change:touch',
        mode: 'touch',
        source: 'pointer-preference',
        preferenceChanged: true,
        mobileControlsChanged: true,
        touchPreferred: true,
        mobileControlsActive: true,
      }),
    );
  });

  it('records context metadata and compares HUD bindings with settings', () => {
    const { experience } = createExperience();
    const windowStub = getWindowStub();
    const recordSpy = vi.spyOn(experience, 'recordMajorIssue');
    const originalSettingsGet = windowStub.InfiniteRailsControls.get;

    try {
      const settingsSnapshot = experience.getKeyBindings();
      settingsSnapshot.jump = ['KeyZ'];
      windowStub.InfiniteRailsControls.get = vi.fn(() => settingsSnapshot);

      experience.keyBindings = experience.getKeyBindings();
      experience.keyBindings.jump = ['KeyX'];

      const context = {
        reason: 'sync-drift',
        mode: 'touch',
        source: 'test-suite',
        preferenceChanged: true,
      };

      expect(experience.runControlUiSyncCheck(context)).toBe(false);
      expect(recordSpy).toHaveBeenCalledWith(
        'Input bindings desynchronised — HUD or settings showing stale controls.',
        expect.objectContaining({
          reason: 'sync-drift',
          context: expect.objectContaining({ mode: 'touch', source: 'test-suite', preferenceChanged: true }),
          mismatches: expect.arrayContaining([
            expect.objectContaining({ source: 'controls', target: 'hud' }),
            expect.objectContaining({ source: 'controls', target: 'settings' }),
            expect.objectContaining({ source: 'hud', target: 'settings' }),
          ]),
        }),
      );

      const [, detail] = recordSpy.mock.calls.at(-1);
      expect(detail.context.reason).toBeUndefined();
    } finally {
      windowStub.InfiniteRailsControls.get = originalSettingsGet;
    }
  });
});
