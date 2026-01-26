-- Add is_automatic and message_type columns to patient_messages table
-- Make sent_by nullable for automatic system-generated messages

DO $$
BEGIN
  -- Drop NOT NULL constraint on sent_by if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patient_messages' 
    AND column_name = 'sent_by' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE patient_messages ALTER COLUMN sent_by DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patient_messages' 
    AND column_name = 'is_automatic'
  ) THEN
    ALTER TABLE patient_messages ADD COLUMN is_automatic boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patient_messages' 
    AND column_name = 'message_type'
  ) THEN
    ALTER TABLE patient_messages ADD COLUMN message_type varchar(30) DEFAULT 'manual';
  END IF;
END $$;
