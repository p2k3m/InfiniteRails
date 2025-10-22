    audio: 'Validating audio samples…',
  const BOOT_ASSET_PHASE_CONFIG = {
    textures: {
      phase: 'assets',
      message: 'Streaming textures…',
      noneMessage: 'No critical textures required.',
    },
    models: {
      phase: 'gltf',
      message: 'Streaming models…',
      noneMessage: 'No critical models required.',
    },
    audio: {
      phase: 'audio',
      message: 'Validating audio samples…',
      noneMessage: 'Audio samples initialised.',
    },
  };

  const bootAssetProgressState = {
    totals: { textures: 0, models: 0, audio: 0 },
    completed: { textures: 0, models: 0, audio: 0 },
    completedKeys: { textures: new Set(), models: new Set(), audio: new Set() },
    inFlight: { textures: new Set(), models: new Set(), audio: new Set() },
    labels: { textures: new Map(), models: new Map(), audio: new Map() },
    plan: { textures: new Map(), models: new Map(), audio: new Map() },
    order: { textures: [], models: [], audio: [] },
    failures: { textures: new Set(), models: new Set(), audio: new Set() },
    lastCompleted: { textures: null, models: null, audio: null },
    lastCompletedKey: { textures: null, models: null, audio: null },
    lastCompletedStatus: { textures: null, models: null, audio: null },
    overrides: { textures: null, models: null, audio: null },
  };

  function normaliseBootAssetKind(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }
    if (trimmed === 'textures' || trimmed === 'texture') {
      return 'textures';
    }
    if (trimmed === 'models' || trimmed === 'model' || trimmed === 'gltf') {
      return 'models';
    }
    if (trimmed === 'audio' || trimmed === 'sound' || trimmed === 'samples') {
      return 'audio';
    }
    return null;
  }

  function normaliseBootAssetKey(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  function extractBootAssetFileName(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const hashIndex = trimmed.indexOf('#');
    const withoutFragment = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
    const queryIndex = withoutFragment.indexOf('?');
    const clean = queryIndex >= 0 ? withoutFragment.slice(0, queryIndex) : withoutFragment;
    const segments = clean.split('/');
    let candidate = segments.pop() || '';
    if (!candidate && segments.length) {
      candidate = segments.pop() || '';
    }
    const label = candidate.trim();
    return label.length ? label : clean.trim() || trimmed;
  }

  function resolveBootAssetLabel(kind, key) {
    const labels = bootAssetProgressState.labels[kind];
    if (labels?.has(key)) {
      return labels.get(key);
    }
    const planMap = bootAssetProgressState.plan[kind];
    const planEntry = planMap?.get(key) || null;
    const fallbackLabel =
      (planEntry && typeof planEntry.label === 'string' && planEntry.label.trim().length
        ? planEntry.label.trim()
        : null) || extractBootAssetFileName(planEntry?.source || planEntry?.url) || key;
    if (labels && fallbackLabel) {
      labels.set(key, fallbackLabel);
    }
    return fallbackLabel || null;
  }

  function updateBootAssetProgress(kind) {
    if (!kind || !BOOT_ASSET_PHASE_CONFIG[kind]) {
      return;
    }
    const config = BOOT_ASSET_PHASE_CONFIG[kind];
    const total = bootAssetProgressState.totals[kind] || 0;
    const completed = bootAssetProgressState.completed[kind] || 0;
    const boundedCurrent = total > 0 ? Math.min(completed, total) : completed;
    const failures = bootAssetProgressState.failures[kind]?.size || 0;
    const override = bootAssetProgressState.overrides[kind] || null;
    let message = config.message;
    if (override?.message) {
      message = override.message;
    } else if (total > 0) {
      message = `${config.message} (${boundedCurrent}/${total})`;
    } else if (config.noneMessage) {
      message = config.noneMessage;
    }
    let status;
    if (override?.status) {
      status = override.status;
    } else if (total === 0) {
      status = failures > 0 ? 'warning' : 'ok';
    } else if (completed >= total) {
      status = failures > 0 ? 'warning' : 'ok';
    } else if (failures > 0) {
      status = 'warning';
    } else {
      status = 'active';
    }
    const detail = { status, message };
    let currentAsset = null;
    let nextAsset = null;
    let lastAsset = null;
    if (total > 0) {
      const inFlightKeys = bootAssetProgressState.inFlight[kind]
        ? Array.from(bootAssetProgressState.inFlight[kind])
        : [];
      let supplemental = null;
      if (inFlightKeys.length) {
        const currentKey = inFlightKeys[inFlightKeys.length - 1];
        const currentLabel = resolveBootAssetLabel(kind, currentKey);
        if (currentLabel) {
          supplemental = `Loading ${currentLabel}`;
        }
        currentAsset = {
          key: currentKey,
          label: currentLabel || currentKey,
        };
      } else if (bootAssetProgressState.lastCompleted[kind]) {
        const verb = bootAssetProgressState.lastCompletedStatus[kind] === 'fulfilled' ? 'Loaded' : 'Failed';
        supplemental = `${verb} ${bootAssetProgressState.lastCompleted[kind]}`;
        lastAsset = {
          key: bootAssetProgressState.lastCompletedKey[kind],
          label: bootAssetProgressState.lastCompleted[kind],
          status: bootAssetProgressState.lastCompletedStatus[kind],
        };
      } else {
        const pendingKey = bootAssetProgressState.order[kind].find(
          (candidate) =>
            !bootAssetProgressState.completedKeys[kind].has(candidate) &&
            !bootAssetProgressState.inFlight[kind].has(candidate),
        );
        if (pendingKey) {
          const pendingLabel = resolveBootAssetLabel(kind, pendingKey);
          if (pendingLabel) {
            supplemental = `Queued ${pendingLabel}`;
          }
          nextAsset = {
            key: pendingKey,
            label: pendingLabel || pendingKey,
          };
        }
      }
      if (supplemental) {
        detail.message = `${detail.message} — ${supplemental}`;
      }
    }
    if (currentAsset) {
      detail.currentAsset = currentAsset;
    }
    if (!lastAsset && bootAssetProgressState.lastCompleted[kind]) {
      lastAsset = {
        key: bootAssetProgressState.lastCompletedKey[kind],
        label: bootAssetProgressState.lastCompleted[kind],
        status: bootAssetProgressState.lastCompletedStatus[kind],
      };
    }
    if (lastAsset) {
      detail.lastAsset = lastAsset;
    }
    if (nextAsset) {
      detail.nextAsset = nextAsset;
    }
    if (total > 0) {
      const remaining = Math.max(0, total - boundedCurrent);
      const percent = total > 0 ? Math.round((boundedCurrent / total) * 100) : null;
      const progress = {
        current: boundedCurrent,
        total,
      };
      progress.remaining = remaining;
      if (Number.isFinite(percent)) {
        progress.percent = Math.max(0, Math.min(100, percent));
      }
      detail.progress = progress;
    }
    updateBootStatus(config.phase, detail);
  }

  function storeBootAssetPlan(kind, entries) {
    const normalisedKind = normaliseBootAssetKind(kind);
    if (!normalisedKind || !BOOT_ASSET_PHASE_CONFIG[normalisedKind]) {
      return;
    }
    const labels = bootAssetProgressState.labels[normalisedKind];
    labels?.clear();
    const planMap = new Map();
    const order = [];
    if (Array.isArray(entries)) {
      entries.forEach((entry) => {
        const key = normaliseBootAssetKey(entry?.key ?? entry?.id);
        if (!key || planMap.has(key)) {
          return;
        }
        const source =
          typeof entry?.source === 'string' && entry.source.trim().length
            ? entry.source.trim()
            : null;
        const url =
          typeof entry?.url === 'string' && entry.url.trim().length ? entry.url.trim() : null;
        const label =
          typeof entry?.label === 'string' && entry.label.trim().length
            ? entry.label.trim()
            : null;
        planMap.set(key, { key, source, url, label });
        order.push(key);
        const derivedLabel = label || extractBootAssetFileName(source || url) || key;
        if (labels && derivedLabel) {
          labels.set(key, derivedLabel);
        }
      });
    }
    bootAssetProgressState.plan[normalisedKind] = planMap;
    bootAssetProgressState.order[normalisedKind] = order;
    bootAssetProgressState.totals[normalisedKind] = order.length;
    bootAssetProgressState.completed[normalisedKind] = 0;
    bootAssetProgressState.completedKeys[normalisedKind].clear();
    bootAssetProgressState.inFlight[normalisedKind].clear();
    bootAssetProgressState.failures[normalisedKind].clear();
    bootAssetProgressState.lastCompleted[normalisedKind] = null;
    bootAssetProgressState.lastCompletedKey[normalisedKind] = null;
    bootAssetProgressState.lastCompletedStatus[normalisedKind] = null;
    const existingOverride = bootAssetProgressState.overrides[normalisedKind];
    const preserveOverride =
      normalisedKind === 'audio' && existingOverride && existingOverride.status === 'warning';
    bootAssetProgressState.overrides[normalisedKind] = preserveOverride ? existingOverride : null;
    updateBootAssetProgress(normalisedKind);
  }

  function handleBootAssetPlan(detail = {}) {
    storeBootAssetPlan('textures', Array.isArray(detail.textures) ? detail.textures : []);
    storeBootAssetPlan('models', Array.isArray(detail.models) ? detail.models : []);
    storeBootAssetPlan('audio', Array.isArray(detail.audio) ? detail.audio : []);
  }

  function handleBootAssetFetchStart(detail = {}) {
    if (!detail || detail.boot !== true) {
      return;
    }
    const kind = normaliseBootAssetKind(detail.kind);
    if (!kind || !BOOT_ASSET_PHASE_CONFIG[kind]) {
      return;
    }
    const key = normaliseBootAssetKey(detail.key);
    if (!key) {
      return;
    }
    const labels = bootAssetProgressState.labels[kind];
    const labelValue =
      typeof detail.label === 'string' && detail.label.trim().length ? detail.label.trim() : null;
    const sourceValue =
      typeof detail.source === 'string' && detail.source.trim().length ? detail.source.trim() : null;
    const urlValue =
      typeof detail.url === 'string' && detail.url.trim().length ? detail.url.trim() : null;
    if (labels) {
      if (labelValue) {
        labels.set(key, labelValue);
      } else if (sourceValue || urlValue) {
        const derived = extractBootAssetFileName(sourceValue || urlValue);
        if (derived) {
          labels.set(key, derived);
        }
      } else if (!labels.has(key)) {
        const fallback = resolveBootAssetLabel(kind, key);
        if (fallback) {
          labels.set(key, fallback);
        }
      }
    }
    bootAssetProgressState.inFlight[kind].add(key);
    bootAssetProgressState.completedKeys[kind].delete(key);
    updateBootAssetProgress(kind);
  }

  function handleBootAssetFetchComplete(detail = {}) {
    if (!detail || detail.boot !== true) {
      return;
    }
    const kind = normaliseBootAssetKind(detail.kind);
    if (!kind || !BOOT_ASSET_PHASE_CONFIG[kind]) {
      return;
    }
    const key = normaliseBootAssetKey(detail.key);
    if (!key) {
      return;
    }
    const labels = bootAssetProgressState.labels[kind];
    const labelValue =
      typeof detail.label === 'string' && detail.label.trim().length ? detail.label.trim() : null;
    const sourceValue =
      typeof detail.source === 'string' && detail.source.trim().length ? detail.source.trim() : null;
    const urlValue =
      typeof detail.url === 'string' && detail.url.trim().length ? detail.url.trim() : null;
    if (labels) {
      if (labelValue) {
        labels.set(key, labelValue);
      } else if (sourceValue || urlValue) {
        const derived = extractBootAssetFileName(sourceValue || urlValue);
        if (derived) {
          labels.set(key, derived);
        }
      } else if (!labels.has(key)) {
        const fallback = resolveBootAssetLabel(kind, key);
        if (fallback) {
          labels.set(key, fallback);
        }
      }
    }
    bootAssetProgressState.inFlight[kind].delete(key);
    if (!bootAssetProgressState.completedKeys[kind].has(key)) {
      bootAssetProgressState.completed[kind] = (bootAssetProgressState.completed[kind] || 0) + 1;
      bootAssetProgressState.completedKeys[kind].add(key);
    }
    const status = typeof detail.status === 'string' ? detail.status.trim().toLowerCase() : '';
    if (status === 'failed' || detail.success === false) {
      bootAssetProgressState.failures[kind].add(key);
    } else {
      bootAssetProgressState.failures[kind].delete(key);
    }
    const resolvedLabel = resolveBootAssetLabel(kind, key);
    bootAssetProgressState.lastCompleted[kind] = resolvedLabel;
    bootAssetProgressState.lastCompletedKey[kind] = key;
    bootAssetProgressState.lastCompletedStatus[kind] =
      status === 'failed' || detail.success === false ? 'rejected' : 'fulfilled';
    if (kind === 'audio') {
      const total = bootAssetProgressState.totals.audio || 0;
      const completedCount = bootAssetProgressState.completed.audio || 0;
      const failureCount = bootAssetProgressState.failures.audio?.size || 0;
      if (total > 0 && completedCount >= total && failureCount === 0) {
        bootAssetProgressState.overrides.audio = {
          status: 'ok',
          message: `Audio samples ready (${total}/${total}).`,
        };
      }
    }
    updateBootAssetProgress(kind);
  }

  if (typeof globalScope?.addEventListener === 'function') {
    globalScope.addEventListener('infinite-rails:asset-preload-plan', (event) => {
      try {
        handleBootAssetPlan(event?.detail ?? {});
      } catch (planError) {
        globalScope?.console?.debug?.('Failed to process asset preload plan for boot status.', planError);
      }
    });
    globalScope.addEventListener('infinite-rails:asset-fetch-start', (event) => {
      try {
        handleBootAssetFetchStart(event?.detail ?? {});
      } catch (startError) {
        globalScope?.console?.debug?.('Failed to process asset fetch start for boot status.', startError);
      }
    });
    globalScope.addEventListener('infinite-rails:asset-fetch-complete', (event) => {
      try {
        handleBootAssetFetchComplete(event?.detail ?? {});
      } catch (completeError) {
        globalScope?.console?.debug?.('Failed to process asset fetch completion for boot status.', completeError);
      }
    });
  }

      if (detail?.bootOnly === true) {
        return;
      }
      if (detail?.bootOnly === true) {
        return;
      }
      if (BOOT_ASSET_PHASE_CONFIG.audio) {
        const missingSamples = Array.isArray(detail?.missingSamples)
          ? detail.missingSamples
              .map((name) => (typeof name === 'string' ? name.trim() : ''))
              .filter((name) => name.length)
          : [];
        let overrideMessage = normalizedMessage;
        if (missingSamples.length) {
          const preview = missingSamples.slice(0, 3).join(', ');
          const suffix = missingSamples.length > 3 ? `, +${missingSamples.length - 3} more` : '';
          overrideMessage = `Audio fallback active — Missing ${preview}${suffix}.`;
        } else if (bootAssetProgressState.totals.audio > 0) {
          const total = bootAssetProgressState.totals.audio;
          const completed = Math.min(bootAssetProgressState.completed.audio || 0, total);
          overrideMessage = `Audio samples ready (${completed}/${total}).`;
        }
        bootAssetProgressState.overrides.audio = {
          status: fallbackActive ? 'warning' : 'ok',
          message: overrideMessage,
        };
        updateBootAssetProgress('audio');
      }
    if (detail?.bootOnly === true) {
      return;
    }
    if (detail?.bootOnly === true) {
      return;
    }
