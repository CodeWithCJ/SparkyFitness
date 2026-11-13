import {
  deleteRecordsByTimeRange,
  deleteRecordsByUuids,
  insertRecords,
  readRecords,
  RecordingMethod,
  type HealthConnectRecord,
} from 'react-native-health-connect';
import {
  healthActivityTypeTarget,
  healthConnectSegmentFor,
  type ExerciseSessionResponse,
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
import { loadHealthPreference, saveHealthPreference } from './preferences';
import {
  EXERCISE_CLIENT_RECORD_PREFIX,
  isOwnWrittenExerciseRecord,
} from './dataTransformation';

// Exercise write-back to Health Connect (#1750). One ExerciseSessionRecord per
// diary session (with one segment per timed set), plus an ActiveCaloriesBurned
// and a Distance record over the same window so other apps count them. Records
// follow the nutrition write-back: fresh client record ids every run, the
// previous run's ids deleted first (Health Connect tombstones a deleted id and
// its clientRecordVersion upsert is unreliable through the bridge).

/**
 * Set once a workout was written, cleared by a full removal. While set, the
 * daily active energy and distance aggregates leave this app's records out
 * (healthconnect/index.ts).
 */
export const EXERCISE_FILTER_OWN_PREF = 'writebackExerciseFilterOwn';

/** Record types exercise write-back creates (for tracking, removal and the daily filter). */
export const EXERCISE_RECORD_TYPES = [
  'ExerciseSession',
  'ActiveCaloriesBurned',
  'Distance',
] as const;
type ExerciseRecordType = (typeof EXERCISE_RECORD_TYPES)[number];

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The UTC offset `timezone` has at `instant`, as Health Connect's { totalSeconds }. */
export const zoneOffsetAt = (
  instant: Date,
  timezone: string
): { totalSeconds: number } | undefined => {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
        .formatToParts(instant)
        .map((p) => [p.type, p.value])
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const seconds = Math.round((asUtc - instant.getTime()) / 60_000) * 60;
    return Number.isFinite(seconds) ? { totalSeconds: seconds } : undefined;
  } catch {
    return undefined;
  }
};

const clientId = (write: WorkoutWrite, part: string, version: number) =>
  `${write.key.replace(/^sparky-exercise-/, EXERCISE_CLIENT_RECORD_PREFIX)}-${part}-${version}`;

const metadataFor = (id: string, version: number) => ({
  clientRecordId: id,
  clientRecordVersion: version,
  recordingMethod: RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY,
});

/**
 * Segments for the session: one per timed set, typed by the exercise when
 * Health Connect allows that type in this session, clipped to the session and
 * never overlapping (Health Connect rejects the whole session otherwise).
 */
export const segmentsFor = (
  write: WorkoutWrite,
  sessionType: number
): {
  startTime: string;
  endTime: string;
  segmentType: number;
  repetitions: number;
}[] => {
  const startMs = write.start.getTime();
  const endMs = write.end.getTime();
  const sorted = [...write.sets].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
  );
  const segments: {
    startTime: string;
    endTime: string;
    segmentType: number;
    repetitions: number;
  }[] = [];
  let lastEnd = startMs;
  for (const set of sorted) {
    const s = Math.max(set.startedAt.getTime(), startMs, lastEnd);
    const e = Math.min(set.completedAt.getTime(), endMs);
    if (e <= s) continue;
    segments.push({
      startTime: new Date(s).toISOString(),
      endTime: new Date(e).toISOString(),
      segmentType: healthConnectSegmentFor(
        { name: set.exerciseName, modality: set.modality },
        sessionType
      ),
      repetitions: Math.max(0, Math.round(set.reps ?? 0)),
    });
    lastEnd = e;
  }
  return segments;
};

/** The Health Connect records for one write, per type. Pure, so the mapping is unit tested. */
export const buildExerciseRecords = (
  write: WorkoutWrite,
  version: number,
  timezone: string
): Record<ExerciseRecordType, HealthConnectRecord[]> => {
  const target = healthActivityTypeTarget(write.activityType);
  const window = {
    startTime: write.start.toISOString(),
    endTime: write.end.toISOString(),
    startZoneOffset: zoneOffsetAt(write.start, timezone),
    endZoneOffset: zoneOffsetAt(write.end, timezone),
  };
  const session = {
    recordType: 'ExerciseSession',
    ...window,
    exerciseType: target.healthConnect,
    title: write.title || undefined,
    notes: write.summary || undefined,
    segments: segmentsFor(write, target.healthConnect),
    metadata: metadataFor(clientId(write, 'session', version), version),
  } as unknown as HealthConnectRecord;

  const energy: HealthConnectRecord[] =
    write.activeKcal != null && write.activeKcal > 0
      ? [
          {
            recordType: 'ActiveCaloriesBurned',
            ...window,
            energy: {
              value: Math.round(write.activeKcal * 10) / 10,
              unit: 'kilocalories',
            },
            metadata: metadataFor(clientId(write, 'energy', version), version),
          } as unknown as HealthConnectRecord,
        ]
      : [];

  // Health Connect has one distance type, so any distance is written; the
  // activity type says what kind it was.
  const distance: HealthConnectRecord[] =
    write.distanceMeters != null && write.distanceMeters > 0
      ? [
          {
            recordType: 'Distance',
            ...window,
            distance: {
              value: Math.round(write.distanceMeters),
              unit: 'meters',
            },
            metadata: metadataFor(
              clientId(write, 'distance', version),
              version
            ),
          } as unknown as HealthConnectRecord,
        ]
      : [];

  return {
    ExerciseSession: [session],
    ActiveCaloriesBurned: energy,
    Distance: distance,
  };
};

interface OtherWorkout {
  start: Date;
  end: Date;
  source: string;
}

/**
 * Sessions other apps saved around the writes, never the ones this write-back
 * saved. Needs ExerciseSession read access, which the toggle asks for.
 */
const otherSessionsAround = async (
  writes: WorkoutWrite[]
): Promise<OtherWorkout[]> => {
  const startMs = Math.min(...writes.map((w) => w.start.getTime()));
  const endMs = Math.max(...writes.map((w) => w.end.getTime()));
  const others: OtherWorkout[] = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords('ExerciseSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(startMs - 3_600_000).toISOString(),
        endTime: new Date(endMs + 3_600_000).toISOString(),
      },
      pageToken,
    });
    for (const rec of page.records as unknown as Record<string, unknown>[]) {
      if (isOwnWrittenExerciseRecord(rec)) continue;
      others.push({
        start: new Date(rec.startTime as string),
        end: new Date(rec.endTime as string),
        source:
          (rec.metadata as { dataOrigin?: string } | undefined)?.dataOrigin ??
          'another app',
      });
    }
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return others;
};

const withoutOverlaps = (
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

const idsKey = (recordType: ExerciseRecordType, date: string) =>
  `writebackExercise${recordType}Ids:${date}`;
const sigKey = (date: string) => `writebackExerciseSig:${date}`;

const hashString = (value: string): string => {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1)
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

const EXERCISE_WRITE_SCHEMA = 'session-v1';

export interface ExerciseWriteContext {
  timezone: string;
  formatWeightKg: ExerciseWritebackPlanOptions['formatWeightKg'];
  bmrKcalPerDay: number | null;
  /** Health Connect's granted permissions, read once per run. */
  granted: { recordType?: string; accessType?: string }[];
}

const isGranted = (
  granted: ExerciseWriteContext['granted'],
  recordType: string,
  accessType: 'read' | 'write'
) =>
  granted.some(
    (p) => p.recordType === recordType && p.accessType === accessType
  );

/**
 * Write one day's sessions. Throws on a Health Connect error (including the
 * quota error the caller uses to hold its cursor); a day that fails keeps its
 * previous ids tracked, so the next run replaces them.
 */
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
    // Without reading the day's sessions there is no way to tell a duplicate,
    // so nothing is written until that access is granted.
    if (!isGranted(context.granted, 'ExerciseSession', 'read')) {
      addLog(
        `[Writeback] Exercise ${date}: needs permission to read exercise sessions (to avoid duplicates); skipped`,
        'WARNING'
      );
      return;
    }
    const { keep, skipped } = withoutOverlaps(
      planned,
      await otherSessionsAround(planned)
    );
    for (const { write, source } of skipped) {
      addLog(
        `[Writeback] Exercise ${date}: skipped "${write.title}", ${source} already recorded a workout at that time`,
        'INFO'
      );
    }
    writes = keep;
  }

  const signature = hashString(
    [
      EXERCISE_WRITE_SCHEMA,
      // A grant added later rewrites the day with what it now allows.
      `energy:${isGranted(context.granted, 'ActiveCaloriesBurned', 'write')}`,
      `distance:${isGranted(context.granted, 'Distance', 'write')}`,
      ...exerciseWritesProjection(writes),
    ].join('|')
  );
  if (signature === (await loadHealthPreference<string>(sigKey(date)))) {
    addLog(`[Writeback] Exercise ${date}: unchanged — skipped`, 'DEBUG');
    return;
  }

  const byType: Record<ExerciseRecordType, HealthConnectRecord[]> = {
    ExerciseSession: [],
    ActiveCaloriesBurned: [],
    Distance: [],
  };
  for (const write of writes) {
    const records = buildExerciseRecords(write, version, context.timezone);
    for (const type of EXERCISE_RECORD_TYPES)
      byType[type].push(...records[type]);
  }

  for (const type of EXERCISE_RECORD_TYPES) {
    const previous =
      (await loadHealthPreference<string[]>(idsKey(type, date))) ?? [];
    if (previous.length > 0) {
      await deleteRecordsByUuids(type, [], previous);
      await saveHealthPreference(idsKey(type, date), []);
    }
  }
  for (const type of EXERCISE_RECORD_TYPES) {
    const records = byType[type];
    if (records.length === 0) continue;
    // Energy and distance are optional: a session is still written when the
    // person declined those writes.
    if (
      type !== 'ExerciseSession' &&
      !isGranted(context.granted, type, 'write')
    ) {
      continue;
    }
    await insertRecords(records);
    await saveHealthPreference(
      idsKey(type, date),
      records
        .map((r) => r.metadata?.clientRecordId)
        .filter((id): id is string => id != null)
    );
  }
  if (writes.length > 0)
    await saveHealthPreference(EXERCISE_FILTER_OWN_PREF, true);
  await saveHealthPreference(sigKey(date), signature);
  addLog(
    `[Writeback] Exercise ${date}: wrote ${writes.length} session(s)`,
    'INFO'
  );
};

/**
 * Remove written sessions, energy and distance. Health Connect only deletes
 * records this app authored. Returns false if any delete failed.
 */
export const removeExerciseData = async (filter: {
  operator: 'between' | 'before';
  startTime?: string;
  endTime: string;
}): Promise<boolean> => {
  let ok = true;
  for (const type of EXERCISE_RECORD_TYPES) {
    try {
      await deleteRecordsByTimeRange(
        type,
        filter as Parameters<typeof deleteRecordsByTimeRange>[1]
      );
    } catch (error) {
      ok = false;
      addLog(
        `[Writeback] Failed to delete written ${type} records: ${message(error)}`,
        'ERROR'
      );
    }
  }
  return ok;
};
