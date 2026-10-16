import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, buildWorkoutHeartRateSeries } from '@workspace/shared';
import {
  fetchExerciseEntry,
  fetchExerciseEntryDistanceSeries,
  fetchHeartRateSamples,
  fetchWorkoutGpsPoints,
  fetchWorkoutHrZones,
} from '../services/api/exerciseStatsApi';
import {
  cardioSessionDetailQueryKey,
  heartRateSamplesQueryKey,
} from './queryKeys';
import { usePreferences } from './usePreferences';
import { getDeviceTimezone } from '../utils/dateUtils';
import { gpsHeartRateSeries, heartRateZoneRows } from '../utils/cardioSession';

/**
 * Route, heart rate, and heart-rate zones for one cardio session.
 *
 * Heart rate comes from the trackpoints when they carry it. Otherwise it is
 * read from the day's stored samples, tagged with the workout or inside its
 * clock window, which is how indoor sessions with no route get a graph.
 */
export function useCardioSessionDetail(
  exerciseEntryId: string,
  entryDate: string
) {
  const { preferences } = usePreferences();
  const timezone = preferences?.timezone || getDeviceTimezone();

  const gpsQuery = useQuery({
    queryKey: cardioSessionDetailQueryKey('gps', exerciseEntryId),
    queryFn: () => fetchWorkoutGpsPoints(exerciseEntryId),
  });
  // An indoor session has no route; its pace comes from the distance series
  // the watch recorded, when there is one.
  const distanceQuery = useQuery({
    queryKey: cardioSessionDetailQueryKey('distanceSeries', exerciseEntryId),
    queryFn: () => fetchExerciseEntryDistanceSeries(exerciseEntryId),
    enabled: gpsQuery.isSuccess && (gpsQuery.data?.points ?? []).length === 0,
  });
  const zonesQuery = useQuery({
    queryKey: cardioSessionDetailQueryKey('hrZones', exerciseEntryId),
    queryFn: () => fetchWorkoutHrZones(exerciseEntryId),
  });

  const trackpoints = useMemo(
    () => gpsQuery.data?.points ?? [],
    [gpsQuery.data]
  );
  const trackHeartRate = useMemo(
    () => gpsHeartRateSeries(trackpoints),
    [trackpoints]
  );
  // Look past the route once it is known to carry no heart rate, or once it
  // failed to load, so stored samples still give the session a graph.
  const needsSamples =
    gpsQuery.isError || (gpsQuery.isSuccess && trackHeartRate.length === 0);

  const entryQuery = useQuery({
    queryKey: cardioSessionDetailQueryKey('entry', exerciseEntryId),
    queryFn: () => fetchExerciseEntry(exerciseEntryId),
    enabled: needsSamples,
  });
  const sampleEnd = addDays(entryDate, 1);
  const samplesQuery = useQuery({
    queryKey: heartRateSamplesQueryKey(entryDate, sampleEnd),
    queryFn: () => fetchHeartRateSamples(entryDate, sampleEnd),
    enabled: needsSamples,
  });

  const heartRate = useMemo(() => {
    if (trackHeartRate.length > 0) return trackHeartRate;
    if (!samplesQuery.data) return [];
    return buildWorkoutHeartRateSeries(
      samplesQuery.data,
      exerciseEntryId,
      entryQuery.data,
      timezone
    );
  }, [
    trackHeartRate,
    samplesQuery.data,
    exerciseEntryId,
    entryQuery.data,
    timezone,
  ]);

  const zones = useMemo(
    () => heartRateZoneRows(zonesQuery.data ?? []),
    [zonesQuery.data]
  );

  return {
    route: trackpoints,
    distanceSeries: distanceQuery.data ?? null,
    heartRate,
    zones,
    isRouteLoading: gpsQuery.isLoading,
    isHeartRateLoading:
      gpsQuery.isLoading ||
      (needsSamples && (samplesQuery.isLoading || entryQuery.isLoading)),
    isZonesLoading: zonesQuery.isLoading,
    isError: gpsQuery.isError && zonesQuery.isError,
  };
}
