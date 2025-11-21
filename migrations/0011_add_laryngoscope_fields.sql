-- Add laryngoscopy documentation fields to anesthesia_airway_management table
ALTER TABLE "anesthesia_airway_management" ADD COLUMN IF NOT EXISTS "laryngoscope_type" varchar;
ALTER TABLE "anesthesia_airway_management" ADD COLUMN IF NOT EXISTS "laryngoscope_blade" varchar;
ALTER TABLE "anesthesia_airway_management" ADD COLUMN IF NOT EXISTS "intubation_attempts" integer;
ALTER TABLE "anesthesia_airway_management" ADD COLUMN IF NOT EXISTS "difficult_airway" boolean DEFAULT false;
ALTER TABLE "anesthesia_airway_management" ADD COLUMN IF NOT EXISTS "cormack_lehane" varchar;
