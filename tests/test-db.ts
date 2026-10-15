/* A real SQLite database in a temp directory with all migrations applied. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { Db } from '../lib/games';
import * as schema from '../lib/schema';

export async function createTestDb(): Promise<{ db: Db; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'sixteen-db-'));
  const client = createClient({ url: `file:${join(dir, 'test.db')}` });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  return {
    db,
    cleanup: () => {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
