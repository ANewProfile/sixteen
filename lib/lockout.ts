/* Login lockout, shared by admin and player login.
 *
 * Failures are counted per IP address *and* username, so one person mistyping
 * on a shared network (a school, say) never locks anyone else out. The
 * username is counted as typed (lower-cased) even when no such account exists,
 * so a lockout doesn't reveal which usernames are real. */
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './games';
import { loginFailures } from './schema';

export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

const key = (ip: string, username: string) =>
  and(eq(loginFailures.ip, ip), eq(loginFailures.username, username.trim().toLowerCase()));

/** When this IP may next try this username, or null if it may try now. An expired lock is cleared. */
export async function lockedUntil(db: Db, ip: string, username: string, now = new Date()): Promise<Date | null> {
  const row = await db.select({ lockedUntil: loginFailures.lockedUntil }).from(loginFailures).where(key(ip, username)).get();
  if (!row?.lockedUntil) return null;
  if (row.lockedUntil > now) return row.lockedUntil;
  // The 15 minutes are up: the count starts again from zero.
  await db.delete(loginFailures).where(key(ip, username));
  return null;
}

/** Counts one failure; the fifth locks the pair. Returns the lock's end if this failure caused one. */
export async function recordFailure(db: Db, ip: string, username: string, now = new Date()): Promise<Date | null> {
  const until = new Date(now.getTime() + LOCKOUT_MS);
  const row = await db
    .insert(loginFailures)
    .values({ ip, username: username.trim().toLowerCase(), count: 1 })
    .onConflictDoUpdate({
      target: [loginFailures.ip, loginFailures.username],
      // One statement, so two failures arriving together can't both read the old count.
      set: {
        count: sql`${loginFailures.count} + 1`,
        lockedUntil: sql`CASE WHEN ${loginFailures.count} + 1 >= ${MAX_FAILURES} THEN ${Math.floor(until.getTime() / 1000)} ELSE NULL END`,
      },
    })
    .returning({ lockedUntil: loginFailures.lockedUntil })
    .get();
  return row.lockedUntil;
}

/** A successful login wipes the count for that IP and username. */
export async function clearFailures(db: Db, ip: string, username: string): Promise<void> {
  await db.delete(loginFailures).where(key(ip, username));
}
