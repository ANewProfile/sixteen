-- Edited by hand: drizzle-kit copied daily_date from the old admin_log, where
-- it doesn't exist yet; it starts empty instead. Nothing references admin_log.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`daily_date` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "admin_log_action" CHECK(action IN ('prompts_added', 'prompt_failed', 'role_changed', 'password_reset', 'prompt_removed', 'daily_added', 'daily_changed', 'daily_removed'))
);
--> statement-breakpoint
INSERT INTO `__new_admin_log`("id", "actor_id", "action", "count", "target_user_id", "from_role", "to_role", "prompt_id", "replacement_id", "created_at") SELECT "id", "actor_id", "action", "count", "target_user_id", "from_role", "to_role", "prompt_id", "replacement_id", "created_at" FROM `admin_log`;--> statement-breakpoint
DROP TABLE `admin_log`;--> statement-breakpoint
ALTER TABLE `__new_admin_log` RENAME TO `admin_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `admin_log_created_at` ON `admin_log` (`created_at`);