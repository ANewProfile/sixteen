/* Recording a finished game. Every counter is bumped with a single
 * `x = x + n` statement, and all of them go to the database as one batch,
 * which it applies atomically: two games finishing at once can't overwrite
 * each other, and a failure leaves nothing half-saved. A batch is one round
 * trip, so it never holds the write lock while waiting on the network the way
 * an interactive transaction would. Guests feed the prompt and global stats;
 * signed-in players also feed their own. A guest Daily moved into an account
 * later feeds only the player's stats, since the rest already counted it. */
import { inArray, sql, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { promptScore } from './scoring';
import * as schema from './schema';
import { globalCategoryStats, globalGameStats, prompts, userCategoryStats, users } from './schema';

export const ROUNDS_PER_GAME = 5;

export interface RoundResult {
  promptId: string;
  correct: number;
  misses: number;
}

export interface GameResult {
  mode: 'daily' | 'infinite';
  /** null for a guest. */
  userId: string | null;
  rounds: RoundResult[];
}

export type Db = LibSQLDatabase<typeof schema>;

export interface RecordOptions {
  /** Only the player's own stats: the game already counted toward the prompt and global stats as a guest. */
  playerOnly?: boolean;
  /** More writes to apply in the same atomic batch (a Daily completion row). */
  alsoWrite?: BatchItem<'sqlite'>[];
}

/** Records the game and returns its total points. */
export async function recordGame(db: Db, game: GameResult, options: RecordOptions = {}): Promise<number> {
  if (options.playerOnly && !game.userId) throw new Error('a player-only record needs a user');
  if (game.rounds.length !== ROUNDS_PER_GAME) {
    throw new RangeError(`a game has ${ROUNDS_PER_GAME} rounds (got ${game.rounds.length})`);
  }
  const scored = game.rounds.map((r) => ({
    promptId: r.promptId,
    category: Number(r.promptId[0]),
    points: promptScore(r.correct, r.misses),
  }));
  const gamePoints = scored.reduce((sum, r) => sum + r.points, 0);

  // Checked up front because a batch can't stop partway on a missing row.
  const ids = scored.map((r) => r.promptId);
  const found = new Set((await db.select({ id: prompts.id }).from(prompts).where(inArray(prompts.id, ids))).map((p) => p.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`unknown prompt ${missing.join(', ')}`);
  if (game.userId && !(await db.select({ id: users.id }).from(users).where(eq(users.id, game.userId)).get())) {
    throw new Error(`unknown user ${game.userId}`);
  }

  const everyone = !options.playerOnly;
  const writes: BatchItem<'sqlite'>[] = [...(options.alsoWrite ?? [])];
  for (const r of scored) {
    if (everyone) writes.push(
      db
        .update(prompts)
        .set({ playTotal: sql`${prompts.playTotal} + ${r.points}`, playCount: sql`${prompts.playCount} + 1` })
        .where(eq(prompts.id, r.promptId)),
      db
        .insert(globalCategoryStats)
        .values({ category: r.category, total: r.points, count: 1 })
        .onConflictDoUpdate({
          target: globalCategoryStats.category,
          set: { total: sql`${globalCategoryStats.total} + ${r.points}`, count: sql`${globalCategoryStats.count} + 1` },
        }),
    );
    if (game.userId) {
      writes.push(
        db
          .insert(userCategoryStats)
          .values({ userId: game.userId, category: r.category, total: r.points, count: 1 })
          .onConflictDoUpdate({
            target: [userCategoryStats.userId, userCategoryStats.category],
            set: { total: sql`${userCategoryStats.total} + ${r.points}`, count: sql`${userCategoryStats.count} + 1` },
          }),
      );
    }
  }

  if (everyone) writes.push(
    db
      .insert(globalGameStats)
      .values({ id: 1, total: gamePoints, count: 1 })
      .onConflictDoUpdate({
        target: globalGameStats.id,
        set: { total: sql`${globalGameStats.total} + ${gamePoints}`, count: sql`${globalGameStats.count} + 1` },
      }),
  );

  if (game.userId) {
    const modeCounter =
      game.mode === 'daily'
        ? { dailyGames: sql`${users.dailyGames} + 1` }
        : { infiniteGames: sql`${users.infiniteGames} + 1` };
    writes.push(
      db
        .update(users)
        .set({ ...modeCounter, gamePointsTotal: sql`${users.gamePointsTotal} + ${gamePoints}` })
        .where(eq(users.id, game.userId)),
    );
  }

  await db.batch(writes as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return gamePoints;
}

/** The error's message and those of its causes: Drizzle wraps single queries' SQLite errors, but not batches'. */
export function errorText(err: unknown): string {
  const parts: string[] = [];
  for (let e = err as { message?: unknown; cause?: unknown } | undefined; e && parts.length < 5; e = e.cause as typeof e) {
    parts.push(String(e.message));
  }
  return parts.join(' | ');
}

/** Whether a write failed on a UNIQUE or PRIMARY KEY constraint (someone else got there first). */
export const isUniqueViolation = (err: unknown): boolean => /UNIQUE|PRIMARY KEY/i.test(errorText(err));
