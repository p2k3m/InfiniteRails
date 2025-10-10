import { describe, expect, it } from 'vitest';

const {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  buildPortalFrame,
  createPortalFrameLayout,
  buildPortalPlacementPreview,
  validatePortalFrameFootprint,
  detectPortalCollision,
  ignitePortalFrame,
  enterPortal,
  getPortalMechanicsSummary,
} = require('../portal-mechanics');

describe('portal mechanics', () => {
  it('builds a 4x3 portal footprint aligned to facing vector', () => {
    const origin = { x: 10, y: 10 };
    const vertical = buildPortalFrame(origin, { x: 1, y: 0 });
    expect(vertical.bounds.width).toBe(FRAME_HEIGHT);
    expect(vertical.bounds.height).toBe(FRAME_WIDTH);
    const horizontal = buildPortalFrame(origin, { x: 0, y: 1 });
    expect(horizontal.bounds.width).toBe(FRAME_WIDTH);
    expect(horizontal.bounds.height).toBe(FRAME_HEIGHT);
    const expectedFrameTiles = 2 * (horizontal.bounds.width + horizontal.bounds.height) - 4;
    expect(horizontal.frame).toHaveLength(expectedFrameTiles);
  });

  it('detects collisions when blocked tiles exist within the footprint', () => {
    const footprint = buildPortalFrame({ x: 2, y: 2 }, { x: 0, y: 1 });
    const grid = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({ type: 'grass', walkable: true })));
    grid[1][1] = { type: 'tree', walkable: false };
    const collisions = detectPortalCollision(grid, footprint);
    expect(collisions.length).toBeGreaterThan(0);
    expect(collisions[0].reason).toBe('tree');
  });

  it('detects blocking occupants such as players and chests', () => {
    const footprint = buildPortalFrame({ x: 3, y: 3 }, { x: 0, y: 1 });
    const grid = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => ({ type: 'grass', walkable: true })),
    );
    const interiorTile = footprint.interior[0];
    grid[interiorTile.y][interiorTile.x] = {
      type: 'grass',
      walkable: true,
      occupant: 'player',
    };
    const collisions = detectPortalCollision(grid, footprint);
    const reasons = collisions.map((entry) => entry.reason);
    expect(reasons).toContain('player');
    const secondInterior = footprint.interior[1];
    grid[secondInterior.y][secondInterior.x] = {
      type: 'grass',
      walkable: true,
      occupants: ['chest'],
    };
    const collisionsWithChest = detectPortalCollision(grid, footprint);
    const chestReasons = collisionsWithChest.map((entry) => entry.reason);
    expect(chestReasons).toContain('chest');
  });

  it('activates the shader immediately when ignited with a torch', () => {
    const footprint = buildPortalFrame({ x: 5, y: 5 }, { x: 0, y: 1 });
    const result = ignitePortalFrame(footprint, { tool: 'torch' });
    expect(result.method).toBe('torch');
    expect(result.shaderActive).toBe(true);
    expect(result.activation).toBeGreaterThan(0);
    expect(result.events).toContain('Portal active');
  });

  it('builds a portal frame layout and exposes preview slots', () => {
    const layout = createPortalFrameLayout({ x: 10, z: 12, y: 2 }, { blockSize: 1 });
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.frameSlots.size).toBe(2 * (layout.bounds.width + layout.bounds.height) - 4);
    expect(layout.interiorSlots.size).toBe(layout.bounds.width * layout.bounds.height - layout.frameSlots.size);
    const sampleSlot = Array.from(layout.frameSlots.values())[0];
    expect(sampleSlot).toMatchObject({
      gridX: expect.any(Number),
      gridZ: expect.any(Number),
      relY: expect.any(Number),
      worldPosition: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }),
    });
  });

  it('produces preview states for missing, present, and blocked frame slots', () => {
    const anchor = { x: 8, z: 8, y: 0 };
    const layout = createPortalFrameLayout(anchor);
    const emptyPreview = buildPortalPlacementPreview(layout, {});
    expect(emptyPreview.summary.totalFrameSlots).toBe(layout.frameSlots.size);
    expect(emptyPreview.summary.missingFrameSlots).toBe(layout.frameSlots.size);
    expect(emptyPreview.footprintValid).toBe(false);

    const placedBlocks = Array.from(layout.frameSlots.values()).map((slot) => ({
      gridX: slot.gridX,
      gridZ: slot.gridZ,
      level: slot.level,
      blockType: 'stone',
    }));
    const fullPreview = buildPortalPlacementPreview(layout, { placedBlocks, requiredBlockType: 'stone' });
    expect(fullPreview.summary.presentFrameSlots).toBe(layout.frameSlots.size);
    expect(fullPreview.summary.missingFrameSlots).toBe(0);
    expect(fullPreview.summary.blockedFrameSlots).toBe(0);
    expect(fullPreview.footprintValid).toBe(true);
    expect(fullPreview.messages[0]).toMatch(/footprint complete/i);

    const blockingGridSize = 32;
    const grid = Array.from({ length: blockingGridSize }, () =>
      Array.from({ length: blockingGridSize }, () => ({ type: 'grass', walkable: true })),
    );
    const blockedSlot = placedBlocks[0];
    grid[blockedSlot.gridZ][blockedSlot.gridX] = { type: 'grass', walkable: false, occupant: 'player' };
    const blockedPreview = buildPortalPlacementPreview(layout, { collisionGrid: grid });
    expect(blockedPreview.summary.blockedFrameSlots).toBeGreaterThan(0);
    expect(blockedPreview.footprintValid).toBe(false);
    expect(blockedPreview.messages.join(' ')).toMatch(/player/);
  });

  it('validates portal frame footprints and surfaces summary details', () => {
    const layout = createPortalFrameLayout({ x: 6, z: 6, y: 0 });
    const resultMissing = validatePortalFrameFootprint(layout, {});
    expect(resultMissing.valid).toBe(false);
    expect(resultMissing.summary.missingFrameSlots).toBe(layout.frameSlots.size);

    const placements = Array.from(layout.frameSlots.values()).map((slot) => ({
      gridX: slot.gridX,
      gridZ: slot.gridZ,
      level: slot.level,
      blockType: 'obsidian',
    }));
    const resultComplete = validatePortalFrameFootprint(layout, {
      placedBlocks: placements,
      requiredBlockType: 'obsidian',
    });
    expect(resultComplete.valid).toBe(true);
    expect(resultComplete.summary.presentFrameSlots).toBe(layout.frameSlots.size);
    expect(resultComplete.messages[0]).toMatch(/complete/i);
  });

  it('logs the dimension name, applies physics, and returns spawn regeneration data', () => {
    const portal = { active: true, currentDimensionId: 'origin' };
    const dimension = {
      id: 'rock',
      name: 'Rock Dimension',
      physics: { gravity: 1.5, shaderProfile: 'rock-grit' },
      unlockPoints: 5,
      description: 'Heavier world with dense ore clusters.',
      spawn: {
        player: { x: 8, y: 3, z: -2 },
        world: { x: 12, y: -4 },
      },
    };
    const result = enterPortal(portal, dimension);
    expect(result.fade).toBe(true);
    expect(result.resetPosition).toEqual({ x: 8, y: 3 });
    expect(result.log).toBe(
      'Entering Rock Dimension — Gravity ×1.50 — Heavier world with dense ore clusters.',
    );
    expect(result.announcement).toBe(result.log);
    expect(result.physics.gravity).toBeCloseTo(1.5);
    expect(result.pointsAwarded).toBe(5);
    expect(result.dimensionRules).toContain('Gravity ×1.50');
    expect(result.dimensionRules).toContain('dense ore clusters');
    expect(result.dimensionChanged).toBe(true);
    expect(result.spawn.player).toEqual({ x: 8, y: 3, z: -2 });
    expect(result.spawn.world).toEqual({ x: 12, y: -4, z: 0 });
    expect(result.regeneration.player).toMatchObject({ required: true, spawn: { x: 8, y: 3, z: -2 } });
    expect(result.regeneration.world).toMatchObject({ required: true, spawn: { x: 12, y: -4, z: 0 } });
    expect(result.regeneration.player.resetOnFailure).toBe(true);
    expect(result.regeneration.world.resetOnFailure).toBe(true);
    expect(result.regeneration.failSafe).toMatchObject({
      resetOnWorldFailure: true,
      resetOnDimensionFailure: true,
      previousDimensionId: 'origin',
      targetDimensionId: 'rock',
      reason: 'dimension-transition-guard',
    });
    expect(result.transitionGuard).toMatchObject({
      allowIncompleteTransition: false,
      neverAllowIncompleteTransition: true,
      resetOnFailure: true,
      resetOnWorldFailure: true,
      resetOnDimensionFailure: true,
      triggers: expect.arrayContaining(['world-load-failure', 'dimension-load-failure']),
    });
  });

  it('throws when attempting to enter a portal that is inactive or misaligned', () => {
    expect(() => enterPortal({ active: false }, { id: 'rock' })).toThrow(
      /Portal must be active/i,
    );
    const activePortal = { active: true, currentDimensionId: 'rock' };
    expect(() => enterPortal(activePortal, { id: 'rock' })).toThrow(
      /already aligned/i,
    );
  });

  it('normalises spawn coordinates and validates dimension metadata', () => {
    const portal = { active: true };
    const dimension = {
      name: 'Mystery',
      physics: { gravity: 0.9 },
      unlockPoints: 2,
      description: 'Unknown territory.',
      spawn: {
        player: { x: 'NaN', y: null },
        world: {},
      },
    };
    const result = enterPortal(portal, dimension);
    expect(result.resetPosition).toEqual({ x: 0, y: 0 });
    expect(result.spawn.player).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.spawn.world).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.dimensionName).toBe('Mystery');
    expect(result.dimensionChanged).toBe(true);
  });

  it('summarises the core portal mechanics for documentation output', () => {
    const summary = getPortalMechanicsSummary();
    expect(summary.frame).toContain('4x3');
    expect(summary.activation).toMatch(/Torch/);
    expect(summary.points).toBe(5);
  });
});
