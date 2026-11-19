import Toast from 'react-native-toast-message';
import { queryClient } from '../../hooks/queryClient';
import { workoutPresetsQueryKey } from '../../hooks/queryKeys';
import i18n from '../../localization/i18n';
import { apiFetch } from '../../services/api/apiClient';
import { ApiError } from '../../services/api/errors';
import { saveWorkoutSessionFeedback } from '../../services/api/workoutCoachingApi';
import { updateWorkoutPreset } from '../../services/api/workoutPresetsApi';
import type { WorkoutPreset } from '../../types/workoutPresets';
import {
  FOLLOW_UP_PAYLOAD_VERSION,
  WORKOUT_FEEDBACK_PUT,
  WORKOUT_PRESET_UPDATE,
  type QueuedFeedbackPayload,
  type QueuedPresetUpdatePayload,
} from '../followUps';
import { sendResultFromError } from '../syncEngine';
import type { OutboxHandler, OutboxRow, SendResult } from '../types';
import { registerOutboxHandler } from './registry';

const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.statusCode === 404;

async function sendFeedback(row: OutboxRow): Promise<SendResult> {
  const { sessionId, request } = row.payload as QueuedFeedbackPayload;
  try {
    await saveWorkoutSessionFeedback(sessionId, request);
    return { outcome: 'synced' };
  } catch (error) {
    // The workout is gone (discarded, or deleted elsewhere): nothing to
    // attach the answer to.
    if (isNotFound(error)) return { outcome: 'synced' };
    return sendResultFromError(error);
  }
}

async function sendPresetUpdate(row: OutboxRow): Promise<SendResult> {
  const payload = row.payload as QueuedPresetUpdatePayload;
  try {
    // Straight from the server: a saved copy on this phone cannot say
    // whether the saved workout was changed elsewhere.
    const current = await apiFetch<WorkoutPreset>({
      endpoint: `/api/workout-presets/${payload.presetId}`,
      serviceName: 'Offline uploads',
      operation: 'check saved workout before update',
    });
    if (
      payload.expectedUpdatedAt != null &&
      (current.updated_at ?? null) !== payload.expectedUpdatedAt
    ) {
      Toast.show({
        type: 'info',
        text1: i18n.t('offline.presetUpdateSkipped', {
          defaultValue:
            'Saved workout "{{name}}" was not updated because it was changed elsewhere',
          name: payload.presetName,
        }),
      });
      return { outcome: 'synced' };
    }
    await updateWorkoutPreset(payload.presetId, {
      exercises: payload.exercises,
    });
    void queryClient.invalidateQueries({ queryKey: workoutPresetsQueryKey });
    Toast.show({
      type: 'success',
      text1: i18n.t('offline.presetUpdated', {
        defaultValue: 'Saved workout "{{name}}" updated',
        name: payload.presetName,
      }),
    });
    return { outcome: 'synced' };
  } catch (error) {
    // Deleted meanwhile: there is nothing left to update.
    if (isNotFound(error)) return { outcome: 'synced' };
    return sendResultFromError(error);
  }
}

const base = {
  payloadVersion: FOLLOW_UP_PAYLOAD_VERSION,
  upgrade: (payload: unknown) => payload,
};

const handlers: OutboxHandler[] = [
  { ...base, kind: WORKOUT_FEEDBACK_PUT, send: sendFeedback },
  { ...base, kind: WORKOUT_PRESET_UPDATE, send: sendPresetUpdate },
];

/** Makes queued workout feedback and saved-workout updates sendable. */
export function registerFollowUpHandlers(): void {
  handlers.forEach(registerOutboxHandler);
}
