/* Days are UTC calendar days, YYYY-MM-DD: the Daily rolls over at midnight UTC. */

export const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

/** The UTC day `days` after `day` (negative for before). */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDay(d);
}
