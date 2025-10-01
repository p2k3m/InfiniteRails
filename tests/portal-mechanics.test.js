import { describe, expect, it } from 'vitest';

const {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  buildPortalFrame,
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

  it('activates the shader immediately when ignited with a torch', () => {
    const footprint = buildPortalFrame({ x: 5, y: 5 }, { x: 0, y: 1 });
    const result = ignitePortalFrame(footprint, { tool: 'torch' });
    expect(result.method).toBe('torch');
    expect(result.shaderActive).toBe(true);
    expect(result.activation).toBeGreaterThan(0);
    expect(result.events).toContain('Portal active');
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
