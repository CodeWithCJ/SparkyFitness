import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { fetchExerciseStats } from '../services/api/exerciseApi';
import { getActiveServerConfig } from '../services/storage';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { exerciseStatsQueryKey } from './queryKeys';
import { useLiveCoachingSignals } from './useLiveCoachingSignals';
import { usePreferences } from './usePreferences';

/** A transient network error or 5xx at workout start shouldn't cost the history. */
const STATS_FETCH_RETRIES = 3;

/**
 * Feeds the live workout the inputs its placeholder values resolve from —
 * each exercise's previous session, PR baseline, coaching signals and the
 * weight unit — without needing `ActiveWorkoutScreen` on screen.
 *
 * Those inputs are otherwise captured by the screen's cards, and a workout
 * started from the watch deliberately doesn't open that screen. Until the
 * phone app was opened the store had no history, so the progression bump,
 * ramp and adaptive adjustment never reached the wrist, a PR set logged on
 * the watch was never recognised and a lbs lifter's rounding ran in kg. The
 * store keeps the first value each exercise reports and the cards read the
 * same query keys, so opening the screen later is a cache hit and a no-op.
 *
 * No screen will ask again on the watch path, so a failed fetch is retried
 * here, and a workout started while offline fetches once `connected` flips.
 */
export function useLiveWorkoutInputsCapture(connected: boolean): void {
  useLiveCoachingSignals();

  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const sessionId = useActiveWorkoutStore((s) => s.sessionId);
  const sourcePresetId = useActiveWorkoutStore((s) => s.sourcePresetId);
  const sourceServerConfigId = useActiveWorkoutStore(
    (s) => s.sourceServerConfigId
  );
  const exerciseIds = useActiveWorkoutStore(
    useShallow((s) =>
      [
        ...new Set(
          (s.session?.exercises ?? [])
            .map((exercise) => exercise.exercise_id)
            .filter((id): id is string => id != null)
        ),
      ].sort()
    )
  );
  const captured = useActiveWorkoutStore((s) => s.previousSessionSets);

  // Same unit the watch bridge sends and the cards would set.
  const weightUnit: 'kg' | 'lbs' =
    preferences?.default_weight_unit === 'lbs' ||
    preferences?.default_weight_unit === 'st_lbs'
      ? 'lbs'
      : 'kg';
  const live = sessionId != null;
  useEffect(() => {
    if (!live || preferences == null) return;
    useActiveWorkoutStore.getState().setWeightUnit(weightUnit);
  }, [live, preferences, weightUnit]);

  // The history is the preset's own only when the preset belongs to the
  // server that is active now (preset ids collide across servers); until
  // that check settles, capturing would pin the unscoped history. A check
  // that fails stays unsettled (nothing is captured) and is asked again when
  // the connection returns, rather than settling as "not this server".
  const scopeKey = `${sessionId ?? ''}|${sourcePresetId ?? ''}|${sourceServerConfigId ?? ''}`;
  const [settled, setSettled] = useState<{
    key: string;
    presetId: number | undefined;
  } | null>(null);
  useEffect(() => {
    if (!live || sourcePresetId == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const config = await getActiveServerConfig();
        if (cancelled) return;
        setSettled({
          key: scopeKey,
          presetId:
            config?.id === sourceServerConfigId ? sourcePresetId : undefined,
        });
      } catch {
        // Left unsettled; see above.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [live, connected, sourcePresetId, sourceServerConfigId, scopeKey]);

  const scopeSettled = sourcePresetId == null || settled?.key === scopeKey;
  const presetId = sourcePresetId == null ? undefined : settled?.presetId;
  const missingKey = exerciseIds.filter((id) => !(id in captured)).join(',');

  useEffect(() => {
    if (!connected || sessionId == null || !scopeSettled || missingKey === '')
      return;
    let cancelled = false;
    for (const exerciseId of missingKey.split(',')) {
      queryClient
        .fetchQuery({
          queryKey: exerciseStatsQueryKey(exerciseId, sessionId, presetId),
          queryFn: () => fetchExerciseStats(exerciseId, sessionId, presetId),
          retry: STATS_FETCH_RETRIES,
        })
        .then((stats) => {
          const store = useActiveWorkoutStore.getState();
          if (cancelled || store.sessionId !== sessionId) return;
          store.capturePrBaseline(
            exerciseId,
            stats.bestSet
              ? { weight: stats.bestSet.weight, reps: stats.bestSet.reps }
              : null
          );
          store.capturePreviousSessionSets(
            exerciseId,
            stats.recentSessions?.[0]?.sets ?? []
          );
        })
        .catch(() => {
          // Retries are spent: the exercise stays uncaptured, and the next
          // reconnect or change to the exercise list asks again.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [queryClient, connected, sessionId, scopeSettled, presetId, missingKey]);
}
