import { removePrompt } from '@/lib/admin';
import { asString, currentAdmin, handle, readJson } from '@/lib/admin-http';
import { db } from '@/lib/db';

/** Supreme leaders and right-hand admins. Body: { id, replacementId? }. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await currentAdmin(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    const replacement = typeof body?.replacementId === 'string' && body.replacementId.trim() ? body.replacementId.trim() : null;
    const { replacedIn } = await removePrompt(db, admin, asString(body?.id, 'id').trim(), replacement);
    return Response.json({ ok: true, replacedIn });
  });
}
