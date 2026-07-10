-- Register the HUAWEI Health cloud integration.
-- Official integration guide:
-- https://developer.huawei.com/consumer/en/doc/development/HMSCore-Guides/open-platform-oauth-0000001053629189

BEGIN;

INSERT INTO public.external_provider_types (
  id,
  display_name,
  description,
  is_strictly_private,
  categories,
  required_fields,
  field_labels,
  supports_barcode
)
VALUES (
  'huaweihealth',
  'HUAWEI Health',
  'Read-only HUAWEI Health cloud sync for health and workout data.',
  TRUE,
  ARRAY['other'],
  ARRAY[]::VARCHAR[],
  '{}'::JSONB,
  FALSE
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_strictly_private = TRUE,
  categories = ARRAY['other'],
  required_fields = ARRAY[]::VARCHAR[],
  field_labels = '{}'::JSONB,
  supports_barcode = FALSE;

-- Defense in depth for any rows created during test-scope development. The
-- integration service and RLS policy also require owner-only private rows.
UPDATE public.external_data_providers
SET is_public = FALSE,
    updated_at = NOW()
WHERE provider_type = 'huaweihealth'
  AND is_public IS DISTINCT FROM FALSE;

COMMIT;

