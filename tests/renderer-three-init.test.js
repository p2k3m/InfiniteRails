import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');
const simpleExperienceSource = fs.readFileSync(path.join(repoRoot, 'simple-experience.js'), 'utf8');

const ensureThreeStart = scriptSource.indexOf('function ensureThree()');
const ensureThreeEnd = scriptSource.indexOf('function ensureGLTFLoader');
if (ensureThreeStart === -1 || ensureThreeEnd === -1 || ensureThreeEnd <= ensureThreeStart) {
  throw new Error('Failed to locate ensureThree definition in script.js');
}
const ensureThreeSource = scriptSource.slice(ensureThreeStart, ensureThreeEnd);

const loadScriptStart = scriptSource.indexOf('function loadScript(');
const loadScriptEnd = scriptSource.indexOf('const THREE_CDN_URLS', loadScriptStart);
if (loadScriptStart === -1 || loadScriptEnd === -1 || loadScriptEnd <= loadScriptStart) {
  throw new Error('Failed to locate loadScript definition in script.js');
}
const loadScriptSource = scriptSource.slice(loadScriptStart, loadScriptEnd);

function instantiateEnsureThree({ loadScript, cdnUrls = [], documentStub }) {
  const factory = new Function(
    'loadScript',
    'THREE_CDN_URLS',
    'document',
    "'use strict'; let threeLoaderPromise = null;" +
      ensureThreeSource +
      '\n  return { ensureThree, resetLoader: () => { threeLoaderPromise = null; } };'
  );
  return factory(loadScript, cdnUrls, documentStub);
}

function instantiateLoadScript({ documentStub, documentRef = null, globalScopeStub = {} } = {}) {
  const factory = new Function(
    'documentRef',
    'globalScope',
    "'use strict';" + loadScriptSource + '\n  return loadScript;'
  );
  return factory(documentRef, globalScopeStub);
}

describe('loadScript helper', () => {
  let originalDocument;

  beforeEach(() => {
    originalDocument = global.document;
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  it('reuses existing matching script elements without duplicating them', async () => {
    const listeners = {};
    const existingScript = {
      src: 'https://cdn.example.com/three.min.js',
      readyState: 'loading',
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      getAttribute: vi.fn((name) => {
        if (name === 'src') {
          return existingScript.src;
        }
        return null;
      }),
      addEventListener: vi.fn((event, handler) => {
        listeners[event] = handler;
      }),
    };

    const documentStub = {
      baseURI: 'https://game.example/',
      querySelectorAll: vi.fn(() => [existingScript]),
      createElement: vi.fn(() => {
        throw new Error('loadScript should not create a new element when reusing existing scripts.');
      }),
      head: { appendChild: vi.fn() },
      body: null,
      documentElement: null,
    };

    const globalScopeStub = { location: { href: 'https://game.example/' } };
    const loadScript = instantiateLoadScript({
      documentStub,
      documentRef: documentStub,
      globalScopeStub,
    });

    global.document = documentStub;

    const promise = loadScript('https://cdn.example.com/three.min.js');

    expect(documentStub.createElement).not.toHaveBeenCalled();
    expect(existingScript.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
    expect(existingScript.addEventListener).toHaveBeenCalledWith('error', expect.any(Function), { once: true });

    existingScript.readyState = 'complete';
    listeners.load?.();

    const resolved = await promise;
    expect(resolved).toBe(existingScript);
    expect(existingScript.setAttribute).toHaveBeenCalledWith('data-load-script-loaded', 'true');
    expect(existingScript.removeAttribute).toHaveBeenCalledWith('data-load-script-error');
  });

  it('reinserts a script when a previous attempt errored', async () => {
    const createdListeners = {};
    const existingScript = {
      src: 'https://cdn.example.com/three.min.js',
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      getAttribute: vi.fn((name) => {
        if (name === 'src') {
          return existingScript.src;
        }
        if (name === 'data-load-script-error') {
          return 'true';
        }
        return null;
      }),
      addEventListener: vi.fn(),
      remove: vi.fn(),
    };

    const createdScript = {
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        createdListeners[event] = handler;
      }),
      remove: vi.fn(),
    };

    const documentStub = {
      baseURI: 'https://game.example/',
      querySelectorAll: vi.fn(() => [existingScript]),
      createElement: vi.fn(() => createdScript),
      head: { appendChild: vi.fn() },
      body: null,
      documentElement: null,
    };

    const globalScopeStub = { location: { href: 'https://game.example/' } };
    const loadScript = instantiateLoadScript({
      documentStub,
      documentRef: documentStub,
      globalScopeStub,
    });

    global.document = documentStub;

    documentStub.head.appendChild = vi.fn();

    const promise = loadScript('https://cdn.example.com/three.min.js');

    expect(existingScript.remove).toHaveBeenCalledTimes(1);
    expect(documentStub.createElement).toHaveBeenCalledTimes(1);
    expect(documentStub.head.appendChild).toHaveBeenCalledWith(createdScript);

    createdListeners.load?.();

    const resolved = await promise;
    expect(resolved).toBe(createdScript);
    expect(createdScript.setAttribute).toHaveBeenCalledWith('data-load-script-loaded', 'true');
    expect(createdScript.removeAttribute).toHaveBeenCalledWith('data-load-script-error');
  });
});

describe('default renderer Three.js bootstrap', () => {
  let originalWindow;
  let originalDocument;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalWindow = global.window;
    originalDocument = global.document;
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
  });

  it('includes offline and CDN fallbacks for Three.js assets', () => {
    expect(scriptSource).toContain("createAssetUrlCandidates('vendor/three.min.js')");
    expect(scriptSource).toContain("'https://unpkg.com/three@0.161.0/build/three.min.js'");
    expect(scriptSource).toContain("'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.min.js'");
  });

  it('resolves immediately when a global THREE instance already exists', async () => {
    const scope = { THREE: { marker: 'existing' } };
    global.window = scope;

    const documentStub = {
      querySelectorAll: () => [],
      querySelector: () => null,
    };

    const loadScript = vi.fn();
    const { ensureThree, resetLoader } = instantiateEnsureThree({
      loadScript,
      cdnUrls: ['local.js', 'cdn-one.js'],
      documentStub,
    });

    const result = await ensureThree();
    expect(result).toBe(scope.THREE);
    expect(scope.THREE_GLOBAL).toBe(scope.THREE);
    expect(loadScript).not.toHaveBeenCalled();
    resetLoader();
  });

  it('attempts CDN fallbacks sequentially and annotates failures', async () => {
    const scope = {};
    global.window = scope;

    const failingScriptElement = { setAttribute: vi.fn() };
    const documentStub = {
      querySelectorAll: () => [],
      querySelector: () => failingScriptElement,
    };

    const loadScript = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('network error')))
      .mockImplementationOnce(() => {
        scope.THREE = { marker: 'loaded' };
        return Promise.resolve({});
      });

    const cdnUrls = ['vendor/three.min.js', 'https://cdn.example.com/three.min.js'];
    const { ensureThree, resetLoader } = instantiateEnsureThree({
      loadScript,
      cdnUrls,
      documentStub,
    });

    const result = await ensureThree();

    expect(loadScript).toHaveBeenCalledTimes(2);
    expect(loadScript).toHaveBeenNthCalledWith(
      1,
      cdnUrls[0],
      expect.objectContaining({
        'data-three-fallback': 'true',
        'data-three-fallback-index': '0',
      })
    );
    expect(loadScript).toHaveBeenNthCalledWith(
      2,
      cdnUrls[1],
      expect.objectContaining({
        'data-three-fallback': 'true',
        'data-three-fallback-index': '1',
      })
    );
    expect(result).toEqual(scope.THREE);
    expect(scope.THREE_GLOBAL).toBe(scope.THREE);
    expect(failingScriptElement.setAttribute).toHaveBeenCalledWith(
      'data-three-fallback-error',
      'true'
    );
    resetLoader();
  });

  it('awaits ensureThree before bootstrapping the experience', () => {
    expect(scriptSource).toMatch(/ensureThree\(\)\s*\.then\(\(\) => {\s*bootstrap\(\);\s*}\)/);
  });

  it('simple experience pulls THREE from the global scope', () => {
    expect(simpleExperienceSource).toContain('const THREE = window.THREE_GLOBAL || window.THREE;');
  });
});
