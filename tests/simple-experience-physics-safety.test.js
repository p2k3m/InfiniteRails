import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createExperience, ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

describe('player safety block spawning', () => {
  beforeAll(() => {
    ensureSimpleExperienceLoaded();
  });

  it('does not spawn a safety block when solid ground already exists', () => {
    const { experience } = createExperience();
    if (!experience.terrainGroup) {
      experience.terrainGroup = new experience.THREE.Group();
    }
    if (!Array.isArray(experience.terrainChunkGroups)) {
      experience.terrainChunkGroups = [];
    }
    if (!(experience.terrainChunkMap instanceof Map)) {
      experience.terrainChunkMap = new Map();
    }
    const gridSize = experience.heightMap?.length ?? 0;
    const gridX = Math.floor(gridSize / 2);
    const gridZ = Math.floor((experience.heightMap?.[gridX]?.length ?? 0) / 2);
    const columnKey = `${gridX}|${gridZ}`;
    const chunkKey = experience.getTerrainChunkKey(gridX, gridZ);
    const chunk = experience.ensureTerrainChunk(chunkKey);
    const baseBlock = new experience.THREE.Mesh(
      experience.blockGeometry,
      experience.materials.stone,
    );
    baseBlock.castShadow = true;
    baseBlock.receiveShadow = true;
    baseBlock.position.set(0, 0.5, 0);
    baseBlock.matrixAutoUpdate = false;
    baseBlock.updateMatrix();
    baseBlock.userData = {
      columnKey,
      level: 0,
      gx: gridX,
      gz: gridZ,
      blockType: 'stone',
      chunkKey,
    };
    chunk.add(baseBlock);
    experience.columns.set(columnKey, [baseBlock]);
    if (experience.heightMap?.[gridX]) {
      experience.heightMap[gridX][gridZ] = 1;
    }

    const spawned = experience.spawnSafetyBlockAtPlayerFeetIfNeeded(0, 0);

    expect(spawned).toBe(false);
    expect(experience.columns.get(columnKey)).toHaveLength(1);
  });

  it('spawns a safety block beneath the player when falling into the void', () => {
    const { experience } = createExperience();
    if (!experience.terrainGroup) {
      experience.terrainGroup = new experience.THREE.Group();
    }
    if (!Array.isArray(experience.terrainChunkGroups)) {
      experience.terrainChunkGroups = [];
    }
    if (!(experience.terrainChunkMap instanceof Map)) {
      experience.terrainChunkMap = new Map();
    }
    const gridSize = experience.heightMap?.length ?? 0;
    const gridX = Math.floor(gridSize / 2);
    const gridZ = Math.floor((experience.heightMap?.[gridX]?.length ?? 0) / 2);
    const columnKey = `${gridX}|${gridZ}`;
    const chunkKey = experience.getTerrainChunkKey(gridX, gridZ);

    experience.scheduleNavigationMeshMaintenance = vi.fn();
    experience.dirtyTerrainChunks = new Set();
    experience.markTerrainChunkDirty = vi.fn((key) => {
      experience.dirtyTerrainChunks.add(key);
    });

    const existingColumn = experience.columns.get(columnKey) ?? [];
    existingColumn.forEach((mesh) => {
      if (mesh?.parent?.remove) {
        mesh.parent.remove(mesh);
      }
    });

    const chunk = experience.ensureTerrainChunk(chunkKey);
    if (chunk?.children) {
      chunk.children.slice().forEach((child) => {
        if (child?.userData?.columnKey === columnKey && typeof chunk.remove === 'function') {
          chunk.remove(child);
        }
      });
    }

    experience.columns.set(columnKey, []);
    if (experience.heightMap?.[gridX]) {
      experience.heightMap[gridX][gridZ] = 0;
    }

    if (!experience.playerRig) {
      experience.playerRig = new experience.THREE.Group();
    }
    experience.playerRig.position.set(0, 2.5, 0);

    experience.verticalVelocity = -2;
    experience.isGrounded = false;
    experience.touchJumpRequested = false;
    experience.movementBindingDiagnostics = null;

    experience.updateMovement(0.016);

    const updatedColumn = experience.columns.get(columnKey) ?? [];
    expect(updatedColumn.length).toBeGreaterThan(0);
    const safetyBlock = updatedColumn[0];
    expect(safetyBlock.userData?.safetyBlock).toBe(true);
    expect(safetyBlock.userData?.blockType).toBe('stone');
    expect(experience.heightMap?.[gridX]?.[gridZ]).toBe(updatedColumn.length);
    expect(experience.dirtyTerrainChunks.has(chunkKey)).toBe(true);
  });
});
