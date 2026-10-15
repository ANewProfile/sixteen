import { changeRole } from '@/lib/admin';
import { asString, currentAdmin, handle, readJson } from '@/lib/admin-http';
import { db } from '@/lib/db';
import type { AdminRole } from '@/lib/schema';

/** Body: { username, role } where role is none, lower or right_hand. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await currentAdmin(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    await changeRole(db, admin, asString(body?.username, 'username'), asString(body?.role, 'role') as AdminRole);
    return Response.json({ ok: true });
  });
}
