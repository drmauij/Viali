ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "questionnaire_alias" varchar UNIQUE;
