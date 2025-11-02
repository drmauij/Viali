CREATE TABLE "activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"user_id" varchar NOT NULL,
	"action" varchar NOT NULL,
	"item_id" varchar,
	"lot_id" varchar,
	"unit_id" varchar,
	"delta" integer,
	"movement_type" varchar,
	"notes" text,
	"patient_id" varchar,
	"patient_photo" text,
	"signatures" jsonb,
	"controlled_verified" boolean DEFAULT false,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "administration_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"item_id" varchar,
	"lot_id" varchar,
	"title" varchar NOT NULL,
	"description" text,
	"severity" varchar DEFAULT 'medium',
	"acknowledged" boolean DEFAULT false,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"snoozed_until" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anesthesia_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"timestamp" timestamp NOT NULL,
	"event_type" varchar,
	"description" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anesthesia_medications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"timestamp" timestamp NOT NULL,
	"type" varchar NOT NULL,
	"dose" varchar,
	"unit" varchar,
	"route" varchar,
	"rate" varchar,
	"end_timestamp" timestamp,
	"administered_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anesthesia_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surgery_id" varchar NOT NULL,
	"anesthesia_start_time" timestamp,
	"anesthesia_end_time" timestamp,
	"provider_id" varchar,
	"physical_status" varchar,
	"emergency_case" boolean DEFAULT false,
	"procedure_code" varchar,
	"diagnosis_codes" text[],
	"anesthesia_type" varchar,
	"case_status" varchar DEFAULT 'open' NOT NULL,
	"closed_at" timestamp,
	"closed_by" varchar,
	"sign_in_checklist" jsonb,
	"time_out_checklist" jsonb,
	"sign_out_checklist" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "anesthesia_records_surgery_id_unique" UNIQUE("surgery_id")
);
--> statement-breakpoint
CREATE TABLE "audit_trail" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_type" varchar NOT NULL,
	"record_id" varchar NOT NULL,
	"action" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"admission_date" timestamp NOT NULL,
	"discharge_date" timestamp,
	"status" varchar DEFAULT 'active' NOT NULL,
	"type" varchar DEFAULT 'inpatient' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "checklist_completions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"completed_by" varchar NOT NULL,
	"completed_at" timestamp DEFAULT now(),
	"due_date" timestamp NOT NULL,
	"comment" text,
	"signature" text NOT NULL,
	"template_snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"role" varchar,
	"name" varchar NOT NULL,
	"description" text,
	"recurrency" varchar NOT NULL,
	"start_date" timestamp NOT NULL,
	"items" jsonb NOT NULL,
	"active" boolean DEFAULT true,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "controlled_checks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"signature" text NOT NULL,
	"check_items" jsonb NOT NULL,
	"all_match" boolean NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hospital_anesthesia_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"allergy_list" text[],
	"medication_lists" jsonb,
	"illness_lists" jsonb,
	"checklist_items" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "hospital_anesthesia_settings_hospital_id_unique" UNIQUE("hospital_id")
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"address" text,
	"timezone" varchar DEFAULT 'UTC',
	"google_auth_enabled" boolean DEFAULT true,
	"local_auth_enabled" boolean DEFAULT true,
	"license_type" varchar DEFAULT 'free' NOT NULL,
	"anesthesia_unit_id" varchar,
	"surgery_unit_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"status" varchar DEFAULT 'queued' NOT NULL,
	"total_images" integer NOT NULL,
	"processed_images" integer DEFAULT 0,
	"current_image" integer DEFAULT 0,
	"progress_percent" integer DEFAULT 0,
	"extracted_items" integer DEFAULT 0,
	"images_data" jsonb,
	"results" jsonb,
	"error" text,
	"notification_sent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "inventory_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"quantity_used" integer NOT NULL,
	"auto_computed" boolean DEFAULT true,
	"manual_override" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"folder_id" varchar,
	"name" varchar NOT NULL,
	"description" text,
	"unit" varchar NOT NULL,
	"pack_size" integer DEFAULT 1,
	"min_threshold" integer,
	"max_threshold" integer,
	"default_order_qty" integer DEFAULT 0,
	"critical" boolean DEFAULT false,
	"controlled" boolean DEFAULT false,
	"track_exact_quantity" boolean DEFAULT false,
	"current_units" integer DEFAULT 0,
	"vendor_id" varchar,
	"barcodes" text[],
	"image_url" varchar,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"lot_number" varchar NOT NULL,
	"expiry_date" timestamp,
	"unit_id" varchar NOT NULL,
	"qty" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "medication_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"medication_group" varchar,
	"administration_group" varchar,
	"ampule_total_content" varchar,
	"default_dose" varchar,
	"administration_route" varchar,
	"administration_unit" varchar,
	"rate_unit" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "medication_configs_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "medication_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"qty" integer NOT NULL,
	"pack_size" integer DEFAULT 1,
	"unit_price" numeric(10, 2),
	"total_price" numeric(10, 2),
	"received" boolean DEFAULT false,
	"received_at" timestamp,
	"received_by" varchar,
	"receive_notes" text,
	"receive_signature" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"vendor_id" varchar,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"created_by" varchar NOT NULL,
	"total_amount" numeric(10, 2),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"patient_number" varchar NOT NULL,
	"surname" varchar NOT NULL,
	"first_name" varchar NOT NULL,
	"birthday" varchar NOT NULL,
	"sex" varchar NOT NULL,
	"email" varchar,
	"phone" varchar,
	"address" text,
	"emergency_contact" text,
	"insurance_provider" varchar,
	"insurance_number" varchar,
	"allergies" text[],
	"allergy_notes" text,
	"medical_notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "preop_assessments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surgery_id" varchar NOT NULL,
	"height" varchar,
	"weight" varchar,
	"allergies" text[],
	"allergies_other" text,
	"cave" text,
	"asa" varchar,
	"special_notes" text,
	"anticoagulation_meds" text[],
	"anticoagulation_meds_other" text,
	"general_meds" text[],
	"general_meds_other" text,
	"medications_notes" text,
	"heart_illnesses" jsonb,
	"heart_notes" text,
	"lung_illnesses" jsonb,
	"lung_notes" text,
	"gi_illnesses" jsonb,
	"kidney_illnesses" jsonb,
	"metabolic_illnesses" jsonb,
	"gi_kidney_metabolic_notes" text,
	"neuro_illnesses" jsonb,
	"psych_illnesses" jsonb,
	"skeletal_illnesses" jsonb,
	"neuro_psych_skeletal_notes" text,
	"woman_issues" jsonb,
	"woman_notes" text,
	"noxen" jsonb,
	"noxen_notes" text,
	"children_issues" jsonb,
	"children_notes" text,
	"mallampati" varchar,
	"mouth_opening" varchar,
	"dentition" varchar,
	"airway_difficult" varchar,
	"airway_notes" text,
	"last_solids" varchar,
	"last_clear" varchar,
	"anesthesia_techniques" jsonb,
	"post_op_icu" boolean DEFAULT false,
	"anesthesia_other" text,
	"installations" jsonb,
	"installations_other" text,
	"surgical_approval" text,
	"assessment_date" varchar,
	"doctor_name" varchar,
	"doctor_signature" text,
	"status" varchar DEFAULT 'draft',
	"consent_given" boolean DEFAULT false,
	"consent_text" text,
	"patient_signature" text,
	"consent_date" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "preop_assessments_surgery_id_unique" UNIQUE("surgery_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"qty_on_hand" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_item_unit" UNIQUE("item_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "surgeries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" varchar,
	"hospital_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"surgery_room_id" varchar,
	"planned_date" timestamp NOT NULL,
	"planned_surgery" varchar NOT NULL,
	"surgeon" varchar,
	"actual_start_time" timestamp,
	"actual_end_time" timestamp,
	"status" varchar DEFAULT 'planned' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "surgery_rooms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar,
	"parent_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_hospital_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"role" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"password_hash" varchar,
	"must_change_password" boolean DEFAULT false,
	"reset_token" varchar,
	"reset_token_expiry" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"contact" text,
	"lead_time" integer DEFAULT 7,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vitals_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"timestamp" timestamp NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_groups" ADD CONSTRAINT "administration_groups_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_events" ADD CONSTRAINT "anesthesia_events_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_events" ADD CONSTRAINT "anesthesia_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_medications" ADD CONSTRAINT "anesthesia_medications_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_medications" ADD CONSTRAINT "anesthesia_medications_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_medications" ADD CONSTRAINT "anesthesia_medications_administered_by_users_id_fk" FOREIGN KEY ("administered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD CONSTRAINT "anesthesia_records_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD CONSTRAINT "anesthesia_records_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD CONSTRAINT "anesthesia_records_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_completions" ADD CONSTRAINT "checklist_completions_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_completions" ADD CONSTRAINT "checklist_completions_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_completions" ADD CONSTRAINT "checklist_completions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_completions" ADD CONSTRAINT "checklist_completions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_checks" ADD CONSTRAINT "controlled_checks_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_checks" ADD CONSTRAINT "controlled_checks_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_checks" ADD CONSTRAINT "controlled_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_anesthesia_settings" ADD CONSTRAINT "hospital_anesthesia_settings_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_anesthesia_unit_id_units_id_fk" FOREIGN KEY ("anesthesia_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_surgery_unit_id_units_id_fk" FOREIGN KEY ("surgery_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD CONSTRAINT "inventory_usage_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD CONSTRAINT "inventory_usage_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_configs" ADD CONSTRAINT "medication_configs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_groups" ADD CONSTRAINT "medication_groups_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD CONSTRAINT "preop_assessments_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_surgery_room_id_surgery_rooms_id_fk" FOREIGN KEY ("surgery_room_id") REFERENCES "public"."surgery_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surgery_rooms" ADD CONSTRAINT "surgery_rooms_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hospital_roles" ADD CONSTRAINT "user_hospital_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hospital_roles" ADD CONSTRAINT "user_hospital_roles_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hospital_roles" ADD CONSTRAINT "user_hospital_roles_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vitals_snapshots" ADD CONSTRAINT "vitals_snapshots_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activities_timestamp" ON "activities" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_activities_user" ON "activities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activities_item" ON "activities" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_activities_controlled" ON "activities" USING btree ("controlled_verified");--> statement-breakpoint
CREATE INDEX "idx_administration_groups_hospital" ON "administration_groups" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_alerts_hospital" ON "alerts" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_alerts_type" ON "alerts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_alerts_acknowledged" ON "alerts" USING btree ("acknowledged");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_events_record" ON "anesthesia_events" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_events_timestamp" ON "anesthesia_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_events_type" ON "anesthesia_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_medications_record" ON "anesthesia_medications" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_medications_item" ON "anesthesia_medications" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_medications_timestamp" ON "anesthesia_medications" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_medications_type" ON "anesthesia_medications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_records_surgery" ON "anesthesia_records" USING btree ("surgery_id");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_records_provider" ON "anesthesia_records" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_anesthesia_records_status" ON "anesthesia_records" USING btree ("case_status");--> statement-breakpoint
CREATE INDEX "idx_audit_trail_record" ON "audit_trail" USING btree ("record_type","record_id");--> statement-breakpoint
CREATE INDEX "idx_audit_trail_user" ON "audit_trail" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_trail_timestamp" ON "audit_trail" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_audit_trail_action" ON "audit_trail" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_cases_hospital" ON "cases" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_cases_patient" ON "cases" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "idx_cases_status" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_checklist_completions_template" ON "checklist_completions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_checklist_completions_hospital" ON "checklist_completions" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_checklist_completions_unit" ON "checklist_completions" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_checklist_completions_completed_at" ON "checklist_completions" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "idx_checklist_completions_due_date" ON "checklist_completions" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_checklist_templates_hospital" ON "checklist_templates" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_checklist_templates_unit" ON "checklist_templates" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_checklist_templates_active" ON "checklist_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_controlled_checks_hospital" ON "controlled_checks" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_controlled_checks_unit" ON "controlled_checks" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_controlled_checks_timestamp" ON "controlled_checks" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_folders_hospital" ON "folders" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_folders_unit" ON "folders" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_hospital_anesthesia_settings_hospital" ON "hospital_anesthesia_settings" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_hospital" ON "import_jobs" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_user" ON "import_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_status" ON "import_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_created" ON "import_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_inventory_usage_record" ON "inventory_usage" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_usage_item" ON "inventory_usage" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_items_hospital" ON "items" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_items_unit" ON "items" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_items_vendor" ON "items" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "idx_items_folder" ON "items" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "idx_lots_item" ON "lots" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_lots_expiry" ON "lots" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "idx_medication_configs_item" ON "medication_configs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_medication_configs_group" ON "medication_configs" USING btree ("medication_group");--> statement-breakpoint
CREATE INDEX "idx_medication_configs_admin_group" ON "medication_configs" USING btree ("administration_group");--> statement-breakpoint
CREATE INDEX "idx_medication_groups_hospital" ON "medication_groups" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_order_lines_order" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_lines_item" ON "order_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_orders_hospital" ON "orders" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_orders_vendor" ON "orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_patients_hospital" ON "patients" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_patients_surname" ON "patients" USING btree ("surname");--> statement-breakpoint
CREATE INDEX "idx_patients_number" ON "patients" USING btree ("hospital_id","patient_number");--> statement-breakpoint
CREATE INDEX "idx_preop_assessments_surgery" ON "preop_assessments" USING btree ("surgery_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_stock_levels_item" ON "stock_levels" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_stock_levels_unit" ON "stock_levels" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_surgeries_case" ON "surgeries" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_surgeries_hospital" ON "surgeries" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_surgeries_patient" ON "surgeries" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "idx_surgeries_room" ON "surgeries" USING btree ("surgery_room_id");--> statement-breakpoint
CREATE INDEX "idx_surgeries_status" ON "surgeries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_surgeries_planned_date" ON "surgeries" USING btree ("planned_date");--> statement-breakpoint
CREATE INDEX "idx_surgery_rooms_hospital" ON "surgery_rooms" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_units_hospital" ON "units" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_units_parent" ON "units" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_user_hospital_roles_user" ON "user_hospital_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_hospital_roles_hospital" ON "user_hospital_roles" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_user_hospital_roles_unit" ON "user_hospital_roles" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_vendors_hospital" ON "vendors" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_vitals_snapshots_record" ON "vitals_snapshots" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_vitals_snapshots_timestamp" ON "vitals_snapshots" USING btree ("timestamp");