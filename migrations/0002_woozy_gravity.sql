DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'hospital_anesthesia_settings' 
    AND column_name = 'allergy_list' 
    AND data_type != 'jsonb'
  ) THEN
    ALTER TABLE "hospital_anesthesia_settings" ALTER COLUMN "allergy_list" SET DATA TYPE jsonb USING to_jsonb("allergy_list");
  END IF;
END $$;
