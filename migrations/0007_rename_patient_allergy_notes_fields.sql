-- Rename patient allergy and notes fields for consistency
ALTER TABLE "patients" RENAME COLUMN "allergy_notes" TO "other_allergies";
ALTER TABLE "patients" RENAME COLUMN "medical_notes" TO "internal_notes";
