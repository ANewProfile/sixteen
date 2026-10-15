/* Creates a user account from the command line, e.g. the first supreme
 * leader (anyone else can use the sign-up page). Usage:
 *
 *   npm run create-user
 *
 * It asks for a username, an optional email and a password, hashes the password, and inserts
 * the row into the database in .env.local. Admin roles are not set here: give
 * the first supreme leader their role by editing admin_role in Turso. */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createClient } from '@libsql/client';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../lib/auth';
import { usernameKey, usernameProblem } from '../lib/players';

process.loadEnvFile('.env.local');

/** stdout that can be muted so the password isn't echoed. */
let muted = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!muted) process.stdout.write(chunk);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
// Read lines through an iterator so input that arrives early (e.g. piped) isn't dropped.
const lines = rl[Symbol.asyncIterator]();
async function ask(prompt: string, hidden = false): Promise<string> {
  process.stdout.write(prompt);
  muted = hidden;
  const { value } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write('\n');
  return value ?? '';
}

const username = (await ask('Username: ')).trim();
const email = (await ask('Email (optional, only used to reset a forgotten password): ')).trim() || null;
const password = await ask('Password: ', true);
rl.close();

const problem = usernameProblem(username);
if (problem || password.length < MIN_PASSWORD_LENGTH) {
  console.error(problem ? `Not a valid username: ${problem}.` : `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

const client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  await client.execute({
    sql: 'INSERT INTO users (id, username, display_name, email, password_hash) VALUES (?, ?, ?, ?, ?)',
    args: [randomUUID(), usernameKey(username), username, email, await hashPassword(password)],
  });
  console.log(`Created ${username}. To make them an admin, set admin_role in Turso.`);
} catch (err) {
  console.error(`Could not create the user: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  client.close();
}
