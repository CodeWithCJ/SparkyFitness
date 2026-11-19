import { apiFetch } from './apiClient';
import { getCacheRow, putCacheRows } from '../../offline/cacheStore';
import {
  CACHE_COLLECTIONS,
  SINGLE_DOCUMENT_KEY,
} from '../../offline/collections';
import { withOfflineFallback } from '../../offline/withOfflineFallback';
import type {
  GetPlateInventoryResponse,
  PlateInventoryResponse,
  SavePlateInventoryBody,
} from '@workspace/shared';

const SERVICE = 'Plate Inventory API';

export const fetchPlateInventory = (): Promise<GetPlateInventoryResponse> =>
  withOfflineFallback<GetPlateInventoryResponse>({
    fetch: () =>
      apiFetch<GetPlateInventoryResponse>({
        endpoint: '/api/v2/plate-inventory',
        serviceName: SERVICE,
        operation: 'fetch plate inventory',
      }),
    store: (db, serverConfigId, value) =>
      putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.plateInventory, [
        { key: SINGLE_DOCUMENT_KEY, payload: value },
      ]),
    read: async (db, serverConfigId) => {
      const row = await getCacheRow(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.plateInventory,
        SINGLE_DOCUMENT_KEY
      );
      return row ? (row.payload as GetPlateInventoryResponse) : null;
    },
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
