import { apiCall } from '@/api/api';

// One provider source (e.g. "garmin", "healthkit") the user has synced entry
// data for, with a per-table breakdown of the row counts.
export interface SyncedSourceSummary {
  source: string;
  totalCount: number;
  byTable: Record<string, number>;
}

export interface DeleteSyncedSourceResponse {
  message: string;
  totalDeleted: number;
  byTable: Record<string, number>;
}

export const getSyncedSources = async (): Promise<SyncedSourceSummary[]> => {
  return apiCall('/synced-data/sources', {
    method: 'GET',
  });
};

export const deleteSyncedSource = async (
  source: string
): Promise<DeleteSyncedSourceResponse> => {
  return apiCall(`/synced-data/sources/${encodeURIComponent(source)}`, {
    method: 'DELETE',
  });
};
