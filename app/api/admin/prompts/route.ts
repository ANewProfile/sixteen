import { addPrompts } from '@/lib/admin';
import { currentAdmin, handle, readJson } from '@/lib/admin-http';
import { db } from '@/lib/db';

/** Adds a list of one or more prompts. Valid ones go in even if others fail. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await currentAdmin(request);
    const result = await addPrompts(db, admin, await readJson(request));
    // 200 when anything was added (the body lists any failures), 422 when nothing was.
    return Response.json(result, { status: result.added.length ? 200 : 422 });
  });
}
