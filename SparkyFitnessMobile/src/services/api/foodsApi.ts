import { apiFetch } from './apiClient';
import { postPayloadWithImages } from './imageUploadClient';
import type { ImageUploadArgs } from '../../utils/pickerImages';
import {
  FoodItem,
  FoodsResponse,
  FoodSearchResponse,
  FoodVariantDetail,
  PaginatedFoodsResponse,
} from '../../types/foods';

/**
 * Fetches the list of recent and top foods.
 */
export const fetchFoods = async (): Promise<FoodsResponse> => {
  return apiFetch<FoodsResponse>({
    endpoint: '/api/foods',
    serviceName: 'Foods API',
    operation: 'fetch foods',
  });
};

export interface FetchFoodsPageOptions {
  searchTerm?: string;
  page?: number;
  itemsPerPage?: number;
  sortBy?: string;
}

export const fetchFoodsPage = async ({
  searchTerm = '',
  page = 1,
  itemsPerPage = 20,
  sortBy = 'name:asc',
}: FetchFoodsPageOptions = {}): Promise<PaginatedFoodsResponse> => {
  const params = new URLSearchParams({
    searchTerm,
    currentPage: String(page),
    itemsPerPage: String(itemsPerPage),
    sortBy,
  });

  const response = await apiFetch<FoodSearchResponse>({
    endpoint: `/api/foods/foods-paginated?${params.toString()}`,
    serviceName: 'Foods API',
    operation: 'fetch foods page',
  });

  return {
    foods: response.foods,
    pagination: {
      page,
      pageSize: itemsPerPage,
      totalCount: response.totalCount,
      hasMore: page * itemsPerPage < response.totalCount,
    },
  };
};

/**
 * Searches foods by name with server-side pagination.
 */
export const searchFoods = async (
  searchTerm: string
): Promise<FoodSearchResponse> => {
  const response = await fetchFoodsPage({
    searchTerm,
    page: 1,
    itemsPerPage: 20,
    sortBy: 'name:asc',
  });
  return {
    foods: response.foods,
    totalCount: response.pagination.totalCount,
  };
};

/**
 * Fetches all variants for a given food item.
 */
export const fetchFoodVariants = async (
  foodId: string
): Promise<FoodVariantDetail[]> => {
  return apiFetch<FoodVariantDetail[]>({
    endpoint: `/api/foods/food-variants?food_id=${foodId}`,
    serviceName: 'Foods API',
    operation: 'fetch food variants',
  });
};

export interface CreateFoodVariantPayload {
  food_id: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber?: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  sodium?: number;
  sugars?: number;
  trans_fat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  cholesterol?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
  // AI-Assisted Unit Conversions provenance — optional; server defaults
  // source to 'manual' and AI fields to null when omitted.
  source?: 'manual' | 'ai_estimate' | 'imported';
  ai_confidence?: 'high' | 'medium' | 'low' | null;
}

/**
 * Creates a new food variant for an existing food.
 */
export const createFoodVariant = async (
  payload: CreateFoodVariantPayload
): Promise<FoodVariantDetail> => {
  return apiFetch<FoodVariantDetail>({
    endpoint: '/api/foods/food-variants',
    serviceName: 'Foods API',
    operation: 'create food variant',
    method: 'POST',
    body: payload,
  });
};

export interface SaveFoodPayload {
  name: string;
  brand: string | null;
  notes?: string | null;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber?: number;
  saturated_fat?: number;
  sodium?: number;
  sugars?: number;
  trans_fat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  cholesterol?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  is_custom?: boolean;
  is_quick_food?: boolean;
  is_default?: boolean;
  barcode?: string | null;
  provider_type?: string | null;
  provider_external_id?: string | null;
  provider_verified?: boolean;
  custom_nutrients?: Record<string, string | number>;
  // Provider photo carried through import. The server's resolveImageInput
  // prefers `images`, then `image_source_url`, then `image_url`, and localizes
  // remote URLs into /uploads after COMMIT. Omitting these is why a provider
  // food silently saves without its picture.
  images?: string[];
  image_url?: string | null;
  image_source_url?: string | null;
}

/**
 * Saves a food item to the database.
 *
 * `images` carries the ordered image list (`__new__<n>` placeholders for
 * uploads); `newImageUris` are the local files those placeholders refer to.
 * With no files the request stays plain JSON, matching web.
 */
export const saveFood = async (
  food: SaveFoodPayload,
  images?: ImageUploadArgs
): Promise<FoodItem> => {
  const sendJson = (payload: Record<string, unknown>) =>
    apiFetch<FoodItem>({
      endpoint: '/api/foods',
      serviceName: 'Foods API',
      operation: 'save food',
      method: 'POST',
      body: payload,
    });

  if (!images) {
    return sendJson(food as unknown as Record<string, unknown>);
  }

  return postPayloadWithImages<FoodItem>({
    endpoint: '/api/foods',
    serviceName: 'Foods API',
    operation: 'save food',
    method: 'POST',
    payload: food as unknown as Record<string, unknown>,
    wrapperField: 'foodData',
    order: images.order,
    newUris: images.newUris,
    sendJson,
  });
};

export interface UpdateFoodVariantPayload {
  food_id: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber?: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  sodium?: number;
  sugars?: number;
  trans_fat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  cholesterol?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
}

/**
 * Updates a food variant's nutrition values.
 */
export const updateFoodVariant = async (
  variantId: string,
  payload: UpdateFoodVariantPayload
): Promise<FoodVariantDetail> => {
  return apiFetch<FoodVariantDetail>({
    endpoint: `/api/foods/food-variants/${variantId}`,
    serviceName: 'Foods API',
    operation: 'update food variant',
    method: 'PUT',
    body: payload,
  });
};

export interface DeleteFoodVariantResponse {
  message?: string;
}

/**
 * Deletes a food variant by ID.
 */
export const deleteFoodVariant = async (
  variantId: string
): Promise<DeleteFoodVariantResponse> => {
  return apiFetch<DeleteFoodVariantResponse>({
    endpoint: `/api/foods/food-variants/${variantId}`,
    serviceName: 'Foods API',
    operation: 'delete food variant',
    method: 'DELETE',
  });
};

// Callers MUST build this payload literally (e.g. `{ barcode: value }` or
// `{ barcode: null }`) — never spread a wider form object, because including
// `barcode` with a stale/undefined value would unintentionally clear or
// overwrite the stored barcode column. The server treats key presence (not
// value truthiness) as the signal to update barcode.
export interface UpdateFoodPayload {
  name?: string;
  brand?: string;
  barcode?: string | null;
  shared_with_public?: boolean;
  /**
   * Key presence is the update signal (see the note above): omit it to leave
   * the stored note alone, send null to clear it.
   */
  notes?: string | null;
}

export interface DeleteFoodResponse {
  message: string;
}

/**
 * Updates a food item's metadata (name, brand, images).
 */
export const updateFood = async (
  foodId: string,
  payload: UpdateFoodPayload,
  images?: ImageUploadArgs
): Promise<FoodItem> => {
  const sendJson = (body: Record<string, unknown>) =>
    apiFetch<FoodItem>({
      endpoint: `/api/foods/${foodId}`,
      serviceName: 'Foods API',
      operation: 'update food',
      method: 'PUT',
      body,
    });

  if (!images) {
    return sendJson(payload as unknown as Record<string, unknown>);
  }

  return postPayloadWithImages<FoodItem>({
    endpoint: `/api/foods/${foodId}`,
    serviceName: 'Foods API',
    operation: 'update food',
    method: 'PUT',
    payload: payload as unknown as Record<string, unknown>,
    wrapperField: 'foodData',
    order: images.order,
    newUris: images.newUris,
    sendJson,
  });
};

/**
 * Rewrites the stored nutrition snapshot on every past diary entry for this
 * food, so already-logged servings reflect the food's current values.
 *
 * Opt-in only. Diary entries hold a snapshot taken at log time, and editing a
 * food deliberately leaves them alone — a past meal is a record of what was
 * eaten, not a live reference. Web asks before calling this; mobile now does
 * too. Omitting `variantId` updates entries across all of the food's variants,
 * matching web.
 */
export const updateFoodEntriesSnapshot = async (
  foodId: string,
  variantId?: string,
  /**
   * `true` forces the food's current photos onto every matching entry,
   * replacing photos the user set on individual diary entries. `false`
   * rewrites nutrition only and leaves every entry's photo untouched.
   */
  syncImages: boolean = true
): Promise<void> => {
  return apiFetch<void>({
    endpoint: '/api/foods/update-snapshot',
    serviceName: 'Foods API',
    operation: 'sync past entries',
    method: 'POST',
    body: variantId
      ? { foodId, variantId, syncImages }
      : { foodId, syncImages },
  });
};

/**
 * Deletes a food item by ID.
 */
export const deleteFood = async (
  foodId: string
): Promise<DeleteFoodResponse> => {
  return apiFetch<DeleteFoodResponse>({
    endpoint: `/api/foods/${foodId}`,
    serviceName: 'Foods API',
    operation: 'delete food',
    method: 'DELETE',
  });
};
