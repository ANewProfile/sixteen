import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountBar } from '../account-bar';
import styles from './play.module.css';

export const metadata: Metadata = { title: 'Play · SIXTEEN' };

export default function ChooseMode() {
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <Link href="/" className={styles.secondary}>
          ← Back
        </Link>
        <AccountBar />
      </div>
      <h1>Choose a game</h1>
      <div className={styles.choices}>
        <Link className={styles.choice} href="/play/daily">
          <strong>Daily</strong>
          <span className={styles.muted}>Today’s five prompts, the same for everyone. Your progress is saved.</span>
        </Link>
        <Link className={styles.choice} href="/play/infinite">
          <strong>Infinite</strong>
          <span className={styles.muted}>A fresh random set every time. Leaving mid-game loses it.</span>
        </Link>
      </div>
    </main>
  );
}
