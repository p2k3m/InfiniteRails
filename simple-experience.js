      this.assetLoadMetadata = {
        textures: new Map(),
        models: new Map(),
        audio: new Map(),
      };
      this.audioBootProgressScheduled = false;
    beginAssetTimer(kind, key, meta = {}) {
      const metadataMap = this.assetLoadMetadata?.[kind] || null;
      let metadataEntry = null;
      if (metadataMap) {
        metadataEntry = {};
        if (meta && typeof meta === 'object') {
          if (meta.boot === true) {
            metadataEntry.boot = true;
          }
          if (meta.bootOnly === true) {
            metadataEntry.bootOnly = true;
          }
          if (typeof meta.url === 'string' && meta.url.trim().length) {
            metadataEntry.url = meta.url.trim();
          }
          if (typeof meta.source === 'string' && meta.source.trim().length) {
            metadataEntry.source = meta.source.trim();
          }
          if (typeof meta.label === 'string' && meta.label.trim().length) {
            metadataEntry.label = meta.label.trim();
          }
        }
        metadataMap.set(key, metadataEntry);
      }
      const eventDetail = { kind, key };
      if (metadataEntry) {
        if (metadataEntry.boot) {
          eventDetail.boot = true;
        }
        if (metadataEntry.bootOnly) {
          eventDetail.bootOnly = true;
        }
        if (metadataEntry.url) {
          eventDetail.url = metadataEntry.url;
        }
        if (metadataEntry.source) {
          eventDetail.source = metadataEntry.source;
        }
        if (metadataEntry.label) {
          eventDetail.label = metadataEntry.label;
        }
      }
      this.emitGameEvent('asset-fetch-start', eventDetail);
      const metadataMap = this.assetLoadMetadata?.[kind] || null;
      const metadataEntry = metadataMap?.get?.(key) || null;
      if (metadataMap && metadataMap.has(key)) {
        metadataMap.delete(key);
      }
      const resolvedUrl = (() => {
        if (typeof details.url === 'string' && details.url.trim().length) {
          return details.url.trim();
        }
        if (metadataEntry?.url && metadataEntry.url.length) {
          return metadataEntry.url;
        }
        if (metadataEntry?.source && metadataEntry.source.length) {
          return metadataEntry.source;
        }
        return null;
      })();
        url: resolvedUrl,
      if (metadataEntry?.source && metadataEntry.source.length) {
        entry.source = metadataEntry.source;
      }
      if (metadataEntry?.label && metadataEntry.label.length) {
        entry.label = metadataEntry.label;
      }
      if (metadataEntry?.boot) {
        entry.boot = true;
      }
      if (metadataEntry?.bootOnly) {
        entry.bootOnly = true;
      }
      if (details.boot === true) {
        entry.boot = true;
      }
      if (details.bootOnly === true) {
        entry.bootOnly = true;
      }
      if (typeof details.label === 'string' && details.label.trim().length) {
        entry.label = details.label.trim();
      }
      if (typeof details.source === 'string' && details.source.trim().length) {
        entry.source = details.source.trim();
        if (!entry.url) {
          entry.url = entry.source;
        }
      }
    loadExternalVoxelTexture(key, options = {}) {
      const primarySource = sources.length ? sources[0] : null;
      const textureLabel =
        typeof options?.label === 'string' && options.label.trim().length
          ? options.label.trim()
          : null;
      const bootMeta = {
        boot: options?.boot === true,
        source: typeof options?.source === 'string' && options.source.trim().length ? options.source.trim() : primarySource,
        label: textureLabel,
      };
      this.beginAssetTimer('textures', key, bootMeta);
      const listBootSampleNames = () =>
        Array.from(available)
          .map((name) => (typeof name === 'string' ? name.trim() : ''))
          .filter((name) => name.length)
          .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          getBootSampleNames: () => listBootSampleNames(),
        getBootSampleNames() {
          return listBootSampleNames();
        },
    loadModel(key, overrideUrl, options = {}) {
      const modelLabel =
        typeof options?.label === 'string' && options.label.trim().length
          ? options.label.trim()
          : null;
      this.beginAssetTimer('models', key, {
        boot: options?.boot === true,
        url,
        label: modelLabel,
      });
      const texturePlan = textureKeys.map((key) => {
        let primarySource = null;
        try {
          const sourceList = this.getExternalTextureSources(key);
          if (Array.isArray(sourceList) && sourceList.length) {
            primarySource = sourceList[0];
          }
        } catch (error) {}
        return { key, source: typeof primarySource === 'string' ? primarySource : null };
      });
      const texturePlanMap = new Map(texturePlan.map((entry) => [entry.key, entry]));
      const modelPlan = modelEntries.map((entry) => ({
        key: entry?.key,
        url:
          typeof entry?.url === 'string' && entry.url.trim().length
            ? entry.url.trim()
            : null,
      }));
      const modelPlanMap = new Map(
        modelPlan.filter((entry) => typeof entry.key === 'string').map((entry) => [entry.key, entry]),
      );
      const audioSampleNames =
        typeof this.audio?.getBootSampleNames === 'function'
          ? this.audio.getBootSampleNames()
          : [];
      const audioPlan = audioSampleNames
        .map((name) => (typeof name === 'string' ? name.trim() : ''))
        .filter((name) => name.length)
        .map((name) => ({ key: name }));

      this.emitGameEvent('asset-preload-plan', {
        textures: texturePlan,
        models: modelPlan,
        audio: audioPlan,
      });

      if (!this.audioBootProgressScheduled && audioPlan.length) {
        this.audioBootProgressScheduled = true;
        const schedulerScope =
          typeof window !== 'undefined'
            ? window
            : typeof globalThis !== 'undefined'
              ? globalThis
              : typeof global !== 'undefined'
                ? global
                : null;
        const schedule =
          typeof schedulerScope?.setTimeout === 'function'
            ? schedulerScope.setTimeout.bind(schedulerScope)
            : (callback, timeout) => setTimeout(callback, timeout);
        audioPlan.forEach((entry, index) => {
          schedule(() => {
            const sampleKey = entry.key;
            this.emitGameEvent('asset-fetch-start', {
              kind: 'audio',
              key: sampleKey,
              boot: true,
              bootOnly: true,
              label: sampleKey,
            });
            const success =
              typeof this.audio?.has === 'function' ? this.audio.has(sampleKey) : true;
            this.emitGameEvent('asset-fetch-complete', {
              kind: 'audio',
              key: sampleKey,
              boot: true,
              bootOnly: true,
              duration: 0,
              status: success ? 'fulfilled' : 'failed',
              success,
              label: sampleKey,
            });
          }, index * 8);
        });
      }

        const planEntry = texturePlanMap.get(key) || null;
        const textureOptions = { boot: true };
        if (planEntry?.source) {
          textureOptions.source = planEntry.source;
        } else if (planEntry?.key) {
          textureOptions.label = planEntry.key;
        } else {
          textureOptions.label = key;
        }
          this.loadExternalVoxelTexture(key, textureOptions)
          this.loadModel(key, (modelPlanMap.get(key) || {}).url ?? url, { boot: true }).catch((error) => {
