/* Player accounts: signing up, signing in and out, the profile, and deleting
 * an account. Admins sign in here like anyone else; none of this touches
 * their admin token.
 *
 * Each player has one sign-in token, stored as is so that every device they
 * sign in on can be handed the same one. It expires two months after it was
 * created, whichever device that was, and is checked on the server: the
 * cookie's own expiry is only a hint to the browser. A password change or
 * reset replaces it, which signs every other device out. */
import { eq } from 'drizzle-orm';
import { DUMMY_PASSWORD_HASH, MIN_PASSWORD_LENGTH, hashPassword, newToken, verifyPassword } from './auth';
import { errorText, isUniqueViolation, type Db } from './games';
import { clearFailures, lockedUntil, recordFailure } from './lockout';
import { userCategoryStats, users, type AdminRole } from './schema';

export const SESSION_DAYS = 60;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export interface Player {
  id: string;
  /** As the player typed it. */
  username: string;
  email: string | null;
  adminRole: AdminRole;
}

export interface Session {
  player: Player;
  token: string;
  expires: Date;
}

export class PlayerError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
  ) {
    super(message);
  }
}

/* ─────────────────────────────── usernames ─────────────────────────────── */

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 16;

/** Why a username isn't allowed, or null if it is: 2–16 of A–Z, a–z, 0–9, - and _, with at least one letter. */
export function usernameProblem(name: string): string | null {
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    return `usernames are ${USERNAME_MIN}–${USERNAME_MAX} characters`;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return 'usernames may only use letters, digits, - and _';
  if (!/[A-Za-z]/.test(name)) return 'usernames need at least one letter';
  return null;
}

/** What a username is stored and looked up as: Theo and theo are the same account. */
export const usernameKey = (name: string) => name.trim().toLowerCase();

function checkUsername(name: string) {
  const problem = usernameProblem(name);
  if (problem) throw new PlayerError(problem, 400);
}

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PlayerError(`passwords need at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }
}

/* ─────────────────────────────── sessions ─────────────────────────────── */

type UserRow = typeof users.$inferSelect;

const playerOf = (u: UserRow): Player => ({ id: u.id, username: u.displayName, email: u.email, adminRole: u.adminRole });

const expiresAt = (created: Date) => new Date(created.getTime() + SESSION_MS);

/** The player a token belongs to, or null if it is unknown, replaced, or more than two months old. */
export async function authenticatePlayer(db: Db, token: string | null | undefined, now = new Date()): Promise<Player | null> {
  if (!token) return null;
  const user = await db.select().from(users).where(eq(users.playerToken, token)).get();
  if (!user?.playerTokenCreatedAt || expiresAt(user.playerTokenCreatedAt) <= now) return null;
  return playerOf(user);
}

/** A new token, starting a fresh two months. Random 32 bytes never repeat in practice; the unique index backs that up. */
async function issuePlayerToken(db: Db, userId: string, now: Date): Promise<{ token: string; expires: Date }> {
  const token = newToken();
  await db.update(users).set({ playerToken: token, playerTokenCreatedAt: now }).where(eq(users.id, userId));
  return { token, expires: expiresAt(now) };
}

/** The current token if it still has time left, so this device expires with the others; otherwise a new one. */
async function sessionFor(db: Db, user: UserRow, now: Date): Promise<Session> {
  if (user.playerToken && user.playerTokenCreatedAt && expiresAt(user.playerTokenCreatedAt) > now) {
    return { player: playerOf(user), token: user.playerToken, expires: expiresAt(user.playerTokenCreatedAt) };
  }
  return { player: playerOf(user), ...(await issuePlayerToken(db, user.id, now)) };
}

const lockedMessage = (until: Date, now: Date) => {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  return `too many failed attempts; try again in ${minutes} minute${minutes === 1 ? '' : 's'}`;
};

/** Same lockout as the admin sign-in: five wrong passwords per IP + username lock that pair for 15 minutes. */
export async function signIn(db: Db, username: string, password: string, ip: string, now = new Date()): Promise<Session> {
  const locked = await lockedUntil(db, ip, username, now);
  if (locked) throw new PlayerError(lockedMessage(locked, now), 429);

  const user = await db.select().from(users).where(eq(users.username, usernameKey(username))).get();
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordOk) {
    const nowLocked = await recordFailure(db, ip, username, now);
    if (nowLocked) throw new PlayerError(lockedMessage(nowLocked, now), 429);
    throw new PlayerError('wrong username or password', 401);
  }
  await clearFailures(db, ip, username);
  return sessionFor(db, user, now);
}

/**
 * Creates an account and signs it in. The database's unique index on the
 * lower-cased username decides who gets a name, so two people signing up as
 * Theo and theo at the same moment can't both succeed.
 */
export async function signUp(
  db: Db, input: { username: string; password: string; email?: string | null }, now = new Date(),
): Promise<Session> {
  const displayName = input.username.trim();
  checkUsername(displayName);
  checkPassword(input.password);
  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) throw new PlayerError('that email address doesn’t look right', 400);

  const id = crypto.randomUUID();
  try {
    await db.insert(users).values({
      id, username: usernameKey(displayName), displayName, email, passwordHash: await hashPassword(input.password),
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const taken = errorText(err).includes('users.email') ? 'that email is already used by another account' : 'that username is taken';
    throw new PlayerError(taken, 409);
  }
  const user = (await db.select().from(users).where(eq(users.id, id)).get())!;
  return sessionFor(db, user, now);
}

/* ─────────────────────────────── profile ─────────────────────────────── */

async function checkOwnPassword(db: Db, player: Player, password: string): Promise<UserRow> {
  const user = await db.select().from(users).where(eq(users.id, player.id)).get();
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new PlayerError('your password is wrong', 403);
  return user;
}

/** Needs the password, since tokens are stored as is: a leaked token alone can't rename the account. */
export async function changeUsername(db: Db, player: Player, newName: string, password: string): Promise<Player> {
  const displayName = newName.trim();
  checkUsername(displayName);
  await checkOwnPassword(db, player, password);
  try {
    await db.update(users).set({ username: usernameKey(displayName), displayName }).where(eq(users.id, player.id));
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    throw new PlayerError('that username is taken', 409);
  }
  return { ...player, username: displayName };
}

/** Replaces the token, so every other device is signed out; this one gets the new token and a fresh two months. */
export async function changePassword(
  db: Db, player: Player, current: string, next: string, now = new Date(),
): Promise<Session> {
  checkPassword(next);
  await checkOwnPassword(db, player, current);
  const token = newToken();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), playerToken: token, playerTokenCreatedAt: now })
    .where(eq(users.id, player.id));
  return { player, token, expires: expiresAt(now) };
}

export interface PlayerStats {
  dailyGames: number;
  infiniteGames: number;
  /** Points per game across both modes; null before the first game. */
  pointsPerGame: number | null;
  /** Average points per prompt in each category played. */
  categories: { category: number; prompts: number; average: number }[];
}

export async function playerStats(db: Db, player: Player): Promise<PlayerStats> {
  const user = await db.select().from(users).where(eq(users.id, player.id)).get();
  if (!user) throw new PlayerError('this account no longer exists', 404);
  const games = user.dailyGames + user.infiniteGames;
  const rows = await db.select().from(userCategoryStats).where(eq(userCategoryStats.userId, player.id)).orderBy(userCategoryStats.category).all();
  return {
    dailyGames: user.dailyGames,
    infiniteGames: user.infiniteGames,
    pointsPerGame: games ? user.gamePointsTotal / games : null,
    categories: rows.filter((r) => r.count > 0).map((r) => ({ category: r.category, prompts: r.count, average: r.total / r.count })),
  };
}

/**
 * Deletes the account after the password and the username typed out again.
 * Their stats go with it; the global and prompt stats they fed stay. Supreme
 * leaders can't delete theirs (that role is only ever changed in Turso).
 */
export async function deleteAccount(db: Db, player: Player, password: string, typedUsername: string): Promise<void> {
  const user = await checkOwnPassword(db, player, password);
  if (usernameKey(typedUsername) !== user.username) throw new PlayerError('type your username to confirm', 400);
  if (user.adminRole === 'supreme') throw new PlayerError('supreme leaders can’t delete their accounts', 403);
  await db.delete(users).where(eq(users.id, player.id));
}
