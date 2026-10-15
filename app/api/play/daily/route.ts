import { connection } from 'next/server';
import { db } from '@/lib/db';
import { dailySet } from '@/lib/play';
import { handlePlay } from '@/lib/play-http';

/** Today's Daily (generated on first request if none was scheduled). No answers. */
export async function GET() {
  await connection();
  return handlePlay(() => dailySet(db));
}
