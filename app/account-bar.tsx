'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './play/play.module.css';

/** Who is signed in, with a link to their profile; or sign-in links for a guest. */
export function AccountBar() {
  const [name, setName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    fetch('/api/account/me')
      .then((res) => res.json())
      .then((body: { player: { username: string } | null }) => setName(body.player?.username ?? null))
      .catch(() => setName(null));
  }, []);

  if (name === undefined) return <span className={`${styles.muted} ${styles.small}`}>&nbsp;</span>;
  if (name === null) {
    return (
      <span className={styles.small}>
        <Link className={styles.link} href="/signin">Sign in</Link> · <Link className={styles.link} href="/signup">Create account</Link>
      </span>
    );
  }
  return (
    <span className={styles.small}>
      <Link className={styles.link} href="/profile">{name}</Link>
    </span>
  );
}
