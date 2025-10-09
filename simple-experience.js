        const requestedNormalized = normaliseAudioName(requestedName);
        const resolvedNormalized = normaliseAudioName(resolvedName);
        const aliasCandidateList = [];
        const aliasCandidateSeen = new Set();
        const aliasLookupVisited = new Set();
        const pushAliasCandidate = (candidate) => {
          if (!candidate || candidate === fallbackBeepName) {
            return;
          }
          if (candidate === requestedNormalized || candidate === resolvedNormalized) {
            return;
          }
          if (aliasCandidateSeen.has(candidate)) {
            return;
          }
          aliasCandidateSeen.add(candidate);
          aliasCandidateList.push(candidate);
        };
        const includeAliasCandidatesForName = (name) => {
          const normalized = normaliseAudioName(name);
          if (!normalized || normalized === fallbackBeepName) {
            return;
          }
          if (aliasLookupVisited.has(normalized)) {
            return;
          }
          aliasLookupVisited.add(normalized);
          const aliasValues = aliasMap.get(normalized);
          if (!aliasValues) {
            return;
          }
          aliasValues.forEach((value) => {
            const candidate = normaliseAudioName(value);
            if (!candidate || candidate === normalized || candidate === fallbackBeepName) {
              return;
            }
            pushAliasCandidate(candidate);
            includeAliasCandidatesForName(candidate);
          });
        };
        includeAliasCandidatesForName(requestedName);
        includeAliasCandidatesForName(resolvedName);
        if (Array.isArray(info?.aliasCandidates)) {
          info.aliasCandidates.forEach((value) => {
            const candidate = normaliseAudioName(value);
            if (!candidate || candidate === fallbackBeepName) {
              return;
            }
            pushAliasCandidate(candidate);
            includeAliasCandidatesForName(candidate);
          });
        }
        const fallbackCandidateList = [];
        if (Array.isArray(info?.fallbackCandidates)) {
          const fallbackSeen = new Set();
          info.fallbackCandidates.forEach((value) => {
            const candidate = normaliseAudioName(value);
            if (!candidate || candidate === fallbackBeepName) {
              return;
            }
            if (fallbackSeen.has(candidate)) {
              return;
            }
            fallbackSeen.add(candidate);
            fallbackCandidateList.push(candidate);
          });
        }
        if (aliasCandidateList.length) {
          detail.aliasCandidates = aliasCandidateList;
        }
        if (fallbackCandidateList.length) {
          detail.fallbackCandidates = fallbackCandidateList;
        }
