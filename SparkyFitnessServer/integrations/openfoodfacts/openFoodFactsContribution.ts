import pkg from '../../package.json' with { type: 'json' };
import {
  assertSecureOpenFoodFactsWriteBaseUrl,
  openFoodFactsStagingAuthHeaders,
} from './openFoodFactsAuth.js';

export interface OpenFoodFactsAttribution {
  appName: string;
  appVersion: string;
  appUuid: string;
}

export interface OpenFoodFactsContributionProduct {
  barcode: string;
  name: string;
  brand?: string | null;
  language: string;
  servingSize: number;
  servingUnit: 'g' | 'ml';
  nutrients: Record<string, number | null | undefined>;
}

type OpenFoodFactsNutritionBasis = 'serving' | '100g' | '100ml';

interface OpenFoodFactsProductFormProduct extends OpenFoodFactsContributionProduct {
  nutritionDataPer: OpenFoodFactsNutritionBasis;
}

interface RefreshedOpenFoodFactsAuthentication {
  baseUrl: string;
  session: string;
}

interface ProductSubmissionOptions {
  baseUrl: string;
  session: string;
  product: OpenFoodFactsContributionProduct;
  attribution: OpenFoodFactsAttribution;
  beforeWrite?: () => Promise<void>;
  executeProductRead?: OpenFoodFactsProductReadExecutor;
  refreshAuthentication?: () => Promise<RefreshedOpenFoodFactsAuthentication>;
}

export type OpenFoodFactsProductReadExecutor = (
  operation: () => Promise<Response>
) => Promise<Response>;

interface OpenFoodFactsWriteResponse {
  status?: number | string;
  status_verbose?: string;
  error?: string;
}

interface OpenFoodFactsProductReadResponse {
  status?: number | string;
  product?: {
    nutrition_data_per?: unknown;
  };
}

interface NutrientMapping {
  source: string;
  target: string;
  unit: string;
}

const USER_AGENT = `${pkg.name}/${pkg.version} (https://github.com/CodeWithCJ/SparkyFitness)`;
const WRITE_REQUEST_TIMEOUT_MS = 30_000;

const NUTRIENT_MAPPINGS: NutrientMapping[] = [
  { source: 'calories', target: 'energy-kcal', unit: 'kcal' },
  { source: 'fat', target: 'fat', unit: 'g' },
  { source: 'saturated_fat', target: 'saturated-fat', unit: 'g' },
  { source: 'trans_fat', target: 'trans-fat', unit: 'g' },
  { source: 'cholesterol', target: 'cholesterol', unit: 'mg' },
  { source: 'carbs', target: 'carbohydrates', unit: 'g' },
  { source: 'sugars', target: 'sugars', unit: 'g' },
  { source: 'dietary_fiber', target: 'fiber', unit: 'g' },
  { source: 'protein', target: 'proteins', unit: 'g' },
  { source: 'sodium', target: 'sodium', unit: 'mg' },
  { source: 'potassium', target: 'potassium', unit: 'mg' },
  { source: 'vitamin_a', target: 'vitamin-a', unit: 'µg' },
  { source: 'vitamin_c', target: 'vitamin-c', unit: 'mg' },
  { source: 'calcium', target: 'calcium', unit: 'mg' },
  { source: 'iron', target: 'iron', unit: 'mg' },
];

export class OpenFoodFactsContributionError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'OpenFoodFactsContributionError';
    this.statusCode = statusCode;
  }
}

export class OpenFoodFactsAuthenticationError extends OpenFoodFactsContributionError {
  readonly reason = 'authentication' as const;

  constructor(message: string) {
    super(message, 401);
    this.name = 'OpenFoodFactsAuthenticationError';
  }
}

export function isOpenFoodFactsAuthenticationRejection(
  error: unknown
): boolean {
  return (
    error instanceof OpenFoodFactsAuthenticationError ||
    (typeof error === 'object' &&
      error !== null &&
      'reason' in error &&
      error.reason === 'authentication')
  );
}

async function withWriteDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    WRITE_REQUEST_TIMEOUT_MS
  );
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new OpenFoodFactsContributionError(
        'Open Food Facts write request timed out.'
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function contributionLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) {
    throw new OpenFoodFactsContributionError(
      'A two-letter Open Food Facts product language is required.',
      400
    );
  }
  return normalized;
}

function appendAttribution(
  form: URLSearchParams,
  attribution: OpenFoodFactsAttribution
): void {
  form.set('app_name', attribution.appName);
  form.set('app_version', attribution.appVersion);
  form.set('app_uuid', attribution.appUuid);
}

export function buildOpenFoodFactsProductForm(
  product: OpenFoodFactsProductFormProduct,
  attribution: OpenFoodFactsAttribution
): URLSearchParams {
  const language = contributionLanguage(product.language);
  const form = new URLSearchParams({
    code: product.barcode,
    lang: language,
    lc: language,
    [`product_name_${language}`]: product.name,
    nutrition_data_per: product.nutritionDataPer,
    serving_size: `${product.servingSize} ${product.servingUnit}`,
    comment: 'Contributed from SparkyFitness',
  });

  if (product.brand?.trim()) {
    form.set('add_brands', product.brand.trim());
  }

  for (const mapping of NUTRIENT_MAPPINGS) {
    const value = product.nutrients[mapping.source];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    form.set(`nutriment_${mapping.target}`, String(value));
    form.set(`nutriment_${mapping.target}_unit`, mapping.unit);
  }

  appendAttribution(form, attribution);
  return form;
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function rejectionMessage(
  response: OpenFoodFactsWriteResponse | null,
  fallback: string
): string {
  return response?.status_verbose || response?.error || fallback;
}

function normalizedStatusVerbose(
  response: OpenFoodFactsWriteResponse | null
): string {
  return response?.status_verbose?.trim().toLowerCase() ?? '';
}

function hasZeroStatus(response: OpenFoodFactsWriteResponse | null): boolean {
  return response?.status === 0 || response?.status === '0';
}

function hasSuccessStatus(
  response: OpenFoodFactsWriteResponse | null
): boolean {
  return response?.status === 1 || response?.status === '1';
}

async function submitPreparedOpenFoodFactsProduct(options: {
  baseUrl: string;
  session: string;
  form: URLSearchParams;
  beforeWrite?: () => Promise<void>;
}): Promise<{ statusVerbose: string }> {
  await options.beforeWrite?.();

  return withWriteDeadline(async (signal) => {
    const response = await fetch(
      `${options.baseUrl}/cgi/product_jqm_multilingual.pl`,
      {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `session=${options.session}`,
          ...openFoodFactsStagingAuthHeaders(options.baseUrl),
        },
        body: options.form.toString(),
        redirect: 'manual',
        signal,
      }
    );
    const result =
      await parseJsonResponse<OpenFoodFactsWriteResponse>(response);

    const statusVerbose = normalizedStatusVerbose(result);
    if (
      response.ok &&
      hasZeroStatus(result) &&
      statusVerbose === 'not modified'
    ) {
      return { statusVerbose: result?.status_verbose || 'not modified' };
    }
    if (hasZeroStatus(result) && statusVerbose === 'no user credentials') {
      throw new OpenFoodFactsAuthenticationError(
        'Open Food Facts rejected the expired authentication session.'
      );
    }

    if (!response.ok || !hasSuccessStatus(result)) {
      throw new OpenFoodFactsContributionError(
        `Open Food Facts rejected the product: ${rejectionMessage(
          result,
          `HTTP ${response.status}`
        )}`
      );
    }

    return { statusVerbose: result?.status_verbose || 'fields saved' };
  });
}

async function getExistingNutritionBasis(options: {
  baseUrl: string;
  session: string;
  barcode: string;
  executeProductRead?: OpenFoodFactsProductReadExecutor;
}): Promise<OpenFoodFactsNutritionBasis | 'new' | 'unknown'> {
  return withWriteDeadline(async (signal) => {
    const fields = encodeURIComponent('nutrition_data_per');
    const readProduct = () =>
      fetch(
        `${options.baseUrl}/api/v2/product/${encodeURIComponent(
          options.barcode
        )}.json?fields=${fields}`,
        {
          method: 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            Cookie: `session=${options.session}`,
            ...openFoodFactsStagingAuthHeaders(options.baseUrl),
          },
          redirect: 'manual',
          signal,
        }
      );
    const response = options.executeProductRead
      ? await options.executeProductRead(readProduct)
      : await readProduct();
    const result =
      await parseJsonResponse<OpenFoodFactsProductReadResponse>(response);

    if (
      response.status === 404 ||
      result?.status === 0 ||
      result?.status === '0'
    ) {
      return 'new';
    }
    if (!response.ok || !result || !result.product) {
      throw new OpenFoodFactsContributionError(
        `Open Food Facts product lookup failed (HTTP ${response.status}).`
      );
    }

    const basis = result.product.nutrition_data_per;
    return basis === 'serving' || basis === '100g' || basis === '100ml'
      ? basis
      : 'unknown';
  });
}

function roundForOpenFoodFacts(value: number): number {
  return Number(value.toFixed(6));
}

function prepareProductForExistingBasis(
  product: OpenFoodFactsContributionProduct,
  existingBasis: OpenFoodFactsNutritionBasis | 'new' | 'unknown'
): OpenFoodFactsProductFormProduct {
  if (existingBasis === 'unknown') {
    throw new OpenFoodFactsContributionError(
      'The existing Open Food Facts product has an unknown nutrition basis; automatic upload was refused.',
      400
    );
  }

  const nutritionDataPer =
    existingBasis === 'new' || existingBasis === 'serving'
      ? ('serving' as const)
      : existingBasis;
  if (nutritionDataPer === 'serving') {
    return { ...product, nutritionDataPer };
  }

  const compatibleHundredUnitBasis =
    product.servingUnit === 'g' ? '100g' : '100ml';
  if (nutritionDataPer !== compatibleHundredUnitBasis) {
    throw new OpenFoodFactsContributionError(
      `The existing Open Food Facts ${nutritionDataPer} nutrition basis is incompatible with a ${product.servingUnit} serving; automatic upload was refused.`,
      400
    );
  }

  const factor = 100 / product.servingSize;
  const nutrients: Record<string, number | null | undefined> = {};
  for (const [name, value] of Object.entries(product.nutrients)) {
    nutrients[name] =
      typeof value === 'number' && Number.isFinite(value)
        ? roundForOpenFoodFacts(value * factor)
        : value;
  }
  return { ...product, nutritionDataPer, nutrients };
}

export async function submitOpenFoodFactsProduct(
  options: ProductSubmissionOptions
): Promise<{ statusVerbose: string }> {
  const baseUrl = assertSecureOpenFoodFactsWriteBaseUrl(options.baseUrl);
  const existingBasis = await getExistingNutritionBasis({
    baseUrl,
    session: options.session,
    barcode: options.product.barcode,
    executeProductRead: options.executeProductRead,
  });
  const product = prepareProductForExistingBasis(
    options.product,
    existingBasis
  );
  const form = buildOpenFoodFactsProductForm(product, options.attribution);
  try {
    return await submitPreparedOpenFoodFactsProduct({
      baseUrl,
      session: options.session,
      form,
      beforeWrite: options.beforeWrite,
    });
  } catch (error) {
    if (
      !isOpenFoodFactsAuthenticationRejection(error) ||
      !options.refreshAuthentication
    ) {
      throw error;
    }

    const refreshed = await options.refreshAuthentication();
    const refreshedBaseUrl = assertSecureOpenFoodFactsWriteBaseUrl(
      refreshed.baseUrl
    );
    if (refreshedBaseUrl !== baseUrl) {
      throw new OpenFoodFactsContributionError(
        'The Open Food Facts contribution target changed before the authenticated retry.',
        409
      );
    }

    // The form and existing nutrition basis are intentionally reused. Only
    // the expired session is replaced, avoiding a second product read.
    return submitPreparedOpenFoodFactsProduct({
      baseUrl,
      session: refreshed.session,
      form,
      beforeWrite: options.beforeWrite,
    });
  }
}
