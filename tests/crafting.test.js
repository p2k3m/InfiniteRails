import { describe, expect, it } from 'vitest';

const {
  createCraftingState,
  craftSequence,
  stackHotbarItem,
  searchRecipes,
  DEFAULT_RECIPES,
  validateCraftAttempt,
} = require('../crafting.js');

describe('crafting system', () => {
  it('crafts a stone pickaxe via drag sequence and unlocks the recipe', () => {
    const state = createCraftingState({
      inventory: { stick: 2, stone: 1 },
      unlockedDimensions: ['origin', 'rock', 'stone'],
    });
    const result = craftSequence(state, ['stick', 'stick', 'stone']);
    expect(result.success).toBe(true);
    expect(result.alert).toBe('Craft success');
    expect(result.recipe.id).toBe('stone-pickaxe');
    expect(result.pointsAwarded).toBe(2);
    expect(state.unlockedRecipes.has('stone-pickaxe')).toBe(true);
    expect(state.knownRecipes.has('stone-pickaxe')).toBe(true);
    expect(state.inventory.get('stone')).toBe(0);
    expect(state.inventory.get('stick')).toBe(0);
    expect(state.inventory.get('stone-pickaxe')).toBe(1);
    expect(state.hotbar.get('stone-pickaxe')).toBe(1);
    expect(state.points).toBe(2);
  });

  it('caps hotbar stacks at 99 when dragging items', () => {
    const state = createCraftingState({ hotbar: { stick: 95 } });
    const updated = stackHotbarItem(state, 'stick', 10);
    expect(updated).toBe(99);
    expect(state.hotbar.get('stick')).toBe(99);
  });

  it('searches recipes with high relevance for stone query', () => {
    const { relevance, matches } = searchRecipes(DEFAULT_RECIPES, 'stone');
    expect(matches.length).toBeGreaterThan(0);
    expect(relevance).toBeGreaterThan(0.8);
  });

  it('identifies order mismatches even when ingredients are present', () => {
    const state = createCraftingState({
      inventory: { stick: 2, stone: 1 },
      unlockedDimensions: ['origin', 'rock', 'stone'],
    });
    const result = craftSequence(state, ['stone', 'stick', 'stick']);
    expect(result.success).toBe(false);
    expect(result.validation?.reason).toBe('order-mismatch');
    expect(result.alert).toBe('Recipe ingredients detected, but the order is incorrect.');
  });

  it('details missing ingredients during validation', () => {
    const state = createCraftingState({
      inventory: { stick: 1 },
      unlockedDimensions: ['origin', 'rock', 'stone'],
    });
    const validation = validateCraftAttempt(state, ['stick', 'stick', 'stone']);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('missing-ingredients');
    expect(Array.isArray(validation.missing)).toBe(true);
    const missingStick = validation.missing.find((entry) => entry.itemId === 'stick');
    expect(missingStick?.missing).toBe(1);
  });

  it('returns visual feedback metadata on successful crafts', () => {
    const state = createCraftingState({
      inventory: { stick: 2, stone: 1 },
      unlockedDimensions: ['origin', 'rock', 'stone'],
    });
    const result = craftSequence(state, ['stick', 'stick', 'stone']);
    expect(result.success).toBe(true);
    expect(result.feedback).toEqual({
      type: 'success',
      visual: 'craft-confetti',
      message: 'Craft success',
    });
  });
});
