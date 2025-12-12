ALTER TABLE "anesthesia_medications" ADD COLUMN "initial_bolus" varchar;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "no_pre_op_required" boolean DEFAULT false NOT NULL;