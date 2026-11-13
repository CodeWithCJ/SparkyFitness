import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import WatchConnectivity, {
  type WatchWorkoutStartRequestedPayload,
} from '../../modules/watch-connectivity';
import { queryClient } from './queryClient';
import { workoutPresetsQueryKey } from './queryKeys';
import { fetchDailySummary } from '../services/api/dailySummaryApi';
import { fetchActiveWorkoutPlans } from '../services/api/workoutPlansApi';
import { getWorkoutPresetById } from '../services/api/workoutPresetsApi';
import { getActiveServerConfigId } from '../services/storage';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import type { WorkoutPresetsResponse } from '../types/workoutPresets';
import {
  buildPresetLiveExerciseConfigs,
  buildPresetStartExercisesPayload,
} from '../utils/workoutSession';
import { getTodayDate } from '../utils/dateUtils';
import {
  findDueAssignmentForPreset,
  getLoggedAssignmentIds,
  getUncompletedActivePlans,
} from '../utils/workoutPlanSchedule';
import {
  armWatchForActiveSession,
  type StartLiveWorkoutArgs,
} from './useStartLiveWorkout';

type StartFn = (args: StartLiveWorkoutArgs) => Promise<void>;

/**
 * Starts a saved workout when the watch asks. The phone builds the session
 * the same way its own preset list does, then arms the watch with the usual
 * `workoutStart`. A preset id the phone cannot load is ignored.
 *
 * The listener stays up while the server is offline. A tap that arrives
 * then is kept and run once the connection is back, instead of being
 * dropped because nothing was listening. A second delivery while that
 * preset's session is already live re-arms the watch so a restarted watch
 * app or retry still transitions into the live workout.
 */
export function useWatchWorkoutStart(
  enabled: boolean,
  connected: boolean,
  start: StartFn
): void {
  const { t } = useTranslation();
  const tRef = useRef(t);
  const startRef = useRef(start);
  const connectedRef = useRef(connected);
  useEffect(() => {
    tRef.current = t;
    startRef.current = start;
    connectedRef.current = connected;
  });
  const pendingRef = useRef<WatchWorkoutStartRequestedPayload | null>(null);
  const generationRef = useRef(0);

  const run = useCallback(
    async (payload: WatchWorkoutStartRequestedPayload) => {
      const generation = generationRef.current;
      const presetId = Number(payload.presetId);
      const serverId = payload.serverId;
      // A queued tap from before this field, or from another account, must
      // not start whatever preset now happens to have that id.
      if (!Number.isFinite(presetId) || !serverId) return;
      const activeServerId = await getActiveServerConfigId();
      if (generation !== generationRef.current || activeServerId !== serverId)
        return;
      const cached = queryClient.getQueryData<WorkoutPresetsResponse>(
        workoutPresetsQueryKey
      );
      let preset = cached?.presets.find((item) => item.id === presetId);
      if (preset == null) {
        try {
          preset = await getWorkoutPresetById(presetId);
        } catch {
          return;
        }
      }
      const live = useActiveWorkoutStore.getState();
      if (
        generation !== generationRef.current ||
        preset.exercises.length === 0 ||
        (await getActiveServerConfigId()) !== serverId ||
        generation !== generationRef.current
      ) {
        return;
      }
      if (live.sessionId != null && live.sourcePresetId === preset.id) {
        armWatchForActiveSession(tRef.current);
        return;
      }
      // A preset that is due today under an active plan counts toward that
      // plan, the same as starting it from the Diary, so the "Scheduled
      // Today" card clears. One already logged today is left unlinked.
      // Plans or the diary that fail to load just start it plain.
      let assignmentId: number | undefined;
      try {
        const today = getTodayDate();
        const [plans, dailySummary] = await Promise.all([
          fetchActiveWorkoutPlans(today),
          fetchDailySummary(today),
        ]);
        const due = findDueAssignmentForPreset(
          getUncompletedActivePlans(
            plans,
            getLoggedAssignmentIds(dailySummary.exerciseSessions)
          ),
          preset.id
        );
        if (due?.id) assignmentId = Number(due.id);
      } catch {
        // start without the plan link
      }
      if (generation !== generationRef.current) return;
      // The plan fetch can outlive the checks above. A server switch, a
      // hook restart, or a second start of this preset in that gap must
      // not start anyway.
      const liveAfter = useActiveWorkoutStore.getState();
      if (
        (await getActiveServerConfigId()) !== serverId ||
        generation !== generationRef.current
      ) {
        return;
      }
      if (
        liveAfter.sessionId != null &&
        liveAfter.sourcePresetId === preset.id
      ) {
        armWatchForActiveSession(tRef.current);
        return;
      }
      const exercises = buildPresetStartExercisesPayload(preset).map(
        (exercise) =>
          assignmentId == null
            ? exercise
            : { ...exercise, workout_plan_assignment_id: assignmentId }
      );
      await startRef.current({
        name: preset.name,
        exercises,
        workoutPlanAssignmentId: assignmentId,
        exerciseConfigs: buildPresetLiveExerciseConfigs(preset),
        sourcePresetId: preset.id,
        workoutFormat: preset.workout_format ?? 'standard',
        timeCapSeconds: preset.time_cap_seconds ?? null,
      });
    },
    []
  );

  useEffect(() => {
    if (!enabled || !WatchConnectivity?.isSupported()) return;
    const watch = WatchConnectivity;
    const sub = watch.addListener('onWorkoutStartRequested', (payload) => {
      if (!connectedRef.current) {
        pendingRef.current = payload;
        return;
      }
      void run(payload);
    });
    return () => {
      generationRef.current += 1;
      sub.remove();
    };
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled || !connected) return;
    const pending = pendingRef.current;
    if (pending == null) return;
    pendingRef.current = null;
    void run(pending);
  }, [enabled, connected, run]);
}
