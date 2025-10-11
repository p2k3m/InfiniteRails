import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExperience, ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

function prepareExperienceForAdvance(experience) {
  const themes = window.SimpleExperience.dimensionThemes;
  experience.portalActivated = true;
  experience.portalState = { active: true };
  experience.victoryAchieved = false;
  experience.currentDimensionIndex = 0;
  experience.dimensionSettings = themes[0] ?? { id: 'origin', name: 'Origin' };
  experience.audio = { play: vi.fn() };
  experience.notifyScoreEvent = vi.fn();
  vi.spyOn(experience, 'buildTerrain').mockImplementation(() => {});
  vi.spyOn(experience, 'buildRails').mockImplementation(() => {});
  vi.spyOn(experience, 'spawnDimensionChests').mockImplementation(() => {});
  vi.spyOn(experience, 'refreshPortalState').mockImplementation(() => {});
  vi.spyOn(experience, 'revealDimensionIntro').mockImplementation(() => {});
  vi.spyOn(experience, 'rebindDimensionContext').mockImplementation(() => {});
  vi.spyOn(experience, 'updateHud').mockImplementation(() => {});
  vi.spyOn(experience, 'scheduleScoreSync').mockImplementation(() => {});
  vi.spyOn(experience, 'showHint').mockImplementation(() => {});
  vi.spyOn(experience, 'runDimensionExitHooks').mockResolvedValue();
  vi.spyOn(experience, 'runDimensionEnterHooks').mockResolvedValue();
  vi.spyOn(experience, 'runDimensionReadyHooks').mockResolvedValue();
  vi.spyOn(experience, 'handleDimensionPostInit').mockResolvedValue();
  vi.spyOn(experience, 'verifyDimensionAssetsAfterTransition').mockReturnValue({ allPresent: true });
  vi.spyOn(experience, 'applyDimensionSettings').mockImplementation(function mockApply(index) {
    this.currentDimensionIndex = index;
    this.dimensionSettings = themes[index] ?? { id: `dimension-${index}`, name: `Dimension ${index + 1}` };
  });
}

describe('simple experience dimension travel scoring', () => {
  beforeEach(() => {
    ensureSimpleExperienceLoaded();
  });

  it('awards points when the portal transition changes dimensions', async () => {
    const { experience } = createExperience();
    prepareExperienceForAdvance(experience);
    const startScore = experience.score;
    const addScoreSpy = vi.spyOn(experience, 'addScoreBreakdown');

    experience.portalMechanics = { ...experience.portalMechanics };
    experience.portalMechanics.enterPortal = vi.fn(() => ({
      pointsAwarded: 9,
      dimensionChanged: true,
      log: 'Entering Rock Dimension — Gravity ×1.50 — Heavier world with dense ore clusters.',
    }));

    await experience.advanceDimension();

    expect(experience.portalMechanics.enterPortal).toHaveBeenCalled();
    expect(experience.score).toBe(startScore + 9);
    expect(addScoreSpy).toHaveBeenCalledWith('dimensions', 9);
  });

  it('does not award points when the transition reports no dimension change', async () => {
    const { experience } = createExperience();
    prepareExperienceForAdvance(experience);
    const startScore = experience.score;
    const addScoreSpy = vi.spyOn(experience, 'addScoreBreakdown');

    experience.portalMechanics = { ...experience.portalMechanics };
    experience.portalMechanics.enterPortal = vi.fn(() => ({
      pointsAwarded: 12,
      dimensionChanged: false,
    }));

    await experience.advanceDimension();

    expect(experience.portalMechanics.enterPortal).toHaveBeenCalled();
    expect(experience.score).toBe(startScore);
    expect(addScoreSpy).not.toHaveBeenCalledWith('dimensions', expect.any(Number));
  });

  it('cleans, loads, runs post-init hooks, and verifies assets during travel', async () => {
    const { experience } = createExperience();
    prepareExperienceForAdvance(experience);
    const populateSpy = vi
      .spyOn(experience, 'populateSceneAfterTerrain')
      .mockImplementation(() => {});
    const handleSpy = experience.handleDimensionPostInit;
    const exitSpy = experience.runDimensionExitHooks;
    const applySpy = experience.applyDimensionSettings;
    const buildSpy = experience.buildTerrain;
    const verifySpy = experience.verifyDimensionAssetsAfterTransition;

    experience.portalMechanics = { ...experience.portalMechanics };
    experience.portalMechanics.enterPortal = vi.fn(() => ({ dimensionChanged: true }));

    await experience.advanceDimension();

    expect(exitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ previousDimension: expect.anything(), nextDimension: expect.anything() }),
    );
    expect(applySpy).toHaveBeenCalledWith(expect.any(Number));
    expect(buildSpy).toHaveBeenCalled();
    expect(populateSpy).toHaveBeenCalledWith({ reason: 'dimension-transition' });
    expect(handleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        previousDimension: expect.anything(),
        nextDimension: expect.anything(),
        arrivalRules: expect.any(String),
      }),
    );
    expect(verifySpy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'dimension-transition' }));
  });

  it('resets to the previous dimension when the transition guard refuses an incomplete load', async () => {
    const { experience } = createExperience();
    prepareExperienceForAdvance(experience);
    const startScore = experience.score;
    const addScoreSpy = vi.spyOn(experience, 'addScoreBreakdown');
    const populateSpy = vi.spyOn(experience, 'populateSceneAfterTerrain').mockImplementation(() => {});

    experience.portalMechanics = { ...experience.portalMechanics };
    experience.portalMechanics.enterPortal = vi.fn(() => ({
      dimensionChanged: true,
      transitionGuard: {
        allowIncompleteTransition: false,
        neverAllowIncompleteTransition: true,
        resetOnWorldFailure: true,
        resetOnDimensionFailure: true,
        reason: 'dimension-transition-guard',
      },
    }));

    experience.verifyDimensionAssetsAfterTransition.mockReturnValue({ allPresent: false });

    await experience.advanceDimension();

    expect(experience.portalMechanics.enterPortal).toHaveBeenCalled();
    expect(experience.applyDimensionSettings).toHaveBeenNthCalledWith(1, 1);
    expect(experience.applyDimensionSettings).toHaveBeenNthCalledWith(2, 0);
    expect(experience.currentDimensionIndex).toBe(0);
    expect(addScoreSpy).not.toHaveBeenCalledWith('dimensions', expect.any(Number));
    expect(experience.scheduleScoreSync).toHaveBeenCalledWith('dimension-transition-guard');
    expect(experience.audio.play).not.toHaveBeenCalled();
    expect(experience.buildTerrain).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'dimension-transition-guard' }),
    );
    expect(populateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'dimension-transition-guard' }),
    );
    expect(experience.refreshPortalState).toHaveBeenCalled();
    expect(experience.handleDimensionPostInit).toHaveBeenCalledWith(
      expect.objectContaining({
        previousDimension: expect.anything(),
        nextDimension: expect.anything(),
      }),
    );
    expect(experience.showHint).toHaveBeenCalledWith(
      expect.stringContaining('resetting portal alignment'),
    );
    expect(experience.score).toBe(startScore);
  });

  it('forces a reset when world assets fail to load even without an explicit guard', async () => {
    const { experience } = createExperience();
    prepareExperienceForAdvance(experience);
    const startScore = experience.score;
    const addScoreSpy = vi.spyOn(experience, 'addScoreBreakdown');
    const populateSpy = vi.spyOn(experience, 'populateSceneAfterTerrain').mockImplementation(() => {});

    experience.portalMechanics = { ...experience.portalMechanics };
    experience.portalMechanics.enterPortal = vi.fn(() => ({ dimensionChanged: true }));

    experience.verifyDimensionAssetsAfterTransition.mockReturnValue({ allPresent: false });

    await experience.advanceDimension();

    expect(experience.portalMechanics.enterPortal).toHaveBeenCalled();
    expect(experience.applyDimensionSettings).toHaveBeenNthCalledWith(1, 1);
    expect(experience.applyDimensionSettings).toHaveBeenNthCalledWith(2, 0);
    expect(experience.currentDimensionIndex).toBe(0);
    expect(addScoreSpy).not.toHaveBeenCalledWith('dimensions', expect.any(Number));
    expect(experience.scheduleScoreSync).toHaveBeenCalledWith('dimension-transition-guard');
    expect(experience.audio.play).not.toHaveBeenCalled();
    expect(experience.buildTerrain).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'dimension-transition-guard' }),
    );
    expect(populateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'dimension-transition-guard' }),
    );
    expect(experience.refreshPortalState).toHaveBeenCalled();
    expect(experience.showHint).toHaveBeenCalledWith(
      expect.stringContaining('resetting portal alignment'),
    );
    expect(experience.score).toBe(startScore);
  });
});
