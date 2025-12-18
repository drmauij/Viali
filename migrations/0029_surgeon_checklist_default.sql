-- Add isDefault column to surgeon_checklist_templates
ALTER TABLE "surgeon_checklist_templates" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;
