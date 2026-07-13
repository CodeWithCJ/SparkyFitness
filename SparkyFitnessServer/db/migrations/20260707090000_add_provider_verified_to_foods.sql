-- Persist provider verification metadata for imported foods.
-- Backwards compatible: existing rows default to unverified.

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS provider_verified boolean DEFAULT false NOT NULL;
