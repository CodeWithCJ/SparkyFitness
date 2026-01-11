export interface MobileHealthData {
  type: 'Stress' | 'SleepSession' | 'ExerciseSession' | 'Workout';
  source: 'HealthConnect' | 'HealthKit';
  timestamp: string; // ISO 8601 format
  value?: number; // For Stress (level), or other single-value metrics
  // SleepSession specific fields
  bedtime?: string; // ISO 8601 format
  wake_time?: string; // ISO 8601 format
  duration_in_seconds?: number;
  time_asleep_in_seconds?: number;
  sleep_score?: number;
  deepSleepSeconds?: number;
  lightSleepSeconds?: number;
  remSleepSeconds?: number;
  awakeSleepSeconds?: number;
  stage_events?: SleepStageEvent[];
  // ExerciseSession / Workout specific fields
  activityType?: string;
  caloriesBurned?: number;
  distance?: number;
  duration?: number; // in seconds
  // Add other relevant fields as needed for exercises/workouts
  raw_data?: any; // To store the raw record from Health Connect/HealthKit if needed for debugging or future use
}

export interface SleepStageEvent {
  stage_type: 'awake' | 'rem' | 'light' | 'deep' | 'in_bed' | 'unknown';
  start_time: string; // ISO 8601 format
  end_time: string; // ISO 8601 format
  duration_in_seconds: number;
}
