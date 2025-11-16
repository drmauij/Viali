-- Rename vitals_snapshots table to clinical_snapshots
ALTER TABLE "vitals_snapshots" RENAME TO "clinical_snapshots";

-- Rename indexes
ALTER INDEX "idx_vitals_snapshots_record" RENAME TO "idx_clinical_snapshots_record";
ALTER INDEX "idx_vitals_snapshots_timestamp" RENAME TO "idx_clinical_snapshots_timestamp";
