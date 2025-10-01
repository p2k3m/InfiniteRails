'use strict';

const HOTBAR_STACK_LIMIT = 99;

const ITEM_LIBRARY = {
  wood: { name: 'Wood', stack: 99 },
  stone: { name: 'Stone Chunk', stack: 99 },
  rock: { name: 'Heavy Rock', stack: 99 },
  'spark-crystal': { name: 'Spark Crystal', stack: 99 },
  tar: { name: 'Tar Sac', stack: 99 },
  'pattern-crystal': { name: 'Pattern Crystal', stack: 99 },
  marble: { name: 'Marble Inlay', stack: 99 },
  netherite: { name: 'Netherite Shard', stack: 99 },
  stick: { name: 'Stick', stack: 99 },
  torch: { name: 'Torch', stack: 20 },
  'stone-pickaxe': { name: 'Stone Pickaxe', stack: 1 },
  'portal-igniter': { name: 'Portal Igniter', stack: 1 },
  'rail-key': { name: 'Rail Key', stack: 1 },
  'tar-blade': { name: 'Tar Blade', stack: 1 },
  'marble-echo': { name: 'Echo Core', stack: 1 },
  'heavy-plating': { name: 'Heavy Plating', stack: 1 },
};

const DEFAULT_RECIPES = [
  {
    id: 'stick',
    name: 'Stick',
    sequence: ['wood'],
    output: { item: 'stick', quantity: 2 },
    unlock: 'origin',
    points: 1,
  },
  {
    id: 'stone-pickaxe',
    name: 'Stone Pickaxe',
    sequence: ['stick', 'stick', 'stone'],
    output: { item: 'stone-pickaxe', quantity: 1 },
    unlock: 'origin',
    points: 2,
  },
  {
    id: 'torch',
    name: 'Torch',
    sequence: ['stick', 'tar'],
    output: { item: 'torch', quantity: 2 },
    unlock: 'rock',
    points: 1,
  },
  {
    id: 'portal-igniter',
    name: 'Portal Igniter',
    sequence: ['tar', 'spark-crystal', 'stick'],
    output: { item: 'portal-igniter', quantity: 1 },
    unlock: 'stone',
    points: 4,
  },
  {
    id: 'rail-key',
    name: 'Rail Key',
    sequence: ['pattern-crystal', 'stick', 'pattern-crystal'],
    output: { item: 'rail-key', quantity: 1 },
    unlock: 'stone',
    points: 3,
  },
  {
    id: 'tar-blade',
    name: 'Tar Blade',
    sequence: ['tar', 'stone', 'tar'],
    output: { item: 'tar-blade', quantity: 1 },
    unlock: 'tar',
    points: 3,
  },
  {
    id: 'marble-echo',
    name: 'Echo Core',
    sequence: ['marble', 'spark-crystal', 'marble'],
    output: { item: 'marble-echo', quantity: 1 },
    unlock: 'marble',
    points: 4,
  },
  {
    id: 'heavy-plating',
    name: 'Heavy Plating',
    sequence: ['rock', 'stone', 'rock'],
    output: { item: 'heavy-plating', quantity: 1 },
    unlock: 'rock',
    points: 2,
  },
];

function normaliseSequence(sequence) {
  if (!Array.isArray(sequence)) {
    throw new TypeError('Crafting sequence must be an array.');
  }
  return sequence.map((item) => String(item).trim().toLowerCase()).join('|');
}

function buildIngredientCount(sequence = []) {
  const tally = new Map();
  sequence.forEach((itemId) => {
    const key = String(itemId).trim().toLowerCase();
    tally.set(key, (tally.get(key) || 0) + 1);
  });
  return tally;
}

function createOrderValidationMap(recipes = DEFAULT_RECIPES) {
  const orderMap = new Map();
  recipes.forEach((recipe) => {
    const key = normaliseSequence(recipe.sequence);
    orderMap.set(key, recipe);
  });
  return orderMap;
}

function mapFromObject(source = {}) {
  return new Map(
    Object.entries(source).map(([key, value]) => [key, Number.isFinite(value) ? value : 0])
  );
}

function mapToObject(map) {
  const result = {};
  for (const [key, value] of map.entries()) {
    result[key] = value;
  }
  return result;
}

function createCraftingState(options = {}) {
  const recipes = options.recipes ? options.recipes.slice() : DEFAULT_RECIPES.slice();
  const orderMap = createOrderValidationMap(recipes);
  const unlockedDimensions = new Set(options.unlockedDimensions || recipes.map((recipe) => recipe.unlock));
  const unlockedRecipes = new Set(options.unlockedRecipes || []);
  const knownRecipes = new Set(options.knownRecipes || []);
  const inventory = mapFromObject(options.inventory || {});
  const hotbar = mapFromObject(options.hotbar || {});
  const points = Number.isFinite(options.points) ? options.points : 0;
  return {
    recipes,
    orderMap,
    unlockedDimensions,
    unlockedRecipes,
    knownRecipes,
    inventory,
    hotbar,
    points,
    lastAlert: options.lastAlert || null,
  };
}

function stackHotbarItem(state, itemId, quantity) {
  if (!state || !state.hotbar) {
    throw new TypeError('A crafting state with a hotbar map is required.');
  }
  const amount = Number(quantity);
  if (!Number.isFinite(amount) || amount <= 0) {
    return state.hotbar.get(itemId) || 0;
  }
  const itemDef = ITEM_LIBRARY[itemId];
  const itemLimit = itemDef ? Math.min(itemDef.stack, HOTBAR_STACK_LIMIT) : HOTBAR_STACK_LIMIT;
  const existing = state.hotbar.get(itemId) || 0;
  const updated = Math.min(itemLimit, existing + amount);
  state.hotbar.set(itemId, updated);
  return updated;
}

function evaluateIngredientAvailability(state, recipe) {
  const required = buildIngredientCount(recipe.sequence);
  const missing = [];
  for (const [itemId, quantity] of required.entries()) {
    const available = state.inventory.get(itemId) || 0;
    if (available < quantity) {
      missing.push({
        itemId,
        required: quantity,
        available,
        missing: quantity - available,
      });
    }
  }
  return {
    hasAll: missing.length === 0,
    missing,
  };
}

function consumeIngredients(state, recipe) {
  recipe.sequence.forEach((itemId) => {
    const available = state.inventory.get(itemId) || 0;
    state.inventory.set(itemId, Math.max(0, available - 1));
  });
}

function addOutputToInventory(state, recipe) {
  const { item, quantity } = recipe.output;
  const existing = state.inventory.get(item) || 0;
  state.inventory.set(item, existing + quantity);
  stackHotbarItem(state, item, quantity);
}

function sequencesShareIngredients(a = [], b = []) {
  if (a.length !== b.length) return false;
  const countA = buildIngredientCount(a);
  const countB = buildIngredientCount(b);
  if (countA.size !== countB.size) return false;
  for (const [itemId, quantity] of countA.entries()) {
    if (countB.get(itemId) !== quantity) {
      return false;
    }
  }
  return true;
}

function validateCraftAttempt(state, sequence) {
  if (!state || !Array.isArray(sequence)) {
    throw new TypeError('Crafting requires a valid state and sequence array.');
  }
  if (sequence.length === 0) {
    return {
      valid: false,
      reason: 'empty-sequence',
      alert: 'Sequence empty. Add materials to craft.',
    };
  }
  const key = normaliseSequence(sequence);
  const recipe = state.orderMap.get(key);
  if (!recipe || !state.unlockedDimensions.has(recipe.unlock)) {
    const unlockedRecipes = state.recipes.filter((entry) =>
      state.unlockedDimensions.has(entry.unlock)
    );
    const ingredientMatch = unlockedRecipes.find((entry) =>
      sequencesShareIngredients(entry.sequence, sequence)
    );
    if (ingredientMatch) {
      return {
        valid: false,
        reason: 'order-mismatch',
        recipe: ingredientMatch,
        alert: 'Recipe ingredients detected, but the order is incorrect.',
      };
    }
    return {
      valid: false,
      reason: 'no-recipe',
      alert: 'Sequence fizzles. No recipe matched.',
    };
  }
  const { hasAll, missing } = evaluateIngredientAvailability(state, recipe);
  if (!hasAll) {
    return {
      valid: false,
      reason: 'missing-ingredients',
      recipe,
      missing,
      alert: 'Missing ingredients for this recipe.',
    };
  }
  return {
    valid: true,
    recipe,
    alert: 'Craft success',
  };
}

function craftSequence(state, sequence) {
  const validation = validateCraftAttempt(state, sequence);
  if (!validation.valid) {
    state.lastAlert = validation.alert;
    return { success: false, alert: state.lastAlert, validation };
  }
  const recipe = validation.recipe;
  consumeIngredients(state, recipe);
  addOutputToInventory(state, recipe);
  state.unlockedRecipes.add(recipe.id);
  state.knownRecipes.add(recipe.id);
  const pointsAwarded = Number.isFinite(recipe.points) ? recipe.points : 1;
  state.points += pointsAwarded;
  state.lastAlert = validation.alert;
  return {
    success: true,
    alert: state.lastAlert,
    recipe,
    pointsAwarded,
    inventory: mapToObject(state.inventory),
    hotbar: mapToObject(state.hotbar),
    points: state.points,
    feedback: {
      type: 'success',
      visual: 'craft-confetti',
      message: state.lastAlert,
    },
  };
}

function recipeMatchesQuery(recipe, query) {
  if (!query) return true;
  const lowered = query.toLowerCase();
  if (recipe.name.toLowerCase().includes(lowered)) return true;
  if ((recipe.output?.item || '').toLowerCase().includes(lowered)) return true;
  return recipe.sequence.some((itemId) => itemId.toLowerCase().includes(lowered));
}

function strongRecipeMatch(recipe, query) {
  const lowered = query.toLowerCase();
  if (recipe.name.toLowerCase().includes(lowered)) return true;
  if ((recipe.output?.item || '').toLowerCase().includes(lowered)) return true;
  return recipe.sequence.some((itemId) => itemId.toLowerCase() === lowered);
}

function searchRecipes(source, query) {
  const recipes = Array.isArray(source) ? source : source.recipes;
  if (!Array.isArray(recipes)) {
    throw new TypeError('A recipe list or crafting state with recipes is required.');
  }
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const matches = recipes.filter((recipe) => recipeMatchesQuery(recipe, normalizedQuery));
  const strongMatches = normalizedQuery
    ? matches.filter((recipe) => strongRecipeMatch(recipe, normalizedQuery)).length
    : matches.length;
  const relevance = matches.length === 0 ? 0 : strongMatches / matches.length;
  return {
    matches,
    relevance,
  };
}

module.exports = {
  HOTBAR_STACK_LIMIT,
  ITEM_LIBRARY,
  DEFAULT_RECIPES,
  createOrderValidationMap,
  createCraftingState,
  stackHotbarItem,
  craftSequence,
  validateCraftAttempt,
  searchRecipes,
};
