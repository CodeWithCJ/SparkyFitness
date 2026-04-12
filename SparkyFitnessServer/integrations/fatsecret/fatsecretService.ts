import { log } from '../../config/logging.js';
// Cache tokens by scope
const tokensByScope = new Map();
// In-memory cache for FatSecret food nutrient data
const foodNutrientCache = new Map();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const FATSECRET_OAUTH_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const FATSECRET_API_BASE_URL = 'https://platform.fatsecret.com/rest';
const MAX_REASONABLE_METRIC_SERVING_SIZE = 1000;
// Placeholder for serving unit aliases. In a real application, this would be more comprehensive.
const SERVING_UNIT_ALIASES = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  serving: 'serving',
  servings: 'serving',
  unit: 'unit',
  units: 'unit',
  'fl oz': 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  piece: 'piece',
  pieces: 'piece',
  slice: 'slice',
  slices: 'slice',
  package: 'package',
  packages: 'package',
  container: 'container',
  containers: 'container',
  bottle: 'bottle',
  bottles: 'bottle',
  can: 'can',
  cans: 'can',
  box: 'box',
  boxes: 'box',
  bar: 'bar',
  bars: 'bar',
  bag: 'bag',
  bags: 'bag',
  each: 'each',
  item: 'item',
  items: 'item',
  small: 'small',
  medium: 'medium',
  large: 'large',
  'extra large': 'extra large',
  'extra-large': 'extra large',
  'x-large': 'extra large',
  'x large': 'extra large',
  'small (approx)': 'small',
  'medium (approx)': 'medium',
  'large (approx)': 'large',
  'extra large (approx)': 'extra large',
  'small (edible portion)': 'small',
  'medium (edible portion)': 'medium',
  'large (edible portion)': 'large',
  'extra large (edible portion)': 'extra large',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeServingUnit(unit: any) {
  if (!unit) return 'g';
  // Strip anything in parentheses at the end: "serving (237g)" -> "serving"
  const clean = unit
    .replace(/\s*\([^)]*\)\s*$/i, '')
    .toLowerCase()
    .trim();
  const result =
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    SERVING_UNIT_ALIASES[clean] ||
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    SERVING_UNIT_ALIASES[clean.split(/\s+/)[0]] ||
    clean;
  return result;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function evaluateFraction(fractionStr: any) {
  if (!fractionStr) return 0;
  // Handle strings like "1 1/4 cup" by only taking the leading number/fraction part
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
// Function to get FatSecret OAuth 2.0 Access Token
async function getFatSecretAccessToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientSecret: any,
  requestedScope = 'basic'
) {
  const cached = tokensByScope.get(requestedScope);
  if (cached && Date.now() < cached.expiry) {
    return cached.token;
  }
  try {
    log(
      'info',
      `Attempting to get FatSecret Access Token for scope "${requestedScope}" from: ${FATSECRET_OAUTH_TOKEN_URL}`
    );
    const response = await fetch(FATSECRET_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: requestedScope,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!response.ok) {
      const errorData = await response.json();
      log(
        'error',
        `FatSecret OAuth Token API error for scope "${requestedScope}":`,
        errorData
      );
      // Fallback: If "basic barcode" fails with invalid_scope, try "basic"
      if (
        requestedScope === 'basic barcode' &&
        errorData.error === 'invalid_scope'
      ) {
        log(
          'warn',
          'FatSecret "barcode" scope invalid, falling back to "basic"'
        );
        return getFatSecretAccessToken(clientId, clientSecret, 'basic');
      }
      throw new Error(
        `FatSecret authentication failed: ${errorData.error_description || response.statusText}`
      );
    }
    const data = await response.json();
    const token = data.access_token;
    const expiry = Date.now() + data.expires_in * 1000 - 60000; // Set expiry 1 minute early
    tokensByScope.set(requestedScope, { token, expiry });
    return token;
  } catch (error) {
    log(
      'error',
      `Network error during FatSecret OAuth token acquisition for scope "${requestedScope}":`,
      error
    );
    throw new Error(
      'Network error during FatSecret authentication. Please try again.',
      { cause: error }
    );
  }
}

async function searchFatSecretByBarcode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  barcode: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientSecret: any
) {
  try {
    // Specifically request barcode scope for this call
    const accessToken = await getFatSecretAccessToken(
      clientId,
      clientSecret,
      'basic barcode'
    );
    const url = `${FATSECRET_API_BASE_URL}/food/barcode/find-by-id/v2?${new URLSearchParams(
      {
        barcode: barcode,
        format: 'json',
      }
    ).toString()}`;
    log('info', `FatSecret Barcode Lookup URL: ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      const errorText = await response.text();
      log('error', 'FatSecret Barcode API error:', errorText);
      // If we get an error related to scope/permission, we know barcode API isn't available
      if (response.status === 403 || response.status === 401) {
        log(
          'warn',
          'FatSecret Barcode API access forbidden or unauthorized (likely non-Premier account)'
        );
        return null;
      }
      throw new Error(`FatSecret Barcode API error: ${errorText}`);
    }
    const data = await response.json();
    if (data.error && data.error.code === '211') {
      return null; // No food item detected
    }
    return data;
  } catch (error) {
    log('error', `Error searching FatSecret by barcode ${barcode}:`, error);
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFatSecretFood(data: any) {
  const food = data.food;
  if (!food) return null;
  // Servings can be an array or a single object in FatSecret API
  let servingsList = food.servings?.serving || [];
  if (!Array.isArray(servingsList)) {
    servingsList = [servingsList];
  }
  const variantsMap = new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  servingsList.forEach((serving: any) => {
    // We will attempt to create TWO variants per FatSecret serving:
    // 1. Household variant (e.g., "1 serving", "1/4 cup")
    // 2. Metric variant (e.g., "237 g", "100 ml")
    const baseNutrients = {
      calories: Math.round(parseFloat(serving.calories) || 0),
      protein: Math.round((parseFloat(serving.protein) || 0) * 10) / 10,
      carbs: Math.round((parseFloat(serving.carbohydrate) || 0) * 10) / 10,
      fat: Math.round((parseFloat(serving.fat) || 0) * 10) / 10,
      saturated_fat:
        Math.round((parseFloat(serving.saturated_fat) || 0) * 10) / 10,
      polyunsaturated_fat:
        Math.round((parseFloat(serving.polyunsaturated_fat) || 0) * 10) / 10,
      monounsaturated_fat:
        Math.round((parseFloat(serving.monounsaturated_fat) || 0) * 10) / 10,
      trans_fat: Math.round((parseFloat(serving.trans_fat) || 0) * 10) / 10,
      cholesterol: Math.round(parseFloat(serving.cholesterol) || 0),
      sodium: Math.round(parseFloat(serving.sodium) || 0),
      potassium: Math.round(parseFloat(serving.potassium) || 0),
      dietary_fiber: Math.round((parseFloat(serving.fiber) || 0) * 10) / 10,
      sugars: Math.round((parseFloat(serving.sugar) || 0) * 10) / 10,
      vitamin_a: Math.round(parseFloat(serving.vitamin_a) || 0),
      vitamin_c: Math.round(parseFloat(serving.vitamin_c) || 0),
      calcium: Math.round(parseFloat(serving.calcium) || 0),
      iron: Math.round(parseFloat(serving.iron) || 0),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addVariant = (size: any, unit: any, isDefault: any) => {
      if (isNaN(size) || !unit) return;
      const normalizedUnit = normalizeServingUnit(unit);
      const key = `${size}_${normalizedUnit}`.toLowerCase();
      if (!variantsMap.has(key) || isDefault) {
        log(
          'info',
          `FATSECRET_DEBUG: Adding variant: size=${size}, unit=${unit}, normalizedUnit=${normalizedUnit}, key=${key}, isDefault=${isDefault}`
        );
        variantsMap.set(key, {
          serving_size: size,
          serving_unit: normalizedUnit,
          ...baseNutrients,
          is_default: isDefault,
        });
      }
    };
    // 1. Try to create Household variant
    let hhSize = parseFloat(serving.number_of_units);
    let hhUnit = serving.measurement_description;
    const isGenericHH =
      !hhUnit ||
      hhUnit.toLowerCase() === 'portion' ||
      hhUnit.toLowerCase() === 'serving';
    if (isNaN(hhSize) || isGenericHH) {
      // Try parsing from serving_description
      const desc = serving.serving_description || '';
      const descMatch = desc.match(/^([\d\s./]+)\s+(.+)$/);
      if (descMatch) {
        const parsedSize = evaluateFraction(descMatch[1]);
        const parsedUnit = descMatch[2].trim();
        if (parsedSize > 0 && parsedUnit) {
          hhSize = parsedSize;
          hhUnit = parsedUnit;
        }
      }
    }
    if (isNaN(hhSize) || !hhUnit) {
      hhSize = 1;
      hhUnit = serving.serving_description || 'serving';
    }
    addVariant(hhSize, hhUnit, serving.is_default === '1');
    // 2. Try to create Metric variant
    const mSize = parseFloat(serving.metric_serving_amount);
    const mUnit = serving.metric_serving_unit;
    if (!isNaN(mSize) && mUnit) {
      // Only add metric if it's different from household (to avoid duplicates like "100 g" and "100 g")
      addVariant(mSize, mUnit, serving.is_default === '1');
    }
  });
  const mappedVariants = Array.from(variantsMap.values());
  // Ensure exactly one default
  let defaultVariant = mappedVariants.find((v) => v.is_default);
  if (!defaultVariant && mappedVariants.length > 0) {
    defaultVariant = mappedVariants[0];
    defaultVariant.is_default = true;
  }
  return {
    name: food.food_name,
    brand: food.brand_name || null,
    barcode: food.barcode,
    provider_external_id: String(food.food_id),
    provider_type: 'fatsecret',
    is_custom: false,
    default_variant: defaultVariant,
    variants: mappedVariants,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFatSecretSearchItem(item: any) {
  if (!item) return null;
  // FatSecret search descriptions look like:
  // "Per 100g - Calories: 165kcal | Fat: 3.57g | Carbs: 0.00g | Protein: 31.02g"
  // "Per 1 serving (28g) - Calories: 110kcal | Fat: 2.00g | Carbs: 15.00g | Protein: 7.00g"
  const desc = item.food_description || '';
  const calories = parseFloat(desc.match(/Calories:\s*([\d.]+)/)?.[1]) || 0;
  const fat = parseFloat(desc.match(/Fat:\s*([\d.]+)/)?.[1]) || 0;
  const carbs = parseFloat(desc.match(/Carbs:\s*([\d.]+)/)?.[1]) || 0;
  const protein = parseFloat(desc.match(/Protein:\s*([\d.]+)/)?.[1]) || 0;
  // Extract serving info from formats like:
  //   "Per 100g - ..."           → 100 g
  //   "Per 250ml - ..."          → 250 ml
  //   "Per 1 serving (28g) - ..." → 28 g  (prefer metric in parentheses)
  //   "Per 1 serving - ..."      → 1 serving
  //   "Per 1 bar - ..."          → 1 bar
  //   "Per 1/4 cup - ..."        → 0.25 cup
  // 1. Try to find metric in parentheses: "Per ... (28g) -"
  const parenMetricMatch = desc.match(/\(([\d.]+)(g|ml)\)\s*-/);
  // 2. Try to find direct metric: "Per 100g -"
  const directMetricMatch = desc.match(/^Per\s+([\d.]+)(g|ml)\s*-/);
  // 3. Try to find household with potential fractions: "Per 1/4 cup -"
  const householdMatch = desc.match(/^Per\s+([\d\s./]+)\s+(.+?)\s*-/);
  let servingSize, servingUnit;
  // Priority for search item mapping:
  // 1. Specific household (e.g. "cup", "slice")
  // 2. Reasonable metric in parentheses (e.g. "serving (28g)")
  // 3. Generic household fallback
  // 4. Direct metric
  const hSize = householdMatch ? evaluateFraction(householdMatch[1]) : 0;
  const hUnitOrig = householdMatch ? householdMatch[2].trim() : '';
  const hUnitNorm = normalizeServingUnit(hUnitOrig);
  const isTrueGeneric = ['serving', 'portion', 'unit', 'item'].some((g) =>
    hUnitNorm.includes(g)
  );
  const isContainer = [
    'container',
    'package',
    'bag',
    'box',
    'recipe',
    'pot',
    'can',
    'bottle',
    'packet',
    'bowl',
    'plate',
  ].some((g) => hUnitNorm.includes(g));
  const isGeneric = isTrueGeneric || isContainer;
  const pSize = parenMetricMatch ? parseFloat(parenMetricMatch[1]) : 0;
  const pUnit = parenMetricMatch ? parenMetricMatch[2] : '';
  let usedParenMetric = false;
  if (householdMatch && !isGeneric) {
    // Specific household unit like "cup", "slice", "tbsp"
    servingSize = hSize;
    servingUnit = hUnitNorm;
  } else if (
    parenMetricMatch &&
    ((pSize > 0 && pSize <= MAX_REASONABLE_METRIC_SERVING_SIZE) ||
      isTrueGeneric)
  ) {
    // Metric in parents is usually better for "serving" or "portion" unless it's a whole container/pot
    servingSize = pSize;
    servingUnit = normalizeServingUnit(pUnit);
    usedParenMetric = true;
  } else if (householdMatch) {
    // Fallback to generic or container household
    servingSize = hSize;
    servingUnit = hUnitNorm;
  } else if (directMetricMatch) {
    servingSize = parseFloat(directMetricMatch[1]);
    servingUnit = normalizeServingUnit(directMetricMatch[2]);
  } else {
    servingSize = 100;
    servingUnit = 'g';
  }
  // Mandatory normalization
  servingUnit = normalizeServingUnit(servingUnit);
  log(
    'info',
    `FATSECRET_DEBUG: Search item final mapping: size=${servingSize}, unit=${servingUnit}, desc="${desc}"`
  );
  // Ensure weight labels aren't "Per 2135 g" if we can help it,
  // but we must keep the nutrients in sync.
  // FatSecret description nutrients ALIGN with the serving shown.
  // Scaler for "weird g": if metric weight is too large/specific, scale nutrients to 100g/ml
  let scaledCalories = calories;
  let scaledProtein = protein;
  let scaledCarbs = carbs;
  let scaledFat = fat;
  const keepParenMetric =
    usedParenMetric && servingSize <= MAX_REASONABLE_METRIC_SERVING_SIZE;
  if (
    !keepParenMetric &&
    (servingUnit === 'g' || servingUnit === 'ml') &&
    servingSize > 0 &&
    servingSize !== 100 &&
    servingSize > 1
  ) {
    const factor = 100 / servingSize;
    scaledCalories = Math.round(calories * factor);
    scaledProtein = Math.round(protein * factor * 10) / 10;
    scaledCarbs = Math.round(carbs * factor * 10) / 10;
    scaledFat = Math.round(fat * factor * 10) / 10;
    servingSize = 100;
    log(
      'info',
      `FATSECRET_DEBUG: Scaling search result from ${servingSize / factor}${servingUnit} to 100${servingUnit}`
    );
  }
  return {
    name: item.food_name,
    brand: item.brand_name || null,
    provider_external_id: String(item.food_id),
    provider_type: 'fatsecret',
    is_custom: false,
    default_variant: {
      serving_size: servingSize,
      serving_unit: servingUnit,
      calories: Math.round(scaledCalories),
      protein: scaledProtein,
      carbs: scaledCarbs,
      fat: scaledFat,
      is_default: true,
    },
  };
}
export { getFatSecretAccessToken };
export { searchFatSecretByBarcode };
export { mapFatSecretFood };
export { mapFatSecretSearchItem };
export { foodNutrientCache };
export { CACHE_DURATION_MS };
export { FATSECRET_API_BASE_URL };
export default {
  getFatSecretAccessToken,
  searchFatSecretByBarcode,
  mapFatSecretFood,
  mapFatSecretSearchItem,
  foodNutrientCache,
  CACHE_DURATION_MS,
  FATSECRET_API_BASE_URL,
};
