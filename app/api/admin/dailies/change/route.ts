import { asString, currentAdmin, handle, readJson } from '@/lib/admin-http';
import { changeDaily } from '@/lib/dailies';
import { db } from '@/lib/db';

/** Supreme and right-hand admins, future days only. Body: { date, ids }. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await currentAdmin(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    await changeDaily(db, admin, asString(body?.date, 'date'), body?.ids);
    return Response.json({ ok: true });
  });
}
