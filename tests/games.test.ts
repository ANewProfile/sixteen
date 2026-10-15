import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { recordGame, type Db, type GameResult } from '../lib/games';
import * as schema from '../lib/schema';
import { createTestDb } from './test-db';

const { prompts, users, userCategoryStats, globalCategoryStats, globalGameStats } = schema;

let db: Db;
let cleanup: () => void;

const answers = Array.from({ length: 6 }, (_, i) => ({ canonical: `A${i}`, aliases: [] }));
const promptIds = ['0aaaaaaa', '1aaaaaaa', '2aaaaaaa', '3aaaaaaa', '4aaaaaaa'];

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(prompts).values(
    promptIds.map((id) => ({ id, category: Number(id[0]), text: `Prompt ${id}`, authorScore: 8, answers })),
  );
  await db.insert(users).values({ id: 'u1', username: 'theo', displayName: 'Theo', email: 't@example.com', passwordHash: 'x' });
});

afterEach(() => cleanup());

// Scores 16, 8, 2, -1, 0 → 25 points.
const game = (overrides: Partial<GameResult> = {}): GameResult => ({
  mode: 'daily',
  userId: null,
  rounds: [
    { promptId: promptIds[0], correct: 5, misses: 0 },
    { promptId: promptIds[1], correct: 4, misses: 0 },
    { promptId: promptIds[2], correct: 3, misses: 2 },
    { promptId: promptIds[3], correct: 0, misses: 1 },
    { promptId: promptIds[4], correct: 0, misses: 0 },
  ],
  ...overrides,
});

describe('recordGame', () => {
  it('returns the game total and updates prompt and global stats for a guest', async () => {
    expect(await recordGame(db, game())).toBe(25);

    const p0 = await db.select().from(prompts).where(eq(prompts.id, promptIds[0])).get();
    const p3 = await db.select().from(prompts).where(eq(prompts.id, promptIds[3])).get();
    expect([p0?.playTotal, p0?.playCount]).toEqual([16, 1]);
    expect([p3?.playTotal, p3?.playCount]).toEqual([-1, 1]);

    const global = await db.select().from(globalGameStats).get();
    expect([global?.total, global?.count]).toEqual([25, 1]);
    expect(await db.select().from(globalCategoryStats)).toHaveLength(5);

    expect(await db.select().from(userCategoryStats)).toHaveLength(0);
    const user = await db.select().from(users).get();
    expect([user?.dailyGames, user?.gamePointsTotal]).toEqual([0, 0]);
  });

  it('also updates the signed-in player’s stats and mode counter', async () => {
    await recordGame(db, game({ userId: 'u1' }));
    await recordGame(db, game({ userId: 'u1', mode: 'infinite' }));

    const user = await db.select().from(users).get();
    expect([user?.dailyGames, user?.infiniteGames, user?.gamePointsTotal]).toEqual([1, 1, 50]);

    const geo = await db.select().from(userCategoryStats).where(eq(userCategoryStats.category, 0)).get();
    expect([geo?.total, geo?.count]).toEqual([32, 2]);
  });

  it('keeps every result when games finish at the same time', async () => {
    await Promise.all(Array.from({ length: 10 }, () => recordGame(db, game())));
    const global = await db.select().from(globalGameStats).get();
    expect([global?.total, global?.count]).toEqual([250, 10]);
    const p0 = await db.select().from(prompts).where(eq(prompts.id, promptIds[0])).get();
    expect(p0?.playCount).toBe(10);
  });

  it('saves nothing if the batch fails partway', async () => {
    // A global_game_stats whose CHECK rejects positive totals makes the batch fail near its end,
    // after the prompt and category updates have already run.
    await db.run(sql`DROP TABLE global_game_stats`);
    await db.run(sql`CREATE TABLE global_game_stats (id integer PRIMARY KEY, total integer NOT NULL DEFAULT 0, count integer NOT NULL DEFAULT 0, CHECK (total < 0))`);
    await expect(recordGame(db, game())).rejects.toThrow();

    const p0 = await db.select().from(prompts).where(eq(prompts.id, promptIds[0])).get();
    expect(p0?.playCount).toBe(0);
    expect(await db.select().from(globalCategoryStats)).toHaveLength(0);
  });

  it('saves nothing if any round refers to an unknown prompt', async () => {
    const bad = game();
    bad.rounds[4] = { promptId: '9zzzzzzz', correct: 1, misses: 0 };
    await expect(recordGame(db, bad)).rejects.toThrow(/unknown prompt/);

    const p0 = await db.select().from(prompts).where(eq(prompts.id, promptIds[0])).get();
    expect(p0?.playCount).toBe(0);
    expect(await db.select().from(globalGameStats)).toHaveLength(0);
  });

  it('rejects games without exactly five rounds', async () => {
    await expect(recordGame(db, game({ rounds: game().rounds.slice(0, 4) }))).rejects.toThrow(RangeError);
  });
});

describe('database constraints', () => {
  const row = { id: '5bbbbbbb', category: 5, text: 'x', authorScore: 8, answers };

  it('reject rows the code-level checks would also reject', async () => {
    await expect(db.insert(prompts).values({ ...row, answers: answers.slice(0, 4) })).rejects.toThrow();
    await expect(db.insert(prompts).values({ ...row, category: 6 })).rejects.toThrow();
    await expect(db.insert(prompts).values({ ...row, id: '5bbb!bbb' })).rejects.toThrow();
    await expect(db.insert(prompts).values({ ...row, authorScore: 20 })).rejects.toThrow();
    await expect(db.insert(prompts).values(row)).resolves.toBeDefined();
  });
});
