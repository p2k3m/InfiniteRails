  const DEFAULT_AUDIO_SAMPLE_NAMES = Object.freeze([
    'ambientOverworld',
    'ambientDefault',
    'bubble',
    'crunch',
    'miningA',
    'miningB',
    'victoryCheer',
  ]);

        getAvailableSamples() {
          return Array.from(available);
        },
    collectCriticalAudioSampleNames() {
      const names = new Set(DEFAULT_AUDIO_SAMPLE_NAMES);
      const scope =
        (typeof window !== 'undefined' && window) ||
        (typeof globalThis !== 'undefined' && globalThis) ||
        null;
      const embedded = scope?.INFINITE_RAILS_EMBEDDED_ASSETS?.audioSamples;
      if (embedded && typeof embedded === 'object') {
        Object.keys(embedded).forEach((name) => {
          if (typeof name !== 'string') {
            return;
          }
          const trimmed = name.trim();
          if (trimmed) {
            names.add(trimmed);
          }
        });
      }
      if (this.audio && typeof this.audio.getAvailableSamples === 'function') {
        try {
          const availableNames = this.audio.getAvailableSamples();
          if (Array.isArray(availableNames)) {
            availableNames.forEach((name) => {
              if (typeof name !== 'string') {
                return;
              }
              const trimmed = name.trim();
              if (trimmed) {
                names.add(trimmed);
              }
            });
          }
        } catch (error) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('Unable to collect audio sample names from controller.', error);
          }
        }
      }
      return Array.from(names);
    }

        const audioSamples = this.collectCriticalAudioSampleNames();
        audioSamples.forEach((sample) => {
          const normalisedSample = typeof sample === 'string' ? sample.trim() : '';
          if (!normalisedSample) {
            return;
          }
          const assetKey = `audio:${normalisedSample}`;
          const sources = this.resolveAssetSourceCandidates(assetKey);
          const candidates = normaliseAssetAvailabilityCandidates(sources);
          assets.push({
            key: assetKey,
            type: 'audio',
            label: this.describeAssetKey(assetKey),
            candidates,
          });
        });
        const missingAudio = Array.isArray(summary.missing)
          ? summary.missing.filter((entry) => typeof entry === 'string' && entry.startsWith('audio:'))
          : [];
        if (missingAudio.length) {
          const audioNames = missingAudio
            .map((entry) => (typeof entry === 'string' ? entry.slice('audio:'.length) : ''))
            .map((name) => (name && name.trim() ? name.trim() : 'audio track'));
          const audioPreview = audioNames.slice(0, 3).join(', ');
          const audioSuffix = audioNames.length > 3 ? `, +${audioNames.length - 3} more` : '';
          const audioMessage =
            audioNames.length === 1
              ? `Audio availability check detected missing audio file "${audioPreview}".`
              : `Audio availability check detected ${audioNames.length} missing audio files (${audioPreview}${audioSuffix}).`;
          if (consoleRef?.warn) {
            consoleRef.warn(audioMessage, { ...baseDetail, missingAudio: audioNames });
          }
          if (typeof notifyLiveDiagnostics === 'function') {
            notifyLiveDiagnostics(
              'audio',
              audioMessage,
              { missingAudio: audioNames, summary },
              { level: 'warning' },
            );
          }
        }
    getExternalAudioSources(key) {
      const normalised = typeof key === 'string' ? key.trim() : '';
      if (!normalised) {
        return [];
      }
      const sources = [];
      const seen = new Set();
      const addSource = (value) => {
        if (typeof value !== 'string') {
          return;
        }
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) {
          return;
        }
        seen.add(trimmed);
        sources.push(trimmed);
      };
      const scope =
        (typeof window !== 'undefined' && window) ||
        (typeof globalThis !== 'undefined' && globalThis) ||
        null;
      const config = scope?.APP_CONFIG && typeof scope.APP_CONFIG === 'object' ? scope.APP_CONFIG : null;
      if (config) {
        const explicit = config.audio && typeof config.audio === 'object' ? config.audio[normalised] : null;
        if (typeof explicit === 'string') {
          addSource(explicit);
        } else if (Array.isArray(explicit)) {
          explicit
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean)
            .forEach((value) => addSource(value));
        }
        const appendFromBase = (base) => {
          if (typeof base !== 'string') {
            return;
          }
          const trimmed = base.trim();
          if (!trimmed) {
            return;
          }
          const prefix = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
          addSource(`${prefix}/${normalised}.mp3`);
        };
        appendFromBase(config.audioBaseUrl);
        const alternateBases = Array.isArray(config.audioAlternateBaseUrls)
          ? config.audioAlternateBaseUrls
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter(Boolean)
          : [];
        alternateBases.forEach((value) => appendFromBase(value));
      }
      addSource(resolveAssetUrl(`audio/${normalised}.mp3`));
      addSource(`audio/${normalised}.mp3`);
      return sources;
    }

      if (normalisedKey.startsWith('audio:')) {
        const sampleKey = normalisedKey.slice('audio:'.length);
        if (sampleKey) {
          const friendly = sampleKey
            .replace(/[-_]+/g, ' ')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .trim();
          if (friendly) {
            const capitalised = friendly.charAt(0).toUpperCase() + friendly.slice(1);
            return `${capitalised} audio`;
          }
        }
        return 'audio assets';
      }
      if (normalised.startsWith('audio:')) {
        const sampleKey = normalised.slice('audio:'.length);
        const trimmedSample = typeof sampleKey === 'string' ? sampleKey.trim() : '';
        if (!trimmedSample) {
          return [];
        }
        const sources = this.getExternalAudioSources(trimmedSample);
        if (sources.length) {
          return sources;
        }
        return [resolveAssetUrl(`audio/${trimmedSample}.mp3`)];
      }
      if (!fileName && normalised.startsWith('audio:')) {
        const sampleKey = normalised.slice('audio:'.length);
        if (sampleKey && sampleKey.trim()) {
          fileName = `${sampleKey.trim()}.mp3`;
        }
      }
      if (!extension && normalised.startsWith('audio:')) {
        extension = 'mp3';
      }
