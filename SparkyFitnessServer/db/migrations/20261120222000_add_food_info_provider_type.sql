-- Migration to register Food Info as an external data provider type
INSERT INTO public.external_provider_types (id, display_name, description)
VALUES ('food-info', 'Food Info', 'Food Info REST API: reference nutrition data across multiple national food datasets. Requires an API key.')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['food'],
    required_fields = ARRAY['app_key'],
    field_labels = '{"app_key": "Food Info API key"}'::jsonb,
    is_strictly_private = FALSE,
    supports_barcode = FALSE
WHERE id = 'food-info';
