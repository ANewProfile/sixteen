import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../../play/play.module.css';
import { Profile } from './profile';

export const metadata: Metadata = { title: 'Profile · SIXTEEN' };

export default function ProfilePage() {
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <Link href="/play" className={styles.secondary}>
          ← Play
        </Link>
        <span className={styles.brand}>SIXTEEN</span>
      </div>
      <Profile />
    </main>
  );
}
