import { describe, it, expect } from 'vitest';
import CombatUtils from '../combat-utils.js';

describe('Combat utilities', () => {
  it('records a death log and preserves inventory across respawn after five hits', () => {
    const logs = [];
    const state = {
      player: {
        maxHearts: 10,
        hearts: 10,
        maxAir: 10,
        air: 10,
        zombieHits: 0,
        inventory: [
          { item: 'wood', quantity: 3 },
          null,
          { item: 'spark', quantity: 1 },
        ],
        satchel: [{ item: 'stone', quantity: 2 }],
        selectedSlot: 0,
      },
    };

    let outcome = null;
    for (let i = 0; i < 5; i++) {
      outcome = CombatUtils.applyZombieStrike(state, {
        onStrike: (message) => logs.push(message),
        onDeath: (message) => logs.push(message),
      });
    }

    expect(outcome?.defeated).toBe(true);
    expect(state.player.hearts).toBe(0);
    expect(logs.filter((message) => message === 'Death').length).toBe(1);

    const snapshot = CombatUtils.snapshotInventory(state.player);
    CombatUtils.completeRespawnState(state);
    expect(state.player.hearts).toBe(state.player.maxHearts);
    expect(state.player.zombieHits).toBe(0);

    state.player.inventory = Array.from({ length: snapshot.inventory.length }, () => null);
    state.player.satchel = [];
    CombatUtils.restoreInventory(state.player, snapshot);

    expect(state.player.inventory[0]).toEqual({ item: 'wood', quantity: 3 });
    expect(state.player.inventory[2]).toEqual({ item: 'spark', quantity: 1 });
    expect(state.player.satchel[0]).toEqual({ item: 'stone', quantity: 2 });
    expect(state.player.selectedSlot).toBe(snapshot.selectedSlot);
  });

  it('guides golems to intercept zombies in more than 70% of chase simulations', () => {
    const gridSize = 16;
    const pathfinder = CombatUtils.createGridPathfinder({
      getWidth: () => gridSize,
      getHeight: () => gridSize,
      isWalkable: () => true,
      maxIterations: 512,
    });

    const iterations = 100;
    let interceptions = 0;

    for (let i = 0; i < iterations; i++) {
      const golem = { x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) };
      const zombie = {
        x: Math.floor(Math.random() * gridSize),
        y: Math.floor(Math.random() * gridSize),
      };
      for (let steps = 0; steps < gridSize * 2; steps++) {
        const path = pathfinder.findPath(
          { x: golem.x, y: golem.y },
          { x: zombie.x, y: zombie.y },
          { allowGoal: true }
        );
        if (!path.length) {
          break;
        }
        const next = path.shift();
        golem.x = next.x;
        golem.y = next.y;
        if (golem.x === zombie.x && golem.y === zombie.y) {
          interceptions += 1;
          break;
        }
      }
    }

    expect(interceptions / iterations).toBeGreaterThan(0.7);
  });
});
