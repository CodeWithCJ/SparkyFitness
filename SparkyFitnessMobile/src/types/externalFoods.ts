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
  source: string;
  variants?: ExternalFoodVariant[];
}
