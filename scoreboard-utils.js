(function (globalFactory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = globalFactory();
  } else {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    globalScope.ScoreboardUtils = globalFactory();
  }
})(function () {
  function normalizeDimensionLabels(entry) {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const sources = [];
    const addSource = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        if (value.length) {
          sources.push(value);
        }
        return;
      }
      if (typeof value === 'string') {
        const segments = value
          .split(/[|,/\u2022\u2013\u2014]+/)
          .map((segment) => segment.trim())
          .filter(Boolean);
        if (segments.length) {
          sources.push(segments);
        }
      }
    };

    addSource(entry.dimensionLabels);
    addSource(entry.dimensionNames);
    addSource(entry.dimensionList);
    addSource(Array.isArray(entry.dimensions) ? entry.dimensions : null);
    addSource(Array.isArray(entry.realms) ? entry.realms : null);
    addSource(entry.dimensionSummary);

    const labels = [];
    const seen = new Set();
    sources.forEach((source) => {
      source.forEach((item) => {
        let label = null;
        if (typeof item === 'string') {
          label = item.trim();
        } else if (item && typeof item === 'object') {
          if (typeof item.name === 'string') {
            label = item.name.trim();
          } else if (typeof item.label === 'string') {
            label = item.label.trim();
          } else if (typeof item.id === 'string') {
            label = item.id.trim();
          }
        }
        if (label && !seen.has(label)) {
          seen.add(label);
          labels.push(label);
        }
      });
    });

    return labels;
  }

  function normalizeScoreEntries(entries = []) {
    return entries
      .map((entry) => ({
        id: entry.id ?? entry.googleId ?? entry.playerId ?? `guest-${Math.random().toString(36).slice(2)}`,
        name: entry.name ?? entry.displayName ?? 'Explorer',
        score: Number(entry.score ?? entry.points ?? 0),
        dimensionCount: Number(entry.dimensionCount ?? entry.dimensions ?? entry.realms ?? 0),
        runTimeSeconds: Number(entry.runTimeSeconds ?? entry.runtimeSeconds ?? entry.runtime ?? 0),
        inventoryCount: Number(entry.inventoryCount ?? entry.resources ?? entry.items ?? 0),
        location:
          entry.location ??
          (entry.latitude !== undefined && entry.longitude !== undefined
            ? { latitude: entry.latitude, longitude: entry.longitude }
            : null),
        locationLabel: entry.locationLabel ?? entry.location?.label ?? entry.locationName ?? null,
        updatedAt: entry.updatedAt ?? entry.lastUpdated ?? entry.updated_at ?? null,
        dimensionLabels: normalizeDimensionLabels(entry),
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  function upsertScoreEntry(entries, entry) {
    const next = entries.slice();
    const index = next.findIndex((item) => item.id === entry.id);
    if (index >= 0) {
      if ((entry.score ?? 0) >= (next[index].score ?? 0)) {
        next[index] = { ...next[index], ...entry };
      } else {
        next[index] = { ...entry, score: next[index].score };
      }
    } else {
      next.push(entry);
    }
    return normalizeScoreEntries(next);
  }

  function formatScoreNumber(score) {
    return Math.round(score ?? 0).toLocaleString();
  }

  function formatRunTime(seconds) {
    if (!seconds) return '—';
    const totalSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remMinutes = minutes % 60;
      return `${hours}h ${remMinutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  function formatLocationLabel(entry) {
    if (entry.locationLabel) return entry.locationLabel;
    const location = entry.location;
    if (!location) return 'Location hidden';
    if (location.error) return location.error;
    if (location.latitude !== undefined && location.longitude !== undefined) {
      return `Lat ${Number(location.latitude).toFixed(1)}, Lon ${Number(location.longitude).toFixed(1)}`;
    }
    return 'Location hidden';
  }

  return {
    normalizeScoreEntries,
    upsertScoreEntry,
    formatScoreNumber,
    formatRunTime,
    formatLocationLabel,
  };
});
