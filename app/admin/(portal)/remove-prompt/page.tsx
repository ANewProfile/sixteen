import type { Metadata } from 'next';
import { Suspense } from 'react';
import { canRemovePrompts } from '@/lib/admin';
import { pageAdmin } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { ratedPrompts } from '@/lib/sets';
import styles from '../../admin.module.css';
import { toRatings } from '../prompt-hint';
import { RemoveForm } from './remove-form';

export const metadata: Metadata = { title: 'Remove a prompt · SIXTEEN Admin' };

export default function RemovePromptPage() {
  return (
    <>
      <h1>Remove a prompt</h1>
      <p className={styles.muted}>
        Prompt ids are shown on each question. Removing a prompt deletes it; players’ stats are not affected. A prompt
        in today’s Daily can’t be removed. If it’s in a future Daily, give a replacement from the same category, within
        1 point of difficulty, that isn’t already in that day’s Daily.
      </p>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <Allowed />
      </Suspense>
    </>
  );
}

async function Allowed() {
  const admin = await pageAdmin();
  if (!canRemovePrompts(admin.role)) return <p>Only right-hand admins and supreme leaders can remove prompts.</p>;
  return <RemoveForm ratings={toRatings(await ratedPrompts(db))} />;
}
