import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function createCanvasStub() {
  const context2d = {
    fillStyle: '#000000',
    fillRect: () => {},
  };
  const webglContext = {
    getExtension: () => ({ loseContext: () => {} }),
  };
  return {
    width: 256,
    height: 256,
    getContext: (type) => {
      if (type === '2d') {
        return context2d;
      }
      return webglContext;
    },
    toDataURL: () => 'data:image/png;base64,',
  };
}

beforeAll(() => {
  const windowStub = {
    APP_CONFIG: {},
    devicePixelRatio: 1,
    location: { search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
  };
  const documentStub = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return createCanvasStub();
      }
      return { getContext: () => null };
    },
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
    getElementById: () => null,
  };

  Object.assign(windowStub, { THREE, THREE_GLOBAL: THREE, document: documentStub });

  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.performance = { now: () => Date.now() };
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;

  const scriptSource = fs.readFileSync(path.join(repoRoot, 'simple-experience.js'), 'utf8');
  vm.runInThisContext(scriptSource);
});

describe('simple experience terrain generation', () => {
  it('builds a populated 64x64 voxel island with active chunks', () => {
    const canvas = {
      width: 512,
      height: 512,
      clientWidth: 512,
      clientHeight: 512,
      getContext: () => null,
    };

    const experience = window.SimpleExperience.create({ canvas, ui: {} });
    experience.terrainGroup = new THREE.Group();
    experience.terrainChunkGroups = [];
    experience.terrainChunkMap = new Map();
    experience.dirtyTerrainChunks = new Set();

    experience.buildTerrain();

    const worldSize = experience.heightMap.length;
    const expectedColumns = worldSize * worldSize;

    expect(worldSize).toBe(64);
    expect(experience.columns.size).toBe(expectedColumns);
    expect(Array.from(experience.columns.values()).every((column) => column.length > 0)).toBe(true);
    expect(experience.terrainGroup.children.length).toBeGreaterThan(0);
    expect(experience.terrainChunkGroups.length).toBeGreaterThan(0);
    expect(experience.terrainChunkGroups.every((chunk) => chunk.children.length > 0)).toBe(true);
    expect(experience.terrainChunkGroups.every((chunk) => chunk.visible !== false)).toBe(true);
    const blockMeshes = Array.from(experience.columns.values()).flat();
    expect(blockMeshes.every((mesh) => mesh.visible !== false)).toBe(true);
  });

  it('falls back to default textures when external packs fail to load', async () => {
    window.APP_CONFIG = {
      textures: {
        grass: 'https://cdn.example.com/grass.png',
      },
    };

    const canvas = {
      width: 512,
      height: 512,
      clientWidth: 512,
      clientHeight: 512,
      getContext: () => null,
    };

    const loadSpy = vi
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementation((url, onLoad, onProgress, onError) => {
        const texture = new THREE.Texture();
        setTimeout(() => {
          onError?.(new Error('Failed to fetch texture'));
        }, 0);
        return texture;
      });
    try {
      const experience = window.SimpleExperience.create({ canvas, ui: {} });
      const materials = experience.materials;
      const defaultGrassTexture = materials.grass.map;

      const loadPromise = experience.loadExternalVoxelTexture('grass');
      expect(loadPromise).not.toBeNull();

      const resolvedTexture = await loadPromise;
      await Promise.resolve();

      expect(loadSpy).toHaveBeenCalled();
      expect(resolvedTexture).toBe(defaultGrassTexture);
      expect(materials.grass.map).toBe(defaultGrassTexture);
      expect(experience.textureCache.get('grass')).toBe(defaultGrassTexture);
    } finally {
      loadSpy.mockRestore();
      window.APP_CONFIG = {};
    }
  });

  it('procedurally regenerates textures when external sources are unavailable', async () => {
    window.APP_CONFIG = {
      textures: {
        obsidian: 'https://cdn.example.com/obsidian.png',
      },
    };

    const canvas = {
      width: 512,
      height: 512,
      clientWidth: 512,
      clientHeight: 512,
      getContext: () => null,
    };

    const loadSpy = vi
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementation((url, onLoad, onProgress, onError) => {
        const texture = new THREE.Texture();
        setTimeout(() => {
          onError?.(new Error('Failed to fetch texture'));
        }, 0);
        return texture;
      });

    try {
      const experience = window.SimpleExperience.create({ canvas, ui: {} });

      experience.textureCache.delete('obsidian');
      experience.defaultVoxelTexturePalettes.delete('obsidian');

      const loadPromise = experience.loadExternalVoxelTexture('obsidian');
      expect(loadPromise).not.toBeNull();

      const resolvedTexture = await loadPromise;
      await Promise.resolve();

      expect(loadSpy).toHaveBeenCalled();
      expect(resolvedTexture).toBeInstanceOf(THREE.Texture);
      expect(resolvedTexture.isTexture).toBe(true);
      expect(experience.textureCache.get('obsidian')).toBe(resolvedTexture);
    } finally {
      loadSpy.mockRestore();
      window.APP_CONFIG = {};
    }
  });
});
