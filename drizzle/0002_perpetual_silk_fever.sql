CREATE TABLE `login_failures` (
	`ip` text NOT NULL,
	`username` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	PRIMARY KEY(`ip`, `username`)
);
--> statement-breakpoint
CREATE INDEX `admin_log_created_at` ON `admin_log` (`created_at`);