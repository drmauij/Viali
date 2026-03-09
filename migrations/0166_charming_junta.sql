-- Remove duplicate Cal.com bookings (keep the first one created) before adding unique constraint
DELETE FROM clinic_appointments
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY calcom_booking_uid ORDER BY created_at ASC) AS rn
    FROM clinic_appointments
    WHERE calcom_booking_uid IS NOT NULL
  ) dupes
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_clinic_appointments_calcom_uid_unique" ON "clinic_appointments" USING btree ("calcom_booking_uid") WHERE calcom_booking_uid IS NOT NULL;
