CREATE TABLE IF NOT EXISTS "shift_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"icon" text,
	"color" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_shifts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"date" date NOT NULL,
	"shift_type_id" varchar NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_shift_type_id_shift_types_id_fk" FOREIGN KEY ("shift_type_id") REFERENCES "public"."shift_types"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_types_hospital_sort_idx" ON "shift_types" USING btree ("hospital_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_types_hospital_unit_idx" ON "shift_types" USING btree ("hospital_id","unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_shifts_hospital_user_date_uidx" ON "staff_shifts" USING btree ("hospital_id","user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_shifts_hospital_date_idx" ON "staff_shifts" USING btree ("hospital_id","date");
