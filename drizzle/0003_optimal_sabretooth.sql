-- Edited by hand: drizzle-kit created admin_log_created_at and then dropped it
-- again; the DROP is removed. admin_log is rebuilt to widen its CHECK, which is
-- safe because nothing references it. users is changed in place with libSQL's
-- ALTER COLUMN, not rebuilt, so rows that reference users are never touched.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_admin_log` (
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
	CONSTRAINT "admin_log_action" CHECK(action IN ('prompts_added', 'prompt_failed', 'role_changed', 'password_reset'))
);
--> statement-breakpoint
INSERT INTO `__new_admin_log`("id", "actor_id", "action", "count", "target_user_id", "from_role", "to_role", "created_at") SELECT "id", "actor_id", "action", "count", "target_user_id", "from_role", "to_role", "created_at" FROM `admin_log`;--> statement-breakpoint
DROP TABLE `admin_log`;--> statement-breakpoint
ALTER TABLE `__new_admin_log` RENAME TO `admin_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `admin_log_created_at` ON `admin_log` (`created_at`);--> statement-breakpoint
DROP INDEX "users_username_unique";--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
DROP INDEX "users_token_hash_unique";--> statement-breakpoint
ALTER TABLE `users` ALTER COLUMN "email" TO "email" text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_token_hash_unique` ON `users` (`token_hash`);