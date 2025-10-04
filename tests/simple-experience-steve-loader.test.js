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
    const originalWindowThree = typeof window !== 'undefined' ? window.THREE : null;
    if (typeof window !== 'undefined') {
      window.THREE = threeStub;
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
      if (typeof window !== 'undefined' && originalWindowThree) {
        window.THREE = originalWindowThree;
      }
    }
  });

  it('falls back to placeholder when idle/walk animation clips are missing', async () => {
    const { experience } = createExperience();
    const { THREE } = experience;
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
      expect(experience.playerAnimationRig).toBeNull();
      expect(experience.playerMixer).toBeNull();
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
    const { THREE } = experience;
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
});

