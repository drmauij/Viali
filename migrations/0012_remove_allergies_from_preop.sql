-- Remove allergies and allergiesOther columns from pre_op_assessments table
-- Allergies are now stored exclusively in patients.allergies and patients.otherAllergies

ALTER TABLE "pre_op_assessments" DROP COLUMN IF EXISTS "allergies";
ALTER TABLE "pre_op_assessments" DROP COLUMN IF EXISTS "allergiesOther";
