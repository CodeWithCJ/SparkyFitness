const { log } = require("../../config/logging");

// Cache tokens by scope
const tokensByScope = new Map();

// In-memory cache for FatSecret food nutrient data
const foodNutrientCache = new Map();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const FATSECRET_OAUTH_TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const FATSECRET_API_BASE_URL = "https://platform.fatsecret.com/rest";

// Function to get FatSecret OAuth 2.0 Access Token
async function getFatSecretAccessToken(
  clientId,
  clientSecret,
  requestedScope = "basic",
) {
  const cached = tokensByScope.get(requestedScope);
  if (cached && Date.now() < cached.expiry) {
    return cached.token;
  }

  try {
    log(
      "info",
      `Attempting to get FatSecret Access Token for scope "${requestedScope}" from: ${FATSECRET_OAUTH_TOKEN_URL}`,
    );

    const response = await fetch(FATSECRET_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: requestedScope,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      log(
        "error",
        `FatSecret OAuth Token API error for scope "${requestedScope}":`,
        errorData,
      );

      // Fallback: If "basic barcode" fails with invalid_scope, try "basic"
      if (
        requestedScope === "basic barcode" &&
        errorData.error === "invalid_scope"
      ) {
        log(
          "warn",
          'FatSecret "barcode" scope invalid, falling back to "basic"',
        );
        return getFatSecretAccessToken(clientId, clientSecret, "basic");
      }

      throw new Error(
        `FatSecret authentication failed: ${errorData.error_description || response.statusText}`,
      );
    }

    const data = await response.json();
    const token = data.access_token;
    const expiry = Date.now() + data.expires_in * 1000 - 60000; // Set expiry 1 minute early

    tokensByScope.set(requestedScope, { token, expiry });

    return token;
  } catch (error) {
    log(
      "error",
      `Network error during FatSecret OAuth token acquisition for scope "${requestedScope}":`,
      error,
    );
    throw new Error(
      "Network error during FatSecret authentication. Please try again.",
    );
  }
}

async function searchFatSecretByBarcode(barcode, clientId, clientSecret) {
  try {
    // Specifically request barcode scope for this call
    const accessToken = await getFatSecretAccessToken(
      clientId,
      clientSecret,
      "basic barcode",
    );
    const url = `${FATSECRET_API_BASE_URL}/food/barcode/find-by-id/v2?${new URLSearchParams(
      {
        barcode: barcode,
        format: "json",
      },
    ).toString()}`;

    log("info", `FatSecret Barcode Lookup URL: ${url}`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      const errorText = await response.text();
      log("error", "FatSecret Barcode API error:", errorText);

      // If we get an error related to scope/permission, we know barcode API isn't available
      if (response.status === 403 || response.status === 401) {
        log(
          "warn",
          "FatSecret Barcode API access forbidden or unauthorized (likely non-Premier account)",
        );
        return null;
      }

      throw new Error(`FatSecret Barcode API error: ${errorText}`);
    }

    const data = await response.json();
    if (data.error && data.error.code === "211") {
      return null; // No food item detected
    }
    return data;
  } catch (error) {
    log("error", `Error searching FatSecret by barcode ${barcode}:`, error);
    throw error;
  }
}

function mapFatSecretBarcodeProduct(data) {
  const food = data.food;
  if (!food) return null;

  // Servings can be an array or a single object in FatSecret API
  let servings = food.servings?.serving || [];
  if (!Array.isArray(servings)) {
    servings = [servings];
  }

  // Find the default serving or use the first one
  const serving =
    servings.find((s) => s.is_default === "1") || servings[0] || {};

  const defaultVariant = {
    serving_size: parseFloat(serving.metric_serving_amount) || 100,
    serving_unit: serving.metric_serving_unit || "g",
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
    is_default: true,
  };

  return {
    name: food.food_name,
    brand: food.brand_name || "",
    barcode: food.barcode, // Passed in from lookupBarcode
    provider_external_id: food.food_id,
    provider_type: "fatsecret",
    is_custom: false,
    default_variant: defaultVariant,
  };
}

module.exports = {
  getFatSecretAccessToken,
  searchFatSecretByBarcode,
  mapFatSecretBarcodeProduct,
  foodNutrientCache,
  CACHE_DURATION_MS,
  FATSECRET_API_BASE_URL,
};
