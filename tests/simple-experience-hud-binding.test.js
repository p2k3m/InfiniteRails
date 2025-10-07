import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createExperience, ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

function createHudElement(overrides = {}) {
  const attributes = {};
  return Object.assign(
    {
      innerHTML: '',
      textContent: '',
      dataset: {},
      style: {
        setProperty: vi.fn(),
        removeProperty: vi.fn(),
      },
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(() => false),
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
      },
      removeAttribute(name) {
        delete attributes[name];
      },
      getAttribute(name) {
        return attributes[name];
      },
      offsetWidth: 0,
    },
    overrides,
  );
}

describe('SimpleExperience HUD bindings', () => {
  beforeAll(() => {
    ensureSimpleExperienceLoaded();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('synchronises vitals, score breakdown, and dimension briefings with the current state', () => {
    const heartsEl = createHudElement();
    const bubblesEl = createHudElement();
    const scoreTotalEl = createHudElement();
    const scoreRecipesEl = createHudElement();
    const scoreDimensionsEl = createHudElement();
    const scorePortalsEl = createHudElement();
    const scoreCombatEl = createHudElement();
    const scoreLootEl = createHudElement();
    const dimensionInfoEl = createHudElement();
    const portalProgressLabel = createHudElement();
    const portalProgressBar = createHudElement();
    const portalStatusEl = createHudElement();
    const portalStatusText = createHudElement();
    const portalStatusStateText = createHudElement();
    const portalStatusDetailText = createHudElement();
    const portalStatusIcon = createHudElement();

    const { experience } = createExperience({
      ui: {
        heartsEl,
        bubblesEl,
        scoreTotalEl,
        scoreRecipesEl,
        scoreDimensionsEl,
        scorePortalsEl,
        scoreCombatEl,
        scoreLootEl,
        dimensionInfoEl,
        portalProgressLabel,
        portalProgressBar,
        portalStatusEl,
        portalStatusText,
        portalStatusStateText,
        portalStatusDetailText,
        portalStatusIcon,
      },
    });

    experience.updateInventoryUi = vi.fn();
    experience.updateFooterSummary = vi.fn();
    vi.spyOn(experience, 'publishStateSnapshot').mockImplementation(() => {});
    const updatePortalProgressSpy = vi.spyOn(experience, 'updatePortalProgress');

    experience.maxHealth = 10;
    experience.health = 7;
    experience.playerBreathCapacity = 10;
    experience.playerBreath = 6;

    experience.score = 123;
    experience.scoreBreakdown = {
      recipes: 40,
      dimensions: 60,
      portal: 10,
      combat: 5,
      loot: 8,
      penalties: 3,
    };
    experience.craftingScoreEvents = 2;
    experience.dimensionScoreEvents = 1;
    experience.portalScoreEvents = 1;
    experience.combatScoreEvents = 3;
    experience.lootScoreEvents = 4;

    experience.currentDimensionIndex = 1;
    experience.dimensionSettings = {
      id: 'stone',
      name: 'Stone Expanse',
      description: 'Shale fields and hidden caches await.',
      gravity: 0.8,
      speedMultiplier: 1.2,
    };

    const portalSnapshot = {
      progress: 0.75,
      progressPercent: 75,
      remainingBlocks: 1,
      requiredBlocks: 12,
      state: 'ready',
      statusLabel: 'Portal Ready',
      statusMessage: 'Ignite to travel through the Lush Frontier.',
      progressLabel: 'Portal ready — press F to ignite',
      displayProgress: 1,
      blocked: false,
      obstructionSummary: '',
      nextDimension: 'Lush Frontier',
      nextRules: 'Gravity ×0.90 · Speed ×1.10',
    };
    vi.spyOn(experience, 'getPortalStatusSnapshot').mockReturnValue(portalSnapshot);

    experience.updateHud();

    expect(heartsEl.innerHTML).toContain('hud-hearts');
    expect(heartsEl.dataset.health).toBe('7');
    expect(heartsEl.dataset.maxHealth).toBe('10');

    expect(bubblesEl.innerHTML).toContain('hud-bubbles');
    expect(bubblesEl.dataset.breath).toBe('6');
    expect(bubblesEl.dataset.maxBreath).toBe('10');
    expect(bubblesEl.dataset.breathPercent).toBe('60');

    expect(scoreTotalEl.textContent).toBe('123');
    expect(scoreRecipesEl.textContent).toBe('2 crafts (+40 pts)');
    expect(scoreDimensionsEl.textContent).toBe('2 (+60 pts, -3 penalty)');
    expect(scorePortalsEl.textContent).toBe('1 event (+10 pts)');
    expect(scoreCombatEl.textContent).toBe('3 victories (+5 pts)');
    expect(scoreLootEl.textContent).toBe('4 finds (+8 pts)');

    expect(dimensionInfoEl.innerHTML).toContain('Stone Expanse');
    expect(dimensionInfoEl.innerHTML).toContain('Gravity ×0.80');
    expect(dimensionInfoEl.innerHTML).toContain('Dimension 2/');
    expect(dimensionInfoEl.dataset.simpleInit).toBe('true');

    expect(experience.updateInventoryUi).toHaveBeenCalled();
    expect(updatePortalProgressSpy).toHaveBeenCalled();
    expect(portalProgressLabel.textContent).toBe(portalSnapshot.progressLabel);
    expect(portalProgressBar.style.setProperty).toHaveBeenCalledWith(
      '--progress',
      portalSnapshot.displayProgress.toFixed(2),
    );
    expect(portalStatusEl.dataset.state).toBe('ready');
    expect(portalStatusEl.getAttribute('aria-label')).toBe(
      `Portal status: ${portalSnapshot.statusLabel}. ${portalSnapshot.statusMessage}`,
    );
    expect(portalStatusStateText.textContent).toBe(portalSnapshot.statusLabel);
    expect(portalStatusDetailText.textContent).toBe(portalSnapshot.statusMessage);
    expect(portalStatusIcon.dataset.state).toBe('ready');
    expect(portalStatusEl.classList.add).toHaveBeenCalledWith('portal-status--flash');
    expect(experience.updateFooterSummary).toHaveBeenCalled();
    expect(experience.publishStateSnapshot).toHaveBeenCalledWith('hud-update');
  });
});
