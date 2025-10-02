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
    expect(mobileControls.toggleAttribute).toHaveBeenCalledWith('inert', false);
    expect(joystickEl.toggleAttribute).toHaveBeenCalledWith('inert', false);

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
