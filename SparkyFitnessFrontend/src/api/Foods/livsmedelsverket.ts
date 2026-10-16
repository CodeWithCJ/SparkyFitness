import { apiCall } from '../api';
import type {
  LivsmedelsverketBulkImportStatus,
  LivsmedelsverketDeleteLibraryResponse,
} from '@workspace/shared';

export interface TriggerLivsmedelsverketBulkImportParams {
  syncPastEntries?: boolean;
  language?: 'sv' | 'en';
  maxFoods?: number;
}

export async function fetchLivsmedelsverketStatus(): Promise<LivsmedelsverketBulkImportStatus> {
  return apiCall<LivsmedelsverketBulkImportStatus>(
    '/foods/livsmedelsverket/status',
    {
      method: 'GET',
    }
  );
}

export async function triggerLivsmedelsverketBulkImport(
  params: TriggerLivsmedelsverketBulkImportParams
): Promise<{
  message: string;
  status?: LivsmedelsverketBulkImportStatus;
}> {
  return apiCall('/foods/livsmedelsverket/bulk-import', {
    method: 'POST',
    body: {
      syncPastEntries: params.syncPastEntries ?? false,
      language: params.language ?? 'sv',
      maxFoods: params.maxFoods,
    },
  });
}

export async function deleteLivsmedelsverketLibrary(): Promise<LivsmedelsverketDeleteLibraryResponse> {
  return apiCall<LivsmedelsverketDeleteLibraryResponse>(
    '/foods/livsmedelsverket',
    {
      method: 'DELETE',
    }
  );
}
