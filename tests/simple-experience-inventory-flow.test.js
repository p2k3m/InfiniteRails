import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const DefaultWebGL2RenderingContextStub = function WebGL2RenderingContextStub() {};

if (typeof globalThis.WebGL2RenderingContext !== 'function') {
  globalThis.WebGL2RenderingContext = DefaultWebGL2RenderingContextStub;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function createCanvasStub() {
  const loseContextStub = { loseContext: () => {} };
  const webglContextPrototype =
    typeof globalThis.WebGL2RenderingContext === 'function'
      ? globalThis.WebGL2RenderingContext.prototype
      : Object.prototype;
  const webglContext = Object.create(webglContextPrototype);
  webglContext.getExtension = () => loseContextStub;
  const context2d = {
    fillStyle: '#000000',
    fillRect: () => {},
    drawImage: () => {},
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
  };
  const canvas = {
    width: 512,
    height: 512,
    clientWidth: 512,
    clientHeight: 512,
    style: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    focus: () => {},
    requestPointerLock: () => ({ catch: () => {} }),
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
    toDataURL: () => 'data:image/png;base64,',
    getContext: (type) => {
      if (type === '2d') {
        return context2d;
      }
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return webglContext;
      }
      return null;
    },
  };
  canvas.contains = (target) => target === canvas;
  return canvas;
}

let simpleExperienceLoaded = false;

function ensureSimpleExperienceLoaded() {
  if (simpleExperienceLoaded) {
    return;
  }

  const documentStub = {
    createElement: (tag) => {
      if (String(tag).toLowerCase() === 'canvas') {
        return createCanvasStub();
      }
      const element = {
        tagName: String(tag).toUpperCase(),
        style: {},
        className: '',
        children: [],
        attributes: {},
        dataset: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        getAttribute(name) {
          return this.attributes[name];
        },
        removeAttribute(name) {
          delete this.attributes[name];
        },
        appendChild(child) {
          if (child && child.isFragment && Array.isArray(child.children)) {
            child.children.forEach((node) => {
              this.children.push(node);
            });
            return child;
          }
          this.children.push(child);
          return child;
        },
        removeChild(child) {
          this.children = this.children.filter((node) => node !== child);
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        focus: () => {},
        closest: () => null,
      };
      Object.defineProperty(element, 'innerHTML', {
        get() {
          return this._innerHTML || '';
        },
        set(value) {
          this._innerHTML = value;
          if (value === '') {
            this.children = [];
          }
        },
      });
      Object.defineProperty(element, 'textContent', {
        get() {
          return this._textContent || '';
        },
        set(value) {
          this._textContent = value;
        },
      });
      return element;
    },
    createDocumentFragment: () => ({
      isFragment: true,
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
    }),
    body: {
      classList: { contains: () => false, add: () => {}, remove: () => {} },
      appendChild: () => {},
    },
    getElementById: () => null,
    querySelector: () => null,
  };

  const windowStub = {
    APP_CONFIG: {},
    devicePixelRatio: 1,
    location: { search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    document: documentStub,
    dispatchEvent: () => {},
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
  };

  Object.assign(windowStub, { THREE, THREE_GLOBAL: THREE });
  windowStub.WebGL2RenderingContext = globalThis.WebGL2RenderingContext;

  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.navigator = { geolocation: { getCurrentPosition: () => {} } };
  globalThis.performance = { now: () => Date.now() };
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;
  globalThis.CustomEvent = windowStub.CustomEvent;

  const scriptSource = fs.readFileSync(path.join(repoRoot, 'simple-experience.js'), 'utf8');
  vm.runInThisContext(scriptSource);
  simpleExperienceLoaded = true;
}

function createExperience(options = {}) {
  ensureSimpleExperienceLoaded();
  const canvas = createCanvasStub();
  const experience = window.SimpleExperience.create({ canvas, ui: {}, ...options });
  experience.canvas = canvas;
  experience.pointerLocked = true;
  experience.pointerLockFallbackActive = false;
  experience.getPointerLockElement = vi.fn(() => canvas);
  experience.beginPointerFallbackDrag = vi.fn();
  experience.updatePointerHintForInputMode = vi.fn();
  experience.attemptPointerLock = vi.fn();
  vi.spyOn(experience, 'renderFrame').mockImplementation(() => {});
  return experience;
}

function createTrackedElement(tag = 'div') {
  ensureSimpleExperienceLoaded();
  const element = document.createElement(tag);
  const originalSetAttribute = element.setAttribute?.bind(element);
  const originalToggleAttribute = typeof element.toggleAttribute === 'function' ? element.toggleAttribute.bind(element) : null;
  if (originalSetAttribute) {
    element.setAttribute = vi.fn((name, value) => {
      originalSetAttribute(name, value);
    });
  }
  element.toggleAttribute = vi.fn((name, force) => {
    if (originalToggleAttribute) {
      return originalToggleAttribute(name, force);
    }
    const shouldSet = force === undefined ? !element.hasAttribute(name) : Boolean(force);
    if (shouldSet) {
      element.setAttribute(name, '');
      return true;
    }
    element.removeAttribute(name);
    return false;
  });
  return element;
}

beforeAll(() => {
  ensureSimpleExperienceLoaded();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simple experience inventory and crafting flows', () => {
  it('opens the inventory modal and updates button state', () => {
    const experience = createExperience();
    const preventDefault = vi.fn();
    const updateModalSpy = vi.spyOn(experience, 'updateInventoryModal').mockImplementation(() => {});
    const inventoryModal = {
      hidden: true,
      setAttribute: vi.fn(),
      toggleAttribute: vi.fn(),
    };
    const inventorySortButton = { setAttribute: vi.fn() };
    const openButton = { tagName: 'BUTTON', textContent: 'Open Inventory', setAttribute: vi.fn() };

    experience.canvas.focus = vi.fn();
    experience.inventoryModal = inventoryModal;
    experience.inventorySortButton = inventorySortButton;
    experience.openInventoryButtons = [openButton];

    experience.handleInventoryToggle({ preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(inventoryModal.hidden).toBe(false);
    expect(inventoryModal.toggleAttribute).toHaveBeenCalledWith('inert', false);
    expect(updateModalSpy).toHaveBeenCalledTimes(1);
    expect(inventorySortButton.setAttribute).toHaveBeenCalledWith('aria-pressed', 'false');
    expect(openButton.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');
    expect(openButton.textContent).toBe('Close Inventory');
  });

  it('adds mined items to the hotbar and consumes them when placing', () => {
    const experience = createExperience();
    const updateSpy = vi.spyOn(experience, 'updateInventoryUi').mockImplementation(() => {});

    experience.hotbar = experience.hotbar.map(() => ({ item: null, quantity: 0 }));
    experience.satchel.clear();
    experience.selectedHotbarIndex = 0;

    const added = experience.addItemToInventory('stone', 2);

    expect(added).toBe(true);
    expect(experience.hotbar[0].item).toBe('stone');
    expect(experience.hotbar[0].quantity).toBe(2);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    const placed = experience.useSelectedItem({ allow: new Set(['stone']) });

    expect(placed).toBe('stone');
    expect(experience.hotbar[0].quantity).toBe(1);
    expect(updateSpy).toHaveBeenCalledTimes(2);
  });

  it('opens the crafting modal when the toggle key is pressed', () => {
    const craftingModal = createTrackedElement('div');
    craftingModal.hidden = true;

    const craftLauncherButton = { setAttribute: vi.fn() };

    const experience = createExperience({
      ui: {
        craftingModal,
        craftLauncherButton,
      },
    });

    document.exitPointerLock = vi.fn();
    const refreshSpy = vi.spyOn(experience, 'refreshCraftingUi').mockImplementation(() => {});
    const preventDefault = vi.fn();

    experience.handleKeyDown({ code: 'KeyE', preventDefault, repeat: false });

    expect(preventDefault).toHaveBeenCalled();
    expect(craftingModal.hidden).toBe(false);
    expect(craftingModal.toggleAttribute).toHaveBeenCalledWith('inert', false);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(craftLauncherButton.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');
    expect(document.exitPointerLock).toHaveBeenCalledTimes(1);
  });

  it('displays unlocked crafting recipes and tooltips inside the helper overlay', () => {
    const craftingModal = createTrackedElement('div');
    const craftSequenceEl = document.createElement('div');
    craftSequenceEl.dataset.slotCount = '3';
    const craftingInventoryEl = document.createElement('div');
    const craftSuggestionsEl = document.createElement('div');
    const craftButton = document.createElement('button');
    const craftingHelperEl = document.createElement('section');
    const craftingHelperTitleEl = document.createElement('h3');
    const craftingHelperDescriptionEl = document.createElement('p');
    const craftingHelperMatchesEl = document.createElement('ul');

    const experience = createExperience({
      ui: {
        craftingModal,
        craftSequenceEl,
        craftingInventoryEl,
        craftSuggestionsEl,
        craftButton,
        craftingHelperEl,
        craftingHelperTitleEl,
        craftingHelperDescriptionEl,
        craftingHelperMatchesEl,
      },
    });

    experience.craftingState.sequence = [];
    experience.craftingState.unlocked.clear();
    experience.craftingRecipes.forEach((recipe, key) => {
      experience.craftingState.unlocked.set(key, recipe);
    });

    experience.updateCraftingSequenceUi();
    experience.updateCraftingHelperOverlay();

    expect(craftSequenceEl.children.length).toBe(3);
    expect(craftSequenceEl.children[0].getAttribute('data-hint')).toBe('Empty slot — drop an ingredient here.');
    expect(craftingHelperTitleEl.textContent).toBe('Recipe Helper');
    expect(craftingHelperDescriptionEl.textContent).toBe(
      'Select an unlocked recipe to auto-fill the crafting circle.',
    );
    expect(craftingHelperMatchesEl.children.length).toBe(2);
    const matchSummaries = craftingHelperMatchesEl.children.map((child) => child.textContent);
    expect(matchSummaries).toEqual([
      'Stone Pickaxe — Stick → Stick → Stone Brick • +2 pts',
      'Portal Charge — Stone Brick → Stone Brick → Grass Block • +4 pts',
    ]);
    expect(craftingHelperEl.dataset.state).toBe('idle');
    expect(craftingHelperMatchesEl.getAttribute('data-empty')).toBe('false');
  });

  it('greys out inventory entries and recipes when visuals are missing', () => {
    const inventoryGridEl = document.createElement('div');
    const craftingInventoryEl = document.createElement('div');
    const craftSuggestionsEl = document.createElement('ul');

    const experience = createExperience({
      ui: {
        inventoryGridEl,
        craftingInventoryEl,
        craftSuggestionsEl,
      },
    });

    experience.craftingState.unlocked.clear();
    experience.craftingRecipes.forEach((recipe, key) => {
      experience.craftingState.unlocked.set(key, recipe);
    });

    experience.hotbar = experience.hotbar.map(() => ({ item: null, quantity: 0 }));
    experience.hotbar[0] = { item: 'stone', quantity: 3 };
    experience.textureFallbackMissingKeys.add('stone');

    experience.updateInventoryModal();
    expect(inventoryGridEl.children.length).toBeGreaterThan(0);
    const inventoryCell = inventoryGridEl.children[0];
    expect(inventoryCell.dataset.visual).toBe('missing');
    expect(inventoryCell.dataset.visualSummary).toContain('stone');
    expect(inventoryCell.innerHTML).toContain('Missing');

    experience.updateCraftingInventoryUi();
    expect(craftingInventoryEl.children.length).toBeGreaterThan(0);
    const craftingButton = craftingInventoryEl.children[0];
    expect(craftingButton.dataset.visual).toBe('missing');
    expect(craftingButton.dataset.visualSummary).toContain('stone');
    expect(craftingButton.innerHTML).toContain('Missing');

    experience.updateCraftingSuggestions();
    expect(craftSuggestionsEl.children.length).toBeGreaterThan(0);
    const suggestionItem = craftSuggestionsEl.children[0];
    const suggestionButton = suggestionItem.children[0];
    expect(suggestionButton.dataset.visual).toBe('missing');
    expect(suggestionButton.dataset.visualSummary).toContain('Missing texture');
    expect(suggestionButton.textContent).toContain('Missing texture');
  });

  it('dispatches a recipe-crafted event when crafting succeeds', () => {
    const experience = createExperience();

    vi.spyOn(experience, 'updateInventoryUi').mockImplementation(() => {});
    vi.spyOn(experience, 'refreshCraftingUi').mockImplementation(() => {});
    vi.spyOn(experience, 'updateHud').mockImplementation(() => {});
    vi.spyOn(experience, 'scheduleScoreSync').mockImplementation(() => {});
    vi.spyOn(experience, 'showHint').mockImplementation(() => {});
    vi.spyOn(experience, 'addScoreBreakdown').mockImplementation(() => {});
    vi.spyOn(experience, 'savePersistentUnlocks').mockImplementation(() => {});
    experience.audio = { play: vi.fn() };

    const recipeKey = 'stick,stick,stone';
    const recipe = experience.craftingRecipes.get(recipeKey);
    expect(recipe).toBeTruthy();

    experience.hotbar = experience.hotbar.map(() => ({ item: null, quantity: 0 }));
    experience.hotbar[0] = { item: 'stick', quantity: 2 };
    experience.hotbar[1] = { item: 'stone', quantity: 1 };
    experience.satchel.clear();

    experience.craftingState.sequence = ['stick', 'stick', 'stone'];

    const eventSpy = vi.spyOn(experience, 'emitGameEvent').mockImplementation(() => {});

    experience.handleCraftButton();

    expect(eventSpy).toHaveBeenCalledWith(
      'recipe-crafted',
      expect.objectContaining({
        recipeId: recipe.id,
        recipeKey,
        scoreAwarded: recipe.score,
        sequence: ['stick', 'stick', 'stone'],
      }),
    );
    expect(experience.scheduleScoreSync).toHaveBeenCalledWith('recipe-crafted');
    expect(experience.getInventoryCountForItem(recipe.id)).toBeGreaterThanOrEqual(1);
  });

  it('restores inventory and vitals immediately after a respawn', () => {
    const experience = createExperience();

    experience.maxHealth = 14;
    experience.playerBreathCapacity = 18;

    experience.hotbar = experience.hotbar.map(() => ({ item: null, quantity: 0 }));
    experience.hotbar[0] = { item: 'stone', quantity: 3 };
    experience.hotbar[1] = { item: 'stick', quantity: 1 };
    experience.satchel.clear();
    experience.satchel.set('stone', 5);
    experience.satchel.set('portal-charge', 2);
    experience.selectedHotbarIndex = 1;

    experience.captureRespawnInventorySnapshot();

    const updateInventorySpy = vi.spyOn(experience, 'updateInventoryUi').mockImplementation(() => {});
    const updateHudSpy = vi.spyOn(experience, 'updateHud').mockImplementation(() => {});

    experience.hotbar.forEach((slot) => {
      slot.item = null;
      slot.quantity = 0;
    });
    experience.satchel.clear();
    experience.selectedHotbarIndex = 0;
    experience.health = 0;
    experience.playerBreath = 0;

    experience.handleDefeat();

    expect(experience.health).toBe(14);
    expect(experience.playerBreath).toBe(18);
    expect(experience.hotbar[0]).toEqual({ item: 'stone', quantity: 3 });
    expect(experience.hotbar[1]).toEqual({ item: 'stick', quantity: 1 });
    expect(experience.satchel.get('stone')).toBe(5);
    expect(experience.satchel.get('portal-charge')).toBe(2);
    expect(experience.selectedHotbarIndex).toBe(1);
    expect(updateInventorySpy).toHaveBeenCalled();
    expect(updateHudSpy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'respawn' }));
  });
});
