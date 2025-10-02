import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function createCanvasStub() {
  const loseContextStub = { loseContext: () => {} };
  const webglContext = {
    getExtension: (name) => {
      if (name === 'WEBGL_lose_context') {
        return loseContextStub;
      }
      return null;
    },
  };
  const context2d = {
    fillStyle: '#000000',
    fillRect: () => {},
    drawImage: () => {},
    clearRect: () => {},
  };
  return {
    width: 512,
    height: 512,
    clientWidth: 512,
    clientHeight: 512,
    getContext: (type) => {
      if (type === '2d') {
        return context2d;
      }
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') {
        return webglContext;
      }
      return null;
    },
    toDataURL: () => 'data:image/png;base64,',
    focus: () => {},
  };
}

let simpleExperienceLoaded = false;

function ensureSimpleExperienceLoaded() {
  if (simpleExperienceLoaded) {
    return;
  }

  const documentStub = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return createCanvasStub();
      }
      return { getContext: () => null };
    },
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
    getElementById: () => null,
  };

  const windowStub = {
    APP_CONFIG: {},
    devicePixelRatio: 1,
    location: { search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    document: documentStub,
    dispatchEvent: () => {},
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
  };

  Object.assign(windowStub, { THREE, THREE_GLOBAL: THREE });

  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.navigator = { geolocation: { getCurrentPosition: () => {} } };
  globalThis.performance = { now: () => Date.now() };
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;

  const scriptSource = fs.readFileSync(path.join(repoRoot, 'simple-experience.js'), 'utf8');
  vm.runInThisContext(scriptSource);
  simpleExperienceLoaded = true;
}

function createExperienceForTest(options = {}) {
  ensureSimpleExperienceLoaded();
  if (typeof options.beforeCreate === 'function') {
    options.beforeCreate();
  }
  const canvas = createCanvasStub();
  const experience = window.SimpleExperience.create({ canvas, ui: {} });
  experience.canvas = canvas;
  const spawnColumn = `${Math.floor(experience.heightMap.length / 2)}|${Math.floor(
    experience.heightMap.length / 2,
  )}`;
  const spawnTop = new THREE.Object3D();
  spawnTop.position.set(4.5, 3.2, -6.1);

  vi.spyOn(experience, 'setupScene').mockImplementation(function () {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87ceeb');
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 140);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
    this.sunLight.target = new THREE.Object3D();
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.moonLight = new THREE.DirectionalLight(0x8ea2ff, 0.4);
    this.moonLight.target = new THREE.Object3D();
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(this.ambientLight);
    this.hemiLight = new THREE.HemisphereLight(0xbddcff, 0x34502d, 0.9);
    this.scene.add(this.hemiLight);
    this.playerRig = new THREE.Group();
    this.playerRig.name = 'PlayerRig';
    this.playerRig.position.set(0, 1.8, 0);
    this.cameraBoom = new THREE.Object3D();
    this.camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 250);
    this.cameraBoom.add(this.camera);
    this.playerRig.add(this.cameraBoom);
    this.scene.add(this.playerRig);
    this.renderer = { render: vi.fn(), setPixelRatio: () => {}, setSize: () => {} };
    this.terrainGroup = new THREE.Group();
    this.railsGroup = new THREE.Group();
    this.portalGroup = new THREE.Group();
    this.zombieGroup = new THREE.Group();
    this.golemGroup = new THREE.Group();
    this.chestGroup = new THREE.Group();
    this.challengeGroup = new THREE.Group();
  });

  vi.spyOn(experience, 'buildTerrain').mockImplementation(function () {
    this.columns.clear();
    this.columns.set(spawnColumn, [spawnTop]);
  });
  vi.spyOn(experience, 'buildRails').mockImplementation(() => {});
  vi.spyOn(experience, 'refreshPortalState').mockImplementation(() => {});
  vi.spyOn(experience, 'evaluateBossChallenge').mockImplementation(() => {});
  vi.spyOn(experience, 'bindEvents').mockImplementation(() => {});
  vi.spyOn(experience, 'initializeMobileControls').mockImplementation(() => {});
  vi.spyOn(experience, 'updatePointerHintForInputMode').mockImplementation(() => {});
  vi.spyOn(experience, 'showDesktopPointerTutorialHint').mockImplementation(() => {});
  vi.spyOn(experience, 'revealDimensionIntro').mockImplementation(() => {});
  vi.spyOn(experience, 'refreshCraftingUi').mockImplementation(() => {});
  vi.spyOn(experience, 'hideIntro').mockImplementation(() => {});
  vi.spyOn(experience, 'showBriefingOverlay').mockImplementation(() => {});
  vi.spyOn(experience, 'autoCaptureLocation').mockImplementation(() => Promise.resolve(null));
  vi.spyOn(experience, 'updateLocalScoreEntry').mockImplementation(() => {});
  vi.spyOn(experience, 'loadScoreboard').mockImplementation(() => {});
  vi.spyOn(experience, 'exposeDebugInterface').mockImplementation(() => {});
  vi.spyOn(experience, 'renderFrame').mockImplementation(() => {});
  vi.spyOn(experience, 'emitGameEvent').mockImplementation(() => {});
  vi.spyOn(experience, 'queueCharacterPreload').mockImplementation(() => {});
  vi.spyOn(experience, 'loadFirstPersonArms').mockImplementation(() => {});
  vi.spyOn(experience, 'initializeScoreboardUi').mockImplementation(() => {});
  vi.spyOn(experience, 'applyDimensionSettings').mockImplementation(function () {
    this.dimensionSettings = { id: 'origin', palette: {} };
  });

  experience.updateHud = vi.fn();
  experience.showHint = vi.fn();
  experience.scheduleScoreSync = vi.fn();
  experience.audio.play = vi.fn();
  experience.audio.playRandom = vi.fn();

  return { experience, spawnTop };
}

describe('SimpleExperience lighting safeguards', () => {
  it('ensures primary sunlight exists when missing', () => {
    const { experience } = createExperienceForTest();
    const root = new window.THREE.Group();
    experience.scene = new window.THREE.Scene();
    experience.scene.add(root);
    experience.worldRoot = root;
    experience.sunLight = null;
    experience.hemiLight = null;
    experience.moonLight = null;
    experience.ambientLight = null;

    experience.ensurePrimaryLights();

    expect(experience.sunLight).toBeInstanceOf(window.THREE.DirectionalLight);
    expect(root.children.includes(experience.sunLight)).toBe(true);
    expect(experience.ambientLight).toBeInstanceOf(window.THREE.AmbientLight);
  });

  it('activates lighting fallback when portal shader creation fails', () => {
    const failure = new Error('Shader failure for test');
    const originalThreeGlobal = window.THREE_GLOBAL;
    const failingThree = {
      ...window.THREE,
      ShaderMaterial: class FailingShaderMaterial {
        constructor() {
          throw failure;
        }
      },
    };

    let experience;
    try {
      ({ experience } = createExperienceForTest({
        beforeCreate: () => {
          window.THREE_GLOBAL = failingThree;
        },
      }));
    } finally {
      window.THREE_GLOBAL = originalThreeGlobal;
    }

    expect(experience.portalShaderFallbackActive).toBe(true);
    expect(experience.materials.portal).toBeInstanceOf(window.THREE.MeshStandardMaterial);
    expect(experience.lightingFallbackPending).toBe(true);

    const root = new window.THREE.Group();
    experience.scene = new window.THREE.Scene();
    experience.scene.add(root);
    experience.worldRoot = root;
    experience.ensurePrimaryLights();
    experience.applyPendingLightingFallback();

    expect(experience.lightingFallbackActive).toBe(true);
    expect(experience.ambientLight.intensity).toBeGreaterThanOrEqual(0.35);
    expect(experience.sunLight.intensity).toBeGreaterThanOrEqual(0.85);
  });
});

beforeAll(() => {
  ensureSimpleExperienceLoaded();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simple experience entity lifecycle', () => {
  it('positions Steve and spawns treasure chests when the scene loads', async () => {
    const { experience, spawnTop } = createExperienceForTest();
    const originalSpawnChests = experience.spawnDimensionChests;
    const originalPositionPlayer = experience.positionPlayer;

    const spawnChestsSpy = vi
      .spyOn(experience, 'spawnDimensionChests')
      .mockImplementation(function (...args) {
        return originalSpawnChests.apply(this, args);
      });
    const positionSpy = vi
      .spyOn(experience, 'positionPlayer')
      .mockImplementation(function (...args) {
        return originalPositionPlayer.apply(this, args);
      });

    experience.start();
    await Promise.resolve();

    expect(spawnChestsSpy).toHaveBeenCalledTimes(1);
    expect(positionSpy).toHaveBeenCalled();
    expect(experience.chests).toHaveLength(2);
    expect(experience.chestGroup.children).toHaveLength(2);
    expect(experience.playerRig.position.x).toBeCloseTo(spawnTop.position.x);
    expect(experience.playerRig.position.y).toBeCloseTo(spawnTop.position.y + 1.8);
    expect(experience.playerRig.position.z).toBeCloseTo(spawnTop.position.z);
  });

  it('spawns zombies at night and summons iron golems to defend the player', async () => {
    const { experience } = createExperienceForTest();
    const originalSpawnZombie = experience.spawnZombie;
    const originalSpawnGolem = experience.spawnGolem;

    const spawnZombieSpy = vi
      .spyOn(experience, 'spawnZombie')
      .mockImplementation(function (...args) {
        return originalSpawnZombie.apply(this, args);
      });
    const spawnGolemSpy = vi
      .spyOn(experience, 'spawnGolem')
      .mockImplementation(function (...args) {
        return originalSpawnGolem.apply(this, args);
      });

    experience.start();
    await Promise.resolve();

    expect(experience.zombies).toHaveLength(0);

    experience.forceNightCycle();
    experience.lastZombieSpawn = experience.elapsed - 100;
    experience.updateZombies(0.5);

    expect(spawnZombieSpy).toHaveBeenCalled();
    expect(experience.zombies.length).toBeGreaterThan(0);
    expect(experience.zombieGroup.children.length).toBeGreaterThan(0);
    expect(experience.isNight()).toBe(true);

    experience.lastGolemSpawn = experience.elapsed - 100;
    experience.updateGolems(0.5);

    expect(spawnGolemSpy).toHaveBeenCalled();
    expect(experience.golems.length).toBeGreaterThan(0);
    expect(experience.golemGroup.children.length).toBeGreaterThan(0);
  });

  it('re-registers entity groups when they are missing', async () => {
    const { experience } = createExperienceForTest();

    experience.start();
    await Promise.resolve();

    if (experience.scene && experience.zombieGroup) {
      experience.scene.remove(experience.zombieGroup);
    }
    experience.zombieGroup = null;
    experience.zombies = [];
    experience.forceNightCycle();
    experience.lastZombieSpawn = experience.elapsed - 100;
    experience.spawnZombie();

    expect(experience.zombieGroup).toBeTruthy();
    expect(experience.zombieGroup.parent).toBe(experience.scene);
    expect(experience.zombies.length).toBeGreaterThan(0);

    if (experience.scene && experience.golemGroup) {
      experience.scene.remove(experience.golemGroup);
    }
    experience.golemGroup = null;
    experience.golems = [];
    experience.lastGolemSpawn = experience.elapsed - 100;
    experience.spawnGolem();

    expect(experience.golemGroup).toBeTruthy();
    expect(experience.golemGroup.parent).toBe(experience.scene);
    expect(experience.golems.length).toBeGreaterThan(0);

    if (experience.scene && experience.chestGroup) {
      experience.scene.remove(experience.chestGroup);
    }
    experience.chestGroup = null;
    experience.chests = [];
    experience.spawnDimensionChests();

    expect(experience.chestGroup).toBeTruthy();
    expect(experience.chestGroup.parent).toBe(experience.scene);
    expect(experience.chestGroup.children.length).toBeGreaterThan(0);
  });

  it('blocks portal activation when the player occupies the portal footprint', async () => {
    const { experience } = createExperienceForTest();
    const igniteStub = vi.fn(() => ({ events: ['Test spark'], portal: { frame: [], tiles: [] } }));
    experience.portalMechanics = {
      ...experience.portalMechanics,
      ignitePortalFrame: igniteStub,
    };

    experience.start();
    await Promise.resolve();

    const worldSize = experience.heightMap.length;
    experience.initialHeightMap = Array.from({ length: worldSize }, () => Array(worldSize).fill(0));
    experience.portalAnchorGrid = experience.computePortalAnchorGrid();
    const anchor = experience.portalAnchorGrid;
    const half = worldSize / 2;
    const centerX = (anchor.x - half) * 1;
    const centerZ = (anchor.z - half) * 1;
    const baseHeight = experience.initialHeightMap[anchor.x][anchor.z] ?? 0;

    experience.portalReady = true;
    experience.portalFrameInteriorValid = true;
    experience.portalBlocksPlaced = experience.portalFrameRequiredCount;
    experience.portalActivated = false;
    experience.score = 0;
    experience.showHint.mockClear();
    experience.scheduleScoreSync.mockClear();

    experience.playerRig.position.set(centerX, baseHeight + 1.8, centerZ);

    experience.ignitePortal('torch');

    expect(experience.portalActivated).toBe(false);
    expect(experience.portalReady).toBe(true);
    expect(experience.score).toBe(0);
    expect(experience.portalFootprintObstructed).toBe(true);
    expect(experience.portalIgnitionLog[0]).toContain('Portal activation blocked');
    expect(experience.scheduleScoreSync).not.toHaveBeenCalledWith('portal-primed');
    const blockedHint = experience.showHint.mock.calls.at(-1)?.[0] ?? '';
    expect(blockedHint).toContain('Portal activation blocked');
    expect(blockedHint).toContain('player');

    experience.showHint.mockClear();
    experience.scheduleScoreSync.mockClear();
    experience.portalReady = true;
    experience.portalFootprintObstructed = false;
    experience.playerRig.position.set(centerX, baseHeight + 1.8, centerZ + 6);

    experience.ignitePortal('torch');

    expect(experience.portalActivated).toBe(true);
    expect(experience.portalReady).toBe(false);
    expect(experience.score).toBe(5);
    expect(experience.scheduleScoreSync).toHaveBeenCalledWith('portal-primed');
    const successHint = experience.showHint.mock.calls.at(-1)?.[0] ?? '';
    expect(successHint).toBe('Test spark');
  });

  it('blocks portal activation when a chest occupies the portal footprint', async () => {
    const { experience } = createExperienceForTest();
    const igniteStub = vi.fn(() => ({ events: [], portal: { frame: [], tiles: [] } }));
    experience.portalMechanics = {
      ...experience.portalMechanics,
      ignitePortalFrame: igniteStub,
    };

    experience.start();
    await Promise.resolve();

    const worldSize = experience.heightMap.length;
    experience.initialHeightMap = Array.from({ length: worldSize }, () => Array(worldSize).fill(0));
    experience.portalAnchorGrid = experience.computePortalAnchorGrid();
    const anchor = experience.portalAnchorGrid;
    const half = worldSize / 2;
    const centerX = (anchor.x - half) * 1;
    const centerZ = (anchor.z - half) * 1;
    const baseHeight = experience.initialHeightMap[anchor.x][anchor.z] ?? 0;

    experience.portalReady = true;
    experience.portalFrameInteriorValid = true;
    experience.portalBlocksPlaced = experience.portalFrameRequiredCount;
    experience.portalActivated = false;
    experience.score = 0;
    experience.showHint.mockClear();
    experience.scheduleScoreSync.mockClear();

    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial());
    chestMesh.position.set(centerX, baseHeight + 0.45, centerZ);
    experience.chestGroup = experience.chestGroup || new THREE.Group();
    experience.chestGroup.add(chestMesh);
    experience.chests = [
      {
        id: 'test-chest',
        mesh: chestMesh,
        opened: false,
      },
    ];

    experience.ignitePortal('torch');

    expect(experience.portalActivated).toBe(false);
    expect(experience.portalReady).toBe(true);
    expect(experience.portalFootprintObstructed).toBe(true);
    const hint = experience.showHint.mock.calls.at(-1)?.[0] ?? '';
    expect(hint).toContain('Portal activation blocked');
    expect(hint).toContain('loot chest');
    expect(experience.scheduleScoreSync).not.toHaveBeenCalledWith('portal-primed');
  });
});
