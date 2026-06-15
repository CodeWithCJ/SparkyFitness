import { log } from '../../config/logging.js';
import {
  normalizeBarcode,
  normalizeServingUnit,
} from '../../utils/foodUtils.js';
// Using native fetch (standard in Node 22+)
const USDA_API_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

export interface UsdaNutrient {
  nutrientId?: number;
  nutrient?: {
    id?: number;
    name?: string;
    unitName?: string;
  };
  value?: number;
  amount?: number;
}

export interface UsdaMeasureUnit {
  id?: number;
  name?: string;
}

export interface UsdaPortion {
  gramWeight: number;
  amount: number;
  measureUnit?: UsdaMeasureUnit;
  portionDescription?: string;
  modifier?: string;
}

export interface UsdaFood {
  description: string;
  brandName?: string;
  brandOwner?: string;
  gtinUpc?: string;
  fdcId: number | string;
  dataType?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  packageWeight?: string;
  foodNutrients?: UsdaNutrient[];
  foodPortions?: UsdaPortion[];
}

export interface UsdaSearchResponse {
  foods: UsdaFood[];
  currentPage?: number;
  totalPages?: number;
  totalHits?: number;
}

async function searchUsdaFoods(
  query: string,
  apiKey: string | undefined,
  page = 1,
  pageSize = 50
): Promise<
  UsdaSearchResponse & {
    pagination: {
      page: number;
      pageSize: number;
      totalCount: number;
      hasMore: boolean;
    };
  }
> {
  try {
    const searchUrl = `${USDA_API_BASE_URL}/foods/search?query=${encodeURIComponent(query)}&pageNumber=${page}&pageSize=${pageSize}&api_key=${apiKey || ''}`;
    const response = await fetch(searchUrl, { method: 'GET' });
    log('debug', 'USDA API Search Response Status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'USDA Food Search API error:', errorText);
      throw new Error(`USDA API error: ${errorText}`);
    }
    const data = await response.json();
    log('debug', 'USDA API Search Response Data:', data);
    return {
      ...data,
      pagination: {
        page: data.currentPage || page,
        pageSize: pageSize,
        totalCount: data.totalHits || 0,
        hasMore: (data.currentPage || page) < (data.totalPages || 1),
      },
    };
  } catch (error) {
    log(
      'error',
      `Error searching USDA foods with query "${query}" in usdaService:`,
      error
    );
    throw error;
  }
}

async function searchUsdaFoodsByBarcode(
  barcode: string,
  apiKey: string | undefined
): Promise<{ foods: UsdaFood[] }> {
  try {
    const searchUrl = `${USDA_API_BASE_URL}/foods/search?query=${encodeURIComponent(barcode)}&dataType=Branded&api_key=${apiKey || ''}`;
    const response = await fetch(searchUrl, { method: 'GET' });
    log('debug', 'USDA API Barcode Search Response Status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'USDA Barcode Search API error:', errorText);
      throw new Error(`USDA API error: ${errorText}`);
    }
    const data = await response.json();
    log('debug', 'USDA API Barcode Search Response Data:', data);
    return data;
  } catch (error) {
    log(
      'error',
      `Error searching USDA foods by barcode "${barcode}" in usdaService:`,
      error
    );
    throw error;
  }
}

async function getUsdaFoodDetails(
  fdcId: string | number,
  apiKey: string | undefined
): Promise<UsdaFood> {
  try {
    const detailsUrl = `${USDA_API_BASE_URL}/food/${fdcId}?api_key=${apiKey || ''}`;
    const response = await fetch(detailsUrl, { method: 'GET' });
    log('debug', 'USDA API Details Response Status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'USDA Food Details API error:', errorText);
      throw new Error(`USDA API error: ${errorText}`);
    }
    const data = await response.json();
    log('debug', 'USDA API Details Response Data:', data);
    return data;
  } catch (error) {
    log(
      'error',
      `Error fetching USDA food details for FDC ID "${fdcId}" in usdaService:`,
      error
    );
    throw error;
  }
}

function evaluateFraction(fractionStr: string | null | undefined): number {
  if (!fractionStr) return 0;
  const match = fractionStr.trim().match(/^([\d\s./]+)/);
  if (!match) return 0;
  const parts = match[1].trim().split(/\s+/);
  let total = 0;
  for (const part of parts) {
    if (part.includes('/')) {
      const [num, den] = part.split('/');
      const n = parseFloat(num);
      const d = parseFloat(den);
      if (d !== 0) total += n / d;
    } else {
      const val = parseFloat(part);
      if (!isNaN(val)) total += val;
    }
  }
  return total || 0;
}

function parseMixedPortionDescription(desc: string | null | undefined) {
  if (!desc) return null;
  const trimmed = desc.trim();

  // Pattern A/B: "<weight> g or/( <amount> <unit>)"
  const patternAB =
    /^(\d+(?:\.\d+)?)\s*g\b\s*(?:or|\()\s*([\d\s./]+)\s*([a-zA-Z\s-]+)\)?$/i;
  const matchAB = trimmed.match(patternAB);
  if (matchAB) {
    const weight = parseFloat(matchAB[1]);
    const amount = evaluateFraction(matchAB[2]);
    const unit = matchAB[3].trim();
    if (amount > 0 && unit) {
      return { amount, unit, weight };
    }
  }

  // Pattern C/D: "<amount> <unit> (/, <weight> g)"
  const patternCD =
    /^([\d\s./]+)\s*([a-zA-Z\s-]+)\s*(?:,|\()\s*(\d+(?:\.\d+)?)\s*g\b\s*\)?$/i;
  const matchCD = trimmed.match(patternCD);
  if (matchCD) {
    const amount = evaluateFraction(matchCD[1]);
    const unit = matchCD[2].trim();
    const weight = parseFloat(matchCD[3]);
    if (amount > 0 && unit) {
      return { amount, unit, weight };
    }
  }

  return null;
}

function parsePackageWeight(packageWeight: string | null | undefined) {
  if (!packageWeight) return null;
  // Match metric first: e.g. "31.2 g", "450 ml"
  const metricMatch = packageWeight.match(
    /(\d+(?:\.\d+)?)\s*(g|grm|gm|grams?|ml|milliliters?|l|liters?)\b/i
  );
  if (metricMatch) {
    return {
      size: parseFloat(metricMatch[1]),
      unit: metricMatch[2],
    };
  }
  // Match imperial: e.g. "1.10 oz", "1 lb"
  const imperialMatch = packageWeight.match(
    /(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|lb|lbs|pounds?)\b/i
  );
  if (imperialMatch) {
    return {
      size: parseFloat(imperialMatch[1]),
      unit: imperialMatch[2],
    };
  }
  return null;
}

function mapUsdaBarcodeProduct(food: UsdaFood) {
  const nutrients: Record<string | number, number> = {};
  for (const n of food.foodNutrients || []) {
    const id = n.nutrientId ?? n.nutrient?.id;
    if (id !== undefined && id !== null) {
      nutrients[id] = n.value ?? n.amount ?? 0;
    }
  }

  const variantsMap = new Map();

  const addVariant = (
    serving_size: number,
    serving_unit: string,
    scale: number,
    is_default: boolean
  ) => {
    if (
      isNaN(serving_size) ||
      serving_size <= 0 ||
      !serving_unit ||
      isNaN(scale) ||
      scale <= 0
    ) {
      return;
    }
    const normalizedUnit = normalizeServingUnit(serving_unit);
    const roundedServingSize = Math.round(serving_size * 100) / 100;
    const key = `${roundedServingSize}_${normalizedUnit}`.toLowerCase();

    if (!variantsMap.has(key) || is_default) {
      variantsMap.set(key, {
        serving_size: roundedServingSize,
        serving_unit: normalizedUnit,
        calories: Math.round(
          (nutrients[1008] ?? nutrients[2048] ?? nutrients[2047] ?? 0) * scale
        ),
        protein: Math.round((nutrients[1003] || 0) * scale * 10) / 10,
        carbs: Math.round((nutrients[1005] || 0) * scale * 10) / 10,
        fat: Math.round((nutrients[1004] || 0) * scale * 10) / 10,
        saturated_fat: Math.round((nutrients[1258] || 0) * scale * 10) / 10,
        trans_fat: Math.round((nutrients[1257] || 0) * scale * 10) / 10,
        cholesterol: Math.round((nutrients[1253] || 0) * scale),
        sodium: Math.round((nutrients[1093] || 0) * scale),
        potassium: Math.round((nutrients[1092] || 0) * scale),
        dietary_fiber: Math.round((nutrients[1079] || 0) * scale * 10) / 10,
        sugars: Math.round((nutrients[2000] || 0) * scale * 10) / 10,
        calcium: Math.round((nutrients[1087] || 0) * scale),
        iron: Math.round((nutrients[1089] || 0) * scale * 10) / 10,
        polyunsaturated_fat:
          Math.round((nutrients[1293] || 0) * scale * 10) / 10,
        monounsaturated_fat:
          Math.round((nutrients[1292] || 0) * scale * 10) / 10,
        vitamin_a: Math.round((nutrients[1104] || 0) * 0.3 * scale),
        vitamin_c: Math.round((nutrients[1162] || 0) * scale * 10) / 10,
        is_default,
      });
    }
  };

  // 1. Base metric variant
  let servingSize: number = food.servingSize ?? 0;
  let servingSizeUnit = food.servingSizeUnit || 'g';

  if (!(servingSize > 0)) {
    const parsed = parsePackageWeight(food.packageWeight);
    if (parsed) {
      servingSize = parsed.size;
      servingSizeUnit = parsed.unit;
    } else {
      servingSize = 100;
    }
  }

  addVariant(servingSize, servingSizeUnit, servingSize / 100, true);

  // 2. 100g/ml variant (if default serving is not already 100g/ml)
  const normalizedBaseUnit = normalizeServingUnit(servingSizeUnit);
  if (
    (normalizedBaseUnit === 'g' || normalizedBaseUnit === 'ml') &&
    servingSize !== 100
  ) {
    addVariant(100, servingSizeUnit, 1.0, false);
  }

  // 3. Branded Household variant from householdServingFullText
  if (food.householdServingFullText) {
    const desc = food.householdServingFullText.trim();
    const mixed = parseMixedPortionDescription(desc);
    if (mixed) {
      const scale = mixed.weight > 0 ? mixed.weight / 100 : servingSize / 100;
      let unit = mixed.unit;
      if (food.dataType === 'Branded') {
        const normalized = normalizeServingUnit(unit);
        const standardUnits = new Set([
          'g',
          'ml',
          'oz',
          'tbsp',
          'tsp',
          'cup',
          'slice',
          'serving',
          'portion',
          'can',
          'bottle',
          'packet',
          'bag',
          'bowl',
          'plate',
          'handful',
          'scoop',
          'bar',
          'stick',
          'whole',
        ]);
        if (!standardUnits.has(normalized)) {
          unit = 'piece';
        }
      }
      addVariant(mixed.amount, unit, scale, false);
    } else {
      const match = desc.match(/^([\d\s./]+)\s+(.+)$/);
      if (match) {
        const parsedSize = evaluateFraction(match[1]);
        let parsedUnit = match[2].trim();
        if (parsedSize > 0 && parsedUnit) {
          if (food.dataType === 'Branded') {
            const normalized = normalizeServingUnit(parsedUnit);
            const standardUnits = new Set([
              'g',
              'ml',
              'oz',
              'tbsp',
              'tsp',
              'cup',
              'slice',
              'serving',
              'portion',
              'can',
              'bottle',
              'packet',
              'bag',
              'bowl',
              'plate',
              'handful',
              'scoop',
              'bar',
              'stick',
              'whole',
            ]);
            if (!standardUnits.has(normalized)) {
              parsedUnit = 'piece';
            }
          }
          addVariant(parsedSize, parsedUnit, servingSize / 100, false);
        }
      }
    }
  }

  // 4. Portions from foodPortions (for SR Legacy, Foundation, and Survey foods)
  if (Array.isArray(food.foodPortions)) {
    for (const portion of food.foodPortions) {
      const gramWeight = portion.gramWeight;
      if (gramWeight > 0) {
        let amount = portion.amount > 0 ? portion.amount : 1.0;
        let unit = 'serving';

        const measureUnitName = portion.measureUnit?.name;
        if (
          measureUnitName &&
          measureUnitName.toLowerCase() !== 'undetermined' &&
          measureUnitName.toLowerCase() !== 'quantity not specified' &&
          measureUnitName.toLowerCase() !== 'not specified'
        ) {
          unit = measureUnitName;
        } else if (portion.portionDescription) {
          unit = portion.portionDescription;
        } else if (portion.modifier) {
          unit = portion.modifier;
        }

        // Check if description has a mixed weight/count pattern (e.g. "30g or 1 piece", "1 piece (30g)")
        const mixed = parseMixedPortionDescription(
          portion.portionDescription || portion.modifier
        );
        if (mixed) {
          amount = mixed.amount;
          unit = mixed.unit;
          const finalGramWeight =
            gramWeight > 0 ? gramWeight : mixed.weight > 0 ? mixed.weight : 0;
          addVariant(amount, unit, finalGramWeight / 100, false);
          continue;
        }

        // Parse quantity prefix from unit text if present (e.g. "1 cup", "1/2 cup")
        const match = unit.trim().match(/^([\d\s./]+)\s+(.+)$/);
        if (match) {
          const parsedSize = evaluateFraction(match[1]);
          const parsedUnit = match[2].trim();
          if (parsedSize > 0 && parsedUnit) {
            amount = parsedSize;
            unit = parsedUnit;
          }
        }

        // Guard against numeric IDs (like "10205" or "90000") that sometimes populate the modifier field
        if (/^\d+$/.test(unit)) {
          if (
            portion.portionDescription &&
            !/^\d+$/.test(portion.portionDescription)
          ) {
            unit = portion.portionDescription;
            const descMatch = unit.trim().match(/^([\d\s./]+)\s+(.+)$/);
            if (descMatch) {
              const parsedSize = evaluateFraction(descMatch[1]);
              const parsedUnit = descMatch[2].trim();
              if (parsedSize > 0 && parsedUnit && !/^\d+$/.test(parsedUnit)) {
                amount = parsedSize;
                unit = parsedUnit;
              }
            }
          } else {
            unit = 'serving';
          }
        }

        addVariant(amount, unit, gramWeight / 100, false);
      }
    }
  }

  const mappedVariants = Array.from(variantsMap.values());

  // Ensure exactly one default
  let defaultVariant = mappedVariants.find((v) => v.is_default);
  if (!defaultVariant && mappedVariants.length > 0) {
    defaultVariant = mappedVariants[0];
    defaultVariant.is_default = true;
  }

  return {
    name: food.description,
    brand: food.brandName || food.brandOwner || '',
    barcode: normalizeBarcode(food.gtinUpc),
    provider_external_id: String(food.fdcId),
    provider_type: 'usda',
    is_custom: false,
    default_variant: defaultVariant,
    variants: mappedVariants,
  };
}
export { searchUsdaFoods };
export { getUsdaFoodDetails };
export { searchUsdaFoodsByBarcode };
export { mapUsdaBarcodeProduct };
export default {
  searchUsdaFoods,
  getUsdaFoodDetails,
  searchUsdaFoodsByBarcode,
  mapUsdaBarcodeProduct,
};
