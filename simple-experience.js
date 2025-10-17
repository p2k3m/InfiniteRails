      const resolveAudioName = (name, options = {}) => {
        const stage = options?.stage || null;
        const useCache = !stage && options?.useCache !== false;
        if (useCache && aliasCache.has(lookupName)) {
          return aliasCache.get(lookupName);
        }
          const resolved = hasSamplePayload(lookupName, { stage }) ? lookupName : null;
          if (useCache) {
            aliasCache.set(lookupName, resolved);
          }
          return resolved;
        const visited = options?.visited || new Set();
        if (visited.has(lookupName)) {
          if (stage === 'boot') {
            bootMissingSamples.add(lookupName);
          }
          return null;
          if (stage === 'boot') {
            bootMissingSamples.add(lookupName);
          }
          if (useCache) {
            aliasCache.set(lookupName, null);
          }
        visited.add(lookupName);
          const candidateResult = resolveAudioName(candidate, {
            stage,
            visited,
            useCache,
          });
          if (candidateResult) {
            resolved = candidateResult;
        visited.delete(lookupName);
        if (useCache) {
          aliasCache.set(lookupName, resolved);
        }
        const resolved = resolveAudioName(aliasName, { stage: 'boot' });
