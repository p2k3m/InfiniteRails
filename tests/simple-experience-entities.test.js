import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const DefaultWebGL2RenderingContextStub = function WebGL2RenderingContextStub() {};

if (typeof globalThis.WebGL2RenderingContext !== 'function') {
  globalThis.WebGL2RenderingContext = DefaultWebGL2RenderingContextStub;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const PORTAL_SHADER_FALLBACK_ANNOUNCEMENT = 'Portal shader offline — emissive fallback active.';

function createCanvasStub() {
  const loseContextStub = { loseContext: () => {} };
  const webglContextPrototype =
    typeof globalThis.WebGL2RenderingContext === 'function'
      ? globalThis.WebGL2RenderingContext.prototype
      : Object.prototype;
  const webglContext = Object.create(webglContextPrototype);
  webglContext.getExtension = (name) => {
    if (name === 'WEBGL_lose_context') {
      return loseContextStub;
    }
    return null;
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
  windowStub.WebGL2RenderingContext = globalThis.WebGL2RenderingContext;

  globalThis.THREE_GLOBAL = THREE;
  globalThis.THREE = THREE;

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
  if (typeof globalThis !== 'undefined' && typeof globalThis.window?.THREE_GLOBAL === 'object') {
    globalThis.THREE_GLOBAL = globalThis.window.THREE_GLOBAL;
    globalThis.THREE = globalThis.window.THREE_GLOBAL;
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
    const root = new window.THREE_GLOBAL.Group();
    experience.scene = new window.THREE_GLOBAL.Scene();
    experience.scene.add(root);
    experience.worldRoot = root;
    experience.sunLight = null;
    experience.hemiLight = null;
    experience.moonLight = null;
    experience.ambientLight = null;

    experience.ensurePrimaryLights();

    expect(experience.sunLight).toBeInstanceOf(window.THREE_GLOBAL.DirectionalLight);
    expect(root.children.includes(experience.sunLight)).toBe(true);
    expect(experience.ambientLight).toBeInstanceOf(window.THREE_GLOBAL.AmbientLight);
  });

  it('activates lighting fallback when portal shader creation fails', () => {
    const failure = new Error('Shader failure for test');
    const originalThreeGlobal = window.THREE_GLOBAL;
    const failingThree = {
      ...window.THREE_GLOBAL,
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
    expect(experience.materials.portal).toBeInstanceOf(window.THREE_GLOBAL.MeshStandardMaterial);
    expect(experience.lightingFallbackPending).toBe(true);
    expect(experience.portalIgnitionLog[0]).toBe(PORTAL_SHADER_FALLBACK_ANNOUNCEMENT);
    expect(experience.portalStatusMessage).toBe(PORTAL_SHADER_FALLBACK_ANNOUNCEMENT);

    const root = new window.THREE_GLOBAL.Group();
    experience.scene = new window.THREE_GLOBAL.Scene();
    experience.scene.add(root);
    experience.worldRoot = root;
    experience.ensurePrimaryLights();
    experience.applyPendingLightingFallback();

    expect(experience.lightingFallbackActive).toBe(true);
    expect(experience.ambientLight.intensity).toBeGreaterThanOrEqual(0.35);
    expect(experience.sunLight.intensity).toBeGreaterThanOrEqual(0.85);
  });

  it('reverts to emissive placeholder and surfaces a UI notice when portal uniforms fail', () => {
    const { experience } = createExperienceForTest();
    experience.refreshPortalObstructionState = vi.fn().mockReturnValue({ blocked: false, summary: '' });
    experience.computePortalAnchorGrid = vi.fn().mockReturnValue({ x: 0, z: 0 });
    experience.getPortalAnchorWorldPosition = vi.fn(() => ({ x: 0, y: 0, z: 0 }));
    const placeholderMesh = new window.THREE_GLOBAL.Mesh();
    placeholderMesh.userData = {};
    experience.createPortalPlaceholderMesh = vi.fn(() => placeholderMesh);
    experience.portalGroup = new window.THREE_GLOBAL.Group();
    experience.hidePortalInteriorBlocks = vi.fn();
    experience.updatePortalInteriorValidity = vi.fn();
    const failingUniform = {
      clone: () => {
        throw new Error('uniform clone failed');
      },
    };
    experience.materials.portal.uniforms = {
      uColorA: { value: failingUniform },
      uColorB: { value: new window.THREE_GLOBAL.Color('#2cb67d') },
    };

    const result = experience.activatePortal();

    expect(result).toBe(true);
    expect(experience.portalShaderFallbackActive).toBe(true);
    expect(experience.portalMesh).toBe(placeholderMesh);
    expect(placeholderMesh.userData.placeholderReason).toBe('shader-fallback');
    expect(experience.lastHintMessage).toBe(PORTAL_SHADER_FALLBACK_ANNOUNCEMENT);
    expect(experience.portalIgnitionLog[0]).toBe(PORTAL_SHADER_FALLBACK_ANNOUNCEMENT);
    expect(experience.portalStatusMessage).toBe(PORTAL_SHADER_FALLBACK_ANNOUNCEMENT);
  });
});

beforeAll(() => {
  ensureSimpleExperienceLoaded();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dimension loot tables', () => {
  it('exposes frozen loot tables for every dimension', () => {
    ensureSimpleExperienceLoaded();
    const lootTables = window.SimpleExperience?.dimensionLootTables;
    expect(lootTables).toBeTruthy();
    const expectedIds = ['origin', 'rock', 'stone', 'tar', 'marble', 'netherite'];
    expect(Object.keys(lootTables)).toEqual(expect.arrayContaining(expectedIds));
    expectedIds.forEach((id) => {
      const table = lootTables[id];
      expect(Array.isArray(table)).toBe(true);
      expect(table.length).toBeGreaterThan(0);
      expect(Object.isFrozen(table)).toBe(true);
      table.forEach((entry) => {
        expect(Object.isFrozen(entry)).toBe(true);
        expect(Object.isFrozen(entry.items)).toBe(true);
      });
    });
  });

  it('initialises loot order caches for each dimension', () => {
    const { experience } = createExperienceForTest();
    const lootTables = window.SimpleExperience.dimensionLootTables;
    Object.entries(lootTables).forEach(([id, entries]) => {
      const order = experience.dimensionLootOrders.get(id);
      expect(Array.isArray(order)).toBe(true);
      expect(order.length).toBe(entries.length);
      expect(new Set(order).size).toBe(entries.length);
      expect(experience.dimensionLootOrderOffsets.get(id)).toBe(0);
    });
  });

  it('cycles through shuffled loot entries per dimension index', () => {
    const { experience } = createExperienceForTest();
    const originTable = window.SimpleExperience.dimensionLootTables.origin;
    const seenMessages = [];
    for (let i = 0; i < originTable.length; i += 1) {
      const loot = experience.getChestLootForDimension('origin', i);
      seenMessages.push(loot.message);
    }
    expect(new Set(seenMessages).size).toBe(originTable.length);
    const wrapped = experience.getChestLootForDimension('origin', originTable.length);
    expect(wrapped.message).toBe(seenMessages[0]);
  });
});

describe('movement binding diagnostics', () => {
  it('captures avatar world position when queuing validation and clears after rig movement', () => {
    const { experience } = createExperienceForTest();
    experience.setupScene();
    experience.ensurePlayerPhysicsBody();
    const placeholder = experience.ensurePlayerAvatarPlaceholder('boot');
    expect(placeholder).toBeTruthy();

    const diagnostics = experience.movementBindingDiagnostics;
    const getHighResSpy = vi.spyOn(experience, 'getHighResTimestamp');
    getHighResSpy.mockReturnValueOnce(0);
    getHighResSpy.mockReturnValue(1000);

    experience.queueMovementBindingValidation('moveForward');

    expect(diagnostics.pending).toBe(true);
    expect(diagnostics.initialAvatarPosition).toBeTruthy();
    expect(typeof diagnostics.initialAvatarPosition.copy).toBe('function');

    const snapshot = diagnostics.initialAvatarPosition.clone();
    const avatarPosition = experience.getPlayerAvatarWorldPosition(new window.THREE_GLOBAL.Vector3());
    expect(snapshot.distanceToSquared(avatarPosition)).toBeLessThan(1e-6);

    const validateSpy = vi.spyOn(experience, 'validateMovementBindings');

    experience.playerRig.position.x += 0.75;
    experience.ensurePlayerPhysicsBody();
    experience.evaluateMovementBindingDiagnostics();

    expect(diagnostics.pending).toBe(false);
    expect(validateSpy).not.toHaveBeenCalled();
  });

  it('invokes diagnostics when only the camera moves without player displacement', () => {
    const { experience } = createExperienceForTest();
    experience.setupScene();
    experience.ensurePlayerPhysicsBody();
    experience.ensurePlayerAvatarPlaceholder('boot');

    const getHighResSpy = vi.spyOn(experience, 'getHighResTimestamp');
    getHighResSpy.mockReturnValueOnce(0);
    getHighResSpy.mockReturnValue(1000);

    const validateSpy = vi.spyOn(experience, 'validateMovementBindings');

    experience.queueMovementBindingValidation('moveForward');

    experience.camera.position.z -= 1.2;
    experience.evaluateMovementBindingDiagnostics();

    expect(validateSpy).toHaveBeenCalledTimes(1);
    const [anchor, rigDisplacementSq, avatarAnchor, avatarDisplacementSq] = validateSpy.mock.calls[0];
    expect(anchor).toBeTruthy();
    expect(avatarAnchor).toBeTruthy();
    if (rigDisplacementSq !== null) {
      expect(rigDisplacementSq).toBeLessThan(0.0025);
    }
    if (avatarDisplacementSq !== null) {
      expect(avatarDisplacementSq).toBeLessThan(0.0025);
    }
  });
});

describe('scene population validator', () => {
  it('asserts and overlays when required scene nodes are missing after the initial population', () => {
    const { experience } = createExperienceForTest();
    experience.setupScene();
    experience.worldRoot = experience.scene;
    experience.scene.add(experience.terrainGroup);
    const chunk = new window.THREE_GLOBAL.Group();
    experience.terrainChunkGroups = [chunk];
    experience.terrainGroup.add(chunk);
    experience.positionPlayer = vi.fn();
    experience.spawnDimensionChests = vi.fn();
    experience.populateInitialMobs = vi.fn();

    const overlay = {
      showError: vi.fn(),
      setDiagnostic: vi.fn(),
      logEvent: vi.fn(),
    };
    const originalOverlay = window.bootstrapOverlay;
    const originalNotify = globalThis.notifyLiveDiagnostics;
    const notifySpy = vi.fn();
    window.bootstrapOverlay = overlay;
    globalThis.notifyLiveDiagnostics = notifySpy;

    const summary = {
      steve: { present: false, placeholder: false, nodeName: null, attached: false },
      ground: { present: true, attached: true, terrainGroupChildren: 1 },
      blocks: { present: false, attached: false, meshCount: 0, sampleChunk: null },
      mobs: {
        present: false,
        zombieCount: 0,
        golemCount: 0,
        total: 0,
        groups: { zombieAttached: false, golemAttached: false },
      },
      missing: ['steve', 'block', 'mob'],
      allPresent: false,
    };

    experience.summariseRequiredSceneNodes = vi.fn().mockReturnValue(summary);

    const assertSpy = vi.spyOn(console, 'assert').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      experience.populateSceneAfterTerrain({ reason: 'start' });

      expect(assertSpy).toHaveBeenCalledWith(
        false,
        expect.stringContaining('Scene graph validation failed — required nodes missing after scene population.'),
        expect.objectContaining({ missing: summary.missing, reason: 'start' }),
      );
      expect(overlay.showError).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Scene validation failed' }),
      );
      expect(overlay.setDiagnostic).toHaveBeenCalledWith(
        'scene',
        expect.objectContaining({ status: 'error' }),
      );
      expect(overlay.logEvent).toHaveBeenCalledWith(
        'scene',
        expect.stringContaining('Scene validation failed'),
        expect.objectContaining({ level: 'error' }),
      );
    } finally {
      assertSpy.mockRestore();
      errorSpy.mockRestore();
      window.bootstrapOverlay = originalOverlay;
      globalThis.notifyLiveDiagnostics = originalNotify;
    }
  });
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

  it('advances loot order offsets whenever chests respawn', async () => {
    const { experience } = createExperienceForTest();
    experience.start();
    await Promise.resolve();

    const dimensionId = experience.dimensionSettings?.id || 'origin';
    const initialOffset = experience.dimensionLootOrderOffsets.get(dimensionId) || 0;
    const chestCount = experience.chests.length;

    experience.spawnDimensionChests();

    const updatedOffset = experience.dimensionLootOrderOffsets.get(dimensionId) || 0;
    expect(updatedOffset - initialOffset).toBe(chestCount);
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

  it('spawns zombies even when the zombie material is unavailable', async () => {
    const { experience } = createExperienceForTest();

    experience.start();
    await Promise.resolve();

    experience.materials.zombie = null;
    experience.forceNightCycle();
    experience.lastZombieSpawn = experience.elapsed - 100;

    expect(() => experience.spawnZombie()).not.toThrow();
    expect(experience.zombies.length).toBeGreaterThan(0);
    expect(experience.zombieGroup.children.length).toBeGreaterThan(0);
  });

  it('repositions zombies onto a safe navmesh when their spawn chunk lacks coverage', async () => {
    const { experience } = createExperienceForTest();

    experience.start();
    await Promise.resolve();

    experience.forceNightCycle();
    experience.lastZombieSpawn = experience.elapsed - 100;

    const fallbackNavmesh = {
      key: 'player',
      walkableCellCount: 1,
      cells: [
        {
          worldX: 1,
          worldZ: -2,
          surfaceY: 3,
        },
      ],
    };

    const ensureChunkSpy = vi
      .spyOn(experience, 'ensureNavigationMeshForChunk')
      .mockImplementation((chunkKey, options) => {
        if (chunkKey === 'player') {
          return fallbackNavmesh;
        }
        return null;
      });

    const ensureWorldSpy = vi
      .spyOn(experience, 'ensureNavigationMeshForWorldPosition')
      .mockReturnValue(null);

    const playerPosSpy = vi.spyOn(experience, 'getPlayerWorldPosition').mockImplementation(() => {
      return new experience.THREE.Vector3(0, 0, 0);
    });

    const chunkKeySpy = vi
      .spyOn(experience, 'getChunkKeyForWorldPosition')
      .mockImplementation((x, z) => {
        if (Math.abs(x) < 1e-6 && Math.abs(z) < 1e-6) {
          return 'player';
        }
        return 'spawn';
      });

    const groundSpy = vi.spyOn(experience, 'sampleGroundHeight').mockReturnValue(0);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);

    try {
      expect(() => experience.spawnZombie()).not.toThrow();

      expect(ensureChunkSpy).toHaveBeenCalledWith('spawn', expect.objectContaining({ reason: 'zombie-spawn' }));
      expect(ensureChunkSpy).toHaveBeenCalledWith(
        'player',
        expect.objectContaining({ reason: 'zombie-spawn-fallback' }),
      );
      expect(experience.zombies.length).toBeGreaterThan(0);
      const zombie = experience.zombies[experience.zombies.length - 1];
      expect(zombie.navChunkKey).toBe('player');
      expect(zombie.mesh.position.x).toBeCloseTo(fallbackNavmesh.cells[0].worldX, 5);
      expect(zombie.mesh.position.z).toBeCloseTo(fallbackNavmesh.cells[0].worldZ, 5);
      expect(zombie.mesh.position.y).toBeCloseTo(fallbackNavmesh.cells[0].surfaceY + 0.9, 5);
    } finally {
      randomSpy.mockRestore();
      groundSpy.mockRestore();
      ensureChunkSpy.mockRestore();
      ensureWorldSpy.mockRestore();
      playerPosSpy.mockRestore();
      chunkKeySpy.mockRestore();
    }
  });

  it('warns when AI movement cannot resolve a navigation chunk', () => {
    const { experience } = createExperienceForTest();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      experience.ensureNavigationMeshForActorPosition('zombie', Number.NaN, 0, {
        stage: 'unit-test',
        throttleMs: 0,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        'AI movement failure detected. Verify navigation mesh rebuild scheduling and terrain coverage.',
        expect.objectContaining({
          actorType: 'zombie',
          stage: 'unit-test',
          reason: 'position-invalid',
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('spawns golems with fallback materials when MeshStandardMaterial is unavailable', async () => {
    const { experience } = createExperienceForTest();

    experience.start();
    await Promise.resolve();

    const originalThree = experience.THREE;
    const fallbackThree = { ...originalThree };
    delete fallbackThree.MeshStandardMaterial;
    experience.THREE = fallbackThree;

    try {
      experience.forceNightCycle();
      experience.lastGolemSpawn = experience.elapsed - 100;

      expect(() => experience.spawnGolem()).not.toThrow();
      expect(experience.golems.length).toBeGreaterThan(0);
      expect(experience.golemGroup.children.length).toBeGreaterThan(0);
    } finally {
      experience.THREE = originalThree;
    }
  });

  it('requests navigation coverage for zombies even when models are unavailable', async () => {
    const { experience } = createExperienceForTest();

    experience.start();
    await Promise.resolve();

    experience.forceNightCycle();

    const ensureChunkSpy = vi.spyOn(experience, 'ensureNavigationMeshForChunk');
    const ensureWorldSpy = vi.spyOn(experience, 'ensureNavigationMeshForWorldPosition');
    const originalClone = experience.cloneModelScene;
    const cloneSpy = vi
      .spyOn(experience, 'cloneModelScene')
      .mockImplementation(function (key, ...args) {
        if (key === 'zombie') {
          return Promise.reject(new Error('missing zombie model'));
        }
        return originalClone.apply(this, [key, ...args]);
      });

    experience.lastZombieSpawn = experience.elapsed - 100;

    expect(() => experience.spawnZombie()).not.toThrow();
    expect(experience.zombies.length).toBeGreaterThan(0);
    expect(
      ensureChunkSpy.mock.calls.some(([, options]) => options?.reason === 'zombie-spawn'),
    ).toBe(true);

    await Promise.resolve();

    ensureChunkSpy.mockClear();
    ensureWorldSpy.mockClear();

    const playerPosition = new experience.THREE.Vector3(3, 0, 3);
    vi.spyOn(experience, 'getPlayerWorldPosition').mockImplementation(function (target) {
      if (target?.copy) {
        target.copy(playerPosition);
        return target;
      }
      return playerPosition.clone();
    });

    experience.updateZombies(0.16);

    expect(ensureWorldSpy).toHaveBeenCalledWith(playerPosition.x, playerPosition.z);
    expect(
      ensureChunkSpy.mock.calls.some(([, options]) => options?.reason === 'zombie-chase'),
    ).toBe(true);

    cloneSpy.mockRestore();
  });

  it('steers golems using navigation meshes when model upgrades fail', async () => {
    const { experience } = createExperienceForTest();

    experience.start();
    await Promise.resolve();

    experience.forceNightCycle();

    const ensureWorldSpy = vi.spyOn(experience, 'ensureNavigationMeshForWorldPosition');
    const originalClone = experience.cloneModelScene;
    const cloneSpy = vi
      .spyOn(experience, 'cloneModelScene')
      .mockImplementation(function (key, ...args) {
        if (key === 'golem') {
          return Promise.reject(new Error('missing golem model'));
        }
        return originalClone.apply(this, [key, ...args]);
      });

    experience.lastZombieSpawn = experience.elapsed - 100;
    experience.spawnZombie();

    ensureWorldSpy.mockClear();

    experience.lastGolemSpawn = experience.elapsed - 100;
    expect(() => experience.spawnGolem()).not.toThrow();
    expect(experience.golems.length).toBeGreaterThan(0);

    await Promise.resolve();

    ensureWorldSpy.mockClear();

    const golem = experience.golems[0];
    const targetZombie = experience.zombies[0];
    golem.mesh.position.set(
      targetZombie.mesh.position.x + 5,
      targetZombie.mesh.position.y,
      targetZombie.mesh.position.z + 5,
    );
    const golemPosition = golem.mesh.position.clone();
    const targetPosition = targetZombie.mesh.position.clone();

    experience.updateGolems(0.16);

    const calledForGolem = ensureWorldSpy.mock.calls.some(([x, z]) => {
      return Math.abs(x - golemPosition.x) < 1e-5 && Math.abs(z - golemPosition.z) < 1e-5;
    });
    expect(calledForGolem).toBe(true);

    const calledForTarget = ensureWorldSpy.mock.calls.some(([x, z]) => {
      return Math.abs(x - targetPosition.x) < 1e-5 && Math.abs(z - targetPosition.z) < 1e-5;
    });
    expect(calledForTarget).toBe(true);

    cloneSpy.mockRestore();
  });

  it('shows the global debug overlay when AI attachment fails', async () => {
    const overlay = {
      hidden: true,
      attributes: {},
      dataset: {},
      removeAttribute: vi.fn((name) => {
        delete overlay.attributes[name];
        if (name === 'hidden') {
          overlay.hidden = false;
        }
      }),
      setAttribute: vi.fn((name, value) => {
        overlay.attributes[name] = value;
      }),
      toggleAttribute: vi.fn((name, force) => {
        if (force) {
          overlay.attributes[name] = '';
        } else {
          delete overlay.attributes[name];
        }
      }),
    };
    const titleEl = { textContent: '' };
    const messageEl = { textContent: '' };
    const rendererStatusEl = { textContent: '' };
    const rendererDiagnostic = { setAttribute: vi.fn() };

    const originalGetElementById = window.document.getElementById;
    const originalQuerySelector = window.document.querySelector;

    window.document.getElementById = vi.fn((id) => {
      switch (id) {
        case 'globalOverlay':
          return overlay;
        case 'globalOverlayTitle':
          return titleEl;
        case 'globalOverlayMessage':
          return messageEl;
        case 'globalOverlayRendererStatus':
          return rendererStatusEl;
        default:
          return typeof originalGetElementById === 'function' ? originalGetElementById(id) : null;
      }
    });
    window.document.querySelector = vi.fn((selector) => {
      if (selector === '[data-diagnostic="renderer"]') {
        return rendererDiagnostic;
      }
      return typeof originalQuerySelector === 'function' ? originalQuerySelector(selector) : null;
    });

    try {
      const { experience } = createExperienceForTest();

      experience.handleEntityAttachmentFailure('zombie', { reason: 'world-root-unavailable' });

      expect(overlay.hidden).toBe(false);
      expect(overlay.setAttribute).toHaveBeenCalledWith('data-mode', 'error');
      expect(titleEl.textContent).toBe('AI systems offline');
      expect(messageEl.textContent).toContain('AI scripts');
      expect(rendererDiagnostic.setAttribute).toHaveBeenCalledWith('data-status', 'error');
      expect(rendererStatusEl.textContent).toContain('reload');
    } finally {
      window.document.getElementById = originalGetElementById;
      window.document.querySelector = originalQuerySelector;
    }
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

  it('rebinds entity chunk anchors after a world reload', () => {
    const { experience } = createExperienceForTest();
    const { THREE } = experience;

    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial());
    chestMesh.position.set(0.5, 1, -0.5);
    experience.chestGroup = new THREE.Group();
    experience.chestGroup.add(chestMesh);
    experience.chests = [
      {
        id: 'test-chest',
        mesh: chestMesh,
        lidPivot: null,
        lid: null,
        highlightMaterials: [],
        baseY: chestMesh.position.y,
        baseScale: { x: 1, y: 1, z: 1 },
        opened: false,
        openProgress: 0,
        loot: { items: [], score: 0, message: '' },
        pulseOffset: 0,
        glowLevel: 0.25,
        hintShown: false,
        chunkKey: null,
      },
    ];

    const zombieMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.9), new THREE.MeshBasicMaterial());
    zombieMesh.position.set(1.2, 2, 1.6);
    experience.zombieGroup = new THREE.Group();
    experience.zombieGroup.add(zombieMesh);
    experience.zombies = [
      {
        id: 'z-1',
        mesh: zombieMesh,
        collisionRadius: 0.6,
        speed: 2.4,
        lastAttack: 0,
        placeholder: true,
        animation: null,
        navChunkKey: null,
        spawnedAt: 0,
      },
    ];

    const golemMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.7, 1.2), new THREE.MeshBasicMaterial());
    golemMesh.position.set(-1.4, 2, -1.1);
    experience.golemGroup = new THREE.Group();
    experience.golemGroup.add(golemMesh);
    experience.golems = [
      {
        id: 'g-1',
        mesh: golemMesh,
        collisionRadius: 0.8,
        cooldown: 0,
        speed: 3,
        placeholder: true,
        animation: null,
        chunkKey: null,
      },
    ];

    const playerPosition = new THREE.Vector3(0, 2, 0);
    const playerPositionSpy = vi
      .spyOn(experience, 'getPlayerWorldPosition')
      .mockReturnValue(playerPosition.clone());
    const navmeshSpy = vi
      .spyOn(experience, 'ensureNavigationMeshForActorChunk')
      .mockReturnValue({ walkableCellCount: 1 });

    const summary = experience.rebindEntityChunkAnchors({ reason: 'world-reload' });

    const expectedPlayerChunk = experience.getChunkKeyForWorldPosition(playerPosition.x, playerPosition.z);

    expect(summary.reason).toBe('world-reload');
    expect(summary.player.chunkKey).toBe(expectedPlayerChunk);
    expect(summary.player.rebound).toBe(true);
    expect(experience.playerChunkKey).toBe(expectedPlayerChunk);

    expect(summary.chests.total).toBe(1);
    expect(summary.chests.rebound).toBe(1);
    expect(experience.chests[0].chunkKey).toBeTruthy();
    expect(experience.chests[0].mesh.userData.chunkKey).toBe(experience.chests[0].chunkKey);

    expect(summary.zombies.total).toBe(1);
    expect(summary.zombies.rebound).toBe(1);
    expect(experience.zombies[0].navChunkKey).toBeTruthy();
    expect(experience.zombies[0].mesh.userData.chunkKey).toBe(experience.zombies[0].navChunkKey);

    expect(summary.golems.total).toBe(1);
    expect(summary.golems.rebound).toBe(1);
    expect(experience.golems[0].chunkKey).toBeTruthy();
    expect(experience.golems[0].mesh.userData.chunkKey).toBe(experience.golems[0].chunkKey);

    expect(navmeshSpy).toHaveBeenCalledTimes(2);
    expect(navmeshSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [
          'zombie',
          experience.zombies[0].navChunkKey,
          expect.objectContaining({
            reason: 'world-reload-rebind',
            stage: 'chunk-rebind',
            zombieId: experience.zombies[0].id,
          }),
        ],
        [
          'golem',
          experience.golems[0].chunkKey,
          expect.objectContaining({
            reason: 'world-reload-rebind',
            stage: 'chunk-rebind',
            golemId: experience.golems[0].id,
          }),
        ],
      ]),
    );

    expect(summary.errors).toHaveLength(0);

    navmeshSpy.mockRestore();
    playerPositionSpy.mockRestore();
  });

  it('highlights misaligned portal frames and prompts the player', async () => {
    const { experience } = createExperienceForTest();
    experience.start();
    await Promise.resolve();

    const showHintSpy = vi.spyOn(experience, 'showHint').mockImplementation(() => {});

    try {
      const worldSize = experience.heightMap.length;
      experience.initialHeightMap = Array.from({ length: worldSize }, () => Array(worldSize).fill(0));
      experience.heightMap = experience.initialHeightMap.map((row) => row.slice());
      experience.portalAnchorGrid = experience.computePortalAnchorGrid();
      const anchor = experience.portalAnchorGrid;
      const gridZ = Math.max(0, Math.min(worldSize - 1, anchor.z));
      const leftX = Math.max(0, Math.min(worldSize - 1, anchor.x - 1));
      const centerX = Math.max(0, Math.min(worldSize - 1, anchor.x));
      const rightX = Math.max(0, Math.min(worldSize - 1, anchor.x + 1));

      experience.initialHeightMap[leftX][gridZ] = 1;
      experience.heightMap[leftX][gridZ] = 1;

      experience.resetPortalFrameState();

      const BLOCK_SIZE = 1;
      const buildColumn = (gridX) => {
        const columnKey = `${gridX}|${gridZ}`;
        const column = [];
        const baseHeight = experience.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
        for (let level = 0; level < baseHeight; level += 1) {
          const mesh = new experience.THREE.Mesh(experience.blockGeometry, experience.materials.stone);
          mesh.position.set(
            (gridX - worldSize / 2) * BLOCK_SIZE,
            level * BLOCK_SIZE + BLOCK_SIZE / 2,
            (gridZ - worldSize / 2) * BLOCK_SIZE,
          );
          mesh.userData = { columnKey, level, gx: gridX, gz: gridZ, blockType: 'stone' };
          column[level] = mesh;
        }
        const slots = Array.from(experience.portalFrameSlots.values()).filter(
          (slot) => slot.gridX === gridX && slot.gridZ === gridZ,
        );
        slots.forEach((slot) => {
          const slotBase = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : experience.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
          const level = slotBase + slot.relY;
          const mesh = new experience.THREE.Mesh(experience.blockGeometry, experience.materials.stone);
          mesh.position.set(
            (gridX - worldSize / 2) * BLOCK_SIZE,
            level * BLOCK_SIZE + BLOCK_SIZE / 2,
            (gridZ - worldSize / 2) * BLOCK_SIZE,
          );
          mesh.userData = { columnKey, level, gx: gridX, gz: gridZ, blockType: 'stone' };
          column[level] = mesh;
        });
        experience.columns.set(columnKey, column);
        experience.heightMap[gridX][gridZ] = column.length;
        experience.updatePortalFrameStateForColumn(gridX, gridZ);
      };

      [leftX, centerX, rightX].forEach((gridX) => buildColumn(gridX));

      expect(experience.portalBlocksPlaced).toBe(experience.portalFrameRequiredCount);
      expect(experience.portalFrameFootprintValid).toBe(false);
      expect(experience.portalFrameValidationMessage).toContain('4×3');
      expect(experience.portalFrameHighlightMeshes.size).toBeGreaterThan(0);
      experience.portalFrameHighlightMeshes.forEach((mesh) => {
        expect(mesh.material).toBe(experience.materials.portalInvalid);
      });
      const snapshot = experience.getPortalStatusSnapshot();
      expect(snapshot.state).toBe('blocked');
      expect(snapshot.statusMessage).toContain('4×3');
      const hint = showHintSpy.mock.calls.at(-1)?.[0] ?? '';
      expect(hint).toContain('4×3');
    } finally {
      showHintSpy.mockRestore();
    }
  });

  it('accepts a level 4×3 stone frame as a valid portal footprint', async () => {
    const { experience } = createExperienceForTest();
    experience.start();
    await Promise.resolve();

    const showHintSpy = vi.spyOn(experience, 'showHint').mockImplementation(() => {});

    try {
      const worldSize = experience.heightMap.length;
      experience.initialHeightMap = Array.from({ length: worldSize }, () => Array(worldSize).fill(0));
      experience.heightMap = experience.initialHeightMap.map((row) => row.slice());
      experience.portalAnchorGrid = experience.computePortalAnchorGrid();
      const anchor = experience.portalAnchorGrid;
      const gridZ = Math.max(0, Math.min(worldSize - 1, anchor.z));
      const leftX = Math.max(0, Math.min(worldSize - 1, anchor.x - 1));
      const centerX = Math.max(0, Math.min(worldSize - 1, anchor.x));
      const rightX = Math.max(0, Math.min(worldSize - 1, anchor.x + 1));

      experience.resetPortalFrameState();

      const BLOCK_SIZE = 1;
      const buildColumn = (gridX) => {
        const columnKey = `${gridX}|${gridZ}`;
        const column = [];
        const baseHeight = experience.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
        const slots = Array.from(experience.portalFrameSlots.values()).filter(
          (slot) => slot.gridX === gridX && slot.gridZ === gridZ,
        );
        slots.forEach((slot) => {
          const slotBase = Number.isFinite(slot.baseHeight)
            ? slot.baseHeight
            : experience.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
          const level = slotBase + slot.relY;
          const mesh = new experience.THREE.Mesh(experience.blockGeometry, experience.materials.stone);
          mesh.position.set(
            (gridX - worldSize / 2) * BLOCK_SIZE,
            level * BLOCK_SIZE + BLOCK_SIZE / 2,
            (gridZ - worldSize / 2) * BLOCK_SIZE,
          );
          mesh.userData = { columnKey, level, gx: gridX, gz: gridZ, blockType: 'stone' };
          column[level] = mesh;
        });
        experience.columns.set(columnKey, column);
        experience.heightMap[gridX][gridZ] = column.length;
        experience.updatePortalFrameStateForColumn(gridX, gridZ);
      };

      [leftX, centerX, rightX].forEach((gridX) => buildColumn(gridX));

      expect(experience.portalBlocksPlaced).toBe(experience.portalFrameRequiredCount);
      expect(experience.portalFrameFootprintValid).toBe(true);
      expect(experience.portalFrameValidationMessage).toBe('');
      expect(experience.portalFrameHighlightMeshes.size).toBe(0);
      expect(experience.portalReady).toBe(true);
      const snapshot = experience.getPortalStatusSnapshot();
      expect(snapshot.state).toBe('ready');
      expect(snapshot.statusMessage.toLowerCase()).toContain('ignite');
      expect(showHintSpy).not.toHaveBeenCalledWith(expect.stringContaining('4×3'));
    } finally {
      showHintSpy.mockRestore();
    }
  });

  it('pulses chest scale and glow when the player is nearby', () => {
    const { experience } = createExperienceForTest();
    const THREE = window.THREE_GLOBAL;
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0xffcc66,
      emissive: new THREE.Color('#ffaa33'),
      emissiveIntensity: 0.1,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glowMaterial);
    mesh.position.set(0, 1, 0);
    mesh.userData = { highlightMaterials: [glowMaterial] };

    experience.chestGroup = new THREE.Group();
    experience.chestGroup.add(mesh);
    experience.tmpVector3 = new THREE.Vector3();
    experience.chests = [
      {
        id: 'pulse-test',
        mesh,
        lidPivot: null,
        highlightMaterials: [glowMaterial],
        baseY: mesh.position.y,
        baseScale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
        opened: false,
        openProgress: 0,
        glowLevel: 0.25,
        pulseOffset: 0,
        hintShown: false,
      },
    ];

    const farPosition = new THREE.Vector3(6, 1.6, 6);
    const nearPosition = new THREE.Vector3(0.4, 1.6, 0.4);
    vi.spyOn(experience, 'getPlayerWorldPosition').mockImplementation((target) => target.copy(farPosition));

    const baseScale = mesh.scale.x;
    experience.updateLootChests(0.016);
    const farDeviation = Math.abs(mesh.scale.x - baseScale);
    const farGlow = glowMaterial.emissiveIntensity;

    experience.getPlayerWorldPosition.mockImplementation((target) => target.copy(nearPosition));
    experience.updateLootChests(0.2);

    const nearDeviation = Math.abs(mesh.scale.x - baseScale);
    expect(nearDeviation).toBeGreaterThanOrEqual(farDeviation);
    expect(glowMaterial.emissiveIntensity).toBeGreaterThan(farGlow);
  });

  it('rejects portal frame placement when a player blocks the slot', async () => {
    const { experience } = createExperienceForTest();
    experience.start();
    await Promise.resolve();

    const worldSize = experience.heightMap.length;
    experience.initialHeightMap = Array.from({ length: worldSize }, () => Array(worldSize).fill(1));
    experience.heightMap = experience.initialHeightMap.map((row) => row.slice());
    experience.portalAnchorGrid = experience.computePortalAnchorGrid();
    experience.resetPortalFrameState();

    const anchor = experience.portalAnchorGrid;
    const gridX = Math.max(0, Math.min(worldSize - 1, anchor.x - 1));
    const gridZ = Math.max(0, Math.min(worldSize - 1, anchor.z));
    const columnKey = `${gridX}|${gridZ}`;
    const baseHeight = experience.initialHeightMap[gridX][gridZ];
    const column = [];
    for (let level = 0; level < baseHeight; level += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.position.set((gridX - worldSize / 2) * 1, level + 0.5, (gridZ - worldSize / 2) * 1);
      mesh.userData = { columnKey, gx: gridX, gz: gridZ, level, blockType: 'grass-block' };
      column.push(mesh);
    }
    experience.columns.set(columnKey, column);
    experience.heightMap[gridX][gridZ] = column.length;

    const topMesh = column[column.length - 1];
    experience.castFromCamera = vi.fn(() => [{ object: topMesh }]);

    experience.hotbar = Array.from({ length: experience.hotbar.length }, () => ({ item: null, quantity: 0 }));
    experience.selectedHotbarIndex = 0;
    experience.hotbar[0] = { item: 'stone', quantity: 2 };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const useSelectedSpy = vi.spyOn(experience, 'useSelectedItem');

    try {
      const targetLevel = column.length;
      const blockCenterY = targetLevel + 0.5;
      experience.playerRig.position.set(topMesh.position.x, blockCenterY, topMesh.position.z);

      experience.placeBlock();

      expect(useSelectedSpy).not.toHaveBeenCalled();
      expect(experience.columns.get(columnKey)).toHaveLength(baseHeight);
      expect(experience.hotbar[0].quantity).toBe(2);
      const hint = experience.showHint.mock.calls.at(-1)?.[0] ?? '';
      expect(hint).toContain('Portal frame placement blocked');
      expect(hint).toContain('player');
      expect(experience.portalStatusState).toBe('blocked');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      useSelectedSpy.mockRestore();
    }
  });

  it('places a portal frame block when the slot is clear', async () => {
    const { experience } = createExperienceForTest();
    experience.start();
    await Promise.resolve();

    const worldSize = experience.heightMap.length;
    experience.initialHeightMap = Array.from({ length: worldSize }, () => Array(worldSize).fill(1));
    experience.heightMap = experience.initialHeightMap.map((row) => row.slice());
    experience.portalAnchorGrid = experience.computePortalAnchorGrid();
    experience.resetPortalFrameState();

    const anchor = experience.portalAnchorGrid;
    const gridX = Math.max(0, Math.min(worldSize - 1, anchor.x + 1));
    const gridZ = Math.max(0, Math.min(worldSize - 1, anchor.z));
    const columnKey = `${gridX}|${gridZ}`;
    const baseHeight = experience.initialHeightMap[gridX][gridZ];
    const column = [];
    for (let level = 0; level < baseHeight; level += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.position.set((gridX - worldSize / 2) * 1, level + 0.5, (gridZ - worldSize / 2) * 1);
      mesh.userData = { columnKey, gx: gridX, gz: gridZ, level, blockType: 'grass-block' };
      column.push(mesh);
    }
    experience.columns.set(columnKey, column);
    experience.heightMap[gridX][gridZ] = column.length;

    const topMesh = column[column.length - 1];
    experience.castFromCamera = vi.fn(() => [{ object: topMesh }]);

    experience.hotbar = Array.from({ length: experience.hotbar.length }, () => ({ item: null, quantity: 0 }));
    experience.selectedHotbarIndex = 0;
    experience.hotbar[0] = { item: 'stone', quantity: 3 };

    experience.playerRig.position.set(topMesh.position.x, topMesh.position.y + 5, topMesh.position.z + 5);

    experience.terrainGroup = new THREE.Group();
    experience.terrainChunkMap = new Map();
    experience.dirtyTerrainChunks = new Set();
    experience.terrainChunkGroups = [];
    experience.terrainChunkSize = experience.terrainChunkSize ?? 8;
    experience.materials = experience.materials || {};
    experience.materials.stone = experience.materials.stone || new THREE.MeshBasicMaterial();
    experience.materials.dirt = experience.materials.dirt || new THREE.MeshBasicMaterial();
    experience.materials.grass = experience.materials.grass || new THREE.MeshBasicMaterial();
    experience.blockGeometry = experience.blockGeometry || new THREE.BoxGeometry(1, 1, 1);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const useSelectedSpy = vi.spyOn(experience, 'useSelectedItem');

    try {
      experience.placeBlock();

      expect(useSelectedSpy).toHaveBeenCalledOnce();
      const columnAfter = experience.columns.get(columnKey);
      expect(columnAfter).toHaveLength(baseHeight + 1);
      expect(experience.hotbar[0].quantity).toBe(2);
      const placedBlock = columnAfter[columnAfter.length - 1];
      expect(placedBlock?.userData?.blockType).toBe('stone');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      useSelectedSpy.mockRestore();
    }
  });
});

describe('hotbar equipping feedback', () => {
  it('selects the tenth hotbar slot when pressing the 0 key', () => {
    const { experience } = createExperienceForTest();
    const selectSpy = vi.spyOn(experience, 'selectHotbarSlot');
    const preventDefault = vi.fn();

    experience.handleKeyDown({ code: 'Digit0', preventDefault, repeat: false });

    expect(selectSpy).toHaveBeenCalledWith(9, true);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('updates the hand overlay and equipped model when switching slots', () => {
    ensureSimpleExperienceLoaded();
    const canvas = createCanvasStub();
    const overlay = {
      dataset: {},
      attributes: {},
      hidden: true,
      setAttribute: vi.fn(function (name, value) {
        this.attributes[name] = value;
      }),
      removeAttribute: vi.fn(function (name) {
        delete this.attributes[name];
      }),
    };
    const icon = { dataset: {} };
    const label = { textContent: '' };
    const experience = window.SimpleExperience.create({
      canvas,
      ui: {
        handOverlayEl: overlay,
        handOverlayIconEl: icon,
        handOverlayLabelEl: label,
      },
    });
    experience.canvas = canvas;
    experience.playerRig = new window.THREE_GLOBAL.Group();
    experience.camera = new window.THREE_GLOBAL.PerspectiveCamera();
    experience.playerRig.add(experience.camera);

    experience.hotbar[1] = { item: 'stone', quantity: 3 };
    experience.selectHotbarSlot(1, false);

    expect(overlay.dataset.item).toBe('stone');
    expect(icon.dataset.item).toBe('stone');
    expect(label.textContent).toBe('Stone Brick ×3');

    experience.hotbar[1].quantity = 0;
    experience.refreshEquippedItem();

    expect(overlay.dataset.item).toBe('fist');
    expect(label.textContent).toBe('Fist');

    experience.hotbar[2] = { item: 'stone-pickaxe', quantity: 1 };
    experience.selectHotbarSlot(2, false);
    experience.createFirstPersonHands();

    expect(experience.equippedItemMesh?.userData?.itemId).toBe('stone-pickaxe');
    expect(experience.handItemAnchor?.children).toContain(experience.equippedItemMesh);

    experience.hotbar[2].quantity = 0;
    experience.refreshEquippedItem();

    expect(experience.equippedItemMesh).toBeNull();
    expect(experience.handItemAnchor?.children?.length ?? 0).toBe(0);

    if (window.SimpleExperience?.destroyAll) {
      window.SimpleExperience.destroyAll();
    }
  });
});
