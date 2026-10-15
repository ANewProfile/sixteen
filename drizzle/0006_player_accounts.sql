-- Edited by hand: SQLite can't add a NOT NULL column without a default, so
-- display_name starts as '' and is then filled from username, which becomes
-- lower-case. (The '' default stays in the table; the app always sets it.)
CREATE TABLE `daily_completions` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`game` text NOT NULL,
	`points` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `display_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `users` SET `display_name` = `username`, `username` = lower(`username`);--> statement-breakpoint
ALTER TABLE `users` ADD `player_token` text;--> statement-breakpoint
ALTER TABLE `users` ADD `player_token_created_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_player_token_unique` ON `users` (`player_token`);