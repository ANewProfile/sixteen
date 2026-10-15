import Link from 'next/link';
import { AccountBar } from './account-bar';
import styles from './play/play.module.css';

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <h1>SIXTEEN</h1>
        <p className={styles.muted}>Five prompts. Name as many answers as you can. Every right answer doubles your points.</p>
        <Link className={styles.button} href="/play">
          Play
        </Link>
        <AccountBar />
        <p className={`${styles.muted} ${styles.small}`}>Guests can play too; an account keeps your stats and your Daily across devices.</p>
      </div>
    </main>
  );
}
