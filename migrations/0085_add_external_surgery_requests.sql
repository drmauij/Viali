-- Add external surgery token to hospitals
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'external_surgery_token') THEN
    ALTER TABLE hospitals ADD COLUMN external_surgery_token varchar UNIQUE;
  END IF;
END $$;

-- Create external_surgery_requests table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'external_surgery_requests') THEN
    CREATE TABLE external_surgery_requests (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      hospital_id varchar NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      
      -- Surgeon (external doctor) info
      surgeon_first_name varchar NOT NULL,
      surgeon_last_name varchar NOT NULL,
      surgeon_email varchar NOT NULL,
      surgeon_phone varchar NOT NULL,
      
      -- Surgery details
      surgery_name varchar NOT NULL,
      surgery_duration_minutes integer NOT NULL,
      with_anesthesia boolean NOT NULL DEFAULT true,
      surgery_notes text,
      wished_date date NOT NULL,
      
      -- Patient info
      patient_first_name varchar NOT NULL,
      patient_last_name varchar NOT NULL,
      patient_birthday date NOT NULL,
      patient_email varchar,
      patient_phone varchar NOT NULL,
      
      -- Status and linking
      status varchar NOT NULL DEFAULT 'pending',
      surgery_id varchar REFERENCES surgeries(id),
      patient_id varchar REFERENCES patients(id),
      
      -- Notification tracking
      confirmation_email_sent boolean DEFAULT false,
      confirmation_sms_sent boolean DEFAULT false,
      
      -- Admin notes
      internal_notes text,
      decline_reason text,
      
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now(),
      scheduled_at timestamp,
      scheduled_by varchar REFERENCES users(id)
    );
    
    CREATE INDEX idx_external_surgery_requests_hospital ON external_surgery_requests(hospital_id);
    CREATE INDEX idx_external_surgery_requests_status ON external_surgery_requests(status);
    CREATE INDEX idx_external_surgery_requests_wished_date ON external_surgery_requests(wished_date);
  END IF;
END $$;

-- Create external_surgery_request_documents table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'external_surgery_request_documents') THEN
    CREATE TABLE external_surgery_request_documents (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id varchar NOT NULL REFERENCES external_surgery_requests(id) ON DELETE CASCADE,
      file_name varchar NOT NULL,
      file_url varchar NOT NULL,
      mime_type varchar,
      file_size integer,
      description text,
      created_at timestamp DEFAULT now()
    );
    
    CREATE INDEX idx_external_surgery_docs_request ON external_surgery_request_documents(request_id);
  END IF;
END $$;
