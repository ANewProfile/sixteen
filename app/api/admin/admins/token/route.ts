import { AdminError, regenerateOwnToken } from '@/lib/admin';
import { currentAdmin, handle, readJson, setSessionCookie } from '@/lib/admin-http';
import { db } from '@/lib/db';

/**
 * { action: 'regenerate' } replaces your own token and returns it once.
 * Nobody can revoke or refresh another admin's token; removing an admin deletes theirs.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await currentAdmin(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    if (body?.action !== 'regenerate') throw new AdminError("action must be 'regenerate'", 400);
    const token = await regenerateOwnToken(db, admin);
    await setSessionCookie(token);
    return Response.json({ token, notice: 'Your admin token was regenerated. Update any scripts that use it. It is shown only once.' });
  });
}
