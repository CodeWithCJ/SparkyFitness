ALTER TABLE public.external_data_providers
ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON COLUMN public.external_data_providers.sort_order IS
'Manual display order for provider selection UI (lower value appears first).';

-- Backfill existing rows so each user gets a stable order.
-- Orders by created_at, then id for deterministic results.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY created_at ASC, id ASC
    ) - 1 AS new_sort_order
  FROM public.external_data_providers
)
UPDATE public.external_data_providers edp
SET sort_order = ranked.new_sort_order
FROM ranked
WHERE edp.id = ranked.id
  AND edp.sort_order IS NULL;
