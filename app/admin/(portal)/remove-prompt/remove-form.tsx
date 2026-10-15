'use client';

import { useState, type FormEvent } from 'react';
import styles from '../../admin.module.css';
import { PromptHint, type Ratings } from '../prompt-hint';

export function RemoveForm({ ratings }: { ratings: Ratings }) {
  const [id, setId] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [removed, replacement] = [id.trim(), replacementId.trim()];
    if (!confirm(`Permanently remove prompt ${removed}?${replacement ? ` ${replacement} replaces it in future Dailies.` : ''}`)) return;
    setPending(true);
    try {
      const res = await fetch('/api/admin/prompts/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: removed, replacementId: replacement || undefined }),
      });
      const body = await res.json();
      if (res.ok) {
        setId('');
        setReplacementId('');
      }
      const replaced = body.replacedIn?.length ? ` ${replacement} now replaces it on ${body.replacedIn.join(', ')}.` : '';
      setMessage(res.ok ? { ok: true, text: `Removed ${removed}.${replaced}` } : { ok: false, text: body.error });
    } catch {
      setMessage({ ok: false, text: 'could not reach the server; nothing was removed' });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel}>
      <form className={styles.grid} onSubmit={submit}>
        <label className={styles.field}>
          <span>Prompt id</span>
          <input value={id} onChange={(e) => setId(e.target.value)} required minLength={8} maxLength={8} autoComplete="off" />
          <PromptHint ratings={ratings} id={id} />
        </label>
        <label className={styles.field}>
          <span>Replacement id (only if it’s in a future Daily)</span>
          <input
            value={replacementId}
            onChange={(e) => setReplacementId(e.target.value)}
            minLength={8}
            maxLength={8}
            autoComplete="off"
          />
          <PromptHint ratings={ratings} id={replacementId} />
        </label>
        <div className={styles.row}>
          <button className={styles.button} disabled={pending}>
            Remove prompt
          </button>
        </div>
      </form>
      {message && (
        <p className={message.ok ? styles.success : styles.error} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
