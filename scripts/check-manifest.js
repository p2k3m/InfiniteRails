#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('three');

const repoRoot = path.resolve(__dirname, '..');

function setGlobalNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
}

function createCanvasStub(overrides = {}) {
  const loseContextStub = { loseContext: () => {} };
  const webglContext = {
    getExtension: () => loseContextStub,
  };
  const context2d = {
    fillStyle: '#000000',
    fillRect: () => {},
    drawImage: () => {},
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
  };
  const canvas = {
    width: 512,
    height: 512,
    clientWidth: 512,
    clientHeight: 512,
    style: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    focus: () => {},
    requestPointerLock: () => ({ catch: () => {} }),
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
    toDataURL: () => 'data:image/png;base64,',
    getContext: (type) => {
      if (type === '2d') {
        return context2d;
      }
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return webglContext;
      }
      return null;
    },
  };
  canvas.contains = (target) => target === canvas;
  const ownerDocument = overrides.ownerDocument ?? globalThis.document;
  if (ownerDocument) {
    canvas.ownerDocument = ownerDocument;
  }
  return Object.assign(canvas, overrides);
}

function ensureTestEnvironment() {
  if (globalThis.window && globalThis.document) {
    return { windowStub: globalThis.window, documentStub: globalThis.document };
  }

  const documentStub = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return createCanvasStub({ ownerDocument: documentStub });
      }
      return { getContext: () => null };
    },
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  const windowStub = {
    APP_CONFIG: {},
    devicePixelRatio: 1,
    location: { search: '', origin: 'http://localhost' },
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    document: documentStub,
    dispatchEvent: () => {},
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    getComputedStyle: () => ({
      zIndex: '0',
      pointerEvents: 'auto',
      display: 'block',
      visibility: 'visible',
      position: 'relative',
    }),
  };

  Object.assign(windowStub, { THREE, THREE_GLOBAL: THREE });

  globalThis.window = windowStub;
  globalThis.document = documentStub;
  setGlobalNavigator({ geolocation: { getCurrentPosition: () => {} }, maxTouchPoints: 0 });
  globalThis.performance = { now: () => Date.now() };
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;

  return { windowStub, documentStub };
}

function loadSimpleExperience() {
  ensureTestEnvironment();
  if (globalThis.window?.SimpleExperience) {
    return globalThis.window;
  }
  const scriptSource = fs.readFileSync(path.join(repoRoot, 'simple-experience.js'), 'utf8');
  vm.runInThisContext(scriptSource, { filename: 'simple-experience.js' });
  return globalThis.window;
}

function loadManifest() {
  const windowStub = loadSimpleExperience();
  return windowStub.InfiniteRailsDimensionManifest;
}

function loadOfflineAssets() {
  delete globalThis.INFINITE_RAILS_EMBEDDED_ASSETS;
  delete require.cache[require.resolve(path.join(repoRoot, 'assets', 'offline-assets.js'))];
  require(path.join(repoRoot, 'assets', 'offline-assets.js'));
  const assets =
    globalThis.INFINITE_RAILS_EMBEDDED_ASSETS ||
    globalThis.window?.INFINITE_RAILS_EMBEDDED_ASSETS ||
    {};
  if (!globalThis.INFINITE_RAILS_EMBEDDED_ASSETS && assets) {
    globalThis.INFINITE_RAILS_EMBEDDED_ASSETS = assets;
  }
  return assets;
}

function stripCacheBuster(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.split('?')[0];
}

function isRelativePath(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const normalised = stripCacheBuster(value);
  return !/^(?:[a-z]+:)?\/\//i.test(normalised) && !normalised.startsWith('data:');
}

/**
 * Generates potential offline manifest entries for a given model reference.
 *
 * @param {string} modelPath
 * @param {string} manifestKey
 * @returns {string[]}
 */
function toOfflineCandidates(modelPath, manifestKey) {
  const candidates = new Set();
  if (manifestKey) {
    candidates.add(manifestKey);
  }
  if (typeof modelPath === 'string') {
    const cleanPath = stripCacheBuster(modelPath);
    const basename = path.basename(cleanPath, path.extname(cleanPath));
    if (basename) {
      candidates.add(basename);
      const camel = basename
        .split(/[-_]+/)
        .filter(Boolean)
        .map((part, index) => (index === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('');
      if (camel) {
        candidates.add(camel);
      }
      const pascal = basename
        .split(/[-_]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
      if (pascal) {
        candidates.add(pascal.charAt(0).toLowerCase() + pascal.slice(1));
        candidates.add(pascal);
      }
    }
  }
  return Array.from(candidates);
}

/**
 * Validates the asset manifest against runtime requirements and fallbacks.
 * Ensures all referenced models have offline substitutes when required.
 */
function validateManifest() {
  const manifest = loadManifest();
  const offlineAssets = loadOfflineAssets();
  const offlineModels = offlineAssets.models || {};
  const issues = [];

  if (!manifest || typeof manifest !== 'object') {
    issues.push('Dimension manifest is unavailable. Ensure simple-experience.js exports DIMENSION_ASSET_MANIFEST.');
    return { issues };
  }

  const dimensionIds = Object.keys(manifest);
  if (dimensionIds.length === 0) {
    issues.push('No dimension entries found in manifest.');
  }

  dimensionIds.forEach((dimensionId) => {
    const entry = manifest[dimensionId];
    if (!entry || typeof entry !== 'object') {
      issues.push(`Manifest entry for dimension "${dimensionId}" is missing or invalid.`);
      return;
    }

    ['terrain', 'mobs', 'objects'].forEach((field) => {
      const value = entry[field];
      if (!Array.isArray(value) || value.length === 0) {
        issues.push(`Dimension "${dimensionId}" has no ${field} entries.`);
        return;
      }
      value.forEach((item, index) => {
        if (typeof item !== 'string' || item.trim().length === 0) {
          issues.push(`Dimension "${dimensionId}" has an invalid ${field} entry at index ${index}.`);
        }
      });
    });

    const assets = entry.assets;
    if (!assets || typeof assets !== 'object') {
      issues.push(`Dimension "${dimensionId}" is missing its assets map.`);
      return;
    }

    const { textures, models } = assets;
    if (!textures || typeof textures !== 'object') {
      issues.push(`Dimension "${dimensionId}" has no texture manifest.`);
    } else {
      Object.entries(textures).forEach(([key, value]) => {
        if (typeof value === 'string') {
          if (value.trim().length === 0) {
            issues.push(`Dimension "${dimensionId}" texture "${key}" is empty.`);
          }
          return;
        }
        if (Array.isArray(value)) {
          const normalized = value
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(Boolean);
          if (normalized.length === 0) {
            issues.push(`Dimension "${dimensionId}" texture "${key}" array is empty.`);
          }
          return;
        }
        issues.push(
          `Dimension "${dimensionId}" texture "${key}" must be a string or string array, received ${typeof value}.`,
        );
      });
    }

    if (!models || typeof models !== 'object') {
      issues.push(`Dimension "${dimensionId}" has no model manifest.`);
    } else {
      Object.entries(models).forEach(([modelKey, modelPath]) => {
        if (typeof modelPath !== 'string' || modelPath.trim().length === 0) {
          issues.push(`Dimension "${dimensionId}" model "${modelKey}" is empty.`);
          return;
        }

        const cleanModelPath = stripCacheBuster(modelPath);
        if (isRelativePath(modelPath)) {
          const filePath = path.resolve(repoRoot, cleanModelPath);
          if (!fs.existsSync(filePath)) {
            issues.push(
              `Dimension "${dimensionId}" model "${modelKey}" references missing file: ${modelPath}`,
            );
          }
        }

        const offlineCandidates = toOfflineCandidates(modelPath, modelKey);
        const hasOfflineEntry = offlineCandidates.some((candidate) => candidate in offlineModels);
        if (!hasOfflineEntry) {
          issues.push(
            `Dimension "${dimensionId}" model "${modelKey}" (${modelPath}) is not embedded in offline-assets.js.`,
          );
        }
      });
    }
  });

  const windowStub = globalThis.window || {};
  const themes = windowStub.SimpleExperience?.dimensionThemes ?? [];
  if (themes.length === 0) {
    issues.push('No dimension themes registered on SimpleExperience.dimensionThemes.');
  } else {
    const themeIds = themes.map((theme) => theme.id);
    const missingInThemes = dimensionIds.filter((id) => !themeIds.includes(id));
    if (missingInThemes.length) {
      issues.push(
        `Manifest dimensions missing from SimpleExperience themes: ${missingInThemes.join(', ')}`,
      );
    }

    themes.forEach((theme) => {
      if (!theme || typeof theme !== 'object') {
        return;
      }
      if (!dimensionIds.includes(theme.id)) {
        issues.push(`Theme "${theme.id}" has no corresponding manifest entry.`);
        return;
      }
      if (theme.assetManifest !== manifest[theme.id]) {
        issues.push(`Theme "${theme.id}" is not linked to its manifest entry.`);
      }
    });
  }

  return { issues, manifest, offlineModels, themes };
}

function main() {
  const { issues } = validateManifest();
  if (issues.length > 0) {
    console.error('\nManifest validation failed:');
    issues.forEach((issue) => {
      console.error(` • ${issue}`);
    });
    console.error('\nResolve the issues above before deploying.');
    process.exitCode = 1;
    return;
  }

  console.log('✅ Dimension manifest validated – all references are present and linked.');
}

if (require.main === module) {
  main();
}

module.exports = {
  validateManifest,
  toOfflineCandidates,
};
