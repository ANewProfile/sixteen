'use client';

import { useState, type FormEvent } from 'react';
import styles from '../admin.module.css';

/** Also how someone given a temporary password replaces it. */
export function ChangePassword() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get('next') !== data.get('confirm')) {
      setMessage({ ok: false, text: 'The new passwords don’t match.' });
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/admin/me/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current: data.get('current'), next: data.get('next') }),
      });
      const body = await res.json();
      if (res.ok) form.reset();
      setMessage(res.ok ? { ok: true, text: 'Password changed.' } : { ok: false, text: body.error });
    } catch {
      setMessage({ ok: false, text: 'could not reach the server' });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel}>
      <h2>Change my password</h2>
      <p className={styles.muted}>If a supreme leader reset your password, set your own here.</p>
      <form className={styles.grid} onSubmit={submit}>
        <label className={styles.field}>
          <span>Current password</span>
          <input name="current" type="password" autoComplete="current-password" required />
        </label>
        <label className={styles.field}>
          <span>New password (8+ characters)</span>
          <input name="next" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label className={styles.field}>
          <span>New password again</span>
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <div className={styles.row}>
          <button className={styles.secondary} disabled={pending}>
            Change password
          </button>
        </div>
      </form>
      {message && <p className={message.ok ? styles.success : styles.error}>{message.text}</p>}
    </section>
  );
}
