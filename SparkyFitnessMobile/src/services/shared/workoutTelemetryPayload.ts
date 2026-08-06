import type {
  TransformedExerciseSession,
  WorkoutGpsPoint,
  WorkoutHrSample,
  WorkoutLapWindow,
  WorkoutTelemetry,
} from '../../types/healthRecords';

/**
 * Moves telemetry a provider collected onto the outgoing exercise session.
 *
 * Shared by the HealthKit and Health Connect transformers: both providers reach
 * this point with the same four optional fields on their raw record, and the
 * rules for what to upload (and what to strip from raw_data) are identical.
 */

/** Raw record fields the providers stash telemetry on before transformation. */
export interface RawWorkoutTelemetry {
  gps_points?: unknown;
  hr_samples?: unknown;
  laps?: unknown;
  telemetry?: unknown;
}

/** Keys carrying telemetry, stripped from raw_data to avoid sending it twice. */
const TELEMETRY_KEYS: readonly (keyof RawWorkoutTelemetry)[] = [
  'gps_points',
  'hr_samples',
  'laps',
  'telemetry',
];

const nonEmptyArray = <T>(value: unknown): T[] | undefined =>
  Array.isArray(value) && value.length > 0 ? (value as T[]) : undefined;

/**
 * Returns a copy of the raw record without the telemetry arrays.
 *
 * raw_data is uploaded verbatim into exercise_entry_activity_details. Left
 * alone it would carry a second full copy of the GPS track and heart-rate
 * series, roughly doubling an already large payload for no benefit.
 */
export function stripTelemetryFromRawData(record: unknown): unknown {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return record;
  }
  const copy = { ...(record as Record<string, unknown>) };
  let stripped = false;
  for (const key of TELEMETRY_KEYS) {
    if (key in copy) {
      delete copy[key];
      stripped = true;
    }
  }
  return stripped ? copy : record;
}

/**
 * Attaches whatever telemetry the provider collected, leaving the session
 * untouched when there is none — so a device or OS version that yields no
 * telemetry produces exactly the payload it did before this existed.
 */
export function attachWorkoutTelemetry(
  session: TransformedExerciseSession,
  raw: RawWorkoutTelemetry
): TransformedExerciseSession {
  const gpsPoints = nonEmptyArray<WorkoutGpsPoint>(raw.gps_points);
  const hrSamples = nonEmptyArray<WorkoutHrSample>(raw.hr_samples);
  const laps = nonEmptyArray<WorkoutLapWindow>(raw.laps);
  const telemetry =
    raw.telemetry &&
    typeof raw.telemetry === 'object' &&
    !Array.isArray(raw.telemetry) &&
    Object.keys(raw.telemetry).length > 0
      ? (raw.telemetry as WorkoutTelemetry)
      : undefined;

  if (!gpsPoints && !hrSamples && !laps && !telemetry) return session;

  if (gpsPoints) session.gps_points = gpsPoints;
  if (hrSamples) session.hr_samples = hrSamples;
  if (laps) session.laps = laps;
  if (telemetry) session.telemetry = telemetry;

  session.raw_data = stripTelemetryFromRawData(session.raw_data);

  return session;
}
