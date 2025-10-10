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
