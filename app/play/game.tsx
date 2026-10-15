'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { CATEGORIES } from '@/lib/categories';
import { MAX_ENTRIES } from '@/lib/scoring';
import { shareText } from '@/lib/share';
import styles from './play.module.css';
import {
  loadSaved, save, sameSet, syncDaily, type Card, type Final, type GameState, type PlaySet, type RoundState,
} from './saved-daily';

type Mode = 'daily' | 'infinite';

/* ─── talking to the server ─── */

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'something went wrong');
  return json as T;
}

const newRound = (): RoundState => ({ attempts: [], prompts: null, final: null });

const inProgress = (s: GameState | null) => !!s && !s.done && (s.index > 0 || s.rounds[0].attempts.length > 0);

export function Game({ mode }: { mode: Mode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load the set (and, for the Daily, any saved progress for that day).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/play/${mode}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'no game is available right now');
        return json as PlaySet;
      })
      .then(async (set) => {
        // A signed-in player's account may hold today's finished Daily from another device; it takes precedence.
        const synced = mode === 'daily' ? await syncDaily(set.date!).catch(() => null) : null;
        if (cancelled) return;
        const saved = synced && sameSet(synced.set, set) ? synced : mode === 'daily' ? loadSaved(set) : null;
        setState(saved ?? { set, index: 0, rounds: set.prompts.map(newRound), done: false, recorded: false });
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // An Infinite game in progress is lost if the page is left; ask first.
  useEffect(() => {
    if (mode !== 'infinite' || !inProgress(state)) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [mode, state]);

  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const update = (next: GameState) => {
    setState(next);
    if (mode === 'daily') save(next);
  };

  /** Records the finished game once; the saved Daily remembers it, so a reload never counts it twice. */
  async function finish(done: GameState) {
    update(done);
    setRecording(true);
    setRecordError(null);
    const finals = done.rounds.map((r) => r.final!);
    try {
      // The whole game goes with a Daily: a signed-in player's account keeps it for their other devices.
      const reply = await post<{ points: number; game?: GameState }>('/api/play/record', {
        mode,
        ...(done.set.date && { date: done.set.date, game: done }),
        rounds: done.set.prompts.map((p, i) => ({ promptId: p.id, correct: finals[i].hits, misses: finals[i].misses })),
      });
      // The account already had this Daily from another device: that one stands.
      update(reply.game ?? { ...done, recorded: true });
    } catch (err) {
      setRecordError((err as Error).message);
    } finally {
      setRecording(false);
    }
  }

  const back = (
    <Link
      href="/play"
      className={styles.secondary}
      onClick={(e) => {
        if (mode === 'infinite' && inProgress(state) && !confirm('Leave this game? Your progress will be lost and it won’t be recorded.')) {
          e.preventDefault();
        }
      }}
    >
      ← Back
    </Link>
  );

  const top = (
    <div className={styles.top}>
      {back}
      <span className={styles.brand}>SIXTEEN {mode === 'daily' ? 'Daily' : 'Infinite'}</span>
    </div>
  );

  if (loadError) {
    return (
      <main className={styles.page}>
        {top}
        <p className={styles.error}>Couldn’t start a game: {loadError}.</p>
      </main>
    );
  }
  if (!state) {
    return (
      <main className={styles.page}>
        {top}
        <p className={styles.muted}>Loading…</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {top}
      {state.done ? (
        <Results mode={mode} state={state} recording={recording} recordError={recordError} retry={() => finish(state)} />
      ) : (
        <Round key={state.index} mode={mode} state={state} update={update} finish={finish} />
      )}
    </main>
  );
}

/* ─── one prompt ─── */

function Round({
  mode, state, update, finish,
}: { mode: Mode; state: GameState; update: (s: GameState) => void; finish: (s: GameState) => void }) {
  const card = state.set.prompts[state.index];
  const round = state.rounds[state.index];
  const category = CATEGORIES[card.category];
  const [drafts, setDrafts] = useState<string[]>(() => Array(MAX_ENTRIES).fill(''));
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitted = round.attempts.length > 0;
  const prompted = new Map((round.prompts ?? []).map((p) => [p.entry, p.ask]));
  const last = state.index === state.set.prompts.length - 1;

  const setRound = (next: RoundState) =>
    update({ ...state, rounds: state.rounds.map((r, i) => (i === state.index ? next : r)) });

  async function check(attempts: string[][]) {
    setPending(true);
    setError(null);
    try {
      const res = await post<Final | { status: 'prompt'; prompts: { entry: number; ask?: string }[] }>('/api/play/check', {
        promptId: card.id,
        entries: attempts,
      });
      // Saved the moment results come back, so reloading can't be used to try again.
      setRound(res.status === 'final' ? { attempts, prompts: null, final: res } : { attempts, prompts: res.prompts, final: null });
      setReplies({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!submitted) {
      const guesses = drafts.map((d) => d.trim()).filter(Boolean);
      // Giving no answers is allowed (0 points), but it reveals the answers, so an empty Enter press is confirmed.
      if (guesses.length || confirm('Submit no answers? You’ll get 0 points and the answers will be revealed.')) {
        check(guesses.map((g) => [g]));
      }
    } else if (round.prompts) {
      check(round.attempts.map((a, i) => (prompted.has(i) ? [...a, (replies[i] ?? '').trim()] : a)));
    }
  }

  const repliesReady = [...prompted.keys()].every((i) => (replies[i] ?? '').trim());

  return (
    <>
      <div className={styles.card}>
        <div className={styles.meta}>
          <span>
            {state.index + 1} / {state.set.prompts.length} · {category.icon} {category.name}
          </span>
          <span>Difficulty {card.difficulty.toFixed(1)}</span>
        </div>
        <p className={styles.promptText}>{card.text}</p>
        {card.note && <p className={styles.muted}>{card.note}</p>}
        <span className={styles.id}>#{card.id}</span>
      </div>

      {round.final ? (
        <RoundResult card={card} round={round} />
      ) : (
        <form className={styles.entries} onSubmit={submit}>
          {!submitted &&
            drafts.map((d, i) => (
              <label key={i} className={styles.entry}>
                <input
                  value={d}
                  maxLength={100}
                  autoComplete="off"
                  aria-label={`Answer ${i + 1}`}
                  placeholder={`Answer ${i + 1}`}
                  onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </label>
            ))}
          {submitted &&
            round.attempts.map((a, i) => (
              <div key={i} className={styles.entry}>
                <input value={a.join(' → ')} disabled aria-label={`Answer ${i + 1}`} />
                {prompted.has(i) && (
                  <>
                    <span className={styles.ask}>{prompted.get(i) ?? 'Prompt: be more specific'}</span>
                    <input
                      value={replies[i] ?? ''}
                      maxLength={100}
                      autoComplete="off"
                      autoFocus={i === [...prompted.keys()][0]}
                      aria-label={`More detail for answer ${i + 1}`}
                      onChange={(e) => setReplies({ ...replies, [i]: e.target.value })}
                    />
                  </>
                )}
              </div>
            ))}
          {submitted && round.prompts && (
            <p className={`${styles.muted} ${styles.small}`}>
              Some answers need more detail. Prompts are free; results appear once they’re all answered.
            </p>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <button
            className={styles.button}
            disabled={pending || (submitted && !repliesReady)}
          >
            {pending ? 'Checking…' : !submitted && !drafts.some((d) => d.trim()) ? 'Submit no answers' : 'Submit'}
          </button>
        </form>
      )}

      {round.final && (
        <button
          type="button"
          className={styles.button}
          onClick={() => (last ? finish({ ...state, done: true }) : update({ ...state, index: state.index + 1 }))}
        >
          {last ? 'See results' : 'Next prompt'}
        </button>
      )}
      {mode === 'daily' && !round.final && <p className={`${styles.muted} ${styles.small}`}>Your Daily progress is saved.</p>}
    </>
  );
}

function RoundResult({ card, round }: { card: Card; round: RoundState }) {
  const final = round.final!;
  const found = new Set(final.results.flatMap((r) => (r.result === 'hit' ? [r.answer] : [])));
  return (
    <div className={styles.card}>
      <div className={styles.entries}>
        {final.results.length === 0 && <p className={styles.muted}>No answers submitted.</p>}
        {final.results.map((r, i) => (
          <div key={i} className={`${styles.result} ${r.result === 'hit' ? styles.hit : r.result === 'miss' ? styles.miss : ''}`}>
            <span>{round.attempts[i].at(-1)}</span>
            <span>
              {r.result === 'hit' ? `✅ ${final.answers[r.answer]}` : r.result === 'miss' ? '❌' : '⬜ already counted'}
            </span>
          </div>
        ))}
      </div>
      <p className={styles.points}>
        {final.score > 0 ? '+' : ''}
        {final.score} points
      </p>
      <p className={`${styles.muted} ${styles.small}`}>All answers for #{card.id}:</p>
      <ul className={styles.answers}>
        {final.answers.map((a, i) => (
          <li key={i} className={found.has(i) ? styles.found : undefined}>
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── the end ─── */

function Results({
  mode, state, recording, recordError, retry,
}: { mode: Mode; state: GameState; recording: boolean; recordError: string | null; retry: () => void }) {
  const [copied, setCopied] = useState(false);
  const finals = state.rounds.map((r) => r.final!);
  const total = finals.reduce((sum, f) => sum + f.score, 0);

  const text = shareText({
    mode,
    date: state.set.date,
    difficulty: state.set.difficulty,
    site: typeof window === 'undefined' ? '' : window.location.origin,
    rounds: state.set.prompts.map((p, i) => ({
      category: p.category,
      difficulty: p.difficulty,
      marks: finals[i].results.map((r) => r.result),
      points: finals[i].score,
    })),
  });

  return (
    <>
      <div className={styles.total}>
        <span className={styles.muted}>{mode === 'daily' ? `Daily · ${state.set.date}` : 'Infinite'}</span>
        <strong>{total}</strong>
        <span>points</span>
      </div>
      <ul className={styles.rounds}>
        {state.set.prompts.map((p, i) => (
          <li key={p.id}>
            <span>
              {CATEGORIES[p.category].icon} {CATEGORIES[p.category].name}{' '}
              <span className={styles.muted}>({p.difficulty.toFixed(1)})</span>
              <br />
              {finals[i].results.length
                ? finals[i].results.map((r) => (r.result === 'hit' ? '✅' : r.result === 'miss' ? '❌' : '⬜')).join('')
                : <span className={styles.muted}>no answers</span>}
            </span>
            <span className={styles.points}>
              {finals[i].score > 0 ? '+' : ''}
              {finals[i].score}
            </span>
          </li>
        ))}
      </ul>
      <p className={`${styles.muted} ${styles.small}`}>Set difficulty {state.set.difficulty.toFixed(1)}</p>
      {!state.recorded &&
        (recording ? (
          <p className={styles.muted}>Recording your game…</p>
        ) : (
          <p className={recordError ? styles.error : styles.muted}>
            {recordError ? `Your game wasn’t recorded: ${recordError}.` : 'This game hasn’t been recorded yet.'}{' '}
            <button type="button" className={styles.secondary} onClick={retry}>
              {recordError ? 'Try again' : 'Record it'}
            </button>
          </p>
        ))}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
        >
          {copied ? 'Copied!' : 'Copy results'}
        </button>
        {mode === 'infinite' ? (
          <button type="button" className={styles.secondary} onClick={() => window.location.reload()}>
            Play again
          </button>
        ) : (
          <Link href="/play" className={styles.secondary}>
            Done · new Daily tomorrow
          </Link>
        )}
      </div>
    </>
  );
}
