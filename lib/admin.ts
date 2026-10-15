/* Who may do what in the admin system, and the actions themselves.
 *
 * Every request is authenticated by looking its token up and reading the
 * admin's role as it is *now*, so a demotion or removal takes effect on the
 * very next request. Route handlers stay thin: they call these functions. */
import { and, desc, eq, gt, lt, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BatchItem } from 'drizzle-orm/batch';
import {
  DUMMY_PASSWORD_HASH, MIN_PASSWORD_LENGTH, hashPassword, hashToken, newTemporaryPassword, newToken, verifyPassword,
} from './auth';
import { isCategoryId } from './categories';
import { utcDay } from './dates';
import type { Db } from './games';
import { clearFailures, lockedUntil, recordFailure } from './lockout';
import { usernameKey } from './players';
import { currentRating, generatePromptId, validatePrompt, type NewPrompt } from './prompts';
import {
  ADMIN_ROLES, DAILY_SLOTS, adminLog, daily, prompts, users, type AdminRole, type Answer, type LogAction,
} from './schema';

export interface Admin {
  id: string;
  username: string;
  role: Exclude<AdminRole, 'none'>;
}

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 429,
  ) {
    super(message);
  }
}

/* ─────────────────────────────── permissions ─────────────────────────────── */

/**
 * Supreme: any role change among none / lower / right-hand, for anyone who isn't supreme.
 * Right-hand: add or remove lower admins (none ↔ lower) only.
 * Lower: no admin management. Nobody grants or removes supreme; that happens in Turso.
 */
export function canChangeRole(actor: AdminRole, targetCurrent: AdminRole, targetNew: AdminRole): boolean {
  if (targetCurrent === 'supreme' || targetNew === 'supreme' || targetCurrent === targetNew) return false;
  if (actor === 'supreme') return true;
  if (actor === 'right_hand') {
    const managed: AdminRole[] = ['none', 'lower'];
    return managed.includes(targetCurrent) && managed.includes(targetNew);
  }
  return false;
}

/* ─────────────────────────────── sessions ─────────────────────────────── */

/** The admin a token belongs to, or null if it is unknown, rotated, or its owner is no longer an admin. */
export async function authenticate(db: Db, token: string | null | undefined): Promise<Admin | null> {
  if (!token) return null;
  const user = await db
    .select({ id: users.id, username: users.displayName, role: users.adminRole })
    .from(users)
    .where(eq(users.tokenHash, hashToken(token)))
    .get();
  if (!user || user.role === 'none') return null;
  return { id: user.id, username: user.username, role: user.role };
}

export async function requireAdmin(db: Db, token: string | null | undefined): Promise<Admin> {
  const admin = await authenticate(db, token);
  if (!admin) throw new AdminError('not signed in as an admin', 401);
  return admin;
}

async function issueToken(db: Db, userId: string): Promise<string> {
  const token = newToken();
  await db.update(users).set({ tokenHash: hashToken(token), tokenCreatedAt: new Date() }).where(eq(users.id, userId));
  return token;
}

const minutesLeft = (until: Date, now: Date) => Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
const lockedMessage = (until: Date, now: Date) =>
  `too many failed attempts; try again in ${minutesLeft(until, now)} minute${minutesLeft(until, now) === 1 ? '' : 's'}`;

/**
 * Checks the password and, for admins, replaces their one token with a fresh
 * one, so whatever token their scripts held stops working.
 *
 * A wrong password gets the same message whether or not the username exists,
 * and counts toward the IP + username lockout. Only someone who knows the
 * password learns that the account isn't (or is no longer) an admin.
 */
export async function login(
  db: Db, username: string, password: string, ip: string, now = new Date(),
): Promise<{ admin: Admin; token: string }> {
  const locked = await lockedUntil(db, ip, username, now);
  if (locked) throw new AdminError(lockedMessage(locked, now), 429);

  const user = await db.select().from(users).where(eq(users.username, usernameKey(username))).get();
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordOk) {
    const nowLocked = await recordFailure(db, ip, username, now);
    if (nowLocked) throw new AdminError(lockedMessage(nowLocked, now), 429);
    throw new AdminError('wrong username or password', 401);
  }
  await clearFailures(db, ip, username);

  if (user.adminRole === 'none') {
    throw new AdminError(
      (await wasRemoved(db, user.id)) ? 'your admin access has been revoked' : 'this account doesn’t have admin access',
      403,
    );
  }
  const token = await issueToken(db, user.id);
  return { admin: { id: user.id, username: user.displayName, role: user.adminRole }, token };
}

/** Whether the log still holds this user's removal. The log only reaches back about 30 days. */
async function wasRemoved(db: Db, userId: string): Promise<boolean> {
  const row = await db
    .select({ id: adminLog.id })
    .from(adminLog)
    .where(and(eq(adminLog.action, 'role_changed'), eq(adminLog.targetUserId, userId), eq(adminLog.toRole, 'none')))
    .get();
  return !!row;
}

/** An admin replacing their own token, e.g. after it leaked. */
export const regenerateOwnToken = (db: Db, admin: Admin): Promise<string> => issueToken(db, admin.id);

/** Admins manage each other by username, which is what they know each other by (capitalization aside). */
async function findTarget(db: Db, username: string) {
  const target = await db.select({ id: users.id, role: users.adminRole }).from(users).where(eq(users.username, usernameKey(username))).get();
  if (!target) throw new AdminError(`no user named ${username}`, 404);
  return target;
}

/* ─────────────────────────────── log ─────────────────────────────── */

export const LOG_RETENTION_DAYS = 30;

/**
 * Every log write also deletes entries older than 30 days, in the same batch.
 * No scheduled job is needed: with regular activity the log covers roughly the
 * last 30 days, and it can run a little longer but never shorter.
 */
export function pruneLog(db: Db, now: Date) {
  const cutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return db.delete(adminLog).where(lt(adminLog.createdAt, cutoff));
}

export interface LogEntry {
  id: number;
  at: Date;
  actor: string | null;
  action: LogAction;
  count: number | null;
  target: string | null;
  fromRole: AdminRole | null;
  toRole: AdminRole | null;
  promptId: string | null;
  replacementId: string | null;
  dailyDate: string | null;
}

const actorUser = alias(users, 'actor');
const targetUser = alias(users, 'target');

function logQuery(db: Db) {
  return db
    .select({
      id: adminLog.id,
      at: adminLog.createdAt,
      actor: actorUser.displayName,
      action: adminLog.action,
      count: adminLog.count,
      target: targetUser.displayName,
      fromRole: adminLog.fromRole,
      toRole: adminLog.toRole,
      promptId: adminLog.promptId,
      replacementId: adminLog.replacementId,
      dailyDate: adminLog.dailyDate,
    })
    .from(adminLog)
    .leftJoin(actorUser, eq(adminLog.actorId, actorUser.id))
    .leftJoin(targetUser, eq(adminLog.targetUserId, targetUser.id));
}

/** The whole log, newest first. Every admin may read it. */
export const readLog = (db: Db): Promise<LogEntry[]> => logQuery(db).orderBy(desc(adminLog.createdAt), desc(adminLog.id)).all();

/** Notifications are not stored: they are the log's role changes for this admin, newest first. */
export const readNotifications = (db: Db, admin: Admin): Promise<LogEntry[]> =>
  logQuery(db)
    .where(and(eq(adminLog.action, 'role_changed'), eq(adminLog.targetUserId, admin.id)))
    .orderBy(desc(adminLog.createdAt), desc(adminLog.id))
    .all();

/** Everyone who is currently an admin, for the role-management screen. */
export const listAdmins = (db: Db): Promise<{ username: string; role: AdminRole }[]> =>
  db.select({ username: users.displayName, role: users.adminRole }).from(users).where(ne(users.adminRole, 'none')).orderBy(users.username).all();

/* ─────────────────────────────── roles ─────────────────────────────── */

export async function changeRole(
  db: Db, actor: Admin, targetUsername: string, newRole: AdminRole, now = new Date(),
): Promise<void> {
  if (!ADMIN_ROLES.includes(newRole)) throw new AdminError(`unknown role ${newRole}`, 400);
  const target = await findTarget(db, targetUsername);
  if (!canChangeRole(actor.role, target.role, newRole)) {
    throw new AdminError(`you cannot change this user from ${target.role} to ${newRole}`, 403);
  }
  // Removing someone as an admin also deletes their token.
  const tokenReset = newRole === 'none' ? { tokenHash: null, tokenCreatedAt: null } : {};
  await db.batch([
    db.update(users).set({ adminRole: newRole, ...tokenReset }).where(eq(users.id, target.id)),
    db.insert(adminLog).values({
      actorId: actor.id,
      action: 'role_changed',
      targetUserId: target.id,
      fromRole: target.role,
      toRole: newRole,
      createdAt: now,
    }),
    pruneLog(db, now),
  ]);
}

/* ─────────────────────────────── passwords ─────────────────────────────── */

/**
 * A supreme leader gives anyone else a new, generated password, shown once to
 * pass on. It stays their password until they change it. The reset is logged
 * (never the password), and any admin token they had stops working, as do
 * their player sign-ins on every device.
 */
export async function resetPassword(db: Db, actor: Admin, targetUsername: string, now = new Date()): Promise<string> {
  if (actor.role !== 'supreme') throw new AdminError('only supreme leaders can reset passwords', 403);
  const target = await findTarget(db, targetUsername);
  if (target.id === actor.id) throw new AdminError('change your own password from the dashboard instead', 400);
  const password = newTemporaryPassword();
  await db.batch([
    db.update(users).set({
      passwordHash: await hashPassword(password), tokenHash: null, tokenCreatedAt: null, playerToken: null, playerTokenCreatedAt: null,
    }).where(eq(users.id, target.id)),
    db.insert(adminLog).values({ actorId: actor.id, action: 'password_reset', targetUserId: target.id, createdAt: now }),
    pruneLog(db, now),
  ]);
  return password;
}

/**
 * Needs the current password, so an unattended signed-in browser can't be used to take the account.
 * Player sign-ins end on every device, this browser's included (sign in again to play); the admin token is kept.
 */
export async function changeOwnPassword(db: Db, admin: Admin, current: string, next: string): Promise<void> {
  if (next.length < MIN_PASSWORD_LENGTH) {
    throw new AdminError(`the new password needs at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }
  const row = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, admin.id)).get();
  if (!row || !(await verifyPassword(current, row.passwordHash))) throw new AdminError('your current password is wrong', 403);
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), playerToken: null, playerTokenCreatedAt: null })
    .where(eq(users.id, admin.id));
}

/* ─────────────────────────────── prompts ─────────────────────────────── */

export interface PromptUpload {
  category: number;
  text: string;
  note?: string | null;
  authorScore: number;
  answers: Answer[];
}

export interface UploadResult {
  added: { index: number; id: string }[];
  failed: { index: number; errors: string[] }[];
  message: string;
}

/** Shape checks for untrusted JSON, before the prompt rules run. */
function shapeErrors(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return ['not a prompt object'];
  const p = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof p.category !== 'number') errors.push('category must be a number');
  if (typeof p.text !== 'string') errors.push('text must be a string');
  if (p.note !== undefined && p.note !== null && typeof p.note !== 'string') errors.push('note must be a string');
  if (typeof p.authorScore !== 'number') errors.push('authorScore must be a number');
  const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  const answersOk =
    Array.isArray(p.answers) &&
    p.answers.every((raw) => {
      if (typeof raw !== 'object' || raw === null) return false;
      const a = raw as Record<string, unknown>;
      return (
        typeof a.canonical === 'string' &&
        strings(a.aliases) &&
        (a.prompts === undefined || strings(a.prompts)) &&
        (a.ask === undefined || typeof a.ask === 'string') &&
        (a.rejects === undefined || strings(a.rejects))
      );
    });
  if (!answersOk) errors.push('answers must be a list of { canonical, aliases[], prompts?[], ask?, rejects?[] }');
  return errors;
}

/** Keeps only the known fields, trimmed, and drops empty entries so stored answers stay tidy. */
function cleanAnswer(a: Answer): Answer {
  const list = (xs: string[] | undefined) => (xs ?? []).map((x) => x.trim()).filter(Boolean);
  const prompts = list(a.prompts);
  const rejects = list(a.rejects);
  const ask = a.ask?.trim();
  return {
    canonical: a.canonical.trim(),
    aliases: list(a.aliases),
    ...(prompts.length && { prompts }),
    ...(prompts.length && ask && { ask }),
    ...(rejects.length && { rejects }),
  };
}

function uploadMessage(added: number, failed: number): string {
  if (failed === 0) return `${added} prompt${added === 1 ? '' : 's'} added.`;
  const failedPart = `${failed} prompt${failed === 1 ? '' : 's'} failed and ${failed === 1 ? 'was' : 'were'} not added; see the errors below.`;
  if (added === 0) return `Nothing was added. ${failedPart}`;
  return `${added} prompt${added === 1 ? ' was' : 's were'} added successfully. Do not upload ${added === 1 ? 'it' : 'them'} again. ${failedPart}`;
}

/**
 * Adds every valid prompt in the list and reports the rest. Valid prompts go
 * in even if others fail. The log records how many each admin added and one
 * entry per failed prompt, without its content.
 */
export async function addPrompts(db: Db, actor: Admin, upload: unknown, now = new Date()): Promise<UploadResult> {
  if (!Array.isArray(upload) || upload.length === 0) {
    throw new AdminError('send a list of one or more prompts', 400);
  }

  const claimed = new Set<string>();
  const isTaken = async (id: string) =>
    claimed.has(id) || !!(await db.select({ id: prompts.id }).from(prompts).where(eq(prompts.id, id)).get());

  const valid: { index: number; prompt: NewPrompt }[] = [];
  const failed: UploadResult['failed'] = [];

  for (const [index, raw] of upload.entries()) {
    const shape = shapeErrors(raw);
    if (shape.length) {
      failed.push({ index, errors: shape });
      continue;
    }
    const p = raw as PromptUpload;
    if (!isCategoryId(p.category)) {
      failed.push({ index, errors: [`unknown category ${p.category}`] });
      continue;
    }
    const id = await generatePromptId(p.category, isTaken);
    const candidate: NewPrompt = { id, category: p.category, text: p.text, note: p.note ?? null, authorScore: p.authorScore, answers: p.answers.map(cleanAnswer) };
    const result = validatePrompt(candidate);
    if (!result.ok) {
      failed.push({ index, errors: result.errors });
      continue;
    }
    claimed.add(id);
    valid.push({ index, prompt: candidate });
  }

  const writes: BatchItem<'sqlite'>[] = [];
  if (valid.length) {
    writes.push(
      db.insert(prompts).values(valid.map(({ prompt }) => ({ ...prompt, createdBy: actor.id }))),
      db.insert(adminLog).values({ actorId: actor.id, action: 'prompts_added', count: valid.length, createdAt: now }),
    );
  }
  if (failed.length) {
    writes.push(db.insert(adminLog).values(failed.map(() => ({ actorId: actor.id, action: 'prompt_failed' as const, createdAt: now }))));
  }
  if (writes.length) writes.push(pruneLog(db, now));
  if (writes.length) await db.batch(writes as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

  return {
    added: valid.map(({ index, prompt }) => ({ index, id: prompt.id })),
    failed,
    message: uploadMessage(valid.length, failed.length),
  };
}

/* ─────────────────────────────── removing prompts ─────────────────────────────── */

export const canRemovePrompts = (role: AdminRole) => role === 'supreme' || role === 'right_hand';

/** How far apart (in expected points) a replacement's difficulty may be. */
export const REPLACEMENT_RATING_GAP = 1;

/**
 * Deletes a prompt. Players' per-category and global stats are totals that
 * don't depend on the prompt, so they stay exactly as they are.
 *
 * Dailies: a prompt in today's Daily (UTC) can't be removed. If it is in any
 * future Daily, a replacement must be given; it takes the prompt's place in
 * all of them. Past Dailies keep pointing at the removed id.
 *
 * A replacement must exist, differ from the prompt, share its category, not
 * already be in any of those days' Dailies, and have a current difficulty
 * within 1 point. It may only be given when a future Daily needs it.
 */
export async function removePrompt(
  db: Db, actor: Admin, id: string, replacementId?: string | null, now = new Date(),
): Promise<{ replacedIn: string[] }> {
  if (!canRemovePrompts(actor.role)) throw new AdminError('only supreme leaders and right-hand admins can remove prompts', 403);
  const prompt = await db.select().from(prompts).where(eq(prompts.id, id)).get();
  if (!prompt) throw new AdminError(`no prompt ${id}`, 404);

  const today = utcDay(now);
  const containsPrompt = or(...DAILY_SLOTS.map((slot) => eq(daily[slot], id)));
  const inToday = await db.select({ date: daily.date }).from(daily).where(and(eq(daily.date, today), containsPrompt)).get();
  if (inToday) throw new AdminError(`${id} is in today’s Daily, so it can’t be removed until tomorrow (UTC)`, 400);
  const usedIn = await db.select().from(daily).where(and(gt(daily.date, today), containsPrompt)).orderBy(daily.date).all();

  const futureDays = usedIn.map((d) => d.date);
  if (!futureDays.length && replacementId) {
    throw new AdminError(`${id} isn’t in any future Daily, so it doesn’t need a replacement`, 400);
  }
  if (futureDays.length && !replacementId) {
    throw new AdminError(
      `${id} is in ${futureDays.length} future Dail${futureDays.length === 1 ? 'y' : 'ies'} (${futureDays.join(', ')}); give a replacement prompt id`,
      400,
    );
  }

  if (replacementId) {
    if (replacementId === id) throw new AdminError('a prompt can’t replace itself', 400);
    const replacement = await db.select().from(prompts).where(eq(prompts.id, replacementId)).get();
    if (!replacement) throw new AdminError(`no prompt ${replacementId}`, 404);
    if (replacement.category !== prompt.category) {
      throw new AdminError(`the replacement must be in the same category as ${id}`, 400);
    }
    const clash = usedIn.find((d) => DAILY_SLOTS.some((slot) => d[slot] === replacementId));
    if (clash) throw new AdminError(`${replacementId} is already in the Daily for ${clash.date}`, 400);
    const [from, to] = [currentRating(prompt), currentRating(replacement)];
    if (Math.abs(from - to) > REPLACEMENT_RATING_GAP) {
      throw new AdminError(
        `the replacement’s difficulty (${to.toFixed(1)}) must be within ${REPLACEMENT_RATING_GAP} point of ${id}’s (${from.toFixed(1)})`,
        400,
      );
    }
  }

  const writes: BatchItem<'sqlite'>[] = [];
  if (replacementId) {
    for (const slot of DAILY_SLOTS) {
      writes.push(db.update(daily).set({ [slot]: replacementId }).where(and(eq(daily[slot], id), gt(daily.date, today))));
    }
  }
  writes.push(
    db.delete(prompts).where(eq(prompts.id, id)),
    db.insert(adminLog).values({
      actorId: actor.id,
      action: 'prompt_removed',
      promptId: id,
      ...(replacementId && { replacementId }),
      createdAt: now,
    }),
    pruneLog(db, now),
  );
  await db.batch(writes as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return { replacedIn: futureDays };
}

/* ─────────────────────────────── viewing prompts ─────────────────────────────── */

export interface PromptListing {
  id: string;
  category: number;
  text: string;
  note: string | null;
  authorScore: number;
  answers: Answer[];
  /** Current difficulty (expected points), as sets and Dailies use it. */
  rating: number;
  playCount: number;
  /** Average points per play; null before anyone has played it. */
  average: number | null;
  /** null if the admin who added it has deleted their account. */
  createdBy: string | null;
  createdAt: Date;
}

/** Every prompt, newest first, for the admin prompt browser. Any admin may view them. */
export async function listPrompts(db: Db): Promise<PromptListing[]> {
  const rows = await db
    .select({ prompt: prompts, createdBy: users.displayName })
    .from(prompts)
    .leftJoin(users, eq(prompts.createdBy, users.id))
    .orderBy(desc(prompts.createdAt), prompts.id)
    .all();
  return rows.map(({ prompt: p, createdBy }) => ({
    id: p.id,
    category: p.category,
    text: p.text,
    note: p.note,
    authorScore: p.authorScore,
    answers: p.answers,
    rating: currentRating(p),
    playCount: p.playCount,
    average: p.playCount ? p.playTotal / p.playCount : null,
    createdBy,
    createdAt: p.createdAt,
  }));
}
