import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { createExperience } from './helpers/simple-experience-test-utils.js';

const repoRoot = path.resolve(__dirname, '..');
const steveGltfPath = path.join(repoRoot, 'assets', 'steve.gltf');

function readSteveGltfJson() {
  const raw = fs.readFileSync(steveGltfPath, 'utf8');
  return JSON.parse(raw);
}

describe('simple experience steve model loading', () => {
  it('validates steve.gltf structure and exposes rig metadata', async () => {
    const { experience } = createExperience();
    const originalThree = experience.THREE;
    const gltfJson = readSteveGltfJson();

    const threeStub = Object.create(originalThree);
    threeStub.GLTFLoader = class {
      load(url, onLoad) {
        const scene = new originalThree.Group();
        scene.name = 'SteveRoot';
        const hips = new originalThree.Object3D();
        hips.name = 'Hips';
        const torso = new originalThree.Object3D();
        torso.name = 'Torso';
        const headPivot = new originalThree.Object3D();
        headPivot.name = 'HeadPivot';
        const head = new originalThree.Object3D();
        head.name = 'Head';
        torso.add(headPivot);
        headPivot.add(head);
        hips.add(torso);
        scene.add(hips);

        scene.traverse((child) => {
          Object.assign(child, { isMesh: child.name === 'Head' });
        });

        onLoad({
          scene,
          animations: [{ name: 'Idle' }],
          parser: { json: gltfJson },
        });
      }
    };

    experience.THREE = threeStub;
    const originalThreeGlobal = typeof window !== 'undefined' ? window.THREE_GLOBAL : null;
    if (typeof window !== 'undefined') {
      window.THREE_GLOBAL = threeStub;
      globalThis.THREE_GLOBAL = threeStub;
      globalThis.THREE = threeStub;
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const payload = await experience.loadModel('steve');

      expect(payload).toBeTruthy();
      expect(payload.scene).toBeTruthy();
      expect(payload.animations).toEqual([{ name: 'Idle' }]);
      expect(payload.metadata?.avatarRig).toBeTruthy();
      expect(payload.metadata.avatarRig.valid).toBe(true);
      expect(payload.metadata.avatarRig.meshAssignments.Torso).toBe('CubeShirt');
      expect(payload.metadata.avatarRig.hierarchy.SteveRoot).toEqual(['Hips']);
      expect(payload.scene.userData.avatarRigMetadata).toBe(payload.metadata.avatarRig);

      const cachedPayload = experience.loadedModels.get('steve');
      expect(cachedPayload?.metadata?.avatarRig).toBe(payload.metadata.avatarRig);

      const clone = await experience.cloneModelScene('steve');
      expect(clone?.metadata?.avatarRig).toBe(payload.metadata.avatarRig);
      expect(clone.scene.userData.avatarRigMetadata).toBe(payload.metadata.avatarRig);
    } finally {
      warnSpy.mockRestore();
      experience.THREE = originalThree;
      if (typeof window !== 'undefined') {
        window.THREE_GLOBAL = originalThreeGlobal;
        globalThis.THREE_GLOBAL = originalThreeGlobal;
        globalThis.THREE = originalThreeGlobal;
      }
    }
  });

  it('falls back to placeholder when idle/walk animation clips are missing', async () => {
    const { experience } = createExperience();
    const originalCloneModelScene = experience.cloneModelScene;
    const originalApplyCameraPerspective = experience.applyCameraPerspective;
    const originalEnsurePlayerArmsVisible = experience.ensurePlayerArmsVisible;
    experience.playerRig = new THREE.Group();
    experience.cameraBoom = new THREE.Object3D();
    experience.camera = new THREE.Object3D();
    experience.cameraBoom.add(experience.camera);
    experience.playerRig.add(experience.cameraBoom);
    experience.handGroup = null;
    experience.ensurePlayerArmsVisible = vi.fn();
    experience.applyCameraPerspective = vi.fn();
    experience.activeSessionId = 'test-session';

    const invalidModel = new THREE.Group();
    invalidModel.name = 'InvalidAvatar';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    experience.cloneModelScene = vi.fn().mockResolvedValue({
      scene: invalidModel,
      animations: [new THREE.AnimationClip('Jump', -1, [])],
      metadata: {
        avatarRig: {
          valid: true,
          errors: [],
          hierarchy: {},
          meshAssignments: {},
          meshExpectations: {},
          meshNameByIndex: {},
          missingNodes: [],
          hierarchyIssues: [],
          meshMismatches: [],
        },
      },
    });

    try {
      await experience.loadPlayerCharacter();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Player model missing animation channel(s): Idle, Walk'),
      );
      expect(experience.playerAvatar).toBeTruthy();
      expect(experience.playerAvatar.userData?.placeholder).toBe(true);
      expect(experience.playerAvatar.userData?.placeholderSource).toBe('missing-animations');
      expect(experience.playerAnimationRig).toBeTruthy();
      expect(experience.playerAnimationRig.state).toBe('idle');
      expect(experience.playerAnimationRig.baseState).toBe('idle');
      expect(experience.playerAnimationRig.actions?.idle).toBeTruthy();
      expect(experience.playerAnimationRig.actions?.walk).toBeTruthy();
      expect(experience.playerAnimationRig.actions.idle.isRunning()).toBe(true);
      expect(experience.playerAnimationRig.actions.walk.isRunning()).toBe(true);
      expect(experience.playerMixer).toBeTruthy();
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      experience.cloneModelScene = originalCloneModelScene;
      experience.applyCameraPerspective = originalApplyCameraPerspective;
      experience.ensurePlayerArmsVisible = originalEnsurePlayerArmsVisible;
    }
  });

  it('initialises player rig with idle base state and preloaded walk clip', async () => {
    const { experience } = createExperience();
    const originalCloneModelScene = experience.cloneModelScene;
    const originalApplyCameraPerspective = experience.applyCameraPerspective;
    const originalEnsurePlayerArmsVisible = experience.ensurePlayerArmsVisible;
    experience.playerRig = new THREE.Group();
    experience.cameraBoom = new THREE.Object3D();
    experience.camera = new THREE.Object3D();
    experience.cameraBoom.add(experience.camera);
    experience.playerRig.add(experience.cameraBoom);
    experience.handGroup = null;
    experience.ensurePlayerArmsVisible = vi.fn();
    experience.applyCameraPerspective = vi.fn();
    experience.activeSessionId = 'rig-session';

    const model = new THREE.Group();
    const hips = new THREE.Object3D();
    hips.name = 'Hips';
    const headPivot = new THREE.Object3D();
    headPivot.name = 'HeadPivot';
    hips.add(headPivot);
    model.add(hips);

    const idleClip = new THREE.AnimationClip('Idle', -1, []);
    const walkClip = new THREE.AnimationClip('WalkForward', -1, []);
    const rigMetadata = {
      avatarRig: {
        valid: true,
        errors: [],
        hierarchy: {},
        meshAssignments: {},
        meshExpectations: {},
        meshNameByIndex: {},
        missingNodes: [],
        hierarchyIssues: [],
        meshMismatches: [],
      },
    };

    experience.cloneModelScene = vi.fn().mockResolvedValue({
      scene: model,
      animations: [idleClip, walkClip],
      metadata: rigMetadata,
    });

    try {
      await experience.loadPlayerCharacter();

      expect(experience.playerAnimationRig).toBeTruthy();
      expect(experience.playerAnimationRig.state).toBe('idle');
      expect(experience.playerAnimationRig.baseState).toBe('idle');
      expect(experience.playerAnimationRig.actions?.idle).toBeTruthy();
      expect(experience.playerAnimationRig.actions?.walk).toBeTruthy();
      expect(experience.playerAnimationRig.actions.walk.enabled).toBe(true);
      expect(experience.playerAnimationRig.actions.walk.isRunning()).toBe(true);
      expect(experience.playerAnimationRig.actions.idle.getEffectiveWeight()).toBeCloseTo(1);
      expect(experience.playerAnimationRig.actions.walk.getEffectiveWeight()).toBeCloseTo(0);
    } finally {
      experience.cloneModelScene = originalCloneModelScene;
      experience.applyCameraPerspective = originalApplyCameraPerspective;
      experience.ensurePlayerArmsVisible = originalEnsurePlayerArmsVisible;
    }
  });

  it('restarts locomotion clips when the animation watchdog detects stalled actions', () => {
    const { experience } = createExperience();
    const rig = {
      key: 'steve',
      mixer: { update: vi.fn() },
      actions: {
        idle: {
          enabled: true,
          isRunning: vi.fn().mockReturnValue(false),
          getEffectiveWeight: vi.fn().mockReturnValue(0),
          time: 0,
        },
        walk: {
          enabled: true,
          isRunning: vi.fn().mockReturnValue(false),
          getEffectiveWeight: vi.fn().mockReturnValue(0),
          time: 0,
        },
      },
      baseState: 'idle',
      state: 'idle',
    };
    experience.playerAnimationRig = rig;
    const primeSpy = vi.spyOn(experience, 'primePlayerLocomotionAnimations').mockReturnValue(true);
    const setStateSpy = vi.spyOn(experience, 'setAnimationRigState').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const timestamps = [0, 1400, 2800];
    experience.getHighResTimestamp = vi.fn(() => timestamps.shift() ?? 3600);
    experience.playerAnimationWatchdog = { restartAttempts: 0, forcedPose: false, cooldownUntil: 0 };

    experience.updatePlayerAnimation(0.016);

    expect(primeSpy).toHaveBeenCalledWith(rig);
    expect(experience.playerAnimationWatchdog.restartAttempts).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Animation mixer watchdog detected stalled locomotion clips — attempting restart.',
      expect.objectContaining({ attempt: 1, idleHealthy: false, walkHealthy: false }),
    );

    primeSpy.mockRestore();
    setStateSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('forces a fallback pose when locomotion clips cannot be restarted', () => {
    const { experience } = createExperience();
    const { THREE } = experience;
    const avatar = new THREE.Group();
    const hips = new THREE.Object3D();
    const leftArm = new THREE.Object3D();
    leftArm.name = 'LeftArm';
    const rightArm = new THREE.Object3D();
    rightArm.name = 'RightArm';
    hips.add(leftArm);
    hips.add(rightArm);
    avatar.add(hips);
    avatar.userData = {};
    experience.playerAvatar = avatar;
    experience.handGroup = null;
    experience.ensurePlayerArmsVisible = vi.fn();
    const createHandsSpy = vi
      .spyOn(experience, 'createFirstPersonHands')
      .mockImplementation(() => {
        const fallback = new THREE.Group();
        experience.handGroup = fallback;
        return null;
      });

    const rig = {
      key: 'steve',
      mixer: { update: vi.fn() },
      actions: {
        idle: {
          enabled: true,
          isRunning: vi.fn().mockReturnValue(false),
          getEffectiveWeight: vi.fn().mockReturnValue(0),
          time: 0,
        },
        walk: {
          enabled: true,
          isRunning: vi.fn().mockReturnValue(false),
          getEffectiveWeight: vi.fn().mockReturnValue(0),
          time: 0,
        },
      },
      baseState: 'idle',
      state: 'idle',
    };
    experience.playerAnimationRig = rig;
    const primeSpy = vi.spyOn(experience, 'primePlayerLocomotionAnimations').mockReturnValue(false);
    const setStateSpy = vi.spyOn(experience, 'setAnimationRigState').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const poseSpy = vi.spyOn(experience, 'applyPlayerForcedPose');
    const timestamps = [0, 900, 1800, 2700, 3600];
    experience.getHighResTimestamp = vi.fn(() => timestamps.shift() ?? 4500);
    experience.playerAnimationWatchdog = { restartAttempts: 0, forcedPose: false, cooldownUntil: 0 };

    experience.updatePlayerAnimation(0.016);
    experience.updatePlayerAnimation(0.016);
    experience.updatePlayerAnimation(0.016);

    expect(primeSpy).toHaveBeenCalledTimes(3);
    expect(poseSpy).toHaveBeenCalledWith('animation-watchdog');
    expect(experience.playerAnimationWatchdog.forcedPose).toBe(true);
    expect(experience.playerAvatar.userData.forcedPose).toBe('animation-watchdog');
    expect(leftArm.rotation.x).not.toBeCloseTo(0);
    expect(rightArm.rotation.x).not.toBeCloseTo(0);
    expect(createHandsSpy).toHaveBeenCalled();

    primeSpy.mockRestore();
    setStateSpy.mockRestore();
    warnSpy.mockRestore();
    poseSpy.mockRestore();
    createHandsSpy.mockRestore();
  });
});

