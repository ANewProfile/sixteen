'use client';

import Link from 'next/link';
import { useCallback, useState, type FormEvent } from 'react';
import styles from '../admin.module.css';
import { TokenAlert, useForgetWhenHidden } from '../token-alert';

type State = { kind: 'idle' } | { kind: 'error'; message: string } | { kind: 'signed-in'; token: string; notice: string };

export function LoginForm() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [pending, setPending] = useState(false);
  useForgetWhenHidden(useCallback(() => setState({ kind: 'idle' }), []));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      const body = await res.json();
      setState(res.ok ? { kind: 'signed-in', token: body.token, notice: body.notice } : { kind: 'error', message: body.error });
    } catch {
      setState({ kind: 'error', message: 'could not reach the server' });
    } finally {
      setPending(false);
    }
  }

  if (state.kind === 'signed-in') {
    return (
      <>
        <TokenAlert token={state.token} notice={state.notice} />
        <Link className={styles.button} href="/admin">
          Continue to dashboard
        </Link>
      </>
    );
  }

  return (
    <form className={styles.panel} onSubmit={submit}>
      <label className={styles.field}>
        <span>Username</span>
        <input name="username" autoComplete="username" required />
      </label>
      <label className={styles.field}>
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.kind === 'error' && (
        <p className={styles.error} role="alert">
          {state.message[0].toUpperCase() + state.message.slice(1)}.
        </p>
      )}
      <button className={styles.button} disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in to admin'}
      </button>
    </form>
  );
}
