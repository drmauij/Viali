-- Add is_clinic_module column to units table
ALTER TABLE units ADD COLUMN IF NOT EXISTS is_clinic_module BOOLEAN DEFAULT false;
