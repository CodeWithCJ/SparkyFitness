import { api } from '@/api/api';
import type {
  GetPlateInventoryResponse,
  ListGymsResponse,
  PlateInventoryResponse,
  SavePlateInventoryBody,
} from '@workspace/shared';

export const fetchPlateInventory =
  async (): Promise<GetPlateInventoryResponse> => {
    return api.get('/v2/plate-inventory');
  };

export const savePlateInventory = async (
  data: SavePlateInventoryBody
): Promise<PlateInventoryResponse> => {
  return api.put('/v2/plate-inventory', { body: data });
};

export const deletePlateInventory = async (): Promise<{ success: boolean }> => {
  return api.delete('/v2/plate-inventory');
};

/** The active gym without an error toast: callers treat a failure as none. */
export const fetchActiveGymQuietly =
  async (): Promise<GetPlateInventoryResponse> => {
    return api.get('/v2/plate-inventory', { suppressErrorToast: true });
  };

// Quiet: a server from before gym profiles has no such route, and the gym
// controls just stay hidden.
export const fetchGyms = async (): Promise<ListGymsResponse> => {
  return api.get('/v2/plate-inventory/gyms', { suppressErrorToast: true });
};

export const createGym = async (
  data: SavePlateInventoryBody
): Promise<PlateInventoryResponse> => {
  return api.post('/v2/plate-inventory/gyms', { body: data });
};

export const activateGym = async (
  id: string
): Promise<PlateInventoryResponse> => {
  return api.put(`/v2/plate-inventory/gyms/${encodeURIComponent(id)}/activate`);
};

export const deleteGym = async (id: string): Promise<{ success: boolean }> => {
  return api.delete(`/v2/plate-inventory/gyms/${encodeURIComponent(id)}`);
};
