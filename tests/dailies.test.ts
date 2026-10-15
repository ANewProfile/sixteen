import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Admin } from '../lib/admin';
import { readLog } from '../lib/admin';
import { addDaily, changeDaily, getDaily, idsOf, removeDaily, todaysDaily, upcomingDailies } from '../lib/dailies';
import type { Db } from '../lib/games';
import { daily, prompts, users } from '../lib/schema';
import { createTestDb } from './test-db';

/** A repeatable random number generator (mulberry32). */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let db: Db;
let cleanup: () => void;

const now = new Date('2026-10-14T15:00:00Z');
const boss: Admin = { id: 'boss', username: 'boss', role: 'supreme' };
const rh: Admin = { id: 'rh', username: 'rh', role: 'right_hand' };
const low: Admin = { id: 'low', username: 'low', role: 'lower' };

/** 6 answers → count score 2, so the rating is 0.8 + 0.6 × author score. Author 10 → 6.8. */
const prompt = (id: string, authorScore = 10) => ({
  id,
  category: Number(id[0]),
  text: `Prompt ${id}`,
  authorScore,
  answers: Array.from({ length: 6 }, (_, i) => ({ canonical: `Answer ${i}`, aliases: [] })),
});
const set = ['0Aaaaaaa', '1Aaaaaaa', '2Aaaaaaa', '3Aaaaaaa', '4Aaaaaaa'];
const other = ['5Aaaaaaa', '6Aaaaaaa', '7Aaaaaaa', '8Aaaaaaa', '9Aaaaaaa'];

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(users).values(['boss', 'rh', 'low'].map((id) => ({ id, username: id, displayName: id, passwordHash: 'x' })));
  await db.insert(prompts).values([...set, ...other].map((id) => prompt(id)));
  await db.insert(prompts).values([prompt('0Easy000', 16), prompt('1Hard000', 5)]);
});

afterEach(() => cleanup());

describe('todaysDaily', () => {
  it('uses the scheduled Daily if there is one', async () => {
    await db.insert(daily).values({ date: '2026-10-14', prompt1: set[0], prompt2: set[1], prompt3: set[2], prompt4: set[3], prompt5: set[4] });
    expect(await todaysDaily(db, now)).toEqual({ date: '2026-10-14', ids: set });
  });

  it('generates and stores one otherwise, the same for everyone', async () => {
    const first = await todaysDaily(db, now, seeded(3));
    const second = await todaysDaily(db, now, seeded(4));
    expect(second).toEqual(first);
    expect(idsOf((await getDaily(db, '2026-10-14'))!)).toEqual(first.ids);
  });

  it('gives two simultaneous first requests the same Daily', async () => {
    const [a, b] = await Promise.all([todaysDaily(db, now, seeded(1)), todaysDaily(db, now, seeded(2))]);
    expect(a).toEqual(b);
    expect(await db.select().from(daily).all()).toHaveLength(1);
  });
});

describe('admin Dailies', () => {
  it('lets any admin add a Daily on the earliest empty day from today', async () => {
    await db.insert(daily).values({ date: '2026-10-15', prompt1: set[0], prompt2: set[1], prompt3: set[2], prompt4: set[3], prompt5: set[4] });
    expect(await addDaily(db, low, other, now)).toBe('2026-10-14');
    expect(await addDaily(db, low, set, now)).toBe('2026-10-16');
    expect((await readLog(db)).map((e) => [e.action, e.dailyDate])).toEqual([
      ['daily_added', '2026-10-16'],
      ['daily_added', '2026-10-14'],
    ]);
  });

  it('holds admin Dailies to the 6–10 rules', async () => {
    await expect(addDaily(db, low, ['0Easy000', ...set.slice(0, 4)], now)).rejects.toThrow(/different categories/);
    await expect(addDaily(db, low, [...set.slice(0, 4), '0Aaaaaaa'], now)).rejects.toThrow(/twice/);
    await expect(addDaily(db, low, [...set.slice(0, 4), 'nope'], now)).rejects.toMatchObject({ status: 404 });
    // (4 × 6.8 + 3.8) / 5 = 6.2: inside 6–10, though a generated set would need 6.5.
    await expect(addDaily(db, low, ['0Easy000', ...set.slice(1, 4), '1Hard000'], now)).rejects.toThrow(/different categories/);
    expect(await addDaily(db, low, [...set.slice(0, 1), '1Hard000', ...set.slice(2)], now)).toBe('2026-10-14');
  });

  it('lets only supreme and right-hand admins change or remove future Dailies', async () => {
    const day = await addDaily(db, low, set, new Date('2026-10-13T12:00:00Z')); // 2026-10-13 (past now)
    await addDaily(db, low, set, now); // today
    const future = await addDaily(db, low, set, now); // tomorrow
    expect([day, future]).toEqual(['2026-10-13', '2026-10-15']);

    await expect(changeDaily(db, low, future, other, now)).rejects.toMatchObject({ status: 403 });
    await expect(changeDaily(db, rh, '2026-10-14', other, now)).rejects.toThrow(/only future/);
    await expect(removeDaily(db, boss, day, now)).rejects.toThrow(/only future/);

    await changeDaily(db, rh, future, other, now);
    expect(idsOf((await getDaily(db, future))!)).toEqual(other);
    await removeDaily(db, boss, future, now);
    expect(await getDaily(db, future)).toBeUndefined();
    await expect(removeDaily(db, boss, future, now)).rejects.toMatchObject({ status: 404 });
    expect((await readLog(db)).slice(0, 2).map((e) => e.action)).toEqual(['daily_removed', 'daily_changed']);
  });

  it('lists today’s and future Dailies with their difficulty', async () => {
    await addDaily(db, low, set, now);
    expect(await upcomingDailies(db, now)).toEqual([{ date: '2026-10-14', ids: set, difficulty: expect.closeTo(6.8, 5) }]);
  });
});
