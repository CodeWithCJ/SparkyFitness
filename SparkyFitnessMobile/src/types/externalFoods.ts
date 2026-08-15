export interface ExternalFoodVariant {
  serving_size: number;
  serving_unit: string;
  serving_description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  sodium?: number;
  fiber?: number;
  sugars?: number;
  trans_fat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  cholesterol?: number;
  vitamin_a?: number;
  vitamin_c?: number;
}

export interface ExternalFoodSearchPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

export interface PaginatedExternalFoodSearchResult {
  items: ExternalFoodItem[];
  pagination: ExternalFoodSearchPagination;
}

export interface ExternalFoodItem {
  id: string;
  name: string;
  brand: string | null;
  barcode?: string | null;
  provider_type?: string;
  provider_external_id?: string;
  is_custom?: boolean;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  sodium?: number;
  fiber?: number;
  sugars?: number;
  trans_fat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  cholesterol?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  serving_size: number;
  serving_unit: string;
  serving_description?: string;
  source: string;
  variants?: ExternalFoodVariant[];
  /** Whether the food is verified by the provider (e.g. Yazio verified foods) */
  provider_verified?: boolean;
  /** Provider thumbnail URL; absolute, not yet imported into /uploads. */
  image_url?: string | null;
  /** Full-size counterpart of `image_url`, preferred when localizing on save. */
  image_source_url?: string | null;
  /** Present once the food has been imported and localized server-side. */
  images?: string[] | null;
}
