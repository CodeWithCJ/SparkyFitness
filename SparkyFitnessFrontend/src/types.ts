export interface StressDataPoint {
  time: string;
  stress_level: number;
}

export interface SleepStageEvent {
  id: string;
  entry_id: string;
  stage_type: 'awake' | 'rem' | 'light' | 'deep';
  start_time: string;
  end_time: string;
  duration_in_seconds: number;
}

export interface SleepEntry {
  id: string;
  user_id: string;
  entry_date: string;
  bedtime: string;
  wake_time: string;
  duration_in_seconds: number;
  time_asleep_in_seconds: number | null;
  sleep_score: number | null;
  source: string;
  created_at: string;
  updated_at: string;
  deep_sleep_seconds: number | null;
  light_sleep_seconds: number | null;
  rem_sleep_seconds: number | null;
  awake_sleep_seconds: number | null;
  average_spo2_value: number | null;
  lowest_spo2_value: number | null;
  highest_spo2_value: number | null;
  average_respiration_value: number | null;
  lowest_respiration_value: number | null;
  highest_respiration_value: number | null;
  awake_count: number | null;
  avg_sleep_stress: number | null;
  restless_moments_count: number | null;
  avg_overnight_hrv: number | null;
  body_battery_change: number | null;
  resting_heart_rate: number | null;
  record_timezone?: string | null;
  record_utc_offset_minutes?: number | null;
  stage_events?: SleepStageEvent[];
}

export interface SleepStageSummary {
  deep: number;
  rem: number;
  light: number;
  awake: number;
  unspecified: number;
}

export interface SleepAnalyticsData {
  date: string;
  totalSleepDuration: number;
  timeAsleep: number;
  sleepScore: number;
  /** Bedtime of the day's main sleep, not of a nap. */
  mainBedtime: string | null;
  /** Wake time of the day's main sleep, not of a nap. */
  mainWakeTime: string | null;
  sleepEfficiency: number;
  sleepDebt: number;
  weight?: number;
  stagePercentages: SleepStageSummary;
  awakePeriods: number;
  totalAwakeDuration: number;
  /** The day zone (earliest-bedtime session), for the day's stage labels. */
  record_timezone?: string | null;
  record_utc_offset_minutes?: number | null;
  /** The main sleep's recording zone, for mainBedtime and mainWakeTime. */
  main_record_timezone?: string | null;
  main_record_utc_offset_minutes?: number | null;
}

export interface CombinedSleepData {
  sleepEntry: SleepEntry;
  sleepAnalyticsData: SleepAnalyticsData;
}

export interface SleepChartData {
  date: string;
  segments: SleepStageEvent[];
  record_timezone?: string | null;
  record_utc_offset_minutes?: number | null;
}

export const SLEEP_STAGE_COLORS = {
  awake: '#F87171', // red-400
  rem: '#C084FC', // purple-400
  light: '#60A5FA', // blue-400
  deep: '#4ADE80', // green-400
};
