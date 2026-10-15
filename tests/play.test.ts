import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../lib/games';
import { checkPrompt, dailySet, infiniteSet, recordPlayed } from '../lib/play';
import { daily, globalGameStats, prompts } from '../lib/schema';
import { createTestDb } from './test-db';

let db: Db;
let cleanup: () => void;

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(prompts).values({
    id: '0Abcdefg',
    category: 0,
    text: 'Countries bordering Bolivia',
    authorScore: 4,
    answers: ['Brazil', 'Peru', 'Chile', 'Argentina', 'Paraguay'].map((canonical) => ({ canonical, aliases: [] })),
  });
});

afterEach(() => cleanup());

describe('checkPrompt', () => {
  it('returns results, score and the answers once nothing needs a prompt', async () => {
    const res = await checkPrompt(db, { promptId: '0Abcdefg', entries: [['brazil'], ['peru'], ['ecuador']] });
    expect(res).toEqual({
      status: 'final',
      results: [{ result: 'hit', answer: 0 }, { result: 'hit', answer: 1 }, { result: 'miss' }],
      hits: 2,
      misses: 1,
      score: 1,
      answers: ['Brazil', 'Peru', 'Chile', 'Argentina', 'Paraguay'],
    });
  });

  it('accepts no guesses at all: 0 points, no misses, answers revealed', async () => {
    expect(await checkPrompt(db, { promptId: '0Abcdefg', entries: [] })).toEqual({
      status: 'final',
      results: [],
      hits: 0,
      misses: 0,
      score: 0,
      answers: ['Brazil', 'Peru', 'Chile', 'Argentina', 'Paraguay'],
    });
  });

  it('rejects unknown prompts and malformed requests', async () => {
    const bad = [
      undefined,
      { promptId: '0Abcdefg' },
      { promptId: '0Abcdefg', entries: [['a'], ['b'], ['c'], ['d'], ['e'], ['f']] },
      { promptId: '0Abcdefg', entries: [['a', 'b', 'c', 'd']] },
      { promptId: '0Abcdefg', entries: [['']] },
      { promptId: '0Abcdefg', entries: [['x'.repeat(101)]] },
      { promptId: '0Abcdefg', entries: [[42]] },
    ];
    for (const body of bad) await expect(checkPrompt(db, body)).rejects.toMatchObject({ status: 400 });
    await expect(checkPrompt(db, { promptId: '9Zzzzzzz', entries: [['a']] })).rejects.toMatchObject({ status: 404 });
  });
});

describe('sets for play', () => {
  beforeEach(async () => {
    await db.insert(prompts).values(
      [1, 2, 3, 4, 5].map((c) => ({
        id: `${c}Abcdefg`,
        category: c,
        text: `Prompt ${c}`,
        authorScore: 10,
        answers: Array.from({ length: 6 }, (_, i) => ({ canonical: `A${i}`, aliases: [] })),
      })),
    );
  });

  it('never sends answers', async () => {
    const set = await infiniteSet(db);
    expect(set.prompts).toHaveLength(5);
    expect(JSON.stringify(set)).not.toContain('A0');
    expect(Object.keys(set.prompts[0]).sort()).toEqual(['category', 'difficulty', 'id', 'note', 'text']);
  });

  it('gives the Daily its date', async () => {
    expect((await dailySet(db, new Date('2026-10-14T01:00:00Z'))).date).toBe('2026-10-14');
  });
});

describe('recordPlayed', () => {
  const now = new Date('2026-10-14T15:00:00Z');
  const ids = ['0Abcdefg', '1Abcdefg', '2Abcdefg', '3Abcdefg', '4Abcdefg'];
  const rounds = ids.map((promptId, i) => ({ promptId, correct: i, misses: 1 }));

  beforeEach(async () => {
    await db.insert(prompts).values(
      ids.slice(1).map((id) => ({
        id,
        category: Number(id[0]),
        text: id,
        authorScore: 8,
        answers: Array.from({ length: 6 }, (_, i) => ({ canonical: `A${i}`, aliases: [] })),
      })),
    );
    await db.insert(daily).values({ date: '2026-10-13', prompt1: ids[0], prompt2: ids[1], prompt3: ids[2], prompt4: ids[3], prompt5: ids[4] });
  });

  it('records an Infinite game and returns its points', async () => {
    // Points per round: 0−1, 1−1, 2−1, 4−1, 8−1 = 10.
    expect(await recordPlayed(db, { mode: 'infinite', rounds }, now)).toEqual({ points: 10 });
    expect(await db.select().from(globalGameStats).all()).toEqual([{ id: 1, total: 10, count: 1 }]);
  });

  it('records yesterday’s Daily for someone who crossed midnight, but not older ones', async () => {
    expect(await recordPlayed(db, { mode: 'daily', date: '2026-10-13', rounds }, now)).toEqual({ points: 10 });
    const later = new Date('2026-10-15T01:00:00Z');
    await expect(recordPlayed(db, { mode: 'daily', date: '2026-10-13', rounds }, later)).rejects.toThrow(/no longer open/);
  });

  it('refuses a Daily whose prompts don’t match', async () => {
    await db.insert(daily).values({ date: '2026-10-14', prompt1: ids[4], prompt2: ids[3], prompt3: ids[2], prompt4: ids[1], prompt5: '9Zzzzzzz' });
    await expect(recordPlayed(db, { mode: 'daily', date: '2026-10-14', rounds }, now)).rejects.toThrow(/aren’t the Daily/);
  });

  it('refuses impossible results', async () => {
    const bad = (change: object) => recordPlayed(db, { mode: 'infinite', rounds: [{ ...rounds[0], ...change }, ...rounds.slice(1)] }, now);
    await expect(bad({ correct: 4, misses: 2 })).rejects.toMatchObject({ status: 400 });
    await expect(bad({ correct: -1 })).rejects.toMatchObject({ status: 400 });
    await expect(bad({ correct: 1.5 })).rejects.toMatchObject({ status: 400 });
    await expect(bad({ promptId: '9Nope000' })).rejects.toMatchObject({ status: 404 });
    await expect(bad({ promptId: ids[1] })).rejects.toThrow(/twice/);
    await expect(recordPlayed(db, { mode: 'infinite', rounds: rounds.slice(0, 4) }, now)).rejects.toMatchObject({ status: 400 });
    await expect(recordPlayed(db, { mode: 'weekly', rounds }, now)).rejects.toMatchObject({ status: 400 });
    expect(await db.select().from(globalGameStats).all()).toEqual([]);
  });

  it('refuses more correct answers than the prompt has', async () => {
    await db.insert(prompts).values({ id: '5Small00', category: 5, text: 's', authorScore: 8, answers: Array.from({ length: 5 }, (_, i) => ({ canonical: `B${i}`, aliases: [] })) });
    const r = [{ promptId: '5Small00', correct: 5, misses: 0 }, ...rounds.slice(1)];
    expect(await recordPlayed(db, { mode: 'infinite', rounds: r }, now)).toMatchObject({ points: expect.any(Number) });
  });
});
