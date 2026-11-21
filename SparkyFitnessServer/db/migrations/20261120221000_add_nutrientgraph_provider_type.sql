-- Migration to register NutrientGraph as an external data provider type
INSERT INTO public.external_provider_types (id, display_name, description)
VALUES ('nutrientgraph', 'NutrientGraph', 'NutrientGraph food database API: USDA and French CIQUAL foods plus US branded products, names in five languages. Requires an API key.')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['food'],
    required_fields = ARRAY['app_key'],
    field_labels = '{"app_key": "NutrientGraph API key"}'::jsonb,
    is_strictly_private = FALSE,
    supports_barcode = TRUE
WHERE id = 'nutrientgraph';
