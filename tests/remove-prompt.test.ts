import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { readLog, removePrompt, type Admin } from '../lib/admin';
import type { Db } from '../lib/games';
import { adminLog, daily, globalCategoryStats, prompts, userCategoryStats, users } from '../lib/schema';
import { createTestDb } from './test-db';

let db: Db;
let cleanup: () => void;

const now = new Date('2026-10-14T15:00:00Z');
const boss: Admin = { id: 'boss', username: 'boss', role: 'supreme' };
const rh: Admin = { id: 'rh', username: 'rh', role: 'right_hand' };
const low: Admin = { id: 'low', username: 'low', role: 'lower' };

/** 6 answers → count score 2; with author score a, the rating is 0.4·2 + 0.6·a. */
const prompt = (id: string, authorScore = 5, extra = {}) => ({
  id,
  category: Number(id[0]),
  text: `Prompt ${id}`,
  authorScore,
  answers: Array.from({ length: 6 }, (_, i) => ({ canonical: `Answer ${i}`, aliases: [] })),
  ...extra,
});

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(users).values(['boss', 'rh', 'low'].map((id) => ({ id, username: id, displayName: id, passwordHash: 'x' })));
  await db.insert(prompts).values([
    prompt('0Gone000'),
    prompt('0Close00', 6), // 4.4 vs 3.8: within 1
    prompt('0Far0000', 7), // 5.0 vs 3.8: too far
    prompt('0Other00'),
    prompt('1Wrong00'), // other category
    prompt('0Filler1'),
    prompt('0Filler2'),
    prompt('0Filler3'),
  ]);
  await db.insert(userCategoryStats).values({ userId: 'low', category: 0, total: 12, count: 3 });
  await db.insert(globalCategoryStats).values({ category: 0, total: 40, count: 9 });
});

afterEach(() => cleanup());

const day = (date: string, ids: string[]) => ({
  date, prompt1: ids[0], prompt2: ids[1], prompt3: ids[2], prompt4: ids[3], prompt5: ids[4],
});
const fillers = ['0Filler1', '0Filler2', '0Filler3'];

describe('removePrompt', () => {
  it('lets only supreme and right-hand admins remove prompts', async () => {
    await expect(removePrompt(db, low, '0Gone000', null, now)).rejects.toMatchObject({ status: 403 });
    await removePrompt(db, rh, '0Gone000', null, now);
    expect(await db.select().from(prompts).where(eq(prompts.id, '0Gone000')).get()).toBeUndefined();
  });

  it('rejects unknown ids', async () => {
    await expect(removePrompt(db, boss, '0Nope000', null, now)).rejects.toMatchObject({ status: 404 });
  });

  it('never removes a prompt in today’s Daily, even with a replacement', async () => {
    await db.insert(daily).values(day('2026-10-14', ['0Gone000', ...fillers, '0Other00']));
    await expect(removePrompt(db, boss, '0Gone000', '0Close00', now)).rejects.toMatchObject({ status: 400 });
    await expect(removePrompt(db, boss, '0Gone000', null, now)).rejects.toThrow(/today/);
  });

  it('requires a replacement for future Dailies, swaps it in, and leaves past Dailies alone', async () => {
    await db.insert(daily).values([
      day('2026-10-01', ['0Gone000', ...fillers, '0Other00']),
      day('2026-10-20', [...fillers, '0Gone000', '0Other00']),
      day('2026-11-02', ['0Other00', '0Gone000', ...fillers]),
    ]);
    await expect(removePrompt(db, boss, '0Gone000', null, now)).rejects.toThrow(/2 future Dailies/);
    expect(await removePrompt(db, boss, '0Gone000', '0Close00', now)).toEqual({ replacedIn: ['2026-10-20', '2026-11-02'] });
    const days = await db.select().from(daily).orderBy(daily.date).all();
    expect(days.map((d) => [d.prompt1, d.prompt4, d.prompt2])).toEqual([
      ['0Gone000', '0Filler3', '0Filler1'], // past: untouched, pointing at the removed id
      ['0Filler1', '0Close00', '0Filler2'],
      ['0Other00', '0Filler2', '0Close00'],
    ]);
  });

  it('refuses a replacement when no future Daily needs one', async () => {
    await expect(removePrompt(db, boss, '0Gone000', '0Close00', now)).rejects.toThrow(/doesn’t need a replacement/);
  });

  it('checks every replacement rule', async () => {
    await db.insert(daily).values(day('2026-10-20', ['0Gone000', ...fillers, '0Other00']));
    const attempt = (replacement: string) => removePrompt(db, boss, '0Gone000', replacement, now);
    await expect(attempt('0Gone000')).rejects.toThrow(/can’t replace itself/);
    await expect(attempt('0Nope000')).rejects.toMatchObject({ status: 404 });
    await expect(attempt('1Wrong00')).rejects.toThrow(/same category/);
    await expect(attempt('0Other00')).rejects.toThrow(/already in the Daily for 2026-10-20/);
    await expect(attempt('0Far0000')).rejects.toThrow(/within 1 point/);
    expect(await db.select().from(prompts).where(eq(prompts.id, '0Gone000')).get()).toBeDefined();
  });

  it('compares current difficulty, including player results once there are enough', async () => {
    // 10 plays averaging 9.6 points: 0.25·4.4 + 0.75·9.6 = 8.3, far from 0Gone000's 3.8.
    await db.update(prompts).set({ playCount: 10, playTotal: 96 }).where(eq(prompts.id, '0Close00'));
    await db.insert(daily).values(day('2026-10-20', ['0Gone000', ...fillers, '0Other00']));
    await expect(removePrompt(db, boss, '0Gone000', '0Close00', now)).rejects.toThrow(/within 1 point/);
  });

  it('logs the removed id, and the replacement only when there is one', async () => {
    await removePrompt(db, boss, '0Other00', null, now);
    await db.insert(daily).values(day('2026-10-20', ['0Gone000', ...fillers, '0Far0000']));
    await removePrompt(db, rh, '0Gone000', '0Close00', new Date(now.getTime() + 1000));
    expect(await readLog(db)).toMatchObject([
      { actor: 'rh', action: 'prompt_removed', promptId: '0Gone000', replacementId: '0Close00' },
      { actor: 'boss', action: 'prompt_removed', promptId: '0Other00', replacementId: null },
    ]);
    expect(await db.select().from(adminLog).all()).toHaveLength(2);
  });

  it('leaves player and global stats untouched', async () => {
    await removePrompt(db, boss, '0Gone000', null, now);
    expect(await db.select().from(userCategoryStats).all()).toEqual([{ userId: 'low', category: 0, total: 12, count: 3 }]);
    expect(await db.select().from(globalCategoryStats).all()).toEqual([{ category: 0, total: 40, count: 9 }]);
  });
});
