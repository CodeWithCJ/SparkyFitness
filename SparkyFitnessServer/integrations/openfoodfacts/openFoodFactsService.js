const { log } = require('../../config/logging');
const { name, version } = require('../../package.json');

const USER_AGENT = `${name}/${version} (https://github.com/CodeWithCJ/SparkyFitness)`;

const OFF_HEADERS = {
  'User-Agent': USER_AGENT,
};

const OFF_FIELDS = ['product_name', 'brands', 'code', 'serving_size', 'serving_quantity', 'nutriments'];

async function searchOpenFoodFacts(query, page = 1) {
  try {
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&page=${page}&fields=${OFF_FIELDS.join(',')}`;
    const response = await fetch(searchUrl, { method: 'GET', headers: OFF_HEADERS });
    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'OpenFoodFacts Search API error:', errorText);
      throw new Error(`OpenFoodFacts API error: ${errorText}`);
    }
    const data = await response.json();
    return {
      products: data.products,
      pagination: {
        page: data.page || page,
        pageSize: data.page_size || 20,
        totalCount: data.count || 0,
        hasMore: (data.page || page) * (data.page_size || 20) < (data.count || 0),
      },
    };
  } catch (error) {
    log('error', `Error searching OpenFoodFacts with query "${query}" in foodService:`, error);
    throw error;
  }
}

async function searchOpenFoodFactsByBarcodeFields(barcode, fields = OFF_FIELDS) {
  try {
    const fieldsParam = fields.join(',');
    const searchUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fieldsParam}`;
    const response = await fetch(searchUrl, { method: 'GET', headers: OFF_HEADERS });
    if (!response.ok) {
      if (response.status === 404) {
        log('debug', `OpenFoodFacts product not found for barcode "${barcode}"`);
        return { status: 0, status_verbose: 'product not found' };
      }
      const errorText = await response.text();
      log('error', 'OpenFoodFacts Barcode Fields Search API error:', errorText);
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
  searchOpenFoodFactsByBarcodeFields,
};