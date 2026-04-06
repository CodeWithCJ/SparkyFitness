-- Add Edamam as a food data provider type
INSERT INTO external_provider_types (id, display_name, description)
VALUES (
  'edamam',
  'Edamam',
  'Edamam Food Database — multilingual food search with nutritional data (requires free API key from developer.edamam.com)'
)
ON CONFLICT (id) DO NOTHING;
