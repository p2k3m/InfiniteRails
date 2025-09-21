import { describe, it, expect } from 'vitest';
import utils from '../scoreboard-utils.js';

const {
  normalizeScoreEntries,
  upsertScoreEntry,
  formatScoreNumber,
  formatRunTime,
  formatLocationLabel,
} = utils;

describe('scoreboard utils', () => {
  it('normalizes entries with fallbacks and sorts by score', () => {
    const input = [
      { id: 'b', name: 'Beta', score: 100 },
      { googleId: 'c-google', displayName: 'Gamma', points: '250' },
      { playerId: 'a-player', dimensions: '3', inventoryCount: 5, runtimeSeconds: 42 },
    ];
    const result = normalizeScoreEntries(input);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Gamma');
    expect(result[0].score).toBe(250);
    expect(result[1].id).toBe('b');
    expect(result[2].dimensionCount).toBe(3);
    expect(result[2].runTimeSeconds).toBe(42);
    expect(typeof result[2].id).toBe('string');
  });

  it('formats numbers and runtimes for the scoreboard', () => {
    expect(formatScoreNumber(1234.4)).toBe('1,234');
    expect(formatScoreNumber(null)).toBe('0');
    expect(formatRunTime(3725)).toBe('1h 2m');
    expect(formatRunTime(125)).toBe('2m 5s');
    expect(formatRunTime(15)).toBe('15s');
    expect(formatRunTime(undefined)).toBe('—');
  });

  it('formats location labels with fallbacks', () => {
    expect(formatLocationLabel({ locationLabel: 'Citadel' })).toBe('Citadel');
    expect(formatLocationLabel({ location: { latitude: 12.345, longitude: -78.9 } })).toBe('Lat 12.3, Lon -78.9');
    expect(formatLocationLabel({ location: { error: 'Permission denied' } })).toBe('Permission denied');
    expect(formatLocationLabel({})).toBe('Location hidden');
  });

  it('inserts or updates scoreboard entries while keeping order', () => {
    const entries = [
      { id: 'alpha', name: 'Alpha', score: 100 },
      { id: 'beta', name: 'Beta', score: 80 },
    ];
    const updated = upsertScoreEntry(entries, { id: 'beta', name: 'Beta', score: 120 });
    expect(updated[0].id).toBe('beta');
    expect(updated[0].score).toBe(120);
    const added = upsertScoreEntry(updated, { id: 'gamma', name: 'Gamma', score: 90 });
    expect(added.map((e) => e.id)).toEqual(['beta', 'alpha', 'gamma']);
    expect(entries[1].score).toBe(80);
  });
});
