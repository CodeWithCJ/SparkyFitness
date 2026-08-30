import {
  resolveOpenFoodFactsProvider,
  invalidateOpenFoodFactsSession,
  DEFAULT_OFF_BASE_URL,
} from './openFoodFactsAuth.js';
import { log } from '../../config/logging.js';
import { normalizeNutrientUnit } from '@workspace/shared';
import package$0 from '../../package.json' with { type: 'json' };
import {
  normalizeBarcode,
  normalizeServingUnit,
  altBarcode,
} from '../../utils/foodUtils.js';
const { name, version } = package$0;
const USER_AGENT = `${name}/${version} (https://github.com/CodeWithCJ/SparkyFitness)`;
const SEARCH_A_LICIOUS_URL = 'https://search.openfoodfacts.org/search';
const SEARCH_A_LICIOUS_RESULT_WINDOW = 10_000;
const OFF_HEADERS = {
  'User-Agent': USER_AGENT,
};
// Upstream availability is intermittent (the public API periodically answers
// very slowly or not at all under load). Bound every outbound call so a hung
// provider request cannot hold the client request open indefinitely.
const OFF_FETCH_TIMEOUT_MS = 10_000;

/** Identifies timeout-shaped errors emitted by Node fetch implementations. */
function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' ||
      error.name === 'AbortError' ||
      error.message.includes('timed out'))
  );
}

/** Runs one OFF request with a hard wall-clock timeout. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = OFF_FETCH_TIMEOUT_MS
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      log(
        'warn',
        `OpenFoodFacts request timed out after ${timeoutMs}ms: ${url}`
      );
      throw Object.assign(new Error('OpenFoodFacts request timed out'), {
        status: 504,
      });
    }
    throw error;
  }
}
const OFF_FIELDS = [
  'product_name',
  'product_name_en',
  'brands',
  'code',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
  'product_quantity_unit',
  'nutriments',
  'allergens_tags',
  'traces_tags',
  // Product photos: front image preferred, plain image_url as fallback.
  'image_front_url',
  'image_url',
];

const OFF_CORE_NUTRIENT_100G_KEYS = [
  'energy-kcal_100g',
  'energy-kj_100g',
  'energy_100g',
  'proteins_100g',
  'carbohydrates_100g',
  'fat_100g',
] as const;
const OFF_CORE_NUTRIENT_SERVING_KEYS = [
  'energy-kcal_serving',
  'energy-kj_serving',
  'energy_serving',
  'proteins_serving',
  'carbohydrates_serving',
  'fat_serving',
] as const;
const OFF_CORE_NUTRIENT_100G_SEARCH_CLAUSE = `(${OFF_CORE_NUTRIENT_100G_KEYS.map(
  (key) => `nutriments.${key}:*`
).join(' OR ')})`;
const OFF_CORE_NUTRIENT_SERVING_SEARCH_CLAUSE = `(${OFF_CORE_NUTRIENT_SERVING_KEYS.map(
  (key) => `nutriments.${key}:*`
).join(' OR ')})`;
const OFF_CORE_NUTRITION_SEARCH_CLAUSE = `(${OFF_CORE_NUTRIENT_100G_SEARCH_CLAUSE} OR (serving_quantity:[0.000001 TO *] AND ${OFF_CORE_NUTRIENT_SERVING_SEARCH_CLAUSE}))`;
const LEGACY_SEARCH_BATCH_SIZE = 100;

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  code?: string;
  serving_size?: string;
  serving_quantity?: number;
  serving_quantity_unit?: string;
  product_quantity_unit?: string;
  nutriments?: Record<string, unknown>;
  allergens_tags?: string[];
  traces_tags?: string[];
  image_front_url?: string;
  image_url?: string;
  [key: string]: unknown;
}

interface LegacyOffSearchResponse {
  products?: OffProduct[];
  page?: number;
  page_size?: number;
  count?: number;
}

interface SearchALiciousHit extends Omit<OffProduct, 'brands'> {
  brands?: string | string[];
}

interface SearchALiciousResponse {
  hits: SearchALiciousHit[];
  page?: number;
  page_size?: number;
  count?: number;
  is_count_exact?: boolean;
}

interface ProductOpenerSearchResponse {
  products: OffProduct[];
}

/** Narrows untrusted JSON values to non-null objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Parses an upstream JSON response and rejects data outside its schema. */
async function parseSearchResponse<T>(
  response: Response,
  isValid: (value: unknown) => value is T
): Promise<T> {
  try {
    const data: unknown = await response.json();
    if (isValid(data)) return data;
  } catch {
    // Normalize JSON/parser errors so an upstream HTML body is never exposed.
  }

  throw new Error(
    `OpenFoodFacts search returned an invalid response (HTTP ${response.status || 200})`
  );
}

/** Validates the minimum legacy Product Opener search response shape. */
function isLegacySearchResponse(
  value: unknown
): value is LegacyOffSearchResponse & { products: OffProduct[] } {
  return isRecord(value) && Array.isArray(value.products);
}

/** Validates Search-a-licious hits and its optional count-accuracy flag. */
function isSearchALiciousResponse(
  value: unknown
): value is SearchALiciousResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.hits) &&
    value.hits.every(isRecord) &&
    (value.is_count_exact === undefined ||
      typeof value.is_count_exact === 'boolean')
  );
}

/** Validates every product returned by the Product Opener bulk endpoint. */
function isProductOpenerSearchResponse(
  value: unknown
): value is ProductOpenerSearchResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.products) &&
    value.products.every(isRecord)
  );
}

/** Normalizes names and brands for accent-insensitive token matching. */
function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Stably promotes hits that cover the complete query phrase and tokens. */
function rankSearchHits(
  hits: SearchALiciousHit[],
  query: string,
  language: string
): SearchALiciousHit[] {
  const normalizedQuery = normalizeSearchText(query);
  const phraseTokens = normalizedQuery.split(' ').filter(Boolean);
  const queryTokens = [...new Set(phraseTokens)];
  if (!normalizedQuery || queryTokens.length === 0) return hits;

  return hits
    .map((hit, index) => {
      const brand = Array.isArray(hit.brands)
        ? hit.brands.join(' ')
        : hit.brands || '';
      const localizedName = hit[`product_name_${language}`];
      const searchableText = normalizeSearchText(
        [
          brand,
          typeof localizedName === 'string' ? localizedName : '',
          hit.product_name || '',
          hit.product_name_en || '',
        ].join(' ')
      );
      const searchableTokens = searchableText.split(' ').filter(Boolean);
      const candidateTokens = new Set(searchableTokens);
      const tokenCoverage =
        queryTokens.filter((token) => candidateTokens.has(token)).length /
        queryTokens.length;
      const phraseBoost = searchableTokens.some((_, start) =>
        phraseTokens.every(
          (token, offset) => searchableTokens[start + offset] === token
        )
      )
        ? 2
        : 0;

      return { hit, index, score: phraseBoost + tokenCoverage };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ hit }) => hit);
}

/**
 * Resolves the session and base URL once for an OFF lookup, falling back to
 * the public provider when an optional provider cannot be resolved.
 */
async function resolveOffRequestContext(
  authenticatedUserId?: string,
  providerId?: string
): Promise<{ sessionCookie: string | null; baseUrl: string }> {
  if (!authenticatedUserId || !providerId) {
    return { sessionCookie: null, baseUrl: DEFAULT_OFF_BASE_URL };
  }
  try {
    const { session, baseUrl } = await resolveOpenFoodFactsProvider(
      authenticatedUserId,
      providerId
    );
    return { sessionCookie: session, baseUrl };
  } catch (error) {
    log('debug', 'OpenFoodFacts: provider resolution failed:', error);
    return { sessionCookie: null, baseUrl: DEFAULT_OFF_BASE_URL };
  }
}

/**
 * Fetches an OFF endpoint with optional session authentication. A retry after
 * an authenticated 429/5xx shares the original request's absolute deadline.
 */
async function fetchOpenFoodFacts(
  url: string,
  {
    authenticatedUserId,
    providerId,
    sessionCookie,
    timeoutMs = OFF_FETCH_TIMEOUT_MS,
  }: {
    authenticatedUserId?: string;
    providerId?: string;
    sessionCookie?: string | null;
    timeoutMs?: number;
  } = {}
) {
  const baseHeaders = { ...OFF_HEADERS };

  const headers = sessionCookie
    ? { ...baseHeaders, Cookie: `session=${sessionCookie}` }
    : baseHeaders;

  // The unauthenticated retry shares this request's deadline, so a 429/5xx
  // answered near the end of the budget cannot double the wall-clock time.
  const requestDeadline = Date.now() + timeoutMs;

  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers,
    },
    timeoutMs
  );

  if (sessionCookie && (response.status === 429 || response.status >= 500)) {
    log(
      'warn',
      `OpenFoodFacts: ${response.status} with session cookie — invalidating and retrying unauthenticated`
    );
    if (authenticatedUserId && providerId) {
      invalidateOpenFoodFactsSession(authenticatedUserId, providerId);
    }
    const remainingTimeoutMs = requestDeadline - Date.now();
    if (remainingTimeoutMs <= 0) {
      log('warn', `OpenFoodFacts retry deadline exhausted: ${url}`);
      throw Object.assign(new Error('OpenFoodFacts request timed out'), {
        status: 504,
      });
    }
    return fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: baseHeaders,
      },
      remainingTimeoutMs
    );
  }

  return response;
}

/** Returns the equivalent UPC-A or zero-padded EAN-13 barcode, when present. */
function offCodeAliases(code: string): string[] {
  if (/^\d{12}$/.test(code)) return ['0' + code];
  if (/^0\d{12}$/.test(code)) return [code.slice(1)];
  return [];
}

/** Converts a Search-a-licious hit into the Product Opener product shape. */
function productFromSearchHit(hit: SearchALiciousHit): OffProduct {
  return {
    ...hit,
    brands: Array.isArray(hit.brands) ? hit.brands.join(', ') : hit.brands,
  };
}

/**
 * Refreshes ranked hits in one Product Opener bulk request while preserving
 * every original hit when hydration is partial or unavailable.
 */
async function hydrateSearchHits(
  hits: SearchALiciousHit[],
  fields: string[],
  language: string,
  requestContext: {
    authenticatedUserId?: string;
    providerId?: string;
    sessionCookie: string | null;
    baseUrl: string;
  }
): Promise<OffProduct[]> {
  const codes = [
    ...new Set(
      hits
        .map((hit) => String(hit.code || '').trim())
        .filter((code) => code.length > 0)
    ),
  ];
  if (codes.length === 0) return hits.map(productFromSearchHit);

  // Ask for both barcode forms so the bulk lookup also finds products Product
  // Opener stores under the sibling UPC-A/EAN-13 representation.
  const requestCodes = [
    ...new Set(codes.flatMap((code) => [code, ...offCodeAliases(code)])),
  ];
  const fieldsParam = fields.join(',');
  const batchUrl = `${requestContext.baseUrl}/api/v2/search?code=${requestCodes
    .map(encodeURIComponent)
    .join(
      ','
    )}&fields=${fieldsParam}&page_size=${requestCodes.length}&lc=${language}`;
  let currentProducts: OffProduct[] = [];
  try {
    const batchResponse = await fetchOpenFoodFacts(batchUrl, requestContext);
    if (!batchResponse.ok) {
      throw new Error(
        `OpenFoodFacts bulk hydration failed (HTTP ${batchResponse.status})`
      );
    }
    const batchData = await parseSearchResponse(
      batchResponse,
      isProductOpenerSearchResponse
    );
    currentProducts = batchData.products;
  } catch (error) {
    // Search-a-licious already returned complete product records. Hydration is
    // only a freshness improvement, so a separate Product Opener outage must
    // not turn a successful search into an error or a rate-limited fan-out.
    log('warn', 'OpenFoodFacts bulk hydration unavailable:', error);
  }

  const productsByCode = new Map(
    currentProducts
      .filter((product) => product.code)
      .map((product) => [String(product.code).trim(), product])
  );
  // Product Opener may store a product under its UPC-A/EAN-13 sibling form,
  // while Search-a-licious indexes the other one. Without this fallback such
  // hits silently vanish from the result list ("intermittently no results").
  const lookupProduct = (code: string): OffProduct | undefined =>
    productsByCode.get(code) ??
    offCodeAliases(code)
      .map((alias) => productsByCode.get(alias))
      .find((product) => product !== undefined);
  return hits.map((hit) => {
    const code = String(hit.code || '').trim();
    const indexedProduct = productFromSearchHit(hit);
    const currentProduct = code ? lookupProduct(code) : undefined;

    // The full-text index can still hold nutrition while Product Opener is
    // temporarily stale or incomplete. Keep the qualified ranked hit in that
    // case so hydration cannot underfill an otherwise valid search page.
    return currentProduct && hasUsableOffCoreNutrition(currentProduct)
      ? currentProduct
      : indexedProduct;
  });
}

/** Builds pagination that respects inexact counts and the 10,000-hit window. */
function getSearchALiciousPagination(
  data: SearchALiciousResponse,
  requestedPage: number,
  requestedPageSize: number
) {
  const page = data.page || requestedPage;
  const pageSize = data.page_size || requestedPageSize;
  const loadedThrough = (page - 1) * pageSize + data.hits.length;
  const nextPageFitsWindow =
    (page + 1) * pageSize <= SEARCH_A_LICIOUS_RESULT_WINDOW;

  if (data.is_count_exact === false) {
    const hasMore = data.hits.length === pageSize && nextPageFitsWindow;
    return {
      page,
      pageSize,
      totalCount: loadedThrough + (hasMore ? 1 : 0),
      hasMore,
    };
  }

  const totalCount = Math.min(
    data.count ?? loadedThrough,
    SEARCH_A_LICIOUS_RESULT_WINDOW
  );
  return {
    page,
    pageSize,
    totalCount,
    hasMore: page * pageSize < totalCount && nextPageFitsWindow,
  };
}

/** Searches either public Search-a-licious or a custom legacy OFF provider. */
async function searchOpenFoodFacts(
  query: string,
  page = 1,
  language = 'en',
  authenticatedUserId?: string,
  providerId?: string,
  pageSize = 20
): Promise<{
  products: OffProduct[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    hasMore: boolean;
  };
}> {
  try {
    const fieldSet = new Set(OFF_FIELDS);
    if (language !== 'en') {
      fieldSet.add(`product_name_${language}`);
    }
    const fields = [...fieldSet];
    const { sessionCookie, baseUrl } = await resolveOffRequestContext(
      authenticatedUserId,
      providerId
    );

    // Search-a-licious is Open Food Facts' relevance-ranked full-text search
    // API. Custom/self-hosted Product Opener instances do not necessarily run
    // it, so preserve their legacy local search endpoint.
    const isPublicOpenFoodFacts =
      baseUrl.replace(/\/+$/, '') === DEFAULT_OFF_BASE_URL.replace(/\/+$/, '');
    if (!isPublicOpenFoodFacts) {
      // Legacy Product Opener combines multiple nutriment filters with AND, so
      // it cannot express the same energy-or-macro rule as
      // hasUsableOffCoreNutrition. Scan provider pages in larger batches and
      // apply the rule before slicing the requested page. The one-item
      // lookahead keeps hasMore truthful without scanning an entire catalogue.
      const requestedStart = (page - 1) * pageSize;
      const requestedEnd = page * pageSize;
      const usableProducts: OffProduct[] = [];
      let providerPage = 1;
      let hasMoreCandidates = true;

      while (hasMoreCandidates && usableProducts.length <= requestedEnd) {
        const searchUrl = `${baseUrl}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${LEGACY_SEARCH_BATCH_SIZE}&page=${providerPage}&fields=${fields.join(',')}&lc=${language}`;
        const response = await fetchOpenFoodFacts(searchUrl, {
          authenticatedUserId,
          providerId,
          sessionCookie,
        });
        if (!response.ok) {
          log(
            'error',
            `OpenFoodFacts legacy search failed with HTTP ${response.status}`
          );
          throw new Error(
            `OpenFoodFacts search failed (HTTP ${response.status})`
          );
        }
        const data = await parseSearchResponse(
          response,
          isLegacySearchResponse
        );
        usableProducts.push(...data.products.filter(hasUsableOffCoreNutrition));

        const providerPageSize =
          typeof data.page_size === 'number' && data.page_size > 0
            ? data.page_size
            : LEGACY_SEARCH_BATCH_SIZE;
        const providerCount =
          typeof data.count === 'number' && data.count >= 0 ? data.count : null;
        hasMoreCandidates =
          data.products.length > 0 &&
          (providerCount !== null
            ? providerPage * providerPageSize < providerCount
            : data.products.length === providerPageSize);
        providerPage += 1;
      }

      const hasMore = usableProducts.length > requestedEnd;
      return {
        products: usableProducts.slice(requestedStart, requestedEnd),
        pagination: {
          page,
          pageSize,
          totalCount: usableProducts.length,
          hasMore,
        },
      };
    }

    if (page * pageSize > SEARCH_A_LICIOUS_RESULT_WINDOW) {
      throw Object.assign(
        new Error(
          `OpenFoodFacts search supports at most ${SEARCH_A_LICIOUS_RESULT_WINDOW} results`
        ),
        { status: 400, statusCode: 400 }
      );
    }

    const langs = language === 'en' ? ['en'] : [language, 'en'];
    const response = await fetchWithTimeout(SEARCH_A_LICIOUS_URL, {
      method: 'POST',
      headers: {
        ...OFF_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Search-a-licious treats adjacent free-text and field clauses as
        // required terms. Grouping the free text itself (or inserting AND
        // after a multi-word phrase) currently yields an empty result set.
        q: `${query} ${OFF_CORE_NUTRITION_SEARCH_CLAUSE}`,
        page,
        page_size: pageSize,
        boost_phrase: true,
        langs,
        fields,
      }),
    });
    if (!response.ok) {
      log(
        'error',
        `OpenFoodFacts Search-a-licious request failed with HTTP ${response.status}`
      );
      throw new Error(`OpenFoodFacts search failed (HTTP ${response.status})`);
    }
    const data = await parseSearchResponse(response, isSearchALiciousResponse);
    const rankedHits = rankSearchHits(data.hits, query, language);
    const products = (
      await hydrateSearchHits(rankedHits, fields, language, {
        authenticatedUserId,
        providerId,
        sessionCookie,
        baseUrl,
      })
    ).filter(hasUsableOffCoreNutrition);
    return {
      products,
      pagination: getSearchALiciousPagination(data, page, pageSize),
    };
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
  barcode: string,
  fields = OFF_FIELDS,
  language = 'en',
  authenticatedUserId?: string,
  providerId?: string
): Promise<{
  status: number;
  status_verbose: string;
  product?: OffProduct;
  [key: string]: unknown;
}> {
  try {
    const fieldSet = new Set(fields);
    if (language !== 'en') {
      fieldSet.add(`product_name_${language}`);
    }
    const finalFields = [...fieldSet];
    const fieldsParam = finalFields.join(',');
    const { sessionCookie, baseUrl } = await resolveOffRequestContext(
      authenticatedUserId,
      providerId
    );
    const searchUrl = `${baseUrl}/api/v2/product/${barcode}.json?fields=${fieldsParam}&lc=${language}`;
    const response = await fetchOpenFoodFacts(searchUrl, {
      authenticatedUserId,
      providerId,
      sessionCookie,
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
    let data = (await response.json()) as {
      status: number;
      status_verbose: string;
      product?: OffProduct;
      [key: string]: unknown;
    };

    if (data.status !== 1 || !data.product) {
      const alt = altBarcode(barcode);

      if (alt) {
        const altUrl = `${baseUrl}/api/v2/product/${alt}.json?fields=${fieldsParam}&lc=${language}`;
        const altResponse = await fetchOpenFoodFacts(altUrl, {
          authenticatedUserId,
          providerId,
          sessionCookie,
        });
        if (altResponse.ok) {
          const altData = (await altResponse.json()) as {
            status: number;
            status_verbose: string;
            product?: OffProduct;
            [key: string]: unknown;
          };
          if (altData.status === 1 && altData.product) {
            data = altData;
          }
        }
      }
    }

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
function normalizeAllergenTags(tags: string[] | undefined): string[] | null {
  if (!tags || tags.length === 0) return null;
  return tags.map((t) => t.replace(/^[a-z]{2}:/, ''));
}

// Derives the serving unit OFF explicitly assigns to a product (e.g. 'ml' for
// a beverage, 'g' for a solid). This never infers liquid-vs-solid from the
// nutrient basis or any heuristic — it only reads units OFF itself declares,
// falling back to 'g' (today's behavior) when OFF gives no signal. This keeps
// solids from ever being mislabeled as ml and vice versa.
//
// Deliberately does NOT consult `nutrition_data_per`: that field records what
// the contributor selected in the data-entry form (often left at its default
// of "100g" even for liquids), not the product's physical unit.
function deriveOffServingUnit(product: OffProduct): string {
  if (product.serving_quantity_unit) {
    return normalizeServingUnit(product.serving_quantity_unit);
  }
  if (product.product_quantity_unit) {
    return normalizeServingUnit(product.product_quantity_unit);
  }
  // Last resort: pull a unit token out of the free-text serving_size string,
  // e.g. "1 portion (330 ml)" or "250 ml".
  if (typeof product.serving_size === 'string') {
    const match = product.serving_size.match(
      /([\d.,]+)\s*(ml|milliliters?|millilitres?|g|grams?|kg|l|liters?|litres?|oz|ounces?)\b/i
    );
    if (match) {
      return normalizeServingUnit(match[2]);
    }
  }
  return 'g';
}

// Metric units that must never become a household variant — they would just
// duplicate the metric default (e.g. "28 g (28 g)").
const METRIC_SERVING_UNITS = new Set(['g', 'ml', 'kg', 'l', 'oz']);

// Extracts a household serving (e.g. "2 cookies") from OFF's free-text
// serving_size string when it also states the equivalent metric weight/volume
// in parentheses, e.g. "2 cookies (28 g)" or "1 cup (240 ml)". The parenthetical
// is what confirms the household count maps to the same physical serving we
// already computed from serving_quantity, so the household variant can safely
// reuse the metric variant's nutrient values without any rescaling.
//
// Returns null when there is no such household descriptor (e.g. "28 g",
// "250 ml") or when the descriptor is itself a metric unit, so a household
// variant is only ever emitted for genuine piece/portion counts.
function parseOffHouseholdServing(
  servingSize: string | undefined
): { size: number; unit: string } | null {
  if (typeof servingSize !== 'string') return null;
  const match = servingSize.match(
    /^\s*([\d.,]+)\s+([^\d(][^(]*?)\s*\([^)]*\)\s*$/
  );
  if (!match) return null;
  const size = parseFloat(match[1].replace(',', '.'));
  const unit = normalizeServingUnit(match[2]);
  if (!Number.isFinite(size) || size <= 0 || !unit) return null;
  if (METRIC_SERVING_UNITS.has(unit)) return null;
  return { size, unit };
}

// OpenFoodFacts stores every nutrient's `*_100g` value in grams but exposes the
// label's display unit on `*_unit`. Convert grams to that unit (e.g. magnesium
// 0.018 g -> 18 mg) so matched custom nutrients carry sensible values, then
// scale to the variant's serving. Keyed by normalized nutrient name.
const GRAMS_TO_UNIT: Record<string, number> = {
  g: 1,
  mg: 1000,
  µg: 1000000,
  mcg: 1000000,
  ug: 1000000,
};

// OFF ships several `*_100g` fields that are scores/estimates, not nutrients.
// They clutter the "add as alias" list and should never be offered, so skip them.
const OFF_NON_NUTRIENT_KEYS = new Set([
  'nova-group',
  'nutrition-score-fr',
  'nutrition-score-uk',
  'fruits-vegetables-nuts',
  'fruits-vegetables-nuts-estimate',
  'fruits-vegetables-nuts-estimate-from-ingredients',
  'fruits-vegetables-legumes-estimate-from-ingredients',
  'carbon-footprint',
  'carbon-footprint-from-known-ingredients',
]);

function parseOffNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Returns true when OFF declares nutrition that the core mapper can use. */
function hasUsableOffCoreNutrition(product: OffProduct): boolean {
  if (!isRecord(product.nutriments)) return false;

  if (
    OFF_CORE_NUTRIENT_100G_KEYS.some(
      (key) => parseOffNumber(product.nutriments?.[key]) !== null
    )
  ) {
    return true;
  }

  const servingQuantity = parseOffNumber(product.serving_quantity);
  return (
    servingQuantity !== null &&
    servingQuantity > 0 &&
    OFF_CORE_NUTRIENT_SERVING_KEYS.some(
      (key) => parseOffNumber(product.nutriments?.[key]) !== null
    )
  );
}

function getOffNutrient100g(
  nutriments: Record<string, unknown>,
  baseKey: string,
  declaredServingQuantity: number | null
): number {
  const direct100g = parseOffNumber(nutriments[`${baseKey}_100g`]);
  if (direct100g !== null) return direct100g;

  if (declaredServingQuantity !== null && declaredServingQuantity > 0) {
    const servingVal = parseOffNumber(nutriments[`${baseKey}_serving`]);
    if (servingVal !== null) {
      return (servingVal / declaredServingQuantity) * 100;
    }
  }

  return 0;
}

function getOffEnergyKcal100g(
  nutriments: Record<string, unknown>,
  declaredServingQuantity: number | null
): number {
  const kcal100g = getOffNutrient100g(
    nutriments,
    'energy-kcal',
    declaredServingQuantity
  );
  if (kcal100g > 0) return kcal100g;

  const kj100g = getOffNutrient100g(
    nutriments,
    'energy-kj',
    declaredServingQuantity
  );
  if (kj100g > 0) return kj100g / 4.184;

  // OFF's legacy `energy_100g` field stores kJ (not kcal), regardless of
  // what `energy_unit` says — that field records what the contributor typed
  // in the data-entry form, not the unit of the stored _100g value.
  const energy100g = parseOffNumber(nutriments['energy_100g']);
  if (energy100g !== null && energy100g > 0) {
    return energy100g / 4.184;
  }

  if (declaredServingQuantity !== null && declaredServingQuantity > 0) {
    // Same rule applies to `energy_serving`: always kJ.
    const energyServing = parseOffNumber(nutriments['energy_serving']);
    if (energyServing !== null && energyServing > 0) {
      const per100g = (energyServing / declaredServingQuantity) * 100;
      return per100g / 4.184;
    }
  }

  return 0;
}

function extractOffProviderNutrients(
  nutriments: Record<string, unknown>,
  scale: number,
  declaredServingQuantity: number | null
): { values: Record<string, number>; units: Record<string, string> } {
  const values: Record<string, number> = {};
  const units: Record<string, string> = {};
  const processedBases = new Set<string>();

  for (const key of Object.keys(nutriments)) {
    const is100g = key.endsWith('_100g');
    const isServing = key.endsWith('_serving');
    if (!is100g && !isServing) continue;

    const base = is100g
      ? key.slice(0, -'_100g'.length)
      : key.slice(0, -'_serving'.length);

    if (processedBases.has(base) || OFF_NON_NUTRIENT_KEYS.has(base)) continue;

    let value = parseOffNumber(nutriments[`${base}_100g`]);
    if (
      value === null &&
      isServing &&
      declaredServingQuantity !== null &&
      declaredServingQuantity > 0
    ) {
      const servingVal = parseOffNumber(nutriments[`${base}_serving`]);
      if (servingVal !== null) {
        value = (servingVal / declaredServingQuantity) * 100;
      }
    }
    if (value === null) continue;

    processedBases.add(base);

    const unit = String(nutriments[`${base}_unit`] || '').toLowerCase();
    const factor = GRAMS_TO_UNIT[unit] ?? 1;
    const name = base.replace(/-/g, ' ').trim();
    if (!name) continue;

    values[name] = Math.round(value * factor * scale * 1000) / 1000;
    if (unit) units[name] = normalizeNutrientUnit(unit);
  }
  return { values, units };
}

function mapOpenFoodFactsProduct(
  product: OffProduct,
  { autoScale = true, language = 'en' } = {}
) {
  const nutriments = product.nutriments || {};
  const declaredServingQuantity =
    product.serving_quantity && product.serving_quantity > 0
      ? product.serving_quantity
      : null;
  const servingQuantity = declaredServingQuantity ?? 100;
  const servingSize = autoScale ? servingQuantity : 100;
  const scale = servingSize / 100;
  const defaultVariant = {
    serving_size: servingSize,
    serving_unit: deriveOffServingUnit(product),
    calories: Math.round(
      getOffEnergyKcal100g(nutriments, declaredServingQuantity) * scale
    ),
    protein:
      Math.round(
        getOffNutrient100g(nutriments, 'proteins', declaredServingQuantity) *
          scale *
          10
      ) / 10,
    carbs:
      Math.round(
        getOffNutrient100g(
          nutriments,
          'carbohydrates',
          declaredServingQuantity
        ) *
          scale *
          10
      ) / 10,
    fat:
      Math.round(
        getOffNutrient100g(nutriments, 'fat', declaredServingQuantity) *
          scale *
          10
      ) / 10,
    saturated_fat:
      Math.round(
        getOffNutrient100g(
          nutriments,
          'saturated-fat',
          declaredServingQuantity
        ) *
          scale *
          10
      ) / 10,
    sodium: Math.round(
      getOffNutrient100g(nutriments, 'sodium', declaredServingQuantity) *
        1000 *
        scale
    ),
    dietary_fiber:
      Math.round(
        getOffNutrient100g(nutriments, 'fiber', declaredServingQuantity) *
          scale *
          10
      ) / 10,
    sugars:
      Math.round(
        getOffNutrient100g(nutriments, 'sugars', declaredServingQuantity) *
          scale *
          10
      ) / 10,
    polyunsaturated_fat:
      Math.round(
        getOffNutrient100g(
          nutriments,
          'polyunsaturated-fat',
          declaredServingQuantity
        ) *
          scale *
          10
      ) / 10,
    monounsaturated_fat:
      Math.round(
        getOffNutrient100g(
          nutriments,
          'monounsaturated-fat',
          declaredServingQuantity
        ) *
          scale *
          10
      ) / 10,
    trans_fat:
      Math.round(
        getOffNutrient100g(nutriments, 'trans-fat', declaredServingQuantity) *
          scale *
          10
      ) / 10,
    cholesterol: Math.round(
      getOffNutrient100g(nutriments, 'cholesterol', declaredServingQuantity) *
        1000 *
        scale
    ),
    potassium: Math.round(
      getOffNutrient100g(nutriments, 'potassium', declaredServingQuantity) *
        1000 *
        scale
    ),
    vitamin_a: Math.round(
      getOffNutrient100g(nutriments, 'vitamin-a', declaredServingQuantity) *
        1000000 *
        scale
    ),
    vitamin_c:
      Math.round(
        getOffNutrient100g(nutriments, 'vitamin-c', declaredServingQuantity) *
          1000 *
          scale *
          10
      ) / 10,
    calcium: Math.round(
      getOffNutrient100g(nutriments, 'calcium', declaredServingQuantity) *
        1000 *
        scale
    ),
    iron:
      Math.round(
        getOffNutrient100g(nutriments, 'iron', declaredServingQuantity) *
          1000 *
          scale *
          10
      ) / 10,
    ...(() => {
      const extracted = extractOffProviderNutrients(
        nutriments,
        scale,
        declaredServingQuantity
      );
      return {
        provider_nutrients: extracted.values,
        provider_nutrient_units: extracted.units,
      };
    })(),
    is_default: true,
  };
  // Language fallback priority:
  // 1. product_name_${language}
  // 2. product_name_en
  // 3. product_name (default/original)
  const name =
    product[`product_name_${language}`] ||
    product.product_name_en ||
    product.product_name;
  // The metric serving (e.g. 28 g) stays the default; nothing downstream that
  // keys off is_default changes.
  const metricVariant = {
    ...defaultVariant,
    allergens: normalizeAllergenTags(product.allergens_tags),
    traces: normalizeAllergenTags(product.traces_tags),
  };
  // If OFF states an equivalent household serving (e.g. "2 cookies (28 g)"),
  // surface it as a second, non-default variant so users can log by piece.
  // It describes the SAME physical serving as the metric variant, so it reuses
  // the exact same nutrient values — no rescaling. Only OFF's serving_unit is
  // stored, mirroring how FatSecret/USDA store household units.
  const household = parseOffHouseholdServing(product.serving_size);
  const householdVariant =
    household &&
    !(
      household.size === metricVariant.serving_size &&
      household.unit === metricVariant.serving_unit
    )
      ? {
          ...metricVariant,
          serving_size: household.size,
          serving_unit: household.unit,
          is_default: false,
        }
      : null;
  return {
    name,
    brand: product.brands?.split(',')[0]?.trim() || '',
    barcode: normalizeBarcode(product.code),
    provider_external_id: product.code,
    provider_type: 'openfoodfacts',
    is_custom: false,
    // Hotlinked in search results; localized on import (see models/food.ts).
    image_url: product.image_front_url || product.image_url || null,
    default_variant: metricVariant,
    ...(householdVariant
      ? { variants: [metricVariant, householdVariant] }
      : {}),
  };
}
export { searchOpenFoodFacts };
export { searchOpenFoodFactsByBarcodeFields };
export { mapOpenFoodFactsProduct };
export default {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
  mapOpenFoodFactsProduct,
};
