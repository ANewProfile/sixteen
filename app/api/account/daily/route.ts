import { db } from '@/lib/db';
import { dailyCompletion, transferDaily } from '@/lib/play';
import { currentPlayer, handleAccount, optionalPlayer, readBody } from '@/lib/player-http';

/** `?date=YYYY-MM-DD`: the signed-in player's finished Daily for that day, so this browser can show (and keep) it. */
export async function GET(request: Request) {
  return handleAccount(async () => {
    const player = await optionalPlayer();
    const date = new URL(request.url).searchParams.get('date');
    if (!player || !date) return Response.json({ signedIn: !!player, game: null });
    return Response.json({ signedIn: true, game: (await dailyCompletion(db, player.id, date))?.game ?? null });
  });
}

/** Body: { date, game }. Moves a Daily finished here as a guest into the account; if the account has one, that one wins. */
export async function POST(request: Request) {
  return handleAccount(async () => {
    const player = await currentPlayer();
    return Response.json(await transferDaily(db, player.id, await readBody(request)));
  });
}
