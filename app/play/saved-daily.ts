/* The Daily as saved in this browser, and keeping it in step with a signed-in
 * player's account: the account's finished Daily is copied here (so it stays
 * after signing out), and a Daily finished here as a guest is moved into the
 * account. When both have one, the account's wins. */

export interface Card {
  id: string;
  category: number;
  text: string;
  note: string | null;
  difficulty: number;
}

export interface PlaySet {
  date?: string;
  prompts: Card[];
  difficulty: number;
}

export type EntryResult = { result: 'hit'; answer: number } | { result: 'ignored' } | { result: 'miss' };

export interface Final {
  status: 'final';
  results: EntryResult[];
  hits: number;
  misses: number;
  score: number;
  answers: string[];
}

export interface RoundState {
  /** Per entry, its attempts: the guess, then any replies to prompts. */
  attempts: string[][];
  /** Entries that need more detail, while the round is unresolved. */
  prompts: { entry: number; ask?: string }[] | null;
  final: Final | null;
}

export interface GameState {
  set: PlaySet;
  index: number;
  rounds: RoundState[];
  /** Past the last prompt: showing the results. */
  done: boolean;
  recorded: boolean;
}

const SAVE_PREFIX = 'sixteen:daily:';
const saveKey = (date: string) => `${SAVE_PREFIX}${date}`;

/** Storage can be unavailable (private windows, blocked site data); the game still works, just unsaved. */
function loadDate(date: string): GameState | null {
  try {
    const raw = localStorage.getItem(saveKey(date));
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export const sameSet = (a: PlaySet, b: PlaySet) => a.prompts.map((p) => p.id).join() === b.prompts.map((p) => p.id).join();

export function loadSaved(set: PlaySet): GameState | null {
  const saved = loadDate(set.date!);
  return saved && sameSet(saved.set, set) ? saved : null;
}

export function save(state: GameState) {
  if (!state.set.date) return;
  try {
    localStorage.setItem(saveKey(state.set.date), JSON.stringify(state));
    // Only today's and yesterday's games matter; drop older ones.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(SAVE_PREFIX) && key < saveKey(yesterday(state.set.date))) localStorage.removeItem(key);
    }
  } catch {
    // Not saved; nothing else to do.
  }
}

function yesterday(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Brings one day's Daily in step with the account, if someone is signed in.
 * Returns the finished game this browser should now show, or null if nothing
 * changed (a guest, or neither side has finished it).
 */
export async function syncDaily(date: string): Promise<GameState | null> {
  const res = await fetch(`/api/account/daily?date=${encodeURIComponent(date)}`);
  if (!res.ok) return null;
  const { signedIn, game } = (await res.json()) as { signedIn: boolean; game: GameState | null };
  if (!signedIn) return null;
  if (game) {
    save(game);
    return game;
  }
  // Only a game that was recorded as a guest moves over; an unrecorded one is recorded to the account from the results screen.
  const local = loadDate(date);
  if (!local?.done || !local.recorded) return null;
  const moved = await fetch('/api/account/daily', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, game: local }),
  });
  if (!moved.ok) return null;
  const kept = ((await moved.json()) as { game: GameState }).game;
  save(kept);
  return kept;
}

/** After signing in: syncs every Daily this browser still holds (today's and yesterday's at most). */
export async function syncSavedDailies(): Promise<void> {
  const dates: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(SAVE_PREFIX)) dates.push(key.slice(SAVE_PREFIX.length));
    }
  } catch {
    return;
  }
  await Promise.allSettled(dates.map(syncDaily));
}
