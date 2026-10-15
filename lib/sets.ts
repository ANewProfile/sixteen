/* Making a game's set of 5 prompts.
 *
 * Every set has 5 prompts from 5 different categories, and its difficulty (the
 * average of the prompts' ratings) must fall in a range: 6.5–9.5 for sets the
 * game makes, 6–10 for Dailies an admin picks.
 *
 * Drawing: 3 random prompts from 3 random categories, then a random pair from
 * the other categories among the pairs that bring the average into range,
 * every valid pair equally likely. If no pair fits, the 3 are redrawn; after
 * more than 5 failures the game gives up with an error. */
import { sql } from 'drizzle-orm';
import type { Db } from './games';
import { countScore } from './prompts';
import { promptRating } from './rating';
import { prompts } from './schema';

export const SET_SIZE = 5;
export const GENERATED_RANGE = { min: 6.5, max: 9.5 } as const;
export const ADMIN_DAILY_RANGE = { min: 6, max: 10 } as const;
export const MAX_REDRAWS = 5;

export interface Rated {
  id: string;
  category: number;
  rating: number;
}

export class SetError extends Error {}

/** Every prompt with its current rating. Answers are counted in SQL rather than loaded. */
export async function ratedPrompts(db: Db): Promise<Rated[]> {
  const rows = await db
    .select({
      id: prompts.id,
      category: prompts.category,
      authorScore: prompts.authorScore,
      playTotal: prompts.playTotal,
      playCount: prompts.playCount,
      answerCount: sql<number>`json_array_length(${prompts.answers})`,
    })
    .from(prompts)
    .all();
  return rows.map((p) => ({
    id: p.id,
    category: p.category,
    rating: promptRating({
      countScore: countScore(p.answerCount),
      authorScore: p.authorScore,
      playthroughs: p.playCount,
      playerAverage: p.playCount ? p.playTotal / p.playCount : null,
    }),
  }));
}

export const setDifficulty = (set: { rating: number }[]) => set.reduce((sum, p) => sum + p.rating, 0) / set.length;

/** Why a hand-picked set breaks the rules, or null if it's fine. */
export function setProblem(set: Rated[], range: { min: number; max: number }): string | null {
  if (set.length !== SET_SIZE) return `a set needs ${SET_SIZE} prompts`;
  if (new Set(set.map((p) => p.id)).size !== SET_SIZE) return 'the same prompt is in the set twice';
  if (new Set(set.map((p) => p.category)).size !== SET_SIZE) return `the ${SET_SIZE} prompts must be from different categories`;
  const d = setDifficulty(set);
  if (d < range.min || d > range.max) {
    return `the set’s difficulty is ${d.toFixed(2)}; it must be between ${range.min} and ${range.max}`;
  }
  return null;
}

type Random = () => number;
const pick = <T>(xs: T[], random: Random): T => xs[Math.floor(random() * xs.length)];

function shuffled<T>(xs: T[], random: Random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Index of the first rating >= value in an ascending list. */
function lowerBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * A random pair from different categories whose ratings add up to between
 * `low` and `high`, every valid pair equally likely; null if there is none.
 * Sorting and binary search keep it O(n log n), not O(n²), however many prompts there are.
 */
function balancingPair(pool: Rated[], low: number, high: number, random: Random): [Rated, Rated] | null {
  const sorted = [...pool].sort((a, b) => a.rating - b.rating);
  const ratings = sorted.map((p) => p.rating);
  const byCategory = new Map<number, Rated[]>();
  for (const p of sorted) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push(p);
  }
  const categoryRatings = new Map([...byCategory].map(([c, ps]) => [c, ps.map((p) => p.rating)]));

  /** How many prompts in another category would complete a valid pair with p. */
  const partners = (p: Rated) => {
    const [lo, hi] = [low - p.rating, high - p.rating];
    const all = lowerBound(ratings, hi + 1e-9) - lowerBound(ratings, lo - 1e-9);
    const own = categoryRatings.get(p.category)!;
    const same = lowerBound(own, hi + 1e-9) - lowerBound(own, lo - 1e-9);
    return all - same;
  };

  // Choosing the first prompt in proportion to its number of partners, then a
  // partner uniformly, makes every valid pair equally likely.
  const counts = sorted.map(partners);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let r = random() * total;
  let i = 0;
  while (r >= counts[i]) r -= counts[i++];
  const first = sorted[i];
  const options = sorted.filter(
    (p) => p.category !== first.category && p.rating >= low - first.rating - 1e-9 && p.rating <= high - first.rating + 1e-9,
  );
  return [first, pick(options, random)];
}

/** A set for a game: the Daily when none was preset, or an Infinite game. */
export function drawSet(pool: Rated[], random: Random = Math.random, range = GENERATED_RANGE): Rated[] {
  const categories = [...new Set(pool.map((p) => p.category))];
  if (categories.length < SET_SIZE) {
    throw new SetError(`only ${categories.length} categories have prompts; a set needs ${SET_SIZE}`);
  }
  for (let attempt = 0; attempt <= MAX_REDRAWS; attempt++) {
    const firstCategories = shuffled(categories, random).slice(0, 3);
    const first = firstCategories.map((c) => pick(pool.filter((p) => p.category === c), random));
    const sum = first.reduce((s, p) => s + p.rating, 0);
    const rest = pool.filter((p) => !firstCategories.includes(p.category));
    const pair = balancingPair(rest, SET_SIZE * range.min - sum, SET_SIZE * range.max - sum, random);
    if (pair) return shuffled([...first, ...pair], random);
  }
  throw new SetError(`couldn’t make a set with difficulty ${range.min}–${range.max} after ${MAX_REDRAWS + 1} tries`);
}
