import { describe, it, expect } from 'vitest';
import scoreboardUtilsModule from '../scoreboard-utils.js';

const scoreboardUtils = scoreboardUtilsModule.default ?? scoreboardUtilsModule;

describe('scoreboard-utils', () => {
  it('normalises entries and sorts descending by score while aggregating dimension labels', () => {
    const entries = [
      {
        id: 'a',
        score: 12,
        dimensions: ['Origin', 'Rock'],
        dimensionLabels: ['Tar'],
      },
      {
        id: 'b',
        points: 50,
        dimensionSummary: 'Stone | Marble',
      },
      {
        id: 'c',
        score: 4,
        dimensionNames: [
          { id: 'netherite', name: 'Netherite' },
          { id: 'origin', label: 'Origin' },
        ],
      },
    ];

    const normalised = scoreboardUtils.normalizeScoreEntries(entries);

    expect(normalised.map((entry) => entry.id)).toEqual(['b', 'a', 'c']);
    expect(normalised[0].dimensionLabels).toEqual(['Stone', 'Marble']);
    expect(normalised[1].dimensionLabels).toEqual(['Tar', 'Origin', 'Rock']);
    expect(normalised[2].dimensionLabels).toEqual(['Netherite', 'Origin']);
  });

  it('upserts entries preserving the highest score achieved', () => {
    const initial = [
      { id: 'player-1', score: 20, name: 'Explorer' },
      { id: 'player-2', score: 10, name: 'Adventurer' },
    ];

    const afterImprovedScore = scoreboardUtils.upsertScoreEntry(initial, {
      id: 'player-2',
      score: 25,
      dimensionCount: 3,
    });

    expect(afterImprovedScore.find((entry) => entry.id === 'player-2')).toMatchObject({
      score: 25,
      dimensionCount: 3,
    });

    const afterLowerScore = scoreboardUtils.upsertScoreEntry(afterImprovedScore, {
      id: 'player-1',
      score: 15,
      dimensionCount: 2,
    });

    expect(afterLowerScore.find((entry) => entry.id === 'player-1')).toMatchObject({
      score: 20,
      dimensionCount: 2,
    });
  });

  it('formats run time and location labels consistently', () => {
    expect(scoreboardUtils.formatRunTime(65)).toBe('1m 5s');
    expect(scoreboardUtils.formatRunTime(3725)).toBe('1h 2m');
    expect(scoreboardUtils.formatRunTime(null)).toBe('—');

    expect(
      scoreboardUtils.formatLocationLabel({
        location: { latitude: 51.5074, longitude: -0.1278 },
      }),
    ).toBe('Lat 51.5, Lon -0.1');

    expect(
      scoreboardUtils.formatLocationLabel({
        locationLabel: 'Neo Grassland',
        location: { latitude: 1, longitude: 2 },
      }),
    ).toBe('Neo Grassland');
  });
});
