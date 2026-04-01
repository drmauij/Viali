-- Normalize sourceDetail values: merge "Google Ads" → "google", "Meta Ads" → "facebook", etc.
-- so organic/paid split is handled by click IDs, not by sourceDetail name
UPDATE referral_events SET source_detail = 'google' WHERE LOWER(source_detail) IN ('google ads');
UPDATE referral_events SET source_detail = 'facebook' WHERE LOWER(source_detail) IN ('meta ads');
UPDATE referral_events SET source_detail = 'tiktok' WHERE LOWER(source_detail) IN ('tiktok ads');
UPDATE referral_events SET source_detail = 'bing' WHERE LOWER(source_detail) IN ('bing ads');
UPDATE referral_events SET source_detail = 'linkedin' WHERE LOWER(source_detail) IN ('linkedin ads');
UPDATE referral_events SET source_detail = 'twitter' WHERE LOWER(source_detail) IN ('twitter/x ads', 'twitter ads');
