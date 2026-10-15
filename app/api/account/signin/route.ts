import { ipFrom } from '@/lib/admin-http';
import { db } from '@/lib/db';
import { field, handleAccount, readBody, setPlayerCookie } from '@/lib/player-http';
import { signIn } from '@/lib/players';

/** Body: { username, password }. Another device signing in gets the same token, expiring at the same time. */
export async function POST(request: Request) {
  return handleAccount(async () => {
    const body = await readBody(request);
    const session = await signIn(db, field(body, 'username'), field(body, 'password'), ipFrom(request));
    await setPlayerCookie(session);
    return Response.json({ player: session.player });
  });
}
