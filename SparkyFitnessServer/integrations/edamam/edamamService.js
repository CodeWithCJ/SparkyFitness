const { log } = require('../../config/logging');

const EDAMAM_PARSER_URL = 'https://api.edamam.com/api/food-database/v2/parser';
const EDAMAM_NUTRIENTS_URL =
  'https://api.edamam.com/api/food-database/v2/nutrients';

// Edamam nutrient code → app field mapping
const NUTRIENT_MAP = {
  ENERC_KCAL: 'calories',
  PROCNT: 'protein',
  FAT: 'fat',
  CHOCDF: 'carbs',
  FIBTG: 'dietary_fiber',
  FASAT: 'saturated_fat',
  FAMS: 'monounsaturated_fat',
  FAPU: 'polyunsaturated_fat',
  FATRN: 'trans_fat',
  CHOLE: 'cholesterol',
  NA: 'sodium',
  K: 'potassium',
  SUGAR: 'sugars',
  VITA_RAE: 'vitamin_a',
  VITC: 'vitamin_c',
  CA: 'calcium',
  FE: 'iron',
};

function roundNutrient(value, decimals = 1) {
  if (value == null || isNaN(value)) return 0;
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function mapNutrients(nutrients = {}) {
  const result = {};
  for (const [code, field] of Object.entries(NUTRIENT_MAP)) {
    const raw = nutrients[code];
    result[field] =
      field === 'calories' ||
      field === 'cholesterol' ||
      field === 'sodium' ||
      field === 'potassium'
        ? Math.round(raw || 0)
        : roundNutrient(raw);
  }
  return result;
}

// Map a single food hint from Edamam parser response
function mapEdamamSearchItem(hint) {
  if (!hint?.food) return null;
  const { food } = hint;

  const nutrients = mapNutrients(food.nutrients);

  return {
    name: food.label,
    brand: food.brand || null,
    provider_external_id: food.foodId,
    provider_type: 'edamam',
    is_custom: false,
    default_variant: {
      serving_size: 100,
      serving_unit: 'g',
      ...nutrients,
      is_default: true,
    },
  };
}

// Map full food detail (from /nutrients POST response + hint data)
function mapEdamamFood(food, measuresData, selectedMeasure) {
  if (!food) return null;

  const baseNutrients = mapNutrients(food.nutrients);

  // Build variants from measures
  const variants = [];
  const measures = measuresData || [];

  measures.forEach((measure, idx) => {
    if (!measure.label || !measure.weight) return;

    const weight = parseFloat(measure.weight);
    if (!weight) return;

    // Scale nutrients from per-100g to per-measure weight
    const factor = weight / 100;
    const variantNutrients = {};
    for (const [code, field] of Object.entries(NUTRIENT_MAP)) {
      const per100 = food.nutrients?.[code] || 0;
      variantNutrients[field] =
        field === 'calories' ||
        field === 'cholesterol' ||
        field === 'sodium' ||
        field === 'potassium'
          ? Math.round(per100 * factor)
          : roundNutrient(per100 * factor);
    }

    variants.push({
      serving_size: weight >= 1 ? Math.round(weight * 10) / 10 : weight,
      serving_unit: 'g',
      ...variantNutrients,
      is_default: idx === 0,
    });
  });

  // Always include 100g as a variant if no measures or as extra option
  const has100g = variants.some(
    (v) => v.serving_unit === 'g' && v.serving_size === 100
  );
  if (!has100g) {
    variants.push({
      serving_size: 100,
      serving_unit: 'g',
      ...baseNutrients,
      is_default: variants.length === 0,
    });
  }

  const defaultVariant = variants.find((v) => v.is_default) || variants[0];

  return {
    name: food.label,
    brand: food.brand || null,
    provider_external_id: food.foodId,
    provider_type: 'edamam',
    is_custom: false,
    default_variant: defaultVariant,
    variants,
  };
}

async function searchEdamamByQuery(query, appId, appKey, page = 1) {
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize;

  const url = `${EDAMAM_PARSER_URL}?${new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    ingr: query,
    'nutrition-type': 'logging',
    from: String(from),
    to: String(to),
  })}`;
  log('info', `Edamam Search URL: ${url.replace(appKey, '***')}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      log('error', 'Edamam search API error:', text);
      throw new Error(`Edamam API error (${response.status}): ${text}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchEdamamByBarcode(barcode, appId, appKey) {
  const url = `${EDAMAM_PARSER_URL}?${new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    upc: barcode,
    'nutrition-type': 'logging',
  })}`;
  log('info', `Edamam Barcode URL: ${url.replace(appKey, '***')}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      const text = await response.text();
      log('error', 'Edamam barcode API error:', text);
      throw new Error(`Edamam barcode API error (${response.status}): ${text}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  mapEdamamSearchItem,
  mapEdamamFood,
  searchEdamamByQuery,
  searchEdamamByBarcode,
  EDAMAM_NUTRIENTS_URL,
};
