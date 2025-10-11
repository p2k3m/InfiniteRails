      const spawnOptions = options.spawn ?? options.transition?.spawn ?? null;
      const playerSpawnTarget = spawnOptions?.player ?? null;
        this.positionPlayer({ target: playerSpawnTarget, reason });
    reloadWorld(options = {}) {
      const reasonRaw = typeof options.reason === 'string' ? options.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'world-reload';
      const navmeshReasonRaw = typeof options.navmeshReason === 'string' ? options.navmeshReason.trim() : '';
      const navmeshReason = navmeshReasonRaw.length ? navmeshReasonRaw : reason;
      this.buildTerrain({ reason, navmeshReason });
      this.populateSceneAfterTerrain({
        reason,
        buildReason: reason,
        spawn: options.spawn ?? options.transition?.spawn ?? null,
        mobs: options.mobs ?? {},
        transition: options.transition ?? null,
      });
      this.buildRails();
      this.refreshPortalState();
      return { reason };
    }

      this.positionPlayer({ reason: 'respawn' });
      this.populateSceneAfterTerrain({
        reason: 'dimension-transition',
        spawn: transition?.spawn ?? null,
      });
        this.populateSceneAfterTerrain({
          reason,
          spawn: context.transition?.spawn ?? null,
        });
    resolvePlayerSpawnTarget(target, options = {}) {
      const fallbackGrid = Math.floor(WORLD_SIZE / 2);
      const clampIndex = (value) => Math.max(0, Math.min(WORLD_SIZE - 1, Math.round(value)));
      const candidates = [];
      if (target && typeof target === 'object') {
        if (Number.isFinite(target.gridX) && Number.isFinite(target.gridZ)) {
          candidates.push({
            gridX: clampIndex(target.gridX),
            gridZ: clampIndex(target.gridZ),
          });
        } else if (Number.isFinite(target.x) && Number.isFinite(target.z)) {
          const gridX = clampIndex(target.x / BLOCK_SIZE + WORLD_SIZE / 2);
          const gridZ = clampIndex(target.z / BLOCK_SIZE + WORLD_SIZE / 2);
          candidates.push({ gridX, gridZ });
        }
      }
      candidates.push({ gridX: fallbackGrid, gridZ: fallbackGrid });
      for (const candidate of candidates) {
        const columnKey = `${candidate.gridX}|${candidate.gridZ}`;
        let column = this.columns?.get?.(columnKey) || null;
        if (!Array.isArray(column) || column.length === 0) {
          const half = WORLD_SIZE / 2;
          const worldX = (candidate.gridX - half) * BLOCK_SIZE;
          const worldZ = (candidate.gridZ - half) * BLOCK_SIZE;
          try {
            if (typeof this.spawnSafetyBlockAtPlayerFeetIfNeeded === 'function') {
              this.spawnSafetyBlockAtPlayerFeetIfNeeded(worldX, worldZ);
            }
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Failed to spawn safety block while resolving player spawn.', error);
            }
          }
          column = this.columns?.get?.(columnKey) || null;
        }
        if (Array.isArray(column) && column.length) {
          const top = column[column.length - 1];
          if (!top?.position) {
            continue;
          }
          const spawn = {
            x: top.position.x ?? 0,
            y: (top.position.y ?? 0) + PLAYER_EYE_HEIGHT,
            z: top.position.z ?? 0,
            gridX: candidate.gridX,
            gridZ: candidate.gridZ,
            columnKey,
          };
          return spawn;
        }
      }
      const reason = typeof options.reason === 'string' ? options.reason : 'spawn';
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('Unable to resolve player spawn column — falling back to safe spawn box.', {
          reason,
          target,
        });
      }
      return null;
    }

    positionPlayer(options = {}) {
      const reasonRaw = typeof options.reason === 'string' ? options.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'spawn';
      const spawnTarget = options?.target ?? null;
      const spawn = this.resolvePlayerSpawnTarget(spawnTarget, { reason });
      if (spawn) {
          this.playerRig.position.set(spawn.x, spawn.y, spawn.z);
          this.camera.position.set(spawn.x, spawn.y, spawn.z);
        this.playerChunkKey = spawn.columnKey || this.getChunkKeyForWorldPosition(spawn.x, spawn.z);
        if (typeof this.ensureNavigationMeshForWorldPosition === 'function') {
          try {
            this.ensureNavigationMeshForWorldPosition(spawn.x, spawn.z, {
              reason: `${reason}-player-spawn`,
            });
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
              console.debug('Failed to ensure navigation mesh for player spawn.', error);
            }
          }
        return spawn;
      const safeBox = this.ensureSafeSpawnBox('missing-spawn-column');
      const floorHeight = Number.isFinite(safeBox?.userData?.floorHeight)
        ? safeBox.userData.floorHeight
        : BLOCK_SIZE;
      const spawnY = floorHeight + PLAYER_EYE_HEIGHT;
      if (this.playerRig) {
        this.playerRig.position.set(0, spawnY, 0);
      } else if (this.camera) {
        this.camera.position.set(0, spawnY, 0);
      }
      this.playerChunkKey = this.getChunkKeyForWorldPosition(0, 0) || null;
      return null;
      this.positionPlayer({ reason: 'reset-position' });
      this.positionPlayer({ reason: 'respawn' });
        reloadWorld: (opts) => this.reloadWorld(opts || {}),
