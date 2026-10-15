import { db } from '@/lib/db';
import { currentPlayer, field, handleAccount, readBody } from '@/lib/player-http';
import { changeUsername } from '@/lib/players';

/** Body: { username, password }. */
export async function POST(request: Request) {
  return handleAccount(async () => {
    const player = await currentPlayer();
    const body = await readBody(request);
    return Response.json({ player: await changeUsername(db, player, field(body, 'username'), field(body, 'password')) });
  });
}
