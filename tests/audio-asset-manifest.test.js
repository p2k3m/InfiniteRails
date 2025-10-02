import { beforeAll, describe, expect, it } from 'vitest';

import audioSamples from '../assets/audio-samples.json';

function loadEmbeddedAudioSamples() {
  // Reset any cached manifest between test runs so we can evaluate a fresh copy
  delete globalThis.INFINITE_RAILS_EMBEDDED_ASSETS;
  // Ensure the offline manifest script is re-evaluated for this suite
  delete require.cache[require.resolve('../assets/offline-assets.js')];
  require('../assets/offline-assets.js');
  return globalThis.INFINITE_RAILS_EMBEDDED_ASSETS?.audioSamples ?? null;
}

describe('embedded audio asset manifest', () => {
  let embeddedSamples;

  beforeAll(() => {
    embeddedSamples = loadEmbeddedAudioSamples();
  });

  it('exposes every defined sound effect sample', () => {
    expect(embeddedSamples).toBeTruthy();
    const manifestKeys = Object.keys(embeddedSamples).sort();
    const sampleKeys = Object.keys(audioSamples).sort();
    expect(manifestKeys).toEqual(sampleKeys);
  });

  it('stores base64 payloads for each sound effect', () => {
    const base64Pattern = /^[A-Za-z0-9+/=]+$/;
    Object.entries(audioSamples).forEach(([name, payload]) => {
      expect(typeof payload).toBe('string');
      expect(payload.trim().length).toBeGreaterThan(0);
      expect(base64Pattern.test(payload)).toBe(true);
      expect(embeddedSamples?.[name]).toBe(payload);
    });
  });
});
