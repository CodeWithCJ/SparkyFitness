import { useEffect, useRef } from 'react';
import Toast from 'react-native-toast-message';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { usePreferences } from '../hooks/usePreferences';
import { weightFromKg } from '../utils/unitConversions';

/**
 * Null-rendering listener that fires the gold PR celebration toast. Subscribes
 * to the store's transient `lastPrEvent` and shows exactly one toast per event
 * (keyed on `seq`). `lastPrEvent` is never persisted, so a cold-start resume or
 * rehydration can't replay a stale celebration. Mounted once beside the app
 * toast host in App.tsx.
 */
export default function PrCelebrationToast() {
  const lastPrEvent = useActiveWorkoutStore((s) => s.lastPrEvent);
  const { preferences } = usePreferences();
  // Workout surfaces only render kg or lbs — coerce st_lbs to lbs so we never
  // hand an unsupported unit to weightFromKg.
  const weightUnit: 'kg' | 'lbs' =
    preferences?.default_weight_unit === 'kg' ? 'kg' : 'lbs';

  const lastSeqRef = useRef<number | null>(null);
  useEffect(() => {
    if (lastPrEvent == null) return;
    if (lastSeqRef.current === lastPrEvent.seq) return;
    lastSeqRef.current = lastPrEvent.seq;

    const weight = parseFloat(
      weightFromKg(lastPrEvent.weightKg, weightUnit).toFixed(1),
    );
    const repsPart = lastPrEvent.reps != null ? ` × ${lastPrEvent.reps}` : '';
    Toast.show({
      type: 'pr',
      text1: 'New PR',
      text2: `${lastPrEvent.exerciseName} ${weight} ${weightUnit}${repsPart}`,
    });
  }, [lastPrEvent, weightUnit]);

  return null;
}
