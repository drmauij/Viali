-- Add document_type column to terms_acceptances for multiple legal documents
DO $$
BEGIN
  -- Drop the old unique constraint if it exists
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'idx_terms_acceptances_hospital_version') THEN
    ALTER TABLE "terms_acceptances" DROP CONSTRAINT "idx_terms_acceptances_hospital_version";
  END IF;
  
  -- Add document_type column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'terms_acceptances' AND column_name = 'document_type') THEN
    ALTER TABLE "terms_acceptances" ADD COLUMN "document_type" varchar DEFAULT 'terms' NOT NULL;
  END IF;
  
  -- Create index on document_type if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_terms_acceptances_document_type') THEN
    CREATE INDEX "idx_terms_acceptances_document_type" ON "terms_acceptances" USING btree ("document_type");
  END IF;
  
  -- Add new unique constraint for hospital + version + document_type if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'idx_terms_acceptances_hospital_version_doctype') THEN
    ALTER TABLE "terms_acceptances" ADD CONSTRAINT "idx_terms_acceptances_hospital_version_doctype" UNIQUE("hospital_id","version","document_type");
  END IF;
END $$;
