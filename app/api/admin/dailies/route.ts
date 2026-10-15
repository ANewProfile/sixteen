import { currentAdmin, handle, readJson } from '@/lib/admin-http';
import { addDaily } from '@/lib/dailies';
import { db } from '@/lib/db';

/** Any admin. Body: { ids: [5 prompt ids] }. Adds it on the earliest day without a Daily. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await currentAdmin(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    return Response.json({ date: await addDaily(db, admin, body?.ids) });
  });
}
