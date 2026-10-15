/* The text a player copies to share a finished game. Results only: never a
 * guess or an answer, since friends may not have played yet. */
import { CATEGORIES } from './categories';

export interface ShareRound {
  category: number;
  difficulty: number;
  /** One mark per entry: hit, miss, or ignored (acceptable, but its answer was already counted). */
  marks: ('hit' | 'miss' | 'ignored')[];
  points: number;
}

const MARK = { hit: '✅', miss: '❌', ignored: '⬜' } as const;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function shareText(game: {
  mode: 'daily' | 'infinite';
  date?: string;
  rounds: ShareRound[];
  difficulty: number;
  site: string;
}): string {
  const total = game.rounds.reduce((sum, r) => sum + r.points, 0);
  const title = game.mode === 'daily' ? `SIXTEEN Daily · ${game.date}` : 'SIXTEEN Infinite';
  const lines = game.rounds.map((r) => {
    const c = CATEGORIES[r.category];
    const marks = r.marks.length ? r.marks.map((m) => MARK[m]).join('') : 'no answers';
    return `${c.icon} ${c.name} (${r.difficulty.toFixed(1)})  ${marks}  ${signed(r.points)}`;
  });
  return [`${title} · 🏆 ${total} points`, ...lines, `Difficulty ${game.difficulty.toFixed(1)}`, game.site].join('\n');
}
