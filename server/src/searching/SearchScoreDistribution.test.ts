import { describe, expect, it } from 'vitest';
import type { RankedJobWrapper, ScoreWeights } from './SearchInterfaces.js';
import { buildScoreDistribution } from './searchMain/SearchMain.js';

function wrapper(totalScore: number): RankedJobWrapper {
  return { totalScore } as RankedJobWrapper;
}

describe('buildScoreDistribution', () => {
  it('uses the default six-weight normalization used by job tiles', () => {
    expect(buildScoreDistribution([
      wrapper(0),
      wrapper(3),
      wrapper(6),
    ])).toEqual([
      { start: 0, end: 0, count: 1 },
      { start: 50, end: 50, count: 1 },
      { start: 100, end: 100, count: 1 },
    ]);
  });

  it('normalizes using the sum of active custom weights', () => {
    const scoreWeights: ScoreWeights = {
      resume: 2,
      impact: 1,
      location: 1,
      fresh: 0,
      audit: 0,
      qualityOfLife: 0,
    };

    expect(buildScoreDistribution([
      wrapper(1),
      wrapper(3),
    ], scoreWeights)).toEqual([
      { start: 25, end: 25, count: 1 },
      { start: 75, end: 75, count: 1 },
    ]);
  });

  it('keeps zero-sum and above-maximum totals inside 0-100', () => {
    const zeroWeights: ScoreWeights = {
      resume: 0,
      impact: 0,
      location: 0,
      fresh: 0,
      audit: 0,
      qualityOfLife: 0,
    };

    expect(buildScoreDistribution([wrapper(5)], zeroWeights)).toEqual([
      { start: 0, end: 0, count: 1 },
    ]);
    expect(buildScoreDistribution([wrapper(8)])).toEqual([
      { start: 100, end: 100, count: 1 },
    ]);
  });
});