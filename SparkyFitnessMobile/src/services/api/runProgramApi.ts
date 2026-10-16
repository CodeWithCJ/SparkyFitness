import type {
  AdjustRunProgramBody,
  CustomRunProgramInput,
  CustomRunProgramResponse,
  ListCustomRunProgramsResponse,
  CompleteRunProgramWorkoutBody,
  RateRunProgramWorkoutBody,
  GetRunProgramResponse,
  UpsertRunProgramBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Run Program API';

/** The person's run program and place in it, or `{ program: null }`. */
export const fetchRunProgram = (): Promise<GetRunProgramResponse> =>
  apiFetch<GetRunProgramResponse>({
    endpoint: '/api/v2/run-program',
    serviceName: SERVICE,
    operation: 'fetch run program',
  });

/** Starts the program, switches it on or off, or moves within it. */
export const saveRunProgram = (
  body: UpsertRunProgramBody
): Promise<GetRunProgramResponse> =>
  apiFetch<GetRunProgramResponse>({
    endpoint: '/api/v2/run-program',
    serviceName: SERVICE,
    operation: 'save run program',
    method: 'PUT',
    body,
  });

/** Marks workout `index` done; the server only moves on if it was due. */
export const markRunProgramWorkoutDone = (
  body: CompleteRunProgramWorkoutBody
): Promise<GetRunProgramResponse> =>
  apiFetch<GetRunProgramResponse>({
    endpoint: '/api/v2/run-program/complete',
    serviceName: SERVICE,
    operation: 'complete run program workout',
    method: 'POST',
    body,
  });

/** Records how hard a finished workout felt (1 to 10). */
export const rateRunProgramWorkout = (
  body: RateRunProgramWorkoutBody
): Promise<GetRunProgramResponse> =>
  apiFetch<GetRunProgramResponse>({
    endpoint: '/api/v2/run-program/effort',
    serviceName: SERVICE,
    operation: 'rate run program workout',
    method: 'POST',
    body,
  });

/** Eases or lengthens the running in the next few workouts. */
export const adjustRunProgramRunning = (
  body: AdjustRunProgramBody
): Promise<GetRunProgramResponse> =>
  apiFetch<GetRunProgramResponse>({
    endpoint: '/api/v2/run-program/adjust',
    serviceName: SERVICE,
    operation: 'adjust run program',
    method: 'POST',
    body,
  });
/** The person's own programs, newest first. */
export const fetchCustomRunPrograms =
  (): Promise<ListCustomRunProgramsResponse> =>
    apiFetch<ListCustomRunProgramsResponse>({
      endpoint: '/api/v2/run-program/custom',
      serviceName: SERVICE,
      operation: 'fetch custom run programs',
    });

export const createCustomRunProgram = (
  body: CustomRunProgramInput
): Promise<{ program: CustomRunProgramResponse }> =>
  apiFetch<{ program: CustomRunProgramResponse }>({
    endpoint: '/api/v2/run-program/custom',
    serviceName: SERVICE,
    operation: 'create custom run program',
    method: 'POST',
    body,
  });

export const updateCustomRunProgram = (
  id: string,
  body: CustomRunProgramInput
): Promise<{ program: CustomRunProgramResponse }> =>
  apiFetch<{ program: CustomRunProgramResponse }>({
    endpoint: `/api/v2/run-program/custom/${id}`,
    serviceName: SERVICE,
    operation: 'update custom run program',
    method: 'PUT',
    body,
  });

export const deleteCustomRunProgram = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/run-program/custom/${id}`,
    serviceName: SERVICE,
    operation: 'delete custom run program',
    method: 'DELETE',
  });
