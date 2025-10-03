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

  describe('blank frame detection resilience', () => {
    const SAMPLE_RATIOS = [
      [0.5, 0.5],
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ];

    function setupBlankDetection({ overrides = new Map() } = {}) {
      const experience = createExperience();
      const canvasWidth = 800;
      const canvasHeight = 600;
      const clearColor = { r: 0.25, g: 0.35, b: 0.45 };
      const defaultPixel = {
        r: Math.round(clearColor.r * 255),
        g: Math.round(clearColor.g * 255),
        b: Math.round(clearColor.b * 255),
      };
      const gl = {
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        readPixels: vi.fn((x, y, width, height, format, type, buffer) => {
          const key = `${x},${y}`;
          const override = overrides.get(key);
          const pixel = override || defaultPixel;
          buffer[0] = pixel.r;
          buffer[1] = pixel.g;
          buffer[2] = pixel.b;
          buffer[3] = 255;
        }),
      };
      experience.renderer = {
        domElement: { width: canvasWidth, height: canvasHeight },
        getContext: () => gl,
        getClearColor: () => clearColor,
      };
      experience.presentRendererFailure = vi.fn();
      experience.emitGameEvent = vi.fn();
      experience.renderedFrameCount = 20;
      experience.blankFrameDetectionState = {
        enabled: true,
        samples: 0,
        clearFrameMatches: 0,
        triggered: false,
      };
      const sampleKeys = SAMPLE_RATIOS.map(([rx, ry]) => {
        const x = Math.max(0, Math.min(canvasWidth - 1, Math.round(canvasWidth * rx)));
        const y = Math.max(0, Math.min(canvasHeight - 1, Math.round(canvasHeight * ry)));
        return `${x},${y}`;
      });
      return { experience, gl, sampleKeys };
    }

    it('does not flag blank frames when some samples differ from the clear colour', () => {
      const overrides = new Map();
      const { experience, sampleKeys } = setupBlankDetection({ overrides });
      overrides.set(sampleKeys[1], { r: 0, g: 0, b: 0 });

      for (let i = 0; i < 6; i += 1) {
        experience.evaluateRendererVisibility();
      }

      expect(experience.blankFrameDetectionState.triggered).toBe(false);
      expect(experience.presentRendererFailure).not.toHaveBeenCalled();
    });

    it('flags blank frames only after consistent matches across all samples', () => {
      const { experience } = setupBlankDetection();

      for (let i = 0; i < 3; i += 1) {
        experience.evaluateRendererVisibility();
      }

      expect(experience.blankFrameDetectionState.triggered).toBe(true);
      expect(experience.presentRendererFailure).toHaveBeenCalledWith(
        expect.stringContaining('WebGL output appears blocked'),
        expect.objectContaining({ stage: 'blank-frame' }),
      );
    });
  });
});
