-- Migration 0209: FK constraint names cleanup
-- Renames 32 truncated FK constraints to short, non-truncating names.
-- Also fixes the adjacent checklist_templates.room_ids default drift.
-- Idempotent: safe to run multiple times.
-- Spec: docs/superpowers/specs/2026-04-11-fk-constraint-names-cleanup-design.md

-- Adjacent drift fix: checklist_templates.room_ids default
ALTER TABLE "checklist_templates" ALTER COLUMN "room_ids" SET DEFAULT '{}';

-- 1/32: anesthesia_airway_management.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_airway_management'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_airway_management'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_airway_management DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'anesthesia_airway_management'::regclass
  ) THEN
    ALTER TABLE anesthesia_airway_management
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 2/32: anesthesia_general_technique.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_general_technique'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_general_technique'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_general_technique DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'anesthesia_general_technique'::regclass
  ) THEN
    ALTER TABLE anesthesia_general_technique
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 3/32: anesthesia_installations.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_installations'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_installations'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_installations DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'anesthesia_installations'::regclass
  ) THEN
    ALTER TABLE anesthesia_installations
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 4/32: anesthesia_medications.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_medications'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_medications'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_medications DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'anesthesia_medications'::regclass
  ) THEN
    ALTER TABLE anesthesia_medications
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 5/32: anesthesia_neuraxial_blocks.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_neuraxial_blocks'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_neuraxial_blocks'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_neuraxial_blocks DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'anesthesia_neuraxial_blocks'::regclass
  ) THEN
    ALTER TABLE anesthesia_neuraxial_blocks
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 6/32: anesthesia_peripheral_blocks.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_peripheral_blocks'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_peripheral_blocks'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_peripheral_blocks DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'anesthesia_peripheral_blocks'::regclass
  ) THEN
    ALTER TABLE anesthesia_peripheral_blocks
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 7/32: anesthesia_positions.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_positions'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_positions'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_positions DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'anesthesia_positions'::regclass
  ) THEN
    ALTER TABLE anesthesia_positions
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 8/32: anesthesia_record_medications.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_record_medications'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_record_medications'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_record_medications DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'anesthesia_record_medications'::regclass
  ) THEN
    ALTER TABLE anesthesia_record_medications
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 9/32: anesthesia_record_medications.medication_config_id -> medication_configs(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_record_medications'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_record_medications'::regclass
        AND a.attname  = ANY(ARRAY['medication_config_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'medication_config_id_medication_configs_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_record_medications DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'medication_config_id_medication_configs_fk'
      AND conrelid = 'anesthesia_record_medications'::regclass
  ) THEN
    ALTER TABLE anesthesia_record_medications
      ADD CONSTRAINT medication_config_id_medication_configs_fk
      FOREIGN KEY (medication_config_id)
      REFERENCES medication_configs(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 10/32: anesthesia_set_medications.medication_config_id -> medication_configs(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_set_medications'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_set_medications'::regclass
        AND a.attname  = ANY(ARRAY['medication_config_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'medication_config_id_medication_configs_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_set_medications DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'medication_config_id_medication_configs_fk'
      AND conrelid = 'anesthesia_set_medications'::regclass
  ) THEN
    ALTER TABLE anesthesia_set_medications
      ADD CONSTRAINT medication_config_id_medication_configs_fk
      FOREIGN KEY (medication_config_id)
      REFERENCES medication_configs(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 11/32: anesthesia_technique_details.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'anesthesia_technique_details'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'anesthesia_technique_details'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE anesthesia_technique_details DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'anesthesia_technique_details'::regclass
  ) THEN
    ALTER TABLE anesthesia_technique_details
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 12/32: appointment_action_tokens.appointment_id -> clinic_appointments(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'appointment_action_tokens'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'appointment_action_tokens'::regclass
        AND a.attname  = ANY(ARRAY['appointment_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'appointment_id_clinic_appointments_fk' THEN
    EXECUTE format('ALTER TABLE appointment_action_tokens DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'appointment_id_clinic_appointments_fk'
      AND conrelid = 'appointment_action_tokens'::regclass
  ) THEN
    ALTER TABLE appointment_action_tokens
      ADD CONSTRAINT appointment_id_clinic_appointments_fk
      FOREIGN KEY (appointment_id)
      REFERENCES clinic_appointments(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 13/32: checklist_template_assignments.template_id -> checklist_templates(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'checklist_template_assignments'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'checklist_template_assignments'::regclass
        AND a.attname  = ANY(ARRAY['template_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'template_id_checklist_templates_fk' THEN
    EXECUTE format('ALTER TABLE checklist_template_assignments DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'template_id_checklist_templates_fk'
      AND conrelid = 'checklist_template_assignments'::regclass
  ) THEN
    ALTER TABLE checklist_template_assignments
      ADD CONSTRAINT template_id_checklist_templates_fk
      FOREIGN KEY (template_id)
      REFERENCES checklist_templates(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 14/32: clinical_snapshots.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'clinical_snapshots'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'clinical_snapshots'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE clinical_snapshots DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'clinical_snapshots'::regclass
  ) THEN
    ALTER TABLE clinical_snapshots
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 15/32: difficult_airway_reports.airway_management_id -> anesthesia_airway_management(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'difficult_airway_reports'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'difficult_airway_reports'::regclass
        AND a.attname  = ANY(ARRAY['airway_management_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'airway_management_id_anesthesia_airway_management_fk' THEN
    EXECUTE format('ALTER TABLE difficult_airway_reports DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'airway_management_id_anesthesia_airway_management_fk'
      AND conrelid = 'difficult_airway_reports'::regclass
  ) THEN
    ALTER TABLE difficult_airway_reports
      ADD CONSTRAINT airway_management_id_anesthesia_airway_management_fk
      FOREIGN KEY (airway_management_id)
      REFERENCES anesthesia_airway_management(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 16/32: discharge_medication_template_items.template_id -> discharge_medication_templates(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'discharge_medication_template_items'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'discharge_medication_template_items'::regclass
        AND a.attname  = ANY(ARRAY['template_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'template_id_discharge_medication_templates_fk' THEN
    EXECUTE format('ALTER TABLE discharge_medication_template_items DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'template_id_discharge_medication_templates_fk'
      AND conrelid = 'discharge_medication_template_items'::regclass
  ) THEN
    ALTER TABLE discharge_medication_template_items
      ADD CONSTRAINT template_id_discharge_medication_templates_fk
      FOREIGN KEY (template_id)
      REFERENCES discharge_medication_templates(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 17/32: external_surgery_request_documents.request_id -> external_surgery_requests(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'external_surgery_request_documents'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'external_surgery_request_documents'::regclass
        AND a.attname  = ANY(ARRAY['request_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'request_id_external_surgery_requests_fk' THEN
    EXECUTE format('ALTER TABLE external_surgery_request_documents DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'request_id_external_surgery_requests_fk'
      AND conrelid = 'external_surgery_request_documents'::regclass
  ) THEN
    ALTER TABLE external_surgery_request_documents
      ADD CONSTRAINT request_id_external_surgery_requests_fk
      FOREIGN KEY (request_id)
      REFERENCES external_surgery_requests(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 18/32: medication_couplings.coupled_medication_config_id -> medication_configs(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'medication_couplings'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'medication_couplings'::regclass
        AND a.attname  = ANY(ARRAY['coupled_medication_config_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'coupled_medication_config_id_medication_configs_fk' THEN
    EXECUTE format('ALTER TABLE medication_couplings DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'coupled_medication_config_id_medication_configs_fk'
      AND conrelid = 'medication_couplings'::regclass
  ) THEN
    ALTER TABLE medication_couplings
      ADD CONSTRAINT coupled_medication_config_id_medication_configs_fk
      FOREIGN KEY (coupled_medication_config_id)
      REFERENCES medication_configs(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 19/32: medication_couplings.primary_medication_config_id -> medication_configs(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'medication_couplings'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'medication_couplings'::regclass
        AND a.attname  = ANY(ARRAY['primary_medication_config_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'primary_medication_config_id_medication_configs_fk' THEN
    EXECUTE format('ALTER TABLE medication_couplings DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'primary_medication_config_id_medication_configs_fk'
      AND conrelid = 'medication_couplings'::regclass
  ) THEN
    ALTER TABLE medication_couplings
      ADD CONSTRAINT primary_medication_config_id_medication_configs_fk
      FOREIGN KEY (primary_medication_config_id)
      REFERENCES medication_configs(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 20/32: medication_set_items.medication_config_id -> medication_configs(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'medication_set_items'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'medication_set_items'::regclass
        AND a.attname  = ANY(ARRAY['medication_config_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'medication_config_id_medication_configs_fk' THEN
    EXECUTE format('ALTER TABLE medication_set_items DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'medication_config_id_medication_configs_fk'
      AND conrelid = 'medication_set_items'::regclass
  ) THEN
    ALTER TABLE medication_set_items
      ADD CONSTRAINT medication_config_id_medication_configs_fk
      FOREIGN KEY (medication_config_id)
      REFERENCES medication_configs(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 21/32: patient_discharge_medication_items.discharge_medication_id -> patient_discharge_medications(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'patient_discharge_medication_items'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'patient_discharge_medication_items'::regclass
        AND a.attname  = ANY(ARRAY['discharge_medication_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'discharge_medication_id_patient_discharge_medications_fk' THEN
    EXECUTE format('ALTER TABLE patient_discharge_medication_items DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'discharge_medication_id_patient_discharge_medications_fk'
      AND conrelid = 'patient_discharge_medication_items'::regclass
  ) THEN
    ALTER TABLE patient_discharge_medication_items
      ADD CONSTRAINT discharge_medication_id_patient_discharge_medications_fk
      FOREIGN KEY (discharge_medication_id)
      REFERENCES patient_discharge_medications(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 22/32: patient_discharge_medications.inventory_committed_by -> users(id) (NO ACTION)
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'patient_discharge_medications'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'patient_discharge_medications'::regclass
        AND a.attname  = ANY(ARRAY['inventory_committed_by'])
    );
  IF old_name IS NOT NULL AND old_name <> 'inventory_committed_by_users_fk' THEN
    EXECUTE format('ALTER TABLE patient_discharge_medications DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'inventory_committed_by_users_fk'
      AND conrelid = 'patient_discharge_medications'::regclass
  ) THEN
    ALTER TABLE patient_discharge_medications
      ADD CONSTRAINT inventory_committed_by_users_fk
      FOREIGN KEY (inventory_committed_by)
      REFERENCES users(id);
  END IF;
END $$;

-- 23/32: patient_questionnaire_responses.link_id -> patient_questionnaire_links(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'patient_questionnaire_responses'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'patient_questionnaire_responses'::regclass
        AND a.attname  = ANY(ARRAY['link_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'link_id_patient_questionnaire_links_fk' THEN
    EXECUTE format('ALTER TABLE patient_questionnaire_responses DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'link_id_patient_questionnaire_links_fk'
      AND conrelid = 'patient_questionnaire_responses'::regclass
  ) THEN
    ALTER TABLE patient_questionnaire_responses
      ADD CONSTRAINT link_id_patient_questionnaire_links_fk
      FOREIGN KEY (link_id)
      REFERENCES patient_questionnaire_links(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 24/32: patient_questionnaire_reviews.preop_assessment_id -> preop_assessments(id) (NO ACTION)
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'patient_questionnaire_reviews'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'patient_questionnaire_reviews'::regclass
        AND a.attname  = ANY(ARRAY['preop_assessment_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'preop_assessment_id_preop_assessments_fk' THEN
    EXECUTE format('ALTER TABLE patient_questionnaire_reviews DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'preop_assessment_id_preop_assessments_fk'
      AND conrelid = 'patient_questionnaire_reviews'::regclass
  ) THEN
    ALTER TABLE patient_questionnaire_reviews
      ADD CONSTRAINT preop_assessment_id_preop_assessments_fk
      FOREIGN KEY (preop_assessment_id)
      REFERENCES preop_assessments(id);
  END IF;
END $$;

-- 25/32: patient_questionnaire_reviews.response_id -> patient_questionnaire_responses(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'patient_questionnaire_reviews'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'patient_questionnaire_reviews'::regclass
        AND a.attname  = ANY(ARRAY['response_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'response_id_patient_questionnaire_responses_fk' THEN
    EXECUTE format('ALTER TABLE patient_questionnaire_reviews DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'response_id_patient_questionnaire_responses_fk'
      AND conrelid = 'patient_questionnaire_reviews'::regclass
  ) THEN
    ALTER TABLE patient_questionnaire_reviews
      ADD CONSTRAINT response_id_patient_questionnaire_responses_fk
      FOREIGN KEY (response_id)
      REFERENCES patient_questionnaire_responses(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 26/32: patient_questionnaire_uploads.response_id -> patient_questionnaire_responses(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'patient_questionnaire_uploads'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'patient_questionnaire_uploads'::regclass
        AND a.attname  = ANY(ARRAY['response_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'response_id_patient_questionnaire_responses_fk' THEN
    EXECUTE format('ALTER TABLE patient_questionnaire_uploads DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'response_id_patient_questionnaire_responses_fk'
      AND conrelid = 'patient_questionnaire_uploads'::regclass
  ) THEN
    ALTER TABLE patient_questionnaire_uploads
      ADD CONSTRAINT response_id_patient_questionnaire_responses_fk
      FOREIGN KEY (response_id)
      REFERENCES patient_questionnaire_responses(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 27/32: planned_surgery_staff.daily_staff_pool_id -> daily_staff_pool(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'planned_surgery_staff'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'planned_surgery_staff'::regclass
        AND a.attname  = ANY(ARRAY['daily_staff_pool_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'daily_staff_pool_id_daily_staff_pool_fk' THEN
    EXECUTE format('ALTER TABLE planned_surgery_staff DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'daily_staff_pool_id_daily_staff_pool_fk'
      AND conrelid = 'planned_surgery_staff'::regclass
  ) THEN
    ALTER TABLE planned_surgery_staff
      ADD CONSTRAINT daily_staff_pool_id_daily_staff_pool_fk
      FOREIGN KEY (daily_staff_pool_id)
      REFERENCES daily_staff_pool(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 28/32: surgeon_checklist_template_items.template_id -> surgeon_checklist_templates(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'surgeon_checklist_template_items'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'surgeon_checklist_template_items'::regclass
        AND a.attname  = ANY(ARRAY['template_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'template_id_surgeon_checklist_templates_fk' THEN
    EXECUTE format('ALTER TABLE surgeon_checklist_template_items DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'template_id_surgeon_checklist_templates_fk'
      AND conrelid = 'surgeon_checklist_template_items'::regclass
  ) THEN
    ALTER TABLE surgeon_checklist_template_items
      ADD CONSTRAINT template_id_surgeon_checklist_templates_fk
      FOREIGN KEY (template_id)
      REFERENCES surgeon_checklist_templates(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 29/32: surgery_preop_checklist_entries.item_id -> surgeon_checklist_template_items(id) (NO ACTION)
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'surgery_preop_checklist_entries'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'surgery_preop_checklist_entries'::regclass
        AND a.attname  = ANY(ARRAY['item_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'item_id_surgeon_checklist_template_items_fk' THEN
    EXECUTE format('ALTER TABLE surgery_preop_checklist_entries DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'item_id_surgeon_checklist_template_items_fk'
      AND conrelid = 'surgery_preop_checklist_entries'::regclass
  ) THEN
    ALTER TABLE surgery_preop_checklist_entries
      ADD CONSTRAINT item_id_surgeon_checklist_template_items_fk
      FOREIGN KEY (item_id)
      REFERENCES surgeon_checklist_template_items(id);
  END IF;
END $$;

-- 30/32: surgery_preop_checklist_entries.template_id -> surgeon_checklist_templates(id) (NO ACTION)
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'surgery_preop_checklist_entries'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'surgery_preop_checklist_entries'::regclass
        AND a.attname  = ANY(ARRAY['template_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'template_id_surgeon_checklist_templates_fk' THEN
    EXECUTE format('ALTER TABLE surgery_preop_checklist_entries DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'template_id_surgeon_checklist_templates_fk'
      AND conrelid = 'surgery_preop_checklist_entries'::regclass
  ) THEN
    ALTER TABLE surgery_preop_checklist_entries
      ADD CONSTRAINT template_id_surgeon_checklist_templates_fk
      FOREIGN KEY (template_id)
      REFERENCES surgeon_checklist_templates(id);
  END IF;
END $$;

-- 31/32: surgery_staff_entries.anesthesia_record_id -> anesthesia_records(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'surgery_staff_entries'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'surgery_staff_entries'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'anesthesia_record_id_anesthesia_records_fk' THEN
    EXECUTE format('ALTER TABLE surgery_staff_entries DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'anesthesia_record_id_anesthesia_records_fk'
      AND conrelid = 'surgery_staff_entries'::regclass
  ) THEN
    ALTER TABLE surgery_staff_entries
      ADD CONSTRAINT anesthesia_record_id_anesthesia_records_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 32/32: tardoc_invoice_template_items.template_id -> tardoc_invoice_templates(id) CASCADE
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'tardoc_invoice_template_items'::regclass
    AND c.contype  = 'f'
    AND c.conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'tardoc_invoice_template_items'::regclass
        AND a.attname  = ANY(ARRAY['template_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'template_id_tardoc_invoice_templates_fk' THEN
    EXECUTE format('ALTER TABLE tardoc_invoice_template_items DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'template_id_tardoc_invoice_templates_fk'
      AND conrelid = 'tardoc_invoice_template_items'::regclass
  ) THEN
    ALTER TABLE tardoc_invoice_template_items
      ADD CONSTRAINT template_id_tardoc_invoice_templates_fk
      FOREIGN KEY (template_id)
      REFERENCES tardoc_invoice_templates(id)
      ON DELETE CASCADE;
  END IF;
END $$;
