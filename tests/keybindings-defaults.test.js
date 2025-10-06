import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';

const DefaultWebGL2RenderingContextStub = function WebGL2RenderingContextStub() {};

if (typeof globalThis.WebGL2RenderingContext !== 'function') {
  globalThis.WebGL2RenderingContext = DefaultWebGL2RenderingContextStub;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function extractDefaultBindings({ source, hotbarConstantName, hotbarCount }) {
  const marker = 'const DEFAULT_KEY_BINDINGS = (() => {';
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error('Failed to locate DEFAULT_KEY_BINDINGS definition.');
  }
  const end = source.indexOf('})();', start);
  if (end === -1) {
    throw new Error('Failed to locate the end of DEFAULT_KEY_BINDINGS definition.');
  }
  const snippet = source.slice(start, end + 5);
  const factory = new Function(
    hotbarConstantName,
    "'use strict';\n" + snippet + '\nreturn DEFAULT_KEY_BINDINGS;',
  );
  return factory(hotbarCount);
}

function loadDeclarativeControlMap() {
  const source = fs.readFileSync(path.join(repoRoot, 'controls.config.js'), 'utf8');
  const scope = {
    APP_CONFIG: {},
    dispatchEvent: () => {},
  };
  const CustomEventStub = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  scope.CustomEvent = CustomEventStub;
  const sandbox = {
    window: scope,
    globalThis: scope,
    CustomEvent: CustomEventStub,
  };
  vm.runInNewContext(source, sandbox, { filename: 'controls.config.js' });
  const map = scope.__INFINITE_RAILS_CONTROL_MAP__;
  if (!map) {
    throw new Error('Declarative control map was not initialised.');
  }
  return map;
}

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
let originalWindow;
let originalDocument;
let originalNavigator;
let originalPerformance;
let originalRequestAnimationFrame;
let originalCancelAnimationFrame;
let originalThreeGlobal;
let originalThree;

function ensureSimpleExperienceLoaded() {
  if (simpleExperienceLoaded) {
    return;
  }

  const documentStub = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return createCanvasStub();
      }
      return { getContext: () => null };
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
  windowStub.WebGL2RenderingContext = globalThis.WebGL2RenderingContext;

  originalWindow = globalThis.window;
  originalDocument = globalThis.document;
  originalNavigator = globalThis.navigator;
  originalPerformance = globalThis.performance;
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  originalThreeGlobal = globalThis.THREE_GLOBAL;
  originalThree = globalThis.THREE;

  globalThis.THREE_GLOBAL = THREE;
  globalThis.THREE = THREE;
  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.navigator = { geolocation: { getCurrentPosition: () => {} } };
  globalThis.performance = { now: () => Date.now() };
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;

  const scriptSource = fs.readFileSync(path.join(repoRoot, 'simple-experience.js'), 'utf8');
  vm.runInThisContext(scriptSource);
  simpleExperienceLoaded = true;
}

function restoreGlobals() {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.navigator = originalNavigator;
  globalThis.performance = originalPerformance;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  globalThis.THREE_GLOBAL = originalThreeGlobal;
  globalThis.THREE = originalThree;
}

function createSimpleExperienceInstance() {
  ensureSimpleExperienceLoaded();
  const canvas = createCanvasStub();
  const experience = window.SimpleExperience.create({ canvas, ui: {} });
  return { experience, canvas };
}

beforeAll(() => {
  ensureSimpleExperienceLoaded();
});

afterEach(() => {
  if (globalThis.window?.SimpleExperience?.destroyAll) {
    try {
      globalThis.window.SimpleExperience.destroyAll();
    } catch (error) {
      // ignore cleanup errors in tests
    }
  }
});

describe('key binding defaults', () => {
  it('provides WASD and action defaults for the advanced experience', () => {
    const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');
    const defaults = extractDefaultBindings({
      source: scriptSource,
      hotbarConstantName: 'HOTBAR_SLOT_COUNT',
      hotbarCount: 10,
    });
    expect(defaults.moveForward).toEqual(['KeyW', 'ArrowUp']);
    expect(defaults.moveBackward).toEqual(['KeyS', 'ArrowDown']);
    expect(defaults.moveLeft).toEqual(['KeyA', 'ArrowLeft']);
    expect(defaults.moveRight).toEqual(['KeyD', 'ArrowRight']);
    expect(defaults.jump).toEqual(['Space']);
    expect(defaults.interact).toEqual(['KeyF']);
    expect(defaults.resetPosition).toEqual(['KeyT']);
    expect(defaults.placeBlock).toEqual(['KeyQ']);
    expect(defaults.toggleCameraPerspective).toEqual(['KeyV']);
    expect(defaults.toggleCrafting).toEqual(['KeyE']);
    expect(defaults.toggleInventory).toEqual(['KeyI']);
    expect(defaults.openGuide).toEqual(['F1']);
    expect(defaults.toggleTutorial).toEqual(['Slash', 'F4']);
    expect(defaults.toggleDeveloperOverlay).toEqual(['Backquote', 'F8']);
    expect(defaults.openSettings).toEqual(['F2']);
    expect(defaults.openLeaderboard).toEqual(['F3']);
    expect(defaults.closeMenus).toEqual(['Escape']);
    expect(defaults.buildPortal).toEqual(['KeyR']);
  });

  it('provides matching defaults for the simple experience', () => {
    const simpleSource = fs.readFileSync(path.join(repoRoot, 'simple-experience.js'), 'utf8');
    const defaults = extractDefaultBindings({
      source: simpleSource,
      hotbarConstantName: 'HOTBAR_SLOTS',
      hotbarCount: 10,
    });
    expect(defaults.moveForward).toEqual(['KeyW', 'ArrowUp']);
    expect(defaults.moveBackward).toEqual(['KeyS', 'ArrowDown']);
    expect(defaults.moveLeft).toEqual(['KeyA', 'ArrowLeft']);
    expect(defaults.moveRight).toEqual(['KeyD', 'ArrowRight']);
    expect(defaults.jump).toEqual(['Space']);
    expect(defaults.interact).toEqual(['KeyF']);
    expect(defaults.resetPosition).toEqual(['KeyT']);
    expect(defaults.placeBlock).toEqual(['KeyQ']);
    expect(defaults.toggleCameraPerspective).toEqual(['KeyV']);
    expect(defaults.toggleCrafting).toEqual(['KeyE']);
    expect(defaults.toggleInventory).toEqual(['KeyI']);
    expect(defaults.openGuide).toEqual(['F1']);
    expect(defaults.toggleTutorial).toEqual(['Slash', 'F4']);
    expect(defaults.toggleDeveloperOverlay).toEqual(['Backquote', 'F8']);
    expect(defaults.openSettings).toEqual(['F2']);
    expect(defaults.openLeaderboard).toEqual(['F3']);
    expect(defaults.closeMenus).toEqual(['Escape']);
    expect(defaults.buildPortal).toEqual(['KeyR']);
  });
});

describe('declarative control map configuration', () => {
  it('exposes the default control map via configuration script', () => {
    const map = loadDeclarativeControlMap();
    expect(map.moveForward).toEqual(['KeyW', 'ArrowUp']);
    expect(map.moveBackward).toEqual(['KeyS', 'ArrowDown']);
    expect(map.moveLeft).toEqual(['KeyA', 'ArrowLeft']);
    expect(map.moveRight).toEqual(['KeyD', 'ArrowRight']);
    expect(map.jump).toEqual(['Space']);
    expect(map.interact).toEqual(['KeyF']);
    expect(map.buildPortal).toEqual(['KeyR']);
    expect(map.resetPosition).toEqual(['KeyT']);
    expect(map.placeBlock).toEqual(['KeyQ']);
    expect(map.toggleCameraPerspective).toEqual(['KeyV']);
    expect(map.toggleCrafting).toEqual(['KeyE']);
    expect(map.toggleInventory).toEqual(['KeyI']);
    expect(map.openGuide).toEqual(['F1']);
    expect(map.toggleTutorial).toEqual(['Slash', 'F4']);
    expect(map.toggleDeveloperOverlay).toEqual(['Backquote', 'F8']);
    expect(map.openSettings).toEqual(['F2']);
    expect(map.openLeaderboard).toEqual(['F3']);
    expect(map.closeMenus).toEqual(['Escape']);
  });

  it('keeps runtime defaults aligned with the declarative map', () => {
    const declarativeMap = loadDeclarativeControlMap();
    const defaults = window.SimpleExperience.controlMap.defaults();
    expect(defaults).toEqual(declarativeMap);
  });

  it('notifies subscribers when the control map changes', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'controls.config.js'), 'utf8');
    const scope = {
      APP_CONFIG: {},
      dispatchEvent: () => {},
      CustomEvent: class CustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      },
      console: { debug: () => {} },
    };
    const sandbox = { window: scope, globalThis: scope, CustomEvent: scope.CustomEvent };
    vm.runInNewContext(source, sandbox, { filename: 'controls.config.js' });

    const notifications = [];
    const unsubscribe = scope.InfiniteRailsControls.subscribe((map) => {
      notifications.push(map);
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].jump).toEqual(['Space']);

    scope.InfiniteRailsControls.apply({ jump: ['KeyJ'] });
    expect(notifications).toHaveLength(2);
    expect(notifications[1].jump).toEqual(['KeyJ']);

    unsubscribe();
    scope.InfiniteRailsControls.apply({ jump: ['Space'] });
    expect(notifications).toHaveLength(2);
  });
});

describe('simple experience key remapping', () => {
  it('allows remapping and resetting key bindings', () => {
    const { experience } = createSimpleExperienceInstance();
    const initial = experience.getKeyBindings().moveForward;
    expect(initial).toEqual(['KeyW', 'ArrowUp']);

    const changed = experience.setKeyBinding('moveForward', ['KeyZ'], { persist: false });
    expect(changed).toBe(true);
    expect(experience.getKeyBindings().moveForward).toEqual(['KeyZ']);

    const reset = experience.setKeyBinding('moveForward', [], { persist: false });
    expect(reset).toBe(true);
    expect(experience.getKeyBindings().moveForward).toEqual(['KeyW', 'ArrowUp']);

    if (typeof experience.destroy === 'function') {
      experience.destroy();
    }
  });

  it('applies declarative control map updates at runtime', () => {
    const { experience } = createSimpleExperienceInstance();
    expect(experience.getKeyBindings().jump).toEqual(['Space']);

    const applied = window.SimpleExperience.controlMap.apply({ jump: ['KeyJ'] });
    expect(applied).not.toBeNull();
    expect(window.SimpleExperience.controlMap.get().jump).toEqual(['KeyJ']);
    expect(experience.getKeyBindings().jump).toEqual(['KeyJ']);

    window.SimpleExperience.controlMap.reset();
    expect(window.SimpleExperience.controlMap.get().jump).toEqual(['Space']);
    expect(experience.getKeyBindings().jump).toEqual(['Space']);

    if (typeof experience.destroy === 'function') {
      experience.destroy();
    }
  });
});

afterAll(() => {
  restoreGlobals();
});
