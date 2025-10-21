import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');
const simpleExperienceSource = fs.readFileSync(path.join(repoRoot, 'simple-experience.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'asset-manifest.json'), 'utf8'));

function resolveManifestAsset(pathname) {
  const match = manifest.assets.find((entry) => entry.startsWith(`${pathname}?`) || entry === pathname);
  if (!match) {
    throw new Error(`Failed to resolve manifest entry for ${pathname}`);
  }
  return match;
}

function appendAssetVersion(url) {
  if (url.includes('?')) {
    return `${url}&assetVersion=1`;
  }
  return `${url}?assetVersion=1`;
}

function withHost(url, host) {
  const [path, query = ''] = url.split('?');
  const normalisedHost = host.endsWith('/') ? host.slice(0, -1) : host;
  const prefixedPath = path.startsWith('/') ? path : `/${path}`;
  return query ? `${normalisedHost}${prefixedPath}?${query}` : `${normalisedHost}${prefixedPath}`;
}

const vendorThreeManifestUrl = resolveManifestAsset('vendor/three.min.js');
const vendorThreeScriptUrl = appendAssetVersion(vendorThreeManifestUrl);
const gltfLoaderManifestUrl = resolveManifestAsset('vendor/GLTFLoader.js');

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

const createAssetUrlCandidatesStart = scriptSource.indexOf('function createAssetUrlCandidates');
const createAssetUrlCandidatesEnd = scriptSource.indexOf('function loadScript', createAssetUrlCandidatesStart);
if (
  createAssetUrlCandidatesStart === -1 ||
  createAssetUrlCandidatesEnd === -1 ||
  createAssetUrlCandidatesEnd <= createAssetUrlCandidatesStart
) {
  throw new Error('Failed to locate createAssetUrlCandidates definition in script.js');
}
const createAssetUrlCandidatesSource = scriptSource.slice(
  createAssetUrlCandidatesStart,
  createAssetUrlCandidatesEnd,
);

function instantiateEnsureThree({
  loadScript,
  scriptUrl = vendorThreeScriptUrl,
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

function instantiateCreateAssetUrlCandidates({
  documentStub = null,
  globalScopeStub = {},
  monitorStub = () => {},
} = {}) {
  const factory = new Function(
    'documentRef',
    'globalScope',
    'monitorSignedAssetUrl',
    "'use strict';" + createAssetUrlCandidatesSource + '\n  return createAssetUrlCandidates;'
  );
  return factory(documentStub, globalScopeStub, monitorStub);
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

  it('targets the bundled Three.js asset directly', () => {
    expect(scriptSource).toContain('const THREE_SCRIPT_URL = applyAssetVersionTag(');
    expect(scriptSource).toContain(`'${vendorThreeManifestUrl}',`);
    expect(scriptSource).not.toContain("'https://unpkg.com/three");
    expect(scriptSource).not.toContain("'https://cdn.jsdelivr.net/npm/three");
  });

  it('rejects when only a legacy THREE global is present', async () => {
    const scope = { THREE: { marker: 'legacy' }, console: { warn: vi.fn() } };
    global.window = scope;

    const documentStub = {
      querySelectorAll: () => [],
      querySelector: () => null,
    };

    const loadScript = vi.fn();
    const reportThreeLoadFailure = vi.fn();
    const { ensureThree, resetLoader } = instantiateEnsureThree({
      loadScript,
      scriptUrl: vendorThreeScriptUrl,
      documentStub,
      reportThreeLoadFailure,
    });

    await expect(ensureThree()).rejects.toThrow(
      'Legacy Three.js global detected; refusing unsupported context.'
    );
    expect(reportThreeLoadFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'legacy-three-global' }),
      expect.objectContaining({ reason: 'legacy-three-global' })
    );
    expect(scope.THREE_GLOBAL).toBeUndefined();
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
      scriptUrl: vendorThreeScriptUrl,
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
      scope.THREE_GLOBAL = { marker: 'loaded' };
      scope.THREE = scope.THREE_GLOBAL;
      return Promise.resolve({});
    });

    const { ensureThree, resetLoader } = instantiateEnsureThree({
      loadScript,
      scriptUrl: vendorThreeScriptUrl,
      documentStub,
    });

    const result = await ensureThree();

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript).toHaveBeenCalledWith(
      vendorThreeScriptUrl,
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
      scriptUrl: vendorThreeScriptUrl,
      documentStub,
      reportThreeLoadFailure,
    });

    await expect(ensureThree()).rejects.toThrow(
      `Unable to load Three.js from ${vendorThreeScriptUrl}.`
    );
    expect(reportThreeLoadFailure).toHaveBeenCalledTimes(1);
    const [errorArg, contextArg] = reportThreeLoadFailure.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(errorArg.message).toBe(`Unable to load Three.js from ${vendorThreeScriptUrl}.`);
    expect(contextArg).toMatchObject({
      reason: 'load-failed',
      url: vendorThreeScriptUrl,
      error: 'offline',
    });
    resetLoader();
  });

  it('awaits ensureThree before bootstrapping the experience', () => {
    expect(scriptSource).toMatch(/ensureThree\(\)\s*\.then\(\(\) => {\s*[\s\S]*?bootstrap\(/);
  });

  it('simple experience pulls THREE from the guarded global scope', () => {
    expect(simpleExperienceSource).toMatch(/const THREE = scope\?\.THREE_GLOBAL \|\| null;/);
    expect(simpleExperienceSource).toContain("const scope =\n        typeof globalThis !== 'undefined'");
    expect(simpleExperienceSource).not.toContain('window.THREE_GLOBAL || window.THREE');
  });
});


describe('createAssetUrlCandidates helper', () => {
  it('prefers a preloaded script source when available', () => {
    const preloadedSrc = withHost(vendorThreeManifestUrl, 'https://cdn.example.com');
    const documentStub = {
      querySelector: vi.fn((selector) =>
        selector === 'script[data-preload-three]' ? { src: preloadedSrc } : null,
      ),
    };
    const globalScopeStub = { APP_CONFIG: {}, console: { warn: vi.fn() } };
    const createAssetUrlCandidates = instantiateCreateAssetUrlCandidates({
      documentStub,
      globalScopeStub,
    });
    const candidates = createAssetUrlCandidates(vendorThreeManifestUrl, {
      preloadedSelector: 'script[data-preload-three]',
    });
    expect(documentStub.querySelector).toHaveBeenCalledWith('script[data-preload-three]');
    expect(candidates).toEqual([appendAssetVersion(withHost(vendorThreeManifestUrl, 'https://cdn.example.com'))]);
  });

  it('falls back to the configured asset base when no preloaded script is present', () => {
    const documentStub = { querySelector: vi.fn(() => null) };
    const globalScopeStub = {
      APP_CONFIG: { assetBaseUrl: 'https://cdn.example.com/bundles/' },
      console: { warn: vi.fn() },
    };
    const createAssetUrlCandidates = instantiateCreateAssetUrlCandidates({
      documentStub,
      globalScopeStub,
    });
    const candidates = createAssetUrlCandidates(vendorThreeManifestUrl);
    expect(candidates).toEqual([
      appendAssetVersion(withHost(vendorThreeManifestUrl, 'https://cdn.example.com/bundles')),
    ]);
  });

  it('returns the provided path when no overrides are configured', () => {
    const createAssetUrlCandidates = instantiateCreateAssetUrlCandidates({
      documentStub: { querySelector: vi.fn(() => null) },
      globalScopeStub: { APP_CONFIG: {}, console: { warn: vi.fn() } },
    });
    expect(createAssetUrlCandidates(vendorThreeManifestUrl)).toEqual([
      appendAssetVersion(vendorThreeManifestUrl),
    ]);
    expect(
      createAssetUrlCandidates(withHost(vendorThreeManifestUrl, 'https://static.example.com')),
    ).toEqual([appendAssetVersion(withHost(vendorThreeManifestUrl, 'https://static.example.com'))]);
  });

  it('monitors signed asset bases for imminent expiry', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2024-03-18T12:00:00Z'));

      const dispatchEvent = vi.fn();
      const consoleSpy = { error: vi.fn(), warn: vi.fn() };
      const expirySeconds = Math.floor((Date.now() + 30 * 60 * 1000) / 1000);
      const globalScopeStub = {
        APP_CONFIG: {
          assetBaseUrl: `https://cdn.example.com/assets/?Expires=${expirySeconds}&Signature=token`,
        },
        console: consoleSpy,
        CustomEvent: class CustomEvent {
          constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
          }
        },
        location: { href: 'https://game.example.com/index.html' },
      };

      const documentStub = {
        querySelector: vi.fn(() => null),
        dispatchEvent,
        baseURI: 'https://game.example.com/index.html',
      };

      const monitorStub = vi.fn((rawBaseUrl, resolvedUrl) => {
        consoleSpy.error(
          'Signed asset URL expires soon; rotate credentials or refresh APP_CONFIG.assetBaseUrl to avoid CDN outages.',
          {
            severity: 'warning',
            assetBaseUrl: rawBaseUrl,
            candidateUrl: resolvedUrl,
          },
        );
        if (typeof documentStub.dispatchEvent === 'function') {
          documentStub.dispatchEvent({
            type: 'infinite-rails:signed-url-expiry',
            detail: { severity: 'warning', millisecondsUntilExpiry: 30 * 60 * 1000 },
          });
        }
      });

      const createAssetUrlCandidates = instantiateCreateAssetUrlCandidates({
        documentStub,
        globalScopeStub,
        monitorStub,
      });

      const candidates = createAssetUrlCandidates('textures/portal-core.png');
      expect(candidates[0]).toContain('textures/portal-core.png');
      expect(candidates[0]).toContain('assetVersion=1');

      expect(monitorStub).toHaveBeenCalledTimes(1);
      const [rawBaseUrl, resolvedUrl, relativePath] = monitorStub.mock.calls[0];
      expect(rawBaseUrl).toBe(globalScopeStub.APP_CONFIG.assetBaseUrl);
      const expectedResolved = new URL(
        'textures/portal-core.png',
        globalScopeStub.APP_CONFIG.assetBaseUrl.endsWith('/')
          ? globalScopeStub.APP_CONFIG.assetBaseUrl
          : `${globalScopeStub.APP_CONFIG.assetBaseUrl}/`,
      ).href;
      expect(resolvedUrl).toBe(expectedResolved);
      expect(relativePath).toBe('textures/portal-core.png');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Signed asset URL expires soon'),
        expect.objectContaining({
          severity: 'warning',
          assetBaseUrl: expect.stringContaining('Expires='),
        }),
      );

      expect(dispatchEvent).toHaveBeenCalledTimes(1);
      const event = dispatchEvent.mock.calls[0][0];
      expect(event.type).toBe('infinite-rails:signed-url-expiry');
      expect(event.detail.severity).toBe('warning');
      expect(event.detail.millisecondsUntilExpiry).toBeGreaterThan(0);
      expect(event.detail.millisecondsUntilExpiry).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('monitors signed bootstrap script fallbacks when resolving assets', () => {
    const signedScriptSrc =
      'https://cdn.example.com/build/script.js?Expires=1730000000&Signature=bootstrap-token';
    const documentStub = {
      querySelector: vi.fn(() => null),
      currentScript: { src: signedScriptSrc },
      getElementsByTagName: vi.fn(() => []),
      baseURI: 'https://game.example.com/index.html',
    };
    const globalScopeStub = {
      APP_CONFIG: {},
      console: { warn: vi.fn() },
      location: { href: 'https://game.example.com/index.html', origin: 'https://game.example.com' },
    };
    const monitorStub = vi.fn();

    const createAssetUrlCandidates = instantiateCreateAssetUrlCandidates({
      documentStub,
      globalScopeStub,
      monitorStub,
    });

    const candidates = createAssetUrlCandidates('textures/portal-core.png');
    expect(candidates.length).toBeGreaterThan(0);

    expect(monitorStub).toHaveBeenCalled();
    const [rawBaseUrl, resolvedUrl, relativePath] = monitorStub.mock.calls[0];
    expect(rawBaseUrl).toBe(signedScriptSrc);
    const scriptUrl = new URL(signedScriptSrc, globalScopeStub.location.href);
    const scriptDir = scriptUrl.href.replace(/[^/]*$/, '');
    const expectedResolved = new URL('textures/portal-core.png', scriptDir).href;
    expect(resolvedUrl).toBe(expectedResolved);
    expect(relativePath).toBe('textures/portal-core.png');
  });
});
