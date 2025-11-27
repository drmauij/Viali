ALTER TABLE "anesthesia_records" ADD COLUMN "surgery_staff" jsonb;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "intra_op_data" jsonb;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "counts_sterile_data" jsonb;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_notes" text;