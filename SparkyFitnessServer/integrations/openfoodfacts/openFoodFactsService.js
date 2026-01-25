const { log } = require('../../config/logging');

async function searchOpenFoodFacts(query) {
  try {
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20`;
    const response = await fetch(searchUrl, { method: 'GET' });
    if (!response.ok) {
      const errorText = await response.text();
      log('error', "OpenFoodFacts Search API error:", errorText);
      throw new Error(`OpenFoodFacts API error: ${errorText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log('error', `Error searching OpenFoodFacts with query "${query}" in foodService:`, error);
    throw error;
  }
}

async function searchOpenFoodFactsByBarcode(barcode) {
  try {
    const searchUrl = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
    const response = await fetch(searchUrl, { method: 'GET' });
    if (!response.ok) {
      const errorText = await response.text();
      log('error', "OpenFoodFacts Barcode Search API error:", errorText);
      throw new Error(`OpenFoodFacts API error: ${errorText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log('error', `Error searching OpenFoodFacts with barcode "${barcode}" in foodService:`, error);
    throw error;
  }
}

module.exports = {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcode,
};