CREATE TABLE "external_worklog_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"email" varchar NOT NULL,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"work_date" date NOT NULL,
	"time_start" varchar NOT NULL,
	"time_end" varchar NOT NULL,
	"pause_minutes" integer DEFAULT 0 NOT NULL,
	"worker_signature" text NOT NULL,
	"worker_signed_at" timestamp DEFAULT now(),
	"status" varchar DEFAULT 'pending' NOT NULL,
	"countersignature" text,
	"countersigned_at" timestamp,
	"countersigned_by" varchar,
	"countersigner_name" varchar,
	"rejection_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "external_worklog_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"email" varchar NOT NULL,
	"token" varchar NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_accessed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "external_worklog_links_token_unique" UNIQUE("token"),
	CONSTRAINT "idx_external_worklog_links_unit_email" UNIQUE("unit_id","email")
);
--> statement-breakpoint
ALTER TABLE "external_worklog_entries" ADD CONSTRAINT "external_worklog_entries_link_id_external_worklog_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."external_worklog_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_worklog_entries" ADD CONSTRAINT "external_worklog_entries_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_worklog_entries" ADD CONSTRAINT "external_worklog_entries_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_worklog_entries" ADD CONSTRAINT "external_worklog_entries_countersigned_by_users_id_fk" FOREIGN KEY ("countersigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_worklog_links" ADD CONSTRAINT "external_worklog_links_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_worklog_links" ADD CONSTRAINT "external_worklog_links_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_external_worklog_entries_link" ON "external_worklog_entries" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "idx_external_worklog_entries_unit" ON "external_worklog_entries" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_external_worklog_entries_hospital" ON "external_worklog_entries" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_external_worklog_entries_email" ON "external_worklog_entries" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_external_worklog_entries_status" ON "external_worklog_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_external_worklog_entries_work_date" ON "external_worklog_entries" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "idx_external_worklog_links_unit" ON "external_worklog_links" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_external_worklog_links_hospital" ON "external_worklog_links" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_external_worklog_links_email" ON "external_worklog_links" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_external_worklog_links_token" ON "external_worklog_links" USING btree ("token");