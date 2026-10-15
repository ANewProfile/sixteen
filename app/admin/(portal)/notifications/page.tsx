import type { Metadata } from 'next';
import { Suspense } from 'react';
import { readNotifications } from '@/lib/admin';
import { describeNotification, formatTime } from '@/lib/admin-format';
import { pageAdmin } from '@/lib/admin-session';
import { db } from '@/lib/db';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Notifications · SIXTEEN Admin' };

export default function NotificationsPage() {
  return (
    <>
      <h1>Notifications</h1>
      <p className={styles.muted}>Changes to your role, read from the log, so they last about 30 days.</p>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <Inbox />
      </Suspense>
    </>
  );
}

async function Inbox() {
  const admin = await pageAdmin();
  const notes = await readNotifications(db, admin);
  if (!notes.length) return <p>No notifications.</p>;
  return (
    <ul className={styles.list}>
      {notes.map((n) => (
        <li key={n.id}>
          <span>{describeNotification(n)}</span>
          <time className={styles.time} dateTime={n.at.toISOString()}>
            {formatTime(n.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
