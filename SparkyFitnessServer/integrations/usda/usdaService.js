const { log } = require('../../config/logging');
// Using native fetch (standard in Node 22+)

const USDA_API_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

async function searchUsdaFoods(query, apiKey) {
  try {
    const searchUrl = `${USDA_API_BASE_URL}/foods/search?query=${encodeURIComponent(query)}&api_key=${apiKey}`;
    const response = await fetch(searchUrl, { method: 'GET' });
    log('debug', 'USDA API Search Response Status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      log('error', "USDA Food Search API error:", errorText);
      throw new Error(`USDA API error: ${errorText}`);
    }
    const data = await response.json();
    log('debug', 'USDA API Search Response Data:', data);
    return data;
  } catch (error) {
    log('error', `Error searching USDA foods with query "${query}" in usdaService:`, error);
    throw error;
  }
}

async function getUsdaFoodDetails(fdcId, apiKey) {
  try {
    const detailsUrl = `${USDA_API_BASE_URL}/food/${fdcId}?api_key=${apiKey}`;
    const response = await fetch(detailsUrl, { method: 'GET' });
    log('debug', 'USDA API Details Response Status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      log('error', "USDA Food Details API error:", errorText);
      throw new Error(`USDA API error: ${errorText}`);
    }
    const data = await response.json();
    log('debug', 'USDA API Details Response Data:', data);
    return data;
  } catch (error) {
    log('error', `Error fetching USDA food details for FDC ID "${fdcId}" in usdaService:`, error);
    throw error;
  }
}

module.exports = {
  searchUsdaFoods,
  getUsdaFoodDetails,
};