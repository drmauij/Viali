-- Add reminder_sent and reminder_sent_at columns to surgeries table for pre-surgery reminders
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'reminder_sent') THEN
    ALTER TABLE surgeries ADD COLUMN reminder_sent boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'reminder_sent_at') THEN
    ALTER TABLE surgeries ADD COLUMN reminder_sent_at timestamp;
  END IF;
END $$;
