import { useMemo } from 'react';
import { useActivityDetailsQuery } from '@/hooks/Exercises/useExercises';
import { useResolvedHeartRateZones } from '@/hooks/Settings/useHeartRateZones';
import { useWorkoutHrZones } from '@/hooks/useGenericHealth';
import { zoneEdges, zoneGradientStops } from '@/utils/heartRateZoneBands';
import { extractWorkoutHeartRateSeries } from '@/utils/workoutTelemetryExtractor';
import { displayBandLabel } from '@/utils/heartRateZoneLabels';
import { computeTimeInZones } from '@workspace/shared';
import { useTranslation } from 'react-i18next';

interface WorkoutZoneBreakdownInput {
  workoutHrZones: NonNullable<ReturnType<typeof useWorkoutHrZones>['data']>;
  activityDetails: ReturnType<typeof useActivityDetailsQuery>['data'];
  points: ReturnType<typeof extractWorkoutHeartRateSeries>['points'];
}

export const useWorkoutZoneBreakdown = ({
  workoutHrZones,
  activityDetails,
  points,
}: WorkoutZoneBreakdownInput) => {
  const { t } = useTranslation();

  // 3. Zone breakdown (stored rows -> Garmin payload -> the person's own
  // zones). Stored rows keep the zones they were worked out with; only the
  // fallback from raw readings uses the zones as they are now.
  const resolvedZones = useResolvedHeartRateZones();
  const { bands } = resolvedZones;
  const edges = useMemo(() => zoneEdges(bands), [bands]);

  const breakdown = useMemo(() => {
    const secondsByZone = [0, 0, 0, 0, 0];
    const add = (zone: number, seconds: number) => {
      if (Number.isInteger(zone) && zone >= 1 && zone <= 5 && seconds > 0) {
        secondsByZone[zone - 1] = (secondsByZone[zone - 1] ?? 0) + seconds;
      }
    };

    if (workoutHrZones && workoutHrZones.length > 0) {
      workoutHrZones.forEach((z) => add(z.zone_index, z.seconds_in_zone || 0));
    } else {
      const act = (activityDetails as Record<string, unknown> | undefined)?.[
        'activity'
      ] as Record<string, unknown> | undefined;
      const rawZones = (act?.['hr_in_timezones'] ||
        (activityDetails as Record<string, unknown> | undefined)?.[
          'hr_in_timezones'
        ]) as Array<{ zoneNumber: number; secsInZone: number }> | undefined;

      if (Array.isArray(rawZones) && rawZones.length > 0) {
        rawZones.forEach((z) => add(z.zoneNumber, z.secsInZone || 0));
      } else if (points.length >= 2 && !resolvedZones.isDefault) {
        computeTimeInZones(
          points.map((p) => ({
            t: new Date(p.timestamp).toISOString(),
            bpm: p.bpm,
          })),
          resolvedZones.resolved.floors
        ).forEach((b) => add(b.zone_index, b.seconds_in_zone));
      }
    }

    const totalSecs = secondsByZone.reduce((a, b) => a + b, 0);
    if (totalSecs <= 0) return { rows: [], minutesByZone: [0, 0, 0, 0, 0] };
    const minutesByZone = secondsByZone.map((secs) => Math.round(secs / 60));
    // Time is summed over the zones in each band, so four tiers add up too
    const rows = bands.map((band) => {
      const secs = band.zones.reduce(
        (sum, zone) => sum + (secondsByZone[zone - 1] ?? 0),
        0
      );
      return {
        name: displayBandLabel(t, band),
        pct: Math.round((secs / totalSecs) * 100),
        mins: Math.round(secs / 60),
        color: band.color,
      };
    });
    return { rows, minutesByZone };
  }, [workoutHrZones, activityDetails, points, bands, resolvedZones, t]);

  const pointsGradientStops = useMemo(() => {
    const values = points.map((p) => p.bpm).filter((v) => v > 0);
    if (values.length === 0) return [];
    return zoneGradientStops(Math.min(...values), Math.max(...values), bands);
  }, [points, bands]);

  return {
    zones: breakdown.rows,
    minutesByZone: breakdown.minutesByZone,
    edges,
    resolvedZones,
    pointsGradientStops,
  };
};
