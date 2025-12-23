ALTER TABLE "preop_assessments" ADD COLUMN "anesthesia_history_issues" jsonb;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "dental_issues" jsonb;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "ponv_transfusion_issues" jsonb;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "previous_surgeries" text;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "anesthesia_surgical_history_notes" text;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "outpatient_caregiver_first_name" varchar;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "outpatient_caregiver_last_name" varchar;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "outpatient_caregiver_phone" varchar;--> statement-breakpoint
ALTER TABLE "surgery_preop_assessments" ADD COLUMN "anesthesia_history_issues" jsonb;--> statement-breakpoint
ALTER TABLE "surgery_preop_assessments" ADD COLUMN "dental_issues" jsonb;--> statement-breakpoint
ALTER TABLE "surgery_preop_assessments" ADD COLUMN "ponv_transfusion_issues" jsonb;--> statement-breakpoint
ALTER TABLE "surgery_preop_assessments" ADD COLUMN "previous_surgeries" text;--> statement-breakpoint
ALTER TABLE "surgery_preop_assessments" ADD COLUMN "anesthesia_surgical_history_notes" text;--> statement-breakpoint
ALTER TABLE "surgery_preop_assessments" ADD COLUMN "outpatient_caregiver_first_name" varchar;--> statement-breakpoint
ALTER TABLE "surgery_preop_assessments" ADD COLUMN "outpatient_caregiver_last_name" varchar;--> statement-breakpoint
ALTER TABLE "surgery_preop_assessments" ADD COLUMN "outpatient_caregiver_phone" varchar;