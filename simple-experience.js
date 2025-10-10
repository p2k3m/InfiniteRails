    async recoverFromIncompleteDimensionTransition(context = {}) {
      const reasonRaw = typeof context.reason === 'string' ? context.reason.trim() : '';
      const reason = reasonRaw.length ? reasonRaw : 'dimension-transition-reset';
      const previousIndex = Number.isFinite(context.previousIndex) ? context.previousIndex : null;
      const previousDimension = context.previousDimension ?? null;
      const failedDimension = context.failedDimension ?? null;
      const messageRaw = typeof context.message === 'string' ? context.message.trim() : '';
      const fallbackMessage = failedDimension
        ? `Dimension stabilisation failed — returning to ${
            previousDimension?.name || 'previous dimension'
          }.`
        : 'Dimension stabilisation failed — resetting portal alignment.';
      const message = messageRaw.length ? messageRaw : fallbackMessage;

      if (previousIndex !== null) {
        try {
          this.applyDimensionSettings(previousIndex);
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('Failed to restore previous dimension settings after transition guard.', error);
          }
          if (typeof notifyLiveDiagnostics === 'function') {
            notifyLiveDiagnostics(
              'dimension',
              'Failed to restore previous dimension settings after transition guard.',
              { error: normaliseLiveDiagnosticError(error), reason },
              { level: 'error' },
            );
          }
        }
      } else if (previousDimension) {
        this.dimensionSettings = previousDimension;
      }

      const terrainContext = { reason, navmeshReason: reason };

      try {
        this.buildTerrain(terrainContext);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('Failed to rebuild terrain after transition guard triggered.', error);
        }
        if (typeof notifyLiveDiagnostics === 'function') {
          notifyLiveDiagnostics(
            'dimension',
            'Failed to rebuild terrain after transition guard triggered.',
            { error: normaliseLiveDiagnosticError(error), reason },
            { level: 'error' },
          );
        }
      }

      try {
        this.populateSceneAfterTerrain({ reason });
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('Failed to repopulate scene after transition guard triggered.', error);
        }
        if (typeof notifyLiveDiagnostics === 'function') {
          notifyLiveDiagnostics(
            'dimension',
            'Failed to repopulate scene after transition guard triggered.',
            { error: normaliseLiveDiagnosticError(error), reason },
            { level: 'error' },
          );
        }
      }

      try {
        this.buildRails();
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('Failed to rebuild rails after transition guard triggered.', error);
        }
        if (typeof notifyLiveDiagnostics === 'function') {
          notifyLiveDiagnostics(
            'dimension',
            'Failed to rebuild rails after transition guard triggered.',
            { error: normaliseLiveDiagnosticError(error), reason },
            { level: 'error' },
          );
        }
      }

      try {
        this.refreshPortalState();
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('Failed to refresh portal state after transition guard triggered.', error);
        }
        if (typeof notifyLiveDiagnostics === 'function') {
          notifyLiveDiagnostics(
            'dimension',
            'Failed to refresh portal state after transition guard triggered.',
            { error: normaliseLiveDiagnosticError(error), reason },
            { level: 'error' },
          );
        }
      }

      const arrivalRules = this.buildDimensionRuleSummary(
        this.dimensionSettings ?? previousDimension ?? null,
        context.arrivalRulesOverride,
      );

      try {
        await this.handleDimensionPostInit({
          previousDimension: failedDimension ?? previousDimension ?? null,
          nextDimension: this.dimensionSettings ?? previousDimension ?? null,
          transition: context.transition ?? null,
          arrivalRules,
        });
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('Failed to run post-init hooks after transition guard triggered.', error);
        }
        if (typeof notifyLiveDiagnostics === 'function') {
          notifyLiveDiagnostics(
            'dimension',
            'Failed to run post-init hooks after transition guard triggered.',
            { error: normaliseLiveDiagnosticError(error), reason },
            { level: 'error' },
          );
        }
      }

      return message;
    }

        const previousIndex = this.currentDimensionIndex;
        let assetsVerified = null;
        assetsVerified = assetSummary ? assetSummary.allPresent === true : null;

        const transitionGuard = transitionResult?.transitionGuard ?? null;
        const guardReasonRaw = typeof transitionGuard?.reason === 'string' ? transitionGuard.reason.trim() : '';
        const guardReason = guardReasonRaw.length ? guardReasonRaw : 'dimension-transition-guard';
        const worldLoadFailed =
          transitionGuard?.resetOnWorldFailure === true && assetsVerified === false;
        const dimensionLoadFailed =
          transitionGuard?.resetOnDimensionFailure === true && dimensionTravelSucceeded === false;
        let scheduleReason = 'dimension-advanced';

        if (
          transitionGuard?.neverAllowIncompleteTransition === true &&
          (worldLoadFailed || dimensionLoadFailed)
        ) {
          const failureMessage = worldLoadFailed
            ? 'World load failure detected — resetting portal alignment.'
            : 'Dimension load failure detected — returning to previous realm.';
          let recoveryMessage = failureMessage;
          try {
            const result = await this.recoverFromIncompleteDimensionTransition({
              previousIndex,
              previousDimension: previousSettings,
              failedDimension: nextSettings,
              transition: transitionResult,
              reason: guardReason,
              message: failureMessage,
            });
            if (typeof result === 'string' && result.trim().length) {
              recoveryMessage = result.trim();
            }
          } catch (error) {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') {
              console.warn('Failed to recover from incomplete dimension transition.', error);
            }
            if (typeof notifyLiveDiagnostics === 'function') {
              notifyLiveDiagnostics(
                'dimension',
                'Failed to recover from incomplete dimension transition.',
                { error: normaliseLiveDiagnosticError(error), reason: guardReason },
                { level: 'error' },
              );
            }
          }
          dimensionTravelSucceeded = false;
          assetsVerified = false;
          portalLog = recoveryMessage;
          scheduleReason = guardReason;
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn(recoveryMessage);
          }
          if (typeof notifyLiveDiagnostics === 'function') {
            notifyLiveDiagnostics(
              'dimension',
              recoveryMessage,
              {
                guard: {
                  allowIncompleteTransition: transitionGuard.allowIncompleteTransition ?? null,
                  resetOnWorldFailure: transitionGuard.resetOnWorldFailure ?? null,
                  resetOnDimensionFailure: transitionGuard.resetOnDimensionFailure ?? null,
                },
                reason: guardReason,
                worldLoadFailed,
                dimensionLoadFailed,
              },
              { level: 'warning' },
            );
          }
        }

        this.scheduleScoreSync(scheduleReason);
        if (dimensionTravelSucceeded) {
          this.audio.play('bubble', { volume: 0.5 });
        }

(function attachNavigationFailsafe(scope) {
  if (!scope) {
    return;
  }

  function selectNavmeshCell(navmesh) {
    if (!navmesh || typeof navmesh !== 'object') {
      return null;
    }
    const cells = Array.isArray(navmesh.cells) ? navmesh.cells : [];
    if (!cells.length) {
      return null;
    }
    for (const cell of cells) {
      if (
        Number.isFinite(cell?.worldX) &&
        Number.isFinite(cell?.worldZ) &&
        Number.isFinite(cell?.surfaceY)
      ) {
        return cell;
      }
    }
    return null;
  }

  function rehomeActor(instance, actorType, actor, navmesh, context) {
    const cell = selectNavmeshCell(navmesh);
    if (!cell || !actor?.mesh?.position) {
      return false;
    }
    const yOffset = Number.isFinite(actor?.heightOffset) ? actor.heightOffset : 0.9;
    actor.mesh.position.set(cell.worldX, cell.surfaceY + yOffset, cell.worldZ);
    if (actor.mesh.userData && typeof actor.mesh.userData === 'object') {
      actor.mesh.userData.chunkKey = navmesh.key ?? actor.navChunkKey ?? actor.chunkKey ?? null;
    }
    if (actorType === 'zombie') {
      actor.navChunkKey = navmesh.key ?? actor.navChunkKey ?? null;
    } else if (actorType === 'golem') {
      actor.chunkKey = navmesh.key ?? actor.chunkKey ?? null;
    }
    if (typeof instance?.console?.warn === 'function') {
      instance.console.warn(
        'Navigation mesh recovery triggered. Rehoming mob after coverage loss.',
        { actorType, reason: context?.reason ?? 'navmesh-missing', stage: context?.stage ?? null },
      );
    } else if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('Navigation mesh recovery triggered. Rehoming mob after coverage loss.', {
        actorType,
        reason: context?.reason ?? 'navmesh-missing',
        stage: context?.stage ?? null,
      });
    }
    return true;
  }

  function despawnActor(instance, actorType, actor, context) {
    const listKey = actorType === 'golem' ? 'golems' : actorType === 'zombie' ? 'zombies' : null;
    const groupKey = actorType === 'golem' ? 'golemGroup' : actorType === 'zombie' ? 'zombieGroup' : null;

    if (groupKey && instance?.[groupKey]?.remove && actor?.mesh) {
      try {
        instance[groupKey].remove(actor.mesh);
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to detach mob mesh during navmesh failsafe.', error);
        }
      }
    } else if (actor?.mesh?.parent && typeof actor.mesh.parent.remove === 'function') {
      actor.mesh.parent.remove(actor.mesh);
    }

    if (listKey && Array.isArray(instance?.[listKey])) {
      const index = instance[listKey].indexOf(actor);
      if (index >= 0) {
        instance[listKey].splice(index, 1);
      }
    }

    if (typeof actor?.dispose === 'function') {
      try {
        actor.dispose();
      } catch (error) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('Failed to dispose mob resources during navmesh failsafe.', error);
        }
      }
    }

    if (typeof instance?.console?.warn === 'function') {
      instance.console.warn('Navigation mesh recovery triggered. Despawning mob after coverage loss.', {
        actorType,
        reason: context?.reason ?? 'navmesh-missing',
        stage: context?.stage ?? null,
      });
    } else if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('Navigation mesh recovery triggered. Despawning mob after coverage loss.', {
        actorType,
        reason: context?.reason ?? 'navmesh-missing',
        stage: context?.stage ?? null,
      });
    }

    return true;
  }

  function applyFailsafe(SimpleExperienceCtor) {
    if (!SimpleExperienceCtor?.prototype) {
      return;
    }

    const proto = SimpleExperienceCtor.prototype;

    if (proto.__navmeshFailsafeApplied) {
      return;
    }

    proto.__navmeshFailsafeApplied = true;

    proto.handleNavmeshFailureForMob = function handleNavmeshFailureForMob(actorType, actor, context = {}) {
      if (!actorType || !actor) {
        return { action: 'ignored' };
      }

      const reason = typeof context.reason === 'string' && context.reason.trim().length
        ? context.reason.trim()
        : 'navmesh-missing';

      const navmesh =
        (typeof this.ensureNavigationMeshForActorChunk === 'function'
          ? this.ensureNavigationMeshForActorChunk(actorType, context.chunkKey ?? actor.navChunkKey ?? actor.chunkKey ?? null, {
              ...context,
              reason: `${reason}-failsafe`,
              stage: 'failsafe',
            })
          : null) ||
        (typeof this.ensureNavigationMeshForWorldPosition === 'function' && actor?.mesh?.position
          ? this.ensureNavigationMeshForWorldPosition(actor.mesh.position.x, actor.mesh.position.z, {
              ...context,
              reason: `${reason}-failsafe`,
              stage: 'failsafe',
            })
          : null);

      if (navmesh && Number.isFinite(navmesh.walkableCellCount) && navmesh.walkableCellCount > 0) {
        const rehoused = rehomeActor(this, actorType, actor, navmesh, context);
        if (rehoused) {
          return { action: 'rehomed', reason, navmesh };
        }
      }

      despawnActor(this, actorType, actor, context);
      return { action: 'despawned', reason };
    };

    const originalEnsureActorPosition = proto.ensureNavigationMeshForActorPosition;

    if (typeof originalEnsureActorPosition === 'function') {
      proto.ensureNavigationMeshForActorPosition = function ensureNavigationMeshForActorPosition(actorType, x, z, context = {}) {
        const result = originalEnsureActorPosition.call(this, actorType, x, z, context);
        if (!result || result.walkableCellCount === 0) {
          const listKey = actorType === 'golem' ? 'golems' : actorType === 'zombie' ? 'zombies' : null;
          if (listKey && Array.isArray(this[listKey])) {
            for (const actor of this[listKey]) {
              if (!actor?.mesh?.position) {
                continue;
              }
              if (
                typeof x === 'number' &&
                typeof z === 'number' &&
                Math.abs(actor.mesh.position.x - x) < 1e-3 &&
                Math.abs(actor.mesh.position.z - z) < 1e-3
              ) {
                this.handleNavmeshFailureForMob(actorType, actor, {
                  ...context,
                  reason: context?.reason ?? 'navmesh-missing',
                });
              }
            }
          }
        }
        return result;
      };
    }
  }

  function installPatch() {
    const target = scope.SimpleExperience;
    if (target?.prototype) {
      applyFailsafe(target);
      return true;
    }
    return false;
  }

  if (installPatch()) {
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(scope, 'SimpleExperience');
  if (!descriptor || descriptor.configurable !== true) {
    return;
  }

  let currentValue = descriptor.value;

  Object.defineProperty(scope, 'SimpleExperience', {
    configurable: true,
    enumerable: descriptor.enumerable ?? true,
    get() {
      return currentValue;
    },
    set(value) {
      currentValue = value;
      installPatch();
    },
  });

  if (currentValue?.prototype) {
    applyFailsafe(currentValue);
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
