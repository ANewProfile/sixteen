/* A prompt's rating is its expected points on the 0–16 scale: higher means
 * easier. Until enough people have played it, the rating is an estimate built
 * from the size of its answer set and the author's judgement. After that, real
 * player results carry most of the weight and the estimate keeps a quarter. */

export const PLAYTHROUGH_THRESHOLD = 10;

const COUNT_WEIGHT = 0.4;
const AUTHOR_WEIGHT = 0.6;
const PRIOR_WEIGHT_AFTER_THRESHOLD = 0.25;
const PLAYER_WEIGHT_AFTER_THRESHOLD = 0.75;

export interface RatingInputs {
  /** Expected points implied by the answer-set size (0–16). */
  countScore: number;
  /** The author's expected-points estimate (0–16). */
  authorScore: number;
  /** Completed playthroughs of this prompt. */
  playthroughs: number;
  /** Mean promptScore over those playthroughs; null if there are none. */
  playerAverage: number | null;
}

function assertExpectedPoints(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 16) {
    throw new RangeError(`${name} must be between 0 and 16 (got ${value})`);
  }
}

/** The pre-threshold estimate: 40% answer count, 60% author. */
export function priorRating(countScore: number, authorScore: number): number {
  assertExpectedPoints('countScore', countScore);
  assertExpectedPoints('authorScore', authorScore);
  return COUNT_WEIGHT * countScore + AUTHOR_WEIGHT * authorScore;
}

export function promptRating({ countScore, authorScore, playthroughs, playerAverage }: RatingInputs): number {
  const prior = priorRating(countScore, authorScore);
  if (playthroughs < PLAYTHROUGH_THRESHOLD) return prior;
  if (playerAverage === null) {
    throw new Error(`playerAverage is required once there are ${PLAYTHROUGH_THRESHOLD}+ playthroughs`);
  }
  return PRIOR_WEIGHT_AFTER_THRESHOLD * prior + PLAYER_WEIGHT_AFTER_THRESHOLD * playerAverage;
}
