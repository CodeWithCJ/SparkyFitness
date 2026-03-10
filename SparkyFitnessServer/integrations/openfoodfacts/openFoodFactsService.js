const { log } = require("../../config/logging");
const { name, version } = require("../../package.json");
const { normalizeBarcode } = require("../../utils/foodUtils");

const USER_AGENT = `${name}/${version} (https://github.com/CodeWithCJ/SparkyFitness)`;

const OFF_HEADERS = {
  "User-Agent": USER_AGENT,
};

const OFF_FIELDS = [
  "product_name",
  "brands",
  "code",
  "serving_size",
  "serving_quantity",
  "nutriments",
];

async function searchOpenFoodFacts(query, page = 1) {
  try {
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&page=${page}&fields=${OFF_FIELDS.join(",")}`;
    const response = await fetch(searchUrl, {
      method: "GET",
      headers: OFF_HEADERS,
    });
    if (!response.ok) {
      const errorText = await response.text();
      log("error", "OpenFoodFacts Search API error:", errorText);
      throw new Error(`OpenFoodFacts API error: ${errorText}`);
    }
    const data = await response.json();
    return {
      products: data.products,
      pagination: {
        page: data.page || page,
        pageSize: data.page_size || 20,
        totalCount: data.count || 0,
        hasMore:
          (data.page || page) * (data.page_size || 20) < (data.count || 0),
      },
    };
  } catch (error) {
    log(
      "error",
      `Error searching OpenFoodFacts with query "${query}" in foodService:`,
      error,
    );
    throw error;
  }
}

async function searchOpenFoodFactsByBarcodeFields(
  barcode,
  fields = OFF_FIELDS,
) {
  try {
    const fieldsParam = fields.join(",");
    const searchUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fieldsParam}`;
    const response = await fetch(searchUrl, {
      method: "GET",
      headers: OFF_HEADERS,
    });
    if (!response.ok) {
      if (response.status === 404) {
        log(
          "debug",
          `OpenFoodFacts product not found for barcode "${barcode}"`,
        );
        return { status: 0, status_verbose: "product not found" };
      }
      const errorText = await response.text();
      log("error", "OpenFoodFacts Barcode Fields Search API error:", errorText);
      throw new Error(`OpenFoodFacts API error: ${errorText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log(
      "error",
      `Error searching OpenFoodFacts with barcode "${barcode}" and fields "${fields.join(",")}" in foodService:`,
      error,
    );
    throw error;
  }
}

function mapOpenFoodFactsProduct(product) {
  const nutriments = product.nutriments || {};
  const servingSize =
    product.serving_quantity > 0 ? product.serving_quantity : 100;
  const scale = servingSize / 100;

  const defaultVariant = {
    serving_size: servingSize,
    serving_unit: "g",
    calories: Math.round((nutriments["energy-kcal_100g"] || 0) * scale),
    protein: Math.round((nutriments["proteins_100g"] || 0) * scale * 10) / 10,
    carbs:
      Math.round((nutriments["carbohydrates_100g"] || 0) * scale * 10) / 10,
    fat: Math.round((nutriments["fat_100g"] || 0) * scale * 10) / 10,
    saturated_fat:
      Math.round((nutriments["saturated-fat_100g"] || 0) * scale * 10) / 10,
    sodium: nutriments["sodium_100g"]
      ? Math.round(nutriments["sodium_100g"] * 1000 * scale)
      : 0,
    dietary_fiber:
      Math.round((nutriments["fiber_100g"] || 0) * scale * 10) / 10,
    sugars: Math.round((nutriments["sugars_100g"] || 0) * scale * 10) / 10,
    polyunsaturated_fat:
      Math.round((nutriments["polyunsaturated-fat_100g"] || 0) * scale * 10) /
      10,
    monounsaturated_fat:
      Math.round((nutriments["monounsaturated-fat_100g"] || 0) * scale * 10) /
      10,
    trans_fat:
      Math.round((nutriments["trans-fat_100g"] || 0) * scale * 10) / 10,
    cholesterol: nutriments["cholesterol_100g"]
      ? Math.round(nutriments["cholesterol_100g"] * 1000 * scale)
      : 0,
    potassium: nutriments["potassium_100g"]
      ? Math.round(nutriments["potassium_100g"] * 1000 * scale)
      : 0,
    vitamin_a: nutriments["vitamin-a_100g"]
      ? Math.round(nutriments["vitamin-a_100g"] * 1000000 * scale)
      : 0,
    vitamin_c: nutriments["vitamin-c_100g"]
      ? Math.round(nutriments["vitamin-c_100g"] * 1000 * scale * 10) / 10
      : 0,
    calcium: nutriments["calcium_100g"]
      ? Math.round(nutriments["calcium_100g"] * 1000 * scale)
      : 0,
    iron: nutriments["iron_100g"]
      ? Math.round(nutriments["iron_100g"] * 1000 * scale * 10) / 10
      : 0,
    is_default: true,
  };

  return {
    name: product.product_name,
    brand: product.brands?.split(",")[0]?.trim() || "",
    barcode: normalizeBarcode(product.code),
    provider_external_id: product.code,
    provider_type: "openfoodfacts",
    is_custom: false,
    default_variant: defaultVariant,
  };
}
module.exports = {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
  mapOpenFoodFactsProduct,
};
