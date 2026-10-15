import Link from 'next/link';
import { Suspense } from 'react';
import { canRemovePrompts } from '@/lib/admin';
import { ROLE_LABELS } from '@/lib/admin-format';
import { managesAdmins, pageAdmin } from '@/lib/admin-session';
import styles from '../admin.module.css';
import { LogoutButton } from './logout-button';

/** Every signed-in admin page shares this header. */
export default function PortalLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin" className={styles.brand}>
          SIXTEEN <span className={styles.badge}>ADMIN</span>
        </Link>
        <Suspense fallback={<nav className={styles.nav} />}>
          <Nav />
        </Suspense>
        <LogoutButton />
      </header>
      {children}
    </main>
  );
}

/** Reads the session, so it streams in behind the boundary. */
async function Nav() {
  const admin = await pageAdmin();
  return (
    <>
      <nav className={styles.nav}>
        <Link href="/admin/prompts">Prompts</Link>
        <Link href="/admin/add-prompt">Add prompts</Link>
        {canRemovePrompts(admin.role) && <Link href="/admin/remove-prompt">Remove a prompt</Link>}
        <Link href="/admin/dailies">Dailies</Link>
        <Link href="/admin/notifications">Notifications</Link>
        <Link href="/admin/log">Log</Link>
        <Link href="/guide/prompts">Guide</Link>
        {managesAdmins(admin) && <Link href="/admin/roles">Roles</Link>}
      </nav>
      <span className={styles.who}>
        {admin.username} · {ROLE_LABELS[admin.role]}
      </span>
    </>
  );
}
