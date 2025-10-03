const FRAME_WIDTH = 4;
const FRAME_HEIGHT = 3;

function resolveOrientation(facing = { x: 0, y: 1 }) {
  if (!facing) return 'horizontal';
  const { x = 0, y = 0 } = facing;
  return Math.abs(x) > Math.abs(y) ? 'vertical' : 'horizontal';
}

function buildPortalFrame(origin, facing = { x: 0, y: 1 }) {
  if (!origin || typeof origin.x !== 'number' || typeof origin.y !== 'number') {
    throw new Error('Portal origin must supply numeric x and y.');
  }
  const orientation = resolveOrientation(facing);
  const width = orientation === 'vertical' ? FRAME_HEIGHT : FRAME_WIDTH;
  const height = orientation === 'vertical' ? FRAME_WIDTH : FRAME_HEIGHT;
  const offsetX = Math.floor((width - 1) / 2);
  const offsetY = Math.floor((height - 1) / 2);
  const startX = origin.x - offsetX;
  const startY = origin.y - offsetY;
  const frame = [];
  const interior = [];
  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      const x = startX + dx;
      const y = startY + dy;
      if (dx === 0 || dy === 0 || dx === width - 1 || dy === height - 1) {
        frame.push({ x, y });
      } else {
        interior.push({ x, y });
      }
    }
  }
  return {
    frame,
    interior,
    orientation,
    bounds: { width, height },
  };
}

const BLOCKING_TILE_TYPES = new Set(['lava', 'water', 'void', 'tree', 'chest', 'player']);
const BLOCKING_OCCUPANTS = new Set(['player', 'tree', 'chest']);

function normaliseOccupantToken(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }
  if (typeof value === 'object') {
    if (typeof value.type === 'string') {
      return value.type.trim().toLowerCase();
    }
    if (typeof value.name === 'string') {
      return value.name.trim().toLowerCase();
    }
    if (typeof value.kind === 'string') {
      return value.kind.trim().toLowerCase();
    }
  }
  return null;
}

function getBlockingOccupant(tile) {
  if (!tile) return null;
  const candidates = [];
  if (tile.occupant !== undefined) {
    candidates.push(tile.occupant);
  }
  if (Array.isArray(tile.occupants)) {
    candidates.push(...tile.occupants);
  }
  if (tile.entity !== undefined) {
    candidates.push(tile.entity);
  }
  if (Array.isArray(tile.entities)) {
    candidates.push(...tile.entities);
  }
  for (const candidate of candidates) {
    const token = normaliseOccupantToken(candidate);
    if (token && BLOCKING_OCCUPANTS.has(token)) {
      return token;
    }
  }
  return null;
}

function getPortalTileBlockReason(tile) {
  if (!tile) {
    return 'missing';
  }
  if (tile.type === 'portal' || tile.type === 'portalFrame' || tile.type === 'portalDormant') {
    return tile.type || 'portal';
  }
  const occupant = getBlockingOccupant(tile);
  if (occupant) {
    return occupant;
  }
  if (tile.hazard) {
    if (typeof tile.hazard === 'string') {
      return tile.hazard;
    }
    return 'hazard';
  }
  if (tile.walkable === false) {
    return tile.type ?? 'blocked';
  }
  if (tile.type && tile.walkable === undefined && BLOCKING_TILE_TYPES.has(tile.type)) {
    return tile.type;
  }
  return null;
}

function isPortalTileBlocked(tile) {
  return Boolean(getPortalTileBlockReason(tile));
}

function detectPortalCollision(grid, footprint) {
  if (!Array.isArray(grid)) {
    throw new Error('A 2D grid is required to detect portal collisions.');
  }
  if (!footprint) return [{ reason: 'invalid-footprint' }];
  const collisions = [];
  const positions = [...(footprint.frame ?? []), ...(footprint.interior ?? [])];
  for (const { x, y } of positions) {
    const row = grid[y];
    const tile = row && row[x];
    if (!tile) {
      collisions.push({ x, y, reason: 'missing' });
      continue;
    }
    const blockReason = getPortalTileBlockReason(tile);
    if (blockReason) {
      collisions.push({ x, y, reason: blockReason });
    }
  }
  return collisions;
}

function ignitePortalFrame(footprint, options = {}) {
  if (!footprint) {
    throw new Error('Portal footprint required to ignite portal.');
  }
  const method = options.tool === 'torch' ? 'torch' : 'igniter';
  const shaderActive = method === 'torch';
  const activationLevel = shaderActive ? 0.35 : 0;
  const events = [];
  if (shaderActive) {
    events.push('Torchlight primes the portal shader.');
  } else {
    events.push('Portal ignition sequence engaged.');
  }
  const portal = {
    frame: footprint.frame.slice(),
    tiles: footprint.interior.slice(),
    active: shaderActive,
    activation: activationLevel,
    shaderActive,
  };
  if (shaderActive) {
    events.push('Portal active');
  }
  return {
    method,
    shaderActive,
    activation: activationLevel,
    events,
    portal,
  };
}

function normaliseRuleList(rules) {
  if (!rules) return [];
  if (Array.isArray(rules)) {
    return rules
      .map((rule) => (typeof rule === 'string' ? rule.trim() : ''))
      .filter(Boolean);
  }
  if (typeof rules === 'string') {
    const trimmed = rules.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function formatDimensionRules(dimension) {
  const rules = normaliseRuleList(dimension?.rules);
  const descriptors = [];
  if (rules.length) {
    descriptors.push(...rules);
  }
  const gravity = dimension?.physics?.gravity;
  if (Number.isFinite(gravity)) {
    descriptors.unshift(`Gravity ×${Number(gravity).toFixed(2)}`);
  }
  const description =
    typeof dimension?.description === 'string' ? dimension.description.trim() : '';
  if (descriptors.length && description) {
    return `${descriptors.join(' · ')} — ${description}`;
  }
  if (descriptors.length) {
    return descriptors.join(' · ');
  }
  if (description) {
    return description;
  }
  return 'Expect the unexpected beyond the portal.';
}

function normaliseSpawnPoint(spawn, fallback = { x: 0, y: 0, z: 0 }) {
  if (!spawn || typeof spawn !== 'object') {
    return { ...fallback };
  }
  const axes = ['x', 'y', 'z'];
  const result = {};
  axes.forEach((axis) => {
    const value = Number(spawn[axis]);
    if (Number.isFinite(value)) {
      result[axis] = value;
    } else if (fallback && Object.prototype.hasOwnProperty.call(fallback, axis)) {
      result[axis] = fallback[axis];
    }
  });
  return result;
}

function enterPortal(portal, dimension) {
  if (!portal || portal.active !== true) {
    throw new Error('Portal must be active to initiate a transition.');
  }
  const targetId = dimension?.id ?? dimension?.name;
  if (!targetId) {
    throw new Error('Target dimension must provide an id or name.');
  }
  const currentId =
    portal?.currentDimensionId ?? portal?.currentDimension ?? portal?.dimensionId ?? null;
  if (currentId && currentId === targetId) {
    throw new Error('Portal is already aligned with the requested dimension.');
  }
  const name = dimension?.name ?? dimension?.id ?? 'Unknown Dimension';
  const physics = {
    gravity: dimension?.physics?.gravity ?? 1,
    shaderProfile: dimension?.physics?.shaderProfile ?? 'default',
  };
  const rules = formatDimensionRules(dimension);
  const announcement = `Entering ${name} — ${rules}`;
  const playerSpawn = normaliseSpawnPoint(dimension?.spawn?.player, {
    x: 0,
    y: 0,
    z: 0,
  });
  const worldSpawn = normaliseSpawnPoint(dimension?.spawn?.world, {
    x: 0,
    y: 0,
    z: 0,
  });
  const dimensionChanged = currentId ? currentId !== targetId : true;
  return {
    fade: true,
    resetPosition: { x: playerSpawn.x, y: playerSpawn.y },
    log: announcement,
    pointsAwarded: Number.isFinite(dimension?.unlockPoints) ? dimension.unlockPoints : 5,
    physics,
    shaderProfile: physics.shaderProfile,
    dimensionName: name,
    dimensionRules: rules,
    announcement,
    dimensionChanged,
    spawn: {
      player: playerSpawn,
      world: worldSpawn,
    },
    regeneration: {
      player: { required: true, spawn: playerSpawn },
      world: { required: true, spawn: worldSpawn },
    },
  };
}

function getPortalMechanicsSummary() {
  return {
    frame: '4x3 frame footprint with collision detection on placement.',
    activation: 'Torch lighting primes the shader, guaranteeing activation glow.',
    transition: 'Crossing triggers a fade transition and resets player position in the target realm.',
    physics: 'Each dimension provides bespoke physics (Rock gravity ×1.5 with gritty shaders).',
    points: 5,
  };
}

const api = {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  buildPortalFrame,
  detectPortalCollision,
  ignitePortalFrame,
  enterPortal,
  formatDimensionRules,
  getPortalMechanicsSummary,
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = api;
  if (typeof Object.defineProperty === 'function') {
    Object.defineProperty(module.exports, 'default', {
      value: api,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(module.exports, '__esModule', {
      value: true,
      enumerable: false,
      configurable: true,
    });
  } else {
    module.exports.default = api;
    module.exports.__esModule = true;
  }
}

const globalScope =
  (typeof window !== 'undefined' && window) ||
  (typeof globalThis !== 'undefined' && globalThis) ||
  (typeof global !== 'undefined' && global) ||
  null;

if (globalScope && !globalScope.PortalMechanics) {
  globalScope.PortalMechanics = api;
}
