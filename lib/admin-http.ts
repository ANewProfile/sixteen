/* Shared plumbing for the /api/admin routes: where the token comes from, the
 * session cookie, and turning AdminErrors into JSON responses. */
import 'server-only';
import { cookies } from 'next/headers';
import { AdminError, requireAdmin, type Admin } from './admin';
import { db } from './db';

export const SESSION_COOKIE = 'sixteen_admin';

/** Scripts send `Authorization: Bearer <token>`; the admin portal's browser sends the cookie. */
export async function tokenFrom(request: Request): Promise<string | undefined> {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export const currentAdmin = async (request: Request): Promise<Admin> => requireAdmin(db, await tokenFrom(request));

/** httpOnly: page scripts can't read it. SameSite=Strict: other sites can't make the browser send it. */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * The client's IP address, for the login lockout. On Vercel, x-forwarded-for
 * is set by Vercel's own proxy, so clients can't fake it; its first entry is
 * the client. Locally there is no proxy, so every attempt shares 'unknown'.
 */
export function ipFrom(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AdminError('request body must be JSON', 400);
  }
}

export function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new AdminError(`${name} is required`, 400);
  return value;
}

/** Runs a handler, turning AdminErrors into `{ error }` responses with their status. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof AdminError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
