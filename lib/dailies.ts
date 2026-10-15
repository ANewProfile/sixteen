/* The Daily schedule.
 *
 * Any admin can add a Daily; it goes to the earliest day (from today) without
 * one. Supreme and right-hand admins can change or remove a future Daily, never
 * today's or a past one. Admin Dailies follow the set rules with a 6–10 range.
 * A day nobody scheduled gets a generated set the first time it's asked for,
 * and that set is the Daily for everyone that day. */
import { eq, gte } from 'drizzle-orm';
import { AdminError, pruneLog, type Admin } from './admin';
import { addDays, utcDay } from './dates';
import type { Db } from './games';
import { adminLog, daily, DAILY_SLOTS } from './schema';
import { ADMIN_DAILY_RANGE, drawSet, ratedPrompts, setDifficulty, setProblem, type Rated } from './sets';

type DailyRow = typeof daily.$inferSelect;

export const idsOf = (row: DailyRow): string[] => DAILY_SLOTS.map((slot) => row[slot]);
const rowOf = (date: string, ids: string[]): DailyRow => ({
  date, prompt1: ids[0], prompt2: ids[1], prompt3: ids[2], prompt4: ids[3], prompt5: ids[4],
});

export const getDaily = (db: Db, date: string) => db.select().from(daily).where(eq(daily.date, date)).get();

/**
 * Today's Daily, generating it if nobody scheduled one. Two requests at once
 * may both generate a set, but "insert unless the day already has one" lets
 * only the first in, and both then read back that same row.
 */
export async function todaysDaily(db: Db, now = new Date(), random = Math.random): Promise<{ date: string; ids: string[] }> {
  const date = utcDay(now);
  const existing = await getDaily(db, date);
  if (existing) return { date, ids: idsOf(existing) };
  const set = drawSet(await ratedPrompts(db), random);
  await db.insert(daily).values(rowOf(date, set.map((p) => p.id))).onConflictDoNothing();
  return { date, ids: idsOf((await getDaily(db, date))!) };
}

export const canChangeDailies = (admin: Admin) => admin.role === 'supreme' || admin.role === 'right_hand';

/** Checks a hand-picked set against the rules and returns it with ratings. */
async function checkSet(db: Db, ids: unknown): Promise<Rated[]> {
  if (!Array.isArray(ids) || ids.length !== DAILY_SLOTS.length || !ids.every((id) => typeof id === 'string')) {
    throw new AdminError(`give ${DAILY_SLOTS.length} prompt ids`, 400);
  }
  const rated = new Map((await ratedPrompts(db)).map((p) => [p.id, p]));
  const missing = ids.filter((id) => !rated.has(id.trim()));
  if (missing.length) throw new AdminError(`no prompt ${missing.join(', ')}`, 404);
  const set = ids.map((id) => rated.get(id.trim())!);
  const problem = setProblem(set, ADMIN_DAILY_RANGE);
  if (problem) throw new AdminError(problem, 400);
  return set;
}

/** Adds a Daily on the earliest day from today that doesn't have one, and returns that day. */
export async function addDaily(db: Db, actor: Admin, ids: unknown, now = new Date()): Promise<string> {
  const set = await checkSet(db, ids);
  const today = utcDay(now);
  // Another admin adding at the same moment can take the day we found; then look again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const taken = new Set((await db.select({ date: daily.date }).from(daily).where(gte(daily.date, today)).all()).map((d) => d.date));
    let date = today;
    while (taken.has(date)) date = addDays(date, 1);
    try {
      await db.batch([
        db.insert(daily).values(rowOf(date, set.map((p) => p.id))),
        db.insert(adminLog).values({ actorId: actor.id, action: 'daily_added', dailyDate: date, createdAt: now }),
        pruneLog(db, now),
      ]);
      return date;
    } catch (err) {
      if (!/UNIQUE|PRIMARY KEY/i.test(String((err as Error).message))) throw err;
    }
  }
  throw new AdminError('the schedule kept changing while adding; try again', 400);
}

async function futureDaily(db: Db, actor: Admin, date: string, now: Date) {
  if (!canChangeDailies(actor)) throw new AdminError('only supreme leaders and right-hand admins can change Dailies', 403);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AdminError('date must be YYYY-MM-DD', 400);
  if (date <= utcDay(now)) throw new AdminError('only future Dailies can be changed; today’s and past ones are fixed', 400);
  if (!(await getDaily(db, date))) throw new AdminError(`there is no Daily for ${date}`, 404);
}

export async function changeDaily(db: Db, actor: Admin, date: string, ids: unknown, now = new Date()): Promise<void> {
  await futureDaily(db, actor, date, now);
  const set = await checkSet(db, ids);
  await db.batch([
    db.update(daily).set(rowOf(date, set.map((p) => p.id))).where(eq(daily.date, date)),
    db.insert(adminLog).values({ actorId: actor.id, action: 'daily_changed', dailyDate: date, createdAt: now }),
    pruneLog(db, now),
  ]);
}

/** Leaves the day empty: the next added Daily fills it, or one is generated on the day. */
export async function removeDaily(db: Db, actor: Admin, date: string, now = new Date()): Promise<void> {
  await futureDaily(db, actor, date, now);
  await db.batch([
    db.delete(daily).where(eq(daily.date, date)),
    db.insert(adminLog).values({ actorId: actor.id, action: 'daily_removed', dailyDate: date, createdAt: now }),
    pruneLog(db, now),
  ]);
}

/** Today's and future Dailies with their difficulty, for the admin page. */
export async function upcomingDailies(db: Db, now = new Date()) {
  const rated = new Map((await ratedPrompts(db)).map((p) => [p.id, p]));
  const rows = await db.select().from(daily).where(gte(daily.date, utcDay(now))).orderBy(daily.date).all();
  return rows.map((row) => {
    const ids = idsOf(row);
    const set = ids.map((id) => rated.get(id)).filter((p): p is Rated => !!p);
    return { date: row.date, ids, difficulty: set.length === ids.length ? setDifficulty(set) : null };
  });
}

