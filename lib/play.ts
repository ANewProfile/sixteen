/* Playing: handing out sets, checking guesses, and recording finished games.
 * Open to guests.
 *
 * The server keeps no game state: each check request carries every entry's
 * attempts so far, and the answers are only sent back once nothing needs a
 * prompt. Recording is on the honor system, with sanity checks. A signed-in
 * player's finished Daily is also kept, so their other devices can show it. */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { judgeEntries, MAX_ATTEMPTS, MAX_GUESS_LENGTH, type EntryResult, type Round } from './answers';
import { getDaily, idsOf, todaysDaily } from './dailies';
import { addDays, utcDay } from './dates';
import { isUniqueViolation, recordGame, ROUNDS_PER_GAME, type Db } from './games';
import { currentRating } from './prompts';
import { dailyCompletions, prompts } from './schema';
import { MAX_ENTRIES, promptScore } from './scoring';
import { drawSet, ratedPrompts, setDifficulty } from './sets';

export class PlayError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 503,
  ) {
    super(message);
  }
}

export type CheckResponse =
  | Extract<Round, { status: 'prompt' }>
  | {
      status: 'final';
      results: EntryResult[];
      hits: number;
      misses: number;
      score: number;
      /** Every answer's canonical form, in list order, for the reveal. */
      answers: string[];
    };

/** Validates untrusted input: { promptId, entries: string[][] }. No entries at all is allowed: the player chose not to guess. */
function parseRequest(body: unknown): { promptId: string; entries: string[][] } {
  if (typeof body !== 'object' || body === null) throw new PlayError('request body must be an object', 400);
  const { promptId, entries } = body as Record<string, unknown>;
  if (typeof promptId !== 'string' || promptId === '') throw new PlayError('promptId is required', 400);
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) {
    throw new PlayError(`entries must be a list of 0–${MAX_ENTRIES} entries`, 400);
  }
  for (const attempts of entries) {
    const ok =
      Array.isArray(attempts) &&
      attempts.length >= 1 &&
      attempts.length <= MAX_ATTEMPTS &&
      attempts.every((a) => typeof a === 'string' && a.trim() !== '' && a.length <= MAX_GUESS_LENGTH);
    if (!ok) {
      throw new PlayError(
        `each entry must be a list of 1–${MAX_ATTEMPTS} non-empty guesses of at most ${MAX_GUESS_LENGTH} characters`,
        400,
      );
    }
  }
  return { promptId, entries: entries as string[][] };
}

export async function checkPrompt(db: Db, body: unknown): Promise<CheckResponse> {
  const { promptId, entries } = parseRequest(body);
  const prompt = await db.select({ answers: prompts.answers }).from(prompts).where(eq(prompts.id, promptId)).get();
  if (!prompt) throw new PlayError(`no prompt ${promptId}`, 404);

  const round = judgeEntries(prompt.answers, entries);
  if (round.status === 'prompt') return round;
  return { ...round, answers: prompt.answers.map((a) => a.canonical) };
}

/* ─────────────────────────────── sets ─────────────────────────────── */

/** What a player sees of a prompt before answering: never the answers. */
export interface PromptCard {
  id: string;
  category: number;
  text: string;
  note: string | null;
  difficulty: number;
}

export interface PlaySet {
  /** The Daily's day; absent for Infinite. */
  date?: string;
  prompts: PromptCard[];
  difficulty: number;
}

async function cards(db: Db, ids: string[]): Promise<PromptCard[]> {
  const rows = await db.select().from(prompts).where(inArray(prompts.id, ids)).all();
  const byId = new Map(rows.map((p) => [p.id, p]));
  return ids.map((id) => {
    const p = byId.get(id);
    if (!p) throw new PlayError(`prompt ${id} is missing`, 503);
    return { id, category: p.category, text: p.text, note: p.note, difficulty: currentRating(p) };
  });
}

const playSet = (list: PromptCard[], date?: string): PlaySet => ({
  ...(date && { date }),
  prompts: list,
  difficulty: setDifficulty(list.map((p) => ({ rating: p.difficulty }))),
});

export async function dailySet(db: Db, now = new Date()): Promise<PlaySet> {
  const { date, ids } = await todaysDaily(db, now);
  return playSet(await cards(db, ids), date);
}

export async function infiniteSet(db: Db): Promise<PlaySet> {
  return playSet(await cards(db, drawSet(await ratedPrompts(db)).map((p) => p.id)));
}

/* ─────────────────────────────── recording ─────────────────────────────── */

const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

interface Played {
  promptId: string;
  correct: number;
  misses: number;
}

function parseRounds(rounds: unknown): Played[] {
  if (!Array.isArray(rounds) || rounds.length !== ROUNDS_PER_GAME) {
    throw new PlayError(`rounds must be a list of ${ROUNDS_PER_GAME} results`, 400);
  }
  for (const r of rounds) {
    const { promptId, correct, misses } = (r ?? {}) as Record<string, unknown>;
    if (typeof promptId !== 'string' || !isCount(correct) || !isCount(misses) || correct + misses > MAX_ENTRIES) {
      throw new PlayError(`each round needs a promptId, and correct + misses of at most ${MAX_ENTRIES}`, 400);
    }
  }
  return rounds as Played[];
}

/** Refuses impossible results: unknown or repeated prompts, more answers than a prompt has, a closed or wrong Daily. */
async function checkPlayed(db: Db, mode: 'daily' | 'infinite', date: unknown, results: Played[], now: Date) {
  const ids = results.map((r) => r.promptId);
  if (new Set(ids).size !== ids.length) throw new PlayError('the same prompt is in the game twice', 400);

  const found = await db
    .select({ id: prompts.id, category: prompts.category, answerCount: sql<number>`json_array_length(${prompts.answers})` })
    .from(prompts)
    .where(inArray(prompts.id, ids))
    .all();
  const byId = new Map(found.map((p) => [p.id, p]));
  for (const r of results) {
    const p = byId.get(r.promptId);
    if (!p) throw new PlayError(`no prompt ${r.promptId}`, 404);
    if (r.correct > p.answerCount) throw new PlayError(`${r.promptId} has only ${p.answerCount} answers`, 400);
  }

  if (mode === 'daily') {
    // Yesterday too, so a Daily started before midnight UTC can still be finished.
    const today = utcDay(now);
    if (date !== today && date !== addDays(today, -1)) throw new PlayError('that Daily is no longer open', 400);
    const row = await getDaily(db, date);
    const scheduled = row ? idsOf(row) : [];
    if (scheduled.length !== ids.length || !ids.every((id) => scheduled.includes(id))) {
      throw new PlayError(`those prompts aren’t the Daily for ${date}`, 400);
    }
  } else if (new Set(found.map((p) => p.category)).size !== ROUNDS_PER_GAME) {
    throw new PlayError('a game’s prompts are from different categories', 400);
  }
}

/** What the server keeps of a finished Daily is the browser's own game state; this caps its size. */
export const MAX_GAME_JSON = 100_000;

/**
 * Reads a finished Daily as the browser saved it ({ set: { date, prompts },
 * rounds: [{ final: { hits, misses } }] }) and pulls out the per-prompt
 * results, so the stats and the stored game always agree. The rest of the
 * state is stored as sent: it only redraws the player's own results screen.
 */
function parseFinishedGame(game: unknown, date: unknown): { rounds: Played[]; game: Record<string, unknown> } {
  const fail = (why: string): never => {
    throw new PlayError(`game ${why}`, 400);
  };
  if (typeof game !== 'object' || game === null || Array.isArray(game)) fail('must be an object');
  if (JSON.stringify(game).length > MAX_GAME_JSON) fail('is too large');
  const g = game as { set?: { date?: unknown; prompts?: unknown }; rounds?: unknown };
  if (typeof date !== 'string' || g.set?.date !== date) fail('is not the Daily for that date');
  const cards = g.set!.prompts;
  if (!Array.isArray(cards) || !Array.isArray(g.rounds) || cards.length !== ROUNDS_PER_GAME || g.rounds.length !== ROUNDS_PER_GAME) {
    fail(`must have ${ROUNDS_PER_GAME} prompts and rounds`);
  }
  const rounds = parseRounds(
    (cards as unknown[]).map((card, i) => {
      const final = ((g.rounds as unknown[])[i] as { final?: { hits?: unknown; misses?: unknown } } | null)?.final;
      if (!final) fail('is not finished');
      return { promptId: (card as { id?: unknown })?.id, correct: final!.hits, misses: final!.misses };
    }),
  );
  return { rounds, game: { ...(game as Record<string, unknown>), done: true, recorded: true } };
}

const pointsOf = (rounds: Played[]) => rounds.reduce((sum, r) => sum + promptScore(r.correct, r.misses), 0);

/** A player's finished Daily for a day, as their browser saved it, or null. */
export async function dailyCompletion(db: Db, userId: string, date: string): Promise<{ game: unknown; points: number } | null> {
  const row = await db
    .select({ game: dailyCompletions.game, points: dailyCompletions.points })
    .from(dailyCompletions)
    .where(and(eq(dailyCompletions.userId, userId), eq(dailyCompletions.date, date)))
    .get();
  return row ?? null;
}

export interface RecordReply {
  points: number;
  /** Set when the player's account already had this Daily finished: that one stands, and the browser should show it. */
  game?: unknown;
}

/**
 * Records a finished game from what the browser reports: per prompt, how many
 * answers it got and how many guesses missed. Nothing proves those numbers
 * (honor system), but impossible ones are refused.
 *
 * A signed-in player's Daily sends its whole finished game instead, and is
 * kept as their completion for that day, written in the same batch as the
 * stats. If the account already has one (another device got there first),
 * nothing is recorded and the stored game is returned: the account wins.
 */
export async function recordPlayed(db: Db, body: unknown, now = new Date(), userId: string | null = null): Promise<RecordReply> {
  if (typeof body !== 'object' || body === null) throw new PlayError('request body must be an object', 400);
  const { mode, date, rounds, game } = body as Record<string, unknown>;
  if (mode !== 'daily' && mode !== 'infinite') throw new PlayError("mode must be 'daily' or 'infinite'", 400);

  if (!userId || mode === 'infinite') {
    const results = parseRounds(rounds);
    await checkPlayed(db, mode, date, results, now);
    return { points: await recordGame(db, { mode, userId, rounds: results }) };
  }

  const finished = parseFinishedGame(game, date);
  await checkPlayed(db, mode, date, finished.rounds, now);
  return keepCompletion(db, userId, date as string, finished, false);
}

/**
 * Moves a Daily the player finished as a guest, in this browser, into their
 * account. It already counted toward the prompt and global stats, so only the
 * player's own stats change. If the account already has that day, the account
 * wins: nothing changes, and its game is returned for the browser to keep.
 */
export async function transferDaily(db: Db, userId: string, body: unknown, now = new Date()): Promise<{ game: unknown }> {
  if (typeof body !== 'object' || body === null) throw new PlayError('request body must be an object', 400);
  const { date, game } = body as Record<string, unknown>;
  const existing = typeof date === 'string' ? await dailyCompletion(db, userId, date) : null;
  if (existing) return { game: existing.game };

  const finished = parseFinishedGame(game, date);
  await checkPlayed(db, 'daily', date, finished.rounds, now);
  const reply = await keepCompletion(db, userId, date as string, finished, true);
  return { game: reply.game ?? finished.game };
}

async function keepCompletion(
  db: Db, userId: string, date: string, finished: ReturnType<typeof parseFinishedGame>, playerOnly: boolean,
): Promise<RecordReply> {
  const existing = await dailyCompletion(db, userId, date);
  if (existing) return existing;
  const points = pointsOf(finished.rounds);
  try {
    await recordGame(
      db,
      { mode: 'daily', userId, rounds: finished.rounds },
      { playerOnly, alsoWrite: [db.insert(dailyCompletions).values({ userId, date, game: finished.game, points })] },
    );
    return { points };
  } catch (err) {
    // Two devices finishing at once: the completion row's key lets only one in, and the batch left nothing behind.
    if (!isUniqueViolation(err)) throw err;
    const stored = await dailyCompletion(db, userId, date);
    if (!stored) throw err;
    return stored;
  }
}
