import { api } from '@/api/api';
import type {
  GetPlateInventoryResponse,
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
