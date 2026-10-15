/* The database schema. Every stat is stored as a running total plus a count;
 * averages are derived when they are read, never stored. No individual game is
 * kept anywhere. The CHECK constraints repeat the most important prompt rules
 * so that rows inserted by hand (Turso shell, Drizzle Studio) obey them too. */
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export interface Answer {
  /** The form shown in the reveal. */
  canonical: string;
  /** Other accepted spellings, translations and shorthands. */
  aliases: string[];
  /** Guesses that earn a free prompt for more detail ("Bush" for George W. Bush). */
  prompts?: string[];
  /** Optional question shown with those prompts instead of the generic one ("Which Bush?"). */
  ask?: string;
  /** Guesses never accepted for this answer, matched exactly ("John Quincy Adams" on John Adams). */
  rejects?: string[];
}

const ID_GLOB = `[0-9]${'[A-Za-z0-9]'.repeat(7)}`;

/** Lowest to highest. Supreme is only ever granted or removed by hand in Turso. */
export const ADMIN_ROLES = ['none', 'lower', 'right_hand', 'supreme'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
const ROLE_LIST = ADMIN_ROLES.map((r) => `'${r}'`).join(', ');

export const LOG_ACTIONS = [
  'prompts_added', 'prompt_failed', 'role_changed', 'password_reset', 'prompt_removed',
  'daily_added', 'daily_changed', 'daily_removed',
] as const;
export type LogAction = (typeof LOG_ACTIONS)[number];

export const prompts = sqliteTable(
  'prompts',
  {
    /** One category digit + seven characters of A–Z, a–z, 0–9. */
    id: text('id').primaryKey(),
    category: integer('category').notNull(),
    text: text('text').notNull(),
    /** Clarifies grey areas; never contains an accepted answer. */
    note: text('note'),
    /** The author's expected-points estimate, 0–16. */
    authorScore: real('author_score').notNull(),
    answers: text('answers', { mode: 'json' }).$type<Answer[]>().notNull(),
    playTotal: integer('play_total').notNull().default(0),
    playCount: integer('play_count').notNull().default(0),
    /** The admin who added it; kept as null if that account is ever deleted. */
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    check('prompts_id_format', sql.raw(`length(id) = 8 AND id GLOB '${ID_GLOB}'`)),
    check('prompts_category_matches_id', sql`${t.category} = cast(substr(${t.id}, 1, 1) AS integer)`),
    check('prompts_author_score_range', sql`${t.authorScore} BETWEEN 0 AND 16`),
    check('prompts_answer_count', sql`json_type(${t.answers}) = 'array' AND json_array_length(${t.answers}) BETWEEN 5 AND 25`),
  ],
);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  /** The display name lower-cased, so Theo and theo can't both exist. Sign-in and admin lookups use this. */
  username: text('username').notNull().unique(),
  /** The username exactly as the player typed it; what everyone sees. */
  displayName: text('display_name').notNull(),
  /** Optional, and only ever used for password resets. */
  email: text('email').unique(),
  passwordHash: text('password_hash').notNull(),
  dailyGames: integer('daily_games').notNull().default(0),
  infiniteGames: integer('infinite_games').notNull().default(0),
  /** Points across all games; divide by dailyGames + infiniteGames for points per game. */
  gamePointsTotal: integer('game_points_total').notNull().default(0),
  adminRole: text('admin_role', { enum: ADMIN_ROLES }).notNull().default('none'),
  /** SHA-256 of the admin's one current token; null when they have none. */
  tokenHash: text('token_hash').unique(),
  tokenCreatedAt: integer('token_created_at', { mode: 'timestamp' }),
  /**
   * The player sign-in token, stored as is (not hashed) so a second device can
   * be handed the same one. Shared by every signed-in device; replaced by a
   * password change. Expires two months after it was created.
   */
  playerToken: text('player_token').unique(),
  playerTokenCreatedAt: integer('player_token_created_at', { mode: 'timestamp' }),
}, () => [check('users_admin_role', sql.raw(`admin_role IN (${ROLE_LIST})`))]);

/** What admins did: prompt uploads (counts only), failed prompts, role changes, password resets, prompt removals and Daily changes. */
export const adminLog = sqliteTable(
  'admin_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action', { enum: LOG_ACTIONS }).notNull(),
    /** prompts_added: how many went in. */
    count: integer('count'),
    /** role_changed: whose role, from what, to what. password_reset: whose password. */
    targetUserId: text('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    fromRole: text('from_role', { enum: ADMIN_ROLES }),
    toRole: text('to_role', { enum: ADMIN_ROLES }),
    /** prompt_removed: the removed prompt, and its replacement in future Dailies if one was needed. Plain ids, not links: the prompt is gone. */
    promptId: text('prompt_id'),
    replacementId: text('replacement_id'),
    /** daily_added, daily_changed, daily_removed: which day (YYYY-MM-DD). */
    dailyDate: text('daily_date'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    check('admin_log_action', sql.raw(`action IN (${LOG_ACTIONS.map((a) => `'${a}'`).join(', ')})`)),
    // Every log write deletes rows older than 30 days, and the log page sorts by date.
    index('admin_log_created_at').on(t.createdAt),
  ],
);

/**
 * Failed logins per IP address per username (lower-cased, whether or not the
 * account exists). Five failures lock that pair for 15 minutes; the row is
 * deleted when the lock expires or the next login succeeds.
 */
export const loginFailures = sqliteTable(
  'login_failures',
  {
    ip: text('ip').notNull(),
    username: text('username').notNull(),
    count: integer('count').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp' }),
  },
  (t) => [primaryKey({ columns: [t.ip, t.username] })],
);

/** Per user, per category: points scored on that category's prompts and how many were played. */
export const userCategoryStats = sqliteTable(
  'user_category_stats',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    category: integer('category').notNull(),
    total: integer('total').notNull().default(0),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] })],
);

/** Everyone, guests included: points per prompt in each category. */
export const globalCategoryStats = sqliteTable('global_category_stats', {
  category: integer('category').primaryKey(),
  total: integer('total').notNull().default(0),
  count: integer('count').notNull().default(0),
});

/** Everyone, guests included: points per game. A single row with id 1. */
export const globalGameStats = sqliteTable(
  'global_game_stats',
  {
    id: integer('id').primaryKey(),
    total: integer('total').notNull().default(0),
    count: integer('count').notNull().default(0),
  },
  (t) => [check('global_game_stats_single_row', sql`${t.id} = 1`)],
);

/**
 * The Daily schedule. A date is a UTC calendar day, YYYY-MM-DD.
 *
 * Prompt ids here are deliberately not foreign keys: removing a prompt swaps a
 * replacement into future Dailies but leaves past Dailies pointing at the
 * removed id, so anything showing an old Daily must expect a missing prompt.
 */
export const daily = sqliteTable('daily', {
  date: text('date').primaryKey(),
  prompt1: text('prompt1').notNull(),
  prompt2: text('prompt2').notNull(),
  prompt3: text('prompt3').notNull(),
  prompt4: text('prompt4').notNull(),
  prompt5: text('prompt5').notNull(),
});

/**
 * A signed-in player's finished Daily: one per player per day. `game` is the
 * browser's finished game state, so any device can redraw the results screen.
 */
export const dailyCompletions = sqliteTable(
  'daily_completions',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    game: text('game', { mode: 'json' }).$type<unknown>().notNull(),
    points: integer('points').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const DAILY_SLOTS = ['prompt1', 'prompt2', 'prompt3', 'prompt4', 'prompt5'] as const;
