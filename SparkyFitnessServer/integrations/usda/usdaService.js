const { log } = require("../../config/logging");
const {
  normalizeBarcode,
  normalizeServingUnit,
} = require("../../utils/foodUtils");
// Using native fetch (standard in Node 22+)

const USDA_API_BASE_URL = "https://api.nal.usda.gov/fdc/v1";

async function searchUsdaFoods(query, apiKey, page = 1, pageSize = 50) {
  try {
    const searchUrl = `${USDA_API_BASE_URL}/foods/search?query=${encodeURIComponent(query)}&pageNumber=${page}&pageSize=${pageSize}&api_key=${apiKey}`;
    const response = await fetch(searchUrl, { method: "GET" });
    log("debug", "USDA API Search Response Status:", response.status);
    if (!response.ok) {
      const errorText = await response.text();
      log("error", "USDA Food Search API error:", errorText);
      throw new Error(`USDA API error: ${errorText}`);
    }
    const data = await response.json();
    log("debug", "USDA API Search Response Data:", data);
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
      "error",
      `Error searching USDA foods with query "${query}" in usdaService:`,
      error,
    );
    throw error;
  }
}

async function searchUsdaFoodsByBarcode(barcode, apiKey) {
  try {
    const searchUrl = `${USDA_API_BASE_URL}/foods/search?query=${encodeURIComponent(barcode)}&dataType=Branded&api_key=${apiKey}`;
    const response = await fetch(searchUrl, { method: "GET" });
    log("debug", "USDA API Barcode Search Response Status:", response.status);
    if (!response.ok) {
      const errorText = await response.text();
      log("error", "USDA Barcode Search API error:", errorText);
      throw new Error(`USDA API error: ${errorText}`);
    }
    const data = await response.json();
    log("debug", "USDA API Barcode Search Response Data:", data);
    return data;
  } catch (error) {
    log(
      "error",
      `Error searching USDA foods by barcode "${barcode}" in usdaService:`,
      error,
    );
    throw error;
  }
}

async function getUsdaFoodDetails(fdcId, apiKey) {
  try {
    const detailsUrl = `${USDA_API_BASE_URL}/food/${fdcId}?api_key=${apiKey}`;
    const response = await fetch(detailsUrl, { method: "GET" });
    log("debug", "USDA API Details Response Status:", response.status);
    if (!response.ok) {
      const errorText = await response.text();
      log("error", "USDA Food Details API error:", errorText);
      throw new Error(`USDA API error: ${errorText}`);
    }
    const data = await response.json();
    log("debug", "USDA API Details Response Data:", data);
    return data;
  } catch (error) {
    log(
      "error",
      `Error fetching USDA food details for FDC ID "${fdcId}" in usdaService:`,
      error,
    );
    throw error;
  }
}

function mapUsdaBarcodeProduct(food) {
  const nutrients = {};
  for (const n of food.foodNutrients || []) {
    const id = n.nutrientId ?? n.nutrient?.id;
    nutrients[id] = n.value ?? n.amount ?? 0;
  }
  const servingSize = food.servingSize > 0 ? food.servingSize : 100;
  const scale = servingSize / 100;

  const defaultVariant = {
    serving_size: servingSize,
    serving_unit: normalizeServingUnit(food.servingSizeUnit),
    calories: Math.round((nutrients[1008] || 0) * scale),
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
    polyunsaturated_fat: Math.round((nutrients[1293] || 0) * scale * 10) / 10,
    monounsaturated_fat: Math.round((nutrients[1292] || 0) * scale * 10) / 10,
    vitamin_a: Math.round((nutrients[1104] || 0) * 0.3 * scale),
    vitamin_c: Math.round((nutrients[1162] || 0) * scale * 10) / 10,
    is_default: true,
  };

  return {
    name: food.description,
    brand: food.brandName || food.brandOwner || null,
    barcode: normalizeBarcode(food.gtinUpc),
    provider_external_id: String(food.fdcId),
    provider_type: "usda",
    is_custom: false,
    default_variant: defaultVariant,
  };
}

module.exports = {
  searchUsdaFoods,
  getUsdaFoodDetails,
  searchUsdaFoodsByBarcode,
  mapUsdaBarcodeProduct,
};
