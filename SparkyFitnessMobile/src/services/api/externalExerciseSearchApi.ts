import { apiFetch } from './apiClient';
import type { Exercise } from '../../types/exercise';
import type { PaginatedExternalExerciseSearchResult } from '../../types/externalExercises';

export async function searchExternalExercises(
  query: string,
  providerType: string,
  providerId: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedExternalExerciseSearchResult> {
  const params = new URLSearchParams({
    query,
    providerType,
    providerId,
    page: String(page),
    pageSize: String(pageSize),
  });

  return apiFetch<PaginatedExternalExerciseSearchResult>({
    endpoint: `/api/exercises/search-external?${params.toString()}`,
    serviceName: 'External Exercise Search',
    operation: 'search external exercises',
  });
}

export async function importExercise(
  source: string,
  externalId: string,
): Promise<Exercise> {
  switch (source) {
    case 'wger':
      return apiFetch<Exercise>({
        endpoint: '/api/exercises/add-external',
        serviceName: 'External Exercise Search',
        operation: 'import wger exercise',
        method: 'POST',
        body: { wgerExerciseId: Number(externalId) },
      });

    case 'free-exercise-db':
      return apiFetch<Exercise>({
        endpoint: '/api/freeexercisedb/add',
        serviceName: 'External Exercise Search',
        operation: 'import Free Exercise DB exercise',
        method: 'POST',
        body: { exerciseId: externalId },
      });

    default:
      throw new Error(`Unsupported exercise source: ${source}`);
  }
}
