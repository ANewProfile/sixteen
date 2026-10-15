import { db } from '@/lib/db';
import { field, handleAccount, readBody, setPlayerCookie } from '@/lib/player-http';
import { signUp } from '@/lib/players';

/** Body: { username, password, email? }. Creates the account and signs this browser in. */
export async function POST(request: Request) {
  return handleAccount(async () => {
    const body = await readBody(request);
    const session = await signUp(db, {
      username: field(body, 'username'),
      password: field(body, 'password'),
      email: typeof body.email === 'string' ? body.email : null,
    });
    await setPlayerCookie(session);
    return Response.json({ player: session.player });
  });
}
