import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const DefaultWebGL2RenderingContextStub = function WebGL2RenderingContextStub() {};

if (typeof globalThis.WebGL2RenderingContext !== 'function') {
  globalThis.WebGL2RenderingContext = DefaultWebGL2RenderingContextStub;
}

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
  const webglContextPrototype =
    typeof globalThis.WebGL2RenderingContext === 'function'
      ? globalThis.WebGL2RenderingContext.prototype
      : Object.prototype;
  const webglContext = Object.create(webglContextPrototype);
  webglContext.getExtension = () => ({ loseContext: () => {} });
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
  windowStub.WebGL2RenderingContext = globalThis.WebGL2RenderingContext;

  globalThis.THREE_GLOBAL = THREE;
  globalThis.THREE = THREE;

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
  function createExperience(overrides = {}) {
    const options = { canvas: createCanvasStub(), ui: {}, ...overrides };
    if (!options.canvas) {
      options.canvas = createCanvasStub();
    }
    if (!options.ui) {
      options.ui = {};
    }
    return window.SimpleExperience.create(options);
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
    experience.started = true;
    experience.rendererUnavailable = false;

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
    experience.started = true;
    experience.rendererUnavailable = false;

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

  describe('renderer watchdog recovery', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('invokes a renderer reset when the watchdog timer fires', () => {
      const experience = createExperience();
      experience.started = true;
      experience.rendererUnavailable = false;
      experience.renderer = {};
      const resetSpy = vi.spyOn(experience, 'resetRendererSceneGraph').mockReturnValue(true);

      experience.armRendererWatchdog(0);

      vi.advanceTimersByTime(experience.getRendererWatchdogTimeoutMs() + 10);

      expect(resetSpy).toHaveBeenCalledWith(
        'renderer-watchdog',
        expect.objectContaining({ reason: 'stall' }),
      );
    });

    it('stops, disposes, and restarts the renderer during a watchdog reset', () => {
      const experience = createExperience();
      experience.started = true;
      experience.rendererUnavailable = false;
      const stopSpy = vi.spyOn(experience, 'stop').mockImplementation(() => {});
      const disposeSpy = vi
        .spyOn(experience, 'disposeRendererSceneGraph')
        .mockImplementation(() => {});
      const startSpy = vi.spyOn(experience, 'start').mockImplementation(() => {});
      const eventSpy = vi.spyOn(experience, 'emitGameEvent').mockImplementation(() => {});
      const publishSpy = vi.spyOn(experience, 'publishStateSnapshot').mockImplementation(() => {});

      const result = experience.resetRendererSceneGraph('renderer-watchdog', { timeoutMs: 5000 });

      expect(result).toBe(true);
      expect(stopSpy).toHaveBeenCalled();
      expect(disposeSpy).toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalled();
      expect(eventSpy).toHaveBeenCalledWith(
        'renderer-watchdog-reset',
        expect.objectContaining({ reason: 'renderer-watchdog', success: true }),
      );
      expect(publishSpy).toHaveBeenCalledWith('renderer-watchdog-reset');
      expect(experience.rendererWatchdogState.recovering).toBe(false);
    });

    it('resets the renderer when frames stop advancing for the watchdog budget', () => {
      const experience = createExperience({ rendererWatchdogFrameBudget: 3 });
      experience.scene = {};
      experience.camera = {};
      experience.started = true;
      experience.rendererUnavailable = false;
      experience.rendererWatchdogState.frameBudget = 3;
      experience.stepSimulation = vi.fn();
      experience.scheduleNextFrame = vi.fn();
      const resetSpy = vi
        .spyOn(experience, 'resetRendererSceneGraph')
        .mockReturnValue(true);

      const rendererInfo = { render: { frame: 1 } };
      experience.renderer = {
        render: vi.fn(),
        info: rendererInfo,
        domElement: null,
        getContext: vi.fn(() => null),
      };

      const startTimestamp = 1000;
      const frameIntervalMs = experience.renderActiveInterval * 1000;
      for (let i = 0; i < 5; i += 1) {
        experience.renderAccumulator = experience.renderActiveInterval;
        experience.renderFrame(startTimestamp + i * frameIntervalMs);
      }

      expect(resetSpy).toHaveBeenCalledWith(
        'renderer-watchdog',
        expect.objectContaining({ reason: 'unresponsive', stalledFrames: expect.any(Number) }),
      );
      expect(resetSpy).toHaveBeenCalledTimes(1);
    });

    it('resets the renderer after a single stalled frame when configured with a minimal budget', () => {
      const experience = createExperience({ rendererWatchdogFrameBudget: 1 });
      experience.scene = {};
      experience.camera = {};
      experience.started = true;
      experience.rendererUnavailable = false;
      experience.rendererWatchdogState.frameBudget = 1;
      experience.stepSimulation = vi.fn();
      experience.scheduleNextFrame = vi.fn();
      const resetSpy = vi.spyOn(experience, 'resetRendererSceneGraph').mockReturnValue(true);

      const rendererInfo = { render: { frame: 5 } };
      experience.renderer = {
        render: vi.fn(),
        info: rendererInfo,
        domElement: null,
        getContext: vi.fn(() => null),
      };

      experience.renderAccumulator = experience.renderActiveInterval;
      experience.renderFrame(0);

      experience.renderAccumulator = experience.renderActiveInterval;
      experience.renderFrame(16);

      expect(resetSpy).toHaveBeenCalledWith(
        'renderer-watchdog',
        expect.objectContaining({ reason: 'unresponsive', stalledFrames: expect.any(Number) }),
      );
      expect(resetSpy).toHaveBeenCalledTimes(1);
    });

    it('resets the WebGL scene when scheduled frames stop presenting output', () => {
      const canvas = createCanvasStub();
      const experience = createExperience({ rendererWatchdogFrameBudget: 3, canvas });
      experience.scene = {};
      experience.camera = {};
      experience.started = true;
      experience.rendererUnavailable = false;
      experience.rendererWatchdogState.frameBudget = 3;
      experience.stepSimulation = vi.fn();
      experience.isRenderIdle = vi.fn(() => false);
      experience.evaluateRendererVisibility = vi.fn();
      experience.publishStateSnapshot = vi.fn();
      experience.processInputLatencySamples = vi.fn();
      const rendererInfo = { render: { frame: 1 } };
      experience.renderer = {
        render: vi.fn(),
        info: rendererInfo,
        domElement: canvas,
        getContext: canvas.getContext,
      };
      const resetSpy = vi.spyOn(experience, 'resetRendererSceneGraph').mockReturnValue(true);
      const originalRenderFrame = experience.renderFrame.bind(experience);
      const renderFrameSpy = vi.spyOn(experience, 'renderFrame').mockImplementation(function (timestamp) {
        this.renderAccumulator = this.renderActiveInterval;
        return originalRenderFrame(timestamp);
      });

      experience.scheduleNextFrame();

      for (let i = 0; i < 6; i += 1) {
        vi.advanceTimersByTime(16);
      }

      expect(resetSpy).toHaveBeenCalledWith(
        'renderer-watchdog',
        expect.objectContaining({ reason: 'unresponsive', stalledFrames: expect.any(Number) }),
      );
      expect(resetSpy).toHaveBeenCalledTimes(1);

      renderFrameSpy.mockRestore();
    });

    it('resets the renderer when progress timestamps exceed the watchdog budget despite limited samples', () => {
      const experience = createExperience({
        rendererWatchdogFrameBudget: 3,
        rendererWatchdogTargetFps: 60,
      });
      experience.scene = {};
      experience.camera = {};
      experience.started = true;
      experience.rendererUnavailable = false;
      experience.rendererWatchdogState.frameBudget = 3;
      experience.stepSimulation = vi.fn();
      experience.scheduleNextFrame = vi.fn();
      experience.evaluateRendererVisibility = vi.fn();
      experience.publishStateSnapshot = vi.fn();
      experience.processInputLatencySamples = vi.fn();
      const rendererInfo = { render: { frame: 1 } };
      experience.renderer = {
        render: vi.fn(),
        info: rendererInfo,
        domElement: null,
        getContext: vi.fn(() => null),
      };
      const resetSpy = vi.spyOn(experience, 'resetRendererSceneGraph').mockReturnValue(true);

      experience.renderAccumulator = experience.renderActiveInterval;
      experience.renderFrame(0);

      experience.renderAccumulator = experience.renderActiveInterval;
      experience.renderFrame(1000);

      expect(resetSpy).toHaveBeenCalledWith(
        'renderer-watchdog',
        expect.objectContaining({
          reason: 'unresponsive',
          stalledFrames: expect.any(Number),
          elapsedMs: expect.any(Number),
        }),
      );
      expect(resetSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('runtime WebGL2 detection', () => {
    it('disables the renderer when the WebGL2 constructor is missing', () => {
      const experience = createExperience();
      const failureSpy = vi.spyOn(experience, 'presentRendererFailure');
      const eventSpy = vi.spyOn(experience, 'emitGameEvent');
      const originalWindowCtor = window.WebGL2RenderingContext;
      const originalGlobalCtor = globalThis.WebGL2RenderingContext;

      try {
        delete window.WebGL2RenderingContext;
        delete globalThis.WebGL2RenderingContext;

        const supported = experience.verifyWebglSupport();

        expect(supported).toBe(false);
        expect(failureSpy).toHaveBeenCalledWith(
          expect.stringContaining('WebGL2 support is required'),
          expect.objectContaining({
            stage: 'webgl2-probe',
            reason: 'webgl2-unavailable',
            error: expect.objectContaining({ name: 'WebGL2UnavailableError' }),
          }),
        );
        expect(eventSpy).toHaveBeenCalledWith(
          'initialisation-error',
          expect.objectContaining({ errorName: 'WebGL2UnavailableError' }),
        );
      } finally {
        window.WebGL2RenderingContext = originalWindowCtor;
        globalThis.WebGL2RenderingContext = originalGlobalCtor;
      }
    });

    it('reports a renderer failure when a WebGL2 context cannot be created', () => {
      const experience = createExperience();
      const failureSpy = vi.spyOn(experience, 'presentRendererFailure');
      const eventSpy = vi.spyOn(experience, 'emitGameEvent');
      const originalCreateElement = document.createElement;

      try {
        document.createElement = vi.fn(() => ({
          getContext: () => null,
        }));

        const supported = experience.verifyWebglSupport();

        expect(supported).toBe(false);
        expect(failureSpy).toHaveBeenCalledWith(
          expect.stringContaining('WebGL2 support is unavailable'),
          expect.objectContaining({
            stage: 'webgl2-probe',
            reason: 'webgl2-unavailable',
            error: expect.objectContaining({ name: 'WebGL2ContextUnavailable' }),
          }),
        );
        expect(eventSpy).toHaveBeenCalledWith(
          'initialisation-error',
          expect.objectContaining({ errorName: 'WebGL2ContextUnavailable' }),
        );
      } finally {
        document.createElement = originalCreateElement;
      }
    });
  });
});
