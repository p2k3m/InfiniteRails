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
    welcome: existingAliases.welcome || ['victoryCheer', 'bubble'],
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
    expect(hasSpy).toHaveBeenCalledWith('welcome');
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(playSpy).toHaveBeenNthCalledWith(
      1,
      'ambientOverworld',
      expect.objectContaining({ loop: true, volume: expect.any(Number) }),
    );
    expect(playSpy).toHaveBeenNthCalledWith(
      2,
      'welcome',
      expect.objectContaining({ volume: expect.any(Number) }),
    );
    expect(experience.activeAmbientTrack).toBe('ambientOverworld');
  });

  it('falls back to the next available ambient track when the primary choice is missing', () => {
    const experience = prepareExperienceForBoot();
    const resumeSpy = vi.fn();
    const playSpy = vi.fn();
    const hasSpy = vi.fn((name) => name === 'ambientDefault' || name === 'welcome');

    experience.audio = {
      has: hasSpy,
      play: playSpy,
      resumeContextIfNeeded: resumeSpy,
    };

    experience.start();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(hasSpy).toHaveBeenCalledWith('ambientOverworld');
    expect(hasSpy).toHaveBeenCalledWith('ambientDefault');
    expect(hasSpy).toHaveBeenCalledWith('welcome');
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(playSpy).toHaveBeenNthCalledWith(
      1,
      'ambientDefault',
      expect.objectContaining({ loop: true, volume: expect.any(Number) }),
    );
    expect(playSpy).toHaveBeenNthCalledWith(
      2,
      'welcome',
      expect.objectContaining({ volume: expect.any(Number) }),
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
    expect(hasSpy).toHaveBeenCalledWith('welcome');
    expect(playSpy).not.toHaveBeenCalled();
    expect(experience.activeAmbientTrack).toBeNull();
  });
});

describe('SimpleExperience audio diagnostics', () => {
  it('emits a boot status event when samples load successfully', () => {
    const windowStub = getWindowStub();
    const dispatchSpy = vi.spyOn(windowStub, 'dispatchEvent').mockImplementation(() => {});

    const { experience } = createExperience();
    experience.createAudioController();

    const bootStatusEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === 'infinite-rails:audio-boot-status');

    expect(bootStatusEvent).toBeDefined();
    expect(bootStatusEvent.detail).toEqual(
      expect.objectContaining({ fallbackActive: false, message: 'Audio initialised successfully.' }),
    );

    dispatchSpy.mockRestore();
  });

  it('emits a boot error when required samples are missing', () => {
    const windowStub = getWindowStub();
    windowStub.INFINITE_RAILS_EMBEDDED_ASSETS.audioSamples = {};
    const dispatchSpy = vi.spyOn(windowStub, 'dispatchEvent').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { experience } = createExperience();
    experience.createAudioController();

    const errorMessages = errorSpy.mock.calls.map(([message]) => String(message));
    expect(errorMessages.some((message) => message.includes('Missing audio sample'))).toBe(true);
    expect(errorMessages.some((message) => message.includes('fallback alert tone'))).toBe(true);

    const bootStatusEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === 'infinite-rails:audio-boot-status');
    expect(bootStatusEvent).toBeDefined();
    expect(bootStatusEvent.detail).toEqual(
      expect.objectContaining({ fallbackActive: true }),
    );
    expect(String(bootStatusEvent.detail?.message || '')).toContain('Missing audio');

    dispatchSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('SimpleExperience audio fallbacks', () => {
  it('plays an alert tone and logs an error when the requested sample is missing', async () => {
    const windowStub = getWindowStub();
    windowStub.INFINITE_RAILS_EMBEDDED_ASSETS.audioSamples = {};
    const dispatchSpy = vi.spyOn(windowStub, 'dispatchEvent').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    class AudioStub {
      static played = [];

      constructor(src) {
        this.src = src;
        this.loop = false;
        this.currentTime = 0;
        this._volume = 1;
        this._listeners = new Map();
        AudioStub.played.push(src);
      }

      set volume(value) {
        this._volume = value;
      }

      get volume() {
        return this._volume;
      }

      addEventListener(event, handler) {
        const listeners = this._listeners.get(event) || [];
        listeners.push(handler);
        this._listeners.set(event, listeners);
      }

      removeEventListener(event, handler) {
        const listeners = this._listeners.get(event);
        if (!listeners) {
          return;
        }
        if (!handler) {
          this._listeners.delete(event);
          return;
        }
        const index = listeners.indexOf(handler);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
        if (!listeners.length) {
          this._listeners.delete(event);
        }
      }

      pause() {}

      play() {
        const fire = (event) => {
          const listeners = this._listeners.get(event) || [];
          listeners.slice().forEach((listener) => {
            try {
              listener();
            } catch (error) {
              // Ignore listener errors in test stub.
            }
          });
        };
        fire('play');
        fire('playing');
        fire('canplay');
        fire('canplaythrough');
        return Promise.resolve().then(() => {
          fire('ended');
        });
      }
    }

    windowStub.Audio = AudioStub;

    const { experience } = createExperience();
    const controller = experience.createAudioController();

    expect(controller.has('bubble')).toBe(true);
    expect(controller.has('ambientOverworld')).toBe(true);
    expect(controller.has('nonexistent')).toBe(false);

    controller.play('bubble');

    await Promise.resolve();
    await Promise.resolve();

    expect(AudioStub.played).toHaveLength(1);
    expect(AudioStub.played[0]).toMatch(/^data:audio\/wav;base64,/);
    expect(AudioStub.played[0]).not.toBe('data:audio/wav;base64,ZmFrZQ==');

    const errorMessages = errorSpy.mock.calls.map(([message]) => String(message));
    expect(
      errorMessages.some((message) =>
        message.includes('Audio sample "bubble" is unavailable. Playing fallback alert tone instead.'),
      ),
    ).toBe(true);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'infinite-rails:audio-error' }),
    );

    delete windowStub.Audio;
    dispatchSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
