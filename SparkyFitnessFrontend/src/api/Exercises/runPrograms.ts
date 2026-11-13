import { apiCall } from '@/api/api';
import type {
  CompleteRunProgramWorkoutBody,
  GetRunProgramResponse,
  ListCustomRunProgramsResponse,
  UpsertRunProgramBody,
} from '@workspace/shared';

/** The person's run program and place in it, or `{ program: null }`. */
export const getRunProgram = (): Promise<GetRunProgramResponse> =>
  apiCall('/v2/run-program', { method: 'GET' });

/** Starts the program, switches it on or off, or moves within it. */
export const saveRunProgram = (
  body: UpsertRunProgramBody
): Promise<GetRunProgramResponse> =>
  apiCall('/v2/run-program', { method: 'PUT', body });

/** Marks workout `index` done; the server only moves on if it was due. */
export const completeRunProgramWorkout = (
  body: CompleteRunProgramWorkoutBody
): Promise<GetRunProgramResponse> =>
  apiCall('/v2/run-program/complete', { method: 'POST', body });

/** The person's own programs, newest first. */
export const getCustomRunPrograms =
  (): Promise<ListCustomRunProgramsResponse> =>
    apiCall('/v2/run-program/custom', { method: 'GET' });
