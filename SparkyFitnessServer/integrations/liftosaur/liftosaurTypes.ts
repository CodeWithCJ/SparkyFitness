/**
 * Strict TypeScript contracts for the Liftosaur REST API v1
 * (https://www.liftosaur.com/api/v1) and for the Liftohistory text format
 * (source of truth: liftosaur/docs/content/api.md and
 * liftosaur/src/liftohistory/{liftohistorySerializer,liftohistoryDeserializer}.ts).
 */

// ─── Liftosaur REST API v1 payloads ──────────────────────────────────────────

/** A paginated history record returned by GET /api/v1/history. */
export interface LiftosaurHistoryRecordPayload {
  id: number;
  text: string;
}

/** The `data` envelope of GET /api/v1/history. */
export interface LiftosaurHistoryResponseData {
  records: LiftosaurHistoryRecordPayload[];
  hasMore: boolean;
  nextCursor?: number;
}

/** The `error` envelope returned on non-2xx responses. */
export interface LiftosaurApiError {
  code?: string;
  message?: string;
}

/** The top-level JSON envelope of every /api/v1 response. */
export interface LiftosaurApiEnvelope<T> {
  data?: T;
  error?: LiftosaurApiError;
}

/** Query params accepted by GET /api/v1/history. */
export interface LiftosaurHistoryQueryParams {
  startDate?: string;
  endDate?: string;
  limit?: number;
  cursor?: number;
}

// ─── Liftohistory text format ────────────────────────────────────────────────

/** Weight units Liftosaur serializes with (lb/kg). */
export type LiftohistoryWeightUnit = 'kg' | 'lb';

/** One parsed set from a serialized exercise line. */
export interface LiftohistorySet {
  /** Number of consecutive identical sets this token expands to. */
  count: number;
  /** Completed (or target) reps; the right-side reps for unilateral sets. */
  reps: number;
  /** Left-side reps for unilateral sets (e.g. `3x5|3`). */
  repsLeft?: number;
  /** Low end of a target rep range (e.g. `3x5-8`). */
  minReps?: number;
  /** AMRAP marker (`3x5+`). */
  isAmrap?: boolean;
  /** Numeric weight value. */
  weightValue?: number;
  /** Weight unit. */
  weightUnit?: LiftohistoryWeightUnit;
  /** `185lb+` — the weight was asked during the workout. */
  askWeight?: boolean;
  /** Rate of perceived exertion (`@8.5`). */
  rpe?: number;
  /** `@8+` — RPE was logged. */
  logRpe?: boolean;
  /** Rest timer in seconds (target sets only, e.g. `120s`). */
  timerSeconds?: number;
  /** Free-text set label (`(Top set)`). */
  label?: string;
}

/** One parsed exercise line within a workout record. */
export interface LiftohistoryExercise {
  /** Full exercise name as serialized (may include equipment suffix). */
  name: string;
  /** `//` comment lines directly above the exercise line. */
  notes?: string;
  /** Completed working sets (the section right after the name). */
  completedSets: LiftohistorySet[];
  /** `warmup:` sets. */
  warmupSets: LiftohistorySet[];
  /** `target:` sets. */
  targetSets: LiftohistorySet[];
}

/** A fully parsed workout record. */
export interface LiftohistoryWorkout {
  /** Liftosaur history record id (millisecond-ish timestamp). */
  id: number;
  /** Normalized ISO-8601 instant of the workout start. */
  date: string;
  /** The raw date token as it appeared in the text. */
  rawDate: string;
  /** `program: "Name"` metadata; undefined for ad-hoc workouts. */
  programName?: string;
  /** `dayName: "..."` metadata. */
  dayName?: string;
  /** `week: N` metadata. */
  week?: number;
  /** `dayInWeek: N` metadata. */
  dayInWeek?: number;
  /** `day: N` metadata (single-week programs). */
  day?: number;
  /** `duration: Ns` metadata. */
  durationSeconds?: number;
  /** `//` comment lines directly above the record. */
  notes?: string;
  exercises: LiftohistoryExercise[];
}

/** A parse problem on one line; the parser keeps going after the first. */
export interface LiftohistoryParseError {
  line: number;
  message: string;
}

/** Result of parsing one document (possibly many records). */
export interface LiftohistoryParseResult {
  workouts: LiftohistoryWorkout[];
  errors: LiftohistoryParseError[];
}

// ─── Liftosaur Measurements API shapes ───────────────────────────────────────

export interface LiftosaurMeasurementItem {
  value: string; // e.g. "82.5kg", "180lb", "18%", "37cm"
  timestamp: number; // unix epoch ms
  date?: string; // ISO string
}

export interface LiftosaurMeasurementResponseData {
  key: string;
  category: string;
  values: LiftosaurMeasurementItem[];
  hasMore: boolean;
  nextCursor?: number;
}

export interface LiftosaurMeasurementWritePayload {
  value: string;
  timestamp?: number | string;
}

// ─── Export shapes for Liftohistory serialization ───────────────────────────

export interface LiftohistoryExportSet {
  reps: number;
  weight?: number | null;
  weightUnit?: LiftohistoryWeightUnit;
  rpe?: number | null;
  durationSeconds?: number | null;
  notes?: string | null;
  setType?: string | null;
}

export interface LiftohistoryExportExercise {
  name: string;
  notes?: string | null;
  sets: LiftohistoryExportSet[];
}

export interface LiftohistoryExportWorkout {
  date: string; // ISO string or YYYY-MM-DD HH:mm:ss
  programName?: string | null;
  dayName?: string | null;
  durationSeconds?: number | null;
  notes?: string | null;
  exercises: LiftohistoryExportExercise[];
}

// ─── Sync status / result shapes surfaced to the API ────────────────────────

export interface LiftosaurProviderStatus {
  connected: boolean;
  lastSyncAt: string | null;
}

export interface LiftosaurSyncResult {
  success: boolean;
  processedCount: number;
  parsedCount: number;
  skippedCount: number;
  workoutsImported: number;
  workoutsExported: number;
  measurementsImported: number;
  measurementsExported: number;
  source: 'live_api';
}
