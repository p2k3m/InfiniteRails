import { describe, it, expect, vi } from 'vitest';
import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

describe('performance metrics sampling', () => {
  it('logs boot, fps, world generation, and input latency metrics in dev environments', () => {
    const { sandbox, windowStub } = createBootstrapSandbox({
      appConfig: { environment: 'development', diagnosticsEndpoint: 'https://example.test/diag' },
    });

    let now = 0;
    windowStub.performance.now = vi.fn(() => {
      now += 100;
      return now;
    });
    sandbox.performance = windowStub.performance;

    const intervalCallbacks = [];
    windowStub.setInterval = vi.fn((fn) => {
      if (typeof fn === 'function') {
        intervalCallbacks.push(fn);
      }
      return intervalCallbacks.length;
    });
    windowStub.clearInterval = vi.fn();
    windowStub.navigator.sendBeacon = vi.fn(() => true);
    sandbox.fetch = vi.fn();

    evaluateBootstrapScript(sandbox);

    const pointerDownCalls = windowStub.addEventListener.mock.calls.filter(([type]) => type === 'pointerdown');
    expect(pointerDownCalls.length).toBeGreaterThan(0);
    const pointerDownListener = pointerDownCalls[pointerDownCalls.length - 1][1];
    expect(typeof pointerDownListener).toBe('function');

    const fakeExperience = {
      columns: new Map(),
      getDeveloperMetrics: vi.fn(() => ({
        fps: 58,
        models: 0,
        textures: 0,
        audio: 0,
        assets: { pending: 0, failures: 0 },
        scene: { sceneChildren: 0, worldChildren: 0, terrainMeshes: 0, actorCount: 0 },
      })),
      buildTerrain: vi.fn(function buildTerrain() {
        this.columns = new Map([
          ['alpha', new Array(128)],
          ['beta', new Array(96)],
        ]);
      }),
      start: vi.fn(function start() {}),
    };

    windowStub.__INFINITE_RAILS_ACTIVE_EXPERIENCE__ = fakeExperience;

    fakeExperience.buildTerrain();
    fakeExperience.start();

    pointerDownListener({ timeStamp: 0 });

    intervalCallbacks.forEach((callback) => {
      for (let index = 0; index < 5; index += 1) {
        callback();
      }
    });

    const infoCall = windowStub.console.info.mock.calls.find(([message]) =>
      typeof message === 'string' && message.startsWith('Performance metrics'),
    );
    expect(infoCall).toBeDefined();
    const summary = infoCall[0];
    expect(summary).toContain('boot');
    expect(summary).toContain('fps');
    expect(summary).toContain('world');
    expect(summary).toContain('input');

    expect(windowStub.navigator.sendBeacon).toHaveBeenCalled();
    const [, beaconBody] = windowStub.navigator.sendBeacon.mock.calls.at(-1);
    const payload = JSON.parse(beaconBody);
    expect(payload.scope).toBe('performance');
    expect(payload.detail?.analytics).toBe('performance');
    expect(payload.detail?.summary).toContain('fps');
    expect(payload.detail?.metrics?.fps?.sampleCount).toBeGreaterThan(0);
    expect(payload.detail?.metrics?.worldGeneration).not.toBeNull();
    expect(
      (payload.detail?.metrics?.worldGeneration?.voxelsPerSecond ??
        payload.detail?.metrics?.worldGeneration?.columnsPerSecond ??
        null) !== null,
    ).toBe(true);
    expect(payload.detail?.metrics?.inputLatency?.sampleCount).toBeGreaterThan(0);

    expect(fakeExperience.__performanceSamplerAttached).toBe(true);
  });
});
