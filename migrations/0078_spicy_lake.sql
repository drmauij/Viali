-- Add pricing columns for new module add-ons in billing_invoices
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'billing_invoices' AND column_name = 'surgery_price') THEN
    ALTER TABLE billing_invoices ADD COLUMN surgery_price numeric(10, 2) DEFAULT '0';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'billing_invoices' AND column_name = 'logistics_price') THEN
    ALTER TABLE billing_invoices ADD COLUMN logistics_price numeric(10, 2) DEFAULT '0';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'billing_invoices' AND column_name = 'clinic_price') THEN
    ALTER TABLE billing_invoices ADD COLUMN clinic_price numeric(10, 2) DEFAULT '0';
  END IF;
END $$;
