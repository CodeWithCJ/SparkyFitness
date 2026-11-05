import { apiFetch } from './apiClient';
import type {
  GetPlateInventoryResponse,
  ListGymsResponse,
  PlateInventoryResponse,
  SavePlateInventoryBody,
} from '@workspace/shared';

const SERVICE = 'Plate Inventory API';

export const fetchPlateInventory = (): Promise<GetPlateInventoryResponse> =>
  apiFetch<GetPlateInventoryResponse>({
    endpoint: '/api/v2/plate-inventory',
    serviceName: SERVICE,
    operation: 'fetch plate inventory',
  });

export const savePlateInventory = (
  data: SavePlateInventoryBody
): Promise<PlateInventoryResponse> =>
  apiFetch<PlateInventoryResponse>({
    endpoint: '/api/v2/plate-inventory',
    method: 'PUT',
    body: data,
    serviceName: SERVICE,
    operation: 'save plate inventory',
  });

export const deletePlateInventory = (): Promise<{ success: boolean }> =>
  apiFetch<{ success: boolean }>({
    endpoint: '/api/v2/plate-inventory',
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'reset plate inventory',
  });

/** Every gym profile, active first. Servers before gym profiles 404/500. */
export const fetchGyms = (): Promise<ListGymsResponse> =>
  apiFetch<ListGymsResponse>({
    endpoint: '/api/v2/plate-inventory/gyms',
    serviceName: SERVICE,
    operation: 'fetch gyms',
  });

export const createGym = (
  data: SavePlateInventoryBody
): Promise<PlateInventoryResponse> =>
  apiFetch<PlateInventoryResponse>({
    endpoint: '/api/v2/plate-inventory/gyms',
    method: 'POST',
    body: data,
    serviceName: SERVICE,
    operation: 'create gym',
  });

export const activateGym = (id: string): Promise<PlateInventoryResponse> =>
  apiFetch<PlateInventoryResponse>({
    endpoint: `/api/v2/plate-inventory/gyms/${encodeURIComponent(id)}/activate`,
    method: 'PUT',
    serviceName: SERVICE,
    operation: 'switch gym',
  });

export const deleteGym = (id: string): Promise<{ success: boolean }> =>
  apiFetch<{ success: boolean }>({
    endpoint: `/api/v2/plate-inventory/gyms/${encodeURIComponent(id)}`,
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'delete gym',
  });
