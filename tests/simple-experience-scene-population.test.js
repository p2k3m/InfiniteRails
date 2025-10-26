import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createExperience, ensureSimpleExperienceLoaded } from './helpers/simple-experience-test-utils.js';

function createStubbedChunk() {
  const chunk = new THREE.Group();
  chunk.name = 'TerrainChunk-0-0';
  chunk.userData = { chunkKey: '0|0', chunkX: 0, chunkZ: 0 };
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#2d8f28') }),
  );
  block.position.set(0, 0.5, 0);
  chunk.add(block);
  return { chunk, block };
}

describe('simple experience scene population', () => {
  let windowStub;

  beforeEach(() => {
    ({ windowStub } = ensureSimpleExperienceLoaded());
  });

  afterEach(() => {
    if (windowStub) {
      windowStub.dispatchEvent = windowStub.dispatchEvent ?? (() => true);
    }
    vi.restoreAllMocks();
  });

  it('ensures terrain, player, mobs, and interactive objects exist after renderer boot', async () => {
    const { experience } = createExperience();
    experience.THREE = THREE;
    experience.columns = new Map();
    experience.heightMap = Array.from({ length: 64 }, () => Array(64).fill(0));
    experience.terrainChunkGroups = [];
    experience.terrainChunkMap = new Map();
    experience.dirtyTerrainChunks = new Set();
    experience.chests = [];
    experience.dimensionLootOrderOffsets = new Map();
    experience.golems = [];

    vi.spyOn(experience, 'setupScene').mockImplementation(function setupSceneStub() {
      this.scene = new THREE.Scene();
      this.worldRoot = this.scene;
      this.renderer = { render: () => {}, setPixelRatio: () => {}, setSize: () => {} };
      this.terrainGroup = new THREE.Group();
      this.terrainGroup.name = 'TerrainGroup';
      this.scene.add(this.terrainGroup);

      this.playerRig = new THREE.Group();
      this.playerRig.name = 'PlayerRig';
      this.scene.add(this.playerRig);

      const avatar = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 1.8, 0.6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#1e3a8a') }),
      );
      avatar.name = 'PlayerAvatar';
      this.playerAvatar = avatar;
      this.playerRig.add(avatar);

      this.cameraBoom = new THREE.Object3D();
      this.playerRig.add(this.cameraBoom);
      this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
      this.cameraBoom.add(this.camera);

      this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
      this.scene.add(this.sunLight);
      this.moonLight = new THREE.DirectionalLight(0x8ea2ff, 0.4);
      this.scene.add(this.moonLight);
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
      this.scene.add(this.ambientLight);
      this.hemiLight = new THREE.HemisphereLight(0xbddcff, 0x34502d, 0.6);
      this.scene.add(this.hemiLight);
    });

    vi.spyOn(experience, 'buildTerrain').mockImplementation(function buildTerrainStub() {
      const { chunk, block } = createStubbedChunk();
      this.terrainGroup.add(chunk);
      this.terrainChunkGroups = [chunk];
      this.terrainChunkMap.set('0|0', chunk);
      const spawnColumn = `${Math.floor(this.heightMap.length / 2)}|${Math.floor(
        this.heightMap.length / 2,
      )}`;
      this.columns.set(spawnColumn, [block]);
    });

    vi.spyOn(experience, 'spawnDimensionChests').mockImplementation(function spawnChestsStub() {
      if (!this.chestGroup) {
        this.chestGroup = new THREE.Group();
        this.chestGroup.name = 'ChestGroup';
      }
      if (this.worldRoot && this.chestGroup.parent !== this.worldRoot) {
        this.worldRoot.add(this.chestGroup);
      }
      this.chestGroup.clear?.();
      const chest = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#f59e0b') }),
      );
      chest.name = 'LootChest-test';
      this.chestGroup.add(chest);
      this.chests = [
        {
          id: 'test-chest',
          mesh: chest,
          lidPivot: null,
          lid: null,
          highlightMaterials: [],
          baseY: chest.position.y,
          baseScale: { x: chest.scale.x, y: chest.scale.y, z: chest.scale.z },
          opened: false,
          openProgress: 0,
          loot: [],
          pulseOffset: 0,
          glowLevel: 0.25,
          hintShown: false,
        },
      ];
    });

    vi.spyOn(experience, 'populateInitialMobs').mockImplementation(function populateMobsStub() {
      if (!this.golemGroup) {
        this.golemGroup = new THREE.Group();
        this.golemGroup.name = 'GolemGroup';
      }
      if (this.worldRoot && this.golemGroup.parent !== this.worldRoot) {
        this.worldRoot.add(this.golemGroup);
      }
      this.golemGroup.clear?.();
      const golem = new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, 1),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ca3af') }),
      );
      golem.name = 'TestGolem';
      this.golemGroup.add(golem);
      this.golems = [
        {
          id: 'golem-test',
          mesh: golem,
          collisionRadius: 0.9,
          cooldown: 0,
          speed: 3,
          placeholder: true,
          animation: null,
        },
      ];
    });

    vi.spyOn(experience, 'positionPlayer').mockImplementation(function positionPlayerStub() {
      if (!this.playerRig) {
        this.playerRig = new THREE.Group();
        this.scene.add(this.playerRig);
      }
      this.playerRig.position.set(0, 1.8, 0);
    });

    vi.spyOn(experience, 'ensurePlayerPhysicsBody').mockImplementation(() => {});

    const noOpMethods = [
      'queueCharacterPreload',
      'loadFirstPersonArms',
      'initializeScoreboardUi',
      'primeAmbientAudio',
      'buildRails',
      'refreshPortalState',
      'attachPlayerToSimulation',
      'evaluateBossChallenge',
      'bindEvents',
      'initializeMobileControls',
      'observeInputBindings',
      'updatePointerHintForInputMode',
      'showDesktopPointerTutorialHint',
      'updateHud',
      'revealDimensionIntro',
      'refreshCraftingUi',
      'hideIntro',
      'showBriefingOverlay',
      'updateLocalScoreEntry',
      'loadScoreboard',
      'exposeDebugInterface',
      'renderFrame',
      'emitGameEvent',
      'publishStateSnapshot',
      'clearVictoryEffectTimers',
      'hideVictoryCelebration',
      'hideVictoryBanner',
      'scheduleScoreSync',
    ];
    noOpMethods.forEach((method) => {
      if (typeof experience[method] === 'function') {
        vi.spyOn(experience, method).mockImplementation(() => {});
      } else {
        experience[method] = () => {};
      }
    });

    vi.spyOn(experience, 'rebindEntityChunkAnchors').mockImplementation(() => ({
      reason: 'start',
      player: { chunkKey: '0|0', rebound: true },
      chests: { total: experience.chests?.length ?? 1, rebound: experience.chests?.length ?? 1, missing: 0 },
      zombies: { total: 0, rebound: 0, missing: 0, despawned: 0 },
      golems: { total: 1, rebound: 1, missing: 0, despawned: 0 },
      errors: [],
    }));

    vi.spyOn(experience, 'applyDimensionSettings').mockImplementation(function applyDimensionSettingsStub() {
      this.dimensionSettings = { id: 'origin', palette: {} };
    });
    vi.spyOn(experience, 'maybeShowFirstRunTutorial').mockReturnValue(false);
    vi.spyOn(experience, 'autoCaptureLocation').mockResolvedValue(undefined);

    experience.start();
    await Promise.resolve();

    const summary = experience.lastScenePopulationSummary;
    expect(summary).toBeTruthy();
    expect(summary.ground.terrainGroupChildren).toBeGreaterThan(0);
    expect(summary.blocks.present).toBe(true);
    expect(summary.steve.present).toBe(true);
    expect(summary.mobs.present).toBe(true);
    expect(summary.mobs.total).toBeGreaterThan(0);
    expect(experience.terrainChunkGroups.length).toBeGreaterThan(0);
    expect(experience.chestGroup).toBeTruthy();
    expect(experience.chestGroup.children.length).toBeGreaterThan(0);
  });
});
