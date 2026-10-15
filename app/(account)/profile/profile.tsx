'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CATEGORIES } from '@/lib/categories';
import styles from '../../play/play.module.css';

interface Player {
  username: string;
  email: string | null;
  adminRole: 'none' | 'lower' | 'right_hand' | 'supreme';
}

interface Stats {
  dailyGames: number;
  infiniteGames: number;
  pointsPerGame: number | null;
  categories: { category: number; prompts: number; average: number }[];
}

type Message = { ok: boolean; text: string } | null;

async function post(path: string, body: unknown): Promise<Message> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    return res.ok ? null : { ok: false, text: json.error[0].toUpperCase() + json.error.slice(1) + '.' };
  } catch {
    return { ok: false, text: 'Could not reach the server.' };
  }
}

export function Profile() {
  const router = useRouter();
  const [data, setData] = useState<{ player: Player | null; stats?: Stats } | null>(null);

  const load = () =>
    fetch('/api/account/me')
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData({ player: null }));
  useEffect(() => {
    load();
  }, []);

  if (!data) return <p className={styles.muted}>Loading…</p>;
  if (!data.player) {
    return (
      <p>
        You’re not signed in. <Link className={styles.link} href="/signin">Sign in</Link> or{' '}
        <Link className={styles.link} href="/signup">create an account</Link>.
      </p>
    );
  }
  const { player, stats } = data;

  async function signOut() {
    await fetch('/api/account/signout', { method: 'POST' });
    router.push('/');
  }

  return (
    <>
      <h1>{player.username}</h1>
      {stats && <StatsPanel stats={stats} />}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={signOut}>
          Sign out of this device
        </button>
        {player.adminRole !== 'none' && (
          <Link className={styles.secondary} href="/admin">
            Admin portal
          </Link>
        )}
      </div>

      <Section
        title="Change username"
        submitLabel="Change username"
        note="Shown exactly as you type it. Someone else’s name with different capitals counts as taken."
        fields={[
          { name: 'username', label: 'New username', autoComplete: 'username', minLength: 2, maxLength: 16 },
          { name: 'password', label: 'Your password', type: 'password', autoComplete: 'current-password' },
        ]}
        send={async (f) => (await post('/api/account/username', { username: f.username, password: f.password })) ?? (load(), { ok: true, text: 'Username changed.' })}
      />

      <Section
        title="Change password"
        submitLabel="Change password"
        note="Signs you out on every other device."
        fields={[
          { name: 'current', label: 'Current password', type: 'password', autoComplete: 'current-password' },
          { name: 'next', label: 'New password (8+ characters)', type: 'password', autoComplete: 'new-password', minLength: 8 },
          { name: 'confirm', label: 'New password again', type: 'password', autoComplete: 'new-password', minLength: 8 },
        ]}
        send={async (f) =>
          f.next !== f.confirm
            ? { ok: false, text: 'The new passwords don’t match.' }
            : ((await post('/api/account/password', { current: f.current, next: f.next })) ?? { ok: true, text: 'Password changed. Other devices are signed out.' })
        }
      />

      {player.adminRole === 'supreme' ? (
        <p className={`${styles.muted} ${styles.small}`}>Supreme leaders can’t delete their accounts.</p>
      ) : (
        <Section
          title="Delete account"
          submitLabel="Delete my account forever"
          danger
          note={
            <>
              This deletes your account, your stats and your saved Dailies, and can’t be undone. Games you played still count in
              everyone’s overall stats. Type your username and password to confirm.
            </>
          }
          fields={[
            { name: 'username', label: `Type your username (${player.username})`, autoComplete: 'off' },
            { name: 'password', label: 'Your password', type: 'password', autoComplete: 'current-password' },
          ]}
          send={async (f) => {
            if (!confirm(`Delete the account ${player.username}? This can’t be undone.`)) return null;
            const failed = await post('/api/account/delete', { username: f.username, password: f.password });
            if (failed) return failed;
            router.push('/');
            return null;
          }}
        />
      )}
    </>
  );
}

function StatsPanel({ stats }: { stats: Stats }) {
  return (
    <section className={styles.card}>
      <div className={styles.stats}>
        <span>
          <strong>{stats.dailyGames}</strong>
          <span className={`${styles.muted} ${styles.small}`}>Dailies</span>
        </span>
        <span>
          <strong>{stats.infiniteGames}</strong>
          <span className={`${styles.muted} ${styles.small}`}>Infinite games</span>
        </span>
        <span>
          <strong>{stats.pointsPerGame === null ? '–' : stats.pointsPerGame.toFixed(1)}</strong>
          <span className={`${styles.muted} ${styles.small}`}>points per game</span>
        </span>
      </div>
      {stats.categories.length > 0 && (
        <ul className={styles.rounds}>
          {stats.categories.map((c) => (
            <li key={c.category}>
              <span>
                {CATEGORIES[c.category].icon} {CATEGORIES[c.category].name}{' '}
                <span className={`${styles.muted} ${styles.small}`}>({c.prompts} prompts)</span>
              </span>
              <span className={styles.points}>{c.average.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={`${styles.muted} ${styles.small}`}>Category numbers are average points per prompt.</p>
    </section>
  );
}

interface Field {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
}

function Section({
  title, note, fields, submitLabel, send, danger,
}: {
  title: string;
  note: ReactNode;
  fields: Field[];
  submitLabel: string;
  send: (values: Record<string, string>) => Promise<Message>;
  danger?: boolean;
}) {
  const [message, setMessage] = useState<Message>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v)]));
    setPending(true);
    const result = await send(values);
    setPending(false);
    setMessage(result);
    if (result?.ok) form.reset();
  }

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
      <h2>{title}</h2>
      <p className={`${styles.muted} ${styles.small}`}>{note}</p>
      {fields.map((f) => (
        <label key={f.name} className={styles.entry}>
          <span>{f.label}</span>
          <input name={f.name} type={f.type ?? 'text'} autoComplete={f.autoComplete} minLength={f.minLength} maxLength={f.maxLength} required />
        </label>
      ))}
      {message && <p className={message.ok ? styles.success : styles.error}>{message.text}</p>}
      <button className={`${styles.secondary} ${danger ? styles.danger : ''}`} disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}
