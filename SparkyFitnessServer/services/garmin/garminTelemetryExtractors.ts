// Shared extraction of Garmin Connect's raw REST JSON (laps/splits, GPS/activity-detail
// metrics, and HR time-in-zone) into the relational shapes consumed by
// workoutTelemetryRepository. This is intentionally provider-shaped (Garmin field names
// in, camelCase/PascalCase variants tolerated) but produces a provider-neutral output.
//
// Used by both live sync (garminActivityProcessor.ts, session and simple-activity paths)
// and the one-off backfill script (scripts/backfillWorkoutTelemetry.script.ts) so the parsing
// logic only exists once — the "rule of two" in AGENTS.md applies here since this is
// already the third caller if you count both processor paths as one.

export type UnknownRecord = Record<string, unknown>;

export function asRecord(val: unknown): UnknownRecord | null {
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return val as UnknownRecord;
  }
  return null;
}

export function asArray<T = unknown>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

export function num(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

export function int(val: unknown): number | null {
  const n = num(val);
  return n === null ? null : Math.round(n);
}

export function str(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

export function firstNum(record: UnknownRecord, keys: string[]): number | null {
  for (const k of keys) {
    const v = record[k];
    const n = num(v);
    if (n !== null) return n;
  }
  return null;
}

export function firstInt(record: UnknownRecord, keys: string[]): number | null {
  const n = firstNum(record, keys);
  return n === null ? null : Math.round(n);
}

export function firstValue(record: UnknownRecord, keys: string[]): unknown {
  for (const k of keys) {
    const v = record[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/**
 * Parses a Garmin timestamp into a real instant.
 *
 * Garmin Connect sends naive wall-clock strings ("2026-07-30 06:12:34.0") with
 * no zone marker, which `new Date(...)` resolves against the *server's* zone.
 * That silently shifts every parsed instant by the server's UTC offset —
 * invisible on a UTC host, hours off on any host with TZ set. So a naive
 * string is pinned to UTC explicitly here, and callers must hand this a GMT
 * field rather than a Local one (see pickLapInstant below).
 *
 * Values that already carry a zone (ISO strings with Z/offset, epoch numbers,
 * Date objects) are unambiguous and pass through untouched.
 */
export function toUtcInstant(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  let value = raw as string | number | Date;
  if (typeof value === 'string') {
    const naive = value
      .trim()
      .match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/);
    if (naive) value = `${naive[1]}T${naive[2]}Z`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Picks a lap boundary, preferring the unambiguous GMT field over the naive
 * local one. `startTimeLocal` is only reached when a payload carries no GMT
 * variant at all; it is a wall-clock reading with no offset attached, so
 * toUtcInstant can do no better than read it as UTC.
 */
function pickLapInstant(
  lap: UnknownRecord,
  gmtKeys: string[],
  localKeys: string[]
): Date | null {
  return (
    toUtcInstant(firstValue(lap, gmtKeys)) ??
    toUtcInstant(firstValue(lap, localKeys))
  );
}

export interface ExtractedLap {
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
  elevation_loss_meters: number | null;
  /** epoch ms, used only for windowing laps to the right exercise entry; not persisted */
  startMs: number;
  /** epoch ms, used only for windowing laps to the right exercise entry; not persisted */
  endMs: number;
}

export interface ExtractedGpsPoint {
  timestamp: Date;
  latitude: number;
  longitude: number;
  altitude_meters: number | null;
  speed_mps: number | null;
  heart_rate_bpm: number | null;
  respiration_rate_brpm: number | null;
  cadence: number | null;
  power_watts: number | null;
  /** epoch ms, used only for windowing points to the right exercise entry; not persisted */
  timestampMs: number;
}

export interface ExtractedHrZone {
  zone_index: number;
  zone_lower_bpm: number | null;
  zone_upper_bpm: number | null;
  seconds_in_zone: number;
}

/**
 * Extracts lap/split data from a Garmin activity or workout-session payload.
 * Accepts `payload.laps` (already-normalized) or `payload.splits.lapDTOs` (raw Garmin Connect shape).
 */
export function extractGarminLaps(payload: UnknownRecord): ExtractedLap[] {
  const splits = asRecord(payload.splits);
  const rawLaps = asArray<UnknownRecord>(payload.laps ?? splits?.lapDTOs);
  if (rawLaps.length === 0) return [];

  return rawLaps.flatMap((lap: UnknownRecord, index: number) => {
    // A lap with no usable start time is skipped rather than stamped with the
    // import time: exercise_entry_laps.start_time is NOT NULL, and a fabricated
    // "now" is indistinguishable from a real reading once stored.
    const startTime = pickLapInstant(
      lap,
      ['start_time', 'startTimeGMT'],
      ['startTimeLocal']
    );
    if (startTime === null) return [];

    const durationSeconds = Math.round(
      firstNum(lap, ['duration_seconds', 'duration', 'elapsedDuration']) ?? 0
    );
    const endTime =
      pickLapInstant(lap, ['end_time', 'endTimeGMT'], ['endTimeLocal']) ??
      new Date(startTime.getTime() + durationSeconds * 1000);

    return [
      {
        lap_index: firstInt(lap, ['lap_index', 'lapIndex']) ?? index + 1,
        start_time: startTime,
        end_time: endTime,
        duration_seconds: durationSeconds,
        // Garmin reports lap distance in metres on every path we ingest: the FIT
        // transform maps LapMesg.totalDistance (metres) onto `distance`, and
        // Garmin Connect's lapDTOs are metres too.
        distance_meters: firstNum(lap, ['distance_meters', 'distance']),
        calories: firstNum(lap, ['calories']),
        avg_heart_rate: firstInt(lap, [
          'avg_heart_rate',
          'averageHR',
          'averageHeartRateInBeatsPerMinute',
        ]),
        max_heart_rate: firstInt(lap, [
          'max_heart_rate',
          'maxHR',
          'maxHeartRateInBeatsPerMinute',
        ]),
        avg_speed_mps: firstNum(lap, ['avg_speed_mps', 'averageSpeed']),
        max_speed_mps: firstNum(lap, ['max_speed_mps', 'maxSpeed']),
        avg_cadence: firstInt(lap, [
          'avg_cadence',
          'averageRunCadence',
          'averageCadence',
        ]),
        avg_power_watts: firstNum(lap, ['avg_power_watts', 'averagePower']),
        elevation_gain_meters: firstNum(lap, [
          'elevation_gain_meters',
          'elevationGain',
        ]),
        elevation_loss_meters: firstNum(lap, [
          'elevation_loss_meters',
          'elevationLoss',
        ]),
        startMs: startTime.getTime(),
        endMs: endTime.getTime(),
      },
    ];
  });
}

/**
 * Parses a raw trackpoint time, returning null when it is missing or unusable.
 *
 * A point with no usable time is skipped rather than stamped with the import
 * time: the stored trackpoint would be indistinguishable from a real reading,
 * and _bulkInsertExerciseEntryGpsPointsWithClient orders the track by this
 * value, so fabricated "now" timestamps silently reorder the route. This mirrors
 * the same decision in extractGarminLaps above.
 */
function toTrackpointTimestamp(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const timestamp = new Date(raw as string | number | Date);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

/**
 * Extracts GPS/telemetry trackpoints from a Garmin activity or workout-session payload.
 * Tries, in order: `payload.gps_points` (already-normalized), `payload.details.activityDetailMetrics`
 * (Garmin's column-indexed metric rows, using `metricDescriptors` to find each field's index),
 * then `payload.details.geoPolylineDTO.polyline` (map-only polyline, no telemetry).
 *
 * Points without a usable timestamp are dropped — see toTrackpointTimestamp.
 */
export function extractGarminGpsPoints(
  payload: UnknownRecord
): ExtractedGpsPoint[] {
  if (Array.isArray(payload.gps_points)) {
    return asArray<UnknownRecord>(payload.gps_points).flatMap(
      (pt: UnknownRecord) => {
        const timestamp = toTrackpointTimestamp(pt.timestamp);
        if (timestamp === null) return [];
        return {
          timestamp,
          latitude: firstNum(pt, ['latitude']) ?? 0,
          longitude: firstNum(pt, ['longitude']) ?? 0,
          altitude_meters: firstNum(pt, ['altitude_meters']),
          speed_mps: firstNum(pt, ['speed_mps']),
          heart_rate_bpm: firstInt(pt, ['heart_rate_bpm']),
          respiration_rate_brpm: firstInt(pt, ['respiration_rate_brpm']),
          cadence: firstInt(pt, ['cadence']),
          power_watts: firstNum(pt, ['power_watts']),
          timestampMs: timestamp.getTime(),
        };
      }
    );
  }

  const details = asRecord(payload.details);
  const activityDetailMetrics = asArray<UnknownRecord>(
    details?.activityDetailMetrics
  );
  if (activityDetailMetrics.length > 0) {
    const descriptors = asArray<UnknownRecord>(details?.metricDescriptors);
    const getMetricIdx = (...keys: string[]) => {
      const desc = descriptors.find((d: UnknownRecord) =>
        keys.includes(d.key as string)
      );
      const idx = num(desc?.metricsIndex);
      return idx !== null ? idx : -1;
    };

    const latIdx = getMetricIdx('directLatitude', 'latitude');
    const lonIdx = getMetricIdx('directLongitude', 'longitude');
    const altIdx = getMetricIdx('directElevation', 'elevation');
    const hrIdx = getMetricIdx('directHeartRate', 'heartRate');
    const speedIdx = getMetricIdx('directSpeed', 'speed');
    // directDoubleCadence is what our own FIT importer emits
    // (fitActivityTransform.ts); directRunCadence/cadence cover Garmin
    // Connect's REST payload shapes.
    const cadIdx = getMetricIdx(
      'directDoubleCadence',
      'directRunCadence',
      'directBikeCadence',
      'cadence'
    );
    const tsIdx = getMetricIdx('directTimestamp', 'timestamp');

    return activityDetailMetrics.flatMap((metricRow: UnknownRecord) => {
      const metrics = asArray<unknown>(metricRow.metrics);
      const timestamp = toTrackpointTimestamp(
        tsIdx >= 0 ? metrics[tsIdx] : undefined
      );
      if (timestamp === null) return [];

      const lat =
        latIdx >= 0 && metrics[latIdx] !== null && metrics[latIdx] !== undefined
          ? (num(metrics[latIdx]) ?? 0)
          : 0;
      const lon =
        lonIdx >= 0 && metrics[lonIdx] !== null && metrics[lonIdx] !== undefined
          ? (num(metrics[lonIdx]) ?? 0)
          : 0;
      return {
        timestamp,
        latitude: lat,
        longitude: lon,
        altitude_meters: altIdx >= 0 ? num(metrics[altIdx]) : null,
        speed_mps: speedIdx >= 0 ? num(metrics[speedIdx]) : null,
        heart_rate_bpm: hrIdx >= 0 ? int(metrics[hrIdx]) : null,
        respiration_rate_brpm: null,
        cadence: cadIdx >= 0 ? int(metrics[cadIdx]) : null,
        power_watts: null,
        timestampMs: timestamp.getTime(),
      };
    });
  }

  const geoPolylineDTO = asRecord(details?.geoPolylineDTO);
  const polyline = asArray<UnknownRecord>(geoPolylineDTO?.polyline);
  if (polyline.length > 0) {
    return polyline.flatMap((pt: UnknownRecord) => {
      const timestamp = toTrackpointTimestamp(firstValue(pt, ['time']));
      if (timestamp === null) return [];
      return {
        timestamp,
        latitude: firstNum(pt, ['lat', 'latitude']) ?? 0,
        longitude: firstNum(pt, ['lon', 'longitude']) ?? 0,
        altitude_meters: firstNum(pt, ['altitude', 'altitude_meters']),
        speed_mps: firstNum(pt, ['speed']),
        heart_rate_bpm: firstInt(pt, ['heartRate', 'bpm']),
        respiration_rate_brpm: firstInt(pt, ['respiration']),
        cadence: firstInt(pt, ['cadence']),
        power_watts: firstNum(pt, ['power']),
        timestampMs: timestamp.getTime(),
      };
    });
  }

  return [];
}

/**
 * Extracts heart-rate time-in-zone splits from Garmin's `hr_in_timezones` payload
 * (python-garminconnect `get_activity_hr_in_timezones`, a list of per-zone objects).
 * The upper bound of each zone is inferred from the next zone's lower bound when the
 * list is sorted by zone number, since Garmin only reports the lower boundary per zone.
 */
export function extractGarminHrZones(
  payload: UnknownRecord
): ExtractedHrZone[] {
  const rawZones = asArray<UnknownRecord>(payload.hr_in_timezones);
  if (rawZones.length === 0) return [];

  const normalized = rawZones
    .map((zone: UnknownRecord) => ({
      // Keep this nullable rather than defaulting to 0: a missing zone-index
      // key and a genuine zero-indexed zone are otherwise indistinguishable,
      // and the old `?? 0` sentinel dropped every zone 0 for sources that
      // index zones from 0 (filtered out below by `zone_index > 0`).
      zone_index: firstInt(zone, [
        'zone_index',
        'zoneNumber',
        'zone_number',
        'zone',
      ]),
      zone_lower_bpm: firstNum(zone, [
        'zone_lower_bpm',
        'zoneLowBoundary',
        'zone_low_boundary',
        'lowerBound',
      ]),
      seconds_in_zone:
        firstInt(zone, ['seconds_in_zone', 'secsInZone', 'secs_in_zone']) ?? 0,
    }))
    .filter(
      (zone): zone is typeof zone & { zone_index: number } =>
        zone.zone_index !== null && zone.zone_index >= 0
    )
    .sort((a, b) => a.zone_index - b.zone_index);

  return normalized.map((zone, index) => ({
    zone_index: zone.zone_index,
    zone_lower_bpm: zone.zone_lower_bpm,
    zone_upper_bpm:
      index + 1 < normalized.length &&
      normalized[index + 1].zone_lower_bpm !== null
        ? (normalized[index + 1].zone_lower_bpm as number) - 1
        : null,
    seconds_in_zone: zone.seconds_in_zone,
  }));
}

export interface GarminExerciseEntryTelemetry {
  max_heart_rate: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_cadence: number | null;
  max_cadence: number | null;
  elevation_gain_meters: number | null;
  elevation_loss_meters: number | null;
  floors_climbed: number | null;
  vo2_max_estimate: number | null;
  moving_time_seconds: number | null;
  elapsed_time_seconds: number | null;
  resting_calories: number | null;
  active_calories: number | null;
  avg_moving_speed_mps: number | null;
  min_elevation_meters: number | null;
  max_elevation_meters: number | null;
  weather_temp_celsius: number | null;
  weather_condition: string | null;
  weather_wind_speed_mps: number | null;
  weather_humidity_percentage: number | null;
  gear_name: string | null;
  gear_external_id: string | null;
}

/**
 * Derives the exercise_entries telemetry columns (added in 20260730000000 and
 * 20260731000000) from a Garmin activity payload. Shared by the live simple-activity
 * sync path (garminActivityProcessor.ts) and the one-off backfill script
 * (scripts/backfillWorkoutTelemetry.script.ts) so this field mapping only exists once.
 */
export function extractGarminTelemetryFields(
  payload: UnknownRecord
): GarminExerciseEntryTelemetry {
  const activity = asRecord(payload.activity) ?? {};

  const maxHR = firstInt(activity, ['maxHR', 'maxHeartRateInBeatsPerMinute']);
  const avgCadence = firstInt(activity, [
    'averageRunningCadenceInStepsPerMinute',
    'averageCadence',
  ]);
  const maxCadence = firstInt(activity, [
    'maxRunningCadenceInStepsPerMinute',
    'maxCadence',
  ]);

  const movingDuration = firstNum(activity, ['movingDuration']);
  const movingTimeSeconds =
    movingDuration !== null ? Math.round(movingDuration * 60) : null;

  const elapsedDuration = firstNum(activity, ['elapsedDuration']);
  const elapsedTimeSeconds =
    elapsedDuration !== null ? Math.round(elapsedDuration * 60) : null;

  const restingCalories = firstInt(activity, ['bmrCalories']);
  const activeCaloriesValue = firstInt(activity, ['active_calories']);

  const weather = asRecord(payload.weather) ?? {};
  const rawWeatherTemp = firstNum(weather, [
    'temp',
    'apparentTemp',
    'currentTemp',
  ]);
  const weatherTempCelsius =
    rawWeatherTemp !== null ? ((rawWeatherTemp - 32) * 5) / 9 : null;

  const rawWindSpeed = firstNum(weather, ['windSpeed']);
  const weatherWindSpeedMps =
    rawWindSpeed !== null ? rawWindSpeed * 0.44704 : null;

  const weatherTypeDTO = asRecord(weather.weatherTypeDTO);
  const weatherCondition = str(weatherTypeDTO?.desc) ?? str(weather.conditions);

  const gearArr = asArray<UnknownRecord>(payload.gear);
  const rawGear =
    gearArr.length > 0 ? gearArr[0] : (asRecord(payload.gear) ?? {});

  const gearName =
    str(rawGear.displayName) ??
    str(rawGear.customMakeModel) ??
    str(rawGear.gearMakeName);

  const gearPkVal = firstValue(rawGear, ['uuid', 'gearPk']);
  const gearExternalId =
    gearPkVal !== undefined && gearPkVal !== null ? String(gearPkVal) : null;

  return {
    max_heart_rate: maxHR,
    avg_speed_mps: firstNum(activity, ['averageSpeed']),
    max_speed_mps: firstNum(activity, ['maxSpeed']),
    avg_cadence: avgCadence,
    max_cadence: maxCadence,
    elevation_gain_meters: firstNum(activity, [
      'elevationGain',
      'elevationCorrectedGain',
    ]),
    elevation_loss_meters: firstNum(activity, [
      'elevationLoss',
      'elevationCorrectedLoss',
    ]),
    floors_climbed: firstInt(activity, ['floorsClimbed']),
    vo2_max_estimate: firstNum(activity, ['vo2MaxEstimate', 'vO2MaxValue']),
    moving_time_seconds: movingTimeSeconds,
    elapsed_time_seconds: elapsedTimeSeconds,
    resting_calories: restingCalories,
    active_calories: activeCaloriesValue,
    avg_moving_speed_mps: firstNum(activity, [
      'averageMovingSpeed',
      'avgMovingSpeed',
    ]),
    min_elevation_meters: firstNum(activity, ['minElevation']),
    max_elevation_meters: firstNum(activity, ['maxElevation']),
    weather_temp_celsius: weatherTempCelsius,
    weather_condition: weatherCondition,
    weather_wind_speed_mps: weatherWindSpeedMps,
    weather_humidity_percentage: firstNum(weather, ['relativeHumidity']),
    gear_name: gearName,
    gear_external_id: gearExternalId,
  };
}

/**
 * Finds the exercise-entry group whose [startMs, endMs] window contains the given
 * timestamp. Falls back to the first group so telemetry outside every group's window
 * (e.g. a warm-up lap before set tracking started) isn't silently dropped.
 */
export function findGroupForTimestamp<
  T extends { startMs: number | null; endMs: number | null },
>(groups: T[], timestampMs: number): T | undefined {
  const match = groups.find(
    (g) =>
      g.startMs !== null &&
      g.endMs !== null &&
      timestampMs >= g.startMs &&
      timestampMs <= g.endMs
  );
  return match ?? groups[0];
}
