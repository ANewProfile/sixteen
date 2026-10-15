import { clearPlayerCookie } from '@/lib/player-http';

/** Signs this browser out only: the token stays valid on the player's other devices. */
export async function POST() {
  await clearPlayerCookie();
  return Response.json({ ok: true });
}
