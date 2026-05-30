CREATE TABLE `deltas` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`entry_id` text,
	`action_id` text NOT NULL,
	`log_position` integer NOT NULL,
	`source` text NOT NULL,
	`target_table` text NOT NULL,
	`target_id` text NOT NULL,
	`op` text NOT NULL,
	`undo_payload` text,
	`encoding_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deltas_chain_idx` ON `deltas` (`branch_id`,`target_id`,`log_position`);--> statement-breakpoint
CREATE UNIQUE INDEX `deltas_log_position_uniq` ON `deltas` (`branch_id`,`log_position`);