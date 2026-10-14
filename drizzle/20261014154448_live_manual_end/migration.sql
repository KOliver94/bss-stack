-- A live has no planned end any more: it runs until it is ended manually (or
-- superseded by the next one), so the end time and the overlap guard built on
-- it go away. Ended lives keep their end in ended_at.
ALTER TABLE "live_streams" DROP CONSTRAINT IF EXISTS "live_streams_no_overlap_excl";--> statement-breakpoint
ALTER TABLE "live_streams" DROP CONSTRAINT "live_streams_end_after_start_check";--> statement-breakpoint
ALTER TABLE "live_streams" DROP COLUMN "ends_at";
