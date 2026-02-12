ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "patient_position" varchar;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "left_arm_position" varchar;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "right_arm_position" varchar;--> statement-breakpoint
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "patient_position" varchar;--> statement-breakpoint
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "left_arm_position" varchar;--> statement-breakpoint
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "right_arm_position" varchar;
