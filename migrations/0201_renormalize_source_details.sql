-- Re-normalize sourceDetail: the mapping code was still producing "Google Ads" etc.
-- after migration 0198 normalized old data. Now the mapping code is fixed, but we need
-- to clean up rows inserted between 0198 and this fix.
UPDATE referral_events SET source_detail = 'Google' WHERE source_detail = 'Google Ads';
UPDATE referral_events SET source_detail = 'Facebook' WHERE source_detail = 'Meta Ads';
UPDATE referral_events SET source_detail = 'Bing' WHERE source_detail = 'Bing Ads';
UPDATE referral_events SET source_detail = 'TikTok' WHERE source_detail = 'TikTok Ads';
UPDATE referral_events SET source_detail = 'LinkedIn' WHERE source_detail = 'LinkedIn Ads';
UPDATE referral_events SET source_detail = 'Twitter' WHERE source_detail IN ('Twitter/X Ads', 'Twitter Ads');
