import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

function createClassList() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    contains: vi.fn(() => false),
    toggle: vi.fn(),
  };
}

function appendChildImpl(node, child) {
  if (!child || child === node) {
    return child;
  }
  node.children.push(child);
  child.parentNode = node;
  child.ownerDocument = node.ownerDocument;
  return child;
}

function insertBeforeImpl(node, child, reference) {
  if (!child) {
    return child;
  }
  const index = reference ? node.children.indexOf(reference) : -1;
  if (index >= 0) {
    node.children.splice(index, 0, child);
  } else {
    node.children.push(child);
  }
  child.parentNode = node;
  child.ownerDocument = node.ownerDocument;
  return child;
}

function removeChildImpl(node, child) {
  const index = node.children.indexOf(child);
  if (index !== -1) {
    node.children.splice(index, 1);
    child.parentNode = null;
  }
  return child;
}

function createElement(tagName, { ownerDocument } = {}) {
  const element = {
    tagName: String(tagName).toUpperCase(),
    ownerDocument: ownerDocument ?? null,
    parentNode: null,
    children: [],
    style: {
      setProperty: vi.fn(),
      removeProperty: vi.fn(),
    },
    dataset: {},
    attributes: {},
    classList: createClassList(),
    disabled: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    appendChild(child) {
      return appendChildImpl(this, child);
    },
    insertBefore(child, reference) {
      return insertBeforeImpl(this, child, reference);
    },
    removeChild(child) {
      return removeChildImpl(this, child);
    },
    remove() {
      if (this.parentNode?.removeChild) {
        this.parentNode.removeChild(this);
      }
    },
    setAttribute(name, value) {
      const key = String(name);
      this.attributes[key] = String(value);
      if (key === 'id' && this.ownerDocument) {
        this.ownerDocument.__elementsById.set(String(value), this);
      }
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    removeAttribute(name) {
      const key = String(name);
      if (Object.prototype.hasOwnProperty.call(this.attributes, key)) {
        delete this.attributes[key];
      }
    },
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
  };
  return element;
}

function createDocumentStub() {
  const elementsById = new Map();
  const documentStub = {
    __elementsById: elementsById,
    documentElement: createElement('html'),
    body: createElement('body'),
    createElement(tag) {
      const node = createElement(tag, { ownerDocument: documentStub });
      return node;
    },
    getElementById(id) {
      return elementsById.get(String(id)) ?? null;
    },
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    visibilityState: 'visible',
  };
  documentStub.documentElement.ownerDocument = documentStub;
  documentStub.body.ownerDocument = documentStub;
  documentStub.documentElement.classList = createClassList();
  documentStub.body.classList = createClassList();
  documentStub.documentElement.setAttribute = vi.fn();
  documentStub.documentElement.removeAttribute = vi.fn();
  documentStub.documentElement.style = {
    setProperty: vi.fn(),
    removeProperty: vi.fn(),
  };
  documentStub.body.setAttribute = vi.fn();
  documentStub.body.style = {
    setProperty: vi.fn(),
    removeProperty: vi.fn(),
  };
  documentStub.body.appendChild = function appendChild(child) {
    return appendChildImpl(this, child);
  };
  documentStub.body.insertBefore = function insertBefore(child, reference) {
    return insertBeforeImpl(this, child, reference);
  };
  documentStub.body.removeChild = function removeChild(child) {
    return removeChildImpl(this, child);
  };
  return documentStub;
}

function createSandbox() {
  const documentStub = createDocumentStub();
  const startButton = createElement('button', { ownerDocument: documentStub });
  startButton.setAttribute('id', 'startButton');
  const canvas = createElement('canvas', { ownerDocument: documentStub });
  canvas.setAttribute('id', 'gameCanvas');
  documentStub.body.appendChild(startButton);
  documentStub.body.appendChild(canvas);

  let timerCounter = 1;
  const timers = new Map();
  const setTimeoutStub = vi.fn((handler) => {
    const id = timerCounter += 1;
    if (typeof handler === 'function') {
      timers.set(id, handler);
    }
    return id;
  });
  const clearTimeoutStub = vi.fn((id) => {
    timers.delete(id);
  });

  const consoleStub = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const windowStub = {
    document: documentStub,
    documentRef: documentStub,
    location: { href: 'https://example.com/index.html', protocol: 'https:' },
    navigator: { maxTouchPoints: 0, userAgent: 'test-agent' },
    matchMedia: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })),
    visualViewport: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: setTimeoutStub,
    clearTimeout: clearTimeoutStub,
    requestAnimationFrame: vi.fn((cb) => {
      if (typeof cb === 'function') {
        cb(0);
      }
      return 1;
    }),
    cancelAnimationFrame: vi.fn(),
    performance: { now: () => 0 },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    console: consoleStub,
    APP_CONFIG: {},
    __INFINITE_RAILS_TEST_SKIP_BOOTSTRAP__: true,
  };

  documentStub.defaultView = windowStub;

  const sandbox = {
    window: windowStub,
    document: documentStub,
    globalThis: windowStub,
    console: consoleStub,
    setTimeout: setTimeoutStub,
    clearTimeout: clearTimeoutStub,
    performance: windowStub.performance,
    URL,
    URLSearchParams,
  };

  windowStub.window = windowStub;
  windowStub.globalThis = windowStub;

  return { sandbox, documentStub, windowStub, startButton, timers, consoleStub };
}

function evaluateBootstrapScript(sandbox) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const scriptPath = path.resolve(__dirname, '..', 'script.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('simple experience embedded fallback', () => {
  it('recovers from file:// preload failures by enabling the embedded bundle', async () => {
    const { sandbox, windowStub, startButton, consoleStub } = createSandbox();
    const overlay = {
      setDiagnostic: vi.fn(),
      hide: vi.fn(),
      showLoading: vi.fn(),
      showError: vi.fn(),
    };
    sandbox.window.bootstrapOverlay = overlay;

    evaluateBootstrapScript(sandbox);

    const ensureSimpleExperience = windowStub.__INFINITE_RAILS_TEST_HOOKS__?.ensureSimpleExperience;
    expect(typeof ensureSimpleExperience).toBe('function');

    const preloadError = new Error('TypeError: Failed to fetch');
    const preloadRequiredAssets = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(preloadError))
      .mockImplementation(() => Promise.resolve(true));

    const experience = {
      enableStrictAssetValidation: vi.fn(),
      preloadRequiredAssets,
      setIdentity: vi.fn(),
      publishStateSnapshot: vi.fn(),
      start: vi.fn(),
      showFirstRunTutorial: vi.fn(),
      shouldUseEmbeddedModelFallback: vi.fn(() => true),
      collectCriticalModelEntries: vi.fn(() => [{ key: 'steve' }]),
      loadEmbeddedModelFromBundle: vi.fn(() => Promise.resolve({})),
      criticalAssetPreloadPromise: null,
    };

    windowStub.SimpleExperience = { create: vi.fn(() => experience) };

    const result = ensureSimpleExperience('advanced');
    expect(result).toBe(experience);

    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(preloadRequiredAssets).toHaveBeenCalledTimes(2);
    expect(experience.loadEmbeddedModelFromBundle).toHaveBeenCalledWith('steve', expect.objectContaining({ force: true }));
    expect(startButton.disabled).toBe(false);
    expect(startButton.getAttribute('data-preloading')).toBeNull();
    expect(windowStub.__INFINITE_RAILS_RENDERER_MODE__).toBe('advanced');
    expect(windowStub.__INFINITE_RAILS_STATE__?.rendererMode).toBe('advanced');
    expect(windowStub.__INFINITE_RAILS_STATE__?.reason).toBe('embedded-bundle');
    expect(consoleStub.warn).toHaveBeenCalledWith(
      'Critical asset preload failed while running from file://; activating embedded asset bundle.',
      preloadError,
    );
  });
});
