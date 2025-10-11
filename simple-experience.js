    evacuateMobsFromNavmeshChunk(chunkKey, context = {}) {
      if (!chunkKey) {
        return;
      }
      const reasonRaw = typeof context.reason === 'string' ? context.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'navmesh-missing';
      const stageRaw = typeof context.stage === 'string' ? context.stage.trim() : '';
      const stage = stageRaw.length ? stageRaw : 'navmesh-evacuate';
      let fallbackNavmeshes = [];
      if (this.navigationMeshes instanceof Map) {
        fallbackNavmeshes = Array.from(this.navigationMeshes.values()).filter(
          (navmesh) => navmesh && navmesh.walkableCellCount > 0 && navmesh.key !== chunkKey,
        );
      }
      const scheduleFailsafe = (fn) => {
        if (typeof fn !== 'function') {
          return;
        }
        if (typeof queueMicrotask === 'function') {
          try {
            queueMicrotask(fn);
            return;
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('queueMicrotask scheduling failed; falling back to microtask promise.', error);
            }
          }
        }
        Promise.resolve()
          .then(fn)
          .catch((error) => {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Mob failsafe scheduling encountered an error.', error);
            }
          });
      };
      let playerChunkKey = null;
      if (typeof this.getPlayerWorldPosition === 'function') {
        try {
          const playerPosition = this.getPlayerWorldPosition(null);
          if (
            playerPosition &&
            Number.isFinite(playerPosition.x) &&
            Number.isFinite(playerPosition.z)
          ) {
            playerChunkKey = this.getChunkKeyForWorldPosition(playerPosition.x, playerPosition.z);
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to resolve player position while evacuating mobs from navmesh chunk.', error);
          }
        }
      }
      if (
        playerChunkKey &&
        playerChunkKey !== chunkKey &&
        typeof this.ensureNavigationMeshForChunk === 'function' &&
        !fallbackNavmeshes.some((navmesh) => navmesh?.key === playerChunkKey)
      ) {
        try {
          const fallbackNavmesh = this.ensureNavigationMeshForChunk(playerChunkKey, {
            reason: context?.reason ? `${context.reason}-fallback` : 'navmesh-evacuate-fallback',
            stage,
          });
          if (fallbackNavmesh?.walkableCellCount) {
            fallbackNavmeshes.push(fallbackNavmesh);
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Failed to prepare fallback navmesh while evacuating mobs.', error);
          }
        }
      }
      if (playerChunkKey) {
        const index = fallbackNavmeshes.findIndex((navmesh) => navmesh?.key === playerChunkKey);
        if (index > 0) {
          const [playerNavmesh] = fallbackNavmeshes.splice(index, 1);
          fallbackNavmeshes.unshift(playerNavmesh);
        }
      }
      const collections = [
        ['zombie', Array.isArray(this.zombies) ? [...this.zombies] : []],
        ['golem', Array.isArray(this.golems) ? [...this.golems] : []],
      ];
      for (const [actorType, mobs] of collections) {
        if (!mobs.length) {
          continue;
        }
        for (const mob of mobs) {
          if (!mob?.mesh?.position) {
            continue;
          }
          const mobChunkKey =
            typeof mob.navChunkKey === 'string' && mob.navChunkKey.length
              ? mob.navChunkKey
              : typeof mob.chunkKey === 'string' && mob.chunkKey.length
                ? mob.chunkKey
                : this.getChunkKeyForWorldPosition(mob.mesh.position.x, mob.mesh.position.z);
          if (mobChunkKey !== chunkKey) {
            continue;
          }
          let rehoused = false;
          for (const navmesh of fallbackNavmeshes) {
            if (
              navmesh &&
              typeof this.rehomeMobAfterNavmeshFailure === 'function' &&
              this.rehomeMobAfterNavmeshFailure(actorType, mob, navmesh, {
                ...context,
                reason,
                stage,
              })
            ) {
              mob.navChunkKey = navmesh.key ?? mob.navChunkKey ?? null;
              rehoused = true;
              break;
            }
          }
          if (rehoused) {
            continue;
          }
          if (typeof this.handleMobNavmeshFailure === 'function') {
            scheduleFailsafe(() => {
              this.handleMobNavmeshFailure(actorType, mob, {
                ...context,
                reason,
                stage,
                chunkKey,
              });
            });
            continue;
          }
          if (typeof this.handleNavmeshFailureForMob === 'function') {
            scheduleFailsafe(() => {
              this.handleNavmeshFailureForMob(actorType, mob, {
                ...context,
                reason,
                stage,
                chunkKey,
              });
            });
            continue;
          }
          if (typeof this.despawnMobAfterNavmeshFailure === 'function') {
            this.despawnMobAfterNavmeshFailure(actorType, mob, {
              ...context,
              reason,
              stage,
              chunkKey,
            });
          } else if (typeof this.despawnMob === 'function') {
            this.despawnMob(actorType, mob, {
              ...context,
              reason,
              stage,
              chunkKey,
            });
          }
        }
      }
    }

      if (!navmesh || !Number.isFinite(navmesh.walkableCellCount) || navmesh.walkableCellCount <= 0) {
        this.evacuateMobsFromNavmeshChunk(chunkKey, {
          ...options,
          reason: navmesh ? 'navmesh-empty' : 'navmesh-missing',
          stage: options.stage ?? 'navmesh-rebuild',
        });
