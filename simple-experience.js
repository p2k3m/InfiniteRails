    normaliseWorkerWorldResult(result, options = {}) {
      if (!result || typeof result !== 'object') {
        return null;
      }
      const matrixSource = Array.isArray(result.heightMap)
        ? result.heightMap
        : Array.isArray(result.heightmap)
          ? result.heightmap
          : Array.isArray(result.matrix)
            ? result.matrix
            : null;
      if (!matrixSource) {
        return null;
      }
      const validation = validateHeightmapMatrix(matrixSource, WORLD_SIZE);
      if (!validation.valid) {
        return null;
      }
      const minColumnHeight = Math.max(1, Math.floor(options.minColumnHeight ?? MIN_COLUMN_HEIGHT));
      const maxColumnHeight = Math.max(minColumnHeight, Math.floor(options.maxColumnHeight ?? MAX_COLUMN_HEIGHT));
      const voxelBudget = Math.max(0, Math.floor(options.voxelBudget ?? DEFAULT_TERRAIN_VOXEL_CAP));
      const applied = this.applyHeightmapBudget(validation.matrix, {
        minColumnHeight,
        maxColumnHeight,
        voxelBudget,
      });
      const stats = result && typeof result.stats === 'object' ? result.stats : null;
      const normaliseNumeric = (value) => (Number.isFinite(value) ? Math.floor(value) : null);
      return {
        matrix: cloneHeightmapMatrix(applied.matrix),
        meta: {
          ...applied.meta,
          workerSeed: Number.isFinite(result.seed) ? Math.floor(result.seed) : null,
          workerGeneratedAt: Number.isFinite(result.generatedAt) ? result.generatedAt : null,
          workerColumnCount: normaliseNumeric(stats?.columnCount),
          workerVoxelCount: normaliseNumeric(stats?.voxelCount),
          workerSize: Number.isFinite(result.size) ? Math.floor(result.size) : null,
          workerMinHeight: Number.isFinite(result.minHeight) ? Math.floor(result.minHeight) : null,
          workerMaxHeight: Number.isFinite(result.maxHeight) ? Math.floor(result.maxHeight) : null,
        },
        source: 'worker-generated',
        fallbackReason: null,
        fallbackFromStream: false,
      };
    }

      const workerHeightmapResult =
        options?.workerResult?.world && typeof this.normaliseWorkerWorldResult === 'function'
          ? this.normaliseWorkerWorldResult(options.workerResult.world, {
              minColumnHeight,
              maxColumnHeight,
              voxelBudget,
            })
          : null;
      const executeTerrainBuild = (preferSeeded = false, forcedFallbackReason = null, precomputed = null) => {
        let heightmapResult = null;
        if (precomputed && precomputed.matrix) {
          heightmapResult = precomputed;
          this.heightmapStreamState = 'worker-generated';
        } else {
          try {
            heightmapResult = this.resolveHeightmapMatrix({
              dimensionKey,
              profile,
              minColumnHeight,
              maxColumnHeight,
              voxelBudget,
              preferSeeded,
              forcedFallbackReason,
            });
          } catch (error) {
            const fallbackReason = forcedFallbackReason && forcedFallbackReason.trim().length
              ? `${forcedFallbackReason.trim()}+terrain-build-error`
              : 'terrain-build-error';
            return buildSafeFallbackTerrain(error, fallbackReason);
          }
      let { summary, heightmapResult } = executeTerrainBuild(false, null, workerHeightmapResult);
      if (!summary?.integrity?.valid && workerHeightmapResult) {
        if (typeof console !== 'undefined') {
          console.error('Worker-generated heightmap failed validation. Falling back to procedural generation.', {
            issues: summary?.integrity?.issues || ['unknown'],
          });
        }
        ({ summary, heightmapResult } = executeTerrainBuild(true, 'worker-integrity-invalid'));
      }
    updateZombies(delta, context = {}) {
      const aiResult = context?.workerResult?.ai || null;
      const aiUpdates = Array.isArray(aiResult?.updates)
        ? new Map(
            aiResult.updates.map((entry, index) => {
              const key =
                entry && entry.id !== undefined && entry.id !== null && entry.id !== '' ? entry.id : index;
              return [key, entry];
            }),
          )
        : null;
      for (let index = 0; index < this.zombies.length; index += 1) {
        const zombie = this.zombies[index];
        const workerUpdate = aiUpdates
          ? aiUpdates.get(zombie?.id ?? null) ?? aiUpdates.get(index)
          : null;
        let computedDistance = null;
        let movementApplied = false;
        if (workerUpdate && workerUpdate.nextPosition) {
          const nextX = Number.isFinite(workerUpdate.nextPosition.x)
            ? workerUpdate.nextPosition.x
            : mesh.position.x;
          const nextZ = Number.isFinite(workerUpdate.nextPosition.z)
            ? workerUpdate.nextPosition.z
            : mesh.position.z;
          const moveX = nextX - mesh.position.x;
          const moveZ = nextZ - mesh.position.z;
          if (Number.isFinite(workerUpdate.nextPosition.x)) {
            mesh.position.x = nextX;
          }
          if (Number.isFinite(workerUpdate.nextPosition.z)) {
            mesh.position.z = nextZ;
          }
          if (Number.isFinite(moveX) && Number.isFinite(moveZ) && (Math.abs(moveX) > 1e-4 || Math.abs(moveZ) > 1e-4)) {
            mesh.rotation.y = Math.atan2(moveX, moveZ);
          if (Number.isFinite(workerUpdate.distanceToPlayer)) {
            computedDistance = workerUpdate.distanceToPlayer;
          }
          movementApplied = Number.isFinite(workerUpdate.nextPosition.x) || Number.isFinite(workerUpdate.nextPosition.z);
          if (Number.isFinite(workerUpdate.nextPosition.y)) {
            mesh.position.y = workerUpdate.nextPosition.y;
          }
        }
        if (!movementApplied) {
          tmpDir.subVectors(playerPosition, mesh.position);
          const distance = tmpDir.length();
          if (!Number.isFinite(distance)) {
            this.warnAiMovementFailure('zombie', {
              stage: 'chase',
              reason: 'distance-invalid',
              zombieId: zombie.id,
              chunkKey: zombie.navChunkKey ?? currentChunkKey ?? null,
            });
            continue;
          }
          computedDistance = distance;
          if (distance > 0.001) {
            tmpDir.normalize();
            tmpStep.copy(tmpDir).multiplyScalar(zombie.speed * delta);
            mesh.position.add(tmpStep);
            mesh.rotation.y = Math.atan2(tmpDir.x, tmpDir.z);
            if (tmpStep.lengthSq() > 1e-6) {
              baseState = 'walk';
            }
          }
        } else if (!Number.isFinite(computedDistance)) {
          tmpDir.subVectors(playerPosition, mesh.position);
          const distance = tmpDir.length();
          computedDistance = Number.isFinite(distance) ? distance : null;
        const effectiveDistance = Number.isFinite(computedDistance) ? computedDistance : Infinity;
        const shouldAttack = workerUpdate
          ? workerUpdate.state === 'attack' || effectiveDistance < ZOMBIE_CONTACT_RANGE
          : effectiveDistance < ZOMBIE_CONTACT_RANGE;
        if (shouldAttack && this.elapsed - zombie.lastAttack > 1.2) {
          const animationState = workerUpdate?.state === 'attack' ? 'walk' : baseState;
          this.setAnimationRigState(zombie.animation, animationState);
