import { db } from '@/lib/db';
import { recordPlayed } from '@/lib/play';
import { handlePlay, jsonBody } from '@/lib/play-http';
import { optionalPlayer } from '@/lib/player-http';

/**
 * Body: { mode, date (Daily only), rounds: [{ promptId, correct, misses }] }.
 * A signed-in player's Daily sends { mode, date, game } instead: the finished game, kept for their other devices.
 */
export async function POST(request: Request) {
  return handlePlay(async () => recordPlayed(db, await jsonBody(request), new Date(), (await optionalPlayer())?.id ?? null));
}
