import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createExperience, ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

function createHudElement() {
  const attributes = {};
  return {
    innerHTML: '',
    textContent: '',
    dataset: {},
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
  };
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
      },
    });

    experience.updateInventoryUi = vi.fn();
    experience.updatePortalProgress = vi.fn();
    experience.updateFooterSummary = vi.fn();
    vi.spyOn(experience, 'publishStateSnapshot').mockImplementation(() => {});

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
    expect(experience.updatePortalProgress).toHaveBeenCalled();
    expect(experience.updateFooterSummary).toHaveBeenCalled();
    expect(experience.publishStateSnapshot).toHaveBeenCalledWith('hud-update');
  });
});
