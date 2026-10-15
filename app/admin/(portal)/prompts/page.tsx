import type { Metadata } from 'next';
import { Suspense } from 'react';
import { listPrompts } from '@/lib/admin';
import { formatTime } from '@/lib/admin-format';
import { pageAdmin } from '@/lib/admin-session';
import { db } from '@/lib/db';
import styles from '../../admin.module.css';
import { PromptBrowser } from './prompt-browser';

export const metadata: Metadata = { title: 'Prompts · SIXTEEN Admin' };

export default function PromptsPage() {
  return (
    <>
      <h1>Prompts</h1>
      <p className={styles.muted}>
        Every prompt, newest first. Difficulty is the current rating in expected points (higher is easier): the
        author score and answer count until a prompt has been played 10 times, then mostly players’ results.
      </p>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <All />
      </Suspense>
    </>
  );
}

async function All() {
  await pageAdmin();
  const list = await listPrompts(db);
  return <PromptBrowser prompts={list.map(({ createdAt, ...p }) => ({ ...p, created: formatTime(createdAt) }))} />;
}
