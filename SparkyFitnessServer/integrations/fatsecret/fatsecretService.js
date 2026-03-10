const { log } = require('../../config/logging');

// Cache tokens by scope
const tokensByScope = new Map();

// In-memory cache for FatSecret food nutrient data
const foodNutrientCache = new Map();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const FATSECRET_OAUTH_TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const FATSECRET_API_BASE_URL = "https://platform.fatsecret.com/rest";

// Function to get FatSecret OAuth 2.0 Access Token
async function getFatSecretAccessToken(clientId, clientSecret, requestedScope = "basic") {
  const cached = tokensByScope.get(requestedScope);
  if (cached && Date.now() < cached.expiry) {
    return cached.token;
  }

  try {
    log('info', `Attempting to get FatSecret Access Token for scope "${requestedScope}" from: ${FATSECRET_OAUTH_TOKEN_URL}`);
    
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
      log('error', `FatSecret OAuth Token API error for scope "${requestedScope}":`, errorData);
      
      // Fallback: If "basic barcode" fails with invalid_scope, try "basic"
      if (requestedScope === "basic barcode" && errorData.error === "invalid_scope") {
        log('warn', 'FatSecret "barcode" scope invalid, falling back to "basic"');
        return getFatSecretAccessToken(clientId, clientSecret, "basic");
      }
      
      throw new Error(`FatSecret authentication failed: ${errorData.error_description || response.statusText}`);
    }

    const data = await response.json();
    const token = data.access_token;
    const expiry = Date.now() + (data.expires_in * 1000) - 60000; // Set expiry 1 minute early

    tokensByScope.set(requestedScope, { token, expiry });

    return token;
  } catch (error) {
    log('error', `Network error during FatSecret OAuth token acquisition for scope "${requestedScope}":`, error);
    throw new Error("Network error during FatSecret authentication. Please try again.");
  }
}

async function searchFatSecretByBarcode(barcode, clientId, clientSecret) {
  try {
    // Specifically request barcode scope for this call
    const accessToken = await getFatSecretAccessToken(clientId, clientSecret, "basic barcode");
    const url = `${FATSECRET_API_BASE_URL}/food/barcode/find-by-id/v2?${new URLSearchParams({
      barcode: barcode,
      format: "json",
    }).toString()}`;

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
        log('warn', 'FatSecret Barcode API access forbidden or unauthorized (likely non-Premier account)');
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

module.exports = {
  getFatSecretAccessToken,
  searchFatSecretByBarcode,
  foodNutrientCache,
  CACHE_DURATION_MS,
  FATSECRET_API_BASE_URL,
};
