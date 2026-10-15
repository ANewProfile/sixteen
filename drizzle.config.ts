import { defineConfig } from 'drizzle-kit';

// drizzle-kit doesn't read .env.local on its own; Next.js does, at runtime.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: fine for `db:generate`, which never connects.
}

export default defineConfig({
  dialect: 'turso',
  schema: './lib/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? '',
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
