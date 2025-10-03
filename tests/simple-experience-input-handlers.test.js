import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createExperience, ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

function createInputTestExperience() {
  const { experience, canvas } = createExperience();
  experience.pointerLocked = true;
  experience.pointerLockFallbackActive = false;
  experience.getPointerLockElement = vi.fn(() => canvas);
  experience.beginPointerFallbackDrag = vi.fn();
  experience.updatePointerHintForInputMode = vi.fn();
  experience.attemptPointerLock = vi.fn();
  vi.spyOn(experience, 'renderFrame').mockImplementation(() => {});
  return { experience, canvas };
}

beforeAll(() => {
  ensureSimpleExperienceLoaded();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simple experience input handlers', () => {
  it('mines a block on primary mouse input inside the canvas', () => {
    const { experience, canvas } = createInputTestExperience();
    const mineSpy = vi.spyOn(experience, 'mineBlock').mockImplementation(() => {});
    const placeSpy = vi.spyOn(experience, 'placeBlock').mockImplementation(() => {});
    const event = {
      button: 0,
      target: canvas,
      preventDefault: vi.fn(),
    };

    experience.handleMouseDown(event);

    expect(mineSpy).toHaveBeenCalledTimes(1);
    expect(placeSpy).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('places a block on secondary mouse input inside the canvas', () => {
    const { experience, canvas } = createInputTestExperience();
    const mineSpy = vi.spyOn(experience, 'mineBlock').mockImplementation(() => {});
    const placeSpy = vi.spyOn(experience, 'placeBlock').mockImplementation(() => {});
    const event = {
      button: 2,
      target: canvas,
      preventDefault: vi.fn(),
    };

    experience.handleMouseDown(event);

    expect(placeSpy).toHaveBeenCalledTimes(1);
    expect(mineSpy).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('honours the place block key binding during keydown events', () => {
    const { experience } = createInputTestExperience();
    const placeSpy = vi.spyOn(experience, 'placeBlock').mockImplementation(() => {});
    const binding = experience.keyBindings?.placeBlock?.[0] ?? 'KeyQ';
    const event = {
      code: binding,
      preventDefault: vi.fn(),
      repeat: false,
    };

    experience.handleKeyDown(event);

    expect(placeSpy).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('normalises letter movement keys when KeyboardEvent.code is unavailable', () => {
    const { experience } = createInputTestExperience();
    experience.pointerLocked = true;
    vi.spyOn(experience, 'queueMovementBindingValidation').mockImplementation(() => {});
    const event = {
      key: 'w',
      preventDefault: vi.fn(),
      repeat: false,
    };

    experience.handleKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(experience.keys.has('KeyW')).toBe(true);
    expect(experience.isActionActive('moveForward')).toBe(true);
  });

  it('normalises legacy arrow keys when KeyboardEvent.code is unavailable', () => {
    const { experience } = createInputTestExperience();
    experience.pointerLocked = true;
    vi.spyOn(experience, 'queueMovementBindingValidation').mockImplementation(() => {});
    const event = {
      key: 'Up',
      preventDefault: vi.fn(),
      repeat: false,
    };

    experience.handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(experience.keys.has('ArrowUp')).toBe(true);

    experience.handleKeyUp({ key: 'Up' });
    expect(experience.keys.has('ArrowUp')).toBe(false);
  });

  it('falls back to vendor-prefixed pointer lock requests when options are unsupported', () => {
    const { experience, canvas } = createInputTestExperience();
    const prototype = Object.getPrototypeOf(experience);
    experience.attemptPointerLock = prototype.attemptPointerLock.bind(experience);
    experience.pointerLocked = false;
    experience.getPointerLockElement = vi.fn(() => null);
    const fallbackSpy = vi.spyOn(experience, 'enablePointerLockFallback');
    delete canvas.requestPointerLock;
    delete experience.canvas.requestPointerLock;
    const mozRequestPointerLock = vi.fn(function (options) {
      if (options) {
        throw new TypeError('unadjustedMovement unsupported');
      }
      return { catch: () => {} };
    });
    canvas.mozRequestPointerLock = mozRequestPointerLock;
    experience.canvas.mozRequestPointerLock = mozRequestPointerLock;

    experience.attemptPointerLock();

    expect(mozRequestPointerLock).toHaveBeenCalledTimes(2);
    expect(mozRequestPointerLock.mock.calls[0][0]).toEqual({ unadjustedMovement: true });
    expect(mozRequestPointerLock.mock.calls[1].length).toBe(0);
    expect(fallbackSpy).not.toHaveBeenCalled();
  });
});
