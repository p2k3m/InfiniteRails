import { describe, expect, it } from 'vitest';
import { ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

function loadManifest() {
  const { windowStub } = ensureSimpleExperienceLoaded();
  return windowStub.InfiniteRailsDimensionManifest;
}

function expectStringArray(value) {
  expect(Array.isArray(value)).toBe(true);
  expect(value.length).toBeGreaterThan(0);
  value.forEach((entry) => {
    expect(typeof entry === 'string').toBe(true);
    expect(entry.trim().length).toBeGreaterThan(0);
  });
}

describe('dimension asset manifest', () => {
  it('exposes frozen manifest entries for every dimension', () => {
    const manifest = loadManifest();
    expect(manifest).toBeTruthy();
    expect(Object.isFrozen(manifest)).toBe(true);
    const expectedIds = ['origin', 'rock', 'stone', 'tar', 'marble', 'netherite'];
    expect(Object.keys(manifest)).toEqual(expectedIds);

    expectedIds.forEach((id) => {
      const entry = manifest[id];
      expect(entry).toBeTruthy();
      expect(Object.isFrozen(entry)).toBe(true);
      expectStringArray(entry.terrain);
      expectStringArray(entry.mobs);
      expectStringArray(entry.objects);
      expect(Object.isFrozen(entry.terrain)).toBe(true);
      expect(Object.isFrozen(entry.mobs)).toBe(true);
      expect(Object.isFrozen(entry.objects)).toBe(true);

      const assets = entry.assets;
      expect(assets).toBeTruthy();
      expect(Object.isFrozen(assets)).toBe(true);
      const { textures, models } = assets;
      expect(textures).toBeTruthy();
      expect(models).toBeTruthy();
      expect(Object.isFrozen(textures)).toBe(true);
      expect(Object.isFrozen(models)).toBe(true);
      expect(Object.keys(textures)).toEqual(expect.arrayContaining(['grass', 'dirt', 'stone', 'rails']));
      expect(Object.keys(models)).toEqual(expect.arrayContaining(['player', 'helperArm', 'zombie', 'golem']));
      Object.values(textures).forEach((value) => {
        if (Array.isArray(value)) {
          expect(value.length).toBeGreaterThan(0);
          value.forEach((entry) => {
            expect(typeof entry === 'string').toBe(true);
            expect(entry.trim().length).toBeGreaterThan(0);
          });
        } else {
          expect(typeof value === 'string').toBe(true);
          expect(value.trim().length).toBeGreaterThan(0);
        }
      });
      Object.values(models).forEach((value) => {
        expect(typeof value === 'string').toBe(true);
      });
    });
  });

  it('ensures origin manifest fully enumerates terrain, mobs, and objects', () => {
    const manifest = loadManifest();
    const origin = manifest.origin;
    expect(origin).toBeTruthy();
    expect(origin.terrain).toEqual(
      expect.arrayContaining(['grass-block', 'dirt', 'stone', 'rail-segment', 'portal-anchor']),
    );
    expect(origin.mobs).toEqual(expect.arrayContaining(['player-avatar', 'zombie', 'iron-golem']));
    expect(origin.objects).toEqual(
      expect.arrayContaining([
        'portal-frame',
        'portal-core',
        'loot-chest',
        'rail-network',
        'crafting-interface',
        'eternal-ingot',
      ]),
    );
  });

  it('ensures every dimension manifest lists its required terrain, mobs, and objects', () => {
    const manifest = loadManifest();
    const baseTerrain = ['grass-block', 'dirt', 'stone', 'rail-segment', 'portal-anchor'];
    const baseMobs = ['player-avatar', 'zombie', 'iron-golem'];
    const baseObjects = [
      'portal-frame',
      'portal-core',
      'loot-chest',
      'rail-network',
      'crafting-interface',
      'eternal-ingot',
    ];

    const coverageExpectations = {
      origin: {
        terrain: baseTerrain,
        mobs: baseMobs,
        objects: baseObjects,
      },
      rock: {
        terrain: baseTerrain,
        mobs: baseMobs,
        objects: baseObjects,
      },
      stone: {
        terrain: baseTerrain,
        mobs: baseMobs,
        objects: [...baseObjects, 'bastion-rampart'],
      },
      tar: {
        terrain: [...baseTerrain, 'tar-pool'],
        mobs: [...baseMobs, 'swamp-phantom'],
        objects: baseObjects,
      },
      marble: {
        terrain: baseTerrain,
        mobs: baseMobs,
        objects: [...baseObjects, 'marble-bridge'],
      },
      netherite: {
        terrain: baseTerrain,
        mobs: baseMobs,
        objects: [...baseObjects, 'eternal-ingot-pedestal'],
      },
    };

    Object.entries(coverageExpectations).forEach(([dimensionId, expectation]) => {
      const entry = manifest[dimensionId];
      expect(entry).toBeTruthy();
      expect(entry.terrain).toEqual(expect.arrayContaining(expectation.terrain));
      expect(entry.mobs).toEqual(expect.arrayContaining(expectation.mobs));
      expect(entry.objects).toEqual(expect.arrayContaining(expectation.objects));
    });
  });

  it('links dimension themes to manifest entries', () => {
    const { windowStub } = ensureSimpleExperienceLoaded();
    const manifest = windowStub.InfiniteRailsDimensionManifest;
    const themes = windowStub.SimpleExperience?.dimensionThemes ?? [];
    expect(Array.isArray(themes)).toBe(true);
    expect(themes.length).toBeGreaterThan(0);
    themes.forEach((theme) => {
      expect(theme.assetManifest).toBe(manifest[theme.id]);
    });
  });
});
