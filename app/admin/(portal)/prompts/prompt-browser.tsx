'use client';

import { useDeferredValue, useState } from 'react';
import type { PromptListing } from '@/lib/admin';
import { CATEGORIES } from '@/lib/categories';
import styles from '../../admin.module.css';

type Listing = Omit<PromptListing, 'createdAt'> & { created: string };

const joined = (xs?: string[]) => (xs?.length ? xs.join('; ') : null);

/** Searching and filtering happen in the browser; every prompt is already loaded. */
export function PromptBrowser({ prompts }: { prompts: Listing[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const search = useDeferredValue(query.trim().toLowerCase());

  const shown = prompts.filter(
    (p) =>
      (category === '' || p.category === Number(category)) &&
      (search === '' || p.id.toLowerCase().includes(search) || p.text.toLowerCase().includes(search)),
  );

  return (
    <>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Search by id or prompt text</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={styles.muted}>
        Showing {shown.length} of {prompts.length}.
      </p>
      <ul className={styles.list}>
        {shown.map((p) => (
          <li key={p.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className={styles.row} style={{ justifyContent: 'space-between' }}>
              <span>
                <code>{p.id}</code> · {CATEGORIES[p.category].icon} {CATEGORIES[p.category].name}
              </span>
              <strong>Difficulty {p.rating.toFixed(2)}</strong>
            </div>
            <span>{p.text}</span>
            {p.note && <span className={styles.muted}>Note: {p.note}</span>}
            <span className={styles.time}>
              Author score {p.authorScore} · {p.answers.length} answers · played {p.playCount}{' '}
              {p.playCount === 1 ? 'time' : 'times'}
              {p.average !== null && `, average ${p.average.toFixed(2)} points`} · added by {p.createdBy ?? 'a deleted account'},{' '}
              {p.created}
            </span>
            <details className={styles.extras} style={{ marginLeft: 0 }}>
              <summary>Answers</summary>
              <ol style={{ paddingLeft: '1.5rem' }}>
                {p.answers.map((a, i) => (
                  <li key={i} style={{ display: 'list-item', border: 0, padding: '2px 0' }}>
                    <strong>{a.canonical}</strong>
                    {joined(a.aliases) && <> · aliases: {joined(a.aliases)}</>}
                    {joined(a.prompts) && <> · prompt on: {joined(a.prompts)}</>}
                    {a.ask && <> · asks “{a.ask}”</>}
                    {joined(a.rejects) && <> · rejects: {joined(a.rejects)}</>}
                  </li>
                ))}
              </ol>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
