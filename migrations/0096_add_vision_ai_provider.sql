-- Add visionAiProvider field to hospitals for switching between OpenAI and Pixtral vision AI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'hospitals' AND column_name = 'vision_ai_provider'
  ) THEN
    ALTER TABLE hospitals ADD COLUMN vision_ai_provider varchar DEFAULT 'openai';
  END IF;
END $$;
