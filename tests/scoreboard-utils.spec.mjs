import { describe, it, expect } from 'vitest';
import ScoreboardUtils from '../scoreboard-utils.js';

const {
  normalizeScoreEntries,
  upsertScoreEntry,
  formatScoreNumber,
  formatRunTime,
  formatLocationLabel,
} = ScoreboardUtils;

describe('ScoreboardUtils.normalizeScoreEntries', () => {
  it('normalises dimension labels and sorts by score', () => {
    const entries = [
      {
        id: 'two',
        name: 'Player Two',
        score: 45,
        dimensionLabels: ['Origin', 'Rock'],
      },
      {
        googleId: 'one',
        displayName: 'Player One',
        points: 90,
        dimensionSummary: 'Origin | Rock | Stone',
      },
    ];

    const [first, second] = normalizeScoreEntries(entries);
    expect(first.id).toBe('one');
    expect(first.name).toBe('Player One');
    expect(first.score).toBe(90);
    expect(first.dimensionLabels).toEqual(['Origin', 'Rock', 'Stone']);
    expect(second.id).toBe('two');
    expect(second.dimensionLabels).toEqual(['Origin', 'Rock']);
  });
});

describe('ScoreboardUtils.upsertScoreEntry', () => {
  it('updates entries when newer scores are higher or new', () => {
    const initial = normalizeScoreEntries([
      { id: 'one', name: 'Explorer One', score: 50 },
      { id: 'two', name: 'Explorer Two', score: 30 },
    ]);

    const afterUpgrade = upsertScoreEntry(initial, { id: 'two', score: 60, locationLabel: 'Earth' });
    const upgraded = afterUpgrade.find((entry) => entry.id === 'two');
    expect(upgraded.score).toBe(60);
    expect(upgraded.locationLabel).toBe('Earth');

    const afterDowngrade = upsertScoreEntry(afterUpgrade, { id: 'two', score: 55, name: 'Ignored Name' });
    const downgraded = afterDowngrade.find((entry) => entry.id === 'two');
    expect(downgraded.score).toBe(60);
    expect(downgraded.name).toBe('Ignored Name');

    const added = upsertScoreEntry(afterDowngrade, { id: 'three', score: 10 });
    expect(added.find((entry) => entry.id === 'three')).toBeTruthy();
  });
});

describe('ScoreboardUtils formatting helpers', () => {
  it('formats score and runtime with expected labels', () => {
    expect(formatScoreNumber(1234.5)).toBe('1,235');
    expect(formatRunTime(3670)).toBe('1h 1m');
    expect(formatRunTime(125)).toBe('2m 5s');
    expect(formatRunTime(42)).toBe('42s');
  });

  it('formats location labels with coordinates or fallbacks', () => {
    expect(
      formatLocationLabel({ location: { latitude: 51.501, longitude: -0.142 } }),
    ).toBe('Lat 51.5, Lon -0.1');
    expect(formatLocationLabel({ locationLabel: 'London' })).toBe('London');
    expect(formatLocationLabel({ location: { error: 'Denied' } })).toBe('Denied');
    expect(formatLocationLabel({})).toBe('Location hidden');
  });
});
