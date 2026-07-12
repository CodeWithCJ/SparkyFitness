import { createHash } from 'node:crypto';
import type {
  ActivityMesg,
  FitMessages,
  LapMesg,
  RecordMesg,
  SessionMesg,
  TimeInZoneMesg,
} from '@garmin/fitsdk';
import { instantToDay } from '@workspace/shared';

// FIT timestamps count seconds from 1989-12-31T00:00:00Z.
const FIT_EPOCH_MS = 631065600000;
const SEMICIRCLES_TO_DEGREES = 180 / 2 ** 31;
// A valid-but-pathological file must not exhaust memory or write enormous JSONB.
const MAX_RECORD_COUNT = 100_000;
const MAX_DETAIL_DATA_BYTES = 10 * 1024 * 1024;
// Sports where FIT cadence is strides/min (one leg); steps/min doubles it.
const DOUBLED_CADENCE_SPORTS = new Set(['running', 'walking', 'hiking']);

export interface FitEntryData {
  duration_minutes: number;
  calories_burned: number;
  entry_date?: string;
  distance: number | null;
  avg_heart_rate: number | null;
  steps: number | null;
  notes: string;
  source_id: string;
}

interface MetricDescriptor {
  key: string;
  metricsIndex: number;
}

interface LapDto {
  lapIndex: number;
  distance?: number;
  duration?: number;
  movingDuration?: number;
  elapsedDuration?: number;
  averageSpeed?: number;
  averageMovingSpeed?: number;
  maxSpeed?: number;
  averageHR?: number;
  maxHR?: number;
  averageRunCadence?: number;
  maxRunCadence?: number;
  calories?: number;
  elevationGain?: number;
  elevationLoss?: number;
}

interface HrZoneDto {
  zoneNumber: number;
  zoneLowBoundary: number;
  secsInZone: number;
}

export interface FitDetailData {
  activity: Record<string, unknown>;
  details: {
    metricDescriptors: MetricDescriptor[];
    activityDetailMetrics: { metrics: (number | null)[] }[];
    geoPolylineDTO?: { polyline: { lat: number; lon: number }[] };
  };
  splits: { lapDTOs: LapDto[] };
  hr_in_timezones: HrZoneDto[];
}

export type FitTransformResult =
  | {
      ok: true;
      kind: 'simple' | 'strength';
      entryData: FitEntryData;
      detailData: FitDetailData;
      sourceId: string;
      /** Device-local day; null when the file carries no local-time info. */
      entryDate: string | null;
      startTime: Date;
      activityName: string;
      /** Garmin Connect style snake_case type key, e.g. "tennis". */
      sport: string;
      warnings: string[];
    }
  | { ok: false; reason: string };

/**
 * Converts a FIT time value to a UTC ms epoch. The SDK converts most
 * timestamps to Date, but localDateTime fields (activity.localTimestamp)
 * arrive as raw FIT-epoch seconds.
 */
function fitTimeToMs(value: number | Date | undefined): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value * 1000 + FIT_EPOCH_MS;
  return null;
}

/** "trailRunning" -> "trail_running" (Garmin Connect typeKey style). */
function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** "trail_running" -> "Trail Running" (fallback activity name). */
function toTitleCase(value: string): string {
  return value
    .split('_')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function semicirclesToDegrees(value: number): number {
  return value * SEMICIRCLES_TO_DEGREES;
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Computes the device-local UTC offset in ms from the paired timestamp and
 * localTimestamp fields of the activity message, or null when unavailable.
 */
function deriveLocalOffsetMs(
  activityMesg: ActivityMesg | undefined
): number | null {
  if (!activityMesg) return null;
  const utcMs = fitTimeToMs(activityMesg.timestamp);
  const localMs = fitTimeToMs(activityMesg.localTimestamp);
  if (utcMs === null || localMs === null) return null;
  return localMs - utcMs;
}

function buildRecordMetrics(
  records: RecordMesg[],
  cadenceMultiplier: number
): {
  metricDescriptors: MetricDescriptor[];
  activityDetailMetrics: { metrics: (number | null)[] }[];
  polyline: { lat: number; lon: number }[];
} {
  let hasHeartRate = false;
  let hasDistance = false;
  let hasSpeed = false;
  let hasElevation = false;
  let hasCadence = false;
  for (const record of records) {
    if (record.heartRate !== undefined) hasHeartRate = true;
    if (record.distance !== undefined) hasDistance = true;
    if (record.enhancedSpeed !== undefined || record.speed !== undefined)
      hasSpeed = true;
    if (record.enhancedAltitude !== undefined || record.altitude !== undefined)
      hasElevation = true;
    if (record.cadence !== undefined) hasCadence = true;
  }

  const metricDescriptors: MetricDescriptor[] = [];
  const addDescriptor = (key: string) =>
    metricDescriptors.push({ key, metricsIndex: metricDescriptors.length });
  addDescriptor('directTimestamp');
  if (hasHeartRate) addDescriptor('directHeartRate');
  if (hasDistance) addDescriptor('sumDistance');
  if (hasSpeed) addDescriptor('directSpeed');
  if (hasElevation) addDescriptor('directElevation');
  if (hasCadence) addDescriptor('directDoubleCadence');

  const activityDetailMetrics: { metrics: (number | null)[] }[] = [];
  const polyline: { lat: number; lon: number }[] = [];
  for (const record of records) {
    const timestampMs = fitTimeToMs(record.timestamp);
    if (timestampMs === null) continue;
    const metrics: (number | null)[] = [timestampMs];
    if (hasHeartRate) metrics.push(record.heartRate ?? null);
    if (hasDistance) metrics.push(record.distance ?? null);
    if (hasSpeed) metrics.push(record.enhancedSpeed ?? record.speed ?? null);
    if (hasElevation)
      metrics.push(record.enhancedAltitude ?? record.altitude ?? null);
    if (hasCadence)
      metrics.push(
        record.cadence !== undefined
          ? (record.cadence + (record.fractionalCadence ?? 0)) *
              cadenceMultiplier
          : null
      );
    activityDetailMetrics.push({ metrics });
    if (record.positionLat !== undefined && record.positionLong !== undefined) {
      polyline.push({
        lat: semicirclesToDegrees(record.positionLat),
        lon: semicirclesToDegrees(record.positionLong),
      });
    }
  }
  return { metricDescriptors, activityDetailMetrics, polyline };
}

function buildLapDtos(laps: LapMesg[], cadenceMultiplier: number): LapDto[] {
  return laps.map((lap, index) => {
    const dto: LapDto = { lapIndex: index + 1 };
    if (lap.totalDistance !== undefined) dto.distance = lap.totalDistance;
    if (lap.totalTimerTime !== undefined) {
      dto.duration = lap.totalTimerTime;
      dto.movingDuration = lap.totalTimerTime;
    }
    if (lap.totalElapsedTime !== undefined)
      dto.elapsedDuration = lap.totalElapsedTime;
    const averageSpeed = lap.enhancedAvgSpeed ?? lap.avgSpeed;
    if (averageSpeed !== undefined) {
      dto.averageSpeed = averageSpeed;
      dto.averageMovingSpeed = averageSpeed;
    }
    const maxSpeed = lap.enhancedMaxSpeed ?? lap.maxSpeed;
    if (maxSpeed !== undefined) dto.maxSpeed = maxSpeed;
    if (lap.avgHeartRate !== undefined) dto.averageHR = lap.avgHeartRate;
    if (lap.maxHeartRate !== undefined) dto.maxHR = lap.maxHeartRate;
    if (lap.avgCadence !== undefined)
      dto.averageRunCadence = lap.avgCadence * cadenceMultiplier;
    if (lap.maxCadence !== undefined)
      dto.maxRunCadence = lap.maxCadence * cadenceMultiplier;
    if (lap.totalCalories !== undefined) dto.calories = lap.totalCalories;
    if (lap.totalAscent !== undefined) dto.elevationGain = lap.totalAscent;
    if (lap.totalDescent !== undefined) dto.elevationLoss = lap.totalDescent;
    return dto;
  });
}

function buildHrZones(
  timeInZoneMesgs: TimeInZoneMesg[] | undefined
): HrZoneDto[] {
  const sessionZones =
    timeInZoneMesgs?.find((mesg) => mesg.referenceMesg === 'session') ??
    timeInZoneMesgs?.[0];
  if (!sessionZones?.timeInHrZone) return [];
  const boundaries = sessionZones.hrZoneHighBoundary ?? [];
  return sessionZones.timeInHrZone.map((secsInZone, index) => ({
    zoneNumber: index,
    zoneLowBoundary: index === 0 ? 0 : (boundaries[index - 1] ?? 0),
    secsInZone,
  }));
}

/**
 * Transforms decoded FIT messages into the exercise-entry row data and the
 * `detail_data` blob the Garmin Connect sync stores, so imports render in the
 * existing Reports UI unchanged. Pure: no I/O.
 */
function transformFitActivity(
  messages: FitMessages,
  buffer: Buffer
): FitTransformResult {
  const sessions: SessionMesg[] = messages.sessionMesgs ?? [];
  if (sessions.length === 0) {
    return { ok: false, reason: 'No activity session found in file.' };
  }
  if (sessions.length > 1) {
    return { ok: false, reason: 'Multi-session FIT files are not supported.' };
  }
  const session = sessions[0];
  const startTimeMs = fitTimeToMs(session.startTime);
  if (startTimeMs === null) {
    return { ok: false, reason: 'Activity session has no start time.' };
  }
  const records = messages.recordMesgs ?? [];
  if (records.length > MAX_RECORD_COUNT) {
    return {
      ok: false,
      reason: `File contains ${records.length} data records (limit ${MAX_RECORD_COUNT}).`,
    };
  }

  const warnings: string[] = [];
  const sport =
    typeof session.sport === 'string' ? toSnakeCase(session.sport) : 'generic';
  const subSport =
    typeof session.subSport === 'string' ? toSnakeCase(session.subSport) : '';
  const kind: 'simple' | 'strength' =
    sport === 'training' ||
    subSport === 'strength_training' ||
    (messages.setMesgs?.length ?? 0) > 0
      ? 'strength'
      : 'simple';
  const activityName =
    messages.sportMesgs?.[0]?.name ??
    session.sportProfileName ??
    toTitleCase(sport);
  const cadenceMultiplier = DOUBLED_CADENCE_SPORTS.has(sport) ? 2 : 1;

  const fileId = messages.fileIdMesgs?.[0];
  const timeCreatedMs = fitTimeToMs(fileId?.timeCreated);
  const sourceId =
    fileId?.serialNumber !== undefined && timeCreatedMs !== null
      ? `${fileId.serialNumber}_${Math.floor(timeCreatedMs / 1000)}`
      : sha256Hex(buffer);

  const localOffsetMs = deriveLocalOffsetMs(messages.activityMesgs?.[0]);
  let entryDate: string | null = null;
  let startTimeLocal: string | undefined;
  if (localOffsetMs !== null) {
    const shiftedStart = new Date(startTimeMs + localOffsetMs);
    entryDate = instantToDay(shiftedStart, 'UTC');
    // The shifted instant's UTC rendering IS device-local wall time.
    startTimeLocal = shiftedStart.toISOString().slice(0, 19);
  } else {
    warnings.push(
      'File has no device-local time; the entry date falls back to your profile timezone.'
    );
  }

  const durationSeconds =
    session.totalTimerTime ?? session.totalElapsedTime ?? 0;
  const distanceKm =
    session.totalDistance !== undefined ? session.totalDistance / 1000 : null;
  const averageSpeed = session.enhancedAvgSpeed ?? session.avgSpeed;
  const strides = session.totalStrides ?? session.totalCycles;
  const steps =
    cadenceMultiplier === 2 && strides !== undefined
      ? Math.round(strides * 2)
      : null;

  // Field names double as the frontend's provider detection: Garmin units are
  // minutes/km, so Strava/Fitbit marker keys (sport_type, moving_time,
  // elapsed_time, activeDuration, averageHeartRate, logId) must never appear.
  const activity: Record<string, unknown> = {
    activityName,
    activityType: { typeKey: sport },
    duration: durationSeconds / 60,
    calories: session.totalCalories ?? 0,
    active_calories: session.totalCalories ?? 0,
  };
  if (distanceKm !== null) activity.distance = distanceKm;
  if (session.avgHeartRate !== undefined)
    activity.averageHR = session.avgHeartRate;
  if (session.maxHeartRate !== undefined) activity.maxHR = session.maxHeartRate;
  if (averageSpeed !== undefined) activity.averageSpeed = averageSpeed;
  if (session.avgCadence !== undefined)
    activity.averageRunCadenceInStepsPerMinute =
      session.avgCadence * cadenceMultiplier;
  if (session.totalAscent !== undefined)
    activity.totalAscent = session.totalAscent;
  if (session.totalDescent !== undefined)
    activity.totalDescent = session.totalDescent;
  if (steps !== null) activity.steps = steps;
  if (startTimeLocal !== undefined) activity.startTimeLocal = startTimeLocal;

  const { metricDescriptors, activityDetailMetrics, polyline } =
    buildRecordMetrics(records, cadenceMultiplier);
  const detailData: FitDetailData = {
    activity,
    details: { metricDescriptors, activityDetailMetrics },
    splits: {
      lapDTOs: buildLapDtos(messages.lapMesgs ?? [], cadenceMultiplier),
    },
    hr_in_timezones: buildHrZones(messages.timeInZoneMesgs),
  };
  if (polyline.length > 0) {
    detailData.details.geoPolylineDTO = { polyline };
  }

  const detailDataBytes = Buffer.byteLength(JSON.stringify(detailData));
  if (detailDataBytes > MAX_DETAIL_DATA_BYTES) {
    return {
      ok: false,
      reason: `Decoded activity data is ${Math.round(detailDataBytes / (1024 * 1024))}MB (limit ${MAX_DETAIL_DATA_BYTES / (1024 * 1024)}MB).`,
    };
  }

  const entryData: FitEntryData = {
    duration_minutes: durationSeconds / 60,
    calories_burned: Math.round(session.totalCalories ?? 0),
    distance: distanceKm,
    avg_heart_rate:
      session.avgHeartRate !== undefined
        ? Math.round(session.avgHeartRate)
        : null,
    steps,
    notes: `Garmin FIT Import: ${activityName} (${sport})`,
    source_id: sourceId,
  };

  return {
    ok: true,
    kind,
    entryData,
    detailData,
    sourceId,
    entryDate,
    startTime: new Date(startTimeMs),
    activityName,
    sport,
    warnings,
  };
}

export { transformFitActivity };
export default { transformFitActivity };
