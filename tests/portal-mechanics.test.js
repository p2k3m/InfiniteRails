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

  it('logs the dimension name and applies physics when entering a portal', () => {
    const portal = { active: true };
    const dimension = {
      id: 'rock',
      name: 'Rock Dimension',
      physics: { gravity: 1.5, shaderProfile: 'rock-grit' },
      unlockPoints: 5,
      description: 'Heavier world with dense ore clusters.',
    };
    const result = enterPortal(portal, dimension);
    expect(result.fade).toBe(true);
    expect(result.resetPosition).toEqual({ x: 0, y: 0 });
    expect(result.log).toBe('Entered Rock Dimension.');
    expect(result.physics.gravity).toBeCloseTo(1.5);
    expect(result.pointsAwarded).toBe(5);
    expect(result.dimensionRules).toContain('Gravity ×1.50');
    expect(result.dimensionRules).toContain('dense ore clusters');
  });

  it('summarises the core portal mechanics for documentation output', () => {
    const summary = getPortalMechanicsSummary();
    expect(summary.frame).toContain('4x3');
    expect(summary.activation).toMatch(/Torch/);
    expect(summary.points).toBe(5);
  });
});
