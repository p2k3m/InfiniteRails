import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import pluginRegistry from '../game-plugin-registry.js';
import {
  ensureSimpleExperienceLoaded,
  createExperience,
} from './helpers/simple-experience-test-utils.js';

describe('simple experience dimension plugins', () => {
  beforeEach(() => {
    ensureSimpleExperienceLoaded();
  });

  afterEach(() => {
    if (window.SimpleExperience?.destroyAll) {
      window.SimpleExperience.destroyAll();
    }
    try {
      pluginRegistry.activate('core-dimensions', { reason: 'test-reset' });
    } catch (error) {
      // Ignore failures when the default plugin is not registered yet.
    }
  });

  it('hot swaps dimension content at runtime and refreshes active experiences', () => {
    const { experience } = createExperience();
    expect(experience.dimensionSettings?.id).toBeTruthy();

    const testPlugin = {
      id: 'test-dimension-pack',
      slot: 'dimension-pack',
      version: '0.1.0',
      label: 'Test dimension pack',
      resources: () => ({
        themes: [
          {
            id: 'void',
            name: 'Void Realm',
            label: 'Void Realm',
            palette: {
              grass: '#111111',
              dirt: '#0a0a0a',
              stone: '#050505',
              rails: '#ff00ff',
            },
            fog: '#050505',
            sky: '#000000',
            sun: '#ffffff',
            hemi: '#222222',
            gravity: 0.75,
            speedMultiplier: 1.05,
            description: 'An empty realm used to validate the plugin pipeline.',
          },
        ],
        badgeSymbols: {
          void: '🕳️',
        },
        badgeSynonyms: {
          void: ['void', 'empty'],
        },
        lootTables: {
          void: [
            {
              items: [
                { item: 'portal-charge', quantity: 1 },
                { item: 'stone', quantity: 2 },
              ],
              score: 9,
              message: 'Void energy coalesces.',
            },
          ],
        },
      }),
    };

    pluginRegistry.hotSwap('dimension-pack', testPlugin, { reason: 'test-suite' });

    const themes = window.SimpleExperience.dimensionThemes;
    expect(Array.isArray(themes)).toBe(true);
    expect(themes[0].id).toBe('void');
    expect(Object.isFrozen(themes[0])).toBe(true);

    expect(experience.dimensionSettings?.id).toBe('void');
    expect(experience.dimensionSettings?.name).toBe('Void Realm');

    const lootTables = window.SimpleExperience.dimensionLootTables;
    expect(Array.isArray(lootTables.void)).toBe(true);
    expect(Object.isFrozen(lootTables.void)).toBe(true);

    const loot = experience.getChestLootForDimension('void', 0);
    expect(Array.isArray(loot.items)).toBe(true);
    expect(loot.items.some((entry) => entry.item === 'portal-charge')).toBe(true);
  });
});
