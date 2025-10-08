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

  it('skips ambient playback when no configured tracks are available but still plays the welcome cue', () => {
    const experience = prepareExperienceForBoot();
    const resumeSpy = vi.fn();
    const playSpy = vi.fn();
    const hasSpy = vi.fn(() => false);
    const windowStub = getWindowStub();
    const dispatchSpy = vi.spyOn(windowStub, 'dispatchEvent').mockImplementation(() => {});

    experience.audio = {
      has: hasSpy,
      play: playSpy,
      resumeContextIfNeeded: resumeSpy,
    };

    experience.start();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(hasSpy).toHaveBeenCalledWith('welcome');
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledWith('welcome', expect.objectContaining({ volume: expect.any(Number) }));
    expect(experience.activeAmbientTrack).toBeNull();

    const audioErrorEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === 'infinite-rails:audio-error');
    expect(audioErrorEvent).toBeDefined();
    expect(audioErrorEvent.detail).toEqual(
      expect.objectContaining({
        requestedName: 'welcome',
        code: 'missing-sample',
      }),
    );

    dispatchSpy.mockRestore();
  });

  it('dispatches a missing audio warning when the welcome alias resolves to a fallback sample', () => {
    const experience = prepareExperienceForBoot();
    const resumeSpy = vi.fn();
    const playSpy = vi.fn();
    const hasSpy = vi.fn(() => false);
    const resolveSpy = vi.fn(() => 'victoryCheer');
    const windowStub = getWindowStub();
    const dispatchSpy = vi.spyOn(windowStub, 'dispatchEvent').mockImplementation(() => {});

    experience.audio = {
      has: hasSpy,
      play: playSpy,
      resumeContextIfNeeded: resumeSpy,
      _resolve: resolveSpy,
    };

    experience.start();

    const audioErrorEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === 'infinite-rails:audio-error');

    expect(audioErrorEvent).toBeDefined();
    expect(audioErrorEvent.detail).toEqual(
      expect.objectContaining({
        requestedName: 'welcome',
        resolvedName: 'victoryCheer',
        code: 'missing-sample',
        missingSample: true,
        fallbackActive: true,
      }),
    );

    dispatchSpy.mockRestore();
  });

  it('presents an overlay diagnostic when the welcome cue fails to play', () => {
    const experience = prepareExperienceForBoot();
    const resumeSpy = vi.fn();
    const hasSpy = vi.fn(() => true);
    const playSpy = vi.fn(() => {
      const error = new Error('Autoplay prevented by browser policy.');
      error.code = 'NotAllowedError';
      throw error;
    });
    const windowStub = getWindowStub();
    const showErrorSpy = vi.fn();
    const setDiagnosticSpy = vi.fn();
    const logEventSpy = vi.fn();
    const dispatchSpy = vi.spyOn(windowStub, 'dispatchEvent').mockImplementation(() => {});

    windowStub.bootstrapOverlay = {
      showError: showErrorSpy,
      setDiagnostic: setDiagnosticSpy,
      logEvent: logEventSpy,
    };

    experience.audio = {
      has: hasSpy,
      play: playSpy,
      resumeContextIfNeeded: resumeSpy,
    };

    expect(() => experience.start()).not.toThrow();

    const overlayCall = showErrorSpy.mock.calls.find(([payload]) =>
      payload?.title === 'Audio playback failed' || payload?.title === 'Missing audio sample',
    );
    expect(overlayCall).toBeDefined();
    expect(overlayCall?.[0]?.message).toMatch(/Fallback beep active until audio assets are restored\.?/);

    const diagnosticCall = setDiagnosticSpy.mock.calls.find(([scope]) => scope === 'audio');
    expect(diagnosticCall).toBeDefined();
    expect(diagnosticCall?.[1]).toEqual(
      expect.objectContaining({
        status: 'error',
        message: expect.stringMatching(/Fallback beep active until audio assets are restored\.?/),
      }),
    );

    const logCall = logEventSpy.mock.calls.find(([scope]) => scope === 'audio');
    expect(logCall).toBeDefined();
    expect(logCall?.[1]).toMatch(/Fallback beep active until audio assets are restored\.?/);
    expect(logCall?.[2]).toEqual(
      expect.objectContaining({
        level: 'error',
        detail: expect.objectContaining({ code: 'welcome-playback-error' }),
      }),
    );

    const audioErrorEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === 'infinite-rails:audio-error');
    expect(audioErrorEvent).toBeDefined();
    expect(audioErrorEvent.detail).toEqual(
      expect.objectContaining({
        message: expect.stringMatching(/Fallback beep active until audio assets are restored\.?/),
      }),
    );

    dispatchSpy.mockRestore();
    delete windowStub.bootstrapOverlay;
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
    expect(errorMessages.some((message) => message.toLowerCase().includes('fallback beep'))).toBe(true);

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

  const installAudioStub = (windowStub) => {
    AudioStub.played = [];
    windowStub.Audio = AudioStub;
    return () => {
      delete windowStub.Audio;
    };
  };

  it('plays a fallback beep and logs an error when the requested sample is missing', async () => {
    const windowStub = getWindowStub();
    windowStub.INFINITE_RAILS_EMBEDDED_ASSETS.audioSamples = {};
    const dispatchSpy = vi.spyOn(windowStub, 'dispatchEvent').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cleanupAudioStub = installAudioStub(windowStub);

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
        message.includes('Audio sample "bubble" is unavailable. Playing fallback beep instead.'),
      ),
    ).toBe(true);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'infinite-rails:audio-error' }),
    );

    cleanupAudioStub();
    dispatchSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('plays the fallback beep when a resolved sample payload is missing', async () => {
    const windowStub = getWindowStub();
    const dispatchSpy = vi.spyOn(windowStub, 'dispatchEvent').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cleanupAudioStub = installAudioStub(windowStub);

    const { experience } = createExperience();
    const controller = experience.createAudioController();

    expect(controller.has('welcome')).toBe(true);
    windowStub.INFINITE_RAILS_EMBEDDED_ASSETS.audioSamples.victoryCheer = '';

    controller.play('welcome');

    await Promise.resolve();
    await Promise.resolve();

    expect(AudioStub.played).toHaveLength(1);
    expect(AudioStub.played[0]).toContain('UklGRoQJAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YWAJ');

    const errorMessages = errorSpy.mock.calls.map(([message]) => String(message));
    expect(
      errorMessages.some((message) => message.includes('Audio sample "victoryCheer" could not be loaded.')),
    ).toBe(true);
    expect(errorMessages.some((message) => message.toLowerCase().includes('fallback beep'))).toBe(true);

    const audioErrorEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === 'infinite-rails:audio-error');
    expect(audioErrorEvent).toBeDefined();
    expect(audioErrorEvent.detail).toEqual(
      expect.objectContaining({
        code: 'missing-sample',
        requestedName: 'welcome',
        resolvedName: 'victoryCheer',
        fallbackActive: true,
        missingSample: true,
      }),
    );

    cleanupAudioStub();
    dispatchSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
