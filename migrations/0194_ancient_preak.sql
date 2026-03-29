ALTER TABLE "user_hospital_roles" ADD COLUMN IF NOT EXISTS "can_configure" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_hospital_roles" ADD COLUMN IF NOT EXISTS "can_chat" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_hospital_roles" ADD COLUMN IF NOT EXISTS "can_plan_ops" boolean DEFAULT false;