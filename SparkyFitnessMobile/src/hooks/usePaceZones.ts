import { useMemo } from 'react';
import { useCardioSessions } from './useCardioSessions';
import { getTodayDate } from '../utils/dateUtils';
import { paceZonesFromSessions } from '../utils/paceZones';

/**
 * The person's running pace zones, from the last 90 days of cardio sessions
 * the Exercise Statistics cardio view already loads. Null without usable runs.
 */
export function usePaceZones(enabled = true) {
  const { sessions, isLoading } = useCardioSessions('90d', enabled);
  const result = useMemo(
    () => paceZonesFromSessions(sessions, getTodayDate()),
    [sessions]
  );
  return { result, isLoading };
}
