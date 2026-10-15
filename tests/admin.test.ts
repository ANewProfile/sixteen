import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  AdminError, LOG_RETENTION_DAYS, addPrompts, authenticate, canChangeRole, changeRole, listAdmins, login,
  listPrompts, readLog, readNotifications, regenerateOwnToken, resetPassword, changeOwnPassword, type Admin,
} from '../lib/admin';
import { LOCKOUT_MS, MAX_FAILURES } from '../lib/lockout';
import { hashPassword, verifyPassword } from '../lib/auth';
import { currentRating } from '../lib/prompts';
import type { Db } from '../lib/games';
import { ADMIN_ROLES, adminLog, loginFailures, prompts, users, type AdminRole } from '../lib/schema';
import { createTestDb } from './test-db';

let db: Db;
let cleanup: () => void;
let passwordHash: string;
const IP = '203.0.113.7';

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  passwordHash ??= await hashPassword('correct horse');
  const people: [string, AdminRole][] = [
    ['boss', 'supreme'], ['rh1', 'right_hand'], ['rh2', 'right_hand'], ['low1', 'lower'], ['low2', 'lower'], ['player', 'none'],
  ];
  await db.insert(users).values(
    people.map(([username, adminRole]) => ({ id: username, username, displayName: username, email: `${username}@x.test`, passwordHash, adminRole })),
  );
});

afterEach(() => cleanup());

const adminNamed = async (username: string): Promise<Admin> => (await login(db, username, 'correct horse', IP)).admin;
const roleOf = async (username: string) => (await db.select().from(users).where(eq(users.username, username)).get())?.adminRole;

describe('passwords', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    expect(await verifyPassword('correct horse', passwordHash)).toBe(true);
    expect(await verifyPassword('wrong horse', passwordHash)).toBe(false);
  });

  it('salts each hash differently', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});

describe('canChangeRole', () => {
  const allowed = (actor: AdminRole) =>
    ADMIN_ROLES.flatMap((from) => ADMIN_ROLES.filter((to) => canChangeRole(actor, from, to)).map((to) => `${from}->${to}`));

  it('lets supreme do anything that does not touch supreme', () => {
    expect(allowed('supreme').sort()).toEqual(
      ['lower->none', 'lower->right_hand', 'none->lower', 'none->right_hand', 'right_hand->lower', 'right_hand->none'].sort(),
    );
  });

  it('lets right-hand only add or remove lower admins', () => {
    expect(allowed('right_hand').sort()).toEqual(['lower->none', 'none->lower']);
  });

  it('gives lower admins and players nothing', () => {
    expect(allowed('lower')).toEqual([]);
    expect(allowed('none')).toEqual([]);
  });
});

describe('login and tokens', () => {
  it('signs admins in and authenticates their token', async () => {
    const { admin, token } = await login(db, 'low1', 'correct horse', IP);
    expect(admin.role).toBe('lower');
    expect((await authenticate(db, token))?.username).toBe('low1');
  });

  it('stores only a hash of the token', async () => {
    const { token } = await login(db, 'low1', 'correct horse', IP);
    const row = await db.select().from(users).where(eq(users.username, 'low1')).get();
    expect(row?.tokenHash).toBeTruthy();
    expect(row?.tokenHash).not.toContain(token);
  });

  const failure = (attempt: Promise<unknown>) => attempt.then(() => 'ok', (e: AdminError) => `${e.status} ${e.message}`);

  it('gives wrong passwords and unknown users the same message', async () => {
    const messages = [await failure(login(db, 'low1', 'nope', IP)), await failure(login(db, 'ghost', 'correct horse', IP))];
    expect(messages).toEqual(['401 wrong username or password', '401 wrong username or password']);
  });

  it('tells a non-admin with the right password only that they have no admin access', async () => {
    expect(await failure(login(db, 'player', 'correct horse', IP))).toBe('403 this account doesn’t have admin access');
    expect(await failure(login(db, 'player', 'nope', IP))).toBe('401 wrong username or password');
  });

  it('tells a removed admin, with the right password, that their access was revoked', async () => {
    await changeRole(db, await adminNamed('rh1'), 'low1', 'none');
    expect(await failure(login(db, 'low1', 'correct horse', IP))).toBe('403 your admin access has been revoked');
    expect(await failure(login(db, 'low1', 'nope', IP))).toBe('401 wrong username or password');
  });

  it('invalidates the old token on each login', async () => {
    const first = (await login(db, 'low1', 'correct horse', IP)).token;
    const second = (await login(db, 'low1', 'correct horse', IP)).token;
    expect(await authenticate(db, first)).toBeNull();
    expect(await authenticate(db, second)).not.toBeNull();
  });

  it('invalidates the old token when an admin regenerates their own', async () => {
    const { admin, token } = await login(db, 'low1', 'correct horse', IP);
    const fresh = await regenerateOwnToken(db, admin);
    expect(await authenticate(db, token)).toBeNull();
    expect(await authenticate(db, fresh)).not.toBeNull();
  });

  it('reads the current role on every request, so demotion takes effect immediately', async () => {
    const { token } = await login(db, 'rh1', 'correct horse', IP);
    await changeRole(db, await adminNamed('boss'), 'rh1', 'lower');
    expect((await authenticate(db, token))?.role).toBe('lower');
  });

  it('kills the token when an admin is removed', async () => {
    const { token } = await login(db, 'low1', 'correct horse', IP);
    await changeRole(db, await adminNamed('rh1'), 'low1', 'none');
    expect(await authenticate(db, token)).toBeNull();
    expect((await db.select().from(users).where(eq(users.username, 'low1')).get())?.tokenHash).toBeNull();
  });

  it('rejects missing and made-up tokens', async () => {
    expect(await authenticate(db, undefined)).toBeNull();
    expect(await authenticate(db, 'made-up')).toBeNull();
  });
});

describe('login lockout', () => {
  const t0 = new Date('2026-10-13T12:00:00Z');
  const later = (ms: number) => new Date(t0.getTime() + ms);
  const failure = (attempt: Promise<unknown>) => attempt.then(() => 'ok', (e: AdminError) => `${e.status} ${e.message}`);
  const failTimes = async (n: number, username = 'low1', ip = IP) => {
    for (let i = 0; i < n; i++) await failure(login(db, username, 'nope', ip, t0));
  };

  it('locks an IP + username for 15 minutes on the fifth failure, even with the right password', async () => {
    await failTimes(MAX_FAILURES - 1);
    expect(await failure(login(db, 'low1', 'nope', IP, t0))).toBe('429 too many failed attempts; try again in 15 minutes');
    expect(await failure(login(db, 'low1', 'correct horse', IP, later(60_000)))).toBe('429 too many failed attempts; try again in 14 minutes');
  });

  it('lets the same IP into other accounts, and other IPs into the locked one', async () => {
    await failTimes(MAX_FAILURES);
    expect(await failure(login(db, 'low2', 'correct horse', IP, t0))).toBe('ok');
    expect(await failure(login(db, 'low1', 'correct horse', '198.51.100.1', t0))).toBe('ok');
  });

  it('counts unknown usernames too, case-insensitively', async () => {
    await failTimes(MAX_FAILURES, 'Ghost');
    expect(await failure(login(db, 'gHOST', 'x', IP, t0))).toMatch(/^429/);
  });

  it('starts the count again once the lock expires', async () => {
    await failTimes(MAX_FAILURES);
    const after = later(LOCKOUT_MS + 1000);
    expect(await failure(login(db, 'low1', 'nope', IP, after))).toBe('401 wrong username or password');
    expect(await db.select().from(loginFailures).all()).toMatchObject([{ count: 1, lockedUntil: null }]);
  });

  it('clears the count on a successful login, however old the failures are', async () => {
    await failTimes(MAX_FAILURES - 1);
    expect(await failure(login(db, 'low1', 'correct horse', IP, later(7 * 24 * 3600_000)))).toBe('ok');
    expect(await db.select().from(loginFailures).all()).toEqual([]);
  });

  it('does not decay failures over time', async () => {
    await failTimes(MAX_FAILURES - 1);
    expect(await failure(login(db, 'low1', 'nope', IP, later(14 * 24 * 3600_000)))).toMatch(/^429/);
  });
});

describe('log, notifications and admin list', () => {
  const day = 24 * 3600_000;
  const t0 = new Date('2026-10-13T12:00:00Z');

  it('deletes entries older than 30 days whenever something is logged', async () => {
    const boss = await adminNamed('boss');
    await changeRole(db, boss, 'player', 'lower', new Date(t0.getTime() - (LOG_RETENTION_DAYS + 1) * day));
    await changeRole(db, boss, 'low2', 'none', new Date(t0.getTime() - (LOG_RETENTION_DAYS - 1) * day));
    await changeRole(db, boss, 'player', 'none', t0);
    const log = await readLog(db);
    expect(log.map((e) => e.target)).toEqual(['player', 'low2']);
  });

  it('lists the whole log newest first with usernames', async () => {
    const boss = await adminNamed('boss');
    await changeRole(db, boss, 'player', 'lower', t0);
    await addPrompts(db, boss, ['junk'], new Date(t0.getTime() + 1000));
    expect(await readLog(db)).toMatchObject([
      { actor: 'boss', action: 'prompt_failed' },
      { actor: 'boss', action: 'role_changed', target: 'player', fromRole: 'none', toRole: 'lower' },
    ]);
  });

  it('shows an admin only the role changes made to them', async () => {
    const boss = await adminNamed('boss');
    await changeRole(db, boss, 'low1', 'right_hand', t0);
    await changeRole(db, boss, 'low2', 'none', t0);
    const notes = await readNotifications(db, await adminNamed('low1'));
    expect(notes).toMatchObject([{ actor: 'boss', target: 'low1', fromRole: 'lower', toRole: 'right_hand' }]);
  });

  it('lists current admins only', async () => {
    expect((await listAdmins(db)).map((a) => a.username)).toEqual(['boss', 'low1', 'low2', 'rh1', 'rh2']);
  });
});

describe('passwords', () => {
  it('lets a supreme leader reset anyone else’s password, once, logged without the password', async () => {
    const boss = await adminNamed('boss');
    const { token } = await login(db, 'rh1', 'correct horse', IP);
    const temp = await resetPassword(db, boss, 'rh1');
    expect(temp).toMatch(/^[a-z2-9]{14}$/);
    await expect(login(db, 'rh1', 'correct horse', IP)).rejects.toMatchObject({ status: 401 });
    expect((await login(db, 'rh1', temp, IP)).admin.username).toBe('rh1');
    expect(await authenticate(db, token)).toBeNull();
    const log = await readLog(db);
    expect(log).toMatchObject([{ actor: 'boss', action: 'password_reset', target: 'rh1' }]);
    expect(JSON.stringify(log)).not.toContain(temp);
    await resetPassword(db, boss, 'player');
  });

  it('refuses resets by anyone but a supreme leader, and of their own password', async () => {
    await expect(resetPassword(db, await adminNamed('rh1'), 'player')).rejects.toMatchObject({ status: 403 });
    await expect(resetPassword(db, await adminNamed('boss'), 'boss')).rejects.toMatchObject({ status: 400 });
    await expect(resetPassword(db, await adminNamed('boss'), 'ghost')).rejects.toMatchObject({ status: 404 });
  });

  it('changes your own password only with the current one, and keeps the new one at 8+ characters', async () => {
    const low1 = await adminNamed('low1');
    await expect(changeOwnPassword(db, low1, 'wrong', 'new password')).rejects.toMatchObject({ status: 403 });
    await expect(changeOwnPassword(db, low1, 'correct horse', 'short')).rejects.toMatchObject({ status: 400 });
    await changeOwnPassword(db, low1, 'correct horse', 'new password');
    expect((await login(db, 'low1', 'new password', IP)).admin.username).toBe('low1');
  });

  it('allows accounts without an email', async () => {
    await db.insert(users).values({ id: 'anon', username: 'anon', displayName: 'anon', passwordHash });
    expect((await db.select().from(users).where(eq(users.id, 'anon')).get())?.email).toBeNull();
  });
});

describe('changeRole', () => {
  it('applies allowed changes and logs them', async () => {
    const boss = await adminNamed('boss');
    await changeRole(db, boss, 'player', 'right_hand');
    expect(await roleOf('player')).toBe('right_hand');
    const log = await db.select().from(adminLog).all();
    expect(log).toMatchObject([{ actorId: 'boss', action: 'role_changed', targetUserId: 'player', fromRole: 'none', toRole: 'right_hand' }]);
  });

  it('refuses forbidden changes and leaves the role alone', async () => {
    const rh1 = await adminNamed('rh1');
    await expect(changeRole(db, rh1, 'rh2', 'lower')).rejects.toMatchObject({ status: 403 });
    await expect(changeRole(db, rh1, 'rh1', 'lower')).rejects.toMatchObject({ status: 403 });
    await expect(changeRole(db, rh1, 'low1', 'right_hand')).rejects.toMatchObject({ status: 403 });
    await expect(changeRole(db, await adminNamed('boss'), 'rh1', 'supreme')).rejects.toMatchObject({ status: 403 });
    await expect(changeRole(db, await adminNamed('low1'), 'player', 'lower')).rejects.toMatchObject({ status: 403 });
    expect([await roleOf('rh2'), await roleOf('rh1'), await roleOf('low1'), await roleOf('player')]).toEqual(['right_hand', 'right_hand', 'lower', 'none']);
    expect(await db.select().from(adminLog).all()).toHaveLength(0);
  });

  it('rejects unknown users and roles', async () => {
    const boss = await adminNamed('boss');
    await expect(changeRole(db, boss, 'ghost', 'lower')).rejects.toMatchObject({ status: 404 });
    await expect(changeRole(db, boss, 'player', 'emperor' as AdminRole)).rejects.toMatchObject({ status: 400 });
  });
});

describe('addPrompts', () => {
  const good = (category: number) => ({
    category,
    text: `Prompt in ${category}`,
    authorScore: 8,
    answers: Array.from({ length: 6 }, (_, i) => ({ canonical: `Answer ${i}`, aliases: [] })),
  });

  it('adds valid prompts with server-made ids, authorship and a count-only log entry', async () => {
    const low1 = await adminNamed('low1');
    const result = await addPrompts(db, low1, [good(0), good(3)]);
    expect(result.failed).toEqual([]);
    expect(result.added.map((a) => a.id[0])).toEqual(['0', '3']);
    expect(result.message).toBe('2 prompts added.');

    const rows = await db.select().from(prompts).all();
    expect(rows.every((r) => r.createdBy === 'low1' && r.createdAt instanceof Date)).toBe(true);
    expect(await db.select().from(adminLog).all()).toMatchObject([{ actorId: 'low1', action: 'prompts_added', count: 2 }]);
  });

  it('adds the valid prompts, reports the failures, and says not to re-upload', async () => {
    const low1 = await adminNamed('low1');
    const tooFew = { ...good(1), answers: good(1).answers.slice(0, 3) };
    const result = await addPrompts(db, low1, [good(0), tooFew, good(2), 'junk', { ...good(4), category: 12 }]);

    expect(result.added.map((a) => a.index)).toEqual([0, 2]);
    expect(result.failed.map((f) => f.index)).toEqual([1, 3, 4]);
    expect(result.failed[0].errors[0]).toMatch(/5–25/);
    expect(result.message).toMatch(/2 prompts were added successfully\. Do not upload them again\. 3 prompts failed/);

    expect(await db.select().from(prompts).all()).toHaveLength(2);
    const log = await db.select().from(adminLog).all();
    expect(log.filter((l) => l.action === 'prompts_added')).toMatchObject([{ count: 2 }]);
    expect(log.filter((l) => l.action === 'prompt_failed')).toHaveLength(3);
  });

  it('stores prompt and reject lines, trimmed, and drops empty ones', async () => {
    const low1 = await adminNamed('low1');
    const answers = good(0).answers.map((a, i) =>
      i === 0 ? { ...a, prompts: [' Bush ', ''], ask: ' Which Bush? ', rejects: ['John Quincy Adams'], extra: 'dropped' } : { ...a, prompts: [], ask: 'unused' },
    );
    const { added } = await addPrompts(db, low1, [{ ...good(0), answers }]);
    const row = await db.select().from(prompts).where(eq(prompts.id, added[0].id)).get();
    expect(row?.answers[0]).toEqual({ canonical: 'Answer 0', aliases: [], prompts: ['Bush'], ask: 'Which Bush?', rejects: ['John Quincy Adams'] });
    expect(row?.answers[1]).toEqual({ canonical: 'Answer 1', aliases: [] });
  });

  it('rejects malformed prompt and reject lines', async () => {
    const low1 = await adminNamed('low1');
    const answers = good(0).answers.map((a, i) => (i === 0 ? { ...a, rejects: 'not a list' } : a));
    const result = await addPrompts(db, low1, [{ ...good(0), answers }]);
    expect(result.failed[0].errors[0]).toMatch(/answers must be a list/);
  });

  it('accepts a single prompt in a list and rejects anything that is not a list', async () => {
    const low1 = await adminNamed('low1');
    expect((await addPrompts(db, low1, [good(5)])).added).toHaveLength(1);
    await expect(addPrompts(db, low1, good(5))).rejects.toMatchObject({ status: 400 });
    await expect(addPrompts(db, low1, [])).rejects.toMatchObject({ status: 400 });
  });

  it('says nothing was added when every prompt fails', async () => {
    const result = await addPrompts(db, await adminNamed('low1'), [{ ...good(0), authorScore: 99 }]);
    expect(result.added).toEqual([]);
    expect(result.message).toMatch(/^Nothing was added/);
  });
});

describe('listPrompts', () => {
  it('lists every prompt newest first with its current rating, plays and author', async () => {
    const answers = Array.from({ length: 6 }, (_, i) => ({ canonical: `Answer ${i}`, aliases: [] }));
    await db.insert(prompts).values([
      { id: '0Oldoldo', category: 0, text: 'Old', authorScore: 8, answers, createdBy: 'low1', createdAt: new Date('2026-01-01') },
      {
        id: '3Newnewn', category: 3, text: 'New', authorScore: 10, answers, playTotal: 120, playCount: 12,
        createdBy: null, createdAt: new Date('2026-02-01'),
      },
    ]);
    const list = await listPrompts(db);
    expect(list.map((p) => [p.id, p.createdBy, p.playCount, p.average])).toEqual([
      ['3Newnewn', null, 12, 10],
      ['0Oldoldo', 'low1', 0, null],
    ]);
    // 6 answers → count score 2: 0.4 × 2 + 0.6 × 8 = 5.6 before anyone has played it.
    expect(list[1].rating).toBeCloseTo(5.6);
    const rows = await db.select().from(prompts).all();
    for (const row of rows) expect(list.find((p) => p.id === row.id)!.rating).toBe(currentRating(row));
  });
});
