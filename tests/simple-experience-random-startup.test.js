import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createExperience,
  ensureSimpleExperienceLoaded,
} from './helpers/simple-experience-test-utils.js';

function shuffleStages(stages, seed) {
  const order = stages.slice();
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const random = state / 0x1_0000_0000;
    const swapIndex = Math.floor(random * (index + 1));
    const tmp = order[index];
    order[index] = order[swapIndex];
    order[swapIndex] = tmp;
  }
  return order;
}

beforeAll(() => {
  ensureSimpleExperienceLoaded();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simple experience startup simulations', () => {
  it('simulates gameplay runs with randomised world/portal/mob startup order without instability', () => {
    const { experience } = createExperience();

    const THREE = experience.THREE;
    experience.scene = new THREE.Scene();
    experience.worldRoot = new THREE.Group();
    experience.terrainGroup = new THREE.Group();
    experience.railsGroup = new THREE.Group();
    experience.portalGroup = new THREE.Group();
    experience.zombieGroup = new THREE.Group();
    experience.golemGroup = new THREE.Group();
    experience.chestGroup = new THREE.Group();
    experience.challengeGroup = new THREE.Group();

    experience.scene.add(experience.worldRoot);
    experience.worldRoot.add(experience.terrainGroup);
    experience.worldRoot.add(experience.railsGroup);
    experience.worldRoot.add(experience.portalGroup);
    experience.worldRoot.add(experience.zombieGroup);
    experience.worldRoot.add(experience.golemGroup);
    experience.worldRoot.add(experience.chestGroup);
    experience.worldRoot.add(experience.challengeGroup);

    const issueSpy = vi.spyOn(experience, 'recordMajorIssue');

    const stageNames = ['world', 'portal', 'mobs'];
    const simulationRecords = [];

    for (let runIndex = 0; runIndex < 6; runIndex += 1) {
      const runSeed = (runIndex + 1) * 0x45d9f3b;
      const stageOrder = shuffleStages(stageNames, runSeed);
      const reason = `test-run-${runIndex + 1}`;
      const mobPlan = {
        initialGolemCount: (runIndex % 3) + 1,
        initialZombieCount: (runIndex % 2) + 1,
        spawnInitialZombies: runIndex % 2 === 0,
      };
      const record = {
        order: stageOrder.slice(),
        reason,
        mobPlan,
      };

      for (const stage of stageOrder) {
        if (stage === 'world') {
          experience.buildTerrain({ reason, navmeshReason: reason });
        } else if (stage === 'portal') {
          experience.refreshPortalState();
        } else if (stage === 'mobs') {
          experience.clearZombies();
          experience.clearGolems();
          experience.populateInitialMobs(mobPlan);
        }
      }

      const summary = experience.populateSceneAfterTerrain({ reason, mobs: mobPlan });
      record.summary = summary;
      record.zombieCount = Array.isArray(experience.zombies) ? experience.zombies.length : 0;
      record.golemCount = Array.isArray(experience.golems) ? experience.golems.length : 0;
      simulationRecords.push(record);
    }

    expect(issueSpy).not.toHaveBeenCalled();
    expect(simulationRecords).toHaveLength(6);

    const uniqueOrders = new Set(simulationRecords.map((entry) => entry.order.join('>')));
    expect(uniqueOrders.size).toBeGreaterThan(1);

    for (const record of simulationRecords) {
      expect(record.order.slice().sort()).toEqual(stageNames.slice().sort());
      expect(record.summary).toBeTruthy();
      expect(record.summary.mobs?.total ?? 0).toBeGreaterThanOrEqual(0);
      expect(record.zombieCount).toBeGreaterThanOrEqual(0);
      expect(record.golemCount).toBeGreaterThanOrEqual(0);
    }
  });
});
