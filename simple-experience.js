        } else if (assetsVerified === false) {
          const failureMessage = 'World load failure detected — resetting portal alignment.';
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
                  allowIncompleteTransition: transitionGuard?.allowIncompleteTransition ?? null,
                  resetOnWorldFailure: transitionGuard?.resetOnWorldFailure ?? null,
                  resetOnDimensionFailure: transitionGuard?.resetOnDimensionFailure ?? null,
                },
                reason: guardReason,
                worldLoadFailed: true,
                dimensionLoadFailed: false,
              },
              { level: 'warning' },
            );
          }
