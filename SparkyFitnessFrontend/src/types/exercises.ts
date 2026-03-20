import {
  ExerciseEntryResponse,
  ExerciseSessionResponse,
  ExerciseSnapshotResponse,
  PresetSessionResponse,
  IndividualSessionResponse,
} from '@workspace/shared';

export type GroupedExerciseEntry = ExerciseSessionResponse;

export type ExerciseEntry = ExerciseEntryResponse;

export type Exercise = ExerciseSnapshotResponse;

export type PresetSessionEntry = PresetSessionResponse;
export type IndividualSessionEntry = IndividualSessionResponse;

export interface HistoryImportEntry {
  entry_date: string;
  id: string;
  exercise_name: string;
  preset_name?: string;
  entry_notes?: string;
  calories_burned?: number;
  distance?: number;
  avg_heart_rate?: number;
  exercise_category?: string;
  calories_per_hour?: number;
  exercise_description?: string;
  exercise_source?: string;
  exercise_force?: string;
  exercise_level?: string;
  exercise_mechanic?: string;
  exercise_equipment?: string[];
  primary_muscles?: string[];
  secondary_muscles?: string[];
  instructions?: string[];
  sets?: {
    set_number: number;
    set_type?: string;
    reps?: number;
    weight?: number;
    duration_min?: number;
    rest_time_sec?: number;
    notes?: string;
  }[];
  activity_details?: unknown[];
}

export interface ExerciseDeletionImpact {
  exerciseEntriesCount: number;
  // server returns counts; normalize to a boolean for backward compatible UI use
  isUsedByOthers: boolean;
  otherUserReferences?: number;
}

export type ExerciseOwnershipFilter =
  | 'all'
  | 'own'
  | 'family'
  | 'public'
  | 'needs-review';

export interface LapDTO {
  distance: number;
  duration: number;
  movingDuration: number;
  averageMovingSpeed: number;
}

export interface ActivityDetailsResponse {
  id?: string;
  activity?: {
    details?: {
      metricDescriptors?: unknown[];
      activityDetailMetrics?: ActivityDetailMetric[];
      geoPolylineDTO?: {
        polyline: { lat: number; lon: number }[];
      };
      [key: string]: unknown;
    };
    hr_in_timezones?: unknown[];
    splits?: {
      lapDTOs: LapDTO[];
      [key: string]: unknown;
    };
    activity?: {
      duration?: number;
      calories?: number;
      totalAscent?: number;
      averageHR?: number;
      averageRunCadence?: number;
      distance?: number;
      averagePace?: number;
      activityName?: string;
      eventType?: unknown;
      course?: unknown;
      gear?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  workout?: {
    workoutName: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ActivityDetailMetric {
  metrics: string[];
}
