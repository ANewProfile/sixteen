import { describe, expect, it } from 'vitest';
import { PLAYTHROUGH_THRESHOLD, priorRating, promptRating } from '../lib/rating';

describe('priorRating', () => {
  it('weights answer count 40% and author 60%', () => {
    expect(priorRating(10, 5)).toBeCloseTo(7);
    expect(priorRating(16, 16)).toBeCloseTo(16);
  });

  it('rejects scores outside 0–16', () => {
    expect(() => priorRating(17, 5)).toThrow(RangeError);
    expect(() => priorRating(5, -1)).toThrow(RangeError);
  });
});

describe('promptRating', () => {
  const base = { countScore: 10, authorScore: 5 };

  it('uses the prior alone below the threshold, ignoring any player data', () => {
    expect(promptRating({ ...base, playthroughs: 9, playerAverage: 16 })).toBeCloseTo(7);
    expect(promptRating({ ...base, playthroughs: 0, playerAverage: null })).toBeCloseTo(7);
  });

  it('switches to 25% prior + 75% player average at the threshold', () => {
    // 0.25 * 7 + 0.75 * 2 = 3.25, i.e. 10% count + 15% author + 75% player
    expect(promptRating({ ...base, playthroughs: PLAYTHROUGH_THRESHOLD, playerAverage: 2 })).toBeCloseTo(3.25);
  });

  it('lets a negative player average pull the rating below 0', () => {
    expect(promptRating({ ...base, playthroughs: 50, playerAverage: -16 })).toBeCloseTo(-10.25);
  });

  it('requires a player average once past the threshold', () => {
    expect(() => promptRating({ ...base, playthroughs: 10, playerAverage: null })).toThrow();
  });
});
