import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExperience,
  ensureSimpleExperienceLoaded,
  getWindowStub,
} from './helpers/simple-experience-test-utils.js';

function prepareExperienceForBoot() {
  const { experience } = createExperience();
  const stubbedMethods = [
    'setupScene',
    'queueCharacterPreload',
    'loadFirstPersonArms',
    'initializeScoreboardUi',
    'buildTerrain',
    'buildRails',
    'spawnDimensionChests',
    'refreshPortalState',
    'attachPlayerToSimulation',
    'evaluateBossChallenge',
    'bindEvents',
    'initializeMobileControls',
    'updatePointerHintForInputMode',
    'showDesktopPointerTutorialHint',
    'updateHud',
    'revealDimensionIntro',
    'refreshCraftingUi',
    'hideIntro',
    'showBriefingOverlay',
    'updateLocalScoreEntry',
    'loadScoreboard',
    'exposeDebugInterface',
    'renderFrame',
    'emitGameEvent',
    'publishStateSnapshot',
    'clearVictoryEffectTimers',
    'hideVictoryCelebration',
    'hideVictoryBanner',
  ];

  stubbedMethods.forEach((method) => {
    if (typeof experience[method] === 'function') {
      vi.spyOn(experience, method).mockImplementation(() => {});
    } else {
      experience[method] = () => {};
    }
  });

  if (typeof experience.autoCaptureLocation === 'function') {
    vi.spyOn(experience, 'autoCaptureLocation').mockResolvedValue(undefined);
  } else {
    experience.autoCaptureLocation = () => Promise.resolve(undefined);
  }

  return experience;
}

beforeEach(() => {
  ensureSimpleExperienceLoaded();
  const windowStub = getWindowStub();
  windowStub.INFINITE_RAILS_EMBEDDED_ASSETS = {
    audioSamples: {
      bubble: 'ZmFrZQ==',
      miningA: 'ZmFrZQ==',
      miningB: 'ZmFrZQ==',
      crunch: 'ZmFrZQ==',
      victoryCheer: 'ZmFrZQ==',
    },
  };
  const existingAliases = windowStub.INFINITE_RAILS_AUDIO_ALIASES || {};
  windowStub.INFINITE_RAILS_AUDIO_ALIASES = {
    ...existingAliases,
    ambientOverworld: existingAliases.ambientOverworld || ['bubble'],
    ambientDefault: existingAliases.ambientDefault || ['bubble'],
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SimpleExperience audio bootstrapping', () => {
  it('resumes the audio context and plays the default ambient track when a session starts', () => {
    const experience = prepareExperienceForBoot();
    const resumeSpy = vi.fn();
    const playSpy = vi.fn();
    const hasSpy = vi.fn(() => true);

    experience.audio = {
      has: hasSpy,
      play: playSpy,
      resumeContextIfNeeded: resumeSpy,
    };

    experience.start();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(hasSpy).toHaveBeenCalledWith('ambientOverworld');
    expect(playSpy).toHaveBeenCalledWith(
      'ambientOverworld',
      expect.objectContaining({ loop: true, volume: expect.any(Number) }),
    );
    expect(experience.activeAmbientTrack).toBe('ambientOverworld');
  });

  it('falls back to the next available ambient track when the primary choice is missing', () => {
    const experience = prepareExperienceForBoot();
    const resumeSpy = vi.fn();
    const playSpy = vi.fn();
    const hasSpy = vi.fn((name) => name === 'ambientDefault');

    experience.audio = {
      has: hasSpy,
      play: playSpy,
      resumeContextIfNeeded: resumeSpy,
    };

    experience.start();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(hasSpy).toHaveBeenCalledWith('ambientOverworld');
    expect(playSpy).toHaveBeenCalledWith(
      'ambientDefault',
      expect.objectContaining({ loop: true, volume: expect.any(Number) }),
    );
    expect(experience.activeAmbientTrack).toBe('ambientDefault');
  });

  it('skips ambient playback when no configured tracks are available', () => {
    const experience = prepareExperienceForBoot();
    const resumeSpy = vi.fn();
    const playSpy = vi.fn();
    const hasSpy = vi.fn(() => false);

    experience.audio = {
      has: hasSpy,
      play: playSpy,
      resumeContextIfNeeded: resumeSpy,
    };

    experience.start();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();
    expect(experience.activeAmbientTrack).toBeNull();
  });
});
