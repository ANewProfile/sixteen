'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { CATEGORIES } from '@/lib/categories';
import { countScore, MAX_ANSWERS, MIN_ANSWERS } from '@/lib/prompts';
import { priorRating } from '@/lib/rating';
import styles from '../../admin.module.css';

/** Lists (aliases, prompts, rejects) are typed in one box each, separated by semicolons (commas appear in real names). */
const ALIAS_SEPARATOR = ';';

interface AnswerDraft {
  canonical: string;
  aliases: string;
  prompts: string;
  ask: string;
  rejects: string;
}

const blankAnswer = (): AnswerDraft => ({ canonical: '', aliases: '', prompts: '', ask: '', rejects: '' });
const hasContent = (a: AnswerDraft) => Object.values(a).some((v) => v.trim());
const splitList = (s: string) => s.split(ALIAS_SEPARATOR).map((x) => x.trim()).filter(Boolean);

interface Draft {
  key: number;
  category: string;
  text: string;
  note: string;
  authorScore: string;
  answers: AnswerDraft[];
  errors?: string[];
}

interface UploadResult {
  added: { index: number; id: string }[];
  failed: { index: number; errors: string[] }[];
  message: string;
}

const blankAnswers = () => Array.from({ length: MIN_ANSWERS }, blankAnswer);

const blankDraft = (key: number): Draft => ({ key, category: '', text: '', note: '', authorScore: '', answers: blankAnswers() });

const isBlank = (d: Draft) =>
  !d.category && !d.text && !d.note && !d.authorScore && !d.answers.some(hasContent);

/** One pasted JSON prompt as a form row. Anything missing is left blank for the admin to fill in. */
function draftFromJson(raw: unknown, key: number): Draft {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('every item must be a prompt object');
  const p = raw as Record<string, unknown>;
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  const answers = Array.isArray(p.answers)
    ? p.answers.map((a) => {
        const ans = (typeof a === 'object' && a !== null ? a : { canonical: a }) as Record<string, unknown>;
        const list = (v: unknown) => (Array.isArray(v) ? v.map(str).join(`${ALIAS_SEPARATOR} `) : str(v));
        return {
          canonical: str(ans.canonical),
          aliases: list(ans.aliases),
          prompts: list(ans.prompts),
          ask: str(ans.ask),
          rejects: list(ans.rejects),
        };
      })
    : [];
  return {
    key,
    category: str(p.category),
    text: str(p.text),
    note: str(p.note),
    authorScore: str(p.authorScore),
    answers: answers.length ? answers : blankAnswers(),
  };
}

/** The difficulty a new prompt starts with, before anyone plays it; null until the answers and author score are valid. */
function startingRating(d: Draft): number | null {
  const filled = d.answers.filter((a) => a.canonical.trim()).length;
  const score = d.authorScore.trim() === '' ? NaN : Number(d.authorScore);
  if (filled < MIN_ANSWERS || filled > MAX_ANSWERS || !(score >= 0 && score <= 16)) return null;
  return priorRating(countScore(filled), score);
}

function StartingRating({ rating, setRange }: { rating: number | null; setRange: { min: number; max: number } }) {
  return (
    <p className={styles.muted} role="status">
      {rating === null
        ? `Starting difficulty: shown once there are ${MIN_ANSWERS}–${MAX_ANSWERS} answers and an author score.`
        : `Starting difficulty ${rating.toFixed(2)} (40% from the number of answers, 60% author score). Generated sets need an average of ${setRange.min}–${setRange.max}.`}
    </p>
  );
}

/** What the upload API expects. Blank answer rows are skipped; bad numbers are sent as null and rejected by the server. */
function toUpload(d: Draft) {
  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));
  return {
    category: num(d.category),
    text: d.text.trim(),
    note: d.note.trim() || null,
    authorScore: num(d.authorScore),
    answers: d.answers.filter(hasContent).map((a) => ({
      canonical: a.canonical.trim(),
      aliases: splitList(a.aliases),
      prompts: splitList(a.prompts),
      ask: a.ask.trim() || undefined,
      rejects: splitList(a.rejects),
    })),
  };
}

/** setRange is passed in rather than imported, so the database code in lib/sets stays off the client. */
export function PromptForm({ setRange }: { setRange: { min: number; max: number } }) {
  const nextKey = useRef(1);
  const newDraft = () => blankDraft(nextKey.current++);

  const [drafts, setDrafts] = useState<Draft[]>(() => [blankDraft(0)]);
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; ids?: string[] } | null>(null);
  const [pending, setPending] = useState(false);

  const update = (key: number, change: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const updateAnswer = (key: number, i: number, change: Partial<AnswerDraft>) =>
    setDrafts((ds) =>
      ds.map((d) => (d.key === key ? { ...d, answers: d.answers.map((a, j) => (j === i ? { ...a, ...change } : a)) } : d)),
    );

  function fillFromJson() {
    try {
      const parsed: unknown = JSON.parse(json);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      if (!items.length) throw new Error('the list is empty');
      const pasted = items.map((item) => draftFromJson(item, nextKey.current++));
      // A single untouched form is replaced rather than left blank above the pasted prompts.
      setDrafts((ds) => [...ds.filter((d) => !isBlank(d)), ...pasted]);
      setJson('');
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof SyntaxError ? `not valid JSON: ${err.message}` : (err as Error).message);
    }
  }

  async function upload() {
    setPending(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(drafts.map(toUpload)),
      });
      const body = await res.json();
      if (!('added' in body)) {
        setResult({ ok: false, text: body.error ?? 'upload failed' });
        return;
      }
      const r = body as UploadResult;
      const added = new Set(r.added.map((a) => a.index));
      const errors = new Map(r.failed.map((f) => [f.index, f.errors]));
      // Added prompts leave the form so they can't be uploaded twice; failed ones stay with their errors.
      const remaining = drafts.flatMap((d, i) => (added.has(i) ? [] : [{ ...d, errors: errors.get(i) }]));
      setDrafts(remaining.length ? remaining : [newDraft()]);
      setResult({ ok: r.added.length > 0, text: r.message, ids: r.added.map((a) => a.id) });
    } catch {
      setResult({ ok: false, text: 'could not reach the server; nothing was uploaded' });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className={styles.panel}>
        <h2>Paste JSON</h2>
        <p className={styles.muted}>
          One prompt or a list:{' '}
          <code>
            {'{ "category", "text", "note", "authorScore", "answers": [{ "canonical", "aliases": [], "prompts": [], "ask", "rejects": [] }] }'}
          </code>
          . <code>prompts</code>, <code>ask</code> and <code>rejects</code> are optional. This fills in the form below for
          you to check; it doesn’t upload. See the <Link href="/guide/prompts">prompt-writing guide</Link>.
        </p>
        <textarea value={json} onChange={(e) => setJson(e.target.value)} aria-label="Prompt JSON" />
        {jsonError && <p className={styles.error}>{jsonError}</p>}
        <div className={styles.row}>
          <button type="button" className={styles.secondary} onClick={fillFromJson} disabled={!json.trim()}>
            Fill form
          </button>
        </div>
      </section>

      {result && (
        <div className={styles.alert} role="status">
          <p className={result.ok ? styles.success : styles.error}>{result.text}</p>
          {result.ids && result.ids.length > 0 && <p className={styles.muted}>New ids: {result.ids.join(', ')}</p>}
        </div>
      )}

      {drafts.map((d, n) => (
        <section key={d.key} className={styles.panel} aria-label={`Prompt ${n + 1}`}>
          <div className={styles.row} style={{ justifyContent: 'space-between' }}>
            <h2>Prompt {n + 1}</h2>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
              disabled={drafts.length === 1}
            >
              Remove prompt
            </button>
          </div>
          {d.errors && (
            <ul className={styles.error} role="alert">
              {d.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Category</span>
              <select value={d.category} onChange={(e) => update(d.key, { category: e.target.value })}>
                <option value="">Choose…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Author score (0–16, expected points)</span>
              <input
                type="number"
                min={0}
                max={16}
                step="any"
                value={d.authorScore}
                onChange={(e) => update(d.key, { authorScore: e.target.value })}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span>Prompt</span>
            <input value={d.text} onChange={(e) => update(d.key, { text: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>Note (optional; never an accepted answer)</span>
            <input value={d.note} onChange={(e) => update(d.key, { note: e.target.value })} />
          </label>
          <StartingRating rating={startingRating(d)} setRange={setRange} />
          <h3 className={styles.muted}>
            Answers ({d.answers.filter((a) => a.canonical.trim()).length} filled, {MIN_ANSWERS}–{MAX_ANSWERS} needed)
          </h3>
          {d.answers.map((a, i) => (
            <div key={i} className={styles.answerBlock}>
              <div className={styles.answer}>
                <span className={styles.muted}>{i + 1}.</span>
                <input
                  placeholder="Answer"
                  aria-label={`Answer ${i + 1}`}
                  value={a.canonical}
                  onChange={(e) => updateAnswer(d.key, i, { canonical: e.target.value })}
                />
                <input
                  placeholder="Aliases, separated by ;"
                  aria-label={`Aliases for answer ${i + 1}`}
                  value={a.aliases}
                  onChange={(e) => updateAnswer(d.key, i, { aliases: e.target.value })}
                />
                <button
                  type="button"
                  className={styles.secondary}
                  aria-label={`Remove answer ${i + 1}`}
                  onClick={() => update(d.key, { answers: d.answers.filter((_, j) => j !== i) })}
                  disabled={d.answers.length === 1}
                >
                  ×
                </button>
              </div>
              <details className={styles.extras} open={!!(a.prompts || a.ask || a.rejects)}>
                <summary>Prompt or reject lines{a.prompts || a.rejects ? ' (set)' : ''}</summary>
                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span>Prompt on (separate with ;)</span>
                    <input value={a.prompts} onChange={(e) => updateAnswer(d.key, i, { prompts: e.target.value })} />
                  </label>
                  <label className={styles.field}>
                    <span>Directed prompt (optional)</span>
                    <input
                      placeholder="e.g. Which Bush?"
                      value={a.ask}
                      onChange={(e) => updateAnswer(d.key, i, { ask: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Reject, exact only (separate with ;)</span>
                    <input value={a.rejects} onChange={(e) => updateAnswer(d.key, i, { rejects: e.target.value })} />
                  </label>
                </div>
              </details>
            </div>
          ))}
          <div className={styles.row}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => update(d.key, { answers: [...d.answers, blankAnswer()] })}
              disabled={d.answers.length >= MAX_ANSWERS}
            >
              Add answer
            </button>
          </div>
        </section>
      ))}

      <div className={styles.row}>
        <button type="button" className={styles.secondary} onClick={() => setDrafts((ds) => [...ds, newDraft()])}>
          Add another prompt
        </button>
        <button type="button" className={styles.button} onClick={upload} disabled={pending}>
          {pending ? 'Uploading…' : `Upload ${drafts.length} prompt${drafts.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </>
  );
}
