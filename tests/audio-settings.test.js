import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

function setupBootstrap() {
  const { sandbox, windowStub } = createBootstrapSandbox();
  windowStub.localStorage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  evaluateBootstrapScript(sandbox);
  return { sandbox, windowStub };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Audio settings API', () => {
  it('exposes default channel volumes and supports muting', () => {
    const { windowStub } = setupBootstrap();
    const audioApi = windowStub.InfiniteRails?.audio;
    expect(audioApi).toBeDefined();

    const initialState = audioApi.getState();
    expect(initialState.muted).toBe(false);
    expect(initialState.volumes.master).toBeCloseTo(0.8, 5);
    expect(initialState.volumes.music).toBeCloseTo(0.6, 5);
    expect(initialState.volumes.effects).toBeCloseTo(0.85, 5);
    expect(initialState.volumes.ui).toBeCloseTo(0.7, 5);

    audioApi.setVolume('music', 0.5, { persist: false });
    audioApi.setVolume('ui', 0.3, { persist: false });

    let updatedState = audioApi.getState();
    expect(updatedState.volumes.music).toBeCloseTo(0.5, 5);
    expect(updatedState.volumes.ui).toBeCloseTo(0.3, 5);

    audioApi.toggleMuted({ persist: false });
    updatedState = audioApi.getState();
    expect(updatedState.muted).toBe(true);

    audioApi.setMuted(false, { persist: false });
    expect(audioApi.getState().muted).toBe(false);
  });

  it('applies channel volumes and mute state to playback', () => {
    const { windowStub } = setupBootstrap();
    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    const audioApi = windowStub.InfiniteRails.audio;

    const playSpy = vi.fn();
    const audioController = { play: playSpy };
    const experience = { audio: audioController };

    hooks.applyAudioSettingsToExperience(experience);

    audioApi.setVolume('effects', 0.5, { persist: false });
    audioApi.setVolume('music', 0.4, { persist: false });

    experience.audio.play('craftChime', { volume: 0.9 });
    expect(playSpy).toHaveBeenCalledTimes(1);
    let [, options] = playSpy.mock.calls[0];
    expect(options.channel).toBe('effects');
    expect(options.volume).toBeCloseTo(0.9 * 0.8 * 0.5, 5);

    expect(experience.getAudioChannelVolume('music')).toBeCloseTo(0.4, 5);

    playSpy.mockClear();
    experience.audio.play('ambientOverworld', { volume: 1 });
    expect(playSpy).toHaveBeenCalledTimes(1);
    [, options] = playSpy.mock.calls[0];
    expect(options.channel).toBe('music');
    expect(options.volume).toBeCloseTo(1 * 0.8 * 0.4, 5);

    audioApi.setMuted(true, { persist: false });
    playSpy.mockClear();
    experience.audio.play('portalActivate', { volume: 0.6, channel: 'effects' });
    expect(playSpy).toHaveBeenCalledTimes(1);
    [, options] = playSpy.mock.calls[0];
    expect(options.volume).toBe(0);
    expect(options.muted).toBe(true);
  });
});
