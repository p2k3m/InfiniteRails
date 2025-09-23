import { describe, expect, it } from 'vitest';

const {
  createCraftingState,
  craftSequence,
  stackHotbarItem,
  searchRecipes,
  DEFAULT_RECIPES,
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
});
