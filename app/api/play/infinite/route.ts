import { connection } from 'next/server';
import { db } from '@/lib/db';
import { infiniteSet } from '@/lib/play';
import { handlePlay } from '@/lib/play-http';

/** A fresh random set. No answers. */
export async function GET() {
  await connection();
  return handlePlay(() => infiniteSet(db));
}
