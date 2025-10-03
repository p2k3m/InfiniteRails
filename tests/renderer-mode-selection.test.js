import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');

const simpleModeStart = scriptSource.indexOf('function hasCoarsePointer(');
const start =
  simpleModeStart !== -1 ? simpleModeStart : scriptSource.indexOf('function shouldStartSimpleMode() {');
const end = scriptSource.indexOf('function setupSimpleExperienceIntegrations', start);
if (start === -1 || end === -1 || end <= start) {
  throw new Error('Failed to locate shouldStartSimpleMode definition in script.js');
}
const shouldStartSimpleModeSource = scriptSource.slice(start, end);

function instantiateShouldStartSimpleMode(windowStub) {
  const factory = new Function(
    'window',
    'URLSearchParams',
    "'use strict';" +
      'function queueBootstrapFallbackNotice(key, message) {' +
      '  if (!window.__bootstrapNotices) { window.__bootstrapNotices = []; }' +
      '  window.__bootstrapNotices.push({ key, message });' +
      '}' +
      '\nconst globalScope = window;' +
      '\nconst documentRef = window.document ?? null;' +
      '\nconst document = window.document ?? undefined;' +
      shouldStartSimpleModeSource +
      '\nreturn { shouldStartSimpleMode, runWebglPreflightCheck };'
  );
  return factory(windowStub, URLSearchParams);
}

const fallbackStart = scriptSource.indexOf('let simpleFallbackAttempted = false;');
const fallbackEnd = scriptSource.indexOf('function createScoreboardUtilsFallback', fallbackStart);
if (fallbackStart === -1 || fallbackEnd === -1 || fallbackEnd <= fallbackStart) {
  throw new Error('Failed to locate simple fallback bootstrap helpers in script.js');
}

function instantiateSimpleFallback(scope) {
  const factory = new Function(
    'scope',
    "'use strict';" +
      'const bootstrap = scope.bootstrap;' +
      'const globalScope = scope;' +
      scriptSource.slice(fallbackStart, fallbackEnd) +
      '\nreturn { tryStartSimpleFallback, getAttempted: () => simpleFallbackAttempted };'
  );
  return factory(scope);
}

const originalDocument = global.document;

afterEach(() => {
  if (originalDocument === undefined) {
    delete global.document;
  } else {
    global.document = originalDocument;
  }
});

describe('renderer mode selection', () => {
  it('prefers the advanced renderer when advanced mode is configured', () => {
    const windowStub = {
      location: { search: '' },
      APP_CONFIG: {
        enableAdvancedExperience: true,
        preferAdvanced: true,
        forceAdvanced: true,
      },
      SimpleExperience: { create: () => ({}) },
    };
    const { shouldStartSimpleMode } = instantiateShouldStartSimpleMode(windowStub);
    expect(shouldStartSimpleMode()).toBe(false);
  });

  it('allows overriding to the sandbox renderer via query params', () => {
    const windowStub = {
      location: { search: '?mode=simple' },
      APP_CONFIG: {
        enableAdvancedExperience: true,
        preferAdvanced: true,
        forceAdvanced: true,
      },
      SimpleExperience: { create: () => ({}) },
    };
    const { shouldStartSimpleMode } = instantiateShouldStartSimpleMode(windowStub);
    expect(shouldStartSimpleMode()).toBe(true);
  });

  it('honours APP_CONFIG.forceSimpleMode even when forceAdvanced is true', () => {
    const windowStub = {
      location: { search: '' },
      APP_CONFIG: {
        enableAdvancedExperience: true,
        forceAdvanced: true,
        forceSimpleMode: true,
      },
      SimpleExperience: { create: () => ({}) },
    };
    const { shouldStartSimpleMode } = instantiateShouldStartSimpleMode(windowStub);
    expect(shouldStartSimpleMode()).toBe(true);
  });

  it('falls back to the simple renderer when WebGL support is unavailable', () => {
    const canvasStub = {
      getContext: () => null,
    };
    const showError = vi.fn();
    const setDiagnostic = vi.fn();
    const setRecoveryAction = vi.fn();
    global.document = {
      createElement: (tagName) => {
        if (tagName !== 'canvas') {
          throw new Error(`Unexpected element request: ${tagName}`);
        }
        return canvasStub;
      },
    };
    const windowStub = {
      location: { search: '' },
      APP_CONFIG: {
        enableAdvancedExperience: true,
        preferAdvanced: true,
      },
      SimpleExperience: { create: () => ({}) },
      bootstrapOverlay: {
        showError,
        setDiagnostic,
        setRecoveryAction,
      },
      console: { warn: () => {}, error: () => {} },
    };
    const { shouldStartSimpleMode } = instantiateShouldStartSimpleMode(windowStub);
    expect(shouldStartSimpleMode()).toBe(true);
    expect(windowStub.APP_CONFIG.preferAdvanced).toBe(false);
    expect(windowStub.APP_CONFIG.enableAdvancedExperience).toBe(false);
    expect(windowStub.APP_CONFIG.forceAdvanced).toBe(false);
    expect(windowStub.APP_CONFIG.defaultMode).toBe('simple');
    expect(windowStub.APP_CONFIG.webglSupport).toBe(false);
    expect(windowStub.__bootstrapNotices).toEqual([
      {
        key: 'webgl-unavailable-simple-mode',
        message:
          'WebGL is unavailable on this device, so the mission briefing view is shown instead of the full 3D renderer.',
      },
    ]);
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'WebGL output blocked',
        message: expect.stringContaining('Enable hardware acceleration in your browser settings.'),
      }),
    );
    expect(setDiagnostic).toHaveBeenCalledWith('renderer', {
      status: 'warning',
      message: 'WebGL blocked — launching simplified renderer.',
    });
    expect(setRecoveryAction).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Retry WebGL Renderer',
        action: 'retry-webgl',
      }),
    );
  });

  it('preflights WebGL support at bootstrap and skips the advanced renderer when blocked', () => {
    const canvasStub = {
      getContext: () => null,
    };
    const showError = vi.fn();
    const setDiagnostic = vi.fn();
    const setRecoveryAction = vi.fn();
    global.document = {
      createElement: (tagName) => {
        if (tagName !== 'canvas') {
          throw new Error(`Unexpected element request: ${tagName}`);
        }
        return canvasStub;
      },
    };
    const windowStub = {
      location: { search: '' },
      APP_CONFIG: {
        enableAdvancedExperience: true,
        preferAdvanced: true,
      },
      SimpleExperience: { create: () => ({}) },
      bootstrapOverlay: {
        showError,
        setDiagnostic,
        setRecoveryAction,
      },
      console: { warn: () => {}, error: () => {}, debug: () => {} },
      __INFINITE_RAILS_STATE__: {
        isRunning: false,
        world: [],
        updatedAt: 0,
        reason: 'bootstrap',
      },
    };
    const { runWebglPreflightCheck, shouldStartSimpleMode } = instantiateShouldStartSimpleMode(windowStub);
    const skipAdvanced = runWebglPreflightCheck();
    expect(skipAdvanced).toBe(true);
    expect(windowStub.APP_CONFIG.__webglFallbackApplied).toBe(true);
    expect(windowStub.APP_CONFIG.preferAdvanced).toBe(false);
    expect(windowStub.APP_CONFIG.enableAdvancedExperience).toBe(false);
    expect(windowStub.APP_CONFIG.forceAdvanced).toBe(false);
    expect(windowStub.APP_CONFIG.defaultMode).toBe('simple');
    expect(windowStub.APP_CONFIG.webglSupport).toBe(false);
    expect(windowStub.__bootstrapNotices).toEqual([
      {
        key: 'webgl-unavailable-simple-mode',
        message:
          'WebGL is unavailable on this device, so the mission briefing view is shown instead of the full 3D renderer.',
      },
    ]);
    expect(showError).toHaveBeenCalledTimes(1);
    expect(setDiagnostic).toHaveBeenCalledWith('renderer', {
      status: 'warning',
      message: 'WebGL blocked — launching simplified renderer.',
    });
    expect(setRecoveryAction).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Retry WebGL Renderer',
        action: 'retry-webgl',
      }),
    );
    expect(windowStub.__INFINITE_RAILS_STATE__.reason).toBe('webgl-unavailable');
    expect(windowStub.__INFINITE_RAILS_STATE__.rendererMode).toBe('simple');
    expect(shouldStartSimpleMode()).toBe(true);
    expect(showError).toHaveBeenCalledTimes(1);
  });

  it('falls back to the simple renderer on mobile when advanced mobile support is disabled', () => {
    const matchMediaStub = (query) => ({ matches: query === '(pointer: coarse)' });
    const canvasStub = { getContext: () => ({}) };
    const windowStub = {
      location: { search: '' },
      navigator: { maxTouchPoints: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
      matchMedia: matchMediaStub,
      document: {
        createElement: (tag) => {
          if (tag === 'canvas') {
            return canvasStub;
          }
          return {};
        },
      },
      APP_CONFIG: {
        enableAdvancedExperience: true,
        preferAdvanced: true,
        supportsAdvancedMobile: false,
      },
      SimpleExperience: { create: () => ({}) },
      console: { debug: () => {}, warn: () => {} },
    };
    const { shouldStartSimpleMode } = instantiateShouldStartSimpleMode(windowStub);
    expect(shouldStartSimpleMode()).toBe(true);
    expect(windowStub.APP_CONFIG.enableAdvancedExperience).toBe(false);
    expect(windowStub.APP_CONFIG.preferAdvanced).toBe(false);
    expect(windowStub.APP_CONFIG.forceAdvanced).toBe(false);
    expect(windowStub.APP_CONFIG.defaultMode).toBe('simple');
    expect(windowStub.APP_CONFIG.isMobileEnvironment).toBe(true);
    expect(windowStub.__bootstrapNotices).toEqual([
      {
        key: 'mobile-simple-mode',
        message:
          'Advanced renderer is unavailable on mobile devices — loading the simplified sandbox instead.',
      },
    ]);
  });

  it('keeps the advanced renderer on mobile when explicitly supported', () => {
    const matchMediaStub = (query) => ({ matches: query === '(pointer: coarse)' });
    const canvasStub = { getContext: () => ({}) };
    const windowStub = {
      location: { search: '' },
      navigator: { maxTouchPoints: 3, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X)' },
      matchMedia: matchMediaStub,
      document: {
        createElement: (tag) => {
          if (tag === 'canvas') {
            return canvasStub;
          }
          return {};
        },
      },
      APP_CONFIG: {
        enableAdvancedExperience: true,
        preferAdvanced: true,
        supportsAdvancedMobile: true,
      },
      SimpleExperience: { create: () => ({}) },
    };
    const { shouldStartSimpleMode } = instantiateShouldStartSimpleMode(windowStub);
    expect(shouldStartSimpleMode()).toBe(false);
    expect(windowStub.APP_CONFIG.enableAdvancedExperience).toBe(true);
    expect(windowStub.APP_CONFIG.preferAdvanced).toBe(true);
    expect(windowStub.APP_CONFIG.isMobileEnvironment).toBe(true);
    expect(windowStub.__bootstrapNotices ?? []).toEqual([]);
  });

  describe('simple fallback bootstrap', () => {
    it('forces simple mode and reuses bootstrap when available', () => {
      const calls = [];
      const scope = {
        APP_CONFIG: { enableAdvancedExperience: true, preferAdvanced: true },
        SimpleExperience: { create: () => ({}) },
        console: { warn: () => {}, error: () => {} },
        bootstrap: () => {
          calls.push('boot');
        },
      };
      const { tryStartSimpleFallback, getAttempted } = instantiateSimpleFallback(scope);
      const result = tryStartSimpleFallback(new Error('loader failed'), { reason: 'unit-test' });
      expect(result).toBe(true);
      expect(scope.APP_CONFIG.forceSimpleMode).toBe(true);
      expect(scope.APP_CONFIG.enableAdvancedExperience).toBe(false);
      expect(scope.APP_CONFIG.preferAdvanced).toBe(false);
      expect(scope.APP_CONFIG.defaultMode).toBe('simple');
      expect(calls).toHaveLength(1);
      expect(getAttempted()).toBe(true);

      const secondResult = tryStartSimpleFallback(new Error('loader failed again'), {
        reason: 'unit-test-repeat',
      });
      expect(secondResult).toBe(false);
      expect(calls).toHaveLength(1);
    });

    it('returns false when the simple sandbox is unavailable', () => {
      const scope = {
        APP_CONFIG: {},
        console: { warn: () => {}, error: () => {} },
        bootstrap: () => {
          throw new Error('should not be called');
        },
      };
      const { tryStartSimpleFallback, getAttempted } = instantiateSimpleFallback(scope);
      expect(tryStartSimpleFallback(new Error('missing'), { reason: 'no-simple' })).toBe(false);
      expect(getAttempted()).toBe(false);
    });
  });
});
