import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExperience, ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

describe('simple experience world generation events', () => {
  let windowStub;
  let originalDispatchEvent;

  beforeEach(() => {
    ({ windowStub } = ensureSimpleExperienceLoaded());
    originalDispatchEvent = windowStub.dispatchEvent;
    windowStub.dispatchEvent = vi.fn(() => true);
  });

  afterEach(() => {
    if (windowStub) {
      windowStub.dispatchEvent = originalDispatchEvent;
    }
    vi.restoreAllMocks();
  });

  it('dispatches world-generation-start with dimension metadata', () => {
    const { experience } = createExperience();
    experience.initialisePerformanceMetrics();
    experience.dimensionSettings = {
      id: 'overworld',
      name: 'Overworld',
      label: 'Overworld Realm',
    };

    windowStub.dispatchEvent.mockClear();

    experience.markWorldGenerationStart('world-load');

    const startEventCall = windowStub.dispatchEvent.mock.calls.find(
      ([event]) => event?.type === 'infinite-rails:world-generation-start',
    );
    expect(startEventCall).toBeTruthy();
    const event = startEventCall[0];
    expect(event.detail.reason).toBe('world-load');
    expect(event.detail.title).toContain('Overworld');
    expect(event.detail.message).toContain('portal anchors');
    expect(event.detail.dimension).toEqual({ id: 'overworld', name: 'Overworld', label: 'Overworld Realm' });
    expect(event.detail.totalColumns).toBeGreaterThan(0);
  });

  it('dispatches world-generation-complete with summary context', () => {
    const { experience } = createExperience();
    experience.initialisePerformanceMetrics();

    experience.markWorldGenerationStart('world-load');
    windowStub.dispatchEvent.mockClear();

    const summary = {
      chunkCount: 12,
      voxelsUsed: 3456,
      fallbackReason: 'cache',
      heightmapSource: 'remote',
    };
    const heightmapResult = {
      source: 'remote',
      fallbackReason: 'cache',
      fallbackFromStream: false,
    };

    experience.markWorldGenerationComplete('world-load', { summary, heightmapResult });

    const completeEventCall = windowStub.dispatchEvent.mock.calls.find(
      ([event]) => event?.type === 'infinite-rails:world-generation-complete',
    );
    expect(completeEventCall).toBeTruthy();
    const event = completeEventCall[0];
    expect(event.detail.reason).toBe('world-load');
    expect(event.detail.summary).toEqual(summary);
    expect(event.detail.heightmap).toEqual(heightmapResult);
    expect(event.detail.durationMs === null || typeof event.detail.durationMs === 'number').toBe(true);
  });

  it('emits world-generation-complete error event when start fails before completion', () => {
    const { experience } = createExperience();
    experience.initialisePerformanceMetrics();

    vi.spyOn(experience, 'presentRendererFailure').mockImplementation(() => {});
    vi.spyOn(experience, 'setupScene').mockImplementation(() => {});
    vi.spyOn(experience, 'queueCharacterPreload').mockImplementation(() => {});
    vi.spyOn(experience, 'loadFirstPersonArms').mockImplementation(() => {});
    vi.spyOn(experience, 'initializeScoreboardUi').mockImplementation(() => {});
    vi.spyOn(experience, 'applyDimensionSettings').mockImplementation(() => {});
    vi.spyOn(experience, 'primeAmbientAudio').mockImplementation(() => {});
    vi.spyOn(experience, 'populateSceneAfterTerrain').mockImplementation(() => {});
    vi.spyOn(experience, 'buildRails').mockImplementation(() => {});
    vi.spyOn(experience, 'refreshPortalState').mockImplementation(() => {});
    vi.spyOn(experience, 'attachPlayerToSimulation').mockImplementation(() => {});
    vi.spyOn(experience, 'evaluateBossChallenge').mockImplementation(() => {});
    vi.spyOn(experience, 'bindEvents').mockImplementation(() => {});
    vi.spyOn(experience, 'initializeMobileControls').mockImplementation(() => {});
    vi.spyOn(experience, 'updatePointerHintForInputMode').mockImplementation(() => {});
    vi.spyOn(experience, 'showDesktopPointerTutorialHint').mockImplementation(() => {});
    vi.spyOn(experience, 'updateHud').mockImplementation(() => {});
    vi.spyOn(experience, 'revealDimensionIntro').mockImplementation(() => {});
    vi.spyOn(experience, 'refreshCraftingUi').mockImplementation(() => {});
    vi.spyOn(experience, 'hideIntro').mockImplementation(() => {});
    vi.spyOn(experience, 'autoCaptureLocation').mockImplementation(() => ({ catch: () => {} }));
    vi.spyOn(experience, 'updateLocalScoreEntry').mockImplementation(() => {});
    vi.spyOn(experience, 'loadScoreboard').mockImplementation(() => {});
    vi.spyOn(experience, 'exposeDebugInterface').mockImplementation(() => {});
    vi.spyOn(experience, 'renderFrame').mockImplementation(() => {});

    vi.spyOn(experience, 'buildTerrain').mockImplementation(function mockBuildTerrain() {
      this.markWorldGenerationStart('start');
      throw new Error('terrain fail');
    });

    windowStub.dispatchEvent.mockClear();

    expect(() => experience.start()).not.toThrow();

    const completeEventCall = windowStub.dispatchEvent.mock.calls.find(
      ([event]) => event?.type === 'infinite-rails:world-generation-complete',
    );
    expect(completeEventCall).toBeTruthy();
    const event = completeEventCall[0];
    expect(event.detail.reason).toBe('start');
    expect(event.detail.error).toMatchObject({ message: 'terrain fail' });
  });
});
