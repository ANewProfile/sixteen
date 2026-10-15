import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { login, resetPassword, type Admin } from '../lib/admin';
import { hashPassword } from '../lib/auth';
import type { Db } from '../lib/games';
import { dailyCompletion, recordPlayed, transferDaily } from '../lib/play';
import {
  SESSION_DAYS, authenticatePlayer, changePassword, changeUsername, deleteAccount, playerStats, signIn, signUp, usernameProblem,
  type Player,
} from '../lib/players';
import { daily, dailyCompletions, globalGameStats, prompts, users } from '../lib/schema';
import { createTestDb } from './test-db';

let db: Db;
let cleanup: () => void;

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterEach(() => cleanup());

const IP = '203.0.113.9';
const t0 = new Date('2026-10-15T12:00:00Z');
const days = (n: number) => new Date(t0.getTime() + n * 24 * 60 * 60 * 1000);
const status = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e as { status?: number }).status ?? e);

describe('usernames', () => {
  it('allows 2–16 letters, digits, - and _, with at least one letter', () => {
    for (const ok of ['Theo', 'ab', 'Theo_C', 'x-2', 'a'.repeat(16), '1a']) expect(usernameProblem(ok)).toBeNull();
    for (const bad of ['a', 'a'.repeat(17), 'theo chen', 'théo', 'th!eo', '12', '__', '-_-']) expect(usernameProblem(bad)).not.toBeNull();
  });

  it('keeps the name as typed but treats different capitalization as taken', async () => {
    const { player } = await signUp(db, { username: 'Theo_C', password: 'password1' }, t0);
    expect(player.username).toBe('Theo_C');
    expect(await db.select({ username: users.username }).from(users).get()).toEqual({ username: 'theo_c' });
    expect(await status(signUp(db, { username: 'THEO_c', password: 'password1' }, t0))).toBe(409);
    // Symbols count: theoc is a different name.
    expect((await signUp(db, { username: 'theoc', password: 'password1' }, t0)).player.username).toBe('theoc');
  });

  it('refuses short passwords and a reused email', async () => {
    expect(await status(signUp(db, { username: 'theo', password: 'short' }, t0))).toBe(400);
    await signUp(db, { username: 'theo', password: 'password1', email: 't@x.test' }, t0);
    expect(await status(signUp(db, { username: 'other', password: 'password1', email: 't@x.test' }, t0))).toBe(409);
  });
});

describe('sessions', () => {
  it('signs in by any capitalization, handing every device the same token and expiry', async () => {
    const first = await signUp(db, { username: 'Theo', password: 'password1' }, t0);
    const second = await signIn(db, 'tHEO', 'password1', IP, days(50));
    expect(second.token).toBe(first.token);
    expect(second.expires).toEqual(days(SESSION_DAYS));
    expect(second.player.username).toBe('Theo');
  });

  it('rejects the token after two months, checked on the server, and then issues a new one', async () => {
    const first = await signUp(db, { username: 'theo', password: 'password1' }, t0);
    expect(await authenticatePlayer(db, first.token, days(SESSION_DAYS - 1))).toMatchObject({ username: 'theo' });
    expect(await authenticatePlayer(db, first.token, days(SESSION_DAYS))).toBeNull();
    const again = await signIn(db, 'theo', 'password1', IP, days(SESSION_DAYS + 1));
    expect(again.token).not.toBe(first.token);
    expect(again.expires).toEqual(days(2 * SESSION_DAYS + 1));
  });

  it('locks out after five wrong passwords, sharing the admin lockout', async () => {
    await signUp(db, { username: 'theo', password: 'password1' }, t0);
    for (let i = 0; i < 4; i++) expect(await status(signIn(db, 'theo', 'nope', IP, t0))).toBe(401);
    expect(await status(signIn(db, 'theo', 'nope', IP, t0))).toBe(429);
    expect(await status(signIn(db, 'theo', 'password1', IP, t0))).toBe(429);
  });

  it('a password change signs out every other device and gives this one a new token', async () => {
    const { player, token } = await signUp(db, { username: 'theo', password: 'password1' }, t0);
    expect(await status(changePassword(db, player, 'wrong', 'password2', days(1)))).toBe(403);
    const fresh = await changePassword(db, player, 'password1', 'password2', days(1));
    expect(await authenticatePlayer(db, token, days(1))).toBeNull();
    expect(await authenticatePlayer(db, fresh.token, days(1))).toMatchObject({ id: player.id });
    expect(fresh.expires).toEqual(days(1 + SESSION_DAYS));
  });

  it('an admin password reset signs the player out everywhere; admin sign-in leaves the player token alone', async () => {
    const passwordHash = await hashPassword('password1');
    await db.insert(users).values([
      { id: 'boss', username: 'boss', displayName: 'Boss', passwordHash, adminRole: 'supreme' },
      { id: 'low', username: 'low', displayName: 'Low', passwordHash, adminRole: 'lower' },
    ]);
    const { token } = await signIn(db, 'Low', 'password1', IP, t0);
    await login(db, 'LOW', 'password1', IP, t0);
    expect(await authenticatePlayer(db, token, t0)).toMatchObject({ username: 'Low', adminRole: 'lower' });
    const boss: Admin = { id: 'boss', username: 'Boss', role: 'supreme' };
    await resetPassword(db, boss, 'low', t0);
    expect(await authenticatePlayer(db, token, t0)).toBeNull();
  });
});

describe('profile', () => {
  let player: Player;
  beforeEach(async () => {
    ({ player } = await signUp(db, { username: 'theo', password: 'password1' }, t0));
  });

  it('renames with the password, keeping the new capitalization', async () => {
    await signUp(db, { username: 'Taken', password: 'password1' }, t0);
    expect(await status(changeUsername(db, player, 'Theodore', 'wrong'))).toBe(403);
    expect(await status(changeUsername(db, player, 'TAKEN', 'password1'))).toBe(409);
    expect(await status(changeUsername(db, player, 'no spaces', 'password1'))).toBe(400);
    expect((await changeUsername(db, player, 'Theodore', 'password1')).username).toBe('Theodore');
    expect((await signIn(db, 'theodore', 'password1', IP, t0)).player.username).toBe('Theodore');
    // Changing only the capitalization of your own name is fine.
    expect((await changeUsername(db, player, 'THEODORE', 'password1')).username).toBe('THEODORE');
  });

  it('deletes only with the password and the username typed again', async () => {
    expect(await status(deleteAccount(db, player, 'wrong', 'theo'))).toBe(403);
    expect(await status(deleteAccount(db, player, 'password1', 'someone'))).toBe(400);
    await deleteAccount(db, player, 'password1', 'THEO');
    expect(await db.select().from(users).all()).toEqual([]);
  });

  it('supreme leaders can’t delete their accounts; other admins can', async () => {
    await db.update(users).set({ adminRole: 'supreme' }).where(eq(users.id, player.id));
    expect(await status(deleteAccount(db, player, 'password1', 'theo'))).toBe(403);
    await db.update(users).set({ adminRole: 'right_hand' }).where(eq(users.id, player.id));
    await deleteAccount(db, player, 'password1', 'theo');
  });
});

describe('Daily completions', () => {
  const now = new Date('2026-10-15T15:00:00Z');
  const date = '2026-10-15';
  const ids = ['0Abcdefg', '1Abcdefg', '2Abcdefg', '3Abcdefg', '4Abcdefg'];
  // Points per round: 0−1, 1−1, 2−1, 4−1, 8−1 = 10.
  const finished = (hitsOffset = 0) => ({
    set: { date, prompts: ids.map((id) => ({ id })), difficulty: 8 },
    index: 4,
    rounds: ids.map((_, i) => ({ attempts: [], prompts: null, final: { hits: Math.min(i + hitsOffset, 4), misses: 1, score: 0, results: [], answers: [] } })),
    done: true,
    recorded: false,
  });
  let player: Player;

  beforeEach(async () => {
    await db.insert(prompts).values(
      ids.map((id) => ({
        id, category: Number(id[0]), text: id, authorScore: 8,
        answers: Array.from({ length: 6 }, (_, i) => ({ canonical: `A${i}`, aliases: [] })),
      })),
    );
    await db.insert(daily).values({ date, prompt1: ids[0], prompt2: ids[1], prompt3: ids[2], prompt4: ids[3], prompt5: ids[4] });
    ({ player } = await signUp(db, { username: 'theo', password: 'password1' }, t0));
  });

  it('a signed-in Daily records everywhere and keeps the game; a second device gets the first one back', async () => {
    expect(await recordPlayed(db, { mode: 'daily', date, game: finished() }, now, player.id)).toEqual({ points: 10 });
    expect(await dailyCompletion(db, player.id, date)).toMatchObject({ points: 10, game: { done: true, recorded: true } });
    expect((await playerStats(db, player)).dailyGames).toBe(1);

    const second = await recordPlayed(db, { mode: 'daily', date, game: finished(1) }, now, player.id);
    expect(second).toMatchObject({ points: 10, game: { rounds: [{ final: { hits: 0 } }, {}, {}, {}, {}] } });
    expect((await playerStats(db, player)).dailyGames).toBe(1);
    expect(await db.select().from(globalGameStats).all()).toEqual([{ id: 1, total: 10, count: 1 }]);
  });

  it('a guest Daily moved into the account counts only toward the player’s own stats', async () => {
    await recordPlayed(db, { mode: 'daily', date, rounds: ids.map((promptId, i) => ({ promptId, correct: i, misses: 1 })) }, now);
    const { game } = await transferDaily(db, player.id, { date, game: { ...finished(), recorded: true } }, now);
    expect(game).toMatchObject({ recorded: true });
    const stats = await playerStats(db, player);
    expect(stats).toMatchObject({ dailyGames: 1, pointsPerGame: 10 });
    expect(stats.categories).toHaveLength(5);
    expect(await db.select().from(globalGameStats).all()).toEqual([{ id: 1, total: 10, count: 1 }]);
  });

  it('the account wins when it already has that day', async () => {
    await recordPlayed(db, { mode: 'daily', date, game: finished() }, now, player.id);
    const { game } = await transferDaily(db, player.id, { date, game: finished(2) }, now);
    expect(game).toMatchObject({ rounds: [{ final: { hits: 0 } }, {}, {}, {}, {}] });
    expect((await playerStats(db, player)).dailyGames).toBe(1);
  });

  it('refuses games that don’t match the Daily, aren’t finished, or are too large', async () => {
    const bad = [
      { ...finished(), set: { ...finished().set, date: '2026-10-14' } },
      { ...finished(), rounds: finished().rounds.map((r, i) => (i === 2 ? { ...r, final: null } : r)) },
      { ...finished(), padding: 'x'.repeat(100_001) },
      { ...finished(), set: { ...finished().set, prompts: [...ids.slice(1), '9Zzzzzzz'].map((id) => ({ id })) } },
    ];
    for (const game of bad) expect(await status(transferDaily(db, player.id, { date, game }, now))).not.toBe('ok');
    expect(await status(recordPlayed(db, { mode: 'daily', date }, now, player.id))).toBe(400);
    expect(await db.select().from(dailyCompletions).all()).toEqual([]);
  });

  it('deleting the account removes its completions and stats but not the global stats', async () => {
    await recordPlayed(db, { mode: 'daily', date, game: finished() }, now, player.id);
    await deleteAccount(db, player, 'password1', 'theo');
    expect(await db.select().from(dailyCompletions).all()).toEqual([]);
    expect(await db.select().from(globalGameStats).all()).toEqual([{ id: 1, total: 10, count: 1 }]);
  });
});
