/* Judging guesses against a prompt's answers.
 *
 * Typo tolerance and normalisation (accents, numerals, initials like "jqa",
 * word order) come from qbreader's qb-answer-checker. SIXTEEN adds what a
 * list game needs:
 *
 * - Each answer has accepted forms (canonical + aliases), forms that earn a
 *   free prompt, and forms to reject. Rejects work as in qbreader: exact only.
 * - A form must appear in the guess as one run of words. Extra words before
 *   or after are fine; extra words in between are not, so "john quincy adams"
 *   is not John Adams, but "mississippi river delta" is Mississippi River.
 * - Accept beats prompt. Prompts are free; an entry has at most 3 attempts
 *   (the guess and two replies), and one still unresolved after that is a miss.
 * - No result is revealed until every prompt is resolved.
 * - Guesses are then matched to answers so that as many as possible count:
 *   the player always gets the benefit of the doubt. A guess left without an
 *   unused answer is ignored, never a miss. */
import checkAnswer from 'qb-answer-checker';
import { MAX_ENTRIES, promptScore } from './scoring';
import type { Answer } from './schema';

/** One typo allowed per this many letters; lower is more lenient. qbreader's default. */
export const STRICTNESS = 7;
export const MAX_ATTEMPTS = 3;
export const MAX_GUESS_LENGTH = 100;

/**
 * The checker reads " or " and ";" inside an answerline as separators, so an
 * answer like "Either or Or" would accept just "either". Joining "or" to its
 * neighbours with no-break spaces, in both the form and the guess, keeps the
 * phrase whole; it still matches word for word because both sides get the same treatment.
 */
const protect = (s: string) => s.replace(/ or /gi, ' or ').replace(/;/g, ',');

/**
 * Splits on ordinary whitespace only, so a protected "x or y" stays one word.
 * Dashes count as word breaks, so "jean paul sartre" and "jean-paul sartre"
 * are the same length; the checker itself already treats them as equal.
 */
const words = (s: string) => s.replace(/\p{Pd}/gu, ' ').split(/[ \t\r\n]+/).filter(Boolean);

const answerline = (form: string) => `<b><u>${protect(form.trim())}</u></b>`;

/**
 * How well a guess matches one form: the length of the matching run of words,
 * and whether it matched exactly. Null when it doesn't match.
 *
 * Runs are only as long as the form (in words), so a run can't smuggle in an
 * extra word. Shorter runs are allowed for abbreviations ("ww2", "jqa").
 */
function matchForm(form: string, guessWords: string[]): { length: number; exact: boolean } | null {
  const line = answerline(form);
  const maxLength = words(protect(form)).length;
  for (let length = Math.min(maxLength, guessWords.length); length >= 1; length--) {
    let fuzzy = false;
    for (let start = 0; start + length <= guessWords.length; start++) {
      const run = guessWords.slice(start, start + length).join(' ');
      if (checkAnswer(line, run, 0).directive === 'accept') return { length, exact: true };
      if (!fuzzy && checkAnswer(line, run, STRICTNESS).directive === 'accept') fuzzy = true;
    }
    if (fuzzy) return { length, exact: false };
  }
  return null;
}

/** Exact-only, as in qbreader: the checker sorts reject clauses first and matches them without typos. */
function rejects(answer: Answer, guess: string): boolean {
  if (!answer.rejects?.length) return false;
  const clauses = answer.rejects.map((r) => `reject ${protect(r.trim())}`).join('; ');
  return checkAnswer(`${answerline(answer.canonical)} [${clauses}]`, protect(guess.trim()), STRICTNESS).directive === 'reject';
}

/** The best-matching form among several, preferring longer runs, then exact over typo. */
function bestMatch(forms: string[], guessWords: string[]) {
  let best: { length: number; exact: boolean } | null = null;
  for (const form of forms) {
    if (!form.trim()) continue;
    const m = matchForm(form, guessWords);
    if (m && (!best || m.length > best.length || (m.length === best.length && m.exact && !best.exact))) best = m;
  }
  return best;
}

export interface Candidate {
  answer: number;
  length: number;
  exact: boolean;
}

export interface GuessJudgement {
  /** Answers that accept the guess, best first: longest match, then exact, then alphabetical. */
  accepts: Candidate[];
  /** Set when no answer accepts but at least one prompts. */
  prompt: { ask?: string } | null;
}

const alphabetical = (answers: Answer[]) => (a: number, b: number) =>
  answers[a].canonical.localeCompare(answers[b].canonical, 'en', { sensitivity: 'base' });

/** One guess against the whole list. */
export function judgeGuess(answers: Answer[], guess: string): GuessJudgement {
  const guessWords = words(protect(guess.trim()));
  if (!guessWords.length) return { accepts: [], prompt: null };

  const accepts: Candidate[] = [];
  const prompting: number[] = [];
  answers.forEach((answer, index) => {
    if (rejects(answer, guess)) return;
    const accepted = bestMatch([answer.canonical, ...answer.aliases], guessWords);
    if (accepted) accepts.push({ answer: index, ...accepted });
    else if (answer.prompts?.length && bestMatch(answer.prompts, guessWords)) prompting.push(index);
  });

  const byName = alphabetical(answers);
  accepts.sort((a, b) => b.length - a.length || Number(b.exact) - Number(a.exact) || byName(a.answer, b.answer));
  if (accepts.length || !prompting.length) return { accepts, prompt: null };
  // Several answers prompting: the player sees one question, the alphabetically first answer's.
  const first = prompting.sort(byName)[0];
  return { accepts, prompt: answers[first].ask?.trim() ? { ask: answers[first].ask!.trim() } : {} };
}

export type EntryResult =
  | { result: 'hit'; answer: number }
  /** Acceptable, but every answer it fits was credited to another guess: no point, no miss. */
  | { result: 'ignored' }
  | { result: 'miss' };

export type Round =
  /** Entries whose latest attempt needs more detail, with any directed prompt. Nothing else is revealed. */
  | { status: 'prompt'; prompts: { entry: number; ask?: string }[] }
  | { status: 'final'; results: EntryResult[]; hits: number; misses: number; score: number };

/**
 * With at most 5 guesses, a guess competes with at most 4 others, so one of its
 * top 5 candidates is always free: looking further never improves the result.
 */
const CANDIDATES_PER_GUESS = MAX_ENTRIES;

/** A guess's candidate answer, with how good a fit it is. */
interface Option {
  answer: number;
  /** 0 for the guess's best-quality matches, 1 for the next (shorter or typo) level, and so on. */
  tier: number;
  /** Position in the full ranking, alphabetical within a tier. */
  rank: number;
}

/** Each guess's top candidates, labelled with their quality tier. */
function options(accepts: Candidate[]): Option[] {
  let tier = 0;
  return accepts.slice(0, CANDIDATES_PER_GUESS).map((c, rank, list) => {
    if (rank > 0 && (c.length !== list[rank - 1].length || c.exact !== list[rank - 1].exact)) tier++;
    return { answer: c.answer, tier, rank };
  });
}

/**
 * Gives each guess at most one answer and each answer at most one guess.
 * In order of priority: credit as many guesses as possible; give guesses
 * their best-quality matches; only then go by alphabetical order. A vague
 * "adams" therefore yields John Adams to a later "john adams" and takes
 * Samuel Adams. At most 6^5 combinations, so brute force is fine.
 */
function assign(choices: Option[][]): (number | null)[] {
  const n = choices.length;
  type Score = { hits: number; tiers: number; ranks: number; order: number[] };
  let best: { score: Score; picks: (number | null)[] } | null = null;
  const picks: (number | null)[] = Array(n).fill(null);
  const order: number[] = Array(n).fill(Infinity);
  const used = new Set<number>();

  const beats = (a: Score, b: Score) => {
    if (a.hits !== b.hits) return a.hits > b.hits;
    if (a.tiers !== b.tiers) return a.tiers < b.tiers;
    if (a.ranks !== b.ranks) return a.ranks < b.ranks;
    for (let i = 0; i < n; i++) if (a.order[i] !== b.order[i]) return a.order[i] < b.order[i];
    return false;
  };

  const visit = (i: number, hits: number, tiers: number, ranks: number) => {
    if (i === n) {
      const score = { hits, tiers, ranks, order: [...order] };
      if (!best || beats(score, best.score)) best = { score, picks: [...picks] };
      return;
    }
    for (const o of choices[i]) {
      if (used.has(o.answer)) continue;
      used.add(o.answer);
      picks[i] = o.answer;
      order[i] = o.rank;
      visit(i + 1, hits + 1, tiers + o.tier, ranks + o.rank);
      used.delete(o.answer);
    }
    picks[i] = null;
    order[i] = Infinity;
    visit(i + 1, hits, tiers, ranks);
  };
  visit(0, 0, 0, 0);
  return best!.picks;
}

/**
 * Judges a prompt's entries. Each entry lists its attempts so far: the guess,
 * then any replies to prompts. Only the latest attempt counts.
 *
 * While any entry still deserves a prompt and has attempts left, only those
 * entries are returned. Otherwise every result is final.
 */
export function judgeEntries(answers: Answer[], entries: string[][]): Round {
  const judged = entries.map((attempts) => judgeGuess(answers, attempts[attempts.length - 1]));

  const prompts = judged.flatMap((j, entry) =>
    j.prompt && entries[entry].length < MAX_ATTEMPTS ? [{ entry, ...j.prompt }] : [],
  );
  if (prompts.length) return { status: 'prompt', prompts };

  const picks = assign(judged.map((j) => options(j.accepts)));
  const results = judged.map((j, i): EntryResult => {
    const pick = picks[i];
    if (pick !== null) return { result: 'hit', answer: pick };
    return j.accepts.length ? { result: 'ignored' } : { result: 'miss' };
  });
  const hits = results.filter((r) => r.result === 'hit').length;
  const misses = results.filter((r) => r.result === 'miss').length;
  return { status: 'final', results, hits, misses, score: promptScore(hits, misses) };
}
