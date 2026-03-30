ALTER TABLE "user_hospital_roles" ADD COLUMN IF NOT EXISTS "can_manage_controlled" boolean DEFAULT false;
