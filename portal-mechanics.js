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

function isPortalTileBlocked(tile) {
  if (!tile) return true;
  if (tile.type === 'portal' || tile.type === 'portalFrame' || tile.type === 'portalDormant') {
    return true;
  }
  if (tile.hazard) return true;
  if (tile.walkable === false) return true;
  if (tile.type && tile.walkable === undefined) {
    const blockingTypes = new Set(['lava', 'water', 'void', 'tree', 'chest']);
    if (blockingTypes.has(tile.type)) {
      return true;
    }
  }
  return false;
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
    if (isPortalTileBlocked(tile)) {
      collisions.push({ x, y, reason: tile.type ?? 'blocked' });
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

function enterPortal(portal, dimension) {
  const name = dimension?.name ?? dimension?.id ?? 'Unknown Dimension';
  const physics = {
    gravity: dimension?.physics?.gravity ?? 1,
    shaderProfile: dimension?.physics?.shaderProfile ?? 'default',
  };
  return {
    fade: true,
    resetPosition: { x: 0, y: 0 },
    log: `Entered ${name}.`,
    pointsAwarded: Number.isFinite(dimension?.unlockPoints) ? dimension.unlockPoints : 5,
    physics,
    shaderProfile: physics.shaderProfile,
    dimensionName: name,
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
  getPortalMechanicsSummary,
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = api;
}

const globalScope =
  (typeof window !== 'undefined' && window) ||
  (typeof globalThis !== 'undefined' && globalThis) ||
  (typeof global !== 'undefined' && global) ||
  null;

if (globalScope && !globalScope.PortalMechanics) {
  globalScope.PortalMechanics = api;
}
