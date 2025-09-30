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
