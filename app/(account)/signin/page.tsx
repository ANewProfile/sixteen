import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../../play/play.module.css';
import { AccountForm } from '../account-form';

export const metadata: Metadata = { title: 'Sign in · SIXTEEN' };

export default function Page() {
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <Link href="/" className={styles.secondary}>
          ← Back
        </Link>
        <span className={styles.brand}>SIXTEEN</span>
      </div>
      <h1>Sign in</h1>
      <AccountForm kind="signin" />
    </main>
  );
}
