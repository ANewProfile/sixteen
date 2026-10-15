/* Shared plumbing for the /api/account routes and recording: the player
 * sign-in cookie, and turning PlayerErrors into JSON responses. */
import 'server-only';
import { cookies } from 'next/headers';
import { db } from './db';
import { PlayError } from './play';
import { authenticatePlayer, PlayerError, type Player, type Session } from './players';

export const PLAYER_COOKIE = 'sixteen_player';

/**
 * httpOnly: page scripts can't read it. SameSite=Lax rather than the admin
 * cookie's Strict, so someone arriving from a shared link is signed in on that
 * first page too. It expires with the token, which every device shares.
 */
export async function setPlayerCookie(session: Session): Promise<void> {
  (await cookies()).set(PLAYER_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: session.expires,
  });
}

export async function clearPlayerCookie(): Promise<void> {
  (await cookies()).delete(PLAYER_COOKIE);
}

/** The signed-in player, or null. A cookie that no longer matches (replaced, expired, account gone) is deleted. */
export async function optionalPlayer(): Promise<Player | null> {
  const token = (await cookies()).get(PLAYER_COOKIE)?.value;
  if (!token) return null;
  const player = await authenticatePlayer(db, token);
  if (!player) await clearPlayerCookie();
  return player;
}

export async function currentPlayer(): Promise<Player> {
  const player = await optionalPlayer();
  if (!player) throw new PlayerError('you’re not signed in', 401);
  return player;
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (typeof body === 'object' && body !== null) return body as Record<string, unknown>;
  } catch {
    // Falls through to the same error.
  }
  throw new PlayerError('request body must be a JSON object', 400);
}

export function field(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== 'string' || value === '') throw new PlayerError(`${name} is required`, 400);
  return value;
}

/** Runs a handler, turning PlayerErrors (and PlayErrors from the Daily sync) into `{ error }` responses. */
export async function handleAccount(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof PlayerError || err instanceof PlayError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
