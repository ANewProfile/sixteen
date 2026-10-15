import type { Metadata } from 'next';
import { io } from 'next/cache';
import { Suspense } from 'react';
import { pageAdmin } from '@/lib/admin-session';
import { canChangeDailies, upcomingDailies } from '@/lib/dailies';
import { utcDay } from '@/lib/dates';
import { db } from '@/lib/db';
import { ADMIN_DAILY_RANGE, ratedPrompts } from '@/lib/sets';
import styles from '../../admin.module.css';
import { toRatings } from '../prompt-hint';
import { DailyControls } from './daily-controls';

export const metadata: Metadata = { title: 'Dailies · SIXTEEN Admin' };

export default function DailiesPage() {
  return (
    <>
      <h1>Dailies</h1>
      <p className={styles.muted}>
        A Daily is 5 prompt ids from 5 different categories with an average difficulty of {ADMIN_DAILY_RANGE.min}–
        {ADMIN_DAILY_RANGE.max}. A new one goes on the earliest day from today without a Daily. Days nobody schedules get
        a generated Daily the first time someone plays. Days are UTC.
      </p>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <Schedule />
      </Suspense>
    </>
  );
}

async function Schedule() {
  const admin = await pageAdmin();
  // Today decides which Dailies are upcoming, so it's read per request, never baked into a prerender.
  await io();
  const now = new Date();
  return (
    <DailyControls
      today={utcDay(now)}
      dailies={await upcomingDailies(db, now)}
      canChange={canChangeDailies(admin)}
      ratings={toRatings(await ratedPrompts(db))}
      range={ADMIN_DAILY_RANGE}
    />
  );
}
