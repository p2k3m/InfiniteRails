import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function createCanvasStub() {
  const context2d = {
    fillStyle: '#000000',
    fillRect: () => {},
    drawImage: () => {},
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
  };
  const webglContext = {
    getExtension: () => ({ loseContext: () => {} }),
  };
  return {
    width: 512,
    height: 512,
    clientWidth: 512,
    clientHeight: 512,
    getContext: (type) => {
      if (type === '2d') {
        return context2d;
      }
      return webglContext;
    },
    toDataURL: () => 'data:image/png;base64,',
  };
}

function ensureSimpleExperienceLoaded() {
  if (globalThis.window?.SimpleExperience) {
    return;
  }

  const windowStub = {
    APP_CONFIG: {},
    devicePixelRatio: 1,
    location: { search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    document: {
      createElement: (tag) => {
        if (tag === 'canvas') {
          return createCanvasStub();
        }
        return { getContext: () => null };
      },
      body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
      getElementById: () => null,
      visibilityState: 'visible',
    },
  };

  Object.assign(windowStub, { THREE, THREE_GLOBAL: THREE });

  globalThis.window = windowStub;
  globalThis.document = windowStub.document;
  globalThis.performance = { now: () => Date.now() };
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;

  const scriptSource = fs.readFileSync(path.join(repoRoot, 'simple-experience.js'), 'utf8');
  vm.runInThisContext(scriptSource);
}

beforeAll(() => {
  ensureSimpleExperienceLoaded();
});

describe('simple experience render loop resilience', () => {
  function createExperience() {
    return window.SimpleExperience.create({ canvas: createCanvasStub(), ui: {} });
  }

  it('flags the renderer as unavailable when the draw call throws', () => {
    const experience = createExperience();
    experience.scene = {};
    experience.camera = {};
    experience.renderAccumulator = experience.renderActiveInterval;
    experience.stepSimulation = vi.fn();
    experience.scheduleNextFrame = vi.fn();
    const error = new Error('draw failure');
    experience.renderer = {
      render: vi.fn(() => {
        throw error;
      }),
    };

    const failureSpy = vi.spyOn(experience, 'presentRendererFailure');

    experience.renderFrame(1000);

    expect(failureSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rendering paused'),
      expect.objectContaining({ error, stage: 'render' }),
    );
    expect(experience.rendererUnavailable).toBe(true);
    expect(experience.rendererFailureMessage).toContain('Rendering paused');
    expect(experience.scheduleNextFrame).not.toHaveBeenCalled();
  });

  it('halts the render loop when simulation steps throw', () => {
    const experience = createExperience();
    experience.scene = {};
    experience.camera = {};
    experience.renderAccumulator = experience.renderActiveInterval;
    experience.stepSimulation = vi.fn(() => {
      throw new Error('simulation failure');
    });
    experience.scheduleNextFrame = vi.fn();
    experience.renderer = { render: vi.fn() };

    const failureSpy = vi.spyOn(experience, 'presentRendererFailure');

    experience.renderFrame(1000);

    expect(failureSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rendering paused'),
      expect.objectContaining({ stage: 'simulation' }),
    );
    expect(experience.rendererUnavailable).toBe(true);
    expect(experience.scheduleNextFrame).not.toHaveBeenCalled();
  });
});
