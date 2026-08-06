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

import {
  type UnknownRecord,
  asArray,
  firstInt,
  firstNum,
  firstValue,
  str,
} from '../../services/garmin/garminTelemetryExtractors.js';

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
  activity: UnknownRecord
): StravaExerciseEntryTelemetry {
  return {
    max_heart_rate: firstInt(activity, ['max_heartrate']),
    avg_speed_mps: firstNum(activity, ['average_speed']),
    max_speed_mps: firstNum(activity, ['max_speed']),
    avg_cadence: firstInt(activity, ['average_cadence']),
    elevation_gain_meters: firstNum(activity, ['total_elevation_gain']),
    avg_power_watts: firstNum(activity, ['average_watts']),
    max_power_watts: firstNum(activity, ['max_watts']),
    moving_time_seconds: firstInt(activity, ['moving_time']),
    elapsed_time_seconds: firstInt(activity, ['elapsed_time']),
    active_calories: firstInt(activity, ['calories']),
    gear_external_id: str(activity.gear_id),
  };
}

/**
 * Extracts lap splits from a Strava DetailedActivity's `laps` array. Distance is
 * already metres and speed already m/s — no unit conversion needed.
 */
export function extractStravaLaps(
  activity: UnknownRecord
): StravaExtractedLap[] {
  const rawLaps = asArray<UnknownRecord>(activity.laps);
  if (rawLaps.length === 0) return [];

  return rawLaps.flatMap((lap: UnknownRecord, index: number) => {
    // Skip laps with no usable start time rather than stamping them with the
    // import time — see the matching note in garminTelemetryExtractors.
    const rawStart = firstValue(lap, ['start_date_local', 'start_date']);
    if (rawStart === undefined || rawStart === null) return [];
    const startTime = new Date(rawStart as string | number | Date);
    if (Number.isNaN(startTime.getTime())) return [];

    const durationSeconds = Math.round(
      firstNum(lap, ['elapsed_time', 'moving_time']) ?? 0
    );
    return [
      {
        lap_index: firstInt(lap, ['lap_index']) ?? index + 1,
        start_time: startTime,
        end_time: new Date(startTime.getTime() + durationSeconds * 1000),
        duration_seconds: durationSeconds,
        distance_meters: firstNum(lap, ['distance']),
        calories: null,
        avg_heart_rate: firstInt(lap, ['average_heartrate']),
        max_heart_rate: firstInt(lap, ['max_heartrate']),
        avg_speed_mps: firstNum(lap, ['average_speed']),
        max_speed_mps: firstNum(lap, ['max_speed']),
        avg_cadence: firstInt(lap, ['average_cadence']),
        avg_power_watts: firstNum(lap, ['average_watts']),
        elevation_gain_meters: firstNum(lap, ['total_elevation_gain']),
      },
    ];
  });
}
