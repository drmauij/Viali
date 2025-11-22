-- Migrate allergies data from pre_op_assessments to patients table
-- Step 1: Backfill allergies data from pre_op_assessments to patients
-- Only update patient allergies if they're currently empty/null (preserves existing patient-level data as authoritative)

UPDATE patients p
SET 
  allergies = COALESCE(p.allergies, poa.allergies),
  "otherAllergies" = COALESCE(p."otherAllergies", poa."allergiesOther")
FROM pre_op_assessments poa
WHERE p.id = poa."patientId"
  AND (
    (p.allergies IS NULL AND poa.allergies IS NOT NULL) OR
    (p."otherAllergies" IS NULL AND poa."allergiesOther" IS NOT NULL)
  );

-- Step 2: Remove allergies and allergiesOther columns from pre_op_assessments table
-- Allergies are now stored exclusively in patients.allergies and patients.otherAllergies

ALTER TABLE "pre_op_assessments" DROP COLUMN IF EXISTS "allergies";
ALTER TABLE "pre_op_assessments" DROP COLUMN IF EXISTS "allergiesOther";
