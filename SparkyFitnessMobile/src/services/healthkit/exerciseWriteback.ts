import { Platform } from 'react-native';
import {
  authorizationStatusFor,
  deleteObjects,
  queryWorkoutSamples,
  saveWorkoutSample,
  type QuantitySampleForSaving,
  type SampleTypeIdentifierWriteable,
} from '@kingstinct/react-native-healthkit';
import {
  healthActivityTypeTarget,
  type ExerciseSessionResponse,
  type HealthDistanceKind,
} from '@workspace/shared';
import { addLog } from '../LogService';
import {
  OVERLAP_SKIP_FRACTION,
  exerciseWritesProjection,
  overlapFraction,
  planExerciseWrites,
  type ExerciseWritebackPlanOptions,
  type WorkoutWrite,
} from '../shared/exerciseWritebackPlan';
import { EXERCISE_WRITEBACK_METADATA_KEY } from './dataTransformation';
import { loadHealthPreference, saveHealthPreference } from './preferences';

// Exercise write-back to Apple Health (#1750). One HKWorkout per diary session,
// with its active energy and distance attached as samples so the Fitness app
// and other apps count them. Every object written carries
// EXERCISE_WRITEBACK_METADATA_KEY = the session's write key, so replacing or
// removing a session deletes by that marker (HealthKit only lets an app delete
// what it saved) and the workout import skips our own writes.

export const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier' as const;
const ACTIVE_ENERGY_TYPE =
  'HKQuantityTypeIdentifierActiveEnergyBurned' as const;

/**
 * Set once a workout was written, cleared by a full removal. While set, the
 * daily statistics reads leave our written samples out (healthkit/index.ts).
 */
export const EXERCISE_FILTER_OWN_PREF = 'writebackExerciseFilterOwn';

const IOS_MAJOR =
  Platform.OS === 'ios' ? parseInt(String(Platform.Version), 10) || 0 : 0;

/**
 * HealthKit distance quantity per activity. Rowing, paddle sports, skating and
 * cross-country skiing distances only exist from iOS 18; on older systems those
 * workouts are written without distance rather than failing the whole save.
 */
const DISTANCE_TYPES: Record<
  HealthDistanceKind,
  { identifier: SampleTypeIdentifierWriteable; minIos: number }
> = {
  walking_running: {
    identifier: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
    minIos: 0,
  },
  cycling: { identifier: 'HKQuantityTypeIdentifierDistanceCycling', minIos: 0 },
  swimming: {
    identifier: 'HKQuantityTypeIdentifierDistanceSwimming',
    minIos: 0,
  },
  wheelchair: {
    identifier: 'HKQuantityTypeIdentifierDistanceWheelchair',
    minIos: 0,
  },
  downhill_snow_sports: {
    identifier: 'HKQuantityTypeIdentifierDistanceDownhillSnowSports',
    minIos: 0,
  },
  rowing: { identifier: 'HKQuantityTypeIdentifierDistanceRowing', minIos: 18 },
  paddle_sports: {
    identifier: 'HKQuantityTypeIdentifierDistancePaddleSports',
    minIos: 18,
  },
  cross_country_skiing: {
    identifier: 'HKQuantityTypeIdentifierDistanceCrossCountrySkiing',
    minIos: 18,
  },
  skating_sports: {
    identifier: 'HKQuantityTypeIdentifierDistanceSkatingSports',
    minIos: 18,
  },
};

const distanceType = (
  kind: HealthDistanceKind | undefined,
  iosMajor: number = IOS_MAJOR
): SampleTypeIdentifierWriteable | null => {
  if (!kind) return null;
  const entry = DISTANCE_TYPES[kind];
  return iosMajor >= entry.minIos ? entry.identifier : null;
};

/** Quantity types written with workouts, which Sparky's own daily totals must not count. */
export const EXERCISE_WRITTEN_QUANTITY_TYPES: ReadonlySet<string> = new Set([
  ACTIVE_ENERGY_TYPE,
  ...Object.values(DISTANCE_TYPES).map((d) => d.identifier),
]);

/** Every type exercise write-back creates on this system (for permissions and removal). */
export const exerciseWriteTypes = (
  iosMajor: number = IOS_MAJOR
): SampleTypeIdentifierWriteable[] => [
  WORKOUT_TYPE as SampleTypeIdentifierWriteable,
  ACTIVE_ENERGY_TYPE,
  ...Object.values(DISTANCE_TYPES)
    .filter((d) => iosMajor >= d.minIos)
    .map((d) => d.identifier),
];

export interface WorkoutSave {
  activityType: number;
  quantities: QuantitySampleForSaving[];
  start: Date;
  end: Date;
  metadata: Record<string, string | number | boolean>;
}

/** The HealthKit save for one write. Pure, so the mapping is unit tested. */
export const buildWorkoutSave = (
  write: WorkoutWrite,
  version: number,
  timezone: string,
  iosMajor: number = IOS_MAJOR
): WorkoutSave => {
  const target = healthActivityTypeTarget(write.activityType);
  const sampleMetadata = { [EXERCISE_WRITEBACK_METADATA_KEY]: write.key };
  const quantities: QuantitySampleForSaving[] = [];
  if (write.activeKcal != null && write.activeKcal > 0) {
    quantities.push({
      quantityType: ACTIVE_ENERGY_TYPE,
      unit: 'kcal',
      quantity: Math.round(write.activeKcal * 10) / 10,
      startDate: write.start,
      endDate: write.end,
      metadata: sampleMetadata,
    } as QuantitySampleForSaving);
  }
  const distanceIdentifier = distanceType(target.distance, iosMajor);
  if (distanceIdentifier && write.distanceMeters != null) {
    quantities.push({
      quantityType: distanceIdentifier,
      unit: 'm',
      quantity: Math.round(write.distanceMeters),
      startDate: write.start,
      endDate: write.end,
      metadata: sampleMetadata,
    } as QuantitySampleForSaving);
  }

  const metadata: Record<string, string | number | boolean> = {
    [EXERCISE_WRITEBACK_METADATA_KEY]: write.key,
    // Mapped onto Apple's constants by the patched library: a re-save of the
    // same session (or one from another device on the same Health account)
    // replaces the older copy instead of adding a second.
    HKMetadataKeySyncIdentifier: write.key,
    HKMetadataKeySyncVersion: version,
    HKTimeZone: timezone,
  };
  if (write.title) metadata.HKWorkoutBrandName = write.title;
  if (target.indoor != null) metadata.HKIndoorWorkout = target.indoor;
  if (target.swimmingLocation != null) {
    metadata.HKSwimmingLocationType = target.swimmingLocation;
  }
  if (write.summary) metadata.SparkyExerciseSummary = write.summary;

  return {
    activityType: target.healthKit,
    quantities,
    start: write.start,
    end: write.end,
    metadata,
  };
};

// HKAuthorizationStatus.sharingAuthorized; HealthKit reports share status
// reliably (only read status is hidden).
const SHARING_AUTHORIZED = 2;
const isShareAuthorized = (type: SampleTypeIdentifierWriteable): boolean => {
  try {
    return authorizationStatusFor(type) === SHARING_AUTHORIZED;
  } catch {
    return false;
  }
};

const exerciseKeysKey = (date: string): string =>
  `writebackExerciseKeys:${date}`;
const exerciseSigKey = (date: string): string => `writebackExerciseSig:${date}`;

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const hashString = (value: string): string => {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1)
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

// Bump when what is written changes shape, so written days are rewritten once.
const EXERCISE_WRITE_SCHEMA = 'workout-v3'; // v2: gym activities marked indoor

/** Delete everything written for one session key, per type. Returns false if any delete failed. */
const deleteByKey = async (key: string): Promise<boolean> => {
  let ok = true;
  for (const type of exerciseWriteTypes()) {
    try {
      await deleteObjects(type, {
        metadata: {
          withMetadataKey: EXERCISE_WRITEBACK_METADATA_KEY,
          value: key,
        },
      });
    } catch (error) {
      ok = false;
      addLog(
        `[Writeback] Failed to delete ${type} for ${key}: ${message(error)}`,
        'WARNING'
      );
    }
  }
  return ok;
};

interface OtherWorkout {
  start: Date;
  end: Date;
  source: string;
}

/**
 * Workouts other sources saved around the day (other apps, watches, and our
 * own Apple Watch app, whose sessions are already in Apple Health), never the
 * ones this write-back saved. Needs Workout read access; iOS hides a read
 * denial and returns nothing, which is why the toggle asks for it.
 */
const otherWorkoutsAround = async (
  writes: WorkoutWrite[]
): Promise<OtherWorkout[]> => {
  const startMs = Math.min(...writes.map((w) => w.start.getTime()));
  const endMs = Math.max(...writes.map((w) => w.end.getTime()));
  const workouts = await queryWorkoutSamples({
    limit: 0,
    ascending: true,
    filter: {
      date: {
        startDate: new Date(startMs - 3_600_000),
        endDate: new Date(endMs + 3_600_000),
      },
    },
  });
  return workouts
    .filter(
      (w) =>
        (w.metadata as Record<string, unknown> | undefined)?.[
          EXERCISE_WRITEBACK_METADATA_KEY
        ] === undefined
    )
    .map((w) => ({
      start: new Date(w.startDate),
      end: new Date(w.endDate),
      source:
        (
          w as unknown as {
            sourceRevision?: { source?: { name?: string } };
          }
        ).sourceRevision?.source?.name ?? 'another app',
    }));
};

/** Drop writes another source already recorded (≥80% of the same time). */
export const withoutOverlaps = (
  writes: WorkoutWrite[],
  others: OtherWorkout[]
): {
  keep: WorkoutWrite[];
  skipped: { write: WorkoutWrite; source: string }[];
} => {
  const keep: WorkoutWrite[] = [];
  const skipped: { write: WorkoutWrite; source: string }[] = [];
  for (const write of writes) {
    const match = others.find(
      (o) => overlapFraction(write, o) >= OVERLAP_SKIP_FRACTION
    );
    if (match) skipped.push({ write, source: match.source });
    else keep.push(write);
  }
  return { keep, skipped };
};

export interface ExerciseWriteContext {
  timezone: string;
  formatWeightKg: ExerciseWritebackPlanOptions['formatWeightKg'];
  bmrKcalPerDay: number | null;
}

export const writeExerciseForDate = async (
  date: string,
  sessions: readonly ExerciseSessionResponse[],
  version: number,
  context: ExerciseWriteContext
): Promise<void> => {
  const planned = planExerciseWrites(sessions, {
    date,
    timezone: context.timezone,
    bmrKcalPerDay: context.bmrKcalPerDay,
    formatWeightKg: context.formatWeightKg,
  });

  let writes = planned;
  if (planned.length > 0) {
    try {
      const { keep, skipped } = withoutOverlaps(
        planned,
        await otherWorkoutsAround(planned)
      );
      for (const { write, source } of skipped) {
        addLog(
          `[Writeback] Exercise ${date}: skipped "${write.title}", ${source} already recorded a workout at that time`,
          'INFO'
        );
      }
      writes = keep;
    } catch (error) {
      // Without the check there is no way to tell a duplicate, so write
      // nothing this run rather than risk two copies; the next run retries.
      addLog(
        `[Writeback] Exercise ${date}: could not read Apple Health workouts, will retry: ${message(error)}`,
        'WARNING'
      );
      return;
    }
  }

  // A session's marker (and sync identifier) carries its day, so a workout
  // moved to another day is never deleted by the old day's worker after the
  // new day saved it (dates run concurrently). Keys saved before carried no
  // day; they are still in the tracked lists and are deleted as written.
  writes = writes.map((write) => ({ ...write, key: `${write.key}@${date}` }));

  // Energy and distance are attached only when sharing them is allowed; a
  // single denied sample type fails the whole save. The grants are part of
  // the signature, so a later grant rewrites the day with them.
  const grantedTypes = exerciseWriteTypes().filter(isShareAuthorized);
  const signature = hashString(
    [
      EXERCISE_WRITE_SCHEMA,
      `granted:${grantedTypes.join(',')}`,
      ...exerciseWritesProjection(writes),
    ].join('|')
  );
  if (
    signature === (await loadHealthPreference<string>(exerciseSigKey(date)))
  ) {
    addLog(`[Writeback] Exercise ${date}: unchanged — skipped`, 'DEBUG');
    return;
  }

  // The stored signature stops describing Apple Health once anything below
  // is deleted, so clear it first: a failed save then leaves the day to be
  // rewritten next run instead of looking unchanged.
  await saveHealthPreference(exerciseSigKey(date), null);
  const previous =
    (await loadHealthPreference<string[]>(exerciseKeysKey(date))) ?? [];
  const tracked = new Set<string>();
  let allSucceeded = true;
  for (const key of previous) {
    if (!(await deleteByKey(key))) {
      tracked.add(key); // retried next run, never orphaned
      allSucceeded = false;
    }
  }

  for (const write of writes) {
    const save = buildWorkoutSave(write, version, context.timezone);
    const quantities = save.quantities.filter((q) =>
      grantedTypes.includes(q.quantityType as SampleTypeIdentifierWriteable)
    );
    try {
      // Set before saving: a workout that lands while a later step fails must
      // already be left out of the daily totals.
      await saveHealthPreference(EXERCISE_FILTER_OWN_PREF, true);
      await saveWorkoutSample(
        save.activityType as Parameters<typeof saveWorkoutSample>[0],
        quantities,
        save.start,
        save.end,
        undefined,
        save.metadata
      );
      tracked.add(write.key);
    } catch (error) {
      addLog(
        `[Writeback] Failed to save workout "${write.title}" for ${date}: ${message(error)}`,
        'ERROR'
      );
      allSucceeded = false;
    }
  }

  await saveHealthPreference(exerciseKeysKey(date), [...tracked]);
  if (allSucceeded) await saveHealthPreference(exerciseSigKey(date), signature);
  addLog(
    `[Writeback] Exercise ${date}: ${writes.length} workout(s) -> tracking ${tracked.size}`,
    'INFO'
  );
};

/**
 * Remove written workouts and their samples. Scoped by our metadata marker as
 * well as the date, so a predicate can never reach a workout this write-back
 * did not save (the Apple Watch app's sessions come from another source and
 * carry no marker).
 */
export const removeExerciseData = async (dateFilter: {
  startDate?: Date;
  endDate?: Date;
}): Promise<boolean> => {
  let ok = true;
  for (const type of exerciseWriteTypes()) {
    try {
      await deleteObjects(type, {
        AND: [
          { date: dateFilter },
          { metadata: { withMetadataKey: EXERCISE_WRITEBACK_METADATA_KEY } },
        ],
      });
    } catch (error) {
      ok = false;
      addLog(
        `[Writeback] Failed to delete written ${type} records: ${message(error)}`,
        'WARNING'
      );
    }
  }
  return ok;
};
