import type {
  ActionTagResponse,
  CreateActionTagBody,
  ScanActionTagBody,
  ScanActionTagResponse,
  UpdateActionTagBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Action Tags API';

export const fetchActionTags = (): Promise<ActionTagResponse[]> =>
  apiFetch<ActionTagResponse[]>({
    endpoint: '/api/v2/action-tags',
    serviceName: SERVICE,
    operation: 'fetch NFC tags',
  });

export const createActionTag = (
  body: CreateActionTagBody
): Promise<ActionTagResponse> =>
  apiFetch<ActionTagResponse>({
    endpoint: '/api/v2/action-tags',
    serviceName: SERVICE,
    operation: 'create NFC tag',
    method: 'POST',
    body,
  });

export const updateActionTag = (
  id: string,
  body: UpdateActionTagBody
): Promise<ActionTagResponse> =>
  apiFetch<ActionTagResponse>({
    endpoint: `/api/v2/action-tags/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'update NFC tag',
    method: 'PATCH',
    body,
  });

export const deleteActionTag = (id: string): Promise<unknown> =>
  apiFetch<unknown>({
    endpoint: `/api/v2/action-tags/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'delete NFC tag',
    method: 'DELETE',
  });

/** Runs the action saved for a scanned tag; the server decides what happens. */
export const scanActionTag = (
  body: ScanActionTagBody
): Promise<ScanActionTagResponse> =>
  apiFetch<ScanActionTagResponse>({
    endpoint: '/api/v2/action-tags/scan',
    serviceName: SERVICE,
    operation: 'scan NFC tag',
    method: 'POST',
    body,
  });
