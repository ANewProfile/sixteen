import { db } from '@/lib/db';
import { currentPlayer, field, handleAccount, readBody, setPlayerCookie } from '@/lib/player-http';
import { changePassword } from '@/lib/players';

/** Body: { current, next }. Signs out every other device; this one gets the new token. */
export async function POST(request: Request) {
  return handleAccount(async () => {
    const player = await currentPlayer();
    const body = await readBody(request);
    await setPlayerCookie(await changePassword(db, player, field(body, 'current'), field(body, 'next')));
    return Response.json({ ok: true });
  });
}
