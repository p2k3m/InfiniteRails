const FRAME_WIDTH = 4;
const FRAME_HEIGHT = 3;

function normaliseFacingVector(facing = {}) {
  if (!facing || typeof facing !== 'object') {
    return { x: 0, y: 1 };
  }
  const { x = 0 } = facing;
  const y =
    typeof facing.y === 'number'
      ? facing.y
      : typeof facing.z === 'number'
        ? facing.z
        : 1;
  const magnitude = Math.sqrt(x * x + y * y) || 1;
  return { x: x / magnitude, y: y / magnitude };
}

function resolveOrientation(facing = { x: 0, y: 1 }) {
  if (!facing) return 'horizontal';
  const { x = 0, y = 0 } = facing;
  return Math.abs(x) > Math.abs(y) ? 'vertical' : 'horizontal';
}

function buildPortalFrame(origin, facing = { x: 0, y: 1 }) {
  if (!origin || typeof origin.x !== 'number' || typeof origin.y !== 'number') {
    throw new Error('Portal origin must supply numeric x and y.');
  }
  const orientation = resolveOrientation(normaliseFacingVector(facing));
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

function placementKey(x, z, level) {
  return `${x}|${z}|${level}`;
}

function normaliseHeightResolver(baseHeightMap, fallback) {
  if (typeof fallback === 'function') {
    return fallback;
  }
  if (Array.isArray(baseHeightMap)) {
    return (x, z) => {
      const column = baseHeightMap[x];
      if (!column) return null;
      const value = column[z];
      return Number.isFinite(value) ? value : null;
    };
  }
  if (baseHeightMap && typeof baseHeightMap === 'object') {
    return (x, z) => {
      const value = baseHeightMap?.[x]?.[z];
      return Number.isFinite(value) ? value : null;
    };
  }
  return () => null;
}

function normalisePlacementLookup(source) {
  const map = new Map();
  if (!source) {
    return map;
  }
  const addEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const gridX = Number(entry.gridX ?? entry.x);
    const gridZ = Number(entry.gridZ ?? entry.z ?? entry.y);
    if (!Number.isFinite(gridX) || !Number.isFinite(gridZ)) {
      return;
    }
    let level = entry.level;
    if (!Number.isFinite(level)) {
      if (Number.isFinite(entry.y)) {
        level = entry.y;
      } else if (Number.isFinite(entry.gridY)) {
        level = entry.gridY;
      } else if (Number.isFinite(entry.relY) || Number.isFinite(entry.baseHeight)) {
        const base = Number.isFinite(entry.baseHeight) ? entry.baseHeight : 0;
        const rel = Number.isFinite(entry.relY) ? entry.relY : 0;
        level = base + rel;
      }
    }
    if (!Number.isFinite(level)) {
      return;
    }
    const key = placementKey(gridX, gridZ, level);
    if (!map.has(key)) {
      map.set(key, entry);
    }
  };
  if (Array.isArray(source)) {
    source.forEach(addEntry);
    return map;
  }
  if (source instanceof Map) {
    source.forEach((value) => addEntry(value));
    return map;
  }
  if (source instanceof Set) {
    source.forEach(addEntry);
    return map;
  }
  if (typeof source === 'object') {
    Object.values(source).forEach(addEntry);
  }
  return map;
}

function createPortalFrameLayout(anchor, options = {}) {
  if (!anchor || typeof anchor !== 'object') {
    throw new Error('Portal anchor is required to build frame layout.');
  }
  const { x, z, y } = anchor;
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new Error('Portal anchor must include numeric x and z coordinates.');
  }
  const facing = normaliseFacingVector(options.facing ?? anchor.facing ?? { x: 0, y: 1 });
  const footprint = buildPortalFrame({ x, y: z }, facing);
  const width = footprint.bounds.width;
  const height = footprint.bounds.height;
  const offsetX = Math.floor((width - 1) / 2);
  const offsetZ = Math.floor((height - 1) / 2);
  const startX = x - offsetX;
  const startZ = z - offsetZ;
  const frameSlots = new Map();
  const interiorSlots = new Map();
  const columnMap = new Map();
  const blockSize = Number.isFinite(options.blockSize) ? options.blockSize : 1;
  const baseHeightResolver = normaliseHeightResolver(
    options.baseHeightMap ?? options.initialHeightMap,
    options.getBaseHeight,
  );
  const anchorHeight = Number.isFinite(y) ? y : null;

  const upsertColumnSlot = (slot) => {
    const key = `${slot.gridX}|${slot.gridZ}`;
    if (!columnMap.has(key)) {
      columnMap.set(key, {
        key,
        gridX: slot.gridX,
        gridZ: slot.gridZ,
        slots: [],
      });
    }
    columnMap.get(key).slots.push(slot);
  };

  const assignSlot = (collection, slot) => {
    collection.set(slot.id, slot);
    upsertColumnSlot(slot);
  };

  for (let dz = 0; dz < height; dz += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      const gridX = startX + dx;
      const gridZ = startZ + dz;
      const relX = gridX - x;
      const relZ = gridZ - z;
      const relY = dz;
      const columnKey = `${gridX}|${gridZ}`;
      const baseHeight =
        Number.isFinite(anchorHeight) && options.anchorHeightFallback !== false
          ? anchorHeight
          : null;
      const resolvedBaseHeight = baseHeightResolver(gridX, gridZ);
      const slotBaseHeight = Number.isFinite(resolvedBaseHeight)
        ? resolvedBaseHeight
        : baseHeight;
      const level = (Number.isFinite(slotBaseHeight) ? slotBaseHeight : 0) + relY;
      const worldPosition = {
        x: gridX * blockSize,
        y: level * blockSize,
        z: gridZ * blockSize,
      };
      const slot = {
        id: `${columnKey}|${relY}`,
        columnKey,
        gridX,
        gridZ,
        relX,
        relZ,
        relY,
        baseHeight: slotBaseHeight,
        level,
        worldPosition,
        role:
          dx === 0 || dz === 0 || dx === width - 1 || dz === height - 1 ? 'frame' : 'interior',
        orientation: footprint.orientation,
        bounds: footprint.bounds,
      };
      if (slot.role === 'frame') {
        assignSlot(frameSlots, slot);
      } else {
        assignSlot(interiorSlots, slot);
      }
    }
  }

  return {
    anchor: { x, z, y: anchorHeight },
    facing,
    orientation: footprint.orientation,
    bounds: footprint.bounds,
    start: { x: startX, z: startZ },
    frameSlots,
    interiorSlots,
    columnSlots: columnMap,
    blockSize,
  };
}

function evaluatePortalColumnHeight(options = {}) {
  const { heightMap, columns, getColumnHeight } = options;
  const heightResolver = normaliseHeightResolver(heightMap, getColumnHeight);
  return (gridX, gridZ) => {
    const columnKey = `${gridX}|${gridZ}`;
    if (columns instanceof Map) {
      const column = columns.get(columnKey);
      if (Array.isArray(column) && column.length) {
        return column.length;
      }
    }
    const resolved = heightResolver(gridX, gridZ);
    return Number.isFinite(resolved) ? resolved : null;
  };
}

function createPreviewSlot(slot, overrides = {}) {
  return {
    ...slot,
    status: 'missing',
    reason: '',
    blockType: null,
    present: false,
    blocked: false,
    ghost: true,
    level: slot.level,
    ...overrides,
  };
}

function buildPortalPlacementPreview(anchorOrLayout, options = {}) {
  const layout = anchorOrLayout?.frameSlots ? anchorOrLayout : createPortalFrameLayout(anchorOrLayout, options);
  const placementLookup = normalisePlacementLookup(options.placedBlocks ?? options.blockPlacements);
  const columnHeightResolver = evaluatePortalColumnHeight({
    heightMap: options.heightMap ?? options.columnHeights,
    columns: options.columns,
    getColumnHeight: options.getColumnHeight,
  });
  const collisions = [];
  if (options.collisionGrid) {
    const footprint = {
      frame: Array.from(layout.frameSlots.values()).map(({ gridX, gridZ }) => ({ x: gridX, y: gridZ })),
      interior: Array.from(layout.interiorSlots.values()).map(({ gridX, gridZ }) => ({ x: gridX, y: gridZ })),
    };
    collisions.push(...detectPortalCollision(options.collisionGrid, footprint));
  }
  const collisionMap = new Map(collisions.map((entry) => [`${entry.x}|${entry.y}`, entry.reason]));
  const framePreview = new Map();
  const interiorPreview = new Map();
  const previewEntries = [];
  const requiredBlockType = typeof options.requiredBlockType === 'string' ? options.requiredBlockType : null;

  const getBlockState = typeof options.getBlockState === 'function' ? options.getBlockState : null;

  const evaluateSlot = (slot, role) => {
    const baseHeight = Number.isFinite(slot.baseHeight)
      ? slot.baseHeight
      : columnHeightResolver(slot.gridX, slot.gridZ) ?? 0;
    const level = baseHeight + slot.relY;
    const columnKey = `${slot.gridX}|${slot.gridZ}`;
    const placement = placementLookup.get(placementKey(slot.gridX, slot.gridZ, level));
    const column = options.columns instanceof Map ? options.columns.get(columnKey) : null;
    const columnBlock = Array.isArray(column) ? column[level] : null;
    let status = 'missing';
    let reason = '';
    let blockType = null;

    const columnHeight = columnHeightResolver(slot.gridX, slot.gridZ);

    const collisionReason = collisionMap.get(columnKey);
    if (collisionReason) {
      status = 'blocked';
      reason = collisionReason;
    } else if (getBlockState) {
      const state = getBlockState(slot, { level, role });
      if (state && typeof state === 'object') {
        if (state.blocked) {
          status = 'blocked';
          reason = state.reason || 'blocked';
        } else if (state.present || state.filled) {
          status = 'present';
          blockType = state.type ?? state.blockType ?? null;
        } else if (state.reason) {
          reason = state.reason;
        }
      } else if (state === true || state === 'present') {
        status = 'present';
      } else if (typeof state === 'string' && state) {
        status = 'present';
        blockType = state;
      }
    } else if (placement) {
      status = placement.blocked ? 'blocked' : 'present';
      reason = placement.reason || '';
      blockType = placement.blockType ?? placement.type ?? placement.id ?? null;
    } else if (columnBlock) {
      status = columnBlock.blocked ? 'blocked' : 'present';
      reason = columnBlock.reason || '';
      blockType = columnBlock.blockType ?? columnBlock.userData?.blockType ?? null;
    } else if (Number.isFinite(columnHeight) && columnHeight > level) {
      status = 'present';
    }

    if (status === 'present' && requiredBlockType && blockType && blockType !== requiredBlockType) {
      status = 'blocked';
      reason = reason || `mismatched-block:${blockType}`;
    }

    if (status === 'missing' && reason) {
      status = 'ghost';
    }

    const slotPreview = createPreviewSlot(slot, {
      role,
      baseHeight,
      level,
      status,
      reason,
      blockType,
      present: status === 'present',
      blocked: status === 'blocked',
      ghost: status !== 'present' && status !== 'blocked',
    });
    return slotPreview;
  };

  layout.frameSlots.forEach((slot, key) => {
    const preview = evaluateSlot(slot, 'frame');
    framePreview.set(key, preview);
    previewEntries.push(preview);
  });
  layout.interiorSlots.forEach((slot, key) => {
    const preview = evaluateSlot(slot, 'interior');
    interiorPreview.set(key, preview);
    previewEntries.push(preview);
  });

  const missing = previewEntries.filter((entry) => entry.role === 'frame' && entry.ghost);
  const blocked = previewEntries.filter((entry) => entry.role === 'frame' && entry.blocked);
  const present = previewEntries.filter((entry) => entry.role === 'frame' && entry.present);

  const summary = {
    totalFrameSlots: layout.frameSlots.size,
    missingFrameSlots: missing.length,
    blockedFrameSlots: blocked.length,
    presentFrameSlots: present.length,
  };

  const messages = [];
  if (blocked.length) {
    const reasons = Array.from(new Set(blocked.map((entry) => entry.reason || 'blocked')));
    messages.push(`Portal frame placement blocked by ${reasons.join(', ')}.`);
  }
  if (missing.length) {
    messages.push(`Missing ${missing.length} of ${layout.frameSlots.size} required portal frame blocks.`);
  }
  if (!messages.length) {
    messages.push('Portal frame footprint complete.');
  }

  return {
    layout,
    frameSlots: framePreview,
    interiorSlots: interiorPreview,
    preview: previewEntries,
    summary,
    footprintValid: !missing.length && !blocked.length,
    messages,
  };
}

function validatePortalFrameFootprint(anchorOrLayout, options = {}) {
  const preview = buildPortalPlacementPreview(anchorOrLayout, options);
  return {
    valid: preview.footprintValid,
    messages: preview.messages,
    summary: preview.summary,
    preview,
  };
}

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
  const transitionGuard = {
    reason: 'dimension-transition-guard',
    allowIncompleteTransition: false,
    neverAllowIncompleteTransition: true,
    resetOnFailure: true,
    resetOnWorldFailure: true,
    resetOnDimensionFailure: true,
    resetPortalAlignment: true,
    restorePreviousDimension: true,
    triggers: ['world-load-failure', 'dimension-load-failure'],
    actions: ['reset-portal-alignment', 'restore-previous-dimension'],
  };
  const failSafe = {
    resetOnWorldFailure: true,
    resetOnDimensionFailure: true,
    previousDimensionId: currentId ?? null,
    targetDimensionId: targetId,
    reason: 'dimension-transition-guard',
    resetPortalAlignment: true,
    restorePreviousDimension: true,
    actions: ['reset-portal-alignment', 'restore-previous-dimension'],
  };
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
    transitionGuard,
    spawn: {
      player: playerSpawn,
      world: worldSpawn,
    },
    regeneration: {
      player: { required: true, spawn: playerSpawn, resetOnFailure: true },
      world: { required: true, spawn: worldSpawn, resetOnFailure: true },
      failSafe,
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
  createPortalFrameLayout,
  buildPortalPlacementPreview,
  validatePortalFrameFootprint,
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
