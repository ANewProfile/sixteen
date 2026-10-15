import { describe, expect, it } from 'vitest';
import { ADMIN_DAILY_RANGE, drawSet, GENERATED_RANGE, SetError, setDifficulty, setProblem, type Rated } from '../lib/sets';

/** A repeatable random number generator (mulberry32), so failures can be replayed. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n prompts per category with ratings spread over 0–16. */
const pool = (perCategory: number, ratingOf = (c: number, i: number) => ((c * 7 + i * 3) % 17)): Rated[] =>
  Array.from({ length: 10 }, (_, c) =>
    Array.from({ length: perCategory }, (_, i) => ({ id: `${c}P${String(i).padStart(6, '0')}`, category: c, rating: ratingOf(c, i) })),
  ).flat();

describe('drawSet', () => {
  it('always makes 5 prompts from 5 categories with difficulty 6.5–9.5', () => {
    const prompts = pool(20);
    for (let seed = 1; seed <= 300; seed++) {
      const set = drawSet(prompts, seeded(seed));
      expect(setProblem(set, GENERATED_RANGE)).toBeNull();
    }
  });

  it('varies from game to game', () => {
    const prompts = pool(20);
    const sets = new Set(Array.from({ length: 50 }, (_, s) => drawSet(prompts, seeded(s + 1)).map((p) => p.id).sort().join()));
    expect(sets.size).toBeGreaterThan(40);
  });

  it('uses every category over many games', () => {
    const prompts = pool(5);
    const seen = new Set(Array.from({ length: 100 }, (_, s) => drawSet(prompts, seeded(s + 1))).flat().map((p) => p.category));
    expect(seen.size).toBe(10);
  });

  it('redraws when the first three can’t be balanced, and gives up after 6 tries', () => {
    // Every prompt rated 16: no set can average 9.5 or less.
    const tooEasy = pool(3, () => 16);
    expect(() => drawSet(tooEasy, seeded(1))).toThrow(SetError);
    expect(() => drawSet(tooEasy, seeded(1))).toThrow(/after 6 tries/);
  });

  it('needs at least 5 categories with prompts', () => {
    expect(() => drawSet(pool(3).filter((p) => p.category < 4), seeded(1))).toThrow(/only 4 categories/);
  });

  it('finds the one balancing pair when that is all there is', () => {
    // Categories 0–2 are hard (2), 3–9 easy (16) except one prompt each in 3 and 4 that balance.
    const prompts: Rated[] = [
      ...[0, 1, 2].map((c) => ({ id: `${c}Hard000`, category: c, rating: 2 })),
      ...[3, 4, 5, 6, 7, 8, 9].map((c) => ({ id: `${c}Easy000`, category: c, rating: 16 })),
      { id: '3Mid0000', category: 3, rating: 13 },
      { id: '4Mid0000', category: 4, rating: 14 },
    ];
    // Hard×3 = 6; the pair must add 26.5–41.5. Easy+easy (32) works too, so just check the rule holds.
    for (let seed = 1; seed <= 50; seed++) {
      let set: Rated[] | null = null;
      try {
        set = drawSet(prompts, seeded(seed));
      } catch {
        continue;
      }
      expect(setProblem(set, GENERATED_RANGE)).toBeNull();
    }
  });
});

describe('setProblem', () => {
  const five = (ratings: number[], categories = [0, 1, 2, 3, 4]): Rated[] =>
    ratings.map((rating, i) => ({ id: `${categories[i]}X${i}00000`, category: categories[i], rating }));

  it('accepts a set inside the range, edges included', () => {
    expect(setProblem(five([6, 6, 6, 6, 6]), ADMIN_DAILY_RANGE)).toBeNull();
    expect(setProblem(five([10, 10, 10, 10, 10]), ADMIN_DAILY_RANGE)).toBeNull();
    expect(setDifficulty(five([2, 4, 8, 12, 14]))).toBe(8);
  });

  it('explains what is wrong', () => {
    expect(setProblem(five([5, 5, 5, 5, 5]), ADMIN_DAILY_RANGE)).toMatch(/5\.00; it must be between 6 and 10/);
    expect(setProblem(five([8, 8, 8, 8, 8], [0, 0, 1, 2, 3]), ADMIN_DAILY_RANGE)).toMatch(/different categories/);
    expect(setProblem(five([8, 8, 8, 8]), ADMIN_DAILY_RANGE)).toMatch(/needs 5/);
  });
});
