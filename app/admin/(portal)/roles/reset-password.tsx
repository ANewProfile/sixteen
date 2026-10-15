'use client';

import { useCallback, useState, type FormEvent } from 'react';
import styles from '../../admin.module.css';
import { SecretAlert } from '../../secret-alert';
import { useForgetWhenHidden } from '../../token-alert';

/** Supreme leaders only: gives someone a generated temporary password. */
export function ResetPassword() {
  const [result, setResult] = useState<{ password: string; notice: string } | { error: string } | null>(null);
  const [pending, setPending] = useState(false);
  useForgetWhenHidden(useCallback(() => setResult(null), []));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const username = String(new FormData(event.currentTarget).get('username') ?? '').trim();
    if (!confirm(`Reset ${username}’s password? Their current password and any admin token stop working.`)) return;
    setPending(true);
    try {
      const res = await fetch('/api/admin/users/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const body = await res.json();
      setResult(res.ok ? body : { error: body.error });
    } catch {
      setResult({ error: 'could not reach the server' });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel}>
      <h2>Reset a password</h2>
      <p className={styles.muted}>
        For anyone, players and admins alike. You get a temporary password to pass on; it stays their password until
        they change it. The reset is logged, the password isn’t.
      </p>
      <form className={styles.row} onSubmit={submit}>
        <label className={styles.field}>
          <span>Username</span>
          <input name="username" required />
        </label>
        <button className={styles.secondary} disabled={pending}>
          Reset password
        </button>
      </form>
      {result && 'password' in result && <SecretAlert title="Temporary password" notice={result.notice} secret={result.password} />}
      {result && 'error' in result && <p className={styles.error}>{result.error}</p>}
    </section>
  );
}
