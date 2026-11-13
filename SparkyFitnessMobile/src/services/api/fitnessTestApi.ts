import type {
  CreateFitnessTestBody,
  FitnessTestListResponse,
  FitnessTestResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Fitness Test API';

/** The person's fitness tests, newest first. */
export const fetchFitnessTests = (): Promise<FitnessTestListResponse> =>
  apiFetch<FitnessTestListResponse>({
    endpoint: '/api/v2/fitness-tests',
    serviceName: SERVICE,
    operation: 'fetch fitness tests',
  });

/** Saves a test; the server works the result and paces out from the measurements. */
export const createFitnessTest = (
  body: CreateFitnessTestBody
): Promise<FitnessTestResponse> =>
  apiFetch<FitnessTestResponse>({
    endpoint: '/api/v2/fitness-tests',
    serviceName: SERVICE,
    operation: 'save fitness test',
    method: 'POST',
    body,
  });

export const deleteFitnessTest = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/fitness-tests/${id}`,
    serviceName: SERVICE,
    operation: 'delete fitness test',
    method: 'DELETE',
  });
