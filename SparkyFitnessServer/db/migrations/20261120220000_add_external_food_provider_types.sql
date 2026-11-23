-- Migration to register CookTool, NutrientGraph, and Food-Info as external data provider types

-- CookTool
INSERT INTO public.external_provider_types (id, display_name, description)
VALUES ('cooktool', 'CookTool', 'CookTool food nutrition API: USDA food table and ingredient database. Requires an API key.')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['food'],
    required_fields = ARRAY['app_key'],
    field_labels = '{"app_key": "CookTool API key"}'::jsonb,
    is_strictly_private = FALSE,
    supports_barcode = FALSE
WHERE id = 'cooktool';

-- NutrientGraph
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

-- Food-Info
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
