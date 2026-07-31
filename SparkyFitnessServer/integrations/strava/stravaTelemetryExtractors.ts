// Derives the relational workout telemetry (exercise_entries columns + lap splits)
// from a Strava DetailedActivity payload. Mirrors garminTelemetryExtractors.ts's role
// for Garmin, but Strava's shape and available data differ enough to need its own
// mapping rather than reusing the Garmin one:
//   - Strava's summary metrics use flat snake_case keys with metric units already
//     (distance in metres, speed in m/s), not Garmin's minutes/km conventions.
//   - GPS trackpoints and HR-zone time-in-zone require separate, heavily rate-limited
//     Strava API calls (`/activities/{id}/streams`, `/activities/{id}/zones`) that
//     stravaService.ts does not currently fetch. Left as a deliberate follow-up —
//     extractStravaLaps only covers what's already in the DetailedActivity response.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export interface StravaExerciseEntryTelemetry {
  max_heart_rate: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_cadence: number | null;
  elevation_gain_meters: number | null;
  avg_power_watts: number | null;
  max_power_watts: number | null;
  moving_time_seconds: number | null;
  elapsed_time_seconds: number | null;
  active_calories: number | null;
  gear_external_id: string | null;
}

export interface StravaExtractedLap {
  lap_index: number;
  start_time: Date;
  end_time: Date;
  duration_seconds: number;
  distance_meters: number | null;
  calories: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_cadence: number | null;
  avg_power_watts: number | null;
  elevation_gain_meters: number | null;
}

/**
 * Derives the exercise_entries telemetry columns from a Strava DetailedActivity. Falls
 * back to the SummaryActivity shape (fewer fields) when only that's available.
 */
export function extractStravaTelemetryFields(
  activity: AnyRecord
): StravaExerciseEntryTelemetry {
  return {
    max_heart_rate:
      activity.max_heartrate !== undefined && activity.max_heartrate !== null
        ? Math.round(activity.max_heartrate)
        : null,
    avg_speed_mps: activity.average_speed ?? null,
    max_speed_mps: activity.max_speed ?? null,
    avg_cadence:
      activity.average_cadence !== undefined &&
      activity.average_cadence !== null
        ? Math.round(activity.average_cadence)
        : null,
    elevation_gain_meters: activity.total_elevation_gain ?? null,
    avg_power_watts: activity.average_watts ?? null,
    max_power_watts: activity.max_watts ?? null,
    moving_time_seconds:
      activity.moving_time !== undefined && activity.moving_time !== null
        ? Math.round(activity.moving_time)
        : null,
    elapsed_time_seconds:
      activity.elapsed_time !== undefined && activity.elapsed_time !== null
        ? Math.round(activity.elapsed_time)
        : null,
    active_calories:
      activity.calories !== undefined && activity.calories !== null
        ? Math.round(activity.calories)
        : null,
    gear_external_id: activity.gear_id ?? null,
  };
}

/**
 * Extracts lap splits from a Strava DetailedActivity's `laps` array. Distance is
 * already metres and speed already m/s — no unit conversion needed.
 */
export function extractStravaLaps(activity: AnyRecord): StravaExtractedLap[] {
  const rawLaps: AnyRecord[] = activity?.laps ?? [];
  if (!Array.isArray(rawLaps) || rawLaps.length === 0) return [];

  return rawLaps.map((lap: AnyRecord, index: number) => {
    const startTime = lap.start_date_local
      ? new Date(lap.start_date_local)
      : lap.start_date
        ? new Date(lap.start_date)
        : new Date();
    const durationSeconds = Math.round(
      Number(lap.elapsed_time ?? lap.moving_time ?? 0)
    );
    return {
      lap_index: lap.lap_index ?? index + 1,
      start_time: startTime,
      end_time: new Date(startTime.getTime() + durationSeconds * 1000),
      duration_seconds: durationSeconds,
      distance_meters:
        lap.distance !== undefined && lap.distance !== null
          ? Number(lap.distance)
          : null,
      calories: null,
      avg_heart_rate:
        lap.average_heartrate !== undefined && lap.average_heartrate !== null
          ? Math.round(Number(lap.average_heartrate))
          : null,
      max_heart_rate:
        lap.max_heartrate !== undefined && lap.max_heartrate !== null
          ? Math.round(Number(lap.max_heartrate))
          : null,
      avg_speed_mps:
        lap.average_speed !== undefined && lap.average_speed !== null
          ? Number(lap.average_speed)
          : null,
      max_speed_mps:
        lap.max_speed !== undefined && lap.max_speed !== null
          ? Number(lap.max_speed)
          : null,
      avg_cadence:
        lap.average_cadence !== undefined && lap.average_cadence !== null
          ? Math.round(Number(lap.average_cadence))
          : null,
      avg_power_watts:
        lap.average_watts !== undefined && lap.average_watts !== null
          ? Number(lap.average_watts)
          : null,
      elevation_gain_meters:
        lap.total_elevation_gain !== undefined &&
        lap.total_elevation_gain !== null
          ? Number(lap.total_elevation_gain)
          : null,
    };
  });
}
