DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'billing_invoices' AND column_name = 'worktime_price') THEN
    ALTER TABLE "billing_invoices" ADD COLUMN "worktime_price" numeric(10, 2) DEFAULT '0';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'addon_worktime') THEN
    ALTER TABLE "hospitals" ADD COLUMN "addon_worktime" boolean DEFAULT false;
  END IF;
END $$;
