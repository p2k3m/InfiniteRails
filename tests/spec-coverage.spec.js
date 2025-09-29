import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const simpleExperiencePath = path.join(repoRoot, 'simple-experience.js');
const scriptPath = path.join(repoRoot, 'script.js');

const simpleExperienceSource = fs.readFileSync(simpleExperiencePath, 'utf8');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

describe('Portals of Dimension spec regression checks', () => {
  it('keeps the procedural island and render loop configuration intact', () => {
    expect(simpleExperienceSource).toMatch(/const WORLD_SIZE = 64/);
    expect(simpleExperienceSource).toMatch(/new THREE\.OrthographicCamera/);
    expect(simpleExperienceSource).toMatch(/World generated: \$\{columnCount\} voxels/);
  });

  it('keeps the console telemetry checkpoints demanded by the spec', () => {
    expect(simpleExperienceSource).toMatch(/Scene populated/);
    expect(simpleExperienceSource).toMatch(/Steve visible in scene/);
    expect(simpleExperienceSource).toMatch(/Zombie spawned, chasing/);
    expect(simpleExperienceSource).toMatch(/Respawn triggered/);
    expect(simpleExperienceSource).toMatch(/Portal active/);
  });

  it('ships the expected character and entity assets', () => {
    expect(simpleExperienceSource).toMatch(/MODEL_URLS\s*=\s*\{/);
    expect(simpleExperienceSource).toMatch(/steve\.gltf/);
    expect(simpleExperienceSource).toMatch(/zombie\.gltf/);
    expect(simpleExperienceSource).toMatch(/iron_golem\.gltf/);
  });

  it('exposes combat, portal, and crafting systems', () => {
    expect(simpleExperienceSource).toMatch(/spawnZombie\(/);
    expect(simpleExperienceSource).toMatch(/ignitePortal\(/);
    expect(simpleExperienceSource).toMatch(/handleCraftButton\(/);
  });

  it('keeps backend sync hooks in place', () => {
    expect(simpleExperienceSource).toMatch(/loadScoreboard\(/);
    expect(simpleExperienceSource).toMatch(/flushScoreSync\(/);
    expect(scriptSource.includes("apiBaseUrl.replace(/\\/$/, '')}/scores")).toBe(true);
    expect(scriptSource.includes('google.accounts.id')).toBe(true);
  });

  it('publishes the sandbox constructor for the bootstrapper', () => {
    expect(simpleExperienceSource).toMatch(/window\.SimpleExperience =/);
  });
});
