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
const loadScriptEnd = scriptSource.indexOf('const THREE_SCRIPT_URL', loadScriptStart);
if (loadScriptStart === -1 || loadScriptEnd === -1 || loadScriptEnd <= loadScriptStart) {
  throw new Error('Failed to locate loadScript definition in script.js');
}
const loadScriptSource = scriptSource.slice(loadScriptStart, loadScriptEnd);

function instantiateEnsureThree({
  loadScript,
  scriptUrl = 'vendor/three.min.js',
  documentStub,
  reportThreeLoadFailure = () => {},
}) {
  const factory = new Function(
    'loadScript',
    'THREE_SCRIPT_URL',
    'document',
    'reportThreeLoadFailure',
    "'use strict'; let threeLoaderPromise = null;" +
      ensureThreeSource +
      '\n  return { ensureThree, resetLoader: () => { threeLoaderPromise = null; } };'
  );
  return factory(loadScript, scriptUrl, documentStub, reportThreeLoadFailure);
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

  it('includes only bundled Three.js asset candidates', () => {
    expect(scriptSource).toContain("createAssetUrlCandidates('vendor/three.min.js')");
    expect(scriptSource).not.toContain("'https://unpkg.com/three");
    expect(scriptSource).not.toContain("'https://cdn.jsdelivr.net/npm/three");
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
      scriptUrl: 'vendor/three.min.js',
      documentStub,
    });

    const result = await ensureThree();
    expect(result).toBe(scope.THREE);
    expect(scope.THREE_GLOBAL).toBe(scope.THREE);
    expect(loadScript).not.toHaveBeenCalled();
    resetLoader();
  });

  it('rejects when an alternate THREE instance attempts to override the canonical global context', async () => {
    const originalThree = { marker: 'original' };
    const duplicateThree = { marker: 'duplicate' };
    const scope = { THREE: duplicateThree, THREE_GLOBAL: originalThree, console: { warn: vi.fn() } };
    global.window = scope;

    const documentStub = {
      querySelectorAll: () => [],
      querySelector: () => null,
    };

    const loadScript = vi.fn();
    const reportThreeLoadFailure = vi.fn();

    const { ensureThree, resetLoader } = instantiateEnsureThree({
      loadScript,
      scriptUrl: 'vendor/three.min.js',
      documentStub,
      reportThreeLoadFailure,
    });

    await expect(ensureThree()).rejects.toThrow(
      'Multiple Three.js contexts detected; refusing to bootstrap duplicate instance.'
    );
    expect(reportThreeLoadFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'duplicate-three-global' }),
      expect.objectContaining({ reason: 'duplicate-three-global' })
    );
    expect(scope.THREE).toBe(originalThree);
    expect(scope.THREE_GLOBAL).toBe(originalThree);
    expect(loadScript).not.toHaveBeenCalled();
    resetLoader();
  });

  it('loads the configured Three.js bundle once and exposes the global THREE', async () => {
    const scope = {};
    global.window = scope;

    const documentStub = {
      querySelectorAll: () => [],
      querySelector: () => null,
    };

    const loadScript = vi.fn(() => {
      scope.THREE = { marker: 'loaded' };
      return Promise.resolve({});
    });

    const { ensureThree, resetLoader } = instantiateEnsureThree({
      loadScript,
      scriptUrl: 'vendor/three.min.js',
      documentStub,
    });

    const result = await ensureThree();

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript).toHaveBeenCalledWith(
      'vendor/three.min.js',
      expect.objectContaining({ 'data-three-bootstrap': 'true' })
    );
    expect(result).toEqual(scope.THREE);
    expect(scope.THREE_GLOBAL).toBe(scope.THREE);
    resetLoader();
  });

  it('reports failures when no bundled sources can load', async () => {
    const scope = {};
    global.window = scope;

    const documentStub = {
      querySelectorAll: () => [],
      querySelector: () => null,
    };

    const loadScript = vi.fn(() => Promise.reject(new Error('offline')));
    const reportThreeLoadFailure = vi.fn();

    const { ensureThree, resetLoader } = instantiateEnsureThree({
      loadScript,
      scriptUrl: 'vendor/three.min.js',
      documentStub,
      reportThreeLoadFailure,
    });

    await expect(ensureThree()).rejects.toThrow('Unable to load Three.js from vendor/three.min.js.');
    expect(reportThreeLoadFailure).toHaveBeenCalledTimes(1);
    const [errorArg, contextArg] = reportThreeLoadFailure.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(errorArg.message).toBe('Unable to load Three.js from vendor/three.min.js.');
    expect(contextArg).toMatchObject({ reason: 'load-failed', url: 'vendor/three.min.js', error: 'offline' });
    resetLoader();
  });

  it('awaits ensureThree before bootstrapping the experience', () => {
    expect(scriptSource).toMatch(/ensureThree\(\)\s*\.then\(\(\) => {\s*bootstrap\(\);\s*}\)/);
  });

  it('simple experience pulls THREE from the global scope', () => {
    expect(simpleExperienceSource).toContain('const THREE = window.THREE_GLOBAL || window.THREE;');
  });
});
