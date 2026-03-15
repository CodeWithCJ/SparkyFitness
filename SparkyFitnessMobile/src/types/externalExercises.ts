export interface ExternalExerciseItem {
  id: string;
  name: string;
  category: string | null;
  calories_per_hour: number;
  source: string;
  equipment: string[];
  primary_muscles: string[];
}

export interface ExternalExerciseSearchPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

export interface PaginatedExternalExerciseSearchResult {
  items: ExternalExerciseItem[];
  pagination: ExternalExerciseSearchPagination;
}
