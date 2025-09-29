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

  it('retains the player control and progression instrumentation', () => {
    expect(simpleExperienceSource.includes("console.log('Moving forward');")).toBe(true);
    expect(simpleExperienceSource.includes('this.canvas.requestPointerLock')).toBe(true);
    expect(simpleExperienceSource.includes('console.log(`Dimension: ${this.dimensionSettings.name} unlocked`);')).toBe(true);
    expect(simpleExperienceSource.includes("console.log('Score synced'")).toBe(true);
    expect(simpleExperienceSource.includes('navigator.geolocation.getCurrentPosition')).toBe(true);
  });

  it('keeps the first-person rig and day/night pipeline wired as specced', () => {
    expect(simpleExperienceSource).toMatch(/this\.camera = new THREE\.OrthographicCamera/);
    expect(simpleExperienceSource).toMatch(/this\.camera\.add\(this\.handGroup\);/);
    expect(simpleExperienceSource).toMatch(/this\.elapsed = DAY_LENGTH_SECONDS \* 0\.5;/);
    expect(simpleExperienceSource).toMatch(/updateDayNightCycle\(\)/);
    expect(simpleExperienceSource).toMatch(/this\.sunLight\.position\.set/);
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

  it('keeps supporting entities, crafting, and inventory hooks', () => {
    expect(simpleExperienceSource).toMatch(/spawnGolem\(/);
    expect(simpleExperienceSource).toMatch(/updateLootChests\(/);
    expect(simpleExperienceSource).toMatch(/this\.hotbar = Array\.from\(/);
    expect(simpleExperienceSource).toMatch(/this\.craftingModal/);
    expect(simpleExperienceSource).toMatch(/this\.portalFrameLayout = this\.createPortalFrameLayout\(\);/);
  });

  it('keeps backend sync hooks in place', () => {
    expect(simpleExperienceSource).toMatch(/loadScoreboard\(/);
    expect(simpleExperienceSource).toMatch(/flushScoreSync\(/);
    expect(scriptSource.includes("apiBaseUrl.replace(/\\/$/, '')}/scores")).toBe(true);
    expect(scriptSource.includes('google.accounts.id')).toBe(true);
    expect(simpleExperienceSource.includes('nav?.sendBeacon')).toBe(true);
    expect(simpleExperienceSource.includes('fetch(url, {')).toBe(true);
  });

  it('publishes the sandbox constructor for the bootstrapper', () => {
    expect(simpleExperienceSource).toMatch(/window\.SimpleExperience =/);
  });

  it('keeps audio polish, HUD refresh, and leaderboard prompts intact', () => {
    expect(simpleExperienceSource).toMatch(/new HowlCtor\(/);
    expect(simpleExperienceSource).toMatch(/updateHud\(/);
    expect(simpleExperienceSource).toMatch(/this\.scoreboardStatusEl/);
    expect(simpleExperienceSource).toMatch(/this\.pointerHintEl/);
    expect(simpleExperienceSource).toMatch(/this\.footerStatusEl/);
  });
});
