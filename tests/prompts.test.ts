import { describe, expect, it } from 'vitest';
import { countScore, generatePromptId, validatePrompt, type NewPrompt } from '../lib/prompts';

const answers = (n: number) => Array.from({ length: n }, (_, i) => ({ canonical: `Answer ${i}`, aliases: [] }));

const valid: NewPrompt = {
  id: '0aB3xY9z',
  category: 0,
  text: 'Which countries border Afghanistan?',
  note: 'Disputed borders do not count.',
  authorScore: 9,
  answers: [
    { canonical: 'Iran', aliases: [] },
    { canonical: 'Pakistan', aliases: [] },
    { canonical: 'Turkmenistan', aliases: [] },
    { canonical: 'Uzbekistan', aliases: [] },
    { canonical: 'Tajikistan', aliases: [] },
    { canonical: 'China', aliases: ["People's Republic of China", 'PRC'] },
  ],
};

const errorsFor = (p: NewPrompt) => {
  const v = validatePrompt(p);
  return v.ok ? [] : v.errors;
};

describe('countScore', () => {
  it('maps answer-count buckets to expected points', () => {
    const table = [[5, 2], [7, 2], [8, 4], [10, 4], [11, 8], [15, 8], [16, 12], [20, 12], [21, 16], [25, 16]];
    for (const [count, points] of table) expect(countScore(count)).toBe(points);
  });

  it('rejects counts outside 5–25', () => {
    expect(() => countScore(4)).toThrow(RangeError);
    expect(() => countScore(26)).toThrow(RangeError);
  });
});

describe('validatePrompt', () => {
  it('accepts a well-formed prompt', () => {
    expect(validatePrompt(valid)).toEqual({ ok: true });
  });

  it('rejects fewer than 5 or more than 25 answers', () => {
    expect(errorsFor({ ...valid, answers: answers(4) })).toHaveLength(1);
    expect(errorsFor({ ...valid, answers: answers(26) })).toHaveLength(1);
    expect(errorsFor({ ...valid, answers: answers(25) })).toEqual([]);
  });

  it('counts canonical answers, not aliases', () => {
    const fourWithAliases = answers(4).map((a) => ({ ...a, aliases: ['x', 'y'] }));
    expect(errorsFor({ ...valid, answers: fourWithAliases })).toHaveLength(1);
  });

  it('rejects a note that contains an accepted answer or alias', () => {
    expect(errorsFor({ ...valid, note: 'Iran counts.' })[0]).toMatch(/Iran/);
    expect(errorsFor({ ...valid, note: 'The PRC is included.' })[0]).toMatch(/PRC/);
  });

  it('matches whole words only, ignoring case and accents', () => {
    expect(errorsFor({ ...valid, note: 'Iranian-administered areas excluded.' })).toEqual([]);
    expect(errorsFor({ ...valid, note: 'ÍRAN counts.' })).toHaveLength(1);
  });

  it('rejects malformed ids and ids that disagree with the category', () => {
    expect(errorsFor({ ...valid, id: '0abc' })).toHaveLength(1);
    expect(errorsFor({ ...valid, id: '0aB3xY9!' })).toHaveLength(1);
    expect(errorsFor({ ...valid, id: '3aB3xY9z' })[0]).toMatch(/category/);
  });

  it('rejects unknown categories and out-of-range author scores', () => {
    expect(errorsFor({ ...valid, authorScore: 17 })).toHaveLength(1);
    expect(errorsFor({ ...valid, authorScore: -1 })).toHaveLength(1);
    expect(errorsFor({ ...valid, id: 'XaB3xY9z', category: 10 })).toHaveLength(2);
  });
});

describe('generatePromptId', () => {
  it('starts with the category digit and has 7 alphanumeric characters', async () => {
    const id = await generatePromptId(4, async () => false);
    expect(id).toMatch(/^4[A-Za-z0-9]{7}$/);
  });

  it('retries when an id is taken', async () => {
    let calls = 0;
    const id = await generatePromptId(2, async () => ++calls < 3);
    expect(calls).toBe(3);
    expect(id[0]).toBe('2');
  });

  it('gives up after maxAttempts', async () => {
    await expect(generatePromptId(1, async () => true, 3)).rejects.toThrow();
  });
});
