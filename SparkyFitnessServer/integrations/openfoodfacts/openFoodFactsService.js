const { log } = require('../../config/logging');
const { name, version } = require('../../package.json');
const { normalizeBarcode } = require('../../utils/foodUtils');

const OFF_WORLD_BASE_URL =
  process.env.SPARKY_FITNESS_OFF_WORLD_BASE_URL ||
  'https://world.openfoodfacts.org';
const OFF_SEARCH_BASE_URL =
  process.env.SPARKY_FITNESS_OFF_SEARCH_BASE_URL ||
  'https://search.openfoodfacts.org';
const OFF_SEARCH_PAGE_SIZE = 20;
const OFF_PUBLIC_BASIC_AUTH = `Basic ${Buffer.from('off:off').toString('base64')}`;

const OFF_FIELDS = [
  'product_name',
  'product_name_en',
  'brands',
  'code',
  'serving_size',
  'serving_quantity',
  'nutriments',
];

const offSessionCache = {
  cacheKey: null,
  cookie: null,
  expiresAt: 0,
};

function getOffAppConfig() {
  return {
    appName: process.env.SPARKY_FITNESS_OFF_APP_NAME?.trim() || name,
    appVersion:
      process.env.SPARKY_FITNESS_OFF_APP_VERSION?.trim() || version,
    appUuid: process.env.SPARKY_FITNESS_OFF_APP_UUID?.trim(),
    appContact:
      process.env.SPARKY_FITNESS_OFF_APP_CONTACT?.trim() ||
      'https://github.com/CodeWithCJ/SparkyFitness',
  };
}

function getOffHeaders() {
  const { appName, appVersion, appContact } = getOffAppConfig();
  return {
    Accept: 'application/json',
    'User-Agent': `${appName}/${appVersion} (${appContact})`,
  };
}

function getSearchLanguages(language) {
  return language === 'en' ? 'en' : `${language},en`;
}

function normalizeOffBrands(brands) {
  if (Array.isArray(brands)) {
    return brands.join(', ');
  }
  return brands;
}

function normalizeSearchHit(hit) {
  return {
    ...hit,
    brands: normalizeOffBrands(hit.brands),
  };
}

function getConfiguredOffCredentials() {
  const userId = process.env.SPARKY_FITNESS_OFF_USER_ID?.trim();
  const password = process.env.SPARKY_FITNESS_OFF_PASSWORD;

  if (!userId || !password) {
    return null;
  }

  return {
    userId,
    password,
    ...getOffAppConfig(),
  };
}

function extractSessionCookie(headers) {
  const setCookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);

  for (const header of setCookies) {
    const match = header.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

async function createAuthenticatedOffSession(credentials) {
  const body = new URLSearchParams({
    user_id: credentials.userId,
    password: credentials.password,
    app_name: credentials.appName,
    app_version: credentials.appVersion,
  });

  if (credentials.appUuid) {
    body.set('app_uuid', credentials.appUuid);
  }

  const response = await fetch(`${OFF_WORLD_BASE_URL}/cgi/session.pl`, {
    method: 'POST',
    headers: {
      ...getOffHeaders(),
      Accept: 'text/html,application/xhtml+xml',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenFoodFacts login failed: ${errorText}`);
  }

  const sessionCookie = extractSessionCookie(response.headers);
  if (!sessionCookie) {
    throw new Error('OpenFoodFacts login did not return a session cookie');
  }

  return sessionCookie;
}

async function getAuthenticatedOffSessionCookie(forceRefresh = false) {
  const credentials = getConfiguredOffCredentials();
  if (!credentials) {
    return null;
  }

  const cacheKey = `${credentials.userId}:${credentials.password}`;
  const cacheIsFresh =
    !forceRefresh &&
    offSessionCache.cookie &&
    offSessionCache.cacheKey === cacheKey &&
    offSessionCache.expiresAt > Date.now();

  if (cacheIsFresh) {
    return offSessionCache.cookie;
  }

  const sessionCookie = await createAuthenticatedOffSession(credentials);
  offSessionCache.cacheKey = cacheKey;
  offSessionCache.cookie = sessionCookie;
  offSessionCache.expiresAt = Date.now() + 30 * 60 * 1000;
  return sessionCookie;
}

function buildLegacyOffHeaders(sessionCookie) {
  const headers = {
    ...getOffHeaders(),
  };

  if (sessionCookie) {
    headers.Cookie = `session=${sessionCookie}`;
    return headers;
  }

  headers.Authorization = OFF_PUBLIC_BASIC_AUTH;
  return headers;
}

async function searchOpenFoodFactsViaSearchApi(query, page = 1, language = 'en') {
  const searchUrl = new URL('/search', OFF_SEARCH_BASE_URL);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('page', String(page));
  searchUrl.searchParams.set('page_size', String(OFF_SEARCH_PAGE_SIZE));
  searchUrl.searchParams.set('langs', getSearchLanguages(language));
  searchUrl.searchParams.set(
    'fields',
    'code,product_name,brands,nutriments,serving_quantity,serving_size'
  );

  const response = await fetch(searchUrl, {
    method: 'GET',
    headers: getOffHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenFoodFacts Search API error: ${errorText}`);
  }

  const data = await response.json();
  return {
    products: (data.hits || []).map(normalizeSearchHit),
    pagination: {
      page: data.page || page,
      pageSize: data.page_size || OFF_SEARCH_PAGE_SIZE,
      totalCount: data.count || 0,
      hasMore:
        (data.page || page) * (data.page_size || OFF_SEARCH_PAGE_SIZE) <
        (data.count || 0),
    },
  };
}

async function searchOpenFoodFactsViaLegacyApi(
  query,
  page = 1,
  language = 'en'
) {
  const fieldSet = new Set(OFF_FIELDS);
  if (language !== 'en') {
    fieldSet.add(`product_name_${language}`);
  }
  const fields = [...fieldSet];
  const searchUrl = new URL('/cgi/search.pl', OFF_WORLD_BASE_URL);
  searchUrl.searchParams.set('search_terms', query);
  searchUrl.searchParams.set('search_simple', '1');
  searchUrl.searchParams.set('action', 'process');
  searchUrl.searchParams.set('json', '1');
  searchUrl.searchParams.set('page_size', String(OFF_SEARCH_PAGE_SIZE));
  searchUrl.searchParams.set('page', String(page));
  searchUrl.searchParams.set('fields', fields.join(','));
  searchUrl.searchParams.set('lc', language);

  let sessionCookie = null;
  let response;

  try {
    sessionCookie = await getAuthenticatedOffSessionCookie();
  } catch (error) {
    log(
      'warn',
      'OpenFoodFacts authenticated session setup failed, falling back to public auth.',
      error
    );
  }

  response = await fetch(searchUrl, {
    method: 'GET',
    headers: buildLegacyOffHeaders(sessionCookie),
  });

  if (!response.ok && sessionCookie && response.status === 401) {
    const refreshedSessionCookie = await getAuthenticatedOffSessionCookie(true);
    response = await fetch(searchUrl, {
      method: 'GET',
      headers: buildLegacyOffHeaders(refreshedSessionCookie),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenFoodFacts Legacy Search API error: ${errorText}`);
  }

  const data = await response.json();
  return {
    products: data.products || [],
    pagination: {
      page: data.page || page,
      pageSize: data.page_size || OFF_SEARCH_PAGE_SIZE,
      totalCount: data.count || 0,
      hasMore:
        (data.page || page) * (data.page_size || OFF_SEARCH_PAGE_SIZE) <
        (data.count || 0),
    },
  };
}

async function searchOpenFoodFacts(query, page = 1, language = 'en') {
  try {
    return await searchOpenFoodFactsViaSearchApi(query, page, language);
  } catch (searchApiError) {
    log(
      'warn',
      `OpenFoodFacts search-a-licious request failed for query "${query}", retrying legacy API.`,
      searchApiError
    );
  }

  try {
    return await searchOpenFoodFactsViaLegacyApi(query, page, language);
  } catch (error) {
    log(
      'error',
      `Error searching OpenFoodFacts with query "${query}" in foodService:`,
      error
    );
    throw error;
  }
}

async function searchOpenFoodFactsByBarcodeFields(
  barcode,
  fields = OFF_FIELDS,
  language = 'en'
) {
  try {
    const fieldSet = new Set(fields);
    if (language !== 'en') {
      fieldSet.add(`product_name_${language}`);
    }
    const finalFields = [...fieldSet];
    const fieldsParam = finalFields.join(',');
    const searchUrl = `${OFF_WORLD_BASE_URL}/api/v2/product/${barcode}.json?fields=${fieldsParam}&lc=${language}`;
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        ...getOffHeaders(),
        Authorization: OFF_PUBLIC_BASIC_AUTH,
      },
    });
    if (!response.ok) {
      if (response.status === 404) {
        log(
          'debug',
          `OpenFoodFacts product not found for barcode "${barcode}"`
        );
        return { status: 0, status_verbose: 'product not found' };
      }
      const errorText = await response.text();
      log('error', 'OpenFoodFacts Barcode Fields Search API error:', errorText);
      throw new Error(`OpenFoodFacts API error: ${errorText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log(
      'error',
      `Error searching OpenFoodFacts with barcode "${barcode}" and fields "${fields.join(',')}" in foodService:`,
      error
    );
    throw error;
  }
}

function mapOpenFoodFactsProduct(
  product,
  { autoScale = true, language = 'en' } = {}
) {
  const nutriments = product.nutriments || {};
  const servingSize = autoScale
    ? product.serving_quantity > 0
      ? product.serving_quantity
      : 100
    : 100;
  const scale = servingSize / 100;

  const defaultVariant = {
    serving_size: servingSize,
    serving_unit: 'g',
    calories: Math.round((nutriments['energy-kcal_100g'] || 0) * scale),
    protein: Math.round((nutriments['proteins_100g'] || 0) * scale * 10) / 10,
    carbs:
      Math.round((nutriments['carbohydrates_100g'] || 0) * scale * 10) / 10,
    fat: Math.round((nutriments['fat_100g'] || 0) * scale * 10) / 10,
    saturated_fat:
      Math.round((nutriments['saturated-fat_100g'] || 0) * scale * 10) / 10,
    sodium: nutriments['sodium_100g']
      ? Math.round(nutriments['sodium_100g'] * 1000 * scale)
      : 0,
    dietary_fiber:
      Math.round((nutriments['fiber_100g'] || 0) * scale * 10) / 10,
    sugars: Math.round((nutriments['sugars_100g'] || 0) * scale * 10) / 10,
    polyunsaturated_fat:
      Math.round((nutriments['polyunsaturated-fat_100g'] || 0) * scale * 10) /
      10,
    monounsaturated_fat:
      Math.round((nutriments['monounsaturated-fat_100g'] || 0) * scale * 10) /
      10,
    trans_fat:
      Math.round((nutriments['trans-fat_100g'] || 0) * scale * 10) / 10,
    cholesterol: nutriments['cholesterol_100g']
      ? Math.round(nutriments['cholesterol_100g'] * 1000 * scale)
      : 0,
    potassium: nutriments['potassium_100g']
      ? Math.round(nutriments['potassium_100g'] * 1000 * scale)
      : 0,
    vitamin_a: nutriments['vitamin-a_100g']
      ? Math.round(nutriments['vitamin-a_100g'] * 1000000 * scale)
      : 0,
    vitamin_c: nutriments['vitamin-c_100g']
      ? Math.round((nutriments['vitamin-c_100g'] || 0) * scale * 10000) / 10
      : 0,
    calcium: nutriments['calcium_100g']
      ? Math.round(nutriments['calcium_100g'] * 1000 * scale)
      : 0,
    iron: nutriments['iron_100g']
      ? Math.round(nutriments['iron_100g'] * 1000 * scale * 10) / 10
      : 0,
    is_default: true,
  };

  const name =
    product[`product_name_${language}`] ||
    product.product_name_en ||
    product.product_name;

  return {
    name,
    brand: product.brands?.split(',')[0]?.trim() || '',
    barcode: normalizeBarcode(product.code),
    provider_external_id: product.code,
    provider_type: 'openfoodfacts',
    is_custom: false,
    default_variant: defaultVariant,
  };
}

module.exports = {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
  mapOpenFoodFactsProduct,
};
