/* How admin roles, log entries and times read on the /admin pages. */
import type { LogEntry } from './admin';
import type { AdminRole } from './schema';

export const ROLE_LABELS: Record<AdminRole, string> = {
  none: 'not an admin',
  lower: 'admin',
  right_hand: 'right-hand admin',
  supreme: 'supreme leader',
};

/** Always UTC, the same as the Daily rollover. */
export const formatTime = (at: Date) => `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const who = (username: string | null) => username ?? 'a deleted user';

export function describeEntry(e: LogEntry): string {
  switch (e.action) {
    case 'prompts_added':
      return `${who(e.actor)} added ${e.count} prompt${e.count === 1 ? '' : 's'}`;
    case 'prompt_failed':
      return `${who(e.actor)} tried to upload a failed prompt`;
    case 'role_changed':
      return `${who(e.actor)} changed ${who(e.target)} from ${ROLE_LABELS[e.fromRole ?? 'none']} to ${ROLE_LABELS[e.toRole ?? 'none']}`;
    case 'password_reset':
      return `${who(e.actor)} reset ${who(e.target)}’s password`;
    case 'prompt_removed':
      return e.replacementId
        ? `${who(e.actor)} removed prompt ${e.promptId}, replacing it with ${e.replacementId} in future Dailies`
        : `${who(e.actor)} removed prompt ${e.promptId}`;
    case 'daily_added':
      return `${who(e.actor)} added the Daily for ${e.dailyDate}`;
    case 'daily_changed':
      return `${who(e.actor)} changed the Daily for ${e.dailyDate}`;
    case 'daily_removed':
      return `${who(e.actor)} removed the Daily for ${e.dailyDate}`;
  }
}

/** The same change, addressed to the admin it happened to. */
export function describeNotification(e: LogEntry): string {
  const from = ROLE_LABELS[e.fromRole ?? 'none'];
  const to = ROLE_LABELS[e.toRole ?? 'none'];
  if (e.toRole === 'none') return `${who(e.actor)} removed your admin access (you were ${from})`;
  if (e.fromRole === 'none') return `${who(e.actor)} made you ${to}`;
  return `${who(e.actor)} changed your role from ${from} to ${to}`;
}
