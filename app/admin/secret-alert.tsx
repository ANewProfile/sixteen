'use client';

import { useState, type ReactNode } from 'react';
import styles from './admin.module.css';

/** A one-time secret (e.g. a temporary password) with a copy button. */
export function SecretAlert({
  title, notice, secret, children,
}: { title: string; notice: string; secret: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.alert} role="alert">
      <strong>{title}</strong>
      <p>{notice}</p>
      {children}
      <div className={styles.token}>{secret}</div>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => navigator.clipboard.writeText(secret).then(() => setCopied(true))}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
