import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExperience, ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

describe('isolated game worker integration', () => {
  beforeEach(() => {
    ensureSimpleExperienceLoaded();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses worker-provided heightmap when rebuilding terrain', () => {
    const { experience } = createExperience();
    experience.initialisePerformanceMetrics();
    const minHeight = Number.isFinite(experience.minColumnHeight) ? experience.minColumnHeight : 3;
    const maxHeight = Number.isFinite(experience.maxColumnHeight) ? experience.maxColumnHeight : minHeight + 12;
    const generated = experience.generateProceduralHeightmap({
      profile: experience.dimensionTerrainProfile || null,
      minColumnHeight: minHeight,
      maxColumnHeight: maxHeight,
      voxelBudget: experience.maxTerrainVoxels ?? undefined,
      dimensionIndex: experience.currentDimensionIndex ?? 0,
    });
    const workerWorld = {
      size: 64,
      minHeight,
      maxHeight,
      heightMap: generated.matrix,
      stats: {
        columnCount: 64 * 64,
        voxelCount: generated.meta?.voxelCount ?? 0,
      },
      generatedAt: Date.now(),
      seed: 98765,
    };
    const markSpy = vi.spyOn(experience, 'markWorldGenerationComplete');
    experience.buildTerrain({ workerResult: { world: workerWorld } });
    expect(markSpy).toHaveBeenCalled();
    const [, detail] = markSpy.mock.calls.at(-1);
    expect(detail.heightmapResult.source).toBe('worker-generated');
    expect(experience.performanceMetrics.worldGen.heightmapSource).toBe('worker-generated');
  });

  it('records worker mesh statistics when supplied by the worker result', () => {
    const { experience } = createExperience();
    experience.initialisePerformanceMetrics();
    const minHeight = Number.isFinite(experience.minColumnHeight) ? experience.minColumnHeight : 3;
    const maxHeight = Number.isFinite(experience.maxColumnHeight) ? experience.maxColumnHeight : minHeight + 12;
    const generated = experience.generateProceduralHeightmap({
      profile: experience.dimensionTerrainProfile || null,
      minColumnHeight: minHeight,
      maxColumnHeight: maxHeight,
      voxelBudget: experience.maxTerrainVoxels ?? undefined,
      dimensionIndex: experience.currentDimensionIndex ?? 0,
    });
    const workerWorld = {
      size: 64,
      minHeight,
      maxHeight,
      heightMap: generated.matrix,
      stats: {
        columnCount: 64 * 64,
        voxelCount: generated.meta?.voxelCount ?? 0,
      },
      generatedAt: Date.now(),
      seed: 98765,
    };
    const workerMesh = {
      type: 'mesh',
      chunkSize: 16,
      chunkCount: 4,
      meshCount: 128,
      vertexCount: 128 * 24,
      generatedAt: Date.now(),
      chunks: [
        { key: '0|0', chunkX: 0, chunkZ: 0, meshCount: 32 },
        { key: '1|0', chunkX: 1, chunkZ: 0, meshCount: 32 },
        { key: '0|1', chunkX: 0, chunkZ: 1, meshCount: 32 },
        { key: '1|1', chunkX: 1, chunkZ: 1, meshCount: 32 },
      ],
    };
    experience.buildTerrain({ workerResult: { world: workerWorld, mesh: workerMesh } });
    const summary = experience.lastTerrainBuildSummary;
    expect(summary.workerMesh).toMatchObject({
      source: 'worker-prepared',
      chunkCount: workerMesh.chunkCount,
      meshCount: workerMesh.meshCount,
      chunkSize: workerMesh.chunkSize,
    });
    const metrics = experience.performanceMetrics.worldGen;
    expect(metrics.workerSupport.mesh).toBe(true);
    expect(metrics.workerMesh).toMatchObject({
      chunkCount: workerMesh.chunkCount,
      meshCount: workerMesh.meshCount,
      chunkSize: workerMesh.chunkSize,
      source: 'worker-prepared',
    });
  });

  it('applies worker AI updates to zombie movement', () => {
    const { experience } = createExperience();
    experience.initialisePerformanceMetrics();
    const worldRoot = new experience.THREE.Group();
    experience.scene = worldRoot;
    experience.worldRoot = worldRoot;
    const zombieGroup = new experience.THREE.Group();
    experience.zombieGroup = zombieGroup;
    experience.ensureEntityGroup = vi.fn().mockReturnValue(zombieGroup);
    vi.spyOn(experience, 'isNight').mockReturnValue(true);
    vi.spyOn(experience, 'ensureNavigationMeshForActorPosition').mockReturnValue({ walkableCellCount: 1 });
    vi.spyOn(experience, 'ensureNavigationMeshForActorChunk').mockReturnValue({ walkableCellCount: 1 });
    vi.spyOn(experience, 'sampleGroundHeight').mockReturnValue(0);
    vi.spyOn(experience, 'getPlayerWorldPosition').mockImplementation((vector) => {
      if (vector?.set) {
        vector.set(0, 0, 0);
        return vector;
      }
      return { x: 0, y: 0, z: 0 };
    });
    experience.zombies = [];
    const mesh = new experience.THREE.Mesh(
      new experience.THREE.BoxGeometry(1, 1, 1),
      new experience.THREE.MeshBasicMaterial(),
    );
    mesh.position.set(0, 0, 0);
    zombieGroup.add(mesh);
    const zombie = {
      id: 'worker-zombie',
      mesh,
      speed: 2,
      collisionRadius: 0.6,
      lastAttack: 0,
      animation: null,
      navChunkKey: null,
    };
    experience.zombies.push(zombie);
    experience.elapsed = 5;
    experience.lastZombieSpawn = experience.elapsed;
    const startX = 0;
    const startY = 0;
    const startZ = 0;
    const aiResult = {
      type: 'ai',
      delta: 0.016,
      updates: [
        {
          id: zombie.id,
          nextPosition: { x: startX, y: startY, z: startZ },
          distanceToPlayer: 10,
          state: 'attack',
        },
      ],
      generatedAt: Date.now(),
    };
    const damageSpy = vi.spyOn(experience, 'damagePlayer').mockImplementation(() => {});
    const lastAttack = zombie.lastAttack;
    zombie.lastAttack = experience.elapsed - 2;
    experience.updateZombies(0.016, { workerResult: { ai: aiResult } });
    expect(damageSpy).toHaveBeenCalledTimes(1);
    expect(zombie.lastAttack).toBeGreaterThan(lastAttack);
    expect(experience.lastWorkerAiSummary).toMatchObject({
      source: 'worker-simulated',
      updateCount: 1,
    });
    expect(experience.performanceMetrics.worldGen.workerSupport.ai).toBe(true);
    expect(experience.performanceMetrics.worldGen.workerAi).toMatchObject({
      source: 'worker-simulated',
      updateCount: 1,
    });
  });
});
