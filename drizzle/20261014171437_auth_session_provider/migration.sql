CREATE TYPE "auth_provider" AS ENUM('authentik', 'authsch');--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "provider" "auth_provider" DEFAULT 'authentik'::"auth_provider" NOT NULL;