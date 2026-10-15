import { resetPassword } from '@/lib/admin';
import { asString, currentAdmin, handle, readJson } from '@/lib/admin-http';
import { db } from '@/lib/db';

/** Supreme leaders only. Body: { username }. Returns the temporary password once. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await currentAdmin(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    const username = asString(body?.username, 'username');
    const password = await resetPassword(db, admin, username);
    return Response.json({
      password,
      notice: `This is ${username}’s new password until they change it. Pass it on privately; it is shown only once.`,
    });
  });
}
