import { useMemo } from 'react';
import { useCardioSessions } from './useCardioSessions';
import { useFitnessTests } from '../services/fitnessTestService';
import { getTodayDate } from '../utils/dateUtils';
import { paceZonesFromSessions, paceZonesFromTest } from '../utils/paceZones';

/**
 * The person's running pace zones: from their latest fitness test when they
 * have one, else from the last 90 days of cardio sessions the Exercise
 * Statistics cardio view already loads. Null without either.
 */
export function usePaceZones(enabled = true) {
  const { sessions, isLoading } = useCardioSessions('90d', enabled);
  const { latest } = useFitnessTests(enabled);
  const result = useMemo(
    () =>
      paceZonesFromTest(latest) ??
      paceZonesFromSessions(sessions, getTodayDate()),
    [latest, sessions]
  );
  return { result, isLoading };
}
