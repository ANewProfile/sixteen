'use client';

import styles from '../admin.module.css';

/**
 * Forgets this browser's session. The token stays valid for scripts.
 *
 * A full page load, not router.push: Next keeps recently visited pages alive
 * (hidden) in memory, so a client-side navigation would leave the shown token,
 * form drafts and admin pages behind in this tab after signing out.
 */
export function LogoutButton() {
  return (
    <button
      type="button"
      className={styles.secondary}
      onClick={async () => {
        await fetch('/api/admin/logout', { method: 'POST' });
        window.location.replace('/admin/login');
      }}
    >
      Sign out
    </button>
  );
}
