-- ACTIVE_ALUMNI is back as its own status. The type is recreated rather than
-- extended with ADD VALUE, because a value added that way cannot be used in the
-- data fix below within the same transaction.
ALTER TABLE "member_cache" ALTER COLUMN "membership_status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "membership_status";--> statement-breakpoint
CREATE TYPE "membership_status" AS ENUM('MEMBER_CANDIDATE_CANDIDATE', 'MEMBER_CANDIDATE', 'MEMBER', 'ACTIVE_ALUMNI', 'ALUMNI');--> statement-breakpoint
-- Undo member_webhook_v2: an unarchived ALUMNI was its stand-in for an active
-- alumnus, and the plain alumni it archived come back onto the alumni list.
UPDATE "member_cache" SET "membership_status" = 'ACTIVE_ALUMNI', "updated_at" = now()
WHERE "membership_status" = 'ALUMNI' AND "archived_at" IS NULL;--> statement-breakpoint
UPDATE "member_cache" SET "archived_at" = NULL, "updated_at" = now()
WHERE "membership_status" = 'ALUMNI' AND "archived_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "member_cache" ALTER COLUMN "membership_status" SET DATA TYPE "membership_status" USING "membership_status"::"membership_status";
