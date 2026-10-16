import { apiFetch } from './apiClient';
import type {
  AssignShoeResponse,
  CreateShoeBody,
  ShoeListResponse,
  ShoeResponse,
  ShoeStatus,
  UpdateShoeBody,
} from '@workspace/shared';

const SERVICE = 'Shoes API';

export const fetchShoes = (status?: ShoeStatus): Promise<ShoeListResponse> =>
  apiFetch<ShoeListResponse>({
    endpoint: status ? `/api/v2/shoes?status=${status}` : '/api/v2/shoes',
    serviceName: SERVICE,
    operation: 'fetch shoes',
  });

export const createShoe = (data: CreateShoeBody): Promise<ShoeResponse> =>
  apiFetch<ShoeResponse>({
    endpoint: '/api/v2/shoes',
    method: 'POST',
    body: data,
    serviceName: SERVICE,
    operation: 'create shoe',
  });

export const updateShoe = (
  id: string,
  data: UpdateShoeBody
): Promise<ShoeResponse> =>
  apiFetch<ShoeResponse>({
    endpoint: `/api/v2/shoes/${encodeURIComponent(id)}`,
    method: 'PUT',
    body: data,
    serviceName: SERVICE,
    operation: 'update shoe',
  });

export const deleteShoe = (id: string): Promise<{ success: boolean }> =>
  apiFetch<{ success: boolean }>({
    endpoint: `/api/v2/shoes/${encodeURIComponent(id)}`,
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'delete shoe',
  });

/** Links a diary entry to a shoe, or clears the link with `null`. */
export const assignShoeToExerciseEntry = (
  exerciseEntryId: string,
  shoeId: string | null
): Promise<AssignShoeResponse> =>
  apiFetch<AssignShoeResponse>({
    endpoint: `/api/v2/shoes/assignments/${encodeURIComponent(exerciseEntryId)}`,
    method: 'PUT',
    body: { shoe_id: shoeId },
    serviceName: SERVICE,
    operation: 'assign shoe to exercise entry',
  });
