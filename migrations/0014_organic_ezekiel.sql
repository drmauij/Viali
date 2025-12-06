CREATE TABLE "daily_room_staff" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_staff_pool_id" varchar NOT NULL,
	"surgery_room_id" varchar NOT NULL,
	"date" date NOT NULL,
	"role" varchar NOT NULL,
	"name" varchar NOT NULL,
	"user_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "idx_daily_room_staff_unique" UNIQUE("daily_staff_pool_id","surgery_room_id","date")
);
--> statement-breakpoint
CREATE TABLE "daily_staff_pool" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"date" date NOT NULL,
	"user_id" varchar,
	"name" varchar NOT NULL,
	"role" varchar NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "planned_surgery_staff" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surgery_id" varchar NOT NULL,
	"daily_staff_pool_id" varchar NOT NULL,
	"role" varchar NOT NULL,
	"name" varchar NOT NULL,
	"user_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "idx_planned_surgery_staff_unique" UNIQUE("surgery_id","daily_staff_pool_id")
);
--> statement-breakpoint
ALTER TABLE "daily_room_staff" ADD CONSTRAINT "daily_room_staff_daily_staff_pool_id_daily_staff_pool_id_fk" FOREIGN KEY ("daily_staff_pool_id") REFERENCES "public"."daily_staff_pool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_room_staff" ADD CONSTRAINT "daily_room_staff_surgery_room_id_surgery_rooms_id_fk" FOREIGN KEY ("surgery_room_id") REFERENCES "public"."surgery_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_room_staff" ADD CONSTRAINT "daily_room_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_room_staff" ADD CONSTRAINT "daily_room_staff_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_staff_pool" ADD CONSTRAINT "daily_staff_pool_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_staff_pool" ADD CONSTRAINT "daily_staff_pool_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_staff_pool" ADD CONSTRAINT "daily_staff_pool_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_surgery_staff" ADD CONSTRAINT "planned_surgery_staff_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_surgery_staff" ADD CONSTRAINT "planned_surgery_staff_daily_staff_pool_id_daily_staff_pool_id_fk" FOREIGN KEY ("daily_staff_pool_id") REFERENCES "public"."daily_staff_pool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_surgery_staff" ADD CONSTRAINT "planned_surgery_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_surgery_staff" ADD CONSTRAINT "planned_surgery_staff_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_daily_room_staff_pool" ON "daily_room_staff" USING btree ("daily_staff_pool_id");--> statement-breakpoint
CREATE INDEX "idx_daily_room_staff_room" ON "daily_room_staff" USING btree ("surgery_room_id");--> statement-breakpoint
CREATE INDEX "idx_daily_room_staff_date" ON "daily_room_staff" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_daily_staff_pool_hospital" ON "daily_staff_pool" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_daily_staff_pool_date" ON "daily_staff_pool" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_daily_staff_pool_user" ON "daily_staff_pool" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_planned_surgery_staff_surgery" ON "planned_surgery_staff" USING btree ("surgery_id");--> statement-breakpoint
CREATE INDEX "idx_planned_surgery_staff_pool" ON "planned_surgery_staff" USING btree ("daily_staff_pool_id");