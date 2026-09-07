export interface FoodDefaultVariant {
  id?: string;
  /**
   * Provenance of the variant's nutrition. `ai_estimate` marks values a model
   * produced — a photo estimate or an AI unit conversion — so the UI can say so
   * rather than presenting a guess like verified data.
   */
  source?: 'manual' | 'ai_estimate' | 'imported';
  ai_confidence?: 'high' | 'medium' | 'low' | null;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  is_default?: boolean;
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
}

export interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  barcode?: string | null;
  is_custom: boolean;
  user_id?: string;
  shared_with_public?: boolean;
  provider_type?: string | null;
  provider_external_id?: string | null;
  provider_verified?: boolean;
  is_quick_food?: boolean;
  // Present only on items returned by the favorites endpoint.
  favorited_at?: string;
  // Ordered image paths; index 0 is the thumbnail. Locally uploaded images are
  // server-relative (`/uploads/foods/<id>/...`); provider images that could not
  // be downloaded stay absolute and are hotlinked.
  images?: string[] | null;
  /**
   * Owner-authored markdown reference note. Shown read-only when logging this
   * food; only the owner can edit it.
   */
  notes?: string | null;
  default_variant: FoodDefaultVariant;
}

export interface TopFoodItem extends FoodItem {
  usage_count: number;
}

export interface FoodsResponse {
  recentFoods: FoodItem[];
  topFoods: TopFoodItem[];
}

export type FavoriteType = 'food' | 'meal';

export interface FavoritesResponse {
  favoriteFoods: FoodItem[];
  favoriteMeals: import('./meals').Meal[];
}

export interface ToggleFavoriteResponse {
  type: FavoriteType;
  id: string;
  is_favorite: boolean;
}

export interface FoodSearchResponse {
  foods: FoodItem[];
  totalCount: number;
}

export interface FoodSearchPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

export interface PaginatedFoodsResponse {
  foods: FoodItem[];
  pagination: FoodSearchPagination;
}

export interface FoodVariantDetail {
  id: string;
  food_id: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  is_default?: boolean;
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
  // AI-Assisted Unit Conversions provenance — server always returns these on
  // saved variants. Forwarded by `localVariantToUnitVariant` so the sheet's
  // source check recognizes AI variants and doesn't treat them as regular
  // math conversion donors (which would show green checkmarks for sibling
  // units when it shouldn't).
  source?: 'manual' | 'ai_estimate' | 'imported';
  ai_confidence?: 'high' | 'medium' | 'low' | null;
}
