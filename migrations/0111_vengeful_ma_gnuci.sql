-- Add health insurance number and card image URL fields to patients table
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'health_insurance_number') THEN
        ALTER TABLE "patients" ADD COLUMN "health_insurance_number" varchar;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'id_card_front_url') THEN
        ALTER TABLE "patients" ADD COLUMN "id_card_front_url" varchar;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'id_card_back_url') THEN
        ALTER TABLE "patients" ADD COLUMN "id_card_back_url" varchar;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'insurance_card_front_url') THEN
        ALTER TABLE "patients" ADD COLUMN "insurance_card_front_url" varchar;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'insurance_card_back_url') THEN
        ALTER TABLE "patients" ADD COLUMN "insurance_card_back_url" varchar;
    END IF;
END $$;
