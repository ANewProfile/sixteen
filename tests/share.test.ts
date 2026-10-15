import { describe, expect, it } from 'vitest';
import { shareText } from '../lib/share';

describe('shareText', () => {
  it('puts the score first and gives away no answers', () => {
    const text = shareText({
      mode: 'daily',
      date: '2026-10-14',
      difficulty: 7.84,
      site: 'https://sixteen.example',
      rounds: [
        { category: 0, difficulty: 6.4, marks: ['hit', 'hit', 'hit', 'miss'], points: 3 },
        { category: 3, difficulty: 9.1, marks: ['hit', 'hit', 'hit', 'hit', 'hit'], points: 16 },
        { category: 2, difficulty: 5.2, marks: ['hit', 'miss', 'miss'], points: -1 },
        { category: 5, difficulty: 8, marks: ['hit', 'hit', 'ignored'], points: 2 },
        { category: 6, difficulty: 10.3, marks: ['hit', 'hit', 'hit'], points: 4 },
      ],
    });
    expect(text.split('\n')).toEqual([
      'SIXTEEN Daily · 2026-10-14 · 🏆 24 points',
      '🗺️ Geography (6.4)  ✅✅✅❌  +3',
      '🔬 Science (9.1)  ✅✅✅✅✅  +16',
      '📖 Literature (5.2)  ✅❌❌  -1',
      '🎼 Music (8.0)  ✅✅⬜  +2',
      '🏺 Mythology (10.3)  ✅✅✅  +4',
      'Difficulty 7.8',
      'https://sixteen.example',
    ]);
  });

  it('labels Infinite games without a date', () => {
    const text = shareText({ mode: 'infinite', difficulty: 8, site: 's', rounds: [{ category: 1, difficulty: 8, marks: [], points: 0 }] });
    expect(text.split('\n')[0]).toBe('SIXTEEN Infinite · 🏆 0 points');
  });

  it('says "no answers" for a prompt the player submitted nothing for', () => {
    const text = shareText({ mode: 'infinite', difficulty: 8, site: 's', rounds: [{ category: 1, difficulty: 8, marks: [], points: 0 }] });
    expect(text.split('\n')[1]).toBe('🏛️ History (8.0)  no answers  0');
  });
});
