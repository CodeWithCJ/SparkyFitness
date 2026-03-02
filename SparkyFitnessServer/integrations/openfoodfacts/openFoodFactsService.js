const { log } = require('../../config/logging');
const { name, version } = require('../../package.json');

const USER_AGENT = `${name}/${version} (https://github.com/CodeWithCJ/SparkyFitness)`;

const OFF_HEADERS = {
  'User-Agent': USER_AGENT,
};

async function searchOpenFoodFacts(query) {
  try {
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20`;
    const response = await fetch(searchUrl, { method: 'GET', headers: OFF_HEADERS });
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
    const response = await fetch(searchUrl, { method: 'GET', headers: OFF_HEADERS });
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

async function searchOpenFoodFactsByBarcodeFields(barcode, fields = ['product_name','brands','code','serving_size','serving_quantity','nutriments']) {
  try {
    const fieldsParam = fields.join(',');
    const searchUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fieldsParam}`;
    const response = await fetch(searchUrl, { method: 'GET', headers: OFF_HEADERS });
    if (!response.ok) {
      const errorText = await response.text();
      log('error', "OpenFoodFacts Barcode Fields Search API error:", errorText);
      throw new Error(`OpenFoodFacts API error: ${errorText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log('error', `Error searching OpenFoodFacts with barcode "${barcode}" and fields "${fields.join(',')}" in foodService:`, error);
    throw error;
  }
}
module.exports = {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcode,
  searchOpenFoodFactsByBarcodeFields,
};