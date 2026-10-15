import { clearSessionCookie } from '@/lib/admin-http';

/** Forgets the browser's session but leaves the token valid, so scripts keep working. */
export async function POST() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
