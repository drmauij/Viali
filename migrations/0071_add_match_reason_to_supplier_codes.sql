-- Add missing columns to supplier_codes table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_codes' AND column_name = 'match_reason') THEN
    ALTER TABLE supplier_codes ADD COLUMN match_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_codes' AND column_name = 'searched_name') THEN
    ALTER TABLE supplier_codes ADD COLUMN searched_name text;
  END IF;
END $$;
