/* How one prompt is scored.
 *
 * A player gets MAX_ENTRIES guesses per prompt; right and wrong answers share
 * those slots. Hits and misses climb the same doubling ladder in opposite
 * directions: k hits are worth 2^(k-1) and m misses cost 2^(m-1), so the
 * range runs from -16 (five misses) to +16 (five hits). */

export const MAX_ENTRIES = 5;

/** 0, 1, 2, 4, 8, 16 for n = 0..5. */
const ladder = (n: number): number => (n === 0 ? 0 : 2 ** (n - 1));

export function promptScore(correct: number, misses: number): number {
  if (!Number.isInteger(correct) || !Number.isInteger(misses) || correct < 0 || misses < 0) {
    throw new RangeError(`counts must be non-negative integers (got ${correct}, ${misses})`);
  }
  if (correct + misses > MAX_ENTRIES) {
    throw new RangeError(`at most ${MAX_ENTRIES} entries per prompt (got ${correct + misses})`);
  }
  return ladder(correct) - ladder(misses);
}
