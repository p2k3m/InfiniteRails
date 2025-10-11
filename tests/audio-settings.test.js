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

  it('binds settings UI controls to the audio state', () => {
    const { windowStub } = setupBootstrap();
    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    const audioApi = windowStub.InfiniteRails.audio;
    const form = windowStub.document.querySelector('[data-settings-form]');

    expect(form).toBeDefined();

    hooks.bindAudioSettingsControls({ settingsForm: form });

    expect(form.dataset.audioSettingsBound).toBe('true');

    const musicSlider = form.querySelector('input[name="music"]');
    const musicLabel = form.querySelector('[data-volume-label="music"]');

    expect(musicSlider).toBeDefined();
    expect(musicLabel).toBeDefined();
    expect(musicLabel.textContent).toBe('60%');

    const sliderHandler = musicSlider.addEventListener.mock.calls.find(([type]) => type === 'input')?.[1];
    expect(sliderHandler).toBeTypeOf('function');

    musicSlider.value = '25';
    sliderHandler({ target: musicSlider });

    const updatedState = audioApi.getState();
    expect(updatedState.volumes.music).toBeCloseTo(0.25, 5);
    expect(musicLabel.textContent).toBe('25%');

    const muteToggle = form.querySelector('[data-audio-mute]');
    const masterLabel = form.querySelector('[data-volume-label="master"]');
    const muteHandler = muteToggle.addEventListener.mock.calls.find(([type]) => type === 'change')?.[1];

    expect(muteHandler).toBeTypeOf('function');

    muteToggle.checked = true;
    muteHandler({ target: muteToggle });

    const mutedState = audioApi.getState();
    expect(mutedState.muted).toBe(true);
    expect(masterLabel.textContent).toBe('Muted');
    expect(musicLabel.textContent).toBe('Muted');

    muteToggle.checked = false;
    muteHandler({ target: muteToggle });

    const unmutedState = audioApi.getState();
    expect(unmutedState.muted).toBe(false);
    expect(masterLabel.textContent).toBe('80%');
    expect(musicLabel.textContent).toBe('25%');
  });

  it('quarantines corrupted audio settings before falling back to defaults', () => {
    const { sandbox, windowStub } = createBootstrapSandbox();
    const storage = {
      getItem: vi.fn((key) => (key === 'infinite-rails:audio-settings' ? '{"muted":true' : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    windowStub.localStorage = storage;
    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    const audioState = hooks.getAudioSettingsState();

    expect(audioState.muted).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledWith('infinite-rails:audio-settings');
    const warnCall = windowStub.console.warn.mock.calls.find(([message]) =>
      typeof message === 'string' && message.includes('"infinite-rails:audio-settings"'),
    );
    expect(warnCall).toBeDefined();
    expect(warnCall[1]).toBeTruthy();
    expect(warnCall[1].name).toBe('SyntaxError');
  });
});
