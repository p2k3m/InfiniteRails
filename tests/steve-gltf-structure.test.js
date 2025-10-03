import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const steveGltfPath = path.join(repoRoot, 'assets', 'steve.gltf');

function loadSteveGltf() {
  const raw = fs.readFileSync(steveGltfPath, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed;
}

describe('steve.gltf asset integrity', () => {
  const gltf = loadSteveGltf();
  const nodes = gltf.nodes || [];
  const meshes = gltf.meshes || [];
  const nodesByIndex = nodes.map((node, index) => ({ ...node, index }));
  const nodesByName = new Map(nodesByIndex.map((node) => [node.name, node]));

  function childNames(nodeName) {
    const node = nodesByName.get(nodeName);
    expect(node).toBeTruthy();
    const childIndices = node.children || [];
    return childIndices.map((childIndex) => nodes[childIndex]?.name).filter(Boolean);
  }

  it('parses as valid GLTF 2.0 JSON with scene references', () => {
    expect(gltf.asset?.version).toBe('2.0');
    expect(Array.isArray(gltf.scenes)).toBe(true);
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(meshes)).toBe(true);
    expect(meshes.length).toBeGreaterThan(0);

    const defaultSceneIndex = gltf.scene ?? 0;
    const defaultScene = gltf.scenes?.[defaultSceneIndex];
    expect(defaultScene?.nodes).toContain(0);
    expect(nodes[0]?.name).toBe('SteveRoot');
  });

  it('exposes the expected animation node hierarchy', () => {
    const expectedNodes = [
      'SteveRoot',
      'Hips',
      'Torso',
      'HeadPivot',
      'Head',
      'LeftArm',
      'LeftSleeve',
      'LeftHand',
      'RightArm',
      'RightSleeve',
      'RightHand',
      'LeftLeg',
      'LeftThigh',
      'LeftBoot',
      'RightLeg',
      'RightThigh',
      'RightBoot',
      'Hair',
      'Fringe',
      'LeftEye',
      'RightEye',
    ];

    for (const name of expectedNodes) {
      expect(nodesByName.has(name)).toBe(true);
    }

    expect(childNames('SteveRoot')).toEqual(['Hips']);
    expect(childNames('Hips')).toEqual(expect.arrayContaining(['Torso', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg']));
    expect(childNames('Torso')).toEqual(['HeadPivot']);
    expect(childNames('HeadPivot')).toEqual(
      expect.arrayContaining(['Head', 'Hair', 'Fringe', 'LeftEye', 'RightEye']),
    );
    expect(childNames('LeftArm')).toEqual(expect.arrayContaining(['LeftSleeve', 'LeftHand']));
    expect(childNames('RightArm')).toEqual(expect.arrayContaining(['RightSleeve', 'RightHand']));
    expect(childNames('LeftLeg')).toEqual(expect.arrayContaining(['LeftThigh', 'LeftBoot']));
    expect(childNames('RightLeg')).toEqual(expect.arrayContaining(['RightThigh', 'RightBoot']));
  });

  it('maps limb nodes to the expected mesh primitives for animation skinning', () => {
    const meshNames = meshes.map((mesh) => mesh?.name);
    expect(meshNames).toEqual(
      expect.arrayContaining(['CubeShirt', 'CubeSkin', 'CubeJeans', 'CubeBoot', 'CubeHair', 'CubeEye']),
    );

    const meshByIndex = meshes.map((mesh, index) => ({ ...mesh, index }));

    const nodeMeshExpectations = new Map([
      ['Torso', 'CubeShirt'],
      ['Head', 'CubeSkin'],
      ['LeftSleeve', 'CubeShirt'],
      ['LeftHand', 'CubeSkin'],
      ['RightSleeve', 'CubeShirt'],
      ['RightHand', 'CubeSkin'],
      ['LeftThigh', 'CubeJeans'],
      ['LeftBoot', 'CubeBoot'],
      ['RightThigh', 'CubeJeans'],
      ['RightBoot', 'CubeBoot'],
      ['Hair', 'CubeHair'],
      ['Fringe', 'CubeHair'],
      ['LeftEye', 'CubeEye'],
      ['RightEye', 'CubeEye'],
    ]);

    const meshNameByIndex = new Map(meshByIndex.map((mesh) => [mesh.index, mesh.name]));

    for (const [nodeName, expectedMeshName] of nodeMeshExpectations.entries()) {
      const node = nodesByName.get(nodeName);
      expect(node).toBeTruthy();
      expect(typeof node.mesh).toBe('number');
      const meshName = meshNameByIndex.get(node.mesh);
      expect(meshName).toBe(expectedMeshName);
    }
  });
});
