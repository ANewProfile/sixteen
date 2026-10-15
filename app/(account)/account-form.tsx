'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { syncSavedDailies } from '../play/saved-daily';
import styles from '../play/play.module.css';

/** Sign in or create an account; either way this browser's finished Dailies are then synced with the account. */
export function AccountForm({ kind }: { kind: 'signin' | 'signup' }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signup = kind === 'signup';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (signup && data.get('password') !== data.get('confirm')) {
      setError('The passwords don’t match.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: data.get('username'), password: data.get('password'), email: data.get('email') || null }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error[0].toUpperCase() + body.error.slice(1) + '.');
        return;
      }
      await syncSavedDailies();
      router.push('/play');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
      <label className={styles.entry}>
        <span>Username</span>
        <input name="username" autoComplete="username" required {...(signup && { minLength: 2, maxLength: 16, pattern: '[A-Za-z0-9_\\-]*[A-Za-z][A-Za-z0-9_\\-]*' })} />
        {signup && <span className={`${styles.muted} ${styles.small}`}>2–16 letters, digits, - or _, with at least one letter. Shown exactly as you type it.</span>}
      </label>
      <label className={styles.entry}>
        <span>Password{signup && ' (8+ characters)'}</span>
        <input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined} required />
      </label>
      {signup && (
        <>
          <label className={styles.entry}>
            <span>Password again</span>
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label className={styles.entry}>
            <span>Email (optional)</span>
            <input name="email" type="email" autoComplete="email" />
            <span className={`${styles.muted} ${styles.small}`}>Only used if you need your password reset.</span>
          </label>
        </>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.button} disabled={pending}>
        {pending ? (signup ? 'Creating…' : 'Signing in…') : signup ? 'Create account' : 'Sign in'}
      </button>
      <p className={`${styles.muted} ${styles.small}`}>
        {signup ? 'Already have an account? ' : 'New here? '}
        <Link className={styles.link} href={signup ? '/signin' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}</Link>
        {' · '}A Daily you finished here as a guest moves into your account.
      </p>
    </form>
  );
}
