import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { canRemovePrompts } from '@/lib/admin';
import { managesAdmins, pageAdmin } from '@/lib/admin-session';
import { canChangeDailies } from '@/lib/dailies';
import styles from '../admin.module.css';
import { ChangePassword } from './change-password';
import { RegenerateToken } from './regenerate-token';

export const metadata: Metadata = { title: 'Admin · SIXTEEN' };

export default function DashboardPage() {
  return (
    <>
      <h1>Dashboard</h1>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <Controls />
      </Suspense>
      <ChangePassword />
      <RegenerateToken />
    </>
  );
}

async function Controls() {
  const admin = await pageAdmin();
  return (
    <div className={styles.cards}>
      <Link className={styles.card} href="/admin/prompts">
        <strong>Prompts</strong>
        <span className={styles.muted}>Browse every prompt with its answers and current difficulty.</span>
      </Link>
      <Link className={styles.card} href="/admin/add-prompt">
        <strong>Add prompts</strong>
        <span className={styles.muted}>Enter one or more prompts, or paste JSON.</span>
      </Link>
      {canRemovePrompts(admin.role) && (
        <Link className={styles.card} href="/admin/remove-prompt">
          <strong>Remove a prompt</strong>
          <span className={styles.muted}>By id, with a replacement if it’s in a future Daily.</span>
        </Link>
      )}
      <Link className={styles.card} href="/admin/dailies">
        <strong>Dailies</strong>
        <span className={styles.muted}>Schedule upcoming Dailies{canChangeDailies(admin) ? ', or change and remove them' : ''}.</span>
      </Link>
      <Link className={styles.card} href="/guide/prompts">
        <strong>Prompt-writing guide</strong>
        <span className={styles.muted}>Read this before adding prompts. Public, so you can share it.</span>
      </Link>
      <Link className={styles.card} href="/admin/notifications">
        <strong>Notifications</strong>
        <span className={styles.muted}>Changes to your role.</span>
      </Link>
      <Link className={styles.card} href="/admin/log">
        <strong>Log</strong>
        <span className={styles.muted}>Everything admins did in about the last 30 days.</span>
      </Link>
      {managesAdmins(admin) && (
        <Link className={styles.card} href="/admin/roles">
          <strong>Roles</strong>
          <span className={styles.muted}>Add, remove, promote and demote admins.</span>
        </Link>
      )}
    </div>
  );
}
