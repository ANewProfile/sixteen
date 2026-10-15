import { changeOwnPassword } from '@/lib/admin';
import { asString, currentAdmin, handle, readJson } from '@/lib/admin-http';
import { db } from '@/lib/db';

/** Body: { current, next }. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await currentAdmin(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    await changeOwnPassword(db, admin, asString(body?.current, 'current'), asString(body?.next, 'next'));
    return Response.json({ ok: true });
  });
}
