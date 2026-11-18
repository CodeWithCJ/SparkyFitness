import type {
  UpdateWorkoutSessionFeedbackRequest,
  WorkoutCoachingSettings,
  WorkoutCoachingSignalsResponse,
  WorkoutSessionFeedbackResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { hasWaitingSessionUpload } from '../../offline/followUps';
import { withOfflineFallback } from '../../offline/withOfflineFallback';

/** `/api/v2/workout-coaching` — session feedback and adaptive settings (#1560). */

export const fetchWorkoutSessionFeedback = async (
  presetEntryId: string
): Promise<WorkoutSessionFeedbackResponse> =>
  withOfflineFallback<WorkoutSessionFeedbackResponse>({
    fetch: () =>
      apiFetch<WorkoutSessionFeedbackResponse>({
        endpoint: `/api/v2/workout-coaching/sessions/${encodeURIComponent(presetEntryId)}/feedback`,
        serviceName: 'Workout Coaching API',
        operation: 'fetch workout feedback',
      }),
    // A workout just logged without a connection has no feedback on the
    // server yet, so the card can start empty and its answers wait in the
    // upload queue. For any other workout the load still fails, because
    // answering from an empty form would replace feedback already saved.
    read: async () =>
      (await hasWaitingSessionUpload(presetEntryId))
        ? {
            exercise_preset_entry_id: presetEntryId,
            session: null,
            exercises: [],
          }
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
