import type {
  GetRunGoalsResponse,
  UpsertRunGoalsBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Run Goals API';

/** The weekly distance target and race, with this week's running and the days to the race. */
export const fetchRunGoals = (): Promise<GetRunGoalsResponse> =>
  apiFetch<GetRunGoalsResponse>({
    endpoint: '/api/v2/run-goals',
    serviceName: SERVICE,
    operation: 'fetch run goals',
  });

/** Sets the fields sent and clears the ones sent as null. */
export const saveRunGoals = (
  body: UpsertRunGoalsBody
): Promise<GetRunGoalsResponse> =>
  apiFetch<GetRunGoalsResponse>({
    endpoint: '/api/v2/run-goals',
    serviceName: SERVICE,
    operation: 'save run goals',
    method: 'PUT',
    body,
  });
