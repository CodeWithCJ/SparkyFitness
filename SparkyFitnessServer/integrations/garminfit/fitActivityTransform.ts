import { createHash } from 'node:crypto';
import type {
  ActivityMesg,
  FitMessages,
  LapMesg,
  RecordMesg,
  SessionMesg,
  SetMesg,
  TimeInZoneMesg,
} from '@garmin/fitsdk';
import { Profile } from '@garmin/fitsdk';
import { instantToDay } from '@workspace/shared';

// FIT timestamps count seconds from 1989-12-31T00:00:00Z.
const FIT_EPOCH_MS = 631065600000;
const SEMICIRCLES_TO_DEGREES = 180 / 2 ** 31;
// A valid-but-pathological file must not exhaust memory or write enormous JSONB.
const MAX_RECORD_COUNT = 100_000;
const MAX_SET_COUNT = 10_000;
// The strength parser resolves exercise titles per set message, so an uncapped
// title or step count makes decode cost quadratic in adversarial files.
const MAX_EXERCISE_TITLE_COUNT = 1_000;
const MAX_WORKOUT_STEP_COUNT = 1_000;
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
  training_load?: number | null;
}

interface MetricDescriptor {
  key: string;
  metricsIndex: number;
}

interface LapDto {
  lapIndex: number;
  /**
   * ISO-8601 UTC instant. extractGarminLaps drops any lap without a usable
   * start time (exercise_entry_laps.start_time is NOT NULL), so omitting this
   * silently discarded every lap in every FIT import. Named *GMT — not *Local —
   * because it is a real UTC instant: the Garmin Connect *Local variants are
   * naive wall-clock strings the extractor has to guess a zone for.
   */
  startTimeGMT?: string;
  /** ISO-8601 UTC instant; LapMesg.timestamp is the lap's end, not its start. */
  endTimeGMT?: string;
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

export interface FitStrengthSet {
  set_number: number;
  set_type: string;
  reps: number;
  weight: number;
  duration: number;
  rest_time: number;
  notes: string;
}

export interface FitStrengthExerciseGroup {
  name: string;
  category: string;
  sets: FitStrengthSet[];
  totalDuration: number;
  activeDuration: number;
  startTime: number | null;
  endTime: number | null;
}

export interface FitWorkoutStepDto {
  type: string;
  stepId: number;
  stepOrder: number;
  exerciseName: string;
  category: string;
  weightValue: number;
  weightUnit: { unitKey: string };
  endCondition: { conditionTypeKey: string };
  endConditionValue: number;
  description: string;
}

export interface FitWorkoutData {
  workoutName: string;
  description?: string;
  sportType?: { sportTypeKey: string };
  estimatedDurationInSecs?: number;
  workoutSegments?: Array<{
    segmentOrder: number;
    workoutSteps: FitWorkoutStepDto[];
  }>;
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
      /** Populated for strength activities when individual exercises and sets are decoded. */
      strengthWorkout?: {
        workoutName: string;
        groupedExercises: FitStrengthExerciseGroup[];
        workoutData: FitWorkoutData;
      };
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
  const offset = localMs - utcMs;
  // A real timezone offset is within ±14 h; anything else is a bad local timestamp.
  return Math.abs(offset) <= 14 * 3600 * 1000 ? offset : null;
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
  let hasPosition = false;
  for (const record of records) {
    if (record.heartRate !== undefined) hasHeartRate = true;
    if (record.distance !== undefined) hasDistance = true;
    if (record.enhancedSpeed !== undefined || record.speed !== undefined)
      hasSpeed = true;
    if (record.enhancedAltitude !== undefined || record.altitude !== undefined)
      hasElevation = true;
    if (record.cadence !== undefined) hasCadence = true;
    if (record.positionLat !== undefined && record.positionLong !== undefined)
      hasPosition = true;
  }

  const metricDescriptors: MetricDescriptor[] = [];
  const addDescriptor = (key: string) =>
    metricDescriptors.push({ key, metricsIndex: metricDescriptors.length });
  addDescriptor('directTimestamp');
  // Coordinates must ride along in activityDetailMetrics, not only in the
  // polyline below. extractGarminGpsPoints takes the activityDetailMetrics
  // branch whenever it is non-empty and never falls through to
  // geoPolylineDTO.polyline, so a FIT file whose coordinates lived only in the
  // polyline stored a full track of (0, 0) points.
  if (hasPosition) {
    addDescriptor('directLatitude');
    addDescriptor('directLongitude');
  }
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
    const hasRecordPosition =
      record.positionLat !== undefined && record.positionLong !== undefined;
    const metrics: (number | null)[] = [timestampMs];
    if (hasPosition) {
      metrics.push(
        hasRecordPosition ? semicirclesToDegrees(record.positionLat!) : null
      );
      metrics.push(
        hasRecordPosition ? semicirclesToDegrees(record.positionLong!) : null
      );
    }
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
    if (hasRecordPosition) {
      polyline.push({
        lat: semicirclesToDegrees(record.positionLat!),
        lon: semicirclesToDegrees(record.positionLong!),
      });
    }
  }
  return { metricDescriptors, activityDetailMetrics, polyline };
}

function buildLapDtos(laps: LapMesg[], cadenceMultiplier: number): LapDto[] {
  return laps.map((lap, index) => {
    const dto: LapDto = { lapIndex: index + 1 };
    const startMs = fitTimeToMs(lap.startTime);
    if (startMs !== null) dto.startTimeGMT = new Date(startMs).toISOString();
    const endMs = fitTimeToMs(lap.timestamp);
    if (endMs !== null) dto.endTimeGMT = new Date(endMs).toISOString();
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

interface ExerciseTitleIndex {
  byCategoryAndName: Map<string, string>;
  byCategory: Map<string, string>;
}

function buildExerciseTitleIndex(
  exerciseTitles: unknown[]
): ExerciseTitleIndex {
  const byCategoryAndName = new Map<string, string>();
  const byCategory = new Map<string, string>();
  for (const t of exerciseTitles as Array<Record<string, unknown>>) {
    if (typeof t.wktStepName === 'string' && t.wktStepName.trim().length > 0) {
      const name = t.wktStepName.trim();
      const cat = String(t.exerciseCategory ?? '');
      if (cat) {
        if (!byCategory.has(cat)) {
          byCategory.set(cat, name);
        }
        if (t.exerciseName !== null && t.exerciseName !== undefined) {
          byCategoryAndName.set(`${cat}_${t.exerciseName}`, name);
        }
      }
    }
  }
  return { byCategoryAndName, byCategory };
}

function lookupExerciseTitle(
  index: ExerciseTitleIndex,
  category: unknown,
  exerciseName: unknown
): string | null {
  if (!category) return null;
  const cat = String(category);
  if (exerciseName !== null && exerciseName !== undefined) {
    return index.byCategoryAndName.get(`${cat}_${exerciseName}`) ?? null;
  }
  return index.byCategory.get(cat) ?? null;
}

function resolveExerciseName(
  categoryRaw: unknown,
  subTypeRaw: unknown,
  wktStepIndex: number | null,
  workoutSteps: unknown[],
  titleIndex: ExerciseTitleIndex
): { name: string; category: string } {
  const categoryStr = Array.isArray(categoryRaw) ? categoryRaw[0] : categoryRaw;
  const subTypeNum = Array.isArray(subTypeRaw) ? subTypeRaw[0] : subTypeRaw;

  // 1. If wktStepIndex is present, check workoutStepMesgs and indexed exerciseTitleMesgs
  if (wktStepIndex !== null && workoutSteps[wktStepIndex]) {
    const step = workoutSteps[wktStepIndex] as Record<string, unknown>;
    const stepCategory =
      (step.exerciseCategory as string | undefined) ?? categoryStr;
    const stepNameNum = (step.exerciseName as number | undefined) ?? subTypeNum;

    const titleMatch = lookupExerciseTitle(
      titleIndex,
      stepCategory,
      stepNameNum
    );
    if (titleMatch) {
      return {
        name: titleMatch,
        category: typeof stepCategory === 'string' ? stepCategory : 'strength',
      };
    }

    if (
      typeof step.wktStepName === 'string' &&
      step.wktStepName.trim().length > 0
    ) {
      return {
        name: step.wktStepName.trim(),
        category: typeof stepCategory === 'string' ? stepCategory : 'strength',
      };
    }
  }

  // 2. Direct match in indexed exerciseTitles by category/subtype
  const directMatch = lookupExerciseTitle(titleIndex, categoryStr, subTypeNum);
  if (directMatch) {
    return {
      name: directMatch,
      category: typeof categoryStr === 'string' ? categoryStr : 'strength',
    };
  }

  // 3. Profile.types lookup
  if (
    typeof categoryStr === 'string' &&
    subTypeNum !== null &&
    subTypeNum !== undefined
  ) {
    const typeDictName = `${categoryStr}ExerciseName`;
    // @ts-expect-error fitsdk Profile types dynamically indexed
    const subTypeName = Profile?.types?.[typeDictName]?.[subTypeNum as number];
    if (typeof subTypeName === 'string' && subTypeName.length > 0) {
      const formatted = subTypeName
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return { name: formatted, category: categoryStr };
    }
  }

  // 4. Category string
  if (typeof categoryStr === 'string' && categoryStr !== 'unknown') {
    const formatted = categoryStr
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return { name: formatted, category: categoryStr };
  }

  return { name: 'Strength Exercise', category: 'strength' };
}

function isRestSet(set: SetMesg, workoutSteps: unknown[]): boolean {
  if (set.setType === 'rest') return true;
  if (typeof set.wktStepIndex === 'number' && workoutSteps[set.wktStepIndex]) {
    const step = workoutSteps[set.wktStepIndex] as Record<string, unknown>;
    if (step.intensity === 'rest' || step.intensity === 'recovery') {
      return true;
    }
  }
  const hasCategory =
    set.category !== undefined &&
    set.category !== null &&
    (Array.isArray(set.category)
      ? set.category.length > 0 && set.category[0] !== 'unknown'
      : set.category !== 'unknown');
  const hasSubtype =
    set.categorySubtype !== undefined && set.categorySubtype !== null;
  const reps = typeof set.repetitions === 'number' ? set.repetitions : 0;
  if (!hasCategory && !hasSubtype && reps <= 0) {
    return true;
  }
  return false;
}

function parseStrengthSets(
  messages: FitMessages,
  defaultWorkoutName: string,
  durationSeconds: number
): {
  workoutName: string;
  groupedExercises: FitStrengthExerciseGroup[];
  workoutData: FitWorkoutData;
} | null {
  const setMesgs = messages.setMesgs ?? [];
  if (setMesgs.length === 0) return null;

  const workoutSteps =
    (messages as unknown as { workoutStepMesgs?: unknown[] })
      .workoutStepMesgs ?? [];
  const exerciseTitles =
    (messages as unknown as { exerciseTitleMesgs?: unknown[] })
      .exerciseTitleMesgs ?? [];
  const titleIndex = buildExerciseTitleIndex(exerciseTitles);
  const workoutMesgs =
    (
      messages as unknown as {
        workoutMesgs?: Array<{ wktName?: string; wktDescription?: string }>;
      }
    ).workoutMesgs ?? [];

  const rawWktName = workoutMesgs[0]?.wktName?.trim();
  const workoutName = rawWktName || defaultWorkoutName || 'Strength Workout';
  const workoutDescription = workoutMesgs[0]?.wktDescription?.trim() || '';

  const groups: FitStrengthExerciseGroup[] = [];
  let currentGroup: FitStrengthExerciseGroup | null = null;
  const executableSteps: FitWorkoutStepDto[] = [];

  for (const set of setMesgs) {
    const isRest = isRestSet(set, workoutSteps);
    const duration =
      typeof set.duration === 'number' ? Math.round(set.duration) : 0;
    const startTimeMs =
      set.startTime instanceof Date || typeof set.startTime === 'number'
        ? fitTimeToMs(set.startTime)
        : null;
    const endTimeMs =
      startTimeMs !== null ? startTimeMs + duration * 1000 : null;

    if (isRest) {
      if (currentGroup && currentGroup.sets.length > 0) {
        const lastSet = currentGroup.sets[currentGroup.sets.length - 1];
        lastSet.rest_time = (lastSet.rest_time || 0) + duration;
        currentGroup.totalDuration += duration;
        if (
          endTimeMs !== null &&
          (currentGroup.endTime === null || endTimeMs > currentGroup.endTime)
        ) {
          currentGroup.endTime = endTimeMs;
        }
      }
      continue;
    }

    const wktStepIndex =
      typeof set.wktStepIndex === 'number' ? set.wktStepIndex : null;
    const { name: resolvedName, category: resolvedCategory } =
      resolveExerciseName(
        set.category,
        set.categorySubtype,
        wktStepIndex,
        workoutSteps,
        titleIndex
      );

    if (!currentGroup || currentGroup.name !== resolvedName) {
      currentGroup = {
        name: resolvedName,
        category: resolvedCategory,
        sets: [],
        totalDuration: 0,
        activeDuration: 0,
        startTime: startTimeMs,
        endTime: endTimeMs,
      };
      groups.push(currentGroup);
    }

    const reps = Number(set.repetitions) || 0;
    const weight =
      typeof set.weight === 'number' && Number.isFinite(set.weight)
        ? parseFloat(set.weight.toFixed(2))
        : 0;

    const setType = set.setType === 'warmup' ? 'Warmup' : 'Working Set';
    const setRow: FitStrengthSet = {
      set_number: currentGroup.sets.length + 1,
      set_type: setType,
      reps,
      weight,
      duration,
      rest_time: 0,
      notes: '',
    };
    currentGroup.sets.push(setRow);
    currentGroup.activeDuration += duration;
    currentGroup.totalDuration += duration;
    if (
      startTimeMs !== null &&
      (currentGroup.startTime === null || startTimeMs < currentGroup.startTime)
    ) {
      currentGroup.startTime = startTimeMs;
    }
    if (
      endTimeMs !== null &&
      (currentGroup.endTime === null || endTimeMs > currentGroup.endTime)
    ) {
      currentGroup.endTime = endTimeMs;
    }

    executableSteps.push({
      type: 'ExecutableStepDTO',
      stepId: executableSteps.length + 1,
      stepOrder: executableSteps.length + 1,
      exerciseName: resolvedName,
      category: resolvedCategory,
      weightValue: weight,
      weightUnit: { unitKey: 'kilogram' },
      endCondition: { conditionTypeKey: 'reps' },
      endConditionValue: reps,
      description: '',
    });
  }

  if (groups.length === 0) return null;

  const workoutData: FitWorkoutData = {
    workoutName,
    description: workoutDescription,
    sportType: { sportTypeKey: 'training' },
    estimatedDurationInSecs: durationSeconds,
    workoutSegments: [
      {
        segmentOrder: 1,
        workoutSteps: executableSteps,
      },
    ],
  };

  return { workoutName, groupedExercises: groups, workoutData };
}

/**
 * Transforms decoded FIT messages into the exercise-entry row data and the
 * `detail_data` blob the Garmin Connect sync stores, so imports render in the
 * existing Reports UI unchanged. Pure: no I/O.
 */
function transformFitActivity(
  messages: FitMessages,
  buffer: Buffer,
  notesLabel = 'Garmin FIT Import'
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
  const setCount = messages.setMesgs?.length ?? 0;
  if (setCount > MAX_SET_COUNT) {
    return {
      ok: false,
      reason: `File contains ${setCount} set messages (limit ${MAX_SET_COUNT}).`,
    };
  }
  const exerciseTitleCount =
    (messages as unknown as { exerciseTitleMesgs?: unknown[] })
      .exerciseTitleMesgs?.length ?? 0;
  if (exerciseTitleCount > MAX_EXERCISE_TITLE_COUNT) {
    return {
      ok: false,
      reason: `File contains ${exerciseTitleCount} exercise title messages (limit ${MAX_EXERCISE_TITLE_COUNT}).`,
    };
  }
  const workoutStepCount =
    (messages as unknown as { workoutStepMesgs?: unknown[] }).workoutStepMesgs
      ?.length ?? 0;
  if (workoutStepCount > MAX_WORKOUT_STEP_COUNT) {
    return {
      ok: false,
      reason: `File contains ${workoutStepCount} workout step messages (limit ${MAX_WORKOUT_STEP_COUNT}).`,
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
  const totalCalories = session.totalCalories ?? 0;
  const metabolicCalories =
    typeof session.metabolicCalories === 'number'
      ? session.metabolicCalories
      : null;
  const activeCalories =
    metabolicCalories !== null
      ? Math.max(0, totalCalories - metabolicCalories)
      : totalCalories;

  const trainingLoad =
    typeof session.trainingLoadPeak === 'number' &&
    Number.isFinite(session.trainingLoadPeak)
      ? parseFloat(session.trainingLoadPeak.toFixed(2))
      : null;

  const activity: Record<string, unknown> = {
    activityName,
    activityType: { typeKey: sport },
    duration: durationSeconds / 60,
    calories: totalCalories,
    active_calories: activeCalories,
  };
  if (trainingLoad !== null) activity.training_load = trainingLoad;
  if (distanceKm !== null) activity.distance = distanceKm;
  if (session.avgHeartRate !== undefined)
    activity.averageHR = session.avgHeartRate;
  if (session.maxHeartRate !== undefined) activity.maxHR = session.maxHeartRate;
  if (averageSpeed !== undefined) activity.averageSpeed = averageSpeed;
  const maxSpeed = session.enhancedMaxSpeed ?? session.maxSpeed;
  if (maxSpeed !== undefined) activity.maxSpeed = maxSpeed;
  if (session.avgCadence !== undefined) {
    const avgCadence = session.avgCadence * cadenceMultiplier;
    activity.averageRunCadenceInStepsPerMinute = avgCadence;
    activity.averageCadence = avgCadence;
  }
  if (session.maxCadence !== undefined) {
    const maxCadenceValue = session.maxCadence * cadenceMultiplier;
    activity.maxRunningCadenceInStepsPerMinute = maxCadenceValue;
    activity.maxCadence = maxCadenceValue;
  }
  if (session.totalAscent !== undefined) {
    activity.totalAscent = session.totalAscent;
    // extractGarminTelemetryFields (shared with Garmin Connect sync) reads this key.
    activity.elevationGain = session.totalAscent;
  }
  if (session.totalDescent !== undefined) {
    activity.totalDescent = session.totalDescent;
    activity.elevationLoss = session.totalDescent;
  }
  if (session.totalTimerTime !== undefined) {
    // Garmin's service.py reports these in minutes (see garminTelemetryExtractors.ts);
    // match that unit so the shared extractor's *60 conversion is correct.
    activity.movingDuration = session.totalTimerTime / 60;
  }
  if (session.totalElapsedTime !== undefined) {
    activity.elapsedDuration = session.totalElapsedTime / 60;
  }
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
    calories_burned: Math.round(totalCalories),
    distance: distanceKm,
    avg_heart_rate:
      session.avgHeartRate !== undefined
        ? Math.round(session.avgHeartRate)
        : null,
    steps,
    notes: `${notesLabel}: ${activityName} (${sport})`,
    source_id: sourceId,
    training_load: trainingLoad,
  };

  const strengthWorkout =
    kind === 'strength'
      ? (parseStrengthSets(messages, activityName, durationSeconds) ??
        undefined)
      : undefined;

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
    ...(strengthWorkout ? { strengthWorkout } : {}),
  };
}

export { transformFitActivity };
export default { transformFitActivity };
