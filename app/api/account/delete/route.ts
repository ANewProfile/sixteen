import { db } from '@/lib/db';
import { clearPlayerCookie, currentPlayer, field, handleAccount, readBody } from '@/lib/player-http';
import { deleteAccount } from '@/lib/players';

/** Body: { password, username } (the username typed again to confirm). */
export async function POST(request: Request) {
  return handleAccount(async () => {
    const player = await currentPlayer();
    const body = await readBody(request);
    await deleteAccount(db, player, field(body, 'password'), field(body, 'username'));
    await clearPlayerCookie();
    return Response.json({ ok: true });
  });
}
