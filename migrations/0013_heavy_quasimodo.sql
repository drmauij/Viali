CREATE TABLE "anesthesia_airway_management" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"airway_device" varchar,
	"size" varchar,
	"depth" integer,
	"cuff_pressure" integer,
	"intubation_pre_existing" boolean DEFAULT false,
	"notes" text,
	"laryngoscope_type" varchar,
	"laryngoscope_blade" varchar,
	"intubation_attempts" integer,
	"difficult_airway" boolean DEFAULT false,
	"cormack_lehane" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "anesthesia_airway_management_anesthesia_record_id_unique" UNIQUE("anesthesia_record_id")
);
--> statement-breakpoint
CREATE TABLE "anesthesia_general_technique" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"approach" varchar,
	"rsi" boolean DEFAULT false,
	"sedation_level" varchar,
	"airway_support" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "anesthesia_general_technique_anesthesia_record_id_unique" UNIQUE("anesthesia_record_id")
);
--> statement-breakpoint
CREATE TABLE "anesthesia_installations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"category" varchar NOT NULL,
	"location" varchar,
	"attempts" integer,
	"notes" text,
	"is_pre_existing" boolean DEFAULT false,
	"metadata" jsonb,
	"placement_time" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anesthesia_neuraxial_blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"block_type" varchar NOT NULL,
	"level" varchar,
	"approach" varchar,
	"needle_gauge" varchar,
	"test_dose" varchar,
	"attempts" integer,
	"sensory_level" varchar,
	"catheter_present" boolean DEFAULT false,
	"catheter_depth" varchar,
	"guidance_technique" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anesthesia_peripheral_blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"block_type" varchar NOT NULL,
	"laterality" varchar,
	"guidance_technique" varchar,
	"needle_type" varchar,
	"catheter_placed" boolean DEFAULT false,
	"attempts" integer,
	"sensory_assessment" text,
	"motor_assessment" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anesthesia_positions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"timestamp" timestamp NOT NULL,
	"position" varchar NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anesthesia_staff" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"timestamp" timestamp NOT NULL,
	"role" varchar NOT NULL,
	"name" varchar NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anesthesia_technique_details" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"technique" varchar NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clinical_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "clinical_snapshots_anesthesia_record_id_unique" UNIQUE("anesthesia_record_id")
);
--> statement-breakpoint
CREATE TABLE "difficult_airway_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airway_management_id" varchar NOT NULL,
	"description" text NOT NULL,
	"techniques_attempted" jsonb NOT NULL,
	"final_technique" text NOT NULL,
	"equipment_used" text,
	"complications" text,
	"recommendations" text,
	"patient_informed" boolean DEFAULT false,
	"patient_informed_at" timestamp,
	"patient_informed_by" varchar,
	"letter_sent_to_patient" boolean DEFAULT false,
	"letter_sent_at" timestamp,
	"patient_email" varchar,
	"gp_notified" boolean DEFAULT false,
	"gp_notified_at" timestamp,
	"gp_email" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "difficult_airway_reports_airway_management_id_unique" UNIQUE("airway_management_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_commits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_by" varchar NOT NULL,
	"signature" text,
	"patient_name" varchar,
	"patient_id" varchar,
	"items" jsonb NOT NULL,
	"rolled_back_at" timestamp with time zone,
	"rolled_back_by" varchar,
	"rollback_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "vitals_snapshots" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "vitals_snapshots" CASCADE;--> statement-breakpoint
ALTER TABLE "anesthesia_medications" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anesthesia_medications" ALTER COLUMN "end_timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anesthesia_medications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anesthesia_medications" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "anesthesia_medications" ADD COLUMN "infusion_session_id" varchar;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "sign_in_data" jsonb;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "time_out_data" jsonb;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "sign_out_data" jsonb;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "post_op_data" jsonb;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "time_markers" jsonb;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "anesthesia_overview" jsonb;--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD COLUMN "calculated_qty" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD COLUMN "override_qty" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD COLUMN "override_reason" text;--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD COLUMN "overridden_by" varchar;--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD COLUMN "overridden_at" timestamp;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "anesthesia_airway_management" ADD CONSTRAINT "anesthesia_airway_management_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_general_technique" ADD CONSTRAINT "anesthesia_general_technique_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_installations" ADD CONSTRAINT "anesthesia_installations_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_neuraxial_blocks" ADD CONSTRAINT "anesthesia_neuraxial_blocks_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_peripheral_blocks" ADD CONSTRAINT "anesthesia_peripheral_blocks_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_positions" ADD CONSTRAINT "anesthesia_positions_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_positions" ADD CONSTRAINT "anesthesia_positions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_staff" ADD CONSTRAINT "anesthesia_staff_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_staff" ADD CONSTRAINT "anesthesia_staff_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_technique_details" ADD CONSTRAINT "anesthesia_technique_details_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_snapshots" ADD CONSTRAINT "clinical_snapshots_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "difficult_airway_reports" ADD CONSTRAINT "difficult_airway_reports_airway_management_id_anesthesia_airway_management_id_fk" FOREIGN KEY ("airway_management_id") REFERENCES "public"."anesthesia_airway_management"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_commits" ADD CONSTRAINT "inventory_commits_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_commits" ADD CONSTRAINT "inventory_commits_committed_by_users_id_fk" FOREIGN KEY ("committed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_commits" ADD CONSTRAINT "inventory_commits_rolled_back_by_users_id_fk" FOREIGN KEY ("rolled_back_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_airway_management_record" ON "anesthesia_airway_management" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_general_technique_record" ON "anesthesia_general_technique" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_installations_record" ON "anesthesia_installations" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_installations_category" ON "anesthesia_installations" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_neuraxial_blocks_record" ON "anesthesia_neuraxial_blocks" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_neuraxial_blocks_type" ON "anesthesia_neuraxial_blocks" USING btree ("block_type");--> statement-breakpoint
CREATE INDEX "idx_peripheral_blocks_record" ON "anesthesia_peripheral_blocks" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_positions_record" ON "anesthesia_positions" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_positions_timestamp" ON "anesthesia_positions" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_staff_record" ON "anesthesia_staff" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_staff_timestamp" ON "anesthesia_staff" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_staff_role" ON "anesthesia_staff" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_technique_details_record" ON "anesthesia_technique_details" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_technique_details_technique" ON "anesthesia_technique_details" USING btree ("technique");--> statement-breakpoint
CREATE INDEX "idx_clinical_snapshots_record" ON "clinical_snapshots" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_difficult_airway_reports_airway" ON "difficult_airway_reports" USING btree ("airway_management_id");--> statement-breakpoint
CREATE INDEX "idx_difficult_airway_reports_created_by" ON "difficult_airway_reports" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_commits_record" ON "inventory_commits" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_commits_committed_at" ON "inventory_commits" USING btree ("committed_at");--> statement-breakpoint
CREATE INDEX "idx_inventory_commits_committed_by" ON "inventory_commits" USING btree ("committed_by");--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD CONSTRAINT "inventory_usage_overridden_by_users_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_anesthesia_medications_session" ON "anesthesia_medications" USING btree ("infusion_session_id");--> statement-breakpoint
ALTER TABLE "anesthesia_records" DROP COLUMN "sign_in_checklist";--> statement-breakpoint
ALTER TABLE "anesthesia_records" DROP COLUMN "time_out_checklist";--> statement-breakpoint
ALTER TABLE "anesthesia_records" DROP COLUMN "sign_out_checklist";--> statement-breakpoint
ALTER TABLE "inventory_usage" DROP COLUMN "quantity_used";--> statement-breakpoint
ALTER TABLE "inventory_usage" DROP COLUMN "auto_computed";--> statement-breakpoint
ALTER TABLE "inventory_usage" DROP COLUMN "manual_override";--> statement-breakpoint
ALTER TABLE "preop_assessments" DROP COLUMN "allergies";--> statement-breakpoint
ALTER TABLE "preop_assessments" DROP COLUMN "allergies_other";--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD CONSTRAINT "idx_inventory_usage_unique" UNIQUE("anesthesia_record_id","item_id");