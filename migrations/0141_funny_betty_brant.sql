DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hospitals' AND column_name = 'card_reader_token'
  ) THEN
    ALTER TABLE "hospitals" ADD COLUMN "card_reader_token" varchar;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'hospitals_card_reader_token_unique'
  ) THEN
    ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_card_reader_token_unique" UNIQUE("card_reader_token");
  END IF;
END $$;
