import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../admin.module.css';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Admin sign in · SIXTEEN' };

/** The player login's layout, marked as the admin portal. */
export default function AdminLoginPage() {
  return (
    <main className={`${styles.page} ${styles.login}`}>
      <header className={styles.header}>
        <span className={styles.brand}>
          SIXTEEN <span className={styles.badge}>ADMIN</span>
        </span>
      </header>
      <h1>Admin sign in</h1>
      <p className={styles.muted}>This is the admin portal. Signing in replaces your admin token.</p>
      <LoginForm />
      <p className={styles.muted}>
        Writing prompts?{' '}
        <Link className={styles.link} href="/guide/prompts">
          Read the prompt-writing guide
        </Link>
        .
      </p>
    </main>
  );
}
