import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { pageAdmin } from '@/lib/admin-session';
import { GENERATED_RANGE } from '@/lib/sets';
import styles from '../../admin.module.css';
import { PromptForm } from './prompt-form';

export const metadata: Metadata = { title: 'Add prompts · SIXTEEN Admin' };

export default function AddPromptPage() {
  return (
    <>
      <h1>Add prompts</h1>
      <p className={styles.muted}>
        Fill in as many prompts as you like, or paste JSON to fill in the form, then upload them together. Each needs
        5–25 answers. The note must not contain an accepted answer.
      </p>
      <p>
        New to this? Read the{' '}
        <Link className={styles.link} href="/guide/prompts">
          prompt-writing guide
        </Link>{' '}
        first; its checklist covers what makes a good prompt.
      </p>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <SignedIn />
      </Suspense>
    </>
  );
}

async function SignedIn() {
  await pageAdmin();
  return <PromptForm setRange={GENERATED_RANGE} />;
}
