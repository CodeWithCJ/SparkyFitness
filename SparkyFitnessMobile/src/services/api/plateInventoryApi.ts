import { apiFetch } from './apiClient';
import type {
  GetPlateInventoryResponse,
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
