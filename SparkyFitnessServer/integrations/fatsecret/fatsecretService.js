const { log } = require('../../config/logging');

let fatSecretAccessToken = null;
let tokenExpiryTime = 0;

// In-memory cache for FatSecret food nutrient data
const foodNutrientCache = new Map();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const FATSECRET_OAUTH_TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const FATSECRET_API_BASE_URL = "https://platform.fatsecret.com/rest";

// Function to get FatSecret OAuth 2.0 Access Token
async function getFatSecretAccessToken(clientId, clientSecret) {
  if (fatSecretAccessToken && Date.now() < tokenExpiryTime) {
    return fatSecretAccessToken;
  }

  try {
    log('info', `Attempting to get FatSecret Access Token from: ${FATSECRET_OAUTH_TOKEN_URL}`);
    log('debug', `Using Client ID: ${clientId}, Client Secret: ${clientSecret ? '********' : 'N/A'}`); // Mask secret
    const response = await fetch(FATSECRET_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "basic",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      log('error', "FatSecret OAuth Token API error:", errorData);
      throw new Error(`FatSecret authentication failed: ${errorData.error_description || response.statusText}`);
    }

    const data = await response.json();
    fatSecretAccessToken = data.access_token;
    tokenExpiryTime = Date.now() + (data.expires_in * 1000) - 60000; // Store token and set expiry 1 minute early

    return fatSecretAccessToken;
  } catch (error) {
    log('error', "Network error during FatSecret OAuth token acquisition:", error);
    throw new Error("Network error during FatSecret authentication. Please try again.");
  }
}

module.exports = {
  getFatSecretAccessToken,
  foodNutrientCache,
  CACHE_DURATION_MS,
  FATSECRET_API_BASE_URL,
};