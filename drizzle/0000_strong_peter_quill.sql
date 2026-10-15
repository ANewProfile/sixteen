CREATE TABLE `daily` (
	`date` text PRIMARY KEY NOT NULL,
	`prompt1` text NOT NULL,
	`prompt2` text NOT NULL,
	`prompt3` text NOT NULL,
	`prompt4` text NOT NULL,
	`prompt5` text NOT NULL,
	FOREIGN KEY (`prompt1`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prompt2`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prompt3`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prompt4`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prompt5`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `global_category_stats` (
	`category` integer PRIMARY KEY NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `global_game_stats` (
	`id` integer PRIMARY KEY NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "global_game_stats_single_row" CHECK("global_game_stats"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`category` integer NOT NULL,
	`text` text NOT NULL,
	`note` text,
	`author_score` real NOT NULL,
	`answers` text NOT NULL,
	`play_total` integer DEFAULT 0 NOT NULL,
	`play_count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "prompts_id_format" CHECK(length(id) = 8 AND id GLOB '[0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9]'),
	CONSTRAINT "prompts_category_matches_id" CHECK("prompts"."category" = cast(substr("prompts"."id", 1, 1) AS integer)),
	CONSTRAINT "prompts_author_score_range" CHECK("prompts"."author_score" BETWEEN 0 AND 16),
	CONSTRAINT "prompts_answer_count" CHECK(json_type("prompts"."answers") = 'array' AND json_array_length("prompts"."answers") BETWEEN 5 AND 25)
);
--> statement-breakpoint
CREATE TABLE `user_category_stats` (
	`user_id` text NOT NULL,
	`category` integer NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `category`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`daily_games` integer DEFAULT 0 NOT NULL,
	`infinite_games` integer DEFAULT 0 NOT NULL,
	`game_points_total` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);