#!/usr/bin/env node
// One-shot generator for migrations/0209_fk_constraint_names_cleanup.sql
// Consumed by: node scripts/generate-fk-migration.mjs > migrations/0209_fk_constraint_names_cleanup.sql
// Safe to delete after the migration lands. Kept for audit / reproducibility.

/**
 * Each row: [table, column, newName, refTable, onDelete]
 * onDelete: "CASCADE" | null  (null means omit ON DELETE clause, preserving NO ACTION default)
 * All FKs reference the parent table's `id` column.
 */
const RENAMES = [
  ["anesthesia_airway_management",        "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["anesthesia_general_technique",        "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["anesthesia_installations",            "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["anesthesia_medications",              "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["anesthesia_neuraxial_blocks",         "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["anesthesia_peripheral_blocks",        "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["anesthesia_positions",                "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["anesthesia_record_medications",       "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["anesthesia_record_medications",       "medication_config_id",         "medication_config_id_medication_configs_fk",           "medication_configs",             "CASCADE"],
  ["anesthesia_set_medications",          "medication_config_id",         "medication_config_id_medication_configs_fk",           "medication_configs",             "CASCADE"],
  ["anesthesia_technique_details",        "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["appointment_action_tokens",           "appointment_id",               "appointment_id_clinic_appointments_fk",                "clinic_appointments",            "CASCADE"],
  ["checklist_template_assignments",      "template_id",                  "template_id_checklist_templates_fk",                   "checklist_templates",            "CASCADE"],
  ["clinical_snapshots",                  "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["difficult_airway_reports",            "airway_management_id",         "airway_management_id_anesthesia_airway_management_fk", "anesthesia_airway_management",   "CASCADE"],
  ["discharge_medication_template_items", "template_id",                  "template_id_discharge_medication_templates_fk",        "discharge_medication_templates", "CASCADE"],
  ["external_surgery_request_documents",  "request_id",                   "request_id_external_surgery_requests_fk",              "external_surgery_requests",      "CASCADE"],
  ["medication_couplings",                "coupled_medication_config_id", "coupled_medication_config_id_medication_configs_fk",   "medication_configs",             "CASCADE"],
  ["medication_couplings",                "primary_medication_config_id", "primary_medication_config_id_medication_configs_fk",   "medication_configs",             "CASCADE"],
  ["medication_set_items",                "medication_config_id",         "medication_config_id_medication_configs_fk",           "medication_configs",             "CASCADE"],
  ["patient_discharge_medication_items",  "discharge_medication_id",      "discharge_medication_id_patient_discharge_medications_fk", "patient_discharge_medications", "CASCADE"],
  ["patient_discharge_medications",       "inventory_committed_by",       "inventory_committed_by_users_fk",                      "users",                          null],
  ["patient_questionnaire_responses",     "link_id",                      "link_id_patient_questionnaire_links_fk",               "patient_questionnaire_links",    "CASCADE"],
  ["patient_questionnaire_reviews",       "preop_assessment_id",          "preop_assessment_id_preop_assessments_fk",             "preop_assessments",              null],
  ["patient_questionnaire_reviews",       "response_id",                  "response_id_patient_questionnaire_responses_fk",       "patient_questionnaire_responses","CASCADE"],
  ["patient_questionnaire_uploads",       "response_id",                  "response_id_patient_questionnaire_responses_fk",       "patient_questionnaire_responses","CASCADE"],
  ["planned_surgery_staff",               "daily_staff_pool_id",          "daily_staff_pool_id_daily_staff_pool_fk",              "daily_staff_pool",               "CASCADE"],
  ["surgeon_checklist_template_items",    "template_id",                  "template_id_surgeon_checklist_templates_fk",           "surgeon_checklist_templates",    "CASCADE"],
  ["surgery_preop_checklist_entries",     "item_id",                      "item_id_surgeon_checklist_template_items_fk",          "surgeon_checklist_template_items", null],
  ["surgery_preop_checklist_entries",     "template_id",                  "template_id_surgeon_checklist_templates_fk",           "surgeon_checklist_templates",    null],
  ["surgery_staff_entries",               "anesthesia_record_id",         "anesthesia_record_id_anesthesia_records_fk",           "anesthesia_records",             "CASCADE"],
  ["tardoc_invoice_template_items",       "template_id",                  "template_id_tardoc_invoice_templates_fk",              "tardoc_invoice_templates",       "CASCADE"],
];

function renameBlock(i, [table, column, newName, refTable, onDelete]) {
  const onDeleteClause = onDelete ? `\n      ON DELETE ${onDelete}` : "";
  return `-- ${i}/${RENAMES.length}: ${table}.${column} -> ${refTable}(id)${onDelete ? ` ${onDelete}` : " (NO ACTION)"}
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = '${table}'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = '${table}'::regclass
        AND a.attname  = ANY(ARRAY['${column}'])
    );
  IF old_name IS NOT NULL AND old_name <> '${newName}' THEN
    EXECUTE format('ALTER TABLE ${table} DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = '${newName}'
      AND conrelid = '${table}'::regclass
  ) THEN
    ALTER TABLE ${table}
      ADD CONSTRAINT ${newName}
      FOREIGN KEY (${column})
      REFERENCES ${refTable}(id)${onDeleteClause};
  END IF;
END $$;
`;
}

const header = `-- Migration 0209: FK constraint names cleanup
-- Renames ${RENAMES.length} truncated FK constraints to short, non-truncating names.
-- Also fixes the adjacent checklist_templates.room_ids default drift.
-- Idempotent: safe to run multiple times.
-- Spec: docs/superpowers/specs/2026-04-11-fk-constraint-names-cleanup-design.md

-- Adjacent drift fix: checklist_templates.room_ids default
ALTER TABLE "checklist_templates" ALTER COLUMN "room_ids" SET DEFAULT '{}';

`;

process.stdout.write(header + RENAMES.map((r, i) => renameBlock(i + 1, r)).join("\n"));
