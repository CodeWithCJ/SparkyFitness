// Shared extraction of Garmin Connect's raw REST JSON (laps/splits, GPS/activity-detail
// metrics, and HR time-in-zone) into the relational shapes consumed by
// workoutTelemetryRepository. This is intentionally provider-shaped (Garmin field names
// in, camelCase/PascalCase variants tolerated) but produces a provider-neutral output.
//
// Used by both live sync (garminActivityProcessor.ts, session and simple-activity paths)
// and the one-off backfill script (scripts/backfillWorkoutTelemetry.ts) so the parsing
// logic only exists once — the "rule of two" in AGENTS.md applies here since this is
// already the third caller if you count both processor paths as one.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

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
export function extractGarminLaps(payload: AnyRecord): ExtractedLap[] {
  const rawLaps: AnyRecord[] = payload?.laps || payload?.splits?.lapDTOs || [];
  if (!Array.isArray(rawLaps) || rawLaps.length === 0) return [];

  return rawLaps.map((lap: AnyRecord, index: number) => {
    const startTime = lap.startTimeLocal
      ? new Date(lap.startTimeLocal)
      : lap.startTimeGMT
        ? new Date(lap.startTimeGMT)
        : new Date();
    const durationSeconds = Math.round(
      Number(lap.duration_seconds ?? lap.duration ?? lap.elapsedDuration ?? 0)
    );
    const endTime = lap.endTimeLocal
      ? new Date(lap.endTimeLocal)
      : lap.endTimeGMT
        ? new Date(lap.endTimeGMT)
        : new Date(startTime.getTime() + durationSeconds * 1000);

    return {
      lap_index: lap.lap_index ?? lap.lapIndex ?? index + 1,
      start_time: startTime,
      end_time: endTime,
      duration_seconds: durationSeconds,
      distance_meters:
        lap.distance_meters !== undefined && lap.distance_meters !== null
          ? Number(lap.distance_meters)
          : lap.distance !== undefined && lap.distance !== null
            ? Number(lap.distance) * (lap.distance < 100 ? 1000 : 1)
            : null,
      calories:
        lap.calories !== undefined && lap.calories !== null
          ? Number(lap.calories)
          : null,
      avg_heart_rate:
        lap.avg_heart_rate !== undefined && lap.avg_heart_rate !== null
          ? Math.round(Number(lap.avg_heart_rate))
          : lap.averageHR !== undefined && lap.averageHR !== null
            ? Math.round(Number(lap.averageHR))
            : lap.averageHeartRateInBeatsPerMinute !== undefined &&
                lap.averageHeartRateInBeatsPerMinute !== null
              ? Math.round(Number(lap.averageHeartRateInBeatsPerMinute))
              : null,
      max_heart_rate:
        lap.max_heart_rate !== undefined && lap.max_heart_rate !== null
          ? Math.round(Number(lap.max_heart_rate))
          : lap.maxHR !== undefined && lap.maxHR !== null
            ? Math.round(Number(lap.maxHR))
            : lap.maxHeartRateInBeatsPerMinute !== undefined &&
                lap.maxHeartRateInBeatsPerMinute !== null
              ? Math.round(Number(lap.maxHeartRateInBeatsPerMinute))
              : null,
      avg_speed_mps:
        lap.avg_speed_mps !== undefined && lap.avg_speed_mps !== null
          ? Number(lap.avg_speed_mps)
          : lap.averageSpeed !== undefined && lap.averageSpeed !== null
            ? Number(lap.averageSpeed)
            : null,
      max_speed_mps:
        lap.max_speed_mps !== undefined && lap.max_speed_mps !== null
          ? Number(lap.max_speed_mps)
          : lap.maxSpeed !== undefined && lap.maxSpeed !== null
            ? Number(lap.maxSpeed)
            : null,
      avg_cadence:
        lap.avg_cadence !== undefined && lap.avg_cadence !== null
          ? Math.round(Number(lap.avg_cadence))
          : lap.averageRunCadence !== undefined &&
              lap.averageRunCadence !== null
            ? Math.round(Number(lap.averageRunCadence))
            : lap.averageCadence !== undefined && lap.averageCadence !== null
              ? Math.round(Number(lap.averageCadence))
              : null,
      avg_power_watts:
        lap.avg_power_watts !== undefined && lap.avg_power_watts !== null
          ? Number(lap.avg_power_watts)
          : lap.averagePower !== undefined && lap.averagePower !== null
            ? Number(lap.averagePower)
            : null,
      elevation_gain_meters:
        lap.elevation_gain_meters !== undefined &&
        lap.elevation_gain_meters !== null
          ? Number(lap.elevation_gain_meters)
          : lap.elevationGain !== undefined && lap.elevationGain !== null
            ? Number(lap.elevationGain)
            : null,
      elevation_loss_meters:
        lap.elevation_loss_meters !== undefined &&
        lap.elevation_loss_meters !== null
          ? Number(lap.elevation_loss_meters)
          : lap.elevationLoss !== undefined && lap.elevationLoss !== null
            ? Number(lap.elevationLoss)
            : null,
      startMs: startTime.getTime(),
      endMs: endTime.getTime(),
    };
  });
}

/**
 * Extracts GPS/telemetry trackpoints from a Garmin activity or workout-session payload.
 * Tries, in order: `payload.gps_points` (already-normalized), `payload.details.activityDetailMetrics`
 * (Garmin's column-indexed metric rows, using `metricDescriptors` to find each field's index),
 * then `payload.details.geoPolylineDTO.polyline` (map-only polyline, no telemetry).
 */
export function extractGarminGpsPoints(
  payload: AnyRecord
): ExtractedGpsPoint[] {
  if (Array.isArray(payload?.gps_points)) {
    return payload.gps_points.map((pt: AnyRecord) => {
      const timestamp = pt.timestamp ? new Date(pt.timestamp) : new Date();
      return {
        timestamp,
        latitude: pt.latitude ?? 0,
        longitude: pt.longitude ?? 0,
        altitude_meters: pt.altitude_meters ?? null,
        speed_mps: pt.speed_mps ?? null,
        heart_rate_bpm: pt.heart_rate_bpm ?? null,
        respiration_rate_brpm: pt.respiration_rate_brpm ?? null,
        cadence: pt.cadence ?? null,
        power_watts: pt.power_watts ?? null,
        timestampMs: timestamp.getTime(),
      };
    });
  }

  const activityDetailMetrics = payload?.details?.activityDetailMetrics;
  if (Array.isArray(activityDetailMetrics)) {
    const descriptors: AnyRecord[] = payload?.details?.metricDescriptors || [];
    const getMetricIdx = (key: string, altKey?: string) => {
      const desc = descriptors.find(
        (d: AnyRecord) => d.key === key || (altKey && d.key === altKey)
      );
      return desc && desc.metricsIndex !== undefined ? desc.metricsIndex : -1;
    };

    const latIdx = getMetricIdx('directLatitude', 'latitude');
    const lonIdx = getMetricIdx('directLongitude', 'longitude');
    const altIdx = getMetricIdx('directElevation', 'elevation');
    const hrIdx = getMetricIdx('directHeartRate', 'heartRate');
    const speedIdx = getMetricIdx('directSpeed', 'speed');
    const cadIdx = getMetricIdx('directRunCadence', 'cadence');
    const tsIdx = getMetricIdx('directTimestamp', 'timestamp');

    return activityDetailMetrics
      .map((metricRow: AnyRecord) => {
        const metrics = metricRow.metrics || [];
        const lat =
          latIdx >= 0 &&
          metrics[latIdx] !== null &&
          metrics[latIdx] !== undefined
            ? metrics[latIdx]
            : 0;
        const lon =
          lonIdx >= 0 &&
          metrics[lonIdx] !== null &&
          metrics[lonIdx] !== undefined
            ? metrics[lonIdx]
            : 0;
        const timestamp =
          tsIdx >= 0 && metrics[tsIdx] ? new Date(metrics[tsIdx]) : new Date();
        return {
          timestamp,
          latitude: lat,
          longitude: lon,
          altitude_meters: altIdx >= 0 ? metrics[altIdx] : null,
          speed_mps: speedIdx >= 0 ? metrics[speedIdx] : null,
          heart_rate_bpm:
            hrIdx >= 0 &&
            metrics[hrIdx] !== null &&
            metrics[hrIdx] !== undefined
              ? Math.round(Number(metrics[hrIdx]))
              : null,
          respiration_rate_brpm: null,
          cadence:
            cadIdx >= 0 &&
            metrics[cadIdx] !== null &&
            metrics[cadIdx] !== undefined
              ? Math.round(Number(metrics[cadIdx]))
              : null,
          power_watts: null,
          timestampMs: timestamp.getTime(),
        };
      })
      .filter(Boolean);
  }

  const polyline = payload?.details?.geoPolylineDTO?.polyline;
  if (Array.isArray(polyline)) {
    return polyline.map((pt: AnyRecord) => {
      const timestamp = pt.time ? new Date(pt.time) : new Date();
      return {
        timestamp,
        latitude: pt.lat ?? pt.latitude ?? 0,
        longitude: pt.lon ?? pt.longitude ?? 0,
        altitude_meters: pt.altitude ?? pt.altitude_meters ?? null,
        speed_mps: pt.speed ?? null,
        heart_rate_bpm: pt.heartRate ?? pt.bpm ?? null,
        respiration_rate_brpm: pt.respiration ?? null,
        cadence: pt.cadence ?? null,
        power_watts: pt.power ?? null,
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
export function extractGarminHrZones(payload: AnyRecord): ExtractedHrZone[] {
  const rawZones: AnyRecord[] = payload?.hr_in_timezones || [];
  if (!Array.isArray(rawZones) || rawZones.length === 0) return [];

  const normalized = rawZones
    .map((zone: AnyRecord) => ({
      zone_index: Number(
        zone.zone_index ?? zone.zoneNumber ?? zone.zone_number ?? zone.zone ?? 0
      ),
      zone_lower_bpm:
        zone.zone_lower_bpm ??
        zone.zoneLowBoundary ??
        zone.zone_low_boundary ??
        zone.lowerBound ??
        null,
      seconds_in_zone: Math.round(
        Number(
          zone.seconds_in_zone ?? zone.secsInZone ?? zone.secs_in_zone ?? 0
        )
      ),
    }))
    .filter((zone) => zone.zone_index > 0)
    .sort((a, b) => a.zone_index - b.zone_index);

  return normalized.map((zone, index) => ({
    zone_index: zone.zone_index,
    zone_lower_bpm:
      zone.zone_lower_bpm !== null ? Number(zone.zone_lower_bpm) : null,
    zone_upper_bpm:
      index + 1 < normalized.length &&
      normalized[index + 1].zone_lower_bpm !== null
        ? Number(normalized[index + 1].zone_lower_bpm) - 1
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
  payload: AnyRecord
): GarminExerciseEntryTelemetry {
  const activity: AnyRecord = payload?.activity ?? {};

  const maxHR =
    activity.maxHR || activity.maxHeartRateInBeatsPerMinute
      ? Math.round(activity.maxHR || activity.maxHeartRateInBeatsPerMinute)
      : null;
  const avgCadence = activity.averageRunningCadenceInStepsPerMinute
    ? Math.round(activity.averageRunningCadenceInStepsPerMinute)
    : activity.averageCadence
      ? Math.round(activity.averageCadence)
      : null;
  const maxCadence = activity.maxRunningCadenceInStepsPerMinute
    ? Math.round(activity.maxRunningCadenceInStepsPerMinute)
    : activity.maxCadence
      ? Math.round(activity.maxCadence)
      : null;

  // Garmin reports elapsed/moving duration in minutes after service.py's unit
  // conversion (same as activity.duration); convert to seconds for our columns.
  const movingTimeSeconds =
    activity.movingDuration !== undefined && activity.movingDuration !== null
      ? Math.round(activity.movingDuration * 60)
      : null;
  const elapsedTimeSeconds =
    activity.elapsedDuration !== undefined && activity.elapsedDuration !== null
      ? Math.round(activity.elapsedDuration * 60)
      : null;
  const restingCalories =
    activity.bmrCalories !== undefined && activity.bmrCalories !== null
      ? Math.round(activity.bmrCalories)
      : null;
  const activeCaloriesValue =
    activity.active_calories !== undefined && activity.active_calories !== null
      ? Math.round(activity.active_calories)
      : null;

  // Garmin's activity-weather endpoint returns Fahrenheit and mph regardless of
  // the user's Garmin Connect unit preference (it's a separate imperial-native
  // weather backend, unlike the main fitness metrics which are metric-native).
  // Confirmed for temp via a real synced value (72.0 — a plausible running
  // temperature in F, physically impossible as C). Wind speed is inferred from
  // the same payload/backend rather than independently confirmed.
  const weather: AnyRecord = payload?.weather ?? {};
  const rawWeatherTemp =
    weather?.temp ?? weather?.apparentTemp ?? weather?.currentTemp ?? null;
  const weatherTempCelsius =
    rawWeatherTemp !== null ? ((rawWeatherTemp - 32) * 5) / 9 : null;
  const rawWindSpeed = weather?.windSpeed ?? null;
  const weatherWindSpeedMps =
    rawWindSpeed !== null ? rawWindSpeed * 0.44704 : null;
  const weatherCondition =
    weather?.weatherTypeDTO?.desc ?? weather?.conditions ?? null;

  const rawGear: AnyRecord = Array.isArray(payload?.gear)
    ? payload.gear[0]
    : (payload?.gear ?? {});
  const gearName =
    rawGear?.displayName ??
    rawGear?.customMakeModel ??
    rawGear?.gearMakeName ??
    null;
  const gearExternalId =
    rawGear?.uuid?.toString() ?? rawGear?.gearPk?.toString() ?? null;

  return {
    max_heart_rate: maxHR,
    avg_speed_mps: activity.averageSpeed ?? null,
    max_speed_mps: activity.maxSpeed ?? null,
    avg_cadence: avgCadence,
    max_cadence: maxCadence,
    elevation_gain_meters:
      activity.elevationGain ?? activity.elevationCorrectedGain ?? null,
    elevation_loss_meters:
      activity.elevationLoss ?? activity.elevationCorrectedLoss ?? null,
    floors_climbed: activity.floorsClimbed ?? null,
    vo2_max_estimate: activity.vo2MaxEstimate ?? activity.vO2MaxValue ?? null,
    moving_time_seconds: movingTimeSeconds,
    elapsed_time_seconds: elapsedTimeSeconds,
    resting_calories: restingCalories,
    active_calories: activeCaloriesValue,
    avg_moving_speed_mps:
      activity.averageMovingSpeed ?? activity.avgMovingSpeed ?? null,
    min_elevation_meters: activity.minElevation ?? null,
    max_elevation_meters: activity.maxElevation ?? null,
    weather_temp_celsius: weatherTempCelsius,
    weather_condition: weatherCondition,
    weather_wind_speed_mps: weatherWindSpeedMps,
    weather_humidity_percentage: weather?.relativeHumidity ?? null,
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
