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
    expect(simpleExperienceSource).toMatch(/new THREE\.PerspectiveCamera/);
    expect(
      simpleExperienceSource.includes(
        'World generation summary — ${columnCount} columns created. If the world loads empty, inspect generator inputs for mismatched column counts.',
      ),
    ).toBe(true);
  });

  it('keeps the console telemetry checkpoints demanded by the spec', () => {
    expect(
      simpleExperienceSource.includes(
        'Scene population check fired — validate terrain, rails, portals, mobs, and chests render correctly. Re-run asset bootstrap if visuals are missing.',
      ),
    ).toBe(true);
    expect(
      simpleExperienceSource.includes(
        'Avatar visibility confirmed — verify animation rig initialises correctly if the player appears static.',
      ),
    ).toBe(true);
    expect(
      simpleExperienceSource.includes(
        'Zombie spawn and chase triggered. If AI stalls or pathfinding breaks, validate the navmesh and spawn configuration.',
      ),
    ).toBe(true);
    expect(
      simpleExperienceSource.includes(
        'Respawn handler invoked. Ensure checkpoint logic restores player position, inventory, and status effects as expected.',
      ),
    ).toBe(true);
    expect(
      simpleExperienceSource.includes(
        'Portal activation triggered — ensure portal shaders and collision volumes initialise. Rebuild the portal pipeline if travellers become stuck.',
      ),
    ).toBe(true);
  });

  it('retains the player control and progression instrumentation', () => {
    expect(
      simpleExperienceSource.includes(
        'Movement input detected (forward). If the avatar fails to advance, confirm control bindings and resolve any locked physics/body constraints or failed transform updates blocking motion.',
      ),
    ).toBe(true);
    expect(simpleExperienceSource.includes('this.canvas.requestPointerLock')).toBe(true);
    expect(
      simpleExperienceSource.includes(
        'Dimension unlock flow fired — ${this.dimensionSettings.name}. If the unlock fails to present rewards, audit quest requirements and persistence flags.',
      ),
    ).toBe(true);
    expect(
      simpleExperienceSource.includes(
        'Score sync diagnostic — confirm the leaderboard API accepted the update. Inspect the network panel if the leaderboard remains stale.',
      ),
    ).toBe(true);
    expect(simpleExperienceSource.includes('navigator.geolocation.getCurrentPosition')).toBe(true);
  });

  it('keeps the first-person rig and day/night pipeline wired as specced', () => {
    expect(simpleExperienceSource).toMatch(/this\.camera = new THREE\.PerspectiveCamera/);
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
