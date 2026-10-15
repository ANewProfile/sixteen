import { asString, currentAdmin, handle, readJson } from '@/lib/admin-http';
import { removeDaily } from '@/lib/dailies';
import { db } from '@/lib/db';

/** Supreme and right-hand admins, future days only. Body: { date }. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await currentAdmin(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    await removeDaily(db, admin, asString(body?.date, 'date'));
    return Response.json({ ok: true });
  });
}
