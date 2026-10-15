-- Hand-written: drizzle-kit's generated version copied users rows from columns
-- that don't exist yet, and SQLite can't ADD a column whose default is a
-- function, so prompts is rebuilt instead.
CREATE TABLE `admin_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`count` integer,
	`target_user_id` text,
	`from_role` text,
	`to_role` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "admin_log_action" CHECK(action IN ('prompts_added', 'prompt_failed', 'role_changed'))
);
--> statement-breakpoint
ALTER TABLE `users` ADD `admin_role` text DEFAULT 'none' NOT NULL CONSTRAINT "users_admin_role" CHECK(admin_role IN ('none', 'lower', 'right_hand', 'supreme'));--> statement-breakpoint
ALTER TABLE `users` ADD `token_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `token_created_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_token_hash_unique` ON `users` (`token_hash`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`category` integer NOT NULL,
	`text` text NOT NULL,
	`note` text,
	`author_score` real NOT NULL,
	`answers` text NOT NULL,
	`play_total` integer DEFAULT 0 NOT NULL,
	`play_count` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "prompts_id_format" CHECK(length(id) = 8 AND id GLOB '[0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9]'),
	CONSTRAINT "prompts_category_matches_id" CHECK("category" = cast(substr("id", 1, 1) AS integer)),
	CONSTRAINT "prompts_author_score_range" CHECK("author_score" BETWEEN 0 AND 16),
	CONSTRAINT "prompts_answer_count" CHECK(json_type("answers") = 'array' AND json_array_length("answers") BETWEEN 5 AND 25)
);
--> statement-breakpoint
INSERT INTO `__new_prompts`("id", "category", "text", "note", "author_score", "answers", "play_total", "play_count") SELECT "id", "category", "text", "note", "author_score", "answers", "play_total", "play_count" FROM `prompts`;--> statement-breakpoint
DROP TABLE `prompts`;--> statement-breakpoint
ALTER TABLE `__new_prompts` RENAME TO `prompts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
