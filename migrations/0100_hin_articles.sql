-- HIN MediUpdate Articles - Swiss medication/product database
-- Free public data source as fallback when Dispocura is not available

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hin_articles') THEN
    CREATE TABLE hin_articles (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      pharmacode VARCHAR,
      gtin VARCHAR,
      swissmedic_no VARCHAR,
      product_no VARCHAR,
      description_de TEXT NOT NULL,
      description_fr TEXT,
      pexf DECIMAL(10, 2),
      ppub DECIMAL(10, 2),
      price_valid_from DATE,
      smcat VARCHAR,
      sale_code VARCHAR,
      vat VARCHAR,
      is_refdata BOOLEAN DEFAULT false,
      company_gln VARCHAR,
      last_updated TIMESTAMP DEFAULT NOW()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hin_sync_status') THEN
    CREATE TABLE hin_sync_status (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      last_sync_at TIMESTAMP,
      articles_count INTEGER DEFAULT 0,
      sync_duration_ms INTEGER,
      status VARCHAR DEFAULT 'idle',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  END IF;
END $$;

-- Create indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hin_articles_pharmacode') THEN
    CREATE INDEX idx_hin_articles_pharmacode ON hin_articles(pharmacode);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hin_articles_gtin') THEN
    CREATE INDEX idx_hin_articles_gtin ON hin_articles(gtin);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hin_articles_swissmedic') THEN
    CREATE INDEX idx_hin_articles_swissmedic ON hin_articles(swissmedic_no);
  END IF;
END $$;
