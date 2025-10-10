        if (!zombie || !zombie.mesh || !zombie.mesh.position) {
          this.despawnMob('zombie', zombie, { stage: 'chase', reason: 'mesh-missing' });
          continue;
        }
        if (!this.zombies.includes(zombie)) {
          continue;
        }
        let currentChunkKey = this.getChunkKeyForWorldPosition(mesh.position.x, mesh.position.z);
        const navmesh = currentChunkKey
          ? this.ensureNavigationMeshForActorChunk('zombie', currentChunkKey, {
              reason: 'zombie-chase',
              stage: 'chase',
              zombieId: zombie.id,
            })
          : null;
        if (!currentChunkKey || !navmesh || !navmesh.walkableCellCount) {
          const recovered = this.handleMobNavmeshFailure('zombie', zombie, {
            reason: !currentChunkKey ? 'chunk-missing' : navmesh ? 'navmesh-empty' : 'navmesh-missing',
            chunkKey: currentChunkKey ?? null,
            failsafeRadius: 6,
            failsafeRadiusVariance: 4,
            heightOffset: 0.9,
          if (!recovered || !this.zombies.includes(zombie)) {
            continue;
          }
          currentChunkKey = zombie.navChunkKey ?? this.getChunkKeyForWorldPosition(mesh.position.x, mesh.position.z);
          if (!currentChunkKey) {
            this.despawnMob('zombie', zombie, { stage: 'chase', reason: 'navmesh-unrecoverable' });
            continue;
          }
          zombie.navChunkKey = currentChunkKey;
      if (this.mobNavmeshRecoveryQueue?.zombie) {
        const capacity = Math.max(0, ZOMBIE_MAX_PER_DIMENSION - this.zombies.length);
        const queued = Math.max(0, Math.min(this.mobNavmeshRecoveryQueue.zombie || 0, capacity));
        if (queued > 0 && this.isNight()) {
          for (let i = 0; i < queued; i += 1) {
            try {
              this.spawnZombie();
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.error === 'function') {
                console.error('Failed to respawn zombie after navmesh recovery enqueue.', error);
              }
              break;
            }
          }
          this.lastZombieSpawn = this.elapsed;
        }
        this.mobNavmeshRecoveryQueue.zombie = Math.max(0, (this.mobNavmeshRecoveryQueue.zombie || 0) - (queued || 0));
      }
      const hasExplicitTarget = Number.isFinite(options.targetX) && Number.isFinite(options.targetZ);
      let targetX;
      let targetZ;
      if (hasExplicitTarget) {
        targetX = options.targetX;
        targetZ = options.targetZ;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const distance = baseRadius + (variance ? Math.random() * variance : 0);
        targetX = anchorX + Math.cos(angle) * distance;
        targetZ = anchorZ + Math.sin(angle) * distance;
      }
      let ground = Number.isFinite(options.targetSurfaceY)
        ? options.targetSurfaceY
        : this.sampleGroundHeight(targetX, targetZ);
      const navmesh = this.ensureNavigationMeshForActorPosition(actorType, targetX, targetZ, {
      const hasCoverage = Boolean(navmesh && navmesh.walkableCellCount);
      mob.navChunkKey = hasCoverage ? chunkKey ?? mob.navChunkKey ?? null : null;
      if (!hasCoverage && typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('Mob failsafe teleport could not secure navmesh coverage — marking for cleanup.', {
          actorType,
          mobId: mob?.id ?? null,
          stage: options.stage || 'failsafe',
          chunkKey: chunkKey ?? null,
        });
      }
      return hasCoverage;
    }

    handleMobNavmeshFailure(actorType, mob, options = {}) {
      if (!mob || !mob.mesh || !mob.mesh.position) {
        return false;
      }
      const stage = typeof options.stage === 'string' && options.stage.length ? options.stage : 'navmesh';
      const reason = typeof options.reason === 'string' && options.reason.length ? options.reason : 'navmesh-missing';
      const chunkKey =
        typeof options.chunkKey === 'string' && options.chunkKey.length
          ? options.chunkKey
          : options.chunkKey === null
            ? null
            : mob.navChunkKey ?? null;
      const failsafeRadius = Number.isFinite(options.failsafeRadius)
        ? Math.max(0, options.failsafeRadius)
        : actorType === 'golem'
          ? 4.5
          : 6;
      const failsafeRadiusVariance = Number.isFinite(options.failsafeRadiusVariance)
        ? Math.max(0, options.failsafeRadiusVariance)
        : actorType === 'golem'
          ? 2.5
          : failsafeRadius * 0.5;
      const heightOffset = Number.isFinite(options.heightOffset)
        ? options.heightOffset
        : actorType === 'golem'
          ? 1.1
          : 0.9;
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('Mob navmesh failsafe engaged — attempting to relocate actor.', {
          actorType,
          mobId: mob?.id ?? null,
          stage,
          reason,
          chunkKey,
        });
      }
      let anchorVector = null;
      if (this.THREE && typeof this.THREE.Vector3 === 'function') {
        if (!this.tmpVector6 || typeof this.tmpVector6.set !== 'function') {
          this.tmpVector6 = new this.THREE.Vector3();
        }
        anchorVector = this.tmpVector6;
      }
      const anchorPosition = this.getPlayerWorldPosition(anchorVector);
      const anchorNavmesh = this.ensureNavigationMeshForActorPosition(
        actorType,
        Number.isFinite(anchorPosition?.x) ? anchorPosition.x : 0,
        Number.isFinite(anchorPosition?.z) ? anchorPosition.z : 0,
        {
          reason: 'navmesh-anchor',
          stage: `${stage}-anchor`,
          mobId: mob?.id ?? null,
        },
      );
      const relocationAttempts = [];
      if (anchorNavmesh?.walkableCellCount && Array.isArray(anchorNavmesh.cells) && anchorNavmesh.cells.length) {
        const anchorIndex = Math.min(
          anchorNavmesh.cells.length - 1,
          Math.floor(Math.random() * anchorNavmesh.cells.length),
        );
        const anchorCell = anchorNavmesh.cells[anchorIndex];
        if (anchorCell) {
          relocationAttempts.push({
            stage: `${stage}-anchor`,
            targetX: anchorCell.worldX,
            targetZ: anchorCell.worldZ,
            surfaceY: anchorCell.surfaceY,
          });
        }
      }
      const maxAttempts = Number.isFinite(options.maxAttempts)
        ? Math.max(1, Math.floor(options.maxAttempts))
        : 4;
      let success = false;
      for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
        const attempt = relocationAttempts[attemptIndex] || null;
        const attemptStage = attempt?.stage ?? `${stage}-rehoming-${attemptIndex + 1}`;
        const teleported = this.teleportMobToFailsafe(actorType, mob, {
          stage: attemptStage,
          failsafeRadius,
          failsafeRadiusVariance,
          heightOffset,
          cooldownAfterTeleport: Number.isFinite(options.cooldownAfterTeleport)
            ? Math.max(0, options.cooldownAfterTeleport)
            : 2.5,
          mobId: mob?.id ?? null,
          ...(attempt
            ? {
                targetX: attempt.targetX,
                targetZ: attempt.targetZ,
                targetSurfaceY: attempt.surfaceY,
              }
            : {}),
        });
        if (!teleported) {
          continue;
        }
        const position = mob.mesh.position;
        const newChunkKey = this.getChunkKeyForWorldPosition(position.x, position.z);
        if (!newChunkKey) {
          continue;
        }
        const navmesh = this.ensureNavigationMeshForActorChunk(actorType, newChunkKey, {
          reason: 'navmesh-rehome',
          stage: attemptStage,
          mobId: mob?.id ?? null,
        });
        if (!navmesh || !navmesh.walkableCellCount) {
          continue;
        }
        mob.navChunkKey = newChunkKey;
        success = true;
        break;
      }
      if (success) {
        return true;
      }
      this.warnAiMovementFailure(actorType, {
        stage,
        reason: `${reason}-failsafe`,
        chunkKey,
        mobId: mob?.id ?? null,
        throttleMs: 0,
      });
      this.enqueueMobNavmeshRecovery(actorType);
      this.despawnMob(actorType, mob, {
        stage,
        reason: `${reason}-despawn`,
        chunkKey,
      });
      return false;
    }

    despawnMob(actorType, mob, options = {}) {
      if (!mob) {
        return false;
      }
      const stage = typeof options.stage === 'string' && options.stage.length ? options.stage : 'navmesh';
      const reason = typeof options.reason === 'string' && options.reason.length ? options.reason : 'navmesh-despawn';
      const chunkKey =
        typeof options.chunkKey === 'string' && options.chunkKey.length
          ? options.chunkKey
          : options.chunkKey === null
            ? null
            : mob.navChunkKey ?? null;
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('Despawning mob after unrecoverable navigation failure.', {
          actorType,
          mobId: mob?.id ?? null,
          stage,
          reason,
          chunkKey,
        });
      }
      if (actorType === 'zombie') {
        this.removeZombie(mob);
        return true;
      }
      if (actorType === 'golem') {
        this.removeGolem(mob);
        return true;
      }
      const collectionName = actorType && `${actorType}s`;
      const collection = collectionName && Array.isArray(this[collectionName]) ? this[collectionName] : null;
      if (collection) {
        const index = collection.indexOf(mob);
        if (index >= 0) {
          collection.splice(index, 1);
        }
      }
      if (mob.animation) {
        this.disposeAnimationRig(mob.animation);
        mob.animation = null;
      }
      if (mob.mesh?.parent && typeof mob.mesh.parent.remove === 'function') {
        try {
          mob.mesh.parent.remove(mob.mesh);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to detach mob mesh during despawn.', error);
          }
        }
      }
      if (mob.mesh) {
        disposeObject3D(mob.mesh);
      }
    enqueueMobNavmeshRecovery(actorType) {
      const key = actorType === 'zombie' ? 'zombie' : actorType === 'golem' ? 'golem' : null;
      if (!key) {
        return;
      }
      if (!this.mobNavmeshRecoveryQueue || typeof this.mobNavmeshRecoveryQueue !== 'object') {
        this.mobNavmeshRecoveryQueue = { zombie: 0, golem: 0 };
      }
      const cap = key === 'zombie' ? ZOMBIE_MAX_PER_DIMENSION : key === 'golem' ? GOLEM_MAX_PER_DIMENSION : 1;
      const current = Number.isFinite(this.mobNavmeshRecoveryQueue[key]) ? this.mobNavmeshRecoveryQueue[key] : 0;
      this.mobNavmeshRecoveryQueue[key] = Math.min(cap, current + 1);
    }

        if (!golem || !golem.mesh || !golem.mesh.position) {
          this.despawnMob('golem', golem, { stage: 'escort', reason: 'mesh-missing' });
          continue;
        }
        if (!this.golems.includes(golem)) {
          continue;
        }
        let golemChunkKey = this.getChunkKeyForWorldPosition(golem.mesh.position.x, golem.mesh.position.z);
        const golemNavmesh = this.ensureNavigationMeshForActorPosition(
          'golem',
          golem.mesh.position.x,
          golem.mesh.position.z,
          {
            reason: 'golem-chase',
            stage: 'current',
            golemId: golem.id,
          },
        );
        if (!golemChunkKey || !golemNavmesh || !golemNavmesh.walkableCellCount) {
          const recovered = this.handleMobNavmeshFailure('golem', golem, {
            stage: target ? 'intercept' : 'escort',
            reason: !golemChunkKey
              ? 'chunk-missing'
              : golemNavmesh
                ? 'navmesh-empty'
                : 'navmesh-missing',
            chunkKey: golemChunkKey ?? null,
            failsafeRadius: 4.5,
            failsafeRadiusVariance: 2.5,
            heightOffset: 1.1,
          });
          if (!recovered || !this.golems.includes(golem)) {
            continue;
          }
          golemChunkKey = golem.navChunkKey ?? this.getChunkKeyForWorldPosition(golem.mesh.position.x, golem.mesh.position.z);
          if (!golemChunkKey) {
            this.despawnMob('golem', golem, {
              stage: target ? 'intercept' : 'escort',
              reason: 'navmesh-unrecoverable',
            });
            continue;
          }
        } else {
          golem.navChunkKey = golemChunkKey;
        }
      if (this.mobNavmeshRecoveryQueue?.golem) {
        const capacity = Math.max(0, GOLEM_MAX_PER_DIMENSION - this.golems.length);
        const queued = Math.max(0, Math.min(this.mobNavmeshRecoveryQueue.golem || 0, capacity));
        if (queued > 0 && shouldSpawnGuard) {
          for (let i = 0; i < queued; i += 1) {
            try {
              this.spawnGolem();
            } catch (error) {
              if (typeof console !== 'undefined' && typeof console.error === 'function') {
                console.error('Failed to respawn golem after navmesh recovery enqueue.', error);
              }
              break;
            }
          }
          this.lastGolemSpawn = this.elapsed;
        }
        this.mobNavmeshRecoveryQueue.golem = Math.max(0, (this.mobNavmeshRecoveryQueue.golem || 0) - (queued || 0));
      }
