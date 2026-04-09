-- Add ad platform campaign attribution fields (campaign/adset/ad hierarchy)
-- Populated from lead webhook payload (Meta Lead Ads, Google Ads, etc.)
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "campaign_id" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "campaign_name" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "adset_id" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ad_id" varchar;

-- Mirror on referral_events so campaign attribution carries through conversion
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "campaign_id" varchar;
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "campaign_name" varchar;
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "adset_id" varchar;
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "ad_id" varchar;
