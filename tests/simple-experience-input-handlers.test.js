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
});
