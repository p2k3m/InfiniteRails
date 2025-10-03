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

const ensureSimpleModeStart = scriptSource.indexOf('function ensureSimpleModeQueryParam(');
const ensureSimpleModeEnd = scriptSource.indexOf('function applyRendererReadyState', ensureSimpleModeStart);
if (ensureSimpleModeStart === -1 || ensureSimpleModeEnd === -1 || ensureSimpleModeEnd <= ensureSimpleModeStart) {
  throw new Error('Failed to locate ensureSimpleModeQueryParam definition in script.js');
}
const fallbackStart = scriptSource.indexOf('const DEFAULT_RENDERER_START_TIMEOUT_MS =');
const fallbackEnd = scriptSource.indexOf('function createScoreboardUtilsFallback', fallbackStart);
if (fallbackStart === -1 || fallbackEnd === -1 || fallbackEnd <= fallbackStart) {
  throw new Error('Failed to locate simple fallback bootstrap helpers in script.js');
}

function instantiateSimpleFallback(scope) {
  const ensureSimpleModeSource = scriptSource.slice(ensureSimpleModeStart, ensureSimpleModeEnd);
  const fallbackSource = scriptSource.slice(fallbackStart, fallbackEnd);
  const factory = new Function(
    'scope',
    "'use strict';" +
      'const bootstrap = scope.bootstrap;' +
      'const globalScope = scope;' +
      'const documentRef = scope.documentRef ?? scope.document ?? null;' +
      'const bootstrapOverlay = scope.bootstrapOverlay ?? { showLoading: () => {}, showError: () => {}, setDiagnostic: () => {}, setRecoveryAction: () => {} };' +
      'const isDebugModeEnabled = scope.isDebugModeEnabled ?? (() => false);' +
      ensureSimpleModeSource +
      fallbackSource +
      `
return {
  tryStartSimpleFallback,
  getAttempted: () => simpleFallbackAttempted,
  scheduleRendererStartWatchdog,
  cancelRendererStartWatchdog,
  getRendererStartWatchdogState,
};
`
  );
  return factory(scope);
}

const errorBoundaryStart = scriptSource.indexOf('const ERROR_BOUNDARY_DEFAULTS =');
const errorBoundaryEnd = scriptSource.indexOf('function formatAssetLogLabel', errorBoundaryStart);
if (errorBoundaryStart === -1 || errorBoundaryEnd === -1 || errorBoundaryEnd <= errorBoundaryStart) {
  throw new Error('Failed to locate error boundary helpers in script.js');
}

function instantiateErrorBoundary(scope) {
  const errorBoundarySource = scriptSource.slice(errorBoundaryStart, errorBoundaryEnd);
  const factory = new Function(
    'scope',
    "'use strict';" +
      'const globalScope = scope;' +
      'const presentCriticalErrorOverlay = scope.presentCriticalErrorOverlay ?? (() => {});' +
      'const resolveRendererModeForFallback = scope.resolveRendererModeForFallback ?? (() => null);' +
      'const tryStartSimpleFallback = scope.tryStartSimpleFallback ?? (() => {});' +
      errorBoundarySource +
      '\nreturn { handleErrorBoundary, wasErrorHandledByBoundary };'
  );
  return factory(scope);
}

const originalDocument = global.document;

function createMockDocument() {
  const elementsById = new Map();
  let doc = null;

  function register(node) {
    if (!node) {
      return;
    }
    const id = node.attributes?.id;
    if (typeof id === 'string' && id) {
      elementsById.set(id, node);
    }
  }

  function unregister(node) {
    if (!node) {
      return;
    }
    const id = node.attributes?.id;
    if (typeof id === 'string' && id) {
      elementsById.delete(id);
    }
  }

  function createNode(tagName) {
    const node = {
      tagName: String(tagName || '').toUpperCase(),
      ownerDocument: null,
      parentNode: null,
      children: [],
      attributes: {},
      style: {},
      textContent: '',
      __listeners: {},
      appendChild(child) {
        if (!child || child === this) {
          return child;
        }
        if (child.parentNode && child.parentNode !== this && typeof child.parentNode.removeChild === 'function') {
          child.parentNode.removeChild(child);
        }
        this.children.push(child);
        child.parentNode = this;
        child.ownerDocument = doc;
        register(child);
        return child;
      },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
          this.children.splice(index, 1);
          child.parentNode = null;
          unregister(child);
        }
        return child;
      },
      remove() {
        if (this.parentNode && typeof this.parentNode.removeChild === 'function') {
          this.parentNode.removeChild(this);
        }
      },
      setAttribute(name, value) {
        const key = String(name);
        this.attributes[key] = String(value);
        if (key === 'id') {
          register(this);
        }
      },
      getAttribute(name) {
        const key = String(name);
        return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
      },
      toggleAttribute(name, force) {
        if (force === true) {
          this.setAttribute(name, '');
          return true;
        }
        if (force === false) {
          if (Object.prototype.hasOwnProperty.call(this.attributes, name)) {
            delete this.attributes[name];
          }
          return false;
        }
        if (Object.prototype.hasOwnProperty.call(this.attributes, name)) {
          delete this.attributes[name];
          return false;
        }
        this.setAttribute(name, '');
        return true;
      },
      addEventListener(type, handler) {
        const key = String(type);
        if (!this.__listeners[key]) {
          this.__listeners[key] = [];
        }
        this.__listeners[key].push(handler);
      },
      dispatchEvent(event) {
        const key = String(event?.type || '');
        const listeners = this.__listeners[key] || [];
        listeners.forEach((listener) => {
          if (typeof listener === 'function') {
            listener.call(this, event);
          }
        });
        if (key === 'click' && typeof this.onclick === 'function') {
          this.onclick.call(this, event);
        }
      },
      focus() {
        this.__focused = true;
      },
      querySelector(selector) {
        if (!selector) {
          return null;
        }
        if (selector.startsWith('#')) {
          return doc.getElementById(selector.slice(1));
        }
        for (const child of this.children) {
          const match = child.querySelector(selector);
          if (match) {
            return match;
          }
        }
        return null;
      },
    };
    Object.defineProperty(node, 'id', {
      get() {
        return this.attributes.id || '';
      },
      set(value) {
        if (typeof value === 'string' && value) {
          this.attributes.id = value;
          register(this);
        } else {
          delete this.attributes.id;
          unregister(this);
        }
      },
    });
    Object.defineProperty(node, 'className', {
      get() {
        return this.attributes.class || '';
      },
      set(value) {
        if (typeof value === 'string' && value) {
          this.attributes.class = value;
        } else {
          delete this.attributes.class;
        }
      },
    });
    Object.defineProperty(node, 'innerText', {
      get() {
        return this.textContent;
      },
      set(value) {
        this.textContent = typeof value === 'string' ? value : '';
      },
    });
    return node;
  }

  doc = {
    createElement(tagName) {
      const node = createNode(tagName);
      node.ownerDocument = doc;
      return node;
    },
    getElementById(id) {
      return elementsById.get(id) || null;
    },
  };

  const body = createNode('body');
  body.ownerDocument = doc;
  body.appendChild = function (child) {
    if (!child) {
      return child;
    }
    if (child.parentNode && child.parentNode !== this && typeof child.parentNode.removeChild === 'function') {
      child.parentNode.removeChild(child);
    }
    this.children.push(child);
    child.parentNode = this;
    child.ownerDocument = doc;
    register(child);
    return child;
  };
  body.removeChild = function (child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parentNode = null;
      unregister(child);
    }
    return child;
  };
  body.querySelector = function (selector) {
    if (selector && selector.startsWith('#')) {
      return doc.getElementById(selector.slice(1));
    }
    for (const child of this.children) {
      const match = child.querySelector(selector);
      if (match) {
        return match;
      }
    }
    return null;
  };
  body.setAttribute = function (name, value) {
    this.attributes[String(name)] = String(value);
  };
  body.getAttribute = function (name) {
    return this.attributes[String(name)] ?? null;
  };

  const documentElement = createNode('html');
  documentElement.ownerDocument = doc;
  documentElement.appendChild(body);

  doc.body = body;
  doc.documentElement = documentElement;

  return doc;
}

afterEach(() => {
  if (originalDocument === undefined) {
    delete global.document;
  } else {
    global.document = originalDocument;
  }
  delete global.bootstrapOverlay;
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
    expect(windowStub.__INFINITE_RAILS_RENDERER_MODE__).toBe('simple');
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'WebGL output blocked',
        message: expect.stringContaining('WebGL output is blocked, so Infinite Rails is launching the simplified renderer.'),
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

  it('creates a standalone troubleshooting overlay when the bootstrap overlay is unavailable', () => {
    const mockDocument = createMockDocument();
    const canvasStub = { getContext: () => null };
    const originalCreateElement = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tagName) => {
      if (tagName === 'canvas') {
        return canvasStub;
      }
      return originalCreateElement(tagName);
    };
    global.document = mockDocument;
    const windowStub = {
      location: { search: '' },
      document: mockDocument,
      APP_CONFIG: {
        enableAdvancedExperience: true,
        preferAdvanced: true,
      },
      SimpleExperience: { create: () => ({}) },
      console: { warn: () => {}, error: () => {}, debug: () => {} },
    };
    const { shouldStartSimpleMode } = instantiateShouldStartSimpleMode(windowStub);
    expect(shouldStartSimpleMode()).toBe(true);
    const overlay = mockDocument.getElementById('webglBlockedOverlay');
    expect(overlay).toBeTruthy();
    expect(mockDocument.body.getAttribute('data-webgl-fallback-mode')).toBe('simple');
    expect(overlay.__webglFallback?.troubleshootingSteps).toEqual([
      "Open your browser settings (for example, chrome://settings/system) and enable 'Use hardware acceleration when available.' If the toggle stays disabled, follow the browser help steps at https://support.google.com/chrome/answer/95759.",
      'Disable extensions that block WebGL or force software rendering.',
      'Update your graphics drivers, then restart your browser.',
    ]);
    expect(overlay.__webglFallback?.detail).toMatchObject({
      reason: 'webgl-unavailable',
      fallbackMode: 'simple',
    });
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
    expect(windowStub.__INFINITE_RAILS_RENDERER_MODE__).toBe('simple');
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
        bootstrapOverlay: {
          showLoading: vi.fn(),
          showError: vi.fn(),
          setDiagnostic: vi.fn(),
          setRecoveryAction: vi.fn(),
          state: { mode: 'loading' },
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

    it('updates the URL query and restarts bootstrap when falling back', () => {
      const showLoading = vi.fn();
      const replaceState = vi.fn((state, title, url) => {
        const parsed = new URL(url);
        scope.location.href = parsed.toString();
        scope.location.search = parsed.search;
        scope.location.pathname = parsed.pathname;
        scope.location.hash = parsed.hash;
        scope.location.origin = parsed.origin;
        scope.location.protocol = parsed.protocol;
        scope.location.host = parsed.host;
        scope.location.hostname = parsed.hostname;
      });
      const bootstrap = vi.fn();
      const scope = {
        APP_CONFIG: { enableAdvancedExperience: true, preferAdvanced: true },
        SimpleExperience: { create: () => ({}) },
        console: { warn: () => {}, error: () => {}, debug: () => {} },
        bootstrap,
        history: { state: { foo: 'bar' }, replaceState },
        location: {
          href: 'https://example.com/play?foo=bar',
          origin: 'https://example.com',
          protocol: 'https:',
          host: 'example.com',
          hostname: 'example.com',
          search: '?foo=bar',
          pathname: '/play',
          hash: '',
        },
        bootstrapOverlay: {
          showLoading,
          showError: vi.fn(),
          setDiagnostic: vi.fn(),
          setRecoveryAction: vi.fn(),
          state: { mode: 'error' },
        },
      };
      const { tryStartSimpleFallback } = instantiateSimpleFallback(scope);
      const result = tryStartSimpleFallback(null, { reason: 'renderer-failure', mode: 'advanced' });
      expect(result).toBe(true);
      expect(showLoading).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('simplified renderer fallback') }),
      );
      expect(replaceState).toHaveBeenCalledTimes(1);
      const parsed = new URL(scope.location.href);
      expect(parsed.searchParams.get('mode')).toBe('simple');
      expect(scope.APP_CONFIG.forceSimpleMode).toBe(true);
      expect(scope.APP_CONFIG.enableAdvancedExperience).toBe(false);
      expect(scope.APP_CONFIG.preferAdvanced).toBe(false);
      expect(scope.APP_CONFIG.defaultMode).toBe('simple');
      expect(bootstrap).toHaveBeenCalledTimes(1);
    });

    it('navigates with mode=simple when history state replacement is unavailable', () => {
      const locationReplace = vi.fn();
      const scope = {
        APP_CONFIG: { enableAdvancedExperience: true, preferAdvanced: true },
        SimpleExperience: { create: () => ({}) },
        console: { warn: () => {}, error: () => {}, debug: () => {} },
        bootstrap: vi.fn(),
        location: {
          href: 'https://example.com/play',
          origin: 'https://example.com',
          protocol: 'https:',
          host: 'example.com',
          hostname: 'example.com',
          search: '',
          pathname: '/play',
          hash: '',
          replace: locationReplace,
        },
        bootstrapOverlay: {
          showLoading: vi.fn(),
          showError: vi.fn(),
          setDiagnostic: vi.fn(),
          setRecoveryAction: vi.fn(),
          state: { mode: 'loading' },
        },
      };
      const { tryStartSimpleFallback } = instantiateSimpleFallback(scope);
      const result = tryStartSimpleFallback(null, { reason: 'renderer-failure', mode: 'advanced' });
      expect(result).toBe(true);
      expect(locationReplace).toHaveBeenCalledTimes(1);
      expect(locationReplace.mock.calls[0][0]).toContain('mode=simple');
      expect(scope.APP_CONFIG.forceSimpleMode).toBe(true);
      expect(scope.APP_CONFIG.enableAdvancedExperience).toBe(false);
      expect(scope.APP_CONFIG.preferAdvanced).toBe(false);
      expect(scope.APP_CONFIG.defaultMode).toBe('simple');
      expect(scope.bootstrap).not.toHaveBeenCalled();
    });

    it('automatically switches to simple mode when the advanced start watchdog fires', () => {
      const showLoading = vi.fn();
      const replaceState = vi.fn((state, title, url) => {
        const parsed = new URL(url);
        scope.location.href = parsed.toString();
        scope.location.search = parsed.search;
        scope.location.pathname = parsed.pathname;
        scope.location.hash = parsed.hash;
        scope.location.origin = parsed.origin;
        scope.location.protocol = parsed.protocol;
        scope.location.host = parsed.host;
        scope.location.hostname = parsed.hostname;
      });
      const bootstrap = vi.fn();
      const pendingTimeouts = [];
      const setTimeoutMock = vi.fn((handler, delay) => {
        pendingTimeouts.push(handler);
        return pendingTimeouts.length;
      });
      const clearTimeoutMock = vi.fn();
      const scope = {
        APP_CONFIG: { enableAdvancedExperience: true, preferAdvanced: true },
        SimpleExperience: { create: () => ({}) },
        console: { warn: vi.fn(), error: () => {}, debug: () => {} },
        bootstrap,
        history: { state: { foo: 'bar' }, replaceState },
        location: {
          href: 'https://example.com/play?foo=bar',
          origin: 'https://example.com',
          protocol: 'https:',
          host: 'example.com',
          hostname: 'example.com',
          search: '?foo=bar',
          pathname: '/play',
          hash: '',
        },
        bootstrapOverlay: {
          showLoading,
          showError: vi.fn(),
          setDiagnostic: vi.fn(),
          setRecoveryAction: vi.fn(),
          state: { mode: 'loading' },
        },
        setTimeout: setTimeoutMock,
        clearTimeout: clearTimeoutMock,
      };
      const { scheduleRendererStartWatchdog, getRendererStartWatchdogState } = instantiateSimpleFallback(scope);
      scheduleRendererStartWatchdog('advanced');
      expect(setTimeoutMock).toHaveBeenCalledTimes(1);
      expect(getRendererStartWatchdogState()).toMatchObject({ mode: 'advanced' });
      const [timeoutHandler, timeoutDelay] = setTimeoutMock.mock.calls[0];
      expect(typeof timeoutHandler).toBe('function');
      expect(timeoutDelay).toBeGreaterThan(0);
      timeoutHandler();
      expect(scope.console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Advanced renderer start timed out'),
      );
      expect(scope.APP_CONFIG.forceSimpleMode).toBe(true);
      expect(scope.APP_CONFIG.enableAdvancedExperience).toBe(false);
      expect(scope.APP_CONFIG.preferAdvanced).toBe(false);
      expect(scope.APP_CONFIG.defaultMode).toBe('simple');
      expect(replaceState).toHaveBeenCalledTimes(1);
      expect(bootstrap).toHaveBeenCalledTimes(1);
      expect(getRendererStartWatchdogState()).toMatchObject({ handle: null, mode: null });
    });

    it('returns false when the simple sandbox is unavailable', () => {
      const scope = {
        APP_CONFIG: {},
        console: { warn: () => {}, error: () => {} },
        bootstrap: () => {
          throw new Error('should not be called');
        },
        bootstrapOverlay: {
          showLoading: vi.fn(),
          showError: vi.fn(),
          setDiagnostic: vi.fn(),
          setRecoveryAction: vi.fn(),
          state: { mode: 'error' },
        },
      };
      const { tryStartSimpleFallback, getAttempted } = instantiateSimpleFallback(scope);
      expect(tryStartSimpleFallback(new Error('missing'), { reason: 'no-simple' })).toBe(false);
      expect(getAttempted()).toBe(false);
    });

    it('invokes the fallback bootstrap when a start-error event is emitted', () => {
      const pattern = /addEventListener\('infinite-rails:start-error'[\s\S]*?tryStartSimpleFallback\(/;
      expect(pattern.test(scriptSource)).toBe(true);
    });

    it('invokes the fallback bootstrap when an initialisation-error event is emitted', () => {
      const pattern = /addEventListener\('infinite-rails:initialisation-error'[\s\S]*?tryStartSimpleFallback\(/;
      expect(pattern.test(scriptSource)).toBe(true);
    });
  });

  describe('error boundary fallback integration', () => {
    it('invokes the simple fallback when an error boundary fires in advanced mode', () => {
      const presentCriticalErrorOverlay = vi.fn();
      const tryStartSimpleFallback = vi.fn(() => true);
      const scope = {
        console: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
        presentCriticalErrorOverlay,
        resolveRendererModeForFallback: vi.fn(() => 'advanced'),
        tryStartSimpleFallback,
      };
      const { handleErrorBoundary } = instantiateErrorBoundary(scope);
      const boundaryError = new Error('Renderer exploded');
      handleErrorBoundary(boundaryError, {
        boundary: 'bootstrap',
        detail: { reason: 'renderer-failure', stage: 'init' },
        title: 'Renderer unavailable',
      });
      expect(presentCriticalErrorOverlay).toHaveBeenCalledTimes(1);
      expect(tryStartSimpleFallback).toHaveBeenCalledTimes(1);
      const [fallbackError, fallbackContext] = tryStartSimpleFallback.mock.calls[0];
      expect(fallbackError).toBe(boundaryError);
      expect(fallbackContext).toMatchObject({
        reason: 'renderer-failure',
        boundary: 'bootstrap',
        stage: 'bootstrap',
        mode: 'advanced',
        source: 'error-boundary',
      });
    });

    it('skips the fallback when already operating in simple mode', () => {
      const presentCriticalErrorOverlay = vi.fn();
      const tryStartSimpleFallback = vi.fn();
      const scope = {
        console: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
        presentCriticalErrorOverlay,
        resolveRendererModeForFallback: vi.fn(() => 'simple'),
        tryStartSimpleFallback,
      };
      const { handleErrorBoundary } = instantiateErrorBoundary(scope);
      handleErrorBoundary(new Error('simple failure'), {
        boundary: 'runtime',
        detail: { reason: 'simple-mode-error' },
      });
      expect(presentCriticalErrorOverlay).toHaveBeenCalledTimes(1);
      expect(tryStartSimpleFallback).not.toHaveBeenCalled();
    });
  });
});
