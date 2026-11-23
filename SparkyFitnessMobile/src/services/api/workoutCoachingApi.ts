import type {
  UpdateWorkoutSessionFeedbackRequest,
  WorkoutCoachingSettings,
  WorkoutCoachingSignalsResponse,
  WorkoutSessionFeedbackResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { ApiError } from './errors';
import { isSessionAwaitingServer } from '../../offline/sessionAwaitingServer';
import { withOfflineFallback } from '../../offline/withOfflineFallback';

/** `/api/v2/workout-coaching` — session feedback and adaptive settings (#1560). */

const emptyFeedback = (
  presetEntryId: string
): WorkoutSessionFeedbackResponse => ({
  exercise_preset_entry_id: presetEntryId,
  session: null,
  exercises: [],
});

export const fetchWorkoutSessionFeedback = async (
  presetEntryId: string
): Promise<WorkoutSessionFeedbackResponse> => {
  try {
    return await requestWorkoutSessionFeedback(presetEntryId);
  } catch (error) {
    // The connection is back but the workout's own upload has not gone yet,
    // so the server does not know the session and answers 404. There is no
    // feedback to lose, so the card starts empty like it does with no
    // connection; any other 404 is still an error.
    if (
      error instanceof ApiError &&
      error.statusCode === 404 &&
      (await isSessionAwaitingServer(presetEntryId))
    ) {
      return emptyFeedback(presetEntryId);
    }
    throw error;
  }
};

const requestWorkoutSessionFeedback = async (
  presetEntryId: string
): Promise<WorkoutSessionFeedbackResponse> =>
  withOfflineFallback<WorkoutSessionFeedbackResponse>({
    fetch: () =>
      apiFetch<WorkoutSessionFeedbackResponse>({
        endpoint: `/api/v2/workout-coaching/sessions/${encodeURIComponent(presetEntryId)}/feedback`,
        serviceName: 'Workout Coaching API',
        operation: 'fetch workout feedback',
      }),
    // A workout just logged without a connection, still waiting to be
    // created, has no feedback on the server yet, so the card can start empty
    // and its answers wait in the upload queue. For any other workout, one
    // the server holds (even with an edit waiting), the load still fails,
    // because answering from an empty form would replace feedback already
    // saved.
    read: async () =>
      (await isSessionAwaitingServer(presetEntryId))
        ? emptyFeedback(presetEntryId)
        : null,
  });

export const saveWorkoutSessionFeedback = async (
  presetEntryId: string,
  request: UpdateWorkoutSessionFeedbackRequest
): Promise<WorkoutSessionFeedbackResponse> =>
  apiFetch<WorkoutSessionFeedbackResponse>({
    endpoint: `/api/v2/workout-coaching/sessions/${encodeURIComponent(presetEntryId)}/feedback`,
    serviceName: 'Workout Coaching API',
    operation: 'save workout feedback',
    method: 'PUT',
    body: request,
  });

export const fetchWorkoutCoachingSettings =
  async (): Promise<WorkoutCoachingSettings> =>
    apiFetch<WorkoutCoachingSettings>({
      endpoint: '/api/v2/workout-coaching/settings',
      serviceName: 'Workout Coaching API',
      operation: 'fetch coaching settings',
    });

export const saveWorkoutCoachingSettings = async (
  settings: WorkoutCoachingSettings
): Promise<WorkoutCoachingSettings> =>
  apiFetch<WorkoutCoachingSettings>({
    endpoint: '/api/v2/workout-coaching/settings',
    serviceName: 'Workout Coaching API',
    operation: 'save coaching settings',
    method: 'PUT',
    body: settings,
  });

export const fetchWorkoutCoachingSignals = async (
  exerciseIds: readonly string[],
  excludePresetEntryId?: string
): Promise<WorkoutCoachingSignalsResponse> => {
  const params = new URLSearchParams({ exerciseIds: exerciseIds.join(',') });
  if (excludePresetEntryId) {
    params.set('excludePresetEntryId', excludePresetEntryId);
  }
  return apiFetch<WorkoutCoachingSignalsResponse>({
    endpoint: `/api/v2/workout-coaching/signals?${params.toString()}`,
    serviceName: 'Workout Coaching API',
    operation: 'fetch coaching signals',
  });
};
