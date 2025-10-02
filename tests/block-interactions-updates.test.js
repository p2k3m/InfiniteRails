import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createExperience, ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

const BLOCK_SIZE = 1;

function ensureTerrainContainers(experience) {
  if (!experience.terrainGroup) {
    experience.terrainGroup = new experience.THREE.Group();
  }
  if (!(experience.terrainChunkMap instanceof Map)) {
    experience.terrainChunkMap = new Map();
  }
  if (!Array.isArray(experience.terrainChunkGroups)) {
    experience.terrainChunkGroups = [];
  }
}

function prepareDirtyChunkSet(experience) {
  if (experience.dirtyTerrainChunks instanceof Set) {
    experience.dirtyTerrainChunks.clear();
  } else {
    experience.dirtyTerrainChunks = new Set();
  }
}

function resetColumn(experience, columnKey, chunkKey) {
  ensureTerrainContainers(experience);
  const [gxRaw, gzRaw] = columnKey.split('|');
  const gx = Number.parseInt(gxRaw, 10);
  const gz = Number.parseInt(gzRaw, 10);
  const chunk = experience.ensureTerrainChunk(chunkKey);
  chunk.children
    .filter((child) => child?.userData?.columnKey === columnKey)
    .forEach((child) => {
      chunk.remove(child);
    });
  experience.columns.set(columnKey, []);
  if (experience.heightMap?.[gx]) {
    experience.heightMap[gx][gz] = 0;
  }
  return { chunk, gx, gz };
}

describe('block placement and mining update world state', () => {
  beforeAll(() => {
    ensureSimpleExperienceLoaded();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates the column data and chunk mesh when placing a block', () => {
    const { experience } = createExperience();
    prepareDirtyChunkSet(experience);

    experience.showHint = vi.fn();
    experience.useSelectedItem = vi.fn(() => 'stone');
    experience.updatePortalFrameStateForColumn = vi.fn();
    experience.updateHud = vi.fn();
    experience.triggerCameraImpulse = vi.fn();
    experience.audio = { play: vi.fn(), playRandom: vi.fn() };
    experience.addScoreBreakdown = vi.fn();

    const gx = Math.floor(experience.heightMap.length / 2);
    const gz = Math.floor(experience.heightMap[0].length / 2);
    const columnKey = `${gx}|${gz}`;
    const chunkKey = experience.getTerrainChunkKey(gx, gz);
    const { chunk } = resetColumn(experience, columnKey, chunkKey);

    const baseMesh = new experience.THREE.Mesh(
      experience.blockGeometry,
      experience.materials.grass,
    );
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    baseMesh.position.set(0, BLOCK_SIZE / 2, 0);
    baseMesh.matrixAutoUpdate = false;
    baseMesh.updateMatrix();
    baseMesh.userData = {
      columnKey,
      level: 0,
      gx,
      gz,
      blockType: 'grass-block',
      chunkKey,
    };
    chunk.add(baseMesh);

    const column = [baseMesh];
    experience.columns.set(columnKey, column);
    experience.heightMap[gx][gz] = column.length;

    experience.castFromCamera = vi.fn(() => [
      {
        object: baseMesh,
      },
    ]);

    experience.hotbar = Array.from({ length: 9 }, () => ({ item: null, quantity: 0 }));
    experience.selectedHotbarIndex = 0;
    experience.hotbar[0] = { item: 'stone', quantity: 1 };

    experience.placeBlock();

    expect(experience.useSelectedItem).toHaveBeenCalledTimes(1);
    expect(experience.columns.get(columnKey)).toHaveLength(2);

    const updatedColumn = experience.columns.get(columnKey);
    const newMesh = updatedColumn[updatedColumn.length - 1];
    expect(newMesh.userData.level).toBe(1);
    expect(newMesh.userData.blockType).toBe('stone');
    expect(newMesh.parent).toBe(chunk);
    expect(chunk.children).toContain(newMesh);

    const previousTop = updatedColumn[updatedColumn.length - 2];
    expect(previousTop.userData.blockType).toBe('dirt');
    expect(previousTop.material).toBe(experience.materials.dirt);

    expect(experience.heightMap[gx][gz]).toBe(2);
    expect(experience.dirtyTerrainChunks.has(chunkKey)).toBe(true);
  });

  it('removes the top block from both data and mesh when mining', () => {
    const { experience } = createExperience();
    prepareDirtyChunkSet(experience);

    experience.updatePortalFrameStateForColumn = vi.fn();
    experience.updateHud = vi.fn();
    experience.triggerCameraImpulse = vi.fn();
    experience.audio = { play: vi.fn(), playRandom: vi.fn() };
    experience.collectDrops = vi.fn();
    experience.getDropsForBlock = vi.fn(() => []);
    experience.addScoreBreakdown = vi.fn();

    const gx = Math.floor(experience.heightMap.length / 2);
    const gz = Math.floor(experience.heightMap[0].length / 2);
    const columnKey = `${gx}|${gz}`;
    const chunkKey = experience.getTerrainChunkKey(gx, gz);
    const { chunk } = resetColumn(experience, columnKey, chunkKey);

    const bottomMesh = new experience.THREE.Mesh(
      experience.blockGeometry,
      experience.materials.dirt,
    );
    bottomMesh.position.set(0, BLOCK_SIZE / 2, 0);
    bottomMesh.matrixAutoUpdate = false;
    bottomMesh.updateMatrix();
    bottomMesh.userData = {
      columnKey,
      level: 0,
      gx,
      gz,
      blockType: 'dirt',
      chunkKey,
    };

    const topMesh = new experience.THREE.Mesh(
      experience.blockGeometry,
      experience.materials.stone,
    );
    topMesh.position.set(0, (3 * BLOCK_SIZE) / 2, 0);
    topMesh.matrixAutoUpdate = false;
    topMesh.updateMatrix();
    topMesh.userData = {
      columnKey,
      level: 1,
      gx,
      gz,
      blockType: 'stone',
      chunkKey,
    };

    chunk.add(bottomMesh);
    chunk.add(topMesh);

    const column = [bottomMesh, topMesh];
    experience.columns.set(columnKey, column);
    experience.heightMap[gx][gz] = column.length;

    experience.castFromCamera = vi.fn(() => [
      {
        object: topMesh,
      },
    ]);

    experience.mineBlock();

    const remainingColumn = experience.columns.get(columnKey);
    expect(remainingColumn).toHaveLength(1);
    expect(remainingColumn[0]).toBe(bottomMesh);
    expect(bottomMesh.userData.blockType).toBe('grass-block');
    expect(bottomMesh.material).toBe(experience.materials.grass);

    expect(chunk.children).not.toContain(topMesh);
    expect(topMesh.parent).toBeNull();

    expect(experience.heightMap[gx][gz]).toBe(1);
    expect(experience.dirtyTerrainChunks.has(chunkKey)).toBe(true);
  });
});
