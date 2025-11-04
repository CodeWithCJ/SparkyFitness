export interface AuthResponse {
  userId: string;
  token: string;
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
  entry_date: string;
  bedtime: string;
  wake_time: string;
  duration_in_seconds: number;
  time_asleep_in_seconds: number | null;
  sleep_score: number | null;
  source: string;
  stage_events?: SleepStageEvent[];
}