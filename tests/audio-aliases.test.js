import { describe, expect, it } from 'vitest';

import aliasConfig from '../audio-aliases.js';
import audioSamples from '../assets/audio-samples.json';

function toArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

describe('audio alias configuration', () => {
  it('provides fallbacks for gameplay-only cues', () => {
    ['craftChime', 'zombieGroan', 'portalActivate', 'portalDormant'].forEach((name) => {
      const fallbacks = toArray(aliasConfig[name]);
      expect(fallbacks.length).toBeGreaterThan(0);
      const resolved = fallbacks.find((candidate) => Boolean(audioSamples[candidate]));
      expect(resolved).toBeDefined();
    });
  });

  it('does not define empty alias lists', () => {
    Object.entries(aliasConfig).forEach(([name, candidates]) => {
      expect(name).toBeTypeOf('string');
      const values = toArray(candidates);
      expect(values.length).toBeGreaterThan(0);
      values.forEach((candidate) => {
        expect(candidate).toBeTypeOf('string');
        expect(candidate.trim().length).toBeGreaterThan(0);
      });
    });
  });
});
