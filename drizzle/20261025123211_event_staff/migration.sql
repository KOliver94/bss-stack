CREATE TABLE "event_staff" (
	"event_id" uuid,
	"role_id" uuid,
	"member_sub" varchar(255),
	CONSTRAINT "event_staff_pkey" PRIMARY KEY("event_id","role_id","member_sub")
);
--> statement-breakpoint
CREATE INDEX "event_staff_member_idx" ON "event_staff" ("member_sub");--> statement-breakpoint
CREATE INDEX "event_staff_role_idx" ON "event_staff" ("role_id");--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_role_id_staff_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "staff_roles"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_member_sub_member_cache_sub_fkey" FOREIGN KEY ("member_sub") REFERENCES "member_cache"("sub");