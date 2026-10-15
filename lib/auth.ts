/* Passwords and admin tokens.
 *
 * Passwords are low-entropy and guessable, so they get scrypt: slow and
 * salted, so a leaked hash is expensive to attack. Tokens are 32 random bytes
 * nobody could guess, so a plain SHA-256 is enough; it only has to keep the
 * raw token out of the database. Either way the raw value is never stored. */
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export const MIN_PASSWORD_LENGTH = 8;

/** `scrypt$<salt hex>$<hash hex>` */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** A stand-in hash so a login for an unknown username takes as long as a real one. */
export const DUMMY_PASSWORD_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(KEY_LENGTH * 2)}`;

/** No 0/o, 1/l/i, so it can be read out or copied by hand without mistakes. */
const TEMP_PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A temporary password from a reset: 14 random characters, about 69 bits. */
export const newTemporaryPassword = (): string =>
  Array.from({ length: 14 }, () => TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)]).join('');

export const newToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
