export interface AuthResponse {
  userId: string;
  token: string;
}

export interface MoodEntry {
  id: string;
  user_id: string;
  mood_value: number;
  notes: string | null;
  entry_date: string; // ISO date string (YYYY-MM-DD)
  created_at: string; // ISO timestamp string
  updated_at: string;
}

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
  stage_events?: SleepStageEvent[];
  has_detailed_stages?: boolean; // True if detailed stage timing, false if synthetic from summary
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
  earliestBedtime: string | null;
  latestWakeTime: string | null;
  sleepEfficiency: number;
  sleepDebt: number;
  stagePercentages: SleepStageSummary;
  awakePeriods: number;
  totalAwakeDuration: number;
}

export interface CombinedSleepData {
  sleepEntry: SleepEntry;
  sleepAnalyticsData: SleepAnalyticsData;
}

export interface SleepChartData {
  date: string;
  segments: SleepStageEvent[];
  has_detailed_stages?: boolean; // True if detailed timing data, false if synthetic from summary
}

export const SLEEP_STAGE_COLORS: { [key: string]: string } = {
  awake: '#F87171', // red-400
  rem: '#C084FC',   // purple-400
  light: '#60A5FA', // blue-400
  deep: '#4ADE80',  // green-400
};