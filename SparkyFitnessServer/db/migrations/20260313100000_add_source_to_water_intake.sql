-- Migration: Add source and audit columns to water_intake
-- Created: 2026-03-13

BEGIN;

-- 1. Add new columns
ALTER TABLE public.water_intake ADD COLUMN IF NOT EXISTS "source" character varying(50) DEFAULT 'manual'::character varying;
ALTER TABLE public.water_intake ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
ALTER TABLE public.water_intake ADD COLUMN IF NOT EXISTS "updated_by_user_id" uuid;

-- 2. Initialize existing records
UPDATE public.water_intake SET source = 'manual' WHERE source IS NULL;

-- 3. Set NOT NULL for source
ALTER TABLE public.water_intake ALTER COLUMN "source" SET NOT NULL;

-- 4. Update constraints
-- Drop existing single-source unique constraints
ALTER TABLE public.water_intake DROP CONSTRAINT IF EXISTS water_intake_user_id_entry_date_key;
ALTER TABLE public.water_intake DROP CONSTRAINT IF EXISTS water_intake_user_date_unique;

-- Add the new multi-source unique constraint
ALTER TABLE public.water_intake ADD CONSTRAINT water_intake_user_date_source_unique UNIQUE (user_id, entry_date, source);

-- 5. Foreign Keys to public."user"
-- created_by_user_id uses ON DELETE CASCADE as per user instruction
ALTER TABLE public.water_intake 
    DROP CONSTRAINT IF EXISTS water_intake_created_by_user_id_fkey,
    ADD CONSTRAINT water_intake_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

-- updated_by_user_id uses ON DELETE SET NULL to allow it to be null if the acting user is deleted
ALTER TABLE public.water_intake 
    DROP CONSTRAINT IF EXISTS water_intake_updated_by_user_id_fkey,
    ADD CONSTRAINT water_intake_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

COMMIT;
