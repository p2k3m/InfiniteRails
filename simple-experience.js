          const allowDegradedStart = (() => {
            if (this.isRunningFromFileProtocol()) {
              return true;
            }
            try {
              return Boolean(typeof navigator !== 'undefined' && navigator.webdriver);
            } catch (automationCheckError) {
              if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Failed to detect automation context during asset preload fallback.', automationCheckError);
              }
              return false;
            }
          })();
          if (allowDegradedStart) {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') {
              console.warn(
                'Critical asset preload failed in a constrained environment. Continuing with fallback placeholders.',
                reason,
              );
            }
            markBootStatus('assets', 'warning', 'Critical textures unavailable — using placeholder colours.');
            markBootStatus('gltf', 'warning', 'Critical models unavailable — using placeholder meshes.');
            this.criticalAssetPreloadFailed = true;
            this.criticalAssetPreloadComplete = false;
            return {
              status: 'degraded',
              reason,
            };
          }
          this.criticalAssetPreloadFailed = true;
          this.criticalAssetPreloadComplete = false;
