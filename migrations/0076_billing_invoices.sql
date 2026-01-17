-- Migration: Add billing_invoices table for tracking monthly billing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_invoices') THEN
    CREATE TABLE billing_invoices (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      hospital_id varchar NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      
      period_start timestamp NOT NULL,
      period_end timestamp NOT NULL,
      
      record_count integer NOT NULL DEFAULT 0,
      
      base_price decimal(10, 2) NOT NULL,
      questionnaire_price decimal(10, 2) DEFAULT '0',
      dispocura_price decimal(10, 2) DEFAULT '0',
      retell_price decimal(10, 2) DEFAULT '0',
      monitor_price decimal(10, 2) DEFAULT '0',
      total_amount decimal(10, 2) NOT NULL,
      currency varchar NOT NULL DEFAULT 'chf',
      
      stripe_invoice_id varchar,
      stripe_invoice_url varchar,
      stripe_payment_intent_id varchar,
      
      status varchar NOT NULL DEFAULT 'draft',
      
      paid_at timestamp,
      failed_at timestamp,
      failure_reason text,
      
      created_at timestamp DEFAULT now()
    );
    
    CREATE INDEX idx_billing_invoices_hospital ON billing_invoices(hospital_id);
    CREATE INDEX idx_billing_invoices_period ON billing_invoices(period_start, period_end);
    CREATE INDEX idx_billing_invoices_status ON billing_invoices(status);
    CREATE INDEX idx_billing_invoices_stripe ON billing_invoices(stripe_invoice_id);
  END IF;
END $$;
