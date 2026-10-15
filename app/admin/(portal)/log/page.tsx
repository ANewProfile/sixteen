import type { Metadata } from 'next';
import { Suspense } from 'react';
import { readLog } from '@/lib/admin';
import { describeEntry, formatTime } from '@/lib/admin-format';
import { pageAdmin } from '@/lib/admin-session';
import { db } from '@/lib/db';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Log · SIXTEEN Admin' };

export default function LogPage() {
  return (
    <>
      <h1>Log</h1>
      <p className={styles.muted}>
        Every admin can see the whole log. Entries older than 30 days are deleted whenever something new is logged.
      </p>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <Entries />
      </Suspense>
    </>
  );
}

async function Entries() {
  await pageAdmin();
  const entries = await readLog(db);
  if (!entries.length) return <p>Nothing has been logged.</p>;
  return (
    <ul className={styles.list}>
      {entries.map((e) => (
        <li key={e.id}>
          <span>{describeEntry(e)}</span>
          <time className={styles.time} dateTime={e.at.toISOString()}>
            {formatTime(e.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
