import { describe, expect, it } from 'vitest';
import { judgeEntries, judgeGuess } from '../lib/answers';
import type { Answer } from '../lib/schema';

const a = (canonical: string, ...aliases: string[]): Answer => ({ canonical, aliases });

/** What a single guess comes to: the best answer's name, 'prompt', or 'reject'. */
const verdict = (answers: Answer[], guess: string) => {
  const j = judgeGuess(answers, guess);
  if (j.accepts.length) return answers[j.accepts[0].answer].canonical;
  return j.prompt ? 'prompt' : 'reject';
};

describe('judgeGuess', () => {
  const presidents = [a('John Adams'), a('John Quincy Adams', 'JQA'), a('George Washington')];

  it('tells the Adamses apart when both are on the list', () => {
    expect(verdict(presidents, 'john adams')).toBe('John Adams');
    expect(verdict(presidents, 'john quincy adams')).toBe('John Quincy Adams');
    expect(verdict(presidents, 'JQA')).toBe('John Quincy Adams');
  });

  it('never accepts a bare surname for either Adams', () => {
    expect(verdict(presidents, 'adams')).toBe('reject');
  });

  it('rejects extra words inside an answer, but not before or after it', () => {
    expect(verdict([a('John Adams')], 'john quincy adams')).toBe('reject');
    const rivers = [a('Mississippi River'), a('Nile')];
    expect(verdict(rivers, 'the mississippi river')).toBe('Mississippi River');
    expect(verdict(rivers, 'mississippi river delta')).toBe('Mississippi River');
    expect(verdict(rivers, 'mississippi big river')).toBe('reject');
  });

  it('follows qbreader on word order', () => {
    expect(verdict([a('Mao Zedong')], 'zedong mao')).toBe('Mao Zedong');
  });

  it('accepts aliases and small typos, but not other names', () => {
    const countries = [a('Austria'), a('Sweden'), a('Iran'), a('United States', 'USA', 'America')];
    expect(verdict(countries, 'Austira')).toBe('Austria');
    expect(verdict(countries, 'sweeden')).toBe('Sweden');
    expect(verdict(countries, 'america')).toBe('United States');
    expect(verdict(countries, 'Australia')).toBe('reject');
    expect(verdict(countries, 'iraq')).toBe('reject');
  });

  it('handles accents, hyphens, numerals and abbreviations', () => {
    expect(verdict([a('Antonín Dvořák')], 'antonin dvorak')).toBe('Antonín Dvořák');
    expect(verdict([a('Jean-Paul Sartre')], 'jean paul sartre')).toBe('Jean-Paul Sartre');
    expect(verdict([a('Jean Paul Sartre')], 'jean-paul sartre')).toBe('Jean Paul Sartre');
    expect(verdict([a('Henry VIII')], 'henry 8')).toBe('Henry VIII');
    expect(verdict([a('World War II')], 'ww2')).toBe('World War II');
  });

  it('keeps "or" and ";" inside an answer as part of it', () => {
    const books = [a('Either/Or', 'Either or Or'), a('War and Peace')];
    expect(verdict(books, 'either')).toBe('reject');
    expect(verdict(books, 'either or or')).toBe('Either/Or');
  });

  it('prompts on prompt lines, with the directed prompt if there is one', () => {
    const bushes = [
      { ...a('George W. Bush', 'Dubya'), prompts: ['Bush', 'George Bush'], ask: 'Which Bush?' },
      { ...a('George H. W. Bush'), prompts: ['Bush'] },
    ];
    expect(judgeGuess(bushes.slice(0, 1), 'george bush')).toEqual({ accepts: [], prompt: { ask: 'Which Bush?' } });
    expect(judgeGuess(bushes.slice(1), 'bush')).toEqual({ accepts: [], prompt: {} });
    expect(verdict(bushes, 'dubya')).toBe('George W. Bush');
  });

  it('shows the alphabetically first answer’s question when several answers prompt', () => {
    const list = [
      { ...a('Zeus'), prompts: ['god'], ask: 'Which Zeus?' },
      { ...a('Apollo'), prompts: ['god'], ask: 'Which Apollo?' },
    ];
    expect(judgeGuess(list, 'god').prompt).toEqual({ ask: 'Which Apollo?' });
  });

  it('lets accept beat prompt', () => {
    const list = [{ ...a('Thor'), prompts: ['thunder god'] }, a('Thunder God')];
    expect(verdict(list, 'thunder god')).toBe('Thunder God');
  });

  it('rejects exact matches of reject lines only, as qbreader does', () => {
    const list = [{ ...a('John Adams'), rejects: ['John Quincy Adams'] }];
    expect(verdict(list, 'John Quincy Adams')).toBe('reject');
    expect(verdict(list, 'john adams')).toBe('John Adams');
    const rivers = [{ ...a('Mississippi River'), rejects: ['Mississippi River Delta'] }];
    expect(verdict(rivers, 'mississippi river delta')).toBe('reject');
  });

  it('ranks several accepts by length, then exactness, then alphabetically', () => {
    expect(verdict([a('Georgia'), a("Georgia O'Keeffe")], "georgia o'keeffe")).toBe("Georgia O'Keeffe");
    expect(verdict([a('Gambia'), a('Gambiaa')], 'gambia')).toBe('Gambia');
    // The checker ignores parentheses, so both of these are just "Georgia": a complete tie.
    expect(verdict([a('Georgia (US state)'), a('Georgia (country)')], 'georgia')).toBe('Georgia (country)');
  });

  it('rejects empty guesses', () => {
    expect(verdict(presidents, '   ')).toBe('reject');
  });
});

describe('judgeEntries', () => {
  const list = [
    { ...a('Republic of Georgia', 'Sakartvelo'), prompts: ['Georgia'], ask: 'The country or the state?' },
    { ...a('State of Georgia'), prompts: ['Georgia'] },
    a('Alabama'),
    a('Texas'),
  ];

  it('returns only which entries need a prompt, revealing nothing else', () => {
    expect(judgeEntries(list, [['alabama'], ['georgia'], ['nope']])).toEqual({
      status: 'prompt',
      prompts: [{ entry: 1, ask: 'The country or the state?' }],
    });
  });

  it('resolves a prompt on a later attempt', () => {
    expect(judgeEntries(list, [['alabama'], ['georgia', 'sakartvelo'], ['nope']])).toEqual({
      status: 'final',
      results: [{ result: 'hit', answer: 2 }, { result: 'hit', answer: 0 }, { result: 'miss' }],
      hits: 2,
      misses: 1,
      score: 2 - 1,
    });
  });

  it('counts an entry still prompted or wrong after 3 attempts as a miss', () => {
    expect(judgeEntries(list, [['georgia', 'georgia', 'georgia']])).toMatchObject({ results: [{ result: 'miss' }], score: -1 });
    expect(judgeEntries(list, [['georgia', 'florida']])).toMatchObject({ results: [{ result: 'miss' }] });
  });

  it('ignores a guess whose only answer was already credited: no point, no miss', () => {
    expect(judgeEntries(list, [['texas'], ['TEXAS'], ['alabama']])).toMatchObject({
      results: [{ result: 'hit', answer: 3 }, { result: 'ignored' }, { result: 'hit', answer: 2 }],
      hits: 2,
      misses: 0,
      score: 2,
    });
  });

  it('credits as many guesses as possible, giving a vague guess what is left', () => {
    const adamses = [a('John Adams', 'Adams'), a('Samuel Adams', 'Adams')];
    // "adams" fits both equally; "john adams" fits John Adams better, so it gets him in either order.
    for (const entries of [[['adams'], ['john adams']], [['john adams'], ['adams']]]) {
      const round = judgeEntries(adamses, entries);
      expect(round).toMatchObject({ hits: 2, misses: 0 });
      const johnEntry = entries.findIndex((e) => e[0] === 'john adams');
      expect(round.status === 'final' && round.results[johnEntry]).toEqual({ result: 'hit', answer: 0 });
    }
  });

  it('uses alphabetical order only for complete ties', () => {
    const adamses = [a('Samuel Adams', 'Adams'), a('John Adams', 'Adams')];
    expect(judgeEntries(adamses, [['adams']])).toMatchObject({ results: [{ result: 'hit', answer: 1 }] });
  });

  it('scores five misses as -16', () => {
    expect(judgeEntries(list, [['a'], ['b'], ['c'], ['d'], ['e']])).toMatchObject({ score: -16 });
  });

  it('stays fast when every guess fits every answer', () => {
    const many = Array.from({ length: 25 }, (_, i) => a(`Saint ${String.fromCharCode(65 + i)}`, 'saint'));
    const started = performance.now();
    const round = judgeEntries(many, Array.from({ length: 5 }, () => ['saint']));
    expect(round).toMatchObject({ hits: 5 });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
