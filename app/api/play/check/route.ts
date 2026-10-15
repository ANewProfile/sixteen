import { db } from '@/lib/db';
import { checkPrompt } from '@/lib/play';
import { handlePlay, jsonBody } from '@/lib/play-http';

/**
 * Body: { promptId, entries } where each entry lists its attempts so far.
 * Returns { status: 'prompt', prompts } while any entry needs more detail,
 * then { status: 'final', results, hits, misses, score, answers }.
 */
export async function POST(request: Request) {
  return handlePlay(async () => checkPrompt(db, await jsonBody(request)));
}
