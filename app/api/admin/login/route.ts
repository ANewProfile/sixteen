import { login } from '@/lib/admin';
import { asString, handle, ipFrom, readJson, setSessionCookie } from '@/lib/admin-http';
import { db } from '@/lib/db';

/** Signs an admin in. This replaces their token, so scripts using the old one stop working. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await readJson(request)) as Record<string, unknown>;
    const { admin, token } = await login(
      db, asString(body?.username, 'username'), asString(body?.password, 'password'), ipFrom(request),
    );
    await setSessionCookie(token);
    return Response.json({
      admin,
      token,
      notice: 'Your admin token was regenerated when you signed in. Any script using your old token must be updated with this one. It is shown only once.',
    });
  });
}
