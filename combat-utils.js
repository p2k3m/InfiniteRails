(function (globalScope, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    const target = globalScope || (typeof globalThis !== 'undefined' ? globalThis : {});
    target.CombatUtils = factory();
  }
})(
  typeof window !== 'undefined'
    ? window
    : typeof globalThis !== 'undefined'
      ? globalThis
      : typeof global !== 'undefined'
        ? global
        : this,
  function combatUtilsFactory() {
    const DEFAULT_CHUNK_SIZE = 16;
    const DEFAULT_PER_CHUNK = 3;

    function normaliseDimensionAccessor(value) {
      if (typeof value === 'function') {
        return value;
      }
      if (Number.isFinite(value)) {
        return () => value;
      }
      return () => 0;
    }

    function key(x, y) {
      return `${x},${y}`;
    }

    function calculateZombieSpawnCount(options = {}) {
      const widthAccessor = normaliseDimensionAccessor(options.width ?? options.getWidth ?? 0);
      const heightAccessor = normaliseDimensionAccessor(options.height ?? options.getHeight ?? 0);
      const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_SIZE));
      const perChunk = Math.max(1, Math.floor(options.perChunk ?? DEFAULT_PER_CHUNK));
      const width = Math.max(1, Math.floor(widthAccessor()));
      const height = Math.max(1, Math.floor(heightAccessor()));
      const chunkX = Math.max(1, Math.ceil(width / chunkSize));
      const chunkY = Math.max(1, Math.ceil(height / chunkSize));
      return chunkX * chunkY * perChunk;
    }

    function createGridPathfinder({
      getWidth,
      getHeight,
      isWalkable,
      maxIterations = 512,
    } = {}) {
      if (typeof isWalkable !== 'function') {
        throw new Error('createGridPathfinder requires an isWalkable function.');
      }
      const widthAccessor = normaliseDimensionAccessor(getWidth ?? 0);
      const heightAccessor = normaliseDimensionAccessor(getHeight ?? 0);
      const neighborOffsets = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];

      const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

      function reconstructPath(cameFrom, goalKey, startKey) {
        const path = [];
        let currentKey = goalKey;
        while (currentKey && currentKey !== startKey) {
          const entry = cameFrom.get(currentKey);
          if (!entry) {
            return [];
          }
          const [cx, cy] = currentKey.split(',').map((value) => Number.parseInt(value, 10));
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
            return [];
          }
          path.push({ x: cx, y: cy });
          currentKey = entry;
        }
        path.reverse();
        return path;
      }

      function findPath(start, goal, options = {}) {
        if (!start || !goal) return [];
        const width = Math.max(1, Math.floor(widthAccessor()));
        const height = Math.max(1, Math.floor(heightAccessor()));
        const allowGoal = Boolean(options.allowGoal);
        const iterationLimit = Math.max(1, Math.floor(options.maxIterations ?? maxIterations));
        const startKey = key(start.x, start.y);
        const goalKey = key(goal.x, goal.y);
        if (startKey === goalKey) {
          return [];
        }

        const open = [];
        const cameFrom = new Map();
        const gScore = new Map();
        cameFrom.set(startKey, null);
        gScore.set(startKey, 0);
        open.push({ x: start.x, y: start.y, g: 0, f: heuristic(start, goal) });

        let iterations = 0;
        while (open.length && iterations < iterationLimit) {
          iterations += 1;
          let bestIndex = 0;
          for (let i = 1; i < open.length; i++) {
            if (open[i].f < open[bestIndex].f) {
              bestIndex = i;
            }
          }
          const current = open.splice(bestIndex, 1)[0];
          const currentKey = key(current.x, current.y);
          const expectedScore = gScore.get(currentKey);
          if (expectedScore !== current.g) {
            continue;
          }
          if (currentKey === goalKey) {
            return reconstructPath(cameFrom, currentKey, startKey);
          }
          for (const offset of neighborOffsets) {
            const nx = current.x + offset.x;
            const ny = current.y + offset.y;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              continue;
            }
            const neighborKey = key(nx, ny);
            if (!(allowGoal && neighborKey === goalKey) && !isWalkable(nx, ny)) {
              continue;
            }
            const tentativeScore = current.g + 1;
            if (tentativeScore >= (gScore.get(neighborKey) ?? Infinity)) {
              continue;
            }
            cameFrom.set(neighborKey, currentKey);
            gScore.set(neighborKey, tentativeScore);
            const fScore = tentativeScore + heuristic({ x: nx, y: ny }, goal);
            open.push({ x: nx, y: ny, g: tentativeScore, f: fScore });
          }
        }
        return [];
      }

      return { findPath };
    }

    function applyZombieStrike(state, { onStrike, onDeath } = {}) {
      if (!state || typeof state !== 'object' || !state.player) {
        throw new Error('applyZombieStrike requires a state with a player.');
      }
      const player = state.player;
      const maxHearts = Number.isFinite(player.maxHearts) ? player.maxHearts : 10;
      const heartsPerHit = maxHearts / 5;
      const hits = (player.zombieHits ?? 0) + 1;
      player.zombieHits = hits;
      const remainingHearts = Math.max(0, maxHearts - heartsPerHit * hits);
      player.hearts = remainingHearts;
      const result = {
        hits,
        remainingHearts,
        defeated: hits >= 5,
      };
      if (result.defeated) {
        if (typeof onDeath === 'function') {
          onDeath('Death');
        }
      } else {
        const remainingHits = 5 - hits;
        if (typeof onStrike === 'function') {
          onStrike(
            `Minecraft zombie strike! ${remainingHits} more hit${remainingHits === 1 ? '' : 's'} before defeat.`
          );
        }
      }
      return result;
    }

    function snapshotInventory(player) {
      if (!player || typeof player !== 'object') {
        return { inventory: [], satchel: [], selectedSlot: 0 };
      }
      const inventory = Array.isArray(player.inventory)
        ? player.inventory.map((slot) =>
            slot && typeof slot === 'object' && slot.item
              ? { item: slot.item, quantity: slot.quantity }
              : null
          )
        : [];
      const satchel = Array.isArray(player.satchel)
        ? player.satchel
            .map((bundle) =>
              bundle && typeof bundle === 'object' && bundle.item
                ? { item: bundle.item, quantity: bundle.quantity }
                : null
            )
            .filter(Boolean)
        : [];
      const selectedSlot = Number.isInteger(player.selectedSlot) ? player.selectedSlot : 0;
      return { inventory, satchel, selectedSlot };
    }

    function restoreInventory(player, snapshot) {
      if (!player || typeof player !== 'object' || !snapshot) return;
      if (Array.isArray(snapshot.inventory)) {
        player.inventory = snapshot.inventory.map((slot) =>
          slot && typeof slot === 'object' && slot.item
            ? { item: slot.item, quantity: slot.quantity }
            : null
        );
      }
      if (Array.isArray(snapshot.satchel)) {
        player.satchel = snapshot.satchel.map((bundle) => ({ item: bundle.item, quantity: bundle.quantity }));
      }
      if (Number.isInteger(snapshot.selectedSlot)) {
        player.selectedSlot = snapshot.selectedSlot;
      }
    }

    function completeRespawnState(state) {
      if (!state || !state.player) return;
      const player = state.player;
      if (Number.isFinite(player.maxHearts)) {
        player.hearts = player.maxHearts;
      }
      if (Number.isFinite(player.maxAir)) {
        player.air = player.maxAir;
      }
      player.zombieHits = 0;
    }

    return {
      calculateZombieSpawnCount,
      createGridPathfinder,
      applyZombieStrike,
      snapshotInventory,
      restoreInventory,
      completeRespawnState,
    };
  }
);
