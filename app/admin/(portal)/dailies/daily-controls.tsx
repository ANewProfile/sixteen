'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import styles from '../../admin.module.css';
import { PromptHint, type Ratings } from '../prompt-hint';

/** The allowed set difficulty; passed in rather than imported, so the database code in lib/sets stays off the client. */
type Range = { min: number; max: number };

interface Daily {
  date: string;
  ids: string[];
  /** null when a prompt in it no longer exists. */
  difficulty: number | null;
}

const idsFrom = (form: HTMLFormElement) => [1, 2, 3, 4, 5].map((n) => String(new FormData(form).get(`id${n}`) ?? '').trim());

/** Five id inputs, each showing its prompt's category and rating, plus the set's difficulty once all five are known. */
function IdInputs({ initial = [], ratings, range }: { initial?: string[]; ratings: Ratings; range: Range }) {
  const [ids, setIds] = useState(() => [0, 1, 2, 3, 4].map((i) => initial[i] ?? ''));
  const known = ids.map((id) => ratings[id.trim()]).filter(Boolean);
  const average = known.length === 5 ? known.reduce((sum, p) => sum + p.rating, 0) / 5 : null;
  return (
    <>
      <div className={styles.grid}>
        {ids.map((id, i) => (
          <label key={i} className={styles.field}>
            <span>Prompt {i + 1}</span>
            <input
              name={`id${i + 1}`}
              value={id}
              onChange={(e) => setIds(ids.map((x, j) => (j === i ? e.target.value : x)))}
              required
              minLength={8}
              maxLength={8}
              autoComplete="off"
            />
            <PromptHint ratings={ratings} id={id} />
          </label>
        ))}
      </div>
      {average !== null && (
        <p className={average < range.min || average > range.max ? styles.error : styles.muted}>
          Set difficulty {average.toFixed(2)} (must be {range.min}–{range.max})
        </p>
      )}
    </>
  );
}

export function DailyControls({
  today, dailies, canChange, ratings, range,
}: { today: string; dailies: Daily[]; canChange: boolean; ratings: Ratings; range: Range }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Bumped after a Daily is added, to clear the form.
  const [addKey, setAddKey] = useState(0);

  async function send(path: string, body: object, success: (result: Record<string, unknown>) => string) {
    setPending(true);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json();
      setMessage(res.ok ? { ok: true, text: success(result) } : { ok: false, text: result.error });
      if (res.ok) {
        setEditing(null);
        router.refresh();
      }
      return res.ok;
    } catch {
      setMessage({ ok: false, text: 'could not reach the server' });
      return false;
    } finally {
      setPending(false);
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await send('/api/admin/dailies', { ids: idsFrom(form) }, (r) => `Added the Daily for ${r.date}.`)) setAddKey(addKey + 1);
  }

  return (
    <>
      {message && (
        <p className={message.ok ? styles.success : styles.error} role="status">
          {message.text}
        </p>
      )}
      <section className={styles.panel}>
        <h2>Add a Daily</h2>
        <form onSubmit={add} className={styles.panel} style={{ border: 0, padding: 0, background: 'none' }}>
          <IdInputs key={addKey} ratings={ratings} range={range} />
          <div className={styles.row}>
            <button className={styles.button} disabled={pending}>
              Add Daily
            </button>
          </div>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>Upcoming</h2>
        {dailies.length === 0 && <p className={styles.muted}>Nothing scheduled. Today’s will be generated when someone plays.</p>}
        <ul className={styles.list}>
          {dailies.map((d) => (
            <li key={d.date} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className={styles.row} style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>{d.date}</strong>
                  {d.date === today && ' (today)'} · difficulty {d.difficulty === null ? 'unknown' : d.difficulty.toFixed(2)}
                </span>
                {canChange && d.date > today && (
                  <span className={styles.row}>
                    <button type="button" className={styles.secondary} onClick={() => setEditing(editing === d.date ? null : d.date)}>
                      {editing === d.date ? 'Cancel' : 'Change'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={pending}
                      onClick={() =>
                        confirm(`Remove the Daily for ${d.date}? The day will be empty until a Daily is added or generated.`) &&
                        send('/api/admin/dailies/remove', { date: d.date }, () => `Removed the Daily for ${d.date}.`)
                      }
                    >
                      Remove
                    </button>
                  </span>
                )}
              </div>
              <span className={styles.row} style={{ gap: '4px 16px' }}>
                {d.ids.map((id) => (
                  <span key={id}>
                    <code>{id}</code>{' '}
                    <span className={ratings[id] ? styles.muted : styles.error}>
                      ({ratings[id] ? ratings[id].rating.toFixed(2) : 'removed'})
                    </span>
                  </span>
                ))}
              </span>
              {editing === d.date && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send('/api/admin/dailies/change', { date: d.date, ids: idsFrom(e.currentTarget) }, () => `Changed the Daily for ${d.date}.`);
                  }}
                >
                  <IdInputs initial={d.ids} ratings={ratings} range={range} />
                  <div className={styles.row}>
                    <button className={styles.button} disabled={pending}>
                      Save changes
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
