import { log } from '../../config/logging.js';
import {
  normalizeBarcode,
  normalizeServingUnit,
} from '../../utils/foodUtils.js';
// Using native fetch (standard in Node 22+)
const USDA_API_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

async function searchUsdaFoods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiKey: any,
  page = 1,
  pageSize = 50
) {
  try {
    const searchUrl = `${USDA_API_BASE_URL}/foods/search?query=${encodeURIComponent(query)}&pageNumber=${page}&pageSize=${pageSize}&api_key=${apiKey}`;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchUsdaFoodsByBarcode(barcode: any, apiKey: any) {
  try {
    const searchUrl = `${USDA_API_BASE_URL}/foods/search?query=${encodeURIComponent(barcode)}&dataType=Branded&api_key=${apiKey}`;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUsdaFoodDetails(fdcId: any, apiKey: any) {
  try {
    const detailsUrl = `${USDA_API_BASE_URL}/food/${fdcId}?api_key=${apiKey}`;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUsdaBarcodeProduct(food: any) {
  const nutrients = {};
  for (const n of food.foodNutrients || []) {
    const id = n.nutrientId ?? n.nutrient?.id;
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    nutrients[id] = n.value ?? n.amount ?? 0;
  }
  const servingSize = food.servingSize > 0 ? food.servingSize : 100;
  const scale = servingSize / 100;
  const defaultVariant = {
    serving_size: servingSize,
    serving_unit: normalizeServingUnit(food.servingSizeUnit),
    calories: Math.round(
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      (nutrients[1008] ?? nutrients[2048] ?? nutrients[2047] ?? 0) * scale
    ),
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    protein: Math.round((nutrients[1003] || 0) * scale * 10) / 10,
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    carbs: Math.round((nutrients[1005] || 0) * scale * 10) / 10,
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    fat: Math.round((nutrients[1004] || 0) * scale * 10) / 10,
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    saturated_fat: Math.round((nutrients[1258] || 0) * scale * 10) / 10,
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    trans_fat: Math.round((nutrients[1257] || 0) * scale * 10) / 10,
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    cholesterol: Math.round((nutrients[1253] || 0) * scale),
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    sodium: Math.round((nutrients[1093] || 0) * scale),
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    potassium: Math.round((nutrients[1092] || 0) * scale),
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    dietary_fiber: Math.round((nutrients[1079] || 0) * scale * 10) / 10,
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    sugars: Math.round((nutrients[2000] || 0) * scale * 10) / 10,
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    calcium: Math.round((nutrients[1087] || 0) * scale),
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    iron: Math.round((nutrients[1089] || 0) * scale * 10) / 10,
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    polyunsaturated_fat: Math.round((nutrients[1293] || 0) * scale * 10) / 10,
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    monounsaturated_fat: Math.round((nutrients[1292] || 0) * scale * 10) / 10,
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    vitamin_a: Math.round((nutrients[1104] || 0) * 0.3 * scale),
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    vitamin_c: Math.round((nutrients[1162] || 0) * scale * 10) / 10,
    is_default: true,
  };
  return {
    name: food.description,
    brand: food.brandName || food.brandOwner || '',
    barcode: normalizeBarcode(food.gtinUpc),
    provider_external_id: String(food.fdcId),
    provider_type: 'usda',
    is_custom: false,
    default_variant: defaultVariant,
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
