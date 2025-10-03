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
});

