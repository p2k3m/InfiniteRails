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

function createExperience() {
  ensureSimpleExperienceLoaded();
  const canvas = createCanvasStub();
  const experience = window.SimpleExperience.create({ canvas, ui: {} });
  experience.canvas = canvas;
  experience.pointerLocked = true;
  experience.pointerLockFallbackActive = false;
  experience.getPointerLockElement = vi.fn(() => canvas);
  experience.beginPointerFallbackDrag = vi.fn();
  experience.updatePointerHintForInputMode = vi.fn();
  experience.attemptPointerLock = vi.fn();
  vi.spyOn(experience, 'renderFrame').mockImplementation(() => {});
  return { experience, canvas };
}

beforeAll(() => {
  ensureSimpleExperienceLoaded();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simple experience input handlers', () => {
  it('mines a block on primary mouse input inside the canvas', () => {
    const { experience, canvas } = createExperience();
    const mineSpy = vi.spyOn(experience, 'mineBlock').mockImplementation(() => {});
    const placeSpy = vi.spyOn(experience, 'placeBlock').mockImplementation(() => {});
    const event = {
      button: 0,
      target: canvas,
      preventDefault: vi.fn(),
    };

    experience.handleMouseDown(event);

    expect(mineSpy).toHaveBeenCalledTimes(1);
    expect(placeSpy).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('places a block on secondary mouse input inside the canvas', () => {
    const { experience, canvas } = createExperience();
    const mineSpy = vi.spyOn(experience, 'mineBlock').mockImplementation(() => {});
    const placeSpy = vi.spyOn(experience, 'placeBlock').mockImplementation(() => {});
    const event = {
      button: 2,
      target: canvas,
      preventDefault: vi.fn(),
    };

    experience.handleMouseDown(event);

    expect(placeSpy).toHaveBeenCalledTimes(1);
    expect(mineSpy).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('honours the place block key binding during keydown events', () => {
    const { experience } = createExperience();
    const placeSpy = vi.spyOn(experience, 'placeBlock').mockImplementation(() => {});
    const binding = experience.keyBindings?.placeBlock?.[0] ?? 'KeyQ';
    const event = {
      code: binding,
      preventDefault: vi.fn(),
      repeat: false,
    };

    experience.handleKeyDown(event);

    expect(placeSpy).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
