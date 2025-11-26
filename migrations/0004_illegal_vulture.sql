ALTER TABLE "preop_assessments" ALTER COLUMN "surgical_approval" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "stand_by" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "stand_by_reason" varchar;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "stand_by_reason_note" text;