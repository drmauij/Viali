-- Migration 0245: Add 'tissue_checklist' value to discharge_brief_type enum
-- Used by the new Tissue & Samples checklist briefs (FatBanking and similar).
-- Idempotent.

ALTER TYPE discharge_brief_type ADD VALUE IF NOT EXISTS 'tissue_checklist';
