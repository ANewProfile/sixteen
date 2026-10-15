import { db } from '@/lib/db';
import { handleAccount, optionalPlayer } from '@/lib/player-http';
import { playerStats } from '@/lib/players';

/** Who is signed in, with their stats; `{ player: null }` for a guest. Clears a cookie that no longer works. */
export async function GET() {
  return handleAccount(async () => {
    const player = await optionalPlayer();
    if (!player) return Response.json({ player: null });
    return Response.json({ player, stats: await playerStats(db, player) });
  });
}
