import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function createCanvasStub() {
  const loseContextStub = { loseContext: () => {} };
  const webglContext = {
    getExtension: () => loseContextStub,
  };
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
      return {
        tagName: String(tag).toUpperCase(),
        style: {},
        children: [],
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        setAttribute: () => {},
        appendChild(child) {
          this.children.push(child);
        },
        removeChild: () => {},
        innerHTML: '',
        textContent: '',
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    },
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
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
    expect(inventoryModal.setAttribute).toHaveBeenCalledWith('aria-hidden', 'false');
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
});
