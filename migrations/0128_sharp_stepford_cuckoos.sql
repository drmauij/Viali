DO $$ BEGIN
  ALTER TABLE "discharge_briefs" DROP CONSTRAINT IF EXISTS "discharge_briefs_template_id_discharge_brief_templates_id_fk";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discharge_brief_templates_active";--> statement-breakpoint
ALTER TABLE "discharge_brief_templates" DROP COLUMN IF EXISTS "is_active";--> statement-breakpoint
ALTER TABLE "discharge_briefs" DROP COLUMN IF EXISTS "template_id";
