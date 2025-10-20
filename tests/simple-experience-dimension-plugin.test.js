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

  it('registers the core dimension pack plugin on load', () => {
    const pluginId = window.SimpleExperience?.coreDimensionPluginId;
    expect(typeof pluginId).toBe('string');
    const plugins = pluginRegistry.listPlugins('dimension-pack');
    const matching = plugins.filter((plugin) => plugin && plugin.id === pluginId);
    expect(matching.length).toBeGreaterThanOrEqual(1);
    const active = pluginRegistry.getActivePlugin('dimension-pack');
    expect(active?.id).toBe(pluginId);
    const resources = pluginRegistry.getResources('dimension-pack');
    expect(Array.isArray(resources?.themes)).toBe(true);
    expect(resources.themes.length).toBeGreaterThan(0);
    const state = window.SimpleExperience.getDimensionPluginState();
    expect(state?.lastApplied?.pluginId).toBe(pluginId);
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

  it('exposes a public API to apply dimension plugin resources on demand', () => {
    const { experience } = createExperience();
    const manifest = window.SimpleExperience.dimensionManifest.origin;
    const terrainProfile =
      window.SimpleExperience.terrainProfiles.origin || window.SimpleExperience.defaultTerrainProfile;

    const manualResources = {
      themes: [
        {
          id: 'manual',
          name: 'Manual Expanse',
          label: 'Manual Expanse',
          palette: {
            grass: '#112233',
            dirt: '#0f1419',
            stone: '#1a2a3a',
            rails: '#ff8800',
          },
          fog: '#0f1419',
          sky: '#1a2a3a',
          sun: '#ffffff',
          hemi: '#1c2c3c',
          gravity: 0.9,
          speedMultiplier: 1.07,
          description: 'Manual override applied through the plugin API.',
          assetManifest: manifest,
          terrainProfile,
        },
      ],
      badgeSymbols: { manual: '★' },
      badgeSynonyms: { manual: ['manual', 'override'] },
      lootTables: {
        manual: [
          {
            items: [
              { item: 'stone', quantity: 1 },
              { item: 'portal-charge', quantity: 1 },
            ],
            score: 12,
            message: 'Manual loot delivered.',
          },
        ],
      },
    };

    const detail = { plugin: { id: 'manual-override', version: '2.0.0' }, reason: 'manual-test' };
    const result = window.SimpleExperience.applyDimensionPluginResources(manualResources, detail);

    expect(result?.pluginId).toBe('manual-override');
    expect(result?.version).toBe('2.0.0');
    expect(result?.reason).toBe('manual-test');

    const themes = window.SimpleExperience.dimensionThemes;
    expect(themes[0].id).toBe('manual');
    expect(Object.isFrozen(themes[0])).toBe(true);

    expect(experience.dimensionSettings?.id).toBe('manual');
    expect(experience.dimensionSettings?.name).toBe('Manual Expanse');

    const lootTables = window.SimpleExperience.dimensionLootTables;
    expect(Array.isArray(lootTables.manual)).toBe(true);
    expect(Object.isFrozen(lootTables.manual)).toBe(true);
    const loot = experience.getChestLootForDimension('manual', 0);
    expect(Array.isArray(loot.items)).toBe(true);
    expect(loot.items.some((entry) => entry.item === 'portal-charge')).toBe(true);
  });

  it('replaces asset manifests and terrain profiles when provided by plugins', () => {
    const { experience } = createExperience();

    const plugin = {
      id: 'void-pack',
      slot: 'dimension-pack',
      version: '0.2.0',
      label: 'Void dimension pack',
      resources: () => ({
        themes: [
          {
            id: 'void',
            name: 'Void Realm',
            label: 'Void Realm',
            palette: {
              grass: '#000000',
              dirt: '#050505',
              stone: '#0a0a0a',
              rails: '#ffffff',
            },
            fog: '#020202',
            sky: '#040404',
            sun: '#888888',
            hemi: '#101010',
            gravity: 0.5,
            speedMultiplier: 1.1,
            assetManifest: {
              id: 'void',
              name: 'Void Realm',
              terrain: ['void-plateau'],
              mobs: ['void-wisp'],
              objects: ['void-obelisk'],
              assets: {
                textures: { 'void-plateau': 'textures/void-plateau.png' },
                models: { obelisk: 'models/void-obelisk.glb' },
              },
            },
            terrainProfile: {
              minHeight: 2,
              maxHeight: 7,
              baseHeight: 1.8,
              noiseFrequency: 0.18,
              noiseAmplitude: 2.4,
            },
          },
        ],
        badgeSymbols: { void: '🕳️' },
        badgeSynonyms: { void: ['void', 'nothingness'] },
        lootTables: {
          void: [
            {
              items: [
                { item: 'void-shard', quantity: 2 },
                { item: 'portal-charge', quantity: 1 },
              ],
              score: 11,
              message: 'Fragments from the abyss materialise.',
            },
          ],
        },
        assetManifest: {
          void: {
            id: 'void',
            name: 'Void Realm',
            terrain: ['void-plateau'],
            mobs: ['void-wisp'],
            objects: ['void-obelisk'],
            assets: {
              textures: { 'void-plateau': 'textures/void-plateau.png' },
              models: { obelisk: 'models/void-obelisk.glb' },
            },
          },
        },
        terrainProfiles: {
          void: {
            minHeight: 2,
            maxHeight: 7,
            baseHeight: 1.8,
            noiseFrequency: 0.18,
            noiseAmplitude: 2.4,
          },
        },
      }),
    };

    pluginRegistry.hotSwap('dimension-pack', plugin, { reason: 'test-suite' });

    expect(experience.dimensionSettings?.id).toBe('void');
    expect(experience.dimensionSettings?.assetManifest?.id).toBe('void');

    const manifest = window.SimpleExperience.dimensionManifest;
    expect(Object.keys(manifest)).toEqual(['void']);
    expect(Object.isFrozen(manifest.void)).toBe(true);
    expect(manifest.void.assets.textures['void-plateau']).toBe('textures/void-plateau.png');

    const profiles = window.SimpleExperience.terrainProfiles;
    expect(Object.keys(profiles)).toEqual(['void']);
    expect(Object.isFrozen(profiles.void)).toBe(true);
    expect(profiles.void.minHeight).toBe(2);
    expect(experience.dimensionTerrainProfile.minHeight).toBe(2);
  });

  it('applies lifecycle hooks from plugins to active experiences', async () => {
    const { experience } = createExperience();
    const calls = [];

    const plugin = {
      id: 'hook-pack',
      slot: 'dimension-pack',
      version: '0.3.0',
      label: 'Lifecycle hook pack',
      resources: () => ({
        themes: [
          {
            id: 'hook',
            name: 'Hook Expanse',
            label: 'Hook Expanse',
            palette: {
              grass: '#123456',
              dirt: '#0f1820',
              stone: '#1c2733',
              rails: '#fedcba',
            },
            fog: '#0c1117',
            sky: '#101923',
            sun: '#ffffff',
            hemi: '#13202c',
            gravity: 0.92,
            speedMultiplier: 1.04,
            description: 'Lifecycle hook validation dimension.',
          },
        ],
        badgeSymbols: { hook: '🪝' },
        badgeSynonyms: { hook: ['hook', 'test'] },
        lootTables: {
          hook: [
            {
              items: [
                { item: 'portal-charge', quantity: 1 },
                { item: 'stone', quantity: 1 },
              ],
              score: 7,
              message: 'Hook loot delivered.',
            },
          ],
        },
        lifecycleHooks: {
          exit: [
            (payload, context) => {
              calls.push({ phase: 'exit', payload, context });
            },
          ],
          enter: [
            (payload, context) => {
              calls.push({ phase: 'enter', payload, context });
            },
          ],
          ready: [
            (payload, context) => {
              calls.push({ phase: 'ready', payload, context });
            },
          ],
        },
      }),
    };

    pluginRegistry.hotSwap('dimension-pack', plugin, { reason: 'lifecycle-test' });

    expect(experience.dimensionLifecycleHooks.exit.size).toBeGreaterThan(0);
    expect(experience.dimensionLifecycleHooks.enter.size).toBeGreaterThan(0);
    expect(experience.dimensionLifecycleHooks.ready.size).toBeGreaterThan(0);

    await experience.runDimensionExitHooks({ previousDimension: experience.dimensionSettings });
    await experience.runDimensionEnterHooks({ nextDimension: experience.dimensionSettings });
    await experience.runDimensionReadyHooks({});

    const phases = calls.map((entry) => entry.phase);
    expect(phases).toContain('exit');
    expect(phases).toContain('enter');
    expect(phases).toContain('ready');
    const readyCall = calls.find((entry) => entry.phase === 'ready');
    expect(readyCall?.context?.experience).toBe(experience);
    expect(readyCall?.context?.detail?.plugin?.id).toBe('hook-pack');
    expect(readyCall?.context?.resources?.themes?.[0]?.id).toBe('hook');
  });

  it('runs experience augmentations and tears them down on plugin replacement', async () => {
    const { experience } = createExperience();
    let cleanupCounter = 0;

    const plugin = {
      id: 'augmentation-pack',
      slot: 'dimension-pack',
      version: '0.4.0',
      label: 'Augmentation pack',
      resources: () => ({
        themes: [
          {
            id: 'augment',
            name: 'Augment Plane',
            label: 'Augment Plane',
            palette: {
              grass: '#224466',
              dirt: '#1c2733',
              stone: '#0f1924',
              rails: '#ffaa33',
            },
            fog: '#111820',
            sky: '#16212b',
            sun: '#ffe0aa',
            hemi: '#1a2735',
            gravity: 1.05,
            speedMultiplier: 0.97,
            description: 'Augmentation logic validation dimension.',
          },
        ],
        badgeSymbols: { augment: '✳️' },
        badgeSynonyms: { augment: ['augment', 'logic'] },
        lootTables: {
          augment: [
            {
              items: [
                { item: 'stone', quantity: 1 },
                { item: 'portal-charge', quantity: 1 },
              ],
              score: 11,
              message: 'Augmentation loot emitted.',
            },
          ],
        },
        experienceAugmentations: [
          ({ experience: instance, registerLifecycleHook, addCleanup }) => {
            instance.pluginAugmented = true;
            instance.readyHookCount = 0;
            const off = registerLifecycleHook('ready', (_, context) => {
              instance.readyHookCount += 1;
              instance.lastPluginContext = context;
            });
            addCleanup(off);
            addCleanup({
              dispose: () => {
                cleanupCounter += 1;
              },
            });
            return () => {
              cleanupCounter += 1;
              instance.pluginAugmented = false;
            };
          },
        ],
      }),
    };

    pluginRegistry.hotSwap('dimension-pack', plugin, { reason: 'augmentation-test' });

    expect(experience.pluginAugmented).toBe(true);
    expect(experience.readyHookCount).toBe(0);

    await experience.runDimensionReadyHooks({});
    expect(experience.readyHookCount).toBe(1);
    expect(experience.lastPluginContext?.detail?.plugin?.id).toBe('augmentation-pack');
    expect(experience.lastPluginContext?.resources?.themes?.[0]?.id).toBe('augment');

    experience.readyHookCount = 0;

    pluginRegistry.activate(window.SimpleExperience.coreDimensionPluginId, {
      reason: 'restore-core',
    });

    expect(experience.pluginAugmented).toBe(false);
    expect(cleanupCounter).toBe(2);

    await experience.runDimensionReadyHooks({});
    expect(experience.readyHookCount).toBe(0);
  });
});
