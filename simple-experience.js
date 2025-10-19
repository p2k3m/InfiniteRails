      if (typeof this.emitGameEvent === 'function') {
        const reasonLabel =
          typeof metrics.reason === 'string' && metrics.reason.trim().length
            ? metrics.reason.trim()
            : 'world-generation';
        const dimensionDetail = (() => {
          const id =
            typeof this.dimensionSettings?.id === 'string' && this.dimensionSettings.id.trim().length
              ? this.dimensionSettings.id.trim()
              : null;
          const name =
            typeof this.dimensionSettings?.name === 'string' && this.dimensionSettings.name.trim().length
              ? this.dimensionSettings.name.trim()
              : null;
          const label =
            typeof this.dimensionSettings?.label === 'string' && this.dimensionSettings.label.trim().length
              ? this.dimensionSettings.label.trim()
              : null;
          return id || name || label ? { id, name, label } : null;
        })();
        const descriptor = dimensionDetail?.label || dimensionDetail?.name || null;
        let title;
        if (reasonLabel === 'dimension-transition') {
          title = descriptor ? `Shifting to ${descriptor}…` : 'Stabilising new dimension…';
        } else if (reasonLabel === 'world-reload') {
          title = descriptor ? `Rebuilding ${descriptor}…` : 'Rebuilding world…';
        } else if (reasonLabel === 'session-start') {
          title = descriptor ? `Stabilising ${descriptor}…` : 'Preparing expedition…';
        } else {
          title = descriptor ? `Stabilising ${descriptor}…` : 'Generating world…';
        }
        const message = descriptor
          ? `Calibrating ${descriptor} terrain and portal anchors.`
          : 'Calibrating terrain and portal anchors.';
        this.emitGameEvent('world-generation-start', {
          reason: reasonLabel,
          title,
          message,
          dimension: dimensionDetail ?? undefined,
          totalColumns: Number.isFinite(metrics.columns) ? metrics.columns : WORLD_SIZE * WORLD_SIZE,
        });
      }
      if (typeof this.emitGameEvent === 'function') {
        const reasonLabel =
          typeof metrics.reason === 'string' && metrics.reason.trim().length
            ? metrics.reason.trim()
            : 'world-generation';
        const dimensionDetail = (() => {
          const id =
            typeof this.dimensionSettings?.id === 'string' && this.dimensionSettings.id.trim().length
              ? this.dimensionSettings.id.trim()
              : null;
          const name =
            typeof this.dimensionSettings?.name === 'string' && this.dimensionSettings.name.trim().length
              ? this.dimensionSettings.name.trim()
              : null;
          const label =
            typeof this.dimensionSettings?.label === 'string' && this.dimensionSettings.label.trim().length
              ? this.dimensionSettings.label.trim()
              : null;
          return id || name || label ? { id, name, label } : null;
        })();
        const eventDetail = {
          reason: reasonLabel,
          durationMs: Number.isFinite(metrics.durationMs) ? metrics.durationMs : null,
          voxels: Number.isFinite(metrics.voxels) ? metrics.voxels : null,
          chunkCount: Number.isFinite(metrics.chunkCount) ? metrics.chunkCount : null,
          heightmapSource: metrics.heightmapSource ?? null,
          fallbackReason: metrics.fallbackReason ?? null,
          dimension: dimensionDetail ?? undefined,
          summary: summaryStats ?? null,
          navigation: {
            columns: metrics.columns,
          },
        };
        if (context?.heightmapResult) {
          eventDetail.heightmap = {
            source: context.heightmapResult.source ?? null,
            fallbackReason: context.heightmapResult.fallbackReason ?? null,
            fallbackFromStream: context.heightmapResult.fallbackFromStream ?? null,
          };
        }
        this.emitGameEvent('world-generation-complete', eventDetail);
      }
        const errorName =
          typeof error?.name === 'string' && error.name.trim().length ? error.name.trim() : undefined;
        const errorStack =
          typeof error?.stack === 'string' && error.stack.trim().length ? error.stack.trim() : undefined;
          errorName,
          stack: errorStack,
        const worldGenMetrics = this.performanceMetrics?.worldGen;
        const worldGenCompleted = Number.isFinite(worldGenMetrics?.completedAt);
        if (!worldGenCompleted && typeof this.emitGameEvent === 'function') {
          const reasonLabel =
            typeof worldGenMetrics?.reason === 'string' && worldGenMetrics.reason.trim().length
              ? worldGenMetrics.reason.trim()
              : 'start';
          const dimensionDetail = (() => {
            const id =
              typeof this.dimensionSettings?.id === 'string' && this.dimensionSettings.id.trim().length
                ? this.dimensionSettings.id.trim()
                : null;
            const name =
              typeof this.dimensionSettings?.name === 'string' && this.dimensionSettings.name.trim().length
                ? this.dimensionSettings.name.trim()
                : null;
            const label =
              typeof this.dimensionSettings?.label === 'string' && this.dimensionSettings.label.trim().length
                ? this.dimensionSettings.label.trim()
                : null;
            return id || name || label ? { id, name, label } : null;
          })();
          this.emitGameEvent('world-generation-complete', {
            reason: reasonLabel,
            error: {
              message: errorMessage,
              name: errorName ?? null,
              stack: errorStack ?? null,
            },
            dimension: dimensionDetail ?? undefined,
          });
        }
