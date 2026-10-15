import type { Metadata } from 'next';
import { Suspense } from 'react';
import { canChangeRole, listAdmins } from '@/lib/admin';
import { managesAdmins, pageAdmin } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { ADMIN_ROLES } from '@/lib/schema';
import styles from '../../admin.module.css';
import { ResetPassword } from './reset-password';
import { RoleControls } from './role-controls';

export const metadata: Metadata = { title: 'Roles · SIXTEEN Admin' };

export default function RolesPage() {
  return (
    <>
      <h1>Roles</h1>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <Roles />
      </Suspense>
    </>
  );
}

/** The options shown come from the same permission rule the API enforces. */
async function Roles() {
  const admin = await pageAdmin();
  if (!managesAdmins(admin)) return <p>Only right-hand admins and supreme leaders can manage roles.</p>;
  const allowedFrom = (current: (typeof ADMIN_ROLES)[number]) =>
    ADMIN_ROLES.filter((to) => canChangeRole(admin.role, current, to));
  const admins = (await listAdmins(db)).map((a) => ({
    ...a,
    options: a.username === admin.username ? [] : allowedFrom(a.role),
  }));
  return (
    <>
      <RoleControls admins={admins} addOptions={allowedFrom('none')} />
      {admin.role === 'supreme' && <ResetPassword />}
    </>
  );
}
