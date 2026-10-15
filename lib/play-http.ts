/* Turning PlayErrors and SetErrors into JSON responses for the /api/play routes. */
import { PlayError } from './play';
import { SetError } from './sets';

export async function handlePlay(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (err) {
    if (err instanceof PlayError) return Response.json({ error: err.message }, { status: err.status });
    // Not enough suitable prompts to make a set: the game is down until prompts are fixed.
    if (err instanceof SetError) return Response.json({ error: `no game is available right now (${err.message})` }, { status: 503 });
    throw err;
  }
}

export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new PlayError('request body must be JSON', 400);
  }
}
