import { describe, expect, it } from 'vitest';
import { MAX_ENTRIES, promptScore } from '../lib/scoring';

describe('promptScore', () => {
  it('climbs the doubling ladder for hits', () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => promptScore(k, 0))).toEqual([0, 1, 2, 4, 8, 16]);
  });

  it('mirrors the ladder for misses', () => {
    expect([1, 2, 3, 4, 5].map((m) => promptScore(0, m))).toEqual([-1, -2, -4, -8, -16]);
  });

  it('nets hits against misses', () => {
    expect(promptScore(3, 2)).toBe(2);
    expect(promptScore(4, 1)).toBe(7);
    expect(promptScore(2, 3)).toBe(-2);
  });

  it('rejects more than MAX_ENTRIES entries', () => {
    expect(() => promptScore(3, 3)).toThrow(RangeError);
    expect(() => promptScore(MAX_ENTRIES + 1, 0)).toThrow(RangeError);
  });

  it('rejects negative or fractional counts', () => {
    expect(() => promptScore(-1, 0)).toThrow(RangeError);
    expect(() => promptScore(1.5, 0)).toThrow(RangeError);
  });
});
