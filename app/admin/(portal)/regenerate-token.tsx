'use client';

import { useCallback, useState } from 'react';
import styles from '../admin.module.css';
import { TokenAlert, useForgetWhenHidden } from '../token-alert';

/** Replaces your own token, e.g. after it leaked. Nobody can do this to another admin. */
export function RegenerateToken() {
  const [result, setResult] = useState<{ token: string; notice: string } | { error: string } | null>(null);
  const [pending, setPending] = useState(false);
  useForgetWhenHidden(useCallback(() => setResult(null), []));

  async function regenerate() {
    if (!confirm('Replace your admin token? Scripts using the current one will stop working.')) return;
    setPending(true);
    try {
      const res = await fetch('/api/admin/admins/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate' }),
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
      <h2>Your token</h2>
      <p className={styles.muted}>
        Scripts send it as <code>Authorization: Bearer …</code>. It changes every time you sign in.
      </p>
      {result && 'token' in result && <TokenAlert token={result.token} notice={result.notice} />}
      {result && 'error' in result && <p className={styles.error}>{result.error}</p>}
      <div className={styles.row}>
        <button type="button" className={styles.secondary} onClick={regenerate} disabled={pending}>
          Regenerate my token
        </button>
      </div>
    </section>
  );
}
