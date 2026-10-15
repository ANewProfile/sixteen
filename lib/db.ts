/* The Turso connection. Server-only: the auth token grants full database
 * access, so importing this from a Client Component is a build error. */
import 'server-only';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error('TURSO_DATABASE_URL is not set (see .env.example)');

export const db = drizzle({
  connection: { url, authToken: process.env.TURSO_AUTH_TOKEN },
  schema,
});
