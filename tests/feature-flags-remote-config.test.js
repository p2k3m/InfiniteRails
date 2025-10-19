import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');

function createClassList() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    toggle: vi.fn(),
    contains: vi.fn(() => false),
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

function createElement(tagName, { ownerDocument, register } = {}) {
  const element = {
    tagName: String(tagName).toUpperCase(),
    ownerDocument: ownerDocument ?? null,
    parentNode: null,
    children: [],
    attributes: {},
    dataset: {},
    style: {},
    classList: createClassList(),
    textContent: '',
    hidden: false,
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
      if (key === 'id' && typeof register === 'function') {
        register(this, String(value));
      }
    },
    getAttribute(name) {
      const key = String(name);
      return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
    },
    removeAttribute(name) {
      const key = String(name);
      if (Object.prototype.hasOwnProperty.call(this.attributes, key)) {
        delete this.attributes[key];
      }
    },
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    closest: vi.fn(() => null),
  };
  return element;
}

function createDocumentStub() {
  const elementsById = new Map();
  const registerElement = (element, id) => {
    if (id) {
      elementsById.set(id, element);
    }
  };

  const documentStub = {
    __elementsById: elementsById,
    createElement(tag) {
      const node = createElement(tag, { ownerDocument: documentStub, register: registerElement });
      return node;
    },
    createElementNS() {
      return createElement('div', { ownerDocument: documentStub, register: registerElement });
    },
    createTextNode(text = '') {
      return { textContent: text };
    },
    createDocumentFragment() {
      return {
        children: [],
        appendChild(child) {
          return appendChildImpl(this, child);
        },
      };
    },
    getElementById(id) {
      return elementsById.get(String(id)) ?? null;
    },
    querySelector(selector) {
      if (selector === '#scoreSyncWarning .score-sync-warning__message') {
        const parent = elementsById.get('scoreSyncWarning');
        if (!parent) {
          return null;
        }
        return parent.children.find((child) => String(child.className || '').includes('score-sync-warning__message')) ?? null;
      }
      if (selector === '#scoreSyncWarning') {
        return elementsById.get('scoreSyncWarning') ?? null;
      }
      return null;
    },
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    visibilityState: 'visible',
  };

  documentStub.body = createElement('body', { ownerDocument: documentStub, register: registerElement });
  documentStub.body.classList = createClassList();
  documentStub.body.appendChild = function appendChild(child) {
    return appendChildImpl(this, child);
  };
  documentStub.body.insertBefore = function insertBefore(child, reference) {
    return insertBeforeImpl(this, child, reference);
  };
  documentStub.body.removeChild = function removeChild(child) {
    return removeChildImpl(this, child);
  };

  documentStub.documentElement = createElement('html', { ownerDocument: documentStub, register: registerElement });
  documentStub.documentElement.classList = createClassList();
  documentStub.documentElement.setAttribute = vi.fn();
  documentStub.documentElement.removeAttribute = vi.fn();

  documentStub.head = createElement('head', { ownerDocument: documentStub, register: registerElement });
  documentStub.defaultView = null;

  return documentStub;
}

function createSandbox(configQueue) {
  const documentStub = createDocumentStub();
  const windowStub = {
    APP_CONFIG: { featureConfigUrl: 'https://config.example/flags', skipAutoBootstrap: true },
    location: {
      href: 'https://example.com/game',
      origin: 'https://example.com',
      protocol: 'https:',
      host: 'example.com',
      hostname: 'example.com',
      search: '',
      hash: '',
      reload: vi.fn(),
      replace: vi.fn(),
    },
    history: { replaceState: vi.fn(), pushState: vi.fn() },
    navigator: { userAgent: 'vitest', webdriver: false, maxTouchPoints: 0 },
    devicePixelRatio: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    document: documentStub,
    console: {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    performance: {
      timeOrigin: Date.now(),
      now: () => 0,
    },
    requestAnimationFrame: vi.fn((cb) => {
      if (typeof cb === 'function') {
        cb(0);
      }
      return 1;
    }),
    cancelAnimationFrame: vi.fn(),
    localStorage: (() => {
      const store = new Map();
      return {
        getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
        setItem: vi.fn((key, value) => {
          store.set(key, String(value));
        }),
        removeItem: vi.fn((key) => {
          store.delete(key);
        }),
      };
    })(),
    crypto: {
      getRandomValues(buffer) {
        const bytes = crypto.randomBytes(buffer.length);
        bytes.forEach((value, index) => {
          // eslint-disable-next-line no-param-reassign
          buffer[index] = value;
        });
        return buffer;
      },
      randomUUID: () => crypto.randomUUID(),
    },
  };

  const fetchPromises = [];
  const responseQueue = Array.isArray(configQueue) ? [...configQueue] : [];

  windowStub.fetch = vi.fn(() => {
    const payload = responseQueue.length ? responseQueue.shift() : {};
    const responsePromise = Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
      headers: { get: () => null },
    });
    fetchPromises.push(responsePromise);
    return responsePromise;
  });

  windowStub.AbortController = globalThis.AbortController;
  windowStub.setTimeout = globalThis.setTimeout;
  windowStub.clearTimeout = globalThis.clearTimeout;

  windowStub.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  windowStub.Event = class Event {
    constructor(type) {
      this.type = type;
    }
  };

  documentStub.defaultView = windowStub;

  const scoreboardStatus = documentStub.createElement('div');
  scoreboardStatus.setAttribute('id', 'scoreboardStatus');
  scoreboardStatus.dataset = {};
  scoreboardStatus.setAttribute('role', 'status');
  documentStub.body.appendChild(scoreboardStatus);

  const scoreSyncWarning = documentStub.createElement('div');
  scoreSyncWarning.setAttribute('id', 'scoreSyncWarning');
  scoreSyncWarning.dataset = {};
  const scoreSyncMessage = documentStub.createElement('span');
  scoreSyncMessage.className = 'score-sync-warning__message';
  scoreSyncWarning.appendChild(scoreSyncMessage);
  documentStub.body.appendChild(scoreSyncWarning);

  const startButton = documentStub.createElement('button');
  startButton.setAttribute('id', 'startButton');
  startButton.dataset = {};
  documentStub.body.appendChild(startButton);

  const canvas = documentStub.createElement('canvas');
  canvas.setAttribute('id', 'gameCanvas');
  canvas.getContext = vi.fn(() => ({ clearRect: vi.fn(), fillRect: vi.fn() }));
  documentStub.body.appendChild(canvas);

  const documentElement = documentStub.documentElement;
  documentElement.appendChild(documentStub.head);
  documentElement.appendChild(documentStub.body);

  const sandbox = {
    window: windowStub,
    document: documentStub,
    globalThis: undefined,
    self: undefined,
    global: undefined,
    console: windowStub.console,
    performance: windowStub.performance,
    fetch: windowStub.fetch,
    AbortController: windowStub.AbortController,
    setTimeout: windowStub.setTimeout,
    clearTimeout: windowStub.clearTimeout,
    Crypto: windowStub.crypto,
  };

  sandbox.window.window = windowStub;
  sandbox.window.self = windowStub;
  sandbox.window.globalThis = windowStub;
  sandbox.window.global = windowStub;

  sandbox.globalThis = windowStub;
  sandbox.self = windowStub;
  sandbox.global = windowStub;

  return { sandbox, windowStub, fetchPromises, scoreboardStatus };
}

async function runScriptWithSandbox(configQueue) {
  const { sandbox, windowStub, fetchPromises, scoreboardStatus } = createSandbox(configQueue);
  const context = vm.createContext(sandbox);
  const script = new vm.Script(scriptSource, { filename: 'script.js' });
  script.runInContext(context);
  await Promise.all(fetchPromises);
  await new Promise((resolve) => setImmediate(resolve));
  return { windowStub, scoreboardStatus };
}

describe('dynamic feature flags remote configuration', () => {
  let initialConsoleInfo;

  beforeEach(() => {
    initialConsoleInfo = console.info;
    console.info = vi.fn();
  });

  afterEach(() => {
    console.info = initialConsoleInfo;
  });

  it('applies remote feature flags to enforce safe mode', async () => {
    const firstConfig = {
      config: {
        features: {
          forceSimpleRenderer: true,
          disableScoreSync: true,
        },
        messages: {
          scoreboard: 'Leaderboard offline for maintenance.',
        },
      },
    };

    const { windowStub, scoreboardStatus } = await runScriptWithSandbox([firstConfig]);

    expect(windowStub.InfiniteRails?.features?.ready()).toBe(true);
    expect(windowStub.InfiniteRails.features.get('forceSimpleRenderer')).toBe(true);
    expect(windowStub.InfiniteRails.features.get('disableScoreSync')).toBe(true);

    expect(windowStub.APP_CONFIG.forceSimpleMode).toBe(true);
    expect(windowStub.APP_CONFIG.enableAdvancedExperience).toBe(false);
    expect(windowStub.APP_CONFIG.preferAdvanced).toBe(false);

    expect(scoreboardStatus.textContent).toBe('Leaderboard offline for maintenance.');
    expect(scoreboardStatus.dataset.offline).toBe('true');

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();
    const identityState = hooks.getFeatureFlagState();
    expect(identityState.flags.forceSimpleRenderer).toBe(true);
    expect(identityState.flags.disableScoreSync).toBe(true);
    expect(identityState.metadata.health).toEqual({
      degraded: true,
      message: 'Leaderboard offline for maintenance.',
    });

    const liveState = hooks.getIdentityState();
    expect(liveState.liveFeaturesSuspended).toBe(true);
  });

  it('restores configuration when remote flags are cleared', async () => {
    const configs = [
      {
        config: {
          features: { forceSimpleRenderer: true, disableScoreSync: true },
          messages: { scoreboard: 'Leaderboard offline for maintenance.' },
        },
      },
      {
        config: {
          features: { forceSimpleRenderer: false, disableScoreSync: false },
        },
      },
    ];

    const { windowStub, scoreboardStatus } = await runScriptWithSandbox(configs);
    const refreshPromise = windowStub.InfiniteRails.features.refresh({ silent: true });
    await refreshPromise;
    await new Promise((resolve) => setImmediate(resolve));

    expect(windowStub.InfiniteRails.features.get('forceSimpleRenderer')).toBe(false);
    expect(windowStub.InfiniteRails.features.get('disableScoreSync')).toBe(false);

    expect(windowStub.APP_CONFIG.forceSimpleMode).toBeUndefined();
    expect(windowStub.APP_CONFIG.enableAdvancedExperience).toBeUndefined();
    expect(windowStub.APP_CONFIG.preferAdvanced).toBeUndefined();

    expect(scoreboardStatus.textContent).toBe(
      'Google Sign-In unavailable — configure APP_CONFIG.googleClientId to enable SSO.',
    );
    expect(scoreboardStatus.dataset.offline).toBeUndefined();

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    const identityState = hooks.getIdentityState();
    expect(identityState.liveFeaturesSuspended).toBe(false);
    const featureSnapshot = hooks.getFeatureFlagState();
    expect(featureSnapshot.metadata.health).toEqual({ degraded: false });
  });

  it('enables safe mode automatically when remote health reports a major outage', async () => {
    const configs = [
      {
        config: {
          health: {
            status: 'major_outage',
            message: 'Services degraded — pausing leaderboard.',
          },
        },
      },
    ];

    const { windowStub, scoreboardStatus } = await runScriptWithSandbox(configs);

    expect(windowStub.InfiniteRails.features.get('forceSimpleRenderer')).toBe(true);
    expect(windowStub.InfiniteRails.features.get('disableScoreSync')).toBe(true);
    expect(scoreboardStatus.textContent).toBe('Services degraded — pausing leaderboard.');
    expect(scoreboardStatus.dataset.offline).toBe('true');

    const metadata = windowStub.InfiniteRails.features.metadata();
    expect(metadata.health).toEqual({
      degraded: true,
      message: 'Services degraded — pausing leaderboard.',
      status: 'major-outage',
    });
  });

  it('restores advanced features when remote health recovers', async () => {
    const configs = [
      {
        config: {
          health: {
            status: 'major_outage',
            message: 'Services degraded — pausing leaderboard.',
          },
        },
      },
      {
        config: {
          health: {
            status: 'operational',
          },
        },
      },
    ];

    const { windowStub, scoreboardStatus } = await runScriptWithSandbox(configs);

    await windowStub.InfiniteRails.features.refresh({ silent: true });
    await new Promise((resolve) => setImmediate(resolve));

    expect(windowStub.InfiniteRails.features.get('forceSimpleRenderer')).toBe(false);
    expect(windowStub.InfiniteRails.features.get('disableScoreSync')).toBe(false);
    expect(scoreboardStatus.textContent).toBe(
      'Google Sign-In unavailable — configure APP_CONFIG.googleClientId to enable SSO.',
    );
    expect(scoreboardStatus.dataset.offline).toBeUndefined();

    const metadata = windowStub.InfiniteRails.features.metadata();
    expect(metadata.health).toEqual({ degraded: false, status: 'operational' });
  });
});
