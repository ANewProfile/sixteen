/* Rules for what makes a valid prompt, and how new prompt ids are made.
 * validatePrompt runs on every prompt before it is inserted; anything that
 * fails is rejected. */
import { isCategoryId, type CategoryId } from './categories';
import { promptRating } from './rating';
import type { Answer } from './schema';

export const MIN_ANSWERS = 5;
export const MAX_ANSWERS = 25;

const ID_SUFFIX_LENGTH = 7;
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_PATTERN = /^[0-9][A-Za-z0-9]{7}$/;

export interface NewPrompt {
  id: string;
  category: number;
  text: string;
  note?: string | null;
  authorScore: number;
  answers: Answer[];
}

/** Expected points implied by how many correct answers a prompt has. */
export function countScore(answerCount: number): number {
  if (!Number.isInteger(answerCount) || answerCount < MIN_ANSWERS || answerCount > MAX_ANSWERS) {
    throw new RangeError(`a prompt has ${MIN_ANSWERS}–${MAX_ANSWERS} answers (got ${answerCount})`);
  }
  if (answerCount <= 7) return 2;
  if (answerCount <= 10) return 4;
  if (answerCount <= 15) return 8;
  if (answerCount <= 20) return 12;
  return 16;
}

/** A stored prompt's difficulty right now (expected points, 0–16), using player results once there are enough. */
export function currentRating(p: { answers: Answer[]; authorScore: number; playTotal: number; playCount: number }): number {
  return promptRating({
    countScore: countScore(p.answers.length),
    authorScore: p.authorScore,
    playthroughs: p.playCount,
    playerAverage: p.playCount ? p.playTotal / p.playCount : null,
  });
}

/** Case-, accent- and punctuation-insensitive form used to compare text. */
const normalize = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Every accepted form of an answer that appears as whole words in the note. */
function answersInNote(note: string, answers: Answer[]): string[] {
  const haystack = ` ${normalize(note)} `;
  return answers
    .flatMap((a) => [a.canonical, ...a.aliases])
    .filter((form) => {
      const needle = normalize(form);
      return needle !== '' && haystack.includes(` ${needle} `);
    });
}

export type Validation = { ok: true } | { ok: false; errors: string[] };

export function validatePrompt(p: NewPrompt): Validation {
  const errors: string[] = [];

  if (!ID_PATTERN.test(p.id)) {
    errors.push(`id must be a category digit followed by ${ID_SUFFIX_LENGTH} letters or numbers`);
  } else if (Number(p.id[0]) !== p.category) {
    errors.push(`id starts with ${p.id[0]} but category is ${p.category}`);
  }
  if (!isCategoryId(p.category)) errors.push(`unknown category ${p.category}`);
  if (p.text.trim() === '') errors.push('prompt text is empty');
  if (!Number.isFinite(p.authorScore) || p.authorScore < 0 || p.authorScore > 16) {
    errors.push(`author score must be between 0 and 16 (got ${p.authorScore})`);
  }
  if (p.answers.length < MIN_ANSWERS || p.answers.length > MAX_ANSWERS) {
    errors.push(`needs ${MIN_ANSWERS}–${MAX_ANSWERS} correct answers (got ${p.answers.length})`);
  }
  if (p.note) {
    const leaked = answersInNote(p.note, p.answers);
    if (leaked.length) errors.push(`note gives away accepted answers: ${leaked.join(', ')}`);
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** One random character from ID_CHARS, without modulo bias. */
function randomIdChar(): string {
  const byte = new Uint8Array(1);
  const limit = 256 - (256 % ID_CHARS.length);
  do crypto.getRandomValues(byte);
  while (byte[0] >= limit);
  return ID_CHARS[byte[0] % ID_CHARS.length];
}

/** A fresh id in the given category. `isTaken` checks the database; collisions are rare but retried. */
export async function generatePromptId(
  category: CategoryId,
  isTaken: (id: string) => Promise<boolean>,
  maxAttempts = 10,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = String(category) + Array.from({ length: ID_SUFFIX_LENGTH }, randomIdChar).join('');
    if (!(await isTaken(id))) return id;
  }
  throw new Error(`no free prompt id in category ${category} after ${maxAttempts} attempts`);
}
