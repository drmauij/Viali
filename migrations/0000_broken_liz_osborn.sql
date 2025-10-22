CREATE TABLE IF NOT EXISTS "activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"user_id" varchar NOT NULL,
	"action" varchar NOT NULL,
	"item_id" varchar,
	"lot_id" varchar,
	"location_id" varchar,
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
CREATE TABLE IF NOT EXISTS "administration_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts" (
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
CREATE TABLE IF NOT EXISTS "checklist_completions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"location_id" varchar NOT NULL,
	"completed_by" varchar NOT NULL,
	"completed_at" timestamp DEFAULT now(),
	"due_date" timestamp NOT NULL,
	"comment" text,
	"signature" text NOT NULL,
	"template_snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checklist_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"location_id" varchar NOT NULL,
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
CREATE TABLE IF NOT EXISTS "controlled_checks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"location_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"signature" text NOT NULL,
	"check_items" jsonb NOT NULL,
	"all_match" boolean NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"location_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hospitals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"address" text,
	"timezone" varchar DEFAULT 'UTC',
	"google_auth_enabled" boolean DEFAULT true,
	"local_auth_enabled" boolean DEFAULT true,
	"license_type" varchar DEFAULT 'free' NOT NULL,
	"anesthesia_location_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"location_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"status" varchar DEFAULT 'queued' NOT NULL,
	"total_images" integer NOT NULL,
	"processed_images" integer DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS "items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"location_id" varchar NOT NULL,
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
	"anesthesia_type" varchar DEFAULT 'none' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar,
	"parent_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"lot_number" varchar NOT NULL,
	"expiry_date" timestamp,
	"location_id" varchar NOT NULL,
	"qty" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medication_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"medication_group" varchar,
	"administration_group" varchar,
	"ampule_total_content" varchar,
	"default_dose" varchar,
	"administration_route" varchar,
	"administration_unit" varchar,
	"is_rate_controlled" boolean DEFAULT false,
	"rate_unit" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "medication_configs_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medication_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_lines" (
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
CREATE TABLE IF NOT EXISTS "orders" (
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
CREATE TABLE IF NOT EXISTS "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_levels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"location_id" varchar NOT NULL,
	"qty_on_hand" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_item_location" UNIQUE("item_id","location_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surgery_rooms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_hospital_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"location_id" varchar NOT NULL,
	"role" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
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
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"contact" text,
	"lead_time" integer DEFAULT 7,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administration_groups" ADD CONSTRAINT "administration_groups_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_completions" ADD CONSTRAINT "checklist_completions_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_completions" ADD CONSTRAINT "checklist_completions_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_completions" ADD CONSTRAINT "checklist_completions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_completions" ADD CONSTRAINT "checklist_completions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_checks" ADD CONSTRAINT "controlled_checks_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_checks" ADD CONSTRAINT "controlled_checks_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_checks" ADD CONSTRAINT "controlled_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_anesthesia_location_id_locations_id_fk" FOREIGN KEY ("anesthesia_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_configs" ADD CONSTRAINT "medication_configs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_groups" ADD CONSTRAINT "medication_groups_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surgery_rooms" ADD CONSTRAINT "surgery_rooms_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hospital_roles" ADD CONSTRAINT "user_hospital_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hospital_roles" ADD CONSTRAINT "user_hospital_roles_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hospital_roles" ADD CONSTRAINT "user_hospital_roles_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activities_timestamp" ON "activities" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_activities_user" ON "activities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activities_item" ON "activities" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_activities_controlled" ON "activities" USING btree ("controlled_verified");--> statement-breakpoint
CREATE INDEX "idx_administration_groups_hospital" ON "administration_groups" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_alerts_hospital" ON "alerts" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_alerts_type" ON "alerts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_alerts_acknowledged" ON "alerts" USING btree ("acknowledged");--> statement-breakpoint
CREATE INDEX "idx_checklist_completions_template" ON "checklist_completions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_checklist_completions_hospital" ON "checklist_completions" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_checklist_completions_location" ON "checklist_completions" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_checklist_completions_completed_at" ON "checklist_completions" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "idx_checklist_completions_due_date" ON "checklist_completions" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_checklist_templates_hospital" ON "checklist_templates" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_checklist_templates_location" ON "checklist_templates" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_checklist_templates_active" ON "checklist_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_controlled_checks_hospital" ON "controlled_checks" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_controlled_checks_location" ON "controlled_checks" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_controlled_checks_timestamp" ON "controlled_checks" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_folders_hospital" ON "folders" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_folders_location" ON "folders" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_hospital" ON "import_jobs" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_user" ON "import_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_status" ON "import_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_created" ON "import_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_items_hospital" ON "items" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_items_location" ON "items" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_items_vendor" ON "items" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "idx_items_folder" ON "items" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "idx_items_anesthesia_type" ON "items" USING btree ("anesthesia_type");--> statement-breakpoint
CREATE INDEX "idx_locations_hospital" ON "locations" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_locations_parent" ON "locations" USING btree ("parent_id");--> statement-breakpoint
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
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_stock_levels_item" ON "stock_levels" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_stock_levels_location" ON "stock_levels" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_surgery_rooms_hospital" ON "surgery_rooms" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_user_hospital_roles_user" ON "user_hospital_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_hospital_roles_hospital" ON "user_hospital_roles" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_user_hospital_roles_location" ON "user_hospital_roles" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_vendors_hospital" ON "vendors" USING btree ("hospital_id");