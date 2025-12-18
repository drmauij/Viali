-- Add is_default column to surgeon_checklist_templates (idempotent)
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='surgeon_checklist_templates' AND column_name='is_default'
  ) THEN 
    ALTER TABLE "surgeon_checklist_templates" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;
  END IF; 
END $$;
