'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ROLE_LABELS } from '@/lib/admin-format';
import type { AdminRole } from '@/lib/schema';
import styles from '../../admin.module.css';

interface Row {
  username: string;
  role: AdminRole;
  /** Roles this admin may move them to; empty when they can't be changed. */
  options: AdminRole[];
}

const optionLabel = (role: AdminRole) => (role === 'none' ? 'remove as admin' : ROLE_LABELS[role]);

export function RoleControls({ admins, addOptions }: { admins: Row[]; addOptions: AdminRole[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function change(username: string, role: AdminRole) {
    if (role === 'none' && !confirm(`Remove ${username} as an admin? Their token stops working immediately.`)) return;
    setPending(true);
    try {
      const res = await fetch('/api/admin/admins/role', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, role }),
      });
      const body = await res.json();
      setMessage(res.ok ? { ok: true, text: `${username} is now ${ROLE_LABELS[role]}.` } : { ok: false, text: body.error });
      if (res.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: 'could not reach the server' });
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, username: string) {
    event.preventDefault();
    const role = new FormData(event.currentTarget).get('role') as AdminRole;
    change(username, role);
  }

  return (
    <>
      {message && (
        <p className={message.ok ? styles.success : styles.error} role="status">
          {message.text}
        </p>
      )}
      <section className={styles.panel}>
        <h2>Add an admin</h2>
        <form
          className={styles.row}
          onSubmit={(e) => submit(e, String(new FormData(e.currentTarget).get('username') ?? '').trim())}
        >
          <label className={styles.field}>
            <span>Username</span>
            <input name="username" required />
          </label>
          <label className={styles.field}>
            <span>Role</span>
            <select name="role">
              {addOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button className={styles.button} disabled={pending}>
            Add
          </button>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>Current admins</h2>
        <ul className={styles.list}>
          {admins.map((a) => (
            <li key={a.username}>
              <span>
                <strong>{a.username}</strong> · {ROLE_LABELS[a.role]}
              </span>
              {a.options.length > 0 ? (
                <form className={styles.row} onSubmit={(e) => submit(e, a.username)}>
                  <select name="role" aria-label={`New role for ${a.username}`}>
                    {a.options.map((r) => (
                      <option key={r} value={r}>
                        {optionLabel(r)}
                      </option>
                    ))}
                  </select>
                  <button className={styles.secondary} disabled={pending}>
                    Apply
                  </button>
                </form>
              ) : (
                <span className={styles.muted}>can’t be changed by you</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
