import { apiFetch } from './apiClient';

/** Mirrors the `user_custom_nutrients` table shape returned by GET /api/custom-nutrients. */
export interface UserCustomNutrient {
  id: string;
  name: string;
  unit: string;
  /** Alternate names online food providers use; matched on import. */
  aliases?: string[];
}

export interface CustomNutrientInput {
  name: string;
  unit: string;
  aliases: string[];
}

/**
 * Fetches the current user's custom nutrient definitions.
 * GET /api/custom-nutrients
 */
export const fetchCustomNutrients = (): Promise<UserCustomNutrient[]> =>
  apiFetch<UserCustomNutrient[]>({
    endpoint: '/api/custom-nutrients',
    serviceName: 'Custom Nutrients API',
    operation: 'fetch custom nutrients',
  });

/**
 * Creates a custom nutrient.
 * POST /api/custom-nutrients
 */
export const createCustomNutrient = (
  data: CustomNutrientInput
): Promise<UserCustomNutrient> =>
  apiFetch<UserCustomNutrient>({
    endpoint: '/api/custom-nutrients',
    serviceName: 'Custom Nutrients API',
    operation: 'create custom nutrient',
    method: 'POST',
    body: data,
  });

/**
 * Updates a custom nutrient's name, unit and aliases.
 * PUT /api/custom-nutrients/:id
 */
export const updateCustomNutrient = (
  id: string,
  data: CustomNutrientInput
): Promise<UserCustomNutrient> =>
  apiFetch<UserCustomNutrient>({
    endpoint: `/api/custom-nutrients/${id}`,
    serviceName: 'Custom Nutrients API',
    operation: 'update custom nutrient',
    method: 'PUT',
    body: data,
  });

/**
 * Deletes a custom nutrient. With `deleteAllHistory` the server also removes it
 * from past goals and diary entries.
 * DELETE /api/custom-nutrients/:id
 */
export const deleteCustomNutrient = (
  id: string,
  deleteAllHistory: boolean
): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/custom-nutrients/${id}?deleteAllHistory=${deleteAllHistory}`,
    serviceName: 'Custom Nutrients API',
    operation: 'delete custom nutrient',
    method: 'DELETE',
  });

/** One requested catalog nutrient and where its amount is stored. */
export interface ResolvedCatalogNutrient {
  catalogId: string;
  /** The custom nutrient's actual name, which can pre-date the catalog. */
  name: string;
  /** Set when the nutrient is a built-in column rather than a custom one. */
  fixedField?: string;
}

/**
 * Finds or creates the user's custom nutrient for each catalog id.
 * POST /api/custom-nutrients/from-catalog
 */
export const ensureCatalogNutrients = (
  catalogIds: string[]
): Promise<{ resolved: ResolvedCatalogNutrient[] }> =>
  apiFetch<{ resolved: ResolvedCatalogNutrient[] }>({
    endpoint: '/api/custom-nutrients/from-catalog',
    serviceName: 'Custom Nutrients API',
    operation: 'create catalog nutrients',
    method: 'POST',
    body: { catalogIds },
  });
