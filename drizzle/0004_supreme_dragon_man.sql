-- Edited by hand: drizzle-kit copied prompt_id and replacement_id from the old
-- admin_log, where they don't exist yet; they start empty instead. daily is
-- rebuilt without its foreign keys to prompts, so past Dailies can keep the id
-- of a removed prompt. Neither table is referenced by others, so dropping them
-- can't cascade.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`prompt1` text NOT NULL,
	`prompt2` text NOT NULL,
	`prompt3` text NOT NULL,
	`prompt4` text NOT NULL,
	`prompt5` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_daily`("date", "prompt1", "prompt2", "prompt3", "prompt4", "prompt5") SELECT "date", "prompt1", "prompt2", "prompt3", "prompt4", "prompt5" FROM `daily`;--> statement-breakpoint
DROP TABLE `daily`;--> statement-breakpoint
ALTER TABLE `__new_daily` RENAME TO `daily`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_admin_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`count` integer,
	`target_user_id` text,
	`from_role` text,
	`to_role` text,
	`prompt_id` text,
	`replacement_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "admin_log_action" CHECK(action IN ('prompts_added', 'prompt_failed', 'role_changed', 'password_reset', 'prompt_removed'))
);
--> statement-breakpoint
INSERT INTO `__new_admin_log`("id", "actor_id", "action", "count", "target_user_id", "from_role", "to_role", "created_at") SELECT "id", "actor_id", "action", "count", "target_user_id", "from_role", "to_role", "created_at" FROM `admin_log`;--> statement-breakpoint
DROP TABLE `admin_log`;--> statement-breakpoint
ALTER TABLE `__new_admin_log` RENAME TO `admin_log`;--> statement-breakpoint
CREATE INDEX `admin_log_created_at` ON `admin_log` (`created_at`);