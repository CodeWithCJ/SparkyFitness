-- Migration: Add parent_id to user_custom_nutrients
-- Description: Adds a parent_id column to support hierarchical custom nutrients (e.g., Omega 3 -> EPA)

ALTER TABLE public.user_custom_nutrients
ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.user_custom_nutrients(id) ON DELETE SET NULL;
