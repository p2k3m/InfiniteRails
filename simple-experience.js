          workerMesh: null,
          workerSupport: {
            world: false,
            mesh: false,
          },
      const workerMeshSummary =
        summaryStats?.workerMesh ||
        (context?.workerResult?.mesh && typeof this.normaliseWorkerMeshResult === 'function'
          ? this.normaliseWorkerMeshResult(context.workerResult.mesh, { chunkSize: this.terrainChunkSize })
          : null);
      if (!metrics.workerSupport || typeof metrics.workerSupport !== 'object') {
        metrics.workerSupport = { world: false, mesh: false };
      }
      metrics.workerSupport.world = summaryStats?.heightmapSource === 'worker-generated';
      if (workerMeshSummary) {
        metrics.workerSupport.mesh = true;
        metrics.workerMesh = {
          source: workerMeshSummary.source ?? 'worker-prepared',
          chunkSize: Number.isFinite(workerMeshSummary.chunkSize) ? workerMeshSummary.chunkSize : null,
          chunkCount: Number.isFinite(workerMeshSummary.chunkCount) ? workerMeshSummary.chunkCount : null,
          meshCount: Number.isFinite(workerMeshSummary.meshCount) ? workerMeshSummary.meshCount : null,
          vertexCount: Number.isFinite(workerMeshSummary.vertexCount) ? workerMeshSummary.vertexCount : null,
          generatedAt: workerMeshSummary.workerGeneratedAt ?? null,
        };
      } else if (!metrics.workerMesh) {
        metrics.workerMesh = null;
      }
    normaliseWorkerMeshResult(result, options = {}) {
      if (!result || typeof result !== 'object') {
        return null;
      }
      const normaliseInt = (value, fallback = null) =>
        Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
      const inferredChunkSize = Number.isFinite(options.chunkSize)
        ? Math.max(1, Math.floor(options.chunkSize))
        : Number.isFinite(this.terrainChunkSize)
          ? Math.max(1, Math.floor(this.terrainChunkSize))
          : 16;
      const chunkSize = normaliseInt(result.chunkSize, inferredChunkSize) ?? inferredChunkSize;
      const chunkList = Array.isArray(result.chunks) ? result.chunks : [];
      const chunkSummaries = chunkList.map((chunk) => {
        const chunkX = normaliseInt(chunk?.chunkX, 0) ?? 0;
        const chunkZ = normaliseInt(chunk?.chunkZ, 0) ?? 0;
        const meshEntries = Array.isArray(chunk?.meshes) ? chunk.meshes : [];
        const meshCount = normaliseInt(chunk?.meshCount, meshEntries.length) ?? meshEntries.length;
        const key = typeof chunk?.key === 'string' && chunk.key.trim().length
          ? chunk.key.trim()
          : `${chunkX}|${chunkZ}`;
        return {
          key,
          chunkX,
          chunkZ,
          meshCount,
        };
      });
      const chunkCount = normaliseInt(result.chunkCount, chunkSummaries.length) ?? chunkSummaries.length;
      const meshCount = normaliseInt(
        result.meshCount,
        chunkSummaries.reduce((sum, entry) => sum + normaliseInt(entry.meshCount, 0), 0),
      ) ?? 0;
      const vertexCount = normaliseInt(result.vertexCount, meshCount * 24) ?? meshCount * 24;
      return {
        source: 'worker-prepared',
        chunkSize,
        chunkCount,
        meshCount,
        vertexCount,
        workerGeneratedAt: Number.isFinite(result.generatedAt) ? result.generatedAt : null,
        chunks: chunkSummaries,
      };
    }

      const workerOutputs =
        options && typeof options === 'object' && options.workerResult && typeof options.workerResult === 'object'
          ? options.workerResult
          : null;
      const workerMeshResult = workerOutputs?.mesh ?? null;
        const workerMeshSummary = workerMeshResult
          ? this.normaliseWorkerMeshResult(workerMeshResult, { chunkSize: this.terrainChunkSize })
          : null;
        if (workerMeshSummary) {
          this.lastWorkerMeshSummary = workerMeshSummary;
          if (typeof console !== 'undefined' && typeof console.info === 'function') {
            console.info(
              `Worker mesh preparation summary — ${workerMeshSummary.meshCount} meshes across ${workerMeshSummary.chunkCount} chunks.`,
              {
                chunkSize: workerMeshSummary.chunkSize,
                vertexCount: workerMeshSummary.vertexCount,
              },
            );
          }
        } else {
          this.lastWorkerMeshSummary = null;
        }
            workerMesh: workerMeshSummary,
          workerMesh: workerMeshSummary,
      this.markWorldGenerationComplete(buildReason, {
        summary,
        heightmapResult,
        workerResult: workerOutputs ?? null,
      });
