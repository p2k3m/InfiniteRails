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
      experience.assetRetryBackoffMs = 5;
      experience.assetRetryBackoffMaxMs = 5;
      const materials = experience.materials;
      const defaultGrassTexture = materials.grass.map;

      const loadPromise = experience.loadExternalVoxelTexture('grass');
      expect(loadPromise).not.toBeNull();

      const resolvedTexture = await loadPromise;
      await Promise.resolve();

      const loadAttempted = loadSpy.mock.calls.length > 0;
      if (loadAttempted) {
        expect(loadSpy).toHaveBeenCalled();
      }
      expect(experience.texturePackErrorCount).toBeGreaterThan(0);
      expect(experience.lastHintMessage).toContain('missing textures for');
      expect(experience.lastHintMessage).toContain('grass');
      expect(experience.textureFallbackMissingKeys.has('grass')).toBe(true);
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
      experience.assetRetryBackoffMs = 5;
      experience.assetRetryBackoffMaxMs = 5;

      experience.textureCache.delete('obsidian');
      experience.defaultVoxelTexturePalettes.delete('obsidian');

      const loadPromise = experience.loadExternalVoxelTexture('obsidian');
      expect(loadPromise).not.toBeNull();

      const resolvedTexture = await loadPromise;
      await Promise.resolve();

      const loadAttempted = loadSpy.mock.calls.length > 0;
      if (loadAttempted) {
        expect(loadSpy).toHaveBeenCalled();
      }
      expect(experience.texturePackErrorCount).toBeGreaterThan(0);
      expect(experience.lastHintMessage).toContain('missing textures for');
      expect(experience.lastHintMessage).toContain('obsidian');
      expect(experience.textureFallbackMissingKeys.has('obsidian')).toBe(true);
      expect(resolvedTexture).toBeInstanceOf(THREE.Texture);
      expect(resolvedTexture.isTexture).toBe(true);
      expect(experience.textureCache.get('obsidian')).toBe(resolvedTexture);
    } finally {
      loadSpy.mockRestore();
      window.APP_CONFIG = {};
    }
  });

  it('notifies the player after repeated texture pack failures', async () => {
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

    const playerHintEl = {
      textContent: '',
      classList: {
        add: vi.fn(),
      },
      setAttribute: vi.fn(),
    };

    const footerEl = {
      dataset: {},
    };

    const footerStatusEl = {
      textContent: '',
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
      const experience = window.SimpleExperience.create({
        canvas,
        ui: { playerHintEl, footerEl, footerStatusEl },
        texturePackErrorNoticeThreshold: 2,
      });
      experience.assetRetryBackoffMs = 5;
      experience.assetRetryBackoffMaxMs = 5;

      const first = await experience.loadExternalVoxelTexture('grass');
      await Promise.resolve();
      const second = await experience.loadExternalVoxelTexture('grass');
      await Promise.resolve();

      expect(first).toBeInstanceOf(THREE.Texture);
      expect(second).toBeInstanceOf(THREE.Texture);
      expect(playerHintEl.textContent).toContain('missing textures for');
      expect(playerHintEl.textContent).toContain('grass');
      expect(footerStatusEl.textContent).toContain('missing textures for');
      expect(footerStatusEl.textContent).toContain('grass');
      expect(footerEl.dataset.state).toBe('warning');
      expect(experience.texturePackNoticeShown).toBe(true);
      expect(experience.texturePackErrorCount).toBeGreaterThanOrEqual(2);
      expect(experience.textureFallbackMissingKeys.has('grass')).toBe(true);
    } finally {
      loadSpy.mockRestore();
      window.APP_CONFIG = {};
    }
  });

  it('applies per-dimension terrain profiles without generating flat or empty worlds', () => {
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

    const themes = window.SimpleExperience.dimensionThemes;
    const heightRanges = [];

    themes.forEach((theme, index) => {
      experience.applyDimensionSettings(index);
      experience.buildTerrain();
      const worldSize = experience.heightMap.length;
      const heights = experience.heightMap.flat();
      expect(worldSize).toBeGreaterThan(0);
      expect(heights.length).toBe(worldSize * worldSize);
      const minHeight = Math.min(...heights);
      const maxHeight = Math.max(...heights);
      expect(minHeight).toBeGreaterThanOrEqual(experience.minColumnHeight);
      expect(maxHeight).toBeLessThanOrEqual(experience.maxColumnHeight);
      expect(new Set(heights).size).toBeGreaterThan(1);
      expect(Number.isFinite(experience.maxTerrainVoxels)).toBe(true);
      heightRanges.push(`${minHeight}-${maxHeight}`);
    });

    const uniqueRanges = new Set(heightRanges);
    expect(uniqueRanges.size).toBeGreaterThan(1);
  });

  it('uses seeded heightmaps when streamed payloads are invalid', () => {
    const canvas = {
      width: 512,
      height: 512,
      clientWidth: 512,
      clientHeight: 512,
      getContext: () => null,
    };

    const experience = window.SimpleExperience.create({ canvas, ui: {} });
    experience.scene = new THREE.Scene();
    experience.worldRoot = null;
    experience.terrainGroup = null;
    experience.terrainChunkGroups = [];
    experience.terrainChunkMap = new Map();
    experience.dirtyTerrainChunks = new Set();

    experience.pendingHeightmapStream = { matrix: [[1]] };

    experience.buildTerrain();

    const summary = experience.lastTerrainBuildSummary;
    expect(summary).toBeTruthy();
    expect(summary.heightmapSource).toMatch(/fallback|seeded/);
    expect(summary.streamFailureCount).toBeGreaterThan(0);
    expect(summary.voxelCount).toBeGreaterThan(0);
    expect(summary.voxelCount).toBe(summary.terrainMeshCount);
    expect(summary.chunkCount).toBe(summary.expectedChunkCount);
    expect(summary.emptyChunkKeys).toHaveLength(0);
    expect(experience.heightMap.length).toBe(64);
    expect(experience.worldRoot).toBeInstanceOf(THREE.Group);
    expect(experience.terrainGroup).toBeInstanceOf(THREE.Group);
    expect(experience.terrainGroup.children.length).toBe(summary.expectedChunkCount);
    expect(summary.integrity?.valid).toBe(true);
    expect(summary.integrity?.issues ?? []).toHaveLength(0);
  });

  it('enforces minimum terrain height when streamed heightmaps are empty', () => {
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

    const size = 64;
    const zeroMatrix = Array.from({ length: size }, () => Array(size).fill(0));
    experience.pendingHeightmapStream = { matrix: zeroMatrix };

    experience.buildTerrain();

    const summary = experience.lastTerrainBuildSummary;
    expect(summary).toBeTruthy();
    expect(summary.heightmapSource).toBe('streamed');
    expect(summary.voxelCount).toBeGreaterThan(0);
    const minHeight = Math.min(...experience.heightMap.flat());
    expect(minHeight).toBeGreaterThan(0);
    expect(summary.voxelCount).toBe(summary.terrainMeshCount);
    expect(summary.emptyChunkKeys).toHaveLength(0);
    expect(summary.integrity?.valid).toBe(true);
    expect(summary.integrity?.issues ?? []).toHaveLength(0);
  });

  it('falls back to seeded terrain when streamed payload dimension mismatches', () => {
    const canvas = {
      width: 512,
      height: 512,
      clientWidth: 512,
      clientHeight: 512,
      getContext: () => null,
    };

    const experience = window.SimpleExperience.create({ canvas, ui: {} });
    experience.scene = new THREE.Scene();
    experience.dimensionSettings = { id: 'skyland' };
    experience.currentDimensionIndex = 0;
    experience.terrainGroup = null;
    experience.terrainChunkGroups = [];
    experience.terrainChunkMap = new Map();
    experience.dirtyTerrainChunks = new Set();

    const mismatchedMatrix = Array.from({ length: 64 }, () => Array(64).fill(4));
    experience.pendingHeightmapStream = { dimension: 'underworld', matrix: mismatchedMatrix };

    experience.buildTerrain();

    const summary = experience.lastTerrainBuildSummary;
    expect(summary).toBeTruthy();
    expect(summary.heightmapSource).toMatch(/fallback|seeded/);
    expect(summary.fallbackReason).toBe('dimension-mismatch');
    expect(summary.fallbackFromStream).toBe(true);
    expect(summary.integrity?.valid).toBe(true);
    expect(summary.integrity?.issues ?? []).toHaveLength(0);
    expect(summary.chunkCount).toBe(summary.expectedChunkCount);
    expect(summary.voxelCount).toBe(summary.terrainMeshCount);
  });
});
