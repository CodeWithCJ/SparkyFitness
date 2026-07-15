// The wire contract for `/api/exercises/search-external` lives in
// `@workspace/shared` (externalExerciseSearchItemSchema); re-exported here so
// existing import sites keep working.
export type {
  ExternalExerciseSearchItem as ExternalExerciseItem,
  PaginatedExternalExerciseSearchResult,
} from '@workspace/shared';
