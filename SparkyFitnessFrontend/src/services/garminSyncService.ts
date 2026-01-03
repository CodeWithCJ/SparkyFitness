import { apiCall } from './api';

export interface SyncJob {
  id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  syncType: 'incremental' | 'historical';
  startDate: string;
  endDate: string;
  chunksCompleted: number;
  chunksTotal: number;
  percentComplete: number;
  currentChunkRange: string | null;
  errorMessage: string | null;
  failedChunks: Array<{ start: string; end: string; error: string }>;
  createdAt: string;
  startedAt: string | null;
}

export interface SyncStatus {
  hasActiveJob: boolean;
  job: SyncJob | null;
  lastSuccessfulSync: string | null;
}

export interface StartSyncResponse {
  status: 'started' | 'already_running' | 'up_to_date';
  jobId?: string;
  message: string;
  chunksTotal?: number;
  estimatedMinutes?: number;
}

export async function startIncrementalSync(metricTypes?: string[]): Promise<StartSyncResponse> {
  return apiCall('/integrations/garmin/sync/incremental', {
    method: 'POST',
    body: { metricTypes },
  });
}

export async function startHistoricalSync(
  startDate: string,
  endDate: string,
  skipExisting: boolean = true,
  metricTypes?: string[]
): Promise<StartSyncResponse> {
  return apiCall('/integrations/garmin/sync/historical', {
    method: 'POST',
    body: { startDate, endDate, skipExisting, metricTypes },
  });
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return apiCall('/integrations/garmin/sync/status', {
    method: 'GET',
  });
}

export async function resumeSync(jobId: string): Promise<{ status: string; jobId: string }> {
  return apiCall('/integrations/garmin/sync/resume', {
    method: 'POST',
    body: { jobId },
  });
}

export async function cancelSync(jobId: string): Promise<{ status: string; jobId: string }> {
  return apiCall('/integrations/garmin/sync/cancel', {
    method: 'POST',
    body: { jobId },
  });
}
