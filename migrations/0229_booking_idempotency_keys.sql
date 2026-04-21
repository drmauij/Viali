CREATE TABLE IF NOT EXISTS "booking_idempotency_keys" (
	"hospital_id" varchar NOT NULL,
	"key" text NOT NULL,
	"appointment_id" varchar NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_idempotency_keys_hospital_id_key_pk" PRIMARY KEY("hospital_id","key")
);

CREATE INDEX IF NOT EXISTS "booking_idempotency_keys_created_at_idx"
  ON "booking_idempotency_keys" USING btree ("created_at");
