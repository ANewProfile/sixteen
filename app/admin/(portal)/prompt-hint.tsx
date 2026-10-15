import { CATEGORIES } from '@/lib/categories';
import styles from '../admin.module.css';

/** Each prompt's current category and rating, by id, so forms can show them as ids are typed. */
export type Ratings = Record<string, { category: number; rating: number }>;

export const toRatings = (rated: { id: string; category: number; rating: number }[]): Ratings =>
  Object.fromEntries(rated.map(({ id, category, rating }) => [id, { category, rating }]));

/** “🗺️ Geography · difficulty 7.20” under an id input, or a warning once a full id matches nothing. */
export function PromptHint({ ratings, id }: { ratings: Ratings; id: string }) {
  const trimmed = id.trim();
  if (trimmed.length < 8) return null;
  const p = ratings[trimmed];
  if (!p) return <span className={styles.error}>No prompt {trimmed}</span>;
  const c = CATEGORIES[p.category];
  return (
    <span className={styles.muted}>
      {c.icon} {c.name} · difficulty {p.rating.toFixed(2)}
    </span>
  );
}
