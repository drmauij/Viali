ALTER TABLE "surgeries" ADD COLUMN "reminder_sent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "worker_contracts" ADD COLUMN "archived_at" timestamp;